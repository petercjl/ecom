#ifndef BRAVE_BROWSER_ECOM_SHOP_CONTAINER_SERVICE_H_
#define BRAVE_BROWSER_ECOM_SHOP_CONTAINER_SERVICE_H_

#include "base/functional/callback_forward.h"
#include <memory>
#include <string>

class Profile;
namespace content {
class WebUIMessageHandler;
}
namespace ecom {
// Both trusted settings UI and authenticated native CLI use this contract.
void RunShopCommand(Profile *profile, std::string request,
                    base::OnceCallback<void(std::string)> callback);
std::unique_ptr<content::WebUIMessageHandler> CreateShopSettingsHandler();
} // namespace ecom
#endif
