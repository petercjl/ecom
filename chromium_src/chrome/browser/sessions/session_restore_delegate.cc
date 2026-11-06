// Copyright 2026 Ecom Authors. MPL-2.0.
#include "chrome/browser/sessions/session_restore_delegate.h"
namespace ecom {
std::vector<SessionRestoreDelegate::RestoredTab> PrepareRestoredTabs(
    const std::vector<SessionRestoreDelegate::RestoredTab> &tabs);
} // namespace ecom
#define RestoreTabs RestoreTabs_ChromiumImpl
#include <chrome/browser/sessions/session_restore_delegate.cc>
#undef RestoreTabs
// Keep native restoration metadata while deferring inactive tabs to Ecom.
void SessionRestoreDelegate::RestoreTabs(
    const std::vector<RestoredTab> &tabs,
    const base::TimeTicks &restore_started) {
  RestoreTabs_ChromiumImpl(ecom::PrepareRestoredTabs(tabs), restore_started);
}
