// Copyright 2026 The Ecom Authors. MPL-2.0.
#ifndef ECOM_BROWSER_UPDATE_NOTIFICATION_H_
#define ECOM_BROWSER_UPDATE_NOTIFICATION_H_

#include <string>

#include "base/functional/callback.h"

class Profile;
namespace ecom {
enum class UpdatePhase { kNone, kAvailable, kDownloading, kReady };
using UpdateMenuHandler = base::RepeatingCallback<void(Profile*, bool)>;
// UI-sequence presentation only. Helpers retain all payload and consent checks.
void RegisterUpdateMenuHandler(UpdateMenuHandler handler);
void SetUpdateNotificationPhase(UpdatePhase phase);
UpdatePhase GetUpdateNotificationPhase();
std::u16string GetUpdateNotificationLabel();
bool HandleUpdateMenuCommand(Profile* profile);
}  // namespace ecom
#endif
