// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#ifndef BRAVE_BROWSER_ECOM_SHOP_IDENTITY_PARSER_H_
#define BRAVE_BROWSER_ECOM_SHOP_IDENTITY_PARSER_H_

#include <optional>
#include <string>
#include <string_view>

#include "base/values.h"

namespace ecom {
std::optional<base::DictValue> ParseEmbeddedShopIdentity(std::string_view html);
std::optional<base::DictValue> ParsePersonalViewShopIdentity(std::string_view json);
// The returned value is browser-private request material, never CLI output.
std::optional<std::string> ExtractSycmLegalityToken(std::string_view html);
}  // namespace ecom
#endif  // BRAVE_BROWSER_ECOM_SHOP_IDENTITY_PARSER_H_
