# Copyright 2026 The Ecom Authors. All rights reserved.
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. https://mozilla.org/MPL/2.0/.

import pathlib
import runpy
import sys
import types
import unittest
from unittest.mock import patch


class BrandingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = pathlib.Path(__file__).resolve().parents[3]
        sys.path.insert(0, str(root / 'script'))

        class Message:
            def __init__(self, name, translations):
                self.attrs = {'name': name}
                self.translations = translations

            def Translate(self, lang, gender):
                return self.translations[lang]

        class Builder:
            def _EncodingForOutputType(self, kind):
                return 'utf_16'

        grit = types.ModuleType('grit')
        node = types.ModuleType('grit.node')
        messages = types.ModuleType('grit.node.message')
        messages.MessageNode = Message
        node.message = messages
        grit.node = node
        with patch.dict(sys.modules, {
                'grit': grit, 'grit.node': node,
                'grit.node.message': messages}):
            scope = runpy.run_path(
                str(root / 'chromium_src/tools/grit/grit/tool/build.py'),
                init_globals={'RcBuilder': Builder,
                              'GetFormatter': lambda kind: None})
        cls.brand = staticmethod(scope['_EcomBrandMessage'])
        cls.message = Message

    def test_chinese_and_english_keep_translation_identity(self):
        name = 'IDS_BRAVE_CONFIRM_P3A_INFO_BAR'
        translations = {'en': 'Brave uses privacy-preserving product analytics',
                        'zh-CN': 'Brave 使用完全隐私的产品分析来估计某些功能的整体使用情况'}
        item = self.message(name, translations)
        self.assertEqual(item.Translate('zh-CN', 'default'),
                         'Ecom 使用完全隐私的产品分析来估计某些功能的整体使用情况')
        self.assertEqual(item.Translate('en', 'default'),
                         'Ecom uses privacy-preserving product analytics')
        self.assertEqual(item.attrs['name'], name)
        self.assertTrue(item.translations['en'].startswith('Brave'))

    def test_boundaries_and_placeholders(self):
        self.assertEqual(self.brand('在Brave中打开：$1 - Brave；BRAVE %s'),
                         '在Ecom中打开：$1 - Ecom；Ecom %s')
        self.assertEqual(self.brand('Bravery BraveBrowser IDS_BRAVE_NAME'),
                         'Bravery BraveBrowser IDS_BRAVE_NAME')
        self.assertEqual(self.brand("Brave's settings"), "Ecom's settings")
        self.assertEqual(self.brand('启用BraveWallet / BraveVPN'),
                         '启用EcomWallet / EcomVPN')
        self.assertEqual(self.brand('BraveWalletZCash'), 'BraveWalletZCash')

    def test_links_protocols_flags_and_api_names(self):
        text = ('Brave <a href="https://brave.com/Brave">Brave</a> '
                'brave://settings support.brave.com --brave-sync '
                'navigator.brave help@brave.com brave.exe')
        expected = ('Ecom <a href="https://brave.com/Brave">Ecom</a> '
                    'brave://settings support.brave.com --brave-sync '
                    'navigator.brave help@brave.com brave.exe')
        self.assertEqual(self.brand(text), expected)

    def test_legal_and_import_source_identity(self):
        for name in ['IDS_ABOUT_VERSION_COPYRIGHT', 'IDS_LICENSE_TITLE',
                     'IDS_TERMS_OF_USE', 'IDS_PRIVACY_POLICY', 'IDS_IMPORT_FROM_BRAVE']:
            self.assertEqual(self.brand('Brave', name), 'Brave')
        self.assertEqual(self.brand('The Brave Authors; Brave Software, Inc.'),
                         'The Brave Authors; Brave Software, Inc.')

    def test_idempotence_and_unrelated_text(self):
        text = 'Brave Shields / Ecom 设置 / Google Chrome'
        result = self.brand(text)
        self.assertEqual(result, 'Ecom Shields / Ecom 设置 / Google Chrome')
        self.assertEqual(self.brand(result), result)


if __name__ == '__main__':
    unittest.main()
