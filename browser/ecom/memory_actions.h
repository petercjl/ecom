// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_MEMORY_ACTIONS_H_
#define BRAVE_BROWSER_ECOM_MEMORY_ACTIONS_H_

#include <string>
#include "base/functional/callback_helpers.h"
#include "base/values.h"
class Profile;
namespace content {
class WebContents;
}
namespace ecom {
// Native page-backed tasks retain this guard until completion or cancellation.
base::ScopedClosureRunner ProtectMemoryPageTask(content::WebContents* contents);
std::string MemoryPageVersion(content::WebContents* contents);
// Explicit MVP discards retain a 30-second recent-use guard. Automatic policy
// remains unchanged. Additional lock, upload and task guards apply here.
base::DictValue DescribeManualDiscard(content::WebContents* contents);
base::DictValue RunMemoryTabCommand(Profile* profile,
                                    const base::DictValue& request);
}  // namespace ecom
#endif
