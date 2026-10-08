# One-object orbital proof of concept

Run on 2026-10-07, using USSPACECOM data via Space-Track.org. All source responses remain
unchanged in Git-ignored `data/raw/`. The scripts operate on a contribution branch and do
not change the existing timeline build, browser, sound work, or Cosmic Clock.

## Candidate selection

The first candidate was IRIDIUM 33 DEB, NORAD 38023, designator 1997-051YK. The existing
timeline assigns it decay date 2024-01-05. Two historical DECAY messages both supply
`2024-01-05 0:00:00`; this does not establish an exact time.

The 2024-01-02 through 2024-01-06 GP_HISTORY window returned zero records. One diagnostic
query for the last pre-2024-01-06 element, capped at one record, returned epoch
2022-11-08T12:05:40.667424 (GP_ID 217563156). That gap is unsuitable for the intended
near-decay reconstruction. Both the empty response and diagnostic response were retained.
Diagnostic query: `/basicspacedata/query/class/gp_history/NORAD_CAT_ID/38023/EPOCH/<2024-01-06/orderby/EPOCH desc/limit/1/format/json`.

The successful numerical prototype uses **TIANGONG 1, NORAD 37820**, designator 2011-053A,
class PAYLOAD, already present in the SpaceJunkRain timeline under launch family 2011-053.

## Source evidence

| Input | Finding |
| --- | --- |
| Historical DECAY | Two records; both give `2018-04-02 0:00:00` |
| Lowest PRECEDENCE | 1, source `satcat`; other record is source `decay_msg`, precedence 2 |
| Decay precision | Calendar day only; represented as [2018-04-02T00:00Z, 2018-04-03T00:00Z) |
| GP_HISTORY interval | 2018-03-30T00:00Z through 2018-04-03T00:00Z, inclusive |
| History size | 18 records |
| Selected GP_ID | 119038425 |
| Element epoch | 2018-04-01T16:07:05.931552Z |
| Publication field | 2018-04-01T17:31:17Z |
| Age at start of decay day | 7.88168568 hours |
| Possible age during reported day | 7.88168568 to less than 31.88168568 hours |

The calendar-day interval records precision, not a statistical confidence interval.
No exact decay epoch can be established from these fetched DECAY records.

Snapshot paths:

- `data/raw/decay/37820/f0e22da9e3871b49/response.json`
- `data/raw/gp_history/37820/6c2ffa38f41e5d8e/response.json`

Each has a `metadata.json` sidecar containing its query, retrieval time, row count, and
SHA-256. The generated trajectory carries this provenance forward.

## Selection and model sensitivity

Selection uses the latest usable **element epoch** strictly before the cutoff, with
publication time then GP_ID as tie-breakers. This is deterministic, not a claim that the
selected record is more physically accurate than every alternative. Records published
later can have slightly earlier element epochs; both timestamps are retained.

Three records describe epochs within 0.43 seconds of one another around 16:07:05 UTC:

| GP_ID | Publication time on April 1 UTC | Separation from selected model at midnight |
| --- | --- | --- |
| 119038425 (selected) | 17:31:17 | reference |
| 119038430 | 21:12:21 | 56.37 km |
| 119049572 | 22:52:34 | 145.37 km |

The comparison uses Euclidean separation in TEME at the same timestamp. This spread is
substantial and shows sensitivity to input element choice. It is **not** a calibrated
position uncertainty, evidence that the selected record is best, or a measured error.
Future refinement should explicitly examine these later-published alternatives before
claiming higher fidelity. No source records were blended into a fabricated smooth path.

## Diagnostic result

- Full OMM input, Python `sgp4` 2.27, default WGS72 gravity model.
- 241 samples at 30-second spacing, 2018-04-01T22:00:00Z to 2018-04-02T00:00:00Z.
- All sampled SGP4 error codes were zero and all positions/velocities were finite.
- Geocentric radius minus 6378.135 km ranged from 130.71 to 141.66 km.
- TEME speed ranged from 7.8163 to 7.8292 km/s.
- The JSON explicitly identifies frame TEME, units km, and UTC timestamps.
- The diagnostic displays a reference sphere with equal axis scales, radial distance
  above that sphere, speed, source epoch, date precision, and model sensitivity.

The estimated arc stays above the reference sphere. It is not artificially extended to
the ground. A zero SGP4 error code means a numerical result was produced, not that its
physical position is accurate in the rapidly changing near-decay environment. In
particular, the cutoff is the start of a reported calendar day, not an observed reentry.
The uncertainty in decay time and the disagreement between element sets remain unresolved.

## Verification and reproduction

The 35 offline tests include the Vallado satellite 00005 reference state, OMM initialization,
UTC precision, date-only handling, stale/invalid element rejection, NORAD identity,
non-finite outputs, and truncation on SGP4 error 6. The expected verification vector comes
from the `sgp4` distribution's `SGP4-VER.TLE` and `tcppver.out` files.

For the actual selected Tiangong-1 record, both source TLE checksums were valid. Propagating
its TLE and OMM independently through the two input parsers produced a maximum positional
difference of 9.64e-11 km across the 241 samples. This validates representation consistency,
not agreement with observations.

Run the commands in the main README using the saved snapshots; no further Space-Track
downloads are needed locally. The derived plot and JSON are Git-ignored and reproducible.
The orbital dependencies are optional and pinned separately from the existing timeline.

References: [Space-Track documentation](https://www.space-track.org/documentation),
[Python SGP4 documentation and reference implementation](https://pypi.org/project/sgp4/).
