#include "brave/browser/ecom/shop_container_service.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <deque>
#include <map>
#include <optional>
#include <string>
#include <utility>

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
#include "brave/browser/ecom/shop_manager_ui.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/containers_settings_handler.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/common/features.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/embedder_support/user_agent_utils.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "content/public/browser/storage_partition.h"
#include "content/public/browser/storage_partition_config.h"
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

// Read only whitelisted identity fields from the platform's embedded metadata.
// HTML and credentials never leave the browser. Missing/changed page formats
// fail closed.
std::optional<base::DictValue> ParseIdentity(const std::string& html) {
  std::string block;
  if (!re2::RE2::PartialMatch(
          html,
          re2::RE2(R"re((?s)(?:window\.)?metaCacheData\s*=\s*(\{.+?\})\s*;)re"),
          &block)) {
    return std::nullopt;
  }
  auto metadata =
      base::JSONReader::Read(block, base::JSON_PARSE_CHROMIUM_EXTENSIONS);
  if (!metadata || !metadata->is_dict()) {
    return std::nullopt;
  }
  auto field = [&metadata](const char* key) {
    const auto* value = metadata->GetDict().Find(key);
    if (!value) {
      return std::string();
    }
    if (value->is_string()) {
      return value->GetString();
    }
    if (value->is_int()) {
      return base::NumberToString(value->GetInt());
    }
    if (value->is_double()) {
      const double number = value->GetDouble();
      if (number > 0 && number <= 9007199254740991.0 &&
          number == std::floor(number)) {
        return base::NumberToString(static_cast<int64_t>(number));
      }
    }
    return std::string();
  };
  auto shop = field("runAsShopId");
  auto account = field("loginUserId");
  if (account.empty()) {
    account = field("mainUserId");
  }
  auto name = field("runAsShopTitle");
  if (name.empty()) {
    name = field("runAsUserName");
  }
  if (name.empty()) {
    name = field("mainUserName");
  }
  if (shop.empty() || account.empty() || name.empty() || shop == "0" ||
      account == "0") {
    return std::nullopt;
  }
  return base::DictValue()
      .Set("shopId", shop)
      .Set("accountId", account)
      .Set("platformName", name);
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
      platforms.Append(
          base::DictValue()
              .Set("id", "taobao")
              .Set("name", "淘宝 / 天猫")
              .Set("services",
                   base::ListValue().Append("qianniu").Append("sycm").Append(
                       "alimama")));
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
    if (method == "shops.create") {
      auto name = Field(request, "name");
      base::TrimWhitespaceASCII(name, base::TRIM_ALL, &name);
      if (name.empty() || name.size() > 200 ||
          Field(request, "platform") != "taobao") {
        Send(std::move(callback), Error("INVALID_SHOP_INPUT"));
        return;
      }
      auto list = containers::GetContainersFromPrefs(*profile_->GetPrefs());
      for (const auto& c : list) {
        if (c->name == name) {
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
      Configure(id);
      Send(std::move(callback), List());
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
        if (other->id != id && other->name == c->name) {
          Send(std::move(callback), Error("CONTAINER_NAME_EXISTS"));
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
      if (Field(request, "platform") != "taobao") {
        Send(std::move(callback), Error("PLATFORM_UNSUPPORTED"));
        return;
      }
      if (!Metadata().FindDict(id)) {
        Configure(id);
      }
      Send(std::move(callback), List());
      return;
    }
    if (!Metadata().FindDict(id)) {
      Send(std::move(callback), Error("SHOP_NOT_CONFIGURED"));
      return;
    }
    if (method == "shops.open") {
      const auto service = Field(request, "service");
      std::string url;
      if (service == "sycm" || service.empty()) {
        url = kHome;
      } else if (service == "qianniu") {
        url = "https://myseller.taobao.com/";
      } else if (service == "alimama") {
        url = "https://one.alimama.com/";
      } else {
        Send(std::move(callback), Error("SERVICE_UNSUPPORTED"));
        return;
      }
      NavigateParams params(profile_, GURL(url), ui::PAGE_TRANSITION_FROM_API);
      params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
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
                                    .Set("service", service));
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
  void Configure(const std::string& id) {
    Store(id, base::DictValue()
                  .Set("platform", "taobao")
                  .Set("state", "awaiting-login"));
  }
  base::DictValue List() {
    base::ListValue shops;
    for (const auto& c :
         containers::GetContainersFromPrefs(*profile_->GetPrefs())) {
      auto item = Metadata().FindDict(c->id)
                      ? Metadata().FindDict(c->id)->Clone()
                      : base::DictValue().Set("state", "unconfigured");
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
      if (Metadata().FindDict(container->id) &&
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
      if (!Metadata().FindDict(id) || loaders_.contains(id)) {
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
    const auto identity = body && loader->NetError() == net::OK
                              ? ParseIdentity(*body)
                              : std::nullopt;
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
      item.Set("state", "verification-required");
      item.Set("lastError", "IDENTITY_UNAVAILABLE");
      item.Set("diagnostics", diagnostics.Clone());
      Store(id, std::move(item));
      auto error = Error("IDENTITY_UNAVAILABLE");
      error.FindDict("error")->Set("details", std::move(diagnostics));
      Send(std::move(callback), std::move(error));
      return;
    }
    auto candidate = identity->Clone();
    candidate.Set("verifiedAt",
                  base::NumberToString(base::Time::Now().ToTimeT()));
    candidate.Set("source", "sycm-embedded-metadata");
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
  }
  void OnJavascriptDisallowed() override { weak_.InvalidateWeakPtrs(); }

 private:
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
