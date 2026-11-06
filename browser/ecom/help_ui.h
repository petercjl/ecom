// Copyright 2026 The Ecom Authors. MPL-2.0.
#ifndef ECOM_BROWSER_HELP_UI_H_
#define ECOM_BROWSER_HELP_UI_H_
#include "content/public/browser/web_ui_controller.h"
namespace ecom {
inline constexpr char kHelpHost[] = "ecom-help";
class HelpUI : public content::WebUIController {
 public:
  explicit HelpUI(content::WebUI* web_ui);
};
}  // namespace ecom
#endif
