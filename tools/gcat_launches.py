"""Turn a GCAT snapshot into launch events and the compact launch index the page uses.

Only orbital launch attempts are kept (GCAT LaunchCode O*: OS success, OF failure); the
suborbital records are not part of this piece. Each launch is placed at its GCAT pad when
the pad has coordinates, otherwise at its launch site; air launches are placed at GCAT's
release (drop) area, not the runway the aircraft took off from. Every record carries GCAT's
own stated coordinate uncertainty. Launch times keep GCAT's precision (second, minute, or
day). Nothing is inferred beyond the tables.

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


def org_names(snapshot):
    """GCAT organisation/country code -> short English name where GCAT gives one."""
    names = {}
    for r in read_tsv(snapshot / 'orgs.tsv'):
        for key in ('ShortEName', 'EName', 'ShortName', 'Name'):
            if r.get(key) not in (None, '', '-'):
                names[r['Code']] = r[key]
                break
    return names


def pad_locator(snapshot):
    pads = {(r['Site'], r['Code']): r for r in read_tsv(snapshot / 'lp.tsv')}
    sites = {r['Site']: r for r in read_tsv(snapshot / 'sites.tsv')}
    names = org_names(snapshot) if (snapshot / 'orgs.tsv').is_file() else {}

    def country(site):
        # The site's state today (renamed sites point at their successor, e.g. NIIP-5 -> GIK-5).
        info = sites.get(site, {})
        code = info.get('StateCode') if clean(info.get('StateCode')) else sites.get(info.get('UCode'), {}).get('StateCode')
        return names.get(code, code) if clean(code) else None
    by_code = {}
    for (site, code), row in pads.items():
        by_code.setdefault(code, []).append(row)

    def coords(row):
        lon, lat = float(row['Longitude']), float(row['Latitude'])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError('Invalid GCAT coordinates.')
        return round(lat, 4), round(lon, 4)

    def error_km(row):
        # GCAT's Error column is the coordinate uncertainty in degrees of arc.
        try:
            return round(float(row['Error']) * 111.2, 3)
        except (KeyError, ValueError):
            return None

    def place(site, row):
        # A short, readable place: the pad's location, else the site's short name (Baykonur).
        info, renamed = sites.get(site, {}), sites.get(sites.get(site, {}).get('UCode'), {})
        for value in (row.get('Location'), info.get('ShortName'), renamed.get('ShortName'), info.get('Location'), info.get('Name')):
            if clean(value):
                return value
        return None

    def locate(site, pad):
        uncertain_pad = pad.endswith('?')
        pad = pad.rstrip('?').strip()
        renamed = sites.get(site, {}).get('UCode')
        # Exact pad, then the same pad under the site's later name (NIIP-5 -> GIK-5), then a
        # pad code that is unique in the table (VSFBS SLC4E -> VS SLC4E), then the site itself.
        row = pads.get((site, pad)) or (renamed and pads.get((renamed, pad))) \
            or (len(by_code.get(pad, [])) == 1 and pad not in ('', '-') and by_code[pad][0])
        if row and clean(row['Longitude']) and clean(row['Latitude']):
            lat, lon = coords(row)
            return {'name': row['Name'], 'place': place(site, row), 'country': country(site), 'code': f'{site} {pad}'.strip(),
                    'latitudeDeg': lat, 'longitudeDeg': lon, 'precision': 'pad', 'uncertaintyKm': error_km(row),
                    **({'padUncertain': True} if uncertain_pad else {})}
        info = sites.get(site)
        if info and clean(info['Longitude']) and clean(info['Latitude']):
            lat, lon = coords(info)
            return {'name': info['Name'], 'place': place(site, info), 'country': country(site), 'code': f'{site} {pad}'.strip(),
                    'latitudeDeg': lat, 'longitudeDeg': lon, 'precision': 'site', 'uncertaintyKm': error_km(info)}
        return None
    return locate


def launch_name(row):
    for key in ('Flight', 'Mission', 'Flight_ID'):
        if clean(row[key]):
            return row[key]
    return row['LV_Type']


def number(value):
    try:
        return float(value.rstrip('?'))
    except (AttributeError, ValueError):
        return None


def launch_orbits(snapshot):
    """Launch tag -> an orbit for its illustrative ascent: GCAT's launch-record orbit, else the
    recorded orbit of the upper stage it left in orbit (close to the insertion orbit), else of a
    payload (which may since have manoeuvred, e.g. to geostationary)."""
    by_tag = {}
    if not (snapshot / 'satcat.tsv').is_file():
        return by_tag
    for r in read_tsv(snapshot / 'satcat.tsv'):
        low, high, inc = number(r['Perigee']), number(r['Apogee']), number(r['Inc'])
        if None in (low, high, inc) or not (0 < low <= high) or not 0 <= inc <= 180:
            continue
        rank = 1 if r['Type'].startswith('R') else 2 if r['Type'].startswith('P') else None
        if rank is None:
            continue
        tag = r['Launch_Tag'].strip().replace(' ', '-')
        best = by_tag.get(tag)
        if best is None or rank < best[0]:
            by_tag[tag] = (rank, {'perigeeKm': low, 'apogeeKm': high, 'inclinationDeg': inc,
                                  'source': 'upper-stage' if rank == 1 else 'payload', 'object': r['Name']})
    return {tag: orbit for tag, (_, orbit) in by_tag.items()}


def orbital_launches(snapshot):
    """Parsed orbital launch attempts, oldest first."""
    locate = pad_locator(snapshot)
    object_orbits = launch_orbits(snapshot)
    launches = []
    for row in read_tsv(snapshot / 'launch.tsv'):
        code = row['LaunchCode']
        if not code.startswith('O'):
            continue
        start, resolution = parse_time(row['Launch_Date'])
        site = locate(row['Launch_Site'], row['Launch_Pad'])
        # Air launches: the rocket starts at the drop area, not at the carrier's runway.
        if clean(row.get('Platform')) and clean(row.get('Ascent_Site')):
            release = locate(row['Ascent_Site'], row.get('Ascent_Pad', '-'))
            if release:
                release.update(precision='release-area', carrier=row['Platform'],
                               takeoff=site['place'] if site else row['Launch_Site'])
                site = release
        if site is None:
            continue  # one record has no usable site; it is reported by the builder
        tag = row['Launch_Tag'].replace(' ', '-')
        orbit = None
        if code.startswith('OS'):
            low, high, inc = number(row.get('Perigee', '-')), number(row.get('Apogee', '-')), number(row.get('Inc', '-'))
            if None not in (low, high, inc) and 0 < low <= high and 0 <= inc <= 180:
                orbit = {'perigeeKm': low, 'apogeeKm': high, 'inclinationDeg': inc, 'source': 'launch-record'}
            else:
                orbit = object_orbits.get(tag)
        launches.append({'tag': tag, 'orbit': orbit, 'start': start, 'resolution': resolution,
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
    event = {
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
            'launchSite': {'name': site['name'], 'place': site['place'], 'country': site.get('country'), 'code': site['code'],
                           **{k: site[k] for k in ('carrier', 'takeoff', 'padUncertain') if k in site},
                           'coordinates': {'latitudeDeg': site['latitudeDeg'], 'longitudeDeg': site['longitudeDeg'],
                                           'precision': site['precision'], 'uncertaintyKm': site['uncertaintyKm'],
                                           'basis': 'reported', 'source': 'gcat',
                                           'meaning': "GCAT's coordinates and stated uncertainty for the pad, site or air-launch release area."}},
        },
        'sources': {'gcat': source},
        'orbitalData': {},
    }
    if launch.get('orbit'):
        add_orbit(event, launch)
    return event


# Illustrative heading rule: retrograde orbits (sun-synchronous etc.) and Vandenberg's polar
# launches head south; everything else heads north from the pad. A display choice, stated.
SOUTHBOUND_PLACES = ('Vandenberg',)


def add_orbit(event, launch):
    o = launch['orbit']
    heading = 'south' if o['inclinationDeg'] >= 90 or (o['inclinationDeg'] >= 80 and any(
        p in (launch['site'].get('place') or '') for p in SOUTHBOUND_PLACES)) else 'north'
    event['orbitalData'] = {'elements': {'perigeeKm': o['perigeeKm'], 'apogeeKm': o['apogeeKm'],
                                         'inclinationDeg': o['inclinationDeg'], 'epochUtc': iso(launch['start'])}}
    a = event['attributes']
    a['orbitReference'] = {'perigeeKm': o['perigeeKm'], 'apogeeKm': o['apogeeKm'], 'inclinationDeg': o['inclinationDeg'],
                           'epochUtc': iso(launch['start']), 'source': 'gcat', 'from': o['source'],
                           **({'object': o['object']} if 'object' in o else {}), 'basis': 'reported',
                           'meaning': {'launch-record': "GCAT's orbit for this launch.",
                                       'upper-stage': "The recorded orbit of the upper stage this launch left in orbit; close to the insertion orbit.",
                                       'payload': "The recorded orbit of a payload from this launch; it may have manoeuvred since (e.g. to geostationary)."}[o['source']]}
    a['ascentHeading'] = {'value': heading, 'basis': 'illustrative',
                          'rule': 'South for inclinations of 90 degrees or more, and for Vandenberg launches of 80 degrees or more; otherwise north.'}


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
    kinds = {k: sum(l['site']['precision'] == k for l in launches) for k in ('pad', 'site', 'release-area')}
    print(f"{index['count']:,} orbital launch attempts ({index['failures']} failed); {kinds['pad']:,} at a pad, "
          f"{kinds['site']} at site level, {kinds['release-area']} air-launched at a release area -> {args.output.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
