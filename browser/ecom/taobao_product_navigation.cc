// Copyright 2026 Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/taobao_product_navigation.h"

#include <memory>
#include <string>
#include <string_view>
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
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_enums.h"
#include "chrome/browser/ui/tabs/tab_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_entry.h"
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

constexpr char kProductNavigationTask[] = "ecom.taobao-product-navigation";
constexpr char kLoadingUrl[] = "chrome://shops/product-status.html";
constexpr char kSearchUrl[] = "https://s.taobao.com/search";
constexpr char kMerchantProductCheck[] = "ecom.merchant-product-check";

constexpr char16_t kReadMerchantVerdict[] = uR"JS(JSON.stringify((() => {
  const text = document.body?.innerText || '';
  return {
    otherShop: text.includes('基于店铺数据安全') &&
        text.includes('不支持访问其他店铺商品详情'),
    accessDeniedPage: /访问被拒绝|访问异常提示/.test(document.title),
    verification: /请完成安全验证|请进行安全验证|拖动滑块|滑块验证/.test(text),
    gallery: !!document.querySelector('#picGalleryEle img'),
  };
})()))JS";

class MerchantProductCheck final : public base::SupportsUserData::Data,
                                   public content::WebContentsObserver {
 public:
  MerchantProductCheck(content::WebContents* source, std::string item_id,
                       int64_t navigation_id,
                       base::OnceClosure route)
      : content::WebContentsObserver(source), item_id_(std::move(item_id)),
        navigation_id_(navigation_id),
        container_(containers::GetContainerIdForWebContents(source)),
        route_(std::move(route)), started_(base::TimeTicks::Now()) {}
  ~MerchantProductCheck() override {
    weak_.InvalidateWeakPtrs();
    Observe(nullptr);
  }

 private:
  void Stop() {
    route_.Reset();
    poll_.Stop();
    weak_.InvalidateWeakPtrs();
  }
  void DidStartNavigation(content::NavigationHandle* handle) override {
    if (!route_ || !handle->IsInPrimaryMainFrame() || handle->IsSameDocument())
      return;
    if (handle->GetNavigationId() == navigation_id_) return;
    // A renderer's product -> platform verdict hop belongs to this check.
    // User navigation, reload, login and unrelated sites abandon the old item.
    if (handle->HasUserGesture() || !handle->IsRendererInitiated() ||
        !IsMerchantProductOwnershipPage(handle->GetURL(), item_id_)) Stop();
  }
  void DidFinishNavigation(content::NavigationHandle* handle) override {
    if (!route_ || !handle->IsInPrimaryMainFrame() || handle->IsSameDocument() ||
        !handle->HasCommitted()) return;
    if (handle->IsErrorPage() ||
        !IsMerchantProductOwnershipPage(handle->GetURL(), item_id_)) {
      Stop();
      return;
    }
    Schedule();
  }
  void Schedule() {
    if (!route_) return;
    if (base::TimeTicks::Now() - started_ > base::Seconds(15)) {
      Stop();
      return;
    }
    poll_.Start(FROM_HERE, base::Milliseconds(150),
                base::BindOnce(&MerchantProductCheck::Read, weak_.GetWeakPtr()));
  }
  void Read() {
    if (!route_ || !web_contents()) return;
    auto* frame = web_contents()->GetPrimaryMainFrame();
    if (!frame->IsRenderFrameLive() || web_contents()->GetController().GetPendingEntry()) {
      Schedule();
      return;
    }
    const GURL url = frame->GetLastCommittedURL();
    if (!IsMerchantProductOwnershipPage(url, item_id_) ||
        containers::GetContainerIdForWebContents(web_contents()) != container_) {
      Stop();
      return;
    }
    frame->ExecuteJavaScriptInIsolatedWorld(
        kReadMerchantVerdict,
        base::BindOnce(&MerchantProductCheck::OnRead, weak_.GetWeakPtr(),
                       frame->GetWeakDocumentPtr(), url),
        ISOLATED_WORLD_ID_CHROME_INTERNAL);
  }
  void OnRead(content::WeakDocumentPtr document, const GURL& url,
              base::Value result) {
    if (!route_ || !web_contents()) return;
    if (document.AsRenderFrameHostIfValid() != web_contents()->GetPrimaryMainFrame() ||
        web_contents()->GetLastCommittedURL() != url ||
        web_contents()->GetController().GetPendingEntry() || !result.is_string()) {
      Schedule();
      return;
    }
    auto state = base::JSONReader::ReadDict(result.GetString(), base::JSON_PARSE_RFC);
    if (!state) { Schedule(); return; }
    if (IsOtherShopProductVerdict(url, item_id_, *state)) {
      auto route = std::move(route_);
      Stop();
      std::move(route).Run();
      return;
    }
    if (state->FindBool("gallery").value_or(false) ||
        state->FindBool("verification").value_or(false)) {
      Stop();
      return;
    }
    Schedule();
  }
  const std::string item_id_;
  const int64_t navigation_id_;
  const std::string container_;
  base::OnceClosure route_;
  const base::TimeTicks started_;
  base::OneShotTimer poll_;
  base::WeakPtrFactory<MerchantProductCheck> weak_{this};
};

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

