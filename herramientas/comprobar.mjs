// Comprueba sintaxis (node --check sobre copias .mjs) y que cada import nombrado exista como export.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const SRC = 'C:\\Users\\carlo\\OneDrive\\Desktop\\Claude\\Simulación 3D\\src';
const TMP = process.argv[2];
mkdirSync(TMP, { recursive: true });
const files = readdirSync(SRC).filter(f => f.endsWith('.js'));
const exportsOf = {};
let ok = true;
for (const f of files) {
  const code = readFileSync(join(SRC, f), 'utf8');
  const tmp = join(TMP, f.replace('.js', '.mjs'));
  writeFileSync(tmp, code);
  try { execSync(`node --check "${tmp}"`, { stdio: 'pipe' }); }
  catch (e) { ok = false; console.log('SYNTAX', f, e.stderr.toString().split('\n').slice(0, 6).join('\n')); }
  const names = new Set();
  for (const m of code.matchAll(/export\s+(?:const|let|class|function)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const t = n.trim().split(/\s+as\s+/).pop(); if (t) names.add(t); }
  exportsOf[f] = names;
}
for (const f of files) {
  const code = readFileSync(join(SRC, f), 'utf8');
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.]+)'/g)) {
    const target = m[2];
    if (!exportsOf[target]) { ok = false; console.log('MISSING FILE', f, '->', target); continue; }
    for (const n of m[1].split(',')) {
      const name = n.trim().split(/\s+as\s+/)[0];
      if (name && !exportsOf[target].has(name)) { ok = false; console.log('MISSING EXPORT', f, 'imports', name, 'from', target); }
    }
  }
  // identificadores usados pero nunca importados ni definidos (heurística sobre nombres de módulos conocidos)
  const known = ['Assets', 'Graph', 'Terrain', 'World', 'Render', 'Sim', 'agents', 'animals', 'Economy', 'DayCycle', 'Weather', 'Events', 'Growth', 'HUD', 'CONFIG', 'PALETTE', 'STATE', 'Crops', 'Relations', 'Rng', 'terrainHeight', 'mesh', 'rand', 'pick', 'chance', 'lerp', 'clamp', 'TAU', '_dummy', '_v1', '_c1', 'hex', 'smoothstep', 'rng', 'randInt', 'weightedPick', 'angleDelta', 'spotIsClear', 'RoadField', '_near', 'addFootprint', 'BORDER_NODES', 'std', 'addWindow', 'CameraState', 'ROLE_SINGULAR', 'ROLE_LABELS', 'RESOURCES', 'RESOURCE_LABELS', 'Rain', 'SaveSystem', 'Mover', 'Agent', 'spawnTraveler', 'homeShelter'];
  const imported = new Set();
  for (const m of code.matchAll(/import\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) imported.add(n.trim().split(/\s+as\s+/).pop());
  const defined = new Set(exportsOf[f]);
  for (const m of code.matchAll(/^(?:const|let|class|function)\s+([A-Za-z_$][\w$]*)/gm)) defined.add(m[1]);
  for (const k of known) {
    const re = new RegExp('(?<![\\w$.])' + k.replace('$', '\\$') + '(?![\\w$])');
    const stripped = code.replace(/import[^;]*;/g, '').replace(/\/\/.*$/gm, '').replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
    if (re.test(stripped) && !imported.has(k) && !defined.has(k)) { ok = false; console.log('UNIMPORTED?', f, 'uses', k); }
  }
}
console.log(ok ? 'CHECK OK' : 'CHECK FAILED');
