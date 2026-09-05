import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Rng, clamp, _v1, _v2 } from './utils.js';
import { Sim, agents, animals, Render, CameraState, World, Follow, Keys } from './state.js';
import { initRenderer, populateScene, applySavedConstructions, restoreGraves, Crops, Lamps, Deposits } from './world.js';
import { Tech, Ruler } from './tech.js';
import { Terrain, Water } from './terrain.js';
import { Exogenous } from './exogenos.js';
import { Eras } from './eras.js';
import { Graph } from './graph.js';
import { Assets } from './assets.js';
import { AgentRenderer } from './agentmesh.js';
import { Economy } from './economy.js';
import { DayCycle, applyLighting } from './calendar.js';
import { Weather, Rain } from './weather.js';
import { Events } from './events.js';
import { Growth } from './growth.js';
import { HUD } from './hud.js';
import { STATE, spawnPopulation, restorePopulation, socialCheck, Relations } from './agents.js';
import { spawnAnimals, replenishAnimals, wolves, countKind } from './animals.js';
import { SaveSystem } from './save.js';

const LOAD_FLAG = 'valdecerro-cargar';
const NEW_FLAG = 'valdecerro-nueva';
// ?servidor=1: latido sin pantalla (servidor/tick.mjs). ?local=1: ignora el estado del servidor. ?nueva=1: pueblo nuevo.
const PARAMS = new URLSearchParams(location.search);
const SERVER_MODE = PARAMS.has('servidor');
const FORCE_LOCAL = PARAMS.has('local');
const DEBUG = SERVER_MODE || PARAMS.has('debug');
const SEASON_NOTES = {
  Primavera: 'Llega la primavera: los campos vuelven a brotar',
  Verano: 'Llega el verano: días largos y cosecha abundante',
  Otoño: 'Llega el otoño: última cosecha antes del frío',
  Invierno: 'Llega el invierno: los campos descansan y la nieve cubre el valle'
};

function onNewDay() {
  // Las gallinas ponen huevos: un poco de comida diaria que no depende de la cosecha.
  let chickens = 0;
  for (const a of animals) if (a.kind === 'gallina' && !a.removed) chickens++;
  Economy.add('grano', chickens * CONFIG.economy.eggsPerChickenPerDay);
  replenishAnimals(DayCycle.day);
  // La fábrica convierte mineral en monedas cada día sin que nadie la atienda.
  if (World.fabrica) {
    const used = Economy.take('mineral', CONFIG.economy.factoryMineralPerDay);
    if (used > 0) Economy.add('monedas', used * CONFIG.economy.factoryCoinsPerMineral);
  }
  const residents = Growth.residents();
  const tax = Economy.payTaxes(residents, Ruler.taxMul());
  const lamps = Lamps.placeDaily(Tech.has('alumbrado'));
  let hunger = 0;
  for (const a of agents) if (a.isResident) hunger += a.needs.hunger;
  Growth.onNewDay({ foodPerCapita: Economy.foodPerCapita(residents), avgHunger: residents ? hunger / residents : 0, tax, lampsToday: lamps });
  Exogenous.onNewDay();
  Eras.onNewDay();
  Growth.sample(DayCycle.day);
  Crops.updateSeason(DayCycle.season, (DayCycle.dayOfSeason - 1) / Math.max(1, CONFIG.calendar.daysPerSeason - 1));
  HUD.log(`Amanece el día ${DayCycle.day}: quedan ${Math.floor(Economy.stock.grano)} de comida para ${Growth.residents()} habitantes; ${Ruler.council ? 'el concejo' : 'el castillo'} cobra ${Math.round(tax)} monedas`);
}
function onNewSeason() {
  HUD.log(SEASON_NOTES[DayCycle.season]);
}

