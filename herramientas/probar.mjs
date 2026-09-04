// Cliente CDP para la versión modular: arranca con ?debug=1, acelera la simulación y sondea sistemas.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const S = process.argv[2];
const url = process.argv[3];
const mode = process.argv[4] || 'full';
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-sandbox', '--remote-debugging-port=9333', '--window-size=1280,800',
  `--user-data-dir=${S}\\cdp-profile`, 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9333/json');
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('Chrome no responde');
}
const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${d.text} ${d.exception ? d.exception.description : ''} ${d.url || ''}:${d.lineNumber}`);
  }
};
function send(method, params) {
  return new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EVAL-ERROR: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  return r.result ? r.result.value : JSON.stringify(r);
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${S}\\${name}.png`, Buffer.from(r.data, 'base64'));
  logs.push(`[SHOT] ${name}`);
}
const SNAP = `(() => { const D = __dbg; const st = {}; const act = {}; for (const a of D.agents) { st[a.state] = (st[a.state]||0)+1; act[a.activity] = (act[a.activity]||0)+1; }
  const stock = {}; for (const k in D.Economy.stock) stock[k] = Math.round(D.Economy.stock[k]);
  return JSON.stringify({ t: Math.round(D.Sim.time), day: D.DayCycle.day, hour: +D.DayCycle.hour.toFixed(1), season: D.DayCycle.season, year: D.DayCycle.year, weather: D.Weather.state,
    ev: D.Events.current ? D.Events.current.kind : '-', agents: D.agents.length, residents: D.Growth.residents(), housing: D.Growth.housingCapacity(), st, act, stock, cap: D.Economy.capacity('grano'),
    site: D.Growth.siteLabel(), builds: D.World.constructions.map(c => c.type), sleeping: D.agents.filter(a => a.sleeping).length, hidden: D.agents.filter(a => !a.visible).length, sick: D.Growth.sickCount(), wolves: D.wolves.length, deaths: D.Growth.deaths, taxes: Math.round(D.Economy.taxes), hist: D.Growth.history.length,
    calls: D.Render.renderer.info.render.calls, nodes: D.Graph.nodes.length, hunger: +(D.agents.reduce((s,a)=>s+a.needs.hunger,0)/D.agents.length).toFixed(2), log: D.HUD.entries.map(e => e.msg).slice(0,2) }); })()`;
