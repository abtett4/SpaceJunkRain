# Local renderer dependency

`p5.esm.min.js` is the unmodified p5.js **2.3.3** ES module distributed in the
official `p5` npm package. It was copied from Cosmic Clock's installed dependency.
Keeping it here preserves the existing static-site deployment: no bundler or CDN
request is required to run the globe.

Processing Foundation and contributors, LGPL-2.1; see `p5-LICENSE.txt`.
Project and source: https://github.com/processing/p5.js/tree/v2.3.3
Unminified distribution: https://unpkg.com/p5@2.3.3/lib/p5.esm.js

`earth/EarthScene.js` adapts the sphere mesh from Cosmic Clock's `EarthView.js`.
`earth/CameraController.js` adapts its drag, pinch, zoom and keyboard camera.
The clock, astronomy model, time-zone layer, shaders, imagery, and other Cosmic
Clock application code are not included. The original project is unchanged.