// ---------------------------------------------------------------- Cámara: seguimiento, teclado y límites
function unfollow() {
  Follow.agent = null;
  HUD.updateAgentPanel();
}
function followAgent(a) {
  Follow.agent = a;
  CameraState.idle = 0;
  HUD.updateAgentPanel();
}
// Selección por proyección: el habitante cuyo cuerpo cae más cerca del clic en pantalla.
function pickAgent(clientX, clientY) {
  const w = window.innerWidth, h = window.innerHeight;
  let best = null, bestD = 26;
  for (const a of agents) {
    if (a.removed || !a.visible) continue;
    _v1.set(a.pos.x, a.pos.y + 0.9 * a.scale, a.pos.z).project(Render.camera);
    if (_v1.z > 1) continue;
    const sx = (_v1.x + 1) / 2 * w, sy = (1 - _v1.y) / 2 * h;
    const d = Math.hypot(sx - clientX, sy - clientY);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}
function setupInput() {
  const canvas = Render.renderer.domElement;
  let downX = 0, downY = 0, downT = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || performance.now() - downT > 400) return;
    const a = pickAgent(e.clientX, e.clientY);
    if (a) followAgent(a); else unfollow();
  });
  const keyMap = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
  const pressed = new Set();
  const refreshKeys = () => {
    Keys.forward = 0; Keys.right = 0;
    for (const k of pressed) { Keys.forward += keyMap[k][0]; Keys.right += keyMap[k][1]; }
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (keyMap[e.code]) { pressed.add(e.code); refreshKeys(); e.preventDefault(); }
    else if (e.code === 'KeyH') HUD.togglePanel();
    else if (e.code === 'Escape') unfollow();
    else if (e.code === 'Space') { Sim.paused = !Sim.paused; HUD.els.pause.textContent = Sim.paused ? 'Reanudar' : 'Pausar'; HUD.els.pause.classList.toggle('active', Sim.paused); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (keyMap[e.code]) { pressed.delete(e.code); refreshKeys(); } });
  window.addEventListener('blur', () => { pressed.clear(); refreshKeys(); });
}
function updateCamera(real) {
  const controls = Render.controls, cam = Render.camera;
  const target = controls.target;
  if (Keys.forward !== 0 || Keys.right !== 0) {
    if (Follow.agent) unfollow();
    CameraState.idle = 0;
    _v1.subVectors(target, cam.position); _v1.y = 0; _v1.normalize();
    // Derecha = adelante x arriba en un sistema diestro con Y hacia arriba.
    _v2.set(-_v1.z, 0, _v1.x);
    const speed = CONFIG.camera.panSpeed * real * Math.max(0.4, controls.getDistance() / 60);
    _v1.multiplyScalar(Keys.forward * speed).addScaledVector(_v2, Keys.right * speed);
    target.add(_v1);
    cam.position.add(_v1);
  }
  if (Follow.agent) {
    const a = Follow.agent;
    if (a.removed) unfollow();
    else {
      _v1.set(a.pos.x, a.pos.y + 1, a.pos.z).sub(target).multiplyScalar(CONFIG.camera.followLerp);
      target.add(_v1);
      cam.position.add(_v1);
    }
  }
  // Nadie sale del valle: el objetivo se acota y la cámara se desplaza con él.
  const B = CONFIG.camera.bounds;
  const cx = clamp(target.x, -B, B), cz = clamp(target.z, -B, B);
  if (cx !== target.x || cz !== target.z) {
    cam.position.x += cx - target.x; cam.position.z += cz - target.z;
    target.x = cx; target.z = cz;
  }
  if (!CameraState.interacting) CameraState.idle += real;
  controls.autoRotate = CameraState.autoEnabled && !CameraState.interacting && !Follow.agent && CameraState.idle >= CONFIG.camera.resumeAfter;
  cam.position.sub(shakeOff);
  controls.update();
  // Terremoto: sacudida de cámara puramente visual, sin tocar el RNG de la simulación.
  if (Exogenous.shake > 0) {
    const k = Math.min(1, Exogenous.shake / 1.5) * 0.45, t = performance.now() / 1000;
    shakeOff.set(Math.sin(t * 61) * k, Math.sin(t * 47) * k * 0.6, Math.cos(t * 53) * k);
  } else shakeOff.set(0, 0, 0);
  cam.position.add(shakeOff);
}
const shakeOff = new THREE.Vector3();

