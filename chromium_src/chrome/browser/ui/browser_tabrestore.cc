// Copyright (c) 2026 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/2.0/.

#include "chrome/browser/ui/browser_tabrestore.h"

#include "brave/browser/ui/tabs/tree_tab_session_manager.h"
#include "brave/components/containers/buildflags/buildflags.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"

#if BUILDFLAG(ENABLE_CONTAINERS)
#include "brave/components/containers/content/browser/tab_restore_utils.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/tab_contents/tab_util.h"
#include "components/sessions/core/serialized_navigation_entry.h"
#include "content/public/browser/web_contents.h"
#endif  // BUILDFLAG(ENABLE_CONTAINERS)

namespace {

#if BUILDFLAG(ENABLE_CONTAINERS)
void MaybeSetContainerSiteInstance(
    BrowserWindowInterface* browser,
    base::span<const sessions::SerializedNavigationEntry> navigations,
    int selected_navigation,
    content::WebContents::CreateParams* create_params) {
  auto storage_partition_config =
      containers::GetStoragePartitionConfigToRestore(
          browser->GetProfile(), navigations, selected_navigation);
  if (!storage_partition_config) {
    return;
  }

  // A restored container WebUI also needs its fixed partition before entries
  // are attached and serialized. Deferring its SiteInstance would create a
  // default-partition frame beside a container NavigationEntry. Non-container
  // WebUI restores still take Chromium's deferred path via the early return.
  const GURL& url = navigations[selected_navigation].virtual_url();
  create_params->site_instance = tab_util::GetSiteInstanceForNewTab(
      browser->GetProfile(), url, std::move(storage_partition_config));
}
#endif  // BUILDFLAG(ENABLE_CONTAINERS)

content::WebContents* MaybeRestoreTabTreeHierarchy(
    BrowserWindowInterface* browser,
    content::WebContents* restored_web_contents,
    const std::map<std::string, std::string>& extra_data) {
  if (auto* tree_tab_session_manager = TreeTabSessionManager::From(browser)) {
    // tree tab session manager is only available when the browser is normal
    // browser.
    tree_tab_session_manager->MaybeRestoreTabTreeHierarchy(
        restored_web_contents, extra_data);
  }
  return restored_web_contents;
}

}  // namespace

#include <chrome/browser/ui/browser_tabrestore.cc>
