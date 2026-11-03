/* Copyright (c) 2019 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "brave/browser/ui/webui/welcome_page/brave_welcome_ui.h"

#include <string>

#include "chrome/browser/profiles/profile.h"
#include "components/grit/brave_components_resources.h"
#include "content/public/browser/web_ui_data_source.h"

BraveWelcomeUI::BraveWelcomeUI(content::WebUI* web_ui, std::string_view name)
    : WebUIController(web_ui) {
  auto* source = content::WebUIDataSource::CreateAndAdd(
      Profile::FromWebUI(web_ui), std::string(name));
  source->SetDefaultResource(IDR_ECOM_WELCOME_HTML);
}

BraveWelcomeUI::~BraveWelcomeUI() = default;
