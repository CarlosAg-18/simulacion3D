import * as THREE from 'three';
import { Assets, mesh, addWindow } from './assets.js';
import { rand, chance, lerp, TAU, _dummy } from './utils.js';

// Todas las construcciones son primitivas agrupadas por funciones fábrica parametrizadas.
export function makeCottage() {
  const g = new THREE.Group();
  const w = rand(4.2, 5.6), d = rand(4.6, 6.2), hw = rand(2.3, 3.1), hr = rand(1.7, 2.5);
  const tiled = chance(0.4);
  const roofMat = tiled ? Assets.mat.tile : Assets.mat.thatch;
  g.add(mesh(Assets.geo.box, Assets.mat.stoneDark, 0, 0.3, 0, w + 0.2, 0.6, d + 0.2));
  g.add(mesh(Assets.geo.box, chance(0.5) ? Assets.mat.plaster : Assets.mat.plasterWarm, 0, hw / 2 + 0.3, 0, w, hw, d));
  g.add(mesh(Assets.geo.prism, roofMat, 0, hw + 0.3, 0, w + 0.9, hr, d + 0.9));
  g.add(mesh(Assets.geo.box, Assets.mat.wood, 0, 1.0, d / 2 + 0.05, 1.0, 1.7, 0.14));
  addWindow(g, -w * 0.3, 1.7, d / 2 + 0.05, 0.7, 0.7);
  addWindow(g, w * 0.3, 1.7, d / 2 + 0.05, 0.7, 0.7);
  addWindow(g, w / 2 + 0.05, 1.7, 0, 0.7, 0.7, Math.PI / 2);
  if (tiled) g.add(mesh(Assets.geo.box, Assets.mat.stoneDark, w * 0.28, hw + hr * 0.7 + 0.3, -d * 0.2, 0.6, 1.4, 0.6));
  g.userData.radius = Math.max(w, d) * 0.7;
  return g;
}
export function makeChurch() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stone, 0, 3, 0, 8, 6, 15));
  g.add(mesh(ge.prism, m.tile, 0, 6, 0, 9, 3, 16));
  g.add(mesh(ge.box, m.stoneDark, 0, 4.5, 9.2, 4.2, 9, 4.2));
  for (const px of [-1.75, 1.75]) for (const pz of [7.45, 10.95]) g.add(mesh(ge.box, m.stoneDark, px, 10.2, pz, 0.5, 2.4, 0.5));
  g.add(mesh(ge.cone4, m.tile, 0, 13.6, 9.2, 3.4, 4.4, 3.4, Math.PI / 4));
  g.add(mesh(ge.box, m.wood, 0, 16.5, 9.2, 0.2, 1.6, 0.2));
  g.add(mesh(ge.box, m.wood, 0, 16.8, 9.2, 0.9, 0.2, 0.2));
  const bellPivot = new THREE.Group();
  bellPivot.userData.dynamic = true;
  bellPivot.position.set(0, 11.3, 9.2);
  bellPivot.add(mesh(ge.cylTop, m.bell, 0, -0.65, 0, 0.55, 0.85, 0.55));
  bellPivot.add(mesh(ge.sphere, m.dark, 0, -1.15, 0, 0.16, 0.16, 0.16));
  g.add(bellPivot);
  g.userData.bell = bellPivot;
  g.add(mesh(ge.box, m.wood, 0, 1.4, 11.4, 1.6, 2.6, 0.16));
  for (let i = -1; i <= 1; i++) {
    addWindow(g, 4.05, 3.4, i * 4, 0.9, 2.4, Math.PI / 2);
    addWindow(g, -4.05, 3.4, i * 4, 0.9, 2.4, Math.PI / 2);
  }
  g.userData.radius = 9;
  return g;
}
export function makeCastle() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stone, 0, 3.5, 0, 26, 7, 4));
  for (let i = -6; i <= 6; i++) g.add(mesh(ge.box, m.stoneDark, i * 2, 7.6, 0, 1.1, 1.2, 4.2));
  g.add(mesh(ge.box, m.dark, 0, 2.2, 0.2, 3.4, 4.4, 4.4));
  g.add(mesh(ge.box, m.stone, 0, 6.5, -11, 12, 13, 12));
  for (let i = -3; i <= 3; i++) {
    g.add(mesh(ge.box, m.stoneDark, i * 1.9, 13.6, -5.2, 1, 1.2, 1));
    g.add(mesh(ge.box, m.stoneDark, i * 1.9, 13.6, -16.8, 1, 1.2, 1));
  }
  for (const [tx, tz] of [[-12, 0], [12, 0], [0, -20]]) {
    g.add(mesh(ge.cyl, m.stone, tx, 7, tz, 3, 14, 3));
    g.add(mesh(ge.cone, m.tile, tx, 16.4, tz, 3.6, 4.8, 3.6));
    g.add(mesh(ge.box, m.wood, tx, 19.6, tz, 0.16, 2.2, 0.16));
    g.add(mesh(ge.box, Assets.roleColors.guardia, tx + 0.55, 20.3, tz, 1.1, 0.6, 0.06));
    addWindow(g, tx, 9, tz + 3.05, 0.7, 1.2);
  }
  addWindow(g, -3, 8, -4.95, 1, 1.6);
  addWindow(g, 3, 8, -4.95, 1, 1.6);
  addWindow(g, 0, 11, -4.95, 1, 1.4);
  g.userData.radius = 20;
  return g;
}
export function makeTavern() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 1.4, 0, 9, 2.8, 7));
  g.add(mesh(ge.box, m.plasterWarm, 0, 4.2, 0, 9.4, 2.8, 7.4));
  g.add(mesh(ge.prism, m.tile, 0, 5.6, 0, 10.4, 2.6, 8.4));
  g.add(mesh(ge.box, m.wood, 0, 1.1, 3.55, 1.4, 2.2, 0.16));
  addWindow(g, -3, 1.6, 3.55, 1.1, 0.9); addWindow(g, 3, 1.6, 3.55, 1.1, 0.9);
  addWindow(g, -3, 4.3, 3.75, 0.9, 0.9); addWindow(g, 0, 4.3, 3.75, 0.9, 0.9); addWindow(g, 3, 4.3, 3.75, 0.9, 0.9);
  addWindow(g, 4.75, 1.6, 0, 1.0, 0.9, Math.PI / 2);
  g.add(mesh(ge.box, m.wood, 5.2, 2.2, 3.4, 0.18, 4.4, 0.18));
  g.add(mesh(ge.box, m.wood, 5.9, 4.0, 3.4, 1.6, 0.9, 0.12));
  g.add(mesh(ge.cyl, m.wood, -5.6, 0.6, 2.2, 0.6, 1.2, 0.6));
  g.add(mesh(ge.cyl, m.wood, -5.6, 0.6, 3.6, 0.6, 1.2, 0.6));
  g.add(mesh(ge.box, m.stoneDark, 3, 7.4, -1.5, 0.8, 2.2, 0.8));
  g.userData.radius = 7;
  return g;
}
export function makeMarketStall(color) {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.1, 1.1]) g.add(mesh(ge.box, m.wood, sx, 1.4, sz, 0.16, 2.8, 0.16));
  g.add(mesh(ge.box, m.wood, 0, 0.95, 0, 3, 0.16, 2.4));
  g.add(mesh(ge.box, m.wood, 0, 0.45, 0, 2.6, 0.9, 2.0));
  g.add(mesh(ge.prism, color, 0, 2.7, 0, 3.6, 0.9, 3.0));
  g.add(mesh(ge.sphereLow, m.hay, -0.8, 1.25, -0.3, 0.3, 0.3, 0.3));
  g.add(mesh(ge.box, m.plaster, 0.6, 1.2, 0.2, 0.7, 0.4, 0.5));
  g.add(mesh(ge.sphereLow, m.chickenRed, 0.2, 1.2, -0.6, 0.22, 0.22, 0.22));
  g.userData.radius = 2.4;
  return g;
}
export function makeMineEntrance() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.ico, m.stoneDark, 0, 1.5, -3, 8, 6, 7));
  g.add(mesh(ge.ico, m.stone, 5, 1, -5, 4, 3, 4, 0.7));
  g.add(mesh(ge.ico, m.stone, -5.5, 0.8, -4, 3.5, 2.6, 3.5, 1.9));
  g.add(mesh(ge.box, m.dark, 0, 1.6, 0.4, 2.6, 3.2, 1.2));
  g.add(mesh(ge.box, m.wood, -1.6, 1.7, 1.0, 0.35, 3.4, 0.35));
  g.add(mesh(ge.box, m.wood, 1.6, 1.7, 1.0, 0.35, 3.4, 0.35));
  g.add(mesh(ge.box, m.wood, 0, 3.55, 1.0, 3.9, 0.4, 0.5));
  g.add(mesh(ge.box, m.wood, -0.9, 0.05, 3, 0.12, 0.1, 5));
  g.add(mesh(ge.box, m.wood, 0.9, 0.05, 3, 0.12, 0.1, 5));
  g.add(mesh(ge.cone, m.stoneDark, 4, 0.7, 2.5, 1.6, 1.4, 1.6));
  g.add(mesh(ge.box, m.wood, -3.6, 0.6, 2.6, 1.4, 0.9, 1.0));
  g.userData.radius = 8;
  return g;
}
export function makeWell() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.cyl, m.stone, 0, 0.5, 0, 1.3, 1.0, 1.3));
  const water = mesh(ge.cyl, m.water, 0, 0.75, 0, 1.0, 0.5, 1.0);
  water.castShadow = false;
  g.add(water);
  g.add(mesh(ge.box, m.wood, -1.2, 1.6, 0, 0.18, 2.4, 0.18));
  g.add(mesh(ge.box, m.wood, 1.2, 1.6, 0, 0.18, 2.4, 0.18));
  g.add(mesh(ge.cyl, m.wood, 0, 2.2, 0, 0.14, 2.6, 0.14).rotateZ(Math.PI / 2));
  g.add(mesh(ge.prism, m.tile, 0, 2.7, 0, 3.2, 1.0, 2.2));
  g.add(mesh(ge.box, m.wood, 0, 1.5, 0, 0.5, 0.45, 0.5));
  g.userData.radius = 1.8;
  return g;
}
export function makeWarehouse() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.wood, 0, 2.2, 0, 8, 4.4, 6));
  g.add(mesh(ge.prism, m.thatch, 0, 4.4, 0, 9.2, 2.6, 7.2));
  g.add(mesh(ge.box, m.dark, 0, 1.4, 3.05, 2.6, 2.8, 0.14));
  g.add(mesh(ge.box, m.wood, 5.2, 0.5, 1.5, 1.0, 1.0, 1.0));
  g.add(mesh(ge.box, m.wood, 5.2, 1.5, 1.5, 0.8, 0.9, 0.8, 0.5));
  g.userData.radius = 6;
  return g;
}
export function makeGranary() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  for (const sx of [-1.8, 1.8]) for (const sz of [-1.6, 1.6]) g.add(mesh(ge.box, m.stoneDark, sx, 0.6, sz, 0.6, 1.2, 0.6));
  g.add(mesh(ge.box, m.woodLight, 0, 2.7, 0, 5.2, 3.0, 4.4));
  g.add(mesh(ge.prism, m.thatch, 0, 4.2, 0, 6.2, 2.4, 5.4));
  g.add(mesh(ge.box, m.dark, 0, 2.3, 2.25, 1.4, 1.8, 0.12));
  g.add(mesh(ge.box, m.wood, 0, 0.9, 2.9, 2.2, 0.16, 1.6));
  g.userData.radius = 4.2;
  return g;
}
export function makeLogPile() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  const rows = [[-0.9, 0.3], [-0.3, 0.3], [0.3, 0.3], [0.9, 0.3], [-0.6, 0.82], [0, 0.82], [0.6, 0.82], [-0.3, 1.34], [0.3, 1.34]];
  for (const [x, y] of rows) {
    const log = mesh(ge.cyl6, m.wood, x, y, 0, 0.3, 2.6, 0.3);
    log.rotation.x = Math.PI / 2;
    g.add(log);
  }
  g.add(mesh(ge.cyl, m.wood, 2.4, 0.5, 0.8, 0.7, 1.0, 0.7));
  g.add(mesh(ge.box, m.metal, 2.4, 1.25, 0.8, 0.5, 0.5, 0.1, 0.4));
  g.userData.radius = 2.6;
  return g;
}
// Botica: casa baja de piedra con toldo verde, hierbas colgadas y un banco para los enfermos.
export function makeBotica() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stone, 0, 1.5, 0, 6.5, 3.0, 5));
  g.add(mesh(ge.prism, m.tile, 0, 3.0, 0, 7.4, 2.0, 6));
  g.add(mesh(ge.box, m.wood, 0, 1.0, 2.55, 1.2, 2.0, 0.14));
  addWindow(g, -2.0, 1.7, 2.55, 0.8, 0.8); addWindow(g, 2.0, 1.7, 2.55, 0.8, 0.8);
  g.add(mesh(ge.prism, m.herb, 0, 2.2, 3.2, 3.2, 0.5, 1.6));
  g.add(mesh(ge.box, m.wood, -1.4, 1.1, 3.9, 0.14, 2.2, 0.14));
  g.add(mesh(ge.box, m.wood, 1.4, 1.1, 3.9, 0.14, 2.2, 0.14));
  for (const x of [-2.6, -2.1, -1.6]) g.add(mesh(ge.cone, m.herb, x, 1.9, 2.62, 0.18, 0.5, 0.18));
  g.add(mesh(ge.box, m.wood, 3.2, 0.5, 3.4, 2.0, 0.16, 0.6));
  g.add(mesh(ge.box, m.wood, 2.4, 0.25, 3.4, 0.16, 0.5, 0.5));
  g.add(mesh(ge.box, m.wood, 4.0, 0.25, 3.4, 0.16, 0.5, 0.5));
  g.add(mesh(ge.box, m.stoneDark, -2.2, 4.2, -1.2, 0.7, 1.6, 0.7));
  g.userData.radius = 4.8;
  return g;
}
// Llamas: tres conos emisivos y una columna de humo; el parpadeo lo anima el evento de incendio.
export function makeFlame() {
  const g = new THREE.Group();
  const ge = Assets.geo, m = Assets.mat;
  const flames = [];
  for (const [x, z, s] of [[0, 0, 2.4], [1.6, 0.9, 1.7], [-1.4, -0.8, 1.9], [0.6, -1.5, 1.5]]) {
    const f = mesh(ge.cone6, m.flame, x, s * 0.9, z, s * 0.8, s * 1.8, s * 0.8);
    f.castShadow = false;
    g.add(f);
    flames.push(f);
  }
  const core = mesh(ge.cone6, m.flameCore, 0, 1.2, 0, 1.0, 2.4, 1.0);
  core.castShadow = false;
  g.add(core);
  flames.push(core);
  const light = new THREE.PointLight(0xFF7A1F, 90, 34, 2);
  light.position.set(0, 2.5, 0);
  g.add(light);
  g.userData.light = light;
  const smoke = [];
  for (let i = 0; i < 3; i++) {
    const s = mesh(ge.sphereLow, m.smoke, 0, 3 + i * 1.4, 0, 0.7 + i * 0.3, 0.6 + i * 0.25, 0.7 + i * 0.3);
    s.castShadow = false;
    g.add(s);
    smoke.push(s);
  }
  g.userData.flames = flames;
  g.userData.smoke = smoke;
  return g;
}
// Escuela: casa larga con campanita y bancos delante.
export function makeEscuela() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 0.3, 0, 8.2, 0.6, 5.2));
  g.add(mesh(ge.box, m.plaster, 0, 2.0, 0, 8, 3.4, 5));
  g.add(mesh(ge.prism, m.tile, 0, 3.7, 0, 9, 2.2, 6));
  g.add(mesh(ge.box, m.wood, 0, 1.1, 2.55, 1.2, 2.2, 0.14));
  for (const x of [-2.8, -1.4, 1.4, 2.8]) addWindow(g, x, 2.0, 2.55, 0.8, 0.9);
  g.add(mesh(ge.box, m.wood, 0, 5.4, 0, 0.9, 1.0, 0.9));
  g.add(mesh(ge.cylTop, m.bell, 0, 5.3, 0, 0.3, 0.45, 0.3));
  for (const z of [3.8, 5.0]) g.add(mesh(ge.box, m.wood, 3.5, 0.45, z, 2.4, 0.16, 0.5));
  g.userData.radius = 5.6;
  return g;
}
// Molino: torre cónica de piedra con aspas que giran (parte dinámica).
export function makeMolino() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.cylTop, m.stone, 0, 3.5, 0, 2.6, 7, 2.6));
  g.add(mesh(ge.cone, m.thatch, 0, 8.0, 0, 2.6, 2.4, 2.6));
  g.add(mesh(ge.box, m.wood, 0, 1.1, 2.3, 1.1, 2.2, 0.16));
  addWindow(g, 0, 4.5, 2.25, 0.7, 0.9);
  const hub = new THREE.Group();
  hub.userData.dynamic = true;
  hub.position.set(0, 6.6, 2.9);
  hub.add(mesh(ge.cyl, m.wood, 0, 0, 0, 0.3, 0.9, 0.3).rotateX(Math.PI / 2));
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = i * Math.PI / 2;
    arm.add(mesh(ge.box, m.wood, 0, 2.3, 0.2, 0.14, 4.6, 0.14));
    arm.add(mesh(ge.box, m.sail, 0.55, 2.6, 0.22, 0.9, 3.4, 0.05));
    hub.add(arm);
  }
  g.add(hub);
  g.userData.blades = hub;
  g.userData.radius = 4.2;
  return g;
}
// Herrería: taller abierto con chimenea, fragua y yunque.
export function makeHerreria() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 1.6, -1, 7, 3.2, 4));
  g.add(mesh(ge.prism, m.tile, 0, 3.2, -0.2, 8, 1.8, 6.4));
  for (const x of [-3.4, 3.4]) g.add(mesh(ge.box, m.wood, x, 1.5, 2.6, 0.3, 3.0, 0.3));
  g.add(mesh(ge.box, m.stoneDark, 2.2, 4.6, -2, 1.0, 3.0, 1.0));
  g.add(mesh(ge.box, m.stone, -1.8, 0.6, 1.4, 1.6, 1.2, 1.2));
  const fire = mesh(ge.box, m.flameCore, -1.8, 1.25, 1.4, 1.0, 0.1, 0.8);
  fire.castShadow = false;
  g.add(fire);
  g.add(mesh(ge.box, m.wood, 1.2, 0.35, 1.6, 0.5, 0.7, 0.5));
  g.add(mesh(ge.box, m.metal, 1.2, 0.85, 1.6, 1.0, 0.3, 0.4));
  g.add(mesh(ge.cyl, m.wood, 3.6, 0.5, 0.8, 0.5, 1.0, 0.5));
  g.userData.radius = 5.2;
  return g;
}
// Torre de vigía: fuste alto de piedra con almenas y antorcha.
export function makeTorre() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 0.5, 0, 4.4, 1.0, 4.4));
  g.add(mesh(ge.cylTop, m.stone, 0, 6.5, 0, 1.9, 12, 1.9));
  g.add(mesh(ge.cyl, m.stone, 0, 12.6, 0, 2.4, 0.8, 2.4));
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    g.add(mesh(ge.box, m.stoneDark, Math.cos(a) * 2.1, 13.4, Math.sin(a) * 2.1, 0.5, 0.8, 0.5, -a));
  }
  g.add(mesh(ge.box, m.wood, 0, 1.4, 2.0, 1.0, 1.8, 0.14));
  addWindow(g, 0, 8, 1.95, 0.6, 1.0);
  g.add(mesh(ge.box, m.wood, 0, 13.6, 0, 0.16, 1.4, 0.16));
  const torch = mesh(ge.cone6, m.flameCore, 0, 14.6, 0, 0.35, 0.7, 0.35);
  torch.castShadow = false;
  g.add(torch);
  g.add(mesh(ge.box, Assets.roleColors.guardia, 0.55, 14.9, 0, 1.1, 0.6, 0.06));
  g.userData.radius = 3.2;
  return g;
}
// Yacimiento descubierto: bocamina pequeña con vetas del color del mineral.
export function makeDeposit(kind) {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  const ore = kind === 'oro' ? m.gold : m.iron;
  g.add(mesh(ge.ico, m.stoneDark, 0, 1.2, -2, 5.5, 4.2, 5));
  g.add(mesh(ge.ico, m.stone, 3.5, 0.7, -3, 2.6, 2, 2.6, 0.9));
  g.add(mesh(ge.box, m.dark, 0, 1.2, 0.3, 2.0, 2.4, 1.0));
  g.add(mesh(ge.box, m.wood, -1.2, 1.3, 0.8, 0.3, 2.6, 0.3));
  g.add(mesh(ge.box, m.wood, 1.2, 1.3, 0.8, 0.3, 2.6, 0.3));
  g.add(mesh(ge.box, m.wood, 0, 2.7, 0.8, 3.0, 0.35, 0.4));
  for (const [x, y, z, s] of [[-1.8, 2.4, -1.4, 0.5], [2.0, 2.9, -2.2, 0.4], [0.6, 3.6, -1.6, 0.45], [-0.8, 0.5, 2.4, 0.35], [1.6, 0.4, 2.0, 0.3]]) {
    g.add(mesh(ge.ico, ore, x, y, z, s, s * 0.7, s));
  }
  g.userData.radius = 5.5;
  return g;
}
export function makeGrave() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.dirt, 0, 0.08, 0.5, 0.7, 0.16, 1.3));
  g.add(mesh(ge.box, m.stone, 0, 0.5, -0.1, 0.16, 1.0, 0.16));
  g.add(mesh(ge.box, m.stone, 0, 0.72, -0.1, 0.55, 0.16, 0.16));
  g.userData.radius = 0.8;
  return g;
}
export function makeHayPile() {
  const g = new THREE.Group();
  g.add(mesh(Assets.geo.cone, Assets.mat.hay, 0, 0.9, 0, rand(1.2, 1.7), rand(1.6, 2.2), rand(1.2, 1.7)));
  g.add(mesh(Assets.geo.sphereLow, Assets.mat.hay, 0, 0.3, 0, rand(1.3, 1.8), 0.5, rand(1.3, 1.8)));
  g.userData.radius = 1.8;
  return g;
}
export function makeCart(withHorse) {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.wood, 0, 0.95, 0, 1.6, 0.7, 2.6));
  g.add(mesh(ge.box, m.hay, 0, 1.45, -0.1, 1.3, 0.5, 2.0));
  const w1 = mesh(ge.cyl, m.wood, -0.95, 0.6, 0.2, 0.6, 0.18, 0.6); w1.rotation.z = Math.PI / 2;
  const w2 = mesh(ge.cyl, m.wood, 0.95, 0.6, 0.2, 0.6, 0.18, 0.6); w2.rotation.z = Math.PI / 2;
  g.add(w1); g.add(w2);
  g.add(mesh(ge.box, m.wood, -0.5, 0.75, 1.9, 0.12, 0.12, 1.6));
  g.add(mesh(ge.box, m.wood, 0.5, 0.75, 1.9, 0.12, 0.12, 1.6));
  if (withHorse) {
    const h = makeHorse();
    h.position.set(0, 0, 3.4);
    h.scale.setScalar(0.85);
    g.add(h);
    g.add(mesh(ge.box, m.wood, -0.4, 0.75, 2.7, 0.1, 0.1, 1.6));
    g.add(mesh(ge.box, m.wood, 0.4, 0.75, 2.7, 0.1, 0.1, 1.6));
  }
  g.userData.wheels = [w1, w2];
  g.userData.radius = 1.6;
  return g;
}
export function makeTrough() {
  const g = new THREE.Group();
  g.add(mesh(Assets.geo.box, Assets.mat.wood, 0, 0.35, 0, 2.6, 0.7, 0.9));
  const w = mesh(Assets.geo.box, Assets.mat.water, 0, 0.62, 0, 2.3, 0.1, 0.65);
  w.castShadow = false;
  g.add(w);
  g.userData.radius = 1.4;
  return g;
}
// Obra en curso: postes, un armazón que crece con el progreso y una pila de materiales.
export function makeScaffold(size) {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  const hw = size * 0.5;
  for (const sx of [-hw, hw]) for (const sz of [-hw, hw]) g.add(mesh(ge.box, m.woodLight, sx, 1.4, sz, 0.2, 2.8, 0.2));
  const frame = new THREE.Group();
  frame.add(mesh(ge.box, m.plaster, 0, 0.5, 0, size, 1, size));
  frame.scale.y = 0.05;
  g.add(frame);
  g.add(mesh(ge.box, m.wood, hw + 1.2, 0.35, 0, 0.7, 0.7, 1.8));
  g.add(mesh(ge.box, m.stone, hw + 1.2, 0.35, 1.8, 0.8, 0.7, 0.8));
  g.userData.frame = frame;
  g.userData.radius = size * 0.8;
  return g;
}
export function makeFeriaTents() {
  const g = new THREE.Group();
  const ge = Assets.geo;
  const spots = [[-5, -4], [5, -4.5], [-5.5, 4.5], [5.5, 4]];
  spots.forEach(([x, z], i) => {
    const col = Assets.tentColors[i % Assets.tentColors.length];
    g.add(mesh(ge.box, Assets.mat.wood, x, 1.2, z, 0.16, 2.4, 0.16));
    g.add(mesh(ge.cone6, col, x, 3.1, z, 2.6, 1.8, 2.6));
    g.add(mesh(ge.box, Assets.mat.wood, x, 0.5, z + 1.6, 2.2, 0.16, 0.9));
  });
  const poles = [[-7, 0], [7, 0], [0, -7], [0, 7]];
  for (const [x, z] of poles) g.add(mesh(ge.box, Assets.mat.wood, x, 2.0, z, 0.16, 4.0, 0.16));
  const runs = [[[-7, 0], [0, -7]], [[0, -7], [7, 0]], [[7, 0], [0, 7]], [[0, 7], [-7, 0]]];
  const perRun = 7;
  const flags = new THREE.InstancedMesh(ge.flag, Assets.mat.plaster, runs.length * perRun);
  let k = 0;
  for (const [a, b] of runs) {
    for (let i = 0; i < perRun; i++) {
      const t = (i + 0.5) / perRun;
      const sag = Math.sin(t * Math.PI) * 0.6;
      _dummy.position.set(lerp(a[0], b[0], t), 3.9 - sag, lerp(a[1], b[1], t));
      _dummy.rotation.set(Math.PI, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      flags.setMatrixAt(k, _dummy.matrix);
      flags.setColorAt(k, Assets.tentColors[k % Assets.tentColors.length].color);
      k++;
    }
  }
  flags.castShadow = false;
  g.add(flags);
  return g;
}
// Caballo: cuerpo, cuello inclinado con crin, cabeza, cola y cuatro patas. La cabeza baja al pastar.
export function makeHorse() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  const body = mesh(ge.box, m.horse, 0, 1.05, 0, 0.62, 0.62, 1.5);
  g.add(body);
  for (const [x, z] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]]) g.add(mesh(ge.box, m.horseDark, x, 0.4, z, 0.16, 0.8, 0.16));
  const head = new THREE.Group();
  head.position.set(0, 1.3, 0.7);
  const neck = mesh(ge.box, m.horse, 0, 0.3, 0.2, 0.3, 0.8, 0.34); neck.rotation.x = -0.6; neck.castShadow = false;
  const skull = mesh(ge.box, m.horse, 0, 0.62, 0.62, 0.26, 0.28, 0.6); skull.castShadow = false;
  const mane = mesh(ge.box, m.horseDark, 0, 0.55, 0.05, 0.1, 0.7, 0.3); mane.rotation.x = -0.6; mane.castShadow = false;
  const earL = mesh(ge.cone4, m.horseDark, -0.1, 0.82, 0.45, 0.06, 0.16, 0.06); earL.castShadow = false;
  const earR = mesh(ge.cone4, m.horseDark, 0.1, 0.82, 0.45, 0.06, 0.16, 0.06); earR.castShadow = false;
  head.add(neck, skull, mane, earL, earR);
  g.add(head);
  const tail = mesh(ge.box, m.horseDark, 0, 0.95, -0.85, 0.12, 0.6, 0.14); tail.rotation.x = 0.35; tail.castShadow = false;
  g.add(tail);
  g.userData.head = head; g.userData.body = body;
  return g;
}
export function makeDog() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  const body = mesh(ge.box, m.dog, 0, 0.42, 0, 0.3, 0.3, 0.75);
  g.add(body);
  for (const [x, z] of [[-0.1, 0.26], [0.1, 0.26], [-0.1, -0.26], [0.1, -0.26]]) g.add(mesh(ge.box, m.dogDark, x, 0.15, z, 0.09, 0.3, 0.09));
  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.42);
  const skull = mesh(ge.box, m.dog, 0, 0, 0, 0.28, 0.24, 0.3); skull.castShadow = false;
  const snout = mesh(ge.box, m.dogDark, 0, -0.05, 0.22, 0.14, 0.12, 0.18); snout.castShadow = false;
  const earL = mesh(ge.box, m.dogDark, -0.13, 0.1, -0.05, 0.08, 0.16, 0.06); earL.castShadow = false;
  const earR = mesh(ge.box, m.dogDark, 0.13, 0.1, -0.05, 0.08, 0.16, 0.06); earR.castShadow = false;
  head.add(skull, snout, earL, earR);
  g.add(head);
  const tail = mesh(ge.box, m.dog, 0, 0.6, -0.42, 0.07, 0.32, 0.07); tail.rotation.x = -0.6; tail.castShadow = false;
  g.add(tail);
  g.userData.head = head; g.userData.body = body;
  return g;
}
// Muelle: tablas sobre postes que se adentran en el lago, una barca amarrada y un cobertizo para el pescado.
export function makePier() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.woodLight, 0, 0.55, 4.5, 2.4, 0.16, 9.5));
  for (const z of [1, 4, 7, 9]) for (const x of [-1.0, 1.0]) g.add(mesh(ge.box, m.wood, x, -0.3, z, 0.22, 1.9, 0.22));
  for (const z of [2, 5, 8]) g.add(mesh(ge.box, m.wood, 1.2, 0.9, z, 0.1, 0.55, 0.1));
  g.add(mesh(ge.cyl, m.wood, -0.9, 0.85, 9.0, 0.28, 0.5, 0.28));
  const boat = new THREE.Group();
  boat.position.set(2.6, 0.15, 6.5);
  boat.add(mesh(ge.box, m.wood, 0, 0.2, 0, 1.2, 0.45, 2.8));
  boat.add(mesh(ge.box, m.woodLight, 0, 0.45, 0, 1.0, 0.08, 2.4));
  boat.add(mesh(ge.box, m.wood, 0, 0.3, 1.6, 0.6, 0.4, 0.6, Math.PI / 4));
  g.add(boat);
  g.add(mesh(ge.box, m.wood, -2.6, 1.0, 0.2, 2.6, 2.0, 2.2));
  g.add(mesh(ge.prism, m.thatch, -2.6, 2.0, 0.2, 3.2, 1.0, 2.8));
  g.add(mesh(ge.cyl, m.wood, -1.0, 0.45, -0.6, 0.35, 0.7, 0.35));
  g.userData.radius = 3.5;
  return g;
}
// Puente de tablas con barandas y estribos de piedra; cruza un arroyo por donde pasa un camino.
export function makeBridge(len) {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.woodLight, 0, 0.3, 0, 3.0, 0.22, len));
  for (const x of [-1.4, 1.4]) {
    g.add(mesh(ge.box, m.wood, x, 0.85, 0, 0.12, 0.1, len));
    for (const z of [-len / 2 + 0.3, 0, len / 2 - 0.3]) g.add(mesh(ge.box, m.wood, x, 0.6, z, 0.14, 0.7, 0.14));
  }
  g.add(mesh(ge.box, m.stoneDark, 0, 0.1, -len / 2, 3.4, 0.5, 0.8));
  g.add(mesh(ge.box, m.stoneDark, 0, 0.1, len / 2, 3.4, 0.5, 0.8));
  g.userData.radius = 0;
  return g;
}
// Ayuntamiento: soportales, dos plantas y torre del reloj con la bandera del concejo.
export function makeAyuntamiento() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 0.3, 0, 11.4, 0.6, 7.4));
  g.add(mesh(ge.box, m.stone, 0, 3.6, -0.6, 11, 6.6, 6));
  g.add(mesh(ge.prism, m.tile, 0, 6.9, -0.6, 12, 2.2, 7));
  for (const x of [-4.4, -2.2, 0, 2.2, 4.4]) g.add(mesh(ge.cyl, m.stone, x, 1.5, 3.2, 0.32, 3.0, 0.32));
  g.add(mesh(ge.box, m.stone, 0, 3.15, 3.2, 11, 0.3, 1.2));
  g.add(mesh(ge.box, m.wood, 0, 1.2, 2.45, 1.6, 2.4, 0.14));
  for (const x of [-3.6, 3.6]) addWindow(g, x, 1.6, 2.45, 1.0, 1.2);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) addWindow(g, x, 4.9, 2.45, 0.9, 1.3);
  g.add(mesh(ge.box, m.stone, 3.5, 9.5, -1.5, 2.6, 5.4, 2.6));
  g.add(mesh(ge.cone4, m.slate, 3.5, 13.2, -1.5, 2.2, 2.2, 2.2, Math.PI / 4));
  const clock = mesh(ge.cyl, m.plaster, 3.5, 10.6, -0.12, 0.8, 0.1, 0.8);
  clock.rotation.x = Math.PI / 2;
  g.add(clock);
  g.add(mesh(ge.box, m.dark, 3.5, 10.85, -0.02, 0.06, 0.55, 0.05));
  g.add(mesh(ge.box, m.wood, 3.5, 15.0, -1.5, 0.14, 1.6, 0.14));
  g.add(mesh(ge.box, Assets.roleColors.alcalde, 4.0, 15.5, -1.5, 1.0, 0.55, 0.06));
  g.userData.radius = 7;
  return g;
}
// Hospital: nave larga encalada con cruz en la fachada, dos chimeneas y bancos al sol.
export function makeHospital() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 0.3, 0, 12.4, 0.6, 6.4));
  g.add(mesh(ge.box, m.plaster, 0, 2.6, 0, 12, 4.6, 6));
  g.add(mesh(ge.prism, m.tile, 0, 4.9, 0, 13, 2.4, 7));
  g.add(mesh(ge.box, m.wood, 0, 1.2, 3.05, 1.8, 2.4, 0.14));
  for (const x of [-4.5, -2.6, 2.6, 4.5]) { addWindow(g, x, 1.6, 3.05, 0.9, 1.1); addWindow(g, x, 3.7, 3.05, 0.8, 0.9); }
  g.add(mesh(ge.box, m.cross, 0, 3.9, 3.1, 0.3, 1.2, 0.12));
  g.add(mesh(ge.box, m.cross, 0, 3.9, 3.1, 1.2, 0.3, 0.12));
  g.add(mesh(ge.box, m.stoneDark, -4, 6.6, -1.5, 0.8, 2.0, 0.8));
  g.add(mesh(ge.box, m.stoneDark, 4, 6.6, -1.5, 0.8, 2.0, 0.8));
  for (const x of [-3.2, 3.2]) g.add(mesh(ge.box, m.wood, x, 0.45, 4.6, 2.4, 0.16, 0.5));
  g.add(mesh(ge.prism, m.herb, 5.2, 2.0, 3.5, 2.4, 0.5, 1.4));
  g.userData.radius = 7;
  return g;
}
// Universidad: pórtico de columnas con frontón, escalinata y cúpula.
export function makeUniversidad() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 0.45, 0, 14.4, 0.9, 9.4));
  g.add(mesh(ge.box, m.marble, 0, 3.6, -0.5, 14, 5.4, 8));
  g.add(mesh(ge.prism, m.slate, 0, 6.3, -0.5, 15, 2.0, 9));
  for (const x of [-4.5, -2.25, 0, 2.25, 4.5]) g.add(mesh(ge.cyl, m.marble, x, 2.9, 4.2, 0.4, 4.8, 0.4));
  g.add(mesh(ge.box, m.marble, 0, 5.5, 4.2, 11, 0.6, 2.2));
  g.add(mesh(ge.prism, m.marble, 0, 5.8, 4.2, 11.6, 1.6, 2.6));
  for (let i = 0; i < 3; i++) g.add(mesh(ge.box, m.stone, 0, 0.75 + i * 0.3, 6.0 - i * 0.5, 8 - i * 0.6, 0.3, 1.2));
  g.add(mesh(ge.box, m.wood, 0, 1.9, 3.5, 2.0, 2.8, 0.14));
  for (const x of [-5, -3, 3, 5]) { addWindow(g, x, 2.0, 3.5, 0.9, 1.4); addWindow(g, x, 4.6, 3.5, 0.9, 1.2); }
  g.add(mesh(ge.cyl, m.marble, 0, 7.6, -1.5, 2.6, 1.4, 2.6));
  g.add(mesh(ge.sphere, m.slate, 0, 8.3, -1.5, 2.8, 2.4, 2.8));
  g.add(mesh(ge.box, m.gold, 0, 10.9, -1.5, 0.2, 1.0, 0.2));
  g.userData.radius = 8;
  return g;
}
// Fábrica: nave de ladrillo con tejado en dientes de sierra y chimenea que humea (parte dinámica).
export function makeFabrica() {
  const g = new THREE.Group();
  const m = Assets.mat, ge = Assets.geo;
  g.add(mesh(ge.box, m.stoneDark, 0, 0.3, 0, 14.4, 0.6, 9.4));
  g.add(mesh(ge.box, m.brick, 0, 3.3, 0, 14, 6, 9));
  for (const x of [-4.7, 0, 4.7]) g.add(mesh(ge.prism, m.slate, x, 6.3, 0, 4.9, 2.0, 9.4));
  g.add(mesh(ge.box, m.dark, 0, 1.6, 4.55, 3.0, 3.2, 0.14));
  for (const x of [-5, -2.5, 2.5, 5]) { addWindow(g, x, 3.6, 4.55, 1.2, 1.8); addWindow(g, x, 3.6, -4.55, 1.2, 1.8); }
  g.add(mesh(ge.cyl, m.brick, 5.2, 9, -2.8, 1.0, 12, 1.0));
  g.add(mesh(ge.cyl, m.dark, 5.2, 15.1, -2.8, 1.15, 0.4, 1.15));
  const smoke = new THREE.Group();
  smoke.userData.dynamic = true;
  smoke.position.set(5.2, 15.5, -2.8);
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const s = mesh(ge.sphereLow, m.smoke, 0, i * 1.5, 0, 0.8 + i * 0.35, 0.7 + i * 0.3, 0.8 + i * 0.35);
    s.castShadow = false;
    smoke.add(s);
    puffs.push(s);
  }
  g.add(smoke);
  g.userData.smoke = puffs;
  g.add(mesh(ge.box, m.wood, -8.2, 0.6, 2.5, 1.6, 0.9, 2.4));
  g.add(mesh(ge.box, Assets.resourceColors.mineral, -8.2, 1.25, 2.5, 1.3, 0.5, 2.0));
  g.userData.radius = 8.5;
  return g;
}
export function randomRotation() { return rand(0, TAU); }
