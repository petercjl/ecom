// Copyright 2026 Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.
#ifndef BRAVE_BROWSER_ECOM_SHOP_MANAGER_UI_H_
#define BRAVE_BROWSER_ECOM_SHOP_MANAGER_UI_H_

#include "content/public/browser/web_ui_controller.h"

class Profile;
namespace ecom {
inline constexpr char kShopManagerHost[] = "shops";
inline constexpr char kShopManagerURL[] = "chrome://shops/";
void OpenShopManager(Profile* profile);
class ShopManagerUI : public content::WebUIController {
 public:
  explicit ShopManagerUI(content::WebUI* web_ui);
};
}  // namespace ecom
#endif
