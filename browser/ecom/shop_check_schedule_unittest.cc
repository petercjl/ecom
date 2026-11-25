// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/shop_check_schedule.h"

#include "testing/gtest/include/gtest/gtest.h"

namespace ecom {
TEST(ShopCheckSchedule, BackgroundAndManagerUseDifferentFreshnessThresholds) {
  const auto checked = base::Time::FromSecondsSinceUnixEpoch(100000);
  EXPECT_FALSE(IsShopCheckDue("ready", checked, checked + base::Minutes(14),
                             false, false, base::TimeDelta()));
  EXPECT_TRUE(IsShopCheckDue("ready", checked, checked + base::Minutes(15),
                            false, false, base::TimeDelta()));
  EXPECT_FALSE(IsShopCheckDue("signed-in", checked, checked + base::Minutes(4),
                             true, false, base::TimeDelta()));
  EXPECT_TRUE(IsShopCheckDue("signed-in", checked, checked + base::Minutes(5),
                            true, false, base::TimeDelta()));
  EXPECT_FALSE(IsShopCheckDue("ready", checked, checked + base::Minutes(15),
                             false, false, base::Seconds(45)));
  EXPECT_TRUE(IsShopCheckDue("ready", checked,
                            checked + base::Minutes(15) + base::Seconds(45),
                            false, false, base::Seconds(45)));
}
TEST(ShopCheckSchedule, PageRevisitsRespectFailuresAndExplicitRefreshCanRecover) {
  const auto checked = base::Time::FromSecondsSinceUnixEpoch(100000);
  for (const auto* state : {"verification-required", "identity-mismatch"}) {
    EXPECT_FALSE(IsShopCheckDue(state, checked, checked + base::Minutes(20),
                               true, false, base::TimeDelta()));
    EXPECT_TRUE(IsShopCheckDue(state, checked, checked + base::Minutes(1),
                              true, true, base::TimeDelta()));
  }
  EXPECT_EQ(ShopCheckInterval("verification-required", false), base::Minutes(30));
  EXPECT_TRUE(IsShopCheckDue("ready", base::Time(), checked, false, false,
                            base::TimeDelta()));
  EXPECT_TRUE(IsShopCheckDue("ready", checked + base::Hours(1), checked,
                            false, false, base::TimeDelta()));
}

TEST(ShopCheckSchedule, ReturningToManagerRechecksStaleSignOut) {
  const auto checked = base::Time::FromSecondsSinceUnixEpoch(100000);
  EXPECT_FALSE(IsShopCheckDue("login-required", checked,
                              checked + base::Minutes(4), true, false, {}));
  EXPECT_TRUE(IsShopCheckDue("login-required", checked,
                             checked + base::Minutes(5), true, false, {}));
  EXPECT_FALSE(IsShopCheckDue("login-required", checked,
                              checked + base::Minutes(119), false, false, {}));
  EXPECT_TRUE(IsShopCheckDue("login-required", checked,
                             checked + base::Hours(2), false, false, {}));
}
}  // namespace ecom
