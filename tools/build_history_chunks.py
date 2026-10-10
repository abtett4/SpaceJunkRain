"""Build bounded monthly passages from the local catalog; no downloads or invented orbits.

The pilot is 2018; --all-history exports the complete catalog in compressed passages.
Dense months are split without dividing simultaneous anchors. Existing evidence is reused.
"""
import argparse
import copy
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path

from build_tracers import ROOT, build_fallback_manifest, stamp
from event_time import EPOCH, iso, display_anchor
from mixed_sample import encoded


def build_chunks(catalog_path, enriched_path, output, year=2018, extra_paths=()):
    raw = catalog_path.read_bytes()
    catalog = json.loads(raw)
    enriched = json.loads(enriched_path.read_text())
    if enriched.get('schemaVersion') != 3:
        raise ValueError('Expected current evidence collection.')
    evidence = {e['eventId']: e for e in enriched['events']}
    if len(evidence) != len(enriched['events']):
        raise ValueError('Duplicate enriched event.')
    for extra in extra_paths:
        imported = json.loads(extra.read_text())
        if imported.get('schemaVersion') != 3:
            raise ValueError('Expected current extra evidence collection.')
        for item in imported['events']:
            event = copy.deepcopy(item)
            if event['eventId'] in evidence:
                raise ValueError('Conflicting enriched event; choose evidence explicitly.')
            for product in event['orbitalData'].values():
                product['asset'] = Path(os.path.relpath((extra.parent/product['asset']).resolve(),enriched_path.parent)).as_posix()
            evidence[event['eventId']] = event
    source = {'sha256': hashlib.sha256(raw).hexdigest(), 'source': catalog['meta']['source'],
              'generated': catalog['meta']['generated']}
    files, chunks = {}, []
    for month in range(1, 13):
        start = dt.datetime(year, month, 1, tzinfo=dt.timezone.utc)
        end = dt.datetime(year+1, 1, 1, tzinfo=dt.timezone.utc) if month == 12 else start.replace(month=month+1)
        events = []
        for i, (nid, day) in enumerate(zip(catalog['cols']['id'], catalog['cols']['d'])):
            anchor = EPOCH + dt.timedelta(days=day)
            if not start <= anchor < end:
                continue
            identifier = f'{nid}:reentry:{anchor.date().isoformat()}'
            if identifier in evidence:
                event = copy.deepcopy(evidence[identifier])
            else:
                event, _ = build_fallback_manifest(nid, [], {**catalog, 'cols': {k: [v[i]] for k,v in catalog['cols'].items()}}, {'catalog': source,
                    'gpHistory': {'status': 'not-queried', 'note': 'Orbital history not fetched for this historical passage.'}})
            events.append(event)
        events.extend(copy.deepcopy(e) for e in evidence.values() if e['eventKind'] == 'launch'
                      and start <= stamp(e['eventTime']['intervalUtc'][0]) < end)
        if not events:
            continue
        for event in events:
            for product in event['orbitalData'].values():
                asset = (enriched_path.parent / product['asset']).resolve()
                if not asset.is_file():
                    raise ValueError('Missing enriched geometry asset.')
                product['asset'] = Path(os.path.relpath(asset, output)).as_posix()
        anchor = lambda e: display_anchor(e['eventId'], e['eventTime']['date']) if e['eventTime']['precision']=='day' else stamp(e['eventTime']['intervalUtc'][0])
        ordered = sorted(events, key=lambda e: (anchor(e),e['eventId']))
        groups = []
        while ordered:
            cut = min(50,len(ordered))
            while cut < len(ordered) and cut > 0 and anchor(ordered[cut-1]) == anchor(ordered[cut]):
                cut -= 1
            if not cut:
                raise ValueError('More than 50 simultaneous anchors; needs a different scene budget.')
            groups.append(ordered[:cut]); ordered = ordered[cut:]
        # Preserve original record ordering for unsplit pilot exports.
        if len(groups)==1: groups=[events]
        for part, events in enumerate(groups):
            part_start = start if part==0 else anchor(events[0])
            part_end = end if part==len(groups)-1 else anchor(groups[part+1][0])
            reentries = [e for e in events if e['eventKind'] == 'reentry']
            coverage = { 'propagatedInput': 0, 'referenceInput': 0, 'symbolicInput': 0,
                         'historyQueryEmpty': 0, 'historyNotQueried': 0 }
            for e in reentries:
                coverage['propagatedInput' if 'propagated' in e['orbitalData'] else
                         'referenceInput' if 'reference' in e['orbitalData'] else 'symbolicInput'] += 1
                gp = e['sources'].get('gpHistory', {})
                coverage['historyNotQueried'] += gp.get('status') == 'not-queried'
                coverage['historyQueryEmpty'] += gp.get('rowCount') == 0
            key = f'{year}-{month:02}' + (f'-{part+1:03}' if len(groups)>1 else '')
            sample = {'id': key, 'title': f'{start.strftime("%B %Y")} · historical passage' + (f' · part {part+1}/{len(groups)}' if len(groups)>1 else ''),
                      'intervalUtc': [iso(part_start), iso(part_end)], 'eventCount': len(events),
                      'reentryCount': len(reentries), 'selectedLaunchCount': len(events)-len(reentries),
                      'playbackRate': 7200, 'coverage': coverage,
                      'objectTypes': {k: sum(e['attributes']['objectType']['value'] == k for e in reentries)
                                      for k in catalog['meta']['types']},
                      'selection': ('All catalog reentries in this interval; only already curated launches. Orbital coverage is partial.' if len(groups)>1 else 'All catalog reentries in this month; only already curated launches. Orbital coverage is partial.')}
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


def build_full_history(catalog_path, enriched_path, output):
    catalog = json.loads(catalog_path.read_text())
    years = sorted({(EPOCH+dt.timedelta(days=d)).year for d in catalog['cols']['d']})
    files, chunks = {}, []
    for year in years:
        yearly = build_chunks(catalog_path,enriched_path,output,year,
            extra_paths=[catalog_path.parent/'fallbacks/stale/tracers.json'])
        index = json.loads(yearly.pop('index.json'))
        for chunk in index['chunks']:
            original = yearly[chunk['asset']]
            payload = gzip.compress(original,mtime=0)
            chunk.update(asset=chunk['id']+'.json.gz',encoding='gzip',decodedBytes=len(original),
                         bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest())
            files[chunk['asset']] = payload
            chunks.append(chunk)
    files['index.json'] = encoded({'schemaVersion':1,'kind':'monthly-event-index','year':None,
        'catalog':index['catalog'],'defaultChunk':'2018-04','chunks':chunks,
        'reentryCount':sum(c['reentryCount'] for c in chunks),'eventCount':sum(c['eventCount'] for c in chunks),
        'scope':'All reentries in the supplied catalog; curated launches only. One bounded passage loaded at a time.'})
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--all-history', action='store_true')
    parser.add_argument('--year', type=int, default=2018)
    parser.add_argument('--catalog', type=Path, default=ROOT/'web/data/decays.json')
    parser.add_argument('--enriched', type=Path, default=ROOT/'web/data/samples/april-2018-launch/tracers.json')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    args.output = args.output or ROOT / 'web/data/history' / ('all' if args.all_history else str(args.year))
    files = build_full_history(args.catalog,args.enriched,args.output) if args.all_history else build_chunks(args.catalog, args.enriched, args.output, args.year)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (args.output/name).write_bytes(data)
    print(f'{len(files)-1} chunks; {sum(len(v) for v in files.values()):,} bytes; no network requests.')


if __name__ == '__main__':
    main()
