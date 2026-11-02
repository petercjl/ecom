/* Copyright (c) 2023 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */
#include "chrome/browser/net/profile_network_context_service.h"

#include "base/containers/span.h"
#include "base/strings/string_number_conversions.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/temporary_container.h"
#include "crypto/hash.h"

static const char* kBraveCTExcludedHosts[] = {
    // Critical endpoints that shouldn't require SCTs so they always work
    "updates.bravesoftware.com",
    "updates-cdn.bravesoftware.com",
    "usage-ping.brave.com",
    // Test host for manual testing
    "sct-exempted.bravesoftware.com",
};

#define BRAVE_PROFILE_NETWORK_CONTEXT_SERVICE_GET_CT_POLICY \
  for (const auto* host : kBraveCTExcludedHosts) {          \
    excluded.push_back(host);                               \
  }

#define ConfigureNetworkContextParams \
  ConfigureNetworkContextParams_ChromiumImpl
#include <chrome/browser/net/profile_network_context_service.cc>
#undef ConfigureNetworkContextParams
#undef BRAVE_PROFILE_NETWORK_CONTEXT_SERVICE_GET_CT_POLICY

void ProfileNetworkContextService::ConfigureNetworkContextParams(
    bool in_memory,
    const base::FilePath& relative_partition_path,
    network::mojom::NetworkContextParams* network_context_params,
    cert_verifier::mojom::CertVerifierCreationParams*
        cert_verifier_creation_params) {
  ConfigureNetworkContextParams_ChromiumImpl(
      in_memory, relative_partition_path, network_context_params,
      cert_verifier_creation_params);
  if (is_shutting_down_ || in_memory || profile_->IsOffTheRecord() ||
      !profile_->GetPrefs()->FindPreference(containers::prefs::kContainersList)) {
    return;
  }
  for (const auto& entry :
       profile_->GetPrefs()->GetList(containers::prefs::kContainersList)) {
    const auto* dict = entry.GetIfDict();
    const auto* id = dict ? dict->FindString("id") : nullptr;
    if (!id || id->empty() ||
        id->starts_with(containers::kTemporaryContainerIdPrefix)) {
      continue;
    }
    // Match StoragePartitionImplMap::GetStoragePartitionPath at our pinned
    // Chromium baseline: Storage/ext/domain/first-six-SHA256-bytes.
    const auto hash = crypto::hash::Sha256(*id);
    const auto path = base::FilePath(FILE_PATH_LITERAL("Storage"))
                          .AppendASCII("ext")
                          .AppendASCII("containers")
                          .AppendASCII(
                              base::HexEncode(base::span(hash).first<6>()));
    if (relative_partition_path == path) {
      // Account containers retain session cookies between ordinary browser
      // launches. Expiry, explicit logout and site-data removal remain native.
      network_context_params->persist_session_cookies = true;
      network_context_params->restore_old_session_cookies = true;
      return;
    }
  }
}
