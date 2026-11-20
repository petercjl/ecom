"""Exercise the Windows archive wrapper without importing Chromium tooling."""
from pathlib import Path
import sys
import shutil
import tempfile
import types
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[2] / (
    'chromium_src/chrome/tools/build/win/create_installer_archive.py')


def wrapper(original):
    overrides = types.ModuleType('override_utils')

    def decorate(namespace):
        def register(function):
            previous = namespace.get(function.__name__, lambda *args: None)
            return lambda *args: function(previous, *args)
        return register

    overrides.override_function = decorate
    utils = types.ModuleType('brave_chromium_utils')
    utils.get_src_dir = lambda: str(SOURCE.parents[5])
    signing = types.ModuleType('sign_binaries')
    signing.sign_binaries = lambda *args: None
    namespace = {'main': original}
    with patch.dict(sys.modules, {'override_utils': overrides,
                                 'brave_chromium_utils': utils,
                                 'sign_binaries': signing}):
        exec(compile(SOURCE.read_text(), str(SOURCE), 'exec'), namespace)
    return namespace['main']


class InstallerStagingTest(unittest.TestCase):
    def test_unique_attempts_keep_existing_tree_and_clean_readonly_copies(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            existing = parent / 'temp_installer_archive'
            existing.mkdir()
            (existing / 'retained').write_text('previous build input')
            observed = []

            def original(options):
                scratch = Path(options.staging_dir)
                observed.append(scratch)
                output = scratch / 'payload.dll'
                output.write_bytes(b'fixture')
                output.chmod(0o400)
                return 7

            execute = wrapper(original)
            options = types.SimpleNamespace(staging_dir=str(parent))
            for _ in range(2):
                self.assertEqual(execute(options), 7)
                self.assertEqual(options.staging_dir, str(parent))
            self.assertNotEqual(*observed)
            self.assertTrue(all(p.parent == parent and not p.exists()
                                for p in observed))
            self.assertEqual((existing / 'retained').read_text(),
                             'previous build input')

    def test_transient_windows_copy_is_retried_and_copy_hook_restored(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.dll'
            source.write_bytes(b'payload')
            real_copy = shutil.copy
            attempts = []

            def copy_once_locked(src, dst, *args, **kwargs):
                attempts.append(dst)
                if len(attempts) == 1:
                    error = PermissionError(13, 'sharing conflict')
                    error.winerror = 32
                    raise error
                return real_copy(src, dst, *args, **kwargs)

            def original(options):
                shutil.copy(source, options.staging_dir)
                self.assertEqual((Path(options.staging_dir) / source.name).read_bytes(), b'payload')

            with patch.object(shutil, 'copy', copy_once_locked), patch('time.sleep') as sleep:
                wrapper(original)(types.SimpleNamespace(staging_dir=directory))
                self.assertIs(shutil.copy, copy_once_locked)
                sleep.assert_called_once_with(0.1)
            self.assertIs(shutil.copy, real_copy)
            self.assertEqual(len(attempts), 2)

    def test_persistent_windows_copy_failure_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            error = PermissionError(13, 'access denied')
            error.winerror = 5

            def original(options):
                shutil.copy('input.dll', options.staging_dir)

            with patch.object(shutil, 'copy', side_effect=error) as copy, patch('time.sleep') as sleep:
                with self.assertRaises(PermissionError):
                    wrapper(original)(types.SimpleNamespace(staging_dir=directory))
                self.assertEqual(copy.call_count, 6)
                self.assertEqual(sleep.call_count, 5)

    def test_other_copy_errors_are_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            def original(options):
                shutil.copy('input.dll', options.staging_dir)

            with patch.object(shutil, 'copy', side_effect=PermissionError(13, 'permission')) as copy, patch('time.sleep') as sleep:
                with self.assertRaises(PermissionError):
                    wrapper(original)(types.SimpleNamespace(staging_dir=directory))
                self.assertEqual(copy.call_count, 1)
                sleep.assert_not_called()

    def test_failure_preserves_diagnostics_and_restores_original_options(self):
        with tempfile.TemporaryDirectory() as directory:
            observed = []

            def original(options):
                scratch = Path(options.staging_dir)
                observed.append(scratch)
                (scratch / 'diagnostic').write_text('failure evidence')
                raise ValueError('archive failed')

            options = types.SimpleNamespace(staging_dir=directory)
            with self.assertRaisesRegex(ValueError, 'archive failed'):
                wrapper(original)(options)
            self.assertEqual(options.staging_dir, directory)
            self.assertEqual((observed[0] / 'diagnostic').read_text(),
                             'failure evidence')


if __name__ == '__main__':
    unittest.main()
