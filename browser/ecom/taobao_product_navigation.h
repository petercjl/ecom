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

// Loads the product outside the tab strip and inserts the finished page only.
void StartTaobaoProductNavigation(BrowserWindowInterface* window,
                                  content::WebContents* anchor,
                                  const GURL& short_url,
                                  const std::string& container,
                                  bool foreground,
                                  bool close_initial_blank);

}  // namespace ecom
#endif  // BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
