// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/url_routing_throttle.h"
#include <set>
#include <memory>
#include "base/functional/bind.h"
#include "base/supports_user_data.h"
#include "base/task/sequenced_task_runner.h"
#include "brave/browser/ecom/memory_actions.h"
#include "brave/browser/ecom/url_routing.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_throttle_registry.h"
#include "content/public/browser/restore_type.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/web_contents.h"
#include "net/base/net_errors.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"

namespace ecom {
namespace {
constexpr char kChain[] = "ecom.url-routing.chain";
class Chain final : public base::SupportsUserData::Data {
 public:
  std::set<std::string> visited;
};

void OpenRoutedPage(base::WeakPtr<content::WebContents> source,
                    GURL url, std::string container,
                    std::set<std::string> visited, bool error) {
  if (!source) return;
  auto* profile = Profile::FromBrowserContext(source->GetBrowserContext());
  BrowserWindowInterface* window = nullptr;
  ForEachCurrentBrowserWindowInterfaceOrderedByActivation([&](BrowserWindowInterface* candidate) {
    if (candidate->GetProfile() == profile &&
        candidate->GetTabStripModel()->GetIndexOfWebContents(source.get()) != TabStripModel::kNoTab) {
      window = candidate;
      return false;
    }
    return true;
  });
  if (!window) return;
  const bool foreground = source->GetVisibility() == content::Visibility::VISIBLE;
  const bool blank = !source->GetController().GetLastCommittedEntry();
  if (!error) {
    const auto current = ResolveUrlRouting(profile, url);
    if (current.empty() || !current.FindBool("available").value_or(false) ||
        !current.FindString("containerId") || *current.FindString("containerId") != container) {
      url = GURL("chrome://shops/routing.html?error=ROUTING_CHANGED");
      error = true;
    }
  }
  NavigateParams params(window, url, ui::PAGE_TRANSITION_AUTO_TOPLEVEL);
  params.disposition = foreground ? WindowOpenDisposition::NEW_FOREGROUND_TAB
                                  : WindowOpenDisposition::NEW_BACKGROUND_TAB;
  // A fresh navigation intentionally carries no source/opener, referrer,
  // authentication headers or POST data from the merchant context.
  if (!error) params.storage_partition_config = content::StoragePartitionConfig::Create(
      profile, containers::kContainersStoragePartitionDomain, container, false);
  Navigate(&params);
  if (params.navigated_or_inserted_contents && !error) {
    auto chain = std::make_unique<Chain>();
    chain->visited = std::move(visited);
    params.navigated_or_inserted_contents->SetUserData(kChain, std::move(chain));
  }
  // Only discard an empty navigation shell, never an existing merchant page.
  if (blank && source && params.navigated_or_inserted_contents) {
    const int index = window->GetTabStripModel()->GetIndexOfWebContents(source.get());
    if (index != TabStripModel::kNoTab)
      window->GetTabStripModel()->CloseWebContentsAt(index, TabCloseTypes::CLOSE_NONE);
  }
}
}  // namespace

UrlRoutingThrottle::UrlRoutingThrottle(content::NavigationThrottleRegistry& registry)
    : NavigationThrottle(registry) {}
void UrlRoutingThrottle::MaybeCreateAndAdd(content::NavigationThrottleRegistry& registry) {
  auto& handle = registry.GetNavigationHandle();
  if (handle.IsInPrimaryMainFrame() && !handle.IsSameDocument() &&
      Profile::FromBrowserContext(handle.GetWebContents()->GetBrowserContext())->IsRegularProfile())
    registry.AddThrottle(std::make_unique<UrlRoutingThrottle>(registry));
}
content::NavigationThrottle::ThrottleCheckResult UrlRoutingThrottle::WillStartRequest() {
  if (navigation_handle()->HasUserGesture() || !navigation_handle()->IsRendererInitiated())
    navigation_handle()->GetWebContents()->RemoveUserData(kChain);
  return Route();
}
content::NavigationThrottle::ThrottleCheckResult UrlRoutingThrottle::WillRedirectRequest() { return Route(); }
const char* UrlRoutingThrottle::GetNameForLogging() { return "EcomUrlRoutingThrottle"; }
content::NavigationThrottle::ThrottleCheckResult UrlRoutingThrottle::Route() {
  auto* handle = navigation_handle();
  if (handle->GetRestoreType() != content::RestoreType::kNotRestored) return PROCEED;
  auto* source = handle->GetWebContents();
  const auto decision = ResolveUrlRouting(Profile::FromBrowserContext(source->GetBrowserContext()), handle->GetURL());
  if (decision.empty()) return PROCEED;
  const auto* container = decision.FindString("containerId");
  if (!container) return CANCEL_AND_IGNORE;
  if (*container == containers::GetContainerIdForWebContents(source) &&
      decision.FindBool("available").value_or(false)) return PROCEED;
  // Page-backed Agent tasks remain pinned to their explicitly chosen identity.
  if (HasNativePageTask(source) || IsUrlRoutingPagePinned(source))
    return ThrottleCheckResult(CANCEL, net::ERR_BLOCKED_BY_CLIENT);
  std::string error;
  if (!decision.FindBool("available").value_or(false)) error = "TARGET_CONTAINER_MISSING";
  if (handle->GetRequestMethod() != "GET") error = "CROSS_CONTAINER_FORM_BLOCKED";
  std::set<std::string> visited;
  if (auto* chain = static_cast<Chain*>(source->GetUserData(kChain))) visited = chain->visited;
  const auto step = *container + " " + handle->GetURL().GetWithoutRef().spec();
  if (visited.size() >= 5 || !visited.insert(step).second) error = "ROUTING_LOOP";
  const GURL destination = error.empty() ? handle->GetURL()
      : GURL("chrome://shops/routing.html?error=" + error);
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,
      base::BindOnce(&OpenRoutedPage, source->GetWeakPtr(), destination, *container,
                     std::move(visited), !error.empty()));
  return CANCEL_AND_IGNORE;
}
}  // namespace ecom
