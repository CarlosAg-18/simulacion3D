import { CONFIG, PALETTE } from './config.js';
import { lerp, smoothstep, hex, TAU, _c1, _c2 } from './utils.js';
import { Render, World } from './state.js';
import { Assets } from './assets.js';
import { Terrain } from './terrain.js';
import { Weather } from './weather.js';
import { HUD } from './hud.js';
import { Crops, Lamps } from './world.js';
import { Exogenous } from './exogenos.js';

const SKY = { day: hex(PALETTE.skyDay), dawn: hex(PALETTE.skyDawn), dusk: hex(PALETTE.skyDusk), night: hex(PALETTE.skyNight) };
const SUN_WARM = hex(0xFFB070), SUN_WHITE = hex(0xFFF4E0), GREY = hex(0x6E7783), COLD = hex(0x9FB4C8), WHITE = hex(0xFFFFFF);
const SUN_HIGH = hex(0xFFF3C4), SNOW = hex(0xE8EEF5), DRY_GRASS = hex(0xD9C070), DRY_CROP = hex(0xB8A050);
const GROUND_TINT = hex(PALETTE.grass);
const grassTints = {}, leafTints = {};
for (const s of CONFIG.calendar.seasons) { grassTints[s] = hex(CONFIG.calendar.grassTint[s]); leafTints[s] = hex(CONFIG.calendar.leafTint[s]); }

// Reloj de la simulación: hora, día, estación y año. Las horas de luz dependen de la estación.
export const DayCycle = {
  time: 0, hour: CONFIG.startHour, day: 1, dayIndex: 0, dayOfSeason: 1,
  seasonIndex: CONFIG.calendar.startSeason, season: CONFIG.calendar.seasons[CONFIG.calendar.startSeason],
  year: CONFIG.calendar.startYear, phase: 'Amanecer',
  sunrise: 6, sunset: 19.5,
  grassTint: hex(0xFFFFFF), leafTint: hex(0xFFFFFF),
  onNewDay: null, onNewSeason: null,
  update(dt) {
    this.time += dt;
    this.refresh();
  },
  refresh() {
    const total = CONFIG.startHour + this.time / CONFIG.dayLengthSeconds * 24;
    this.hour = total % 24;
    const dayIndex = Math.floor(total / 24);
    if (dayIndex !== this.dayIndex) {
      const prevSeason = this.seasonIndex;
      this.dayIndex = dayIndex;
      this.computeSeason();
      if (this.onNewDay) this.onNewDay();
      if (this.seasonIndex !== prevSeason && this.onNewSeason) this.onNewSeason();
    } else {
      this.computeSeason();
    }
    const h = this.hour;
    const sr = this.sunrise, ss = this.sunset;
    this.phase = h >= sr - 1 && h < sr + 1.5 ? 'Amanecer' : h >= sr + 1.5 && h < ss - 1 ? 'Día' : h >= ss - 1 && h < ss + 1.5 ? 'Atardecer' : 'Noche';
  },
  computeSeason() {
    const cal = CONFIG.calendar;
    const seasonsPassed = cal.startSeason + Math.floor(this.dayIndex / cal.daysPerSeason);
    this.seasonIndex = seasonsPassed % cal.seasons.length;
    this.season = cal.seasons[this.seasonIndex];
    this.year = cal.startYear + Math.floor(seasonsPassed / cal.seasons.length);
    this.day = this.dayIndex + 1;
    this.dayOfSeason = this.dayIndex % cal.daysPerSeason + 1;
    const dl = cal.daylight[this.season];
    this.sunrise = dl[0]; this.sunset = dl[1];
  },
  isNight() { return this.hour < this.sunrise || this.hour >= this.sunset; },
  // Ángulo solar: 0 en el orto, PI en el ocaso, y la mitad nocturna reparte el resto de la vuelta.
  sunAngle() {
    const h = this.hour, sr = this.sunrise, ss = this.sunset;
    if (h >= sr && h <= ss) return (h - sr) / (ss - sr) * Math.PI;
    const nightLen = 24 - (ss - sr);
    const t = ((h - ss + 24) % 24) / nightLen;
    return Math.PI + t * Math.PI;
  },
  skyColor(out) {
    const h = this.hour, sr = this.sunrise, ss = this.sunset;
    const stops = [
      [sr - 1.5, SKY.night], [sr + 0.3, SKY.dawn], [sr + 2.2, SKY.day],
      [ss - 2, SKY.day], [ss + 0.3, SKY.dusk], [ss + 1.8, SKY.night]
    ];
    if (h < stops[0][0] || h > stops[stops.length - 1][0]) return out.copy(SKY.night);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (h >= a[0] && h <= b[0]) return out.lerpColors(a[1], b[1], smoothstep(0, 1, (h - a[0]) / (b[0] - a[0])));
    }
    return out.copy(SKY.night);
  },
  serialize() { return { time: this.time }; },
  restore(data) {
    this.time = data ? data.time : 0;
    const total = CONFIG.startHour + this.time / CONFIG.dayLengthSeconds * 24;
    this.dayIndex = Math.floor(total / 24);
    this.computeSeason();
    this.refresh();
    this.grassTint.copy(grassTints[this.season]);
    this.leafTint.copy(leafTints[this.season]);
  }
};

