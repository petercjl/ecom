// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/taobao_product_navigation.h"

#include <memory>
#include <string>
#include <utility>

#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/logging.h"
#include "base/memory/weak_ptr.h"
#include "base/supports_user_data.h"
#include "base/task/sequenced_task_runner.h"
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "base/values.h"
#include "brave/browser/ecom/url_routing_rules.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/site_instance.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/weak_document_ptr.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/common/referrer.h"
#include "net/base/url_util.h"
#include "services/network/public/mojom/referrer_policy.mojom.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"

namespace ecom {
namespace {

constexpr char kSearchUrl[] = "https://s.taobao.com/search";

constexpr char16_t kReadPage[] = uR"JS(JSON.stringify((() => {
  const body = document.body;
  if (!body) return {};
  const text = body.innerText;
  const verification = /请完成安全验证|请进行安全验证|拖动滑块|滑块验证/.test(text);
  if (verification) return {verification};
  if (location.hostname === 's.taobao.com') {
    const cards = [...document.querySelectorAll('a[class*="CardWrapper"][href]')];
    return {links: cards.slice(0, 100).map(card => card.href)
        .filter(href => href.length <= 8192)};
  }
  const title = document.title
      .replace(/\s*[-–_|]\s*(?:tmall\.com\s*天猫|天猫|淘宝网|淘宝)\s*$/i, '')
      .trim();
  const titled = title && title !== document.title.trim();
  const abnormal = text.includes('访问异常提示');
  const denied = text.includes('不支持访问其他店铺商品详情');
  const gallery = document.querySelector('#picGalleryEle');
  const detail = document.querySelector('.descV8-container');
  return {
    title: titled ? title.slice(0, 240) : '',
    gallery: !!gallery?.querySelector('img'),
    complete: !!gallery?.querySelector('img') &&
        !!detail?.getBoundingClientRect().height &&
        ([...detail.querySelectorAll('img')].some(img => img.naturalWidth > 0) ||
         !!detail.innerText.trim()),
    abnormal,
    denied,
    settled: document.readyState === 'complete',
  };
})()))JS";

bool IsBuyerLogin(const GURL& url) {
  return url.SchemeIs("https") && !url.has_username() && !url.has_password() &&
         !url.has_port() &&
         (url.host() == "login.taobao.com" || url.host() == "login.tmall.com" ||
          url.host() == "passport.taobao.com");
}

