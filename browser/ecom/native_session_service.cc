#include "brave/browser/ecom/native_session_service.h"

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <map>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>

#include "base/command_line.h"
#include "base/files/file_enumerator.h"
#include "base/files/file_path.h"
#include "base/files/file_path_watcher.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/message_loop/message_pump_type.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "base/task/single_thread_task_runner.h"
#include "base/threading/thread.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "base/values.h"
#include "brave/browser/ecom/business_read_service.h"
#include "brave/browser/ecom/shop_container_service.h"
#include "brave/browser/ecom/sycm_read_registry.h"
#include "brave/components/containers/content/browser/storage_partition_utils.h"
#include "brave/components/containers/core/browser/pref_names.h"
#include "brave/components/containers/core/browser/prefs.h"
#include "brave/components/containers/core/mojom/containers.mojom.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/storage_partition.h"
#include "content/public/browser/storage_partition_config.h"
#include "net/base/net_errors.h"
#include "net/cookies/site_for_cookies.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/fetch_api.mojom.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "url/gurl.h"
#include "url/origin.h"

namespace ecom {
namespace {

bool PrivatePath(const base::FilePath& path, bool directory) {
  struct stat info;
  return lstat(path.value().c_str(), &info) == 0 && info.st_uid == getuid() &&
         (info.st_mode & 0777) == (directory ? 0700 : 0600) &&
         (directory ? S_ISDIR(info.st_mode)
                    : S_ISREG(info.st_mode) && info.st_nlink == 1);
}

bool WriteExclusive(const base::FilePath& path, const std::string& text) {
  int fd = open(path.value().c_str(), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW,
                0600);
  if (fd < 0) {
    return false;
  }
  std::string_view remaining(text);
  while (!remaining.empty()) {
    ssize_t size = write(fd, remaining.data(), remaining.size());
    if (size <= 0) {
      close(fd);
      return false;
    }
    remaining.remove_prefix(size);
  }
  return close(fd) == 0;
}

bool SensitiveKey(const std::string& name) {
  std::string key = base::ToLowerASCII(name);
  return key.find("token") != std::string::npos ||
         key.find("cookie") != std::string::npos ||
         key.find("csrf") != std::string::npos ||
         key.find("password") != std::string::npos || key == "authorization" ||
         key == "secret" || key == "sessionid" || key == "session" ||
         key == "__tk" || key == "__dtk" || key == "loginpointid";
}

void Redact(base::Value& value) {
  if (value.is_dict()) {
    for (auto [key, child] : value.GetDict()) {
      if (SensitiveKey(key)) {
        child = base::Value("[REDACTED]");
      } else {
        Redact(child);
      }
    }
  } else if (value.is_list()) {
    for (auto& child : value.GetList()) {
      Redact(child);
    }
  } else if (value.is_string()) {
    const auto lower = base::ToLowerASCII(value.GetString());
    if (lower.find("token=") != std::string::npos ||
        lower.find("cookie=") != std::string::npos ||
        lower.find("csrf=") != std::string::npos ||
        lower.find("csrfid=") != std::string::npos ||
        lower.find("__tk=") != std::string::npos ||
        lower.find("__dtk=") != std::string::npos ||
        lower.find("loginpointid=") != std::string::npos) {
      value = base::Value("[REDACTED_URL]");
    }
  }
}

class NativeSessionService final : public ProfileObserver {
 public:
  NativeSessionService(Profile* profile, const GURL& allowed_origin)
      : profile_(profile),
        folder_(profile->GetPath().AppendASCII(".ecom-native-cli")),
        origin_(url::Origin::Create(allowed_origin)),
        instance_(base::Uuid::GenerateRandomV4().AsLowercaseString()),
        auth_(base::Uuid::GenerateRandomV4().AsLowercaseString()),
        ui_(base::SingleThreadTaskRunner::GetCurrentDefault()),
        io_("Ecom native CLI") {
    ui_weak_ = weak_.GetWeakPtr();
    profile_->AddObserver(this);
    base::Thread::Options options;
    options.message_pump_type = base::MessagePumpType::IO;
    if (io_.StartWithOptions(std::move(options))) {
      io_.task_runner()->PostTask(FROM_HERE,
                                  base::BindOnce(&NativeSessionService::StartIO,
                                                 base::Unretained(this)));
    }
  }

