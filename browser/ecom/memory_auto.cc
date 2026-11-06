// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/memory_auto.h"

#include <algorithm>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "base/uuid.h"
#include "brave/browser/ecom/memory_actions.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "chrome/browser/resource_coordinator/lifecycle_unit_state.mojom.h"
#include "chrome/browser/resource_coordinator/tab_lifecycle_unit_external.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/performance_manager/public/graph/page_node.h"
#include "components/performance_manager/public/performance_manager.h"
#include "components/prefs/pref_change_registrar.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/web_contents.h"

namespace ecom {
namespace {
constexpr char kService[] = "ecom.memory.auto-service";
constexpr char kEnabled[] = "ecom.memory.auto_enabled";
constexpr char kIdle[] = "ecom.memory.auto_idle_seconds";
constexpr int kInterval = 30;

base::DictValue Error(const char *code) {
  return base::DictValue()
      .Set("ok", false)
      .Set("error", base::DictValue().Set("code", code).Set("executed", false));
}

class AutoMemory final : public base::SupportsUserData::Data,
                         public ProfileObserver {
public:
  explicit AutoMemory(Profile *profile) : profile_(profile) {
    profile_->AddObserver(this);
    prefs_.Init(profile_->GetPrefs());
    prefs_.Add(kEnabled, base::BindRepeating(&AutoMemory::Configure,
                                             base::Unretained(this)));
    prefs_.Add(kIdle, base::BindRepeating(&AutoMemory::Configure,
                                          base::Unretained(this)));
    Configure();
  }
  ~AutoMemory() override {
    if (profile_)
      profile_->RemoveObserver(this);
  }
  void OnProfileWillBeDestroyed(Profile *) override {
    timer_.Stop();
    prefs_.RemoveAll();
    profile_->RemoveObserver(this);
    profile_ = nullptr;
  }
  bool Enabled() const { return profile_->GetPrefs()->GetBoolean(kEnabled); }
  int Idle() const {
    return std::clamp(profile_->GetPrefs()->GetInteger(kIdle), 60, 86400);
  }
  bool Managed() const {
    return profile_->GetPrefs()->IsManagedPreference(kEnabled) ||
           profile_->GetPrefs()->IsManagedPreference(kIdle);
  }
  struct Entry {
    std::string version;
    base::TimeTicks since;
    bool keep_awake = false;
  };
  Entry &Observe(content::WebContents *wc) {
    const int id =
        tabs::TabInterface::GetFromContents(wc)->GetHandle().raw_value();
    auto &entry = entries_[id];
    const auto now = base::TimeTicks::Now();
    const auto version = MemoryPageVersion(wc);
    if (entry.version != version || entry.since.is_null()) {
      entry.version = version;
      entry.since = now;
    }
    // A switch away and back between timer ticks still resets the idle clock.
    auto page = performance_manager::PerformanceManager::
        GetPrimaryPageNodeForWebContents(wc);
    if (page) {
      entry.since = std::max(entry.since, page->GetLastVisibilityChangeTime());
      if (page->IsVisible() || page->IsFocused())
        entry.since = now;
    }
    return entry;
  }
  bool KeptAwake(content::WebContents *wc) {
    auto *tab = tabs::TabInterface::MaybeGetFromContents(wc);
    if (!tab)
      return false;
    auto it = entries_.find(tab->GetHandle().raw_value());
    return it != entries_.end() && it->second.keep_awake;
  }
  void ResetIdle(content::WebContents *wc) {
    if (tabs::TabInterface::MaybeGetFromContents(wc))
      Observe(wc).since = base::TimeTicks::Now();
  }
  base::DictValue TabStatus(content::WebContents *wc) {
    auto &entry = Observe(wc);
    const double idle = (base::TimeTicks::Now() - entry.since).InSecondsF();
    auto protection = DescribeManualDiscard(wc);
    base::ListValue reasons = protection.FindList("reasons")->Clone();
    if (!Enabled())
      reasons.Append(
          base::DictValue().Set("source", "auto").Set("code", "DISABLED"));
    if (!paused_.empty())
      reasons.Append(
          base::DictValue().Set("source", "auto").Set("code", "PAUSED"));
    if (idle < Idle())
      reasons.Append(
          base::DictValue().Set("source", "auto").Set("code", "IDLE_WINDOW"));
    auto *lifecycle =
        resource_coordinator::TabLifecycleUnitExternal::FromWebContents(wc);
    if (!lifecycle ||
        lifecycle->GetTabState() == mojom::LifecycleUnitState::DISCARDED)
      reasons.Append(
          base::DictValue().Set("source", "auto").Set("code", "NOT_RUNNING"));
    const bool eligible = reasons.empty();
    return base::DictValue()
        .Set("keepAwake", entry.keep_awake)
        .Set("idleSeconds", idle)
        .Set("eligible", eligible)
        .Set("reasons", std::move(reasons));
  }
  base::DictValue Status() const {
    return base::DictValue()
        .Set("protocolVersion", 1)
        .Set("enabled", Enabled())
        .Set("idleSeconds", Idle())
        .Set("scanIntervalSeconds", kInterval)
        .Set("maxDiscardsPerScan", 1)
        .Set("managed", Managed())
        .Set("pausedReason", paused_)
        .Set("running", timer_.IsRunning() && paused_.empty())
        .Set("scanCount", scans_)
        .Set("discardCount", discarded_)
        .Set("lastScanUnixMs", last_scan_)
        .Set("recentActions", events_.Clone());
  }
  base::DictValue Command(const base::DictValue &request) {
    const auto *method = request.FindString("method");
    if (*method == "memory.auto.set") {
      const auto enabled = request.FindBool("enabled");
      const auto idle = request.FindInt("idleSeconds");
      if (!enabled || !idle || *idle < 60 || *idle > 86400)
        return Error("INVALID_ARGUMENT");
      if (Managed())
        return Error("POLICY_MANAGED");
      profile_->GetPrefs()->SetInteger(kIdle, *idle);
      profile_->GetPrefs()->SetBoolean(kEnabled, *enabled);
    } else if (*method == "tabs.protect") {
      const auto id = request.FindInt("tabId");
      const auto *container = request.FindString("containerId");
      const auto *version = request.FindString("expectedPageVersion");
      const auto keep = request.FindBool("keepAwake");
      if (!id || !container || !version || !keep)
        return Error("INVALID_ARGUMENT");
      content::WebContents *target = nullptr;
      ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
          [&](BrowserWindowInterface *b) {
            auto *strip = b->GetTabStripModel();
            if (b->GetProfile() == profile_ && strip)
              for (int i = 0; i < strip->count(); ++i)
                if (strip->GetTabAtIndex(i)->GetHandle().raw_value() == *id)
                  target = strip->GetWebContentsAt(i);
            return true;
          });
      if (!target)
        return Error("TAB_NOT_FOUND");
      if (containers::GetContainerIdForWebContents(target) != *container)
        return Error("TARGET_MISMATCH");
      if (MemoryPageVersion(target) != *version)
        return Error("PAGE_CHANGED");
      auto &entry = Observe(target);
      entry.keep_awake = *keep;
      // Releasing a task/exception gives the page a full idle period.
      entry.since = base::TimeTicks::Now();
      return base::DictValue()
          .Set("ok", true)
          .Set("executed", true)
          .Set("tabId", *id)
          .Set("containerId", *container)
          .Set("expectedPageVersion", *version)
          .Set("keepAwake", *keep)
          .Set("scope", "tab-until-closed-or-browser-restart");
    } else if (*method != "memory.auto.status") {
      return Error("INVALID_ARGUMENT");
    }
    return base::DictValue()
        .Set("ok", true)
        .Set("executed", *method == "memory.auto.set")
        .Set("automatic", Status());
  }

private:
  void Configure() {
    timer_.Stop();
    paused_.clear();
    for (auto &[id, entry] : entries_)
      entry.since = base::TimeTicks::Now();
    if (Enabled())
      timer_.Start(
          FROM_HERE, base::Seconds(kInterval),
          base::BindRepeating(&AutoMemory::Scan, base::Unretained(this)));
  }
  void Scan() {
    if (!profile_ || !Enabled() || !paused_.empty())
      return;
    ++scans_;
    last_scan_ = base::Time::Now().InMillisecondsFSinceUnixEpoch();
    std::set<int> present;
    struct Candidate {
      int id;
      double idle;
      std::string container, version;
    };
    std::vector<Candidate> candidates;
    ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
        [&](BrowserWindowInterface *b) {
          if (b->GetProfile() != profile_)
            return true;
          auto *strip = b->GetTabStripModel();
          for (int i = 0; strip && i < strip->count(); ++i) {
            auto *wc = strip->GetWebContentsAt(i);
            const int id = strip->GetTabAtIndex(i)->GetHandle().raw_value();
            present.insert(id);
            auto status = TabStatus(wc);
            if (strip->active_index() == i ||
                !status.FindBool("eligible").value_or(false)) {
              // Loading, tasks, editing, media and exceptions must all finish
              // before the full idle period starts. Disabled/waiting alone do
              // not.
              if (!DescribeManualDiscard(wc)
                       .FindBool("eligible")
                       .value_or(false))
                entries_[id].since = base::TimeTicks::Now();
              continue;
            }
            candidates.push_back({id,
                                  status.FindDouble("idleSeconds").value_or(0),
                                  containers::GetContainerIdForWebContents(wc),
                                  MemoryPageVersion(wc)});
          }
          return true;
        });
    std::erase_if(entries_, [&](const auto &entry) {
      return !present.contains(entry.first);
    });
    if (candidates.empty())
      return;
    const auto target = *std::max_element(
        candidates.begin(), candidates.end(),
        [](const Candidate &a, const Candidate &b) { return a.idle < b.idle; });
    const auto operation = base::Uuid::GenerateRandomV4().AsLowercaseString();
    auto result = RunMemoryTabCommand(
        profile_, base::DictValue()
                      .Set("method", "tabs.discard")
                      .Set("operationId", operation)
                      .Set("tabId", target.id)
                      .Set("containerId", target.container)
                      .Set("expectedPageVersion", target.version));
    const bool success = result.FindBool("ok").value_or(false);
    if (success && result.FindBool("executed").value_or(false))
      ++discarded_;
    auto *error = result.FindDict("error");
    const auto *code = error ? error->FindString("code") : nullptr;
    if (code && (*code == "TARGET_CHANGED_AFTER_ACTION" ||
                 *code == "DISCARD_STATE_UNKNOWN"))
      paused_ = *code;
    events_.Append(base::DictValue()
                       .Set("tabId", target.id)
                       .Set("operationId", operation)
                       .Set("atUnixMs", last_scan_)
                       .Set("status", success ? "discarded"
                                      : code  ? *code
                                              : "unknown"));
    if (events_.size() > 32)
      events_.erase(events_.begin());
  }
  raw_ptr<Profile> profile_;
  PrefChangeRegistrar prefs_;
  base::RepeatingTimer timer_;
  std::map<int, Entry> entries_;
  base::ListValue events_;
  std::string paused_;
  int scans_ = 0, discarded_ = 0;
  double last_scan_ = 0;
};

