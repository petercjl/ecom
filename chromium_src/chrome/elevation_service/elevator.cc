/* Copyright (c) 2023 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "chrome/elevation_service/elevator.h"

#include <windows.h>

#include <intsafe.h>
#include <winerror.h>

#include "base/path_service.h"
#include "base/win/windows_types.h"
#include "third_party/abseil-cpp/absl/cleanup/cleanup.h"


#include <chrome/elevation_service/elevator.cc>

namespace elevation_service {
HRESULT Elevator::InstallVPNServices() {
  return E_NOTIMPL;
}
}  // namespace elevation_service
