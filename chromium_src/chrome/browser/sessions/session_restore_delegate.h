// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_CHROMIUM_SRC_CHROME_BROWSER_SESSIONS_SESSION_RESTORE_DELEGATE_H_
#define BRAVE_CHROMIUM_SRC_CHROME_BROWSER_SESSIONS_SESSION_RESTORE_DELEGATE_H_
#define RestoreTabs(...)                                                       \
  RestoreTabs_ChromiumImpl(__VA_ARGS__);                                       \
  static void RestoreTabs(__VA_ARGS__)
#include <chrome/browser/sessions/session_restore_delegate.h> // IWYU pragma: export
#undef RestoreTabs
#endif
