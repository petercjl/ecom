/* Copyright (c) 2020 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "chrome/installer/setup/install_worker.h"

#include <shlobj.h>

#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/logging.h"
#include "base/process/launch.h"
#include "base/process/process.h"
#include "base/version.h"
#include "base/win/registry.h"
#include "build/buildflag.h"
#include "chrome/install_static/install_util.h"
#include "chrome/installer/setup/setup_util.h"
#include "chrome/installer/util/callback_work_item.h"
#include "chrome/installer/util/install_service_work_item.h"
#include "chrome/installer/util/work_item_list.h"

#if defined(OFFICIAL_BUILD)
// clang-format off
// NOLINTBEGIN(sort-order)
#include "chrome/install_static/buildflags.h"
#include "chrome/install_static/install_constants.h"
#include "chrome/install_static/brave_stash_google_update_integration.h"
// CHROMIUM_SRC_NOLINT
#define BUILDFLAG_INTERNAL_USE_GOOGLE_UPDATE_INTEGRATION() (1)
// NOLINTEND(sort-order)
// clang-format on
#endif


// Ecom distributes complete npm installers and uses a separately verified
// application backup for rollback. Retain upstream archive cleanup and avoid
// caching the uncompressed archive for Brave's former differential updates.
#define BRAVE_ADD_INSTALLER_COPY_TASKS
#define BRAVE_MAYBE_ABORT_ADD_CHROME_WORK_ITEMS
#include <chrome/installer/setup/install_worker.cc>
#undef BRAVE_MAYBE_ABORT_ADD_CHROME_WORK_ITEMS
#undef BRAVE_ADD_INSTALLER_COPY_TASKS
#if defined(OFFICIAL_BUILD)
#include "chrome/install_static/brave_restore_google_update_integration.h"
#endif
