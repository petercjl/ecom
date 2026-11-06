// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/memory_snapshot.h"

#include <map>
#include <set>
#include <string>
#include <vector>

#include "base/functional/bind.h"
#include "base/process/process.h"
#include "base/process/process_metrics.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/performance_manager/policies/discard_eligibility_policy.h"
#include "chrome/browser/performance_manager/public/user_tuning/user_performance_tuning_manager.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/performance_manager/freezing/freezing_policy.h"
#include "components/performance_manager/public/decorators/page_live_state_decorator.h"
#include "components/performance_manager/public/freezing/freezing.h"
#include "components/performance_manager/public/graph/frame_node.h"
#include "components/performance_manager/public/graph/graph.h"
#include "components/performance_manager/public/graph/page_node.h"
#include "components/performance_manager/public/graph/process_node.h"
#include "components/performance_manager/public/graph/worker_node.h"
#include "components/performance_manager/public/performance_manager.h"
#include "components/performance_manager/public/user_tuning/prefs.h"
#include "components/prefs/pref_service.h"
#include "components/sessions/content/session_tab_helper.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/common/process_type.h"

#if BUILDFLAG(IS_MAC)
#include <libproc.h>
#include <sys/resource.h>
#endif

namespace ecom {
namespace {
namespace pm = performance_manager;
using Policy = pm::policies::DiscardEligibilityPolicy;
bool sampling = false;

// Worker clients may themselves be workers. Traverse with a visited set.
void WorkerPages(const pm::WorkerNode *worker,
                 std::set<const pm::WorkerNode *> &seen,
                 std::set<const pm::PageNode *> &pages) {
  if (!seen.insert(worker).second)
    return;
  for (const auto *frame : worker->GetClientFrames())
    pages.insert(frame->GetPageNode());
  for (const auto *client : worker->GetClientWorkers())
    WorkerPages(client, seen, pages);
}

base::DictValue Measure(base::DictValue snapshot) {
  const auto started = base::TimeTicks::Now();
  double total = 0, resident = 0, attributed = 0;
  int failures = 0;
  auto *processes = snapshot.FindList("processes");
  auto *tabs = snapshot.FindList("tabs");
  for (auto &value : *processes) {
    auto &process = value.GetDict();
    const int pid = process.FindInt("pid").value();
    double bytes = 0, rss = 0;
    bool available = false;
#if BUILDFLAG(IS_MAC)
    struct rusage_info_v0 usage = {};
    available = proc_pid_rusage(pid, RUSAGE_INFO_V0,
                                reinterpret_cast<rusage_info_t *>(&usage)) == 0;
    if (available) {
      bytes = usage.ri_phys_footprint;
      rss = usage.ri_resident_size;
    }
#elif BUILDFLAG(IS_WIN)
    auto handle = base::Process::Open(pid);
    if (handle.IsValid()) {
      auto metrics =
          base::ProcessMetrics::CreateProcessMetrics(handle.Handle());
      auto info = metrics->GetMemoryInfo();
      available = info.has_value();
      if (available) {
        bytes = info->private_bytes;
        rss = info->resident_set_bytes;
      }
    }
#endif
    process.Set("measurementStatus", available ? "available" : "unavailable");
    if (!available) {
      ++failures;
      process.Set("memoryBytes", base::Value());
      process.Set("residentBytes", base::Value());
      continue;
    }
    total += bytes;
    resident += rss;
    process.Set("memoryBytes", bytes);
    process.Set("residentBytes", rss);
    const auto *ids = process.FindList("tabIds");
    // Shared/unknown clients must not be silently charged to the known tabs.
    if (ids->empty() || process.FindBool("hasUnmappedClients").value_or(false))
      continue;
    const double share = bytes / ids->size();
    for (auto &tab_value : *tabs) {
      auto &tab = tab_value.GetDict();
      for (const auto &id : *ids) {
        if (id.GetInt() == tab.FindInt("tabId")) {
          tab.Set("estimatedMemoryBytes",
                  tab.FindDouble("estimatedMemoryBytes").value_or(0) + share);
          tab.Set("measurementStatus", "estimated");
          attributed += share;
        }
      }
    }
  }
  for (auto &container_value : *snapshot.FindList("containers")) {
    auto &container = container_value.GetDict();
    double bytes = 0;
    int measured = 0, count = 0;
    for (const auto &tab_value : *tabs) {
      const auto &tab = tab_value.GetDict();
      if (*tab.FindString("containerId") ==
          *container.FindString("containerId")) {
        ++count;
        if (const auto memory = tab.FindDouble("estimatedMemoryBytes")) {
          bytes += *memory;
          ++measured;
        }
      }
    }
    container.Set("tabCount", count);
    container.Set("measuredTabCount", measured);
    container.Set("estimatedMemoryBytes",
                  measured ? base::Value(bytes) : base::Value());
  }
  snapshot.Set("totals", base::DictValue()
                             .Set("memoryBytes", total)
                             .Set("residentBytes", resident)
                             .Set("attributedBytes", attributed)
                             .Set("unattributedBytes", total - attributed)
                             .Set("unavailableProcesses", failures)
                             .Set("complete", failures == 0));
  snapshot.Set("measurementDurationMs",
               (base::TimeTicks::Now() - started).InMillisecondsF());
  snapshot.Set("sampledAtUnixMs",
               base::Time::Now().InMillisecondsFSinceUnixEpoch());
  return snapshot;
}
} // namespace

void GetMemorySnapshot(Profile *profile,
                       base::OnceCallback<void(base::DictValue)> reply) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!profile || profile->IsOffTheRecord() ||
      !pm::PerformanceManager::IsAvailable()) {
    std::move(reply).Run(
        base::DictValue()
            .Set("ok", false)
            .Set("error", base::DictValue()
                              .Set("code", "MEMORY_UNAVAILABLE")
                              .Set("executed", false)));
    return;
  }
  auto *graph = pm::PerformanceManager::GetGraph();
  if (sampling) {
    std::move(reply).Run(
        base::DictValue()
            .Set("ok", false)
            .Set("error",
                 base::DictValue().Set("code", "BUSY").Set("executed", false)));
    return;
  }
  sampling = true;
  auto *policy = graph->GetRegisteredObjectAs<Policy>();
  base::DictValue snapshot;
  snapshot.Set("ok", true);
  snapshot.Set("snapshotVersion", 1);
  snapshot.Set("snapshotId",
               base::Uuid::GenerateRandomV4().AsLowercaseString());
  snapshot.Set("browserPid", static_cast<int>(base::GetCurrentProcId()));
  snapshot.Set("capturedAtUnixMs",
               base::Time::Now().InMillisecondsFSinceUnixEpoch());
