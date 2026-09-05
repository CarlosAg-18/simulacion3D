import * as THREE from 'three';
import { CONFIG, ROLE_SINGULAR, ROLE_FEMININE } from './config.js';
import { rand, pick, chance, rng, lerp, angleDelta, TAU } from './utils.js';
import { World, agents, Sim } from './state.js';
import { Assets } from './assets.js';
import { AgentRenderer } from './agentmesh.js';
import { terrainHeight } from './terrain.js';
import { Graph, BORDER_NODES } from './graph.js';
import { Weather } from './weather.js';
import { Events } from './events.js';
import { Economy } from './economy.js';
import { DayCycle } from './calendar.js';
import { HUD } from './hud.js';
import { Growth } from './growth.js';
import { Tech, Ruler } from './tech.js';
import { spotIsClear } from './world.js';
import { Exogenous } from './exogenos.js';

export const STATE = {
  IDLE: 'IDLE', TRAVEL: 'TRAVEL', WORK: 'WORK', SOCIALIZE: 'SOCIALIZE',
  SEEK_SHELTER: 'SEEK_SHELTER', SHELTERED: 'SHELTERED', ATTEND_EVENT: 'ATTEND_EVENT', LEAVE_MAP: 'LEAVE_MAP'
};
const NAMES = ['Aldo', 'Beatriz', 'Clara', 'Diego', 'Elena', 'Fabián', 'Gema', 'Hugo', 'Inés', 'Jorge', 'Lucía', 'Marcos',
  'Nuria', 'Óscar', 'Pilar', 'Ramiro', 'Sara', 'Tomás', 'Úrsula', 'Vicente', 'Ximena', 'Yago', 'Zoe', 'Bruno', 'Carmen',
  'Damián', 'Esther', 'Félix', 'Gonzalo', 'Irene', 'Leire', 'Mateo', 'Olalla', 'Pedro', 'Rocío', 'Sancho', 'Teresa', 'Unai'];
const FEMALE = new Set(['Beatriz', 'Clara', 'Elena', 'Gema', 'Inés', 'Lucía', 'Nuria', 'Pilar', 'Sara', 'Úrsula', 'Ximena', 'Zoe', 'Carmen', 'Esther', 'Irene', 'Leire', 'Olalla', 'Rocío', 'Teresa']);
const BUILDER_ROLES = new Set(['aldeano', 'agricultor', 'lenador', 'minero']);
const WORK_HOURS = { agricultor: [0, 17], minero: [6, 15], lenador: [7, 16], comerciante: [8, 18], clerigo: [7, 20], aldeano: [8, 19], curandero: [7, 20], sabio: [8, 19], senor: [8, 19], alcalde: [8, 19], pescador: [5, 14] };
const HAT_BY_ROLE = { guardia: 'helm', clerigo: 'hat', curandero: 'hat', sabio: 'hat', viajero: 'brim', senor: 'crown', alcalde: 'hat', pescador: 'brim' };
export const socialCooldown = new Map();
let agentSerial = 1;
const usedNames = new Set();
function rateScale() { return CONFIG.economy.referenceDay / CONFIG.dayLengthSeconds; }
function pickName() {
  for (let i = 0; i < 6; i++) {
    const n = pick(NAMES);
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  const n = pick(NAMES) + ' ' + (usedNames.size + 1);
  usedNames.add(n);
  return n;
}
// Afinidad entre pares de habitantes: crece con cada conversación y decide quién forma familia.
export const Relations = {
  map: new Map(),
  key(a, b) { return a < b ? a * 100000 + b : b * 100000 + a; },
  get(a, b) { return this.map.get(this.key(a, b)) || 0; },
  add(a, b, v) { this.map.set(this.key(a, b), this.get(a, b) + v); },
  serialize() { return Array.from(this.map.entries()); },
  restore(list) { this.map = new Map(list || []); }
};
function polyLen(from, pts) {
  let len = 0, px = from.x, pz = from.z;
  for (let i = 0; i < pts.length; i++) { len += Math.hypot(pts[i].x - px, pts[i].z - pz); px = pts[i].x; pz = pts[i].z; }
  return len;
}

export class Mover {
  constructor(pos, speed, group) {
    this.pos = pos;
    this.group = group || null;
    this.speed = speed;
    this.heading = 0;
    this.targetHeading = 0;
    this.legs = null;
    this.legIdx = 0;
    this.ptIdx = 0;
    this.node = null;
    this.target = null;
    this.moving = false;
  }
  setNode(id) {
    this.node = id;
    const n = Graph.node(id);
    this.pos.set(n.x, 0, n.z);
  }
  // Ruta = lista de tramos; cada tramo es la polilínea de una arista y el nodo en el que termina.
  // Si el agente está a mitad de arista, decide si conviene seguir o regresar según la tabla Floyd-Warshall.
  routeTo(targetId) {
    const legs = [];
    let startNode = this.node;
    if (this.legs && this.legIdx < this.legs.length) {
      const leg = this.legs[this.legIdx];
      const remaining = leg.pts.slice(this.ptIdx);
      const back = leg.pts.slice(0, this.ptIdx).reverse();
      const fwdLen = polyLen(this.pos, remaining) + Graph.routeDist(leg.node, targetId);
      const backLen = leg.from && back.length ? polyLen(this.pos, back) + Graph.routeDist(leg.from, targetId) : Infinity;
      if (backLen < fwdLen) { legs.push({ pts: back, node: leg.from, from: null }); startNode = leg.from; }
      else { legs.push({ pts: remaining, node: leg.node, from: null }); startNode = leg.node; }
    } else {
      legs.push({ pts: [Graph.node(startNode).pos], node: startNode, from: null });
    }
    const ids = Graph.route(startNode, targetId);
    for (let i = 1; i < ids.length; i++) legs.push({ pts: Graph.poly[ids[i - 1]][ids[i]], node: ids[i], from: ids[i - 1] });
    this.legs = legs;
    this.legIdx = 0;
    this.ptIdx = 0;
    this.target = targetId;
    this.moving = true;
  }
  advance(dt) {
    if (!this.legs || this.legIdx >= this.legs.length) { this.moving = false; this.legs = null; return true; }
    let budget = this.speed * dt;
    while (budget > 0) {
      const leg = this.legs[this.legIdx];
      const p = leg.pts[this.ptIdx];
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= budget) {
        this.pos.x = p.x; this.pos.z = p.z;
        budget -= d;
        this.ptIdx++;
        if (this.ptIdx >= leg.pts.length) {
          this.node = leg.node;
          this.legIdx++;
          this.ptIdx = 0;
          if (this.legIdx >= this.legs.length) { this.moving = false; this.legs = null; return true; }
        }
      } else {
        this.pos.x += dx / d * budget;
        this.pos.z += dz / d * budget;
        this.targetHeading = Math.atan2(dx, dz);
        budget = 0;
      }
    }
    this.moving = true;
    return false;
  }
  moveToward(x, z, speed, dt) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step || d < 0.05) { this.pos.x = x; this.pos.z = z; return true; }
    this.pos.x += dx / d * step;
    this.pos.z += dz / d * step;
    this.targetHeading = Math.atan2(dx, dz);
    return false;
  }
  updateHeading(dt) {
    this.heading += angleDelta(this.heading, this.targetHeading) * Math.min(1, CONFIG.speed.turnRate * dt);
    if (this.group) this.group.rotation.y = this.heading;
  }
}
function speedForRole(role) {
  if (role === 'guardia') return CONFIG.speed.guard;
  if (role === 'viajero') return CONFIG.speed.traveler;
  return CONFIG.speed.walk;
}
export function homeShelter(nodeId) {
  return World.shelters.find(s => s.node === nodeId) || null;
}

