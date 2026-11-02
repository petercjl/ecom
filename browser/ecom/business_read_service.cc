// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#include "brave/browser/ecom/business_read_service.h"

#include <optional>
#include <string_view>
#include <utility>

#include "base/check.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/timer/timer.h"
#include "brave/browser/ecom/shop_identity_parser.h"
#include "brave/browser/ecom/sycm_read_registry.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "components/embedder_support/user_agent_utils.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/storage_partition.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/web_contents.h"
#include "net/base/isolation_info.h"
#include "net/base/load_flags.h"
#include "net/base/net_errors.h"
#include "net/base/url_util.h"
#include "net/cookies/canonical_cookie.h"
#include "net/cookies/cookie_access_result.h"
#include "net/cookies/cookie_options.h"
#include "net/cookies/cookie_partition_key_collection.h"
#include "net/cookies/site_for_cookies.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/cookie_manager.mojom.h"
#include "services/network/public/mojom/fetch_api.mojom.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "third_party/re2/src/re2/re2.h"
#include "url/gurl.h"
#include "url/origin.h"

namespace ecom {
namespace {
std::string Field(const base::DictValue& value, std::string_view key) {
  const auto* field = value.Find(key);
  if (!field || field->is_none()) {
    return {};
  }
  return field->is_string() ? field->GetString()
                            : base::WriteJson(*field).value_or("");
}
bool CredentialInput(const base::Value& value) {
  if (value.is_dict()) {
    for (auto [key, child] : value.GetDict()) {
      const auto lower = base::ToLowerASCII(key);
      if (lower.find("token") != std::string::npos ||
          lower.find("cookie") != std::string::npos ||
          lower.find("csrf") != std::string::npos ||
          lower.find("password") != std::string::npos ||
          lower.find("passwd") != std::string::npos ||
          lower.find("credential") != std::string::npos ||
          lower.find("api_key") != std::string::npos ||
          lower.find("api-key") != std::string::npos || lower == "apikey" ||
          lower == "sessionid" || lower.find("secret") != std::string::npos ||
          lower == "authorization" || CredentialInput(child)) {
        return true;
      }
    }
  } else if (value.is_list()) {
    for (const auto& child : value.GetList()) {
      if (CredentialInput(child)) {
        return true;
      }
    }
  } else if (value.is_string()) {
    const auto lower = base::ToLowerASCII(value.GetString());
    return lower.find("token=") != std::string::npos ||
           lower.find("csrf=") != std::string::npos ||
           lower.find("cookie=") != std::string::npos ||
           lower.find("password=") != std::string::npos;
  }
  return false;
}
const base::DictValue* Spec(const std::string& operation) {
  static const base::NoDestructor<base::DictValue> registry([] {
    auto value =
        base::JSONReader::Read(kSycmReadRegistry, base::JSON_PARSE_RFC);
    CHECK(value && value->is_dict());
    return std::move(value->GetDict());
  }());
  return registry->FindDict(operation);
}

class Read final : public BusinessRead {
 public:
  Read(Profile* profile,
       std::string container,
       std::string operation,
       base::DictValue params,
       base::OnceCallback<void(base::DictValue)> callback)
      : profile_(profile),
        container_(std::move(container)),
        operation_(std::move(operation)),
        params_(std::move(params)),
        callback_(std::move(callback)) {}

  void Start() override {
    spec_ = Spec(operation_);
    if (!spec_) {
      Fail("UNKNOWN_OPERATION");
      return;
    }
    if (CredentialInput(base::Value(params_.Clone()))) {
      Fail("CREDENTIAL_INPUT_REJECTED");
      return;
    }
    for (const auto& key : *spec_->FindList("requiredParams")) {
      if (Field(params_, key.GetString()).empty()) {
        Fail("INVALID_ARGUMENT");
        return;
      }
    }
    auto effective = spec_->FindDict("defaultParams")->Clone();
    effective.Merge(std::move(params_));
    params_ = std::move(effective);
    timer_.Start(FROM_HERE, base::Seconds(50),
                 base::BindOnce(&Read::Fail, weak_.GetWeakPtr(),
                                "BUSINESS_READ_TIMEOUT"));
    const auto service = Field(*spec_, "service");
    if (service == "sycm" || service == "sycm-trade") {
      Network(GURL("https://sycm.taobao.com/portal/home.htm"), "GET", "",
              Stage::kSycm);
    } else if (service == "alimama") {
      if (operation_ == "alimama.access") {
        Submit();
      } else {
        auto access = base::DictValue()
                          .Set("bizCode", Field(*spec_, "accessBizCode").empty()
                                              ? "universalBP"
                                              : Field(*spec_, "accessBizCode"))
                          .Set("r", "mx_13");
        Network(GURL("https://one.alimama.com/member/checkAccess.json"), "POST",
                base::WriteJson(access).value_or("{}"), Stage::kAccess);
      }
    } else if (service == "dmp" || service == "coupon") {
      ReadCookie();
    } else {
      Fail("SERVICE_ADAPTER_REQUIRED");
    }
  }

