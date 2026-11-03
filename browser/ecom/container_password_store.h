// Copyright 2026 The Ecom Authors.
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. https://mozilla.org/MPL/2.0/.
#ifndef BRAVE_BROWSER_ECOM_CONTAINER_PASSWORD_STORE_H_
#define BRAVE_BROWSER_ECOM_CONTAINER_PASSWORD_STORE_H_

#include <string>

class Profile;

namespace password_manager {
class PasswordStoreInterface;
}

namespace ecom {
// Returns a profile-owned local store for a persistent container.
password_manager::PasswordStoreInterface *
GetContainerPasswordStore(Profile *profile, const std::string &id);
// Adds an explicitly configured sign-in to the same store used by autofill.
void AddContainerPassword(Profile *profile, const std::string &id,
                          const std::string &origin,
                          const std::string &username,
                          const std::string &password);
} // namespace ecom

#endif // BRAVE_BROWSER_ECOM_CONTAINER_PASSWORD_STORE_H_
