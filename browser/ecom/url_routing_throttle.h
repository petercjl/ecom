// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_URL_ROUTING_THROTTLE_H_
#define BRAVE_BROWSER_ECOM_URL_ROUTING_THROTTLE_H_
#include "content/public/browser/navigation_throttle.h"
namespace content { class NavigationThrottleRegistry; }
namespace ecom {
class UrlRoutingThrottle final : public content::NavigationThrottle {
 public:
  explicit UrlRoutingThrottle(content::NavigationThrottleRegistry& registry);
  static void MaybeCreateAndAdd(content::NavigationThrottleRegistry& registry);
  ThrottleCheckResult WillStartRequest() override;
  ThrottleCheckResult WillRedirectRequest() override;
  const char* GetNameForLogging() override;
 private:
  ThrottleCheckResult Route();
};
}  // namespace ecom
#endif
