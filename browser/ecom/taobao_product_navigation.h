// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
#define BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_

#include <string>

class GURL;
namespace content {
class WebContents;
}

namespace ecom {

// Continues a routed product navigation in its already selected buyer tab.
void StartTaobaoProductNavigation(content::WebContents* contents,
                                  const GURL& short_url,
                                  const std::string& container,
                                  bool foreground);

}  // namespace ecom
#endif  // BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
