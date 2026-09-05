import { CONFIG } from './config.js';
import { hex } from './utils.js';
import { World } from './state.js';
import { Assets } from './assets.js';
import { setRoadStyle } from './terrain.js';
import { HUD } from './hud.js';
import { DayCycle } from './calendar.js';
import { Growth } from './growth.js';
import { Tech, Ruler } from './tech.js';
import { Lamps } from './world.js';

// Etapas históricas. La etapa describe un estado, no lo causa: se alcanza cuando coinciden población,
// saberes y edificios, y se pierde si la población se hunde varios días seguidos.
export const Eras = {
  index: 0, belowDays: 0, changedDay: 0, roofTarget: hex(CONFIG.eras[0].roof),
  get def() { return CONFIG.eras[this.index]; },
  get label() { return this.def.label; },
  get title() { return this.def.title; },
  qualifies(i) {
    const d = CONFIG.eras[i];
    if (Growth.residents() < d.minResidents || Tech.unlocked.size < d.minTech) return false;
    return d.needs.every(n => n.split('|').some(k => !!World.buildings[k]));
  },
  onNewDay() {
    let best = this.index;
    for (let i = this.index + 1; i < CONFIG.eras.length; i++) { if (this.qualifies(i)) best = i; else break; }
    if (best > this.index) { this.set(best, true); return; }
    if (this.index > 0 && Growth.residents() < this.def.minResidents * 0.6) {
      this.belowDays++;
      if (this.belowDays >= CONFIG.eraDecayDays) this.set(this.index - 1, false);
    } else this.belowDays = 0;
  },
  set(i, up) {
    this.index = i;
    this.belowDays = 0;
    this.changedDay = DayCycle.day;
    this.applyVisuals();
    const d = this.def;
    if (up) {
      Ruler.popularity = Math.min(1, Ruler.popularity + 0.1);
      HUD.log(`Valdecerro prospera y pasa a ser ${d.label.toLowerCase()}: ${d.desc}`);
    } else HUD.log(`Valdecerro decae y vuelve a ser ${d.label.toLowerCase()}`);
  },
  // Lo que se ve: el color de los tejados de paja cambia despacio, los caminos y las farolas de golpe.
  applyVisuals() {
    const d = this.def;
    this.roofTarget.set(d.roof);
    setRoadStyle(d.road, !!d.paving);
    Lamps.setStyle(d.lamp[0], d.lamp[1]);
  },
  update(dt) {
    Assets.mat.thatch.color.lerp(this.roofTarget, Math.min(1, dt * 0.03));
  },
  maxPopulation() { return this.def.maxPopulation; },
  techMul() { return this.def.techMul; },
  serialize() { return { index: this.index, belowDays: this.belowDays, changedDay: this.changedDay }; },
  restore(data) {
    this.index = data ? Math.min(CONFIG.eras.length - 1, data.index || 0) : 0;
    this.belowDays = data ? data.belowDays || 0 : 0;
    this.changedDay = data ? data.changedDay || 0 : 0;
    this.applyVisuals();
    Assets.mat.thatch.color.copy(this.roofTarget);
  }
};
