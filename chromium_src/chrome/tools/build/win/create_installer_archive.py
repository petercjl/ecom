# Copyright (c) 2023 The Brave Authors. All rights reserved.
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at https://mozilla.org/MPL/2.0/.


import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time

from os.path import join

import override_utils

from brave_chromium_utils import get_src_dir
from sign_binaries import sign_binaries


@override_utils.override_function(globals())
def main(original_function, options):
    # Each attempt owns a fresh tree. Existing staging paths may still be held
    # by Windows build input readers while the archive action is running.
    previous = options.staging_dir
    os.makedirs(previous, exist_ok=True)
    scratch = tempfile.mkdtemp(prefix='ecom-installer-', dir=previous)
    options.staging_dir = scratch
    previous_copy = shutil.copy

    def copy_owned_staging(source, destination, *args, **kwargs):
        target = (os.path.join(destination, os.path.basename(source))
                  if os.path.isdir(destination) else destination)
        try:
            owned = os.path.commonpath([os.path.abspath(target),
                                       os.path.abspath(scratch)]) == os.path.abspath(scratch)
        except ValueError:
            owned = False
        for attempt in range(6):
            try:
                return previous_copy(source, destination, *args, **kwargs)
            except PermissionError as error:
                # Windows can briefly hold a new DLL while inspecting it. Retry
                # only copies into this attempt's private tree, never inputs.
                print('Ecom installer copy failed: source={!r} target={!r} '
                      'errno={} winerror={} exists={} attempt={}'.format(
                          source, target, error.errno,
                          getattr(error, 'winerror', None),
                          os.path.exists(target), attempt + 1), file=sys.stderr)
                windows_access_error = (getattr(error, 'winerror', None) in
                                        (5, 32, 33) or
                                        (os.name == 'nt' and error.errno == 13))
                if not owned or not windows_access_error:
                    raise
                if attempt == 5:
                    # CopyFileW exposes the OS error that CRT fopen omits and
                    # uses Windows' native copy/share semantics. Never replace
                    # an existing destination through this fallback.
                    if os.name == 'nt' and not os.path.lexists(target):
                        import ctypes
                        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
                        copy_file = kernel.CopyFileW
                        copy_file.argtypes = [ctypes.c_wchar_p,
                                              ctypes.c_wchar_p, ctypes.c_int]
                        copy_file.restype = ctypes.c_int
                        copied = copy_file(os.path.abspath(source),
                                           os.path.abspath(target), 1)
                        code = ctypes.get_last_error()
                        print('Ecom installer native copy: success={} '
                              'winerror={}'.format(bool(copied), code),
                              file=sys.stderr)
                        if copied:
                            return target
                    raise
                time.sleep(0.1 * (2 ** attempt))

    shutil.copy = copy_owned_staging
    try:
        result = original_function(options)
    except Exception:
        print('Ecom installer diagnostic staging: ' + os.path.abspath(scratch),
              file=sys.stderr)
        raise
    else:
        def remove_readonly(function, filename, _error):
            os.chmod(filename, stat.S_IREAD | stat.S_IWRITE)
            function(filename)
        shutil.rmtree(scratch, onerror=remove_readonly)
        return result
    finally:
        shutil.copy = previous_copy
        options.staging_dir = previous


@override_utils.override_function(globals())
def CopyAllFilesToStagingDir(original_function, config, distribution,
                             staging_dir, build_dir, enable_hidpi,
                             include_snapshotblob, include_dxc, component_build,
                             component_ffmpeg_build, verbose):
    original_function(config, distribution, staging_dir, build_dir,
                      enable_hidpi, include_snapshotblob, include_dxc,
                      component_build, component_ffmpeg_build, verbose)
    brave_extension_locales_src_dir_path = os.path.realpath(
        os.path.join(get_src_dir(), 'brave', 'components', 'brave_extension',
                     'extension', 'brave_extension', '_locales'))
    CopyExtensionLocalization('brave_extension',
                              brave_extension_locales_src_dir_path, config,
                              staging_dir, g_archive_inputs)


