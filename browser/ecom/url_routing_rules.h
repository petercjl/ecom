// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_URL_ROUTING_RULES_H_
#define BRAVE_BROWSER_ECOM_URL_ROUTING_RULES_H_
#include <string>
#include "base/values.h"
class GURL;
namespace ecom {
inline constexpr char kUrlRoutingPref[] = "ecom.url_routing";
base::DictValue DefaultUrlRoutingConfig();
// Normalize URL components and reject malformed or unbounded rule input.
std::string NormalizeUrlRoutingRule(base::DictValue& rule);
std::string GetUrlRoutingTransform(const base::DictValue& rule);
// An invalid result prevents forwarding ambiguous product identities.
GURL TransformUrlRoutingDestination(const base::DictValue& rule, const GURL& url);
bool UrlRoutingConditionMatches(const base::DictValue& condition, const GURL& url);
std::string GetTaobaoProductId(const GURL& url);
bool IsMerchantDenialTemplateUrl(const GURL& url);
// Only the requested product or the platform's merchant-access verdict page.
bool IsMerchantProductOwnershipPage(const GURL& url, const std::string& item_id);
bool IsOtherShopProductVerdict(const GURL& url, const std::string& item_id,
                              const base::DictValue& page);
GURL FindTaobaoSearchProductLink(const base::ListValue& links,
                                const std::string& item_id);
bool IsMerchantOnlyUrlRoutingRule(const base::DictValue& rule);
const base::DictValue* FindUrlRoutingRule(const base::DictValue& config,
                                        const GURL& url,
                                        bool allow_merchant_only_rules);
}  // namespace ecom
#endif
