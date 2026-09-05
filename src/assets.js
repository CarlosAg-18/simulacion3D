import * as THREE from 'three';
import { PALETTE } from './config.js';

export const Assets = { geo: {}, mat: {}, tentColors: [], roleColors: {}, resourceColors: {} };

function makePrismGeometry() {
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5,
    -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
    -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, -0.5,
    -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(v.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}
export function std(color, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.9, metalness: 0 }, extra || {}));
}
export function initAssets() {
  const g = Assets.geo, m = Assets.mat;
  g.box = new THREE.BoxGeometry(1, 1, 1);
  g.cone = new THREE.ConeGeometry(1, 1, 8);
  g.cone4 = new THREE.ConeGeometry(1, 1, 4);
  g.cone6 = new THREE.ConeGeometry(1, 1, 6);
  g.cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  g.cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
  g.cylTop = new THREE.CylinderGeometry(0.85, 1, 1, 8);
  g.sphere = new THREE.SphereGeometry(1, 8, 6);
  g.sphereLow = new THREE.SphereGeometry(1, 6, 5);
  g.ico = new THREE.IcosahedronGeometry(1, 0);
  g.prism = makePrismGeometry();
  g.flag = new THREE.ConeGeometry(0.28, 0.55, 3);
  g.crop = new THREE.ConeGeometry(0.28, 0.9, 5);
  g.body = new THREE.ConeGeometry(0.42, 1.15, 7);
  g.head = new THREE.SphereGeometry(0.27, 8, 6);
  g.arm = new THREE.BoxGeometry(0.14, 0.62, 0.14);
  g.pack = new THREE.BoxGeometry(0.42, 0.34, 0.3);

  m.stone = std(PALETTE.stone); m.stoneDark = std(PALETTE.stoneDark);
  m.thatch = std(PALETTE.thatch); m.tile = std(PALETTE.tile); m.wood = std(PALETTE.wood);
  m.woodLight = std(0x9C7A55);
  m.plaster = std(0xD8CDB4); m.plasterWarm = std(0xE3D2B3);
  m.water = std(PALETTE.water, { roughness: 0.4 });
  m.dirt = std(PALETTE.dirtDark);
  m.leaf1 = std(PALETTE.leaf1); m.leaf2 = std(PALETTE.leaf2); m.leaf3 = std(PALETTE.leaf3);
  m.rock = std(PALETTE.stone); m.hay = std(0xD9B95C); m.metal = std(0x5E6670, { roughness: 0.6 });
  m.bell = std(0xB08D3C, { roughness: 0.5 });
  m.dark = std(0x24201C);
  m.window = new THREE.MeshStandardMaterial({ color: 0x3A3F4B, emissive: PALETTE.window, emissiveIntensity: 0, flatShading: true, roughness: 0.6 });
  m.skin = std(0xE8B48C); m.hair = std(0x4A3223);
  m.chicken = std(0xF1EDE0); m.chickenRed = std(0xC43A2E); m.beak = std(0xE5A13B);
  m.pig = std(0xE8A2A2); m.pigDark = std(0xD08585);
  m.sun = new THREE.MeshBasicMaterial({ color: 0xFFE9A8, fog: false });
  m.moon = new THREE.MeshBasicMaterial({ color: 0xD8E0F2, fog: false });
  m.rain = new THREE.PointsMaterial({ color: 0xA9C0D8, size: 0.32, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
  m.canopy = std(0xFFFFFF);
  m.crop = std(0xFFFFFF);
  m.cloth = std(0xFFFFFF);
  m.packWhite = std(0xFFFFFF);
  m.wolf = std(0x6B6B70); m.wolfDark = std(0x3E3E44);
  m.flame = new THREE.MeshStandardMaterial({ color: 0xFF7A1F, emissive: 0xFF6A00, emissiveIntensity: 2.2, flatShading: true, transparent: true, opacity: 0.9 });
  m.flameCore = new THREE.MeshStandardMaterial({ color: 0xFFE070, emissive: 0xFFC040, emissiveIntensity: 2.5, flatShading: true });
  m.smoke = std(0x5A5550, { transparent: true, opacity: 0.55 });
  m.herb = std(0x5E9E58);
  Assets.tentColors = [std(0xB94A48), std(0x3F6F9E), std(0xC9A227), std(0x5B8C5A), std(0x8E4C8E), std(0xD07A3C)];
  Assets.roleColors = {
    agricultor: std(0x7A8F3C), comerciante: std(0x8E4C8E), minero: std(0x55606B), lenador: std(0x3E7A6B),
    aldeano: std(0xB0653A), clerigo: std(0xE7DCC3), guardia: std(0xA03A3A), viajero: std(0x3E6F8E), nino: std(0xD08A5A),
    curandero: std(0x4F8C8C), sabio: std(0x3E4E8E), senor: std(0x6E2E7A), alcalde: std(0x2E5E7A), pescador: std(0x3E7A8E)
  };
  Assets.resourceColors = { grano: std(0xE0C060), madera: std(0x8B5E3C), piedra: std(0x8E8B84), mineral: std(0x4A5566), hierro: std(0x8A4A3A), oro: std(0xE0B030) };
  m.gold = std(0xE0B030, { roughness: 0.4 });
  m.iron = std(0x8A4A3A);
  m.lantern = new THREE.MeshStandardMaterial({ color: 0x5A4A30, emissive: 0xFFB050, emissiveIntensity: 0, flatShading: true, roughness: 0.6 });
  m.sail = std(0xEDE4D3);
  m.lake = new THREE.MeshStandardMaterial({ color: 0x3A6E92, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.05, flatShading: true });
  m.horse = std(0x6B4A2E); m.horseDark = std(0x3A2A1C);
  m.dog = std(0xC9A66B); m.dogDark = std(0x6A4A2A);
  m.brick = std(0x8A4B3A); m.slate = std(0x5E6470);
  m.marble = std(0xE9E4D6, { roughness: 0.6 });
  m.cross = std(0xC43A2E);
}
export function mesh(geo, mat, x, y, z, sx, sy, sz, ry) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  if (ry) o.rotation.y = ry;
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
export function addWindow(group, x, y, z, w, h, ry) {
  const o = mesh(Assets.geo.box, Assets.mat.window, x, y, z, w, h, 0.12, ry);
  o.castShadow = false;
  group.add(o);
  return o;
}
