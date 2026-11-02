// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#include "brave/browser/ecom/shop_identity_parser.h"

#include "testing/gtest/include/gtest/gtest.h"

namespace ecom {
TEST(ShopIdentityParser, PersonalViewProjectsOnlyVerifiedIdentityFields) {
  auto result = ParsePersonalViewShopIdentity(
      R"({"code":0,"data":{"runAsShopId":"12345","loginUserId":67890,"runAsShopTitle":"示例店铺","secret":"fixture-excluded"}})");
  ASSERT_TRUE(result);
  EXPECT_EQ(*result->FindString("shopId"), "12345");
  EXPECT_EQ(*result->FindString("accountId"), "67890");
  EXPECT_EQ(*result->FindString("platformName"), "示例店铺");
  EXPECT_EQ(result->size(), 3u);
}

TEST(ShopIdentityParser, BusinessFailureOrIncompleteIdentityIsRejected) {
  for (const auto* json : {
           R"({"code":5810,"data":{"runAsShopId":123,"loginUserId":456,"runAsShopTitle":"示例"}})",
           R"({"data":{"runAsShopId":123,"loginUserId":456,"runAsShopTitle":"示例"}})",
           R"({"code":0,"data":{"runAsShopId":"0","loginUserId":456,"runAsShopTitle":"示例"}})",
           R"({"code":0,"data":{"runAsShopId":"12x","loginUserId":456,"runAsShopTitle":"示例"}})",
           R"({"code":0,"data":{"runAsShopId":123,"loginUserId":9007199254740992,"runAsShopTitle":"示例"}})",
           R"({"code":0,"data":{"runAsShopId":123,"loginUserId":456,"runAsShopTitle":"   "}})",
           R"({"code":0,"data":{"runAsShopId":123,"loginUserId":456,"runAsShopTitle":"name\ncontrol"}})",
           R"({"code":0,"data":{"runAsShopId":123,"loginUserId":-1,"runAsShopTitle":"示例"}})",
           R"({"code":0,"data":{"loginUserId":456,"runAsShopTitle":"示例"}})",
           R"({"code":0,"data":[]})", "not JSON"}) {
    EXPECT_FALSE(ParsePersonalViewShopIdentity(json)) << json;
  }
}

TEST(ShopIdentityParser, EmbeddedFormatUsesSameWhitelistedIdentityContract) {
  auto result = ParseEmbeddedShopIdentity(
      R"(<script>window.metaCacheData={"runAsShopId":123,"mainUserId":"456","runAsUserName":"示例店铺","cookie":"fixture-excluded"};</script>)");
  ASSERT_TRUE(result);
  EXPECT_EQ(*result->FindString("accountId"), "456");
  EXPECT_EQ(result->size(), 3u);
  EXPECT_FALSE(ParseEmbeddedShopIdentity(
      R"(<script>window.metaCacheData=loadSomething();</script>)"));
}

TEST(ShopIdentityParser, TokenIsConfinedToActualMicrodataMetaAttribute) {
  auto first = ExtractSycmLegalityToken(
      R"(<meta name="microdata" content="loginUserId=123;legalityToken=fixture-token;runAsUserId=123">)");
  ASSERT_TRUE(first);
  EXPECT_EQ(*first, "fixture-token");
  EXPECT_EQ(ExtractSycmLegalityToken(
                R"(<meta name="microdata" content="legalityToken=fixture-token==;loginUserId=123">)"),
            std::optional<std::string>("fixture-token"));
  EXPECT_EQ(ExtractSycmLegalityToken(
                R"(<meta name="microdata" content="legalityToken=fixture%2Btoken%3D">)"),
            std::optional<std::string>("fixture%2Btoken%3D"));
  auto second = ExtractSycmLegalityToken(
      R"(<META content='legalityToken=fixture&#45;token' NAME=microdata >)");
  ASSERT_TRUE(second);
  EXPECT_EQ(*second, "fixture-token");
  EXPECT_EQ(ExtractSycmLegalityToken(
                R"(<meta name="microdata" content="legalityToken=fixture&#x2D;token">)"),
            std::optional<std::string>("fixture-token"));
  for (const auto* html : {
           R"(<script>const legalityToken="fixture";</script>)",
           R"(<meta name="other" content="legalityToken=fixture">)",
           R"(<meta data-name="microdata" content="legalityToken=fixture">)",
           R"(<meta name="microdata" content="legalityToken=">)",
           R"(<meta name="microdata" content="legalityToken=null">)",
           R"(<meta name="microdata" content="legalityToken=first;legalityToken=second">)",
           R"(<meta name="microdata" content="legalityToken=first"><meta name="microdata" content="legalityToken=second">)",
           R"(<meta name="microdata" content="legalityToken=fixture&#10;token">)"}) {
    EXPECT_FALSE(ExtractSycmLegalityToken(html)) << html;
  }
  EXPECT_FALSE(ExtractSycmLegalityToken(
      R"(<meta name="microdata" content="legalityToken=fixture&amp;#45;token">)"));
  EXPECT_FALSE(ExtractSycmLegalityToken(
      "<meta name='microdata' content='legalityToken=" +
      std::string(1025, 'x') + "'>"));
}
TEST(ShopIdentityParser, ErrorDiagnosticsRetainExplanationAndRedactCredentials) {
  EXPECT_EQ(RedactIdentityError("请求方式必须是 POST", "fixture"),
            "请求方式必须是 POST");
  const auto safe = RedactIdentityError(
      "error token=short; detail tiny; key abcdefghijklmnop; id 123456789; "
      "url https://example.com/private?token=secret", "tiny");
  for (const auto* secret : {"short", "tiny", "abcdefghijklmnop", "123456789",
                             "example.com", "secret"}) {
    EXPECT_EQ(safe.find(secret), std::string::npos);
  }
  EXPECT_EQ(RedactIdentityError(std::string(601, 'x'), ""),
            "IDENTITY_RESPONSE_ERROR");
}
}  // namespace ecom