  void OnProfileWillBeDestroyed(Profile* profile) override {
    weak_.InvalidateWeakPtrs();
    requests_.clear();
    business_reads_.clear();
    profile_->RemoveObserver(this);
    profile_ = nullptr;
    if (io_.IsRunning()) {
      io_.task_runner()->PostTask(FROM_HERE,
                                  base::BindOnce(&NativeSessionService::StopIO,
                                                 base::Unretained(this)));
      io_.Stop();
    }
  }

 private:
  void StartIO() {
    if (mkdir(folder_.value().c_str(), 0700) != 0 &&
        !base::PathExists(folder_)) {
      return;
    }
    if (!PrivatePath(folder_, true)) {
      return;
    }
    auto endpoint = folder_.AppendASCII("endpoint.json");
    if (base::PathExists(endpoint)) {
      if (!PrivatePath(endpoint, false)) {
        return;
      }
      auto archive = folder_.AppendASCII("endpoint-" + instance_ + ".previous");
      if (base::PathExists(archive) || !base::Move(endpoint, archive)) {
        return;
      }
    }
    watcher_ = std::make_unique<base::FilePathWatcher>();
    if (!watcher_->Watch(folder_, base::FilePathWatcher::Type::kNonRecursive,
                         base::BindRepeating(&NativeSessionService::ScanIO,
                                             base::Unretained(this)))) {
      return;
    }
    base::DictValue metadata;
    metadata.Set("schemaVersion", 1);
    metadata.Set("instanceId", instance_);
    metadata.Set("authToken", auth_);
    metadata.Set("pid", static_cast<int>(getpid()));
    metadata.Set("product", "Ecom");
    metadata.Set("executable",
                 base::CommandLine::ForCurrentProcess()->GetProgram().value());
    metadata.Set("userDataDir", folder_.DirName().DirName().value());
    metadata.Set("allowedOrigin", origin_.Serialize());
    if (origin_.Serialize() == "https://sycm.taobao.com") {
      metadata.Set("businessReadProtocol", 1);
      metadata.Set("businessRouteProtocol", 1);
      if (SupportsSignedBusinessRoutes()) {
        metadata.Set("signedBusinessRouteProtocol", 1);
      }
      metadata.Set("businessPageOpenProtocol", 1);
      metadata.Set("businessReadRegistryHash", kSycmReadRegistryHash);
    }
    auto json = base::WriteJson(metadata);
    if (json) {
      WriteExclusive(endpoint, *json);
    }
    ScanIO(folder_, false);
  }

  void StopIO() { watcher_.reset(); }

  void ScanIO(const base::FilePath&, bool error) {
    if (error || !PrivatePath(folder_, true)) {
      return;
    }
    base::FileEnumerator files(folder_, false, base::FileEnumerator::FILES,
                               FILE_PATH_LITERAL("*.request.json"));
    for (auto file = files.Next(); !file.empty(); file = files.Next()) {
      std::string name = file.BaseName().value();
      std::string id = name.substr(0, name.size() - 13);
      if (!base::Uuid::ParseLowercase(id).is_valid() ||
          !PrivatePath(file, false)) {
        continue;
      }
      std::string text;
      if (!base::ReadFileToStringWithMaxSize(file, &text, 32768)) {
        continue;
      }
      auto message = base::JSONReader::Read(text, base::JSON_PARSE_RFC);
      if (!message || !message->is_dict()) {
        continue;
      }
      const auto& dict = message->GetDict();
      const auto* token = dict.FindString("authToken");
      const auto* instance = dict.FindString("instanceId");
      if (!token || *token != auth_ || !instance || *instance != instance_ ||
          dict.FindInt("schemaVersion") != 1) {
        base::DictValue denied;
        denied.Set("ok", false);
        denied.Set("error", base::DictValue()
                                .Set("code", "INSTANCE_AUTH_FAILED")
                                .Set("executed", false));
        WriteResponseIO(id, std::move(denied));
        base::DeleteFile(file);
        continue;
      }
      if (base::PathExists(folder_.AppendASCII(id + ".response.json"))) {
        base::DeleteFile(file);
        continue;
      }
      base::DeleteFile(file);
      ui_->PostTask(FROM_HERE,
                    base::BindOnce(&NativeSessionService::Dispatch, ui_weak_,
                                   id, std::move(message->GetDict())));
    }
  }

