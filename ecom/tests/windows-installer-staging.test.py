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

    def test_cleanup_failure_keeps_completed_archive_result_and_owned_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            observed = []

            def original(options):
                scratch = Path(options.staging_dir)
                observed.append(scratch)
                (scratch / 'held.dll').write_bytes(b'archive input')
                return 0

            options = types.SimpleNamespace(staging_dir=directory)
            with patch.object(shutil, 'rmtree', side_effect=OSError(145, 'directory not empty')):
                self.assertEqual(wrapper(original)(options), 0)
            self.assertEqual(options.staging_dir, directory)
            self.assertTrue((observed[0] / 'held.dll').is_file())

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
