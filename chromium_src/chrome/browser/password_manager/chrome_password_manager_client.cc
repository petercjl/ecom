/* Copyright (c) 2023 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "brave/components/constants/pref_names.h"
#include "chrome/browser/profiles/profile.h"

#include "build/build_config.h"

#if BUILDFLAG(IS_MAC)
#include "base/feature_list.h"
#include "brave/browser/ecom/container_password_store.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/common/features.h"

#define ECOM_CONTAINER_PROFILE_PASSWORD_STORE                                  \
  if (base::FeatureList::IsEnabled(containers::features::kContainers)) {       \
    const auto id = containers::GetContainerIdForWebContents(web_contents());  \
    if (!id.empty()) {                                                         \
      return ecom::GetContainerPasswordStore(GetProfile(), id);                \
    }                                                                          \
  }
#define ECOM_CONTAINER_ACCOUNT_PASSWORD_STORE                                  \
  if (base::FeatureList::IsEnabled(containers::features::kContainers) &&       \
      !containers::GetContainerIdForWebContents(web_contents()).empty()) {     \
    return nullptr;                                                            \
  }
#else
#define ECOM_CONTAINER_PROFILE_PASSWORD_STORE
#define ECOM_CONTAINER_ACCOUNT_PASSWORD_STORE
#endif

#define IsGuestSession                                                         \
  IsGuestSession() ||                                                          \
      (!profile->GetPrefs()->GetBoolean(kBraveAutofillPrivateWindows) &&       \
       (IsOffTheRecord() || profile->IsTor())) ||                              \
      profile->IsGuestSession
#include <chrome/browser/password_manager/chrome_password_manager_client.cc>
#undef IsGuestSession

#undef ECOM_CONTAINER_PROFILE_PASSWORD_STORE
#undef ECOM_CONTAINER_ACCOUNT_PASSWORD_STORE