  void WriteResponseIO(const std::string& id, base::DictValue response) {
    response.Set("schemaVersion", 1);
    response.Set("instanceId", instance_);
    response.Set("operationId", id);
    auto text = base::WriteJson(response);
    if (text && PrivatePath(folder_, true)) {
      WriteExclusive(folder_.AppendASCII(id + ".response.json"), *text);
    }
  }

  void Respond(const std::string& id, base::DictValue response) {
    io_.task_runner()->PostTask(
        FROM_HERE,
        base::BindOnce(&NativeSessionService::WriteResponseIO,
                       base::Unretained(this), id, std::move(response)));
  }

  void Fail(const std::string& id,
            const std::string& code,
            bool executed = false,
            int status = 0) {
    Respond(id, base::DictValue()
                    .Set("ok", false)
                    .Set("error", base::DictValue()
                                      .Set("code", code)
                                      .Set("executed", executed)
                                      .Set("httpStatus", status)));
  }

  void Dispatch(const std::string& id, base::DictValue request) {
    if (!profile_) {
      return;
    }
    const auto* method = request.FindString("method");
    if (method && method->starts_with("shops.")) {
      RunShopCommand(
          profile_, base::WriteJson(request).value_or("{}"),
          base::BindOnce(
              [](base::WeakPtr<NativeSessionService> self,
                 std::string operation, std::string result) {
                if (!self) {
                  return;
                }
                auto parsed =
                    base::JSONReader::Read(result, base::JSON_PARSE_RFC);
                if (!parsed || !parsed->is_dict()) {
                  self->Fail(operation, "INVALID_RESPONSE");
                  return;
                }
                self->Respond(operation, std::move(parsed->GetDict()));
              },
              weak_.GetWeakPtr(), id));
      return;
    }
    auto containers = containers::GetContainersFromPrefs(*profile_->GetPrefs());
    if (method && *method == "containers.list") {
      base::ListValue list;
      for (const auto& container : containers) {
        list.Append(base::DictValue()
                        .Set("id", container->id)
                        .Set("name", container->name));
      }
      Respond(
          id,
          base::DictValue().Set("ok", true).Set("containers", std::move(list)));
      return;
    }
    const auto* container_id = request.FindString("containerId");
    if (method && *method == "business.read") {
      Business(id, std::move(request));
      return;
    }
    const auto* url_text = request.FindString("url");
    if (!method || *method != "session.get" || !container_id || !url_text) {
      Fail(id, "UNSUPPORTED_COMMAND");
      return;
    }
    bool found = false;
    for (const auto& container : containers) {
      if (container->id == *container_id) {
        found = true;
      }
    }
    if (!found) {
      Fail(id, "CONTAINER_NOT_FOUND");
      return;
    }
    GURL url(*url_text);
    if (!url.is_valid() || !url.SchemeIs("https") || url.has_username() ||
        url.has_password() || url::Origin::Create(url) != origin_) {
      Fail(id, "ORIGIN_NOT_ALLOWED");
      return;
    }
    const auto* shop = profile_->GetPrefs()
                           ->GetDict(containers::prefs::kShopContainers)
                           .FindDict(*container_id);
    if (shop) {
      const auto* state = shop->FindString("state");
      if (!state || *state != "ready") {
        Fail(id, "SHOP_NOT_READY");
        return;
      }
      auto verify = base::DictValue()
                        .Set("method", "shops.verify")
                        .Set("containerId", *container_id);
      RunShopCommand(
          profile_, base::WriteJson(verify).value_or("{}"),
          base::BindOnce(
              [](base::WeakPtr<NativeSessionService> self,
                 std::string operation, std::string container, GURL target,
                 std::string result) {
                if (!self) {
                  return;
                }
                auto parsed =
                    base::JSONReader::Read(result, base::JSON_PARSE_RFC);
                if (!parsed || !parsed->is_dict() ||
                    !parsed->GetDict().FindBool("ok").value_or(false)) {
                  self->Fail(operation, "SHOP_VERIFICATION_FAILED");
                  return;
                }
                self->Fetch(operation, container, target);
              },
              weak_.GetWeakPtr(), id, *container_id, url));
      return;
    }
    Fetch(id, *container_id, url);
  }

