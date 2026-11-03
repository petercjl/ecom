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
#include "brave/components/containers/core/browser/pref_names.h"
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

bool ChromePasswordManagerClient::CanAutofillConfiguredContainerLogin(
    const url::Origin& origin) const {
#if BUILDFLAG(IS_MAC)
  auto* profile = GetProfile();
  if (profile->IsOffTheRecord() ||
      !base::FeatureList::IsEnabled(containers::features::kContainers)) {
    return false;
  }
  const auto id = containers::GetContainerIdForWebContents(web_contents());
  if (id.empty()) {
    return false;
  }
  const auto* shop = profile->GetPrefs()
                         ->GetDict(containers::prefs::kShopContainers)
                         .FindDict(id);
  const auto* saved_origin = shop ? shop->FindString("credentialOrigin") : nullptr;
  if (!saved_origin || origin.Serialize() != *saved_origin ||
      !shop->FindString("encryptedCredentials")) {
    return false;
  }
  const auto top = GetLastCommittedOrigin();
  return top == origin ||
         (*saved_origin == "https://havanalogin.taobao.com" &&
          top.Serialize() == "https://loginmyseller.taobao.com");
#else
  return false;
#endif
}
