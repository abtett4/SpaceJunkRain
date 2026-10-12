"""Turn a GCAT snapshot into launch events and the compact launch index the page uses.

Only orbital launch attempts are kept (GCAT LaunchCode O*: OS success, OF failure); the
suborbital records are not part of this piece. Each launch is placed at its GCAT pad when
the pad has coordinates, otherwise at its launch site; the record says which. Launch times
keep GCAT's precision (second, minute, or day). Nothing is inferred beyond the tables.

    python tools/gcat_launches.py            # writes web/data/launches.json
"""
import argparse
import datetime as dt
import json
import re
from pathlib import Path

from event_time import UTC, display_anchor, iso
from fetch_gcat import ROOT, latest_snapshot, verify

MONTHS = {m: i + 1 for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}
DATE = re.compile(r'^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{2})(\d{2})(?::(\d{2}))?)?')


def read_tsv(path):
    lines = path.read_text(encoding='utf-8').splitlines()
    header = lines[0].lstrip('#').split('\t')
    return [{k: (row[i].strip() if i < len(row) else '') for i, k in enumerate(header)}
            for row in (line.split('\t') for line in lines[1:] if line and not line.startswith('#'))]


def parse_time(text):
    """GCAT 'YYYY Mon DD HHMM:SS' (seconds or time optional) -> (start, resolution seconds)."""
    m = DATE.match(text.strip())
    if not m:
        raise ValueError(f'Unreadable GCAT launch date: {text!r}')
    year, month, day, hh, mm, ss = m.groups()
    base = dt.datetime(int(year), MONTHS[month], int(day), tzinfo=UTC)
    if hh is None:
        return base, 86400
    start = base + dt.timedelta(hours=int(hh), minutes=int(mm), seconds=int(ss or 0))
    return start, 1 if ss else 60


def clean(value):
    return None if value in ('', '-') else value


def pad_locator(snapshot):
    pads = {(r['Site'], r['Code']): r for r in read_tsv(snapshot / 'lp.tsv')}
    sites = {r['Site']: r for r in read_tsv(snapshot / 'sites.tsv')}
    by_code = {}
    for (site, code), row in pads.items():
        by_code.setdefault(code, []).append(row)

    def coords(row):
        lon, lat = float(row['Longitude']), float(row['Latitude'])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError('Invalid GCAT coordinates.')
        return round(lat, 4), round(lon, 4)

    def place(site, row):
        # A short, readable place: the pad's location, else the site's short name (Baykonur).
        info, renamed = sites.get(site, {}), sites.get(sites.get(site, {}).get('UCode'), {})
        for value in (row.get('Location'), info.get('ShortName'), renamed.get('ShortName'), info.get('Location'), info.get('Name')):
            if clean(value):
                return value
        return None

    def locate(site, pad):
        pad = pad.rstrip('?').strip()
        renamed = sites.get(site, {}).get('UCode')
        # Exact pad, then the same pad under the site's later name (NIIP-5 -> GIK-5), then a
        # pad code that is unique in the table (VSFBS SLC4E -> VS SLC4E), then the site itself.
        row = pads.get((site, pad)) or (renamed and pads.get((renamed, pad))) \
            or (len(by_code.get(pad, [])) == 1 and pad not in ('', '-') and by_code[pad][0])
        if row and clean(row['Longitude']) and clean(row['Latitude']):
            lat, lon = coords(row)
            return {'name': row['Name'], 'place': place(site, row),
                    'code': f'{site} {pad}'.strip(), 'latitudeDeg': lat, 'longitudeDeg': lon, 'precision': 'pad'}
        info = sites.get(site)
        if info and clean(info['Longitude']) and clean(info['Latitude']):
            lat, lon = coords(info)
            return {'name': info['Name'], 'place': place(site, info),
                    'code': f'{site} {pad}'.strip(), 'latitudeDeg': lat, 'longitudeDeg': lon, 'precision': 'site'}
        return None
    return locate


def launch_name(row):
    for key in ('Flight', 'Mission', 'Flight_ID'):
        if clean(row[key]):
            return row[key]
    return row['LV_Type']


