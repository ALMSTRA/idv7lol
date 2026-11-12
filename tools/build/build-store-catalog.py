"""Build the car app as a ready OAP package and the MGU Store catalog that lists it.

The Store reads a GitHub repository on the channel its owner picks. On a branch it builds the app
on the head unit from mgu-repo.json; on Releases it reads the catalog.json of a release named
`catalog`. This script makes what that release holds, so idv7lol installs on either channel:

    dist/catalog/catalog.json
    dist/catalog/idv7lol@<version>.tgz   the OAP package, without node_modules/oap-sdk
    dist/catalog/idv7lol.png             the icon the Store shows

BMW's oap-sdk is not redistributable and is not needed here: kit/tools/build.py is run with an
empty stand-in for it, and the stand-in is taken out of the package again. The head unit makes the
oap-sdk module from one of its own BMW apps when the package has none (mgu-store,
docs/PUBLISHING.md, "Releases": "Leave out node_modules/oap-sdk").

    python tools/build/build-store-catalog.py
"""
import gzip
import hashlib
import importlib.util
import io
import json
import os
import shutil
import sys
import tarfile
import tempfile
from urllib.parse import quote

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
APP = 'idv7lol'
OUT = os.path.join(ROOT, 'dist', 'catalog')
REPO = 'ALMSTRA/idv7lol'
TAG = 'catalog'


def load_kit_build():
    path = os.path.join(ROOT, 'kit', 'tools', 'build.py')
    sys.path.insert(0, os.path.dirname(path))
    spec = importlib.util.spec_from_file_location('kit_build', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def without_sdk(src, dst, extra):
    """Copy the npm-format package, leaving out node_modules (only the oap-sdk stand-in is there)
    and adding `extra` to its package.json (the head units it is for, as Store packages say)."""
    kept = 0
    with tarfile.open(src, 'r:gz') as tin, gzip.GzipFile(dst, 'wb', mtime=0) as gz, \
            tarfile.open(fileobj=gz, mode='w') as tout:
        for m in tin.getmembers():
            if m.name == 'package/node_modules' or m.name.startswith('package/node_modules/'):
                continue
            # Built on Windows, entries come out world-writable (666/777); give them the modes and
            # owner a Linux build has, like the Store packages that install on the car.
            m.mode = 0o755 if m.isdir() else 0o644
            m.uid = m.gid = 0
            m.uname = m.gname = ''
            if m.name == 'package/package.json':
                pkg = json.load(tin.extractfile(m))
                pkg.update(extra)
                data = (json.dumps(pkg, indent=2) + '\n').encode('utf-8')
                m.size = len(data)
                tout.addfile(m, io.BytesIO(data))
            else:
                tout.addfile(m, tin.extractfile(m) if m.isfile() else None)
            kept += 1
    return kept


def main():
    kit = load_kit_build()
    spec = json.load(open(os.path.join(ROOT, 'apps', APP, 'app.json'), encoding='utf-8'))
    ver = spec['version']
    with tempfile.TemporaryDirectory(prefix='no-oap-sdk-') as stub:
        # build.py only copies these two files into node_modules/oap-sdk; they are dropped below.
        for name, text in (('index.js', '// stand-in, removed from the package\n'),
                           ('package.json', '{"name": "oap-sdk", "version": "0.0.0"}\n')):
            open(os.path.join(stub, name), 'w', encoding='utf-8').write(text)
        kit.SDK = stub
        kit.build(APP)
    built = os.path.join(ROOT, 'dist', f'{APP}@{ver}.tgz')
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    pkg = os.path.join(OUT, f'{APP}@{ver}.tgz')
    kept = without_sdk(built, pkg, {'productName': spec['title'], 'mguHmi': ['ID7']})

    # The package must name the same id and version, and carry no oap-sdk.
    with tarfile.open(pkg, 'r:gz') as t:
        names = t.getnames()
        meta = json.load(t.extractfile('package/package.json'))
    assert meta['name'] == APP and meta['version'] == ver and meta['mguHmi'] == ['ID7'], meta
    assert not any('oap-sdk' in n for n in names), 'oap-sdk left in the package'
    with tarfile.open(pkg, 'r:gz') as t:
        assert all(m.mode in (0o644, 0o755) and '\\' not in m.name for m in t.getmembers()), 'modes or names'
    assert 'package/javascript/app.js' in names and 'package/rhmiData/application.json' in names

    icon_src = os.path.join(ROOT, 'dist', APP, 'rhmiData', 'resources', f'{APP}_icon.png')
    icon = os.path.join(OUT, f'{APP}.png')
    shutil.copy(icon_src, icon)
    assert os.path.getsize(icon) <= 128 * 1024, 'the Store takes icons up to 128 KiB'

    requires = json.load(open(os.path.join(ROOT, 'mgu-repo.json'), encoding='utf-8'))['components'][0]['requires']
    name = os.path.basename(pkg)
    catalog = {
        'schema': 2,
        'components': [{
            'id': APP,
            'kind': 'app',
            'title': spec['title'],
            'description': spec['description'],
            'author': 'ALMSTRA',
            'version': ver,
            'artifact': {
                'name': name,
                'size': os.path.getsize(pkg),
                'sha256': sha256(pkg),
                # encoded as the Store encodes release downloads (encodeURIComponent): @ is %40
                'url': f'https://github.com/{REPO}/releases/download/{TAG}/{quote(name, safe="")}',
            },
            'icon': os.path.basename(icon),
            'iconSha256': sha256(icon),
            'requires': requires,
            'uninstallable': True,
            'mguHmi': ['ID7'],
        }],
    }
    json.dump(catalog, open(os.path.join(OUT, 'catalog.json'), 'w', encoding='utf-8', newline='\n'), indent=2)
    print(f'{name}: {os.path.getsize(pkg) // 1024} KiB, {kept} entries, no oap-sdk')
    print(f'catalog: {os.path.join(OUT, "catalog.json")}')


if __name__ == '__main__':
    main()
