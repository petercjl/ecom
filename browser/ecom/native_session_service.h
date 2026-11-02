#ifndef BRAVE_BROWSER_ECOM_NATIVE_SESSION_SERVICE_H_
#define BRAVE_BROWSER_ECOM_NATIVE_SESSION_SERVICE_H_

class Profile;

namespace ecom {
// Opt-in, user-scoped native container reads. No remote debugging transport.
void StartNativeSessionService(Profile* profile);
}  // namespace ecom

#endif  // BRAVE_BROWSER_ECOM_NATIVE_SESSION_SERVICE_H_
