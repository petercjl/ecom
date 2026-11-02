#!/usr/bin/env python3
"""Compile immutable WebUI assets into the native binary (no runtime file I/O)."""
import argparse
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    parts = ['// Generated Ecom shop WebUI resources.\n#pragma once\nnamespace ecom {\n']
    for filename, name in [('index.html', 'Html'), ('manager.css', 'Css'),
                           ('manager.js', 'Js'), ('model.js', 'Model')]:
        text = (args.source / filename).read_text()
        assert ')ECOMRESOURCE"' not in text
        parts.append(f'inline constexpr char kShopManager{name}[] = R"ECOMRESOURCE({text})ECOMRESOURCE";\n')
    parts.append('}\n')
    output = ''.join(parts)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Build-owned generated output: preserve its timestamp when unchanged.
    if not args.output.exists() or args.output.read_text() != output:
        args.output.write_text(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
