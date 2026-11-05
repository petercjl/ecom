// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.
#include "brave/browser/ecom/windows_update_service.h"

#include <sddl.h>
#include <windows.h>

#include "base/base_paths.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/no_destructor.h"
#include "base/path_service.h"
#include "base/process/launch.h"
#include "base/process/process_handle.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "base/uuid.h"
#include "base/win/object_watcher.h"
#include "base/win/scoped_handle.h"
#include "chrome/browser/lifetime/application_lifetime.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/common/chrome_paths.h"

namespace ecom {
namespace {
class WindowsUpdateService : public base::win::ObjectWatcher::Delegate {
public:
  void Start(Profile *profile, bool manual) {
    if (!profile || profile->IsOffTheRecord())
      return;
    base::FilePath module, app, user_data;
    if (!base::PathService::Get(base::DIR_MODULE, &module) ||
        !base::PathService::Get(base::DIR_EXE, &app) ||
        !base::PathService::Get(chrome::DIR_USER_DATA, &user_data) ||
        !base::PathExists(module.Append(FILE_PATH_LITERAL("ecom-update.json"))))
      return; // Component/Dev builds carry no update identity.
    const auto helper = module.Append(FILE_PATH_LITERAL("EcomUpdater.exe"));
    if (!base::PathExists(helper))
      return;
    if (!event_.is_valid()) {
      event_name_ =
          L"Local\\EcomUpdateQuit." +
          base::UTF8ToWide(base::Uuid::GenerateRandomV4().AsLowercaseString());
      PSECURITY_DESCRIPTOR descriptor = nullptr;
      if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
              L"D:P(A;;GA;;;SY)(A;;GA;;;OW)", SDDL_REVISION_1, &descriptor,
              nullptr))
        return;
      SECURITY_ATTRIBUTES security = {sizeof(security), descriptor, FALSE};
      event_.Set(CreateEventW(&security, FALSE, FALSE, event_name_.c_str()));
      LocalFree(descriptor);
      if (!event_.is_valid() ||
          !watcher_.StartWatchingMultipleTimes(event_.get(), this))
        return;
    }
    base::CommandLine command(helper);
    command.AppendSwitchPath("app", app);
    command.AppendSwitchPath("profile", user_data);
    command.AppendSwitchASCII("pid",
                              base::NumberToString(base::GetCurrentProcId()));
    command.AppendSwitchNative("quit-event", event_name_);
    command.AppendSwitch(manual ? "manual" : "watch");
    base::LaunchOptions options;
    base::LaunchProcess(command, options);
  }
  void OnObjectSignaled(HANDLE) override { chrome::AttemptUserExit(); }

private:
  std::wstring event_name_;
  base::win::ScopedHandle event_;
  base::win::ObjectWatcher watcher_;
};
WindowsUpdateService &Service() {
  static base::NoDestructor<WindowsUpdateService> instance;
  return *instance;
}
} // namespace
void StartWindowsUpdateService(Profile *profile) {
  Service().Start(profile, false);
}
void ShowWindowsUpdates(Profile *profile) { Service().Start(profile, true); }
} // namespace ecom
