// Copyright 2026 Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.
#include "brave/browser/ecom/shop_manager_ui.h"

#include <string>
#include <utility>

#include "base/functional/bind.h"
#include "base/memory/ref_counted_memory.h"
#include "brave/browser/ecom/shop_container_service.h"
#include "brave/browser/ecom/shop_manager/shop_manager_resources.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"

namespace ecom {
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
      base::BindRepeating([](const std::string& path) {
        return path.empty() || path == "index.html" || path == "manager.css" ||
               path == "manager.js" || path == "model.js" ||
               path.starts_with("icons/");
      }),
      base::BindRepeating([](const std::string& path,
                             content::WebUIDataSource::GotDataCallback done) {
        const char* data = kShopManagerHtml;
        if (path == "manager.css") {
          data = kShopManagerCss;
        } else if (path == "manager.js") {
          data = kShopManagerJs;
        } else if (path == "model.js") {
          data = kShopManagerModel;
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
}
}  // namespace ecom