class ProductNavigation final : public base::SupportsUserData::Data,
                                public content::WebContentsObserver {
 public:
  ProductNavigation(BrowserWindowInterface* window,
                    content::WebContents* anchor,
                    std::unique_ptr<tabs::TabModel> tab,
                    std::string item_id,
                    bool foreground,
                    bool close_initial_blank)
      : content::WebContentsObserver(tab->GetContents()),
        window_(window->GetWeakPtr()),
        anchor_(anchor->GetWeakPtr()),
        anchor_url_(anchor->GetLastCommittedURL()),
        tab_(std::move(tab)),
        item_id_(std::move(item_id)),
        foreground_(foreground),
        close_initial_blank_(close_initial_blank) {}

  ~ProductNavigation() override { Observe(nullptr); }

  void Start(const GURL& url) { Navigate(url, GURL(), base::Seconds(14)); }

 private:
  enum class Stage { kProduct, kSearch, kResult };

  void DidStartNavigation(content::NavigationHandle* navigation) override {
    if (done_ || !navigation->IsInPrimaryMainFrame() ||
        navigation->IsSameDocument()) {
      return;
    }
    if (navigation->GetURL() == pending_url_) {
      pending_url_ = GURL();
    } else if (navigation->HasUserGesture() ||
               !navigation->IsRendererInitiated()) {
      Finish("PRODUCT_NAVIGATION_INCOMPLETE");
    }
  }

  bool IsSearchPage(const GURL& url) const {
    std::string expected_query;
    std::string actual_query;
    return url.SchemeIs("https") && url.host() == "s.taobao.com" &&
           !url.has_username() && !url.has_password() && !url.has_port() &&
           url.path() == "/search" &&
           net::GetValueForKeyInQuery(search_url_, "q", &expected_query) &&
           net::GetValueForKeyInQuery(url, "q", &actual_query) &&
           expected_query == actual_query;
  }

  void ArmDeadline(base::TimeDelta timeout) {
    started_ = base::TimeTicks::Now();
    deadline_.Start(FROM_HERE, timeout,
                    base::BindOnce(&ProductNavigation::TimedOut,
                                   weak_.GetWeakPtr()));
  }

  void SchedulePoll() {
    if (!done_) {
      poll_.Start(FROM_HERE, base::Milliseconds(350),
                  base::BindOnce(&ProductNavigation::Poll, weak_.GetWeakPtr()));
    }
  }

  void Poll() {
    if (done_ || !web_contents()) {
      return;
    }
    auto* frame = web_contents()->GetPrimaryMainFrame();
    const GURL url = frame->GetLastCommittedURL();
    if (IsBuyerLogin(url)) {
      Finish("PRODUCT_LOGIN_REQUIRED");
      return;
    }
    const bool expected = stage_ == Stage::kSearch
                              ? IsSearchPage(url)
                              : GetTaobaoProductId(url) == item_id_;
    if (!expected || !frame->IsRenderFrameLive()) {
      SchedulePoll();
      return;
    }
    frame->ExecuteJavaScriptInIsolatedWorld(
        kReadPage,
        base::BindOnce(&ProductNavigation::OnRead, weak_.GetWeakPtr(),
                       frame->GetWeakDocumentPtr(), url),
        ISOLATED_WORLD_ID_CHROME_INTERNAL);
  }

  void OnRead(content::WeakDocumentPtr document,
              const GURL& url,
              base::Value result) {
    if (done_ || !web_contents()) {
      return;
    }
    if (document.AsRenderFrameHostIfValid() !=
            web_contents()->GetPrimaryMainFrame() ||
        web_contents()->GetLastCommittedURL() != url || !result.is_string()) {
      SchedulePoll();
      return;
    }
    auto state = base::JSONReader::ReadDict(result.GetString(),
                                          base::JSON_PARSE_RFC);
    if (!state) {
      SchedulePoll();
      return;
    }
    if (state->FindBool("verification").value_or(false)) {
      Finish("PRODUCT_VERIFICATION_REQUIRED");
      return;
    }
    if (stage_ == Stage::kSearch) {
      if (const auto* links = state->FindList("links")) {
        GURL product = FindTaobaoSearchProductLink(*links, item_id_);
        if (product.is_valid()) {
          stage_ = Stage::kResult;
          Navigate(product, url, base::Seconds(22));
          return;
        }
      }
      SchedulePoll();
      return;
    }
    if (state->FindBool("denied").value_or(false)) {
      Finish("PRODUCT_NAVIGATION_INCOMPLETE");
      return;
    }
    const bool abnormal = state->FindBool("abnormal").value_or(false);
    if (!abnormal && state->FindBool("complete").value_or(false)) {
      Finish();
      return;
    }
    if (stage_ == Stage::kResult && abnormal) {
      Finish("PRODUCT_NAVIGATION_INCOMPLETE");
      return;
    }
    const auto* title = state->FindString("title");
    if (stage_ == Stage::kProduct && title && !title->empty() &&
        state->FindBool("gallery").value_or(false) &&
        (abnormal || (state->FindBool("settled").value_or(false) &&
                      base::TimeTicks::Now() - started_ >= base::Seconds(3)))) {
      stage_ = Stage::kSearch;
      search_url_ = net::AppendQueryParameter(GURL(kSearchUrl), "q", *title);
      Navigate(search_url_, GURL(), base::Seconds(15));
      return;
    }
    SchedulePoll();
  }

  void Navigate(const GURL& url, const GURL& referrer, base::TimeDelta timeout) {
    pending_url_ = url;
    content::NavigationController::LoadURLParams params(url);
    params.transition_type = ui::PAGE_TRANSITION_LINK;
    params.should_replace_current_entry = true;
    if (referrer.is_valid()) {
      params.referrer = content::Referrer(
          referrer, network::mojom::ReferrerPolicy::kStrictOriginWhenCrossOrigin);
    }
    ArmDeadline(timeout);
    web_contents()->GetController().LoadURLWithParams(params);
    SchedulePoll();
  }

  void TimedOut() {
    const auto& committed = web_contents()->GetLastCommittedURL();
    Finish(stage_ == Stage::kSearch && IsSearchPage(committed)
               ? "PRODUCT_SEARCH_NO_MATCH"
               : "PRODUCT_NAVIGATION_INCOMPLETE");
  }

  void Finish(const char* error = nullptr) {
    done_ = true;
    deadline_.Stop();
    poll_.Stop();
    // Publish outside the navigation/renderer callback. The anchor may close
    // before then, in which case its user data destroys the hidden contents.
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(&ProductNavigation::Publish,
                                  weak_.GetWeakPtr(), error));
  }

  void Publish(const char* error) {
    if (!anchor_) {
      return;
    }
    auto anchor = anchor_;
    auto window = window_;
    const void* key = this;
    if (window) {
      auto* tabs = window->GetTabStripModel();
      const int anchor_index = tabs->GetIndexOfWebContents(anchor.get());
      if (anchor_index != TabStripModel::kNoTab) {
        const bool same_anchor =
            tabs->GetActiveWebContents() == anchor.get() &&
            anchor->GetLastCommittedURL() == anchor_url_ &&
            !anchor->GetController().GetPendingEntry();
        const bool activate = foreground_ && same_anchor;
        VLOG(0) << "Ecom buyer product route finished: status="
                << (error ? error : "DETAIL_READY")
                << ", foreground=" << activate
                << ", anchor_current=" << same_anchor;
        const bool close_blank = close_initial_blank_;
        Observe(nullptr);
        if (error) {
          // A fresh WebUI tab prevents the last search or incomplete detail
          // from becoming visible while the status page is committing.
          tab_.reset();
          NavigateParams params(
              window.get(),
              GURL(std::string("chrome://shops/routing.html?error=") + error),
              ui::PAGE_TRANSITION_AUTO_TOPLEVEL);
          params.disposition = activate
                                   ? WindowOpenDisposition::NEW_FOREGROUND_TAB
                                   : WindowOpenDisposition::NEW_BACKGROUND_TAB;
          ::Navigate(&params);
        } else {
          tabs->AppendTab(std::move(tab_), activate);
        }
        if (anchor && window && close_blank && tabs->count() > 1 &&
            anchor->GetController().IsInitialBlankNavigation()) {
          const int index = tabs->GetIndexOfWebContents(anchor.get());
          if (index != TabStripModel::kNoTab) {
            tabs->CloseWebContentsAt(index, TabCloseTypes::CLOSE_NONE);
          }
        }
      }
    }
    if (anchor) {
      anchor->RemoveUserData(key);
    }
  }

  const base::WeakPtr<BrowserWindowInterface> window_;
  const base::WeakPtr<content::WebContents> anchor_;
  const GURL anchor_url_;
  std::unique_ptr<tabs::TabModel> tab_;
  const std::string item_id_;
  const bool foreground_;
  const bool close_initial_blank_;
  Stage stage_ = Stage::kProduct;
  bool done_ = false;
  GURL pending_url_;
  GURL search_url_;
  base::TimeTicks started_;
  base::OneShotTimer deadline_;
  base::OneShotTimer poll_;
  base::WeakPtrFactory<ProductNavigation> weak_{this};
};

}  // namespace

void StartTaobaoProductNavigation(BrowserWindowInterface* window,
                                  content::WebContents* anchor,
                                  const GURL& short_url,
                                  const std::string& container,
                                  bool foreground,
                                  bool close_initial_blank) {
  auto item_id = GetTaobaoProductId(short_url);
  if (item_id.empty()) {
    return;
  }
  auto* context = anchor->GetBrowserContext();
  const auto partition = content::StoragePartitionConfig::Create(
      context, containers::kContainersStoragePartitionDomain, container, false);
  auto site = content::SiteInstance::CreateForFixedStoragePartition(
      context, short_url, partition);
  content::WebContents::CreateParams params(context, std::move(site));
  params.initially_hidden = true;
  auto contents = content::WebContents::Create(params);
  if (containers::GetContainerIdForWebContents(contents.get()) != container) {
    return;
  }
  auto tab = std::make_unique<tabs::TabModel>(
      std::move(contents), window->GetTabStripModel());
  auto task = std::make_unique<ProductNavigation>(
      window, anchor, std::move(tab), std::move(item_id), foreground,
      close_initial_blank);
  auto* navigation = task.get();
  anchor->SetUserData(navigation, std::move(task));
  navigation->Start(short_url);
}

}  // namespace ecom
