import { CONFIG, POLICY_LABELS } from './config.js';
import { rand, pick, chance, clamp } from './utils.js';
import { World, agents, Sim } from './state.js';
import { Economy, RESOURCE_LABELS } from './economy.js';
import { HUD } from './hud.js';
import { Events } from './events.js';
import { Agent, Relations } from './agents.js';
import { AgentRenderer } from './agentmesh.js';
import { Growth } from './growth.js';
import { Eras } from './eras.js';
import { Exogenous } from './exogenos.js';

// Saberes: el conocimiento lo generan clérigos, sabios y la escuela; cada avance desbloquea algo concreto.
export const Tech = {
  points: 0, unlocked: new Set(), current: null, waiting: null, waitLog: -999,
  has(id) { return this.unlocked.has(id); },
  available() {
    return CONFIG.tech.tree.filter(t => !this.unlocked.has(t.id)
      && t.requires.every(r => this.unlocked.has(r))
      && (!t.needsResource || World.deposits.some(d => d.kind === t.needsResource)));
  },
  // Respuesta al cambio: tras una sequía o una peste el pueblo estudia primero lo que le habría salvado.
  pickNext() {
    const list = this.available();
    this.current = Exogenous.preferredTech(list) || (list.length ? list[0] : null);
  },
  rate() {
    const T = CONFIG.tech;
    let clerigos = 0, sabios = 0;
    for (const a of agents) {
      if (a.removed || a.sleeping) continue;
      if (a.role === 'clerigo' && a.activity === 'trabajar') clerigos++;
      if (a.role === 'sabio' && a.activity === 'trabajar') sabios++;
    }
    let r = T.pointsPerDayBase + clerigos * T.pointsPerClerigo + sabios * T.pointsPerSabio;
    if (World.escuela) r *= T.schoolMul;
    if (Ruler.policy === 'saber') r *= T.policyMul;
    if (this.has('imprenta')) r *= 1.5;
    if (World.universidad) r *= 1.4;
    return r * Eras.techMul();
  },
  update(dt) {
    if (!this.current) this.pickNext();
    if (!this.current) return;
    this.points += this.rate() * dt / CONFIG.dayLengthSeconds;
    if (this.points >= this.current.cost) {
      // Los avances cuestan materiales además de estudio: sin ellos el saber espera en el almacén.
      const t = this.current;
      if (t.res && !Economy.has(t.res)) {
        this.waiting = t.id;
        if (Sim.time - this.waitLog > 200) {
          this.waitLog = Sim.time;
          HUD.log(`Falta ${Economy.missing(t.res).map(r => RESOURCE_LABELS[r].toLowerCase()).join(' y ')} para completar ${t.label.toLowerCase()}`);
        }
        return;
      }
      if (t.res) Economy.spend(t.res);
      this.waiting = null;
      this.points -= t.cost;
      this.unlock(t);
      this.pickNext();
    }
  },
  unlock(t) {
    this.unlocked.add(t.id);
    if (t.id === 'orfebreria') Economy.goldBonus = true;
    HUD.log(`El pueblo descubre ${t.label.toLowerCase()}: ${t.desc}`);
  },
  progress() { return this.current ? clamp(this.points / this.current.cost, 0, 1) : 0; },
  foodMul() { return (this.has('arado') ? 1.3 : 1) * (World.buildings.molino ? 1.2 : 1) * (this.has('acequias') ? 1.1 : 1); },
  toolMul() { return World.buildings.herreria ? 1.25 : 1; },
  healMul() { return (this.has('medicina') ? 1.5 : 1) * (World.hospital ? 1.6 : 1); },
  serialize() { return { points: this.points, unlocked: Array.from(this.unlocked), current: this.current ? this.current.id : null }; },
  restore(data) {
    this.points = 0; this.unlocked = new Set(); this.current = null;
    if (!data) { this.pickNext(); return; }
    this.points = data.points || 0;
    this.unlocked = new Set(data.unlocked || []);
    if (this.has('orfebreria')) Economy.goldBonus = true;
    this.current = CONFIG.tech.tree.find(t => t.id === data.current) || null;
    if (!this.current) this.pickNext();
  }
};

