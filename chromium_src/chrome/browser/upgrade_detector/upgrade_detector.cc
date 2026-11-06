// Copyright 2026 The Ecom Authors. MPL-2.0.
#include "chrome/browser/upgrade_detector/upgrade_detector.h"
#include <chrome/browser/upgrade_detector/upgrade_detector.cc>

void UpgradeDetector::SetEcomUpdateNotification(bool available) {
  if (available && !notify_upgrade())
    set_upgrade_detected_time(base::Time::Now());
  // npm payloads are staged outside the application. Only expose the native
  // recommendation UI: marking the installed binary as upgraded would arm
  // Chromium's lock-screen/zero-window automatic restart managers.
  set_upgrade_available(UPGRADE_AVAILABLE_NONE);
  set_upgrade_notification_stage(available ? UPGRADE_ANNOYANCE_LOW
                                         : UPGRADE_ANNOYANCE_NONE);
  NotifyUpgrade();
}