// Un paso de simulación sin renderizar; lo usa el bucle normal y la puesta al día tras una ausencia.
function simulateStep(dt) {
  Sim.time += dt;
  DayCycle.update(dt);
  Weather.update(dt);
  Events.update(dt);
  Economy.update(dt);
  Tech.update(dt);
  Exogenous.update(dt);
  Eras.update(dt);
  for (let i = 0; i < agents.length; i++) if (!agents[i].removed) agents[i].update(dt);
  for (let i = agents.length - 1; i >= 0; i--) if (agents[i].removed) agents.splice(i, 1);
  if (Sim.frame % CONFIG.social.checkEveryFrames === 0) socialCheck();
  for (let i = 0; i < animals.length; i++) if (!animals[i].removed) animals[i].update(dt);
  for (let i = animals.length - 1; i >= 0; i--) if (animals[i].removed) animals.splice(i, 1);
  Growth.update(dt);
  Sim.frame++;
}
// El pueblo sigue viviendo mientras la pestaña está cerrada: al volver se simula el tiempo ausente en trozos.
function catchUp(elapsedSeconds, done) {
  const S = CONFIG.save;
  const total = Math.min(elapsedSeconds, S.catchUpMaxHours * 3600);
  if (total < S.catchUpMinSeconds) { done(0); return; }
  const before = { day: DayCycle.day, pop: Growth.residents(), deaths: Growth.deaths, builds: World.constructions.length };
  const loading = document.getElementById('loading');
  const hours = total / 3600;
  const label = hours >= 1 ? `${hours.toFixed(1)} horas` : `${Math.round(total / 60)} minutos`;
  HUD.muted = true;
  let simulated = 0;
  const chunk = () => {
    const t0 = performance.now();
    while (simulated < total && performance.now() - t0 < 40) {
      simulateStep(S.catchUpStep);
      simulated += S.catchUpStep;
    }
    loading.textContent = `El pueblo siguió su vida durante ${label} sin ti... ${Math.round(simulated / total * 100)}%`;
    if (simulated < total) requestAnimationFrame(chunk);
    else {
      HUD.muted = false;
      const days = DayCycle.day - before.day;
      const parts = [`la población pasó de ${before.pop} a ${Growth.residents()}`];
      if (Growth.deaths > before.deaths) parts.push(`hubo ${Growth.deaths - before.deaths} difunto${Growth.deaths - before.deaths > 1 ? 's' : ''}`);
      if (World.constructions.length > before.builds) parts.push(`se levantaron ${World.constructions.length - before.builds} obra${World.constructions.length - before.builds > 1 ? 's' : ''}`);
      HUD.log(`Mientras no estabas pasaron ${days} día${days === 1 ? '' : 's'}: ${parts.join(', ')}`);
      done(days);
    }
  };
  requestAnimationFrame(chunk);
}

