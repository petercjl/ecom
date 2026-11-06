// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#include "brave/browser/ecom/business_read_service.h"
#include "brave/browser/ecom/memory_actions.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <optional>
#include <string_view>
#include <utility>
#include <vector>

#include "base/base64.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/containers/span.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/timer/timer.h"
#include "brave/browser/ecom/shop_identity_parser.h"
#include "brave/browser/ecom/sycm_read_registry.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "components/embedder_support/user_agent_utils.h"
#include "components/prefs/pref_service.h"
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
#include "crypto/sign.h"
#include "url/gurl.h"
#include "url/origin.h"

namespace ecom {
namespace {
std::string Field(const base::DictValue &value, std::string_view key) {
  const auto *field = value.Find(key);
  if (!field || field->is_none()) {
    return {};
  }
  return field->is_string() ? field->GetString()
                            : base::WriteJson(*field).value_or("");
}
std::optional<int64_t> NumericId(const base::Value *value) {
  if (!value)
    return std::nullopt;
  if (value->is_int())
    return value->GetInt();
  if (value->is_string()) {
    int64_t number;
    if (base::StringToInt64(value->GetString(), &number))
      return number;
  } else if (value->is_double()) {
    const auto number = value->GetDouble();
    if (std::isfinite(number) && number >= 0 && number <= 9007199254740991.0 &&
        std::trunc(number) == number)
      return static_cast<int64_t>(number);
  }
  return std::nullopt;
}
bool CredentialInput(const base::Value &value) {
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
          lower == "sessionid" || lower == "session" || lower == "__tk" ||
          lower == "__dtk" || lower == "loginpointid" ||
          lower.find("secret") != std::string::npos ||
          lower == "authorization" || CredentialInput(child)) {
        return true;
      }
    }
  } else if (value.is_list()) {
    for (const auto &child : value.GetList()) {
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
bool HasTemplate(const base::Value &value) {
  if (value.is_string()) {
    const auto &text = value.GetString();
    return text.size() > 4 && text.starts_with("##") && text.ends_with("##");
  }
  if (value.is_list()) {
    for (const auto &child : value.GetList())
      if (HasTemplate(child))
        return true;
  } else if (value.is_dict()) {
    for (auto [key, child] : value.GetDict())
      if (HasTemplate(child))
        return true;
  }
  return false;
}
void CollectDataFlows(const base::Value &value, std::vector<int64_t> &ids) {
  if (value.is_list()) {
    for (const auto &child : value.GetList())
      CollectDataFlows(child, ids);
  } else if (value.is_dict()) {
    if (const auto *list = value.GetDict().FindList("dataFlowIdList")) {
      for (const auto &id : *list)
        if (auto number = NumericId(&id);
            number && *number > 0 && *number <= 9007199254740991LL &&
            std::find(ids.begin(), ids.end(), *number) == ids.end())
          ids.push_back(*number);
    }
    for (auto [key, child] : value.GetDict())
      CollectDataFlows(child, ids);
  }
}
const base::DictValue *Spec(const std::string &operation) {
  if (operation == "xhs.self-cookie-probe" && SupportsSignedBusinessRoutes()) {
    static const base::NoDestructor<base::DictValue> self(
        base::DictValue()
            .Set("service", "xiaohongshu")
            .Set("origin", "https://edith.xiaohongshu.com")
            .Set("entryUrl", "https://www.xiaohongshu.com/")
            .Set("path", "/api/sns/web/v1/user/selfinfo")
            .Set("method", "GET")
            .Set("requiredParams", base::ListValue())
            .Set("defaultParams", base::DictValue()));
    return self.get();
  }
  if (operation == "xhs.search-v2-cookie-probe" && SupportsSignedBusinessRoutes()) {
    static const base::NoDestructor<base::DictValue> search(
        base::DictValue()
            .Set("service", "xiaohongshu")
            .Set("origin", "https://so.xiaohongshu.com")
            .Set("entryUrl", "https://www.xiaohongshu.com/")
            .Set("path", "/api/sns/web/v2/search/notes")
            .Set("method", "POST")
            .Set("requiredParams", base::ListValue().Append("keyword").Append("search_id"))
            .Set("defaultParams", base::DictValue()
                                      .Set("page", 1)
                                      .Set("page_size", 20)
                                      .Set("sort", "general")
                                      .Set("note_type", 0)));
    return search.get();
  }
  if (operation == "xhs.search-cookie-probe" && SupportsSignedBusinessRoutes()) {
    static const base::NoDestructor<base::DictValue> probe(
        base::DictValue()
            .Set("service", "xiaohongshu")
            .Set("origin", "https://edith.xiaohongshu.com")
            .Set("entryUrl", "https://www.xiaohongshu.com/")
            .Set("path", "/api/sns/web/v1/search/notes")
            .Set("method", "POST")
            .Set("requiredParams", base::ListValue().Append("keyword").Append("search_id"))
            .Set("defaultParams", base::DictValue()
                                      .Set("page", 1)
                                      .Set("page_size", 20)
                                      .Set("sort", "general")
                                      .Set("note_type", 0)));
    return probe.get();
  }
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
  Read(Profile *profile, std::string container, std::string operation,
       base::DictValue params,
       std::optional<base::DictValue> signed_spec,
       base::OnceCallback<void(base::DictValue)> callback)
      : profile_(profile), container_(std::move(container)),
        operation_(std::move(operation)), signed_spec_(std::move(signed_spec)),
        params_(std::move(params)),
        callback_(std::move(callback)) {}

  void Start() override {
    if (operation_ == "xhs.search-page" && SupportsSignedBusinessRoutes()) {
      OpenXhsSearch();
      return;
    }
    spec_ = signed_spec_ ? &*signed_spec_ : Spec(operation_);
    if (!spec_) {
      Fail("UNKNOWN_OPERATION");
      return;
    }
    if (CredentialInput(base::Value(params_.Clone()))) {
      Fail("CREDENTIAL_INPUT_REJECTED");
      return;
    }
    for (const auto &key : *spec_->FindList("requiredParams")) {
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
      ReadAlimamaContext();
    } else if (service == "xiaohongshu") {
      auto* partition = Partition();
      if (!partition) {
        Fail("CONTAINER_NOT_FOUND");
        return;
      }
      partition->GetCookieManagerForBrowserProcess()->GetCookieList(
          GURL(Field(*spec_, "origin") + Field(*spec_, "path")),
          net::CookieOptions::MakeAllInclusive(),
          net::CookiePartitionKeyCollection(),
          base::BindOnce(&Read::XhsCookiesRead, weak_.GetWeakPtr()));
    } else if (service == "dmp" || service == "coupon") {
      ReadCookie();
    } else {
      Fail("SERVICE_ADAPTER_REQUIRED");
    }
  }

private:
  enum class Stage { kSycm, kAccess, kDmpUser, kResult, kDataFlow };
  void OpenXhsSearch() {
    if (!Partition()) {
      Fail("CONTAINER_NOT_FOUND");
      return;
    }
    const auto keyword = Field(params_, "keyword");
    auto url = net::AppendQueryParameter(
        GURL("https://www.xiaohongshu.com/search_result"), "keyword", keyword);
    url = net::AppendQueryParameter(url, "source", "web_explore_feed");
    NavigateParams navigation(profile_, url, ui::PAGE_TRANSITION_FROM_API);
    navigation.disposition = WindowOpenDisposition::NEW_BACKGROUND_TAB;
    navigation.storage_partition_config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, container_, false);
    Navigate(&navigation);
    auto* contents = navigation.navigated_or_inserted_contents.get();
    if (!contents || containers::GetContainerIdForWebContents(contents) != container_) {
      Fail("CONTAINER_NAVIGATION_FAILED");
      return;
    }
    xhs_page_ = contents->GetWeakPtr();
    memory_task_ = ProtectMemoryPageTask(contents);
    submitted_ = true;
    phase_ = "xhs-page-search";
    timer_.Start(FROM_HERE, base::Seconds(23),
                 base::BindOnce(&Read::Fail, weak_.GetWeakPtr(), "XHS_SEARCH_TIMEOUT"));
    PollXhsPage();
  }
  void PollXhsPage() {
    if (!xhs_page_ ||
        containers::GetContainerIdForWebContents(xhs_page_.get()) != container_) {
      Fail("XHS_SEARCH_PAGE_CLOSED");
      return;
    }
    auto* frame = xhs_page_->GetPrimaryMainFrame();
    if (!frame || frame->GetLastCommittedURL().host() != "www.xiaohongshu.com") {
      ScheduleXhsPoll();
      return;
    }
    const auto keyword = base::WriteJson(base::Value(Field(params_, "keyword"))).value();
    auto script = std::string(R"JS(((keyword) => {
      if (location.origin !== 'https://www.xiaohongshu.com') return JSON.stringify({state:'wrong-page'});
      const visible = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
      if ([...document.querySelectorAll('.login-container, .login-modal')].some(visible))
        return JSON.stringify({state:'login-required'});
      if ([...document.querySelectorAll('[class*=captcha], iframe[src*=captcha]')].some(visible))
        return JSON.stringify({state:'verification-required'});
      if (location.pathname !== '/search_result' || new URLSearchParams(location.search).get('keyword') !== keyword)
        return JSON.stringify({state:'waiting'});
      const items = [...document.querySelectorAll('section.note-item')].slice(0,20).map(el => {
        const anchor = [...el.querySelectorAll('a[href]')].find(a => /\/(search_result|explore)\/[a-f0-9]{24}/.test(a.pathname));
        const id = anchor?.pathname.match(/\/(?:search_result|explore)\/([a-f0-9]{24})/)?.[1];
        const title = el.querySelector('.title')?.textContent.trim().slice(0,500) || '';
        return id ? {id,title,author:el.querySelector('.author .name, .name')?.textContent.trim().slice(0,100)||'',likes:el.querySelector('.like-wrapper .count')?.textContent.trim().slice(0,30)||'',url:'https://www.xiaohongshu.com/explore/'+id} : null;
      }).filter(Boolean);
      return JSON.stringify(items.length ? {state:'ready',keyword,items} : {state:'waiting'});
    }))JS") + "(" + keyword + ")";
    frame->ExecuteJavaScriptInIsolatedWorld(
        base::UTF8ToUTF16(script),
        base::BindOnce(&Read::XhsPageRead, weak_.GetWeakPtr()),
        ISOLATED_WORLD_ID_CHROME_INTERNAL);
  }
  void ScheduleXhsPoll() {
    xhs_poll_.Start(FROM_HERE, base::Milliseconds(500),
                    base::BindOnce(&Read::PollXhsPage, weak_.GetWeakPtr()));
  }
  void XhsPageRead(base::Value script_result) {
    if (!script_result.is_string()) {
      Fail("XHS_PAGE_RESULT_INVALID");
      return;
    }
    auto json = base::JSONReader::Read(script_result.GetString(), base::JSON_PARSE_RFC);
    if (!json || !json->is_dict()) {
      Fail("XHS_PAGE_RESULT_INVALID");
      return;
    }
    const auto state = Field(json->GetDict(), "state");
    if (state == "login-required" || state == "verification-required") {
      Fail(state == "login-required" ? "XHS_LOGIN_REQUIRED" : "XHS_VERIFICATION_REQUIRED");
      return;
    }
    if (state != "ready") {
      ScheduleXhsPoll();
      return;
    }
    timer_.Stop();
    bool close_requested = false;
    std::string current_keyword;
    if (xhs_page_ && xhs_page_->GetLastCommittedURL().SchemeIs("https") &&
        xhs_page_->GetLastCommittedURL().host() == "www.xiaohongshu.com" &&
        xhs_page_->GetLastCommittedURL().path() == "/search_result" &&
        net::GetValueForKeyInQuery(xhs_page_->GetLastCommittedURL(), "keyword", &current_keyword) &&
        current_keyword == Field(params_, "keyword")) {
      bool selected = false;
      ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
          [&](BrowserWindowInterface* browser) {
            if (browser->GetProfile() == profile_ && browser->GetTabStripModel() &&
                browser->GetTabStripModel()->GetActiveWebContents() == xhs_page_.get())
              selected = true;
            return true;
          });
      if (!selected) {
        xhs_page_->ClosePage();
        close_requested = true;
      }
    }
    auto result = base::Value(base::DictValue()
        .Set("pageClosed", false)
        .Set("success", true)
        .Set("transport", "background-page-dom")
        .Set("keyword", Field(params_, "keyword"))
        .Set("data", std::move(json->GetDict())));
    if (close_requested)
      CompleteXhsPage(std::move(result), 0);
    else
      Finish(std::move(result));
  }
  void CompleteXhsPage(base::Value result, int attempts) {
    if (xhs_page_ && attempts < 10) {
      xhs_poll_.Start(FROM_HERE, base::Milliseconds(100),
          base::BindOnce(&Read::CompleteXhsPage, weak_.GetWeakPtr(),
                         std::move(result), attempts + 1));
      return;
    }
    result.GetDict().Set("pageClosed", !xhs_page_);
    Finish(std::move(result));
  }

  void XhsCookiesRead(const net::CookieAccessResultList& included,
                      const net::CookieAccessResultList&) {
    entry_cookie_count_ = static_cast<int>(included.size());
    if (std::none_of(included.begin(), included.end(), [](const auto& entry) {
          return entry.cookie.Name() == "web_session" &&
                 !entry.cookie.Value().empty();
        })) {
      Fail("XHS_SESSION_COOKIE_MISSING");
      return;
    }
    Submit();
  }
  void ReadAlimamaContext() {
    phase_ = "auth-cookie-metadata";
    auto *partition = Partition();
    if (!partition) {
      Fail("CONTAINER_NOT_FOUND");
      return;
    }
    partition->GetCookieManagerForBrowserProcess()->GetCookieList(
        GURL(Field(*spec_, "entryUrl")), net::CookieOptions::MakeAllInclusive(),
        net::CookiePartitionKeyCollection(),
        base::BindOnce(&Read::AlimamaContextRead, weak_.GetWeakPtr()));
  }
  void AlimamaContextRead(const net::CookieAccessResultList &included,
                          const net::CookieAccessResultList &) {
    entry_cookie_count_ = static_cast<int>(included.size());
    if (operation_ == "alimama.access") {
      Submit();
      return;
    }
    auto access = base::DictValue()
                      .Set("bizCode", Field(*spec_, "accessBizCode").empty()
                                          ? "universalBP"
                                          : Field(*spec_, "accessBizCode"))
                      .Set("r", "mx_13");
    Network(GURL("https://one.alimama.com/member/checkAccess.json"), "POST",
            base::WriteJson(access).value_or("{}"), Stage::kAccess);
  }
  content::RenderFrameHost *FindServiceFrame() {
    const GURL entry(Field(*spec_, "entryUrl"));
    content::RenderFrameHost *found = nullptr;
    ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
        [&](BrowserWindowInterface *browser) {
          if (browser->GetProfile() == profile_) {
            auto *tabs = browser->GetTabStripModel();
            for (int i = 0; tabs && i < tabs->count(); ++i) {
              auto *contents = tabs->GetWebContentsAt(i);
              auto *frame = contents->GetPrimaryMainFrame();
              if (frame &&
                  containers::GetContainerIdForWebContents(contents) ==
                      container_ &&
                  frame->GetLastCommittedURL().SchemeIs("https") &&
                  frame->GetLastCommittedURL().host() == entry.host()) {
                found = frame;
                return false;
              }
            }
          }
          return true;
        });
    if (found)
      matching_tab_found_ = true;
    return found;
  }
  content::StoragePartition *Partition() {
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
                           .Set("entryCookieCount", entry_cookie_count_)
                           .Set("failureClass", failure_class_);
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
    auto *partition = Partition();
    if (!partition) {
      Fail("CONTAINER_NOT_FOUND");
      return;
    }
    partition->GetCookieManagerForBrowserProcess()->GetCookieList(
        GURL(Field(*spec_, "entryUrl")), net::CookieOptions::MakeAllInclusive(),
        net::CookiePartitionKeyCollection(),
        base::BindOnce(&Read::CookieRead, weak_.GetWeakPtr()));
  }
  void CookieRead(const net::CookieAccessResultList &included,
                  const net::CookieAccessResultList &) {
    entry_cookie_count_ = static_cast<int>(included.size());
    for (const auto &item : included) {
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
      // The current first-party DMP prepare/service modules bootstrap ordinary
      // merchant accounts through api_2/login/loginuserinfo before API reads.
      auto user_url = net::AppendQueryParameter(
          GURL("https://dmp.taobao.com/api_2/login/loginuserinfo"), "bizCode",
          "dmp");
      user_url = net::AppendQueryParameter(user_url, "_tb_token_",
                                           Field(params_, "_tb_token_"));
      Network(user_url, "GET", "", Stage::kDmpUser);
    } else {
      Submit();
    }
  }
  void Network(const GURL &url, const std::string &method,
               const std::string &body, Stage stage) {
    auto *partition = Partition();
    if (!partition) {
      Fail("CONTAINER_NOT_FOUND");
      return;
    }
    GURL entry(Field(*spec_, "entryUrl"));
    if (Field(*spec_, "service") != "xiaohongshu") {
      if (auto* frame = FindServiceFrame()) {
        entry = frame->GetLastCommittedURL().GetWithoutRef();
      }
    }
    phase_ = stage == Stage::kSycm       ? "auth-sycm-home"
             : stage == Stage::kAccess   ? "auth-alimama-access"
             : stage == Stage::kDmpUser  ? "auth-dmp-user"
             : stage == Stage::kDataFlow ? "business-data-flow"
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
    request->headers.SetHeader(
        "Accept", stage == Stage::kSycm ? "text/html,application/xhtml+xml"
                                        : "application/json, text/plain, */*");
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
    if (stage == Stage::kResult || stage == Stage::kDataFlow) {
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
    failure_class_ = "unclassified";
    if (status != 200 && body) {
      const auto text = base::ToLowerASCII(body->substr(0, 8192));
      if (text.find("cors") != std::string::npos)
        failure_class_ = "cors-rejected";
      else if (text.find("csrf") != std::string::npos)
        failure_class_ = "csrf-rejected";
      else if (text.find("captcha") != std::string::npos ||
               text.find("x5sec") != std::string::npos)
        failure_class_ = "verification-required";
      else if (text.find("forbidden") != std::string::npos)
        failure_class_ = "forbidden";
    }
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
      Fail(status == 401 || status == 403 ? "AUTH_OR_RISK_CHALLENGE"
                                          : "REQUEST_FAILED");
      return;
    }
    if (stage == Stage::kSycm) {
      sycm_token_ = ExtractSycmLegalityToken(*body).value_or("");
      Submit();
      return;
    }
    if (stage == Stage::kResult || stage == Stage::kDataFlow) {
      if (body->size() > 2 * 1024 * 1024 - response_bytes_) {
        Fail("RESPONSE_TOO_LARGE");
        return;
      }
      response_bytes_ += body->size();
    }
    auto json = base::JSONReader::Read(*body, base::JSON_PARSE_RFC);
    if (!json || !json->is_dict()) {
      Fail("NON_JSON_RESPONSE");
      return;
    }
    if (stage == Stage::kDmpUser) {
      const auto *data = json->GetDict().FindDict("data");
      const auto *access = data ? data->FindDict("accessInfo") : nullptr;
      const auto csrf = data && !Field(*data, "csrfId").empty()
                            ? Field(*data, "csrfId")
                        : access ? Field(*access, "csrfId")
                                 : "";
      if (!data || csrf.empty()) {
        Fail("AUTH_CONTEXT_REQUIRED");
        return;
      }
      if (data->FindBool("availableUser") == false) {
        Fail("PERMISSION_REQUIRED");
        return;
      }
      const auto *login = data->FindDict("loginUser");
      const auto actual =
          login ? NumericId(login->Find("shopId")) : std::nullopt;
      const auto *shop = profile_->GetPrefs()
                             ->GetDict(containers::prefs::kShopContainers)
                             .FindDict(container_);
      const auto *identity = shop ? shop->FindDict("identity") : nullptr;
      const auto expected =
          identity ? NumericId(identity->Find("shopId")) : std::nullopt;
      if (actual && (!expected || *actual != *expected)) {
        Fail("STORE_IDENTITY_MISMATCH");
        return;
      }
      params_.Set("bizCode", "dmp");
      params_.Set("csrfId", csrf);
      params_.Set("_csrf", csrf);
      Submit();
      return;
    }
    if (stage == Stage::kAccess) {
      const auto *data = json->GetDict().FindDict("data");
      if (!data) {
        data = json->GetDict().FindDict("result");
      }
      const auto *info = data ? data->FindDict("accessInfo") : nullptr;
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
    if (stage == Stage::kDataFlow) {
      data_flows_.Append(
          base::DictValue()
              .Set("dataFlowId", base::NumberToString(*flow_ids_.begin()))
              .Set("response", std::move(*json)));
      flow_ids_.erase(flow_ids_.begin());
      NextDataFlow();
      return;
    }
    if (Field(*spec_, "requestShape") == "alimama-dynamic-module" &&
        HasTemplate(*json)) {
      CollectDataFlows(*json, flow_ids_);
      if (flow_ids_.empty() || flow_ids_.size() > 16) {
        Fail("DATA_FLOW_EXPANSION_REQUIRED");
        return;
      }
      module_response_ = std::move(*json);
      NextDataFlow();
      return;
    }
    Finish(std::move(*json));
  }
  void Finish(base::Value json) {
    timer_.Stop();
    auto result = base::DictValue()
                      .Set("ok", true)
                      .Set("containerId", container_)
                      .Set("businessOperation", operation_)
                      .Set("dataFlows", std::move(data_flows_))
                      .Set("data", std::move(json));
    if (operation_ != "xhs.search-page")
      result.Set("httpStatus", 200);
    std::move(callback_).Run(std::move(result));
  }
  void NextDataFlow() {
    if (flow_ids_.empty()) {
      Finish(std::move(module_response_));
      return;
    }
    auto module_params = params_.Clone();
    module_params.Remove("csrfId");
    module_params.Remove("loginPointId");
    auto payload =
        base::DictValue()
            .Set("dataFlowId", static_cast<double>(*flow_ids_.begin()))
            .Set("params", std::move(module_params))
            .Set("bizCode", Field(*spec_, "bizCode"));
    for (const auto key : {"csrfId", "loginPointId"})
      if (const auto *value = params_.Find(key))
        payload.Set(key, value->Clone());
    // Expand only IDs supplied by this registered read's own module response.
    // The caller cannot select an arbitrary data-flow endpoint or operation.
    Network(GURL("https://one.alimama.com/cube/triggerDataFlowById.json"),
            "POST", base::WriteJson(payload).value_or("{}"), Stage::kDataFlow);
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
        if (const auto *value = params_.Find(key)) {
          payload.Set(key, value->Clone());
        }
      }
    }
    GURL url(Field(*spec_, "origin") + Field(*spec_, "path"));
    const auto method = Field(*spec_, "method");
    if (signed_spec_ && method == "POST") {
      for (const auto* key : {"bizCode", "_tb_token_", "_csrf", "csrfId"}) {
        url = net::AppendQueryParameter(url, key, Field(payload, key));
        payload.Remove(key);
      }
    }
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

  const raw_ptr<Profile> profile_;
  const std::string container_;
  const std::string operation_;
  const std::optional<base::DictValue> signed_spec_;
  raw_ptr<const base::DictValue> spec_ = nullptr;
  base::DictValue params_;
  base::Value module_response_;
  base::ListValue data_flows_;
  std::vector<int64_t> flow_ids_;
  size_t response_bytes_ = 0;
  std::string sycm_token_;
  bool submitted_ = false;
  int last_status_ = 0;
  int net_error_ = 0;
  int entry_cookie_count_ = -1;
  std::string failure_class_ = "unclassified";
  std::string phase_ = "validation";
  std::string body_kind_ = "none";
  bool matching_tab_found_ = false;
  base::OnceCallback<void(base::DictValue)> callback_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  base::OneShotTimer timer_;
  base::OneShotTimer xhs_poll_;
  base::WeakPtr<content::WebContents> xhs_page_;
  base::ScopedClosureRunner memory_task_;
  base::WeakPtrFactory<Read> weak_{this};
};
} // namespace

