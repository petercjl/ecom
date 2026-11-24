// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_URL_ROUTING_H_
#define BRAVE_BROWSER_ECOM_URL_ROUTING_H_
#include <optional>
#include <string>
#include <string_view>
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
// A URL-only preview includes rules conditional on a merchant source.
// Pass the actual container for navigation, using an empty ID for default tabs.
base::DictValue ResolveUrlRouting(
    Profile* profile,
    const GURL& url,
    std::optional<std::string_view> source_container_id);
base::ListValue UrlRoutingReferences(Profile* profile, const std::string& container_id);
}  // namespace ecom
#endif
