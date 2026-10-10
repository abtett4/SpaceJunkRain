// Adapted from Cosmic Clock; the atmosphere is decorative, not solar-weather data.
export const earthVertex = `precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uEarthRotation;
uniform float uRadius;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
void main() {
  vWorld = uEarthRotation * aPosition * uRadius;
  vNormal = normalize(uEarthRotation * aNormal);
  vUV = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(vWorld, 1.0);
}
`;
export const earthFragment = `precision highp float;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform vec3 uSun;
uniform vec3 uEye;
uniform float uAtmosphere;
uniform float uBrightness;
uniform float uNightIntensity;
uniform float uAtmosphereOpacity;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(uEye-vWorld);
  float sun = dot(normal,uSun);
  float facing = max(dot(normal,view),0.0);
  float rim = pow(1.0-facing,3.8);
  if(uAtmosphere>0.5) {
    float strength=pow(1.0-facing,5.0)*0.38*uAtmosphereOpacity;
    vec3 glow=mix(vec3(0.04,0.11,0.3),vec3(0.16,0.49,0.86),smoothstep(-0.25,0.5,sun));
    gl_FragColor=vec4(glow*strength,strength);
    return;
  }
  vec3 day=texture2D(uDay,vUV).rgb;
  vec3 night=texture2D(uNight,vUV).rgb;
  float daylight=smoothstep(-0.06,0.14,sun);
  float diffuse=max(sun,0.0);
  vec3 color=day*(0.024+0.97*pow(diffuse,0.60));
  // Remove the low-valued land background in Black Marble; retain city emissions.
  vec3 lights=max(night-vec3(0.065),vec3(0.0));
  color+=pow(lights,vec3(1.25))*vec3(1.6,1.3,0.88)*(1.0-daylight)*uNightIntensity;
  float water=smoothstep(0.025,0.12,day.b-max(day.r,day.g));
  vec3 halfVector=normalize(uSun+view);
  color+=vec3(0.42,0.51,0.57)*pow(max(dot(normal,halfVector),0.0),65.0)*water*daylight*0.25;
  color+=vec3(0.07,0.25,0.48)*rim*daylight*0.7*uAtmosphereOpacity;
  gl_FragColor=vec4(color*uBrightness,1.0);
}
`;
