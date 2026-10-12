"""Fill catalog gaps from GCAT's satellite table (J. McDowell, planet4589.org; CC-BY-4.0).

Space-Track stays the record of which objects reentered and on which day. GCAT adds, per
object and only where it has a value:

* a time of day for the decay, when GCAT's decay falls on the same UTC day as Space-Track's
  (written into web/data/decays.json as p=1; other days keep their assigned display time);
* a reference orbit (perigee, apogee, inclination and the date GCAT gives for it), which the
  browser draws as an illustrative loop instead of a ring;
* mass and dimensions, and the owning organisation and country.

Hand-curated evidence (the Tiangong-1, Iridium and April 2018 examples) is left untouched.

    python tools/gcat_objects.py        # updates web/data/decays.json in place (idempotent)
                                        # and writes web/data/orbit-heights.json
"""
import argparse
import datetime as dt
import json
import math
from pathlib import Path

from event_time import EPOCH, UTC, apply_event_times, iso
from fetch_gcat import ROOT, latest_snapshot, verify
from gcat_launches import MONTHS, org_names, parse_time, read_tsv, source_record

CATALOG = ROOT / 'web/data/decays.json'
HEIGHTS = ROOT / 'web/data/orbit-heights.json'
# Objects with hand-curated evidence (sample, fallback and launch manifests) keep their records.
CURATED = {24965, 26926, 31309, 31777, 37820, 38023, 38249, 41486, 41565, 41568, 41569, 43267, 43268, 43269}