  void Business(const std::string& id, base::DictValue request) {
    const auto* container = request.FindString("containerId");
    const auto* operation = request.FindString("operation");
    const auto* params = request.FindDict("params");
    if (origin_.Serialize() != "https://sycm.taobao.com" || !container ||
        !operation || !params) {
      Fail(id, "INVALID_ARGUMENT");
      return;
    }
    std::optional<base::DictValue> signed_spec;
    if (const auto* envelope = request.Find("signedRoute")) {
      if (envelope->is_dict() && !request.Find("route")) {
        signed_spec = VerifySignedBusinessRoute(*operation, envelope->GetDict(), *params);
      }
      if (!signed_spec) {
        Fail(id, "SIGNED_BUSINESS_ROUTE_REJECTED");
        return;
      }
    }
    if (const auto* route = request.Find("route");
        route && (!route->is_dict() ||
                  !MatchesBusinessReadRoute(*operation, route->GetDict()))) {
      Fail(id, "BUSINESS_ROUTE_UNSUPPORTED");
      return;
    }
    if (requests_.size() + business_reads_.size() >= 2) {
      Fail(id, "BUSY");
      return;
    }
    const auto* shop = profile_->GetPrefs()
                           ->GetDict(containers::prefs::kShopContainers)
                           .FindDict(*container);
    if (*operation == "xhs.search-cookie-probe" && SupportsSignedBusinessRoutes()) {
      const auto* platform = shop ? shop->FindString("platform") : nullptr;
      const auto* keyword = params->FindString("keyword");
      const auto* search_id = params->FindString("search_id");
      if (!platform || *platform != "xiaohongshu") {
        Fail(id, "XHS_CONTAINER_REQUIRED");
        return;
      }
      if (params->size() != 2 || !keyword || keyword->empty() ||
          keyword->size() > 180 || !search_id || search_id->size() != 21 ||
          search_id->find_first_not_of("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") !=
              std::string::npos) {
        Fail(id, "INVALID_ARGUMENT");
        return;
      }
      StartBusinessRead(id, *container, *operation, params->Clone(), std::nullopt);
      return;
    }
    if (!shop || !shop->FindDict("identity")) {
      Fail(id, "SHOP_NOT_READY");
      return;
    }
    auto verify = base::DictValue()
                      .Set("method", "shops.verify")
                      .Set("containerId", *container);
    business_reads_[id] = nullptr;
    RunShopCommand(profile_, base::WriteJson(verify).value_or("{}"),
                   base::BindOnce(&NativeSessionService::BusinessVerified,
                                  weak_.GetWeakPtr(), id, *container,
                                  *operation, params->Clone(), std::move(signed_spec)));
  }
  void BusinessVerified(std::string id,
                        std::string container,
                        std::string operation,
                        base::DictValue params,
                        std::optional<base::DictValue> signed_spec,
                        std::string verification) {
    auto result = base::JSONReader::Read(verification, base::JSON_PARSE_RFC);
    if (!result || !result->is_dict() ||
        !result->GetDict().FindBool("ok").value_or(false)) {
      business_reads_.erase(id);
      Fail(id, "SHOP_VERIFICATION_FAILED");
      return;
    }
    StartBusinessRead(id, std::move(container), std::move(operation),
                      std::move(params), std::move(signed_spec));
  }
  void StartBusinessRead(const std::string& id,
                         std::string container,
                         std::string operation,
                         base::DictValue params,
                         std::optional<base::DictValue> signed_spec) {
    business_reads_[id] = CreateBusinessRead(
        profile_, std::move(container), std::move(operation), std::move(params),
        std::move(signed_spec),
        base::BindOnce(&NativeSessionService::BusinessFinished,
                       weak_.GetWeakPtr(), id));
    business_reads_.at(id)->Start();
  }
  void BusinessFinished(std::string id, base::DictValue result) {
    auto wrapped = base::Value(std::move(result));
    Redact(wrapped);
    Respond(id, std::move(wrapped.GetDict()));
    business_reads_.erase(id);
  }

