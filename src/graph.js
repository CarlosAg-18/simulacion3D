import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, chance } from './utils.js';
import { baseHeight, RoadField, addFootprint, terrainHeight } from './terrain.js';

export const NODE_DEFS = [
  { id: 'plaza', x: 0, z: 0, area: 8 },
  { id: 'mercado', x: 21, z: -9, area: 6 },
  { id: 'iglesia', x: -25, z: -17, area: 3 },
  { id: 'castillo', x: 3, z: -46, area: 4 },
  { id: 'casa1', x: 25, z: 22, area: 2.5 },
  { id: 'casa2', x: -22, z: 25, area: 2.5 },
  { id: 'casa3', x: -39, z: 3, area: 2.5 },
  { id: 'casa4', x: 36, z: 5, area: 2.5 },
  { id: 'mina', x: 58, z: -33, area: 4 },
  { id: 'taberna', x: -7, z: 27, area: 4 },
  { id: 'granja', x: -48, z: 42, area: 4 },
  { id: 'almacen', x: 38, z: -23, area: 3 },
  { id: 'bosque', x: -60, z: -40, area: 3 },
  { id: 'lago', x: 44, z: 50, area: 3 },
  { id: 'norte', x: -6, z: -97, area: 0, edge: true, label: 'del norte' },
  { id: 'sur', x: 12, z: 97, area: 0, edge: true, label: 'del sur' },
  { id: 'este', x: 97, z: 9, area: 0, edge: true, label: 'del este' },
  { id: 'oeste', x: -97, z: -12, area: 0, edge: true, label: 'del oeste' }
];
export const EDGE_DEFS = [
  ['plaza', 'mercado'], ['plaza', 'iglesia'], ['plaza', 'taberna'], ['plaza', 'castillo'],
  ['plaza', 'casa1'], ['plaza', 'casa2'], ['iglesia', 'casa3'], ['mercado', 'casa4'],
  ['mercado', 'almacen'], ['almacen', 'mina'], ['mina', 'este'], ['castillo', 'norte'],
  ['taberna', 'granja'], ['granja', 'oeste'], ['casa1', 'sur'], ['casa2', 'taberna'],
  ['casa3', 'granja'], ['casa4', 'este'], ['iglesia', 'castillo'], ['casa1', 'mercado'],
  ['casa3', 'bosque'], ['iglesia', 'bosque'], ['casa1', 'lago']
];
export const BORDER_NODES = NODE_DEFS.filter(n => n.edge).map(n => n.id);

export const Graph = {
  nodes: [], index: {}, edges: [], poly: {}, dist: [], next: [],
  node(id) { return this.nodes[this.index[id]]; },
  addNode(d) {
    const n = { id: d.id, x: d.x, z: d.z, area: d.area || 0, edge: !!d.edge, label: d.label || '', pos: new THREE.Vector3(d.x, 0, d.z) };
    this.index[d.id] = this.nodes.length;
    this.nodes.push(n);
    this.poly[d.id] = {};
    if (n.area > 0) this.paintArea(n);
    return n;
  },
  // Explanadas de plaza, mercado y puertas: se pintan de tierra y se aplanan como un camino ancho.
  paintArea(n) {
    const h = baseHeight(n.x, n.z), r = n.area;
    for (let x = -r; x <= r; x += 1.5) for (let z = -r; z <= r; z += 1.5) {
      if (x * x + z * z <= r * r) RoadField.insert({ x: n.x + x, z: n.z + z, h });
    }
    addFootprint(n.x, n.z, r, 4);
  },
  // Uno o dos puntos de control desplazados lateralmente dan la curvatura irregular del camino.
  // Los desplazamientos se guardan en la arista para poder reproducirla al cargar una partida.
  addEdge(a, b, offsets) {
    const A = this.node(a), B = this.node(b);
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len, nz = dx / len;
    if (!offsets) {
      const nCtrl = len > 45 ? 2 : 1;
      offsets = [];
      for (let i = 0; i < nCtrl; i++) offsets.push(rand(CONFIG.road.wobbleMin, CONFIG.road.wobbleMax) * (chance(0.5) ? 1 : -1) * Math.min(1, len / 40));
    }
    const ctrl = [new THREE.Vector3(A.x, 0, A.z)];
    offsets.forEach((off, i) => {
      const t = (i + 1) / (offsets.length + 1);
      ctrl.push(new THREE.Vector3(A.x + dx * t + nx * off, 0, A.z + dz * t + nz * off));
    });
    ctrl.push(new THREE.Vector3(B.x, 0, B.z));
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const count = Math.max(4, Math.ceil(curve.getLength() / CONFIG.road.sampleSpacing));
    const pts = curve.getSpacedPoints(count);
    const samples = pts.map(p => ({ x: p.x, z: p.z, h: baseHeight(p.x, p.z) }));
    // Suavizado de la altura a lo largo del camino para que no ondule con cada cresta del ruido.
    const raw = samples.map(s => s.h);
    for (let i = 0; i < samples.length; i++) {
      let sum = 0, cnt = 0;
      for (let k = -6; k <= 6; k++) { const j = i + k; if (j >= 0 && j < raw.length) { sum += raw[j]; cnt++; } }
      samples[i].h = sum / cnt;
    }
    samples.forEach(s => RoadField.insert(s));
    const fwd = samples.map(s => new THREE.Vector3(s.x, 0, s.z));
    const back = fwd.slice().reverse();
    let length = 0;
    for (let i = 1; i < fwd.length; i++) length += fwd[i].distanceTo(fwd[i - 1]);
    const edge = { a, b, length, pts: fwd, offsets };
    this.edges.push(edge);
    this.poly[a][b] = fwd; this.poly[b][a] = back;
    return edge;
  },
  build() {
    for (const d of NODE_DEFS) this.addNode(d);
    for (const [a, b] of EDGE_DEFS) this.addEdge(a, b);
    this.computeRoutes();
  },
  // Floyd-Warshall: con menos de 40 nodos la tabla completa se calcula en un instante y la ruta es O(1).
  computeRoutes() {
    const n = this.nodes.length;
    const D = [], N = [];
    for (let i = 0; i < n; i++) {
      D.push(new Array(n).fill(Infinity)); N.push(new Array(n).fill(-1));
      D[i][i] = 0;
    }
    for (const e of this.edges) {
      const i = this.index[e.a], j = this.index[e.b];
      D[i][j] = e.length; D[j][i] = e.length; N[i][j] = j; N[j][i] = i;
    }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (D[i][k] + D[k][j] < D[i][j]) { D[i][j] = D[i][k] + D[k][j]; N[i][j] = N[i][k]; }
    }
    this.dist = D; this.next = N;
  },
  routeDist(a, b) { return this.dist[this.index[a]][this.index[b]]; },
  route(a, b) {
    let i = this.index[a];
    const j = this.index[b];
    const out = [a];
    while (i !== j) {
      i = this.next[i][j];
      if (i < 0) break;
      out.push(this.nodes[i].id);
    }
    return out;
  },
  nearestNode(x, z, excludeBorders) {
    let best = null, bestD = Infinity;
    for (const n of this.nodes) {
      if (excludeBorders && n.edge) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  },
  updateHeights() {
    for (const n of this.nodes) n.pos.y = terrainHeight(n.x, n.z);
    for (const e of this.edges) for (const p of e.pts) p.y = terrainHeight(p.x, p.z);
  }
};
