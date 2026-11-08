// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/

#ifndef BRAVE_BROWSER_ECOM_XHS_NOTE_SERVICE_H_
#define BRAVE_BROWSER_ECOM_XHS_NOTE_SERVICE_H_

#include <map>
#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/values.h"

class Profile;

namespace ecom {

class XhsNoteService {
 public:
  explicit XhsNoteService(Profile* profile);
  ~XhsNoteService();

  void Run(const std::string& operation_id,
           const base::DictValue& request,
           base::OnceCallback<void(base::DictValue)> done);

 private:
  struct Page;
  raw_ptr<Profile> profile_;
  std::map<std::string, std::unique_ptr<Page>> pages_;
};

}  // namespace ecom

#endif  // BRAVE_BROWSER_ECOM_XHS_NOTE_SERVICE_H_
