/* Copyright (c) 2019 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include <string_view>

#include "brave/browser/ui/brave_ui_features.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)
#include "brave/browser/ecom/shop_container_service.h"
#include "brave/browser/new_tab/new_tab_shows_options.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui/ntp/new_tab_ui.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/web_contents.h"
#endif
#include "brave/components/containers/buildflags/buildflags.h"
#include "chrome/browser/tab_contents/tab_util.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "content/public/common/url_constants.h"
#include "url/gurl.h"

#if BUILDFLAG(ENABLE_CONTAINERS)
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/common/features.h"
#include "content/public/browser/security_principal.h"
#endif  // BUILDFLAG(ENABLE_CONTAINERS)

namespace {

void UpdateBraveScheme(NavigateParams* params) {
  if (params->url.SchemeIs(content::kBraveUIScheme) ||
      params->url.SchemeIs("ecom")) {
    GURL::Replacements replacements;
    replacements.SetSchemeStr(content::kChromeUIScheme);
    params->url = params->url.ReplaceComponents(replacements);
  }
}

void MaybeOverridePopupDisposition(NavigateParams* params) {
  if (base::FeatureList::IsEnabled(features::kForcePopupToBeOpenedAsTab) &&
      params->disposition == WindowOpenDisposition::NEW_POPUP) {
    params->disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
  }
}

void UpdateParams(NavigateParams* params) {
  UpdateBraveScheme(params);
  MaybeOverridePopupDisposition(params);
#if (BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)) && BUILDFLAG(ENABLE_CONTAINERS)
  if (!params->browser || params->contents_to_insert ||
      params->is_renderer_initiated ||
      (params->disposition != WindowOpenDisposition::NEW_FOREGROUND_TAB &&
       params->disposition != WindowOpenDisposition::NEW_BACKGROUND_TAB) ||
      !NewTabUI::IsNewTab(params->url) ||
      !brave::ShouldUseNewTabURLForNewTab(params->initiating_profile) ||
      !base::FeatureList::IsEnabled(containers::features::kContainers)) {
    return;
  }
  auto* source = params->source_contents.get();
  if (!source) {
    source = params->browser->GetTabStripModel()->GetActiveWebContents();
  }
  if (!source || source->GetBrowserContext() != params->initiating_profile) {
    return;
  }
  const std::string id = params->storage_partition_config
      ? std::string(containers::GetContainerIdFromStoragePartitionConfig(
            *params->storage_partition_config))
      : containers::GetContainerIdForWebContents(source);
  const auto homepage = ecom::GetShopHomepage(params->initiating_profile, id);
  if (homepage.is_valid()) {
    params->storage_partition_config = content::StoragePartitionConfig::Create(
        params->initiating_profile, containers::kContainersStoragePartitionDomain,
        id, false);
    params->url = homepage;
  }
#endif
}

#if BUILDFLAG(ENABLE_CONTAINERS)
std::optional<content::StoragePartitionConfig>
GetStoragePartitionConfigToInherit(const NavigateParams& params) {
  if (!base::FeatureList::IsEnabled(containers::features::kContainers)) {
    return std::nullopt;
  }

  if (params.storage_partition_config) {
    return containers::MaybeInheritStoragePartition(
        *params.storage_partition_config);
  }

  if (params.source_site_instance) {
    return containers::MaybeInheritStoragePartition(
        params.source_site_instance->GetSecurityPrincipal()
            .GetStoragePartitionConfig());
  }

  return std::nullopt;
}
#endif  // BUILDFLAG(ENABLE_CONTAINERS)

}  // namespace

#include <chrome/browser/ui/navigator/browser_navigator.cc>