export function applyLighting() {
  const th = DayCycle.sunAngle();
  const cs = Math.cos(th), sn = Math.sin(th);
  const R = Render;
  R.sunLight.position.set(cs * 160, sn * 160, 60);
  World.sunMesh.position.set(cs * 520, sn * 520, 200);
  R.moonLight.position.set(-cs * 160, -sn * 160, -60);
  World.moonMesh.position.set(-cs * 520, -sn * 520, -200);
  const elev = sn;
  const dayF = smoothstep(-0.08, 0.3, elev);
  const nightF = 1 - smoothstep(-0.02, 0.22, elev);
  const w = Weather.cur, flash = Weather.flash, snow = Weather.snowAmount;
  R.sunLight.intensity = 2.8 * dayF * w.sun;
  R.sunLight.color.lerpColors(SUN_WARM, SUN_WHITE, smoothstep(0, 0.5, elev));
  R.moonLight.intensity = 0.5 * smoothstep(-0.05, 0.3, -elev) * lerp(0.4, 1, w.sky);
  DayCycle.skyColor(_c1);
  _c1.lerp(GREY, (1 - w.sky) * 0.85);
  _c1.multiplyScalar(lerp(0.55, 1, w.sky));
  _c1.lerp(COLD, w.tint * 0.35);
  _c1.lerp(WHITE, flash * 0.4);
  R.scene.background.copy(_c1);
  R.scene.fog.color.copy(_c1);
  R.scene.fog.density = w.fog * lerp(1, 1.5, nightF);
  R.hemiLight.color.copy(_c1);
  R.hemiLight.groundColor.copy(GROUND_TINT).multiplyScalar(lerp(0.3, 1, dayF));
  R.hemiLight.intensity = lerp(0.35, 1.4, dayF) * lerp(0.6, 1, w.sky);
  R.ambientLight.intensity = lerp(0.3, 1.0, dayF) * lerp(0.7, 1, w.sky) + flash * 3.0;
  R.renderer.toneMappingExposure = lerp(0.72, 1.0, dayF) * w.exposure;
  Assets.mat.window.emissiveIntensity = nightF * 1.7 + (1 - w.sky) * 0.4 * dayF;
  Lamps.setNight(nightF);
  World.sunMesh.visible = elev > -0.2;
  World.moonMesh.visible = elev < 0.2;
  Assets.mat.sun.color.lerpColors(SUN_WARM, SUN_HIGH, smoothstep(0, 0.4, elev));
  // Paleta estacional: los tintes se aproximan suavemente para que el cambio de estación no sea un salto.
  const k = 0.02;
  // En sequía la hierba y los cultivos amarillean.
  _c2.copy(grassTints[DayCycle.season]).lerp(DRY_GRASS, Exogenous.dryness * 0.75);
  DayCycle.grassTint.lerp(_c2, k);
  DayCycle.leafTint.lerp(leafTints[DayCycle.season], k);
  Terrain.mesh.material.color.copy(DayCycle.grassTint).lerp(SNOW, snow * 0.8);
  Assets.mat.canopy.color.copy(DayCycle.leafTint).lerp(SNOW, snow * 0.5);
  Assets.mat.crop.color.copy(Crops.tint).lerp(DRY_CROP, Exogenous.dryness * 0.8);
}
