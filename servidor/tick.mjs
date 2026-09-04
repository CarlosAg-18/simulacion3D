// Un latido de Valdecerro: abre la simulación sin pantalla, pone al día el tiempo real transcurrido
// desde el último estado guardado y escribe el nuevo estado en estado/partida.json.
// Lo ejecuta GitHub Actions cada pocas horas (.github/workflows/vida.yml) y también sirve en local:
//   node servidor/tick.mjs            latido normal
//   node servidor/tick.mjs --nueva    empieza un pueblo nuevo (descarta el estado actual)
//   node servidor/tick.mjs --ver      abre el visor normal contra el estado guardado y saca una captura (comprobación)
// Necesita Node 22+ (fetch y WebSocket nativos) y Chrome; la ruta se puede fijar en CHROME_PATH.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ESTADO = join(RAIZ, 'estado');
const args = process.argv.slice(2);
const NUEVA = args.includes('--nueva');
const VER = args.includes('--ver');
const TIMEOUT_MS = 15 * 60 * 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.css': 'text/css; charset=utf-8' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- Servidor estático mínimo sobre la carpeta del proyecto
function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
async function serveRepo() {
  const port = await freePort();
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
    const file = resolve(RAIZ, path || 'index.html');
    if (!file.startsWith(RAIZ) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { server, port };
}

// ---------------------------------------------------------------- Chrome sin pantalla y protocolo DevTools
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/snap/bin/chromium'];
  const found = candidates.find(p => p && existsSync(p));
  if (!found) throw new Error('No encuentro Chrome. Indica la ruta del ejecutable en la variable de entorno CHROME_PATH.');
  return found;
}
async function launchChrome() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'valdecerro-'));
  const bin = findChrome();
  const proc = spawn(bin, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--mute-audio',
    '--hide-scrollbars', '--window-size=1280,800', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find(t => t.type === 'page');
    } catch (e) { /* aún arrancando */ }
    if (!target) await sleep(250);
  }
  if (!target) { proc.kill(); throw new Error('Chrome no responde al protocolo DevTools'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  const consola = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') consola.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(`${d.text} ${d.exception ? d.exception.description : ''} ${d.url || ''}:${d.lineNumber}`);
    }
  };
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('Error evaluando en la página: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  const close = () => {
    try { ws.close(); } catch (e) { /* ya cerrado */ }
    proc.kill();
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome aún suelta archivos */ } }, 1500);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { send, evaluate, close, errors, consola, bin };
}

// ---------------------------------------------------------------- Crónica legible y mensaje de commit
// Lo que merece crónica: nacimientos, muertes, familias, colonos, obras, saberes, yacimientos, señorío, lobos, incendios y comercio.
// Quedan fuera el parte del tiempo, los viajeros de paso, ferias, misas, enfermedades y el amanecer de cada día.
const NOTABLE = /muere|^Nace |forman una familia|^Llega .* se instala|se marcha del pueblo|^Termina .*crece|^Empieza la obra|descubre|gobierna|hereda|depone|amotina|proclama|El señor cede|expedición|farol|lobo|incendio|fuego|^La caravana .*monedas|ya es adult/i;
function escribirCronica(r, fuente) {
  const cronica = join(ESTADO, 'cronica.md');
  if (!existsSync(cronica)) {
    writeFileSync(cronica, '# Crónica de Valdecerro\n\nCada entrada es un latido del servidor: la fecha real, el momento que vive el pueblo y lo que ocurrió desde el latido anterior.\n', 'utf-8');
  }
  const fecha = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const lineas = [`\n## ${fecha} · Día ${r.day}, ${r.season.toLowerCase()} del año ${r.year}, ${r.hour}`];
  const partes = [`${r.residents} habitantes`];
  if (r.sick) partes.push(`${r.sick} enfermos`);
  partes.push(`${r.deaths} difuntos en total`, `${r.buildings} obras levantadas`, `tesoro de ${r.treasury} monedas`);
  lineas.push(`- ${partes.join(', ')}. Grano ${r.stock.grano ?? 0}, madera ${r.stock.madera ?? 0}, piedra ${r.stock.piedra ?? 0}.`);
  if (r.ruler) lineas.push(`- Gobierna ${r.ruler}${r.policy ? ` (decreto: ${r.policy})` : ''}, popularidad ${Math.round(r.popularity * 100)} %.`);
  if (r.tech.length) lineas.push(`- Saberes: ${r.tech.join(', ')}.`);
  const paso = r.log.find(m => m.startsWith('Mientras no estabas'));
  if (paso) lineas.push(`- ${paso.replace('Mientras no estabas pasaron', 'Desde el último latido pasaron')}.`);
  else if (fuente === 'nueva') lineas.push('- Nace el pueblo.');
  const notables = r.journal.filter(m => NOTABLE.test(m) && !m.startsWith('Mientras no estabas'));
  const ultimos = notables.slice(-16);
  if (notables.length > ultimos.length) lineas.push(`- ${notables.length} sucesos notables; los últimos:`);
  for (const m of ultimos) lineas.push(`- ${m}`);
  appendFileSync(cronica, lineas.join('\n') + '\n', 'utf-8');
  return lineas;
}

