// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/memory_actions.h"

#include <deque>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "base/functional/bind.h"
#include "base/strings/string_number_conversions.h"
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "chrome/browser/performance_manager/policies/discard_eligibility_policy.h"
#include "chrome/browser/performance_manager/policies/page_discarding_helper.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/resource_coordinator/lifecycle_unit_state.mojom.h"
#include "chrome/browser/resource_coordinator/tab_lifecycle_unit_external.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/performance_manager/freezing/freezing_policy.h"
#include "components/performance_manager/public/freezing/freezing.h"
#include "components/performance_manager/public/graph/graph.h"
#include "components/performance_manager/public/performance_manager.h"
#include "components/sessions/content/session_tab_helper.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"

namespace ecom {
namespace {
namespace pm = performance_manager;
using Policy = pm::policies::DiscardEligibilityPolicy;
constexpr char kOperations[] = "ecom.memory.operations";
constexpr char kTasks[] = "ecom.memory.page-tasks";
class PageTasks final : public base::SupportsUserData::Data {
 public:
  int count = 0;
};
class Operations final : public base::SupportsUserData::Data {
 public:
  std::map<std::string, base::DictValue> results;
  std::deque<std::string> order;
};

content::WebContents* FindTab(Profile* profile,
                              int id,
                              bool* selected = nullptr) {
  content::WebContents* found = nullptr;
  ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
      [&](BrowserWindowInterface* browser) {
        if (browser->GetProfile() != profile)
          return true;
        auto* strip = browser->GetTabStripModel();
        for (int i = 0; strip && i < strip->count(); ++i) {
          auto* wc = strip->GetWebContentsAt(i);
          if (sessions::SessionTabHelper::IdForTab(wc).id() == id) {
            found = wc;
            if (selected)
              *selected = strip->active_index() == i;
          }
        }
        return true;
      });
  return found;
}

base::DictValue Error(std::string code, bool executed = false) {
  return base::DictValue()
      .Set("ok", false)
      .Set("error", base::DictValue()
                        .Set("code", std::move(code))
                        .Set("executed", executed));
}
}  // namespace

base::ScopedClosureRunner ProtectMemoryPageTask(content::WebContents* wc) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  auto* tasks = static_cast<PageTasks*>(wc->GetUserData(kTasks));
  if (!tasks) {
    auto owned = std::make_unique<PageTasks>();
    tasks = owned.get();
    wc->SetUserData(kTasks, std::move(owned));
  }
  ++tasks->count;
  return base::ScopedClosureRunner(base::BindOnce(
      [](base::WeakPtr<content::WebContents> contents) {
        if (!contents)
          return;
        auto* active = static_cast<PageTasks*>(contents->GetUserData(kTasks));
        if (active && --active->count == 0)
          contents->RemoveUserData(kTasks);
      },
      wc->GetWeakPtr()));
}

std::string MemoryPageVersion(content::WebContents* wc) {
  if (!wc || !wc->GetPrimaryMainFrame())
    return "unavailable";
  return wc->GetPrimaryMainFrame()->GetFrameToken().ToString() + ":" +
         base::NumberToString(wc->GetPrimaryMainFrame()->GetNavigationId());
}

