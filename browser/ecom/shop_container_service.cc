#include "brave/browser/ecom/shop_container_service.h"

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
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "base/values.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/common/features.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "content/public/browser/storage_partition.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "net/base/net_errors.h"
#include "net/cookies/site_for_cookies.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
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
std::string Field(const base::DictValue &value, const char *key) {
  const auto *text = value.FindString(key);
  return text ? *text : std::string();
}

// Read only whitelisted identity fields from the platform's embedded metadata.
// HTML and credentials never leave the browser. Missing/changed page formats
// fail closed.
std::optional<base::DictValue> ParseIdentity(const std::string &html) {
  std::string block;
  if (!re2::RE2::PartialMatch(
          html,
          re2::RE2(R"re((?s)(?:window\.)?metaCacheData\s*=\s*(\{.+?\})\s*;)re"),
          &block))
    return std::nullopt;
  auto field = [&block](const char *key) {
    std::string value;
    const std::string prefix =
        std::string(R"re((?:["']?)re") + key + R"re(["']?\s*:\s*)re";
    if (re2::RE2::PartialMatch(
            block, re2::RE2(prefix + R"re(("(?:[^"\\]|\\.)*"))re"), &value)) {
      auto parsed = base::JSONReader::Read(value, base::JSON_PARSE_RFC);
      return parsed && parsed->is_string() ? parsed->GetString()
                                           : std::string();
    }
    if (re2::RE2::PartialMatch(block, re2::RE2(prefix + R"re('([^'\\]*)')re"),
                               &value))
      return value;
    if (re2::RE2::PartialMatch(block, re2::RE2(prefix + R"re(([0-9]+))re"),
                               &value))
      return value;
    return std::string();
  };
  auto shop = field("runAsShopId");
  auto account = field("loginUserId");
  if (account.empty())
    account = field("mainUserId");
  auto name = field("runAsShopTitle");
  if (name.empty())
    name = field("runAsUserName");
  if (name.empty())
    name = field("mainUserName");
  if (shop.empty() || account.empty() || name.empty() || shop == "0" ||
      account == "0")
    return std::nullopt;
  return base::DictValue()
      .Set("shopId", shop)
      .Set("accountId", account)
      .Set("platformName", name);
}

class ShopService final : public base::SupportsUserData::Data,
                          public ProfileObserver {
public:
  explicit ShopService(Profile *profile) : profile_(profile) {
    profile_->AddObserver(this);
  }
  ~ShopService() override {
    if (profile_)
      profile_->RemoveObserver(this);
  }
  void OnProfileWillBeDestroyed(Profile *) override {
    weak_.InvalidateWeakPtrs();
    loaders_.clear();
    profile_->RemoveObserver(this);
    profile_ = nullptr;
  }
  void Run(const base::DictValue &request, Reply callback) {
    if (!profile_ || profile_->IsOffTheRecord() ||
        !base::FeatureList::IsEnabled(containers::features::kContainers) ||
        !profile_->GetPrefs()->GetBoolean(
            containers::prefs::kContainersEnabled)) {
      Send(std::move(callback), Error("CONTAINERS_UNAVAILABLE"));
      return;
    }
    const auto method = Field(request, "method");
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
      for (const auto &c : list)
        if (c->name == name) {
          Send(std::move(callback), Error("CONTAINER_NAME_EXISTS"));
          return;
        }
      auto c = containers::mojom::Container::New();
      c->id = base::Uuid::GenerateRandomV4().AsLowercaseString();
      c->name = name;
      c->icon = containers::mojom::Icon::kShopping;
      c->background_color = 0xFF007F83;
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
    if (method == "shops.configure") {
      if (Field(request, "platform") != "taobao") {
        Send(std::move(callback), Error("PLATFORM_UNSUPPORTED"));
        return;
      }
      if (!Metadata().FindDict(id))
        Configure(id);
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
      if (service == "sycm" || service.empty())
        url = kHome;
      else if (service == "qianniu")
        url = "https://myseller.taobao.com/";
      else if (service == "alimama")
        url = "https://one.alimama.com/";
      else {
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
      const auto *old = Metadata().FindDict(id);
      const auto *candidate = old->FindDict("candidate");
      if (!candidate ||
          Field(*candidate, "shopId") != Field(request, "shopId") ||
          Field(*candidate, "candidateId") != Field(request, "candidateId")) {
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
  const base::DictValue &Metadata() {
    return profile_->GetPrefs()->GetDict(containers::prefs::kShopContainers);
  }
  void Store(const std::string &id, base::DictValue value) {
    ScopedDictPrefUpdate update(profile_->GetPrefs(),
                                containers::prefs::kShopContainers);
    update->Set(id, std::move(value));
  }
  void Configure(const std::string &id) {
    Store(id, base::DictValue()
                  .Set("platform", "taobao")
                  .Set("state", "awaiting-login"));
  }
  base::DictValue List() {
    base::ListValue shops;
    for (const auto &c :
         containers::GetContainersFromPrefs(*profile_->GetPrefs())) {
      auto item = Metadata().FindDict(c->id)
                      ? Metadata().FindDict(c->id)->Clone()
                      : base::DictValue().Set("state", "unconfigured");
      item.Set("id", c->id);
      item.Set("name", c->name);
      shops.Append(std::move(item));
    }
    return base::DictValue().Set("ok", true).Set("shops", std::move(shops));
  }
  void Verify(const std::string &id, Reply callback) {
    if (loaders_.contains(id)) {
      Send(std::move(callback), Error("BUSY"));
      return;
    }
    auto resource = std::make_unique<network::ResourceRequest>();
    resource->url = GURL(kHome);
    resource->credentials_mode = network::mojom::CredentialsMode::kInclude;
    resource->redirect_mode = network::mojom::RedirectMode::kError;
    resource->site_for_cookies = net::SiteForCookies::FromUrl(resource->url);
    resource->request_initiator = url::Origin::Create(resource->url);
    resource->headers.SetHeader("Accept", "text/html");
    constexpr auto annotation =
        net::DefineNetworkTrafficAnnotation("ecom_shop_identity", R"(
      semantics { sender: "Ecom shop containers" description: "Checks shop identity in the selected container."
        trigger: "User requests shop verification." data: "Eligible container cookies." destination: WEBSITE }
      policy { cookies_allowed: YES cookies_store: "Selected container" setting: "Explicit shop verification."
        policy_exception_justification: "User managed local shop containers." })");
    auto loader =
        network::SimpleURLLoader::Create(std::move(resource), annotation);
    loader->SetTimeoutDuration(base::Seconds(20));
    auto *pending = loader.get();
    loaders_[id] = std::move(loader);
    const auto config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, id, false);
    auto factory = profile_->GetStoragePartition(config)
                       ->GetURLLoaderFactoryForBrowserProcess();
    pending->DownloadToString(factory.get(),
                              base::BindOnce(&ShopService::Verified,
                                             weak_.GetWeakPtr(), id,
                                             std::move(callback)),
                              2 * 1024 * 1024);
  }
  void Verified(const std::string &id, Reply callback,
                std::optional<std::string> body) {
    auto loader = std::move(loaders_.at(id));
    loaders_.erase(id);
    if (!containers::GetContainerFromPrefs(*profile_->GetPrefs(), id) ||
        !Metadata().FindDict(id)) {
      Send(std::move(callback), Error("CONTAINER_NOT_FOUND"));
      return;
    }
    auto item = Metadata().FindDict(id)->Clone();
    item.Remove("candidate");
    const auto identity = body && loader->NetError() == net::OK
                              ? ParseIdentity(*body)
                              : std::nullopt;
    if (!identity) {
      item.Set("state", "verification-required");
      item.Set("lastError", "IDENTITY_UNAVAILABLE");
      Store(id, std::move(item));
      Send(std::move(callback), Error("IDENTITY_UNAVAILABLE"));
      return;
    }
    auto candidate = identity->Clone();
    candidate.Set("verifiedAt",
                  base::NumberToString(base::Time::Now().ToTimeT()));
    candidate.Set("source", "sycm-embedded-metadata");
    const auto *bound = item.FindDict("identity");
    if (bound &&
        (Field(*bound, "shopId") != Field(candidate, "shopId") ||
         Field(*bound, "accountId") != Field(candidate, "accountId"))) {
      item.Set("state", "identity-mismatch");
      Store(id, std::move(item));
      Send(std::move(callback), Error("SHOP_IDENTITY_MISMATCH"));
      return;
    }
    item.Remove("lastError");
    if (bound) {
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
  std::map<std::string, std::unique_ptr<network::SimpleURLLoader>> loaders_;
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
  void Handle(const base::ListValue &args) {
    if (args.size() != 2 || !args[0].is_string() || !args[1].is_string())
      return;
    AllowJavascript();
    RunShopCommand(Profile::FromWebUI(web_ui()), args[1].GetString(),
                   base::BindOnce(&ShopSettingsHandler::Done,
                                  weak_.GetWeakPtr(), args[0].Clone()));
  }
  void Done(base::Value id, std::string value) {
    if (IsJavascriptAllowed())
      ResolveJavascriptCallback(id, base::Value(value));
  }
  base::WeakPtrFactory<ShopSettingsHandler> weak_{this};
};
} // namespace
void RunShopCommand(Profile *profile, std::string request, Reply callback) {
  auto parsed = base::JSONReader::Read(request, base::JSON_PARSE_RFC);
  if (!parsed || !parsed->is_dict() || request.size() > 32768) {
    Send(std::move(callback), Error("INVALID_ARGUMENT"));
    return;
  }
  if (profile->IsOffTheRecord()) {
    Send(std::move(callback), Error("PRIVATE_PROFILE_UNSUPPORTED"));
    return;
  }
  auto *service = static_cast<ShopService *>(profile->GetUserData(kServiceKey));
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
} // namespace ecom
