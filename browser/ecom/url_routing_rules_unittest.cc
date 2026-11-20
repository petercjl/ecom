// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/url_routing_rules.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"

namespace ecom {
TEST(UrlRoutingRules, ExampleIsDisabledUnassignedAndEditable) {
  auto config = DefaultUrlRoutingConfig();
  auto& rule = config.FindList("rules")->front().GetDict();
  EXPECT_FALSE(rule.FindBool("enabled").value());
  EXPECT_TRUE(rule.FindString("containerId")->empty());
  EXPECT_EQ(rule.FindList("conditions")->size(), 2u);
  EXPECT_EQ(FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?id=1")), nullptr);
  EXPECT_TRUE(NormalizeUrlRoutingRule(rule).empty());
  rule.Set("enabled", true);
  EXPECT_EQ(NormalizeUrlRoutingRule(rule), "TARGET_CONTAINER_REQUIRED");
  rule.Set("containerId", "user-selected-id");
  EXPECT_TRUE(NormalizeUrlRoutingRule(rule).empty());
  EXPECT_NE(FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?x=2&id=1#image")), nullptr);
  config.Set("enabled", false);
  EXPECT_EQ(FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?id=1")), nullptr);
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
  EXPECT_EQ(*FindUrlRoutingRule(config, GURL("https://item.taobao.com/item.htm?id=1"))->FindString("containerId"), "buyer");
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
}  // namespace ecom
