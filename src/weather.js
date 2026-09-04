import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, chance, rng, weightedPick } from './utils.js';
import { Render } from './state.js';
import { Assets } from './assets.js';
import { HUD } from './hud.js';
import { DayCycle } from './calendar.js';

export const WEATHER_PRESETS = {
  SOLEADO: { fog: 0.0022, sun: 1.00, sky: 1.00, exposure: 1.00, rain: 0, tint: 0.0, label: 'Soleado', sub: 'Cielo despejado', msg: 'Se abre el cielo y vuelve el sol' },
  NUBLADO: { fog: 0.0040, sun: 0.55, sky: 0.55, exposure: 0.92, rain: 0, tint: 0.1, label: 'Nublado', sub: 'Nubes bajas sobre el valle', msg: 'Se nubla el cielo sobre el valle' },
  FRIO: { fog: 0.0065, sun: 0.70, sky: 0.70, exposure: 0.88, rain: 0, tint: 0.6, label: 'Frío', sub: 'Bruma helada entre las casas', msg: 'Baja la temperatura y la bruma cubre el pueblo' },
  LLUVIA: { fog: 0.0085, sun: 0.40, sky: 0.40, exposure: 0.82, rain: CONFIG.weather.rainDrops, tint: 0.3, label: 'Lluvia', sub: 'Llueve sobre los tejados', msg: 'Empieza a llover sobre el pueblo' },
  TORMENTA: { fog: 0.0120, sun: 0.22, sky: 0.25, exposure: 0.72, rain: CONFIG.weather.stormDrops, tint: 0.4, label: 'Tormenta', sub: 'Truenos y aguacero', msg: 'El cielo se cierra, llega la tormenta' }
};
const SNOW_LABELS = { LLUVIA: ['Nevada', 'Cae la nieve sobre el valle'], TORMENTA: ['Ventisca', 'Viento y nieve espesa'] };
const RAIN_COLOR = new THREE.Color(0xA9C0D8), SNOW_COLOR = new THREE.Color(0xF4F7FB);

