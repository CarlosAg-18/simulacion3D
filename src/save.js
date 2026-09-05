import { CONFIG } from './config.js';
import { Rng } from './utils.js';
import { Sim, World, agents } from './state.js';
import { Economy } from './economy.js';
import { DayCycle } from './calendar.js';
import { Weather } from './weather.js';
import { Events } from './events.js';
import { Growth } from './growth.js';
import { Relations } from './agents.js';
import { serializeAnimals } from './animals.js';
import { HUD } from './hud.js';
import { Tech, Ruler } from './tech.js';
import { Lamps } from './world.js';
import { Exogenous } from './exogenos.js';
import { Eras } from './eras.js';

// Guardado en localStorage: todo el estado vive en objetos planos, así que basta con serializarlos.
// Cargar recarga la página con una bandera para reconstruir el mundo desde cero con la misma semilla.
export const SaveSystem = {
  version: 2,
  // Cuando el estado viene del servidor, el navegador solo mira: no guarda nada en localStorage.
  remote: false,
  autosaveTimer: CONFIG.save.autosaveSeconds,
  lastSavedLabel: '',
  hasSave() {
    try { return !!localStorage.getItem(CONFIG.save.key); } catch (e) { return false; }
  },
  build() {
    return {
      version: this.version,
      savedAt: Date.now(),
      seed: Rng.seedValue,
      rngState: Rng.getState(),
      sim: { time: Sim.time },
      calendar: DayCycle.serialize(),
      weather: Weather.serialize(),
      economy: Economy.serialize(),
      events: Events.serialize(),
      growth: Growth.serialize(),
      constructions: World.constructions,
      graves: World.graves,
      tech: Tech.serialize(),
      ruler: Ruler.serialize(),
      lamps: Lamps.serialize(),
      exogenous: Exogenous.serialize(),
      eras: Eras.serialize(),
      relations: Relations.serialize(),
      agents: agents.filter(a => !a.removed).map(a => a.serialize()),
      animals: serializeAnimals()
    };
  },
  save(silent) {
    if (this.remote) return false;
    try {
      localStorage.setItem(CONFIG.save.key, JSON.stringify(this.build()));
      this.lastSavedLabel = HUD.formatTime(DayCycle.hour);
      HUD.setSaved(`Guardado a las ${this.lastSavedLabel}${silent ? ' (auto)' : ''}`);
      HUD.setLoadEnabled(true);
      if (!silent) HUD.log('Partida guardada');
      return true;
    } catch (e) {
      HUD.log('No se pudo guardar la partida en este navegador');
      return false;
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(CONFIG.save.key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== this.version) return null;
      return data;
    } catch (e) {
      return null;
    }
  },
  clear() {
    try { localStorage.removeItem(CONFIG.save.key); } catch (e) { /* sin almacenamiento */ }
  },
  update(realDt) {
    if (Sim.paused || this.remote) return;
    this.autosaveTimer -= realDt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = CONFIG.save.autosaveSeconds;
      this.save(true);
    }
  }
};
