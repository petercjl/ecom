// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_MEMORY_RESTORE_H_
#define BRAVE_BROWSER_ECOM_MEMORY_RESTORE_H_
#include "base/values.h"
#include "chrome/browser/sessions/session_restore_delegate.h"
#include <string>
#include <vector>
class Profile;
class PrefRegistrySimple;
namespace content {
class WebContents;
}
namespace ecom {
void RegisterMemoryRestorePrefs(PrefRegistrySimple *registry);
void StartMemoryRestore(Profile *profile);
std::vector<SessionRestoreDelegate::RestoredTab> PrepareRestoredTabs(
    const std::vector<SessionRestoreDelegate::RestoredTab> &tabs);
void MarkMemoryRestoreDeferred(content::WebContents *contents,
                               const char *source);
bool IsMemoryRestoreDeferred(content::WebContents *contents);
base::DictValue DescribeMemoryRestore(content::WebContents *contents);
base::DictValue MemoryRestoreStatus(Profile *profile);
base::DictValue MemoryRestoreRequestStatus(Profile *profile,
                                           const std::string &id);
base::DictValue RequestMemoryRestore(content::WebContents *contents,
                                     const char *source, bool allow_queue);
base::DictValue RunMemoryRestoreCommand(Profile *profile,
                                        const base::DictValue &request);
} // namespace ecom
#endif