base::DictValue DescribeManualDiscard(content::WebContents* wc) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  base::ListValue reasons;
  auto block = [&](const char* code, const char* message) {
    reasons.Append(base::DictValue()
                       .Set("source", "mvp")
                       .Set("code", code)
                       .Set("message", message));
  };
  if (!wc || !pm::PerformanceManager::IsAvailable()) {
    block("UNAVAILABLE", "Native page state is unavailable");
  } else {
    if (wc->GetUserData(kTasks))
      block("TASK_IN_PROGRESS", "Native page task is in progress");
    if (!wc->GetLastCommittedURL().SchemeIsHTTPOrHTTPS())
      block("NOT_WEB_PAGE", "Only ordinary HTTP or HTTPS pages can sleep");
    if (wc->IsLoading())
      block("LOADING", "Page is loading");
    if (wc->GetUploadSize() > wc->GetUploadPosition())
      block("UPLOADING", "Upload is in progress");
    auto page = pm::PerformanceManager::GetPrimaryPageNodeForWebContents(wc);
    auto* graph = pm::PerformanceManager::GetGraph();
    auto* policy = graph->GetRegisteredObjectAs<Policy>();
    if (!page || !policy ||
        !graph->GetRegisteredObjectAs<pm::FreezingPolicy>()) {
      block("UNAVAILABLE", "Native protection policy is unavailable");
    } else {
      std::vector<pm::policies::CannotDiscardReason> native_reasons;
      const auto eligible = policy->CanDiscardWithCustomRecentVisibilityWindow(
          page.get(), Policy::DiscardReason::PROACTIVE, base::Seconds(30),
          &native_reasons);
      for (auto reason : native_reasons)
        reasons.Append(
            base::DictValue()
                .Set("source", "discard")
                .Set("code", static_cast<int>(reason))
                .Set("message",
                     pm::policies::CannotDiscardReasonToString(reason)));
      if (eligible != pm::policies::CanDiscardResult::kEligible &&
          native_reasons.empty())
        block("NATIVE_PROTECTION", "Native policy protects this page");
      const auto details =
          pm::freezing::GetCanFreezeDetailsForPageNode(page.get());
      auto add_freeze = [&](auto set, const char* source) {
        for (auto reason : set) {
          // These are freezing scheduling hints; explicit discard uses its own
          // checked recent-visibility window and native discard protections.
          if (reason == pm::freezing::CannotFreezeReason::kRecentlyVisible ||
              reason == pm::freezing::CannotFreezeReason::kMostRecentlyUsed)
            continue;
          reasons.Append(
              base::DictValue()
                  .Set("source", source)
                  .Set("code", static_cast<int>(reason))
                  .Set("message",
                       pm::freezing::CannotFreezeReasonToString(reason)));
        }
      };
      add_freeze(details.cannot_freeze_reasons, "freeze");
      add_freeze(details.cannot_freeze_reasons_connected_pages,
                 "connected-freeze");
    }
  }
  const bool eligible = reasons.empty();
  return base::DictValue()
      .Set("eligible", eligible)
      .Set("recentUseProtectionSeconds", 30)
      .Set("reasons", std::move(reasons));
}

