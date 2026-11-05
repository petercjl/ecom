#ifndef BRAVE_BROWSER_ECOM_SHOP_CONTAINER_STRINGS_H_
#define BRAVE_BROWSER_ECOM_SHOP_CONTAINER_STRINGS_H_
#include <string_view>

#include "build/build_config.h"
#include "content/public/browser/web_ui_data_source.h"
namespace ecom {
// Scoped Dev UI catalog: shared resource IDs remain independent of shop
// changes.
inline void AddShopContainerStrings(content::WebUIDataSource* source,
                                    std::string_view locale) {
  const struct {
    const char* key;
    const char* english;
    const char* chinese;
  } strings[] = {
      {"ecomShopTITLE", "Shop containers", "店铺容器"},
      {"ecomShopINTRO",
       "One container per platform shop account. Taobao services share the "
       "same shop session.",
       "一个平台店铺账号一个容器；同店千牛、生意参谋、万相台共用会话。"},
      {"ecomShopPLATFORM", "Platform", "所属平台"},
      {"ecomShopSELECT", "Select a platform", "请选择平台"},
      {"ecomShopTAOBAO", "Taobao / Tmall", "淘宝 / 天猫"},
      {"ecomShopNAME", "Shop name", "店铺名称"},
      {"ecomShopCREATE", "Create and log in", "创建并登录"},
      {"ecomShopREFRESH", "Refresh status", "刷新状态"},
      {"ecomShopCONFIGURE", "Configure as Taobao shop", "设为淘宝店铺"},
      {"ecomShopLOGIN", "Log in / open SYCM", "登录 / 打开生意参谋"},
      {"ecomShopQIANNIU", "Qianniu", "千牛"},
      {"ecomShopALIMAMA", "Alimama", "万相台"},
      {"ecomShopVERIFY", "Verify shop identity", "核验店铺身份"},
      {"ecomShopCONFIRM", "Confirm identity and finish", "确认店铺并完成"},
      {"ecomShopUNCONFIGURED", "General container", "普通容器"},
      {"ecomShopAWAITING_LOGIN", "Awaiting login", "待登录"},
      {"ecomShopVERIFICATION_REQUIRED", "Login or verification required",
       "需登录或验证"},
      {"ecomShopAWAITING_CONFIRMATION", "Identity found; confirm to finish",
       "已识别账号，待确认完成"},
      {"ecomShopREADY", "Identity verified", "身份已核验"},
      {"ecomShopIDENTITY_MISMATCH", "Account differs from bound shop",
       "账号与绑定店铺不符"},
      {"ecomShopBUSY", "Working…", "处理中…"},
      {"ecomShopERROR",
       "Unable to complete. Check the selected container login and try "
       "verification again.",
       "操作未完成，请检查目标容器登录状态后重新核验。"},
      {"ecomShopLAST_CHECKED", "Last verified", "上次核验"},
      {"ecomShopIDENTITY", "Platform identity", "平台识别身份"},
      {"ecomShopSERVICE_NOTE",
       "SYCM identity is checked here. Qianniu and Alimama login and "
       "authorization must be checked in their own pages.",
       "此处核验生意参谋身份；千牛、万相台的登录及授权需在各自页面确认。"},
      {"ecomShopGENERAL", "General containers and appearance",
       "普通容器与外观"},
      {"ecomShopNAME_EXISTS",
       "A container with this name already exists. Configure the existing "
       "container below.",
       "已有同名容器，请在下方配置现有容器。"},
  };
  for (const auto& item : strings) {
    source->AddString(item.key,
                      locale.starts_with("zh") ? item.chinese : item.english);
  }
  source->AddBoolean("ecomShopContainersSupported", (BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)));
}
}  // namespace ecom
#endif
