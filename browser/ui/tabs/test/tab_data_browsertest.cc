/* Copyright (c) 2026 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "chrome/browser/ui/tabs/tab_data.h"

#include <memory>

#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/webui_url_constants.h"
#include "chrome/test/base/in_process_browser_test.h"
#include "chrome/test/base/ui_test_utils.h"
#include "chrome/grit/theme_resources.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/test/browser_test.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "ui/base/models/image_model.h"
#include "ui/base/resource/resource_bundle.h"
#include "url/gurl.h"

namespace tabs {

class BraveTabDataBrowserTest : public InProcessBrowserTest {};

// Verifies that the NTP tab gets the Ecom product favicon and that favicon
// themification is disabled so the icon is displayed as-is rather than being
// tinted by the tab background colour.
IN_PROC_BROWSER_TEST_F(BraveTabDataBrowserTest, NTPFaviconOverride) {
  ASSERT_TRUE(ui_test_utils::NavigateToURLWithDisposition(
      browser(), GURL(chrome::kChromeUINewTabURL),
      WindowOpenDisposition::CURRENT_TAB,
      ui_test_utils::BROWSER_TEST_WAIT_FOR_LOAD_STOP));

  TabInterface* const tab_interface =
      browser()->GetTabStripModel()->GetTabAtIndex(0);
  auto tab_data_observer = std::make_unique<TabDataObserver>(tab_interface);
  const TabData& data = tab_data_observer->tab_data();

  // Ecom supplies its own NTP icon and should not tint it.
  EXPECT_FALSE(data.should_themify_favicon);

  auto& rb = ui::ResourceBundle::GetSharedInstance();
  EXPECT_EQ(data.favicon,
            ui::ImageModel::FromImage(rb.GetImageNamed(IDR_PRODUCT_LOGO_32)));
}

}  // namespace tabs