// De dónde sale la partida: primero el estado que escribe el servidor, si existe; si no, el guardado local.
async function loadState(forceNew) {
  if (forceNew || !CONFIG.save.autoLoad) return { data: null, source: 'nueva' };
  if (!FORCE_LOCAL && CONFIG.save.remote && location.protocol !== 'file:') {
    try {
      const res = await fetch(`${CONFIG.save.remote}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.version === SaveSystem.version) return { data, source: 'servidor' };
      }
    } catch (e) { /* sin estado remoto: se usa el guardado local */ }
  }
  const data = SaveSystem.load();
  return { data, source: data ? 'local' : 'nueva' };
}
// Foto del pueblo en cifras; la usa el servidor para la crónica y el depurador.
function resumen() {
  const stock = {};
  for (const k in Economy.stock) stock[k] = Math.round(Economy.stock[k]);
  return {
    day: DayCycle.day, hour: HUD.formatTime(DayCycle.hour), season: DayCycle.season, year: DayCycle.year, weather: Weather.state,
    residents: Growth.residents(), sick: Growth.sickCount(), deaths: Growth.deaths, buildings: World.constructions.length, graves: World.graves.length,
    stock, treasury: Math.round(Economy.treasury), ruler: Ruler.name, policy: Ruler.policy, popularity: +Ruler.popularity.toFixed(2),
    tech: Array.from(Tech.unlocked), lamps: Lamps.list.length, deposits: World.deposits.length, seed: Rng.seedValue,
    era: Eras.label, council: Ruler.council, alerts: Exogenous.alerts(), customs: Exogenous.customs.length, seeds: Exogenous.seeds,
    animals: { gallinas: countKind('gallina'), cerdos: countKind('cerdo'), perros: countKind('perro'), caballos: countKind('caballo') },
    log: HUD.entries.map(e => e.msg), journal: HUD.journal ? HUD.journal.slice() : []
  };
}

async function boot() {
  const forceNew = sessionStorage.getItem(NEW_FLAG) === '1' || PARAMS.has('nueva');
  sessionStorage.removeItem(NEW_FLAG);
  sessionStorage.removeItem(LOAD_FLAG);
  if (SERVER_MODE) {
    CONFIG.save.catchUpMaxHours = CONFIG.save.serverCatchUpMaxHours;
    HUD.journal = [];
  }
  const { data, source } = await loadState(forceNew);
  if (data) Rng.seed(data.seed);
  initRenderer(SERVER_MODE);
  Render.controls.enablePan = true;
  Render.controls.screenSpacePanning = false;
  Render.controls.panSpeed = 0.9;
  populateScene();
  AgentRenderer.init();
  HUD.init({
    onSave: () => SaveSystem.save(false),
    onLoad: () => { location.reload(); },
    onReset: () => {
      if (!window.confirm('¿Empezar un pueblo nuevo? La partida guardada se borrará.')) return;
      SaveSystem.clear();
      sessionStorage.setItem(NEW_FLAG, '1');
      location.reload();
    },
    onUnfollow: unfollow,
    hasSave: () => SaveSystem.hasSave()
  });
  if (source === 'servidor') {
    SaveSystem.remote = true;
    HUD.setRemote(data.savedAt);
  }
  Economy.reset();
  if (data) {
    applySavedConstructions(data.constructions);
    restoreGraves(data.graves);
    DayCycle.restore(data.calendar);
    Sim.time = data.sim.time;
    Economy.restore(data.economy);
    Weather.restore(data.weather);
    Events.init();
    Events.restore(data.events);
    Relations.restore(data.relations);
    restorePopulation(data.agents);
    spawnAnimals(data.animals);
    Growth.restore(data.growth);
    Tech.restore(data.tech);
    Ruler.restore(data.ruler);
    Lamps.restore(data.lamps);
    Exogenous.restore(data.exogenous);
    Eras.restore(data.eras);
    Rng.setState(data.rngState);
    HUD.log(`Partida cargada${source === 'servidor' ? ' del servidor' : ''}: día ${DayCycle.day}, ${DayCycle.season.toLowerCase()} del año ${DayCycle.year}`);
  } else {
    DayCycle.restore(null);
    Weather.init();
    Events.init();
    spawnPopulation();
    spawnAnimals();
    Tech.restore(null);
    Ruler.init();
    Exogenous.restore(null);
    Eras.restore(null);
    HUD.log('Amanece sobre Valdecerro');
  }
  DayCycle.onNewDay = onNewDay;
  DayCycle.onNewSeason = onNewSeason;
  Crops.updateSeason(DayCycle.season, (DayCycle.dayOfSeason - 1) / Math.max(1, CONFIG.calendar.daysPerSeason - 1));
  setupInput();
  applyLighting();
  console.log(data ? 'Partida cargada con semilla' : 'Semilla de esta partida:', Rng.seedValue);
  if (DEBUG) {
    window.__dbg = { agents, animals, wolves, Events, Weather, DayCycle, Sim, STATE, Render, World, CONFIG, Assets, Rain, Terrain, Graph, Economy, Growth, HUD, SaveSystem, AgentRenderer, Follow, simulateStep, catchUp, Tech, Ruler, Lamps, Deposits, resumen, source, Exogenous, Eras, Water };
  }
  const start = () => {
    for (const a of agents) AgentRenderer.write(a);
    AgentRenderer.flush();
    applyLighting();
    document.getElementById('loading').classList.add('hidden');
    SaveSystem.save(true);
    window.__listo = true;
    animate();
  };
  const away = data && data.savedAt ? (Date.now() - data.savedAt) / 1000 : 0;
  if (away > 0) catchUp(away, start); else start();
  // Guardar al ocultar o cerrar la pestaña, para que ningún refresco pierda lo vivido.
  document.addEventListener('visibilitychange', () => { if (document.hidden) SaveSystem.save(true); });
  window.addEventListener('beforeunload', () => SaveSystem.save(true));
  window.addEventListener('pagehide', () => SaveSystem.save(true));
}

// ---------------------------------------------------------------- Bucle principal
const clock = new THREE.Clock();
let rafId = 0;
function animate() {
  rafId = requestAnimationFrame(animate);
  const real = Math.min(clock.getDelta(), CONFIG.maxDelta);
  const dt = Sim.paused ? 0 : real * Sim.timeScale;
  if (dt > 0) {
    simulateStep(dt);
    AgentRenderer.flush();
    for (const fn of World.dynamics) fn(dt);
  } else Sim.frame++;
  applyLighting();
  updateCamera(real);
  HUD.update(real);
  SaveSystem.update(real);
  Render.renderer.render(Render.scene, Render.camera);
}
window.addEventListener('resize', () => {
  Render.camera.aspect = window.innerWidth / window.innerHeight;
  Render.camera.updateProjectionMatrix();
  Render.renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  } else if (!rafId) {
    clock.getDelta();
    animate();
  }
});

boot().catch((err) => {
  document.getElementById('loading').textContent = 'Error al iniciar: ' + err.message;
  window.__error = err.message;
  throw err;
});
