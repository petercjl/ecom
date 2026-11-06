#!/usr/bin/env python3
"""Compile immutable WebUI assets into the native binary (no runtime file I/O)."""
import argparse
import re
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    parts = ['// Generated Ecom shop WebUI resources.\n#pragma once\n#include <array>\nnamespace ecom {\n']
    for filename, name in [('index.html', 'Html'), ('manager.css', 'Css'),
                           ('manager.js', 'Js'), ('model.js', 'Model'),
                           ('memory.html', 'MemoryHtml'), ('memory.js', 'MemoryJs'),
                           ('memory.css', 'MemoryCss')]:
        text = (args.source / filename).read_text()
        assert ')ECOMRESOURCE"' not in text
        parts.append(f'inline constexpr char kShopManager{name}[] = R"ECOMRESOURCE({text})ECOMRESOURCE";\n')
    icons = ['personal','work','shopping','social','events','banking','star','travel','school','private','messaging']
    for index, name in enumerate(icons):
        text = (args.source.resolve().parents[2] / 'node_modules/@brave/leo/icons' / f'container-{name}.svg').read_text()
        text = re.sub(r'fill="#[0-9a-fA-F]+"', 'fill="#ffffff"', text)
        assert ')ECOMRESOURCE"' not in text
        parts.append(f'inline constexpr char kShopIcon{index}[] = R"ECOMRESOURCE({text})ECOMRESOURCE";\n')
    parts.append('inline constexpr std::array<const char*,11> kShopIcons = {' + ','.join(f'kShopIcon{i}' for i in range(len(icons))) + '};\n')
    parts.append('}\n')
    output = ''.join(parts)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Build-owned generated output: preserve its timestamp when unchanged.
    if not args.output.exists() or args.output.read_text() != output:
        args.output.write_text(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
