// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/.
#ifndef ECOM_BROWSER_WINDOWS_UPDATE_SERVICE_H_
#define ECOM_BROWSER_WINDOWS_UPDATE_SERVICE_H_
class Profile;
namespace ecom {
void StartWindowsUpdateService(Profile *profile);
void ShowWindowsUpdates(Profile *profile);
} // namespace ecom
#endif
