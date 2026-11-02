/* Copyright (c) 2021 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "base/containers/fixed_flat_map.h"
#include "brave/net/dns/secure_dns_endpoints.h"
#include "build/build_config.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/net/secure_dns_config.h"
#include "chrome/browser/net/stub_resolver_config_reader.h"
#include "chrome/browser/net/system_network_context_manager.h"
#include "chrome/common/pref_names.h"
#include "chrome/grit/generated_resources.h"
#include "components/grit/brave_components_strings.h"
#include "components/prefs/pref_service.h"
#include "net/base/features.h"



#define AddSecureDnsStrings AddSecureDnsStrings_ChromiumImpl

#include <chrome/browser/ui/webui/settings/shared_settings_localized_strings_provider.cc>

#undef AddSecureDnsStrings
namespace settings {

void AddSecureDnsStrings(content::WebUIDataSource* html_source) {
  AddSecureDnsStrings_ChromiumImpl(html_source);
  if (base::FeatureList::IsEnabled(net::features::kBraveFallbackDoHProvider)) {
    static const net::DohFallbackEndpointType endpoint =
        net::features::kBraveFallbackDoHProviderEndpoint.Get();
    if (endpoint != net::DohFallbackEndpointType::kNone) {
      static constexpr auto kAlternateLocalizedStrings =
          base::MakeFixedFlatMap<net::DohFallbackEndpointType, int>({
              {net::DohFallbackEndpointType::kQuad9,
               IDS_SETTINGS_AUTOMATIC_MODE_WITH_QUAD9_DESCRIPTION},
              {net::DohFallbackEndpointType::kWikimedia,
               IDS_SETTINGS_AUTOMATIC_MODE_WITH_WIKIMEDIA_DESCRIPTION},
              {net::DohFallbackEndpointType::kCloudflare,
               IDS_SETTINGS_AUTOMATIC_MODE_WITH_CLOUDFLARE_DESCRIPTION},
          });
      html_source->AddLocalizedString("secureDnsAutomaticModeDescription",
                                      kAlternateLocalizedStrings.at(endpoint));
    }
  }
}

}  // namespace settings