void LoadProductStatus(content::WebContents& placeholder,
                       const char* error = nullptr,
                       const std::string& buyer_container = {}) {
  GURL url(kLoadingUrl);
  if (error) {
    url = net::AppendQueryParameter(url, "error", error);
    if (std::string_view(error) == "PRODUCT_LOGIN_REQUIRED" &&
        !buyer_container.empty()) {
      url = net::AppendQueryParameter(url, "containerId", buyer_container);
    }
  }
  content::NavigationController::LoadURLParams params(url);
  params.should_replace_current_entry = true;
  placeholder.GetController().LoadURLWithParams(params);
}

TabStripModel* GetPlaceholderTabStrip(content::WebContents* placeholder) {
  TabStripModel* result = nullptr;
  ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
      [&](BrowserWindowInterface* window) {
        auto* tabs = window->GetTabStripModel();
        if (tabs->GetIndexOfWebContents(placeholder) == TabStripModel::kNoTab) {
          return true;
        }
        result = tabs;
        return false;
      });
  return result;
}

bool IsLoadingTab(content::WebContents& placeholder) {
  const auto* pending = placeholder.GetController().GetPendingEntry();
  return (pending ? pending->GetURL() : placeholder.GetLastCommittedURL()) ==
         GURL(kLoadingUrl);
}

std::unique_ptr<tabs::TabModel> CreateHiddenBuyerTab(
    TabStripModel* tabs,
    content::BrowserContext* context,
    const GURL& url,
    const std::string& container) {
  const auto partition = content::StoragePartitionConfig::Create(
      context, containers::kContainersStoragePartitionDomain, container, false);
  auto site = content::SiteInstance::CreateForFixedStoragePartition(
      context, url, partition);
  content::WebContents::CreateParams params(context, std::move(site));
  params.initially_hidden = true;
  auto contents = content::WebContents::Create(params);
  if (containers::GetContainerIdForWebContents(contents.get()) != container) {
    return nullptr;
  }
  return std::make_unique<tabs::TabModel>(std::move(contents), tabs);
}