 private:
  enum class Stage { kSycm, kAccess, kDmp, kResult };
  content::StoragePartition* Partition() {
    if (!containers::GetContainerFromPrefs(*profile_->GetPrefs(), container_)) {
      return nullptr;
    }
    return profile_->GetStoragePartition(
        content::StoragePartitionConfig::Create(
            profile_, containers::kContainersStoragePartitionDomain, container_,
            false));
  }
  void Fail(std::string code) {
    timer_.Stop();
    loader_.reset();
    auto diagnostics = base::DictValue()
                           .Set("phase", phase_)
                           .Set("netError", net_error_)
                           .Set("bodyKind", body_kind_)
                           .Set("matchingTabFound", matching_tab_found_)
                           .Set("publicScripts", public_scripts_.Clone());
    std::move(callback_).Run(
        base::DictValue()
            .Set("ok", false)
            .Set("error", base::DictValue()
                              .Set("code", std::move(code))
                              .Set("executed", submitted_)
                              .Set("httpStatus", last_status_)
                              .Set("diagnostics", std::move(diagnostics))));
  }
  void ReadCookie() {
    phase_ = "auth-cookie";
    auto* partition = Partition();
    if (!partition) {
      Fail("CONTAINER_NOT_FOUND");
      return;
    }
    partition->GetCookieManagerForBrowserProcess()->GetCookieList(
        GURL(Field(*spec_, "entryUrl")), net::CookieOptions::MakeAllInclusive(),
        net::CookiePartitionKeyCollection(),
        base::BindOnce(&Read::CookieRead, weak_.GetWeakPtr()));
  }
  void CookieRead(const net::CookieAccessResultList& included,
                  const net::CookieAccessResultList&) {
    for (const auto& item : included) {
      if (item.cookie.Name() == "_tb_token_") {
        params_.Set("_tb_token_", item.cookie.Value());
        break;
      }
    }
    if (Field(params_, "_tb_token_").empty()) {
      Fail("AUTH_CONTEXT_REQUIRED");
      return;
    }
    if (Field(*spec_, "service") == "dmp") {
      Network(GURL("https://dmp.taobao.com/index_new.html"), "GET", "",
              Stage::kDmp);
    } else {
      Submit();
    }
  }
  void DmpContext(std::string html) {
    phase_ = "auth-dmp-context";
    re2::StringPiece scripts(html);
    const re2::RE2 script_pattern(
        R"re((?i)<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'])re");
    std::string src;
    while (public_scripts_.size() < 20 &&
           re2::RE2::FindAndConsume(&scripts, script_pattern, &src)) {
      AddPublicScript(src);
    }
    std::string csrf;
    if (re2::RE2::PartialMatch(
            html, R"re(["']csrfId["']\s*:\s*["']([^"']+)["'])re", &csrf)) {
      params_.Set("bizCode", "dmp");
      params_.Set("_csrf", csrf);
      params_.Set("csrfId", csrf);
      Submit();
      return;
    }
    // Read only first-party inline configuration from an existing container
    // tab. No tab is created, navigated or activated; page globals are not
    // exposed.
    content::RenderFrameHost* frame = nullptr;
    ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
        [&](BrowserWindowInterface* browser) {
          if (browser->GetProfile() == profile_) {
            auto* tabs = browser->GetTabStripModel();
            for (int i = 0; tabs && i < tabs->count(); ++i) {
              auto* contents = tabs->GetWebContentsAt(i);
              if (containers::GetContainerIdForWebContents(contents) ==
                      container_ &&
                  contents->GetLastCommittedURL().SchemeIs("https") &&
                  contents->GetLastCommittedURL().host() == "dmp.taobao.com") {
                frame = contents->GetPrimaryMainFrame();
                return false;
              }
            }
          }
          return true;
        });
    if (!frame) {
      Fail("AUTH_CONTEXT_REQUIRED");
      return;
    }
    matching_tab_found_ = true;
    frame->ExecuteJavaScriptInIsolatedWorld(
        uR"js((()=>{if(location.origin!=='https://dmp.taobao.com')return null;
          const s=Array.from(document.scripts).slice(0,100)
            .map(x=>(x.textContent||'').slice(0,131072)).join('\n').slice(0,2097152);
          const m=s.match(/["']csrfId["']\s*:\s*["']([^"']+)["']/);
          return {context:m?m[1]:'',scripts:Array.from(document.scripts)
            .slice(0,100).map(x=>x.src).filter(Boolean)};})())js",
        base::BindOnce(&Read::DmpDomContext, weak_.GetWeakPtr()),
        ISOLATED_WORLD_ID_BRAVE_INTERNAL);
  }
  void DmpDomContext(base::Value value) {
    phase_ = "auth-dmp-dom";
    if (!value.is_dict()) {
      Fail("AUTH_CONTEXT_REQUIRED");
      return;
    }
    if (const auto* scripts = value.GetDict().FindList("scripts")) {
      for (const auto& src : *scripts) {
        if (src.is_string()) {
          AddPublicScript(src.GetString());
        }
      }
    }
    const auto context = Field(value.GetDict(), "context");
    if (context.empty() || context.size() > 4096) {
      Fail("AUTH_CONTEXT_REQUIRED");
      return;
    }
    params_.Set("bizCode", "dmp");
    params_.Set("_csrf", context);
    params_.Set("csrfId", context);
    Submit();
  }
  void Network(const GURL& url,
               const std::string& method,
               const std::string& body,
               Stage stage) {
    auto* partition = Partition();
    if (!partition) {
      Fail("CONTAINER_NOT_FOUND");
      return;
    }
    const GURL entry(Field(*spec_, "entryUrl"));
    phase_ = stage == Stage::kSycm     ? "auth-sycm-home"
             : stage == Stage::kAccess ? "auth-alimama-access"
             : stage == Stage::kDmp    ? "auth-dmp-portal"
                                       : "business-read";
    last_status_ = 0;
    net_error_ = 0;
    body_kind_ = "none";
    auto request = std::make_unique<network::ResourceRequest>();
    request->url = url;
    request->method = method;
    request->credentials_mode = network::mojom::CredentialsMode::kInclude;
    request->redirect_mode = network::mojom::RedirectMode::kError;
    request->mode = network::mojom::RequestMode::kCors;
    request->site_for_cookies = net::SiteForCookies::FromUrl(entry);
    request->request_initiator = url::Origin::Create(entry);
    request->trusted_params = network::ResourceRequest::TrustedParams();
    request->trusted_params->isolation_info =
        net::IsolationInfo::CreateForInternalRequest(
            url::Origin::Create(entry));
    request->referrer = Field(*spec_, "service").starts_with("sycm")
                            ? GURL("https://sycm.taobao.com/portal/home.htm")
                            : entry;
    request->load_flags = net::LOAD_BYPASS_CACHE | net::LOAD_DISABLE_CACHE;
    request->headers.SetHeader("Accept", "application/json,text/html");
    request->headers.SetHeader("User-Agent", embedder_support::GetUserAgent());
    constexpr auto annotation =
        net::DefineNetworkTrafficAnnotation("ecom_registered_business_read", R"(
          semantics { sender: "Ecom registered business reads"
            description: "Reads a compiled registered business endpoint using an explicitly selected container. Authentication context remains browser-private."
            trigger: "An authenticated local CLI read command."
            data: "Validated read parameters and container website credentials."
            destination: WEBSITE }
          policy { cookies_allowed: YES cookies_store: "Selected Ecom container"
            setting: "Ordinary Ecom native CLI with a fixed read-only catalog."
            policy_exception_justification: "An explicitly invoked local browser capability." })");
    loader_ = network::SimpleURLLoader::Create(std::move(request), annotation);
    if (method == "POST") {
      loader_->AttachStringForUpload(body, "application/json");
    }
    loader_->SetTimeoutDuration(base::Seconds(15));
    loader_->SetAllowHttpErrorResults(true);
    if (stage == Stage::kResult) {
      submitted_ = true;
    }
    loader_->DownloadToString(
        partition->GetURLLoaderFactoryForBrowserProcess().get(),
        base::BindOnce(&Read::Received, weak_.GetWeakPtr(), stage),
        2 * 1024 * 1024);
  }
  void Received(Stage stage, std::optional<std::string> body) {
    const int status =
        loader_->ResponseInfo() && loader_->ResponseInfo()->headers
            ? loader_->ResponseInfo()->headers->response_code()
            : 0;
    last_status_ = status;
    net_error_ = loader_->NetError();
    if (body) {
      std::string prefix = base::ToLowerASCII(body->substr(0, 256));
      base::TrimWhitespaceASCII(prefix, base::TRIM_ALL, &prefix);
      body_kind_ = prefix.starts_with("{") || prefix.starts_with("[") ? "json"
                   : prefix.find("<html") != std::string::npos ||
                           prefix.starts_with("<!doctype")
                       ? "html"
                       : "text";
    }
    const bool success =
        loader_->NetError() == net::OK && status == 200 && body;
    loader_.reset();
    if (!success) {
      if (stage == Stage::kDmp) {
        DmpContext("");
        return;
      }
      Fail(status == 401 || status == 403 ? "AUTH_OR_RISK_CHALLENGE"
                                          : "REQUEST_FAILED");
      return;
    }
    if (stage == Stage::kSycm) {
      sycm_token_ = ExtractSycmLegalityToken(*body).value_or("");
      Submit();
      return;
    }
    if (stage == Stage::kDmp) {
      DmpContext(std::move(*body));
      return;
    }
    auto json = base::JSONReader::Read(*body, base::JSON_PARSE_RFC);
    if (!json || !json->is_dict()) {
      Fail("NON_JSON_RESPONSE");
      return;
    }
    if (stage == Stage::kAccess) {
      const auto* data = json->GetDict().FindDict("data");
      if (!data) {
        data = json->GetDict().FindDict("result");
      }
      const auto* info = data ? data->FindDict("accessInfo") : nullptr;
      if (!info) {
        info = data;
      }
      const auto code = Field(json->GetDict(), "code");
      const auto csrf =
          info ? (Field(*info, "csrfId").empty() ? Field(*info, "csrfID")
                                                 : Field(*info, "csrfId"))
               : "";
      if ((!code.empty() && code != "0" && code != "200" &&
           code != "SUCCESS") ||
          json->GetDict().FindBool("success") == false || !info ||
          csrf.empty()) {
        Fail("AUTH_CONTEXT_REQUIRED");
        return;
      }
      params_.Set("csrfId", csrf);
      const auto point = Field(*info, "loginPointId").empty() && data
                             ? Field(*data, "loginPointId")
                             : Field(*info, "loginPointId");
      if (!point.empty()) {
        params_.Set("loginPointId", point);
      }
      Submit();
      return;
    }
    timer_.Stop();
    std::move(callback_).Run(base::DictValue()
                                 .Set("ok", true)
                                 .Set("containerId", container_)
                                 .Set("businessOperation", operation_)
                                 .Set("httpStatus", 200)
                                 .Set("data", std::move(*json)));
  }
  void Submit() {
    base::DictValue payload = params_.Clone();
    if (Field(*spec_, "requestShape") == "alimama-dynamic-module") {
      auto module_params = params_.Clone();
      module_params.Remove("csrfId");
      module_params.Remove("loginPointId");
      payload = base::DictValue()
                    .Set("moduleId", spec_->Find("moduleId")->Clone())
                    .Set("bizCode", Field(*spec_, "bizCode"))
                    .Set("params", std::move(module_params));
      for (const auto key : {"csrfId", "loginPointId"}) {
        if (const auto* value = params_.Find(key)) {
          payload.Set(key, value->Clone());
        }
      }
    }
    GURL url(Field(*spec_, "origin") + Field(*spec_, "path"));
    const auto method = Field(*spec_, "method");
    if (method == "GET") {
      for (auto [key, value] : payload) {
        if (!value.is_none()) {
          url = net::AppendQueryParameter(url, key, Field(payload, key));
        }
      }
      // The platform's own metadata token is already query-encoded.
      if (!sycm_token_.empty()) {
        url = GURL(url.spec() + (url.has_query() ? "&" : "?") +
                   "token=" + sycm_token_);
      }
    }
    Network(url, method,
            method == "POST" ? base::WriteJson(payload).value_or("{}") : "",
            Stage::kResult);
  }

