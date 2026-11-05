"""Build the Windows inbox-.NET update helper and immutable release identity."""
import argparse
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--icon', required=True)
    args = parser.parse_args()
    config = Path(args.config).resolve()
    root = config.parent.parent
    output = Path(args.output).resolve()
    compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler), '/nologo', '/target:winexe', '/platform:x64',
                    '/optimize+', '/utf8output', '/codepage:65001', '/reference:System.Web.Extensions.dll',
                    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
                    '/win32icon:' + str(Path(args.icon).resolve()),
                    '/out:' + str(output / 'EcomUpdater.exe'), str(Path(args.source).resolve())], check=True)
    metadata = json.loads(config.read_text(encoding='utf-8'))
    metadata['sourceRevision'] = subprocess.check_output(
        ['git', '-C', str(root), 'rev-parse', 'HEAD'], encoding='utf-8').strip()
    if metadata['sourceRevision'] != args.revision:
        raise RuntimeError('Native source changed after GN generation')
    # Generated build outputs; GN owns these two paths.
    with (output / 'ecom-update.json').open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(metadata, stream, indent=2)
        stream.write('\n')


if __name__ == '__main__':
    main()
