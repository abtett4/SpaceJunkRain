"""Download the GCAT tables used here (J. McDowell, planet4589.org; CC-BY-4.0).

Each run saves an immutable snapshot under data/raw/gcat/<UTC date>/ with a metadata
sidecar (URL, retrieval time, SHA-256, GCAT's own "Updated" stamp). A snapshot that
already exists for today is reused (and completed if tables were added since);
use --dry-run to see the URLs without downloading.

    python tools/fetch_gcat.py
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'raw' / 'gcat'
BASE = 'https://planet4589.org/space/gcat/tsv'
FILES = {
    'launch.tsv': f'{BASE}/launch/launch.tsv',   # every launch, orbital and suborbital
    'lp.tsv': f'{BASE}/tables/lp.tsv',           # launch points (pads) with coordinates
    'sites.tsv': f'{BASE}/tables/sites.tsv',     # launch sites, including renamed sites
    'satcat.tsv': f'{BASE}/cat/satcat.tsv',      # catalogued objects: decay, orbit, mass, owner
    'orgs.tsv': f'{BASE}/tables/orgs.tsv',       # owner and country names
}
CITATION = 'J. McDowell, GCAT: General Catalog of Artificial Space Objects, planet4589.org (CC-BY-4.0)'


def updated_stamp(data):
    for line in data.decode('utf-8', 'replace').splitlines()[:5]:
        if line.startswith('# Updated'):
            return line[2:].strip()
    return None


def latest_snapshot():
    snapshots = sorted(p for p in RAW.glob('*') if (p / 'metadata.json').is_file())
    if not snapshots:
        raise FileNotFoundError('No GCAT snapshot; run python tools/fetch_gcat.py first.')
    return snapshots[-1]


def verify(snapshot):
    meta = json.loads((snapshot / 'metadata.json').read_text())
    for name, info in meta['files'].items():
        if hashlib.sha256((snapshot / name).read_bytes()).hexdigest() != info['sha256']:
            raise ValueError(f'GCAT snapshot {snapshot.name}/{name} fails its checksum.')
    return meta


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    target = RAW / now.date().isoformat()
    if args.dry_run:
        for name, url in FILES.items():
            print(f'{name}: {url}')
        print(f'-> {target.relative_to(ROOT)}')
        return
    meta = verify(target) if (target / 'metadata.json').is_file() else None
    files = dict(meta['files']) if meta else {}
    missing = {name: url for name, url in FILES.items() if name not in files}
    if not missing:
        print(f'Reusing {target.relative_to(ROOT)} (already fetched today).')
        return
    target.mkdir(parents=True, exist_ok=True)
    for name, url in missing.items():
        request = urllib.request.Request(url, headers={'User-Agent': 'SpaceJunkRain (educational visualization)'})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        (target / name).write_bytes(data)
        files[name] = {'url': url, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                       'updated': updated_stamp(data)}
        print(f'{name}: {len(data):,} bytes, {files[name]["updated"]}')
    (target / 'metadata.json').write_text(json.dumps({
        'source': 'GCAT', 'citation': CITATION, 'license': 'CC-BY-4.0',
        'home': 'https://planet4589.org/space/gcat/',
        'retrievedAt': meta['retrievedAt'] if meta else now.isoformat().replace('+00:00', 'Z'),
        'files': files}, indent=2) + '\n')
    print(f'Saved {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
