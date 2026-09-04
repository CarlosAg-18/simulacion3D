import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, PALETTE } from './config.js';
import { rand, chance, pick, lerp, smoothstep, hex, TAU, rng, _v1, _dummy } from './utils.js';
import { Render, World, CameraState } from './state.js';
import { Terrain, terrainHeight, addFootprint, RoadField, _near, buildTerrain, rebuildTerrain, initNoise } from './terrain.js';
import { Graph } from './graph.js';
import { Assets, initAssets, mesh, std } from './assets.js';
import { Economy } from './economy.js';
import { HUD } from './hud.js';
import * as B from './buildings.js';

// Sin pantalla (modo servidor) no hace falta GPU: la simulación no dibuja, solo necesita un lienzo para los controles.
function makeHeadlessRenderer() {
  const canvas = document.createElement('canvas');
  return {
    domElement: canvas, shadowMap: {}, toneMapping: 0, toneMappingExposure: 1, info: { render: { calls: 0 } },
    setPixelRatio() {}, setSize() {}, setClearColor() {}, render() {}, dispose() {}
  };
}
export function initRenderer(headless) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDay);
  scene.fog = new THREE.FogExp2(PALETTE.skyDay, 0.0025);
  const renderer = headless ? makeHeadlessRenderer() : new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 900);
  camera.position.set(0.55, 0.42, 0.72).normalize().multiplyScalar(CONFIG.camera.startDistance);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = CONFIG.camera.minDistance;
  controls.maxDistance = CONFIG.camera.maxDistance;
  controls.target.set(0, 2, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = CONFIG.camera.autoRotateSpeed;
  CameraState.idle = CONFIG.camera.resumeAfter;
  controls.addEventListener('start', () => { CameraState.interacting = true; });
  controls.addEventListener('end', () => { CameraState.interacting = false; CameraState.idle = 0; });

  const sunLight = new THREE.DirectionalLight(0xFFF4E0, 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(CONFIG.shadow.mapSize, CONFIG.shadow.mapSize);
  sunLight.shadow.camera.left = -CONFIG.shadow.extent;
  sunLight.shadow.camera.right = CONFIG.shadow.extent;
  sunLight.shadow.camera.top = CONFIG.shadow.extent;
  sunLight.shadow.camera.bottom = -CONFIG.shadow.extent;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 420;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.04;
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight, sunLight.target);
  const moonLight = new THREE.DirectionalLight(0x8FA6D6, 0);
  scene.add(moonLight, moonLight.target);
  const hemiLight = new THREE.HemisphereLight(PALETTE.skyDay, PALETTE.grass, 1.3);
  scene.add(hemiLight);
  const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1.0);
  scene.add(ambientLight);
  Object.assign(Render, { scene, renderer, camera, controls, sunLight, moonLight, hemiLight, ambientLight });
}

// Cada colocación: edificio, nodo de referencia, desplazamiento desde el nodo y radio de huella.
const PLACEMENTS = [
  { key: 'pozo', make: B.makeWell, node: 'plaza', dx: -4.5, dz: 4, r: 0 },
  { key: 'iglesia', make: B.makeChurch, node: 'iglesia', dx: -8.5, dz: -9.5, r: 9, shelter: true },
  { key: 'castillo', make: B.makeCastle, node: 'castillo', dx: 0, dz: -6, r: 0, face: false, shelter: true, doorDist: 3 },
  { key: 'casa1', make: B.makeCottage, node: 'casa1', dx: 6, dz: 5, r: 4, shelter: true, home: true },
  { key: 'casa2', make: B.makeCottage, node: 'casa2', dx: -6, dz: 5, r: 4, shelter: true, home: true },
  { key: 'casa3', make: B.makeCottage, node: 'casa3', dx: -6, dz: -4, r: 4, shelter: true, home: true },
  { key: 'casa4', make: B.makeCottage, node: 'casa4', dx: 3, dz: -8, r: 4, shelter: true, home: true },
  { key: 'taberna', make: B.makeTavern, node: 'taberna', dx: 4, dz: 7, r: 6.5, shelter: true },
  { key: 'mina', make: B.makeMineEntrance, node: 'mina', dx: 7, dz: -6, r: 7 },
  { key: 'almacen', make: B.makeWarehouse, node: 'almacen', dx: -3, dz: -8, r: 5.5 },
  { key: 'granjaCasa', make: B.makeCottage, node: 'granja', dx: -8, dz: 7, r: 4, shelter: true, home: true },
  { key: 'bosque', make: B.makeLogPile, node: 'bosque', dx: -5, dz: -5, r: 3 }
];
function worldPoint(nodeId, dx, dz) {
  const n = Graph.node(nodeId);
  return new THREE.Vector3(n.x + dx, 0, n.z + dz);
}
function registerFootprints() {
  for (const p of PLACEMENTS) {
    p.pos = worldPoint(p.node, p.dx, p.dz);
    if (p.r > 0) addFootprint(p.pos.x, p.pos.z, p.r, 3.5);
  }
  addFootprint(3, -64, 12, 4);
  addFootprint(3, -70, 8, 4);
  // Cementerio detrás de la iglesia, en el lado opuesto a la puerta.
  const church = PLACEMENTS.find(p => p.key === 'iglesia');
  const cn = Graph.node(church.node);
  const dir = _v1.set(church.pos.x - cn.x, 0, church.pos.z - cn.z).normalize();
  World.cemetery = { x: church.pos.x + dir.x * 14.5, z: church.pos.z + dir.z * 14.5, ry: faceToward(church.pos.x, church.pos.z, cn.x, cn.z) };
  addFootprint(World.cemetery.x - dir.x * 3, World.cemetery.z - dir.z * 3, 7, 3);
  const g = Graph.node('granja');
  World.fields = [
    { x: g.x + 6, z: g.z + 12, w: 13, d: 9 },
    { x: g.x - 7, z: g.z + 22, w: 11, d: 8 }
  ];
  for (const f of World.fields) addFootprint(f.x, f.z, Math.max(f.w, f.d) * 0.6, 4);
  const m = Graph.node('mercado');
  World.stallSpots = [2, 120, 200, 245, 290].map(deg => {
    const a = deg * Math.PI / 180;
    return { x: m.x + Math.cos(a) * 6.5, z: m.z + Math.sin(a) * 6.5 };
  });
}
export function placeGroup(group, x, z, ry) {
  group.position.set(x, terrainHeight(x, z) - 0.05, z);
  group.rotation.y = ry;
  group.userData.static = true;
  Render.scene.add(group);
  return group;
}
export function faceToward(fromX, fromZ, toX, toZ) { return Math.atan2(toX - fromX, toZ - fromZ); }

