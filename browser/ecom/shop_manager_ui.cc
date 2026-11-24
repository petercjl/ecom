// Copyright 2026 Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.
#include "brave/browser/ecom/shop_manager_ui.h"
#include "brave/browser/ecom/taobao_product_navigation.h"
#include "brave/browser/ecom/url_routing.h"
#include "brave/browser/ecom/url_routing_rules.h"

#include <string>
#include <utility>

#include "base/functional/bind.h"
#include "base/memory/ref_counted_memory.h"
#include "base/memory/weak_ptr.h"
#include "brave/browser/ecom/memory_snapshot.h"
#include "brave/browser/ecom/memory_actions.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "brave/browser/ecom/shop_container_service.h"
#include "brave/browser/ecom/shop_manager/shop_manager_resources.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "net/base/url_util.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"

namespace ecom {
namespace {
std::string ProductLoginContainer(Profile* profile, const GURL& url) {
  std::string error;
  if (url.scheme() != "chrome" || url.host() != kShopManagerHost ||
      url.path() != "/product-status.html" ||
      !net::GetValueForKeyInQuery(url, "error", &error) ||
      error != "PRODUCT_LOGIN_REQUIRED") {
    return {};
  }

  std::string id;
  if (!net::GetValueForKeyInQuery(url, "containerId", &id)) {
    // Older restored status tabs predate the pinned buyer ID.
    const auto state = RunUrlRoutingCommand(
        profile, base::DictValue().Set("method", "routing.list"));
    const auto* configuration = state.FindDict("configuration");
    const auto* rules = configuration ? configuration->FindList("rules") : nullptr;
    if (rules) {
      for (const auto& entry : *rules) {
        const auto* rule = entry.GetIfDict();
        if (rule && IsMerchantOnlyUrlRoutingRule(*rule)) {
          if (const auto* saved = rule->FindString("containerId")) {
            id = *saved;
          }
          break;
        }
      }
    }
  }
  return IsTaobaoBuyerContainer(profile, id) ? id : std::string();
}

class MemoryHandler final : public content::WebUIMessageHandler {
 public:
  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "ecomProductNavigationPending",
        base::BindRepeating(&MemoryHandler::ProductNavigationPending,
                            base::Unretained(this)));
    web_ui()->RegisterMessageCallback(
        "ecomOpenProductBuyerLogin",
        base::BindRepeating(&MemoryHandler::OpenProductBuyerLogin,
                            base::Unretained(this)));
    web_ui()->RegisterMessageCallback("ecomMemorySnapshot",
        base::BindRepeating(&MemoryHandler::Read, base::Unretained(this)));
    web_ui()->RegisterMessageCallback("ecomMemoryCommand",
        base::BindRepeating(&MemoryHandler::Command, base::Unretained(this)));
    web_ui()->RegisterMessageCallback("ecomRoutingCommand",
        base::BindRepeating(&MemoryHandler::Routing, base::Unretained(this)));
  }
 private:
  void ProductNavigationPending(const base::ListValue& args) {
    if (args.size() != 1 || !args[0].is_string()) {
      return;
    }
    AllowJavascript();
    ResolveJavascriptCallback(
        args[0], base::Value(IsTaobaoProductNavigationPending(
                     web_ui()->GetWebContents())));
  }

  void OpenProductBuyerLogin(const base::ListValue& args) {
    if (args.size() != 1 || !args[0].is_string()) {
      return;
    }
    AllowJavascript();
    auto* profile = Profile::FromWebUI(web_ui());
    const auto id =
        ProductLoginContainer(profile, web_ui()->GetWebContents()->GetLastCommittedURL());
    if (id.empty()) {
      ResolveJavascriptCallback(args[0], base::Value(false));
      return;
    }
    auto request = base::WriteJson(base::DictValue()
                                       .Set("method", "shops.open")
                                       .Set("containerId", id)
                                       .Set("service", "buyer-login"));
    if (!request) {
      ResolveJavascriptCallback(args[0], base::Value(false));
      return;
    }
    RunShopCommand(profile, std::move(*request),
                   base::BindOnce(&MemoryHandler::ProductLoginOpened,
                                  weak_.GetWeakPtr(), args[0].Clone()));
  }

  void ProductLoginOpened(base::Value callback, std::string response) {
    if (!IsJavascriptAllowed()) {
      return;
    }
    const auto result = base::JSONReader::ReadDict(response, base::JSON_PARSE_RFC);
    ResolveJavascriptCallback(
        callback, base::Value(result && result->FindBool("ok").value_or(false)));
  }

