#!/usr/bin/env python3
"""Writes the list the Studio reads to update itself (dist/studio-update/studio-latest.json).

    python tools/build/studio-update-manifest.py <version> <folder with the CI artifacts>

The folder holds what the two Studio jobs upload: the Windows installer with its .sig and the
macOS .app.tar.gz with its .sig. The list points at the files of the GitHub release v<version>
under the names they are published with there, so publish those before uploading the list:

    gh release upload catalog dist/studio-update/studio-latest.json --clobber

The signatures come from the build (the private key is a secret of the repository's Actions);
this script signs nothing.
"""
import datetime
import json
import os
import sys

REPO = 'https://github.com/ALMSTRA/idv7lol/releases/download'


def find(folder, ending):
    hits = []
    for base, _dirs, files in os.walk(folder):
        hits += [os.path.join(base, f) for f in files if f.endswith(ending)]
    if len(hits) != 1:
        sys.exit('expected one file ending in %s under %s, found %d' % (ending, folder, len(hits)))
    return hits[0]


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    version, folder = sys.argv[1].lstrip('v'), sys.argv[2]
    conf = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'studio', 'src-tauri',
                        'tauri.conf.json')
    with open(conf, encoding='utf-8') as f:
        built = json.load(f)['version']
    if built != version:
        sys.exit('tauri.conf.json is version %s, not %s' % (built, version))

    def entry(sig_ending, name):
        with open(find(folder, sig_ending), encoding='utf-8') as f:
            return {'signature': f.read().strip(), 'url': '%s/v%s/%s' % (REPO, version, name)}

    win = entry('-setup.exe.sig', 'idv7lol-Studio-%s-x64-setup.exe' % version)
    mac = entry('.app.tar.gz.sig', 'idv7lol-Studio-%s-universal.app.tar.gz' % version)
    manifest = {
        'version': version,
        'notes': 'https://github.com/ALMSTRA/idv7lol/releases/tag/v%s' % version,
        'pub_date': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'platforms': {'windows-x86_64': win, 'darwin-x86_64': mac, 'darwin-aarch64': mac},
    }
    out = os.path.join(os.path.dirname(__file__), '..', '..', 'dist', 'studio-update')
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'studio-latest.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print(os.path.normpath(path))


if __name__ == '__main__':
    main()
