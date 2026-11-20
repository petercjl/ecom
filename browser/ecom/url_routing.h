// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_URL_ROUTING_H_
#define BRAVE_BROWSER_ECOM_URL_ROUTING_H_
#include <string>
#include "base/values.h"
class Profile;
class PrefRegistrySimple;
class GURL;
namespace content { class WebContents; }
namespace ecom {
void PinUrlRoutingPage(content::WebContents* contents);
bool IsUrlRoutingPagePinned(content::WebContents* contents);
void RegisterUrlRoutingPrefs(PrefRegistrySimple* registry);
base::DictValue RunUrlRoutingCommand(Profile* profile, const base::DictValue& request);
// Returns an empty dictionary if no enabled rule matches. Never sends traffic.
base::DictValue ResolveUrlRouting(Profile* profile, const GURL& url);
base::ListValue UrlRoutingReferences(Profile* profile, const std::string& container_id);
}  // namespace ecom
#endif
