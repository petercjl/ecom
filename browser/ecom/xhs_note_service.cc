// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/

#include "brave/browser/ecom/xhs_note_service.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "base/time/time.h"
#include "brave/browser/ecom/memory_actions.h"
#include "brave/browser/ecom/xhs_note_script.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/weak_document_ptr.h"
#include "content/public/browser/web_contents.h"
#include "url/gurl.h"
#include "url/origin.h"

namespace ecom {
namespace {

constexpr char kCreator[] =
    "https://creator.xiaohongshu.com/publish/publish";
using Reply = base::OnceCallback<void(base::DictValue)>;

std::string Field(const base::DictValue& input, const char* key) {
  const auto* value = input.FindString(key);
  return value ? *value : std::string();
}

base::DictValue Error(const char* code, bool uncertain = false) {
  base::DictValue error;
  error.Set("code", code);
  error.Set("executed", uncertain ? base::Value("unknown") : base::Value(false));
  return base::DictValue().Set("ok", false).Set("error", std::move(error));
}

base::DictValue Result(const std::string& container,
                       const std::string& preparation,
                       bool fixture,
                       base::DictValue state) {
  return base::DictValue()
      .Set("ok", true)
      .Set("containerId", container)
      .Set("preparationId", preparation)
      .Set("fixture", fixture)
      .Set("noteState", std::move(state));
}

bool HexDigest(const std::string& value) {
  return value.size() == 64 &&
         value.find_first_not_of("0123456789abcdef") == std::string::npos;
}

}  // namespace

struct XhsNoteService::Page {
  base::WeakPtr<content::WebContents> contents;
  content::WeakDocumentPtr document;
  base::ScopedClosureRunner protection;
  std::string container;
  std::string account;
  std::string digest;
  std::string confirmation;
  GURL entry;
  base::TimeTicks expires;
  bool fixture = false;
  bool prepare_started = false;
  bool submit_attempted = false;
};

XhsNoteService::XhsNoteService(Profile* profile) : profile_(profile) {}
XhsNoteService::~XhsNoteService() = default;

void XhsNoteService::Run(const std::string& operation_id,
                         const base::DictValue& request,
                         Reply done) {
  const auto method = Field(request, "method");
  const auto container = Field(request, "containerId");
  const auto* shop = profile_->GetPrefs()
                         ->GetDict(containers::prefs::kShopContainers)
                         .FindDict(container);
  if (!shop || Field(*shop, "platform") != "xiaohongshu" ||
      !containers::GetContainerFromPrefs(*profile_->GetPrefs(), container)) {
    std::move(done).Run(Error("XHS_CONTAINER_REQUIRED"));
    return;
  }
  if (method == "xhs.note.open") {
    const auto port = request.FindInt("fixturePort");
    if ((request.contains("fixturePort") && !port) ||
        (port && (*port < 1024 || *port > 65535))) {
      std::move(done).Run(Error("INVALID_ARGUMENT"));
      return;
    }
    const auto now = base::TimeTicks::Now();
    std::erase_if(pages_, [&](const auto& item) {
      return !item.second->contents || item.second->expires <= now;
    });
    if (pages_.size() >= 12 || pages_.contains(operation_id)) {
      std::move(done).Run(Error("XHS_PREPARATIONS_BUSY"));
      return;
    }
    auto page = std::make_unique<Page>();
    page->fixture = port.has_value();
    page->entry = port ? GURL("http://127.0.0.1:" + base::NumberToString(*port) +
                             "/publish/publish")
                       : GURL(kCreator);
    page->container = container;
    page->expires = now + base::Minutes(30);
    NavigateParams nav(profile_, page->entry, ui::PAGE_TRANSITION_FROM_API);
    nav.disposition = WindowOpenDisposition::NEW_BACKGROUND_TAB;
    nav.storage_partition_config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, container,
        false);
    Navigate(&nav);
    auto* contents = nav.navigated_or_inserted_contents.get();
    if (!contents || containers::GetContainerIdForWebContents(contents) != container) {
      std::move(done).Run(Error("CONTAINER_NAVIGATION_FAILED"));
      return;
    }
    page->contents = contents->GetWeakPtr();
    pages_.emplace(operation_id, std::move(page));
    std::move(done).Run(Result(container, operation_id, port.has_value(),
                               base::DictValue().Set("state", "opening")));
    return;
  }

  const auto preparation = Field(request, "preparationId");
  const auto found = pages_.find(preparation);
  if (found == pages_.end() || found->second->container != container) {
    std::move(done).Run(Error("XHS_PREPARATION_NOT_FOUND"));
    return;
  }
  auto& page = *found->second;
  auto* contents = page.contents.get();
  if (!contents || page.expires <= base::TimeTicks::Now() ||
      containers::GetContainerIdForWebContents(contents) != container) {
    pages_.erase(found);
    std::move(done).Run(Error("XHS_PREPARATION_EXPIRED"));
    return;
  }

