#include "brave/browser/ecom/shop_container_service.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <utility>

#include "base/base64.h"
#include "base/feature_list.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/stringprintf.h"
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "base/uuid.h"
#include "base/values.h"
#include "brave/browser/ecom/business_read_service.h"
#include "brave/browser/ecom/container_password_store.h"
#include "brave/browser/ecom/shop_identity_parser.h"
#include "brave/browser/ecom/shop_manager_ui.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/containers_settings_handler.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/common/features.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/embedder_support/user_agent_utils.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
#include "components/os_crypt/async/common/encryptor.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/storage_partition.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "net/base/load_flags.h"
#include "net/base/net_errors.h"
#include "net/cookies/canonical_cookie.h"
#include "net/cookies/cookie_access_result.h"
#include "net/cookies/cookie_options.h"
#include "net/cookies/cookie_partition_key_collection.h"
#include "net/cookies/site_for_cookies.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "net/url_request/redirect_info.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/cookie_manager.mojom.h"
#include "services/network/public/mojom/fetch_api.mojom.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "third_party/re2/src/re2/re2.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"
#include "url/origin.h"

namespace ecom {
namespace {
using Reply = base::OnceCallback<void(std::string)>;
constexpr char kServiceKey[] = "ecom.shop.service";
constexpr char kHome[] = "https://sycm.taobao.com/portal/home.htm";
base::DictValue Error(std::string code) {
  return base::DictValue()
      .Set("ok", false)
      .Set("schemaVersion", 1)
      .Set("error", base::DictValue().Set("code", code));
}
void Send(Reply callback, base::DictValue value) {
  value.Set("schemaVersion", 1);
  std::move(callback).Run(base::WriteJson(value).value_or("{}"));
}
std::string Field(const base::DictValue& value, const char* key) {
  const auto* text = value.FindString(key);
  return text ? *text : std::string();
}

struct PlatformDefinition {
  const char* id;
  const char* name;
  const char* entry;
};
constexpr std::array<PlatformDefinition, 6> kPlatforms = {{
    {"taobao", "淘宝 / 天猫", "https://sycm.taobao.com/portal/home.htm"},
    {"douyin", "抖音", "https://fxg.jinritemai.com/"},
    {"pinduoduo", "拼多多", "https://mms.pinduoduo.com/"},
    {"jd", "京东", "https://shop.jd.com/jdm/home"},
    {"xiaohongshu", "小红书", "https://ark.xiaohongshu.com/"},
    {"custom", "自定义", ""},
}};
const PlatformDefinition* Platform(const std::string& id) {
  for (const auto& platform : kPlatforms) {
    if (id == platform.id) {
      return &platform;
    }
  }
  return nullptr;
}
bool SafeEntry(const std::string& text) {
  const GURL url(text);
  return url.is_valid() && url.SchemeIs("https") && url.has_host() &&
         !url.has_username() && !url.has_password();
}
bool ValidPlatform(const base::DictValue& request) {
  const auto id = Field(request, "platform");
  if (request.Find("homeUrl") && !SafeEntry(Field(request, "homeUrl"))) {
    return false;
  }
  if (const auto* type = request.Find("accountType")) {
    if (!type->is_string() ||
        (type->GetString() != "merchant" && type->GetString() != "buyer") ||
        (type->GetString() == "buyer" && id != "taobao")) {
      return false;
    }
  }
  if (!Platform(id)) {
    return false;
  }
  if (id != "custom") {
    return true;
  }
  auto name = Field(request, "customPlatformName");
  base::TrimWhitespaceASCII(name, base::TRIM_ALL, &name);
  return !name.empty() && name.size() <= 120 &&
         SafeEntry(request.FindString("homeUrl") ? Field(request, "homeUrl")
                                                 : Field(request, "entryUrl"));
}
std::string HomeUrl(const base::DictValue& metadata) {
  if (SafeEntry(Field(metadata, "homeUrl"))) {
    return GURL(Field(metadata, "homeUrl")).spec();
  }
  const auto id = Field(metadata, "platform");
  // Preserve the fallback homepage of legacy records without a saved URL.
  if (id == "taobao" && Field(metadata, "accountType") == "buyer") {
    return "https://www.taobao.com/";
  }
  if (id == "custom") {
    return Field(metadata, "entryUrl");
  }
  const auto* platform = Platform(id);
  return platform ? platform->entry : std::string();
}
bool SupportsVerification(const base::DictValue& metadata) {
  return Field(metadata, "platform") == "taobao";
}
bool SamePlatform(const base::DictValue* existing,
                  const base::DictValue& target) {
  if (!existing) {
    return true;
  }
  const auto platform = Field(target, "platform");
  if (Field(*existing, "platform") != platform) {
    return false;
  }
  if (platform != "custom") {
    return true;
  }
  auto name = Field(target, "customPlatformName");
  base::TrimWhitespaceASCII(name, base::TRIM_ALL, &name);
  return Field(*existing, "customPlatformName") == name;
}
int OpenTabCount(Profile* profile, const std::string& id) {
  int count = 0;
  ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
      [&](BrowserWindowInterface* browser) {
        if (browser->GetProfile() == profile) {
          auto* tabs = browser->GetTabStripModel();
          for (int i = 0; tabs && i < tabs->count(); ++i) {
            if (containers::GetContainerIdForWebContents(
                    tabs->GetWebContentsAt(i)) == id) {
              ++count;
            }
          }
        }
        return true;
      });
  return count;
}
bool ApplyAppearance(const base::DictValue& request,
                     containers::mojom::ContainerPtr& container) {
  if (const auto* name = request.FindString("name")) {
    container->name = *name;
    base::TrimWhitespaceASCII(container->name, base::TRIM_ALL,
                              &container->name);
    if (container->name.empty() || container->name.size() > 200) {
      return false;
    }
  }
  if (const auto* icon = request.Find("icon")) {
    if (!icon->is_int() || icon->GetInt() < 0 || icon->GetInt() > 10) {
      return false;
    }
    container->icon = static_cast<containers::mojom::Icon>(icon->GetInt());
  }
  if (const auto* value = request.Find("color")) {
    if (!value->is_string()) {
      return false;
    }
    const auto& color = value->GetString();
    unsigned rgb = 0;
    if (color.size() != 7 || color[0] != '#' ||
        !base::HexStringToUInt(color.substr(1), &rgb)) {
      return false;
    }
    container->background_color = 0xFF000000 | rgb;
  }
  return !containers::ContainersSettingsHandler::
              ValidateEditableContainerProperties(container)
                  .has_value();
}

class ShopService final : public base::SupportsUserData::Data,
                          public ProfileObserver {
 public:
  explicit ShopService(Profile* profile) : profile_(profile) {
    profile_->AddObserver(this);
    timer_.Start(
        FROM_HERE, base::Seconds(60),
        base::BindRepeating(&ShopService::ScheduleChecks, weak_.GetWeakPtr()));
  }
  ~ShopService() override {
    if (profile_) {
      profile_->RemoveObserver(this);
    }
  }
  void OnProfileWillBeDestroyed(Profile*) override {
    timer_.Stop();
    weak_.InvalidateWeakPtrs();
    loaders_.clear();
    profile_->RemoveObserver(this);
    profile_ = nullptr;
  }
  void Run(const base::DictValue& request, Reply callback) {
    const auto method = Field(request, "method");
    if (profile_ && !profile_->IsOffTheRecord() && method == "shops.manage") {
      OpenShopManager(profile_);
      Send(std::move(callback),
           base::DictValue().Set("ok", true).Set("url", kShopManagerURL));
      return;
    }
    if (!profile_ || profile_->IsOffTheRecord() ||
        !base::FeatureList::IsEnabled(containers::features::kContainers) ||
        !profile_->GetPrefs()->GetBoolean(
            containers::prefs::kContainersEnabled)) {
      Send(std::move(callback), Error("CONTAINERS_UNAVAILABLE"));
      return;
    }
    if (method == "shops.platforms") {
      base::ListValue platforms;
      for (const auto& platform : kPlatforms) {
        auto services = base::ListValue();
        if (std::string_view(platform.id) == "taobao") {
          services.Append("qianniu");
          services.Append("sycm");
          services.Append("alimama");
        } else {
          services.Append("home");
        }
        platforms.Append(base::DictValue()
                             .Set("id", platform.id)
                             .Set("name", platform.name)
                             .Set("entryUrl", platform.entry)
                             .Set("services", std::move(services))
                             .Set("automaticVerification",
                                  std::string_view(platform.id) == "taobao"));
      }
      Send(std::move(callback), base::DictValue()
                                    .Set("ok", true)
                                    .Set("platforms", std::move(platforms)));
      return;
    }
    if (method == "shops.refresh") {
      if (request.FindBool("force").value_or(false)) {
        attempts_.clear();
      }
      ScheduleChecks();
      Send(std::move(callback), List());
      return;
    }
    if (method == "shops.list") {
      Send(std::move(callback), List());
      return;
    }
    for (const auto& [key, values] :
         {std::pair<const char*, std::initializer_list<std::string_view>>{
              "browserLanguage", {"inherit", "zh-CN", "zh-TW", "en-US", "en-GB", "ja-JP", "ko-KR", "de-DE", "fr-FR"}},
          {"browserTimezone", {"inherit", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Seoul", "Asia/Singapore", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "UTC"}}}) {
      if (request.Find(key) &&
          std::ranges::find(values, Field(request, key)) == values.end()) {
        Send(std::move(callback), Error("INVALID_BROWSER_ENVIRONMENT"));
        return;
      }
    }
    if (request.Find("webRtcPolicy") &&
        Field(request, "webRtcPolicy") != "inherit" &&
        Field(request, "webRtcPolicy") != "disable-non-proxied-udp") {
      Send(std::move(callback), Error("INVALID_WEBRTC_POLICY"));
      return;
    }
    if (method == "shops.create") {
      auto name = Field(request, "name");
      base::TrimWhitespaceASCII(name, base::TRIM_ALL, &name);
      if (name.empty() || name.size() > 200) {
        Send(std::move(callback), Error("INVALID_SHOP_INPUT"));
        return;
      }
      if (!ValidPlatform(request)) {
        Send(std::move(callback), Error("INVALID_PLATFORM_INPUT"));
        return;
      }
      auto list = containers::GetContainersFromPrefs(*profile_->GetPrefs());
      for (const auto& c : list) {
        if (c->name == name &&
            SamePlatform(Metadata().FindDict(c->id), request)) {
          Send(std::move(callback), Error("CONTAINER_NAME_EXISTS"));
          return;
        }
      }
      auto c = containers::mojom::Container::New();
      c->id = base::Uuid::GenerateRandomV4().AsLowercaseString();
      c->name = name;
      c->icon = containers::mojom::Icon::kShopping;
      c->background_color = 0xFF007F83;
      if (!ApplyAppearance(request, c)) {
        Send(std::move(callback), Error("INVALID_SHOP_INPUT"));
        return;
      }
      const auto id = c->id;
      list.push_back(std::move(c));
      containers::SetContainersToPrefs(list, *profile_->GetPrefs());
      Configure(id, request);
      auto result = List();
      result.Set("createdContainerId", id);
      Send(std::move(callback), std::move(result));
      return;
    }
    const auto id = Field(request, "containerId");
    auto c = containers::GetContainerFromPrefs(*profile_->GetPrefs(), id);
    if (!c) {
      Send(std::move(callback), Error("CONTAINER_NOT_FOUND"));
      return;
    }
    if (method == "shops.update") {
      if (!ApplyAppearance(request, c)) {
        Send(std::move(callback), Error("INVALID_CONTAINER_APPEARANCE"));
        return;
      }
      auto list = containers::GetContainersFromPrefs(*profile_->GetPrefs());
      for (const auto& other : list) {
        if (other->id != id && other->name == c->name &&
            SamePlatform(
                Metadata().FindDict(other->id),
                Metadata().FindDict(id) ? *Metadata().FindDict(id) : request)) {
          Send(std::move(callback), Error("CONTAINER_NAME_EXISTS"));
          return;
        }
      }
      if (request.FindString("platform") || request.Find("accountType") ||
          request.Find("homeUrl") || request.Find("customPlatformName") ||
          request.Find("entryUrl") || request.Find("webRtcPolicy") ||
          request.Find("browserLanguage") || request.Find("browserTimezone")) {
        const auto error = UpdateMetadata(id, request);
        if (!error.empty()) {
          Send(std::move(callback), Error(error));
          return;
        }
      }
      for (auto& other : list) {
        if (other->id == id) {
          other = c->Clone();
        }
      }
      delete_plans_.erase(id);
      containers::SetContainersToPrefs(list, *profile_->GetPrefs());
      Send(std::move(callback), List());
      return;
    }
    if (method == "shops.delete-preview") {
      const auto token = base::Uuid::GenerateRandomV4().AsLowercaseString();
      delete_plans_[id] = {token, c->name, base::Time::Now()};
      Send(std::move(callback),
           base::DictValue()
               .Set("ok", true)
               .Set("deletion", base::DictValue()
                                    .Set("containerId", id)
                                    .Set("name", c->name)
                                    .Set("openTabs", OpenTabCount(profile_, id))
                                    .Set("confirmationId", token)
                                    .Set("cleanup", "native-container-gc")
                                    .Set("reversible", false)));
      return;
    }
    if (method == "shops.delete") {
      auto plan = delete_plans_.find(id);
      if (plan == delete_plans_.end() ||
          plan->second.token != Field(request, "confirmationId") ||
          plan->second.name != c->name ||
          base::Time::Now() - plan->second.created > base::Minutes(5)) {
        Send(std::move(callback), Error("DELETE_CONFIRMATION_REQUIRED"));
        return;
      }
      if (OpenTabCount(profile_, id) > 0) {
        Send(std::move(callback), Error("CONTAINER_IN_USE"));
        return;
      }
      if (loaders_.contains(id)) {
        Send(std::move(callback), Error("BUSY"));
        return;
      }
      auto list = containers::GetContainersFromPrefs(*profile_->GetPrefs());
      std::erase_if(list, [&id](const auto& item) { return item->id == id; });
      {
        ScopedDictPrefUpdate update(profile_->GetPrefs(),
                                    containers::prefs::kShopContainers);
        update->Remove(id);
      }
      delete_plans_.erase(id);
      containers::SetContainersToPrefs(list, *profile_->GetPrefs());
      Send(std::move(callback), List());
      return;
    }
    if (method == "shops.configure") {
      const auto error = UpdateMetadata(id, request);
      if (!error.empty()) {
        Send(std::move(callback), Error(error));
        return;
      }
      Send(std::move(callback), List());
      return;
    }
    if (!Metadata().FindDict(id)) {
      Send(std::move(callback), Error("SHOP_NOT_CONFIGURED"));
      return;
    }
    if (method == "shops.open") {
      auto service = Field(request, "service");
      std::string url;
      const auto* metadata = Metadata().FindDict(id);
      const auto platform_id = Field(*metadata, "platform");
      if (const auto* operation = request.FindString("businessOperation")) {
        const auto page = GetBusinessReadPage(*operation);
        if (!page || platform_id != "taobao") {
          Send(std::move(callback), Error("BUSINESS_PAGE_UNSUPPORTED"));
          return;
        }
        service = page->service;
        url = page->entry_url;
      } else if (service.empty() || service == "home") {
        url = HomeUrl(*metadata);
        if (!SafeEntry(url)) {
          Send(std::move(callback), Error("INVALID_HOME_URL"));
          return;
        }
      } else if (platform_id != "taobao") {
        const auto* platform = Platform(platform_id);
        if (!platform || (!service.empty() && service != "home")) {
          Send(std::move(callback), Error("SERVICE_UNSUPPORTED"));
          return;
        }
        url = platform_id == "custom" ? Field(*metadata, "entryUrl")
                                      : platform->entry;
        if (!SafeEntry(url)) {
          Send(std::move(callback), Error("INVALID_PLATFORM_INPUT"));
          return;
        }
      } else if (service == "sycm" || service.empty() || service == "home") {
        url = kHome;
      } else if (service == "qianniu") {
        url = "https://myseller.taobao.com/";
      } else if (service == "alimama") {
        url = "https://one.alimama.com/";
      } else if (service == "taobao") {
        url = "https://www.taobao.com/";
      } else {
        Send(std::move(callback), Error("SERVICE_UNSUPPORTED"));
        return;
      }
      const bool background = request.FindBool("background").value_or(false);
      if (background && request.FindBool("reuse").value_or(false)) {
        bool reused = false;
        const GURL target(url);
        ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
            [&](BrowserWindowInterface* browser) {
              if (browser->GetProfile() == profile_) {
                auto* tabs = browser->GetTabStripModel();
                for (int i = 0; tabs && i < tabs->count(); ++i) {
                  auto* contents = tabs->GetWebContentsAt(i);
                  const auto& current = contents->GetLastCommittedURL();
                  if (containers::GetContainerIdForWebContents(contents) ==
                          id &&
                      url::Origin::Create(current) ==
                          url::Origin::Create(target) &&
                      current.path() == target.path()) {
                    contents->GetController().LoadIfNecessary();
                    reused = true;
                    return false;
                  }
                }
              }
              return true;
            });
        if (reused) {
          Send(std::move(callback), base::DictValue()
                                        .Set("ok", true)
                                        .Set("containerId", id)
                                        .Set("service", service)
                                        .Set("requestedUrl", url)
                                        .Set("navigation", "reused"));
          return;
        }
      }
      NavigateParams params(profile_, GURL(url), ui::PAGE_TRANSITION_FROM_API);
      params.disposition = background
                               ? WindowOpenDisposition::NEW_BACKGROUND_TAB
                               : WindowOpenDisposition::NEW_FOREGROUND_TAB;
      params.storage_partition_config = content::StoragePartitionConfig::Create(
          profile_, containers::kContainersStoragePartitionDomain, id, false);
      Navigate(&params);
      if (!params.navigated_or_inserted_contents ||
          containers::GetContainerIdForWebContents(
              params.navigated_or_inserted_contents) != id) {
        Send(std::move(callback), Error("CONTAINER_NAVIGATION_FAILED"));
        return;
      }
      Send(std::move(callback), base::DictValue()
                                    .Set("ok", true)
                                    .Set("containerId", id)
                                    .Set("service", service)
                                    .Set("requestedUrl", url)
                                    .Set("navigation", "started"));
      return;
    }
    if ((method == "shops.verify" || method == "shops.confirm") &&
        !SupportsVerification(*Metadata().FindDict(id))) {
      Send(std::move(callback), Error("PLATFORM_VERIFICATION_UNAVAILABLE"));
      return;
    }
    if (method == "shops.confirm") {
      const auto* old = Metadata().FindDict(id);
      const auto* candidate = old->FindDict("candidate");
      if (!candidate ||
          Field(*candidate, "shopId") != Field(request, "shopId") ||
          Field(*candidate, "candidateId") != Field(request, "candidateId")) {
        Send(std::move(callback), Error("STALE_IDENTITY_CANDIDATE"));
        return;
      }
      int64_t verified_at = 0;
      if (!base::StringToInt64(Field(*candidate, "verifiedAt"), &verified_at) ||
          base::Time::Now().ToTimeT() - verified_at > 300) {
        Send(std::move(callback), Error("STALE_IDENTITY_CANDIDATE"));
        return;
      }
      auto updated = old->Clone();
      auto identity = candidate->Clone();
      identity.Remove("candidateId");
      updated.Set("identity", std::move(identity));
      updated.Remove("candidate");
      updated.Set("state", "ready");
      Store(id, std::move(updated));
      Send(std::move(callback), List());
      return;
    }
    if (method == "shops.verify") {
      Verify(id, std::move(callback));
      return;
    }
    Send(std::move(callback), Error("UNSUPPORTED_COMMAND"));
  }

 private:
  const base::DictValue& Metadata() {
    return profile_->GetPrefs()->GetDict(containers::prefs::kShopContainers);
  }
  void Store(const std::string& id, base::DictValue value) {
    ScopedDictPrefUpdate update(profile_->GetPrefs(),
                                containers::prefs::kShopContainers);
    update->Set(id, std::move(value));
  }
  std::string UpdateMetadata(const std::string& id,
                             const base::DictValue& request) {
    const auto* old = Metadata().FindDict(id);
    auto updated = old ? old->Clone() : base::DictValue();
    for (const char* key : {"platform", "accountType", "customPlatformName",
                            "entryUrl", "homeUrl", "webRtcPolicy", "browserLanguage",
                            "browserTimezone"}) {
      if (const auto* value = request.Find(key)) {
        updated.Set(key, value->Clone());
      }
    }
    if (old && Field(*old, "platform") != Field(updated, "platform")) {
      return "PLATFORM_CHANGE_REQUIRES_NEW_CONTAINER";
    }
    if (updated.Find("homeUrl") && !SafeEntry(Field(updated, "homeUrl"))) {
      return "INVALID_HOME_URL";
    }
    if (!ValidPlatform(updated)) {
      return "INVALID_PLATFORM_INPUT";
    }
    if (!old) {
      for (const char* key : {"authentication", "diagnostics", "lastError",
                              "checkedAt", "expiry"}) {
        updated.Remove(key);
      }
      updated.Set("state", SupportsVerification(updated)
                               ? "awaiting-login"
                               : "verification-unavailable");
    }
    if (Field(updated, "platform") == "custom") {
      auto name = Field(updated, "customPlatformName");
      base::TrimWhitespaceASCII(name, base::TRIM_ALL, &name);
      updated.Set("customPlatformName", name);
      if (request.FindString("homeUrl")) {
        updated.Set("entryUrl", GURL(Field(updated, "homeUrl")).spec());
      }
    }
    updated.Set("homeUrl", HomeUrl(updated));
    Store(id, std::move(updated));
    return {};
  }
  void Configure(const std::string& id, const base::DictValue& request) {
    const auto platform = Field(request, "platform");
    auto item =
        base::DictValue()
            .Set("platform", platform)
            .Set("state", platform == "taobao" ? "awaiting-login"
                                               : "verification-unavailable");
    if (platform == "custom") {
      auto name = Field(request, "customPlatformName");
      base::TrimWhitespaceASCII(name, base::TRIM_ALL, &name);
      item.Set("customPlatformName", name);
      const auto icon_url = Field(request, "customPlatformIconUrl");
      if (icon_url.size() <= 2048 && SafeEntry(icon_url)) {
        item.Set("customPlatformIconUrl", GURL(icon_url).spec());
      }
      item.Set("entryUrl",
               GURL(request.FindString("homeUrl") ? Field(request, "homeUrl")
                                                  : Field(request, "entryUrl"))
                   .spec());
    }
    item.Set("homeUrl", HomeUrl(request));
    for (const char* key :
         {"webRtcPolicy", "browserLanguage", "browserTimezone"}) {
      if (const auto* value = request.FindString(key)) {
        item.Set(key, *value);
      }
    }
    Store(id, std::move(item));
  }
  base::DictValue List() {
    base::ListValue shops;
    for (const auto& c :
         containers::GetContainersFromPrefs(*profile_->GetPrefs())) {
      auto item = Metadata().FindDict(c->id)
                      ? Metadata().FindDict(c->id)->Clone()
                      : base::DictValue().Set("state", "unconfigured");
      item.Remove("encryptedCredentials");
      item.Remove("credentialOrigin");
      item.Remove("credentialImported");
      item.Set("verificationSupported", SupportsVerification(item));
      item.Set("homeUrl", HomeUrl(item));
      item.Set("id", c->id);
      item.Set("name", c->name);
      item.Set("icon", static_cast<int>(c->icon));
      item.Set("color",
               base::StringPrintf("#%06x", c->background_color & 0xFFFFFF));
      item.Set("openTabs", OpenTabCount(profile_, c->id));
      item.Set("checking", loaders_.contains(c->id));
      shops.Append(std::move(item));
    }
    return base::DictValue().Set("ok", true).Set("shops", std::move(shops));
  }
  void ScheduleChecks() {
    if (!profile_ || !profile_->GetPrefs()->GetBoolean(
                         containers::prefs::kContainersEnabled)) {
      return;
    }
    for (const auto& container :
         containers::GetContainersFromPrefs(*profile_->GetPrefs())) {
      const auto* metadata = Metadata().FindDict(container->id);
      if (metadata && SupportsVerification(*metadata) &&
          (!attempts_.contains(container->id) ||
           base::Time::Now() - attempts_[container->id] >= base::Seconds(30)) &&
          !loaders_.contains(container->id) &&
          std::find(queue_.begin(), queue_.end(), container->id) ==
              queue_.end()) {
        queue_.push_back(container->id);
      }
    }
    PumpChecks();
  }
  void PumpChecks() {
    while (profile_ && loaders_.size() < 2 && !queue_.empty()) {
      auto id = queue_.front();
      queue_.pop_front();
      if (!Metadata().FindDict(id) ||
          !SupportsVerification(*Metadata().FindDict(id)) ||
          loaders_.contains(id)) {
        continue;
      }
      Verify(id, base::BindOnce(&ShopService::AutoChecked, weak_.GetWeakPtr()));
    }
  }
  void AutoChecked(std::string) { PumpChecks(); }
  void ReadExpiry(const std::string& id) {
    const auto config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, id, false);
    profile_->GetStoragePartition(config)
        ->GetCookieManagerForBrowserProcess()
        ->GetCookieList(
            GURL(kHome), net::CookieOptions::MakeAllInclusive(),
            net::CookiePartitionKeyCollection(),
            base::BindOnce(&ShopService::ExpiryRead, weak_.GetWeakPtr(), id));
  }
  void ExpiryRead(const std::string& id,
                  const net::CookieAccessResultList& cookies,
                  const net::CookieAccessResultList&) {
    if (!profile_ || !Metadata().FindDict(id)) {
      return;
    }
    base::Time earliest;
    bool session = false;
    for (const auto& result : cookies) {
      const auto& cookie = result.cookie;
      if (cookie.Name() != "cookie2" && cookie.Name() != "sgcookie" &&
          cookie.Name() != "unb") {
        continue;
      }
      if (!cookie.IsPersistent()) {
        session = true;
      } else if (cookie.ExpiryDate() > base::Time::Now() &&
                 (earliest.is_null() || cookie.ExpiryDate() < earliest)) {
        earliest = cookie.ExpiryDate();
      }
    }
    auto item = Metadata().FindDict(id)->Clone();
    base::DictValue expiry;
    expiry.Set("kind", session              ? "session"
                       : earliest.is_null() ? "unknown"
                                            : "cookie-reference");
    expiry.Set("checkedAt", base::NumberToString(base::Time::Now().ToTimeT()));
    if (!earliest.is_null()) {
      expiry.Set("cookieExpiresAt", base::NumberToString(earliest.ToTimeT()));
    }
    item.Set("expiry", std::move(expiry));
    Store(id, std::move(item));
  }
  void Redirected(const std::string& id,
                  const GURL&,
                  const net::RedirectInfo& redirect,
                  const network::mojom::URLResponseHead&,
                  std::vector<std::string>*) {
    auto found = loaders_.find(id);
    if (found == loaders_.end()) {
      return;
    }
    if (++found->second.redirects <= 3 &&
        url::Origin::Create(redirect.new_url) ==
            url::Origin::Create(GURL(kHome)) &&
        !redirect.new_url.has_username() && !redirect.new_url.has_password()) {
      return;
    }
    auto pending = std::move(found->second);
    loaders_.erase(found);
    if (Metadata().FindDict(id)) {
      auto item = Metadata().FindDict(id)->Clone();
      item.Set("state", "verification-required");
      item.Set("lastError", "LOGIN_REDIRECT");
      item.Set("diagnostics", base::DictValue()
                                  .Set("redirectSameOrigin",
                                       url::Origin::Create(redirect.new_url) ==
                                           url::Origin::Create(GURL(kHome)))
                                  .Set("redirectStatus", redirect.status_code));
      item.Set("checkedAt", base::NumberToString(base::Time::Now().ToTimeT()));
      Store(id, std::move(item));
    }
    Send(std::move(pending.callback), Error("LOGIN_REDIRECT"));
  }
  void Verify(const std::string& id, Reply callback) {
    if (loaders_.contains(id)) {
      Send(std::move(callback), Error("BUSY"));
      return;
    }
    attempts_[id] = base::Time::Now();
    auto resource = std::make_unique<network::ResourceRequest>();
    resource->url = GURL(kHome);
    resource->load_flags = net::LOAD_BYPASS_CACHE | net::LOAD_DISABLE_CACHE;
    resource->credentials_mode = network::mojom::CredentialsMode::kInclude;
    resource->redirect_mode = network::mojom::RedirectMode::kFollow;
    resource->site_for_cookies = net::SiteForCookies::FromUrl(resource->url);
    resource->request_initiator = url::Origin::Create(resource->url);
    resource->headers.SetHeader("Accept", "text/html,application/xhtml+xml");
    resource->headers.SetHeader("User-Agent", embedder_support::GetUserAgent());
    resource->mode = network::mojom::RequestMode::kNavigate;
    resource->destination = network::mojom::RequestDestination::kDocument;
    constexpr auto annotation =
        net::DefineNetworkTrafficAnnotation("ecom_shop_identity", R"(
      semantics { sender: "Ecom shop containers" description: "Checks shop identity in the selected container."
        trigger: "User requests shop verification." data: "Eligible container cookies." destination: WEBSITE }
      policy { cookies_allowed: YES cookies_store: "Selected container" setting: "Explicit shop verification."
        policy_exception_justification: "User managed local shop containers." })");
    auto loader =
        network::SimpleURLLoader::Create(std::move(resource), annotation);
    loader->SetTimeoutDuration(base::Seconds(8));
    loader->SetOnRedirectCallback(
        base::BindRepeating(&ShopService::Redirected, weak_.GetWeakPtr(), id));
    auto* pending = loader.get();
    loaders_[id] = {std::move(loader), std::move(callback), 0};
    ReadExpiry(id);
    const auto config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, id, false);
    auto factory = profile_->GetStoragePartition(config)
                       ->GetURLLoaderFactoryForBrowserProcess();
    pending->DownloadToString(
        factory.get(),
        base::BindOnce(&ShopService::Verified, weak_.GetWeakPtr(), id),
        2 * 1024 * 1024);
  }
  void Verified(const std::string& id, std::optional<std::string> body) {
    auto pending = std::move(loaders_.at(id));
    loaders_.erase(id);
    auto loader = std::move(pending.loader);
    auto callback = std::move(pending.callback);
    if (!containers::GetContainerFromPrefs(*profile_->GetPrefs(), id) ||
        !Metadata().FindDict(id)) {
      Send(std::move(callback), Error("CONTAINER_NOT_FOUND"));
      return;
    }
    auto item = Metadata().FindDict(id)->Clone();
    item.Remove("candidate");
    item.Set("checkedAt", base::NumberToString(base::Time::Now().ToTimeT()));
    const bool trusted_page =
        body && loader->NetError() == net::OK && loader->ResponseInfo() &&
        loader->ResponseInfo()->headers &&
        loader->ResponseInfo()->headers->response_code() == 200 &&
        url::Origin::Create(loader->GetFinalURL()) ==
            url::Origin::Create(GURL(kHome));
    const auto identity =
        trusted_page ? ParseEmbeddedShopIdentity(*body) : std::nullopt;
    if (!identity) {
      base::DictValue diagnostics;
      diagnostics.Set("networkError", loader->NetError());
      diagnostics.Set("httpStatus",
                      loader->ResponseInfo() && loader->ResponseInfo()->headers
                          ? loader->ResponseInfo()->headers->response_code()
                          : 0);
      diagnostics.Set("hasBody", body.has_value());
      if (body) {
        diagnostics.Set("gConfigMarker",
                        body->find("g_config") != std::string::npos);
        diagnostics.Set("userInfoMarker",
                        body->find("userInfo") != std::string::npos);
        diagnostics.Set("loginPageMarker",
                        body->find("login.taobao.com") != std::string::npos);
        diagnostics.Set("challengeMarker",
                        body->find("punish") != std::string::npos ||
                            body->find("baxia") != std::string::npos);
        diagnostics.Set("metadataMarker",
                        body->find("metaCacheData") != std::string::npos);
        diagnostics.Set("shopIdField",
                        body->find("runAsShopId") != std::string::npos);
        diagnostics.Set("accountIdField",
                        body->find("loginUserId") != std::string::npos);
        diagnostics.Set("userIdField",
                        body->find("runAsUserId") != std::string::npos);
        base::DictValue field_shapes;
        for (const auto* key : {"runAsShopId", "loginUserId", "mainUserId",
                                "runAsUserId", "runAsShopTitle",
                                "runAsUserName", "mainUserName",
                                "loginUserName", "loginNick", "shopName"}) {
          std::string first;
          const std::string pattern =
              std::string(R"re(["']?)re") + key +
              R"re(["']?\s*[:=]\s*(["'0-9A-Za-z_]))re";
          if (re2::RE2::PartialMatch(*body, re2::RE2(pattern), &first)) {
            field_shapes.Set(key, first == "\"" || first == "'"
                                      ? "quoted-literal"
                                  : base::IsAsciiDigit(first[0])
                                      ? "numeric-literal"
                                      : "expression");
          } else {
            field_shapes.Set(key, "not-found");
          }
        }
        // Fixed field names and syntax classes only; values remain native.
        diagnostics.Set("identityFieldShapes", std::move(field_shapes));
        std::string block;
        bool object = re2::RE2::PartialMatch(
            *body,
            re2::RE2(
                R"re((?s)(?:window\.)?metaCacheData\s*=\s*(\{.+?\})\s*;)re"),
            &block);
        diagnostics.Set("objectAssignment", object);
        diagnostics.Set(
            "validJson",
            object && base::JSONReader::Read(
                          block, base::JSON_PARSE_CHROMIUM_EXTENSIONS)
                          .has_value());
        diagnostics.Set("jsonParseAssignment",
                        re2::RE2::PartialMatch(
                            *body, R"(metaCacheData\s*=\s*JSON\.parse)"));
      }
      item.Set("diagnostics", std::move(diagnostics));
      Store(id, std::move(item));
      if (trusted_page) {
        if (const auto token = ExtractSycmLegalityToken(*body)) {
          FetchPersonalView(id, *token, std::move(callback));
          return;
        }
      }
      ProbeLogin(id, std::move(callback));
      return;
    }
    IdentityVerified(id, *identity, std::move(callback), "sycm-embedded-metadata");
  }
  void IdentityVerified(const std::string& id,
                        const base::DictValue& identity,
                        Reply callback,
                        const std::string& source) {
    auto item = Metadata().FindDict(id)->Clone();
    item.Set("checkedAt", base::NumberToString(base::Time::Now().ToTimeT()));
    item.Set(
        "authentication",
        base::DictValue()
            .Set("state", "authenticated")
            .Set("service", "sycm")
            .Set("source", source)
            .Set("checkedAt", base::NumberToString(base::Time::Now().ToTimeT()))
            .Set("lastSuccessfulAt",
                 base::NumberToString(base::Time::Now().ToTimeT())));
    auto candidate = identity.Clone();
    candidate.Set("verifiedAt",
                  base::NumberToString(base::Time::Now().ToTimeT()));
    candidate.Set("source", source);
    const auto* bound = item.FindDict("identity");
    if (bound &&
        (Field(*bound, "shopId") != Field(candidate, "shopId") ||
         Field(*bound, "accountId") != Field(candidate, "accountId"))) {
      item.Set("state", "identity-mismatch");
      Store(id, std::move(item));
      Send(std::move(callback), Error("SHOP_IDENTITY_MISMATCH"));
      return;
    }
    item.Remove("lastError");
    item.Remove("diagnostics");
    const auto container =
        containers::GetContainerFromPrefs(*profile_->GetPrefs(), id);
    if (bound ||
        (container && container->name == Field(candidate, "platformName"))) {
      item.Set("identity", std::move(candidate));
      item.Set("state", "ready");
    } else {
      candidate.Set("candidateId",
                    base::Uuid::GenerateRandomV4().AsLowercaseString());
      item.Set("candidate", std::move(candidate));
      item.Set("state", "awaiting-confirmation");
    }
    Store(id, std::move(item));
    Send(std::move(callback), List());
  }
  void FetchPersonalView(const std::string& id,
                         const std::string& token,
                         Reply callback) {
    // This fixed endpoint and page-derived token stay inside the browser.
    // No caller-selected URL, credentials or script execution is introduced.
    // The platform emits a query-encoded token and appends it directly in its
    // own client. Preserve that representation; the parser excludes URL query
    // delimiters so it cannot change this fixed endpoint or add parameters.
    const GURL url(
        "https://sycm.taobao.com/custom/menu/getPersonalView.json?token=" + token);
    auto resource = std::make_unique<network::ResourceRequest>();
    resource->url = url;
    resource->load_flags = net::LOAD_BYPASS_CACHE | net::LOAD_DISABLE_CACHE;
    resource->credentials_mode = network::mojom::CredentialsMode::kInclude;
    resource->redirect_mode = network::mojom::RedirectMode::kError;
    resource->site_for_cookies = net::SiteForCookies::FromUrl(url);
    resource->request_initiator = url::Origin::Create(url);
    resource->headers.SetHeader("Accept", "application/json");
    resource->referrer = GURL(kHome);
    resource->mode = network::mojom::RequestMode::kCors;
    resource->headers.SetHeader("User-Agent", embedder_support::GetUserAgent());
    constexpr auto annotation =
        net::DefineNetworkTrafficAnnotation("ecom_shop_personal_view", R"(
      semantics { sender: "Ecom shop identity checks" description: "Reads the platform's fixed current-account identity endpoint using its own homepage token. Only whitelisted identity fields are retained."
        trigger: "User verification or automatic configured-account check." data: "Selected container cookies and page-provided request token." destination: WEBSITE }
      policy { cookies_allowed: YES cookies_store: "Selected container" setting: "Configured Taobao account verification."
        policy_exception_justification: "User managed local account containers." })");
    auto loader =
        network::SimpleURLLoader::Create(std::move(resource), annotation);
    loader->SetTimeoutDuration(base::Seconds(8));
    auto* pending = loader.get();
    loaders_[id] = {std::move(loader), std::move(callback), 0};
    const auto config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, id, false);
    pending->DownloadToString(
        profile_->GetStoragePartition(config)
            ->GetURLLoaderFactoryForBrowserProcess()
            .get(),
        base::BindOnce(&ShopService::PersonalViewFetched, weak_.GetWeakPtr(), id),
        2 * 1024 * 1024);
  }
  void PersonalViewFetched(const std::string& id,
                           std::optional<std::string> body) {
    auto pending = std::move(loaders_.at(id));
    loaders_.erase(id);
    if (!Metadata().FindDict(id) ||
        !containers::GetContainerFromPrefs(*profile_->GetPrefs(), id)) {
      Send(std::move(pending.callback), Error("CONTAINER_NOT_FOUND"));
      return;
    }
    const int status = pending.loader->ResponseInfo() &&
                               pending.loader->ResponseInfo()->headers
                           ? pending.loader->ResponseInfo()->headers->response_code()
                           : 0;
    const auto identity = body && pending.loader->NetError() == net::OK &&
                                  status == 200
                              ? ParsePersonalViewShopIdentity(*body)
                              : std::nullopt;
    if (identity) {
      IdentityVerified(id, *identity, std::move(pending.callback),
                       "sycm-personal-view-json");
      return;
    }
    auto item = Metadata().FindDict(id)->Clone();
    auto diagnostics = item.FindDict("diagnostics")
                           ? item.FindDict("diagnostics")->Clone()
                           : base::DictValue();
    diagnostics.Set("identityProbeHttpStatus", status);
    diagnostics.Set("identityProbeNetworkError", pending.loader->NetError());
    diagnostics.Set("identityProbeValidIdentity", false);
    if (body) {
      const auto payload = base::JSONReader::Read(*body, base::JSON_PARSE_RFC);
      if (payload && payload->is_dict()) {
        if (const auto code = payload->GetDict().FindInt("code")) {
          diagnostics.Set("identityProbeCode", *code);
        }
        const auto* message = payload->GetDict().FindString("message");
        if (!message) {
          message = payload->GetDict().FindString("msg");
        }
        if (message) {
          base::DictValue classification;
          classification.Set("token",
                             base::ToLowerASCII(*message).find("token") !=
                                 std::string::npos);
          for (const auto* word : {"过期", "登录", "权限", "参数", "非法", "验证"}) {
            classification.Set(word, message->find(word) != std::string::npos);
          }
          diagnostics.Set("identityProbeMessageClass", std::move(classification));
          const auto query = pending.loader->GetFinalURL().query();
          diagnostics.Set("identityProbeMessage",
                          RedactIdentityError(
                              *message, query.starts_with("token=")
                                            ? query.substr(6)
                                            : std::string_view()));
        }
        if (const auto* data = payload->GetDict().FindDict("data")) {
          base::DictValue types;
          for (const auto* key : {"runAsShopId", "loginUserId", "mainUserId",
                                  "runAsShopTitle", "runAsUserName",
                                  "mainUserName"}) {
            const auto* value = data->Find(key);
            types.Set(key, value ? base::Value::GetTypeName(value->type())
                                 : "missing");
          }
          diagnostics.Set("identityProbeFieldTypes", std::move(types));
        }
      }
    }
    item.Set("diagnostics", std::move(diagnostics));
    Store(id, std::move(item));
    ProbeLogin(id, std::move(pending.callback));
  }
  // A successful registered SYCM JSON operation proves service login, not a
  // particular shop identity. Business values are inspected here and discarded.
  void ProbeLogin(const std::string& id, Reply callback) {
    base::Time::Exploded day;
    (base::Time::Now() - base::Days(1)).LocalExplode(&day);
    const auto date = base::StringPrintf("%04d-%02d-%02d", day.year, day.month,
                                         day.day_of_month);
    const GURL url(
        "https://sycm.taobao.com/bda/tradinganaly/overview/"
        "get_summary.json?dateType=recent1&device=0&dateRange=" +
        date + "%7C" + date);
    auto resource = std::make_unique<network::ResourceRequest>();
    resource->url = url;
    resource->load_flags = net::LOAD_BYPASS_CACHE | net::LOAD_DISABLE_CACHE;
    resource->credentials_mode = network::mojom::CredentialsMode::kInclude;
    resource->redirect_mode = network::mojom::RedirectMode::kError;
    resource->site_for_cookies = net::SiteForCookies::FromUrl(url);
    resource->request_initiator = url::Origin::Create(url);
    resource->headers.SetHeader("Accept", "application/json");
    resource->referrer = GURL(kHome);
    resource->mode = network::mojom::RequestMode::kCors;
    resource->headers.SetHeader("User-Agent", embedder_support::GetUserAgent());
    constexpr auto annotation =
        net::DefineNetworkTrafficAnnotation("ecom_shop_login_check", R"(
      semantics { sender: "Ecom shop login checks" description: "Checks whether the selected container can access a fixed read-only SYCM endpoint. Business values are discarded."
        trigger: "Periodic check or user refresh in shop manager." data: "Selected container cookies and previous-day date." destination: WEBSITE }
      policy { cookies_allowed: YES cookies_store: "Selected container" setting: "Configured Taobao shop containers."
        policy_exception_justification: "User requested automatic login monitoring." })");
    auto loader =
        network::SimpleURLLoader::Create(std::move(resource), annotation);
    loader->SetTimeoutDuration(base::Seconds(8));
    loader->SetAllowHttpErrorResults(true);
    auto* pending = loader.get();
    loaders_[id] = {std::move(loader), std::move(callback), 0};
    const auto config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, id, false);
    pending->DownloadToString(
        profile_->GetStoragePartition(config)
            ->GetURLLoaderFactoryForBrowserProcess()
            .get(),
        base::BindOnce(&ShopService::LoginProbed, weak_.GetWeakPtr(), id),
        2 * 1024 * 1024);
  }
  void LoginProbed(const std::string& id, std::optional<std::string> body) {
    auto pending = std::move(loaders_.at(id));
    loaders_.erase(id);
    if (!Metadata().FindDict(id) ||
        !containers::GetContainerFromPrefs(*profile_->GetPrefs(), id)) {
      Send(std::move(pending.callback), Error("CONTAINER_NOT_FOUND"));
      return;
    }
    auto item = Metadata().FindDict(id)->Clone();
    const int status =
        pending.loader->ResponseInfo() &&
                pending.loader->ResponseInfo()->headers
            ? pending.loader->ResponseInfo()->headers->response_code()
            : 0;
    auto payload =
        body && pending.loader->NetError() == net::OK && status == 200
            ? base::JSONReader::Read(*body, base::JSON_PARSE_RFC)
            : std::nullopt;
    const auto* envelope =
        payload && payload->is_dict() ? &payload->GetDict() : nullptr;
    const auto code = envelope ? envelope->FindInt("code") : std::nullopt;
    const auto* data = envelope ? envelope->FindDict("data") : nullptr;
    const bool authenticated =
        code == 0 && data && data->Find("payAmt") && data->Find("uv");
    const auto now = base::NumberToString(base::Time::Now().ToTimeT());
    auto auth = item.FindDict("authentication")
                    ? item.FindDict("authentication")->Clone()
                    : base::DictValue();
    auth.Set("state", authenticated                   ? "authenticated"
                      : code == 5810 || status == 401 ? "signed-out"
                                                      : "unknown");
    auth.Set("service", "sycm");
    auth.Set("source", "sycm-authenticated-json");
    auth.Set("checkedAt", now);
    if (authenticated) {
      auth.Set("lastSuccessfulAt", now);
    }
    item.Set("authentication", std::move(auth));
    item.Set("checkedAt", now);
    if (auto* diagnostics = item.FindDict("diagnostics")) {
      diagnostics->Set("loginProbeHttpStatus", status);
      diagnostics->Set("loginProbeNetworkError", pending.loader->NetError());
      diagnostics->Set("loginProbeHasData", data != nullptr);
      if (code) {
        diagnostics->Set("loginProbeCode", *code);
      }
    }
    if (authenticated) {
      // Keep identity binding separate: successful data access cannot identify
      // which shop owns the session.
      item.Set("state", "signed-in");
      item.Remove("lastError");
      Store(id, std::move(item));
      Send(std::move(pending.callback), List());
    } else {
      item.Set("state", code == 5810 || status == 401
                            ? "login-required"
                            : "verification-required");
      item.Set("lastError", "LOGIN_CHECK_UNAVAILABLE");
      Store(id, std::move(item));
      Send(std::move(pending.callback), Error("LOGIN_CHECK_UNAVAILABLE"));
    }
  }
  raw_ptr<Profile> profile_;
  struct PendingCheck {
    std::unique_ptr<network::SimpleURLLoader> loader;
    Reply callback;
    int redirects = 0;
  };
  struct DeletePlan {
    std::string token;
    std::string name;
    base::Time created;
  };
  std::map<std::string, PendingCheck> loaders_;
  std::map<std::string, DeletePlan> delete_plans_;
  std::deque<std::string> queue_;
  std::map<std::string, base::Time> attempts_;
  base::RepeatingTimer timer_;
  base::WeakPtrFactory<ShopService> weak_{this};
};
class ShopSettingsHandler final : public content::WebUIMessageHandler {
 public:
  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "ecomShopCommand", base::BindRepeating(&ShopSettingsHandler::Handle,
                                               base::Unretained(this)));
    web_ui()->RegisterMessageCallback(
        "ecomShopCredentials",
        base::BindRepeating(&ShopSettingsHandler::HandleCredentials,
                            base::Unretained(this)));
  }
  void OnJavascriptDisallowed() override { weak_.InvalidateWeakPtrs(); }

 private:
  void HandleCredentials(const base::ListValue& args) {
    if (args.size() != 5 ||
        !std::all_of(args.begin(), args.end(),
                     [](const base::Value& value) { return value.is_string(); })) {
      return;
    }
    AllowJavascript();
    auto* profile = Profile::FromWebUI(web_ui());
    const auto& id = args[1].GetString();
    auto reply = args[0].Clone();
    if (profile->IsOffTheRecord() ||
        !base::Uuid::ParseLowercase(id).is_valid() ||
        !containers::GetContainerFromPrefs(*profile->GetPrefs(), id)) {
      ResolveJavascriptCallback(reply, base::Value(Error("CONTAINER_NOT_FOUND")));
      return;
    }
    const auto* shop = profile->GetPrefs()
                           ->GetDict(containers::prefs::kShopContainers)
                           .FindDict(id);
    if (args[2].GetString().empty() && args[3].GetString().empty() &&
        args[4].GetString().empty()) {
      const auto* origin = shop ? shop->FindString("credentialOrigin") : nullptr;
      auto result = base::DictValue().Set("ok", true).Set(
          "origin", origin ? *origin : "");
      const auto* encrypted =
          shop ? shop->FindString("encryptedCredentials") : nullptr;
      result.Set("hasPassword", encrypted && !encrypted->empty());
      auto* crypto = g_browser_process->os_crypt_async();
      if (crypto && origin && encrypted) {
        crypto->GetInstance(base::BindOnce(
            &ShopSettingsHandler::ReadCredentialUsername, weak_.GetWeakPtr(),
            std::move(reply), id, *encrypted, std::move(result)));
      } else {
        ResolveJavascriptCallback(reply, base::Value(std::move(result)));
      }
      return;
    }
    const auto& site = args[2].GetString();
    const auto& username = args[3].GetString();
    const auto& password = args[4].GetString();
    if (site.size() > 2048 || !SafeEntry(site) || username.empty() ||
        username.size() > 1024 || password.empty() || password.size() > 4096) {
      ResolveJavascriptCallback(reply, base::Value(Error("INVALID_CREDENTIALS")));
      return;
    }
    auto* crypto = g_browser_process->os_crypt_async();
    if (!crypto) {
      ResolveJavascriptCallback(reply, base::Value(Error("ENCRYPTION_UNAVAILABLE")));
      return;
    }
    const auto origin = url::Origin::Create(GURL(site)).Serialize();
    auto payload = base::WriteJson(base::DictValue()
                                       .Set("containerId", id)
                                       .Set("origin", origin)
                                       .Set("username", username)
                                       .Set("password", password));
    if (!payload) {
      ResolveJavascriptCallback(reply, base::Value(Error("INVALID_CREDENTIALS")));
      return;
    }
    crypto->GetInstance(base::BindOnce(
        &ShopSettingsHandler::SaveCredentials, weak_.GetWeakPtr(),
        std::move(reply), id, origin, std::move(*payload)));
  }

  void ReadCredentialUsername(
      base::Value reply,
      std::string id,
      std::string encrypted,
      base::DictValue result,
      scoped_refptr<os_crypt_async::Encryptor> encryptor) {
    if (!IsJavascriptAllowed()) {
      return;
    }
    const auto* shop = Profile::FromWebUI(web_ui())->GetPrefs()
                           ->GetDict(containers::prefs::kShopContainers)
                           .FindDict(id);
    const auto* current = shop ? shop->FindString("encryptedCredentials") : nullptr;
    std::string ciphertext;
    std::string plaintext;
    if (current && *current == encrypted && encryptor &&
        base::Base64Decode(encrypted, &ciphertext) &&
        encryptor->DecryptString(ciphertext, &plaintext)) {
      auto data = base::JSONReader::ReadDict(plaintext, base::JSON_PARSE_RFC);
      if (data && data->FindString("containerId") &&
          *data->FindString("containerId") == id) {
        if (const auto* username = data->FindString("username")) {
          result.Set("username", *username);
        }
      }
    }
    ResolveJavascriptCallback(reply, base::Value(std::move(result)));
  }

  void SaveCredentials(base::Value reply,
                       std::string id,
                       std::string origin,
                       std::string payload,
                       scoped_refptr<os_crypt_async::Encryptor> encryptor) {
    auto* profile = Profile::FromWebUI(web_ui());
    if (!containers::GetContainerFromPrefs(*profile->GetPrefs(), id)) {
      ResolveJavascriptCallback(reply, base::Value(Error("CONTAINER_NOT_FOUND")));
      return;
    }
    std::string ciphertext;
    if (!encryptor || !encryptor->IsEncryptionAvailable() ||
        !encryptor->EncryptString(payload, &ciphertext)) {
      ResolveJavascriptCallback(reply, base::Value(Error("ENCRYPTION_UNAVAILABLE")));
      return;
    }
    ScopedDictPrefUpdate update(profile->GetPrefs(),
                                containers::prefs::kShopContainers);
    auto* shop = update->EnsureDict(id);
    shop->Set("credentialOrigin", origin);
    shop->Set("encryptedCredentials", base::Base64Encode(ciphertext));
    shop->Set("credentialImported", true);
    auto data = base::JSONReader::ReadDict(payload, base::JSON_PARSE_RFC);
    if (data && data->FindString("username") && data->FindString("password")) {
      AddContainerPassword(profile, id, origin, *data->FindString("username"),
                           *data->FindString("password"));
    }
    ResolveJavascriptCallback(
        reply, base::Value(base::DictValue().Set("ok", true).Set("origin", origin)));
  }

  void Handle(const base::ListValue& args) {
    if (args.size() != 2 || !args[0].is_string() || !args[1].is_string()) {
      return;
    }
    AllowJavascript();
    RunShopCommand(Profile::FromWebUI(web_ui()), args[1].GetString(),
                   base::BindOnce(&ShopSettingsHandler::Done,
                                  weak_.GetWeakPtr(), args[0].Clone()));
  }
  void Done(base::Value id, std::string value) {
    if (IsJavascriptAllowed()) {
      ResolveJavascriptCallback(id, base::Value(value));
    }
  }
  base::WeakPtrFactory<ShopSettingsHandler> weak_{this};
};
}  // namespace
void RunShopCommand(Profile* profile, std::string request, Reply callback) {
  if (request.size() > 32768) {
    Send(std::move(callback), Error("INVALID_ARGUMENT"));
    return;
  }
  auto parsed = base::JSONReader::Read(request, base::JSON_PARSE_RFC);
  if (!parsed || !parsed->is_dict() || request.size() > 32768) {
    Send(std::move(callback), Error("INVALID_ARGUMENT"));
    return;
  }
  if (profile->IsOffTheRecord()) {
    Send(std::move(callback), Error("PRIVATE_PROFILE_UNSUPPORTED"));
    return;
  }
  auto* service = static_cast<ShopService*>(profile->GetUserData(kServiceKey));
  if (!service) {
    auto owned = std::make_unique<ShopService>(profile);
    service = owned.get();
    profile->SetUserData(kServiceKey, std::move(owned));
  }
  service->Run(parsed->GetDict(), std::move(callback));
}
std::unique_ptr<content::WebUIMessageHandler> CreateShopSettingsHandler() {
  return std::make_unique<ShopSettingsHandler>();
}
}  // namespace ecom
