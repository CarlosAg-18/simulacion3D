import { CONFIG } from './config.js';
import { rand, pick, chance, rng, weightedPick } from './utils.js';
import { World, agents, Sim } from './state.js';
import { Water } from './terrain.js';
import { Graph, BORDER_NODES } from './graph.js';
import { Economy } from './economy.js';
import { HUD } from './hud.js';
import { DayCycle } from './calendar.js';
import { Weather } from './weather.js';
import { Growth } from './growth.js';
import { Tech, Ruler } from './tech.js';
import { Animal, animalSpot, countKind } from './animals.js';
import { AgentRenderer } from './agentmesh.js';

// Agentes exógenos: lo que le pasa al pueblo desde fuera de sus reglas. Peste que se contagia por cercanía,
// sequía de verano, riada con tormenta, terremoto, y lo que traen las caravanas: saber, semillas, caballos, colonos y costumbres.
export const Exogenous = {
  epidemic: null, drought: null, flood: null,
  epidemicsSeen: 0, droughtsSeen: 0, floodsSeen: 0, quakesSeen: 0,
  lastFloodDay: -99, shake: 0, seeds: 0, customs: [], dryness: 0, spreadAcc: 0,
  // ---- multiplicadores que consultan los demás sistemas
  foodMul() {
    const S = CONFIG.exogenous.sequia;
    let m = 1 + this.seeds * CONFIG.exogenous.intercambio.seedBonus;
    if (this.drought) m *= Math.min(1, S.yieldMul * (Tech.has('acequias') ? S.acequiasMul : 1));
    return m;
  },
  fishMul() { return this.flood ? 0 : 1; },
  illnessMul() {
    const E = CONFIG.exogenous.epidemia;
    return (World.hospital ? E.hospitalMul : 1) * (Tech.has('medicina') ? E.medicineMul : 1);
  },
  spreadMul() { return Ruler.policy === 'cuarentena' ? CONFIG.exogenous.epidemia.quarantineSpreadMul : 1; },
  infectedCount() { let n = 0; for (const a of agents) if (a.infected && !a.removed) n++; return n; },
  // ---- peste
  infect(a) {
    if (a.removed || a.infected || !a.isResident || a.immuneUntil > Sim.time) return false;
    const E = CONFIG.exogenous.epidemia;
    a.infected = true;
    a.severity = rand(E.severity[0], E.severity[1]);
    a.infectedUntil = Sim.time + E.sickDays * CONFIG.dayLengthSeconds;
    if (this.epidemic) this.epidemic.total++;
    return true;
  },
  startEpidemic(source) {
    const E = CONFIG.exogenous.epidemia;
    if (this.epidemic || Growth.residents() < E.minResidents) return false;
    this.epidemic = { startDay: DayCycle.day, total: 0, deaths: 0, clearDays: 0 };
    this.epidemicsSeen++;
    const cands = agents.filter(a => a.isResident && !a.removed && a.visible && a.immuneUntil <= Sim.time);
    for (let i = 0; i < E.initialCases && cands.length; i++) {
      const a = cands.splice(Math.floor(rng() * cands.length), 1)[0];
      this.infect(a);
    }
    HUD.log(source === 'caravana' ? 'La caravana trae una fiebre desconocida: se declara la peste en Valdecerro' : 'Una fiebre salta de casa en casa: se declara la peste en Valdecerro');
    if (Ruler.agent && !Ruler.agent.removed) Ruler.decree('cuarentena');
    return true;
  },
  endEpidemic() {
    const e = this.epidemic;
    this.epidemic = null;
    const days = DayCycle.day - e.startDay;
    HUD.log(`La peste remite tras ${days} día${days === 1 ? '' : 's'}: ${e.total} contagiados y ${e.deaths} muerto${e.deaths === 1 ? '' : 's'}`);
    if (Ruler.policy === 'cuarentena') Ruler.decree('fiesta');
  },
  spread(seconds) {
    const E = CONFIG.exogenous.epidemia;
    const p = E.spreadPerSecond * seconds * this.spreadMul();
    const r2 = E.spreadRadius * E.spreadRadius;
    for (const a of agents) {
      if (!a.infected || a.removed || !a.visible || a.sleeping) continue;
      for (const b of agents) {
        if (b === a || b.infected || b.removed || !b.visible || b.sleeping || !b.isResident || b.immuneUntil > Sim.time) continue;
        if (a.pos.distanceToSquared(b.pos) > r2) continue;
        if (chance(p)) this.infect(b);
      }
    }
  },
  onRecovered() {},
  onDeath(agent) {
    if (this.epidemic && agent.infected) this.epidemic.deaths++;
  },
  // ---- sequía, riada y terremoto
  startDrought() {
    const S = CONFIG.exogenous.sequia;
    this.drought = { daysLeft: Math.round(rand(S.minDays, S.maxDays)) };
    this.droughtsSeen++;
    HUD.log(`El calor agosta los campos: empieza una sequía${Tech.has('acequias') ? ', pero las acequias salvan parte de la cosecha' : ''}`);
    if (Ruler.agent && !Ruler.agent.removed && Ruler.policy !== 'cuarentena') Ruler.decree('cosecha');
  },
  startFlood() {
    const F = CONFIG.exogenous.riada;
    this.flood = { t: 0, duration: F.duration };
    this.floodsSeen++;
    this.lastFloodDay = DayCycle.day;
    Water.riseTarget = CONFIG.water.floodRise;
    const lost = Economy.take('grano', Economy.stock.grano * F.cropLoss);
    const wood = Economy.take('madera', F.woodDamage);
    for (const a of agents) if (a.isResident && !a.removed) a.needs.mood = Math.max(0, a.needs.mood - F.moodLoss);
    HUD.log(`El arroyo se desborda: la riada anega los campos bajos, se pierden ${Math.round(lost)} de comida y ${Math.round(wood)} de madera en reparos`);
  },
  endFlood() {
    this.flood = null;
    Water.riseTarget = 0;
    HUD.log('Bajan las aguas: el pueblo vuelve a la orilla tras la riada');
  },
  doQuake() {
    const Q = CONFIG.exogenous.terremoto;
    this.shake = Q.shakeSeconds;
    this.quakesSeen++;
    const stone = Economy.take('piedra', Q.repair.piedra), wood = Economy.take('madera', Q.repair.madera);
    const cands = agents.filter(a => a.isResident && !a.removed);
    let hurt = 0;
    for (let i = 0; i < Q.injuries && cands.length; i++) {
      const a = cands.splice(Math.floor(rng() * cands.length), 1)[0];
      a.needs.health = Math.max(0.05, a.needs.health - Q.injuryHit);
      hurt++;
    }
    for (const a of agents) if (a.isResident && !a.removed) a.needs.mood = Math.max(0, a.needs.mood - Q.moodLoss);
    HUD.log(`Tiembla la tierra en Valdecerro: ${hurt} herido${hurt === 1 ? '' : 's'} y grietas que cuestan ${Math.round(stone)} de piedra y ${Math.round(wood)} de madera`);
  },
  // ---- intercambio cultural con la caravana
  onCaravan() {
    const E = CONFIG.exogenous.epidemia, I = CONFIG.exogenous.intercambio;
    if (chance(E.caravanChance)) this.startEpidemic('caravana');
    if (chance(I.chancePerCaravan)) this.exchange();
  },
  exchange() {
    const I = CONFIG.exogenous.intercambio;
    const bias = {
      saber: Tech.current ? 1 : 0,
      semillas: this.seeds < I.maxSeeds ? 1 : 0,
      caballos: countKind('caballo') < CONFIG.animals.maxCaballos && Economy.stock.grano >= I.horsePrice + 20 ? 1 : 0,
      colono: Growth.residents() < Growth.housingCapacity() && AgentRenderer.hasRoom(4) ? 1 : 0,
      costumbre: this.customs.length < I.customs.length ? 1 : 0
    };
    const kind = weightedPick(I.weights, null, bias);
    if (kind === 'saber') {
      const t = Tech.current;
      Tech.points += t.cost * I.knowledgeShare;
      HUD.log(`Los mercaderes traen noticias de otras tierras sobre ${t.label.toLowerCase()}: el pueblo avanza en su estudio`);
    } else if (kind === 'semillas') {
      this.seeds++;
      HUD.log('La caravana trae semillas de otras tierras: los campos rendirán más');
    } else if (kind === 'caballos') {
      Economy.take('grano', I.horsePrice);
      new Animal('caballo', animalSpot('caballo', countKind('caballo')));
      HUD.log(`La caravana deja un caballo a cambio de ${I.horsePrice} de comida`);
    } else if (kind === 'colono') {
      const roles = ['sabio', 'curandero', 'lenador', 'agricultor'];
      if (World.anchors.lago) roles.push('pescador');
      const role = pick(roles);
      const a = Growth.spawnImmigrant(role, pick(BORDER_NODES));
      if (a) HUD.log(`Con la caravana llega ${a.name}, ${a.roleWord} de tierras lejanas, y se queda en Valdecerro`);
    } else if (kind === 'costumbre') {
      const left = I.customs.filter(c => !this.customs.includes(c));
      const c = pick(left);
      this.customs.push(c);
      for (const a of agents) if (a.isResident && !a.removed) a.needs.mood = Math.min(1, a.needs.mood + 0.1);
      HUD.log(`El pueblo adopta de los mercaderes la costumbre ${c.startsWith('el ') ? 'del ' + c.slice(3) : 'de ' + c}: habrá más ferias`);
    }
  },
  // Respuesta al cambio: tras una sequía se estudian las acequias; tras una peste, el hospital.
  preferredTech(list) {
    if (this.droughtsSeen > 0) { const t = list.find(t => t.id === 'acequias'); if (t) return t; }
    if (this.epidemicsSeen > 0) { const t = list.find(t => t.id === 'hospital'); if (t) return t; }
    return null;
  },
  // ---- ciclo
  update(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.flood) {
      this.flood.t += dt;
      if (this.flood.t >= this.flood.duration) this.endFlood();
    } else if (Weather.isStorm && DayCycle.day - this.lastFloodDay >= CONFIG.exogenous.riada.minDayGap) {
      if (rng() < CONFIG.exogenous.riada.chancePerStorm / 80 * dt) this.startFlood();
    }
    this.dryness += ((this.drought ? 1 : 0) - this.dryness) * Math.min(1, dt * 0.02);
    if (this.epidemic) {
      this.spreadAcc += dt;
      if (Sim.frame % 20 === 0) { this.spread(this.spreadAcc); this.spreadAcc = 0; }
    }
  },
  onNewDay() {
    const X = CONFIG.exogenous;
    if (this.epidemic) {
      if (this.infectedCount() === 0) { this.epidemic.clearDays++; if (this.epidemic.clearDays >= X.epidemia.endAfterClearDays) this.endEpidemic(); }
      else this.epidemic.clearDays = 0;
    } else {
      const p = X.epidemia.chancePerDay * (1 + Growth.residents() / 30) * (DayCycle.season === 'Invierno' ? X.epidemia.winterMul : 1);
      if (chance(p)) this.startEpidemic('casa');
    }
    if (this.drought) {
      this.drought.daysLeft--;
      for (const a of agents) if (a.isResident && !a.removed) a.needs.mood = Math.max(0, a.needs.mood - X.sequia.moodLossPerDay);
      if (this.drought.daysLeft <= 0) { this.drought = null; HUD.log('Vuelven las lluvias y termina la sequía'); }
    } else if (DayCycle.season === 'Verano' && DayCycle.dayOfSeason === 1 && DayCycle.year >= X.sequia.firstYear && chance(X.sequia.chancePerSeason)) this.startDrought();
    if (chance(X.terremoto.chancePerDay)) this.doQuake();
  },
  // Sesgo del clima: en sequía casi no llueve.
  weatherBias() { return this.drought ? { SOLEADO: 3, NUBLADO: 1, FRIO: 0.5, LLUVIA: 0.08, TORMENTA: 0.15 } : null; },
  alerts() {
    const out = [];
    if (this.epidemic) out.push(`Peste: ${this.infectedCount()} contagiados, ${this.epidemic.deaths} muertos`);
    if (this.drought) out.push(`Sequía: ${this.drought.daysLeft} día${this.drought.daysLeft === 1 ? '' : 's'} más sin lluvia`);
    if (this.flood) out.push('Riada: el arroyo se ha desbordado');
    if (this.shake > 0) out.push('Terremoto');
    return out;
  },
  serialize() {
    return {
      epidemic: this.epidemic, drought: this.drought, flood: this.flood ? { t: this.flood.t, duration: this.flood.duration } : null,
      seen: [this.epidemicsSeen, this.droughtsSeen, this.floodsSeen, this.quakesSeen], lastFloodDay: this.lastFloodDay,
      seeds: this.seeds, customs: this.customs.slice()
    };
  },
  restore(data) {
    this.epidemic = null; this.drought = null; this.flood = null; this.shake = 0; this.seeds = 0; this.customs = []; this.dryness = 0;
    this.epidemicsSeen = 0; this.droughtsSeen = 0; this.floodsSeen = 0; this.quakesSeen = 0; this.lastFloodDay = -99;
    Water.riseTarget = 0;
    if (!data) return;
    this.epidemic = data.epidemic || null;
    this.drought = data.drought || null;
    this.flood = data.flood || null;
    if (this.flood) Water.riseTarget = CONFIG.water.floodRise;
    if (data.seen) [this.epidemicsSeen, this.droughtsSeen, this.floodsSeen, this.quakesSeen] = data.seen;
    this.lastFloodDay = data.lastFloodDay === undefined ? -99 : data.lastFloodDay;
    this.seeds = data.seeds || 0;
    this.customs = data.customs || [];
    this.dryness = this.drought ? 1 : 0;
  }
};