  void AddPublicScript(const std::string& value) {
    const GURL url = GURL(Field(*spec_, "entryUrl")).Resolve(value);
    if (public_scripts_.size() >= 20 || !url.SchemeIs("https") ||
        url.host() != "g.alicdn.com" || !url.path().ends_with(".js") ||
        url.has_username() || url.has_password()) {
      return;
    }
    GURL::Replacements clean;
    clean.ClearQuery();
    clean.ClearRef();
    public_scripts_.Append(url.ReplaceComponents(clean).spec());
  }

  const raw_ptr<Profile> profile_;
  const std::string container_;
  const std::string operation_;
  raw_ptr<const base::DictValue> spec_ = nullptr;
  base::DictValue params_;
  std::string sycm_token_;
  bool submitted_ = false;
  int last_status_ = 0;
  int net_error_ = 0;
  std::string phase_ = "validation";
  std::string body_kind_ = "none";
  bool matching_tab_found_ = false;
  base::ListValue public_scripts_;
  base::OnceCallback<void(base::DictValue)> callback_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  base::OneShotTimer timer_;
  base::WeakPtrFactory<Read> weak_{this};
};
}  // namespace

std::unique_ptr<BusinessRead> CreateBusinessRead(
    Profile* profile,
    std::string container_id,
    std::string operation,
    base::DictValue params,
    base::OnceCallback<void(base::DictValue)> callback) {
  return std::make_unique<Read>(profile, std::move(container_id),
                                std::move(operation), std::move(params),
                                std::move(callback));
}
}  // namespace ecom
