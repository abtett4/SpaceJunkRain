"""Build one sourced launch and compose it with the existing reentry passage, offline.

This exports an early reference ellipse, not powered ascent or a position estimate.
The curated source report controls launch time/site, never the GP publication time.
"""
import argparse
import copy
import datetime as dt
import hashlib
import json
import math
import os
import pathlib

from build_tracers import ROOT, attributes_from_gp, load_gp_snapshot, stamp
from event_time import EPOCH, event_id, iso
from representative_orbit import MAX_DISPLAY_SECONDS, representative_loop


def build_launch(spec, rows, catalog, gp_source):
    nid = spec['noradId']
    c, meta = catalog['cols'], catalog['meta']
    if spec.get('schemaVersion') != 1 or c['id'].count(nid) != 1:
        raise ValueError('Launch must join one catalog object.')
    i = c['id'].index(nid)
    kind = meta['types'][c['k'][i]]
    if kind not in ('PAYLOAD', 'ROCKET BODY'):
        raise ValueError('Do not turn debris parent-launch dates into launch events.')
    anchor = stamp(spec['reportedTimeUtc'])
    day = anchor.date().isoformat()
    if (EPOCH + dt.timedelta(days=c['l'][i])).date() != anchor.date():
        raise ValueError('Sourced launch day disagrees with catalog.')
    if spec['timeResolutionSeconds'] != 60 or anchor.second or anchor.microsecond:
        raise ValueError('This example requires a sourced minute-resolution timestamp.')
    site = spec['site']
    if not (all(math.isfinite(site[k]) for k in ('latitudeDeg', 'longitudeDeg'))
            and -90 <= site['latitudeDeg'] <= 90 and -180 <= site['longitudeDeg'] <= 180):
        raise ValueError('Invalid launch site coordinates.')
    if any(int(row['NORAD_CAT_ID']) != nid or row.get('OBJECT_ID') != spec['objectId'] for row in rows):
        raise ValueError('GP history identity disagrees with launch object.')
    if f'/NORAD_CAT_ID/{nid}/' not in gp_source.get('query', '') or '/class/gp_history/' not in gp_source['query']:
        raise ValueError('GP query must match launch object and history class.')
    identifier = event_id(nid, 'launch', day)
    limit = anchor + dt.timedelta(seconds=MAX_DISPLAY_SECONDS)
    candidates = sorted((row for row in rows if anchor <= stamp(row['EPOCH']) < limit),
                        key=lambda row: (stamp(row['EPOCH']), -int(row['GP_ID'])))
    # Reject invalid geometry and retain which rows were skipped for auditability.
    skipped = []
    for row in candidates:
        epoch = iso(stamp(row['EPOCH']))
        try:
            geometry = representative_loop(row, identifier, nid, epoch)
            break
        except ValueError as exc:
            skipped.append({'gpId': row['GP_ID'], 'reason': str(exc)})
    else:
        raise ValueError('No usable post-launch reference orbit in the supplied 48-hour window.')
    delay = (stamp(epoch) - anchor).total_seconds()
    attributes = attributes_from_gp(row, epoch, strict=False)
    attributes['objectType'] = {'value': kind, 'basis': 'reported', 'source': 'catalog:cols.k'}
    attributes['radarSize'] = {'value': meta['rcs'][c['r'][i]], 'basis': 'proxy', 'source': 'catalog:cols.r',
                             'note': 'Radar class, not diameter or mass.'}
    attributes['orbitReference'] = attributes.pop('orbitNearEvent')
    attributes['orbitReference']['meaning'] = 'Earliest usable orbital descriptors in the retrieved post-launch interval; not an ascent trajectory.'
    attributes['orbitRegimeReference'] = attributes.pop('orbitRegimeNearEvent')
    attributes['eventLocation'] = {'value': site, 'basis': 'reported', 'source': 'launchReport + siteCoordinates'}
    attributes['launchSite'] = {'name': site['name'], 'coordinates': {'latitudeDeg': site['latitudeDeg'],
        'longitudeDeg': site['longitudeDeg'], 'basis': 'reported', 'source': 'siteCoordinates'}}
    attributes['missionType'] = {'value': 'ISS cargo resupply', 'basis': 'reported', 'source': 'launchReport'}
    attributes['operator'] = {'value': 'SpaceX', 'basis': 'reported', 'source': 'launchReport'}
    attributes['structure'] = {'value': 'spacecraft payload', 'basis': 'reported', 'source': 'launchReport'}
    geometry['construction']['meaning'] = ('Early reference heights and inclination. Node, periapsis direction and phase are illustrative. '
                                           'No ascent, event-time position, rendezvous or later orbital evolution is modeled.')
    event = {
        'schemaVersion': 1, 'eventId': identifier, 'eventKind': 'launch',
        'object': {'noradId': nid, 'objectId': spec['objectId'], 'name': catalog['names'][c['nm'][i]],
                   'launchFamily': spec['objectId'][:8]},
        'representation': {'kind': 'individual', 'noradIds': [nid], 'representedObjectCount': 1},
        'eventTime': {'date': day, 'precision': 'reported-time', 'resolutionSeconds': 60,
            'intervalUtc': [iso(anchor), iso(anchor + dt.timedelta(minutes=1))], 'basis': 'reported',
            'source': 'launchReport', 'intervalMeaning': spec['timeNote']},
        'attributes': attributes,
        'presentation': {'mode': 'launch-reference-orbit', 'displayAnchorUtc': iso(anchor),
            'anchorBasis': 'reported', 'anchorPolicy': {'policy': 'reported-minute-start'},
            'startTime': iso(anchor), 'endTime': iso(limit), 'maxDisplaySeconds': MAX_DISPLAY_SECONDS,
            'orbitStartTime': epoch, 'geometryAsset': f'trajectories/{nid}-launch-reference.json',
            'geometryFrame': 'illustrative-equatorial', 'geometryUnits': 'km',
            'modeReason': f'Earliest usable record in the retrieved 48-hour interval is {delay / 60:.2f} minutes after launch.',
            'timeMapping': 'Sourced pad pulse begins at launch. A separate reference loop starts at the selected orbital epoch. No connecting ascent path.',
            'locationClaim': 'launch-site-only',
            'surfacePulse': {'latitudeDeg': site['latitudeDeg'], 'longitudeDeg': site['longitudeDeg'],
                'basis': 'reported', 'locationPolicy': 'sourced-launch-site-v1',
                'timing': 'single-pulse-starting-at-display-anchor', 'durationSeconds': 14400}},
        'bounds': {'sourceDelayAfterLaunchSeconds': delay, 'maxDisplaySeconds': MAX_DISPLAY_SECONDS,
                   'meaning': 'Source delay and display limits, not physical error bounds.'},
        'sources': {**spec['sources'], 'gpHistory': gp_source, 'catalog': 'web/data/decays.json'},
        'geometryProvenance': {'gpId': row['GP_ID'],
            'elementSha256': hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest(),
            'selection': 'Earliest valid epoch at/after launch and before launch + 48 h; largest GP_ID breaks epoch ties.',
            'skippedRecords': skipped},
    }
    return event, geometry


