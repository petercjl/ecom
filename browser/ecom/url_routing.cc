// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/url_routing.h"
#include <algorithm>
#include <limits>
#include <memory>
#include <set>
#include "base/feature_list.h"
#include "base/json/json_writer.h"
#include "base/uuid.h"
#include "base/supports_user_data.h"
#include "brave/browser/ecom/shop_container_service.h"
#include "brave/browser/ecom/url_routing_rules.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/common/features.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/profiles/profile.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/web_contents.h"
#include "url/gurl.h"

namespace ecom {
namespace {
constexpr char kPinned[] = "ecom.url-routing.pinned-page";
class PinnedPage final : public base::SupportsUserData::Data {};
std::string Text(const base::DictValue& value, const char* key) {
  const auto* text = value.FindString(key);
  return text ? *text : std::string();
}
base::DictValue Error(const char* code) {
  return base::DictValue().Set("ok", false).Set("schemaVersion", 1)
      .Set("error", base::DictValue().Set("code", code).Set("executed", false));
}
bool TargetExists(Profile* profile, const std::string& id) {
  return !id.empty() && !!containers::GetContainerFromPrefs(*profile->GetPrefs(), id);
}
base::DictValue State(Profile* profile) {
  auto state = profile->GetPrefs()->GetDict(kUrlRoutingPref).Clone();
  auto* rules = state.FindList("rules");
  if (rules) for (auto& value : *rules) {
    if (!value.is_dict()) continue;
    auto& rule = value.GetDict();
    const auto id = Text(rule, "containerId");
    rule.Set("urlTransform", GetUrlRoutingTransform(rule));
    rule.Set("targetState", id.empty() ? "unassigned" : TargetExists(profile, id) ? "available" : "missing");
  }
  base::ListValue choices;
  for (const auto& c : containers::GetContainersFromPrefs(*profile->GetPrefs()))
    choices.Append(base::DictValue().Set("id", c->id).Set("name", c->name)
        .Set("color", static_cast<int>(c->background_color)));
  return base::DictValue().Set("ok", true).Set("schemaVersion", 1)
      .Set("protocolVersion", 1)
      .Set("urlTransformProtocol", 1)
      .Set("configuration", std::move(state))
      .Set("containers", std::move(choices));
}
}  // namespace

void RegisterUrlRoutingPrefs(PrefRegistrySimple* registry) {
  registry->RegisterDictionaryPref(kUrlRoutingPref, DefaultUrlRoutingConfig());
}

void PinUrlRoutingPage(content::WebContents* contents) {
  contents->SetUserData(kPinned, std::make_unique<PinnedPage>());
}
bool IsUrlRoutingPagePinned(content::WebContents* contents) {
  return contents && contents->GetUserData(kPinned);
}

base::DictValue ResolveUrlRouting(
    Profile* profile,
    const GURL& url,
    std::optional<std::string_view> source_container_id) {
  if (!profile || !profile->IsRegularProfile() ||
      !base::FeatureList::IsEnabled(containers::features::kContainers)) {
    return {};
  }
  const auto& config = profile->GetPrefs()->GetDict(kUrlRoutingPref);
  const bool allow_merchant_only_rules =
      !source_container_id ||
      IsMerchantShopContainer(profile, *source_container_id);
  const auto* rule =
      FindUrlRoutingRule(config, url, allow_merchant_only_rules);
  if (!rule) return {};
  const auto target = Text(*rule, "containerId");
  auto result = base::DictValue().Set("ruleId", Text(*rule, "id"))
      .Set("containerId", target).Set("available", TargetExists(profile, target));
  if (IsMerchantOnlyUrlRoutingRule(*rule)) {
    result.Set("sourceScope", "merchant");
  }
  const auto destination = TransformUrlRoutingDestination(*rule, url);
  if (!destination.is_valid()) {
    result.Set("destinationError", "INVALID_ROUTING_PRODUCT_ID");
  } else if (destination != url) {
    const auto* destination_rule =
        FindUrlRoutingRule(config, destination,
                           IsMerchantShopContainer(profile, target));
    if (destination_rule && Text(*destination_rule, "containerId") != target) {
      result.Set("destinationError", "ROUTING_TRANSFORM_CONFLICT");
    } else {
      result.Set("destinationUrl", destination.spec());
    }
  }
  if (IsMerchantOnlyUrlRoutingRule(*rule) &&
      GetUrlRoutingTransform(*rule) == "taobao-tmall-product" &&
      !GetTaobaoProductId(destination).empty() &&
      IsTaobaoBuyerContainer(profile, target) &&
      !result.contains("destinationError")) {
    result.Set("openMode", "buyer-product-search");
  }
  return result;
}

base::ListValue UrlRoutingReferences(Profile* profile, const std::string& id) {
  base::ListValue refs;
  const auto* rules = profile->GetPrefs()->GetDict(kUrlRoutingPref).FindList("rules");
  if (rules) for (const auto& value : *rules) {
    if (!value.is_dict() || Text(value.GetDict(), "containerId") != id) continue;
    refs.Append(base::DictValue().Set("id", Text(value.GetDict(), "id"))
        .Set("name", Text(value.GetDict(), "name"))
        .Set("enabled", value.GetDict().FindBool("enabled").value_or(false)));
  }
  return refs;
}

base::DictValue RunUrlRoutingCommand(Profile* profile, const base::DictValue& request) {
  if (!profile || !profile->IsRegularProfile() ||
      !base::FeatureList::IsEnabled(containers::features::kContainers))
    return Error("ROUTING_UNAVAILABLE");
  const auto method = Text(request, "method");
  const auto& saved = profile->GetPrefs()->GetDict(kUrlRoutingPref);
  if (method == "routing.list") return State(profile);
  if (method == "routing.test") {
    const auto text = Text(request, "url");
    const GURL url(text);
    if (text.size() > 8192 || !url.is_valid() || !url.SchemeIsHTTPOrHTTPS() ||
        url.has_username() || url.has_password()) return Error("INVALID_ROUTING_URL");
    auto result = State(profile);
    base::ListValue matches;
    if (const auto* rules = saved.FindList("rules")) for (const auto& value : *rules) {
      if (!value.is_dict()) continue;
      const auto& rule = value.GetDict();
      if (const auto* conditions = rule.FindList("conditions")) {
        for (size_t i = 0; i < conditions->size(); ++i) {
          const auto& c = (*conditions)[i];
          if (c.is_dict() && UrlRoutingConditionMatches(c.GetDict(), url)) {
            matches.Append(base::DictValue().Set("ruleId", Text(rule, "id"))
                .Set("name", Text(rule, "name")).Set("conditionIndex", static_cast<int>(i))
                .Set("enabled", rule.FindBool("enabled").value_or(false))
                .Set("containerId", Text(rule, "containerId")));
            break;
          }
        }
      }
    }
    result.Set("matches", std::move(matches));
    auto resolution = ResolveUrlRouting(profile, url, std::nullopt);
    resolution.Set("matched", !resolution.empty());
    result.Set("resolution", std::move(resolution));
    result.Set("networkRequests", 0);
    return result;
  }
  if (method != "routing.save" && method != "routing.delete" &&
      method != "routing.reorder" && method != "routing.set-enabled")
    return Error("UNKNOWN_ROUTING_COMMAND");
  if (request.FindInt("expectedRevision") != saved.FindInt("revision"))
    return Error("ROUTING_REVISION_CONFLICT");
  auto next = saved.Clone();
  auto* rules = next.FindList("rules");
  if (!rules) return Error("INVALID_ROUTING_CONFIGURATION");
  std::string affected;
  if (method == "routing.set-enabled") {
    const auto* enabled = request.Find("enabled");
    if (!enabled || !enabled->is_bool()) return Error("INVALID_ARGUMENT");
    next.Set("enabled", enabled->GetBool());
  } else if (method == "routing.save") {
    const auto* input = request.FindDict("rule");
    if (!input) return Error("INVALID_ROUTING_RULE");
    auto rule = input->Clone();
    rule.Remove("targetState");
    auto error = NormalizeUrlRoutingRule(rule);
    if (!error.empty()) return Error(error.c_str());
    const auto container = Text(rule, "containerId");
    if (!container.empty() && !TargetExists(profile, container)) return Error("TARGET_CONTAINER_MISSING");
    affected = Text(rule, "id");
    if (affected.empty()) {
      if (rules->size() >= 100) return Error("ROUTING_RULE_LIMIT");
      affected = base::Uuid::GenerateRandomV4().AsLowercaseString();
      rule.Set("id", affected);
      rules->Append(std::move(rule));
    } else {
      bool found = false;
      for (auto& value : *rules) if (value.is_dict() && Text(value.GetDict(), "id") == affected) {
        value = base::Value(std::move(rule)); found = true; break;
      }
      if (!found) return Error("ROUTING_RULE_NOT_FOUND");
    }
  } else if (method == "routing.delete") {
    affected = Text(request, "ruleId");
    const auto count = rules->size();
    rules->EraseIf([&](const auto& v) {return v.is_dict() && Text(v.GetDict(), "id") == affected;});
    if (rules->size() == count) return Error("ROUTING_RULE_NOT_FOUND");
  } else {
    const auto* order = request.FindList("ruleIds");
    if (!order || order->size() != rules->size()) return Error("INVALID_ROUTING_ORDER");
    base::ListValue ordered; std::set<std::string> seen;
    for (const auto& id : *order) {
      if (!id.is_string() || !seen.insert(id.GetString()).second) return Error("INVALID_ROUTING_ORDER");
      bool found = false;
      for (const auto& v : *rules) if (v.is_dict() && Text(v.GetDict(), "id") == id.GetString()) {
        ordered.Append(v.Clone()); found = true; break;
      }
      if (!found) return Error("INVALID_ROUTING_ORDER");
    }
    next.Set("rules", std::move(ordered));
  }
  const int revision = saved.FindInt("revision").value_or(0);
  if (revision == std::numeric_limits<int>::max()) return Error("ROUTING_REVISION_LIMIT");
  next.Set("revision", revision + 1);
  const auto serialized = base::WriteJson(next);
  if (!serialized || serialized->size() > 256 * 1024)
    return Error("ROUTING_CONFIGURATION_TOO_LARGE");
  profile->GetPrefs()->SetDict(kUrlRoutingPref, std::move(next));
  auto result = State(profile);
  result.Set("executed", true);
  if (!affected.empty()) result.Set("ruleId", affected);
  return result;
}
}  // namespace ecom
