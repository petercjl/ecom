/* Copyright (c) 2025 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "chrome/install_static/user_data_dir.h"

#include <windows.h>

#include <optional>
#include <string>

#include "chrome/install_static/install_util.h"

namespace install_static {

namespace {

std::optional<std::wstring> EcomDevProfile() {
  std::wstring executable(32768, L'\0');
  const DWORD size =
      ::GetModuleFileNameW(nullptr, executable.data(), executable.size());
  if (!size || size >= executable.size()) {
    return std::nullopt;
  }
  executable.resize(size);
  const auto file = executable.rfind(L'\\');
  if (file == std::wstring::npos ||
      ::_wcsicmp(executable.c_str() + file + 1, L"Ecom Dev.exe") != 0) {
    return std::nullopt;
  }

  const auto app = executable.rfind(L'\\', file - 1);
  const auto run = app == std::wstring::npos
                       ? app
                       : executable.rfind(L'\\', app - 1);
  if (run != std::wstring::npos &&
      std::wstring_view(executable).substr(0, run).ends_with(L"\\.brave-build") &&
      std::wstring_view(executable).substr(run + 1, app - run - 1)
          .starts_with(L"windows-dev-")) {
    return executable.substr(0, run) + L"\\profiles\\Ecom-Dev";
  }
  const auto local = GetEnvironmentString(L"LOCALAPPDATA");
  return local.empty() ? std::wstring()
                       : local + L"\\Ecom Dev\\User Data";
}

}  // namespace

std::wstring& BraveAppendChromeInstallSubDirectory(const InstallConstants& mode,
                                                   bool include_suffix,
                                                   std::wstring* path);

}  // namespace install_static

#define AppendChromeInstallSubDirectory BraveAppendChromeInstallSubDirectory
#define BRAVE_GET_USER_DATA_DIRECTORY_IMPL                       \
  if (const auto dev = EcomDevProfile()) {                       \
    if (dev->empty() || !RecursiveDirectoryCreate(*dev))         \
      return false;                                             \
    *result = MakeAbsoluteFilePath(*dev);                        \
    return !result->empty();                                     \
  }

#include <chrome/install_static/user_data_dir.cc>

#undef AppendChromeInstallSubDirectory
#undef BRAVE_GET_USER_DATA_DIRECTORY_IMPL

namespace install_static {

std::wstring& BraveAppendChromeInstallSubDirectory(const InstallConstants& mode,
                                                   bool include_suffix,
                                                   std::wstring* path) {
  AppendChromeInstallSubDirectory(mode, include_suffix, path);
#if defined(OFFICIAL_BUILD)
  // Special case to handle the Policy version of the path for Brave.
  // Brave uses `SOFTWARE\Policies\BraveSoftware\Brave`
  // instead of `SOFTWARE\Policies\BraveSoftware\Brave-Browser`
  if (!include_suffix && path->starts_with(L"SOFTWARE\\Policies\\") &&
      path->ends_with(kProductPathName)) {
    *path = path->substr(0, (path->length() - kProductPathNameLength));
    path->append(L"Brave");
  }

#endif
  return *path;
}

}  // namespace install_static