def compose(reentries, launch, source_dir, output_dir):
    doc = copy.deepcopy(reentries)
    if any(e['eventKind'] != 'reentry' for e in doc['events']):
        raise ValueError('Composition input must be the existing reentry sample.')
    start, end = map(stamp, doc['sample']['intervalUtc'])
    if not start <= stamp(launch['presentation']['displayAnchorUtc']) < end:
        raise ValueError('Launch lies outside sample interval.')
    for event in doc['events']:
        event['presentation'].pop('style', None)  # Current appearance belongs to the shared web configuration.
        for key in ('geometryAsset', 'representativeOrbitAsset'):
            asset = event['presentation'].get(key)
            if asset:
                event['presentation'][key] = pathlib.Path(os.path.relpath(source_dir / asset, output_dir)).as_posix()
    doc['schemaVersion'] = 2
    doc['events'].append(copy.deepcopy(launch))
    doc['events'].sort(key=lambda e: (e['presentation']['displayAnchorUtc'], e['eventId']))
    doc['sample'].update(title='An eight-day passage · launch & reentries', eventCount=len(doc['events']),
        reentryCount=len(reentries['events']), selectedLaunchCount=1,
        launchSelection='One curated launch: Dragon CRS-14. Launch coverage is not complete; reentry coverage is unchanged.')
    return doc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', type=pathlib.Path, default=ROOT / 'data/launch-example.json')
    parser.add_argument('--gp-history', type=pathlib.Path, required=True)
    parser.add_argument('--catalog', type=pathlib.Path, default=ROOT / 'web/data/decays.json')
    parser.add_argument('--reentries', type=pathlib.Path, default=ROOT / 'web/data/samples/april-2018/tracers.json')
    parser.add_argument('--output-dir', type=pathlib.Path, default=ROOT / 'web/data/samples/april-2018-launch')
    args = parser.parse_args()
    rows, source = load_gp_snapshot(args.gp_history)
    event, geometry = build_launch(json.loads(args.spec.read_text()), rows, json.loads(args.catalog.read_text()), source)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'trajectories').mkdir(exist_ok=True)
    outputs = {'launch.json': {'schemaVersion': 2, 'events': [event]},
               event['presentation']['geometryAsset']: geometry,
               'tracers.json': compose(json.loads(args.reentries.read_text()), event, args.reentries.parent, args.output_dir)}
    for name, doc in outputs.items():
        (args.output_dir / name).write_text(json.dumps(doc, indent=2, allow_nan=False) + '\n')
    print(f'Built {event["eventId"]}; first usable epoch {event["presentation"]["orbitStartTime"]}; wrote {len(outputs)} processed assets.')


if __name__ == '__main__':
    main()
