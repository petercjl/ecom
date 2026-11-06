// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.
#include "brave/browser/ecom/windows_update_service.h"
#include "brave/browser/ecom/update_notification.h"

#include <array>
#include <windows.h>
#include <sddl.h>

#include "base/base_paths.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/no_destructor.h"
#include "base/path_service.h"
#include "base/process/launch.h"
#include "base/process/process_handle.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/task_traits.h"
#include "base/task/thread_pool.h"
#include "base/uuid.h"
#include "base/win/object_watcher.h"
#include "base/win/scoped_handle.h"
#include "chrome/browser/lifetime/application_lifetime.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/common/chrome_paths.h"

namespace ecom {
namespace {
void OpenWindowsUpdateMenu(Profile* profile, bool restart);
void LaunchWindowsUpdater(std::wstring event_name,
                          std::array<std::wstring, 4> notice_names,
                          bool manual, bool restart) {
  base::FilePath module, app, user_data;
  if (!base::PathService::Get(base::DIR_MODULE, &module) ||
      !base::PathService::Get(base::DIR_EXE, &app) ||
      !base::PathService::Get(chrome::DIR_USER_DATA, &user_data) ||
      !base::PathExists(module.Append(FILE_PATH_LITERAL("ecom-update.json"))))
    return; // Component/Dev builds carry no update identity.
  const auto helper = module.Append(FILE_PATH_LITERAL("EcomUpdater.exe"));
  if (!base::PathExists(helper))
    return;
  base::CommandLine command(helper);
  command.AppendSwitchPath("app", app);
  command.AppendSwitchPath("profile", user_data);
  command.AppendSwitchASCII("pid",
                            base::NumberToString(base::GetCurrentProcId()));
  command.AppendSwitchNative("quit-event", event_name);
  command.AppendSwitch(manual ? "manual" : "watch");
  if (restart)
    command.AppendSwitch("restart");
  constexpr std::array<const char*, 4> switches = {"notice-available", "notice-downloading",
                                     "notice-ready", "notice-clear"};
  for (size_t i = 0; i < notice_names.size(); ++i)
    command.AppendSwitchNative(switches[i], notice_names[i]);
  base::LaunchOptions options;
  options.current_directory = app.DirName();
  base::LaunchProcess(command, options);
}

class WindowsUpdateService : public base::win::ObjectWatcher::Delegate {
public:
  void Start(Profile* profile, bool manual, bool restart = false) {
    if (!profile || profile->IsOffTheRecord())
      return;
    if (!initialized_) {
      const auto nonce = base::UTF8ToWide(
          base::Uuid::GenerateRandomV4().AsLowercaseString());
      event_name_ = L"Local\\EcomUpdateQuit." + nonce;
      constexpr std::array<const wchar_t*, 4> prefixes = {
          L"Local\\EcomUpdateAvailable.", L"Local\\EcomUpdateDownloading.",
          L"Local\\EcomUpdateReady.", L"Local\\EcomUpdateClear."};
      auto create_event = [](const std::wstring& name) {
        PSECURITY_DESCRIPTOR descriptor = nullptr;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
                L"D:P(A;;GA;;;SY)(A;;GA;;;OW)", SDDL_REVISION_1, &descriptor,
                nullptr))
          return base::win::ScopedHandle();
        SECURITY_ATTRIBUTES security = {sizeof(security), descriptor, FALSE};
        base::win::ScopedHandle handle(
            CreateEventW(&security, FALSE, FALSE, name.c_str()));
        LocalFree(descriptor);
        return handle;
      };
      event_ = create_event(event_name_);
      for (size_t i = 0; i < notices_.size(); ++i) {
        notice_names_[i] = prefixes[i] + nonce;
        notices_[i] = create_event(notice_names_[i]);
      }
      bool valid = event_.is_valid();
      for (const auto& notice : notices_)
        valid = valid && notice.is_valid();
      if (!valid)
        return;
      if (!watcher_.StartWatchingMultipleTimes(event_.get(), this))
        return;
      for (size_t i = 0; i < notices_.size(); ++i) {
        if (!notice_watchers_[i].StartWatchingMultipleTimes(notices_[i].get(), this)) {
          watcher_.StopWatching();
          for (auto& watcher : notice_watchers_)
            watcher.StopWatching();
          return;
        }
      }
      initialized_ = true;
      RegisterUpdateMenuHandler(base::BindRepeating(&OpenWindowsUpdateMenu));
    }
    // No filesystem access or launch on the browser UI sequence.
    base::ThreadPool::PostTask(
        FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
        base::BindOnce(&LaunchWindowsUpdater, event_name_, notice_names_, manual,
                       restart));
  }
  void OnObjectSignaled(HANDLE event) override {
    if (event == event_.get()) {
      chrome::AttemptUserExit();
      return;
    }
    constexpr std::array<UpdatePhase, 4> phases = {
        UpdatePhase::kAvailable, UpdatePhase::kDownloading,
        UpdatePhase::kReady, UpdatePhase::kNone};
    for (size_t i = 0; i < notices_.size(); ++i) {
      if (event == notices_[i].get()) {
        SetUpdateNotificationPhase(phases[i]);
        return;
      }
    }
  }

private:
  bool initialized_ = false;
  std::wstring event_name_;
  std::array<std::wstring, 4> notice_names_;
  std::array<base::win::ScopedHandle, 4> notices_;
  std::array<base::win::ObjectWatcher, 4> notice_watchers_;
  base::win::ScopedHandle event_;
  base::win::ObjectWatcher watcher_;
};
WindowsUpdateService &Service() {
  static base::NoDestructor<WindowsUpdateService> instance;
  return *instance;
}
void OpenWindowsUpdateMenu(Profile* profile, bool restart) {
  if (profile)
    Service().Start(profile->GetOriginalProfile(), true, restart);
}
} // namespace
void StartWindowsUpdateService(Profile *profile) {
  Service().Start(profile, false);
}
void ShowWindowsUpdates(Profile *profile) { OpenWindowsUpdateMenu(profile, false); }
} // namespace ecom
