// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
#define BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_

#include <string>
#include <cstdint>
#include "base/functional/callback_forward.h"

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
                                  const std::string& container,
                                  bool replace_source = false);
// Observes the normal merchant navigation without delaying it or fetching a
// second copy. Only an explicit platform other-shop verdict invokes the route.
void ObserveMerchantProductNavigation(content::WebContents* source,
                                     const GURL& product_url,
                                     int64_t navigation_id,
                                     base::OnceClosure route_other_shop);
bool IsTaobaoProductNavigationPending(content::WebContents* contents);

}  // namespace ecom
#endif  // BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
