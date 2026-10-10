# Local renderer dependency

`p5.esm.min.js` is the unmodified p5.js **2.3.3** ES module distributed in the
official `p5` npm package. It was copied from Cosmic Clock's installed dependency.
Keeping it here preserves the existing static-site deployment: no bundler or CDN
request is required to run the globe.

Processing Foundation and contributors, LGPL-2.1; see `p5-LICENSE.txt`.
Project and source: https://github.com/processing/p5.js/tree/v2.3.3
Unminified distribution: https://unpkg.com/p5@2.3.3/lib/p5.esm.js

`earth/EarthScene.js`, `EarthShader.js`, `GeoMath.js`, and `CameraController.js`
adapt Cosmic Clock's sphere, shader and interaction components. Textures are copied
unchanged; see [imagery and map credits](../assets/earth/README.md). Cosmic Clock's
application, clock and time-zone layer remain separate and unchanged.

`astronomy.js` is the unmodified **Astronomy Engine 2.1.19** ES module from
Cosmic Clock's installed `astronomy-engine` npm package. MIT license, Don Cross;
the full license is retained in the module header. Used only for Sun direction
and apparent sidereal time, not solar-weather magnitudes.
[Project and source](https://github.com/cosinekitty/astronomy).