AutoMemory *Get(Profile *profile) {
  if (!profile || profile->IsOffTheRecord())
    return nullptr;
  auto *service = static_cast<AutoMemory *>(profile->GetUserData(kService));
  if (!service) {
    auto owned = std::make_unique<AutoMemory>(profile);
    service = owned.get();
    profile->SetUserData(kService, std::move(owned));
  }
  return service;
}
} // namespace

void RegisterAutoMemoryPrefs(PrefRegistrySimple *registry) {
  registry->RegisterBooleanPref(kEnabled, false);
  registry->RegisterIntegerPref(kIdle, 1200);
}
void StartAutoMemory(Profile *profile) { Get(profile); }
base::DictValue AutoMemoryStatus(Profile *profile) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  auto *service = Get(profile);
  return service ? service->Status() : base::DictValue();
}
base::DictValue DescribeAutoMemoryTab(content::WebContents *contents) {
  auto *service =
      Get(Profile::FromBrowserContext(contents->GetBrowserContext()));
  return service ? service->TabStatus(contents) : base::DictValue();
}
bool IsMemoryTabKeptAwake(content::WebContents *contents) {
  auto *service =
      Get(Profile::FromBrowserContext(contents->GetBrowserContext()));
  return service && service->KeptAwake(contents);
}
void ResetAutoMemoryIdle(content::WebContents *contents) {
  auto *service =
      Get(Profile::FromBrowserContext(contents->GetBrowserContext()));
  if (service)
    service->ResetIdle(contents);
}
base::DictValue RunAutoMemoryCommand(Profile *profile,
                                     const base::DictValue &request) {
  auto *service = Get(profile);
  return service ? service->Command(request) : Error("PROFILE_UNSUPPORTED");
}
} // namespace ecom