// La geometría estática de un grupo se funde en una malla por material. Las partes animadas
// (campana, aspas) se marcan como dinámicas y se quedan en su grupo original.
export function mergeGroup(group) {
  const buckets = new Map();
  const toRemove = [];
  group.updateMatrixWorld(true);
  group.traverse(obj => {
    if (!obj.isMesh || obj.isInstancedMesh) return;
    let p = obj;
    while (p && p !== group) { if (p.userData.dynamic) return; p = p.parent; }
    const geo = (obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()).applyMatrix4(obj.matrixWorld);
    const key = obj.material.uuid;
    let b = buckets.get(key);
    if (!b) { b = { material: obj.material, geos: [], castShadow: obj.castShadow }; buckets.set(key, b); }
    b.geos.push(geo);
    toRemove.push(obj);
  });
  for (const obj of toRemove) obj.parent.remove(obj);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.castShadow;
    m.receiveShadow = true;
    Render.scene.add(m);
  }
}
function mergeStaticMeshes() {
  const groups = Render.scene.children.filter(g => g.userData.static && !g.userData.merged);
  const all = new THREE.Group();
  for (const g of groups) { g.userData.merged = true; all.add(g); }
  Render.scene.add(all);
  mergeGroup(all);
  Render.scene.remove(all);
  for (const g of groups) Render.scene.add(g);
}

