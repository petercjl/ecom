// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#include "brave/browser/ecom/shop_identity_parser.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

#include "base/json/json_reader.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"
#include "third_party/re2/src/re2/re2.h"

namespace ecom {
namespace {
std::string DecodeAttribute(std::string_view text) {
  std::string decoded;
  for (size_t i = 0; i < text.size();) {
    const auto end = text[i] == '&' ? text.find(';', i + 1)
                                    : std::string_view::npos;
    if (end != std::string_view::npos && end - i < 16) {
      const auto entity = text.substr(i + 1, end - i - 1);
      unsigned value = 0;
      bool numeric = false;
      if (entity.starts_with("#x") || entity.starts_with("#X")) {
        numeric = base::HexStringToUInt(entity.substr(2), &value);
      } else if (entity.starts_with('#')) {
        numeric = base::StringToUint(entity.substr(1), &value);
      } else if (entity == "amp") {
        value = '&';
      } else if (entity == "quot") {
        value = '"';
      } else if (entity == "apos") {
        value = '\'';
      } else if (entity == "lt") {
        value = '<';
      } else if (entity == "gt") {
        value = '>';
      }
      if ((numeric || value != 0) && value < 128) {
        decoded.push_back(static_cast<char>(value));
        i = end + 1;
        continue;
      }
    }
    decoded.push_back(text[i++]);
  }
  return decoded;
}

std::string IdentityId(const base::DictValue& data, const char* key) {
  const auto* value = data.Find(key);
  std::string id;
  if (value && value->is_string()) {
    id = value->GetString();
  } else if (value && value->is_int() && value->GetInt() > 0) {
    id = base::NumberToString(value->GetInt());
  } else if (value && value->is_double()) {
    const double number = value->GetDouble();
    if (number > 0 && number <= 9007199254740991.0 &&
        number == std::floor(number)) {
      id = base::NumberToString(static_cast<int64_t>(number));
    }
  }
  if (id.empty() || id.size() > 64 ||
      !std::all_of(id.begin(), id.end(), base::IsAsciiDigit<char>) ||
      id.find_first_not_of('0') == std::string::npos) {
    return {};
  }
  return id;
}

std::optional<base::DictValue> IdentityFields(const base::DictValue& data) {
  auto shop = IdentityId(data, "runAsShopId");
  auto account = IdentityId(data, "loginUserId");
  if (account.empty()) {
    account = IdentityId(data, "mainUserId");
  }
  std::string name;
  for (const auto* key : {"runAsShopTitle", "runAsUserName", "mainUserName"}) {
    if (const auto* text = data.FindString(key)) {
      base::TrimWhitespaceASCII(*text, base::TRIM_ALL, &name);
      if (!name.empty()) {
        break;
      }
    }
  }
  if (shop.empty() || account.empty() || name.empty() || name.size() > 600 ||
      std::any_of(name.begin(), name.end(),
                  [](unsigned char c) { return c < 0x20 || c == 0x7f; })) {
    return std::nullopt;
  }
  return base::DictValue()
      .Set("shopId", shop)
      .Set("accountId", account)
      .Set("platformName", name);
}
}  // namespace

std::optional<base::DictValue> ParseEmbeddedShopIdentity(std::string_view html) {
  std::string block;
  if (!re2::RE2::PartialMatch(
          html,
          re2::RE2(R"re((?s)(?:window\.)?metaCacheData\s*=\s*(\{.+?\})\s*;)re"),
          &block)) {
    return std::nullopt;
  }
  auto value = base::JSONReader::Read(block, base::JSON_PARSE_CHROMIUM_EXTENSIONS);
  return value && value->is_dict() ? IdentityFields(value->GetDict())
                                   : std::nullopt;
}

std::optional<base::DictValue> ParsePersonalViewShopIdentity(std::string_view json) {
  auto value = base::JSONReader::Read(json, base::JSON_PARSE_RFC);
  if (!value || !value->is_dict() || value->GetDict().FindInt("code") != 0) {
    return std::nullopt;
  }
  const auto* data = value->GetDict().FindDict("data");
  return data ? IdentityFields(*data) : std::nullopt;
}

std::optional<std::string> ExtractSycmLegalityToken(std::string_view html) {
  re2::StringPiece input(html);
  const re2::RE2 tag_pattern(R"re((?i)(<meta\b[^>]*>))re");
  const re2::RE2 name_pattern(
      R"re((?i)\sname\s*=\s*(?:"microdata"|'microdata'|microdata(?:\s|/?>)))re");
  std::string tag;
  std::optional<std::string> token;
  while (re2::RE2::FindAndConsume(&input, tag_pattern, &tag)) {
    if (!re2::RE2::PartialMatch(tag, name_pattern)) {
      continue;
    }
    std::string content;
    if (!re2::RE2::PartialMatch(
            tag, R"re((?i)\scontent\s*=\s*"([^"]*)")re", &content) &&
        !re2::RE2::PartialMatch(
            tag, R"re((?i)\scontent\s*=\s*'([^']*)')re", &content)) {
      return std::nullopt;
    }
    content = DecodeAttribute(content);
    for (const auto& pair : base::SplitString(
             content, ";", base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY)) {
      constexpr std::string_view prefix = "legalityToken=";
      if (!pair.starts_with(prefix)) {
        continue;
      }
      // Match the platform client's semicolon-separated key=value metadata:
      // its split('=')[1] preserves existing percent encoding.
      const std::string candidate =
          pair.substr(prefix.size(), pair.find('=', prefix.size()) - prefix.size());
      if (token || candidate.empty() || candidate.size() > 1024 ||
          candidate == "null" || candidate == "undefined" ||
          !std::all_of(candidate.begin(), candidate.end(), [](unsigned char c) {
            return base::IsAsciiAlpha(c) || base::IsAsciiDigit(c) ||
                   std::string_view("._~+-/=%").find(c) != std::string_view::npos;
          })) {
        return std::nullopt;
      }
      token = candidate;
    }
  }
  return token;
}

std::string RedactIdentityError(std::string_view message,
                                std::string_view request_token) {
  if (message.size() > 600) {
    return "IDENTITY_RESPONSE_ERROR";
  }
  std::string safe(message);
  if (!request_token.empty()) {
    base::ReplaceSubstringsAfterOffset(&safe, 0, request_token, "[REDACTED]");
  }
  re2::RE2::GlobalReplace(&safe, R"re(https?://[^\s"'<>]+)re", "[URL]");
  re2::RE2::GlobalReplace(
      &safe,
      R"re((?i)(?:cookie|token|password|authorization|secret)\s*[:=]\s*[^\s,;]+)re",
      "[REDACTED]");
  re2::RE2::GlobalReplace(&safe, R"re([-A-Za-z0-9_.~+/%=]{12,})re",
                         "[REDACTED]");
  re2::RE2::GlobalReplace(&safe, R"re([0-9]{6,})re", "[REDACTED]");
  return safe;
}
std::string ParseTaobaoBuyerLogin(std::string_view json) {
  const auto value = base::JSONReader::Read(json, base::JSON_PARSE_RFC);
  if (!value || !value->is_dict()) {
    return "unknown";
  }
  const auto& envelope = value->GetDict();
  const auto* api = envelope.FindString("api");
  const auto* ret = envelope.FindList("ret");
  if (!api || !base::EqualsCaseInsensitiveASCII(*api, "mtop.user.getUserSimple") ||
      !ret || ret->size() != 1 || !(*ret)[0].is_string()) {
    return "unknown";
  }
  const auto& result = (*ret)[0].GetString();
  if (result.starts_with("FAIL_SYS_SESSION_EXPIRED::")) {
    return "signed-out";
  }
  const auto* data = envelope.FindDict("data");
  return result.starts_with("SUCCESS::") && data &&
                 !IdentityId(*data, "userNumId").empty()
             ? "authenticated"
             : "unknown";
}

std::string ParsePinduoduoMerchantLogin(std::string_view json) {
  const auto envelope = base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC);
  if (!envelope || envelope->FindBool("success") != true) {
    return "unknown";
  }

  const auto* result = envelope->FindDict("result");
  const auto login = result ? result->FindBool("login") : std::nullopt;
  if (!login) {
    return "unknown";
  }
  return *login ? "authenticated" : "signed-out";
}

std::string ParseXiaohongshuMerchantLogin(int http_status,
                                        std::string_view json) {
  const auto envelope = base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC);
  if (!envelope) {
    return "unknown";
  }
  const auto success = envelope->FindBool("success");
  const auto code = envelope->FindInt("code");
  if ((http_status == 200 || http_status == 401) && success == false &&
      code == -13000) {
    return "signed-out";
  }
  const auto* data = envelope->FindDict("data");
  const auto* seller_id = data ? data->FindString("seller_id") : nullptr;
  const bool hex_seller_id =
      seller_id && seller_id->size() == 24 &&
      seller_id->find_first_not_of('0') != std::string::npos &&
      std::all_of(seller_id->begin(), seller_id->end(),
                  base::IsHexDigit<char>);
  if (http_status == 200 && success == true && code == 0 && data &&
      (hex_seller_id || !IdentityId(*data, "seller_id").empty())) {
    return "authenticated";
  }
  return "unknown";
}
}  // namespace ecom
