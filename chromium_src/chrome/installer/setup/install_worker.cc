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


// The code in BRAVE_ADD_INSTALLER_COPY_TASKS and
// BRAVE_MAYBE_ABORT_ADD_CHROME_WORK_ITEMS used to be upstream and had to be
// restored in Brave to support delta updates on Windows until we are on Omaha
// 4. See github.com/brave/brave-core/pull/31937.
// `uncompressed_archive` is empty when the archive was unpacked straight out of
// a mini_installer resource, in which case there is nothing on disk to keep
// around for a future differential update.
#define BRAVE_ADD_INSTALLER_COPY_TASKS                                         \
  const base::FilePath& archive_path = installer_state.uncompressed_archive;   \
  if (!archive_path.empty()) {                                                 \
    base::FilePath archive_dst(installer_dir.Append(archive_path.BaseName())); \
    if (archive_path != archive_dst) {                                         \
      if (temp_path.IsParent(archive_path)) {                                  \
        install_list->AddMoveTreeWorkItem(                                     \
            archive_path, archive_dst, temp_path,                              \
            WorkItem::MoveTreeOptions{.lenient_deletion = true});              \
      } else {                                                                 \
        install_list->AddCopyTreeWorkItem(archive_path, archive_dst,           \
                                          temp_path);                          \
      }                                                                        \
    }                                                                          \
  }
#define BRAVE_MAYBE_ABORT_ADD_CHROME_WORK_ITEMS            \
  if (old_archive == installer_state.uncompressed_archive) \
    return;
#include <chrome/installer/setup/install_worker.cc>
#undef BRAVE_MAYBE_ABORT_ADD_CHROME_WORK_ITEMS
#undef BRAVE_ADD_INSTALLER_COPY_TASKS
#if defined(OFFICIAL_BUILD)
#include "chrome/install_static/brave_restore_google_update_integration.h"
#endif