// Cultivos: un solo InstancedMesh con capacidad para los campos futuros; la escala sigue la estación.
export const Crops = {
  mesh: null, count: 0, slots: [], stage: 1, tint: new THREE.Color(0x6FB060),
  init() {
    const capacity = (CONFIG.construction.types.campo.max + 2) * 130;
    this.mesh = new THREE.InstancedMesh(Assets.geo.crop, Assets.mat.crop, capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    Render.scene.add(this.mesh);
  },
  addField(f) {
    const nx = Math.floor(f.w / 1.1), nz = Math.floor(f.d / 1.3);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (this.count >= this.mesh.instanceMatrix.count) return;
      const x = f.x - f.w / 2 + 0.6 + i * 1.1, z = f.z - f.d / 2 + 0.7 + j * 1.3;
      const slot = { x, z, y: terrainHeight(x, z) + 0.2, s: rand(0.7, 1.15), ry: rand(0, TAU) };
      this.slots.push(slot);
      this.writeSlot(this.count, slot);
      this.count++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  },
  writeSlot(i, slot) {
    const s = slot.s * Math.max(0.12, this.stage);
    _dummy.position.set(slot.x, slot.y + 0.45 * s, slot.z);
    _dummy.rotation.set(0, slot.ry, 0);
    _dummy.scale.set(slot.s, s, slot.s);
    _dummy.updateMatrix();
    this.mesh.setMatrixAt(i, _dummy.matrix);
  },
  updateSeason(season, progress) {
    let stage, tint;
    if (season === 'Primavera') { stage = lerp(0.3, 0.8, progress); tint = 0x6FB060; }
    else if (season === 'Verano') { stage = lerp(0.85, 1.05, progress); tint = progress > 0.6 ? 0xC9B040 : 0x86B84C; }
    else if (season === 'Otoño') { stage = lerp(1.0, 0.45, progress); tint = 0xB08A40; }
    else { stage = 0.15; tint = 0x7A7A6A; }
    this.stage = stage;
    this.tint.set(tint);
    for (let i = 0; i < this.count; i++) this.writeSlot(i, this.slots[i]);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
};

function buildBuildings() {
  for (const p of PLACEMENTS) {
    const node = Graph.node(p.node);
    const g = p.make();
    const ry = p.face === false ? 0 : faceToward(p.pos.x, p.pos.z, node.x, node.z);
    placeGroup(g, p.pos.x, p.pos.z, ry);
    World.buildings[p.key] = g;
    const radius = g.userData.radius || p.r || 3;
    World.obstacles.push({ x: p.pos.x, z: p.pos.z, r: radius });
    if (p.shelter) registerShelter(p.key, p.node, p.pos.x, p.pos.z, p.doorDist !== undefined ? p.doorDist - 0.8 : radius, !!p.home);
    if (p.key === 'iglesia') World.church = g;
  }
  World.obstacles.push({ x: 3, z: -64, r: 14 });
  World.obstacles.push({ x: World.cemetery.x, z: World.cemetery.z, r: 7 });
  const m = Graph.node('mercado');
  World.stallSpots.forEach((s, i) => {
    const stall = B.makeMarketStall(Assets.tentColors[i % Assets.tentColors.length]);
    placeGroup(stall, s.x, s.z, faceToward(s.x, s.z, m.x, m.z));
    const dir = _v1.set(m.x - s.x, 0, m.z - s.z).normalize();
    World.stalls.push({ group: stall, front: new THREE.Vector3(s.x + dir.x * 2.6, 0, s.z + dir.z * 2.6) });
    World.obstacles.push({ x: s.x, z: s.z, r: 2.6 });
  });
  Crops.init();
  for (const f of World.fields) addFieldVisuals(f);
  const g = Graph.node('granja');
  for (const [x, z] of [[g.x + 2, g.z - 6], [g.x + 5, g.z - 5], [g.x - 12, g.z + 14]]) {
    placeGroup(B.makeHayPile(), x, z, rand(0, TAU));
    World.obstacles.push({ x, z, r: 2 });
  }
  const c2 = Graph.node('casa2');
  placeGroup(B.makeTrough(), c2.x - 12, c2.z + 1, 0.4);
  placeGroup(B.makeTrough(), g.x - 1, g.z + 5, 1.2);
  World.obstacles.push({ x: c2.x - 12, z: c2.z + 1, r: 1.6 }, { x: g.x - 1, z: g.z + 5, r: 1.6 });
  const a = Graph.node('almacen');
  placeGroup(B.makeCart(), a.x + 6, a.z - 1, 1.1);
  placeGroup(B.makeCart(), g.x + 3, g.z - 9, -0.6);
  World.obstacles.push({ x: a.x + 6, z: a.z - 1, r: 2 }, { x: g.x + 3, z: g.z - 9, r: 2 });
  buildFences();
  World.feria = B.makeFeriaTents();
  World.feria.position.set(0, terrainHeight(0, 0), 0);
  World.cart = B.makeCart();
  World.sunMesh = new THREE.Mesh(Assets.geo.sphere, Assets.mat.sun);
  World.sunMesh.scale.setScalar(9);
  World.moonMesh = new THREE.Mesh(Assets.geo.sphere, Assets.mat.moon);
  World.moonMesh.scale.setScalar(5.5);
  Render.scene.add(World.sunMesh, World.moonMesh);
  // Anclajes de trabajo: puntos concretos alrededor de los que deambula cada rol mientras trabaja.
  const mine = PLACEMENTS.find(p => p.key === 'mina').pos, mn = Graph.node('mina');
  World.anchors.mina = new THREE.Vector3(lerp(mn.x, mine.x, 0.45), 0, lerp(mn.z, mine.z, 0.45));
  const ch = PLACEMENTS.find(p => p.key === 'iglesia').pos, cn = Graph.node('iglesia');
  World.anchors.iglesia = new THREE.Vector3(lerp(cn.x, ch.x, 0.3), 0, lerp(cn.z, ch.z, 0.3));
  const wood = PLACEMENTS.find(p => p.key === 'bosque').pos, wn = Graph.node('bosque');
  World.anchors.bosque = new THREE.Vector3(lerp(wn.x, wood.x, 0.4), 0, lerp(wn.z, wood.z, 0.4));
  const wh = PLACEMENTS.find(p => p.key === 'almacen').pos, an = Graph.node('almacen');
  World.anchors.almacen = new THREE.Vector3(lerp(an.x, wh.x, 0.35), 0, lerp(an.z, wh.z, 0.35));
  World.anchors.campos = World.fields.map(f => new THREE.Vector3(f.x, 0, f.z));
  World.anchors.taberna = World.shelters.find(s => s.key === 'taberna').door.clone();
  World.anchors.granja = World.shelters.find(s => s.key === 'granjaCasa').door.clone();
  World.anchors.castillo = World.shelters.find(s => s.key === 'castillo').door.clone();
  World.anchors.pozo = new THREE.Vector3(-1.5, 0, 1.5);
}
export function registerShelter(key, nodeId, x, z, radius, isHome) {
  const node = Graph.node(nodeId);
  const dir = _v1.set(node.x - x, 0, node.z - z).normalize();
  const door = new THREE.Vector3(x + dir.x * (radius + 0.8), 0, z + dir.z * (radius + 0.8));
  const s = { key, node: nodeId, door };
  World.shelters.push(s);
  if (isHome) World.homes.push(s);
  return s;
}
function addFieldVisuals(f) {
  const slab = mesh(Assets.geo.box, Assets.mat.dirt, f.x, terrainHeight(f.x, f.z) + 0.08, f.z, f.w, 0.3, f.d);
  slab.castShadow = false;
  Render.scene.add(slab);
  World.obstacles.push({ x: f.x, z: f.z, r: Math.max(f.w, f.d) * 0.6 });
  Crops.addField(f);
}
function buildFences() {
  const segs = [];
  for (const f of World.fields) {
    const hw = f.w / 2 + 1, hd = f.d / 2 + 1;
    const corners = [[f.x - hw, f.z - hd], [f.x + hw, f.z - hd], [f.x + hw, f.z + hd], [f.x - hw, f.z + hd]];
    for (let i = 0; i < 4; i++) segs.push([corners[i], corners[(i + 1) % 4]]);
  }
  const c1 = Graph.node('casa1');
  segs.push([[c1.x + 1, c1.z + 11], [c1.x + 12, c1.z + 11]], [[c1.x + 12, c1.z + 11], [c1.x + 12, c1.z + 2]]);
  const c2 = Graph.node('casa2');
  segs.push([[c2.x - 15, c2.z - 3], [c2.x - 15, c2.z + 6]], [[c2.x - 15, c2.z + 6], [c2.x - 7, c2.z + 6]]);
  const posts = [], rails = [];
  for (const [a, b] of segs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      posts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      if (i < n) rails.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[0], b[0], t + 1 / n), lerp(a[1], b[1], t + 1 / n)]);
    }
  }
  const postMesh = new THREE.InstancedMesh(Assets.geo.box, Assets.mat.wood, posts.length);
  posts.forEach(([x, z], i) => {
    _dummy.position.set(x, terrainHeight(x, z) + 0.5, z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(0.18, 1.1, 0.18);
    _dummy.updateMatrix();
    postMesh.setMatrixAt(i, _dummy.matrix);
  });
  const railMesh = new THREE.InstancedMesh(Assets.geo.box, Assets.mat.wood, rails.length * 2);
  rails.forEach(([x1, z1, x2, z2], i) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const y = (terrainHeight(x1, z1) + terrainHeight(x2, z2)) / 2;
    const ry = Math.atan2(x2 - x1, z2 - z1);
    for (let k = 0; k < 2; k++) {
      _dummy.position.set((x1 + x2) / 2, y + 0.45 + k * 0.4, (z1 + z2) / 2);
      _dummy.rotation.set(0, ry, 0);
      _dummy.scale.set(0.08, 0.12, len);
      _dummy.updateMatrix();
      railMesh.setMatrixAt(i * 2 + k, _dummy.matrix);
    }
  });
  postMesh.castShadow = false; railMesh.castShadow = false;
  Render.scene.add(postMesh, railMesh);
}
export function spotIsClear(x, z, margin) {
  for (let i = 0; i < World.obstacles.length; i++) {
    const o = World.obstacles[i];
    if (Math.hypot(x - o.x, z - o.z) < o.r + margin) return false;
  }
  return true;
}
export function isFreeSpot(x, z, margin) {
  if (Math.abs(x) > Terrain.half - 3 || Math.abs(z) > Terrain.half - 3) return false;
  RoadField.nearest(x, z, _near);
  if (_near.p && _near.d < CONFIG.road.width * 0.5 + margin) return false;
  if (!spotIsClear(x, z, margin)) return false;
  for (const f of Terrain.footprints) if (Math.hypot(x - f.x, z - f.z) < f.r + margin * 0.6) return false;
  return true;
}
// Muestreo con rechazo: más denso hacia los bordes del mapa, nunca sobre caminos ni edificios.
function scatter(count, margin, minSpacing, edgeBias) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 60) {
    tries++;
    const x = rand(-Terrain.half + 4, Terrain.half - 4), z = rand(-Terrain.half + 4, Terrain.half - 4);
    const d = Math.hypot(x, z);
    const accept = edgeBias ? 0.18 + 0.82 * smoothstep(28, 85, d) : 1;
    if (rng() > accept) continue;
    if (!isFreeSpot(x, z, margin)) continue;
    let ok = true;
    for (let i = 0; i < out.length; i++) if (Math.hypot(out[i].x - x, out[i].z - z) < minSpacing) { ok = false; break; }
    if (ok) out.push({ x, z });
  }
  return out;
}
function buildVegetation() {
  const leafColors = [hex(PALETTE.leaf1), hex(PALETTE.leaf2), hex(PALETTE.leaf3)];
  const trees = scatter(CONFIG.vegetation.trees, 3, 3.2, true);
  const trunks = new THREE.InstancedMesh(Assets.geo.cyl, Assets.mat.wood, trees.length);
  const canopy = new THREE.InstancedMesh(Assets.geo.cone, Assets.mat.canopy, trees.length);
  const secondMap = new Int32Array(trees.length).fill(-1);
  const secondIdx = [];
  trees.forEach((t, i) => {
    const s = rand(0.8, 1.5);
    const y = terrainHeight(t.x, t.z);
    const ry = rand(0, TAU);
    _dummy.position.set(t.x, y + 0.9 * s, t.z);
    _dummy.rotation.set(0, ry, 0);
    _dummy.scale.set(0.32 * s, 1.9 * s, 0.32 * s);
    _dummy.updateMatrix();
    trunks.setMatrixAt(i, _dummy.matrix);
    const ch = rand(2.6, 3.6) * s, cr = rand(1.4, 2.0) * s;
    _dummy.position.set(t.x, y + 1.5 * s + ch * 0.5, t.z);
    _dummy.scale.set(cr, ch, cr);
    _dummy.updateMatrix();
    canopy.setMatrixAt(i, _dummy.matrix);
    canopy.setColorAt(i, pick(leafColors));
    t.s = s; t.y = y; t.ry = ry; t.ch = ch; t.cr = cr; t.hidden = false;
    if (chance(0.6)) { secondMap[i] = secondIdx.length; secondIdx.push(i); }
  });
  const canopy2 = new THREE.InstancedMesh(Assets.geo.cone, Assets.mat.canopy, secondIdx.length);
  secondIdx.forEach((ti, k) => {
    const t = trees[ti];
    _dummy.position.set(t.x, t.y + 1.5 * t.s + t.ch * 0.85, t.z);
    _dummy.rotation.set(0, t.ry + 0.4, 0);
    _dummy.scale.set(t.cr * 0.7, t.ch * 0.7, t.cr * 0.7);
    _dummy.updateMatrix();
    canopy2.setMatrixAt(k, _dummy.matrix);
    canopy2.setColorAt(k, pick(leafColors));
  });
  for (const m of [trunks, canopy, canopy2]) { m.castShadow = true; m.receiveShadow = true; }
  Render.scene.add(trunks, canopy, canopy2);
  World.treeList = trees;
  World.trees = { trunks, canopy, canopy2, secondMap };

  const rocks = scatter(CONFIG.vegetation.rocks, 1.5, 2.5, true);
  const rockMesh = new THREE.InstancedMesh(Assets.geo.ico, Assets.mat.rock, rocks.length);
  rocks.forEach((r, i) => {
    const s = rand(0.5, 1.6);
    _dummy.position.set(r.x, terrainHeight(r.x, r.z) + s * 0.25, r.z);
    _dummy.rotation.set(rand(0, 0.5), rand(0, TAU), rand(0, 0.5));
    _dummy.scale.set(s * rand(0.9, 1.4), s * 0.55, s * rand(0.8, 1.2));
    _dummy.updateMatrix();
    rockMesh.setMatrixAt(i, _dummy.matrix);
  });
  rockMesh.castShadow = true; rockMesh.receiveShadow = true;
  Render.scene.add(rockMesh);

  const bushes = scatter(CONFIG.vegetation.bushes, 1.2, 2, false);
  const bushMesh = new THREE.InstancedMesh(Assets.geo.ico, Assets.mat.canopy, bushes.length);
  bushes.forEach((b, i) => {
    const s = rand(0.5, 1.0);
    _dummy.position.set(b.x, terrainHeight(b.x, b.z) + s * 0.4, b.z);
    _dummy.rotation.set(0, rand(0, TAU), 0);
    _dummy.scale.set(s * 1.3, s * 0.8, s * 1.3);
    _dummy.updateMatrix();
    bushMesh.setMatrixAt(i, _dummy.matrix);
    bushMesh.setColorAt(i, pick(leafColors));
  });
  bushMesh.castShadow = false; bushMesh.receiveShadow = true;
  Render.scene.add(bushMesh);
}
// Los árboles que quedan bajo una construcción nueva se ocultan poniendo su matriz a escala cero.
export function hideTreesNear(x, z, r) {
  const T = World.trees;
  if (!T) return;
  _dummy.position.set(0, -50, 0);
  _dummy.rotation.set(0, 0, 0);
  _dummy.scale.set(0.0001, 0.0001, 0.0001);
  _dummy.updateMatrix();
  let changed = false;
  World.treeList.forEach((t, i) => {
    if (t.hidden || Math.hypot(t.x - x, t.z - z) > r) return;
    t.hidden = true;
    T.trunks.setMatrixAt(i, _dummy.matrix);
    T.canopy.setMatrixAt(i, _dummy.matrix);
    if (T.secondMap[i] >= 0) T.canopy2.setMatrixAt(T.secondMap[i], _dummy.matrix);
    changed = true;
  });
  if (changed) {
    T.trunks.instanceMatrix.needsUpdate = true;
    T.canopy.instanceMatrix.needsUpdate = true;
    T.canopy2.instanceMatrix.needsUpdate = true;
  }
}

