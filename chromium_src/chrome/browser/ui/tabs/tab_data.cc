/* Copyright (c) 2021 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "chrome/browser/ui/tabs/tab_data.h"

#include <optional>

#include "base/check.h"
#include "base/feature_list.h"
#include "brave/browser/ui/tabs/shared_pinned_tab_service.h"
#include "brave/browser/ui/tabs/shared_pinned_tab_service_factory.h"
#include "brave/components/constants/webui_url_constants.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/features.h"
#include "chrome/common/webui_url_constants.h"
#include "chrome/grit/theme_resources.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_entry.h"
#include "extensions/buildflags/buildflags.h"
#include "ui/base/resource/resource_bundle.h"
#include "url/gurl.h"

#if BUILDFLAG(ENABLE_EXTENSIONS)
#include "chrome/browser/extensions/extension_url_overrides.h"
#endif

namespace {

// Returns a value indicating whether the specified URL is a chrome URL that has
// been overridden by an extension.
bool IsChromeURLOverridden(const GURL& url, Profile* profile) {
#if BUILDFLAG(ENABLE_EXTENSIONS)
  GURL override_url(url);
  return ExtensionUrlOverrides::HandleChromeURLOverride(&override_url, profile);
#else
  return false;
#endif
}

// Returns stored TabData if |tab| is a shared pinned dummy, nullopt otherwise.
std::optional<tabs::TabData> MaybeGetSharedPinnedTabData(
    tabs::TabInterface* tab) {
  if (!base::FeatureList::IsEnabled(tabs::kBraveSharedPinnedTabs)) {
    return std::nullopt;
  }
  // Note that in unit tests, bwi may be null.
  auto* const bwi = tab->GetBrowserWindowInterface();
  if (!bwi) {
    return std::nullopt;
  }
  TabStripModel* model = bwi->GetTabStripModel();
  const int index = model->GetIndexOfTab(tab);
  if (index >= model->IndexOfFirstNonPinnedTab()) {
    return std::nullopt;
  }
  auto* shared_pinned_tab_service =
      SharedPinnedTabServiceFactory::GetForProfile(model->profile());
  DCHECK(shared_pinned_tab_service);
  auto* contents = model->GetWebContentsAt(index);
  if (shared_pinned_tab_service->IsDummyContents(contents)) {
    if (const auto* data =
            shared_pinned_tab_service->GetTabDataForDummyContents(index,
                                                                  contents)) {
      return *data;
    }
  }
  return std::nullopt;
}

// Overrides favicon theming for Brave WebUIs and surfaces unloaded-tab status.
// Returning value so thate it can be moved from outer function, instead of
// copying.
tabs::TabData MaybeApplyBraveTabDataOverrides(tabs::TabInterface* tab,
                                              tabs::TabData data) {
  auto* const bwi = tab->GetBrowserWindowInterface();
  content::WebContents* const contents = tab->GetContents();
  const GURL& url = contents->GetVisibleURL();

  // Override favicon theming for some WebUIs.
  if (url.SchemeIs(content::kChromeUIScheme)) {
    if (url.host() == chrome::kChromeUINewTabHost) {
      if (bwi && !IsChromeURLOverridden(url, bwi->GetProfile())) {
        data.favicon = ui::ImageModel::FromImage(
            ui::ResourceBundle::GetSharedInstance().GetImageNamed(
                IDR_PRODUCT_LOGO_32));
        data.should_themify_favicon = false;
      }
    } else if (url.host() == kWelcomeHost || url.host() == kRewardsPageHost) {
      data.should_themify_favicon = false;
    }
  }

  return data;
}

}  // namespace

#include <chrome/browser/ui/tabs/tab_data.cc>
