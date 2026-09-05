import { CONFIG, ROLE_LABELS, ACTIVITY_LABELS, STATE_LABELS, POLICY_LABELS } from './config.js';
import { Sim, agents, animals, CameraState, Follow, World } from './state.js';
import { Economy, RESOURCES, RESOURCE_LABELS } from './economy.js';
import { DayCycle } from './calendar.js';
import { Weather } from './weather.js';
import { Growth } from './growth.js';
import { STATE } from './agents.js';
import { Tech, Ruler } from './tech.js';
import { Eras } from './eras.js';
import { Exogenous } from './exogenos.js';

const WEATHER_ICONS = {
  SOLEADO: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
  NUBLADO: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 9.1 4.5 4.5 0 0 0 7 18z"/></svg>',
  FRIO: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5"/></svg>',
  LLUVIA: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 6.1 4.5 4.5 0 0 0 7 15z"/><path d="M8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3"/></svg>',
  NIEVE: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 5.1 4.5 4.5 0 0 0 7 14z"/><circle cx="8.5" cy="18.5" r="0.9"/><circle cx="12.5" cy="20.5" r="0.9"/><circle cx="16.5" cy="18.5" r="0.9"/></svg>',
  TORMENTA: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 5.1 4.5 4.5 0 0 0 7 14z"/><path d="M12.5 14l-2.5 4h4l-2.5 4"/></svg>'
};
const ROLE_ORDER = ['agricultor', 'pescador', 'comerciante', 'minero', 'lenador', 'aldeano', 'nino', 'clerigo', 'guardia', 'curandero', 'sabio', 'senor', 'alcalde', 'viajero'];
const ANIMAL_ROWS = [['gallina', 'Gallinas'], ['cerdo', 'Cerdos'], ['perro', 'Perros'], ['caballo', 'Caballos']];

