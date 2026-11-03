// Copyright 2026 The Ecom Authors.
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. https://mozilla.org/MPL/2.0/.
#include "brave/browser/ecom/container_password_store.h"

#include <map>
#include <memory>

#include "base/base64.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/utf_string_conversions.h"
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
#include "components/os_crypt/async/common/encryptor.h"
#include "components/password_manager/core/browser/affiliation/affiliated_match_helper.h"
#include "components/password_manager/core/browser/password_store/login_database.h"
#include "components/password_manager/core/browser/password_store/password_store.h"
#include "components/password_manager/core/browser/password_store/password_store_built_in_backend.h"
#include "components/password_manager/core/browser/password_store/stored_credential.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "components/sync/model/wipe_model_upon_sync_disabled_behavior.h"
#include "url/origin.h"

namespace ecom {
namespace {
const char kContainerPasswordStores[] = "EcomContainerPasswordStores";

void AddPassword(password_manager::PasswordStoreInterface &store,
                 const std::string &origin, const std::string &username,
                 const std::string &password,
                 base::OnceClosure completion = base::DoNothing()) {
  const GURL url(origin);
  if (!url.SchemeIs("https") ||
      url::Origin::Create(url).Serialize() != origin || username.empty() ||
      password.empty()) {
    return;
  }
  password_manager::StoredCredential login;
  login.url = url;
  login.signon_realm = url.spec();
  login.username_value = base::UTF8ToUTF16(username);
  login.password_value =
      password_manager::PasswordString(base::UTF8ToUTF16(password));
  login.date_created = base::Time::Now();
  login.skip_zero_click = true;
  store.AddLogin(std::move(login), std::move(completion));
}

class Stores final : public base::SupportsUserData::Data,
                     public ProfileObserver {
public:
  explicit Stores(Profile *profile) : profile_(profile) {
    profile_->AddObserver(this);
  }
  ~Stores() override {
    if (profile_) {
      OnProfileWillBeDestroyed(profile_);
    }
  }
  void OnProfileWillBeDestroyed(Profile *profile) override {
    weak_.InvalidateWeakPtrs();
    profile->RemoveObserver(this);
    for (auto &entry : stores_) {
      entry.second->ShutdownOnUIThread();
    }
    stores_.clear();
    profile_ = nullptr;
  }
  password_manager::PasswordStoreInterface *Get(const std::string &id) {
    if (!profile_) {
      return nullptr;
    }
    auto &store = stores_[id];
    if (!store) {
      auto database = std::make_unique<password_manager::LoginDatabase>(
          profile_->GetPath().AppendASCII("Login Data Container " + id),
          password_manager::kProfileStore,
          password_manager::LoginDatabase::
              DeletingUndecryptablePasswordsEnabled(false));
      store = base::MakeRefCounted<password_manager::PasswordStore>(
          std::make_unique<password_manager::PasswordStoreBuiltInBackend>(
              std::move(database),
              syncer::WipeModelUponSyncDisabledBehavior::kNever,
              profile_->GetPrefs(), g_browser_process->os_crypt_async(),
              nullptr));
      store->Init();
      g_browser_process->os_crypt_async()->GetInstance(base::BindOnce(
          &Stores::ImportConfiguredPassword, weak_.GetWeakPtr(), id));
    }
    return store.get();
  }

private:
  void
  ImportConfiguredPassword(std::string id,
                           scoped_refptr<os_crypt_async::Encryptor> encryptor) {
    const auto *item = profile_->GetPrefs()
                           ->GetDict(containers::prefs::kShopContainers)
                           .FindDict(id);
    const auto *encrypted =
        item ? item->FindString("encryptedCredentials") : nullptr;
    if (!encryptor || !encrypted ||
        item->FindBool("credentialImported").value_or(false)) {
      return;
    }
    std::string ciphertext;
    std::string plaintext;
    if (!base::Base64Decode(*encrypted, &ciphertext) ||
        !encryptor->DecryptString(ciphertext, &plaintext)) {
      return;
    }
    auto data = base::JSONReader::ReadDict(plaintext, base::JSON_PARSE_RFC);
    if (!data || !data->FindString("containerId") ||
        *data->FindString("containerId") != id) {
      return;
    }
    const auto *origin = data->FindString("origin");
    const auto *username = data->FindString("username");
    const auto *password = data->FindString("password");
    if (origin && username && password) {
      AddPassword(*stores_.at(id), *origin, *username, *password,
                  base::BindOnce(&Stores::MarkImported, weak_.GetWeakPtr(), id,
                                 *encrypted));
    }
  }

  void MarkImported(std::string id, std::string expected) {
    ScopedDictPrefUpdate update(profile_->GetPrefs(),
                                containers::prefs::kShopContainers);
    auto *item = update->FindDict(id);
    const auto *encrypted =
        item ? item->FindString("encryptedCredentials") : nullptr;
    if (encrypted && *encrypted == expected) {
      item->Set("credentialImported", true);
    }
  }

  raw_ptr<Profile> profile_;
  std::map<std::string, scoped_refptr<password_manager::PasswordStore>> stores_;
  base::WeakPtrFactory<Stores> weak_{this};
};
} // namespace

password_manager::PasswordStoreInterface *
GetContainerPasswordStore(Profile *profile, const std::string &id) {
  if (!profile || profile->IsOffTheRecord() || profile->IsGuestSession() ||
      !base::Uuid::ParseLowercase(id).is_valid() ||
      !containers::GetContainerFromPrefs(*profile->GetPrefs(), id) ||
      !g_browser_process->os_crypt_async()) {
    return nullptr;
  }
  auto *stores =
      static_cast<Stores *>(profile->GetUserData(kContainerPasswordStores));
  if (!stores) {
    auto owned = std::make_unique<Stores>(profile);
    stores = owned.get();
    profile->SetUserData(kContainerPasswordStores, std::move(owned));
  }
  return stores->Get(id);
}
void AddContainerPassword(Profile *profile, const std::string &id,
                          const std::string &origin,
                          const std::string &username,
                          const std::string &password) {
  if (auto *store = GetContainerPasswordStore(profile, id)) {
    AddPassword(*store, origin, username, password);
  }
}
} // namespace ecom
