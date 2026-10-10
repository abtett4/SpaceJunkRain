"""Build bounded monthly passages from the local catalog; no downloads or invented orbits.

The initial shipped year is 2018. Months above the current 50-event scene bound
are rejected rather than silently truncated. Existing enriched evidence is reused.
"""
import argparse
import copy
import datetime as dt
import hashlib
import json
import os
from pathlib import Path

from build_tracers import ROOT, build_fallback_manifest, stamp
from event_time import EPOCH, iso
from mixed_sample import encoded


def build_chunks(catalog_path, enriched_path, output, year=2018):
    raw = catalog_path.read_bytes()
    catalog = json.loads(raw)
    enriched = json.loads(enriched_path.read_text())
    if enriched.get('schemaVersion') != 3:
        raise ValueError('Expected current evidence collection.')
    evidence = {e['eventId']: e for e in enriched['events']}
    if len(evidence) != len(enriched['events']):
        raise ValueError('Duplicate enriched event.')
    source = {'sha256': hashlib.sha256(raw).hexdigest(), 'source': catalog['meta']['source'],
              'generated': catalog['meta']['generated']}
    files, chunks = {}, []
    for month in range(1, 13):
        start = dt.datetime(year, month, 1, tzinfo=dt.timezone.utc)
        end = dt.datetime(year+1, 1, 1, tzinfo=dt.timezone.utc) if month == 12 else start.replace(month=month+1)
        events = []
        for nid, day in zip(catalog['cols']['id'], catalog['cols']['d']):
            anchor = EPOCH + dt.timedelta(days=day)
            if not start <= anchor < end:
                continue
            identifier = f'{nid}:reentry:{anchor.date().isoformat()}'
            if identifier in evidence:
                event = copy.deepcopy(evidence[identifier])
            else:
                event, _ = build_fallback_manifest(nid, [], catalog, {'catalog': source,
                    'gpHistory': {'status': 'not-queried', 'note': 'Orbital history not fetched for this historical passage.'}})
            events.append(event)
        events.extend(copy.deepcopy(e) for e in evidence.values() if e['eventKind'] == 'launch'
                      and start <= stamp(e['eventTime']['intervalUtc'][0]) < end)
        if not events:
            continue
        if len(events) > 50:
            raise ValueError(f'{year}-{month:02}: exceeds the 50-event scene bound; split this interval before export.')
        for event in events:
            for product in event['orbitalData'].values():
                asset = (enriched_path.parent / product['asset']).resolve()
                if not asset.is_file():
                    raise ValueError('Missing enriched geometry asset.')
                product['asset'] = Path(os.path.relpath(asset, output)).as_posix()
        reentries = [e for e in events if e['eventKind'] == 'reentry']
        coverage = { 'propagatedInput': 0, 'referenceInput': 0, 'symbolicInput': 0,
                     'historyQueryEmpty': 0, 'historyNotQueried': 0 }
        for e in reentries:
            coverage['propagatedInput' if 'propagated' in e['orbitalData'] else
                     'referenceInput' if 'reference' in e['orbitalData'] else 'symbolicInput'] += 1
            gp = e['sources'].get('gpHistory', {})
            coverage['historyNotQueried'] += gp.get('status') == 'not-queried'
            coverage['historyQueryEmpty'] += gp.get('rowCount') == 0
        key = f'{year}-{month:02}'
        sample = {'id': key, 'title': f'{start.strftime("%B %Y")} · historical passage',
                  'intervalUtc': [iso(start), iso(end)], 'eventCount': len(events),
                  'reentryCount': len(reentries), 'selectedLaunchCount': len(events)-len(reentries),
                  'playbackRate': 7200, 'coverage': coverage,
                  'objectTypes': {k: sum(e['attributes']['objectType']['value'] == k for e in reentries)
                                  for k in catalog['meta']['types']},
                  'selection': 'All catalog reentries in this month; only already curated launches. Orbital coverage is partial.'}
        payload = encoded({'schemaVersion': 3, 'sample': sample, 'events': events})
        files[f'{key}.json'] = payload
        chunks.append({'id': key, 'asset': f'{key}.json', 'intervalUtc': sample['intervalUtc'],
                       'eventCount': len(events), 'reentryCount': len(reentries),
                       'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    if not chunks:
        raise ValueError('No catalog events in the selected year.')
    default = f'{year}-04' if any(c['id'] == f'{year}-04' for c in chunks) else chunks[0]['id']
    files['index.json'] = encoded({'schemaVersion': 1, 'kind': 'monthly-event-index',
        'year': year, 'catalog': source, 'defaultChunk': default, 'chunks': chunks,
        'scope': 'One month loaded at a time; month changes pause and reset the event feed. Not continuous cross-month playback.'})
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--year', type=int, default=2018)
    parser.add_argument('--catalog', type=Path, default=ROOT/'web/data/decays.json')
    parser.add_argument('--enriched', type=Path, default=ROOT/'web/data/samples/april-2018-launch/tracers.json')
    parser.add_argument('--output', type=Path, default=ROOT/'web/data/history/2018')
    args = parser.parse_args()
    files = build_chunks(args.catalog, args.enriched, args.output, args.year)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (args.output/name).write_bytes(data)
    print(f'{len(files)-1} chunks; {sum(len(v) for v in files.values()):,} bytes; no network requests.')


if __name__ == '__main__':
    main()