  void Fetch(const std::string& id,
             const std::string& container_id,
             const GURL& url) {
    if (!containers::GetContainerFromPrefs(*profile_->GetPrefs(),
                                           container_id)) {
      Fail(id, "CONTAINER_NOT_FOUND");
      return;
    }
    if (requests_.size() + business_reads_.size() >= 2) {
      Fail(id, "BUSY");
      return;
    }
    auto partition_config = content::StoragePartitionConfig::Create(
        profile_, containers::kContainersStoragePartitionDomain, container_id,
        false);
    auto* partition = profile_->GetStoragePartition(partition_config);
    auto resource = std::make_unique<network::ResourceRequest>();
    resource->url = url;
    resource->method = "GET";
    resource->credentials_mode = network::mojom::CredentialsMode::kInclude;
    resource->redirect_mode = network::mojom::RedirectMode::kError;
    resource->site_for_cookies = net::SiteForCookies::FromUrl(url);
    resource->request_initiator = origin_;
    resource->referrer = origin_.GetURL();
    resource->headers.SetHeader("Accept", "application/json");
    constexpr auto annotation =
        net::DefineNetworkTrafficAnnotation("ecom_native_container_read", R"(
          semantics {
            sender: "Ecom native container CLI"
            description: "A local authenticated user requests a read using a selected container session."
            trigger: "An explicit native CLI read command."
            data: "Requested URL and the selected container's eligible site cookies."
            destination: WEBSITE
          }
          policy {
            cookies_allowed: YES
            cookies_store: "The user-selected container"
            setting: "Only enabled with an explicitly configured HTTPS origin."
            policy_exception_justification: "A local opt-in internal browser capability."
          })");
    auto loader =
        network::SimpleURLLoader::Create(std::move(resource), annotation);
    loader->SetTimeoutDuration(base::Seconds(20));
    loader->SetAllowHttpErrorResults(true);
    auto* pending = loader.get();
    requests_[id] = std::move(loader);
    auto factory = partition->GetURLLoaderFactoryForBrowserProcess();
    pending->DownloadToString(
        factory.get(),
        base::BindOnce(&NativeSessionService::OnResponse, weak_.GetWeakPtr(),
                       id, container_id),
        2 * 1024 * 1024);
  }

  void OnResponse(const std::string& id,
                  const std::string& container_id,
                  std::optional<std::string> body) {
    auto loader = std::move(requests_.at(id));
    requests_.erase(id);
    int status = loader->ResponseInfo() && loader->ResponseInfo()->headers
                     ? loader->ResponseInfo()->headers->response_code()
                     : 0;
    if (loader->NetError() != net::OK || status != 200 || !body) {
      Fail(id, "REQUEST_FAILED", true, status);
      return;
    }
    auto json = base::JSONReader::Read(*body, base::JSON_PARSE_RFC);
    if (!json) {
      Fail(id, "NON_JSON_RESPONSE", true, status);
      return;
    }
    Redact(*json);
    Respond(id, base::DictValue()
                    .Set("ok", true)
                    .Set("containerId", container_id)
                    .Set("httpStatus", status)
                    .Set("data", std::move(*json)));
  }

  raw_ptr<Profile> profile_;
  const base::FilePath folder_;
  const url::Origin origin_;
  const std::string instance_;
  const std::string auth_;
  scoped_refptr<base::SingleThreadTaskRunner> ui_;
  base::Thread io_;
  std::unique_ptr<base::FilePathWatcher> watcher_;  // Accessed on io_ only.
  std::map<std::string, std::unique_ptr<network::SimpleURLLoader>> requests_;
  std::map<std::string, std::unique_ptr<BusinessRead>> business_reads_;
  base::WeakPtr<NativeSessionService> ui_weak_;
  base::WeakPtrFactory<NativeSessionService> weak_{this};
};

}  // namespace

void StartNativeSessionService(Profile* profile) {
  if (profile->IsOffTheRecord()) {
    return;
  }
  const auto configured_origin =
      base::CommandLine::ForCurrentProcess()->GetSwitchValueASCII(
          "ecom-native-cli-origin");
  // Normal desktop launches expose the same fixed origin used by the verified
  // Dev configuration. Explicit overrides retain the existing validation.
  const GURL origin(configured_origin.empty() ? "https://sycm.taobao.com/"
                                               : configured_origin);
  if (!origin.is_valid() || !origin.SchemeIs("https") ||
      origin.has_username() || origin.has_password() || origin.path() != "/" ||
      origin.has_query() || origin.has_ref()) {
    return;
  }
  static base::NoDestructor<NativeSessionService> service(profile, origin);
}

}  // namespace ecom