// Faroles: postes y linternas instanciados que se instalan por los caminos cuando se conoce el alumbrado.
export const Lamps = {
  list: [], posts: null, lanterns: null, lights: [],
  init() {
    const N = CONFIG.lamps.max;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.posts = new THREE.InstancedMesh(Assets.geo.cyl, Assets.mat.wood, N);
    this.lanterns = new THREE.InstancedMesh(Assets.geo.box, Assets.mat.lantern, N);
    for (let i = 0; i < N; i++) { this.posts.setMatrixAt(i, zero); this.lanterns.setMatrixAt(i, zero); }
    this.posts.castShadow = false; this.lanterns.castShadow = false;
    this.posts.frustumCulled = false; this.lanterns.frustumCulled = false;
    Render.scene.add(this.posts, this.lanterns);
    for (let i = 0; i < CONFIG.lamps.pointLights; i++) {
      const l = new THREE.PointLight(0xFFB050, 0, 22, 2);
      Render.scene.add(l);
      this.lights.push(l);
    }
  },
  // Candidatos: puntos de las aristas más cercanas a la plaza, a un lado del camino, sin farol cerca.
  candidates() {
    const out = [];
    const edges = Graph.edges.slice().sort((a, b) => {
      const ma = a.pts[Math.floor(a.pts.length / 2)], mb = b.pts[Math.floor(b.pts.length / 2)];
      return Math.hypot(ma.x, ma.z) - Math.hypot(mb.x, mb.z);
    });
    const sp = CONFIG.lamps.spacing, side = CONFIG.road.width * 0.5 + 1.0;
    for (const e of edges) {
      const from = Graph.node(e.a), to = Graph.node(e.b);
      if (from.edge || to.edge) continue;
      let acc = sp * 0.5, flip = 1;
      for (let i = 1; i < e.pts.length; i++) {
        const p = e.pts[i], q = e.pts[i - 1];
        acc += Math.hypot(p.x - q.x, p.z - q.z);
        if (acc < sp) continue;
        acc = 0;
        const dx = p.x - q.x, dz = p.z - q.z, len = Math.hypot(dx, dz) || 1;
        const x = p.x - dz / len * side * flip, z = p.z + dx / len * side * flip;
        flip = -flip;
        if (Math.abs(x) > Terrain.half - 4 || Math.abs(z) > Terrain.half - 4) continue;
        if (!spotIsClear(x, z, 0.8)) continue;
        let near = false;
        for (const l of this.list) if (Math.hypot(l.x - x, l.z - z) < sp * 0.6) { near = true; break; }
        if (!near) out.push({ x, z });
      }
    }
    return out;
  },
  addLamp(rec) {
    const i = this.list.length;
    if (i >= CONFIG.lamps.max) return false;
    const y = terrainHeight(rec.x, rec.z);
    _dummy.position.set(rec.x, y + 1.5, rec.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(0.12, 3.0, 0.12);
    _dummy.updateMatrix();
    this.posts.setMatrixAt(i, _dummy.matrix);
    _dummy.position.set(rec.x, y + 3.15, rec.z);
    _dummy.scale.set(0.5, 0.55, 0.5);
    _dummy.updateMatrix();
    this.lanterns.setMatrixAt(i, _dummy.matrix);
    this.posts.instanceMatrix.needsUpdate = true;
    this.lanterns.instanceMatrix.needsUpdate = true;
    if (i < this.lights.length) this.lights[i].position.set(rec.x, y + 3.2, rec.z);
    this.list.push({ x: rec.x, z: rec.z });
    return true;
  },
  placeDaily(enabled) {
    if (!enabled || this.list.length >= CONFIG.lamps.max) return 0;
    const cands = this.candidates();
    let placed = 0;
    for (let i = 0; i < CONFIG.lamps.perDay && i < cands.length; i++) {
      if (Economy.stock.madera < CONFIG.lamps.costWood || Economy.treasury < CONFIG.lamps.costCoins) break;
      let c = null;
      for (const cand of cands) {
        let near = false;
        for (const l of this.list) if (Math.hypot(l.x - cand.x, l.z - cand.z) < CONFIG.lamps.spacing * 0.6) { near = true; break; }
        if (!near) { c = cand; break; }
      }
      if (!c) break;
      Economy.take('madera', CONFIG.lamps.costWood);
      Economy.spendTreasury(CONFIG.lamps.costCoins);
      if (this.addLamp(c)) placed++;
    }
    if (placed > 0) HUD.log(`Se instalan ${placed} farol${placed > 1 ? 'es' : ''} más por los caminos`);
    return placed;
  },
  setNight(f) {
    Assets.mat.lantern.emissiveIntensity = f * 2.6;
    for (let i = 0; i < this.lights.length; i++) this.lights[i].intensity = i < this.list.length ? f * 24 : 0;
  },
  serialize() { return this.list.slice(); },
  restore(list) { if (list) for (const rec of list) this.addLamp(rec); }
};

// Yacimientos ocultos: se generan con la semilla lejos del pueblo y solo existen en el mundo al descubrirse.
export const Deposits = {
  list: [],
  init() {
    const D = CONFIG.deposits;
    for (let i = 0; i < D.count; i++) {
      let placed = false;
      for (let t = 0; t < 80 && !placed; t++) {
        const x = rand(-Terrain.half + 10, Terrain.half - 10), z = rand(-Terrain.half + 10, Terrain.half - 10);
        if (Math.hypot(x, z) < D.minDist) continue;
        if (!isFreeSpot(x, z, 7)) continue;
        let close = false;
        for (const d of this.list) if (Math.hypot(d.x - x, d.z - z) < 30) { close = true; break; }
        if (close) continue;
        this.list.push({ key: 'yacimiento' + i, kind: D.kinds[i % D.kinds.length], x, z, discovered: false });
        placed = true;
      }
    }
  },
  undiscovered() { return this.list.filter(d => !d.discovered); },
  direction(x, z) {
    return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'al este' : 'al oeste') : (z > 0 ? 'al sur' : 'al norte');
  },
  discover(dep) {
    if (dep.discovered) return null;
    const near = Graph.nearestNode(dep.x, dep.z, true);
    const dir = _v1.set(near.x - dep.x, 0, near.z - dep.z).normalize();
    const rec = { type: 'yacimiento', key: dep.key, kind: dep.kind, x: dep.x, z: dep.z, ry: Math.atan2(dir.x, dir.z), node: { x: dep.x + dir.x * 6.5, z: dep.z + dir.z * 6.5 }, edgeTo: near.id };
    finishConstruction(rec);
    return rec;
  }
};

