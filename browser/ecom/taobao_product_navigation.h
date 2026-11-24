// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
#define BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_

#include <string>

class BrowserWindowInterface;
class GURL;
namespace content {
class WebContents;
}

namespace ecom {

// Shows a loading tab and replaces it once the hidden buyer page is ready.
void StartTaobaoProductNavigation(BrowserWindowInterface* window,
                                  content::WebContents* source,
                                  const GURL& short_url,
                                  const std::string& container);
bool IsTaobaoProductNavigationPending(content::WebContents* contents);

}  // namespace ecom
#endif  // BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
