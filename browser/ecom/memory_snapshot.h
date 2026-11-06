// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_BROWSER_ECOM_MEMORY_SNAPSHOT_H_
#define BRAVE_BROWSER_ECOM_MEMORY_SNAPSHOT_H_

#include "base/functional/callback_forward.h"
#include "base/values.h"

class Profile;
namespace ecom {
// Read-only, on-demand. Graph metadata is captured on UI; OS sampling runs off
// UI.
void GetMemorySnapshot(Profile *profile,
                       base::OnceCallback<void(base::DictValue)> reply);
} // namespace ecom
#endif