@override_utils.override_function(globals())
def GetPrevVersion(_, build_dir, _temp_dir, last_chrome_installer, output_name):
    # We override GetPrevVersion because it has an unwanted side effect. The
    # `temp_dir` it gets passed is actually the staging directory. The original
    # GetPrevVersion places the previous version's chrome.dll inside this
    # directory. But because it is the staging directory, the DLL then ends up
    # in (chrome.7z in) Brave's installation directory when the delta gets
    # applied. The next delta then sees an unexpected file hash and aborts.
    # The new implementation here returns the previous version without side
    # effects.

    if not last_chrome_installer:
        return ''
    lzma_exec = GetLZMAExec(build_dir)
    prev_archive_file = os.path.join(last_chrome_installer,
                                     output_name + ARCHIVE_SUFFIX)
    chrome_dll_glob = os.path.join(CHROME_DIR, '*', 'chrome.dll')
    cmd = [lzma_exec, 'l', '-slt', prev_archive_file, chrome_dll_glob]
    try:
        output = subprocess.check_output(cmd,
                                         stderr=subprocess.STDOUT,
                                         text=True)
    except subprocess.CalledProcessError as e:
        # pylint: disable=raise-missing-from
        raise Exception("Error while running cmd: %s\n"
                        "Exit code: %s\n"
                        "Command output:\n%s" % (e.cmd, e.returncode, e.output))
    prefix, suffix = chrome_dll_glob.split('*')
    pattern = re.escape(prefix) + r'(\d+\.\d+\.\d+\.\d+)' + re.escape(suffix)
    match = re.search(pattern, output)
    assert match, "Could not find " + pattern + " in output:\n" + output
    return match.group(1)


@override_utils.override_function(globals())
def CreateArchiveFiles(original_function, options, staging_dir, current_version,
                       prev_version):
    # At least as of this writing, `current_version` and `prev_version` are
    # actually two-tuple build numbers y.z, not four-tuple version numbers
    # w.x.y.z.
    current_version_full = BuildVersion()
    SignAndCopyPreSignedBinaries(options.skip_signing, options.output_dir,
                                 staging_dir, current_version_full)
    return original_function(options, staging_dir, current_version,
                             prev_version)


@override_utils.override_function(globals())
def PrepareSetupExec(original_function, options, current_version, prev_version):
    if options.skip_signing:
        return original_function(options, current_version, prev_version)
    build_dir_before = options.build_dir
    options.build_dir = join(options.build_dir, 'presigned_binaries')
    try:
        return original_function(options, current_version, prev_version)
    finally:
        options.build_dir = build_dir_before


def CopyExtensionLocalization(extension_name, locales_src_dir_path, config,
                              staging_dir, g_archive_inputs):
    """Copies extension localization files from locales_src_dir_path to
    \\<out_gen_dir>\\chrome\\installer\\mini_installer\\mini_installer
    \\temp_installer_archive\\Chrome-bin\\<version>\\resources\\extension_name
    \\_locales
    """
    locales_dest_path = staging_dir
    locales_dest_path = os.path.join(
        locales_dest_path, config.get('GENERAL', 'brave_resources.pak'),
        'resources', extension_name, '_locales')
    locales_dest_path = os.path.realpath(locales_dest_path)
    shutil.rmtree(locales_dest_path, ignore_errors=True)
    shutil.copytree(locales_src_dir_path, locales_dest_path)
    # The "nb" locale is a subset of "no". Chromium uses the former, while
    # Transifex uses the latter. To integrate with Transifex, our code renames
    # "nb" to "no". But we still need to present "nb" to Chromium. The following
    # code achieves this:
    os.rename(os.path.join(locales_dest_path, 'no'),
              os.path.join(locales_dest_path, 'nb'))
    # Files are copied, but we need to inform g_archive_inputs about that
    for root, _, files in os.walk(locales_dest_path):
        for name in files:
            rel_dir = os.path.relpath(root, locales_dest_path)
            rel_file = os.path.join(rel_dir, name)
            candidate = os.path.join('.', 'resources', extension_name,
                                     '_locales', rel_file)
            g_archive_inputs.append(candidate)


def SignAndCopyPreSignedBinaries(skip_signing, output_dir, staging_dir,
                                 current_version):
    if not skip_signing:
        sign_binaries(staging_dir)
        # Copy pre-signed files into the staging directory. This is important
        # when Widevine host verification is enabled, because it ensures that
        # the associated .sig files remain valid.
        src_dir = os.path.join(output_dir, 'presigned_binaries')
        chrome_dir = os.path.join(staging_dir, CHROME_DIR)
        version_dir = os.path.join(chrome_dir, current_version)
        shutil.copy(os.path.join(src_dir, 'Ecom.exe'), chrome_dir)
        shutil.copy(os.path.join(src_dir, 'chrome.dll'), version_dir)