const FAST = `__dbg.Sim.timeScale = 4; __dbg.CONFIG.dayLengthSeconds = 120; __dbg.CONFIG.construction.planInterval = 10; __dbg.CONFIG.growth.immigrationInterval = 45; __dbg.CONFIG.events.minInterval = 30; __dbg.CONFIG.events.maxInterval = 60; __dbg.CONFIG.weather.minDuration = 20; __dbg.CONFIG.weather.maxDuration = 45; __dbg.CONFIG.save.autosaveSeconds = 30; 'ok'`;
const ROUNDS = parseInt(process.argv[5] || '14', 10);
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(9000);
logs.push('[BOOT] ' + await evaluate(SNAP));
await shot('v2_1_inicio');
if (mode === 'progreso') {
  await evaluate(FAST);
  logs.push('[TECH] ' + await evaluate(`(() => { const D = __dbg; const out = []; for (let i = 0; i < 4; i++) { D.Tech.points = 999; D.Tech.update(0.1); out.push(Array.from(D.Tech.unlocked)); } return JSON.stringify({ unlocked: Array.from(D.Tech.unlocked), current: D.Tech.current && D.Tech.current.id, ruler: D.Ruler.name, policy: D.Ruler.policy, pop: D.Ruler.popularity, deposits: D.Deposits.list.map(d => [d.kind, Math.round(d.x), Math.round(d.z), d.discovered]) }); })()`));
  logs.push('[LAMPS] ' + await evaluate(`(() => { const D = __dbg; D.Economy.treasury = 50; D.Economy.stock.madera = 80; const n = D.Lamps.placeDaily(true); return JSON.stringify({ placed: n, lamps: D.Lamps.list.length, lights: D.Lamps.lights.map(l => Math.round(l.position.x)) }); })()`));
  logs.push('[EXPED] ' + await evaluate(`(() => { const D = __dbg; if (D.Events.current) D.Events.end(); D.Events.timer = 9999; D.DayCycle.time += ((10 - D.DayCycle.hour + 24) % 24) / 24 * D.CONFIG.dayLengthSeconds; D.DayCycle.refresh(); D.CONFIG.expedition.nearDepositChance = 1; D.Events.start('expedicion'); const ev = D.Events.current; return JSON.stringify({ kind: ev.kind, node: ev.node, target: [Math.round(ev.anchor.x), Math.round(ev.anchor.z)] }); })()`));
  await sleep(12000);
  logs.push('[EXPED-2] ' + await evaluate(`(() => { const D = __dbg; const ev = D.Events.current; const members = D.agents.filter(a => ev && a.eventId === ev.id).map(a => [a.name, a.state, Math.round(a.pos.x), Math.round(a.pos.z)]); if (ev) { ev.elapsed = ev.duration; D.Events.update(0.01); } return JSON.stringify({ members, deposits: D.World.deposits.map(d => d.kind), nodes: D.Graph.nodes.length, log: D.HUD.entries.map(e => e.msg) }); })()`));
  await sleep(1000);
  await shot('v4_yacimiento');
  logs.push('[MINERS] ' + await evaluate(`(() => { const D = __dbg; const m = D.agents.filter(a => a.role === 'minero'); m.forEach(a => { a.timer = 0; a.state = 'IDLE'; }); m.forEach(a => a.decideRoutine()); return JSON.stringify(m.map(a => [a.activity, a.workRes, a.target])); })()`));
  logs.push('[BUILD] ' + await evaluate(`(() => { const D = __dbg; D.Economy.stock.madera = 400; D.Economy.stock.piedra = 400; D.Economy.stock.hierro = 40; D.Economy.stock.grano = 150; D.Growth.residents = () => 30; D.Growth.housingCapacity = () => 100; const seen = []; for (let i = 0; i < 8; i++) { D.Growth.site = null; D.Growth.plan(); if (!D.Growth.site) { seen.push('sin obra: ' + D.Growth.siteLabel()); break; } seen.push(D.Growth.site.label); D.Growth.site.progress = 0.999; D.Growth.addProgress(1); } return JSON.stringify({ seen, buildings: Object.keys(D.World.buildings), dynamics: D.World.dynamics.length, escuela: !!D.World.escuela, needed: D.Growth.neededRole(), foodMul: D.Tech.foodMul(), toolMul: D.Tech.toolMul(), calls: D.Render.renderer.info.render.calls }); })()`));
  await sleep(1500);
  await shot('v4_edificios');
  logs.push('[RULER] ' + await evaluate(`(() => { const D = __dbg; const r = D.Ruler; r.decree('austeridad'); const tax = D.Economy.payTaxes(20, r.taxMul()); r.popularity = 0.1; if (D.Events.current) D.Events.end(); r.onNewDay({ foodPerCapita: 1, avgHunger: 0.9, tax, deathsToday: 0, buildsToday: 0, lampsToday: 0 }); return JSON.stringify({ tax, policy: r.policy, ev: D.Events.current && D.Events.current.kind, pop: r.popularity, log: D.HUD.entries.map(e => e.msg) }); })()`));
  await sleep(4000);
  logs.push('[RULER-2] ' + await evaluate(`(() => { const D = __dbg; const r = D.Ruler; const rebels = D.agents.filter(a => D.Events.current && a.eventId === D.Events.current.id).length; if (D.Events.current) D.Events.end(); r.popularity = 0.1; r.revoltDays = 2; r.onNewDay({ foodPerCapita: 1, avgHunger: 0.9, tax: 0, deathsToday: 0, buildsToday: 0, lampsToday: 0 }); const old = r.name; r.agent.die('de viejo'); return JSON.stringify({ rebels, rulerAfterDepose: old, rulerAfterDeath: r.name, senores: D.agents.filter(a => a.role === 'senor').length, log: D.HUD.entries.map(e => e.msg) }); })()`));
  logs.push('[SAVE] ' + await evaluate(`(() => { const D = __dbg; D.SaveSystem.save(false); const raw = JSON.parse(localStorage.getItem(D.CONFIG.save.key)); return JSON.stringify({ tech: raw.tech.unlocked.length, lamps: raw.lamps.length, builds: raw.constructions.map(c => c.type), ruler: raw.ruler.agentId }); })()`));
  await send('Page.navigate', { url });
  await sleep(12000);
  logs.push('[LOADED] ' + await evaluate(`JSON.stringify({ tech: __dbg.Tech.unlocked.size, lamps: __dbg.Lamps.list.length, buildings: Object.keys(__dbg.World.buildings), deposits: __dbg.World.deposits.length, ruler: __dbg.Ruler.name, dynamics: __dbg.World.dynamics.length, nodes: __dbg.Graph.nodes.length, calls: __dbg.Render.renderer.info.render.calls })`));
  await evaluate(`(() => { const D = __dbg; D.DayCycle.time += ((23 - D.DayCycle.hour + 24) % 24) / 24 * D.CONFIG.dayLengthSeconds; D.DayCycle.refresh(); return 'ok'; })()`);
  await sleep(2500);
  await shot('v4_noche');
  writeFileSync(`${S}\\drive2.log`, logs.join('\n'));
  chrome.kill();
  process.exit(0);
}
if (mode === 'catchup') {
  // Guarda con una marca de tiempo de hace 40 minutos, recarga y comprueba que el pueblo avanzó.
  logs.push('[PRE] ' + await evaluate(`JSON.stringify({ day: __dbg.DayCycle.day, pop: __dbg.Growth.residents(), t: Math.round(__dbg.Sim.time) })`));
  logs.push('[STAMP] ' + await evaluate(`(() => { const D = __dbg; D.SaveSystem.save(false); const raw = JSON.parse(localStorage.getItem(D.CONFIG.save.key)); raw.savedAt = Date.now() - 40 * 60 * 1000; localStorage.setItem(D.CONFIG.save.key, JSON.stringify(raw)); D.SaveSystem.save = () => true; return 'ok'; })()`));
  const t0 = Date.now();
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const hidden = await evaluate(`document.getElementById('loading').classList.contains('hidden')`);
    if (hidden === true) break;
  }
  logs.push('[POST] ' + await evaluate(`JSON.stringify({ secs: ${0}, day: __dbg.DayCycle.day, pop: __dbg.Growth.residents(), t: Math.round(__dbg.Sim.time), log: __dbg.HUD.entries.map(e => e.msg), loading: document.getElementById('loading').textContent })`) + ' tookMs=' + (Date.now() - t0));
  await sleep(2000);
  await shot('v3_catchup');
  writeFileSync(`${S}\\drive2.log`, logs.join('\n'));
  chrome.kill();
  process.exit(0);
}
if (mode === 'botica') {
  logs.push('[BOTICA-BUILD] ' + await evaluate(`(() => { const D = __dbg; D.Economy.stock.madera = 300; D.Economy.stock.piedra = 300; D.Economy.stock.grano = 150; D.Growth.residents = () => 30; D.Growth.housingCapacity = () => 100; if (D.Events.current) D.Events.end(); D.Events.timer = 9999; const seen = [];
    for (let i = 0; i < 6 && !D.World.botica; i++) { D.Growth.site = null; D.Growth.plan(); if (!D.Growth.site) { seen.push('sin obra: ' + D.Growth.siteLabel()); break; } seen.push(D.Growth.site.label); D.Growth.site.progress = 0.999; D.Growth.addProgress(1); }
    return JSON.stringify({ seen, botica: D.World.botica, nodes: D.Graph.nodes.length, needed: D.Growth.neededRole(), calls: D.Render.renderer.info.render.calls }); })()`));
  logs.push('[CURANDERO] ' + await evaluate(`(() => { const D = __dbg; D.Growth.tryImmigration(); const h = D.agents.find(a => a.role === 'curandero'); const s = D.agents.find(a => a.role === 'aldeano'); s.needs.health = 0.2; s.update(0.02); s.timer = 0; s.decideRoutine(); return JSON.stringify({ healer: h ? [h.name, h.node, h.hatKind] : null, sick: [s.sick, s.activity, s.target], log: D.HUD.entries.map(e => e.msg) }); })()`));
  await sleep(25000);
  logs.push('[CURANDERO-2] ' + await evaluate(`JSON.stringify({ healer: __dbg.agents.filter(a => a.role === 'curandero').map(a => [a.state, a.activity, a.node, Math.round(a.pos.x), Math.round(a.pos.z)]), sick: __dbg.agents.filter(a => a.sick).map(a => [a.activity, a.node, +a.needs.health.toFixed(2)]), botica: __dbg.World.botica && [Math.round(__dbg.World.botica.x), Math.round(__dbg.World.botica.z)] })`));
  await shot('v3_botica');
  writeFileSync(`${S}\\drive2.log`, logs.join('\n'));
  chrome.kill();
  process.exit(0);
}
if (mode === 'peligros') {
  await evaluate(FAST);
  // Lobos forzados de noche
  logs.push('[LOBOS-START] ' + await evaluate(`(() => { const D = __dbg; if (D.Events.current) D.Events.end(); D.Events.timer = 9999; D.DayCycle.time += ((23 - D.DayCycle.hour + 24) % 24) / 24 * D.CONFIG.dayLengthSeconds; D.DayCycle.refresh(); D.Events.start('lobos'); return 'ok'; })()`));
  await sleep(6000);
  logs.push('[LOBOS] ' + await evaluate(`JSON.stringify({ wolves: __dbg.wolves.map(w => [w.state, Math.round(w.pos.x), Math.round(w.pos.z)]), taken: __dbg.Events.current && __dbg.Events.current.taken, guards: __dbg.agents.filter(a => a.role === 'guardia').map(a => a.state), chickens: __dbg.animals.filter(a => a.kind === 'gallina').length, log: __dbg.HUD.entries.map(e => e.msg) })`));
  await shot('v3_lobos');
  await sleep(12000);
  logs.push('[LOBOS-2] ' + await evaluate(`JSON.stringify({ wolves: __dbg.wolves.length, ev: __dbg.Events.current && __dbg.Events.current.kind, chickens: __dbg.animals.filter(a => a.kind === 'gallina').length, log: __dbg.HUD.entries.map(e => e.msg) })`));
  // Incendio forzado
  logs.push('[FUEGO-START] ' + await evaluate(`(() => { const D = __dbg; if (D.Events.current) D.Events.end(); D.Events.timer = 9999; D.Events.start('incendio'); return 'ok'; })()`));
  await sleep(6000);
  logs.push('[FUEGO] ' + await evaluate(`JSON.stringify({ ev: __dbg.Events.current && __dbg.Events.current.kind, progress: __dbg.Events.current && +__dbg.Events.current.progress.toFixed(2), responders: __dbg.agents.filter(a => a.state === 'ATTEND_EVENT').length, flame: __dbg.Render.scene.children.includes(__dbg.World.flame), log: __dbg.HUD.entries.map(e => e.msg) })`));
  await shot('v3_fuego');
  await sleep(20000);
  logs.push('[FUEGO-2] ' + await evaluate(`JSON.stringify({ ev: __dbg.Events.current && __dbg.Events.current.kind, flame: __dbg.Render.scene.children.includes(__dbg.World.flame), madera: Math.round(__dbg.Economy.stock.madera), log: __dbg.HUD.entries.map(e => e.msg) })`));
  // Seguir a un habitante, ocultar panel, enfermedad, botica forzada, caravana comercial
  logs.push('[FOLLOW] ' + await evaluate(`(() => { const D = __dbg; const a = D.agents.find(x => x.isResident && x.visible); D.Follow.agent = a; D.HUD.updateAgentPanel(); D.HUD.togglePanel(); return JSON.stringify({ panelHidden: document.getElementById('hud').classList.contains('collapsed'), agentPanel: !document.getElementById('agent-panel').hidden, name: document.getElementById('agent-name').textContent, body: document.getElementById('agent-body').textContent.slice(0, 80) }); })()`));
  await sleep(1500);
  await shot('v3_follow');
  logs.push('[SICK] ' + await evaluate(`(() => { const D = __dbg; const a = D.agents.find(x => x.role === 'aldeano'); a.needs.health = 0.2; a.update(0.02); D.Economy.stock.madera = 100; D.Economy.stock.piedra = 100; D.Economy.stock.grano = 120; D.Growth.residents = () => 30; D.Growth.housingCapacity = () => 100; if (D.Growth.site) D.Growth.site = null; D.Growth.plan(); return JSON.stringify({ sick: a.sick, speed: a.speed, site: D.Growth.siteLabel(), log: D.HUD.entries.map(e => e.msg) }); })()`));
  await evaluate(`__dbg.Growth.site && (__dbg.Growth.site.progress = 0.999); __dbg.Growth.addProgress(1); 'ok'`);
  await sleep(2000);
  logs.push('[BOTICA] ' + await evaluate(`JSON.stringify({ botica: !!__dbg.World.botica, nodes: __dbg.Graph.nodes.length, needed: __dbg.Growth.neededRole(), builds: __dbg.World.constructions.map(c => c.type) })`));
  await evaluate(`__dbg.Growth.tryImmigration(); 'ok'`);
  await sleep(8000);
  logs.push('[CURANDERO] ' + await evaluate(`JSON.stringify({ healers: __dbg.agents.filter(a => a.role === 'curandero').map(a => [a.state, a.activity, a.node]), sickAct: __dbg.agents.filter(a => a.sick).map(a => [a.activity, a.node]), log: __dbg.HUD.entries.map(e => e.msg) })`));
  logs.push('[TRADE-START] ' + await evaluate(`(() => { const D = __dbg; D.Economy.stock.grano = 150; D.Economy.stock.mineral = 45; D.Economy.stock.madera = 10; if (D.Events.current) D.Events.end(); D.Events.start('caravana'); D.Events.current.trade(); return 'ok'; })()`));
  logs.push('[TRADE] ' + await evaluate(`JSON.stringify({ stock: __dbg.Economy.stock, log: __dbg.HUD.entries[0].msg })`));
  await shot('v3_final');
  writeFileSync(`${S}\\drive2.log`, logs.join('\n'));
  chrome.kill();
  process.exit(0);
}
if (mode === 'muerte') {
  // Fuerza una muerte por vejez y otra por hambre, comprueba lápidas, duelo, contador y guardado.
  logs.push('[M1] ' + await evaluate(`(() => { const D = __dbg; const a = D.agents.find(x => x.partnerId !== null && !x.follow); const kid = D.agents.find(x => x.follow === a); a.age = 90; D.Growth.onNewDay(); return JSON.stringify({ removed: a.removed, deaths: D.Growth.deaths, graves: D.World.graves.length, kidFollows: kid ? (kid.follow ? kid.follow.name : null) : 'sin hijo', log: D.HUD.entries[0].msg, agents: D.agents.filter(x => !x.removed).length }); })()`));
  logs.push('[M2] ' + await evaluate(`(() => { const D = __dbg; const b = D.agents.find(x => x.role === 'minero' && !x.removed); b.starving = 99999; b.needs.hunger = 1.1; b.update(0.016); return JSON.stringify({ removed: b.removed, deaths: D.Growth.deaths, graves: D.World.graves.length, log: D.HUD.entries[0].msg, calls: D.Render.renderer.info.render.calls }); })()`));
  await sleep(1500);
  await shot('v2_muerte');
  logs.push('[M3] ' + await evaluate(`__dbg.SaveSystem.save(false); JSON.stringify(JSON.parse(localStorage.getItem(__dbg.CONFIG.save.key)).graves)`));
  await evaluate(`sessionStorage.setItem('valdecerro-cargar', '1'); 'ok'`);
  await send('Page.navigate', { url });
  await sleep(9000);
  logs.push('[M4] ' + await evaluate(`JSON.stringify({ graves: __dbg.World.graves.length, deaths: __dbg.Growth.deaths, agents: __dbg.agents.length })`));
  writeFileSync(`${S}\\drive2.log`, logs.join('\n'));
  chrome.kill();
  process.exit(0);
}
if (mode === 'quick') {
  const fps = await evaluate(`new Promise(res => { let n = 0; const t0 = performance.now(); function f(){ n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(n / 4); } requestAnimationFrame(f); })`);
  logs.push('[FPS] ' + fps);
  writeFileSync(`${S}\\drive2.log`, logs.join('\n'));
  chrome.kill();
  process.exit(0);
}
await evaluate(FAST);
for (let i = 0; i < ROUNDS; i++) {
  await sleep(10000);
  logs.push('[SNAP] ' + await evaluate(SNAP));
  if (i === 3) await shot('v2_2_dia');
  if (i === 8) await shot('v2_3_medio');
}
await shot('v2_4_final');
// Guardar, recargar con la bandera y comparar
logs.push('[SAVE] ' + await evaluate(`__dbg.SaveSystem.save(false); JSON.stringify({ size: localStorage.getItem(__dbg.CONFIG.save.key).length, agents: __dbg.agents.length, builds: __dbg.World.constructions.length, day: __dbg.DayCycle.day })`));
await evaluate(`sessionStorage.setItem('valdecerro-cargar', '1'); 'ok'`);
await send('Page.navigate', { url });
await sleep(10000);
logs.push('[LOADED] ' + await evaluate(SNAP));
await shot('v2_5_cargada');
await evaluate(FAST);
await sleep(20000);
logs.push('[AFTER-LOAD] ' + await evaluate(SNAP));
writeFileSync(`${S}\\drive2.log`, logs.join('\n'));
chrome.kill();
process.exit(0);
