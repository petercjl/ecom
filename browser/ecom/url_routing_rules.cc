// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/url_routing_rules.h"
#include "base/json/json_reader.h"
#include "base/strings/pattern.h"
#include "base/strings/escape.h"
#include "base/strings/string_util.h"
#include "net/base/url_util.h"
#include "url/gurl.h"

namespace ecom {
namespace {
constexpr char kTaobaoProductExample[] = "example-taobao-product-detail";
constexpr char kTaobaoProductTransform[] = "taobao-tmall-product";
std::string QueryKey(const net::QueryIterator& it) {
  return base::UnescapeURLComponent(it.GetKey(),
      base::UnescapeRule::SPACES | base::UnescapeRule::PATH_SEPARATORS |
      base::UnescapeRule::URL_SPECIAL_CHARS_EXCEPT_PATH_SEPARATORS |
      base::UnescapeRule::REPLACE_PLUS_WITH_SPACE);
}
std::string Text(const base::DictValue& d, const char* key) {
  const auto* value = d.FindString(key);
  return value ? *value : std::string();
}
bool SafeUrl(const GURL& url) {
  return url.is_valid() && url.SchemeIsHTTPOrHTTPS() && url.has_host() &&
         !url.has_username() && !url.has_password();
}
std::string Host(const GURL& url) {
  std::string host(url.host());
  if (!host.empty() && host.back() == '.') host.pop_back();
  return host;
}
std::string ProductIdQuery(const GURL& url) {
  std::string id;
  for (net::QueryIterator it(url); !it.IsAtEnd(); it.Advance()) {
    if (QueryKey(it) != "id") {
      continue;
    }
    if (!id.empty()) {
      return {};
    }
    id = it.GetUnescapedValue();
    if (id.empty() || id.size() > 32 ||
        id.find_first_not_of("0123456789") != std::string::npos) {
      return {};
    }
  }
  return id;
}
}  // namespace

base::DictValue DefaultUrlRoutingConfig() {
  return std::move(*base::JSONReader::ReadDict(R"JSON({
    "enabled":true,"revision":0,"rules":[{
      "id":"example-taobao-product-detail","name":"淘宝／天猫商品详情 · 示例",
      "enabled":false,"containerId":"","urlTransform":"taobao-tmall-product","conditions":[
        {"type":"pattern","scheme":"http+https","host":"item.taobao.com","path":"/item.htm","includeSubdomains":false,"query":[{"name":"id","operator":"exists"}]},
        {"type":"pattern","scheme":"http+https","host":"detail.tmall.com","path":"/item.htm","includeSubdomains":false,"query":[{"name":"id","operator":"exists"}]}
      ]
    }]})JSON", base::JSON_PARSE_RFC));
}

std::string NormalizeUrlRoutingRule(base::DictValue& rule) {
  auto name = Text(rule, "name");
  base::TrimWhitespaceASCII(name, base::TRIM_ALL, &name);
  const auto* enabled = rule.Find("enabled");
  auto* conditions = rule.FindList("conditions");
  if (name.empty() || name.size() > 200 || !enabled || !enabled->is_bool() ||
      !rule.FindString("containerId") || Text(rule, "containerId").size() > 128 ||
      !conditions || conditions->empty() || conditions->size() > 50)
    return "INVALID_ROUTING_RULE";
  if (enabled->GetBool() && Text(rule, "containerId").empty())
    return "TARGET_CONTAINER_REQUIRED";
  if (rule.contains("urlTransform") &&
      Text(rule, "urlTransform") != "none" &&
      Text(rule, "urlTransform") != kTaobaoProductTransform) {
    return "INVALID_ROUTING_TRANSFORM";
  }
  rule.Set("name", name);
  for (auto& value : *conditions) {
    if (!value.is_dict()) return "INVALID_ROUTING_CONDITION";
    auto& condition = value.GetDict();
    const auto type = Text(condition, "type");
    if (type == "exact") {
      const auto text = Text(condition, "url");
      const GURL url(text);
      if (text.size() > 8192 || !SafeUrl(url)) return "INVALID_ROUTING_URL";
      condition.Set("url", url.GetWithoutRef().spec());
      continue;
    }
    if (type != "pattern") return "INVALID_ROUTING_CONDITION";
    const auto host_text = Text(condition, "host");
    const GURL host("https://" + host_text + "/");
    const auto path = Text(condition, "path");
    const auto scheme = Text(condition, "scheme");
    const auto* subdomains = condition.Find("includeSubdomains");
    if (host_text.empty() || host_text.size() > 253 ||
        host_text.find_first_of("/:@?#*\\ \t\r\n") != std::string::npos ||
        !SafeUrl(host) || host.has_port() || host.path() != "/" ||
        host.has_query() || host.has_ref() || path.empty() || path.size() > 2048 ||
        path.front() != '/' || path.find_first_of("?#\\\r\n") != std::string::npos ||
        (scheme != "http" && scheme != "https" && scheme != "http+https") ||
        !subdomains || !subdomains->is_bool())
      return "INVALID_ROUTING_PATTERN";
    condition.Set("host", Host(host));
    if (const auto* query_value = condition.Find("query")) {
      if (!query_value->is_list() || query_value->GetList().size() > 10)
        return "INVALID_ROUTING_QUERY";
      for (const auto& q : query_value->GetList()) {
        if (!q.is_dict()) return "INVALID_ROUTING_QUERY";
        const auto& predicate = q.GetDict();
        const auto op = Text(predicate, "operator");
        const auto key = Text(predicate, "name");
        if (key.empty() || key.size() > 128 ||
            (op != "exists" && op != "equals") ||
            (op == "equals" && (!predicate.FindString("value") ||
                                 Text(predicate, "value").size() > 2048)))
          return "INVALID_ROUTING_QUERY";
      }
    }
  }
  return {};
}

std::string GetUrlRoutingTransform(const base::DictValue& rule) {
  if (const auto* transform = rule.FindString("urlTransform")) {
    return *transform;
  }
  return Text(rule, "id") == kTaobaoProductExample ? kTaobaoProductTransform
                                                  : "none";
}

GURL TransformUrlRoutingDestination(const base::DictValue& rule,
                                    const GURL& url) {
  const auto host = Host(url);
  if (GetUrlRoutingTransform(rule) != kTaobaoProductTransform ||
      (host != "item.taobao.com" && host != "detail.tmall.com") ||
      url.path() != "/item.htm") {
    return url;
  }
  if (!SafeUrl(url) || url.has_port()) {
    return {};
  }
  const std::string id = ProductIdQuery(url);
  return id.empty() ? GURL() : GURL("https://" + host + "/item.htm?id=" + id);
}

std::string GetTaobaoProductId(const GURL& url) {
  if (!SafeUrl(url) || !url.SchemeIs("https") || url.has_port() ||
      (url.host() != "item.taobao.com" && url.host() != "detail.tmall.com") ||
      url.path() != "/item.htm") {
    return {};
  }
  return ProductIdQuery(url);
}

GURL FindTaobaoSearchProductLink(const base::ListValue& links,
                                const std::string& item_id) {
  if (item_id.empty()) {
    return {};
  }
  GURL redirect;
  for (const auto& link : links) {
    const auto* spec = link.GetIfString();
    if (!spec || spec->size() > 8192) {
      continue;
    }
    const GURL url(*spec);
    if (GetTaobaoProductId(url) == item_id) {
      return url;
    }
    if (!redirect.is_valid() && SafeUrl(url) && url.SchemeIs("https") &&
        !url.has_port() && url.path() == "/cc_im" &&
        (url.host() == "click.simba.taobao.com" ||
         url.host() == "mclick.simba.taobao.com") &&
        ProductIdQuery(url) == item_id) {
      redirect = url;
    }
  }
  return redirect;
}

bool IsMerchantProductOwnershipPage(const GURL& url,
                                    const std::string& item_id) {
  if (item_id.empty() || !SafeUrl(url) || !url.SchemeIs("https") ||
      url.has_port()) return false;
  return GetTaobaoProductId(url) == item_id ||
         (url.host() == "bixi.alicdn.com" &&
          base::StartsWith(url.path(),
              "/punish/punish:resource:template:CDCBusinessDataSecuritySpace:"));
}

bool IsOtherShopProductVerdict(const GURL& url, const std::string& item_id,
                              const base::DictValue& page) {
  return IsMerchantProductOwnershipPage(url, item_id) &&
         page.FindBool("otherShop").value_or(false) &&
         page.FindBool("accessDeniedPage").value_or(false) &&
         !page.FindBool("verification").value_or(false) &&
         !page.FindBool("gallery").value_or(false);
}

bool UrlRoutingConditionMatches(const base::DictValue& c, const GURL& url) {
  if (!SafeUrl(url)) return false;
  if (Text(c, "type") == "exact")
    return url.GetWithoutRef() == GURL(Text(c, "url")).GetWithoutRef();
  if (Text(c, "type") != "pattern") return false;
  const auto host = Text(c, "host");
  const auto scheme = Text(c, "scheme");
  if (scheme != "http+https" && scheme != url.scheme()) return false;
  if (Host(url) != host &&
      !(c.FindBool("includeSubdomains").value_or(false) &&
        base::EndsWith(Host(url), "." + host))) return false;
  if (!base::MatchPattern(url.path(), Text(c, "path"))) return false;
  if (const auto* queries = c.FindList("query")) {
    for (const auto& value : *queries) {
      if (!value.is_dict()) return false;
      const auto& q = value.GetDict();
      bool found = false;
      for (net::QueryIterator it(url); !it.IsAtEnd(); it.Advance()) {
        const auto key = QueryKey(it);
        if (key == Text(q, "name") &&
            (Text(q, "operator") == "equals"
                 ? it.GetUnescapedValue() == Text(q, "value")
                 : !it.GetUnescapedValue().empty())) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
  }
  return true;
}

bool IsMerchantOnlyUrlRoutingRule(const base::DictValue& rule) {
  return Text(rule, "id") == kTaobaoProductExample;
}

const base::DictValue* FindUrlRoutingRule(const base::DictValue& config,
                                        const GURL& url,
                                        bool allow_merchant_only_rules) {
  if (!config.FindBool("enabled").value_or(false)) return nullptr;
  const auto* rules = config.FindList("rules");
  if (!rules) return nullptr;
  for (const auto& value : *rules) {
    if (!value.is_dict()) continue;
    const auto& rule = value.GetDict();
    if (!rule.FindBool("enabled").value_or(false) ||
        (!allow_merchant_only_rules && IsMerchantOnlyUrlRoutingRule(rule))) {
      continue;
    }
    if (const auto* conditions = rule.FindList("conditions")) {
      for (const auto& condition : *conditions)
        if (condition.is_dict() && UrlRoutingConditionMatches(condition.GetDict(), url))
          return &rule;
    }
  }
  return nullptr;
}
}  // namespace ecom
