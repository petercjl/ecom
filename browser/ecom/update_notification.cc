// Copyright 2026 The Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/update_notification.h"

#include <utility>

#include "base/no_destructor.h"
#include "chrome/browser/upgrade_detector/upgrade_detector.h"
#include "chrome/grit/branded_strings.h"
#include "chrome/grit/generated_resources.h"
#include "ui/base/l10n/l10n_util.h"

namespace ecom {
namespace {
struct Notification {
  UpdatePhase phase = UpdatePhase::kNone;
  UpdateMenuHandler handler;
};
Notification& State() {
  static base::NoDestructor<Notification> state;
  return *state;
}
}  // namespace
void RegisterUpdateMenuHandler(UpdateMenuHandler handler) {
  State().handler = std::move(handler);
}
void SetUpdateNotificationPhase(UpdatePhase phase) {
  if (State().phase == phase)
    return;
  State().phase = phase;
  if (auto* detector = UpgradeDetector::GetInstance())
    detector->SetEcomUpdateNotification(phase != UpdatePhase::kNone);
}
UpdatePhase GetUpdateNotificationPhase() { return State().phase; }
std::u16string GetUpdateNotificationLabel() {
  switch (State().phase) {
    case UpdatePhase::kReady:
      return l10n_util::GetStringUTF16(IDS_RELAUNCH_TO_UPDATE);
    case UpdatePhase::kDownloading:
      return u"正在下载更新…";
    case UpdatePhase::kAvailable:
      return u"Ecom 更新…";
    case UpdatePhase::kNone:
      return {};
  }
  return {};
}
bool HandleUpdateMenuCommand(Profile* profile) {
  if (State().phase == UpdatePhase::kNone || !State().handler)
    return false;
  State().handler.Run(profile, State().phase == UpdatePhase::kReady);
  return true;
}
}  // namespace ecom
