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
                                  bool replace_source = false,
                                  bool require_search = false);
// Offers manual recovery on incomplete product pages. Automatic routing is
// reserved for a merchant navigation with an explicit platform denial.
void ObserveTaobaoProductNavigation(content::WebContents* source,
                                    const GURL& product_url,
                                    int64_t navigation_id,
                                    bool auto_route_other_shop,
                                    base::OnceCallback<void(bool)> route);
bool IsTaobaoProductNavigationPending(content::WebContents* contents);

}  // namespace ecom
#endif  // BRAVE_BROWSER_ECOM_TAOBAO_PRODUCT_NAVIGATION_H_
