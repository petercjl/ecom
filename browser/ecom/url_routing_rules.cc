// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/url_routing_rules.h"
#include "base/json/json_reader.h"
#include "base/strings/pattern.h"
#include "base/strings/string_util.h"
#include "net/base/url_util.h"
#include "url/gurl.h"

namespace ecom {
namespace {
std::string Text(const base::DictValue& d, const char* key) {
  const auto* value = d.FindString(key);
  return value ? *value : std::string();
}
bool SafeUrl(const GURL& url) {
  return url.is_valid() && url.SchemeIsHTTPOrHTTPS() && url.has_host() &&
         !url.has_username() && !url.has_password();
}
}  // namespace

base::DictValue DefaultUrlRoutingConfig() {
  return std::move(*base::JSONReader::ReadDict(R"JSON({
    "enabled":true,"revision":0,"rules":[{
      "id":"example-taobao-product-detail","name":"淘宝／天猫商品详情 · 示例",
      "enabled":false,"containerId":"","conditions":[
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
    condition.Set("host", host.host());
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

bool UrlRoutingConditionMatches(const base::DictValue& c, const GURL& url) {
  if (!SafeUrl(url)) return false;
  if (Text(c, "type") == "exact")
    return url.GetWithoutRef() == GURL(Text(c, "url")).GetWithoutRef();
  if (Text(c, "type") != "pattern") return false;
  const auto host = Text(c, "host");
  const auto scheme = Text(c, "scheme");
  if (scheme != "http+https" && scheme != url.scheme()) return false;
  if (url.host() != host &&
      !(c.FindBool("includeSubdomains").value_or(false) &&
        base::EndsWith(url.host(), "." + host))) return false;
  if (!base::MatchPattern(url.path(), Text(c, "path"))) return false;
  if (const auto* queries = c.FindList("query")) {
    for (const auto& value : *queries) {
      if (!value.is_dict()) return false;
      const auto& q = value.GetDict();
      bool found = false;
      for (net::QueryIterator it(url); !it.IsAtEnd(); it.Advance()) {
        if (it.GetKey() == Text(q, "name") &&
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

const base::DictValue* FindUrlRoutingRule(const base::DictValue& config,
                                        const GURL& url) {
  if (!config.FindBool("enabled").value_or(false)) return nullptr;
  const auto* rules = config.FindList("rules");
  if (!rules) return nullptr;
  for (const auto& value : *rules) {
    if (!value.is_dict()) continue;
    const auto& rule = value.GetDict();
    if (!rule.FindBool("enabled").value_or(false)) continue;
    if (const auto* conditions = rule.FindList("conditions")) {
      for (const auto& condition : *conditions)
        if (condition.is_dict() && UrlRoutingConditionMatches(condition.GetDict(), url))
          return &rule;
    }
  }
  return nullptr;
}
}  // namespace ecom