base::DictValue RunMemoryTabCommand(Profile* profile,
                                    const base::DictValue& request) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!profile || profile->IsOffTheRecord())
    return Error("PROFILE_UNSUPPORTED");
  auto* operations =
      static_cast<Operations*>(profile->GetUserData(kOperations));
  if (!operations) {
    auto owned = std::make_unique<Operations>();
    operations = owned.get();
    profile->SetUserData(kOperations, std::move(owned));
  }
  const auto* method = request.FindString("method");
  if (method && *method == "memory.operation") {
    const auto* id = request.FindString("targetOperationId");
    if (!id || !operations->results.contains(*id))
      return base::DictValue()
          .Set("ok", true)
          .Set("status", "not-found")
          .Set("executed", "unknown");
    return base::DictValue()
        .Set("ok", true)
        .Set("status", "found")
        .Set("result", operations->results.at(*id).Clone());
  }
  const auto* id = request.FindString("operationId");
  const auto tab_id = request.FindInt("tabId");
  const auto* container = request.FindString("containerId");
  const auto* version = request.FindString("expectedPageVersion");
  if (!id || !base::Uuid::ParseLowercase(*id).is_valid() || !method ||
      (*method != "tabs.discard" && *method != "tabs.wake") || !tab_id ||
      *tab_id <= 0 || !container || !version || version->empty() ||
      version->size() > 200)
    return Error("INVALID_ARGUMENT");
  if (operations->results.contains(*id)) {
    const auto& previous = operations->results.at(*id);
    if (previous.FindInt("tabId") != tab_id ||
        previous.FindString("containerId") == nullptr ||
        *previous.FindString("containerId") != *container ||
        *previous.FindString("expectedPageVersion") != *version ||
        *previous.FindString("action") != *method)
      return Error("OPERATION_CONFLICT");
    return previous.Clone();
  }
  const auto target_container = *container;
  const auto expected_version = *version;
  const auto operation = *id;
  const auto action = *method;
  auto run = [&]() -> base::DictValue {
    bool selected = false;
    auto* wc = FindTab(profile, *tab_id, &selected);
    if (!wc)
      return Error("TAB_NOT_FOUND");
    if (containers::GetContainerIdForWebContents(wc) != target_container)
      return Error("TARGET_MISMATCH");
    if (MemoryPageVersion(wc) != expected_version)
      return Error("PAGE_CHANGED");
    auto* lifecycle =
        resource_coordinator::TabLifecycleUnitExternal::FromWebContents(wc);
    if (!lifecycle)
      return Error("MEMORY_UNAVAILABLE");
    const auto before_url = wc->GetVisibleURL();
    const bool discarded =
        lifecycle->GetTabState() == mojom::LifecycleUnitState::DISCARDED;
    if (action == "tabs.discard") {
      if (discarded)
        return base::DictValue()
            .Set("ok", true)
            .Set("executed", false)
            .Set("status", "already-discarded");
      auto protection = DescribeManualDiscard(wc);
      if (selected || !protection.FindBool("eligible").value_or(false)) {
        auto result = Error("TAB_PROTECTED");
        result.FindDict("error")->Set(
            "diagnostics",
            base::DictValue()
                .Set("phase", "tab-protection")
                .Set("tabProtection", protection.FindList("reasons")->Clone()));
        return result;
      }
      auto page = pm::PerformanceManager::GetPrimaryPageNodeForWebContents(wc);
      auto* helper =
          pm::PerformanceManager::GetGraph()
              ->GetRegisteredObjectAs<pm::policies::PageDiscardingHelper>();
      if (!page || !helper)
        return Error("MEMORY_UNAVAILABLE");
      // Same UI task: the explicit 30s guard above has just passed. The helper
      // rechecks every other PROACTIVE protection; never use EXTERNAL/URGENT.
      if (!helper->ImmediatelyDiscardMultiplePages(
              {page.get()}, Policy::DiscardReason::PROACTIVE, true))
        return Error("DISCARD_REJECTED");
    } else {
      if (!discarded)
        return base::DictValue()
            .Set("ok", true)
            .Set("executed", false)
            .Set("status", "already-running");
      // Chromium's replacement-based discard explicitly clears needs_reload.
      // Request it before background loading; DidStartLoading updates lifecycle.
      wc->GetController().SetNeedsReload();
      wc->GetController().LoadIfNecessary();
    }
    // Discard can replace WebContents. Resolve the stable tab afresh.
    auto* after = FindTab(profile, *tab_id);
    if (!after ||
        containers::GetContainerIdForWebContents(after) != target_container ||
        after->GetVisibleURL() != before_url)
      return Error("TARGET_CHANGED_AFTER_ACTION", true);
    auto* after_lifecycle =
        resource_coordinator::TabLifecycleUnitExternal::FromWebContents(after);
    if (action == "tabs.discard" &&
        (!after_lifecycle || after_lifecycle->GetTabState() !=
                                 mojom::LifecycleUnitState::DISCARDED))
      return Error("DISCARD_STATE_UNKNOWN", true);
    return base::DictValue()
        .Set("ok", true)
        .Set("executed", true)
        .Set("status",
             action == "tabs.discard" ? "discarded" : "navigation-started")
        .Set("pageVersion", MemoryPageVersion(after))
        .Set("navigationPreserved", true);
  };
  auto result = run();
  result.Set("operationId", operation);
  result.Set("action", action);
  result.Set("tabId", *tab_id);
  result.Set("containerId", target_container);
  result.Set("expectedPageVersion", expected_version);
  operations->results.emplace(operation, result.Clone());
  operations->order.push_back(operation);
  if (operations->order.size() > 128) {
    operations->results.erase(operations->order.front());
    operations->order.pop_front();
  }
  return result;
}
}  // namespace ecom
