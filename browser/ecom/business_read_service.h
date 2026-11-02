// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#ifndef BRAVE_BROWSER_ECOM_BUSINESS_READ_SERVICE_H_
#define BRAVE_BROWSER_ECOM_BUSINESS_READ_SERVICE_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/values.h"

class Profile;

namespace ecom {
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
    base::OnceCallback<void(base::DictValue)> callback);
}  // namespace ecom
#endif
