"""Build the offline display gazetteer from pinned, immutable Natural Earth inputs.

python3 tools/build_geography.py --input-dir data/raw/geography --output web/data/geography.json
No network calls. See web/assets/earth/README.md for acquisition URLs and attribution.
"""
import argparse
import hashlib
import json
from pathlib import Path

COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19'
FILES = ['ne_50m_admin_0_countries', 'ne_50m_geography_marine_polys', 'ne_110m_populated_places']


def build(input_dir):
    sources, collections = [], []
    for name in FILES:
        path = input_dir / f'{name}.geojson'
        raw = path.read_bytes()
        meta = json.loads(path.with_suffix('.metadata.json').read_text())
        digest = hashlib.sha256(raw).hexdigest()
        if meta['commit'] != COMMIT or meta['sha256'] != digest:
            raise ValueError(f'Provenance mismatch: {path}')
        sources.append(meta)
        collections.append(json.loads(raw)['features'])

    def polygons(features, marine=False):
        result = []
        for feature in features:
            geometry, p = feature['geometry'], feature['properties']
            name = (p.get('name_en') or p['name']) if marine else p['NAME_LONG']
            if name.isupper():
                name = name.title()
            parts = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
            for rings in parts:
                rings = [[[round(x, 4), round(y, 4)] for x, y, *_ in ring] for ring in rings]
                xs, ys = zip(*rings[0])
                result.append({'name': name, 'bounds': [min(xs), min(ys), max(xs), max(ys)], 'rings': rings})
        return result

    cities = [{'name': f['properties']['NAME'], 'country': f['properties']['ADM0NAME'],
               'lat': f['geometry']['coordinates'][1], 'lon': f['geometry']['coordinates'][0],
               'radiusKm': 100} for f in collections[2]]
    return {'version': 1, 'sources': sources,
            'limitations': 'Generalized contemporary geographic reference, not historical boundaries or event locations. Near means within 75 km of the listed facility point or 100 km of a listed city point.',
            'land': polygons(collections[0]), 'water': polygons(collections[1], True), 'cities': cities,
            'sites': [{'name': 'Kennedy Space Center', 'lat': 28.608402, 'lon': -80.604201, 'radiusKm': 75,
                       'reference': 'Launch Complex 39A point, approximate display reference for KSC',
                       'source': 'https://netspublic.grc.nasa.gov/main/LC%2048%20Environmental%20Assessment%20with%20Appendices_02.19.2019.pdf'}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = build(args.input_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"Wrote {args.output}: {len(result['land'])} land polygons, {len(result['water'])} water polygons, {len(result['cities'])} cities")