class ProductNavigation final : public base::SupportsUserData::Data,
                                public content::WebContentsObserver {
 public:
  ProductNavigation(BrowserWindowInterface* window,
                    content::WebContents* placeholder,
                    std::unique_ptr<tabs::TabModel> tab,
                    GURL short_url,
                    std::string container,
                    std::string item_id)
      : content::WebContentsObserver(tab->GetContents()),
        window_(window->GetWeakPtr()),
        placeholder_(placeholder->GetWeakPtr()),
        tab_(std::move(tab)),
        short_url_(std::move(short_url)),
        container_(std::move(container)),
        item_id_(std::move(item_id)) {}

  ~ProductNavigation() override { Observe(nullptr); }

  void Start() { Navigate(short_url_, GURL(), base::Seconds(14)); }

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
    if (!placeholder_ || !IsLoadingTab(*placeholder_)) {
      Finish();
      return;
    }
    if (!window_) {
      Finish("PRODUCT_NAVIGATION_INCOMPLETE");
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

  void TimedOut() { Finish(nullptr, /*open_short_url=*/true); }

  void Finish(const char* error = nullptr, bool open_short_url = false) {
    done_ = true;
    deadline_.Stop();
    poll_.Stop();
    // Inserting or closing a tab can destroy its user data synchronously.
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(&ProductNavigation::Publish,
                                  weak_.GetWeakPtr(), error, open_short_url));
  }

  void Publish(const char* error, bool open_short_url) {
    auto placeholder = placeholder_;
    if (!placeholder) {
      return;
    }
    if (IsLoadingTab(*placeholder)) {
      if (auto* tabs = GetPlaceholderTabStrip(placeholder.get())) {
        Observe(nullptr);
        if (!window_) {
          error = "PRODUCT_NAVIGATION_INCOMPLETE";
        }
        if (!error && open_short_url && !PrepareShortUrl(tabs)) {
          error = "PRODUCT_NAVIGATION_INCOMPLETE";
        }
        if (error) {
          tab_.reset();
          LoadProductStatus(*placeholder, error, container_);
        } else {
          const int index = tabs->GetIndexOfWebContents(placeholder.get());
          const bool selected = tabs->GetActiveWebContents() == placeholder.get();
          tabs->InsertDetachedTabAt(index, std::move(tab_),
                                    selected ? ADD_ACTIVE : ADD_NONE,
                                    tabs->GetTabGroupForTab(index));
          if (placeholder) {
            if (auto* current = GetPlaceholderTabStrip(placeholder.get())) {
              const int old_index =
                  current->GetIndexOfWebContents(placeholder.get());
              current->CloseWebContentsAt(old_index, TabCloseTypes::CLOSE_NONE);
            }
          }
        }
        VLOG(0) << "Ecom buyer product route finished: "
                << (error ? error
                          : open_short_url ? "SHORT_URL_FALLBACK" : "DETAIL_READY");
      }
    }
    if (placeholder) {
      placeholder->RemoveUserData(kProductNavigationTask);
    }
  }

  bool PrepareShortUrl(TabStripModel* tabs) {
    auto* contents = tab_->GetContents();
    if (contents->GetLastCommittedURL() == short_url_ &&
        !contents->GetController().GetPendingEntry()) {
      return true;
    }
    // Start from a buyer-bound blank page so the search UI never flashes.
    auto fallback = CreateHiddenBuyerTab(tabs, contents->GetBrowserContext(),
                                         short_url_, container_);
    if (!fallback) {
      return false;
    }
    content::NavigationController::LoadURLParams params(short_url_);
    params.transition_type = ui::PAGE_TRANSITION_AUTO_TOPLEVEL;
    fallback->GetContents()->GetController().LoadURLWithParams(params);
    tab_ = std::move(fallback);
    return true;
  }

  const base::WeakPtr<BrowserWindowInterface> window_;
  const base::WeakPtr<content::WebContents> placeholder_;
  std::unique_ptr<tabs::TabModel> tab_;
  const GURL short_url_;
  const std::string container_;
  const std::string item_id_;
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
                                  content::WebContents* source,
                                  const GURL& short_url,
                                  const std::string& container,
                                  bool replace_source) {
  auto* tabs = window->GetTabStripModel();
  auto* placeholder = source;
  // Keep the initial shell for links that already opened a new tab.
  if (replace_source || source->GetController().IsInitialBlankNavigation()) {
    LoadProductStatus(*placeholder);
  } else {
    NavigateParams params(window, GURL(kLoadingUrl),
                          ui::PAGE_TRANSITION_AUTO_TOPLEVEL);
    params.disposition = tabs->GetActiveWebContents() == source
                             ? WindowOpenDisposition::NEW_FOREGROUND_TAB
                             : WindowOpenDisposition::NEW_BACKGROUND_TAB;
    ::Navigate(&params);
    placeholder = params.navigated_or_inserted_contents.get();
    if (!placeholder) {
      return;
    }
  }

  auto item_id = GetTaobaoProductId(short_url);
  if (item_id.empty()) {
    LoadProductStatus(*placeholder, "PRODUCT_NAVIGATION_INCOMPLETE");
    return;
  }
  auto tab = CreateHiddenBuyerTab(tabs, placeholder->GetBrowserContext(),
                                  short_url, container);
  if (!tab) {
    LoadProductStatus(*placeholder, "PRODUCT_NAVIGATION_INCOMPLETE");
    return;
  }
  auto task = std::make_unique<ProductNavigation>(
      window, placeholder, std::move(tab), short_url, container,
      std::move(item_id));
  auto* navigation = task.get();
  placeholder->SetUserData(kProductNavigationTask, std::move(task));
  navigation->Start();
}

bool IsTaobaoProductNavigationPending(content::WebContents* contents) {
  return contents && contents->GetUserData(kProductNavigationTask);
}

void ObserveMerchantProductNavigation(content::WebContents* source,
                                     const GURL& product_url,
                                     int64_t navigation_id,
                                     base::OnceClosure route_other_shop) {
  source->SetUserData(kMerchantProductCheck,
      std::make_unique<MerchantProductCheck>(source,
          GetTaobaoProductId(product_url), navigation_id,
          std::move(route_other_shop)));
}

}  // namespace ecom
