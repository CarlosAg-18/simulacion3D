import * as THREE from 'three';
import { CONFIG } from './config.js';

// mulberry32 con estado expuesto: se puede sembrar de nuevo y guardar/restaurar su estado interno.
export const Rng = {
  a: 0,
  seedValue: 0,
  seed(s) { this.seedValue = s; this.a = s | 0; },
  next() {
    this.a = this.a + 0x6D2B79F5 | 0;
    let t = Math.imul(this.a ^ this.a >>> 15, 1 | this.a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  },
  getState() { return this.a; },
  setState(a) { this.a = a | 0; }
};
// Único uso de Math.random del proyecto: elegir semilla cuando CONFIG.seed es null y no hay partida guardada.
Rng.seed(CONFIG.seed === null ? Math.floor(Math.random() * 2147483647) : CONFIG.seed);

export const rng = () => Rng.next();
export const rand = (a, b) => a + Rng.next() * (b - a);
export const randInt = (a, b) => Math.floor(a + Rng.next() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Rng.next() * arr.length)];
export const chance = (p) => Rng.next() < p;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function weightedPick(weights, exclude, bias) {
  let total = 0;
  const w = {};
  for (const k in weights) {
    if (k === exclude) continue;
    w[k] = weights[k] * (bias && bias[k] !== undefined ? bias[k] : 1);
    total += w[k];
  }
  let r = Rng.next() * total;
  for (const k in w) {
    r -= w[k];
    if (r <= 0) return k;
  }
  for (const k in w) return k;
  return null;
}
export function hex(h) { return new THREE.Color(h); }

// Temporales preasignados: nunca se crean vectores dentro del bucle de render.
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _c1 = new THREE.Color();
export const _c2 = new THREE.Color();
export const _c3 = new THREE.Color();
export const _dummy = new THREE.Object3D();
