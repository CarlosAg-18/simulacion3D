import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, pick, chance, weightedPick } from './utils.js';
import { World, agents, Sim } from './state.js';
import { Graph, BORDER_NODES } from './graph.js';
import { Economy, RESOURCE_LABELS } from './economy.js';
import { HUD } from './hud.js';
import { Agent, Relations, STATE } from './agents.js';
import { AgentRenderer } from './agentmesh.js';
import { Tech, Ruler } from './tech.js';
import { Eras } from './eras.js';
import { Exogenous } from './exogenos.js';
import { findSite, createSiteVisual, updateSiteVisual, removeSiteVisual, finishConstruction, addGrave } from './world.js';

// Crecimiento del pueblo: obras autónomas, parejas, nacimientos, llegadas y niños que crecen.
export const Growth = {
  site: null,
  pending: null,
  planTimer: 12,
  immigrationTimer: CONFIG.growth.immigrationInterval,
  coupleTimer: 15,
  lastMissingLog: -999,
  deaths: 0,
  deathsToday: 0,
  buildsToday: 0,
  dangerCount: 0,
  history: [],
  residents() { let n = 0; for (const a of agents) if (a.isResident && !a.removed) n++; return n; },
  housingCapacity() { return World.homes.length * CONFIG.growth.housingPerCottage; },
  countType(type) { let n = 0; for (const c of World.constructions) if (c.type === type) n++; return n; },
  // Cada etapa permite más casas, campos y graneros.
  maxOf(type) { const d = CONFIG.construction.types[type]; return d.max + (d.perEra || 0) * Eras.index; },
  builderCount() { let n = 0; for (const a of agents) if (a.activity === 'construir' && !a.removed) n++; return n; },
  sickCount() { let n = 0; for (const a of agents) if (a.sick && a.isResident && !a.removed) n++; return n; },
  // Muestra diaria para las gráficas del panel.
  sample(day) {
    this.history.push({ day, pop: this.residents(), grano: Math.round(Economy.stock.grano), monedas: Math.round(Economy.stock.monedas), deaths: this.deaths, sick: this.sickCount() });
    if (this.history.length > CONFIG.history.maxDays) this.history.splice(0, this.history.length - CONFIG.history.maxDays);
  },
  registerDeath(agent, cause) {
    this.deaths++;
    this.deathsToday++;
    addGrave();
    HUD.log(`${agent.label} muere ${cause}`);
    Exogenous.onDeath(agent, cause);
    Ruler.onDeath(agent);
  },
  update(dt) {
    if (this.site === null) {
      this.planTimer -= dt;
      if (this.planTimer <= 0) { this.planTimer = CONFIG.construction.planInterval * Ruler.planIntervalMul(); this.plan(); }
    }
    this.immigrationTimer -= dt;
    if (this.immigrationTimer <= 0) { this.immigrationTimer = CONFIG.growth.immigrationInterval; this.tryImmigration(); }
    this.coupleTimer -= dt;
    if (this.coupleTimer <= 0) { this.coupleTimer = 15; this.formCouples(); }
  },
  // El planificador mira comida, vivienda, salud y los edificios que el saber ha desbloqueado.
  chooseNeed() {
    const types = CONFIG.construction.types;
    const res = this.residents(), cap = this.housingCapacity();
    const built = (t) => this.countType(t) >= this.maxOf(t);
    if ((Economy.stock.grano < CONFIG.construction.foodTrigger || Economy.foodTrend() < -8) && !built('campo')) return 'campo';
    if (res / cap >= CONFIG.construction.housingTrigger - (Ruler.policy === 'expansion' ? 0.1 : 0) && !built('casa')) return 'casa';
    const sickRatio = res > 0 ? this.sickCount() / res : 0;
    if ((res >= CONFIG.construction.boticaPopulation || sickRatio >= CONFIG.construction.boticaSickRatio) && !built('botica')) return 'botica';
    // Edificios de saber y de etapa: tras una peste el hospital pasa delante de todo.
    const order = ['escuela', 'molino', 'herreria', 'torre', 'hospital', 'ayuntamiento', 'universidad', 'fabrica'];
    if (Exogenous.epidemicsSeen > 0) order.splice(order.indexOf('hospital'), 1), order.unshift('hospital');
    for (const t of order) {
      const def = types[t];
      if (built(t) || !Tech.has(def.tech)) continue;
      if (def.minResidents && res < def.minResidents) continue;
      if ((def.era || 0) > Eras.index) continue;
      if (def.cost.hierro && Economy.stock.hierro < def.cost.hierro) continue;
      return t;
    }
    if (Economy.stock.grano > Economy.capacity('grano') * CONFIG.construction.storageTrigger && !built('granero')) return 'granero';
    return null;
  },
  plan() {
    const need = this.chooseNeed();
    if (!need) { this.pending = null; return; }
    const def = CONFIG.construction.types[need];
    if (!Economy.has(def.cost)) {
      const missing = Economy.missing(def.cost);
      this.pending = { type: need, missing };
      if (Sim.time - this.lastMissingLog > 150) {
        this.lastMissingLog = Sim.time;
        HUD.log(`Falta ${missing.map(r => RESOURCE_LABELS[r].toLowerCase()).join(' y ')} para levantar ${def.label}`);
      }
      return;
    }
    const rec = findSite(need);
    if (!rec) { this.pending = { type: need, missing: ['sitio'] }; return; }
    Economy.spend(def.cost);
    this.startSite(rec, 0);
    this.pending = null;
    HUD.log(`Empieza la obra de ${def.label}`);
  },
  startSite(rec, progress) {
    const def = CONFIG.construction.types[rec.type];
    const travelNode = rec.node && rec.edgeTo ? rec.edgeTo : Graph.nearestNode(rec.x, rec.z, true).id;
    this.site = { rec, progress, workSeconds: def.workSeconds, label: def.label, travelNode, anchor: new THREE.Vector3(rec.x, 0, rec.z) };
    createSiteVisual(rec);
    updateSiteVisual(progress);
  },
  addProgress(dt) {
    if (!this.site) return;
    this.site.progress += dt / this.site.workSeconds;
    updateSiteVisual(Math.min(1, this.site.progress));
    if (this.site.progress >= 1) this.finish();
  },
  finish() {
    const site = this.site;
    removeSiteVisual();
    finishConstruction(site.rec);
    this.site = null;
    this.buildsToday++;
    this.planTimer = CONFIG.construction.planInterval * Ruler.planIntervalMul();
    HUD.log(`Termina ${site.label}: el pueblo crece`);
    for (const a of agents) if (a.activity === 'construir') a.timer = 0;
  },
  siteLabel() {
    if (this.site) return `${this.site.label}, ${Math.round(Math.min(1, this.site.progress) * 100)}%`;
    if (this.pending) {
      if (this.pending.missing[0] === 'sitio') return `sin sitio para ${this.pending.type}`;
      return `falta ${this.pending.missing.map(r => RESOURCE_LABELS[r].toLowerCase()).join(', ')}`;
    }
    return 'ninguna';
  },
  // Rol que más falta hace según el almacén, los edificios y el reparto actual.
  neededRole() {
    const counts = {};
    for (const a of agents) if (!a.removed) counts[a.role] = (counts[a.role] || 0) + 1;
    if (World.botica && !(counts.curandero > 0)) return 'curandero';
    if (World.escuela && !(counts.sabio > 0)) return 'sabio';
    if (World.universidad && (counts.sabio || 0) < 2) return 'sabio';
    if (World.hospital && (counts.curandero || 0) < 2) return 'curandero';
    const s = Economy.stock;
    const weights = {
      pescador: World.anchors.lago && (counts.pescador || 0) < 3 ? 0.7 + (s.grano < 60 ? 1.3 : 0) : 0,
      agricultor: 1.2 + (s.grano < 60 ? 2.5 : 0) + this.residents() / 10,
      lenador: 1 + (s.madera < 40 ? 2 : 0),
      minero: 0.9 + (s.mineral < 20 ? 1.2 : 0) + (s.piedra < 25 ? 0.8 : 0) + World.deposits.length * 0.6,
      aldeano: 0.8,
      guardia: (counts.guardia || 0) < 2 + Math.floor(this.residents() / 15) ? (Ruler.defense() ? 2.5 : 0.7) : 0,
      comerciante: (counts.comerciante || 0) < 3 ? 0.5 : 0
    };
    return weightedPick(weights, null);
  },
  assignHome() {
    let best = null, bestN = Infinity;
    for (const h of World.homes) {
      let n = 0;
      for (const a of agents) if (a.home === h.node && a.isResident && !a.removed) n++;
      if (n < bestN) { bestN = n; best = h; }
    }
    return best ? best.node : 'casa1';
  },
  // Un colono nuevo con su oficio, ya asignado a una casa; lo usan la inmigración y las caravanas.
  spawnImmigrant(role, entry) {
    if (!AgentRenderer.hasRoom(4)) return null;
    const home = this.assignHome();
    const a = new Agent(role, home, { spawnAt: entry });
    if (role === 'comerciante') a.stall = World.stalls[agents.filter(x => x.role === 'comerciante').length % World.stalls.length];
    if (role === 'agricultor') a.field = agents.filter(x => x.role === 'agricultor').length;
    if (role === 'guardia') { a.circuit = agents.find(x => x.role === 'guardia' && x !== a && x.circuit)?.circuit || ['castillo', 'plaza', 'mercado', 'plaza']; a.home = 'castillo'; }
    a.needs.hunger = 0.5;
    return a;
  },
  tryImmigration() {
    const res = this.residents();
    if (res >= this.housingCapacity() || res >= Eras.maxPopulation() || !AgentRenderer.hasRoom(4)) return;
    if (Economy.foodPerCapita(res) < CONFIG.growth.immigrationFoodPerCapita) return;
    const entry = pick(BORDER_NODES);
    const a = this.spawnImmigrant(this.neededRole(), entry);
    if (a) HUD.log(`Llega ${a.name} por el camino ${Graph.node(entry).label} y se instala como ${a.roleWord}`);
  },
  formCouples() {
    const free = agents.filter(a => a.isResident && a.isAdult && !a.follow && a.partnerId === null && !a.removed && a.role !== 'clerigo');
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if (a.partnerId !== null || b.partnerId !== null) continue;
      if (Relations.get(a.id, b.id) < CONFIG.growth.coupleAffinity) continue;
      a.partnerId = b.id; b.partnerId = a.id;
      if (a.role !== 'senor') b.home = a.home; else b.home = a.home;
      HUD.log(`${a.name} y ${b.name} forman una familia`);
    }
  },
  // Al empezar cada día: los niños crecen, los mayores pueden morir, y las parejas con comida de sobra tener un hijo.
  onNewDay(dayStats) {
    const res = this.residents();
    const M = CONFIG.mortality;
    for (const a of agents.slice()) {
      if (a.removed) continue;
      a.age += CONFIG.growth.yearsPerDay;
      if (a.role === 'nino') {
        a.childDays++;
        if (a.childDays >= CONFIG.growth.childGrowDays) a.growUp();
        continue;
      }
      // Vejez: probabilidad diaria que crece con el cuadrado de la edad pasada la vejez.
      if (a.isResident && a.age >= M.oldAge) {
        const t = Math.min(1, (a.age - M.oldAge) / (M.maxAge - M.oldAge));
        if (a.age >= M.maxAge || chance(t * t * M.oldAgeChanceScale)) a.die(a.isFemale ? 'de vieja' : 'de viejo');
      }
    }
    this.births(res);
    Ruler.ensure();
    Ruler.onNewDay(Object.assign({ deathsToday: this.deathsToday, buildsToday: this.buildsToday }, dayStats));
    this.deathsToday = 0;
    this.buildsToday = 0;
  },
  births(res) {
    if (res >= Eras.maxPopulation() || res >= this.housingCapacity() || !AgentRenderer.hasRoom(4)) return;
    if (Economy.foodPerCapita(res) < CONFIG.growth.birthFoodPerCapita) return;
    const seen = new Set();
    for (const a of agents) {
      if (a.partnerId === null || seen.has(a.id) || a.removed || !a.isResident) continue;
      const b = agents.find(x => x.id === a.partnerId && !x.removed);
      if (!b) continue;
      seen.add(a.id); seen.add(b.id);
      let kids = 0;
      for (const c of agents) if (c.follow === a || c.follow === b) kids++;
      if (kids >= 2 || !chance(CONFIG.growth.birthChancePerDay)) continue;
      const child = new Agent('nino', a.home, { scale: 0.62, age: 0 });
      child.follow = a;
      child.pos.copy(a.pos);
      child.node = a.node;
      HUD.log(`Nace ${child.name} en casa de ${a.name} y ${b.name}`);
      break;
    }
  },
  serialize() {
    return {
      site: this.site ? { rec: this.site.rec, progress: this.site.progress } : null,
      planTimer: this.planTimer, immigrationTimer: this.immigrationTimer, deaths: this.deaths, history: this.history, dangerCount: this.dangerCount
    };
  },
  restore(data) {
    this.site = null; this.pending = null;
    if (!data) return;
    this.planTimer = data.planTimer;
    this.immigrationTimer = data.immigrationTimer;
    this.deaths = data.deaths || 0;
    this.history = data.history || [];
    this.dangerCount = data.dangerCount || 0;
    if (data.site) this.startSite(data.site.rec, data.site.progress);
  }
};
