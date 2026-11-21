// Copyright 2026 The Ecom Authors.
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. https://mozilla.org/MPL/2.0/.
#include "brave/browser/ecom/container_password_store.h"

#include <map>
#include <memory>
#include <optional>
#include <utility>
#include <vector>

#include "base/base64.h"
#include "base/json/json_reader.h"
#include "base/memory/raw_ptr.h"
#include "base/strings/utf_string_conversions.h"
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "components/os_crypt/async/common/encryptor.h"
#include "components/password_manager/core/browser/affiliation/affiliated_match_helper.h"
#include "components/password_manager/core/browser/password_form_digest.h"
#include "components/password_manager/core/browser/password_store/login_database.h"
#include "components/password_manager/core/browser/password_store/password_store.h"
#include "components/password_manager/core/browser/password_store/password_store_built_in_backend.h"
#include "components/password_manager/core/browser/password_store/stored_credential.h"
#include "components/prefs/pref_service.h"
#include "components/sync/model/wipe_model_upon_sync_disabled_behavior.h"
#include "sql/transaction.h"
#include "url/origin.h"

namespace ecom {
namespace {
const char kContainerPasswordStores[] = "EcomContainerPasswordStores";

using password_manager::AddCredentialError;
using password_manager::PasswordForm;
using password_manager::PasswordStoreChangeList;
using password_manager::StoredCredential;

std::optional<StoredCredential> MakeConfiguredLogin(
    const std::string& origin,
    const std::string& username,
    const std::string& password) {
  const GURL url(origin);
  if (!url.SchemeIs("https") ||
      url::Origin::Create(url).Serialize() != origin || username.empty() ||
      password.empty()) {
    return std::nullopt;
  }
  StoredCredential login;
  login.url = url;
  login.signon_realm = url.spec();
  login.username_value = base::UTF8ToUTF16(username);
  login.password_value =
      password_manager::PasswordString(base::UTF8ToUTF16(password));
  login.type = PasswordForm::Type::kManuallyAdded;
  login.date_created = base::Time::Now();
  login.skip_zero_click = true;
  return login;
}

class ContainerLoginDatabase final : public password_manager::LoginDatabase {
 public:
  ContainerLoginDatabase(const base::FilePath& path,
                         std::string id,
                         std::string configured_origin,
                         std::string configured_ciphertext)
      : LoginDatabase(path, password_manager::kProfileStore,
                      DeletingUndecryptablePasswordsEnabled(false)),
        id_(std::move(id)),
        configured_origin_(std::move(configured_origin)),
        configured_ciphertext_(std::move(configured_ciphertext)) {}

  bool Init(OnUndecryptablePasswordsRemoved on_removed,
            scoped_refptr<os_crypt_async::Encryptor> encryptor) override {
    if (!LoginDatabase::Init(std::move(on_removed), encryptor)) {
      return false;
    }
    auto login = ReadConfiguredLogin(encryptor.get());
    configured_ciphertext_.clear();
    if (!login) {
      return true;
    }

    // Reconcile before the first autofill query can read the database.
    auto transaction = CreateTransaction();
    if (!transaction->Begin()) {
      return false;
    }
    AddCredentialError error = AddCredentialError::kNone;
    [[maybe_unused]] auto changes = AddLogin(std::move(*login), &error);
    return error == AddCredentialError::kNone && transaction->Commit();
  }

  PasswordStoreChangeList AddLogin(StoredCredential login,
                                 AddCredentialError* error) override {
    if (login.type != PasswordForm::Type::kManuallyAdded ||
        login.scheme != PasswordForm::Scheme::kHtml || login.blocked_by_user) {
      return LoginDatabase::AddLogin(std::move(login), error);
    }

    // Initialization and the native async helper both call this in a
    // transaction. Keep passwords for other origins and blocklist entries.
    AddCredentialError local_error = AddCredentialError::kNone;
    if (!error) {
      error = &local_error;
    }
    *error = AddCredentialError::kNone;
    std::vector<StoredCredential> existing;
    if (!GetLogins({login.scheme, login.signon_realm, login.url}, false,
                   &existing)) {
      *error = AddCredentialError::kDbError;
      return {};
    }

    PasswordStoreChangeList changes;
    bool already_current = false;
    for (const auto& saved : existing) {
      if (saved.signon_realm != login.signon_realm ||
          saved.scheme != login.scheme || saved.blocked_by_user) {
        continue;
      }
      if (password_manager::AreStoredCredentialUniqueKeysEqual(saved, login)) {
        already_current = saved.password_value == login.password_value;
        continue;
      }
      PasswordStoreChangeList removed;
      if (!RemoveLogin(saved, &removed)) {
        *error = AddCredentialError::kDbError;
        return {};
      }
      for (auto& change : removed) {
        changes.push_back(std::move(change));
      }
    }
    if (!already_current) {
      auto added = LoginDatabase::AddLogin(std::move(login), error);
      if (*error != AddCredentialError::kNone) {
        return {};
      }
      for (auto& change : added) {
        changes.push_back(std::move(change));
      }
    }
    return changes;
  }

 private:
  std::optional<StoredCredential> ReadConfiguredLogin(
      const os_crypt_async::Encryptor* encryptor) const {
    if (!encryptor || configured_ciphertext_.empty()) {
      return std::nullopt;
    }
    std::string ciphertext;
    std::string plaintext;
    if (!base::Base64Decode(configured_ciphertext_, &ciphertext) ||
        !encryptor->DecryptString(ciphertext, &plaintext)) {
      return std::nullopt;
    }
    auto data = base::JSONReader::ReadDict(plaintext, base::JSON_PARSE_RFC);
    const auto* container_id = data ? data->FindString("containerId") : nullptr;
    const auto* origin = data ? data->FindString("origin") : nullptr;
    const auto* username = data ? data->FindString("username") : nullptr;
    const auto* password = data ? data->FindString("password") : nullptr;
    if (!container_id || *container_id != id_ || !origin ||
        *origin != configured_origin_ || !username || !password) {
      return std::nullopt;
    }
    return MakeConfiguredLogin(*origin, *username, *password);
  }

  const std::string id_;
  const std::string configured_origin_;
  std::string configured_ciphertext_;
};

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
      const auto* item = profile_->GetPrefs()
                             ->GetDict(containers::prefs::kShopContainers)
                             .FindDict(id);
      const auto* origin = item ? item->FindString("credentialOrigin") : nullptr;
      const auto* encrypted =
          item ? item->FindString("encryptedCredentials") : nullptr;
      auto database = std::make_unique<ContainerLoginDatabase>(
          profile_->GetPath().AppendASCII("Login Data Container " + id), id,
          origin ? *origin : "", encrypted ? *encrypted : "");
      store = base::MakeRefCounted<password_manager::PasswordStore>(
          std::make_unique<password_manager::PasswordStoreBuiltInBackend>(
              std::move(database),
              syncer::WipeModelUponSyncDisabledBehavior::kNever,
              profile_->GetPrefs(), g_browser_process->os_crypt_async(),
              nullptr));
      store->Init();
    }
    return store.get();
  }

private:
  raw_ptr<Profile> profile_;
  std::map<std::string, scoped_refptr<password_manager::PasswordStore>> stores_;
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
  auto login = MakeConfiguredLogin(origin, username, password);
  if (login) {
    if (auto* store = GetContainerPasswordStore(profile, id)) {
      store->AddLogin(std::move(*login));
    }
  }
}
} // namespace ecom
