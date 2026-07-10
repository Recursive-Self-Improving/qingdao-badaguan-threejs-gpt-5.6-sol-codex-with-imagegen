import * as THREE from "three";
import "./style.css";

const $ = (selector) => document.querySelector(selector);
const isTouch = matchMedia("(pointer: coarse)").matches;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const ui = {
  intro: $("#intro"),
  enter: $("#enter-button"),
  loading: $("#loading-state"),
  loadingProgress: $("#loading-progress"),
  loadingPercent: $("#loading-percent"),
  experience: $("#experience-ui"),
  home: $("#home-button"),
  audio: $("#audio-button"),
  atmosphere: $("#atmosphere-button"),
  atmosphereLabel: $("#atmosphere-label"),
  clock: $("#clock-label"),
  aboutButton: $("#about-button"),
  aboutPanel: $("#about-panel"),
  aboutClose: $("#about-close"),
  resume: $("#resume-prompt"),
  reticle: $("#reticle"),
  poiPrompt: $("#poi-prompt"),
  poiPromptName: $("#poi-prompt-name"),
  story: $("#story-card"),
  storyClose: $("#story-close"),
  storyNumber: $("#story-number"),
  storyTitle: $("#story-title"),
  storyEn: $("#story-en"),
  storyBody: $("#story-body"),
  storyLocation: $("#story-location"),
  storyMood: $("#story-mood"),
  locationName: $("#location-name"),
  locationIndex: $("#location-index"),
  minimap: $("#minimap"),
  joystick: $("#joystick"),
  joystickKnob: $("#joystick-knob"),
  lookZone: $("#look-zone"),
  mobileControls: $("#mobile-controls"),
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xaebdb3, 0.0115);

const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.08, 550);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.35 : 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute("aria-label", "八大關三維景觀");
$("#scene").appendChild(renderer.domElement);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

const SLOPE = 0.0135;
const EYE_HEIGHT = 1.72;
const colliders = [];
const animated = {
  markers: [],
  birds: [],
  clouds: [],
  lamps: [],
  shaders: [],
};

let started = false;
let ready = false;
let yaw = 0;
let pitch = -0.025;
let nearestPoi = null;
let locationTick = 0;
let atmosphereIndex = 0;
let headBob = 0;
let pointerLockedAt = 0;

const keys = Object.create(null);
const velocity = new THREE.Vector2();
const touchMove = new THREE.Vector2();
const spawn = new THREE.Vector3(0, 0, 48);

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(8031931);
const range = (min, max) => min + random() * (max - min);

function baseHeight(z) {
  return THREE.MathUtils.clamp(-0.67 + (z + 70) * SLOPE, -0.67, 1.22);
}

function terrainHeight(x, z) {
  const bank = Math.max(0, Math.abs(x) - 9) * 0.013;
  const undulation = Math.abs(x) > 11 ? Math.sin(x * 0.16 + z * 0.07) * 0.11 : 0;
  return baseHeight(z) + bank + undulation;
}

function roadHeight(_x, z) {
  return baseHeight(z);
}

function setSpawn() {
  camera.position.set(spawn.x, baseHeight(spawn.z) + EYE_HEIGHT, spawn.z);
  yaw = 0;
  pitch = -0.025;
  camera.rotation.set(pitch, yaw, 0);
  velocity.set(0, 0);
}

setSpawn();

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function makeNoiseTexture(base, specks, repeatX, repeatY, lines = false) {
  return canvasTexture(
    256,
    (ctx, size) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 3800; i += 1) {
        const alpha = range(0.025, 0.16);
        ctx.fillStyle = `${specks}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;
        const s = range(0.35, 1.9);
        ctx.fillRect(range(0, size), range(0, size), s, s);
      }
      if (lines) {
        ctx.strokeStyle = "rgba(17,20,17,.12)";
        ctx.lineWidth = 1;
        for (let y = 0; y <= size; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(size, y + range(-2, 2));
          ctx.stroke();
        }
        for (let x = 0; x <= size; x += 48) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + range(-3, 3), size);
          ctx.stroke();
        }
      }
    },
    repeatX,
    repeatY,
  );
}

function makeStoneTexture() {
  return canvasTexture(
    256,
    (ctx, size) => {
      ctx.fillStyle = "#98958c";
      ctx.fillRect(0, 0, size, size);
      const rowH = 31;
      for (let row = -1; row < 10; row += 1) {
        const offset = row % 2 ? -24 : 0;
        for (let x = offset; x < size; x += 49) {
          const shade = Math.floor(range(118, 164));
          ctx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade - 7})`;
          ctx.fillRect(x + 2, row * rowH + 2, 45, rowH - 4);
          ctx.fillStyle = "rgba(220,215,200,.08)";
          ctx.fillRect(x + 4, row * rowH + 4, 40, 2);
        }
      }
      for (let i = 0; i < 1100; i += 1) {
        ctx.fillStyle = random() > 0.5 ? "rgba(20,25,22,.09)" : "rgba(240,235,220,.06)";
        ctx.fillRect(range(0, size), range(0, size), range(0.5, 2), range(0.5, 2));
      }
    },
    3,
    2,
  );
}

function makeBarkTexture() {
  return canvasTexture(
    256,
    (ctx, size) => {
      ctx.fillStyle = "#817e70";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 190; i += 1) {
        const x = range(-20, size + 20);
        const y = range(-20, size + 20);
        const rx = range(3, 18);
        const ry = range(8, 38);
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, range(-0.4, 0.4), 0, Math.PI * 2);
        ctx.fillStyle = random() > 0.52 ? `rgba(194,188,168,${range(0.12, 0.34)})` : `rgba(57,61,50,${range(0.12, 0.27)})`;
        ctx.fill();
      }
      for (let i = 0; i < 70; i += 1) {
        ctx.strokeStyle = `rgba(48,50,43,${range(0.08, 0.22)})`;
        ctx.lineWidth = range(0.5, 2);
        ctx.beginPath();
        const x = range(0, size);
        const y = range(0, size);
        ctx.moveTo(x, y);
        ctx.lineTo(x + range(-4, 4), y + range(8, 28));
        ctx.stroke();
      }
    },
    2,
    5,
  );
}

const textures = {
  grass: makeNoiseTexture("#4e6749", "#213a25", 18, 24),
  asphalt: makeNoiseTexture("#686e69", "#252b28", 3, 30),
  pavers: makeNoiseTexture("#99968c", "#44463f", 2, 24, true),
  stone: makeStoneTexture(),
  sand: makeNoiseTexture("#c6beaa", "#777267", 16, 5),
  bark: makeBarkTexture(),
  stucco: makeNoiseTexture("#e3dfd3", "#7c7d75", 2, 2),
};

const materials = {
  grass: new THREE.MeshStandardMaterial({ map: textures.grass, color: 0x89977d, roughness: 1 }),
  asphalt: new THREE.MeshStandardMaterial({ map: textures.asphalt, color: 0x8a908b, roughness: 0.62, metalness: 0.035 }),
  pavers: new THREE.MeshStandardMaterial({ map: textures.pavers, color: 0xa5a398, roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ map: textures.stone, color: 0xc7c2b9, roughness: 0.97 }),
  sand: new THREE.MeshStandardMaterial({ map: textures.sand, color: 0xe0d7c3, roughness: 1 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x8d3a29, roughness: 0.82, emissive: 0x2b0a05, emissiveIntensity: 0.2 }),
  darkRoof: new THREE.MeshStandardMaterial({ color: 0x4b463d, roughness: 0.88, emissive: 0x15120f, emissiveIntensity: 0.16 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x342c25, roughness: 0.85 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x15201d, roughness: 0.45, metalness: 0.5 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x85a8a0, roughness: 0.18, metalness: 0.1, emissive: 0x17211d, emissiveIntensity: 0.4 }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x24462d, roughness: 1 }),
};