def number(value):
    try:
        x = float(value.rstrip('?'))
    except (AttributeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def gcat_day(text):
    parts = text.replace('?', ' ').split()
    if len(parts) < 3 or parts[1] not in MONTHS:
        return None
    try:
        return dt.date(int(parts[0]), MONTHS[parts[1]], int(parts[2]))
    except ValueError:
        return None


# GCAT payload mission categories and classes, in plain words (first code of compound values).
CATEGORY = {'COM': 'communications', 'IMG': 'imaging', 'IMG-R': 'radar imaging', 'TECH': 'technology test',
            'CAL': 'calibration target', 'SS': 'space station', 'SIG': 'signals intelligence', 'NAV': 'navigation',
            'SCI': 'science', 'MET': 'weather', 'MET-RO': 'weather', 'PLAN': 'planetary probe', 'AST': 'astronomy',
            'EW': 'early warning', 'EOSCI': 'Earth science', 'GEOD': 'geodesy', 'WEAPON': 'weapon test',
            'MGRAV': 'microgravity', 'BIO': 'biology', 'TARG': 'target', 'HUM': 'crewed spacecraft',
            'CREW': 'crewed spacecraft', 'CARGO': 'cargo spacecraft', 'RADAR': 'radar'}
CLASS = {'B': 'commercial', 'D': 'military', 'C': 'civil', 'A': 'amateur'}


def missions(snapshot):
    """GCAT JCAT -> {category, class, program} for payloads."""
    out = {}
    if not (snapshot / 'psatcat.tsv').is_file():
        return out
    for r in read_tsv(snapshot / 'psatcat.tsv'):
        code = r.get('Category', '-').split('/')[0].rstrip('?*')
        entry = {k: v for k, v in (('category', CATEGORY.get(code)), ('class', CLASS.get(r.get('Class', '-')[:1])),
                                   ('program', r.get('Program') if r.get('Program') not in (None, '', '-') else None)) if v}
        if entry:
            out[r['JCAT']] = entry
    return out


def objects(snapshot):
    """NORAD ID -> GCAT facts used here; absent or zero values are left out."""
    names = org_names(snapshot)
    mission = missions(snapshot)
    out = {}
    for r in read_tsv(snapshot / 'satcat.tsv'):
        if not r['Satcat'].isdigit():
            continue
        record = {'jcat': r['JCAT'], 'name': r['Name'], **({'mission': mission[r['JCAT']]} if r['JCAT'] in mission else {})}
        decay = gcat_day(r['DDate'])
        if decay:
            record['decayDate'] = decay.isoformat()
            if len(r['DDate'].split()) >= 4:
                try:
                    start, resolution = parse_time(r['DDate'])
                    if resolution < 86400 and start.date() == decay:
                        record['decayTime'], record['decayResolution'] = start, resolution
                except ValueError:
                    pass
        low, high, inc, epoch = number(r['Perigee']), number(r['Apogee']), number(r['Inc']), gcat_day(r['ODate'])
        if None not in (low, high, inc) and epoch:
            record['orbit'] = {'perigeeKm': low, 'apogeeKm': high, 'inclinationDeg': inc,
                               'epochUtc': iso(dt.datetime.combine(epoch, dt.time(), UTC)), 'regime': r.get('OpOrbit')}
        size = {k: v for k, v in (('massKg', number(r['Mass'])), ('lengthM', number(r['Length'])),
                                  ('diameterM', number(r['Diameter']))) if v}
        if size:
            record['size'] = size
        for key, field in (('owner', 'Owner'), ('state', 'State')):
            if r.get(field) not in (None, '', '-'):
                record[key] = {'code': r[field], 'name': names.get(r[field], r[field])}
        out[int(r['Satcat'])] = record
    return out


def load(snapshot=None):
    snapshot = snapshot or latest_snapshot()
    meta = verify(snapshot)
    if 'satcat.tsv' not in meta['files']:
        raise FileNotFoundError('GCAT snapshot lacks satcat.tsv; run python tools/fetch_gcat.py.')
    return objects(snapshot), meta


def enrich_catalog(catalog, gcat, meta):
    """Give same-day GCAT decay times to date-only rows; returns how many were applied."""
    c = catalog['cols']
    applied = disagree = 0
    for i, nid in enumerate(c['id']):
        record = gcat.get(nid)
        if nid in CURATED or not record or 'decayTime' not in record:
            continue
        day = (EPOCH + dt.timedelta(days=math.floor(c['d'][i]))).date()
        if record['decayTime'].date() != day:
            disagree += 1
            continue
        c['d'][i] = (record['decayTime'] - EPOCH).total_seconds() / 86400
        if not c['p'][i]:
            applied += 1
        c['p'][i] = 1
    apply_event_times(catalog)
    catalog['meta']['gcatTimes'] = {
        'source': source_record(meta), 'count': catalog['meta']['preciseEpochs'],
        'rule': 'A GCAT decay time is used only when it falls on the Space-Track decay day; otherwise the day keeps its assigned display time.',
        'curatedExcluded': sorted(CURATED)}
    return applied, disagree


def enrich_event(event, record, source):
    """Add GCAT orbit/size/owner to a fallback reentry event that lacks them (mutates)."""
    a = event['attributes']
    if record.get('size'):
        a['physicalSize'] = {'value': record['size'], 'basis': 'reported', 'source': 'gcat'}
    if record.get('owner'):
        a['owner'] = {'value': record['owner']['name'], 'code': record['owner']['code'], 'basis': 'reported', 'source': 'gcat'}
    if record.get('mission'):
        a['mission'] = {'value': record['mission'], 'basis': 'reported', 'source': 'gcat'}
    if record.get('state'):
        a['ownerCountry'] = {'value': record['state']['name'], 'code': record['state']['code'], 'basis': 'reported', 'source': 'gcat'}
    orbit = record.get('orbit')
    if orbit and not event['orbitalData'] and 0 < orbit['perigeeKm'] <= orbit['apogeeKm'] and 0 <= orbit['inclinationDeg'] <= 180:
        a['orbitReference'] = {**orbit, 'basis': 'reported', 'source': 'gcat',
                               'meaning': 'An orbit GCAT records for this object, dated epochUtc (often operational, not near reentry). The loop drawn from it has illustrative node, direction and phase.'}
        event['orbitalData'] = {'elements': {k: orbit[k] for k in ('perigeeKm', 'apogeeKm', 'inclinationDeg', 'epochUtc')}}
    if event['eventTime']['precision'] == 'reported-time':
        t = event['eventTime']
        t['source'] = 'gcat'
        t['resolutionSeconds'] = record.get('decayResolution', 60)
        t['intervalMeaning'] = 'Reentry time from GCAT (J. McDowell); Space-Track reports the same UTC day.'
    event['sources']['gcat'] = source
    return event


def height_index(catalog, gcat, meta):
    """Perigee/apogee per reentered object, for the page's orbit-height filter (strip and globe)."""
    rows = [(nid, gcat[nid]['orbit']) for nid in catalog['cols']['id'] if 'orbit' in gcat.get(nid, {})]
    return {'schemaVersion': 1, 'kind': 'orbit-heights', 'source': source_record(meta),
            'meaning': 'GCAT recorded orbit per NORAD ID, in km above the reference Earth; dated, often operational, not near reentry.',
            'count': len(rows), 'cols': {'id': [n for n, _ in rows],
                                         'perigee': [round(o['perigeeKm']) for _, o in rows],
                                         'apogee': [round(o['apogeeKm']) for _, o in rows]}}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--catalog', type=Path, default=CATALOG)
    args = parser.parse_args()
    gcat, meta = load(args.snapshot)
    catalog = json.loads(args.catalog.read_text())
    applied, disagree = enrich_catalog(catalog, gcat, meta)
    args.catalog.write_text(json.dumps(catalog, separators=(',', ':')) + '\n')
    HEIGHTS.write_text(json.dumps(height_index(catalog, gcat, meta), separators=(',', ':')) + '\n')
    joined = sum(1 for nid in catalog['cols']['id'] if nid in gcat)
    orbits = sum(1 for nid in catalog['cols']['id'] if 'orbit' in gcat.get(nid, {}))
    print(f'{joined:,} of {len(catalog["cols"]["id"]):,} reentries found in GCAT; {orbits:,} with an orbit; '
          f'{catalog["meta"]["preciseEpochs"]:,} with a time of day ({applied:,} newly applied); '
          f'{disagree:,} GCAT times on a different day were not used.')


if __name__ == '__main__':
    main()