export const Rain = { points: null, positions: null, active: 0 };
function initRain() {
  const n = CONFIG.weather.maxDrops, half = CONFIG.weather.rainAreaHalf, h = CONFIG.weather.rainHeight;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = rand(-half, half);
    arr[i * 3 + 1] = rand(0, h);
    arr[i * 3 + 2] = rand(-half, half);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setDrawRange(0, 0);
  const pts = new THREE.Points(geo, Assets.mat.rain);
  pts.frustumCulled = false;
  pts.visible = false;
  Render.scene.add(pts);
  Rain.points = pts;
  Rain.positions = arr;
}
// Un solo Points con Float32Array reciclado: la gota que cruza el suelo vuelve arriba, nunca se recrea.
// En invierno las mismas partículas caen despacio y en blanco: nieve sin geometría extra.
function updateRain(dt, targetCount, wind, snow) {
  const goal = Math.round(targetCount);
  if (Rain.active < goal) Rain.active = Math.min(goal, Rain.active + Math.ceil(dt * 2500));
  else if (Rain.active > goal) Rain.active = Math.max(goal, Rain.active - Math.ceil(dt * 2500));
  const pts = Rain.points, mat = Assets.mat.rain;
  if (Rain.active <= 0) { pts.visible = false; mat.opacity = 0; return; }
  pts.visible = true;
  mat.opacity = Math.min(1, Rain.active / 1800) * 0.7;
  mat.color.lerpColors(RAIN_COLOR, SNOW_COLOR, snow);
  mat.size = 0.32 + snow * 0.28;
  const arr = Rain.positions, half = CONFIG.weather.rainAreaHalf, h = CONFIG.weather.rainHeight;
  const speed = CONFIG.weather.rainSpeed + (CONFIG.weather.snowSpeed - CONFIG.weather.rainSpeed) * snow;
  const fall = speed * dt, drift = wind * dt * (1 + snow);
  for (let i = 0; i < Rain.active; i++) {
    let y = arr[i * 3 + 1] - fall;
    let x = arr[i * 3] + drift;
    if (y < 0) y += h;
    if (x > half) x -= half * 2;
    if (x < -half) x += half * 2;
    arr[i * 3 + 1] = y;
    arr[i * 3] = x;
  }
  pts.geometry.attributes.position.needsUpdate = true;
  pts.geometry.setDrawRange(0, Rain.active);
}
export const Weather = {
  state: 'SOLEADO',
  timer: 0,
  cur: { fog: 0, sun: 1, sky: 1, exposure: 1, rain: 0, tint: 0 },
  target: null,
  flash: 0,
  flashSeq: null,
  flashT: 0,
  wind: 4,
  snowAmount: 0,
  get isStorm() { return this.state === 'TORMENTA'; },
  get isWet() { return this.state === 'LLUVIA' || this.state === 'TORMENTA'; },
  get isWinter() { return DayCycle.season === 'Invierno'; },
  get preset() { return WEATHER_PRESETS[this.state]; },
  get label() { return this.isWinter && this.isWet ? SNOW_LABELS[this.state][0] : this.preset.label; },
  get sub() { return this.isWinter && this.isWet ? SNOW_LABELS[this.state][1] : this.preset.sub; },
  init() {
    this.state = chance(0.7) ? 'SOLEADO' : 'NUBLADO';
    this.target = WEATHER_PRESETS[this.state];
    Object.assign(this.cur, { fog: this.target.fog, sun: this.target.sun, sky: this.target.sky, exposure: this.target.exposure, rain: 0, tint: this.target.tint });
    this.timer = rand(CONFIG.weather.minDuration, CONFIG.weather.maxDuration);
    if (!Rain.points) initRain();
  },
  set(next, silent) {
    if (next !== this.state) {
      this.state = next;
      this.target = WEATHER_PRESETS[next];
      this.wind = rand(-6, 6) * (next === 'TORMENTA' ? 2 : 1);
      if (!silent) {
        const winter = this.isWinter && this.isWet;
        HUD.log(winter ? (next === 'TORMENTA' ? 'Se levanta una ventisca sobre el pueblo' : 'Empieza a nevar sobre los tejados') : this.target.msg);
      }
    }
    this.timer = rand(CONFIG.weather.minDuration, CONFIG.weather.maxDuration);
  },
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const row = CONFIG.weather.transitions[this.state];
      this.set(weightedPick(row, null, CONFIG.calendar.weatherBias[DayCycle.season]));
    }
    // Transición gradual: aproximación exponencial que llega al 95 % en transitionSeconds.
    const k = 1 - Math.exp(-dt * 3 / CONFIG.weather.transitionSeconds);
    const c = this.cur, t = this.target;
    c.fog += (t.fog - c.fog) * k;
    c.sun += (t.sun - c.sun) * k;
    c.sky += (t.sky - c.sky) * k;
    c.exposure += (t.exposure - c.exposure) * k;
    c.rain += (t.rain - c.rain) * k;
    c.tint += (t.tint - c.tint) * k;
    const snowTarget = this.isWinter ? 1 : 0;
    this.snowAmount += (snowTarget - this.snowAmount) * Math.min(1, dt * 0.15);
    updateRain(dt, c.rain, this.wind, this.snowAmount);
    this.updateLightning(dt);
  },
  // Relámpago: dos o tres parpadeos muy breves sobre la luz ambiental, sin geometría extra.
  updateLightning(dt) {
    this.flash = 0;
    if (this.flashSeq) {
      this.flashT += dt;
      let on = false, done = true;
      for (const w of this.flashSeq) {
        if (this.flashT >= w.at && this.flashT < w.at + w.dur) on = true;
        if (this.flashT < w.at + w.dur) done = false;
      }
      this.flash = on ? 1 : 0;
      if (done) this.flashSeq = null;
      return;
    }
    if (this.isStorm && rng() < CONFIG.weather.lightningChancePerSecond * dt) {
      this.flashSeq = chance(0.5)
        ? [{ at: 0, dur: 0.07 }, { at: 0.16, dur: 0.05 }, { at: 0.3, dur: 0.11 }]
        : [{ at: 0, dur: 0.09 }, { at: 0.2, dur: 0.06 }];
      this.flashT = 0;
    }
  },
  serialize() { return { state: this.state, timer: this.timer, cur: Object.assign({}, this.cur), wind: this.wind, snow: this.snowAmount }; },
  restore(data) {
    this.init();
    if (!data) return;
    this.state = data.state;
    this.target = WEATHER_PRESETS[this.state];
    Object.assign(this.cur, data.cur);
    this.timer = data.timer;
    this.wind = data.wind;
    this.snowAmount = data.snow || 0;
  }
};