// ---------------------------------------------------------------- Latido
async function main() {
  mkdirSync(ESTADO, { recursive: true });
  const { server, port } = await serveRepo();
  const chrome = await launchChrome();
  log(`Chrome: ${chrome.bin}`);
  const params = VER ? 'debug=1' : `servidor=1${NUEVA ? '&nueva=1' : ''}`;
  const url = `http://127.0.0.1:${port}/index.html?${params}`;
  let exitCode = 0;
  try {
    log(`Abriendo ${url}`);
    await chrome.send('Page.navigate', { url });
    const t0 = Date.now();
    let listo = false;
    let ultimoAviso = 0;
    while (Date.now() - t0 < TIMEOUT_MS) {
      await sleep(1000);
      if (chrome.errors.length) throw new Error('La página lanzó una excepción:\n' + chrome.errors.join('\n'));
      const st = await chrome.evaluate(`JSON.stringify({ listo: window.__listo === true, error: window.__error || null, txt: document.getElementById('loading').textContent })`);
      const s = JSON.parse(st);
      if (s.error) throw new Error('La página no arrancó: ' + s.error);
      if (s.listo) { listo = true; break; }
      if (Date.now() - ultimoAviso > 10000) { ultimoAviso = Date.now(); log(s.txt); }
    }
    if (!listo) throw new Error('La simulación no terminó de ponerse al día en el tiempo previsto');
    log(`Lista en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (VER) {
      const info = await chrome.evaluate(`JSON.stringify({ fuente: __dbg.source, remoto: __dbg.SaveSystem.remote, texto: document.getElementById('hud-saved').textContent, dia: __dbg.DayCycle.day, habitantes: __dbg.Growth.residents(), llamadas: __dbg.Render.renderer.info.render.calls })`);
      log('Visor: ' + info);
      await sleep(1500);
      const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
      const out = join(ESTADO, 'visor.png');
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      log('Captura en ' + out);
      return;
    }
    const raw = await chrome.evaluate(`(() => { __dbg.Sim.paused = true; return JSON.stringify({ partida: __dbg.SaveSystem.build(), resumen: __dbg.resumen(), fuente: __dbg.source }); })()`);
    const { partida, resumen, fuente } = JSON.parse(raw);
    writeFileSync(join(ESTADO, 'partida.json'), JSON.stringify(partida), 'utf-8');
    const lineas = escribirCronica(resumen, fuente);
    const mensaje = `Día ${resumen.day} de Valdecerro: ${resumen.residents} habitantes, ${resumen.season.toLowerCase()} del año ${resumen.year}`;
    writeFileSync(join(ESTADO, 'ultimo-latido.txt'), mensaje + '\n', 'utf-8');
    log(`Estado leído de: ${fuente}. ${mensaje}`);
    for (const l of lineas.slice(1)) log(l);
    if (chrome.consola.length) log('Consola: ' + chrome.consola.slice(-3).join(' | '));
  } catch (err) {
    console.error('LATIDO FALLIDO: ' + err.message);
    if (chrome.consola.length) console.error('Consola: ' + chrome.consola.slice(-5).join('\n'));
    exitCode = 1;
  } finally {
    chrome.close();
    server.close();
    await sleep(500);
    process.exit(exitCode);
  }
}
main().catch((err) => { console.error('LATIDO FALLIDO: ' + err.message); process.exit(1); });