  void Routing(const base::ListValue& args) {
    if (args.size() != 2 || !args[0].is_string() || !args[1].is_string()) return;
    if (args[1].GetString().size() > 24000) {
      AllowJavascript();
      Done(args[0].Clone(), base::DictValue().Set("ok", false)
          .Set("error", base::DictValue().Set("code", "ROUTING_REQUEST_TOO_LARGE")));
      return;
    }
    auto request = base::JSONReader::ReadDict(args[1].GetString(), base::JSON_PARSE_RFC);
    if (!request) return;
    AllowJavascript();
    Done(args[0].Clone(), RunUrlRoutingCommand(Profile::FromWebUI(web_ui()), *request));
  }
  void Command(const base::ListValue& args) {
    if (args.size() != 2 || !args[0].is_string() || !args[1].is_string() || args[1].GetString().size() > 4096) return;
    auto request = base::JSONReader::ReadDict(args[1].GetString(), base::JSON_PARSE_RFC);
    if (!request) return;
    AllowJavascript();
    Done(args[0].Clone(), RunMemoryTabCommand(Profile::FromWebUI(web_ui()), *request));
  }
  void Read(const base::ListValue& args) {
    if (args.size() != 1 || !args[0].is_string()) return;
    AllowJavascript();
    GetMemorySnapshot(Profile::FromWebUI(web_ui()), base::BindOnce(
        &MemoryHandler::Done, weak_.GetWeakPtr(), args[0].Clone()));
  }
  void Done(base::Value callback, base::DictValue snapshot) {
    if (IsJavascriptAllowed())
      ResolveJavascriptCallback(callback, base::Value(std::move(snapshot)));
  }
  base::WeakPtrFactory<MemoryHandler> weak_{this};
};
}
void OpenShopManager(Profile* profile) {
  if (!profile || profile->IsOffTheRecord()) {
    return;
  }
  NavigateParams params(profile, GURL(kShopManagerURL),
                        ui::PAGE_TRANSITION_AUTO_TOPLEVEL);
  params.disposition = WindowOpenDisposition::SINGLETON_TAB;
  Navigate(&params);
}

ShopManagerUI::ShopManagerUI(content::WebUI* web_ui)
    : content::WebUIController(web_ui) {
  auto* source = content::WebUIDataSource::CreateAndAdd(
      Profile::FromWebUI(web_ui), kShopManagerHost);
  source->AddString("locale", g_browser_process->GetApplicationLocale());
  source->UseStringsJs();
  source->SetRequestFilter(
      base::BindRepeating([](const std::string& request_path) {
        const auto path = request_path.substr(0, request_path.find_first_of("?#"));
        return path.empty() || path == "index.html" || path == "manager.css" ||
               path == "manager.js" || path == "model.js" ||
               path == "memory.html" || path == "memory.js" || path == "memory.css" ||
               path == "routing.html" || path == "routing.js" || path == "routing.css" || path == "routing-model.js" ||
               path == "product-status.html" || path == "product-status.js" ||
               path.starts_with("icons/");
      }),
      base::BindRepeating([](const std::string& request_path,
                             content::WebUIDataSource::GotDataCallback done) {
        const auto path = request_path.substr(0, request_path.find_first_of("?#"));
        const char* data = kShopManagerHtml;
        if (path == "manager.css") {
          data = kShopManagerCss;
        } else if (path == "manager.js") {
          data = kShopManagerJs;
        } else if (path == "model.js") {
          data = kShopManagerModel;
        } else if (path == "routing.html") {
          data = kShopManagerRoutingHtml;
        } else if (path == "routing-model.js") {
          data = kShopManagerRoutingModel;
        } else if (path == "routing.js") {
          data = kShopManagerRoutingJs;
        } else if (path == "routing.css") {
          data = kShopManagerRoutingCss;
        } else if (path == "product-status.html") {
          data = kShopManagerProductStatusHtml;
        } else if (path == "product-status.js") {
          data = kShopManagerProductStatusJs;
        } else if (path == "memory.html") {
          data = kShopManagerMemoryHtml;
        } else if (path == "memory.js") {
          data = kShopManagerMemoryJs;
        } else if (path == "memory.css") {
          data = kShopManagerMemoryCss;
        } else if (path.starts_with("icons/")) {
          data = nullptr;
          for (int i = 0; i < 11; ++i) {
            if (path == "icons/" + std::to_string(i) + ".svg") {
              data = kShopIcons[i];
            }
          }
          if (!data) {
            std::move(done).Run(nullptr);
            return;
          }
        }
        std::move(done).Run(
            base::MakeRefCounted<base::RefCountedString>(std::string(data)));
      }));
  web_ui->AddMessageHandler(CreateShopSettingsHandler());
  web_ui->AddMessageHandler(std::make_unique<MemoryHandler>());
}
}  // namespace ecom
