// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#ifndef BRAVE_BROWSER_ECOM_BUSINESS_READ_SERVICE_H_
#define BRAVE_BROWSER_ECOM_BUSINESS_READ_SERVICE_H_

#include <memory>
#include <optional>
#include <string>

#include "base/functional/callback.h"
#include "base/values.h"

class Profile;

namespace ecom {
// Checks the immutable transport contract of a browser-approved route.
bool MatchesBusinessReadRoute(const std::string& operation,
                              const base::DictValue& route);

// Verifies a Dev route envelope before any authenticated request.
bool SupportsSignedBusinessRoutes();
std::optional<base::DictValue> VerifySignedBusinessRoute(
    const std::string& operation,
    const base::DictValue& envelope,
    const base::DictValue& params);

struct BusinessPage {
  std::string service;
  std::string entry_url;
};
std::optional<BusinessPage> GetBusinessReadPage(const std::string& operation);

// Owned by the native service and cancelled before Profile shutdown.
class BusinessRead {
 public:
  virtual ~BusinessRead() = default;
  virtual void Start() = 0;
};
std::unique_ptr<BusinessRead> CreateBusinessRead(
    Profile* profile,
    std::string container_id,
    std::string operation,
    base::DictValue params,
    std::optional<base::DictValue> signed_spec,
    base::OnceCallback<void(base::DictValue)> callback);
}  // namespace ecom
#endif
