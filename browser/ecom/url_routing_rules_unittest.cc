// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/url_routing_rules.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"

namespace ecom {
TEST(UrlRoutingRules, MerchantProductVerdictRequiresTrustedExplicitOtherShopPage) {
  const std::string item = "123";
  const GURL product("https://detail.tmall.com/item.htm?id=123");
  const GURL verdict("https://bixi.alicdn.com/punish/punish:resource:template:CDCBusinessDataSecuritySpace:example.html");
  base::DictValue page;
  page.Set("otherShop", true).Set("accessDeniedPage", true);
  EXPECT_TRUE(IsOtherShopProductVerdict(product, item, page));
  EXPECT_TRUE(IsOtherShopProductVerdict(verdict, item, page));
  for (const char* bad : {"https://detail.tmall.com/item.htm?id=456",
       "https://login.taobao.com/member/login.jhtml",
       "https://bixi.alicdn.com.evil.test/punish/punish:resource:template:CDCBusinessDataSecuritySpace:x",
       "https://bixi.alicdn.com/unrelated.html",
       "http://bixi.alicdn.com/punish/punish:resource:template:CDCBusinessDataSecuritySpace:x"})
    EXPECT_FALSE(IsOtherShopProductVerdict(GURL(bad), item, page));
  EXPECT_FALSE(IsOtherShopProductVerdict(verdict, "", page));
  page.Set("verification", true);
  EXPECT_FALSE(IsOtherShopProductVerdict(verdict, item, page));
  page.Set("verification", false).Set("gallery", true);
  EXPECT_FALSE(IsOtherShopProductVerdict(product, item, page));
  page.Set("gallery", false).Set("otherShop", false);
  EXPECT_FALSE(IsOtherShopProductVerdict(verdict, item, page));
  page.Set("otherShop", true).Set("accessDeniedPage", false);
  EXPECT_FALSE(IsOtherShopProductVerdict(product, item, page));
}
TEST(UrlRoutingRules, ExampleIsDisabledUnassignedAndEditable) {
  auto config = DefaultUrlRoutingConfig();
  auto& rule = config.FindList("rules")->front().GetDict();
  EXPECT_FALSE(rule.FindBool("enabled").value());
  EXPECT_TRUE(rule.FindString("containerId")->empty());
  EXPECT_EQ(rule.FindList("conditions")->size(), 2u);
  EXPECT_EQ(FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?id=1"), true), nullptr);
  EXPECT_TRUE(NormalizeUrlRoutingRule(rule).empty());
  rule.Set("enabled", true);
  EXPECT_EQ(NormalizeUrlRoutingRule(rule), "TARGET_CONTAINER_REQUIRED");
  rule.Set("containerId", "user-selected-id");
  EXPECT_TRUE(NormalizeUrlRoutingRule(rule).empty());
  EXPECT_NE(FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?x=2&id=1#image"), true), nullptr);
  config.Set("enabled", false);
  EXPECT_EQ(FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?id=1"), true), nullptr);
}
TEST(UrlRoutingRules, BuiltInProductRuleRequiresMerchantSource) {
  auto config = DefaultUrlRoutingConfig();
  auto& rule = config.FindList("rules")->front().GetDict();
  rule.Set("enabled", true);
  rule.Set("containerId", "buyer");
  const GURL product("https://detail.tmall.com/item.htm?id=1&skuId=2");

  EXPECT_EQ(FindUrlRoutingRule(config, product, false), nullptr);
  EXPECT_EQ(FindUrlRoutingRule(config, product, true), &rule);

  auto custom = rule.Clone();
  custom.Set("id", "custom");
  config.FindList("rules")->Append(std::move(custom));
  const auto* result = FindUrlRoutingRule(config, product, false);
  ASSERT_TRUE(result);
  EXPECT_EQ(*result->FindString("id"), "custom");
}

TEST(UrlRoutingRules, HostPathAndQueryBoundaries) {
  auto config = DefaultUrlRoutingConfig();
  const auto& c = config.FindList("rules")->front().GetDict().FindList("conditions")->front().GetDict();
  for (const char* url : {"https://item.taobao.com/item.htm?id=123", "http://ITEM.TAOBAO.COM/item.htm?a=b&id=3", "https://item.taobao.com/item.htm?id=&id=4", "https://item.taobao.com./item.htm?%69d=1"})
    EXPECT_TRUE(UrlRoutingConditionMatches(c, GURL(url))) << url;
  for (const char* url : {"https://item.taobao.com.example.org/item.htm?id=1", "https://example.org/?url=https://item.taobao.com/item.htm&id=1", "https://item.taobao.com/item.html?id=1", "https://item.taobao.com/item.htm?id=", "https://item.taobao.com/item.htm?other=1", "https://user:secret@item.taobao.com/item.htm?id=1", "https://sub.item.taobao.com/item.htm?id=1"})
    EXPECT_FALSE(UrlRoutingConditionMatches(c, GURL(url))) << url;
}
TEST(UrlRoutingRules, ExactFragmentsSubdomainsAndPriority) {
  auto config = DefaultUrlRoutingConfig();
  auto& rule = config.FindList("rules")->front().GetDict();
  rule.Set("enabled", true);
  rule.Set("containerId", "buyer");
  auto copy = rule.Clone(); copy.Set("id", "second"); copy.Set("containerId", "other");
  config.FindList("rules")->Append(std::move(copy));
  EXPECT_EQ(*FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?id=1"), true)->FindString("containerId"), "buyer");
  base::DictValue exact;
  exact.Set("type", "exact"); exact.Set("url", "https://example.org/a?q=1#old");
  EXPECT_TRUE(UrlRoutingConditionMatches(exact, GURL("https://example.org/a?q=1#new")));
  EXPECT_FALSE(UrlRoutingConditionMatches(exact, GURL("https://example.org/a?q=2")));
  auto& c = config.FindList("rules")->front().GetDict().FindList("conditions")->front().GetDict();
  c.Set("includeSubdomains", true); c.Set("path", "/item.*");
  EXPECT_TRUE(UrlRoutingConditionMatches(c, GURL("https://sub.item.taobao.com/item.htm?id=1")));
}
TEST(UrlRoutingRules, RejectAmbiguousInputsAndRequireAllPredicates) {
  auto config = DefaultUrlRoutingConfig();
  auto rule = config.FindList("rules")->front().GetDict().Clone();
  for (const char* host : {"item.taobao.com/path", "user@item.taobao.com", "*.taobao.com", "item.taobao.com:443"}) {
    auto invalid = rule.Clone();
    invalid.FindList("conditions")->front().GetDict().Set("host", host);
    EXPECT_FALSE(NormalizeUrlRoutingRule(invalid).empty()) << host;
  }
  auto& c = rule.FindList("conditions")->front().GetDict();
  c.FindList("query")->Append(base::DictValue().Set("name", "kind").Set("operator", "equals").Set("value", "a b"));
  EXPECT_TRUE(UrlRoutingConditionMatches(c, GURL("https://item.taobao.com/item.htm?kind=a%20b&id=1")));
  EXPECT_FALSE(UrlRoutingConditionMatches(c, GURL("https://item.taobao.com/item.htm?id=1&kind=c")));
}
TEST(UrlRoutingRules, ProductDestinationKeepsExactlyOneNumericId) {
  auto config = DefaultUrlRoutingConfig();
  auto& rule = config.FindList("rules")->front().GetDict();
  // A previously configured built-in example can lack the new option.
  rule.Remove("urlTransform");
  const GURL source(
      "https://detail.tmall.com/item.htm?id=615357766740"
      "&mi_id=fixture&b_s_f=sycm&spm=fixture#details");
  EXPECT_EQ(TransformUrlRoutingDestination(rule, source),
            GURL("https://detail.tmall.com/item.htm?id=615357766740"));
  EXPECT_EQ(TransformUrlRoutingDestination(
                rule, GURL("http://item.taobao.com/item.htm?%69d=%31&other=2")),
            GURL("https://item.taobao.com/item.htm?id=1"));
  for (const char* url : {
           "https://detail.tmall.com/item.htm?id=1&%69d=2",
           "https://detail.tmall.com/item.htm?id=1&id=1",
           "https://detail.tmall.com/item.htm?id=%2B2",
           "https://detail.tmall.com/item.htm?missing=1",
           "https://detail.tmall.com:444/item.htm?id=1"}) {
    EXPECT_FALSE(TransformUrlRoutingDestination(rule, GURL(url)).is_valid())
        << url;
  }
  for (const char* url : {
           "https://detail.tmall.com.example.org/item.htm?id=1&other=2",
           "https://detail.tmall.com/login.htm?id=1&other=2"}) {
    EXPECT_EQ(TransformUrlRoutingDestination(rule, GURL(url)), GURL(url));
  }
  rule.Set("urlTransform", "none");
  EXPECT_EQ(TransformUrlRoutingDestination(rule, source), source);
  rule.Set("urlTransform", "unknown");
  EXPECT_EQ(NormalizeUrlRoutingRule(rule), "INVALID_ROUTING_TRANSFORM");
}

TEST(UrlRoutingRules, ExactProductMatchUsesOnlyTrustedSearchLinks) {
  base::ListValue links;
  links.Append("https://item.taobao.com.example.org/item.htm?id=913102520132");
  links.Append("https://item.taobao.com/item.htm?id=913102520132&id=2");
  links.Append("https://detail.tmall.com/item.htm?id=2");
  links.Append("https://mclick.simba.taobao.com/cc_im?id=2");
  EXPECT_FALSE(FindTaobaoSearchProductLink(links, "913102520132").is_valid());

  const GURL redirect(
      "https://mclick.simba.taobao.com/cc_im?id=913102520132&spm=sample");
  links.Append(redirect.spec());
  EXPECT_EQ(FindTaobaoSearchProductLink(links, "913102520132"), redirect);

  const GURL direct(
      "https://detail.tmall.com/item.htm?skuId=3&id=913102520132");
  links.Append(direct.spec());
  EXPECT_EQ(FindTaobaoSearchProductLink(links, "913102520132"), direct);
  EXPECT_EQ(GetTaobaoProductId(direct), "913102520132");
  EXPECT_TRUE(GetTaobaoProductId(redirect).empty());
}
}  // namespace ecom
