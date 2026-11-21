// Copyright 2026 The Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/about_handler.h"

#include <optional>

#include "base/base_paths.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/memory/weak_ptr.h"
#include "base/path_service.h"
#include "base/task/thread_pool.h"
#include "base/values.h"
#include "brave/browser/ecom/update_notification.h"
#include "build/build_config.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_message_handler.h"
#if BUILDFLAG(IS_MAC)
#include "base/apple/bundle_locations.h"
#include "base/apple/scoped_cftyperef.h"
#include "base/strings/sys_string_conversions.h"
#endif

namespace ecom {
namespace {
// Read only installed release metadata, never browser account data.
base::DictValue ReadReleaseInfo(base::FilePath path) {
  base::DictValue result;
  std::string bytes;
  if (!base::ReadFileToStringWithMaxSize(path, &bytes, 1024 * 1024))
    return result;
#if BUILDFLAG(IS_MAC)
  base::apple::ScopedCFTypeRef<CFDataRef> data(CFDataCreate(
      nullptr, reinterpret_cast<const UInt8*>(bytes.data()), bytes.size()));
  base::apple::ScopedCFTypeRef<CFPropertyListRef> plist(
      CFPropertyListCreateWithData(nullptr, data.get(), kCFPropertyListImmutable,
                                   nullptr, nullptr));
  if (!plist || CFGetTypeID(plist.get()) != CFDictionaryGetTypeID())
    return result;
  auto dictionary = static_cast<CFDictionaryRef>(plist.get());
  const auto copy = [&](CFStringRef key, const char* output) {
    const void* value = CFDictionaryGetValue(dictionary, key);
    if (value && CFGetTypeID(value) == CFStringGetTypeID())
      result.Set(output, base::SysCFStringRefToUTF8(
                             static_cast<CFStringRef>(value)));
  };
  copy(CFSTR("EcomReleaseVersion"), "version");
  copy(CFSTR("EcomUpdatePackage"), "packageName");
  copy(CFSTR("EcomUpdateChannel"), "channel");
#else
  auto parsed = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC);
  if (parsed) {
    for (const char* key : {"version", "packageName", "channel"}) {
      if (const auto* value = parsed->FindString(key))
        result.Set(key, *value);
    }
  }
#endif
  return result;
}

class AboutHandler final : public content::WebUIMessageHandler {
 public:
  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "ecomAboutInfo", base::BindRepeating(&AboutHandler::HandleInfo,
                                             base::Unretained(this)));
    web_ui()->RegisterMessageCallback(
        "ecomAboutUpdate", base::BindRepeating(&AboutHandler::HandleUpdate,
                                               base::Unretained(this)));
  }
  void OnJavascriptDisallowed() override { weak_.InvalidateWeakPtrs(); }

 private:
  void Reply(base::Value callback, base::DictValue info) {
    metadata_ = info.Clone();
    const char* phase = "managed";
    switch (GetUpdateNotificationPhase()) {
      case UpdatePhase::kNone: break;
      case UpdatePhase::kAvailable: phase = "available"; break;
      case UpdatePhase::kDownloading: phase = "downloading"; break;
      case UpdatePhase::kReady: phase = "ready"; break;
    }
    info.Set("phase", phase);
    info.Set("canUpdate", IsUpdateMenuAvailable());
    ResolveJavascriptCallback(callback, info);
  }
  void HandleInfo(const base::ListValue& args) {
    if (args.size() != 1 || !args[0].is_string()) return;
    AllowJavascript();
    if (metadata_) { Reply(args[0].Clone(), metadata_->Clone()); return; }
    base::FilePath path;
#if BUILDFLAG(IS_MAC)
    path = base::apple::OuterBundlePath().AppendASCII("Contents/Info.plist");
#else
    base::PathService::Get(base::DIR_MODULE, &path);
    path = path.AppendASCII("ecom-update.json");
#endif
    base::ThreadPool::PostTaskAndReplyWithResult(
        FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
        base::BindOnce(&ReadReleaseInfo, path),
        base::BindOnce(&AboutHandler::Reply, weak_.GetWeakPtr(), args[0].Clone()));
  }
  void HandleUpdate(const base::ListValue& args) {
    if (!args.empty()) return;
    auto* profile = Profile::FromWebUI(web_ui());
    if (!profile->IsOffTheRecord() && IsUpdateMenuAvailable())
      ShowUpdateMenu(profile);
  }
  std::optional<base::DictValue> metadata_;
  base::WeakPtrFactory<AboutHandler> weak_{this};
};
}  // namespace
std::unique_ptr<content::WebUIMessageHandler> CreateAboutHandler() {
  return std::make_unique<AboutHandler>();
}
}  // namespace ecom
