/* Copyright (c) 2019 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "brave/browser/brave_browser_main_parts_mac.h"

#include "base/apple/bundle_locations.h"
#include "base/apple/foundation_util.h"
#include "base/command_line.h"
#include "base/feature_list.h"
#include "base/logging.h"
#include "base/path_service.h"
#include "base/no_destructor.h"
#include "base/uuid.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "brave/browser/ecom/update_notification.h"
#include "content/public/browser/browser_task_traits.h"
#include "content/public/browser/browser_thread.h"
#include "brave/browser/mac/keystone_glue.h"
#include "brave/browser/sparkle_buildflags.h"
#include "brave/browser/ui/commands/accelerator_menu_coordinator_mac.h"
#include "brave/browser/updater/buildflags.h"
#include "brave/browser/upgrade_when_idle/upgrade_when_idle.h"
#include "brave/components/commands/common/features.h"
#include "chrome/browser/browser_process.h"
#include "chrome/common/channel_info.h"
#include "chrome/common/chrome_paths.h"
#include "components/version_info/channel.h"
#include "url/gurl.h"

#if BUILDFLAG(ENABLE_SPARKLE)
#import "brave/browser/mac/sparkle_glue.h"
#endif

#if BUILDFLAG(ENABLE_OMAHA4)
#include "brave/browser/updater/features.h"
#endif

namespace brave {
BASE_FEATURE(kUpgradeWhenIdle,
             base::FEATURE_DISABLED_BY_DEFAULT);
}

namespace {

void EcomUpdateNotice(CFNotificationCenterRef, void* context, CFStringRef,
                      const void*, CFDictionaryRef info) {
  NSDictionary* values = (__bridge NSDictionary*)info;
  NSString* token = values[@"controller"];
  NSString* phase = values[@"phase"];
  const auto& expected = *static_cast<const std::string*>(context);
  if (![token isKindOfClass:[NSString class]] ||
      ![token isEqualToString:[NSString stringWithUTF8String:expected.c_str()]] ||
      ![phase isKindOfClass:[NSString class]])
    return;
  ecom::UpdatePhase state;
  if ([phase isEqualToString:@"available"])
    state = ecom::UpdatePhase::kAvailable;
  else if ([phase isEqualToString:@"downloading"])
    state = ecom::UpdatePhase::kDownloading;
  else if ([phase isEqualToString:@"ready"])
    state = ecom::UpdatePhase::kReady;
  else if ([phase isEqualToString:@"none"])
    state = ecom::UpdatePhase::kNone;
  else
    return;
  content::GetUIThreadTaskRunner({})->PostTask(
      FROM_HERE, base::BindOnce(&ecom::SetUpdateNotificationPhase, state));
}

bool UsesOmaha4() {
#if BUILDFLAG(ENABLE_OMAHA4)
  return brave_updater::ShouldUseOmaha4();
#else
  return false;
#endif
}

}  // namespace

BraveBrowserMainPartsMac::BraveBrowserMainPartsMac(bool is_integration_test,
                                                   StartupData* startup_data)
    : ChromeBrowserMainPartsMac(is_integration_test, startup_data) {}

BraveBrowserMainPartsMac::~BraveBrowserMainPartsMac() = default;

void BraveBrowserMainPartsMac::PreCreateMainMessageLoop() {
  ChromeBrowserMainPartsMac::PreCreateMainMessageLoop();

#if BUILDFLAG(ENABLE_SPARKLE)
  if (!UsesOmaha4()) {
    // It would be a no-op if updates are disabled.
    [[SparkleGlue sharedSparkleGlue] registerWithSparkle];
  }
#endif  // BUILDFLAG(ENABLE_SPARKLE)
}

int BraveBrowserMainPartsMac::PreMainMessageLoopRun() {
  int result = ChromeBrowserMainPartsMac::PreMainMessageLoopRun();

  // Only a packaged release carries this metadata and the native npm updater.
  NSBundle* bundle = base::apple::OuterBundle();
  base::FilePath user_data_dir;
  if (result == 0 &&
      [bundle.bundleIdentifier isEqualToString:@"app.ecom.browser"] &&
      [bundle.infoDictionary[@"EcomUpdateProtocol"] integerValue] == 1 &&
      base::PathService::Get(chrome::DIR_USER_DATA, &user_data_dir)) {
    NSURL* helper = [bundle.bundleURL
        URLByAppendingPathComponent:@"Contents/Helpers/EcomUpdater"];
    NSTask* task = [[NSTask alloc] init];
    task.executableURL = helper;
    NSMutableArray<NSString*>* arguments = [@[
      bundle.bundlePath,
      [NSString stringWithFormat:@"%d", NSProcessInfo.processInfo.processIdentifier],
      base::apple::FilePathToNSString(user_data_dir)
    ] mutableCopy];
    const GURL cli_origin(
        base::CommandLine::ForCurrentProcess()->GetSwitchValueASCII(
            "ecom-native-cli-origin"));
    if (cli_origin.is_valid() && cli_origin.SchemeIs("https") &&
        !cli_origin.has_username() && !cli_origin.has_password() &&
        cli_origin.path() == "/" && !cli_origin.has_query() &&
        !cli_origin.has_ref()) {
      [arguments addObject:[NSString stringWithUTF8String:
          cli_origin.spec().c_str()]];
    }
    static base::NoDestructor<std::string> controller(
        base::Uuid::GenerateRandomV4().AsLowercaseString());
    const int pid = NSProcessInfo.processInfo.processIdentifier;
    NSString* notice_name = [NSString stringWithFormat:@"app.ecom.update.status.%d", pid];
    CFNotificationCenterAddObserver(
        CFNotificationCenterGetDistributedCenter(), &*controller,
        &EcomUpdateNotice, (__bridge CFStringRef)notice_name,
        (__bridge const void*)bundle.bundlePath,
        CFNotificationSuspensionBehaviorDeliverImmediately);
    [arguments addObject:[NSString stringWithFormat:@"--controller=%s", controller->c_str()]];
    ecom::RegisterUpdateMenuHandler(base::BindRepeating(
        [](std::string path, std::string token, int owner, Profile*, bool restart) {
          [[NSDistributedNotificationCenter defaultCenter]
              postNotificationName:[NSString stringWithFormat:@"app.ecom.update.request.%d", owner]
              object:[NSString stringWithUTF8String:path.c_str()]
              userInfo:@{@"controller": [NSString stringWithUTF8String:token.c_str()],
                         @"action": restart ? @"restart" : @"show"}
              deliverImmediately:YES];
        }, std::string(bundle.bundlePath.UTF8String), *controller, pid));
    task.arguments = arguments;
    NSError* error = nil;
    if (![task launchAndReturnError:&error]) {
      LOG(ERROR) << "Ecom update helper failed to start";
    }
  }

  if (base::FeatureList::IsEnabled(commands::features::kBraveCommands)) {
    accelerator_menu_coordinator_ =
        std::make_unique<commands::AcceleratorMenuCoordinatorMac>();
  }

  if (base::FeatureList::IsEnabled(brave::kUpgradeWhenIdle)) {
    if (UsesOmaha4()) {
      upgrade_when_idle_ = std::make_unique<brave::UpgradeWhenIdle>(
          // It's OK to pass profile_manager() here because it stays constant
          // until we reset upgrade_when_idle_ in PostMainMessageLoopRun below.
          g_browser_process->profile_manager());
    } else {
      // UpgradeWhenIdle restarts the browser with 0 open windows. It achieves
      // this by adding the switch kNoStartupWindow to the command line.
      // Unfortunately, this does not work with Sparkle, which drops all
      // command-line arguments when it relaunches the browser to apply an
      // update. We could work around this, for example by introducing a custom
      // preference. However, Sparkle will be replaced by Omaha 4 soon. So it
      // does not seem worth the effort.
      VLOG(1) << "Feature UpgradeWhenIdle is enabled but cannot take effect "
                 "because Omaha 4 is not active.";
    }
  }

  return result;
}

void BraveBrowserMainPartsMac::PostProfileInit(Profile* profile,
                                               bool is_initial_profile) {
  ChromeBrowserMainPartsMac::PostProfileInit(profile, is_initial_profile);

  if (!is_initial_profile) {
    return;
  }

  // Activation of Keystone is not automatic but done in response to the
  // counting and reporting of profiles.
  KeystoneGlue* glue = [KeystoneGlue defaultKeystoneGlue];
  if (glue && ![glue isRegisteredAndActive]) {
    // If profile loading has failed, we still need to handle other tasks
    // like marking of the product as active.
    [glue setRegistrationActive];
  }
}

void BraveBrowserMainPartsMac::PostMainMessageLoopRun() {
  // This code runs before g_browser_process->profile_manager() is destroyed by
  // BrowserProcessImpl::StartTearDown() in upstream's PostMainMessageLoopRun.
  // upgrade_when_idle_ has a pointer to that profile manager and is no longer
  // needed. We therefore reset it here to avoid a potential use-after-free.
  upgrade_when_idle_.reset();
  accelerator_menu_coordinator_.reset();
  ChromeBrowserMainPartsMac::PostMainMessageLoopRun();
}