export class Agent extends Mover {
  constructor(role, homeId, opts) {
    opts = opts || {};
    super(new THREE.Vector3(), speedForRole(role));
    this.id = opts.id || agentSerial++;
    if (this.id >= agentSerial) agentSerial = this.id + 1;
    this.name = opts.name || pickName();
    if (opts.name) usedNames.add(opts.name);
    this.role = role;
    this.home = homeId;
    this.state = STATE.IDLE;
    this.timer = rand(0.5, 3);
    this.anchor = new THREE.Vector3();
    this.wanderTarget = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.wandering = false;
    this.wanderPause = rand(0.5, 2);
    this.walkPhase = rand(0, TAU);
    this.animBlend = 0;
    this.partner = null;
    this.socialTimer = 0;
    this.socialUntil = 0;
    this.eventId = -1;
    this.marketEvent = -1;
    this.follow = null;
    this.followSide = opts.followSide || 0;
    this.plan = null;
    this.exitNode = null;
    this.shelter = null;
    this.shiftOffset = rand(-0.8, 0.8);
    this.field = opts.field || 0;
    this.stall = opts.stall || null;
    this.circuit = opts.circuit || null;
    this.circuitIdx = opts.circuitIdx || 0;
    this.removed = false;
    this.activity = 'idle';
    this.needs = { hunger: rand(0.1, 0.4), energy: rand(0.75, 1), mood: rand(0.5, 0.8), health: rand(0.85, 1) };
    this.carry = { res: null, amount: 0 };
    this.sleeping = false;
    this.sick = false;
    // Peste: contagiado hasta una hora simulada, inmune un tiempo después; la severidad varía por persona.
    this.infected = false; this.infectedUntil = 0; this.immuneUntil = 0; this.severity = 1;
    this.wakeOffset = rand(CONFIG.needs.wakeHour.min, CONFIG.needs.wakeHour.max) - 6;
    this.sleepOffset = rand(CONFIG.needs.sleepHour.min, CONFIG.needs.sleepHour.max) - 20;
    this.age = opts.age !== undefined ? opts.age : (role === 'nino' ? rand(3, 8) : rand(18, 48));
    this.childDays = 0;
    this.partnerId = null;
    this.starving = 0;
    this.workRes = null;
    this.workRate = 0;
    this.helping = null;
    this.pendingAnchor = null;
    this.pendingStay = 0;
    this.baseSpeed = this.speed;
    // Estado visual para el renderizador instanciado.
    this.visible = true;
    this.scale = opts.scale || 1;
    this.sway = 0; this.bob = 0; this.armSwing = 0; this.headNod = 0; this.headY = 1.36;
    this.packVisible = false;
    this.hatKind = HAT_BY_ROLE[role] || 'hair';
    this.slot = AgentRenderer.alloc();
    AgentRenderer.setColors(this.slot, Assets.roleColors[role].color);
    this.setNode(opts.spawnAt || homeId);
    this.pos.x += rand(-1.5, 1.5);
    this.pos.z += rand(-1.5, 1.5);
    this.anchor.copy(this.pos);
    this.prev.copy(this.pos);
    this.heading = rand(0, TAU);
    this.targetHeading = this.heading;
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    agents.push(this);
  }
  get isFemale() { return FEMALE.has(this.name.split(' ')[0]); }
  get roleWord() { return this.isFemale ? ROLE_FEMININE[this.role] : ROLE_SINGULAR[this.role]; }
  get label() { return `${this.name} ${this.isFemale ? 'la' : 'el'} ${this.roleWord}`; }
  get isResident() { return this.role !== 'viajero'; }
  get isAdult() { return this.role !== 'nino'; }
  wakeHour() { return DayCycle.sunrise + this.wakeOffset; }
  sleepHour() { return DayCycle.sunset + 1 + this.sleepOffset; }
  inWorkHours() {
    const w = WORK_HOURS[this.role];
    if (!w) return true;
    const h = DayCycle.hour;
    const start = this.role === 'agricultor' ? DayCycle.sunrise + 0.5 : w[0] + this.shiftOffset;
    return h >= start && h < w[1] + this.shiftOffset;
  }
  goTo(nodeId, anchor, stay) {
    this.pendingAnchor = anchor || null;
    this.pendingStay = stay || rand(CONFIG.activity.minStay, CONFIG.activity.maxStay);
    this.wandering = false;
    if (nodeId === this.node && !this.legs) { this.arriveAt(nodeId); return; }
    this.routeTo(nodeId);
    this.state = STATE.TRAVEL;
  }
  arriveAt(nodeId) {
    const n = Graph.node(nodeId);
    if (this.pendingAnchor) this.anchor.copy(this.pendingAnchor); else this.anchor.set(n.x, 0, n.z);
    this.state = STATE.WORK;
    this.timer = this.pendingStay;
    this.wandering = false;
    this.wanderPause = rand(0.3, 1.2);
    this.onActivityStart();
  }
  onArrive() { this.arriveAt(this.node); }
  resourcePlan(res, mult, rateMul) {
    const A = World.anchors, P = CONFIG.economy.production, k = rateScale() * (rateMul || 1);
    if (res === 'grano') {
      const yieldMul = CONFIG.calendar.foodYield[DayCycle.season] * Tech.foodMul() * Ruler.foodMul() * Exogenous.foodMul();
      const fieldMul = 1 + CONFIG.economy.fieldBonus * Math.max(0, World.fields.length - 2);
      return { node: 'granja', anchor: A.campos[this.field % A.campos.length], res, rate: P.grano * yieldMul * fieldMul * k, mult: mult * (0.4 + yieldMul * 0.6) };
    }
    if (res === 'pesca') {
      // La pesca entra como comida en el cobertizo del muelle; en invierno rinde la mitad y en riada nada.
      const m = (Weather.isWinter ? CONFIG.fishing.winterMul : 1) * Exogenous.fishMul();
      return { node: 'lago', anchor: A.lago, res: 'grano', rate: P.pesca * k * m, mult: mult * (0.5 + m * 0.5) };
    }
    const tools = Tech.toolMul();
    if (res === 'madera') return { node: 'bosque', anchor: A.bosque, res, rate: P.madera * k * tools, mult };
    if (res === 'hierro' || res === 'oro') {
      const dep = pick(World.deposits.filter(d => d.kind === res));
      return { node: dep.key, anchor: dep.anchor, res, rate: P[res] * k * tools, mult };
    }
    return { node: 'mina', anchor: A.mina, res, rate: (res === 'piedra' ? P.piedra : P.mineral) * k * tools, mult };
  }
  // El minero elige la veta más necesaria: mina del pueblo o los yacimientos descubiertos.
  miningTarget() {
    const s = Economy.stock, T = CONFIG.deposits.targetStock;
    const cands = [{ res: 'mineral', ratio: s.mineral / 30 }, { res: 'piedra', ratio: s.piedra / 30 }];
    for (const d of World.deposits) if (!cands.some(c => c.res === d.kind)) cands.push({ res: d.kind, ratio: s[d.kind] / T[d.kind] });
    cands.sort((a, b) => a.ratio - b.ratio);
    return chance(0.7) ? cands[0].res : pick(cands).res;
  }
  // Plan de trabajo por rol: dónde, alrededor de qué punto y qué recurso produce.
  workPlan() {
    const A = World.anchors;
    this.helping = null;
    switch (this.role) {
      case 'agricultor': return this.resourcePlan('grano', 1);
      case 'minero': return this.resourcePlan(this.miningTarget(), 1);
      case 'lenador': return this.resourcePlan('madera', 1);
      case 'pescador': return this.resourcePlan('pesca', 1);
      case 'alcalde': {
        const h = DayCycle.hour;
        if (h >= 12 && h < 13.5) return { node: 'plaza', anchor: null, res: null, rate: 0, mult: 1.2 };
        return World.ayuntamiento
          ? { node: World.ayuntamiento.travelNode, anchor: World.ayuntamiento.anchor, res: null, rate: 0, mult: 1 }
          : { node: 'plaza', anchor: A.pozo, res: null, rate: 0, mult: 1 };
      }
      case 'sabio': return World.escuela
        ? { node: World.escuela.travelNode, anchor: World.escuela.anchor, res: null, rate: 0, mult: 1.1 }
        : { node: 'iglesia', anchor: A.iglesia, res: null, rate: 0, mult: 0.9 };
      case 'senor': {
        const h = DayCycle.hour;
        if (h >= 12 && h < 13.5) return { node: 'plaza', anchor: null, res: null, rate: 0, mult: 1.2 };
        return { node: 'castillo', anchor: A.castillo, res: null, rate: 0, mult: 1 };
      }
      case 'comerciante': return { node: 'mercado', anchor: this.stall ? this.stall.front : null, res: null, rate: 0, mult: Events.marketActive ? 1.6 : 1 };
      case 'clerigo': return { node: 'iglesia', anchor: A.iglesia, res: null, rate: 0, mult: 1 };
      case 'curandero': {
        const clinic = World.hospital || World.botica;
        return clinic
          ? { node: clinic.travelNode, anchor: clinic.anchor, res: null, rate: 0, mult: 1.1 }
          : { node: 'iglesia', anchor: A.iglesia, res: null, rate: 0, mult: 0.8 };
      }
      case 'aldeano': {
        // Oficio secundario: el aldeano ocioso echa una mano con el recurso que más escasea.
        const s = Economy.stock, L = CONFIG.secondary.lowStock;
        const cands = [];
        if (s.grano < L.grano && CONFIG.calendar.foodYield[DayCycle.season] > 0.3) cands.push({ res: 'grano', ratio: s.grano / L.grano });
        if (s.madera < L.madera) cands.push({ res: 'madera', ratio: s.madera / L.madera });
        if (s.piedra < L.piedra) cands.push({ res: 'piedra', ratio: s.piedra / L.piedra });
        if (cands.length) {
          cands.sort((a, b) => a.ratio - b.ratio);
          this.helping = cands[0].res;
          return this.resourcePlan(cands[0].res, 0.9, CONFIG.secondary.rateMul);
        }
        return { node: chance(0.6) ? 'plaza' : 'mercado', anchor: chance(0.5) ? A.pozo : null, res: null, rate: 0, mult: 0.6 };
      }
      default: return null;
    }
  }
  // Rutina por utilidad: cada opción puntúa según hora, necesidades y economía; gana la más alta.
  decideRoutine() {
    if (this.role === 'viajero') return this.decideTraveler();
    const n = this.needs, h = DayCycle.hour;
    const night = h >= this.sleepHour() || h < this.wakeHour();
    const stay = rand(CONFIG.activity.minStay, CONFIG.activity.maxStay);
    if (this.role === 'guardia') {
      // Los guardias comen en la taberna y duermen en el castillo; el resto del tiempo patrullan.
      if (n.hunger > CONFIG.needs.hungerEatAt && Economy.stock.grano >= 1) return this.choose({ act: 'comer', node: 'taberna', anchor: World.anchors.taberna, stay: rand(8, 12) });
      if (night && n.energy < 0.45) return this.choose({ act: 'dormir', node: 'castillo', stay: 99999 });
      const clinic = World.hospital || World.botica;
      if (this.sick && clinic) return this.choose({ act: 'curarse', node: clinic.travelNode, anchor: clinic.anchor, stay: rand(20, 30) });
      this.circuitIdx = (this.circuitIdx + 1) % this.circuit.length;
      return this.choose({ act: 'patrullar', node: this.circuit[this.circuitIdx], stay: rand(4, 9) });
    }
    const options = [];
    options.push({ act: 'dormir', node: this.home, stay: 99999, score: (night ? 1.6 : -0.9) + (1 - n.energy) * 1.7 });
    const food = Economy.stock.grano;
    if (n.hunger > CONFIG.needs.hungerEatAt) {
      const tavern = h >= 16 && h < 23 && Economy.stock.monedas >= CONFIG.economy.tavernPrice && !this.infected && chance(0.5);
      options.push({ act: 'comer', node: tavern ? 'taberna' : this.home, anchor: tavern ? World.anchors.taberna : null, stay: rand(8, 14), score: (n.hunger - 0.3) * 2.4 - (food >= 1 ? 0 : 1.6) });
    }
    if (this.sick) {
      const b = World.hospital || World.botica;
      options.push({ act: 'curarse', node: b ? b.travelNode : this.home, anchor: b ? b.anchor : null, stay: rand(20, 32), score: (1 - n.health) * 2.6 + 0.4 });
    }
    // Cuarentena: el contagiado guarda casa aunque aún se tenga en pie.
    // Cuarentena: el contagiado guarda casa, pero sale a comer cuando tiene hambre y hay comida.
    if (this.infected && Ruler.policy === 'cuarentena') {
      const hungry = n.hunger > CONFIG.needs.hungerEatAt && food >= 1;
      options.push({ act: 'curarse', node: this.home, stay: rand(30, 50), score: hungry ? 0 : 3.2 });
    }
    if (this.carry.amount >= CONFIG.economy.carryAmount || (this.carry.amount > 0.5 && !this.inWorkHours())) {
      const depot = this.depotFor(this.carry.res);
      options.push({ act: 'entregar', node: depot, anchor: World.anchors[depot], stay: rand(2, 4), score: 2.6 });
    }
    const plan = this.workPlan();
    if (plan && this.inWorkHours()) {
      const sickPenalty = this.sick ? 0.7 : 0;
      options.push({ act: 'trabajar', node: plan.node, anchor: plan.anchor, plan, stay: stay * 1.5, score: 1.05 * plan.mult - n.hunger * 0.45 - (1 - n.energy) * 0.5 - sickPenalty });
    }
    const site = Growth.site;
    const maxBuilders = CONFIG.construction.maxBuilders + (Ruler.policy === 'expansion' ? 2 : 0);
    if (site && !night && !this.sick && BUILDER_ROLES.has(this.role) && Growth.builderCount() < maxBuilders) {
      options.push({ act: 'construir', node: site.travelNode, anchor: site.anchor, stay: rand(20, 32), score: 1.3 - n.hunger * 0.5 - (1 - n.energy) * 0.4 });
    }
    if (!night) {
      const market = Events.marketActive && this.role === 'aldeano';
      options.push({ act: 'pasear', node: market ? 'mercado' : (chance(0.7) ? 'plaza' : 'mercado'), anchor: chance(0.4) ? World.anchors.pozo : null, stay, score: (1 - n.mood) * 1.4 + rand(0, 0.35) + (market ? 0.5 : 0) });
      options.push({ act: 'rezar', node: 'iglesia', anchor: World.anchors.iglesia, stay: rand(10, 20), score: this.role === 'clerigo' ? 1.5 : 0.2 + (1 - n.mood) * 0.5 });
    }
    options.push({ act: 'casa', node: this.home, stay: stay * 0.7, score: 0.3 + (1 - n.energy) * 0.6 + (night ? 0.4 : 0) + (this.sick ? 0.3 : 0) });
    let best = options[0];
    for (const o of options) if (o.score > best.score) best = o;
    this.choose(best);
  }
  // El grano se guarda en la granja, el mineral y la piedra en el almacén, la madera en el más cercano.
  depotFor(res) {
    if (res === 'grano') return this.role === 'pescador' ? 'lago' : 'granja';
    if (res === 'mineral' || res === 'piedra') return 'almacen';
    return Graph.routeDist(this.node, 'granja') < Graph.routeDist(this.node, 'almacen') ? 'granja' : 'almacen';
  }
  choose(o) {
    this.activity = o.act;
    if (o.act === 'trabajar' && (this.role === 'senor' || this.role === 'alcalde')) this.activity = 'gobernar';
    if (o.act === 'trabajar' && this.role === 'sabio') this.activity = 'estudiar';
    this.workRes = o.plan ? o.plan.res : null;
    this.workRate = o.plan ? o.plan.rate : 0;
    this.goTo(o.node, o.anchor || null, o.stay);
  }
  decideTraveler() {
    if (this.plan && this.plan.length) {
      const step = this.plan.shift();
      this.activity = 'visitar';
      return this.goTo(step.node, step.anchor || null, step.stay);
    }
    this.state = STATE.LEAVE_MAP;
    this.routeTo(this.exitNode);
    HUD.log(`Un viajero se marcha por el camino ${Graph.node(this.exitNode).label}`);
  }
  // Efectos inmediatos al llegar: comer, entregar la carga o acostarse.
  onActivityStart() {
    const act = this.activity;
    if (act === 'comer') this.eat();
    else if (act === 'entregar') this.deliver();
    else if (act === 'dormir') this.sleep();
    else if (act === 'curarse' && this.node === this.home) this.sleep();
  }
  eat() {
    let mouths = 1;
    for (const a of agents) if (a.follow === this) mouths++;
    const need = CONFIG.economy.foodPerMeal * mouths;
    const got = Economy.take('grano', need);
    if (got > 0) {
      const ratio = got / need * CONFIG.needs.mealRelief;
      this.needs.hunger = Math.max(0, this.needs.hunger - ratio);
      this.needs.mood = Math.min(1, this.needs.mood + 0.04);
      for (const a of agents) if (a.follow === this) a.needs.hunger = Math.max(0, a.needs.hunger - ratio);
      if (this.node === 'taberna') {
        Economy.take('monedas', CONFIG.economy.tavernPrice);
        Economy.add('monedas', CONFIG.economy.tavernPrice);
        this.needs.mood = Math.min(1, this.needs.mood + 0.1);
      }
    } else {
      this.needs.mood = Math.max(0, this.needs.mood - 0.1);
    }
  }
  deliver() {
    if (this.carry.res && this.carry.amount > 0) Economy.add(this.carry.res, this.carry.amount);
    this.carry.res = null;
    this.carry.amount = 0;
    this.packVisible = false;
  }
  sleep() {
    const s = homeShelter(this.home);
    if (!s || Events.burningHome === this.home) { this.timer = rand(5, 10); return; }
    this.sleeping = true;
    this.visible = false;
    this.pos.copy(s.door);
    this.anchor.copy(s.door);
    this.shelter = s;
  }
  wake() {
    this.sleeping = false;
    this.visible = true;
    if (this.shelter) { this.pos.copy(this.shelter.door); this.anchor.copy(this.shelter.door); }
    this.timer = rand(0.5, 2);
    this.activity = 'idle';
  }
  wander(dt) {
    if (this.wandering) {
      const d = Math.hypot(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z);
      const speed = d > 4 ? this.speed : CONFIG.speed.wander;
      if (this.moveToward(this.wanderTarget.x, this.wanderTarget.z, speed, dt)) {
        this.wandering = false;
        this.wanderPause = rand(CONFIG.activity.idleMin, CONFIG.activity.idleMax);
      }
      return;
    }
    this.wanderPause -= dt;
    if (this.wanderPause > 0) return;
    const r = CONFIG.activity.wanderRadius;
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), d = rand(0.6, r);
      const x = this.anchor.x + Math.cos(a) * d, z = this.anchor.z + Math.sin(a) * d;
      if (spotIsClear(x, z, 0.6)) { this.wanderTarget.set(x, 0, z); this.wandering = true; return; }
    }
    this.wanderPause = rand(1, 2);
  }
  startSeekShelter() {
    let best = null, bestD = Infinity;
    for (const s of World.shelters) {
      const d = Graph.routeDist(this.node, s.node);
      if (d < bestD) { bestD = d; best = s; }
    }
    this.shelter = best;
    this.partner = null;
    this.wandering = false;
    this.state = STATE.SEEK_SHELTER;
    this.routeTo(best.node);
  }
  enterShelter() {
    this.state = STATE.SHELTERED;
    this.visible = false;
    this.pos.copy(this.shelter.door);
    this.node = this.shelter.node;
    this.legs = null;
  }
  leaveShelter() {
    if (this.state === STATE.SHELTERED) {
      this.visible = true;
      this.pos.copy(this.shelter.door);
      this.anchor.copy(this.shelter.door);
    }
    this.state = STATE.IDLE;
    this.timer = rand(1, 3);
    this.wandering = false;
    // Al salir del refugio se olvida el evento atendido para poder volver a él si sigue en curso.
    this.eventId = -1;
  }
  startAttend(ev) {
    this.eventId = ev.id;
    this.partner = null;
    this.wandering = false;
    this.state = STATE.ATTEND_EVENT;
    this.activity = 'evento';
    this.pendingAnchor = ev.anchor;
    if (!ev.danger) this.needs.mood = Math.min(1, this.needs.mood + CONFIG.needs.moodEvent);
    if (ev.node === this.node && !this.legs) {
      const n = Graph.node(ev.node);
      if (ev.anchor) this.anchor.copy(ev.anchor); else this.anchor.set(n.x, 0, n.z);
    } else {
      this.routeTo(ev.node);
    }
  }
  startSocial(other) {
    this.partner = other;
    this.socialTimer = rand(CONFIG.social.durMin, CONFIG.social.durMax);
    this.state = STATE.SOCIALIZE;
    this.needs.mood = Math.min(1, this.needs.mood + CONFIG.needs.moodSocial);
  }
  updateSocial(dt) {
    const p = this.partner;
    if (!p || p.removed || p.state !== STATE.SOCIALIZE || p.partner !== this) { this.endSocial(); return; }
    this.targetHeading = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.socialTimer -= dt;
    if (this.socialTimer <= 0) { p.endSocial(); this.endSocial(); }
  }
  endSocial() {
    if (this.state !== STATE.SOCIALIZE) return;
    this.partner = null;
    this.state = STATE.TRAVEL;
    if (!this.legs) this.onArrive();
  }
  remove() {
    this.removed = true;
    usedNames.delete(this.name);
    AgentRenderer.release(this.slot);
    this.slot = -1;
    for (const a of agents) if (a.follow === this) a.follow = null;
  }
  // Muerte: la pareja y los hijos pierden ánimo; los hijos pasan a seguir a otro adulto de la casa.
  die(cause) {
    if (this.removed) return;
    const M = CONFIG.mortality;
    const partner = this.partnerId !== null ? agents.find(a => a.id === this.partnerId && !a.removed) : null;
    if (partner) {
      partner.partnerId = null;
      partner.needs.mood = Math.max(0, partner.needs.mood - M.moodLoss);
    }
    for (const c of agents) {
      if (c.follow !== this) continue;
      const guardian = partner && partner.isResident ? partner
        : agents.find(a => a !== this && a !== c && a.isAdult && a.isResident && !a.follow && !a.removed && a.home === this.home)
          || agents.find(a => a !== this && a !== c && a.isAdult && a.isResident && !a.follow && !a.removed) || null;
      c.follow = guardian;
      c.needs.mood = Math.max(0, c.needs.mood - M.moodLoss);
      if (!guardian) c.growUp();
    }
    Growth.registerDeath(this, cause);
    this.remove();
  }
  emigrate(reason) {
    if (this.state === STATE.LEAVE_MAP) return;
    this.sleeping = false;
    this.visible = true;
    this.state = STATE.LEAVE_MAP;
    this.exitNode = pick(BORDER_NODES);
    this.routeTo(this.exitNode);
    HUD.log(`${this.label} se marcha del pueblo ${reason}`);
  }
  updateFollower(dt) {
    const L = this.follow;
    this.visible = L.visible;
    this.sleeping = L.sleeping;
    if (!L.visible) { this.pos.copy(L.pos); return; }
    const sx = Math.sin(L.heading), cz = Math.cos(L.heading);
    const back = this.followSide ? 0.2 : 1.3;
    const side = this.followSide ? 1.1 * this.followSide : 0.5;
    const tx = L.pos.x - sx * back + cz * side, tz = L.pos.z - cz * back - sx * side;
    const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    if (d > 0.8) this.moveToward(tx, tz, Math.min(this.speed * 1.15, d * 2.5 + 0.5), dt);
    else this.targetHeading = L.heading;
  }
  // Necesidades: el hambre sube, la energía baja (más trabajando), el ánimo tiende al centro
  // y la salud se resiente con frío, lluvia y hambre; se recupera en casa o en la botica.
  updateNeeds(dt) {
    const n = this.needs, perSec = dt / CONFIG.dayLengthSeconds, N = CONFIG.needs, H = CONFIG.health;
    n.hunger = Math.min(1.2, n.hunger + N.hungerPerDay * perSec);
    if (this.sleeping) n.energy = Math.min(1, n.energy + N.sleepRecoverPerHour * 24 * perSec);
    else {
      const extra = this.activity === 'trabajar' || this.activity === 'construir' ? N.energyWorkExtra : 0;
      n.energy = Math.max(0, n.energy - (N.energyPerDay + extra) * perSec);
    }
    n.mood += (0.5 - n.mood) * N.moodDecayPerDay * perSec;
    if (n.hunger > 0.8) n.mood = Math.max(0, n.mood - N.moodHungry * perSec);
    let loss = 0;
    if (this.visible) {
      if (Weather.state === 'FRIO' || Weather.isWinter) loss += H.coldLossPerDay;
      if (Weather.isWet) loss += H.rainLossPerDay;
    }
    if (n.hunger > 0.9) loss += H.hungerLossPerDay;
    if (this.infected) {
      if (Sim.time >= this.infectedUntil) {
        this.infected = false;
        this.immuneUntil = Sim.time + CONFIG.exogenous.epidemia.immuneDays * CONFIG.dayLengthSeconds;
      } else loss += CONFIG.exogenous.epidemia.healthLossPerDay * this.severity * Exogenous.illnessMul();
    }
    if (loss > 0) n.health -= loss * perSec;
    else {
      let gain = this.sleeping ? H.sleepRecoverPerDay : H.recoverPerDay;
      if (this.activity === 'curarse' && this.state === STATE.WORK && this.healerNearby()) gain = H.healerRecoverPerDay;
      n.health = Math.min(1, n.health + gain * Tech.healMul() * perSec);
    }
    const wasSick = this.sick;
    this.sick = n.health < H.sickBelow;
    if (this.sick && !wasSick && this.isResident) HUD.log(`${this.label} cae ${this.isFemale ? 'enferma' : 'enfermo'}`);
    if (!this.sick && wasSick && this.isResident) HUD.log(`${this.name} se recupera`);
    this.speed = this.baseSpeed * (this.sick ? H.sickSpeed : 1);
    if (n.health <= H.deathBelow) { this.die(this.infected ? 'de la peste' : 'de enfermedad'); return; }
    if (n.hunger >= 1) this.starving += dt; else this.starving = Math.max(0, this.starving - dt * 2);
    const day = CONFIG.dayLengthSeconds, M = CONFIG.mortality;
    if (this.starving > M.starveDaysDeath * day) { this.die('de hambre'); return; }
    if (DayCycle.season === 'Invierno' && this.starving > M.winterStarveDays * day) { this.die('de frío y hambre'); return; }
    if (this.starving > N.starveDays * day && Economy.stock.grano < 1 && this.isResident && !this.follow) this.emigrate('en busca de comida');
  }
  healerNearby() {
    for (const a of agents) {
      if (a.role !== 'curandero' || a.removed || a.legs || a.state !== STATE.WORK) continue;
      if (Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < 7) return true;
    }
    return false;
  }
  updateWork(dt) {
    if (this.activity === 'trabajar' && this.workRes) {
      this.carry.res = this.workRes;
      this.carry.amount += this.workRate * dt;
      if (this.carry.amount > 0.8 && !this.packVisible) {
        this.packVisible = true;
        AgentRenderer.setPackColor(this.slot, Assets.resourceColors[this.workRes].color);
      }
      if (this.carry.amount >= CONFIG.economy.carryAmount) this.timer = 0;
    } else if (this.activity === 'trabajar' && this.role === 'comerciante') {
      const sold = Economy.take('mineral', CONFIG.economy.sellRate * dt);
      if (sold > 0) Economy.add('monedas', sold * CONFIG.economy.sellPrice);
    } else if (this.activity === 'construir') {
      const site = Growth.site;
      if (!site) { this.timer = 0; return; }
      if (Math.hypot(this.pos.x - site.rec.x, this.pos.z - site.rec.z) < 8) Growth.addProgress(dt);
    } else if (this.activity === 'curarse') {
      // En casa guarda cama hasta recobrar fuerzas; en la botica espera al curandero.
      if (this.sleeping) {
        // El contagiado en cuarentena sigue en casa aunque se sienta bien; solo el hambre lo saca.
        const cured = this.needs.health >= CONFIG.health.restUntil && !(this.infected && Ruler.policy === 'cuarentena');
        if (cured || (this.needs.hunger > (this.infected ? 0.8 : 1.05) && Economy.stock.grano > 0)) this.wake();
      } else if (!this.sick) this.timer = 0;
    } else if (this.activity === 'dormir') {
      if (this.sleeping) {
        const h = DayCycle.hour;
        const wake = this.wakeHour();
        if (h >= wake && h < wake + 8) this.wake();
        else if (this.needs.hunger > 1.05 && Economy.stock.grano > 0) this.wake();
      } else this.timer = 0;
    }
  }
  update(dt) {
    this.prev.copy(this.pos);
    if (this.follow) {
      this.updateFollower(dt);
      this.state = this.follow.state;
      if (this.isResident) this.updateNeeds(dt);
      if (this.removed) return;
      this.animate(dt);
      return;
    }
    this.timer -= dt;
    if (this.isResident) this.updateNeeds(dt);
    if (this.removed) return;
    // Prioridad de interrupciones: LEAVE_MAP > SEEK_SHELTER > ATTEND_EVENT > rutina > SOCIALIZE > IDLE.
    if (this.state !== STATE.LEAVE_MAP) {
      const ev = Events.current;
      if (Weather.isStorm && this.role !== 'guardia' && !this.sleeping) {
        if (this.state !== STATE.SEEK_SHELTER && this.state !== STATE.SHELTERED) this.startSeekShelter();
      } else if (!Weather.isStorm && (this.state === STATE.SHELTERED || this.state === STATE.SEEK_SHELTER)) {
        this.leaveShelter();
      } else if (ev && ev.node && this.eventId !== ev.id && this.state !== STATE.SOCIALIZE && this.state !== STATE.SHELTERED && ev.wants(this)) {
        this.startAttend(ev);
      } else if (this.state === STATE.ATTEND_EVENT && (!ev || ev.id !== this.eventId || this.needs.hunger > CONFIG.needs.eventHungerLimit + 0.1)) {
        // El evento termina, o el hambre aprieta: se vuelve a la rutina sin volver a apuntarse a este evento.
        this.state = STATE.IDLE;
        this.timer = rand(0.5, 2);
        this.anchor.copy(this.pos);
      }
    }
    switch (this.state) {
      case STATE.TRAVEL:
        if (this.advance(dt)) this.onArrive();
        break;
      case STATE.WORK:
        this.updateWork(dt);
        if (this.sleeping) break;
        if (this.removed) break;
        if (this.timer <= 0) this.decideRoutine(); else this.wander(dt);
        break;
      case STATE.IDLE:
        if (this.timer <= 0) this.decideRoutine(); else this.wander(dt);
        break;
      case STATE.SOCIALIZE:
        this.updateSocial(dt);
        break;
      case STATE.SEEK_SHELTER:
        if (this.advance(dt)) this.enterShelter();
        break;
      case STATE.SHELTERED:
        break;
      case STATE.ATTEND_EVENT:
        if (this.legs) {
          if (this.advance(dt)) {
            const n = Graph.node(this.node);
            if (this.pendingAnchor) this.anchor.copy(this.pendingAnchor); else this.anchor.set(n.x, 0, n.z);
            this.wanderPause = 0.2;
          }
        } else this.wander(dt);
        break;
      case STATE.LEAVE_MAP:
        if (this.advance(dt)) this.remove();
        break;
    }
    this.animate(dt);
  }
  // Caminata barata: bob vertical con seno, balanceo lateral y brazos en contrafase; se apaga por interpolación.
  animate(dt) {
    const moved = this.pos.distanceToSquared(this.prev) > 1e-7;
    this.animBlend = lerp(this.animBlend, moved ? 1 : 0, Math.min(1, dt * 9));
    if (moved) this.walkPhase += dt * 9;
    const s = Math.sin(this.walkPhase), b = this.animBlend;
    this.bob = Math.abs(Math.sin(this.walkPhase * 2)) * 0.06 * b;
    this.sway = Math.sin(this.walkPhase) * 0.045 * b;
    this.armSwing = s * 0.75 * b;
    if (this.state === STATE.SOCIALIZE) {
      this.headNod = Math.sin(Sim.time * 7 + this.id) * 0.14;
      this.headY = 1.36 + Math.sin(Sim.time * 7 + this.id) * 0.025;
    } else {
      this.headNod = lerp(this.headNod, this.sick ? 0.25 : 0, Math.min(1, dt * 6));
      this.headY = 1.36 + this.bob;
    }
    this.updateHeading(dt);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    AgentRenderer.write(this);
  }
  // Cambio de oficio en vida: heredar o perder el señorío.
  setRole(role, homeId) {
    this.role = role;
    this.baseSpeed = speedForRole(role);
    this.speed = this.baseSpeed;
    this.hatKind = HAT_BY_ROLE[role] || 'hair';
    AgentRenderer.setColors(this.slot, Assets.roleColors[role].color);
    if (homeId) this.home = homeId;
    this.timer = 0;
    this.activity = 'idle';
  }
  becomeRuler() {
    const role = Ruler.rulerRole();
    this.setRole(role, role === 'senor' ? 'castillo' : (this.home === 'castillo' ? Growth.assignHome() : this.home));
  }
  becomeCommoner() { this.setRole('aldeano', Growth.assignHome()); }
  // Un niño que crece toma el rol que más necesita el pueblo y deja de seguir a sus padres.
  growUp() {
    const role = Growth.neededRole();
    const parent = this.follow;
    this.follow = null;
    this.role = role;
    this.age = CONFIG.growth.adultAge;
    this.baseSpeed = speedForRole(role);
    this.speed = this.baseSpeed;
    this.scale = 1;
    this.hatKind = HAT_BY_ROLE[role] || 'hair';
    AgentRenderer.setColors(this.slot, Assets.roleColors[role].color);
    this.state = STATE.IDLE;
    this.timer = 1;
    if (parent) this.node = parent.node;
    if (role === 'comerciante') this.stall = World.stalls[agents.filter(a => a.role === 'comerciante').length % World.stalls.length];
    if (role === 'agricultor') this.field = agents.filter(a => a.role === 'agricultor').length;
    if (role === 'guardia') { this.circuit = GUARD_CIRCUIT; this.circuitIdx = 0; this.home = 'castillo'; }
    HUD.log(`${this.name} ya es ${this.isFemale ? 'adulta' : 'adulto'} y se hace ${this.roleWord}`);
  }
  serialize() {
    return {
      id: this.id, name: this.name, role: this.role, home: this.home, x: this.pos.x, z: this.pos.z, h: this.heading,
      node: this.node, needs: Object.assign({}, this.needs), carry: Object.assign({}, this.carry), age: this.age,
      childDays: this.childDays, partnerId: this.partnerId, followId: this.follow ? this.follow.id : null,
      followSide: this.followSide, field: this.field, stall: this.stall ? World.stalls.indexOf(this.stall) : -1,
      circuitIdx: this.circuitIdx, exitNode: this.exitNode, plan: this.plan, sleeping: this.sleeping,
      wakeOffset: this.wakeOffset, sleepOffset: this.sleepOffset,
      infected: this.infected, infectedUntil: this.infectedUntil, immuneUntil: this.immuneUntil, severity: this.severity
    };
  }
}