function createGridGeometry(xMin, xMax, zMin, zMax, segX, segZ, heightFn, yOffset = 0) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let iz = 0; iz <= segZ; iz += 1) {
    const v = iz / segZ;
    const z = THREE.MathUtils.lerp(zMin, zMax, v);
    for (let ix = 0; ix <= segX; ix += 1) {
      const u = ix / segX;
      const x = THREE.MathUtils.lerp(xMin, xMax, u);
      positions.push(x, heightFn(x, z) + yOffset, z);
      uvs.push(u, v);
    }
  }
  for (let iz = 0; iz < segZ; iz += 1) {
    for (let ix = 0; ix < segX; ix += 1) {
      const a = iz * (segX + 1) + ix;
      const b = a + 1;
      const c = a + segX + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function meshFromGrid(xMin, xMax, zMin, zMax, segX, segZ, material, heightFn, offset = 0) {
  const mesh = new THREE.Mesh(createGridGeometry(xMin, xMax, zMin, zMax, segX, segZ, heightFn, offset), material);
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

function buildGround() {
  meshFromGrid(-72, 72, -70, 76, 32, 42, materials.grass, terrainHeight, -0.06);
  meshFromGrid(-5.7, 5.7, -69, 62, 2, 44, materials.asphalt, roadHeight, 0.018);
  meshFromGrid(-58, 58, 6, 14.5, 28, 2, materials.asphalt, roadHeight, 0.026);

  meshFromGrid(-7.9, -5.9, -69, 62, 1, 38, materials.pavers, roadHeight, 0.1);
  meshFromGrid(5.9, 7.9, -69, 62, 1, 38, materials.pavers, roadHeight, 0.1);
  meshFromGrid(-58, -5.85, 4.1, 5.9, 13, 1, materials.pavers, roadHeight, 0.1);
  meshFromGrid(5.85, 58, 4.1, 5.9, 13, 1, materials.pavers, roadHeight, 0.1);
  meshFromGrid(-58, -5.85, 14.6, 16.4, 13, 1, materials.pavers, roadHeight, 0.1);
  meshFromGrid(5.85, 58, 14.6, 16.4, 13, 1, materials.pavers, roadHeight, 0.1);

  const dappleTexture = canvasTexture(
    256,
    (ctx, size) => {
      for (let i = 0; i < 115; i += 1) {
        const x = range(0, size);
        const y = range(0, size);
        const radius = range(4, 18);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(12,24,15,${range(0.18, 0.42)})`);
        gradient.addColorStop(1, "rgba(12,24,15,0)");
        ctx.fillStyle = gradient;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(range(0.5, 1.8), range(0.5, 1.3));
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      }
    },
    1.25,
    18,
  );
  const dappleMaterial = new THREE.MeshBasicMaterial({
    map: dappleTexture,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const dapple = meshFromGrid(-5.68, 5.68, -68.8, 61.8, 2, 42, dappleMaterial, roadHeight, 0.043);
  dapple.renderOrder = 2;

  const beach = new THREE.Mesh(new THREE.PlaneGeometry(92, 18, 20, 5), materials.sand);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, -0.72, -77.8);
  beach.receiveShadow = true;
  world.add(beach);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8d8c83, roughness: 0.95 });
  for (const x of [-5.82, 5.82, -8.03, 8.03]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 130), curbMat);
    curb.position.set(x, baseHeight(-3.5) + 0.09, -3.5);
    curb.rotation.x = -Math.atan(SLOPE);
    curb.castShadow = true;
    curb.receiveShadow = true;
    world.add(curb);
  }

  for (let z = 48; z > -60; z -= 16) {
    for (const x of [-5.48, 5.48]) {
      const drain = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.72), materials.metal);
      drain.position.set(x, baseHeight(z) + 0.055, z);
      drain.rotation.x = -Math.atan(SLOPE);
      drain.receiveShadow = true;
      world.add(drain);
      for (let i = -2; i <= 2; i += 1) {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.58), new THREE.MeshBasicMaterial({ color: 0x080d0b }));
        slit.position.set(x + i * 0.075, baseHeight(z) + 0.077, z);
        slit.rotation.x = -Math.atan(SLOPE);
        world.add(slit);
      }
    }
  }
}

function createSky() {
  const uniforms = {
    topColor: { value: new THREE.Color(0x416c78) },
    horizonColor: { value: new THREE.Color(0xe4c6a6) },
    groundColor: { value: new THREE.Color(0x80918a) },
    sunColor: { value: new THREE.Color(0xffd7a0) },
    sunDirection: { value: new THREE.Vector3(-0.55, 0.32, -0.77).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vDirection;
      void main() {
        float h = vDirection.y;
        vec3 sky = mix(horizonColor, topColor, smoothstep(-0.02, 0.64, h));
        sky = mix(groundColor, sky, smoothstep(-0.18, 0.04, h));
        float sun = pow(max(dot(normalize(vDirection), sunDirection), 0.0), 420.0);
        float glow = pow(max(dot(normalize(vDirection), sunDirection), 0.0), 18.0) * 0.22;
        sky += sunColor * (sun * 1.5 + glow);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(360, 40, 24), material);
  sky.frustumCulled = false;
  scene.add(sky);
  animated.sky = sky;
  animated.skyUniforms = uniforms;

  const sunCanvas = document.createElement("canvas");
  sunCanvas.width = sunCanvas.height = 256;
  const ctx = sunCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,248,218,1)");
  gradient.addColorStop(0.08, "rgba(255,221,163,.95)");
  gradient.addColorStop(0.28, "rgba(255,198,130,.3)");
  gradient.addColorStop(1, "rgba(255,186,116,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(sunCanvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending });
  const sun = new THREE.Sprite(spriteMaterial);
  sun.scale.set(24, 24, 1);
  scene.add(sun);
  animated.sun = sun;

  createClouds();
}

function createClouds() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 18; i += 1) {
    const x = range(60, 450);
    const y = range(55, 135);
    const radius = range(35, 88);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(246,241,225,.42)");
    gradient.addColorStop(1, "rgba(246,241,225,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  for (let i = 0; i < 7; i += 1) {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: range(0.045, 0.12), depthWrite: false });
    const cloud = new THREE.Sprite(material);
    cloud.position.set(range(-210, 210), range(62, 105), range(-260, -150));
    cloud.scale.set(range(90, 150), range(24, 42), 1);
    scene.add(cloud);
    animated.clouds.push({ mesh: cloud, speed: range(0.08, 0.2) });
  }
}

function createWater() {
  const uniforms = {
    uTime: { value: 0 },
    deepColor: { value: new THREE.Color(0x254f5a) },
    shallowColor: { value: new THREE.Color(0x6f9994) },
    sunColor: { value: new THREE.Color(0xffcf8c) },
    sunDirection: { value: new THREE.Vector3(-0.55, 0.32, -0.77).normalize() },
    fogColor: { value: scene.fog.color.clone() },
    fogDensity: { value: 0.0115 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying float vWave;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * .115 + uTime * .72) * .13;
        wave += sin(p.y * .082 - uTime * .53 + p.x * .025) * .1;
        wave += sin((p.x + p.y) * .19 + uTime * 1.05) * .035;
        p.z += wave;
        vWave = wave;
        vec4 worldPosition = modelMatrix * vec4(p, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 deepColor;
      uniform vec3 shallowColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying vec3 vWorldPosition;
      varying float vWave;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(viewDir.y, 0.0), 2.2);
        vec3 color = mix(shallowColor, deepColor, fresnel * .76 + .08);
        float sparkle = pow(max(dot(normalize(vec3(-sunDirection.x, .28, -sunDirection.z)), viewDir), 0.0), 115.0);
        sparkle *= .4 + smoothstep(-.05, .16, vWave) * .9;
        color += sunColor * sparkle * 1.7;
        color += sin((vWorldPosition.x - vWorldPosition.z) * .6) * .012;
        float dist = length(cameraPosition - vWorldPosition);
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
        color = mix(color, fogColor, clamp(fogFactor, 0.0, .94));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(330, 220, 100, 70), material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.93, -185);
  water.receiveShadow = true;
  world.add(water);
  animated.waterUniforms = uniforms;

  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xd8ded6, transparent: true, opacity: 0.36, depthWrite: false });
  for (let i = 0; i < 6; i += 1) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-44, -0.76, -86 - i * 2.4),
      new THREE.Vector3(-14, -0.73, -85 - i * 2.6 + range(-1, 1)),
      new THREE.Vector3(15, -0.75, -86 - i * 2.5 + range(-1, 1)),
      new THREE.Vector3(45, -0.76, -85 - i * 2.4),
    ]);
    const geometry = new THREE.TubeGeometry(curve, 70, 0.025 + i * 0.006, 3, false);
    const foam = new THREE.Mesh(geometry, foamMaterial.clone());
    foam.userData.phase = i * 0.7;
    world.add(foam);
    animated.shoreFoam ??= [];
    animated.shoreFoam.push(foam);
  }
}

function setupLighting() {
  const hemisphere = new THREE.HemisphereLight(0xdbe7e1, 0x687468, 1.78);
  scene.add(hemisphere);
  const ambient = new THREE.AmbientLight(0xbec9c0, 0.42);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffd1a0, 2.8);
  sun.position.set(-52, 46, -66);
  sun.target.position.set(0, 0, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 64;
  sun.shadow.camera.bottom = -64;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  animated.hemisphere = hemisphere;
  animated.sunLight = sun;
}

function createHipRoofGeometry(width, depth, height) {
  const w = width / 2;
  const d = depth / 2;
  const ridge = Math.max(0.15, w * 0.28);
  const positions = [
    -w, 0, -d, w, 0, -d, w, 0, d, -w, 0, d,
    -ridge, height, 0, ridge, height, 0,
  ];
  const indices = [0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function shadowMesh(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function addWindow(parent, x, y, z, rotationY = 0, width = 1.25, height = 1.55) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  const pane = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.075), materials.glass);
  group.add(pane);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d1bd, roughness: 0.72 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.13, 0.11, 0.11), frameMaterial);
  const bottom = top.clone();
  top.position.y = height / 2 + 0.03;
  bottom.position.y = -height / 2 - 0.03;
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.11, height + 0.18, 0.11), frameMaterial);
  const side2 = side.clone();
  side.position.x = -width / 2 - 0.03;
  side2.position.x = width / 2 + 0.03;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(width, 0.055, 0.11), frameMaterial);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.055, height, 0.11), frameMaterial);
  group.add(top, bottom, side, side2, crossH, crossV);
  parent.add(group);
  return group;
}

function stuccoMaterial(color) {
  return new THREE.MeshStandardMaterial({ map: textures.stucco, color, roughness: 0.91, metalness: 0 });
}

function createVilla({ x, z, width, depth, floors = 2, color, rotation, roof = "red", variant = 0 }) {
  const group = new THREE.Group();
  const baseY = terrainHeight(x, z);
  group.position.set(x, baseY, z);
  group.rotation.y = rotation;
  const height = floors === 2 ? 7.2 : 4.9;
  const wallMaterial = stuccoMaterial(color);

  const foundation = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(width + 0.22, 1.1, depth + 0.22), materials.stone));
  foundation.position.y = 0.55;
  group.add(foundation);

  const body = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(width, height - 0.65, depth), wallMaterial));
  body.position.y = 1.1 + (height - 0.65) / 2;
  group.add(body);

  if (variant % 2 === 1) {
    const wing = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, height * 0.72, depth * 0.72), wallMaterial));
    wing.position.set(width * 0.56, 1.1 + height * 0.36, -depth * 0.08);
    group.add(wing);
    const wingRoof = shadowMesh(new THREE.Mesh(createHipRoofGeometry(width * 0.5, depth * 0.8, 1.7), roof === "dark" ? materials.darkRoof : materials.roof));
    wingRoof.position.set(width * 0.56, 1.1 + height * 0.72, -depth * 0.08);
    group.add(wingRoof);
  }

  const roofMesh = shadowMesh(new THREE.Mesh(createHipRoofGeometry(width + 1.1, depth + 1.1, 2.25), roof === "dark" ? materials.darkRoof : materials.roof));
  roofMesh.position.y = height + 0.76;
  group.add(roofMesh);

  const chimney = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.2, 0.72), materials.stone));
  chimney.position.set(-width * 0.25, height + 1.45, -depth * 0.08);
  group.add(chimney);

  const columns = Math.max(2, Math.floor(width / 3));
  for (let floor = 0; floor < floors; floor += 1) {
    const windowY = 2.3 + floor * 3.05;
    for (let col = 0; col < columns; col += 1) {
      const windowX = (col - (columns - 1) / 2) * Math.min(2.65, width / columns);
      if (floor === 0 && col === Math.floor(columns / 2)) continue;
      addWindow(group, windowX, windowY, depth / 2 + 0.055, 0, 1.12, 1.42);
    }
    addWindow(group, -width / 2 - 0.055, windowY, 0, Math.PI / 2, 1.08, 1.38);
    addWindow(group, width / 2 + 0.055, windowY, 0, Math.PI / 2, 1.08, 1.38);
  }

  const door = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.35, 0.13), materials.wood));
  door.position.set(0, 2.25, depth / 2 + 0.08);
  group.add(door);
  const step = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.25), materials.stone));
  step.position.set(0, 0.18, depth / 2 + 0.55);
  group.add(step);

  if (variant % 3 === 2) {
    const balcony = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(width * 0.44, 0.16, 1.12), materials.stone));
    balcony.position.set(0, 4.55, depth / 2 + 0.55);
    group.add(balcony);
    for (let i = -3; i <= 3; i += 1) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.75, 0.045), materials.metal);
      rail.position.set((i / 3) * width * 0.2, 4.96, depth / 2 + 1.04);
      group.add(rail);
    }
  }

  if (floors === 2 && variant % 2 === 0) {
    const dormer = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.55, 1.15), wallMaterial));
    dormer.position.set(width * 0.18, height + 1.4, depth / 2 + 0.08);
    group.add(dormer);
    addWindow(group, width * 0.18, height + 1.42, depth / 2 + 0.69, 0, 0.84, 0.95);
    const dormerRoof = shadowMesh(new THREE.Mesh(createHipRoofGeometry(2.55, 1.8, 0.86), roof === "dark" ? materials.darkRoof : materials.roof));
    dormerRoof.position.set(width * 0.18, height + 2.18, depth / 2 + 0.08);
    group.add(dormerRoof);
  }

  if (variant % 3 === 1) {
    const canopy = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 1.65), roof === "dark" ? materials.darkRoof : materials.roof));
    canopy.position.set(0, 3.18, depth / 2 + 0.75);
    group.add(canopy);
    for (const columnX of [-1.72, 1.72]) {
      const column = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.9, 10), materials.stone));
      column.position.set(columnX, 1.66, depth / 2 + 1.34);
      group.add(column);
    }
  }

  world.add(group);
  colliders.push({ x, z, radius: Math.max(width, depth) * 0.68 + 1.2 });
  return group;
}

function createHuashiVilla() {
  const x = -20.5;
  const z = -45.5;
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  group.rotation.y = Math.PI / 2;

  const body = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(11.5, 8.7, 8.2), materials.stone));
  body.position.y = 4.4;
  group.add(body);
  const upper = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(7.2, 3, 6.1), materials.stone));
  upper.position.set(-1.2, 9.6, 0);
  group.add(upper);
  const roof = shadowMesh(new THREE.Mesh(createHipRoofGeometry(8.2, 7.1, 2.55), materials.roof));
  roof.position.set(-1.2, 11.1, 0);
  group.add(roof);

  const tower = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.65, 12.2, 8), materials.stone));
  tower.position.set(4.2, 6.1, 1.5);
  tower.rotation.y = Math.PI / 8;
  group.add(tower);
  const towerRoof = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry(2.95, 3.4, 8), materials.darkRoof));
  towerRoof.position.set(4.2, 13.45, 1.5);
  towerRoof.rotation.y = Math.PI / 8;
  group.add(towerRoof);

  for (const floorY of [2.4, 5.45, 8.45]) {
    addWindow(group, -3.15, floorY, 4.14, 0, 1.18, 1.55);
    addWindow(group, 0, floorY, 4.14, 0, 1.18, 1.55);
  }
  for (const floorY of [3.2, 6.6, 9.9]) {
    const angle = 0;
    const wx = 4.2 + Math.sin(angle) * 2.52;
    const wz = 1.5 + Math.cos(angle) * 2.52;
    addWindow(group, wx, floorY, wz, 0, 0.9, 1.35);
  }

  const entry = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(2, 2.8, 0.18), materials.wood));
  entry.position.set(2.1, 1.55, 4.16);
  group.add(entry);

  const arch = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x252a26, roughness: 0.8 }),
  );
  arch.position.set(2.1, 2.94, 4.27);
  group.add(arch);

  for (let i = -4; i <= 4; i += 1) {
    const crown = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.58, 0.7), materials.stone));
    crown.position.set(i * 1.22, 9.03, 3.72);
    group.add(crown);
  }

  world.add(group);
  colliders.push({ x, z, radius: 8.4 });
}

function createGardenFront(x, z, length = 11) {
  const side = Math.sign(x);
  const wallX = side * 10.65;
  const segmentLength = (length - 2.6) / 2;
  for (const dz of [-(segmentLength / 2 + 1.3), segmentLength / 2 + 1.3]) {
    const wall = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.05, segmentLength), materials.stone));
    wall.position.set(wallX, baseHeight(z + dz) + 0.56, z + dz);
    wall.rotation.x = -Math.atan(SLOPE);
    world.add(wall);
  }
  for (let i = -3; i <= 3; i += 1) {
    const bar = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.5, 0.055), materials.metal));
    bar.position.set(wallX, baseHeight(z) + 1.02, z + i * 0.38);
    world.add(bar);
  }
  for (const y of [0.63, 1.25]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 2.55), materials.metal);
    rail.position.set(wallX, baseHeight(z) + y, z);
    world.add(rail);
  }
  const hedge = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, length + 0.4), materials.hedge));
  hedge.position.set(wallX + side * 0.8, baseHeight(z) + 0.64, z);
  hedge.rotation.x = -Math.atan(SLOPE);
  world.add(hedge);
}

function buildVillas() {
  const villas = [
    { x: -18.5, z: 38, width: 10.5, depth: 7.4, color: 0xd3c7a9, rotation: Math.PI / 2, variant: 0 },
    { x: 18.2, z: 32, width: 9.4, depth: 7, color: 0xb9c0a7, rotation: -Math.PI / 2, roof: "dark", variant: 1 },
    { x: -19.2, z: 21.5, width: 11.2, depth: 7.8, color: 0xd1b99b, rotation: Math.PI / 2, variant: 2 },
    { x: 19.5, z: 14.5, width: 10.8, depth: 7.5, color: 0xc8c0ab, rotation: -Math.PI / 2, variant: 3 },
    { x: -19.3, z: 1.5, width: 9.5, depth: 7.1, color: 0xd4ccb5, rotation: Math.PI / 2, variant: 4 },
    { x: 19.8, z: -6, width: 12, depth: 7.8, color: 0xcab594, rotation: -Math.PI / 2, variant: 5 },
    { x: -18.8, z: -18.5, width: 10.3, depth: 7.2, color: 0xb7bdab, rotation: Math.PI / 2, roof: "dark", variant: 6 },
    { x: 19.5, z: -29, width: 11.5, depth: 8.2, color: 0xd4c7ab, rotation: -Math.PI / 2, variant: 7 },
    { x: 20.3, z: -48, width: 9.2, depth: 6.8, floors: 1, color: 0xd2c8b0, rotation: -Math.PI / 2, variant: 8 },
  ];
  villas.forEach((villa) => {
    createVilla(villa);
    createGardenFront(villa.x, villa.z, Math.min(13, villa.width + 2.2));
  });
  createHuashiVilla();
  createGardenFront(-20, -45.5, 15);
}

function createTrees() {
  const treeData = [];
  for (let z = 55; z >= -62; z -= 8.7) {
    for (const side of [-1, 1]) {
      treeData.push({
        x: side * range(8.25, 9.15),
        z: z + range(-1.2, 1.2),
        height: range(7.8, 11.8),
        radius: range(0.34, 0.52),
        avenue: true,
        side,
      });
    }
  }
  for (let i = 0; i < 38; i += 1) {
    const side = random() > 0.5 ? 1 : -1;
    treeData.push({
      x: side * range(13.5, 54),
      z: range(-62, 64),
      height: range(5.8, 10.2),
      radius: range(0.28, 0.46),
      avenue: false,
      side,
    });
  }

  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: textures.bark,
    color: 0xa29e91,
    roughness: 1,
    emissive: 0x171711,
    emissiveIntensity: 0.16,
  });
  const trunkGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 8, 3);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeData.length);
  const dummy = new THREE.Object3D();
  treeData.forEach((tree, index) => {
    const y = terrainHeight(tree.x, tree.z);
    dummy.position.set(tree.x, y + tree.height / 2, tree.z);
    dummy.scale.set(tree.radius, tree.height, tree.radius);
    dummy.rotation.y = range(0, Math.PI);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
  });
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  world.add(trunks);

  const branchGeometry = new THREE.CylinderGeometry(0.14, 0.28, 1, 6);
  const branchData = treeData.filter((tree) => tree.avenue).flatMap((tree) => [tree, tree]);
  const branches = new THREE.InstancedMesh(branchGeometry, trunkMaterial, branchData.length);
  const yAxis = new THREE.Vector3(0, 1, 0);
  branchData.forEach((tree, index) => {
    const branchIndex = index % 2;
    const baseY = terrainHeight(tree.x, tree.z) + tree.height * range(0.62, 0.77);
    const start = new THREE.Vector3(tree.x, baseY, tree.z);
    const towardRoad = -tree.side * range(1.8, 3.4);
    const end = new THREE.Vector3(tree.x + towardRoad, baseY + range(1.5, 2.8), tree.z + (branchIndex ? 1 : -1) * range(0.4, 1.6));
    const direction = end.clone().sub(start);
    const length = direction.length();
    dummy.position.copy(start).add(end).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(yAxis, direction.normalize());
    dummy.scale.set(range(0.75, 1.05), length, range(0.75, 1.05));
    dummy.updateMatrix();
    branches.setMatrixAt(index, dummy.matrix);
  });
  branches.castShadow = true;
  world.add(branches);

  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.93,
    vertexColors: true,
    flatShading: true,
    emissive: 0x28502c,
    emissiveIntensity: 0.62,
  });
  canopyMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uTime;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `vec3 transformed = vec3(position);
       float windMask = smoothstep(-0.7, 1.0, position.y);
       transformed.x += sin(uTime * 0.72 + position.y * 2.1 + position.z) * 0.035 * windMask;
       transformed.z += cos(uTime * 0.53 + position.x * 1.7) * 0.025 * windMask;`,
    );
    canopyMaterial.userData.shader = shader;
  };
  canopyMaterial.customProgramCacheKey = () => "badaguan-canopy-wind-v1";
  animated.shaders.push(canopyMaterial);

  const blobsPerTree = 4;
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), canopyMaterial, treeData.length * blobsPerTree);
  const greens = [0x426b41, 0x52764b, 0x365e3b, 0x667f58, 0x315638];
  let canopyIndex = 0;
  treeData.forEach((tree) => {
    const baseY = terrainHeight(tree.x, tree.z);
    for (let i = 0; i < blobsPerTree; i += 1) {
      const roadLean = tree.avenue ? -tree.side * range(0.4, 2.5) : 0;
      dummy.position.set(
        tree.x + roadLean + range(-2.1, 2.1),
        baseY + tree.height + range(-0.4, 2.2),
        tree.z + range(-2.2, 2.2),
      );
      dummy.rotation.set(range(-0.2, 0.2), range(0, Math.PI), range(-0.15, 0.15));
      const scale = tree.avenue ? range(2.8, 4.25) : range(2.2, 3.6);
      dummy.scale.set(scale * range(0.85, 1.18), scale * range(0.62, 0.86), scale * range(0.9, 1.2));
      dummy.updateMatrix();
      canopy.setMatrixAt(canopyIndex, dummy.matrix);
      canopy.setColorAt(canopyIndex, new THREE.Color(greens[Math.floor(random() * greens.length)]));
      canopyIndex += 1;
    }
  });
  canopy.castShadow = false;
  canopy.receiveShadow = true;
  world.add(canopy);

  for (const [x, z, scale] of [[-13, -54, 1], [-14, -38, 0.85], [14, -52, 0.9], [28, -56, 1.1], [-31, -22, 1.2]]) {
    createCedar(x, z, scale);
  }
}

function createCedar(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  const trunk = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 7.5 * scale, 7), materials.wood));
  trunk.position.y = 3.75 * scale;
  group.add(trunk);
  const cedarMaterial = new THREE.MeshStandardMaterial({ color: 0x1b4434, roughness: 1 });
  for (let i = 0; i < 5; i += 1) {
    const cone = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry((2.8 - i * 0.35) * scale, 4.2 * scale, 9), cedarMaterial));
    cone.position.y = (3.4 + i * 1.25) * scale;
    group.add(cone);
  }
  world.add(group);
}

function createLamps() {
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe1ae,
    emissive: 0xffc77d,
    emissiveIntensity: 0.4,
    roughness: 0.2,
  });
  let lampIndex = 0;
  for (let z = 50; z >= -62; z -= 16) {
    const side = lampIndex % 2 ? 1 : -1;
    const x = side * 6.82;
    const group = new THREE.Group();
    group.position.set(x, baseHeight(z) + 0.11, z);
    const pole = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 3.4, 8), materials.metal));
    pole.position.y = 1.7;
    group.add(pole);
    const cap = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.42, 8), materials.metal));
    cap.position.y = 3.62;
    group.add(cap);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), bulbMaterial.clone());
    bulb.position.y = 3.34;
    group.add(bulb);
    if (lampIndex % 2 === 0) {
      const point = new THREE.PointLight(0xffc477, 0, 8, 2);
      point.position.y = 3.25;
      group.add(point);
      animated.lamps.push({ bulb, light: point });
    } else {
      animated.lamps.push({ bulb, light: null });
    }
    world.add(group);
    lampIndex += 1;
  }
}

function createSignTexture(label, english) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#24493e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(232,227,210,.85)";
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = "#eee9dc";
  ctx.font = '600 45px "Noto Serif TC", serif';
  ctx.textAlign = "center";
  ctx.fillText(label, canvas.width / 2, 61);
  ctx.font = '18px "Space Mono", monospace';
  ctx.letterSpacing = "3px";
  ctx.fillText(english, canvas.width / 2, 97);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function createStreetSigns() {
  const x = 6.85;
  const z = 13.15;
  const group = new THREE.Group();
  group.position.set(x, baseHeight(z) + 0.12, z);
  const pole = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 3.25, 8), materials.metal));
  pole.position.y = 1.63;
  group.add(pole);

  const signMaterialA = new THREE.MeshBasicMaterial({ map: createSignTexture("嘉峪關路", "JIAYUGUAN RD."), side: THREE.DoubleSide });
  const signA = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 0.66), signMaterialA);
  signA.position.set(-0.92, 2.92, 0);
  group.add(signA);

  const signMaterialB = new THREE.MeshBasicMaterial({ map: createSignTexture("山海關路", "SHANHAIGUAN RD."), side: THREE.DoubleSide });
  const signB = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 0.66), signMaterialB);
  signB.position.set(0, 2.43, -0.9);
  signB.rotation.y = Math.PI / 2;
  group.add(signB);

  world.add(group);
}

function createCoastDetails() {
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x767a73, roughness: 0.97, emissive: 0x151916, emissiveIntensity: 0.16 });
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 52; i += 1) {
    const rock = shadowMesh(new THREE.Mesh(rockGeometry, rockMaterial), false, true);
    let x = range(-56, 56);
    if (Math.abs(x) < 8 && random() > 0.18) x += Math.sign(x || 1) * range(9, 20);
    const z = range(-88, -71);
    rock.position.set(x, -0.76 + range(-0.2, 0.12), z);
    rock.rotation.set(range(0, Math.PI), range(0, Math.PI), range(0, Math.PI));
    const s = range(0.3, 1.2) * (Math.abs(x) > 40 ? 1.4 : 1);
    rock.scale.set(s * range(0.8, 1.8), s * range(0.45, 0.95), s * range(0.8, 1.6));
    world.add(rock);
  }

  const stepMaterial = materials.stone;
  for (let i = 0; i < 6; i += 1) {
    const step = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.22, 1.1), stepMaterial));
    step.position.set(0, baseHeight(-66) - 0.05 - i * 0.14, -66.5 - i * 0.72);
    world.add(step);
  }

  for (const x of [-4.8, 4.8]) {
    const post = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.55), materials.stone));
    post.position.set(x, baseHeight(-66.5) + 0.5, -66.8);
    world.add(post);
  }

  const bench = new THREE.Group();
  bench.position.set(7.2, baseHeight(-58) + 0.12, -58);
  bench.rotation.y = -0.18;
  for (const y of [0.72, 1.2]) {
    const slat = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.13, 0.24), materials.wood));
    slat.position.y = y;
    if (y > 1) slat.position.z = 0.28;
    bench.add(slat);
  }
  for (const x of [-1.25, 1.25]) {
    const leg = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.5), materials.metal));
    leg.position.set(x, 0.36, 0);
    bench.add(leg);
  }
  world.add(bench);
}

function createFlowersAndLeaves() {
  const flowerPositions = [];
  const flowerColors = [];
  const colors = [new THREE.Color(0xd79a9d), new THREE.Color(0xc9b2d3), new THREE.Color(0xe4d7c3)];
  for (let i = 0; i < 240; i += 1) {
    const side = random() > 0.5 ? 1 : -1;
    const x = side * range(11.8, 16.5);
    const z = range(-57, 54);
    flowerPositions.push(x, terrainHeight(x, z) + range(0.18, 0.5), z);
    const c = colors[Math.floor(random() * colors.length)];
    flowerColors.push(c.r, c.g, c.b);
  }
  const flowerGeometry = new THREE.BufferGeometry();
  flowerGeometry.setAttribute("position", new THREE.Float32BufferAttribute(flowerPositions, 3));
  flowerGeometry.setAttribute("color", new THREE.Float32BufferAttribute(flowerColors, 3));
  const flowers = new THREE.Points(flowerGeometry, new THREE.PointsMaterial({ size: 0.095, vertexColors: true, sizeAttenuation: true }));
  world.add(flowers);

  const leafPositions = [];
  const leafData = [];
  for (let i = 0; i < 110; i += 1) {
    const x = range(-24, 24);
    const z = range(-65, 58);
    const y = terrainHeight(x, z) + range(0.5, 11);
    leafPositions.push(x, y, z);
    leafData.push({ speed: range(0.18, 0.52), drift: range(-0.28, 0.28), phase: range(0, Math.PI * 2) });
  }
  const leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute("position", new THREE.Float32BufferAttribute(leafPositions, 3));
  const leaves = new THREE.Points(leafGeometry, new THREE.PointsMaterial({ color: 0xb6a05d, size: 0.075, transparent: true, opacity: 0.7, depthWrite: false }));
  world.add(leaves);
  animated.leaves = { mesh: leaves, data: leafData };
}

const poiData = [
  {
    number: "01",
    title: "林蔭街道",
    en: "THE SHADED AVENUES",
    body: "八大關的道路以不同樹種各成一景。成熟樹冠把街道收束成安靜的綠色廊道；雨後的葉片、濕潤路面與遠處海光，構成這裡最日常也最鮮明的記憶。",
    location: "嘉峪關路意象",
    mood: "法國梧桐 · 雨後",
    position: new THREE.Vector3(2.8, 0, 23),
  },
  {
    number: "02",
    title: "花石樓",
    en: "HUASHI VILLA",
    body: "花崗岩牆體、塔樓與不對稱輪廓讓花石樓像一座靠海的小型城堡。場景以它的石材重量感和臨海位置為線索重建，並未逐尺寸複刻。",
    location: "黃海路 · 太平角",
    mood: "花崗岩 · 塔樓",
    position: new THREE.Vector3(-9.4, 0, -44),
  },
  {
    number: "03",
    title: "太平灣",
    en: "TAIPING BAY",
    body: "順著林蔭向南，視線會被海面突然打開。沙灘、礁石與花園別墅彼此靠得很近，海霧也因此能沿坡道進入街區，在樹影和石牆之間停留。",
    location: "第二海水浴場一帶",
    mood: "潮汐 · 礁石海岸",
    position: new THREE.Vector3(0, 0, -66),
  },
];

function createPoiMarkers() {
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xe2c187, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false });
  poiData.forEach((poi) => {
    poi.position.y = terrainHeight(poi.position.x, poi.position.z);
    const group = new THREE.Group();
    group.position.copy(poi.position);
    const points = [new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0, 2.05, 0)];
    const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xdcc18f, transparent: true, opacity: 0.5 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.18, 32), ringMaterial.clone());
    ring.position.y = 2.18;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), ringMaterial.clone());
    dot.position.y = 2.18;
    group.add(stem, ring, dot);
    world.add(group);
    animated.markers.push({ group, ring, dot, poi, phase: range(0, Math.PI * 2) });
  });
}

function createBirds() {
  const birdMaterial = new THREE.LineBasicMaterial({ color: 0x25322f, transparent: true, opacity: 0.62 });
  for (let i = 0; i < 7; i += 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.65, 0, 0),
      new THREE.Vector3(0, 0.18, 0),
      new THREE.Vector3(0.65, 0, 0),
    ]);
    const bird = new THREE.Line(geometry, birdMaterial);
    bird.position.set(range(-65, 65), range(13, 30), range(-105, -75));
    bird.scale.setScalar(range(0.45, 0.9));
    world.add(bird);
    animated.birds.push({ mesh: bird, speed: range(0.7, 1.4), phase: range(0, 10) });
  }
}

function createDistantHeadlands() {
  const material = new THREE.MeshStandardMaterial({ color: 0x6b7e73, roughness: 1, transparent: true, opacity: 0.76 });
  for (const [x, z, sx, sy, sz] of [[-135, -222, 75, 7, 32], [135, -238, 95, 6, 38]]) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), material);
    hill.position.set(x, -2.2, z);
    hill.scale.set(sx, sy, sz);
    world.add(hill);
  }
}

function buildWorld() {
  updateLoading(12);
  createSky();
  setupLighting();
  buildGround();
  createWater();
  updateLoading(34);
  buildVillas();
  createTrees();
  updateLoading(68);
  createLamps();
  createStreetSigns();
  createCoastDetails();
  createFlowersAndLeaves();
  createPoiMarkers();
  createBirds();
  createDistantHeadlands();
  updateLoading(86);
}

const atmospherePresets = [
  {
    label: "海霧金時",
    time: "17:42",
    top: 0x416c78,
    horizon: 0xe4c6a6,
    ground: 0x80918a,
    fog: 0xaebdb3,
    sun: 0xffd0a0,
    sunDirection: new THREE.Vector3(-0.55, 0.32, -0.77).normalize(),
    light: 2.8,
    hemi: 1.78,
    exposure: 1.14,
    density: 0.0115,
    lamp: 0,
    waterDeep: 0x254f5a,
    waterShallow: 0x6f9994,
  },
  {
    label: "清晨薄霧",
    time: "08:10",
    top: 0x6e9db0,
    horizon: 0xe1e2d5,
    ground: 0x9aaba3,
    fog: 0xb7c5bd,
    sun: 0xffe9c4,
    sunDirection: new THREE.Vector3(0.48, 0.56, -0.68).normalize(),
    light: 2.25,
    hemi: 1.88,
    exposure: 1.17,
    density: 0.014,
    lamp: 0,
    waterDeep: 0x326876,
    waterShallow: 0x86aaa5,
  },
  {
    label: "暮色藍調",
    time: "18:47",
    top: 0x1f3b4e,
    horizon: 0x9b8580,
    ground: 0x445c5b,
    fog: 0x627677,
    sun: 0xefaa78,
    sunDirection: new THREE.Vector3(-0.65, 0.1, -0.75).normalize(),
    light: 0.82,
    hemi: 0.96,
    exposure: 1.0,
    density: 0.015,
    lamp: 1.8,
    waterDeep: 0x142f3f,
    waterShallow: 0x385967,
  },
];

const atmosphereColorKeys = ["top", "horizon", "ground", "fog", "sun", "waterDeep", "waterShallow"];
atmospherePresets.forEach((preset) => {
  preset.colors = Object.fromEntries(atmosphereColorKeys.map((key) => [key, new THREE.Color(preset[key])]));
  preset.sunPosition = preset.sunDirection.clone().multiplyScalar(82);
});

let atmosphereTarget = atmospherePresets[0];
const sunPositionBuffer = new THREE.Vector3();

function setAtmosphere(index) {
  atmosphereIndex = (index + atmospherePresets.length) % atmospherePresets.length;
  atmosphereTarget = atmospherePresets[atmosphereIndex];
  ui.atmosphereLabel.textContent = atmosphereTarget.label;
  ui.clock.textContent = atmosphereTarget.time;
}

function updateAtmosphere(delta) {
  const t = 1 - Math.pow(0.045, delta);
  const sky = animated.skyUniforms;
  const target = atmosphereTarget;
  sky.topColor.value.lerp(target.colors.top, t);
  sky.horizonColor.value.lerp(target.colors.horizon, t);
  sky.groundColor.value.lerp(target.colors.ground, t);
  sky.sunColor.value.lerp(target.colors.sun, t);
  sky.sunDirection.value.lerp(target.sunDirection, t).normalize();
  scene.fog.color.lerp(target.colors.fog, t);
  scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, target.density, t);
  animated.sunLight.color.lerp(target.colors.sun, t);
  animated.sunLight.intensity = THREE.MathUtils.lerp(animated.sunLight.intensity, target.light, t);
  animated.sunLight.position.lerp(target.sunPosition, t);
  animated.hemisphere.intensity = THREE.MathUtils.lerp(animated.hemisphere.intensity, target.hemi, t);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, target.exposure, t);
  animated.sun.material.color.lerp(target.colors.sun, t);
  sunPositionBuffer.copy(sky.sunDirection.value).multiplyScalar(210).add(camera.position);
  animated.sun.position.copy(sunPositionBuffer);

  const water = animated.waterUniforms;
  water.deepColor.value.lerp(target.colors.waterDeep, t);
  water.shallowColor.value.lerp(target.colors.waterShallow, t);
  water.sunColor.value.lerp(target.colors.sun, t);
  water.sunDirection.value.lerp(target.sunDirection, t).normalize();
  water.fogColor.value.copy(scene.fog.color);
  water.fogDensity.value = scene.fog.density;

  animated.lamps.forEach(({ bulb, light }) => {
    bulb.material.emissiveIntensity = THREE.MathUtils.lerp(bulb.material.emissiveIntensity, target.lamp > 0 ? 2.8 : 0.35, t);
    if (light) light.intensity = THREE.MathUtils.lerp(light.intensity, target.lamp, t);
  });
}

class CoastalAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.birdTimer = null;
  }

  start() {
    if (this.context) {
      this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.52;
    this.master.connect(this.context.destination);

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 760;
    const seaGain = this.context.createGain();
    seaGain.gain.value = 0.08;
    source.connect(filter).connect(seaGain).connect(this.master);

    const swell = this.context.createOscillator();
    const swellAmount = this.context.createGain();
    swell.frequency.value = 0.105;
    swellAmount.gain.value = 0.045;
    swell.connect(swellAmount).connect(seaGain.gain);
    source.start();
    swell.start();

    const windSource = this.context.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const windFilter = this.context.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 1450;
    windFilter.Q.value = 0.38;
    const windGain = this.context.createGain();
    windGain.gain.value = 0.018;
    windSource.connect(windFilter).connect(windGain).connect(this.master);
    windSource.start(0, 1.7);
    this.scheduleBird();
  }

  scheduleBird() {
    clearTimeout(this.birdTimer);
    this.birdTimer = setTimeout(() => {
      if (this.enabled && !document.hidden) this.chirp();
      this.scheduleBird();
    }, 6000 + Math.random() * 9000);
  }

  chirp() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    for (let i = 0; i < 2; i += 1) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1450 + i * 240, now + i * 0.16);
      oscillator.frequency.exponentialRampToValueAtTime(2200 + i * 180, now + 0.18 + i * 0.16);
      gain.gain.setValueAtTime(0, now + i * 0.16);
      gain.gain.linearRampToValueAtTime(0.014, now + 0.035 + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25 + i * 0.16);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(now + i * 0.16);
      oscillator.stop(now + 0.3 + i * 0.16);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.context && this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(this.enabled ? 0.52 : 0, now + 0.35);
    }
    return this.enabled;
  }
}

const audio = new CoastalAudio();

function isPanelOpen() {
  return ui.story.classList.contains("is-visible") || ui.aboutPanel.classList.contains("is-visible");
}

function lockPointer() {
  if (!isTouch && started && !isPanelOpen() && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
  }
}

function startExperience() {
  if (!ready) return;
  started = true;
  audio.start();
  ui.intro.classList.add("is-leaving");
  ui.experience.classList.add("is-active");
  ui.experience.setAttribute("aria-hidden", "false");
  if (isTouch) {
    ui.mobileControls.setAttribute("aria-hidden", "false");
  } else {
    lockPointer();
  }
}

function goHome() {
  document.exitPointerLock?.();
  closePanels();
  started = false;
  ui.intro.classList.remove("is-leaving");
  ui.experience.classList.remove("is-active");
  ui.experience.setAttribute("aria-hidden", "true");
  ui.resume.classList.remove("is-visible");
  setSpawn();
}

function openStory(poi) {
  if (!poi) return;
  document.exitPointerLock?.();
  ui.aboutPanel.classList.remove("is-visible");
  ui.aboutPanel.setAttribute("aria-hidden", "true");
  ui.storyNumber.textContent = poi.number;
  ui.storyTitle.textContent = poi.title;
  ui.storyEn.textContent = poi.en;
  ui.storyBody.textContent = poi.body;
  ui.storyLocation.textContent = poi.location;
  ui.storyMood.textContent = poi.mood;
  ui.story.classList.add("is-visible");
  ui.story.setAttribute("aria-hidden", "false");
}

function openAbout() {
  document.exitPointerLock?.();
  ui.story.classList.remove("is-visible");
  ui.story.setAttribute("aria-hidden", "true");
  ui.aboutPanel.classList.add("is-visible");
  ui.aboutPanel.setAttribute("aria-hidden", "false");
}

function closePanels() {
  ui.story.classList.remove("is-visible");
  ui.story.setAttribute("aria-hidden", "true");
  ui.aboutPanel.classList.remove("is-visible");
  ui.aboutPanel.setAttribute("aria-hidden", "true");
  if (started && !isTouch) ui.resume.classList.add("is-visible");
}

function setupInteraction() {
  ui.enter.addEventListener("click", startExperience);
  ui.home.addEventListener("click", goHome);
  ui.resume.addEventListener("click", lockPointer);
  renderer.domElement.addEventListener("click", lockPointer);
  ui.storyClose.addEventListener("click", closePanels);
  ui.aboutClose.addEventListener("click", closePanels);
  ui.aboutButton.addEventListener("click", openAbout);
  ui.atmosphere.addEventListener("click", () => setAtmosphere(atmosphereIndex + 1));
  ui.audio.addEventListener("click", () => {
    const enabled = audio.toggle();
    ui.audio.setAttribute("aria-pressed", String(enabled));
    ui.audio.setAttribute("aria-label", enabled ? "關閉環境聲音" : "開啟環境聲音");
  });
  ui.poiPrompt.addEventListener("click", () => openStory(nearestPoi));

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (locked) pointerLockedAt = performance.now();
    ui.resume.classList.toggle("is-visible", started && !locked && !isPanelOpen() && !isTouch);
  });

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== renderer.domElement || !started) return;
    if (performance.now() - pointerLockedAt < 140) return;
    const dx = THREE.MathUtils.clamp(event.movementX, -90, 90);
    const dy = THREE.MathUtils.clamp(event.movementY, -90, 90);
    yaw -= dx * 0.00175;
    pitch -= dy * 0.00155;
    pitch = THREE.MathUtils.clamp(pitch, -1.28, 1.22);
  });

  document.addEventListener("keydown", (event) => {
    keys[event.code] = true;
    if (event.code === "KeyE" && nearestPoi && !isPanelOpen()) {
      event.preventDefault();
      openStory(nearestPoi);
    }
  });
  document.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  setupTouchControls();
}

function setupTouchControls() {
  if (!ui.joystick || !ui.lookZone) return;
  let joystickPointer = null;
  const resetJoystick = () => {
    joystickPointer = null;
    touchMove.set(0, 0);
    ui.joystickKnob.style.transform = "translate(-50%, -50%)";
  };
  ui.joystick.addEventListener("pointerdown", (event) => {
    joystickPointer = event.pointerId;
    ui.joystick.setPointerCapture(event.pointerId);
  });
  ui.joystick.addEventListener("pointermove", (event) => {
    if (event.pointerId !== joystickPointer) return;
    const rect = ui.joystick.getBoundingClientRect();
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const radius = rect.width * 0.36;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    touchMove.set(dx / radius, -dy / radius);
    ui.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  ui.joystick.addEventListener("pointerup", resetJoystick);
  ui.joystick.addEventListener("pointercancel", resetJoystick);

  let lookPointer = null;
  let lookX = 0;
  let lookY = 0;
  ui.lookZone.addEventListener("pointerdown", (event) => {
    lookPointer = event.pointerId;
    lookX = event.clientX;
    lookY = event.clientY;
    ui.lookZone.setPointerCapture(event.pointerId);
  });
  ui.lookZone.addEventListener("pointermove", (event) => {
    if (event.pointerId !== lookPointer || !started) return;
    yaw -= (event.clientX - lookX) * 0.0042;
    pitch -= (event.clientY - lookY) * 0.0037;
    pitch = THREE.MathUtils.clamp(pitch, -1.28, 1.22);
    lookX = event.clientX;
    lookY = event.clientY;
  });
  const resetLook = () => { lookPointer = null; };
  ui.lookZone.addEventListener("pointerup", resetLook);
  ui.lookZone.addEventListener("pointercancel", resetLook);
}

function isBlocked(x, z) {
  if (z < -84.5 || z > 67 || Math.abs(x) > 58) return true;
  return colliders.some((collider) => {
    const dx = x - collider.x;
    const dz = z - collider.z;
    return dx * dx + dz * dz < collider.radius * collider.radius;
  });
}

function updateMovement(delta, elapsed) {
  if (!started || isPanelOpen()) return;
  const forwardInput = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touchMove.y;
  const sideInput = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchMove.x;
  const input = new THREE.Vector2(sideInput, forwardInput);
  if (input.lengthSq() > 1) input.normalize();

  const speed = keys.ShiftLeft || keys.ShiftRight ? 7.2 : 4.15;
  const response = 1 - Math.pow(input.lengthSq() > 0 ? 0.003 : 0.00002, delta);
  velocity.x = THREE.MathUtils.lerp(velocity.x, input.x * speed, response);
  velocity.y = THREE.MathUtils.lerp(velocity.y, input.y * speed, response);

  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const movement = forward.multiplyScalar(velocity.y * delta).add(right.multiplyScalar(velocity.x * delta));

  const nextX = camera.position.x + movement.x;
  const nextZ = camera.position.z + movement.z;
  if (!isBlocked(nextX, camera.position.z)) camera.position.x = nextX;
  if (!isBlocked(camera.position.x, nextZ)) camera.position.z = nextZ;

  const moving = input.lengthSq() > 0.015;
  if (moving) headBob += delta * (keys.ShiftLeft || keys.ShiftRight ? 11 : 7.2);
  const bob = moving && !reducedMotion ? Math.sin(headBob) * 0.025 : 0;
  const targetY = terrainHeight(camera.position.x, camera.position.z) + EYE_HEIGHT + bob;
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 1 - Math.pow(0.002, delta));
  camera.rotation.set(pitch, yaw, moving && !reducedMotion ? Math.sin(headBob * 0.5) * 0.0025 : 0);
}

function updatePointsOfInterest(elapsed) {
  let closest = null;
  let closestDistance = Infinity;
  animated.markers.forEach((marker) => {
    const dx = camera.position.x - marker.poi.position.x;
    const dz = camera.position.z - marker.poi.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = marker.poi;
    }
    marker.ring.quaternion.copy(camera.quaternion);
    marker.dot.quaternion.copy(camera.quaternion);
    const pulse = 1 + Math.sin(elapsed * 2.1 + marker.phase) * 0.16;
    marker.ring.scale.setScalar(pulse);
    const visibility = THREE.MathUtils.smoothstep(distance, 30, 8);
    marker.group.visible = distance < 45;
    marker.ring.material.opacity = 0.28 + visibility * 0.6;
  });
  nearestPoi = closestDistance < (isTouch ? 11.5 : 10.5) ? closest : null;
  ui.poiPrompt.classList.toggle("is-visible", Boolean(nearestPoi) && !isPanelOpen());
  ui.reticle.classList.toggle("is-near", Boolean(nearestPoi));
  if (nearestPoi) ui.poiPromptName.textContent = nearestPoi.title;
}

function updateAmbientMotion(delta, elapsed) {
  animated.waterUniforms.uTime.value = elapsed;
  animated.shaders.forEach((material) => {
    if (material.userData.shader) material.userData.shader.uniforms.uTime.value = elapsed;
  });
  animated.clouds.forEach((cloud) => {
    cloud.mesh.position.x += cloud.speed * delta;
    if (cloud.mesh.position.x > 235) cloud.mesh.position.x = -235;
  });
  animated.birds.forEach((bird) => {
    bird.mesh.position.x += bird.speed * delta;
    bird.mesh.position.y += Math.sin(elapsed * 2.2 + bird.phase) * delta * 0.08;
    bird.mesh.rotation.z = Math.sin(elapsed * 3 + bird.phase) * 0.08;
    if (bird.mesh.position.x > 85) bird.mesh.position.x = -85;
  });
  animated.shoreFoam?.forEach((foam, index) => {
    foam.material.opacity = 0.18 + Math.sin(elapsed * 0.8 + foam.userData.phase) * 0.09;
    foam.position.z = Math.sin(elapsed * 0.65 + index * 0.8) * 0.5;
  });
  if (animated.leaves && !reducedMotion) {
    const positions = animated.leaves.mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      let x = positions.getX(i);
      let y = positions.getY(i);
      const z = positions.getZ(i);
      const data = animated.leaves.data[i];
      y -= data.speed * delta;
      x += (data.drift + Math.sin(elapsed + data.phase) * 0.12) * delta;
      const ground = terrainHeight(x, z) + 0.12;
      if (y < ground) y = ground + range(4, 11);
      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;
  }
  animated.sky.position.copy(camera.position);
}

function updateLocation(delta) {
  locationTick -= delta;
  if (locationTick > 0) return;
  locationTick = 0.22;
  let name = "嘉峪關路";
  let index = "01";
  if (camera.position.z < -52) {
    name = "太平灣岸";
    index = "04";
  } else if (camera.position.z < -25) {
    name = "黃海路一帶";
    index = "03";
  } else if (camera.position.z < 8) {
    name = "山海關路";
    index = "02";
  }
  if (Math.abs(camera.position.x) > 11 && camera.position.z > -35) name = "別墅花園";
  ui.locationName.textContent = name;
  ui.locationIndex.textContent = index;
  drawMinimap();
}

function drawMinimap() {
  const canvas = ui.minimap;
  const context = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  context.clearRect(0, 0, w, h);
  context.save();
  context.beginPath();
  context.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "rgba(9,25,21,.46)";
  context.fillRect(0, 0, w, h);

  const map = (x, z) => ({ x: w / 2 + x * 1.08, y: 18 + (60 - z) * 0.92 });
  context.fillStyle = "rgba(77,112,117,.34)";
  context.fillRect(0, map(0, -70).y, w, h);
  context.strokeStyle = "rgba(235,229,214,.28)";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(map(0, 62).x, map(0, 62).y);
  context.lineTo(map(0, -70).x, map(0, -70).y);
  context.stroke();
  context.beginPath();
  context.moveTo(map(-58, 10).x, map(-58, 10).y);
  context.lineTo(map(58, 10).x, map(58, 10).y);
  context.stroke();
  context.strokeStyle = "rgba(229,196,139,.22)";
  context.lineWidth = 1;
  for (const poi of poiData) {
    const p = map(poi.position.x, poi.position.z);
    context.beginPath();
    context.arc(p.x, p.y, 4, 0, Math.PI * 2);
    context.stroke();
  }
  const player = map(camera.position.x, camera.position.z);
  context.translate(player.x, player.y);
  context.rotate(-yaw);
  context.fillStyle = "#e7c98f";
  context.beginPath();
  context.moveTo(0, -7);
  context.lineTo(4.5, 5);
  context.lineTo(0, 3);
  context.lineTo(-4.5, 5);
  context.closePath();
  context.fill();
  context.restore();
}

function updateLoading(percent) {
  const value = Math.round(percent);
  ui.loadingProgress.style.width = `${value}%`;
  ui.loadingPercent.textContent = `${String(value).padStart(2, "0")}%`;
}

function markReady() {
  updateLoading(100);
  ui.loading.classList.add("is-ready");
  ui.loading.querySelector("span").textContent = "場景已就緒";
  ui.enter.disabled = false;
  ready = true;
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.35 : 1.8));
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  updateMovement(delta, elapsed);
  updateAtmosphere(delta);
  updateAmbientMotion(delta, elapsed);
  updatePointsOfInterest(elapsed);
  updateLocation(delta);
  renderer.render(scene, camera);
}

ui.enter.disabled = true;
setupInteraction();
buildWorld();
setAtmosphere(0);
drawMinimap();
addEventListener("resize", onResize);
renderer.setAnimationLoop(animate);

const cover = new Image();
cover.onload = markReady;
cover.onerror = markReady;
cover.src = "/assets/badaguan-cover.webp";
if (cover.complete) markReady();
