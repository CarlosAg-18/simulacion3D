import { CONFIG } from './config.js';
import { World } from './state.js';

export const RESOURCES = ['grano', 'madera', 'piedra', 'mineral', 'monedas', 'hierro', 'oro'];
export const RESOURCE_LABELS = { grano: 'Grano', madera: 'Madera', piedra: 'Piedra', mineral: 'Mineral', monedas: 'Monedas', hierro: 'Hierro', oro: 'Oro' };

// Economía global: un único almacén con capacidad, historial reciente y helpers de gasto.
export const Economy = {
  stock: {},
  history: [],
  sampleTimer: 0,
  produced: {},
  consumed: {},
  taxes: 0,
  reset() {
    this.taxes = 0;
    this.treasury = 0;
    this.goldBonus = false;
    for (const r of RESOURCES) {
      this.stock[r] = CONFIG.economy.start[r] || 0;
      this.produced[r] = 0;
      this.consumed[r] = 0;
    }
    this.history.length = 0;
    this.sampleTimer = 0;
  },
  treasury: 0,
  capacity(res) {
    const base = CONFIG.economy.baseCapacity[res] || 9999;
    if (res === 'grano') return base + World.granaries * CONFIG.economy.granaryCapacity + (World.buildings.molino ? CONFIG.economy.millCapacity : 0);
    return base;
  },
  add(res, amount) {
    const room = this.capacity(res) - this.stock[res];
    const real = Math.max(0, Math.min(amount, room));
    this.stock[res] += real;
    this.produced[res] += real;
    return real;
  },
  take(res, amount) {
    const real = Math.max(0, Math.min(amount, this.stock[res]));
    this.stock[res] -= real;
    this.consumed[res] += real;
    return real;
  },
  has(cost) {
    for (const r in cost) if (this.stock[r] < cost[r]) return false;
    return true;
  },
  missing(cost) {
    const out = [];
    for (const r in cost) if (this.stock[r] < cost[r]) out.push(r);
    return out;
  },
  spend(cost) {
    if (!this.has(cost)) return false;
    for (const r in cost) this.take(r, cost[r]);
    return true;
  },
  foodPerCapita(population) { return population > 0 ? this.stock.grano / population : this.stock.grano; },
  // La caravana compra por lotes lo que sobra y vende, con recargo, lo que falta.
  tradeWithCaravan(season) {
    const T = CONFIG.trade;
    const sold = [], bought = [];
    let net = 0;
    const price = (res) => T.prices[res] * (res === 'grano' && season === 'Invierno' ? T.winterFoodMul : 1);
    for (const res of ['grano', 'madera', 'piedra', 'mineral', 'hierro', 'oro']) {
      let lots = 0;
      while (this.stock[res] - T.lotSize >= T.surplus[res] && lots < T.maxLots) {
        this.take(res, T.lotSize);
        const coins = price(res) * T.lotSize * (res === 'oro' && this.goldBonus ? 2 : 1);
        this.add('monedas', coins);
        net += coins;
        lots++;
      }
      if (lots) sold.push(`${lots * T.lotSize} de ${RESOURCE_LABELS[res].toLowerCase()}`);
    }
    for (const res of ['grano', 'madera', 'piedra']) {
      let lots = 0;
      const cost = price(res) * T.buyMarkup * T.lotSize;
      while (this.stock[res] < T.shortage[res] && this.stock.monedas >= cost && lots < T.maxLots) {
        this.take('monedas', cost);
        this.add(res, T.lotSize);
        net -= cost;
        lots++;
      }
      if (lots) bought.push(`${lots * T.lotSize} de ${RESOURCE_LABELS[res].toLowerCase()}`);
    }
    return { sold, bought, net };
  },
  // Los impuestos van al tesoro del castillo, que paga fiestas y faroles.
  payTaxes(residents, mul) {
    const due = Math.min(this.stock.monedas, residents * CONFIG.trade.taxPerResidentPerDay * (mul || 1));
    this.take('monedas', due);
    this.taxes += due;
    this.treasury += due;
    return due;
  },
  spendTreasury(amount) {
    const real = Math.min(this.treasury, amount);
    this.treasury -= real;
    return real;
  },
  goldBonus: false,
  update(dt) {
    this.sampleTimer += dt;
    if (this.sampleTimer >= 5) {
      this.sampleTimer = 0;
      this.history.push(this.stock.grano);
      const max = Math.ceil(CONFIG.economy.historySeconds / 5);
      if (this.history.length > max) this.history.splice(0, this.history.length - max);
    }
  },
  // Tendencia del grano en el periodo reciente: negativa cuando se come más de lo que se cosecha.
  foodTrend() {
    if (this.history.length < 3) return 0;
    return this.history[this.history.length - 1] - this.history[0];
  },
  serialize() { return { stock: Object.assign({}, this.stock), produced: Object.assign({}, this.produced), consumed: Object.assign({}, this.consumed), taxes: this.taxes, treasury: this.treasury }; },
  restore(data) {
    this.reset();
    if (!data) return;
    this.taxes = data.taxes || 0;
    this.treasury = data.treasury || 0;
    for (const r of RESOURCES) {
      if (data.stock && data.stock[r] !== undefined) this.stock[r] = data.stock[r];
      if (data.produced && data.produced[r] !== undefined) this.produced[r] = data.produced[r];
      if (data.consumed && data.consumed[r] !== undefined) this.consumed[r] = data.consumed[r];
    }
  }
};
