// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_MEMORY_ACTIONS_H_
#define BRAVE_BROWSER_ECOM_MEMORY_ACTIONS_H_

#include "base/functional/callback_helpers.h"
#include "base/values.h"
#include <string>
class Profile;
namespace content {
class WebContents;
}
namespace ecom {
// Observe playback before a newly created tab can be backgrounded.
void InitializeMemoryPage(content::WebContents *contents);
// Native page-backed tasks retain this guard until completion or cancellation.
base::ScopedClosureRunner ProtectMemoryPageTask(content::WebContents *contents);
std::string MemoryPageVersion(content::WebContents *contents);
// Shared manual/automatic discards retain native protections and a 30-second
// recent-use minimum. The automatic scheduler also checks its full idle window.
base::DictValue DescribeManualDiscard(content::WebContents *contents);
base::DictValue RunMemoryTabCommand(Profile *profile,
                                    const base::DictValue &request);
} // namespace ecom
#endif
