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

// Cuerpos de agua: lagos elípticos y arroyos como polilíneas muestreadas. No usan el RNG.
export const Water = { level: CONFIG.water.level, lakes: [], streams: [], mesh: null, rise: 0, riseTarget: 0 };
export function initWater() {
  Water.lakes = CONFIG.water.lakes.map(l => Object.assign({}, l));
  Water.streams = CONFIG.water.streams.map(s => {
    const curve = new THREE.CatmullRomCurve3(s.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const pts = curve.getSpacedPoints(Math.max(4, Math.ceil(curve.getLength() / 2)));
    return { pts: pts.map(p => ({ x: p.x, z: p.z })), width: s.width, depth: s.depth };
  });
}
// Peso de excavación (0 fuera, 1 dentro, suave en la orilla) y fondo objetivo del cuerpo de agua más cercano.
export const _carve = { k: 0, bottom: 0 };
export function waterCarve(x, z, out) {
  out.k = 0; out.bottom = 0;
  for (let i = 0; i < Water.lakes.length; i++) {
    const l = Water.lakes[i];
    const dn = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz);
    if (dn >= 1.4) continue;
    const w = 1 - smoothstep(0.85, 1.4, dn);
    if (w > out.k) { out.k = w; out.bottom = Water.level - l.depth; }
  }
  for (let i = 0; i < Water.streams.length; i++) {
    const s = Water.streams[i];
    let best = Infinity;
    for (let j = 0; j < s.pts.length; j++) {
      const p = s.pts[j];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < best) best = d;
    }
    const w = 1 - smoothstep(s.width * 0.5, s.width * 0.5 + 3.0, Math.sqrt(best));
    if (w > out.k) { out.k = w; out.bottom = Water.level - s.depth; }
  }
  return out;
}
export function isWater(x, z) { return waterCarve(x, z, _carve).k > 0.35; }
// Distancia de un punto al eje de un arroyo (para puentes y para saber si una obra cae sobre el agua).
export function streamDistance(x, z) {
  let best = Infinity;
  for (const s of Water.streams) for (const p of s.pts) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
  return best;
}

const grass = hex(PALETTE.grass), grassD = hex(PALETTE.grassDark), grassL = hex(PALETTE.grassLight);
const DIRT = hex(PALETTE.dirt), DIRT_D = hex(PALETTE.dirtDark), COBBLE = hex(0x9C9A94), COBBLE_D = hex(0x74726C), PAVING = hex(0x6A6866), PAVING_D = hex(0x504E4C);
const SAND = hex(0xC8B78A), MUD = hex(0x4E5A48);
// Los caminos cambian de aspecto con la etapa histórica: tierra, empedrado, adoquín.
const dirt = DIRT.clone(), dirtD = DIRT_D.clone();
export function setRoadStyle(mix, paving) {
  dirt.lerpColors(DIRT, paving ? PAVING : COBBLE, mix);
  dirtD.lerpColors(DIRT_D, paving ? PAVING_D : COBBLE_D, mix);
  if (Terrain.mesh) rebuildTerrain();
}
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
      waterCarve(x, z, _carve);
      if (_carve.k > 0) h = lerp(h, _carve.bottom, _carve.k);
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
      // Orilla de arena y fondo de limo bajo el agua.
      if (h < Water.level + 0.5) {
        _c1.lerp(SAND, smoothstep(Water.level + 0.5, Water.level - 0.3, h) * (1 - roadMix * 0.7));
        _c1.lerp(MUD, smoothstep(Water.level - 0.2, Water.level - 1.0, h));
      }
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