// El señor del castillo: cobra impuestos al tesoro, decreta políticas, gana o pierde popularidad
// y puede ser depuesto por una revuelta. Al morir, le sucede su heredero.
export const Ruler = {
  agent: null, policy: null, policyDaysLeft: 0, popularity: CONFIG.ruler.popularity.start,
  revoltDays: 0, taxHoliday: 0, deposed: 0, council: false, electionDays: 0,
  rulerRole() { return this.council ? 'alcalde' : 'senor'; },
  titleFor(a) { return this.council ? (a && a.isFemale ? 'Alcaldesa' : 'Alcalde') : (a && a.isFemale ? 'Señora' : 'Señor'); },
  init() {
    const home = 'castillo';
    const a = new Agent('senor', home, { age: rand(32, 48) });
    this.agent = a;
    HUD.log(`${a.name} gobierna Valdecerro desde el castillo`);
  },
  get name() { return this.agent && !this.agent.removed ? this.agent.name : 'nadie'; },
  taxMul() {
    if (this.taxHoliday > 0) return 0;
    return (this.policy === 'austeridad' ? 2 : 1) * (this.council ? CONFIG.ruler.councilTaxMul : 1);
  },
  planIntervalMul() { return this.policy === 'expansion' ? 0.5 : 1; },
  foodMul() { return this.policy === 'cosecha' ? 1.2 : 1; },
  defense() { return this.policy === 'defensa'; },
  choosePolicy() {
    const res = Growth.residents();
    const food = Economy.foodPerCapita(res);
    const housing = res / Growth.housingCapacity();
    if (Exogenous.epidemic) return 'cuarentena';
    if (Exogenous.drought) return 'cosecha';
    if (food < 2.2) return 'cosecha';
    if (housing > 0.85) return 'expansion';
    if (Growth.dangerCount > 0 && chance(0.6)) return 'defensa';
    if (this.popularity < 0.45 && Economy.treasury >= CONFIG.ruler.fiestaCost) return 'fiesta';
    if (Economy.treasury < 10 && this.popularity > 0.6) return 'austeridad';
    return pick(['saber', 'saber', 'fiesta', 'cosecha']);
  },
  decree(policy) {
    if (policy === 'fiesta' && Exogenous.epidemic) policy = 'cuarentena';
    this.policy = policy;
    this.policyDaysLeft = CONFIG.ruler.decreeIntervalDays;
    if (policy === 'fiesta') {
      const cost = CONFIG.ruler.fiestaCost;
      if (Economy.treasury >= cost && !Events.current) {
        Economy.spendTreasury(cost);
        Events.start('feria');
        this.popularity = clamp(this.popularity + CONFIG.ruler.popularity.fiestaGain, 0, 1);
      }
    }
    HUD.log(`${this.name} proclama: ${POLICY_LABELS[policy].toLowerCase()}`);
  },
  onNewDay(stats) {
    const P = CONFIG.ruler.popularity;
    let pop = this.popularity;
    if (stats.foodPerCapita > 2.5) pop += P.foodGain;
    if (stats.avgHunger > 0.75) pop -= P.hungerLoss;
    pop -= stats.deathsToday * P.deathLoss;
    if (stats.tax > 0) pop -= P.taxLoss * (this.policy === 'austeridad' ? 2 : 1);
    if (stats.buildsToday > 0) pop += P.buildGain;
    if (stats.lampsToday > 0) pop += P.lampGain;
    this.popularity = clamp(pop, 0, 1);
    if (this.taxHoliday > 0) this.taxHoliday--;
    Growth.dangerCount = Math.max(0, Growth.dangerCount - 1);
    if (this.policyDaysLeft > 0) this.policyDaysLeft--;
    if (this.policyDaysLeft <= 0) this.decree(this.choosePolicy());
    if (!this.council && World.ayuntamiento) this.formCouncil();
    if (this.council) {
      this.electionDays--;
      if (this.electionDays <= 0 || this.popularity < CONFIG.ruler.snapElectionBelow) this.election();
    } else if (this.popularity < CONFIG.ruler.revoltBelow) {
      this.revoltDays++;
      if (!Events.current && this.revoltDays === 1) Events.start('revuelta');
      if (this.revoltDays >= CONFIG.ruler.deposeDays) this.depose();
    } else this.revoltDays = 0;
  },
  // Con ayuntamiento el señorío se convierte en concejo: el alcalde sale de elecciones periódicas, no de la sangre.
  formCouncil() {
    this.council = true;
    this.electionDays = CONFIG.ruler.electionDays;
    this.revoltDays = 0;
    const a = this.agent;
    if (a && !a.removed) {
      a.setRole('alcalde', Growth.assignHome());
      HUD.log(`Se constituye el concejo de Valdecerro: ${a.name} deja el castillo y gobierna como ${a.isFemale ? 'alcaldesa' : 'alcalde'} hasta las elecciones`);
    } else HUD.log('Se constituye el concejo de Valdecerro: los vecinos elegirán alcalde');
  },
  affinityOf(id) {
    let s = 0;
    for (const [k, v] of Relations.map) if (Math.floor(k / 100000) === id || k % 100000 === id) s += v;
    return s;
  },
  election() {
    this.electionDays = CONFIG.ruler.electionDays;
    const c = this.candidates();
    const cur = this.agent && !this.agent.removed ? this.agent : null;
    if (cur) c.push(cur);
    if (!c.length) return;
    const score = (a) => a.needs.mood * 2 + Math.min(1, this.affinityOf(a.id) / 20) + (a === cur ? this.popularity * 0.6 : 0);
    const win = c.reduce((b, a) => score(a) > score(b) ? a : b, c[0]);
    if (win === cur) {
      this.popularity = Math.max(this.popularity, 0.5);
      HUD.log(`${cur.name} revalida la alcaldía en las elecciones del concejo`);
      return;
    }
    if (cur) cur.becomeCommoner();
    win.becomeRuler();
    this.agent = win;
    this.popularity = CONFIG.ruler.popularity.start;
    this.revoltDays = 0;
    HUD.log(`Los vecinos eligen ${win.isFemale ? 'alcaldesa' : 'alcalde'} a ${win.name}`);
  },
  onRevoltEnd() {
    this.popularity = clamp(this.popularity + CONFIG.ruler.popularity.revoltGain, 0, 1);
    this.taxHoliday = CONFIG.ruler.taxHolidayDays;
    this.policy = 'cosecha';
    this.policyDaysLeft = CONFIG.ruler.decreeIntervalDays;
  },
  candidates() {
    return agents.filter(a => a.isResident && a.isAdult && !a.removed && a.role !== 'senor' && a.role !== 'alcalde' && a.role !== 'nino' && a.role !== 'viajero' && !a.follow);
  },
  // Sucesión: pareja o hijo del señor, y si no, el vecino de mejor ánimo.
  succession(dead) {
    if (this.council) { this.agent = null; this.election(); return; }
    let heir = null;
    if (dead) {
      if (dead.partnerId !== null) heir = agents.find(a => a.id === dead.partnerId && !a.removed) || null;
      if (!heir) heir = agents.find(a => a.follow === dead) || null;
      if (heir && heir.role === 'nino') heir = null;
    }
    if (!heir) {
      const c = this.candidates();
      if (!c.length) { this.agent = null; return; }
      heir = c.reduce((b, a) => a.needs.mood > b.needs.mood ? a : b, c[0]);
    }
    heir.becomeRuler();
    this.agent = heir;
    this.popularity = CONFIG.ruler.popularity.start;
    this.revoltDays = 0;
    HUD.log(`${heir.name} hereda el señorío de Valdecerro`);
  },
  depose() {
    if (this.council) { this.election(); return; }
    const old = this.agent;
    const c = this.candidates();
    if (!c.length) return;
    const next = c.reduce((b, a) => a.needs.mood > b.needs.mood ? a : b, c[0]);
    if (old && !old.removed) old.becomeCommoner();
    next.becomeRuler();
    this.agent = next;
    this.deposed++;
    this.popularity = CONFIG.ruler.popularity.start;
    this.revoltDays = 0;
    this.taxHoliday = CONFIG.ruler.taxHolidayDays;
    this.policy = 'cosecha';
    this.policyDaysLeft = CONFIG.ruler.decreeIntervalDays;
    HUD.log(`El pueblo depone a ${old ? old.name : 'su señor'} y aclama a ${next.name} en el castillo`);
  },
  onDeath(agent) {
    if (this.agent === agent) this.succession(agent);
  },
  ensure() {
    if ((!this.agent || this.agent.removed) && AgentRenderer.hasRoom(1)) this.succession(null);
  },
  serialize() {
    return { agentId: this.agent ? this.agent.id : null, policy: this.policy, policyDaysLeft: this.policyDaysLeft, popularity: this.popularity, revoltDays: this.revoltDays, taxHoliday: this.taxHoliday, deposed: this.deposed, council: this.council, electionDays: this.electionDays };
  },
  restore(data) {
    if (!data) { this.ensure(); return; }
    this.agent = agents.find(a => a.id === data.agentId && !a.removed) || null;
    this.policy = data.policy; this.policyDaysLeft = data.policyDaysLeft; this.popularity = data.popularity;
    this.revoltDays = data.revoltDays || 0; this.taxHoliday = data.taxHoliday || 0; this.deposed = data.deposed || 0;
    this.council = !!data.council; this.electionDays = data.electionDays || 0;
    this.ensure();
  }
};
