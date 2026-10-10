# Earth imagery and geographic reference

The two images are copied unchanged from Cosmic Clock's existing local assets.
They are fixed visual context, not observations of conditions on the simulation date.

- `earth-day.jpg`: NASA Blue Marble Next Generation, December 2004 mosaic,
  5400 × 2700. [NASA source and credit](https://visibleearth.nasa.gov/images/74218/december-blue-marble-next-generation).
- `earth-night.jpg`: NASA Black Marble 2016 composite, 3600 × 1800.
  NASA Earth Observatory / Joshua Stevens, using Suomi NPP VIIRS data from
  Miguel Román, NASA Goddard. [NASA Earth at Night](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/).
- `../../data/geography.json`: a reduced offline gazetteer from the public-domain
  [Natural Earth vector dataset](https://github.com/nvkelso/natural-earth-vector),
  pinned at commit `ca96624a56bd078437bca8184e78163e5039ad19`. It uses
  `ne_50m_admin_0_countries`, `ne_50m_geography_marine_polys`, and
  `ne_110m_populated_places`. The names mean map scales of 1:50 million and
  1:110 million, not meter resolution. Coordinates are rounded to four decimal
  places without adding precision to the generalized source. Source URLs, hashes,
  and retrieval dates are embedded in the JSON. These are contemporary geographic
  labels, not historical political boundaries or exhaustive city coverage.
- Kennedy Space Center: approximate facility reference at Launch Complex 39A,
  28.608402° N, 80.604201° W. The source gives NAD83 coordinates; this spherical
  visualization does not distinguish datum offsets.
  [NASA LC-48 environmental assessment, February 2019](https://netspublic.grc.nasa.gov/main/LC%2048%20Environmental%20Assessment%20with%20Appendices_02.19.2019.pdf).

“Near” uses great-circle distance on a 6371 km sphere: within 75 km of a listed
facility reference, otherwise within 100 km of a listed city point. Facilities
take priority only inside their threshold. Other points use a containing land
region or named sea/ocean; uncovered points remain “Unmapped region.” Coastline
and boundary lookups are approximate and do not express sovereignty claims.
The first release has one facility and 243 city points.

Rebuild from the repository root (no credentials):

```bash
python3 tools/fetch_geography.py --output-dir data/raw/geography
python3 tools/build_geography.py --input-dir data/raw/geography --output web/data/geography.json
```

The fetcher reuses verified cached files and refuses to overwrite a partial or
changed snapshot. Raw downloads remain separate from the browser asset.
The website never calls a geocoder or uses the visitor's location.

The blue atmospheric rim is decorative. No solar-weather data is represented by
it. The future collaborator-owned solar-weather layer requires its own legend,
data provenance, measured quantities, units, coordinate frame, and spatial mapping.
