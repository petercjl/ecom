/* Copyright (c) 2021 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "base/compiler_specific.h"
#include "base/files/file_path.h"
#include "base/logging.h"
#include "base/process/launch.h"
#include "base/process/process.h"
#include "brave/installer/util/brave_shell_util.h"
#include "chrome/installer/setup/modify_params.h"
#include "chrome/installer/util/registry_util.h"
#include "chrome/installer/util/shell_util.h"
#include "chrome/installer/util/util_constants.h"
#include "chrome/installer/util/work_item.h"

#define UninstallProduct UninstallProduct_ChromiumImpl

#include <chrome/installer/setup/uninstall.cc>

#undef UninstallProduct

namespace installer {

namespace {

void DeleteBraveFileKeys(HKEY root) {
  // Delete Software\Classes\BraveXXXFile.
  std::wstring reg_prog_id(ShellUtil::kRegClasses);
  reg_prog_id.push_back(base::FilePath::kSeparators[0]);
  reg_prog_id.append(GetProgIdForFileType());
  DeleteRegistryKey(root, reg_prog_id, WorkItem::kWow64Default);

  // Cleanup OpenWithList and OpenWithProgids:
  // http://msdn.microsoft.com/en-us/library/bb166549
  std::wstring file_assoc_key;
  std::wstring open_with_progids_key;
  for (auto association : ShellUtil::kPotentialFileAssociations) {
    file_assoc_key.clear();
    base::StrAppend(&file_assoc_key,
                    {ShellUtil::kRegClasses, L"\\", association, L"\\"});

    open_with_progids_key.clear();
    base::StrAppend(&open_with_progids_key,
                    {file_assoc_key, ShellUtil::kRegOpenWithProgids});
    if (ShouldUseFileTypeProgId(association)) {
      DeleteRegistryValue(root, open_with_progids_key, WorkItem::kWow64Default,
                          GetProgIdForFileType());
    }
  }
}

}  // namespace

InstallStatus UninstallProduct(const ModifyParams& modify_params,
                               bool remove_all,
                               bool force_uninstall,
                               const base::CommandLine& cmd_line) {
  InstallStatus ret = UninstallProduct_ChromiumImpl(modify_params, remove_all,
                                                    force_uninstall, cmd_line);

  // Early return if user cancelled.
  if (ret == installer::UNINSTALL_CANCELLED) {
    return ret;
  }

  DeleteBraveFileKeys(HKEY_CURRENT_USER);

  const auto installer_state = modify_params.installer_state;
  const base::FilePath chrome_exe(
      installer_state->target_path().Append(installer::kChromeExe));
  const std::wstring suffix(
      ShellUtil::GetCurrentInstallationSuffix(chrome_exe));
  if (installer_state->system_install() ||
      (remove_all &&
       ShellUtil::QuickIsChromeRegisteredInHKLM(chrome_exe, suffix))) {
    DeleteBraveFileKeys(HKEY_LOCAL_MACHINE);
  }

  return ret;
}

}  // namespace installer
