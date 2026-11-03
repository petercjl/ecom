/* Copyright (c) 2020 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "brave/browser/new_tab/new_tab_shows_navigation_throttle.h"

#include <string>

#include "base/functional/bind.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_MAC)
#include "base/feature_list.h"
#include "brave/browser/ecom/shop_container_service.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/common/features.h"
#endif
#include "base/task/sequenced_task_runner.h"
#include "brave/browser/new_tab/new_tab_shows_options.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui/ntp/new_tab_ui.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/web_contents.h"

// static
void NewTabShowsNavigationThrottle::MaybeCreateAndAdd(
    content::NavigationThrottleRegistry& registry) {
  auto& navigation_handle = registry.GetNavigationHandle();
  auto* context = navigation_handle.GetWebContents()->GetBrowserContext();
  if (!navigation_handle.IsInPrimaryMainFrame() ||
      !Profile::FromBrowserContext(context)->IsRegularProfile() ||
      !NewTabUI::IsNewTab(navigation_handle.GetURL())) {
    return;
  }

  registry.AddThrottle(
      std::make_unique<NewTabShowsNavigationThrottle>(registry));
}

NewTabShowsNavigationThrottle::NewTabShowsNavigationThrottle(
    content::NavigationThrottleRegistry& registry)
    : NavigationThrottle(registry) {}
NewTabShowsNavigationThrottle::~NewTabShowsNavigationThrottle() = default;

content::NavigationThrottle::ThrottleCheckResult
NewTabShowsNavigationThrottle::WillStartRequest() {
  auto* web_contents = navigation_handle()->GetWebContents();
  auto* context = web_contents->GetBrowserContext();
  Profile* profile = Profile::FromBrowserContext(context);
  if (!brave::ShouldUseNewTabURLForNewTab(profile)) {
    new_tab_options_url_ = brave::GetNewTabPageURL(profile);
  }
#if BUILDFLAG(IS_MAC)
  if (new_tab_options_url_.is_empty() &&
      base::FeatureList::IsEnabled(containers::features::kContainers)) {
    new_tab_options_url_ = ecom::GetShopHomepage(
        profile, containers::GetContainerIdForWebContents(web_contents));
  }
#endif
  if (new_tab_options_url_.is_empty()) {
    return content::NavigationThrottle::PROCEED;
  }
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE,
      base::BindOnce(&NewTabShowsNavigationThrottle::LoadNewTabOptionsURL,
                     weak_factory_.GetWeakPtr()));
  return content::NavigationThrottle::DEFER;
}

const char* NewTabShowsNavigationThrottle::GetNameForLogging() {
  return "NewTabShowsNavigationThrottle";
}

void NewTabShowsNavigationThrottle::LoadNewTabOptionsURL() {
  auto* web_contents = navigation_handle()->GetWebContents();
  web_contents->GetController().LoadURL(
      new_tab_options_url_, content::Referrer(),
      ui::PAGE_TRANSITION_AUTO_TOPLEVEL, std::string());
}
