// Copyright 2026 The Ecom Authors. MPL-2.0.
#include "brave/browser/ecom/help_ui.h"

#include <string>
#include <utility>
#include "base/functional/bind.h"
#include "base/memory/ref_counted_memory.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"

namespace ecom {
namespace {
constexpr char kHelpHtml[] = R"ecom(<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ecom 帮助</title><style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;line-height:1.7;background:light-dark(#f5f7fb,#191b20);color:light-dark(#20242d,#edf0f7)}
body{max-width:850px;margin:48px auto;padding:0 24px 60px}h1{font-size:32px;margin-bottom:0}header p{color:light-dark(#596579,#aeb8ca)}nav{display:flex;flex-wrap:wrap;gap:10px 22px;padding:20px 0}a{color:light-dark(#2456be,#a9bfff)}section{background:light-dark(white,#252832);border-radius:16px;padding:20px 26px;margin:18px 0;scroll-margin-top:20px}h2{margin:0 0 10px;font-size:21px}p{margin:9px 0}li{margin:8px 0}code{font-family:inherit}footer{font-size:13px;padding-top:20px}
</style><header><h1>Ecom 帮助</h1><p>浏览、店铺账号与软件更新指南 · 可离线查看</p></header>
<nav aria-label="帮助目录"><a href="#browsing">基本使用</a><a href="#containers">店铺账号</a><a href="#updates">更新与恢复</a><a href="#privacy">隐私与权限</a><a href="#shields">屏蔽保护</a><a href="#support">问题反馈</a></nav>
<main>
<section id="browsing"><h2>基本使用</h2><p>使用地址栏打开网站；通过标签页同时处理多个页面。历史、书签、下载和设置均可从右上角菜单进入。</p><p>普通无痕窗口减少本机浏览记录保留，网站及网络服务仍可能识别登录账号和访问。下载文件及主动保存的书签会保留。</p><p><a href="chrome://downloads/">下载内容</a> · <a href="chrome://bookmarks/">书签</a> · <a href="chrome://settings/">设置</a></p></section>
<section id="containers"><h2>店铺账号与容器</h2><p>从工具栏账号入口进入账号管理，为不同店铺分别添加账号。打开店铺前核对标签上的店铺名和颜色，登录和验证码在对应账号内手动完成。</p><p>同一账号容器共享其持久登录会话，不同容器隔离网站状态。浏览器重启后保留持久数据；会话是否有效由网站决定。容器不提供独立 IP 或设备身份。</p><p>切换首页、名称或颜色会保留既有容器身份。删除账号会影响对应网站状态，请先检查目标和提示。</p><p><a href="chrome://shops/">打开账号管理</a></p></section>
<section id="updates"><h2>更新、安装与恢复</h2><ol><li>发现新版本后，右上角菜单显示“更新”。点击后确认下载，下载期间可继续工作，从同一入口重新查看状态。</li><li>更新准备好并通过校验后，菜单显示“重新启动以更新 Ecom”。请保存网页中尚未提交的内容，方便时再选择重启。</li><li>安装期间独立进度窗口显示当前阶段，完成后恢复浏览器。账号数据保留，网站会话仍以平台实际状态为准。</li></ol><p>Windows 可在“帮助 → Ecom 更新…”中查看版本和渠道，或选择“恢复上一版本”。latest 为稳定渠道，next 用于测试；切换渠道本身不会安装新版本。更新完成后程序自动清理下载和临时安装文件，保留一份回滚备份；刚退出的工作进程文件在下一次更新程序启动时清理。</p><p>更新失败时先查看错误信息。不要删除账号数据或手动覆盖正在运行的应用，请联系维护人员处理。macOS 的安装和恢复能力以该平台已验收版本为准。</p></section>
<section id="privacy"><h2>隐私、登录与站点权限</h2><p>网站 Cookie、存储和账号凭证由浏览器原生会话管理。授权的 Agent 本地接口仅开放已实现并受限的能力；账号管理中的提示词提供当前安装与使用入口。</p><p>在地址栏站点信息或“设置 → 隐私与安全”中管理 Cookie、相机、麦克风、位置、通知及硬件访问权限。按实际需要授权，清除网站数据可能使账号退出。</p><p>WebRTC 和扩展权限可能影响网站连接及可访问的数据。修改前阅读对应设置说明；容器设置可以为指定账号选择 WebRTC 策略。</p><p>浏览器访问网站、查询更新、使用搜索或保护服务时会连接相应服务商。提交反馈前检查截图、日志及页面内容，避免附带密码、Cookie、验证码或业务隐私。</p><p><a href="chrome://settings/privacy">隐私与安全</a> · <a href="chrome://settings/content">站点权限</a></p></section>
<section id="shields"><h2>屏蔽保护（Shields）</h2><p>地址栏中的保护入口用于管理当前网站的屏蔽策略。广告、脚本、Cookie 和指纹保护设置可能影响网站显示或登录；遇到异常先检查当前站点策略，按需要逐项调整。</p><p>自定义过滤规则只应用你了解的规则或可信订阅。错误规则可能隐藏页面内容或阻止必要请求。</p><p><a href="chrome://settings/shields">保护设置</a> · <a href="chrome://settings/shields/filters">过滤规则</a></p></section>
<section id="support"><h2>问题反馈与诊断</h2><p>请联系向你提供 Ecom 的内部维护人员。提供操作步骤、实际结果、系统版本、Ecom 更新窗口中的版本及渠道，以及已脱敏的错误截图。</p><p>页面打不开或登录异常时，说明是否只影响一个账号、是否在普通标签中也出现，以及发生的大致时间。验证和账号登录由用户完成。</p><p><a href="chrome://version/">查看运行版本</a> · <a href="chrome://settings/help">关于 Ecom</a></p></section>
<section id="licenses"><h2>许可证与第三方组件</h2><p>Ecom 基于 Chromium 和 Brave 的固定源码基线独立开发。第三方组件的版权与许可证保留其真实主体；导入来源和搜索服务名称按实际用途显示。</p><p><a href="chrome://credits/">第三方许可</a> · <a href="chrome://terms/">许可条款</a></p></section>
</main><footer>Ecom · 内部浏览器</footer></html>)ecom";
}  // namespace
HelpUI::HelpUI(content::WebUI* web_ui) : content::WebUIController(web_ui) {
  auto* source = content::WebUIDataSource::CreateAndAdd(
      Profile::FromWebUI(web_ui), kHelpHost);
  source->SetRequestFilter(
      base::BindRepeating([](const std::string& path) {
        const auto page = path.substr(0, path.find('?'));
        return page.empty() || page == "index.html";
      }),
      base::BindRepeating([](const std::string&,
                             content::WebUIDataSource::GotDataCallback done) {
        std::move(done).Run(base::MakeRefCounted<base::RefCountedString>(
            std::string(kHelpHtml)));
      }));
}
}  // namespace ecom
