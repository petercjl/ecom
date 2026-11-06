// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/memory_restore.h"
#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/supports_user_data.h"
#include "base/task/single_thread_task_runner.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "brave/browser/ecom/memory_actions.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include <algorithm>
#include <deque>
#include <map>
#include <memory>
#include <set>
#include <string>

namespace ecom {
namespace {
constexpr char kService[] = "ecom.memory.restore-service";
constexpr char kState[] = "ecom.memory.restore-state";
constexpr char kLazy[] = "ecom.memory.lazy_startup";
constexpr char kLimit[] = "ecom.memory.background_restore_limit";
class RestoreService;
class State final : public base::SupportsUserData::Data,
                    public content::WebContentsObserver {
public:
  State(content::WebContents *wc, base::WeakPtr<RestoreService> service)
      : content::WebContentsObserver(wc), service_(service) {}
  void DidStartLoading() override;
  void DidStopLoading() override;
  void DidFinishNavigation(content::NavigationHandle *navigation) override;
  void WebContentsDestroyed() override;
  bool deferred = false;
  bool navigation_failed = false;
  std::string phase = "ready", source, request_id;

private:
  base::WeakPtr<RestoreService> service_;
};
State *GetState(content::WebContents *wc) {
  return static_cast<State *>(wc->GetUserData(kState));
}
bool Selected(content::WebContents *wc) {
  auto *tab = tabs::TabInterface::MaybeGetFromContents(wc);
  return tab && tab->IsActivated();
}
base::DictValue Error(const char *code) {
  return base::DictValue()
      .Set("ok", false)
      .Set("error", base::DictValue().Set("code", code).Set("executed", false));
}
class RestoreService final : public base::SupportsUserData::Data,
                             public ProfileObserver {
public:
  explicit RestoreService(Profile *profile) : profile_(profile) {
    profile_->AddObserver(this);
  }
  ~RestoreService() override {
    if (profile_)
      profile_->RemoveObserver(this);
  }
  void OnProfileWillBeDestroyed(Profile *) override {
    weak_.InvalidateWeakPtrs();
    pending_.clear();
    active_.clear();
    records_.clear();
    profile_->RemoveObserver(this);
    profile_ = nullptr;
  }
  State *Ensure(content::WebContents *wc) {
    if (auto *state = GetState(wc))
      return state;
    auto state = std::make_unique<State>(wc, weak_.GetWeakPtr());
    auto *result = state.get();
    wc->SetUserData(kState, std::move(state));
    return result;
  }
  bool Lazy() const { return profile_->GetPrefs()->GetBoolean(kLazy); }
  int Limit() const {
    return std::clamp(profile_->GetPrefs()->GetInteger(kLimit), 1, 4);
  }
  struct Record {
    base::WeakPtr<content::WebContents> contents;
    int tab_id = 0;
    std::string container, version, url, source, phase = "queued", error;
    double queued_at = 0, started_at = 0, finished_at = 0;
  };
  base::DictValue RecordValue(const std::string &id, const Record &r) const {
    return base::DictValue()
        .Set("requestId", id)
        .Set("tabId", r.tab_id)
        .Set("containerId", r.container)
        .Set("source", r.source)
        .Set("phase", r.phase)
        .Set("errorCode", r.error)
        .Set("queuedAtUnixMs", r.queued_at)
        .Set("startedAtUnixMs", r.started_at)
        .Set("finishedAtUnixMs", r.finished_at);
  }
  base::DictValue Status() const {
    int deferred = 0;
    ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
        [&](BrowserWindowInterface *b) {
          if (b->GetProfile() == profile_) {
            auto *strip = b->GetTabStripModel();
            for (int i = 0; strip && i < strip->count(); ++i)
              if (IsMemoryRestoreDeferred(strip->GetWebContentsAt(i)))
                ++deferred;
          }
          return true;
        });
    base::ListValue requests;
    for (const auto &id : order_) {
      auto it = records_.find(id);
      if (it != records_.end())
        requests.Append(RecordValue(id, it->second));
    }
    return base::DictValue()
        .Set("protocolVersion", 1)
        .Set("lazyStartup", Lazy())
        .Set("maxBackgroundRestores", Limit())
        .Set("activeCount", static_cast<int>(active_.size()))
        .Set("deferredCount", deferred)
        .Set("queuedCount", static_cast<int>(pending_.size()))
        .Set("peakActiveCount", peak_)
        .Set("managed", profile_->GetPrefs()->IsManagedPreference(kLazy) ||
                            profile_->GetPrefs()->IsManagedPreference(kLimit))
        .Set("explicitQueueCapacity", 32)
        .Set("startupSettingApplies", "next-session-restore")
        .Set("recentRequests", std::move(requests));
  }
  base::DictValue Request(content::WebContents *wc, const char *source,
                          bool allow_queue) {
    auto *tab = tabs::TabInterface::MaybeGetFromContents(wc);
    if (!tab)
      return Error("TAB_NOT_FOUND");
    auto *state = Ensure(wc);
    if (!state->request_id.empty()) {
      auto it = records_.find(state->request_id);
      if (it != records_.end() &&
          (it->second.phase == "queued" || it->second.phase == "loading" ||
           it->second.phase == "foreground-loading")) {
        if (it->second.phase == "queued" && !allow_queue)
          return Error("RESTORE_QUEUE_BUSY");
        return base::DictValue()
            .Set("ok", true)
            .Set("status", it->second.phase == "queued" ? "navigation-queued"
                                                        : "navigation-started")
            .Set("restore", RecordValue(state->request_id, it->second));
      }
    }
    if (!allow_queue && active_.size() >= static_cast<size_t>(Limit()) &&
        !Selected(wc))
      return Error("RESTORE_QUEUE_BUSY");
    if (pending_.size() >= 32 && std::string(source) != "startup" &&
        !Selected(wc))
      return Error("RESTORE_QUEUE_FULL");
    const auto id = base::Uuid::GenerateRandomV4().AsLowercaseString();
    Record r;
    r.contents = wc->GetWeakPtr();
    r.tab_id = tab->GetHandle().raw_value();
    r.container = containers::GetContainerIdForWebContents(wc);
    r.version = MemoryPageVersion(wc);
    r.url = wc->GetVisibleURL().spec();
    r.source = source;
    r.queued_at = base::Time::Now().InMillisecondsFSinceUnixEpoch();
    records_.emplace(id, std::move(r));
    order_.push_back(id);
    state->request_id = id;
    state->phase = "queued";
    state->source = source;
    state->deferred = true;
    if (Selected(wc))
      pending_.push_front(id);
    else
      pending_.push_back(id);
    Pump();
    const auto &result = records_.at(id);
    return base::DictValue()
        .Set("ok", true)
        .Set("status", result.phase == "queued" ? "navigation-queued"
                                                : "navigation-started")
        .Set("restore", RecordValue(id, result));
  }
  void Changed(content::WebContents *wc, bool started) {
    auto *state = GetState(wc);
    if (!state)
      return;
    state->deferred = false;
    if (state->request_id.empty()) {
      state->phase = started                    ? "foreground-loading"
                     : state->navigation_failed ? "failed"
                                                : "ready";
      state->deferred = !started && state->navigation_failed;
      return;
    }
    auto it = records_.find(state->request_id);
    if (it == records_.end())
      return;
    auto &r = it->second;
    if (started && r.phase == "queued") {
      // User selection can load a queued tab immediately. It does not wait for
      // background slots and the queued request is satisfied by that
      // navigation.
      std::erase(pending_, state->request_id);
      r.phase = "foreground-loading";
      r.started_at = base::Time::Now().InMillisecondsFSinceUnixEpoch();
    } else if (!started) {
      r.phase = state->navigation_failed ? "failed" : "ready";
      r.error = state->navigation_failed ? "RESTORE_NAVIGATION_FAILED" : "";
      state->deferred = state->navigation_failed;
      r.finished_at = base::Time::Now().InMillisecondsFSinceUnixEpoch();
      active_.erase(state->request_id);
      std::erase(pending_, state->request_id);
    }
    state->phase = r.phase;
    SchedulePump();
  }
  void NavigationChanged(content::WebContents *wc,
                         content::NavigationHandle *navigation) {
    auto *state = GetState(wc);
    if (!state || state->request_id.empty())
      return;
    auto it = records_.find(state->request_id);
    if (it == records_.end())
      return;
    auto &record = it->second;
    if (record.phase != "queued" && record.phase != "loading" &&
        record.phase != "foreground-loading")
      return;
    const auto &chain = navigation->GetRedirectChain();
    const bool changed =
        containers::GetContainerIdForWebContents(wc) != record.container ||
        (!chain.empty() && chain.front().spec() != record.url);
    if (!changed)
      return;
    record.phase = "superseded";
    record.error = "PAGE_CHANGED";
    record.finished_at = base::Time::Now().InMillisecondsFSinceUnixEpoch();
    active_.erase(state->request_id);
    std::erase(pending_, state->request_id);
    state->request_id.clear();
    state->deferred = false;
    state->phase = wc->IsLoading() ? "loading" : "ready";
    SchedulePump();
  }
  void Closed(content::WebContents *wc) {
    auto *state = GetState(wc);
    if (!state || state->request_id.empty())
      return;
    auto it = records_.find(state->request_id);
    if (it != records_.end() &&
        (it->second.phase == "queued" || it->second.phase == "loading" ||
         it->second.phase == "foreground-loading")) {
      it->second.phase = "closed";
      it->second.finished_at =
          base::Time::Now().InMillisecondsFSinceUnixEpoch();
    }
    active_.erase(state->request_id);
    std::erase(pending_, state->request_id);
    SchedulePump();
  }
  base::DictValue Lookup(const std::string &id) const {
    auto it = records_.find(id);
    return it == records_.end() ? base::DictValue()
                                      .Set("phase", "not-found")
                                      .Set("requestId", id)
                                : RecordValue(id, it->second);
  }
  base::DictValue Command(const base::DictValue &request) {
    const auto *method = request.FindString("method");
    if (method && *method == "memory.restore.set") {
      const auto lazy = request.FindBool("lazyStartup");
      const auto limit = request.FindInt("maxBackgroundRestores");
      if (!lazy || !limit || *limit < 1 || *limit > 4)
        return Error("INVALID_ARGUMENT");
      auto *prefs = profile_->GetPrefs();
      if (prefs->IsManagedPreference(kLazy) ||
          prefs->IsManagedPreference(kLimit))
        return Error("POLICY_MANAGED");
      prefs->SetBoolean(kLazy, *lazy);
      prefs->SetInteger(kLimit, *limit);
      peak_ = static_cast<int>(active_.size());
      SchedulePump();
    } else if (!method || *method != "memory.restore.status")
      return Error("INVALID_ARGUMENT");
    return base::DictValue()
        .Set("ok", true)
        .Set("executed", *method == "memory.restore.set")
        .Set("restoration", Status());
  }

private:
  void SchedulePump() {
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(&RestoreService::Pump, weak_.GetWeakPtr()));
  }
  void Pump() {
    if (!profile_)
      return;
    // Active requests keep their slots until DidStopLoading or tab closure.
    // Lowering the setting waits for existing loads; it never interrupts them.
    while (!pending_.empty()) {
      const auto id = pending_.front();
      auto &r = records_.at(id);
      auto *wc = r.contents.get();
      if (!wc || containers::GetContainerIdForWebContents(wc) != r.container ||
          MemoryPageVersion(wc) != r.version ||
          wc->GetVisibleURL().spec() != r.url) {
        pending_.pop_front();
        r.phase = "superseded";
        r.error = wc ? "PAGE_CHANGED" : "TAB_NOT_FOUND";
        r.finished_at = base::Time::Now().InMillisecondsFSinceUnixEpoch();
        if (wc && GetState(wc)) {
          auto *state = GetState(wc);
          state->phase = wc->IsLoading() ? "loading" : "ready";
          state->deferred = wc->GetController().NeedsReload();
          state->request_id.clear();
        }
        continue;
      }
      const bool foreground = Selected(wc);
      if (!foreground && active_.size() >= static_cast<size_t>(Limit()))
        break;
      pending_.pop_front();
      r.phase = foreground ? "foreground-loading" : "loading";
      r.started_at = base::Time::Now().InMillisecondsFSinceUnixEpoch();
      if (!foreground)
        active_.insert(id);
      peak_ = std::max(peak_, static_cast<int>(active_.size()));
      auto *state = Ensure(wc);
      state->phase = r.phase;
      state->deferred = false;
      wc->GetController().SetNeedsReload();
      wc->GetController().LoadIfNecessary();
    }
    while (order_.size() > 128) {
      auto old =
          std::find_if(order_.begin(), order_.end(), [&](const auto &id) {
            const auto it = records_.find(id);
            return it == records_.end() ||
                   (it->second.phase != "queued" &&
                    it->second.phase != "loading" &&
                    it->second.phase != "foreground-loading");
          });
      if (old == order_.end())
        break;
      records_.erase(*old);
      order_.erase(old);
    }
  }
  raw_ptr<Profile> profile_;
  std::deque<std::string> pending_, order_;
  std::set<std::string> active_;
  std::map<std::string, Record> records_;
  int peak_ = 0;
  base::WeakPtrFactory<RestoreService> weak_{this};
};
void State::DidStartLoading() {
  navigation_failed = false;
  if (service_)
    service_->Changed(web_contents(), true);
}
void State::DidStopLoading() {
  if (service_)
    service_->Changed(web_contents(), false);
}
void State::DidFinishNavigation(content::NavigationHandle *navigation) {
  if (navigation->IsInPrimaryMainFrame() && !navigation->IsSameDocument()) {
    navigation_failed =
        navigation->IsErrorPage() || navigation->GetNetErrorCode() != 0;
    if (service_)
      service_->NavigationChanged(web_contents(), navigation);
  }
}
void State::WebContentsDestroyed() {
  if (service_)
    service_->Closed(web_contents());
}
RestoreService *Get(Profile *profile) {
  if (!profile || profile->IsOffTheRecord())
    return nullptr;
  auto *service = static_cast<RestoreService *>(profile->GetUserData(kService));
  if (!service) {
    auto owned = std::make_unique<RestoreService>(profile);
    service = owned.get();
    profile->SetUserData(kService, std::move(owned));
  }
  return service;
}
} // namespace
void RegisterMemoryRestorePrefs(PrefRegistrySimple *registry) {
  registry->RegisterBooleanPref(kLazy, true);
  registry->RegisterIntegerPref(kLimit, 2);
}
void StartMemoryRestore(Profile *profile) { Get(profile); }
void MarkMemoryRestoreDeferred(content::WebContents *wc, const char *source) {
  auto *service = Get(Profile::FromBrowserContext(wc->GetBrowserContext()));
  if (!service)
    return;
  auto *state = service->Ensure(wc);
  state->deferred = true;
  state->phase = "deferred";
  state->source = source;
  state->request_id.clear();
  wc->GetController().SetNeedsReload();
}
bool IsMemoryRestoreDeferred(content::WebContents *wc) {
  auto *state = GetState(wc);
  return state && (state->deferred || state->phase == "queued");
}
base::DictValue DescribeMemoryRestore(content::WebContents *wc) {
  auto *state = GetState(wc);
  return base::DictValue()
      .Set("phase", state             ? state->phase
                    : wc->IsLoading() ? "loading"
                                      : "ready")
      .Set("deferred", state ? state->deferred : false)
      .Set("source", state ? state->source : "")
      .Set("requestId", state ? state->request_id : "");
}
base::DictValue MemoryRestoreStatus(Profile *profile) {
  auto *service = Get(profile);
  return service ? service->Status() : base::DictValue();
}
base::DictValue MemoryRestoreRequestStatus(Profile *profile,
                                           const std::string &id) {
  auto *service = Get(profile);
  return service ? service->Lookup(id)
                 : base::DictValue().Set("phase", "unavailable");
}
base::DictValue RequestMemoryRestore(content::WebContents *wc,
                                     const char *source, bool allow_queue) {
  auto *service = Get(Profile::FromBrowserContext(wc->GetBrowserContext()));
  return service ? service->Request(wc, source, allow_queue)
                 : Error("PROFILE_UNSUPPORTED");
}
base::DictValue RunMemoryRestoreCommand(Profile *profile,
                                        const base::DictValue &request) {
  auto *service = Get(profile);
  return service ? service->Command(request) : Error("PROFILE_UNSUPPORTED");
}
std::vector<SessionRestoreDelegate::RestoredTab> PrepareRestoredTabs(
    const std::vector<SessionRestoreDelegate::RestoredTab> &tabs) {
  std::vector<SessionRestoreDelegate::RestoredTab> selected;
  for (const auto &tab : tabs) {
    auto *wc = tab.contents();
    if (!wc)
      continue;
    auto *profile = Profile::FromBrowserContext(wc->GetBrowserContext());
    auto *service = Get(profile);
    if (!service || tab.is_active()) {
      selected.push_back(tab);
      continue;
    }
    MarkMemoryRestoreDeferred(wc, "session");
    if (!service->Lazy())
      service->Request(wc, "startup", true);
  }
  // Only scheduled startup tabs enter Chromium's load stats. Deferred tabs must
  // not keep its session-restoring flag or stats collector alive indefinitely.
  return selected;
}
} // namespace ecom
