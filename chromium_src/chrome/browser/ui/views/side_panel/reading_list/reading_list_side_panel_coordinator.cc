// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.

#include "chrome/browser/ui/views/side_panel/reading_list/reading_list_side_panel_coordinator.h"

#define CreateAndRegisterEntry CreateAndRegisterEntry_ChromiumImpl
#include <chrome/browser/ui/views/side_panel/reading_list/reading_list_side_panel_coordinator.cc>
#undef CreateAndRegisterEntry

void ReadingListSidePanelCoordinator::CreateAndRegisterEntry(
    SidePanelRegistry* global_registry) {
  // Ecom does not expose a reading-list panel. Existing saved data is retained.
}
