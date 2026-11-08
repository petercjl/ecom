// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
#ifndef BRAVE_BROWSER_ECOM_PAGE_READ_H_
#define BRAVE_BROWSER_ECOM_PAGE_READ_H_

#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/thread_pool.h"
#include "base/timer/timer.h"
#include "base/values.h"
#include "brave/browser/ecom/memory_actions.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/web_contents.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "net/http/http_response_headers.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/url_loader_factory.mojom.h"
#include "services/network/public/mojom/url_response_head.mojom.h"

namespace ecom {

inline bool IsPageReadUrl(const GURL& url) {
  return url.is_valid() && url.SchemeIs("https") && url.has_host() &&
         !url.has_username() && !url.has_password() && !url.HostIsIPAddress() &&
         !url.DomainIs("localhost") && !url.DomainIs("local") &&
         (!url.has_port() || url.EffectiveIntPort() == 443);
}

class PageRead {
 public:
  using Reply = base::OnceCallback<void(base::DictValue)>;

  PageRead(std::string container, GURL url, bool download,
           Reply reply)
      : container_(std::move(container)),
        url_(std::move(url)),
        download_(download),
        reply_(std::move(reply)) {}

  void Start(Profile* profile) {
    BrowserWindowInterface* target = nullptr;
    ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
        [&](BrowserWindowInterface* browser) {
          if (browser->GetProfile() != profile ||
              !browser->GetTabStripModel()->GetActiveWebContents())
            return true;
          target = browser;
          return false;
        });
    if (!target) {
      Fail("BROWSER_WINDOW_REQUIRED");
      return;
    }
    NavigateParams params(profile, url_, ui::PAGE_TRANSITION_FROM_API);
    params.browser = target;
    params.disposition = WindowOpenDisposition::NEW_BACKGROUND_TAB;
    params.storage_partition_config = content::StoragePartitionConfig::Create(
        profile, containers::kContainersStoragePartitionDomain, container_, false);
    Navigate(&params);
    auto* contents = params.navigated_or_inserted_contents.get();
    if (!contents || containers::GetContainerIdForWebContents(contents) != container_) {
      Fail("CONTAINER_NAVIGATION_FAILED");
      return;
    }
    page_ = contents->GetWeakPtr();
    page_->SetAudioMuted(true);
    protection_ = ProtectMemoryPageTask(contents);
    timer_.Start(FROM_HERE, base::Seconds(24),
                 base::BindOnce(&PageRead::TimedOut, weak_.GetWeakPtr()));
    Poll();
  }

 private:
  bool SameTarget() const {
    if (!page_ || containers::GetContainerIdForWebContents(page_.get()) != container_)
      return false;
    const GURL& current = page_->GetLastCommittedURL();
    return current.DeprecatedGetOriginAsURL() == url_.DeprecatedGetOriginAsURL() &&
           current.path() == url_.path() && current.query() == url_.query();
  }

