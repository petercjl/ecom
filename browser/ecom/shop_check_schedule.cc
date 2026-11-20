// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/shop_check_schedule.h"

namespace ecom {
base::TimeDelta ShopCheckInterval(std::string_view state, bool manager_refresh) {
  if (state == "login-required" || state == "identity-mismatch") {
    return base::Hours(2);
  }
  if (state == "verification-required") {
    return base::Minutes(30);
  }
  return manager_refresh ? base::Minutes(5) : base::Minutes(15);
}

bool IsShopCheckDue(std::string_view state, base::Time last_check,
                    base::Time now, bool manager_refresh, bool force,
                    base::TimeDelta stagger) {
  if (force || last_check.is_null() || last_check > now) {
    return true;
  }
  return now - last_check >= ShopCheckInterval(state, manager_refresh) +
                                (manager_refresh ? base::TimeDelta() : stagger);
}
}  // namespace ecom