def orbital_launches(snapshot):
    """Parsed orbital launch attempts, oldest first."""
    locate = pad_locator(snapshot)
    launches = []
    for row in read_tsv(snapshot / 'launch.tsv'):
        code = row['LaunchCode']
        if not code.startswith('O'):
            continue
        start, resolution = parse_time(row['Launch_Date'])
        site = locate(row['Launch_Site'], row['Launch_Pad'])
        if site is None:
            continue  # one record has no usable site; it is reported by the builder
        launches.append({'tag': row['Launch_Tag'].replace(' ', '-'), 'start': start, 'resolution': resolution,
                         'name': launch_name(row), 'vehicle': clean(row['LV_Type']), 'agency': clean(row['Agency']),
                         'outcome': 'success' if code.startswith('OS') else 'failure', 'code': code, 'site': site})
    launches.sort(key=lambda l: (l['start'], l['tag']))
    return launches


def source_record(meta):
    info = meta['files']['launch.tsv']
    return {'title': 'GCAT: General Catalog of Artificial Space Objects', 'author': 'Jonathan C. McDowell',
            'url': meta['home'], 'license': meta['license'], 'citation': meta['citation'],
            'file': 'launch.tsv, lp.tsv, sites.tsv', 'sha256': info['sha256'], 'updated': info['updated'],
            'retrievedAt': meta['retrievedAt']}


def launch_event(launch, source):
    date = launch['start'].date().isoformat()
    if launch['resolution'] == 86400:
        time = {'date': date, 'precision': 'day', 'resolutionSeconds': 86400,
                'intervalUtc': [iso(launch['start']), iso(launch['start'] + dt.timedelta(days=1))],
                'basis': 'reported', 'source': 'gcat',
                'intervalMeaning': 'GCAT gives only the day; the display time within it is assigned.'}
    else:
        time = {'date': date, 'precision': 'reported-time', 'resolutionSeconds': launch['resolution'],
                'intervalUtc': [iso(launch['start']), iso(launch['start'] + dt.timedelta(seconds=launch['resolution']))],
                'basis': 'reported', 'source': 'gcat'}
    site = launch['site']
    return {
        'schemaVersion': 2,
        'eventId': f"{launch['tag']}:launch:{date}",
        'eventKind': 'launch',
        'object': {'noradId': None, 'objectId': launch['tag'], 'name': launch['name'], 'launchFamily': launch['tag']},
        'representation': {'kind': 'launch', 'noradIds': [], 'representedObjectCount': 0},
        'eventTime': time,
        'attributes': {
            'objectType': {'value': None, 'basis': 'not-applicable', 'note': 'A launch, not a catalogued object.'},
            'launchOutcome': {'value': launch['outcome'], 'code': launch['code'], 'basis': 'reported', 'source': 'gcat'},
            'launchVehicle': {'value': launch['vehicle'], 'basis': 'reported', 'source': 'gcat'},
            'agency': {'value': launch['agency'], 'basis': 'reported', 'source': 'gcat'},
            'launchSite': {'name': site['name'], 'place': site['place'], 'code': site['code'],
                           'coordinates': {'latitudeDeg': site['latitudeDeg'], 'longitudeDeg': site['longitudeDeg'],
                                           'precision': site['precision'], 'basis': 'reported', 'source': 'gcat'}},
        },
        'sources': {'gcat': source},
        'orbitalData': {},
    }


def anchor(launch):
    return display_anchor(f"{launch['tag']}:launch:{launch['start'].date().isoformat()}", launch['start'].date().isoformat()) \
        if launch['resolution'] == 86400 else launch['start']


def launch_index(launches, meta):
    """Columns for the page's event strip: every orbital launch attempt, one row each."""
    epoch = dt.datetime(1957, 1, 1, tzinfo=UTC)
    return {'schemaVersion': 1, 'kind': 'launch-index', 'source': source_record(meta),
            'meaning': 't = display time in seconds since 1957-01-01 UTC (assigned within the day when GCAT gives only the day); ok = 1 success, 0 failure.',
            'count': len(launches), 'failures': sum(l['outcome'] == 'failure' for l in launches),
            'cols': {'t': [round((anchor(l) - epoch).total_seconds()) for l in launches],
                     'tag': [l['tag'] for l in launches], 'name': [l['name'] for l in launches],
                     'ok': [int(l['outcome'] == 'success') for l in launches]}}


def load(snapshot=None):
    snapshot = snapshot or latest_snapshot()
    meta = verify(snapshot)
    return orbital_launches(snapshot), meta


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'web/data/launches.json')
    args = parser.parse_args()
    launches, meta = load(args.snapshot)
    index = launch_index(launches, meta)
    args.output.write_text(json.dumps(index, separators=(',', ':')) + '\n')
    pads = sum(l['site']['precision'] == 'pad' for l in launches)
    print(f"{index['count']:,} orbital launch attempts ({index['failures']} failed); {pads:,} at a pad, "
          f"{index['count'] - pads} at site level -> {args.output.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
