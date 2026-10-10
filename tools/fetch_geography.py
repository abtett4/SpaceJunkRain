"""Fetch the pinned public-domain Natural Earth display map once; never overwrite raw files."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
from build_geography import COMMIT, FILES


def fetch(output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        path = output_dir / f'{name}.geojson'
        metadata = path.with_suffix('.metadata.json')
        url = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/geojson/{name}.geojson'
        if path.exists() or metadata.exists():
            if not (path.exists() and metadata.exists()):
                raise ValueError(f'Incomplete raw snapshot at {path}; choose a new output directory.')
            meta = json.loads(metadata.read_text())
            if meta.get('url') != url or meta.get('sha256') != hashlib.sha256(path.read_bytes()).hexdigest():
                raise ValueError(f'Raw snapshot mismatch at {path}; choose a new output directory.')
            print(f'Using cached {path}')
            continue
        with urlopen(url, timeout=60) as response:
            raw = response.read()
        if json.loads(raw).get('type') != 'FeatureCollection':
            raise ValueError(f'Unexpected geography response: {url}')
        with path.open('xb') as output:
            output.write(raw)
        with metadata.open('x') as output:
            json.dump({'url': url, 'commit': COMMIT, 'sha256': hashlib.sha256(raw).hexdigest(),
                       'retrievedDate': datetime.now(timezone.utc).date().isoformat()}, output, indent=2)
            output.write('\n')
        print(f'Saved {path}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path('data/raw/geography'))
    fetch(parser.parse_args().output_dir)