// Comprobación de proximidad cada pocos frames con rejilla espacial: cada agente solo mira su celda y las vecinas.
const socialGrid = new Map();
const CELL = 4;
export function socialCheck() {
  const dist2 = CONFIG.social.distance * CONFIG.social.distance;
  socialGrid.clear();
  for (const a of agents) {
    if (a.state !== STATE.TRAVEL || a.follow || a.removed || a.socialUntil > Sim.time) continue;
    const key = Math.floor(a.pos.x / CELL) * 4096 + Math.floor(a.pos.z / CELL);
    let cell = socialGrid.get(key);
    if (!cell) { cell = []; socialGrid.set(key, cell); }
    cell.push(a);
  }
  for (const a of agents) {
    if (a.state !== STATE.TRAVEL || a.follow || a.removed || a.socialUntil > Sim.time) continue;
    const cx = Math.floor(a.pos.x / CELL), cz = Math.floor(a.pos.z / CELL);
    let done = false;
    for (let dx = -1; dx <= 1 && !done; dx++) for (let dz = -1; dz <= 1 && !done; dz++) {
      const cell = socialGrid.get((cx + dx) * 4096 + (cz + dz));
      if (!cell) continue;
      for (const b of cell) {
        if (b === a || b.id < a.id || b.state !== STATE.TRAVEL || b.socialUntil > Sim.time) continue;
        if (a.pos.distanceToSquared(b.pos) > dist2) continue;
        const key = a.id < b.id ? a.id * 10000 + b.id : b.id * 10000 + a.id;
        const until = socialCooldown.get(key);
        if (until !== undefined && until > Sim.time) continue;
        socialCooldown.set(key, Sim.time + rand(CONFIG.social.cooldownMin, CONFIG.social.cooldownMax));
        a.socialUntil = b.socialUntil = Sim.time + CONFIG.social.personalCooldown;
        if (a.isResident && b.isResident) Relations.add(a.id, b.id, 1);
        a.startSocial(b);
        b.startSocial(a);
        done = true;
        break;
      }
    }
  }
}
export function spawnTraveler(entryId, opts) {
  opts = opts || {};
  if (!AgentRenderer.hasRoom(2)) return null;
  const a = new Agent('viajero', entryId);
  a.exitNode = pick(BORDER_NODES.filter(id => id !== entryId));
  const stay = rand(CONFIG.travelers.stayMin, CONFIG.travelers.stayMax);
  a.plan = opts.plan || [
    { node: 'taberna', anchor: World.anchors.taberna, stay: stay * 0.5 },
    { node: 'mercado', stay: stay * 0.5 }
  ];
  a.timer = opts.delay || 0;
  if (!opts.silent) HUD.log(`Un viajero entra por el camino ${Graph.node(entryId).label}`);
  return a;
}
export const GUARD_CIRCUIT = ['castillo', 'plaza', 'taberna', 'casa2', 'plaza', 'mercado', 'almacen', 'mercado', 'casa1', 'plaza', 'iglesia', 'castillo'];
export function spawnPopulation() {
  const homes = ['casa1', 'casa2', 'casa3', 'casa4'];
  const cfg = CONFIG.agents;
  for (let i = 0; i < cfg.agricultor; i++) new Agent('agricultor', i < 2 ? 'granja' : homes[i % 4], { field: i % 2 });
  for (let i = 0; i < cfg.comerciante; i++) new Agent('comerciante', homes[(i + 1) % 4], { stall: World.stalls[i % World.stalls.length] });
  for (let i = 0; i < cfg.minero; i++) new Agent('minero', homes[(i + 2) % 4]);
  for (let i = 0; i < cfg.lenador; i++) new Agent('lenador', homes[(i + 3) % 4]);
  for (let i = 0; i < (cfg.pescador || 0); i++) new Agent('pescador', homes[i % 4]);
  const villagers = [];
  for (let i = 0; i < cfg.aldeano; i++) villagers.push(new Agent('aldeano', homes[i % 4]));
  for (let i = 0; i < CONFIG.followers.parejas && i * 2 + 1 < villagers.length; i++) {
    const a = villagers[i * 2], b = villagers[i * 2 + 1];
    b.home = a.home;
    a.partnerId = b.id; b.partnerId = a.id;
    Relations.add(a.id, b.id, CONFIG.growth.coupleAffinity);
  }
  for (let i = 0; i < CONFIG.followers.ninos && i < villagers.length; i++) {
    const leader = villagers[i * 2];
    const child = new Agent('nino', leader.home, { scale: 0.62 });
    child.follow = leader;
  }
  for (let i = 0; i < cfg.clerigo; i++) new Agent('clerigo', 'iglesia');
  for (let i = 0; i < cfg.guardia; i++) new Agent('guardia', 'castillo', { circuit: GUARD_CIRCUIT, circuitIdx: (i * 5) % GUARD_CIRCUIT.length });
}
export function restorePopulation(list) {
  const byId = new Map();
  for (const d of list) {
    if (!AgentRenderer.hasRoom(1)) break;
    const opts = { id: d.id, name: d.name, age: d.age, scale: d.role === 'nino' ? 0.62 : 1, field: d.field, followSide: d.followSide };
    if (d.stall >= 0) opts.stall = World.stalls[d.stall % World.stalls.length];
    if (d.role === 'guardia') { opts.circuit = GUARD_CIRCUIT; opts.circuitIdx = d.circuitIdx || 0; }
    const node = Graph.index[d.node] !== undefined ? d.node : d.home;
    const home = Graph.index[d.home] !== undefined ? d.home : 'casa1';
    opts.spawnAt = Graph.index[node] !== undefined ? node : home;
    const a = new Agent(d.role, home, opts);
    a.pos.set(d.x, terrainHeight(d.x, d.z), d.z);
    a.heading = d.h; a.targetHeading = d.h;
    a.anchor.copy(a.pos);
    Object.assign(a.needs, d.needs);
    if (a.needs.health === undefined) a.needs.health = 1;
    Object.assign(a.carry, d.carry);
    if (a.carry.res && a.carry.amount > 0.8) { a.packVisible = true; AgentRenderer.setPackColor(a.slot, Assets.resourceColors[a.carry.res].color); }
    a.childDays = d.childDays || 0;
    a.partnerId = d.partnerId;
    a.exitNode = d.exitNode;
    a.plan = d.plan;
    a.wakeOffset = d.wakeOffset; a.sleepOffset = d.sleepOffset;
    a.infected = !!d.infected; a.infectedUntil = d.infectedUntil || 0; a.immuneUntil = d.immuneUntil || 0; a.severity = d.severity || 1;
    a.timer = rand(0.5, 3);
    byId.set(a.id, a);
    if (d.role === 'viajero' && (!a.exitNode || !a.plan)) a.remove();
  }
  for (const d of list) if (d.followId !== null && d.followId !== undefined) {
    const child = byId.get(d.id), leader = byId.get(d.followId);
    if (child && leader && !leader.removed) child.follow = leader;
  }
}