bool SupportsSignedBusinessRoutes() {
#if defined(OFFICIAL_BUILD)
  return false;
#else
  return base::CommandLine::ForCurrentProcess()->GetProgram().BaseName()
             .AsUTF8Unsafe() == "Ecom Dev";
#endif
}

std::optional<base::DictValue> VerifySignedBusinessRoute(
    const std::string& operation,
    const base::DictValue& envelope,
    const base::DictValue& params) {
  if (!SupportsSignedBusinessRoutes() || Spec(operation)) {
    return std::nullopt;
  }
  const auto* payload = envelope.FindString("payload");
  const auto* encoded_signature = envelope.FindString("signature");
  std::string signature;
  if (!payload || payload->size() > 8192 || !encoded_signature ||
      encoded_signature->size() != 88 ||
      !base::Base64Decode(*encoded_signature, &signature) ||
      signature.size() != 64) {
    return std::nullopt;
  }
  constexpr std::array<uint8_t, 32> kDevRouteKey = {
      0xe3, 0x9b, 0xb6, 0xee, 0x00, 0xfb, 0xc5, 0x23,
      0x37, 0x41, 0x42, 0x9e, 0xdc, 0x85, 0xf7, 0x5a,
      0xfb, 0xbc, 0x3d, 0x77, 0x7c, 0x43, 0x96, 0xc2,
      0xa2, 0xf0, 0xd5, 0x54, 0x5a, 0x0d, 0x59, 0x25
  };
  if (!crypto::sign::Verify(
          crypto::sign::ED25519,
          crypto::keypair::PublicKey::FromEd25519PublicKey(kDevRouteKey),
          base::as_byte_span(*payload), base::as_byte_span(signature))) {
    return std::nullopt;
  }
  const auto manifest = base::JSONReader::ReadDict(*payload, base::JSON_PARSE_RFC);
  if (!manifest || manifest->FindInt("version") != 1 ||
      Field(*manifest, "id") != operation || !operation.starts_with("dmp.") ||
      Field(*manifest, "purpose") != "ecom-dev-dmp-read" ||
      manifest->FindInt("expiresAt").value_or(0) <=
          base::Time::Now().InSecondsFSinceUnixEpoch()) {
    return std::nullopt;
  }
  const auto path = Field(*manifest, "path");
  const auto method = Field(*manifest, "method");
  constexpr char kOrigin[] = "https://dmp.advgateway.taobao.com";
  const GURL url(kOrigin + path);
  if (!path.starts_with("/api/") || !url.is_valid() ||
      url.spec() != kOrigin + path || url.path() != path ||
      (method != "GET" && method != "POST")) {
    return std::nullopt;
  }
  const auto* fields = manifest->FindDict("fields");
  if (!fields || fields->size() != params.size() ||
      CredentialInput(base::Value(params.Clone()))) {
    return std::nullopt;
  }
  base::ListValue required;
  for (auto [name, type] : *fields) {
    const auto* value = params.Find(name);
    if (!value || !type.is_string() ||
        std::string_view(base::Value::GetTypeName(value->type())) !=
            type.GetString()) {
      return std::nullopt;
    }
    required.Append(name);
  }
  return base::DictValue()
      .Set("service", "dmp")
      .Set("origin", kOrigin)
      .Set("entryUrl", "https://dmp.taobao.com/index_new.html#!/items/shop-insight")
      .Set("method", method)
      .Set("path", path)
      .Set("requiredParams", std::move(required))
      .Set("defaultParams", base::DictValue());
}

bool MatchesBusinessReadRoute(const std::string& operation,
                              const base::DictValue& route) {
  const auto* spec = Spec(operation);
  if (!spec) {
    return false;
  }
  auto expected = spec->Clone();
  expected.Remove("id");
  expected.Remove("defaultParams");
  return expected == route;
}

std::optional<BusinessPage> GetBusinessReadPage(const std::string &operation) {
  const auto *spec = Spec(operation);
  if (!spec) {
    return std::nullopt;
  }
  return BusinessPage{Field(*spec, "service"), Field(*spec, "entryUrl")};
}

std::unique_ptr<BusinessRead>
CreateBusinessRead(Profile *profile, std::string container_id,
                   std::string operation, base::DictValue params,
                   std::optional<base::DictValue> signed_spec,
                   base::OnceCallback<void(base::DictValue)> callback) {
  return std::make_unique<Read>(profile, std::move(container_id),
                                std::move(operation), std::move(params),
                                std::move(signed_spec), std::move(callback));
}
} // namespace ecom