#if BUILDFLAG(IS_MAC)
  snapshot.Set("metric", "macos-physical-footprint");
#else
  snapshot.Set("metric", "windows-private-bytes");
#endif
  snapshot.Set(
      "attribution",
      "equal-share-of-mapped-processes; estimate, not reclaimable bytes");
  snapshot.Set("scope",
               "instance-processes; current-profile-tabs; no-incognito-titles");
  snapshot.Set("pressureStatus", "unavailable");
  auto *prefs = g_browser_process->local_state();
  namespace tuning = pm::user_tuning::prefs;
  snapshot.Set(
      "policy",
      base::DictValue()
          .Set("memorySaverState",
               static_cast<int>(tuning::GetCurrentMemorySaverModeState(prefs)))
          .Set("memorySaverActive",
               pm::user_tuning::UserPerformanceTuningManager::GetInstance()
                   ->IsMemorySaverModeActive())
          .Set("aggressiveness",
               static_cast<int>(tuning::GetCurrentMemorySaverMode(prefs)))
          .Set("freezingEnabledPreference",
               prefs->GetBoolean(tuning::kTabFreezingEnabled))
          .Set("discardPolicyAvailable", policy != nullptr)
          .Set("p0ReadOnly", true));
  base::ListValue tabs, container_rows;
  container_rows.Append(
      base::DictValue().Set("containerId", "").Set("name", "Default"));
  for (const auto &c : containers::GetContainersFromPrefs(*profile->GetPrefs()))
    container_rows.Append(
        base::DictValue().Set("containerId", c->id).Set("name", c->name));
  std::map<const pm::PageNode *, int> page_ids;
  ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
      [&](BrowserWindowInterface *browser) {
        if (browser->GetProfile() != profile)
          return true;
        auto *strip = browser->GetTabStripModel();
        for (int i = 0; strip && i < strip->count(); ++i) {
          auto *wc = strip->GetWebContentsAt(i);
          const int id = sessions::SessionTabHelper::IdForTab(wc).id();
          auto page =
              pm::PerformanceManager::GetPrimaryPageNodeForWebContents(wc);
          base::DictValue tab;
          tab.Set("tabId", id);
          tab.Set("windowId", browser->GetSessionID().id());
          tab.Set("index", i);
          tab.Set("title", base::UTF16ToUTF8(wc->GetTitle()));
          // Origins suffice for discovery; query strings and paths may contain
          // credentials.
          tab.Set("origin",
                  wc->GetLastCommittedURL().DeprecatedGetOriginAsURL().spec());
          tab.Set("containerId", containers::GetContainerIdForWebContents(wc));
          tab.Set("pageVersion",
                  wc->GetPrimaryMainFrame()->GetDocumentToken().ToString());
          tab.Set("selected", strip->active_index() == i);
          tab.Set("measurementStatus", "unavailable");
          tab.Set("estimatedMemoryBytes", base::Value());
          base::ListValue discard_reasons, freeze_reasons, connected_reasons;
          if (page) {
            page_ids[page.get()] = id;
            tab.Set("visible", page->IsVisible());
            tab.Set("lifecycle", static_cast<int>(page->GetLifecycleState()));
            const auto *live =
                pm::PageLiveStateDecorator::Data::FromPageNode(page.get());
            tab.Set("state", live && live->IsDiscarded()        ? "discarded"
                             : !page->GetPrimaryMainFrameNode() ? "unloaded"
                             : static_cast<int>(page->GetLifecycleState()) == 1
                                 ? "frozen"
                                 : "running");
            if (graph->GetRegisteredObjectAs<pm::FreezingPolicy>()) {
              const auto details =
                  pm::freezing::GetCanFreezeDetailsForPageNode(page.get());
              tab.Set("canFreeze",
                      details.can_freeze == pm::freezing::CanFreeze::kYes
                          ? "yes"
                      : details.can_freeze == pm::freezing::CanFreeze::kNo
                          ? "no"
                          : "varies");
              for (auto reason : details.cannot_freeze_reasons)
                freeze_reasons.Append(
                    base::DictValue()
                        .Set("code", static_cast<int>(reason))
                        .Set("message",
                             pm::freezing::CannotFreezeReasonToString(reason)));
              for (auto reason : details.cannot_freeze_reasons_connected_pages)
                connected_reasons.Append(
                    base::DictValue()
                        .Set("code", static_cast<int>(reason))
                        .Set("message",
                             pm::freezing::CannotFreezeReasonToString(reason)));
            } else {
              tab.Set("canFreeze", "unavailable");
            }
            if (policy) {
              std::vector<pm::policies::CannotDiscardReason> reasons;
              const auto eligibility = policy->CanDiscard(
                  page.get(), Policy::DiscardReason::PROACTIVE, false,
                  &reasons);
              tab.Set("canDiscard",
                      eligibility == pm::policies::CanDiscardResult::kEligible
                          ? "yes"
                          : "no");
              for (auto reason : reasons)
                discard_reasons.Append(
                    base::DictValue()
                        .Set("code", static_cast<int>(reason))
                        .Set(
                            "message",
                            pm::policies::CannotDiscardReasonToString(reason)));
            } else {
              tab.Set("canDiscard", "unavailable");
            }
          } else {
            tab.Set("state", "unavailable");
            tab.Set("canDiscard", "unavailable");
            tab.Set("canFreeze", "unavailable");
          }
          tab.Set("discardReasons", std::move(discard_reasons));
          tab.Set("freezeReasons", std::move(freeze_reasons));
          tab.Set("connectedFreezeReasons", std::move(connected_reasons));
          tabs.Append(std::move(tab));
        }
        return true;
      });
  base::ListValue processes;
  std::set<int> pids;
  for (const auto *process : graph->GetAllProcessNodes()) {
    const int pid = process->GetProcessId();
    if (pid <= 0 || !pids.insert(pid).second)
      continue;
    std::set<const pm::PageNode *> pages;
    for (const auto *frame : process->GetFrameNodes())
      pages.insert(frame->GetPageNode());
    bool unknown = false;
    for (const auto *worker : process->GetWorkerNodes()) {
      std::set<const pm::WorkerNode *> seen;
      std::set<const pm::PageNode *> clients;
      WorkerPages(worker, seen, clients);
      if (clients.empty())
        unknown = true;
      pages.insert(clients.begin(), clients.end());
    }
    base::ListValue ids;
    for (const auto *page : pages) {
      if (page_ids.contains(page))
        ids.Append(page_ids.at(page));
      else
        unknown = true;
    }
    const auto type = process->GetProcessType();
    processes.Append(
        base::DictValue()
            .Set("pid", pid)
            .Set("kind", type == content::PROCESS_TYPE_BROWSER    ? "browser"
                         : type == content::PROCESS_TYPE_RENDERER ? "renderer"
                         : type == content::PROCESS_TYPE_GPU      ? "gpu"
                                                                  : "utility")
            .Set("name", process->GetMetricsName())
            .Set("workerCount",
                 static_cast<int>(process->GetWorkerNodes().size()))
            .Set("hasUnmappedClients", unknown)
            .Set("tabIds", std::move(ids)));
  }
  snapshot.Set("processes", std::move(processes));
  snapshot.Set("tabs", std::move(tabs));
  snapshot.Set("containers", std::move(container_rows));
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE,
      {base::MayBlock(), base::TaskPriority::USER_VISIBLE,
       base::TaskShutdownBehavior::SKIP_ON_SHUTDOWN},
      base::BindOnce(&Measure, std::move(snapshot)),
      base::BindOnce(
          [](base::OnceCallback<void(base::DictValue)> done,
             base::DictValue result) {
            sampling = false;
            std::move(done).Run(std::move(result));
          },
          std::move(reply)));
}
} // namespace ecom