// Panel sintetizado: cifras del pueblo, progreso y gobierno a la vista; almacén, oficios e historial plegables.
export const HUD = {
  els: {}, acc: 0, entries: [], lastWeatherKey: null, callbacks: {}, hidden: false, lastHistoryLen: -1,
  // journal: si es un array, recoge todos los mensajes aunque el panel esté silenciado (crónica del servidor).
  journal: null, remoteSavedAt: 0,
  init(callbacks) {
    this.callbacks = callbacks || {};
    const $ = (id) => document.getElementById(id);
    this.els = {
      hud: $('hud'), toggle: $('hud-toggle'), title: $('hud-title'),
      time: $('hud-time'), day: $('hud-day'), season: $('hud-season'),
      weather: $('hud-weather'), weatherSub: $('hud-weather-sub'), icon: $('hud-weather-icon'),
      alerts: $('hud-alerts'), town: $('hud-town'), progress: $('hud-progress'), techBar: $('hud-tech-bar'),
      stats: $('hud-stats'), resources: $('hud-resources'), log: $('hud-log'),
      chart: $('hud-chart'), chartLegend: $('hud-chart-legend'),
      pause: $('btn-pause'), speed: $('btn-speed'), rotate: $('btn-rotate'),
      save: $('btn-save'), load: $('btn-load'), reset: $('btn-reset'), saved: $('hud-saved'),
      agent: $('agent-panel'), agentName: $('agent-name'), agentRole: $('agent-role'), agentBody: $('agent-body'), agentClose: $('agent-close')
    };
    this.els.pause.addEventListener('click', () => {
      Sim.paused = !Sim.paused;
      this.els.pause.textContent = Sim.paused ? 'Reanudar' : 'Pausar';
      this.els.pause.classList.toggle('active', Sim.paused);
    });
    this.els.speed.addEventListener('click', () => {
      Sim.timeScale = Sim.timeScale >= 4 ? 1 : Sim.timeScale * 2;
      this.els.speed.textContent = Sim.timeScale + 'x';
      this.els.speed.classList.toggle('active', Sim.timeScale > 1);
    });
    this.els.rotate.addEventListener('click', () => {
      CameraState.autoEnabled = !CameraState.autoEnabled;
      this.els.rotate.classList.toggle('active', CameraState.autoEnabled);
    });
    this.els.save.addEventListener('click', () => { if (this.callbacks.onSave) this.callbacks.onSave(); });
    this.els.load.addEventListener('click', () => { if (this.callbacks.onLoad) this.callbacks.onLoad(); });
    this.els.load.textContent = 'Recargar';
    this.els.load.title = 'Vuelve a la última partida guardada';
    this.els.reset.addEventListener('click', () => { if (this.callbacks.onReset) this.callbacks.onReset(); });
    this.els.toggle.addEventListener('click', () => this.togglePanel());
    this.els.agentClose.addEventListener('click', () => { if (this.callbacks.onUnfollow) this.callbacks.onUnfollow(); });
    this.setLoadEnabled(!!this.callbacks.hasSave && this.callbacks.hasSave());
  },
  togglePanel(force) {
    this.hidden = force === undefined ? !this.hidden : force;
    this.els.hud.classList.toggle('collapsed', this.hidden);
    this.els.toggle.textContent = this.hidden ? 'Mostrar panel' : 'Ocultar panel';
    this.els.toggle.setAttribute('aria-expanded', String(!this.hidden));
  },
  setLoadEnabled(v) { this.els.load.disabled = !v; },
  // El estado vino del servidor: aquí solo se mira, así que sobran Guardar y Nueva.
  setRemote(savedAt) {
    this.remoteSavedAt = savedAt || Date.now();
    this.els.save.hidden = true;
    this.els.reset.hidden = true;
    this.els.load.textContent = 'Sincronizar';
    this.els.load.title = 'Vuelve a cargar el último estado guardado por el servidor';
    this.setLoadEnabled(true);
    this.refreshRemote();
  },
  refreshRemote() {
    if (!this.remoteSavedAt) return;
    const min = Math.max(0, Math.round((Date.now() - this.remoteSavedAt) / 60000));
    const ago = min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : `hace ${(min / 60).toFixed(1)} h`;
    this.setSaved(`El pueblo vive en el servidor · estado de ${ago}`);
  },
  setSaved(text) { if (this.els.saved) this.els.saved.textContent = text; },
  formatTime(h) {
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  },
  muted: false,
  log(msg) {
    if (this.journal) this.journal.push(msg);
    if (this.muted) return;
    this.entries.unshift({ msg, time: this.formatTime(DayCycle.hour) });
    if (this.entries.length > 3) this.entries.length = 3;
    const box = this.els.log;
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    this.entries.forEach((e, i) => {
      const p = document.createElement('p');
      const t = document.createElement('time');
      t.textContent = e.time;
      p.appendChild(t);
      p.appendChild(document.createTextNode(e.msg));
      if (i === 0) p.classList.add('fresh');
      box.appendChild(p);
    });
    const fresh = box.firstChild;
    requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove('fresh')));
  },
  rows(el, rows) {
    let html = '';
    for (const [k, v, cls] of rows) html += `<span class="k ${cls || ''}">${k}</span><span class="v ${cls || ''}">${v}</span>`;
    el.innerHTML = html;
  },
  // Gráfica de líneas en SVG: población, comida y enfermos de los últimos días.
  drawChart() {
    const H = Growth.history;
    const svg = this.els.chart;
    if (!svg || H.length === this.lastHistoryLen) return;
    this.lastHistoryLen = H.length;
    if (H.length < 2) { svg.innerHTML = '<text x="4" y="26" fill="rgba(237,228,211,0.55)" font-size="11">Se dibuja a partir del segundo día</text>'; return; }
    const W = 240, HH = 56, pad = 3;
    const series = [
      { key: 'pop', color: '#C9A227' },
      { key: 'grano', color: '#7FAE68' },
      { key: 'sick', color: '#D06A5A' }
    ];
    let out = '';
    for (const s of series) {
      let max = 1;
      for (const h of H) max = Math.max(max, h[s.key]);
      const pts = H.map((h, i) => {
        const x = pad + (W - pad * 2) * (i / (H.length - 1));
        const y = HH - pad - (HH - pad * 2) * (h[s.key] / max);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      out += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.6" stroke-linejoin="round"/>`;
    }
    svg.innerHTML = out;
    const last = H[H.length - 1];
    this.els.chartLegend.innerHTML = `<span style="color:#C9A227">Población ${last.pop}</span><span style="color:#7FAE68">Comida ${last.grano}</span><span style="color:#D06A5A">Enfermos ${last.sick}</span>`;
  },
  bar(label, value, color) {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return `<div class="bar"><span class="bar-k">${label}</span><span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></span><span class="bar-v">${pct}%</span></div>`;
  },
  updateAgentPanel() {
    const a = Follow.agent;
    const el = this.els.agent;
    if (!a || a.removed) { el.hidden = true; return; }
    el.hidden = false;
    this.els.agentName.textContent = a.name;
    this.els.agentRole.textContent = `${a.roleWord}, ${Math.floor(a.age)} años`;
    const partner = a.partnerId !== null ? agents.find(x => x.id === a.partnerId && !x.removed) : null;
    const kids = agents.filter(x => x.follow === a).map(x => x.name);
    const lines = [];
    lines.push(`<p class="agent-act">${ACTIVITY_LABELS[a.activity] || a.activity}, ${STATE_LABELS[a.state] || a.state}${a.sleeping ? ', en casa' : ''}</p>`);
    if (a.helping) lines.push(`<p>Echa una mano con ${RESOURCE_LABELS[a.helping].toLowerCase()}</p>`);
    if (a.infected) lines.push(`<p class="agent-warn">Tiene la peste</p>`);
    else if (a.sick) lines.push(`<p class="agent-warn">Está ${a.isFemale ? 'enferma' : 'enfermo'}</p>`);
    if (a.carry.res && a.carry.amount > 0.5) lines.push(`<p>Lleva ${Math.round(a.carry.amount)} de ${RESOURCE_LABELS[a.carry.res].toLowerCase()}</p>`);
    lines.push(this.bar('Hambre', a.needs.hunger, '#D08A5A'));
    lines.push(this.bar('Energía', a.needs.energy, '#7FAE68'));
    lines.push(this.bar('Ánimo', a.needs.mood, '#C9A227'));
    lines.push(this.bar('Salud', a.needs.health, '#D06A5A'));
    lines.push(`<p>Casa: ${a.home}${partner ? '. Pareja: ' + partner.name : ''}${kids.length ? '. A su cargo: ' + kids.join(', ') : ''}</p>`);
    this.els.agentBody.innerHTML = lines.join('');
  },
  update(realDt) {
    this.acc += realDt;
    if (this.acc < CONFIG.hudRefresh) return;
    this.acc = 0;
    this.refreshRemote();
    this.updateAgentPanel();
    if (this.hidden) return;
    const e = this.els;
    e.title.textContent = Eras.title;
    e.time.textContent = this.formatTime(DayCycle.hour);
    e.day.textContent = 'Día ' + DayCycle.day;
    e.season.textContent = `${DayCycle.phase} · ${DayCycle.season}, día ${DayCycle.dayOfSeason} de ${CONFIG.calendar.daysPerSeason}, año ${DayCycle.year}`;
    const snowing = Weather.isWinter && Weather.isWet;
    const key = Weather.state + (snowing ? '-nieve' : '');
    if (this.lastWeatherKey !== key) {
      this.lastWeatherKey = key;
      e.weather.textContent = Weather.label;
      e.weatherSub.textContent = Weather.sub;
      e.icon.innerHTML = WEATHER_ICONS[snowing && Weather.state === 'LLUVIA' ? 'NIEVE' : Weather.state];
    }
    // Sucesos exógenos en curso: solo aparecen cuando pasa algo.
    const alerts = Exogenous.alerts();
    e.alerts.hidden = alerts.length === 0;
    if (alerts.length) e.alerts.innerHTML = alerts.map(t => `<div>${t}</div>`).join('');
    const counts = {};
    for (const r of ROLE_ORDER) counts[r] = 0;
    let mood = 0, health = 0, residents = 0, sick = 0, infected = 0;
    for (const a of agents) {
      counts[a.role] = (counts[a.role] || 0) + 1;
      if (a.role !== 'viajero') {
        residents++; mood += a.needs.mood; health += a.needs.health;
        if (a.sick) sick++;
        if (a.infected) infected++;
      }
    }
    const pct = (v) => Math.round(v * 100) + '%';
    let livestock = 0;
    for (const an of animals) if (!an.removed) livestock++;
    const town = [
      ['Habitantes', `${residents} / ${Growth.housingCapacity()}`, ''],
      ['Animales', livestock, ''],
      ['Ánimo', pct(residents ? mood / residents : 0), ''],
      ['Salud', pct(residents ? health / residents : 0), ''],
      ['Enfermos', infected ? `${sick} (${infected} de peste)` : sick, ''],
      ['Difuntos', Growth.deaths, ''],
      ['Obra', Growth.siteLabel(), ''], ['', '', '']
    ];
    this.rows(e.town, town);
    const t = Tech.current;
    const ruler = Ruler.agent && !Ruler.agent.removed ? Ruler.agent : null;
    const progress = [
      ['Etapa', Eras.label, ''],
      ['Estudio', t ? t.label + (Tech.waiting === t.id ? ' (faltan materiales)' : '') : 'todo descubierto', ''],
      ['Avances', `${Tech.unlocked.size} / ${CONFIG.tech.tree.length}`, 'optional'],
      ['Gobierno', ruler ? `${Ruler.titleFor(ruler)} ${ruler.name}` : 'sin gobierno', ''],
      ['Decreto', Ruler.policy ? POLICY_LABELS[Ruler.policy].split(':')[0].replace('Decreto de ', '') : 'ninguno', ''],
      ['Popularidad', pct(Ruler.popularity), ''],
      ['Tesoro', Math.round(Economy.treasury), 'optional']
    ];
    if (Exogenous.customs.length) progress.push(['Costumbres', Exogenous.customs.length, 'optional']);
    this.rows(e.progress, progress);
    e.techBar.style.width = Math.round(Tech.progress() * 100) + '%';
    const res = [];
    for (const r of RESOURCES) {
      const v = Math.floor(Economy.stock[r]);
      if ((r === 'hierro' || r === 'oro') && v === 0 && !World.deposits.some(d => d.kind === r)) continue;
      res.push([RESOURCE_LABELS[r], r === 'grano' ? `${v} / ${Economy.capacity(r)}` : v, '']);
    }
    if (res.length % 2 === 1) res.push(['', '', '']);
    this.rows(e.resources, res);
    const rows = [];
    for (const r of ROLE_ORDER) if (counts[r] > 0) rows.push([ROLE_LABELS[r], counts[r], '']);
    for (const [k, label] of ANIMAL_ROWS) {
      let n = 0;
      for (const an of animals) if (an.kind === k && !an.removed) n++;
      if (n > 0) rows.push([label, n, 'optional']);
    }
    if (rows.length % 2 === 1) rows.push(['', '', '']);
    this.rows(e.stats, rows);
    this.drawChart();
  }
};