  void Poll() {
    if (!page_) {
      Fail("PAGE_CLOSED");
      return;
    }
    if (!SameTarget() || !page_->GetPrimaryMainFrame()->IsRenderFrameLive()) {
      Wait();
      return;
    }
    constexpr auto kRead = uR"JS(JSON.stringify((() => {
      const visible = e => e.getClientRects().length > 0;
      const videos = [...document.querySelectorAll('video')].filter(visible);
      const direct = new Set();
      for (const v of videos) {
        const src = v.currentSrc || v.src || v.querySelector('source[src]')?.src;
        if (src?.startsWith('https:') && !v.mediaKeys) direct.add(src);
      }
      if (!direct.size && !videos.some(v => v.mediaKeys)) {
        for (const m of document.querySelectorAll('meta[property="og:video:secure_url"],meta[property="og:video:url"],meta[property="og:video"]')) {
          if (m.content.startsWith('https:')) direct.add(m.content);
        }
      }
      return {
        ready: document.readyState !== 'loading',
        title: document.title.slice(0, 512),
        text: (document.body?.innerText || '').slice(0, 12000),
        videos: videos.length,
        protected: videos.some(v => !!v.mediaKeys),
        media: [...direct].slice(0, 2)
      };
    })()))JS";
    page_->GetPrimaryMainFrame()->ExecuteJavaScriptInIsolatedWorld(
        kRead, base::BindOnce(&PageRead::OnRead, weak_.GetWeakPtr()),
        ISOLATED_WORLD_ID_CHROME_INTERNAL);
  }

  void Wait() {
    poll_.Start(FROM_HERE, base::Milliseconds(400),
                base::BindOnce(&PageRead::Poll, weak_.GetWeakPtr()));
  }

  void OnRead(base::Value result) {
    if (!SameTarget()) {
      Wait();
      return;
    }
    auto parsed = result.is_string() ? base::JSONReader::Read(
        result.GetString(), base::JSON_PARSE_RFC) : std::nullopt;
    if (!parsed || !parsed->is_dict()) {
      Wait();
      return;
    }
    auto& data = parsed->GetDict();
    if (!data.FindBool("ready").value_or(false)) {
      Wait();
      return;
    }
    const auto* title = data.FindString("title");
    title_ = title ? *title : "";
    if (!download_) {
      data.Remove("media");
      Finish(base::DictValue().Set("ok", true).Set("page", std::move(data)));
      return;
    }
    if (data.FindBool("protected").value_or(false)) {
      Fail("MEDIA_PROTECTED");
      return;
    }
    const auto* media = data.FindList("media");
    if (!media || media->empty()) {
      Wait();
      return;
    }
    if (media->size() != 1 || !(*media)[0].is_string()) {
      Fail("MEDIA_AMBIGUOUS");
      return;
    }
    const GURL media_url((*media)[0].GetString());
    if (!IsPageReadUrl(media_url)) {
      Fail("MEDIA_URL_NOT_ALLOWED");
      return;
    }
    Download(media_url);
  }

  void Download(const GURL& url) {
    auto* frame = page_->GetPrimaryMainFrame();
    frame->CreateNetworkServiceDefaultFactory(factory_.BindNewPipeAndPassReceiver());
    auto resource = std::make_unique<network::ResourceRequest>();
    resource->url = url;
    resource->request_initiator = frame->GetLastCommittedOrigin();
    resource->site_for_cookies = net::SiteForCookies::FromUrl(url_);
    resource->referrer = url_.DeprecatedGetOriginAsURL();
    resource->mode = network::mojom::RequestMode::kNoCors;
    resource->destination = network::mojom::RequestDestination::kVideo;
    resource->credentials_mode = network::mojom::CredentialsMode::kInclude;
    resource->redirect_mode = network::mojom::RedirectMode::kError;
    constexpr auto annotation = net::DefineNetworkTrafficAnnotation(
        "ecom_page_media_download", R"(
        semantics {
          sender: "Ecom CLI"
          description: "Saves media found in the selected container's page."
          trigger: "User requests a page media download."
          data: "Media URL and applicable container cookies."
          destination: WEBSITE
        }
        policy {
          cookies_allowed: YES
          cookies_store: "The selected browser container"
          setting: "Only used for explicit CLI requests."
          policy_exception_justification: "User-directed local download."
        })");
    loader_ = network::SimpleURLLoader::Create(std::move(resource), annotation);
    loader_->SetTimeoutDuration(base::Seconds(60));
    timer_.Stop();
    loader_->DownloadToTempFile(factory_.get(),
        base::BindOnce(&PageRead::Downloaded, weak_.GetWeakPtr()),
        128 * 1024 * 1024);
  }

  void Downloaded(base::FilePath path) {
    const auto* info = loader_->ResponseInfo();
    const auto size = loader_->GetContentSize();
    if (path.empty() || loader_->NetError() != net::OK || !info ||
        !info->headers || info->headers->response_code() != 200 ||
        !(info->mime_type.starts_with("video/") ||
          info->mime_type == "application/octet-stream") || size <= 0) {
      if (!path.empty())
        base::ThreadPool::PostTask(FROM_HERE, {base::MayBlock()},
                                   base::GetDeleteFileCallback(path));
      Fail("MEDIA_DOWNLOAD_FAILED");
      return;
    }
    Finish(base::DictValue()
               .Set("ok", true)
               .Set("title", title_)
               .Set("artifact", path.value())
               .Set("mimeType", info->mime_type)
               .Set("bytes", static_cast<double>(size)));
  }

  void TimedOut() {
    Fail(!SameTarget() ? "PAGE_TARGET_UNAVAILABLE"
                       : download_ ? "MEDIA_NOT_FOUND" : "PAGE_NOT_READY");
  }

  void Fail(const char* code) {
    Finish(base::DictValue().Set("ok", false).Set(
        "error", base::DictValue().Set("code", code).Set("executed", !!page_)));
  }

  void Finish(base::DictValue result) {
    timer_.Stop();
    poll_.Stop();
    bool close_requested = false;
    if (SameTarget()) {
      ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
          [&](BrowserWindowInterface* browser) {
            auto* tabs = browser->GetTabStripModel();
            if (tabs->GetIndexOfWebContents(page_.get()) == TabStripModel::kNoTab)
              return true;
            if (tabs->GetActiveWebContents() != page_.get()) {
              page_->ClosePage();
              close_requested = true;
            }
            return false;
          });
    }
    result.Set("containerId", container_);
    result.Set("closeRequested", close_requested);
    std::move(reply_).Run(std::move(result));
  }

  const std::string container_;
  const GURL url_;
  const bool download_;
  Reply reply_;
  std::string title_;
  base::WeakPtr<content::WebContents> page_;
  base::ScopedClosureRunner protection_;
  base::OneShotTimer timer_;
  base::OneShotTimer poll_;
  mojo::Remote<network::mojom::URLLoaderFactory> factory_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  base::WeakPtrFactory<PageRead> weak_{this};
};
}  // namespace ecom

#endif  // BRAVE_BROWSER_ECOM_PAGE_READ_H_