  const bool is_status = method == "xhs.note.status";
  const bool is_prepare = method == "xhs.note.prepare";
  const bool is_submit = method == "xhs.note.submit";
  if (!is_status && !is_prepare && !is_submit) {
    std::move(done).Run(Error("UNSUPPORTED_COMMAND"));
    return;
  }
  auto* frame = contents->GetPrimaryMainFrame();
  const auto& url = frame->GetLastCommittedURL();
  const auto origin = url::Origin::Create(page.entry);
  const bool right_origin = frame->GetLastCommittedOrigin() == origin;
  if (is_status && !page.prepare_started &&
      (!right_origin || contents->GetController().GetPendingEntry())) {
    std::move(done).Run(Result(container, preparation, page.fixture,
                               base::DictValue().Set("state", "opening")));
    return;
  }
  const bool original_document =
      !page.prepare_started || page.document.AsRenderFrameHostIfValid() == frame;
  if (!right_origin || !original_document ||
      contents->GetController().GetPendingEntry()) {
    if (is_status && page.submit_attempted) {
      std::move(done).Run(Result(container, preparation, page.fixture,
          base::DictValue().Set("state", "submission-unknown")
                           .Set("manifestDigest", page.digest)));
    } else {
      std::move(done).Run(Error("XHS_PAGE_CHANGED"));
    }
    return;
  }
  if (url.path() != page.entry.path() && !is_status) {
    std::move(done).Run(Error("XHS_WRONG_CREATOR_PAGE"));
    return;
  }

  base::DictValue args;
  args.Set("origin", origin.Serialize());
  args.Set("fixture", page.fixture);
  args.Set("id", preparation);
  args.Set("action", method.substr(9));
  if (is_prepare) {
    const auto title = Field(request, "title");
    const auto text = Field(request, "text");
    const auto account = Field(request, "accountId");
    const auto digest = Field(request, "manifestDigest");
    const auto* files = request.FindList("files");
    if (page.prepare_started || account.empty() || account.size() > 100 ||
        title.empty() || base::UTF8ToUTF16(title).size() > 20 ||
        text.empty() || base::UTF8ToUTF16(text).size() > 1000 ||
        !HexDigest(digest) || !files || files->empty() || files->size() > 18) {
      std::move(done).Run(Error("XHS_PREPARATION_INPUT_INVALID"));
      return;
    }
    args.Set("title", title);
    args.Set("text", text);
    args.Set("account", account);
    args.Set("files", files->Clone());
    page.account = account;
    page.digest = digest;
    page.document = frame->GetWeakDocumentPtr();
    page.prepare_started = true;
    page.protection = ProtectMemoryPageTask(contents);
    // The confirmation binds this document, account and material digest to one
    // reviewed preparation. The ID is never reused across tabs.
    page.confirmation = preparation + ":" + digest;
  }
  if (is_submit) {
    if (!page.prepare_started || page.submit_attempted ||
        Field(request, "accountId") != page.account ||
        Field(request, "confirm") != page.confirmation) {
      std::move(done).Run(Error(page.submit_attempted
                                    ? "XHS_SUBMISSION_ALREADY_ATTEMPTED"
                                    : "XHS_CONFIRMATION_MISMATCH"));
      return;
    }
    page.submit_attempted = true;
    args.Set("account", page.account);
  }

  auto json = base::WriteJson(args);
  if (!json) {
    std::move(done).Run(Error("XHS_PREPARATION_INPUT_INVALID"));
    return;
  }
  frame->ExecuteJavaScriptInIsolatedWorld(
      base::UTF8ToUTF16(std::string(kXhsNoteScript) + "(" + *json + ")"),
      base::BindOnce(
          [](Reply done, const std::string& container,
             const std::string& preparation, bool fixture, bool submit,
             const std::string& digest, const std::string& confirmation,
             base::Value value) {
            auto parsed = value.is_string()
                              ? base::JSONReader::Read(value.GetString(),
                                                       base::JSON_PARSE_RFC)
                              : std::nullopt;
            if (!parsed || !parsed->is_dict()) {
              std::move(done).Run(Error("XHS_PAGE_RESPONSE_INVALID", submit));
              return;
            }
            auto data = std::move(parsed->GetDict());
            if (!digest.empty()) {
              data.Set("manifestDigest", digest);
              if (Field(data, "state") == "form-ready")
                data.Set("confirmation", confirmation);
            }
            std::move(done).Run(Result(container, preparation, fixture,
                                       std::move(data)));
          },
          std::move(done), container, preparation, page.fixture, is_submit,
          page.digest, page.confirmation),
      ISOLATED_WORLD_ID_CHROME_INTERNAL);
}

}  // namespace ecom
