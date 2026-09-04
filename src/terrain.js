import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { rand, lerp, smoothstep, clamp, hex, _c1, _c2 } from './utils.js';

// Ruido de valor: hash entero -> [0,1), interpolado con curva suave; tres octavas dan colinas blandas.
const NOISE_OFF = { x: 0, z: 0 };
export function initNoise() {
  NOISE_OFF.x = rand(0, 5000);
  NOISE_OFF.z = rand(0, 5000);
}
function hash2(ix, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
export function fbm(x, z, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5; freq *= 2.1;
  }
  return sum / norm;
}
export function baseHeight(x, z) {
  const s = CONFIG.map.noiseScale;
  return fbm((x + NOISE_OFF.x) * s, (z + NOISE_OFF.z) * s, 3) * CONFIG.map.hillAmplitude;
}

export const Terrain = {
  size: CONFIG.map.size,
  segs: CONFIG.map.segments,
  half: CONFIG.map.size / 2,
  step: CONFIG.map.size / CONFIG.map.segments,
  heights: new Float32Array((CONFIG.map.segments + 1) * (CONFIG.map.segments + 1)),
  mesh: null,
  footprints: []
};
// Altura exacta del campo ya aplanado, por interpolación bilineal de la rejilla que usa la malla.
export function terrainHeight(x, z) {
  const n = Terrain.segs;
  const gx = clamp((x + Terrain.half) / Terrain.step, 0, n - 0.0001);
  const gz = clamp((z + Terrain.half) / Terrain.step, 0, n - 0.0001);
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const w = n + 1;
  const h00 = Terrain.heights[iz * w + ix], h10 = Terrain.heights[iz * w + ix + 1];
  const h01 = Terrain.heights[(iz + 1) * w + ix], h11 = Terrain.heights[(iz + 1) * w + ix + 1];
  return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
}
export function addFootprint(x, z, radius, blend) {
  Terrain.footprints.push({ x, z, r: radius, blend: blend === undefined ? 3 : blend, h: baseHeight(x, z) });
}
// Rejilla de celdas para consultar el punto de camino más cercano sin recorrer todos los muestreos.
export const RoadField = {
  cell: 8, buckets: new Map(),
  key(cx, cz) { return cx * 4096 + cz; },
  insert(p) {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
    let b = this.buckets.get(k);
    if (!b) { b = []; this.buckets.set(k, b); }
    b.push(p);
  },
  nearest(x, z, out) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = Infinity, bestP = null;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const b = this.buckets.get(this.key(cx + dx, cz + dz));
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const p = b[i];
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < best) { best = d; bestP = p; }
      }
    }
    out.d = Math.sqrt(best); out.p = bestP;
    return out;
  }
};
export const _near = { d: 0, p: null };

const grass = hex(PALETTE.grass), grassD = hex(PALETTE.grassDark), grassL = hex(PALETTE.grassLight);
const dirt = hex(PALETTE.dirt), dirtD = hex(PALETTE.dirtDark);
// Rellena alturas y colores de la rejilla a partir del ruido, las huellas y los caminos actuales.
function computeTerrain(pos, colors) {
  const n = Terrain.segs, w = n + 1, half = Terrain.half, step = Terrain.step;
  const roadHalf = CONFIG.road.width * 0.5, roadBlend = CONFIG.road.blend;
  for (let iz = 0; iz < w; iz++) {
    for (let ix = 0; ix < w; ix++) {
      const i = iz * w + ix;
      const x = -half + ix * step, z = -half + iz * step;
      let h = baseHeight(x, z);
      for (let f = 0; f < Terrain.footprints.length; f++) {
        const fp = Terrain.footprints[f];
        const d = Math.hypot(x - fp.x, z - fp.z);
        if (d < fp.r + fp.blend) h = lerp(fp.h, h, smoothstep(fp.r, fp.r + fp.blend, d));
      }
      RoadField.nearest(x, z, _near);
      let roadMix = 0;
      if (_near.p) {
        const wr = 1 - smoothstep(roadHalf, roadHalf + roadBlend, _near.d);
        h = lerp(h, _near.p.h, wr * 0.9);
        roadMix = 1 - smoothstep(roadHalf * 0.75, roadHalf + roadBlend * 0.55, _near.d);
      }
      Terrain.heights[i] = h;
      pos.setXYZ(i, x, h, z);
      const gn = fbm((x + 900) * 0.08, (z + 900) * 0.08, 2);
      if (gn < 0.42) _c1.lerpColors(grassD, grass, gn / 0.42); else _c1.lerpColors(grass, grassL, (gn - 0.42) / 0.58);
      const dn = valueNoise(x * 0.35, z * 0.35);
      _c2.lerpColors(dirt, dirtD, dn);
      _c1.lerp(_c2, roadMix);
      colors.setXYZ(i, _c1.r, _c1.g, _c1.b);
    }
  }
}
export function buildTerrain(scene) {
  const n = Terrain.segs;
  const geo = new THREE.PlaneGeometry(Terrain.size, Terrain.size, n, n);
  const colors = new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3);
  geo.setAttribute('color', colors);
  computeTerrain(geo.attributes.position, colors);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  Terrain.mesh = mesh;
}
// Tras una construcción nueva se recalculan alturas y colores sobre los mismos búferes.
export function rebuildTerrain() {
  const geo = Terrain.mesh.geometry;
  computeTerrain(geo.attributes.position, geo.attributes.color);
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}
