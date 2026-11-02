// Copyright 2026 Ecom Authors. MPL-2.0.
#ifndef BRAVE_CHROMIUM_SRC_CHROME_BROWSER_NET_PROFILE_NETWORK_CONTEXT_SERVICE_H_
#define BRAVE_CHROMIUM_SRC_CHROME_BROWSER_NET_PROFILE_NETWORK_CONTEXT_SERVICE_H_

#define ConfigureNetworkContextParams(...)                         \
  ConfigureNetworkContextParams_ChromiumImpl(__VA_ARGS__);          \
  void ConfigureNetworkContextParams(__VA_ARGS__)

#include <chrome/browser/net/profile_network_context_service.h>  // IWYU pragma: export

#undef ConfigureNetworkContextParams

#endif  // BRAVE_CHROMIUM_SRC_CHROME_BROWSER_NET_PROFILE_NETWORK_CONTEXT_SERVICE_H_
