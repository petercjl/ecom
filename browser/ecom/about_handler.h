// Copyright 2026 The Ecom Authors. MPL-2.0.
#ifndef ECOM_BROWSER_ABOUT_HANDLER_H_
#define ECOM_BROWSER_ABOUT_HANDLER_H_
#include <memory>
namespace content { class WebUIMessageHandler; }
namespace ecom {
std::unique_ptr<content::WebUIMessageHandler> CreateAboutHandler();
}
#endif
