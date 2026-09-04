import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, pick, lerp, angleDelta, TAU } from './utils.js';
import { Render, World, animals, agents, Sim } from './state.js';
import { Assets, mesh } from './assets.js';
import { terrainHeight, RoadField, _near } from './terrain.js';
import { Graph, BORDER_NODES } from './graph.js';
import { Weather } from './weather.js';
import { HUD } from './hud.js';
import { spotIsClear } from './world.js';

function buildChicken() {
  const g = new THREE.Group();
  const ge = Assets.geo, m = Assets.mat;
  const body = mesh(ge.sphereLow, m.chicken, 0, 0.34, 0, 0.32, 0.27, 0.42);
  g.add(body);
  const tail = mesh(ge.cone4, m.chicken, 0, 0.5, -0.4, 0.14, 0.3, 0.14);
  tail.rotation.x = -0.9; tail.castShadow = false;
  g.add(tail);
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.28);
  const skull = mesh(ge.sphereLow, m.chicken, 0, 0, 0, 0.15, 0.15, 0.15); skull.castShadow = false;
  const beak = mesh(ge.cone4, m.beak, 0, -0.02, 0.18, 0.06, 0.14, 0.06); beak.rotation.x = Math.PI / 2; beak.castShadow = false;
  const comb = mesh(ge.box, m.chickenRed, 0, 0.14, -0.02, 0.05, 0.1, 0.16); comb.castShadow = false;
  head.add(skull, beak, comb);
  g.add(head);
  g.userData.head = head; g.userData.body = body;
  return g;
}
function buildPig() {
  const g = new THREE.Group();
  const ge = Assets.geo, m = Assets.mat;
  const body = mesh(ge.box, m.pig, 0, 0.42, 0, 0.95, 0.52, 0.55);
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.62);
  const skull = mesh(ge.box, m.pig, 0, 0, 0, 0.42, 0.4, 0.4); skull.castShadow = false;
  const snout = mesh(ge.cyl6, m.pigDark, 0, -0.06, 0.25, 0.13, 0.12, 0.13); snout.rotation.x = Math.PI / 2; snout.castShadow = false;
  const earL = mesh(ge.box, m.pigDark, -0.16, 0.22, -0.05, 0.1, 0.14, 0.06); earL.castShadow = false;
  const earR = mesh(ge.box, m.pigDark, 0.16, 0.22, -0.05, 0.1, 0.14, 0.06); earR.castShadow = false;
  head.add(skull, snout, earL, earR);
  g.add(head);
  g.userData.head = head; g.userData.body = body;
  return g;
}
function buildWolf() {
  const g = new THREE.Group();
  const ge = Assets.geo, m = Assets.mat;
  const body = mesh(ge.box, m.wolf, 0, 0.55, 0, 1.1, 0.42, 0.4);
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.7);
  const skull = mesh(ge.box, m.wolf, 0, 0, 0, 0.38, 0.32, 0.4); skull.castShadow = false;
  const snout = mesh(ge.box, m.wolfDark, 0, -0.06, 0.3, 0.2, 0.18, 0.28); snout.castShadow = false;
  const earL = mesh(ge.cone4, m.wolfDark, -0.13, 0.24, -0.08, 0.08, 0.2, 0.08); earL.castShadow = false;
  const earR = mesh(ge.cone4, m.wolfDark, 0.13, 0.24, -0.08, 0.08, 0.2, 0.08); earR.castShadow = false;
  head.add(skull, snout, earL, earR);
  g.add(head);
  const tail = mesh(ge.cone4, m.wolfDark, 0, 0.6, -0.7, 0.12, 0.5, 0.12);
  tail.rotation.x = 1.2; tail.castShadow = false;
  g.add(tail);
  g.userData.head = head; g.userData.body = body;
  return g;
}
export class Animal {
  constructor(kind, anchor) {
    this.kind = kind;
    this.group = kind === 'gallina' ? buildChicken() : buildPig();
    this.pos = this.group.position;
    this.baseAnchor = anchor.clone();
    this.target = new THREE.Vector3();
    this.heading = rand(0, TAU);
    this.targetHeading = this.heading;
    this.speed = CONFIG.animals.speed * (kind === 'gallina' ? 1.1 : 0.8);
    this.state = 'peck';
    this.timer = rand(0.5, 2);
    this.phase = rand(0, TAU);
    this.removed = false;
    this.pos.set(anchor.x + rand(-2, 2), 0, anchor.z + rand(-2, 2));
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    let best = null, bestD = Infinity;
    for (const s of World.shelters) {
      const d = s.door.distanceTo(anchor);
      if (d < bestD) { bestD = d; best = s; }
    }
    this.rainAnchor = best.door.clone();
    this.group.scale.setScalar(kind === 'gallina' ? rand(0.85, 1.1) : rand(0.9, 1.2));
    Render.scene.add(this.group);
    animals.push(this);
  }
  pickTarget() {
    const scared = Weather.isWet || wolves.length > 0;
    const anchor = scared ? this.rainAnchor : this.baseAnchor;
    const radius = scared ? CONFIG.animals.rainRadius : CONFIG.animals.wanderRadius;
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU), d = rand(0.8, radius);
      const x = anchor.x + Math.cos(a) * d, z = anchor.z + Math.sin(a) * d;
      RoadField.nearest(x, z, _near);
      const onRoad = _near.p && _near.d < CONFIG.road.width * 0.5 && !scared;
      if (!onRoad && spotIsClear(x, z, 0.5)) { this.target.set(x, 0, z); return true; }
    }
    return false;
  }
  remove() {
    this.removed = true;
    Render.scene.remove(this.group);
  }
  update(dt) {
    const u = this.group.userData;
    if (this.state === 'walk') {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * (wolves.length > 0 ? 1.8 : 1) * dt;
      if (d <= step) {
        this.pos.x = this.target.x; this.pos.z = this.target.z;
        this.state = 'peck';
        this.timer = rand(CONFIG.animals.peckMin, CONFIG.animals.peckMax);
      } else {
        this.pos.x += dx / d * step; this.pos.z += dz / d * step;
        this.targetHeading = Math.atan2(dx, dz);
        this.phase += dt * 12;
      }
      u.head.rotation.x = lerp(u.head.rotation.x, 0, Math.min(1, dt * 6));
      u.body.position.y = (this.kind === 'gallina' ? 0.34 : 0.42) + Math.abs(Math.sin(this.phase)) * 0.04;
    } else {
      this.timer -= dt;
      const peck = Math.max(0, Math.sin(Sim.time * 5 + this.phase));
      u.head.rotation.x = peck * 0.6;
      if (this.timer <= 0 || wolves.length > 0) {
        if (this.pickTarget()) this.state = 'walk'; else this.timer = rand(0.5, 1.5);
      }
    }
    this.heading += angleDelta(this.heading, this.targetHeading) * Math.min(1, 5 * dt);
    this.group.rotation.y = this.heading;
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
  }
}
// Lobos: salen del bosque de noche, acechan a la gallina más cercana y huyen de los guardias.
export const wolves = [];
export class Wolf {
  constructor(x, z) {
    this.kind = 'lobo';
    this.group = buildWolf();
    this.pos = this.group.position;
    this.pos.set(x, terrainHeight(x, z), z);
    this.heading = rand(0, TAU);
    this.targetHeading = this.heading;
    this.speed = CONFIG.dangers.lobos.speed;
    this.state = 'hunt';
    this.huntTimer = 0;
    this.phase = rand(0, TAU);
    this.removed = false;
    this.exit = null;
    Render.scene.add(this.group);
    wolves.push(this);
  }
  flee() {
    if (this.state === 'flee') return;
    this.state = 'flee';
    const n = Graph.node(pick(BORDER_NODES));
    this.exit = new THREE.Vector3(n.x, 0, n.z);
  }
  remove() {
    this.removed = true;
    Render.scene.remove(this.group);
    const i = wolves.indexOf(this);
    if (i >= 0) wolves.splice(i, 1);
  }
  update(dt, ev) {
    const L = CONFIG.dangers.lobos;
    let tx, tz;
    if (this.state === 'flee') {
      tx = this.exit.x; tz = this.exit.z;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 2) { this.remove(); return; }
    } else {
      for (const a of agents) {
        if (a.role !== 'guardia' || a.removed) continue;
        if (Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < L.scareRadius * (World.buildings.torre ? 1.6 : 1)) {
          this.flee();
          if (ev) ev.scared++;
          HUD.log('Los guardias ahuyentan a un lobo');
          return;
        }
      }
      let prey = null, best = Infinity;
      for (const an of animals) {
        if (an.kind !== 'gallina' || an.removed) continue;
        const d = Math.hypot(an.pos.x - this.pos.x, an.pos.z - this.pos.z);
        if (d < best) { best = d; prey = an; }
      }
      if (!prey) { this.flee(); return; }
      tx = prey.pos.x; tz = prey.pos.z;
      if (best < 1.3) {
        this.huntTimer += dt;
        if (this.huntTimer >= L.huntTime) {
          prey.remove();
          if (ev) ev.taken++;
          HUD.log('Un lobo se lleva una gallina');
          this.flee();
          return;
        }
      } else this.huntTimer = Math.max(0, this.huntTimer - dt);
    }
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    const step = this.speed * (this.state === 'flee' ? 1.4 : 1) * dt;
    if (d > 0.3) {
      this.pos.x += dx / d * Math.min(step, d);
      this.pos.z += dz / d * Math.min(step, d);
      this.targetHeading = Math.atan2(dx, dz);
      this.phase += dt * 14;
    }
    this.group.userData.body.position.y = 0.55 + Math.abs(Math.sin(this.phase)) * 0.05;
    this.group.userData.head.rotation.x = this.state === 'hunt' && d < 4 ? 0.3 : 0;
    this.heading += angleDelta(this.heading, this.targetHeading) * Math.min(1, 6 * dt);
    this.group.rotation.y = this.heading;
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
  }
}
export function removeAllWolves() {
  for (const w of wolves.slice()) w.remove();
}
export function spawnAnimals(saved) {
  const c1 = Graph.node('casa1'), c2 = Graph.node('casa2'), g = Graph.node('granja');
  const chickenSpots = [
    new THREE.Vector3(c1.x + 8, 0, c1.z + 8), new THREE.Vector3(c2.x - 10, 0, c2.z + 3), new THREE.Vector3(g.x - 4, 0, g.z + 3)
  ];
  const pigSpots = [new THREE.Vector3(g.x - 2, 0, g.z + 6), new THREE.Vector3(c2.x - 11, 0, c2.z + 2)];
  const nChickens = saved ? saved.filter(s => s.kind === 'gallina').length : CONFIG.animals.gallinas;
  const nPigs = saved ? saved.filter(s => s.kind === 'cerdo').length : CONFIG.animals.cerdos;
  for (let i = 0; i < nChickens; i++) new Animal('gallina', chickenSpots[i % chickenSpots.length]);
  for (let i = 0; i < nPigs; i++) new Animal('cerdo', pigSpots[i % pigSpots.length]);
  if (saved) {
    const chickens = animals.filter(a => a.kind === 'gallina'), pigs = animals.filter(a => a.kind === 'cerdo');
    let ci = 0, pi = 0;
    for (const s of saved) {
      const a = s.kind === 'gallina' ? chickens[ci++] : pigs[pi++];
      if (!a) continue;
      a.pos.set(s.x, terrainHeight(s.x, s.z), s.z);
      a.heading = s.h; a.targetHeading = s.h;
    }
  }
}
// Con el tiempo las gallinas se reponen: si quedan pocas, nace un pollo cerca de la granja.
export function replenishChickens() {
  const chickens = animals.filter(a => a.kind === 'gallina' && !a.removed).length;
  if (chickens >= CONFIG.animals.gallinas) return false;
  const g = Graph.node('granja');
  new Animal('gallina', new THREE.Vector3(g.x - 4, 0, g.z + 3));
  return true;
}
export function serializeAnimals() {
  return animals.filter(a => !a.removed).map(a => ({ kind: a.kind, x: a.pos.x, z: a.pos.z, h: a.heading }));
}
