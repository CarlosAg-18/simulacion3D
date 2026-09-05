import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, randInt, pick, chance, rng, weightedPick } from './utils.js';
import { Render, World, agents } from './state.js';
import { terrainHeight } from './terrain.js';
import { Graph, BORDER_NODES } from './graph.js';
import { HUD } from './hud.js';
import { Economy } from './economy.js';
import { DayCycle } from './calendar.js';
import { STATE, Mover, spawnTraveler } from './agents.js';
import { Wolf, wolves, removeAllWolves } from './animals.js';
import { makeFlame } from './buildings.js';
import { Deposits } from './world.js';
import { Tech, Ruler } from './tech.js';
import { Growth } from './growth.js';
import { Exogenous } from './exogenos.js';

function makeFeria() {
  return {
    node: 'plaza', anchor: new THREE.Vector3(0, 0, 0),
    duration: rand(CONFIG.events.feria.min, CONFIG.events.feria.max),
    wants(a) { return a.role !== 'guardia' && a.role !== 'nino' && !a.follow && !a.sleeping && !a.sick && a.needs.hunger < CONFIG.needs.eventHungerLimit; },
    start() { Render.scene.add(World.feria); HUD.log('Comienza la feria en la plaza'); },
    update() {},
    end() { Render.scene.remove(World.feria); HUD.log('Termina la feria y se recogen las carpas'); }
  };
}
function makeMisa() {
  return {
    node: 'iglesia', anchor: World.anchors.iglesia,
    duration: CONFIG.events.misa.duration,
    wants(a) { return (a.role === 'aldeano' || a.role === 'clerigo') && !a.follow && !a.sleeping && a.needs.hunger < CONFIG.needs.eventHungerLimit; },
    start() { HUD.log('Repican las campanas, empieza la misa'); },
    update() {
      const bell = World.church.userData.bell;
      const decay = Math.max(0, 1 - this.elapsed / 14);
      bell.rotation.z = Math.sin(this.elapsed * 8) * 0.6 * decay;
    },
    end() { World.church.userData.bell.rotation.z = 0; HUD.log('Termina la misa y los fieles salen de la iglesia'); }
  };
}
function makeCaravana() {
  const entry = pick(BORDER_NODES);
  const exit = pick(BORDER_NODES.filter(id => id !== entry));
  const stay = rand(CONFIG.events.caravana.stayMin, CONFIG.events.caravana.stayMax);
  const travel = (Graph.routeDist(entry, 'mercado') + Graph.routeDist('mercado', exit)) / CONFIG.speed.cart;
  return {
    node: null, anchor: null,
    duration: travel + stay + 15,
    entry, exit, stay,
    count: randInt(CONFIG.events.caravana.min, CONFIG.events.caravana.max),
    spawned: 0, spawnT: 1.2, cartPhase: 'in', cartTimer: stay,
    wants() { return false; },
    start() {
      const mover = Events.cartMover;
      mover.legs = null;
      mover.setNode(entry);
      mover.pos.y = terrainHeight(mover.pos.x, mover.pos.z);
      mover.routeTo('mercado');
      const first = mover.legs[0].pts[0];
      mover.heading = Math.atan2(first.x - mover.pos.x, first.z - mover.pos.z);
      mover.targetHeading = mover.heading;
      Render.scene.add(World.cart);
      HUD.log(`Una caravana de mercaderes entra por el camino ${Graph.node(entry).label}`);
    },
    update(dt) {
      const mover = Events.cartMover;
      let rolling = false;
      if (this.cartPhase === 'in') {
        rolling = true;
        if (mover.advance(dt)) { this.cartPhase = 'wait'; this.trade(); }
      } else if (this.cartPhase === 'wait') {
        this.cartTimer -= dt;
        if (this.cartTimer <= 0) { this.cartPhase = 'out'; mover.routeTo(this.exit); }
      } else if (this.cartPhase === 'out') {
        rolling = true;
        if (mover.advance(dt)) { this.cartPhase = 'done'; Render.scene.remove(World.cart); }
      }
      if (this.cartPhase !== 'done') {
        mover.updateHeading(dt);
        mover.pos.y = terrainHeight(mover.pos.x, mover.pos.z);
        if (rolling) for (const w of World.cart.userData.wheels) w.rotation.x += dt * CONFIG.speed.cart / 0.6;
      }
      // Los mercaderes salen en fila detrás del carro, uno cada segundo y medio.
      if (this.spawned < this.count) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          const t = spawnTraveler(this.entry, { silent: true, plan: [{ node: 'mercado', stay: this.stay - this.spawned * 1.5 }] });
          if (t) t.exitNode = this.exit;
          this.spawned++;
          this.spawnT = 1.5;
        }
      }
    },
    // Comercio real: la caravana compra los excedentes y vende lo que escasea, a precios de temporada.
    trade() {
      const r = Economy.tradeWithCaravan(DayCycle.season);
      const parts = [];
      if (r.sold.length) parts.push(`compra ${r.sold.join(', ')}`);
      if (r.bought.length) parts.push(`vende ${r.bought.join(', ')}`);
      if (!parts.length) HUD.log('La caravana no encuentra nada que comerciar');
      else HUD.log(`La caravana ${parts.join(' y ')}; el pueblo ${r.net >= 0 ? 'gana' : 'gasta'} ${Math.abs(Math.round(r.net))} monedas`);
      // Con la mercancía llegan noticias, semillas, animales, gentes y a veces fiebres.
      Exogenous.onCaravan();
    },
    end() {
      if (this.cartPhase !== 'done') Render.scene.remove(World.cart);
      HUD.log('La caravana sigue su camino fuera del valle');
    }
  };
}
function makeTurnoMina() {
  return {
    node: 'mina', anchor: World.anchors.mina,
    duration: CONFIG.events.mina.duration,
    gained: 0,
    wants(a) { return a.role === 'minero' && !a.sleeping && !a.sick && a.needs.hunger < CONFIG.needs.eventHungerLimit; },
    start() { HUD.log('Suena el cuerno: turno extra en la mina'); },
    update(dt) {
      let working = 0;
      for (const a of agents) {
        if (a.role !== 'minero' || a.node !== 'mina' || a.legs) continue;
        if (a.state === STATE.ATTEND_EVENT || a.state === STATE.WORK) working++;
      }
      const scale = CONFIG.economy.referenceDay / CONFIG.dayLengthSeconds;
      const g = Economy.add('mineral', working * CONFIG.economy.production.mineral * scale * 1.5 * dt);
      this.gained += g;
      Events.mineProduction += g;
    },
    end() { HUD.log(`Termina el turno extra: la mina rinde ${Math.round(this.gained)} de mineral`); }
  };
}
function makeMercadoActivo() {
  return {
    node: 'mercado', anchor: null,
    duration: CONFIG.events.mercado.duration,
    wants(a) { return a.role === 'aldeano' && a.marketEvent === this.id && !a.sleeping && a.needs.hunger < CONFIG.needs.eventHungerLimit; },
    start() {
      for (const a of agents) if (a.role === 'aldeano' && !a.follow && chance(0.6)) a.marketEvent = this.id;
      HUD.log('Se anima el mercado: los puestos se llenan de compradores');
    },
    update() {},
    end() { HUD.log('El mercado vuelve a la calma'); }
  };
}
// Lobos: salen del bosque, los guardias acuden a la granja; al terminar se retiran los que queden.
function makeLobos() {
  const L = CONFIG.dangers.lobos;
  return {
    node: 'granja', anchor: World.anchors.campos[0], danger: true,
    duration: L.duration, taken: 0, scared: 0,
    wants(a) { return a.role === 'guardia'; },
    start() {
      const b = Graph.node('bosque');
      for (let i = 0; i < L.count; i++) new Wolf(b.x + rand(-4, 4), b.z + rand(-4, 4));
      Growth.dangerCount++;
      HUD.log('Aúllan lobos en el bosque; los guardias corren a la granja');
    },
    update(dt) { for (const w of wolves.slice()) w.update(dt, this); },
    end() {
      removeAllWolves();
      if (this.taken > 0) for (const a of agents) if (a.isResident) a.needs.mood = Math.max(0, a.needs.mood - L.moodLoss);
      HUD.log(this.taken > 0 ? `Los lobos se retiran con ${this.taken} gallina${this.taken > 1 ? 's' : ''}` : 'Los lobos se retiran sin llevarse nada');
    }
  };
}
// Incendio en una casa: vecinos y guardias acuden con cubos; si nadie llega a tiempo, cuesta madera reparar.
function makeIncendio() {
  const F = CONFIG.dangers.incendio;
  const home = pick(World.homes);
  const b = World.buildings[home.key];
  return {
    node: home.node, anchor: home.door.clone(), danger: true, home,
    duration: F.duration, progress: 0, extinguished: false,
    wants(a) {
      if (a.sleeping || a.follow || !a.isAdult || a.role === 'senor') return false;
      let n = 0;
      for (const x of agents) if (x.eventId === this.id && x.state === STATE.ATTEND_EVENT) n++;
      if (n >= F.maxResponders + (World.buildings.torre ? 2 : 0)) return false;
      if (a.role === 'guardia') return true;
      return a.isResident && Math.hypot(a.pos.x - b.position.x, a.pos.z - b.position.z) < F.responderRadius;
    },
    start() {
      if (!World.flame) World.flame = makeFlame();
      World.flame.position.set(b.position.x, b.position.y + 2.2, b.position.z);
      Render.scene.add(World.flame);
      Growth.dangerCount++;
      const owner = agents.find(a => a.home === home.node && a.isResident && !a.removed);
      HUD.log(`Se declara un incendio en ${owner ? 'casa de ' + owner.name : 'una casa'}`);
    },
    update(dt) {
      let n = 0;
      for (const a of agents) {
        if (a.eventId !== this.id || a.state !== STATE.ATTEND_EVENT || a.legs) continue;
        if (Math.hypot(a.pos.x - b.position.x, a.pos.z - b.position.z) < 10) n++;
      }
      this.progress += n * dt / F.workSeconds;
      const strength = Math.max(0, 1 - this.progress);
      const u = World.flame.userData;
      u.flames.forEach((f, i) => { const s = (0.85 + 0.25 * Math.sin(this.elapsed * 13 + i * 2)) * (0.5 + 0.5 * strength); f.scale.set(s, s * 1.2, s); });
      u.smoke.forEach((s, i) => { s.position.y = 3 + i * 1.4 + Math.sin(this.elapsed * 2 + i) * 0.3; s.visible = strength > 0.05; });
      u.light.intensity = (70 + 30 * Math.sin(this.elapsed * 17)) * (0.4 + 0.6 * strength);
      if (this.progress >= 1) { this.extinguished = true; this.elapsed = this.duration; }
    },
    end() {
      Render.scene.remove(World.flame);
      for (const a of agents) if (a.home === home.node && a.isResident) a.needs.mood = Math.max(0, a.needs.mood - F.moodLoss);
      if (this.extinguished) HUD.log('Los vecinos apagan el incendio a cubos de agua del pozo');
      else {
        const wood = Economy.take('madera', F.repairWood);
        HUD.log(`El fuego se apaga solo tras dañar la casa; reparar cuesta ${Math.round(wood)} de madera`);
      }
    }
  };
}
// Expedición: dos vecinos salen a un punto lejano; si hay un yacimiento cerca, lo descubren.
function makeExpedicion() {
  const E = CONFIG.expedition;
  const hidden = Deposits.undiscovered();
  let tx, tz;
  if (hidden.length && chance(E.nearDepositChance)) {
    const d = pick(hidden);
    tx = d.x + rand(-6, 6); tz = d.z + rand(-6, 6);
  } else {
    const a = rand(0, Math.PI * 2), r = rand(55, 88);
    tx = Math.cos(a) * r; tz = Math.sin(a) * r;
  }
  const near = Graph.nearestNode(tx, tz, true);
  const dir = Deposits.direction(tx, tz);
  return {
    node: near.id, anchor: new THREE.Vector3(tx, 0, tz), duration: E.duration, danger: false, found: null,
    wants(a) {
      if (!a.isResident || !a.isAdult || a.follow || a.sleeping || a.sick) return false;
      if (['guardia', 'senor', 'sabio', 'curandero', 'clerigo', 'nino'].includes(a.role)) return false;
      let n = 0;
      for (const x of agents) if (x.eventId === this.id && x.state === STATE.ATTEND_EVENT) n++;
      return n < E.members;
    },
    start() { HUD.log(`Parte una expedición a explorar ${dir} del valle`); },
    update() {},
    end() {
      let explorer = false;
      for (const a of agents) if (a.eventId === this.id && Math.hypot(a.pos.x - tx, a.pos.z - tz) < 22) { explorer = true; break; }
      const dep = explorer ? Deposits.undiscovered().find(d => Math.hypot(d.x - tx, d.z - tz) < CONFIG.deposits.discoverRadius) : null;
      if (dep) {
        Deposits.discover(dep);
        this.found = dep;
        Ruler.popularity = Math.min(1, Ruler.popularity + 0.05);
        HUD.log(`La expedición descubre un yacimiento de ${dep.kind} ${Deposits.direction(dep.x, dep.z)}; los mineros ya tienen camino`);
      } else HUD.log('La expedición regresa sin novedades');
    }
  };
}
// Revuelta: los descontentos se plantan ante el castillo hasta que el señor cede.
function makeRevuelta() {
  return {
    node: 'castillo', anchor: World.anchors.castillo, duration: 45, danger: true,
    wants(a) {
      if (!a.isResident || !a.isAdult || a.follow || a.sleeping) return false;
      if (a.role === 'guardia' || a.role === 'senor') return false;
      let n = 0;
      for (const x of agents) if (x.eventId === this.id && x.state === STATE.ATTEND_EVENT) n++;
      return n < 8 && a.needs.mood < 0.5;
    },
    start() { HUD.log(`El pueblo se amotina a las puertas del castillo contra ${Ruler.name}`); },
    update() {},
    end() {
      Ruler.onRevoltEnd();
      HUD.log('El señor cede: perdona impuestos dos días y manda abrir el granero');
    }
  };
}
const EVENT_FACTORIES = { feria: makeFeria, misa: makeMisa, caravana: makeCaravana, mina: makeTurnoMina, mercado: makeMercadoActivo, lobos: makeLobos, incendio: makeIncendio, expedicion: makeExpedicion, revuelta: makeRevuelta };
export const Events = {
  current: null,
  timer: CONFIG.events.firstDelay,
  last: null,
  nextId: 1,
  mineProduction: 0,
  travelerTick: 0,
  cartMover: null,
  get marketActive() { return this.current !== null && this.current.kind === 'mercado'; },
  get burningHome() { return this.current && this.current.kind === 'incendio' ? this.current.home.node : null; },
  init() { this.cartMover = new Mover(World.cart.position, CONFIG.speed.cart, World.cart); },
  start(kind) {
    const ev = EVENT_FACTORIES[kind]();
    ev.id = this.nextId++;
    ev.kind = kind;
    ev.elapsed = 0;
    this.current = ev;
    this.last = kind;
    ev.start();
  },
  end() {
    this.current.end();
    this.current = null;
    this.timer = rand(CONFIG.events.minInterval, CONFIG.events.maxInterval);
  },
  update(dt) {
    if (this.current) {
      this.current.elapsed += dt;
      this.current.update(dt);
      if (this.current.elapsed >= this.current.duration) this.end();
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        // Los lobos solo salen de noche; el incendio necesita alguna casa habitada.
        const q = Ruler.policy === 'cuarentena';
        const bias = {
          feria: q ? 0 : 1 + Exogenous.customs.length * 0.4,
          misa: q ? 0 : 1,
          mercado: q ? 0 : 1,
          lobos: DayCycle.isNight() ? 1 : 0,
          incendio: World.homes.length ? 1 : 0,
          expedicion: Tech.has('cartografia') && Deposits.undiscovered().length > 0 && !DayCycle.isNight() ? 1 : 0
        };
        this.start(weightedPick(CONFIG.events.weights, this.last, bias));
      }
    }
    // Viajeros espontáneos: tirada una vez por segundo simulado, con probabilidad por minuto.
    this.travelerTick += dt;
    if (this.travelerTick >= 1) {
      this.travelerTick -= 1;
      let travelers = 0;
      for (const a of agents) if (a.role === 'viajero') travelers++;
      if (travelers < CONFIG.travelers.max && rng() < CONFIG.travelers.chancePerMinute / 60) spawnTraveler(pick(BORDER_NODES));
    }
  },
  // Los eventos en curso no se guardan: al cargar, el temporizador arranca de nuevo.
  serialize() { return { timer: this.current ? rand(CONFIG.events.minInterval, CONFIG.events.maxInterval) : this.timer, last: this.last, nextId: this.nextId, mineProduction: this.mineProduction }; },
  restore(data) {
    this.current = null;
    if (!data) return;
    this.timer = data.timer;
    this.last = data.last;
    this.nextId = data.nextId;
    this.mineProduction = data.mineProduction || 0;
  }
};
