import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Render } from './state.js';
import { Assets } from './assets.js';

// Todos los habitantes se dibujan con nueve InstancedMesh (cuerpo, cabeza, brazos, tocados y fardo).
// Cada agente ocupa una ranura y escribe sus matrices por frame; ocultar es poner escala cero.
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _base = new THREE.Matrix4(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _h = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _o = new THREE.Vector3();
const HATS = {
  hair: { offset: [0, 0.08, -0.04], scale: [0.26, 0.2, 0.26] },
  helm: { offset: [0, 0.2, 0], scale: [0.3, 0.3, 0.3] },
  hat: { offset: [0, 0.22, 0], scale: [0.2, 0.14, 0.2] },
  brim: { offset: [0, 0.18, 0], scale: [0.42, 0.06, 0.42] },
  crown: { offset: [0, 0.24, 0], scale: [0.24, 0.12, 0.24] }
};
export const AgentRenderer = {
  parts: {}, free: [], capacity: 0, colorDirty: false,
  init() {
    const N = CONFIG.render.agentCapacity;
    this.capacity = N;
    const g = Assets.geo, m = Assets.mat;
    const mk = (geo, mat, shadow) => {
      const im = new THREE.InstancedMesh(geo, mat, N);
      im.castShadow = shadow;
      im.receiveShadow = false;
      im.frustumCulled = false;
      for (let i = 0; i < N; i++) im.setMatrixAt(i, ZERO);
      Render.scene.add(im);
      return im;
    };
    this.parts.body = mk(g.body, m.cloth, true);
    this.parts.head = mk(g.head, m.skin, false);
    this.parts.armL = mk(g.arm, m.cloth, false);
    this.parts.armR = mk(g.arm, m.cloth, false);
    this.parts.hair = mk(g.sphere, m.hair, false);
    this.parts.helm = mk(g.cone, m.metal, false);
    this.parts.hat = mk(g.cyl, m.dark, false);
    this.parts.brim = mk(g.cyl, m.wood, false);
    this.parts.crown = mk(g.cyl, m.gold, false);
    this.parts.pack = mk(g.pack, m.packWhite, false);
    const white = new THREE.Color(0xFFFFFF);
    for (let i = 0; i < N; i++) {
      this.parts.body.setColorAt(i, white); this.parts.armL.setColorAt(i, white);
      this.parts.armR.setColorAt(i, white); this.parts.pack.setColorAt(i, white);
    }
    for (let i = N - 1; i >= 0; i--) this.free.push(i);
  },
  hasRoom(n) { return this.free.length >= (n || 1); },
  alloc() { return this.free.length ? this.free.pop() : -1; },
  release(i) {
    if (i < 0) return;
    this.hide(i);
    this.free.push(i);
  },
  hide(i) {
    for (const k in this.parts) this.parts[k].setMatrixAt(i, ZERO);
  },
  setColors(i, cloth) {
    if (i < 0) return;
    this.parts.body.setColorAt(i, cloth);
    this.parts.armL.setColorAt(i, cloth);
    this.parts.armR.setColorAt(i, cloth);
    this.colorDirty = true;
  },
  setPackColor(i, color) {
    if (i < 0) return;
    this.parts.pack.setColorAt(i, color);
    this.colorDirty = true;
  },
  write(a) {
    const i = a.slot;
    if (i < 0) return;
    if (!a.visible) { this.hide(i); return; }
    const P = this.parts;
    _e.set(0, a.heading, a.sway);
    _q.setFromEuler(_e);
    _s.set(a.scale, a.scale, a.scale);
    _base.compose(a.pos, _q, _s);
    _t.makeTranslation(0, 0.58 + a.bob, 0);
    _m.multiplyMatrices(_base, _t);
    P.body.setMatrixAt(i, _m);
    _t.makeTranslation(0, a.headY, 0);
    _h.multiplyMatrices(_base, _t);
    _e.set(a.headNod, 0, 0);
    _t.makeRotationFromEuler(_e);
    _h.multiply(_t);
    P.head.setMatrixAt(i, _h);
    const hat = HATS[a.hatKind];
    _o.set(hat.offset[0], hat.offset[1], hat.offset[2]);
    _s.set(hat.scale[0], hat.scale[1], hat.scale[2]);
    _t.compose(_o, _qi, _s);
    _m.multiplyMatrices(_h, _t);
    P[a.hatKind].setMatrixAt(i, _m);
    for (const side of [-1, 1]) {
      _t.makeTranslation(side * 0.46, 1.12, 0);
      _m.multiplyMatrices(_base, _t);
      _e.set(side * a.armSwing, 0, 0);
      _t.makeRotationFromEuler(_e);
      _m.multiply(_t);
      _t.makeTranslation(0, -0.3, 0);
      _m.multiply(_t);
      (side < 0 ? P.armL : P.armR).setMatrixAt(i, _m);
    }
    if (a.packVisible) {
      _t.makeTranslation(0, 1.0, -0.42);
      _m.multiplyMatrices(_base, _t);
      P.pack.setMatrixAt(i, _m);
    } else P.pack.setMatrixAt(i, ZERO);
  },
  flush() {
    for (const k in this.parts) {
      const p = this.parts[k];
      p.instanceMatrix.needsUpdate = true;
      if (this.colorDirty && p.instanceColor) p.instanceColor.needsUpdate = true;
    }
    this.colorDirty = false;
  }
};