export function populateScene() {
  initAssets();
  initNoise();
  Graph.build();
  registerFootprints();
  buildTerrain(Render.scene);
  Graph.updateHeights();
  buildBuildings();
  mergeStaticMeshes();
  buildVegetation();
  Deposits.init();
  Lamps.init();
}

// ---- Construcción en tiempo de ejecución ----
// Espacio libre alrededor de un punto: distancia al obstáculo más cercano, acotada.
function openness(x, z) {
  let best = 20;
  for (const o of World.obstacles) best = Math.min(best, Math.hypot(x - o.x, z - o.z) - o.r);
  return Math.max(0, best);
}
// Dónde buscar cada tipo de obra: desde qué nodos, a qué distancia y con cuánto margen.
const SITE_RULES = {
  casa: { anchors: () => World.homes.map(h => h.node).concat(['taberna', 'plaza', 'iglesia', 'mercado']), margin: 6, node: true },
  botica: { anchors: () => ['plaza', 'iglesia', 'mercado'], margin: 6.5, node: true },
  escuela: { anchors: () => ['plaza', 'iglesia', 'taberna'], margin: 7, node: true },
  herreria: { anchors: () => ['almacen', 'mina', 'mercado'], margin: 6.5, node: true },
  molino: { anchors: () => ['granja'], margin: 6, node: true, dist: [14, 30] },
  torre: { anchors: () => ['castillo', 'bosque', 'mina', 'granja'], margin: 5, node: true, dist: [12, 28] },
  granero: { anchors: () => ['almacen'], margin: 5.5, node: false, dist: [8, 16] }
};
export function findSite(type) {
  const plaza = Graph.node('plaza');
  const S = CONFIG.construction.site;
  let best = null, bestScore = Infinity;
  if (type === 'campo') {
    const g = Graph.node('granja');
    const anchors = [g].concat(World.fields);
    for (let i = 0; i < 160; i++) {
      const a = pick(anchors);
      const ang = rand(0, TAU), d = rand(12, 26);
      const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
      if (Math.abs(x) > S.bounds || Math.abs(z) > S.bounds) continue;
      if (!isFreeSpot(x, z, 9)) continue;
      const score = Math.hypot(x - g.x, z - g.z);
      if (score < bestScore) { bestScore = score; best = { type, x, z, ry: 0 }; }
    }
    return best;
  }
  const rule = SITE_RULES[type];
  if (!rule) return null;
  const ids = rule.anchors().filter(id => Graph.index[id] !== undefined);
  const dist = rule.dist || [S.minDist, S.maxDist];
  for (let i = 0; i < 220; i++) {
    const a = Graph.node(pick(ids));
    const ang = rand(0, TAU), d = rand(dist[0], dist[1]);
    const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
    if (Math.abs(x) > S.bounds || Math.abs(z) > S.bounds) continue;
    if (!isFreeSpot(x, z, rule.margin)) continue;
    const near = Graph.nearestNode(x, z, true);
    const dn = Math.hypot(near.x - x, near.z - z);
    let rec;
    if (rule.node) {
      if (dn < 7 || dn > 30) continue;
      const dir = _v1.set(near.x - x, 0, near.z - z).normalize();
      const nx = x + dir.x * 6, nz = z + dir.z * 6;
      if (!spotIsClear(nx, nz, 1.5)) continue;
      rec = { type, x, z, ry: Math.atan2(nx - x, nz - z), node: { x: nx, z: nz }, edgeTo: near.id };
    } else {
      rec = { type, x, z, ry: faceToward(x, z, a.x, a.z) };
    }
    // Las obras se alejan del centro: pesa más el terreno abierto que la cercanía a la plaza.
    const score = Math.hypot(x - plaza.x, z - plaza.z) * S.plazaWeight - openness(x, z) * S.opennessWeight + dn * 0.2 + rand(0, 2);
    if (score < bestScore) { bestScore = score; best = rec; }
  }
  return best;
}
export function createSiteVisual(rec) {
  const size = rec.type === 'campo' ? 6 : 4.5;
  const g = B.makeScaffold(size);
  g.position.set(rec.x, terrainHeight(rec.x, rec.z), rec.z);
  g.rotation.y = rec.ry;
  Render.scene.add(g);
  World.siteGroup = g;
  return g;
}
export function updateSiteVisual(progress) {
  if (World.siteGroup) World.siteGroup.userData.frame.scale.y = 0.05 + progress * 0.95;
}
export function removeSiteVisual() {
  if (World.siteGroup) Render.scene.remove(World.siteGroup);
  World.siteGroup = null;
}
let homeSerial = 5;
const FOOTPRINT = { casa: 4, botica: 5, escuela: 5.6, herreria: 5.2, molino: 4.5, torre: 3.5, yacimiento: 5.5, granero: 4.5, campo: 7.5 };
const FACTORY = {
  casa: () => B.makeCottage(), botica: () => B.makeBotica(), escuela: () => B.makeEscuela(), herreria: () => B.makeHerreria(),
  molino: () => B.makeMolino(), torre: () => B.makeTorre(), granero: () => B.makeGranary(), yacimiento: (rec) => B.makeDeposit(rec.kind)
};
function hasNode(type) { return type !== 'granero' && type !== 'campo'; }
// Fase 1: grafo, huellas y caminos. Debe ir antes de recalcular el terreno.
export function prepareConstruction(rec) {
  if (rec.type === 'campo') {
    addFootprint(rec.x, rec.z, FOOTPRINT.campo, 4);
    hideTreesNear(rec.x, rec.z, 10);
    return;
  }
  if (hasNode(rec.type)) {
    if (!rec.key) rec.key = rec.type === 'casa' ? 'casa' + homeSerial++ : rec.type;
    else if (rec.type === 'casa') homeSerial = Math.max(homeSerial, parseInt(rec.key.replace('casa', ''), 10) + 1 || homeSerial);
    if (Graph.index[rec.key] === undefined) {
      Graph.addNode({ id: rec.key, x: rec.node.x, z: rec.node.z, area: 2.5 });
      const e = Graph.addEdge(rec.key, rec.edgeTo, rec.offsets);
      rec.offsets = e.offsets;
      Graph.computeRoutes();
    }
    hideTreesNear(rec.node.x, rec.node.z, 4);
    for (const e of Graph.edges) if (e.a === rec.key || e.b === rec.key) for (let i = 0; i < e.pts.length; i += 3) hideTreesNear(e.pts[i].x, e.pts[i].z, 3.5);
  }
  addFootprint(rec.x, rec.z, FOOTPRINT[rec.type], 3.5);
  hideTreesNear(rec.x, rec.z, FOOTPRINT[rec.type] + 3.5);
}
// Fase 2: mallas y registros, con el terreno ya recalculado bajo la obra.
export function realizeConstruction(rec) {
  if (rec.type === 'campo') {
    const f = { x: rec.x, z: rec.z, w: 11, d: 8 };
    World.fields.push(f);
    addFieldVisuals(f);
    World.anchors.campos.push(new THREE.Vector3(f.x, 0, f.z));
    World.constructions.push(rec);
    return;
  }
  const g = FACTORY[rec.type](rec);
  placeGroup(g, rec.x, rec.z, rec.ry);
  mergeGroup(g);
  const radius = g.userData.radius || FOOTPRINT[rec.type];
  World.obstacles.push({ x: rec.x, z: rec.z, r: radius });
  if (rec.type === 'granero') {
    World.granaries++;
  } else {
    World.buildings[rec.key] = g;
    const s = registerShelter(rec.key, rec.key, rec.x, rec.z, radius, rec.type === 'casa');
    const spot = { key: rec.key, travelNode: rec.key, anchor: s.door.clone(), x: rec.x, z: rec.z };
    World.anchors[rec.key] = spot.anchor;
    if (rec.type === 'botica') World.botica = spot;
    else if (rec.type === 'escuela') World.escuela = spot;
    else if (rec.type === 'molino') {
      const blades = g.userData.blades;
      World.dynamics.push((dt) => { blades.rotation.z += dt * 0.9; });
    } else if (rec.type === 'yacimiento') {
      World.deposits.push({ key: rec.key, kind: rec.kind, anchor: spot.anchor });
      const dep = Deposits.list.find(d => d.key === rec.key);
      if (dep) dep.discovered = true;
    }
  }
  World.constructions.push(rec);
}
export function finishConstruction(rec) {
  prepareConstruction(rec);
  rebuildTerrain();
  Graph.updateHeights();
  realizeConstruction(rec);
}
export function applySavedConstructions(list) {
  if (!list || !list.length) return;
  for (const rec of list) prepareConstruction(rec);
  rebuildTerrain();
  Graph.updateHeights();
  for (const rec of list) realizeConstruction(rec);
}
// Lápidas en filas de cuatro que se alejan de la iglesia; cada una se funde en la escena al colocarse.
export function addGrave(rec) {
  const c = World.cemetery;
  if (!rec) {
    const i = World.graves.length;
    const col = i % 4, row = Math.floor(i / 4);
    const lx = (col - 1.5) * 1.4, lz = 1.2 - row * 1.7;
    const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
    rec = { x: c.x + lx * cs + lz * sn, z: c.z - lx * sn + lz * cs, ry: c.ry };
  }
  const g = B.makeGrave();
  placeGroup(g, rec.x, rec.z, rec.ry);
  mergeGroup(g);
  World.graves.push(rec);
  return rec;
}
export function restoreGraves(list) {
  if (!list) return;
  for (const rec of list) addGrave(rec);
}
