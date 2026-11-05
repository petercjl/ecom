// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.

#ifndef ECOM_CHROMIUM_SRC_READING_LIST_SIDE_PANEL_COORDINATOR_H_
#define ECOM_CHROMIUM_SRC_READING_LIST_SIDE_PANEL_COORDINATOR_H_

#define CreateAndRegisterEntry(...)                  \
  CreateAndRegisterEntry(__VA_ARGS__);               \
  void CreateAndRegisterEntry_ChromiumImpl(__VA_ARGS__)
#include <chrome/browser/ui/views/side_panel/reading_list/reading_list_side_panel_coordinator.h>  // IWYU pragma: export
#undef CreateAndRegisterEntry

#endif  // ECOM_CHROMIUM_SRC_READING_LIST_SIDE_PANEL_COORDINATOR_H_
