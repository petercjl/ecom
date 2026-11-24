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
    workspace = (args.source / 'index.html').read_text()
    assert workspace.count('<!-- ECOM_ROUTING_VIEW -->') == 1
    workspace = workspace.replace('<!-- ECOM_ROUTING_VIEW -->',
                                  (args.source / 'routing.html').read_text())
    for filename, name in [('index.html', 'Html'), ('manager.css', 'Css'),
                           ('manager.js', 'Js'), ('model.js', 'Model'),
                           ('memory.html', 'MemoryHtml'), ('memory.js', 'MemoryJs'),
                           ('memory.css', 'MemoryCss'),
                           ('routing.html', 'RoutingHtml'), ('routing.js', 'RoutingJs'),
                           ('routing.css', 'RoutingCss'), ('routing-model.js', 'RoutingModel'),
                           ('product-status.html', 'ProductStatusHtml'),
                           ('product-status.js', 'ProductStatusJs')]:
        # Legacy routing URLs resolve to the same workspace and active view.
        text = workspace if filename in ('index.html', 'routing.html') else (args.source / filename).read_text()
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
