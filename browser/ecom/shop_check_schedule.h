// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_SHOP_CHECK_SCHEDULE_H_
#define BRAVE_BROWSER_ECOM_SHOP_CHECK_SCHEDULE_H_

#include <string_view>

#include "base/time/time.h"

namespace ecom {
base::TimeDelta ShopCheckInterval(std::string_view state, bool manager_refresh);
bool IsShopCheckDue(std::string_view state, base::Time last_check,
                    base::Time now, bool manager_refresh, bool force,
                    base::TimeDelta stagger);
}  // namespace ecom
#endif  // BRAVE_BROWSER_ECOM_SHOP_CHECK_SCHEDULE_H_
