// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_MEMORY_AUTO_H_
#define BRAVE_BROWSER_ECOM_MEMORY_AUTO_H_

#include "base/values.h"
class Profile;
class PrefRegistrySimple;
namespace content {
class WebContents;
}
namespace ecom {
void RegisterAutoMemoryPrefs(PrefRegistrySimple *registry);
void StartAutoMemory(Profile *profile);
base::DictValue AutoMemoryStatus(Profile *profile);
base::DictValue DescribeAutoMemoryTab(content::WebContents *contents);
bool IsMemoryTabKeptAwake(content::WebContents *contents);
void ResetAutoMemoryIdle(content::WebContents *contents);
base::DictValue RunAutoMemoryCommand(Profile *profile,
                                     const base::DictValue &request);
} // namespace ecom
#endif
