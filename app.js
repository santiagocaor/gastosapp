// GastosApp - Sincronizada con Google Sheets BDGastosApp
// Spreadsheet: 1LCPp8qmQC0G-5-w6rTzA4aIG_PQkPs-BDLppPNJ4TbA (vía Google Apps Script)

const STORAGE_KEY = 'gastosapp_sheets_state';

// Base de Datos Estructurada de Gastos extraída directamente de tu Google Sheets (BDGastos)
const BD_GASTOS = {
  "Necesidades": {
    icon: "health_and_safety",
    color: "#006c49",
    subcategorias: {
      "Vivienda": ["Alquiler de vivienda", "Mantenimiento", "Seguro de hogar"],
      "Alimentación": ["Supermercado"],
      "Servicios": ["Energía", "Internet", "Plan de telefonía"],
      "Transporte": ["Gasolina", "Tarjeta de transporte público", "Seguro vehicular", "Mantenimiento mecánico", "Cambio de aceite", "Parqueaderos recurrentes"],
      "Salud": ["Póliza de salud", "Consultas con médicos", "Medicamentos recetados y botiquín familiar", "Tratamientos odontológicos y salud visual"],
      "Educación": ["Matrícula y pensión escolar / universitaria", "Cursos online y certificaciones profesionales", "Libros, útiles escolares y material académico"],
      "Impuestos y trámites": ["Impuesto DIAN", "Asesoría Contador Canadá", "Asesoría Contador Colombia", "Declaración de renta y asesoría tributaria contable"],
      "Vestimenta": ["Ropa de trabajo, dotación y calzado esencial"]
    }
  },
  "Deseos": {
    icon: "celebration",
    color: "#4edea3",
    subcategorias: {
      "Entretenimiento": ["Salidas a restaurantes, cafeterías y bares", "Suscripciones de streaming (Netflix, Spotify, etc.)"],
      "Hobbies y ocio": ["Membresía de gimnasio / actividades deportivas"],
      "Cuidado personal": ["Peluquería, barbería y tratamientos estéticos"],
      "Vacaciones": ["Boletos aéreos, reservas hoteleras y tours turísticos"],
      "Artículos de lujo": ["Perfumería exclusiva, gadgets no esenciales y accesorios"],
      "Regalos y celebraciones": ["Obsequios de cumpleaños, aniversarios y fiestas decembrinas"]
    }
  },
  "Deudas": {
    icon: "credit_card",
    color: "#ba1a1a",
    subcategorias: {
      "Préstamos bancarios": ["Cuota mensual de préstamo"],
      "Tarjetas de crédito": ["Intereses y cargos TC"],
      "Deudas familiares": ["Cuota periódica pactada con familiares"]
    }
  },
  "Ahorros": {
    icon: "savings",
    color: "#004f35",
    subcategorias: {
      "Fondo de emergencia": ["Aporte a cuenta de alto rendimiento para imprevistos"],
      "Viaje Colombia": ["Aporte programado para tiquetes y viáticos a Colombia"]
    }
  },
  "Inversiones": {
    icon: "trending_up",
    color: "#2b6954",
    subcategorias: {
      "Fondo de pensiones voluntarias": ["Aporte a fondo de pensión voluntaria con beneficio tributario"],
      "Portafolio de inversión": ["Inversión periódica en ETFs indexados globales y acciones"],
      "Vivienda": ["Aporte a fiducia / cuota inicial de inversión sobre planos"]
    }
  }
};

// Base de Datos Estructurada de Ingresos extraída directamente de tu Google Sheets (BDIngresos)
const BD_INGRESOS = {
  "Laboral": {
    icon: "work",
    conceptos: ["Nómina Santiago", "Nómina Lina"]
  },
  "Gubernamental": {
    icon: "account_balance",
    conceptos: ["Ayuda de gobierno"]
  },
  "Capacitación / Subsidio": {
    icon: "school",
    conceptos: ["Francisation"]
  },
  "Servicios Profesionales": {
    icon: "support_agent",
    conceptos: ["Asesorías"]
  }
};

// Presupuestos mensuales sugeridos por Macro-categoría
const PRESUPUESTOS_DEFAULT = {
  "Necesidades": 3500000,
  "Deseos": 800000,
  "Deudas": 600000,
  "Ahorros": 1000000,
  "Inversiones": 1000000
};

const DEFAULT_STATE = {
  currency: { code: 'COP ($)', sym: '$' },
  balanceHidden: false,
  activeTab: 'inicio',
  googleScriptUrl: '', // URL del Webhook de Google Apps Script
  sheetsToken: '',     // clave opcional configurada en el script (CONFIG.TOKEN)
  sheetsProtocol: 0,   // 0 desconocido · 1 script antiguo (solo crear) · 2 sincronización completa
  pendingDeletes: [],  // [{ type, id }] borrados que aún no llegan a Sheets
  lastPull: 0,
  presupuestos: { ...PRESUPUESTOS_DEFAULT },
  customCategorias: {}, // { macro: { subcategoria: [conceptos] } } añadidos desde la app
  gastos: [],
  ingresos: []
};

// ========================================================
// UTILIDADES
// ========================================================

// Fecha local en formato YYYY-MM-DD (toISOString usa UTC y adelanta el día en la noche)
function localISODate(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return localISODate(d);
}

function daysBetween(fromIso, toIso) {
  return Math.round((parseISODate(toIso) - parseISODate(fromIso)) / 864e5);
}

function currentMonthKey() {
  return localISODate().slice(0, 7);
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return localISODate(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function monthLabel(key, withYear = false) {
  const [y, m] = key.split('-').map(Number);
  const opts = withYear ? { month: 'long', year: 'numeric' } : { month: 'long' };
  return capitalize(new Date(y, m - 1, 1).toLocaleDateString('es-CO', opts));
}

function shortMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return capitalize(new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''));
}

// Normaliza fechas venidas de Google Sheets ("2026-10-27T04:00:00.000Z", "2026-10-27" o "27/10/2026")
function normalizeSheetDate(value) {
  if (typeof value !== 'string') return value;
  if (value.includes('T')) {
    const d = new Date(value);
    if (!isNaN(d)) return localISODate(d);
  }
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return value.split('T')[0];
}

function formatDisplayDate(fecha) {
  if (!isIsoDate(fecha)) return fecha || '';
  const today = localISODate();
  if (fecha === today) return 'Hoy';
  if (fecha === addDays(today, -1)) return 'Ayer';
  const opts = { day: 'numeric', month: 'short' };
  if (fecha.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
  return parseISODate(fecha).toLocaleDateString('es-CO', opts);
}

function inRange(fecha, start, end) {
  if (!isIsoDate(fecha)) return start === null && end === null;
  return (start === null || fecha >= start) && (end === null || fecha < end);
}

// Monto desde Sheets: número o texto como "3.200.000" / "3,200,000.50"
function toAmount(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^0-9.,-]+/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return Number(s) || 0;
}

// ---------- Monedas ----------
// Cada movimiento guarda `valor` en COP (columna "Valor" de Sheets). Los registrados en CAD
// guardan además moneda: 'CAD', montoOriginal (en CAD) y tasa (COP por 1 CAD de ese día).

function cadRate() {
  return CONVERTER_STATE.rateCadToCop > 0 ? CONVERTER_STATE.rateCadToCop : 1;
}

function displayCurrency() {
  return state.data.displayCurrency === 'COP' ? 'COP' : 'CAD';
}

// Valor del movimiento expresado en COP para sumar. Si se muestran totales en CAD, los
// movimientos hechos en CAD aportan su monto original exacto (montoOriginal × tasa de hoy,
// que al dividir entre la misma tasa vuelve a dar el monto original).
function itemCOP(item) {
  if (displayCurrency() === 'CAD' && item.moneda === 'CAD' && Number(item.montoOriginal) > 0) {
    return Number(item.montoOriginal) * cadRate();
  }
  return Number(item.valor || 0);
}

function toDisplay(cop) {
  return displayCurrency() === 'CAD' ? cop / cadRate() : cop;
}

function fromDisplay(amount) {
  return displayCurrency() === 'CAD' ? amount * cadRate() : amount;
}

function formatCurrency(amount, currency, { compact = false } = {}) {
  const n = Number(amount || 0);
  const sign = n < 0 ? '-' : '';
  if (currency === 'CAD') {
    const decimals = compact && Math.abs(n) >= 1000 ? 0 : 2;
    return `${sign}CA$${Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('es-CO')}`;
}

function sumValor(items) {
  return items.reduce((sum, item) => sum + itemCOP(item), 0);
}

// Escapa texto antes de insertarlo con innerHTML
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Comparación sin tildes ni mayúsculas para el buscador
function normalizeText(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function newId(prefix) {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function sortMovements(a, b) {
  return String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.createdAt || 0) - (a.createdAt || 0);
}

// Medios de pago de los gastos: código guardado → nombre e ícono
const MEDIOS_PAGO = {
  debito: { label: 'Débito', short: 'Débito', icon: 'account_balance' },
  efectivo: { label: 'Efectivo', short: 'Efectivo', icon: 'payments' },
  credito: { label: 'Tarjeta de crédito', short: 'TC', icon: 'credit_card' }
};

// Acepta el código o el nombre que llega de Sheets ("Tarjeta de crédito", "Débito"...)
function normalizeMedio(v) {
  const t = normalizeText(v).trim();
  if (!t) return undefined;
  if (MEDIOS_PAGO[t]) return t;
  if (t.startsWith('tarjeta') || t.includes('credito') || t === 'tc') return 'credito';
  if (t.startsWith('debito')) return 'debito';
  if (t.startsWith('efectivo')) return 'efectivo';
  return undefined;
}

// Nombres cortos para mostrar; en la app y en Sheets se guarda el concepto completo
const SHORT_CONCEPTS = {
  "Tarjeta de transporte público": "Transporte público",
  "Medicamentos recetados y botiquín familiar": "Medicamentos",
  "Tratamientos odontológicos y salud visual": "Odontología y visión",
  "Matrícula y pensión escolar / universitaria": "Matrícula y pensión",
  "Cursos online y certificaciones profesionales": "Cursos y certificaciones",
  "Libros, útiles escolares y material académico": "Libros y útiles",
  "Declaración de renta y asesoría tributaria contable": "Declaración de renta",
  "Ropa de trabajo, dotación y calzado esencial": "Ropa y calzado",
  "Salidas a restaurantes, cafeterías y bares": "Restaurantes y bares",
  "Suscripciones de streaming (Netflix, Spotify, etc.)": "Streaming",
  "Membresía de gimnasio / actividades deportivas": "Gimnasio y deporte",
  "Peluquería, barbería y tratamientos estéticos": "Peluquería y estética",
  "Boletos aéreos, reservas hoteleras y tours turísticos": "Vuelos, hoteles y tours",
  "Perfumería exclusiva, gadgets no esenciales y accesorios": "Lujos y gadgets",
  "Obsequios de cumpleaños, aniversarios y fiestas decembrinas": "Regalos",
  "Cuota periódica pactada con familiares": "Cuota a familiares",
  "Aporte a cuenta de alto rendimiento para imprevistos": "Fondo de emergencia",
  "Aporte programado para tiquetes y viáticos a Colombia": "Ahorro viaje Colombia",
  "Aporte a fondo de pensión voluntaria con beneficio tributario": "Pensión voluntaria",
  "Inversión periódica en ETFs indexados globales y acciones": "ETFs y acciones",
  "Aporte a fiducia / cuota inicial de inversión sobre planos": "Fiducia / cuota inicial"
};

function shortConcept(c) {
  return SHORT_CONCEPTS[c] || c || '';
}

// Catálogo de gastos: el de Sheets + lo que se haya añadido desde la app
function getCategorias() {
  const merged = {};
  Object.entries(BD_GASTOS).forEach(([macro, conf]) => {
    merged[macro] = { ...conf, subcategorias: {} };
    Object.entries(conf.subcategorias).forEach(([sub, list]) => {
      merged[macro].subcategorias[sub] = [...list];
    });
  });
  Object.entries(state.data.customCategorias || {}).forEach(([macro, subs]) => {
    if (!merged[macro]) return;
    Object.entries(subs).forEach(([sub, list]) => {
      const target = merged[macro].subcategorias[sub] || (merged[macro].subcategorias[sub] = []);
      list.forEach(c => { if (!target.includes(c)) target.push(c); });
    });
  });
  return merged;
}

function isCustomConcept(macro, sub, concepto) {
  return !!state.data.customCategorias?.[macro]?.[sub]?.includes(concepto);
}

// Rango de fechas [start, end) de un periodo de estadísticas y su periodo anterior equivalente
function periodRange(period, monthKey) {
  const today = localISODate();

  if (period === 'semana') {
    const start = addDays(today, -6);
    return { start, end: addDays(today, 1), prevStart: addDays(start, -7), prevEnd: start, days: 7, label: 'Últimos 7 días', prevLabel: 'los 7 días anteriores' };
  }

  if (period === 'anio') {
    const y = Number(monthKey.slice(0, 4));
    const start = `${y}-01-01`;
    const end = `${y + 1}-01-01`;
    const prevStart = `${y - 1}-01-01`;
    const isCurrent = String(y) === today.slice(0, 4);
    const fullDays = daysBetween(start, end);
    const days = isCurrent ? daysBetween(start, today) + 1 : (start > today ? 0 : fullDays);
    const prevEnd = isCurrent ? addDays(prevStart, days) : start;
    return { start, end, prevStart, prevEnd, days, label: `Año ${y}`, prevLabel: isCurrent ? `el mismo periodo de ${y - 1}` : `${y - 1}` };
  }

  if (period === 'total') {
    const fechas = [...state.data.gastos, ...state.data.ingresos].map(m => m.fecha).filter(isIsoDate).sort();
    const first = fechas[0] || today;
    return { start: null, end: null, days: Math.max(1, daysBetween(first, today) + 1), label: 'Todo el historial' };
  }

  // Mes
  const start = `${monthKey}-01`;
  const end = `${shiftMonth(monthKey, 1)}-01`;
  const prevStart = `${shiftMonth(monthKey, -1)}-01`;
  const curKey = today.slice(0, 7);
  const isCurrent = monthKey === curKey;
  const days = isCurrent ? Number(today.slice(8)) : (monthKey < curKey ? daysInMonth(monthKey) : 0);
  const prevEnd = isCurrent ? (addDays(prevStart, days) < start ? addDays(prevStart, days) : start) : start;
  return {
    start, end, prevStart, prevEnd, days,
    label: monthLabel(monthKey, true),
    prevLabel: isCurrent ? 'el mismo periodo del mes pasado' : monthLabel(shiftMonth(monthKey, -1)).toLowerCase()
  };
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ========================================================
// ESTADO
// ========================================================
class AppState {
  constructor() {
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      this.data = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_STATE));
    } catch (e) {
      console.error('Error loading state:', e);
      this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    this.migrate();
    this.save();
  }

  migrate() {
    const d = this.data;
    if (!Array.isArray(d.gastos)) d.gastos = [];
    if (!Array.isArray(d.ingresos)) d.ingresos = [];
    if (!d.presupuestos || typeof d.presupuestos !== 'object') d.presupuestos = { ...PRESUPUESTOS_DEFAULT };
    if (!d.customCategorias || typeof d.customCategorias !== 'object') d.customCategorias = {};
    if (!d.currency) d.currency = { ...DEFAULT_STATE.currency };
    if (typeof d.googleScriptUrl !== 'string') d.googleScriptUrl = '';
    if (typeof d.sheetsToken !== 'string') d.sheetsToken = '';
    if (![0, 1, 2].includes(d.sheetsProtocol)) d.sheetsProtocol = 0;
    if (!Array.isArray(d.pendingDeletes)) d.pendingDeletes = [];
    if (typeof d.lastPull !== 'number') d.lastPull = 0;
    if (!['COP', 'CAD'].includes(d.displayCurrency)) d.displayCurrency = 'CAD';
    if (!['COP', 'CAD'].includes(d.registroMoneda)) d.registroMoneda = 'CAD';
    if (!['COP', 'CAD'].includes(d.presupuestoMoneda)) d.presupuestoMoneda = 'COP';
    if (typeof d.sheetsVersion !== 'number') d.sheetsVersion = 0;
    if (!Array.isArray(d.recurrentes)) d.recurrentes = [];
    if (!MEDIOS_PAGO[d.registroMedio]) d.registroMedio = 'debito';
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Error saving state:', e);
      showToast('No se pudo guardar en este dispositivo', 'error');
    }
  }

  // Recibe un monto en COP y lo muestra en la moneda elegida (CAD o COP)
  formatMoney(amountCOP, opts) {
    return formatCurrency(toDisplay(Number(amountCOP || 0)), displayCurrency(), opts);
  }

  gastosEntre(start, end) {
    return this.data.gastos.filter(g => inRange(g.fecha, start, end));
  }

  ingresosEntre(start, end) {
    return this.data.ingresos.filter(i => inRange(i.fecha, start, end));
  }

  monthBounds(key) {
    return [`${key}-01`, `${shiftMonth(key, 1)}-01`];
  }

  getGastosMes(key) {
    return sumValor(this.gastosEntre(...this.monthBounds(key)));
  }

  getIngresosMes(key) {
    return sumValor(this.ingresosEntre(...this.monthBounds(key)));
  }

  getBalanceTotal() {
    return sumValor(this.data.ingresos) - sumValor(this.data.gastos);
  }

  macroTotals(gastos) {
    const totals = {};
    Object.keys(BD_GASTOS).forEach(macro => { totals[macro] = 0; });
    gastos.forEach(g => {
      if (totals[g.macroCategoria] !== undefined) totals[g.macroCategoria] += itemCOP(g);
    });
    return totals;
  }

  // Los presupuestos se guardan en la moneda en que se editaron (presupuestoMoneda);
  // para comparar con los gastos se pasan a COP.
  budgetCOP(macro) {
    const v = Number(this.data.presupuestos[macro] || 0);
    return this.data.presupuestoMoneda === 'CAD' ? v * cadRate() : v;
  }

  getGlobalBudget() {
    return Object.keys(this.data.presupuestos).reduce((a, macro) => a + this.budgetCOP(macro), 0);
  }

  // Guarda un límite escrito en la moneda que se está mostrando. Si esa moneda no es la de
  // los presupuestos, todos se convierten a ella para que queden fijos en esa moneda.
  setBudget(macro, amountDisplay) {
    const cur = displayCurrency();
    if (this.data.presupuestoMoneda !== cur) {
      Object.keys(this.data.presupuestos).forEach(m => {
        const cop = this.budgetCOP(m);
        this.data.presupuestos[m] = cur === 'CAD' ? Math.round(cop / cadRate()) : Math.round(cop);
      });
      this.data.presupuestoMoneda = cur;
    }
    this.data.presupuestos[macro] = cur === 'CAD' ? Math.round(amountDisplay * 100) / 100 : Math.round(amountDisplay);
    this.save();
  }

  list(type) {
    return type === 'gasto' ? this.data.gastos : this.data.ingresos;
  }

  find(type, id) {
    return this.list(type).find(m => m.id === id);
  }

  payload(type, item) {
    // Moneda original (el script v3 la guarda en columnas aparte; los anteriores la ignoran)
    const currency = item.moneda === 'CAD'
      ? { currency: 'CAD', originalAmount: item.montoOriginal, rate: item.tasa }
      : { currency: 'COP', originalAmount: '', rate: '' };
    if (type === 'gasto') {
      return {
        type: "gasto",
        id: item.id,
        date: item.fecha,
        macroCategory: item.macroCategoria,
        subcategory: item.subcategoria,
        concept: item.concepto,
        amount: item.valor,
        note: item.nota || "",
        paymentMethod: item.nota || "", // nombre que usaba el script antiguo
        paymentType: MEDIOS_PAGO[item.medioPago]?.label || "",
        ...currency
      };
    }
    return {
      type: "ingreso",
      id: item.id,
      date: item.fecha,
      incomeType: item.tipoIngreso,
      concept: item.concepto,
      amount: item.valor,
      note: item.nota || "",
      paymentMethod: item.nota || "",
      ...currency
    };
  }

  async addMovement(type, item) {
    item.id = item.id || newId(type === 'gasto' ? 'tx_g_' : 'tx_i_');
    item.fecha = isIsoDate(item.fecha) ? item.fecha : localISODate();
    item.createdAt = Date.now();
    item.synced = false; // pendiente hasta que llegue a Google Sheets
    this.list(type).unshift(item);
    this.save();

    if (this.data.googleScriptUrl) {
      await this.syncItem(type, item);
    }
    return item;
  }

  updateMovement(type, id, changes) {
    const item = this.find(type, id);
    if (!item) return null;
    Object.assign(item, changes);
    // Con el script v2 la edición también se envía a Sheets
    if (this.isFullSync()) item.synced = false;
    this.save();
    return item;
  }

  deleteMovement(type, id) {
    const item = this.find(type, id);
    if (type === 'gasto') this.data.gastos = this.data.gastos.filter(g => g.id !== id);
    else this.data.ingresos = this.data.ingresos.filter(i => i.id !== id);
    if (item && item.remote && this.isFullSync()) this.data.pendingDeletes.push({ type, id });
    this.save();
  }

  clearAllMovements() {
    this.data.gastos = [];
    this.data.ingresos = [];
    this.data.pendingDeletes = [];
    this.save();
  }

  // true cuando el Apps Script soporta editar y borrar (protocolo v2)
  isFullSync() {
    return !!this.data.googleScriptUrl && this.data.sheetsProtocol === 2;
  }

  getPending() {
    return [
      ...this.data.gastos.filter(g => g.synced === false).map(item => ({ type: 'gasto', item })),
      ...this.data.ingresos.filter(i => i.synced === false).map(item => ({ type: 'ingreso', item }))
    ];
  }

  pendingCount() {
    return this.getPending().length + (this.isFullSync() ? this.data.pendingDeletes.length : 0);
  }

  async syncItem(type, item) {
    const ok = this.isFullSync()
      ? (await this.callSheets({ action: 'upsert', ...this.payload(type, item) })).ok
      : await this.legacyPost(this.payload(type, item));
    if (ok) {
      item.synced = true;
      if (this.isFullSync()) item.remote = true;
      this.save();
    }
    return ok;
  }

  // Envía borrados y registros pendientes; devuelve cuántos cambios siguen sin enviarse
  async resendPending() {
    if (!this.data.googleScriptUrl) return this.pendingCount();
    if (this.isFullSync()) {
      for (const d of [...this.data.pendingDeletes]) {
        const r = await this.callSheets({ action: 'delete', type: d.type, id: d.id });
        if (r.ok) {
          this.data.pendingDeletes = this.data.pendingDeletes.filter(p => !(p.type === d.type && p.id === d.id));
          this.save();
        } else if (r.network) {
          break;
        }
      }
    }
    for (const p of this.getPending()) {
      if (!(await this.syncItem(p.type, p.item)) && !this.isFullSync()) break;
    }
    return this.pendingCount();
  }

  // Protocolo v2: POST con JSON en text/plain (petición "simple", sin preflight CORS),
  // así la app puede leer la respuesta del script y saber si guardó.
  async callSheets(body) {
    try {
      const res = await fetch(this.data.googleScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        // fx: tasa CAD→COP de hoy; el script v4 la usa para guardar la hoja en CAD
        body: JSON.stringify({ ...body, fx: Math.round(cadRate() * 100) / 100, ...(this.data.sheetsToken ? { token: this.data.sheetsToken } : {}) })
      });
      const data = await res.json();
      if (!data || data.ok !== true) console.warn('Google Sheets respondió con error:', data);
      return data || { ok: false, error: 'Respuesta vacía' };
    } catch (err) {
      console.error('Error al comunicarse con Google Sheets:', err);
      return { ok: false, error: 'Sin conexión con Google Sheets', network: true };
    }
  }

  // Script antiguo: POST no-cors. La respuesta es opaca, así que solo se detectan fallos de red.
  async legacyPost(payload) {
    try {
      await fetch(this.data.googleScriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return true;
    } catch (err) {
      console.error("Error al sincronizar con Google Sheets:", err);
      return false;
    }
  }

  // Averigua qué versión del script hay detrás de la URL. Se usa GET para no enviarle
  // al script antiguo un POST que no entiende (podría crear filas vacías).
  async detectProtocol() {
    let data = null;
    try {
      const res = await fetch(this.data.googleScriptUrl);
      data = await res.json();
    } catch (err) {
      console.error('No se pudo consultar el script:', err);
      return { protocol: this.data.sheetsProtocol || 0, error: 'No se pudo conectar con el script' };
    }

    let protocol = 0;
    let error = null;
    if (data && data.version >= 2) {
      protocol = 2;
      this.data.sheetsVersion = data.version;
    } else if (data && data.ok === false && /clave/i.test(data.error || '')) {
      // Script v2+ con clave: se confirma por POST
      const ping = await this.callSheets({ action: 'ping' });
      if (ping.ok) {
        protocol = 2;
        this.data.sheetsVersion = ping.version || 2;
      } else {
        error = ping.error || 'Clave incorrecta';
      }
    } else if (data && Array.isArray(data.gastos)) {
      protocol = 1;
    } else {
      error = 'La URL no responde como el script de GastosApp';
    }

    if (protocol) {
      this.data.sheetsProtocol = protocol;
      this.save();
    }
    return { protocol, error };
  }

  remoteToLocal(type, r, i) {
    if (Array.isArray(r)) {
      // Script antiguo: filas sin id
      return type === 'gasto'
        ? { id: "tx_g_gs_" + i, fecha: normalizeSheetDate(r[0]), valor: toAmount(r[1]), macroCategoria: r[2] || "Necesidades", subcategoria: r[3] || "Varios", concepto: r[4] || "", nota: r[5] || "", synced: true }
        : { id: "tx_i_gs_" + i, fecha: normalizeSheetDate(r[0]), valor: toAmount(r[1]), tipoIngreso: r[2] || "Laboral", concepto: r[3] || "", nota: r[4] || "", synced: true };
    }
    const base = { id: String(r.id), fecha: normalizeSheetDate(String(r.fecha || '')), valor: toAmount(r.valor), concepto: r.concepto || "", nota: r.nota || "", synced: true, remote: true };
    // Movimientos creados por un recurrente (en este u otro dispositivo): rec_<plantilla>_<mes>
    if (base.id.startsWith('rec_')) base.recurrenteId = base.id.split('_')[1];
    const medio = normalizeMedio(r.medioPago);
    if (medio) base.medioPago = medio;
    if (r.moneda === 'CAD' && toAmount(r.montoOriginal) > 0) {
      Object.assign(base, { moneda: 'CAD', montoOriginal: toAmount(r.montoOriginal), tasa: toAmount(r.tasa) || (base.valor / toAmount(r.montoOriginal)) });
    } else if (r.moneda === 'COP') {
      base.moneda = 'COP';
    }
    return type === 'gasto'
      ? { ...base, macroCategoria: r.macroCategoria || "Necesidades", subcategoria: r.subcategoria || "Varios" }
      : { ...base, tipoIngreso: r.tipoIngreso || "Laboral" };
  }

  // Sincroniza en ambos sentidos: primero envía los cambios locales y luego trae la hoja.
  // Los registros que aún no se pudieron enviar se conservan tal como están en la app.
  async fetchFromGoogleSheets({ silent = false } = {}) {
    if (!this.data.googleScriptUrl) {
      if (!silent) showToast("Configura primero la URL de tu Google Apps Script", 'error');
      return false;
    }
    if (this._pulling) return this._pulling;

    this._pulling = (async () => {
      try {
        if (!silent) showToast("Sincronizando con Google Sheets...", 'info');
        if (!this.data.sheetsProtocol) {
          const det = await this.detectProtocol();
          if (!det.protocol) throw new Error(det.error);
        }

        await ensureFreshRate();
        await this.resendPending();

        let remote;
        if (this.isFullSync()) {
          remote = await this.callSheets({ action: 'list' });
          if (!remote.ok) throw new Error(remote.error || 'Respuesta inválida del script');
        } else {
          const res = await fetch(this.data.googleScriptUrl);
          remote = await res.json();
          // Filas de encabezado del script antiguo
          if (Array.isArray(remote.gastos)) remote.gastos = remote.gastos.slice(1).filter(r => r[0] && r[1]);
          if (Array.isArray(remote.ingresos)) remote.ingresos = remote.ingresos.slice(1).filter(r => r[0] && r[1]);
        }

        const deleted = new Set(this.data.pendingDeletes.map(d => `${d.type}:${d.id}`));
        ['gasto', 'ingreso'].forEach(type => {
          const key = type === 'gasto' ? 'gastos' : 'ingresos';
          if (!Array.isArray(remote[key])) return;
          const local = this.data[key];
          const pending = local.filter(m => m.synced === false);
          const pendingIds = new Set(pending.map(m => m.id));
          const localById = new Map(local.map(m => [m.id, m]));
          const fromSheet = remote[key]
            .map((r, i) => this.remoteToLocal(type, r, i))
            .filter(m => !pendingIds.has(m.id) && !deleted.has(`${type}:${m.id}`))
            .map(m => {
              const prev = localById.get(m.id);
              if (!prev) return m;
              const merged = { ...m, createdAt: prev.createdAt, recurrenteId: prev.recurrenteId };
              // Script sin columna de medio de pago: se conserva el guardado en la app
              if (!m.medioPago && prev.medioPago) merged.medioPago = prev.medioPago;
              // Script sin columnas de moneda: se conserva la moneda original guardada en la app
              if (!m.moneda && prev.moneda === 'CAD' && Math.round(prev.valor) === Math.round(m.valor)) {
                Object.assign(merged, { moneda: 'CAD', montoOriginal: prev.montoOriginal, tasa: prev.tasa });
              }
              return merged;
            });
          this.data[key] = [...pending, ...fromSheet];
        });

        this.data.lastPull = Date.now();
        this.save();
        renderAll();

        const left = this.pendingCount();
        if (!silent) {
          showToast(left > 0
            ? `Sincronizado; quedan ${left} cambio(s) sin enviar`
            : "¡Sincronizado con Google Sheets!", left > 0 ? 'info' : 'success');
        }
        return true;
      } catch (err) {
        console.error("Error al sincronizar con Google Sheets:", err);
        if (!silent) showToast(err.message || "Error al leer desde Google Sheets", 'error');
        return false;
      } finally {
        this._pulling = null;
      }
    })();
    return this._pulling;
  }

  exportJSON() {
    const { activeTab, ...data } = this.data;
    return JSON.stringify({ app: 'GastosApp', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
  }

  exportCSV() {
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Tipo', 'Fecha', 'Valor (COP)', 'Categoría', 'Subcategoría', 'Concepto', 'Nota', 'Moneda', 'Monto original', 'Tasa CAD→COP', 'Medio de pago']];
    [...this.data.gastos.map(g => ({ ...g, t: 'Gasto' })), ...this.data.ingresos.map(i => ({ ...i, t: 'Ingreso' }))]
      .sort(sortMovements)
      .forEach(m => rows.push([
        m.t, m.fecha, m.valor,
        m.t === 'Gasto' ? m.macroCategoria : m.tipoIngreso,
        m.t === 'Gasto' ? m.subcategoria : '',
        m.concepto, m.nota,
        m.moneda === 'CAD' ? 'CAD' : 'COP', m.moneda === 'CAD' ? m.montoOriginal : '', m.moneda === 'CAD' ? m.tasa : '',
        MEDIOS_PAGO[m.medioPago]?.label || ''
      ]));
    return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  }

  importJSON(text) {
    const parsed = JSON.parse(text);
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || !Array.isArray(data.gastos) || !Array.isArray(data.ingresos)) {
      throw new Error('El archivo no es un respaldo válido de GastosApp');
    }
    // La conexión con Sheets es de cada dispositivo: si este ya tiene una, se conserva
    const { googleScriptUrl, sheetsToken, sheetsProtocol } = this.data;
    this.data = { ...JSON.parse(JSON.stringify(DEFAULT_STATE)), ...data };
    if (googleScriptUrl) Object.assign(this.data, { googleScriptUrl, sheetsToken, sheetsProtocol });
    this.migrate();
    this.save();
  }
}

const state = new AppState();

// Estado de la interfaz (no se guarda)
const ui = {
  viewMonth: currentMonthKey(),
  statsPeriod: 'mes',
  openAcc: new Set(),
  categorySearch: '',
  converterOpen: false,
  taxOpen: false,
  mov: { q: '', type: 'all', cat: 'all', period: 'mes' } // filtros de la pestaña Movimientos
};

// Estado del formulario de registro
const form = {
  type: 'gasto',
  macro: 'Necesidades',
  sub: 'Vivienda',
  concepto: '',
  tipoIngreso: 'Laboral',
  conceptoIngreso: '',
  editing: null // { type, id } cuando se edita un registro existente
};

// ========================================================
// INICIALIZACIÓN
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initActions();
  initForm();
  initPrivacyToggle();
  initModals();
  initSettings();
  initCategorySearch();
  initMovementsFilters();
  initCurrencyConverter();
  initTaxCalculator();
  switchView(state.data.activeTab || 'inicio', { scroll: false });
  processRecurring();
  backgroundSync();
  registerServiceWorker();
});

window.addEventListener('online', () => backgroundSync({ force: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    processRecurring();
    backgroundSync();
  }
});

// Sincronización silenciosa: al abrir la app, al volver a ella y al recuperar la conexión.
// Con el script v2 trae también los cambios hechos en la hoja o en otro dispositivo.
async function backgroundSync({ force = false } = {}) {
  if (!state.data.googleScriptUrl || !navigator.onLine) return;
  const before = state.pendingCount();

  if (state.isFullSync() || !state.data.sheetsProtocol) {
    const stale = Date.now() - (state.data.lastPull || 0) > 2 * 60 * 1000;
    if (!force && !stale && before === 0) return;
    await state.fetchFromGoogleSheets({ silent: true });
  } else if (before > 0) {
    await state.resendPending();
    renderAll();
  }

  const sent = before - state.pendingCount();
  if (sent > 0) showToast(`Se enviaron ${sent} cambio(s) pendientes a Google Sheets`);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker no registrado:', err));
  }
}

// Navegación
function initNavigation() {
  document.querySelectorAll('nav a[data-path]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.getAttribute('data-path'));
    });
  });
}

const VIEW_TITLES = {
  inicio: 'Inicio',
  estadisticas: 'Estadísticas',
  registrar: 'Registrar',
  movimientos: 'Movimientos',
  presupuestos: 'Presupuesto'
};

function switchView(viewName, { scroll = true } = {}) {
  if (!VIEW_TITLES[viewName]) viewName = 'inicio';
  if (viewName !== 'registrar' && (form.editing || form.fromTemplate)) resetForm();

  state.data.activeTab = viewName;
  state.save();

  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`view-${viewName}`);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('nav a[data-path]').forEach(link => {
    const isCurrent = link.getAttribute('data-path') === viewName;
    link.classList.toggle('text-secondary', isCurrent);
    link.classList.toggle('font-semibold', isCurrent);
    link.classList.toggle('text-on-surface-variant', !isCurrent);
    if (isCurrent) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const titleEl = document.getElementById('headerTitle');
  const backBtn = document.getElementById('headerBackBtn');
  if (titleEl) titleEl.textContent = viewName === 'registrar' && form.editing ? 'Editar registro' : viewName === 'registrar' && form.fromTemplate ? 'Registrar recurrente' : VIEW_TITLES[viewName];
  if (backBtn) backBtn.classList.toggle('hidden', viewName !== 'registrar');

  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}
window.switchView = switchView;

// Acciones con data-action (delegación de eventos: evita onclick con datos interpolados)
function initActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;

    switch (d.action) {
      case 'goto': switchView(d.view); break;
      case 'month-prev': changeViewMonth(-1); break;
      case 'month-next': changeViewMonth(1); break;
      case 'mov-type':
        ui.mov.type = d.type;
        renderMovementsView();
        break;
      case 'mov-period':
        ui.mov.period = d.period;
        renderMovementsView();
        break;
      case 'copy-tax': copyTax(d.part); break;
      case 'toggle-tax':
        ui.taxOpen = !ui.taxOpen;
        renderConverterToggle();
        if (ui.taxOpen) setTimeout(() => document.getElementById('taxAmount')?.focus(), 50);
        break;
      case 'toggle-converter':
        ui.converterOpen = !ui.converterOpen;
        renderConverterToggle();
        break;
      case 'edit': startEdit(d.type, d.id); break;
      case 'delete': deleteItem(d.type, d.id); break;
      case 'set-type': setFormType(d.type); break;
      case 'select-macro':
        form.macro = d.macro;
        form.concepto = '';
        renderFormSelectors();
        break;
      case 'select-sub':
        form.sub = d.sub;
        form.concepto = '';
        renderFormSelectors();
        setTimeout(() => document.getElementById('regConceptoSelect')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
        break;
      case 'select-tipo':
        form.tipoIngreso = d.tipo;
        form.conceptoIngreso = '';
        renderFormSelectors();
        break;
      case 'cancel-edit':
        resetForm();
        switchView('inicio');
        break;
      case 'stats-period':
        ui.statsPeriod = d.period;
        renderStatisticsView();
        break;
      case 'toggle-acc':
        if (ui.openAcc.has(d.macro)) ui.openAcc.delete(d.macro);
        else ui.openAcc.add(d.macro);
        renderBudgetsView();
        break;
      case 'remove-concept': removeCustomConcept(d.macro, d.sub, d.concepto); break;
      case 'use-concept': useConcept(d.macro, d.sub, d.concepto); break;
      case 'reset-budgets': resetBudgets(); break;
      case 'set-form-currency': setFormCurrency(d.currency); break;
      case 'set-medio': setFormMedio(d.medio); break;
      case 'toggle-display-currency':
        state.data.displayCurrency = displayCurrency() === 'CAD' ? 'COP' : 'CAD';
        state.save();
        renderAll();
        showToast(`Mostrando montos en ${displayCurrency()}`, 'info');
        break;
      case 'open-recurring':
        closeModal('sheetsConfigModal');
        renderRecurringModal();
        openModal('recurringModal');
        break;
      case 'rec-register':
      case 'rec-edit':
      case 'rec-skip':
      case 'rec-toggle-mode':
      case 'rec-toggle-active':
      case 'rec-delete':
        handleRecurringAction(d.action, d.tpl, d.month);
        break;
      case 'open-modal': openModal(d.modal); break;
      case 'close-modal': closeModal(d.modal); break;
    }
  });

  // Presupuestos y montos de recurrentes editables en línea
  document.addEventListener('change', (e) => {
    const recInput = e.target.closest('input[data-rec-amount]');
    if (recInput) {
      updateRecurringAmount(recInput.dataset.recAmount, recInput.value);
      return;
    }
    const input = e.target.closest('input[data-budget]');
    if (!input) return;
    const num = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(num) || num < 0) {
      showToast('Introduce un monto válido para el presupuesto', 'error');
      input.value = budgetInputValue(input.dataset.budget);
      return;
    }
    state.setBudget(input.dataset.budget, num);
    renderAll();
    showToast(`Presupuesto de ${input.dataset.budget} actualizado`);
  });
}

function changeViewMonth(delta) {
  const next = shiftMonth(ui.viewMonth, delta);
  if (next > currentMonthKey()) return;
  ui.viewMonth = next;
  renderAll();
}

function initPrivacyToggle() {
  const btn = document.getElementById('balanceToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      state.data.balanceHidden = !state.data.balanceHidden;
      state.save();
      updateBalance();
    });
  }
}

function updateBalance() {
  const balEl = document.getElementById('balanceAmount');
  const eye = document.getElementById('eyeIcon');
  if (!balEl) return;

  if (state.data.balanceHidden) {
    balEl.textContent = '••••••••';
    if (eye) eye.textContent = 'visibility_off';
  } else {
    balEl.textContent = state.formatMoney(state.getBalanceTotal());
    if (eye) eye.textContent = 'visibility';
  }
}

// ========================================================
// RENDER
// ========================================================
function renderAll() {
  updateBalance();
  renderDashboard();
  renderMovementsList();
  renderFormSyncHints();
  renderBudgetsView();
  renderMovementsView();
  renderStatisticsView();
  renderNotifications();
  renderSettingsStatus();
  renderRecurringCard();
  if (document.getElementById('recurringModal')?.classList.contains('open')) renderRecurringModal();
  renderCurrencyLabels();
  renderConverterToggle();
}

function renderConverterToggle() {
  document.getElementById('converterBody')?.classList.toggle('hidden', !ui.converterOpen);
  document.getElementById('converterChevron')?.classList.toggle('rotate-180', ui.converterOpen);
  document.getElementById('converterToggleBtn')?.setAttribute('aria-expanded', ui.converterOpen);
  document.getElementById('taxBody')?.classList.toggle('hidden', !ui.taxOpen);
  document.getElementById('taxChevron')?.classList.toggle('rotate-180', ui.taxOpen);
  document.getElementById('taxToggleBtn')?.setAttribute('aria-expanded', ui.taxOpen);
}

function renderCurrencyLabels() {
  const cur = displayCurrency();
  setText('displayCurrencyLabel', cur);
  setText('statCurrencyLabel', cur);
  setText('budgetCurrencyNote', cur === 'CAD'
    ? 'Montos en CAD. Los gastos hechos en COP se convierten con la tasa de hoy.'
    : 'Montos en COP. Los gastos hechos en CAD se muestran con la tasa del día en que se registraron.');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Resumen del presupuesto de un mes: gastado, límite, restante y días que quedan
function budgetSummary(monthKey) {
  const spent = state.getGastosMes(monthKey);
  const budget = state.getGlobalBudget();
  const curKey = currentMonthKey();
  const daysLeft = monthKey === curKey ? daysInMonth(monthKey) - new Date().getDate() + 1 : 0;
  const pctRaw = budget > 0 ? (spent / budget) * 100 : 0;
  return { spent, budget, rem: budget - spent, pctRaw, pct: Math.min(Math.round(pctRaw), 100), daysLeft, isCurrent: monthKey === curKey };
}

function renderDashboard() {
  const key = ui.viewMonth;
  const isCurrent = key === currentMonthKey();
  const totalIngresos = state.getIngresosMes(key);
  const totalGastos = state.getGastosMes(key);
  const b = budgetSummary(key);

  const hour = new Date().getHours();
  setText('greetingText', hour < 12 ? '¡Buenos días! ☀️' : hour < 19 ? '¡Buenas tardes! 👋' : '¡Buenas noches! 🌙');

  setText('dashMonthLabel', `${shortMonthLabel(key)} ${key.slice(0, 4)}`);
  const nextBtn = document.getElementById('monthNextBtn');
  if (nextBtn) {
    nextBtn.disabled = isCurrent;
    nextBtn.classList.toggle('opacity-30', isCurrent);
  }
  const todayBtn = document.getElementById('monthTodayBtn');
  if (todayBtn) todayBtn.classList.toggle('hidden', isCurrent);

  const compact = { compact: true };
  setText('dashIncome', `+${state.formatMoney(totalIngresos, compact)}`);
  setText('dashExpense', `-${state.formatMoney(totalGastos, compact)}`);
  const monthNet = totalIngresos - totalGastos;
  setText('balanceMonthText', `${isCurrent ? 'Este mes' : monthLabel(key)}: ${monthNet >= 0 ? '+' : ''}${state.formatMoney(monthNet, compact)}`);

  // Tasa de ahorro del mes
  const badge = document.getElementById('balanceBadge');
  if (badge) {
    if (totalIngresos > 0) {
      const rate = Math.round(((totalIngresos - totalGastos) / totalIngresos) * 100);
      badge.textContent = `${rate >= 0 ? 'Ahorro' : 'Déficit'} ${Math.abs(rate)}% del mes`;
      badge.classList.remove('hidden');
      badge.classList.toggle('bg-secondary', rate >= 0);
      badge.classList.toggle('bg-error', rate < 0);
    } else {
      badge.classList.add('hidden');
    }
  }

  setText('budgetProgressText', `Presupuesto ${Math.round(b.pctRaw)}%`);
  setText('budgetRatioText', `${state.formatMoney(b.spent, { compact: true })} / ${state.formatMoney(b.budget, { compact: true })}`);
  const bBar = document.getElementById('budgetBar');
  if (bBar) {
    bBar.style.width = `${b.pct}%`;
    bBar.classList.toggle('bg-error-container', b.pctRaw > 100);
    bBar.classList.toggle('bg-secondary-fixed-dim', b.pctRaw <= 100);
  }
  let remText;
  if (b.rem < 0) remText = `Excedido por ${state.formatMoney(-b.rem)}`;
  else if (b.isCurrent) remText = `Quedan ${state.formatMoney(b.rem)} para ${b.daysLeft} día${b.daysLeft === 1 ? '' : 's'}`;
  else remText = `Sobraron ${state.formatMoney(b.rem)} ese mes`;
  setText('budgetRemainingText', remText);

  setText('dashChipsMonth', monthLabel(key));

  // Chips horizontales por macro-categoría
  const chips = document.getElementById('dashCategoryChips');
  if (chips) {
    const macroTotals = state.macroTotals(state.gastosEntre(...state.monthBounds(key)));
    const totalSpent = totalGastos || 1;

    chips.innerHTML = Object.keys(BD_GASTOS).map(macro => {
      const spent = macroTotals[macro] || 0;
      const percent = Math.round((spent / totalSpent) * 100);
      const conf = BD_GASTOS[macro];

      return `
        <button type="button" data-action="goto" data-view="presupuestos" class="flex items-center gap-2.5 p-2.5 pr-3.5 bg-surface-container-lowest rounded-xl shadow-xs shrink-0 min-w-[155px] text-left hover:bg-surface-container-low transition-all active:scale-95">
          <div class="w-9 h-9 rounded-lg bg-secondary-container/40 flex items-center justify-center text-secondary shrink-0">
            <span class="material-symbols-outlined text-[20px]">${conf.icon}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-body-sm font-semibold text-on-surface truncate">${escapeHtml(macro)}</span>
            <div class="flex items-center gap-1.5">
              <span class="text-label-md text-secondary font-bold">${percent}%</span>
              <span class="text-body-sm text-on-surface-variant whitespace-nowrap">${state.formatMoney(spent, { compact: true })}</span>
            </div>
          </div>
        </button>
      `;
    }).join('');
  }
}

function movementRow(m) {
  const isGasto = m.type === 'gasto';
  const sign = isGasto ? '-' : '+';
  const color = isGasto ? 'text-on-surface font-semibold' : 'text-secondary font-bold';
  const icon = isGasto ? (BD_GASTOS[m.macroCategoria]?.icon || 'trending_down') : (BD_INGRESOS[m.tipoIngreso]?.icon || 'trending_up');
  const title = escapeHtml(shortConcept(m.concepto) || (isGasto ? m.subcategoria : m.tipoIngreso));
  const subtitle = escapeHtml(isGasto ? `${m.macroCategoria} › ${m.subcategoria}` : `Ingreso › ${m.tipoIngreso}`);
  const pending = m.synced === false && state.data.googleScriptUrl
    ? `<span class="material-symbols-outlined text-[14px] text-outline align-middle" title="Pendiente de enviar a Google Sheets">cloud_off</span>`
    : '';
  const medio = isGasto && MEDIOS_PAGO[m.medioPago]
    ? `<span class="material-symbols-outlined text-[14px] text-outline align-middle" title="${MEDIOS_PAGO[m.medioPago].label}">${MEDIOS_PAGO[m.medioPago].icon}</span>`
    : '';
  const recurring = m.recurrenteId
    ? `<span class="material-symbols-outlined text-[14px] text-secondary align-middle" title="Movimiento recurrente">event_repeat</span>`
    : '';
  // Monto en la moneda original cuando no coincide con la que se está mostrando
  const itemCurrency = m.moneda === 'CAD' ? 'CAD' : 'COP';
  const original = itemCurrency !== displayCurrency()
    ? `<span class="text-[11px] text-outline whitespace-nowrap">${formatCurrency(itemCurrency === 'CAD' ? m.montoOriginal : m.valor, itemCurrency)}</span>`
    : '';

  return `
    <div role="button" tabindex="0" data-action="edit" data-type="${m.type}" data-id="${escapeHtml(m.id)}" class="p-3 bg-surface-container-lowest rounded-xl shadow-xs flex items-center justify-between transition-colors hover:bg-surface-container-low active:bg-surface-container-low group cursor-pointer" title="Toca para editar">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-full ${isGasto ? 'bg-secondary-container/40 text-secondary' : 'bg-secondary text-on-secondary'} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[20px]">${icon}</span>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-body-md font-semibold text-on-surface truncate">${title}</span>
          <span class="text-body-sm text-on-surface-variant truncate">${subtitle} • ${escapeHtml(formatDisplayDate(m.fecha))} ${medio}${recurring}${pending}</span>
          ${m.nota ? `<span class="text-[11px] text-outline truncate italic">${escapeHtml(m.nota)}</span>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0 pl-2">
        <span class="flex flex-col items-end leading-tight">
          <span class="font-data-metric text-[15px] tracking-tight ${color} whitespace-nowrap">${sign}${state.formatMoney(itemCOP(m))}</span>
          ${original}
        </span>
        <button aria-label="Eliminar" data-action="delete" data-type="${m.type}" data-id="${escapeHtml(m.id)}" class="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-full text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-opacity" type="button">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    </div>
  `;
}

function renderMovementsList() {
  const container = document.getElementById('recentTransactionsList');
  if (!container) return;

  const [start, end] = state.monthBounds(ui.viewMonth);
  const all = [
    ...state.gastosEntre(start, end).map(g => ({ ...g, type: 'gasto' })),
    ...state.ingresosEntre(start, end).map(i => ({ ...i, type: 'ingreso' }))
  ].sort(sortMovements);

  setText('movementsTitle', `Movimientos de ${monthLabel(ui.viewMonth).toLowerCase()}`);

  const LIMIT = 5;
  setText('toggleMovementsBtn', all.length > LIMIT ? `Ver todos (${all.length})` : 'Ver todos');

  if (all.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl space-y-2">
        <span class="material-symbols-outlined text-[32px] text-outline">receipt_long</span>
        <p class="text-body-md">No hay movimientos en ${escapeHtml(monthLabel(ui.viewMonth).toLowerCase())}.</p>
        <button type="button" data-action="goto" data-view="registrar" class="text-label-md text-secondary font-semibold hover:underline">Registrar el primero</button>
      </div>
    `;
    return;
  }

  container.innerHTML = all.slice(0, LIMIT).map(movementRow).join('');
}

// --------------------------------------------------------
// Pestaña Movimientos: buscador y filtros sobre todo el historial
// --------------------------------------------------------
function initMovementsFilters() {
  const q = document.getElementById('movSearch');
  q?.addEventListener('input', () => { ui.mov.q = q.value; renderMovementsView(); });
  const cat = document.getElementById('movCategory');
  if (cat) {
    cat.innerHTML = `<option value="all">Todas las categorías</option>
      <optgroup label="Gastos">${Object.keys(BD_GASTOS).map(m => `<option value="g:${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}</optgroup>
      <optgroup label="Ingresos">${Object.keys(BD_INGRESOS).map(t => `<option value="i:${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</optgroup>
      <optgroup label="Gastos por medio de pago">${Object.entries(MEDIOS_PAGO).map(([k, v]) => `<option value="m:${k}">${escapeHtml(v.label)}</option>`).join('')}</optgroup>`;
    cat.addEventListener('change', () => { ui.mov.cat = cat.value; renderMovementsView(); });
  }
}

function setPillState(selector, key, value) {
  document.querySelectorAll(selector).forEach(btn => {
    const active = btn.dataset[key] === value;
    btn.classList.toggle('bg-primary', active);
    btn.classList.toggle('text-on-primary', active);
    btn.classList.toggle('text-on-surface-variant', !active);
    btn.setAttribute('aria-pressed', active);
  });
}

function renderMovementsView() {
  const list = document.getElementById('movList');
  if (!list) return;
  const f = ui.mov;

  setPillState('#movTypePills [data-type]', 'type', f.type);
  setPillState('#movPeriodPills [data-period]', 'period', f.period);
  setText('movPeriodMonth', `${shortMonthLabel(ui.viewMonth)} ${ui.viewMonth.slice(0, 4)}`);

  const [start, end] = f.period === 'mes' ? state.monthBounds(ui.viewMonth) : [null, null];
  const q = normalizeText(f.q.trim());
  let all = [
    ...(f.type !== 'ingreso' ? state.gastosEntre(start, end).map(g => ({ ...g, type: 'gasto' })) : []),
    ...(f.type !== 'gasto' ? state.ingresosEntre(start, end).map(i => ({ ...i, type: 'ingreso' })) : [])
  ];
  if (f.cat !== 'all') {
    const kind = f.cat.slice(0, 1);
    const name = f.cat.slice(2);
    all = all.filter(m => kind === 'g' ? m.type === 'gasto' && m.macroCategoria === name
      : kind === 'm' ? m.type === 'gasto' && m.medioPago === name
      : m.type === 'ingreso' && m.tipoIngreso === name);
  }
  if (q) {
    all = all.filter(m => [m.concepto, shortConcept(m.concepto), m.nota, m.subcategoria, m.macroCategoria, m.tipoIngreso]
      .some(v => normalizeText(v).includes(q)));
  }
  all.sort(sortMovements);

  const gastos = sumValor(all.filter(m => m.type === 'gasto'));
  const ingresos = sumValor(all.filter(m => m.type === 'ingreso'));
  setText('movSummaryCount', `${all.length} movimiento${all.length === 1 ? '' : 's'}`);
  setText('movSummaryExpense', `-${state.formatMoney(gastos, { compact: true })}`);
  setText('movSummaryIncome', `+${state.formatMoney(ingresos, { compact: true })}`);

  if (all.length === 0) {
    list.innerHTML = `
      <div class="p-6 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl space-y-1">
        <span class="material-symbols-outlined text-[32px] text-outline">search_off</span>
        <p class="text-body-md">No hay movimientos con esos filtros.</p>
      </div>`;
    return;
  }

  // Agrupados por mes, con el neto de cada uno
  const MAX = 300;
  const groups = [];
  all.slice(0, MAX).forEach(m => {
    const k = String(m.fecha || '').slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.k !== k) groups.push(g = { k, items: [] });
    g.items.push(m);
  });
  list.innerHTML = groups.map(g => {
    const net = sumValor(g.items.filter(m => m.type === 'ingreso')) - sumValor(g.items.filter(m => m.type === 'gasto'));
    return `
      <div class="space-y-2">
        <div class="flex items-center justify-between px-1 pt-1">
          <span class="text-label-lg font-bold text-on-surface">${escapeHtml(/^\d{4}-\d{2}$/.test(g.k) ? monthLabel(g.k, true) : 'Sin fecha')}</span>
          <span class="text-label-md font-semibold ${net < 0 ? 'text-error' : 'text-secondary'}">Neto ${net < 0 ? '' : '+'}${state.formatMoney(net, { compact: true })}</span>
        </div>
        ${g.items.map(movementRow).join('')}
      </div>`;
  }).join('') + (all.length > MAX ? `<p class="text-center text-[12px] text-outline py-2">Se muestran los ${MAX} más recientes; usa los filtros para acotar.</p>` : '');
}

function deleteItem(type, id) {
  const item = state.find(type, id);
  if (!item) return;
  let extra = '';
  if (state.isFullSync() && item.remote) extra = '\n\nTambién se borrará de Google Sheets.';
  else if (item.synced === true && state.data.googleScriptUrl) extra = '\n\nSolo se elimina en la app: en Google Sheets debes borrarlo a mano (actualiza el Apps Script para que se borre solo).';
  if (!confirm(`¿Deseas eliminar este registro de ${state.formatMoney(item.valor)}?${extra}`)) return;

  state.deleteMovement(type, id);
  renderAll();
  showToast('Registro eliminado');
  if (state.isFullSync() && state.data.pendingDeletes.length > 0) {
    state.resendPending().then(left => {
      renderAll();
      if (left > 0) showToast('Eliminado en la app; se borrará de Sheets al recuperar la conexión', 'info');
    });
  }
}

// --------------------------------------------------------
// Catálogo de conceptos (dentro de Presupuesto)
// --------------------------------------------------------
function initCategorySearch() {
  const input = document.getElementById('categorySearch');
  const clear = document.getElementById('clearSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    ui.categorySearch = input.value;
    if (clear) clear.classList.toggle('hidden', !input.value);
    renderBudgetsView();
  });
  if (clear) {
    clear.addEventListener('click', () => {
      input.value = '';
      ui.categorySearch = '';
      clear.classList.add('hidden');
      renderBudgetsView();
      input.focus();
    });
  }
}

// Subcategorías de una macro que coinciden con la búsqueda (null si nada coincide)
function filteredSubcategories(macro, conf, q) {
  let subs = Object.entries(conf.subcategorias);
  if (!q || normalizeText(macro).includes(q)) return subs;
  subs = subs
    .map(([sub, list]) => [sub, normalizeText(sub).includes(q) ? list : list.filter(c => normalizeText(c).includes(q) || normalizeText(shortConcept(c)).includes(q))])
    .filter(([, list]) => list.length > 0);
  return subs.length ? subs : null;
}

function conceptsBlock(macro, subs) {
  const m = escapeHtml(macro);
  return subs.map(([sub, list]) => `
    <div class="p-2.5 bg-surface-container-lowest rounded-lg shadow-xs">
      <div class="flex items-center justify-between">
        <span class="text-body-md font-semibold text-on-surface">${escapeHtml(sub)}</span>
        <span class="text-[11px] px-2 py-0.5 rounded bg-surface-container-high text-primary font-medium">${list.length} concepto${list.length === 1 ? '' : 's'}</span>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-1.5">
        ${list.map(c => {
          const attrs = `data-macro="${m}" data-sub="${escapeHtml(sub)}" data-concepto="${escapeHtml(c)}"`;
          const custom = isCustomConcept(macro, sub, c);
          return `
            <span class="inline-flex items-center gap-0.5 text-body-sm rounded ${custom ? 'bg-secondary-container/40 text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}">
              <button type="button" data-action="use-concept" ${attrs} class="px-2 py-0.5 text-left hover:text-primary" title="${escapeHtml(c)} · tocar para registrar">${escapeHtml(shortConcept(c))}</button>
              ${custom ? `<button type="button" data-action="remove-concept" ${attrs} class="pr-1.5 leading-none hover:text-error" aria-label="Quitar concepto"><span class="material-symbols-outlined text-[14px] align-middle">close</span></button>` : ''}
            </span>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function useConcept(macro, sub, concepto) {
  resetForm();
  form.type = 'gasto';
  form.macro = macro;
  form.sub = sub;
  form.concepto = concepto;
  switchView('registrar');
  renderFormSelectors();
  document.getElementById('expenseAmountInput')?.focus();
}

function removeCustomConcept(macro, sub, concepto) {
  if (!confirm(`¿Quitar el concepto "${concepto}" de ${sub}?\nLos registros existentes no se modifican.`)) return;
  const subs = state.data.customCategorias[macro];
  if (!subs || !subs[sub]) return;
  subs[sub] = subs[sub].filter(c => c !== concepto);
  if (subs[sub].length === 0) delete subs[sub];
  if (Object.keys(subs).length === 0) delete state.data.customCategorias[macro];
  state.save();
  renderAll();
  renderFormSelectors();
  showToast('Concepto eliminado');
}

function openCategoryModal() {
  const macroSel = document.getElementById('newCatMacro');
  if (macroSel) {
    macroSel.innerHTML = Object.keys(BD_GASTOS).map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    macroSel.value = form.macro;
  }
  updateCategorySubOptions();
  const subInput = document.getElementById('newCatSub');
  const conceptInput = document.getElementById('newCatConcept');
  if (subInput) subInput.value = '';
  if (conceptInput) conceptInput.value = '';
  openModal('categoryModal');
  setTimeout(() => subInput?.focus(), 200);
}

function updateCategorySubOptions() {
  const macro = document.getElementById('newCatMacro')?.value;
  const list = document.getElementById('newCatSubList');
  if (!list || !macro) return;
  list.innerHTML = Object.keys(getCategorias()[macro]?.subcategorias || {}).map(s => `<option value="${escapeHtml(s)}"></option>`).join('');
}

function saveNewCategory() {
  const macro = document.getElementById('newCatMacro')?.value;
  const sub = (document.getElementById('newCatSub')?.value || '').trim().slice(0, 60);
  const concepto = (document.getElementById('newCatConcept')?.value || '').trim().slice(0, 80);
  if (!BD_GASTOS[macro] || !sub || !concepto) {
    showToast('Completa la subcategoría y el concepto', 'error');
    return;
  }
  const existing = getCategorias()[macro].subcategorias[sub] || [];
  if (existing.some(c => normalizeText(c) === normalizeText(concepto))) {
    showToast('Ese concepto ya existe en esa subcategoría', 'error');
    return;
  }
  const subs = state.data.customCategorias[macro] || (state.data.customCategorias[macro] = {});
  (subs[sub] || (subs[sub] = [])).push(concepto);
  state.save();

  form.macro = macro;
  form.sub = sub;
  form.concepto = concepto;
  ui.openAcc.add(macro);
  closeModal('categoryModal');
  renderAll();
  renderFormSelectors();
  showToast(`Concepto "${concepto}" añadido a ${sub}`);
}

// --------------------------------------------------------
// Presupuestos
// --------------------------------------------------------
function renderBudgetsView() {
  const container = document.getElementById('budgetList');
  if (!container) return;

  const key = ui.viewMonth;
  const b = budgetSummary(key);
  const dim = daysInMonth(key);
  const day = b.isCurrent ? new Date().getDate() : dim;
  const projectedTotal = b.isCurrent && day > 0 ? (b.spent / day) * dim : b.spent;

  setText('budgetHeroMonth', monthLabel(key, true));
  setText('budgetHeroTotal', state.formatMoney(b.budget));
  setText('budgetHeroSpent', state.formatMoney(b.spent));
  setText('budgetHeroRemaining', b.rem >= 0 ? state.formatMoney(b.rem) : `-${state.formatMoney(-b.rem)}`);
  setText('budgetHeroProjection', b.isCurrent
    ? `A este ritmo cerrarás el mes en ${state.formatMoney(projectedTotal)}${b.budget > 0 ? ` (${Math.round((projectedTotal / b.budget) * 100)}% del presupuesto)` : ''}`
    : `Cerraste el mes en ${state.formatMoney(b.spent)}`);
  const heroBar = document.getElementById('budgetHeroBar');
  if (heroBar) heroBar.style.width = `${b.pct}%`;

  const macroTotals = state.macroTotals(state.gastosEntre(...state.monthBounds(key)));
  const categorias = getCategorias();
  const q = normalizeText(ui.categorySearch.trim());

  const cards = Object.keys(BD_GASTOS).map(macro => {
    const conf = categorias[macro];
    const subs = filteredSubcategories(macro, conf, q);
    if (!subs) return '';
    const isOpen = q ? true : ui.openAcc.has(macro);
    const limit = state.budgetCOP(macro);
    const spent = macroTotals[macro] || 0;
    const pctRaw = limit > 0 ? (spent / limit) * 100 : 0;
    const projected = b.isCurrent && day > 0 ? (spent / day) * dim : spent;

    let status, statusClass;
    if (limit <= 0) { status = 'Sin límite asignado'; statusClass = 'text-outline'; }
    else if (pctRaw > 100) { status = `Excedido por ${state.formatMoney(spent - limit)}`; statusClass = 'text-error'; }
    else if (pctRaw >= 85) { status = `Cerca del tope: quedan ${state.formatMoney(limit - spent)}`; statusClass = 'text-error'; }
    else if (b.isCurrent && projected > limit) { status = `Ojo: a este ritmo llegarás a ${state.formatMoney(projected)}`; statusClass = 'text-on-surface-variant'; }
    else { status = `Vas bien: quedan ${state.formatMoney(limit - spent)}`; statusClass = 'text-secondary'; }

    const m = escapeHtml(macro);
    return `
      <div class="bg-surface-container-lowest rounded-xl shadow-xs p-space-md space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white" style="background-color: ${conf.color}">
              <span class="material-symbols-outlined text-[22px]">${conf.icon}</span>
            </div>
            <div class="min-w-0">
              <p class="text-body-md font-bold text-on-surface truncate">${m}</p>
              <p class="text-body-sm ${statusClass} truncate">${escapeHtml(status)}</p>
            </div>
          </div>
          <span class="text-label-md font-semibold text-on-surface-variant shrink-0">${limit > 0 ? `${Math.round(pctRaw)}%` : '—'}</span>
        </div>
        <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 ${pctRaw >= 85 ? 'bg-error' : 'bg-secondary'}" style="width: ${Math.min(pctRaw, 100)}%;"></div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-body-sm text-on-surface-variant">Gastado <b class="text-on-surface">${state.formatMoney(spent)}</b></span>
          <label class="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            Límite
            <span class="relative">
              <span class="absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[12px]">${displayCurrency() === 'CAD' ? 'CA$' : '$'}</span>
              <input type="number" inputmode="decimal" min="0" step="any" data-budget="${m}" value="${budgetInputValue(macro)}" class="w-28 h-9 pl-9 pr-2 rounded-lg bg-surface-container-low border border-slate-200 text-right text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary" aria-label="Presupuesto mensual de ${m}"/>
            </span>
          </label>
        </div>
        <button type="button" class="w-full pt-1 flex items-center justify-between text-body-sm text-secondary font-semibold" data-action="toggle-acc" data-macro="${m}" aria-expanded="${isOpen}">
          <span class="flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">account_tree</span>
            ${Object.keys(conf.subcategorias).length} subcategorías y sus conceptos
          </span>
          <span class="material-symbols-outlined text-[20px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}">expand_more</span>
        </button>
        <div class="${isOpen ? '' : 'hidden'} -mx-space-md -mb-space-md px-space-md pb-space-md pt-2 bg-surface-container-low rounded-b-xl space-y-2">
          ${conceptsBlock(macro, subs)}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = cards.trim() || `
    <div class="p-6 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl">
      <p class="text-body-md">No hay categorías ni conceptos que coincidan.</p>
    </div>
  `;
}

// Límite en la moneda que se está mostrando, para el campo editable
function budgetInputValue(macro) {
  const v = toDisplay(state.budgetCOP(macro));
  return displayCurrency() === 'CAD' ? Math.round(v * 100) / 100 : Math.round(v);
}

function resetBudgets() {
  if (!confirm('¿Restablecer los presupuestos sugeridos para todas las categorías?')) return;
  state.data.presupuestos = { ...PRESUPUESTOS_DEFAULT };
  state.data.presupuestoMoneda = 'COP';
  state.save();
  renderAll();
  showToast('Presupuestos restablecidos');
}

// --------------------------------------------------------
// Estadísticas
// --------------------------------------------------------
function renderStatisticsView() {
  const period = ui.statsPeriod;
  const r = periodRange(period, ui.viewMonth);
  const gastos = state.gastosEntre(r.start, r.end);
  const totalGastos = sumValor(gastos);
  const totalIngresos = sumValor(state.ingresosEntre(r.start, r.end));
  const macroTotals = state.macroTotals(gastos);
  const totalSpent = totalGastos || 1;

  document.querySelectorAll('#statPeriodPills [data-period]').forEach(btn => {
    const active = btn.dataset.period === period;
    btn.classList.toggle('bg-primary-container', active);
    btn.classList.toggle('text-on-primary', active);
    btn.classList.toggle('shadow-xs', active);
    btn.classList.toggle('font-semibold', active);
    btn.classList.toggle('text-on-surface-variant', !active);
    btn.setAttribute('aria-pressed', active);
  });

  setText('statMonthLabel', r.label);
  setText('statTotalExpense', state.formatMoney(totalGastos));
  setText('statIncome', state.formatMoney(totalIngresos));
  const net = totalIngresos - totalGastos;
  const netEl = document.getElementById('statNet');
  if (netEl) {
    netEl.textContent = state.formatMoney(net);
    netEl.classList.toggle('text-error-container', net < 0);
    netEl.classList.toggle('text-secondary-fixed', net >= 0);
  }
  setText('statDailyPace', `${state.formatMoney(r.days > 0 ? totalGastos / r.days : 0)} / día`);

  // Comparación con el periodo anterior equivalente
  const cmp = document.getElementById('statComparison');
  if (cmp) {
    if (period === 'total' || r.prevStart === undefined) {
      cmp.classList.add('hidden');
    } else {
      const prev = sumValor(state.gastosEntre(r.prevStart, r.prevEnd));
      cmp.classList.remove('hidden');
      if (prev <= 0) {
        cmp.innerHTML = `<span class="material-symbols-outlined text-[18px]">info</span><span class="font-label-md font-semibold">Sin gastos en ${escapeHtml(r.prevLabel)} para comparar</span>`;
        cmp.className = 'inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-surface-container-high text-on-surface self-start';
      } else {
        const diff = totalGastos - prev;
        const pct = Math.round(Math.abs(diff / prev) * 100);
        const less = diff <= 0;
        cmp.className = `inline-flex flex-wrap items-center gap-1.5 py-1.5 px-2.5 rounded-lg self-start ${less ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`;
        cmp.innerHTML = `
          <span class="material-symbols-outlined text-[18px]">${less ? 'trending_down' : 'trending_up'}</span>
          <span class="font-label-md font-semibold">${less ? '↓' : '↑'} ${pct}% ${less ? 'menos' : 'más'} que ${escapeHtml(r.prevLabel)}</span>
          <span class="text-label-md opacity-80">(${less ? 'Ahorro' : 'Extra'} ${state.formatMoney(Math.abs(diff))})</span>
        `;
      }
    }
  }

  // Donut SVG
  const circumference = 2 * Math.PI * 62;
  const donutSvg = document.getElementById('donutSvgContainer');
  const donutLegend = document.getElementById('donutLegendContainer');
  const macros = Object.keys(BD_GASTOS).filter(m => (macroTotals[m] || 0) > 0);
  setText('donutCenterTotal', state.formatMoney(totalGastos));

  if (donutSvg) {
    let accOffset = 0;
    let circlesHtml = `<circle cx="80" cy="80" fill="none" r="62" stroke="#eff4ff" stroke-width="20"></circle>`;
    macros.forEach(macro => {
      const len = (macroTotals[macro] / totalSpent) * circumference;
      circlesHtml += `
        <circle cx="80" cy="80" fill="none" r="62" stroke="${BD_GASTOS[macro].color}"
          stroke-dasharray="${len.toFixed(1)} ${(circumference - len).toFixed(1)}"
          stroke-dashoffset="-${accOffset.toFixed(1)}" stroke-width="20">
          <title>${escapeHtml(macro)}: ${state.formatMoney(macroTotals[macro])}</title>
        </circle>
      `;
      accOffset += len;
    });
    donutSvg.innerHTML = circlesHtml;
  }

  if (donutLegend) {
    donutLegend.innerHTML = macros.length === 0
      ? `<p class="text-body-sm text-on-surface-variant text-center py-2">No hay gastos en este periodo.</p>`
      : macros.sort((a, b) => macroTotals[b] - macroTotals[a]).map(macro => {
        const amt = macroTotals[macro];
        return `
          <div class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low transition-colors">
            <div class="flex items-center gap-space-sm">
              <div class="w-3.5 h-3.5 rounded-full" style="background-color: ${BD_GASTOS[macro].color}"></div>
              <span class="font-body-md text-on-surface font-medium">${escapeHtml(macro)}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-label-md text-on-surface-variant">${Math.round((amt / totalSpent) * 100)}%</span>
              <span class="text-data-sm text-on-surface font-semibold">${state.formatMoney(amt)}</span>
            </div>
          </div>
        `;
      }).join('');
  }

  renderMonthlyBars();
  renderTopConcepts(gastos, totalSpent);
}

// Ingresos vs gastos de los últimos 6 meses hasta el mes seleccionado
function renderMonthlyBars() {
  const container = document.getElementById('statMonthlyBars');
  if (!container) return;
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ui.viewMonth, i - 5));
  const data = months.map(k => ({ k, inc: state.getIngresosMes(k), exp: state.getGastosMes(k) }));
  const max = Math.max(1, ...data.map(d => Math.max(d.inc, d.exp)));

  container.innerHTML = data.map(d => `
    <div class="flex-1 flex flex-col items-center gap-1 min-w-0" title="${escapeHtml(monthLabel(d.k, true))}: ingresos ${state.formatMoney(d.inc)}, gastos ${state.formatMoney(d.exp)}">
      <div class="w-full h-28 flex items-end justify-center gap-0.5">
        <div class="w-2.5 sm:w-3 rounded-t bg-secondary-fixed-dim transition-all duration-500" style="height: ${(d.inc / max) * 100}%"></div>
        <div class="w-2.5 sm:w-3 rounded-t bg-primary transition-all duration-500" style="height: ${(d.exp / max) * 100}%"></div>
      </div>
      <span class="text-[11px] ${d.k === ui.viewMonth ? 'text-secondary font-bold' : 'text-on-surface-variant'}">${escapeHtml(shortMonthLabel(d.k))}</span>
    </div>
  `).join('');
}

function renderTopConcepts(gastos, totalSpent) {
  const container = document.getElementById('statTopConcepts');
  if (!container) return;
  const byConcept = {};
  gastos.forEach(g => {
    const k = g.concepto || g.subcategoria || 'Sin concepto';
    byConcept[k] = byConcept[k] || { amt: 0, n: 0, macro: g.macroCategoria };
    byConcept[k].amt += itemCOP(g);
    byConcept[k].n += 1;
  });
  const top = Object.entries(byConcept).sort((a, b) => b[1].amt - a[1].amt).slice(0, 5);

  container.innerHTML = top.length === 0
    ? `<p class="text-body-sm text-on-surface-variant text-center py-2">Sin datos en este periodo.</p>`
    : top.map(([name, v], i) => `
      <div class="space-y-1">
        <div class="flex items-center justify-between gap-2 text-body-sm">
          <span class="text-on-surface font-medium truncate">${i + 1}. ${escapeHtml(shortConcept(name))}</span>
          <span class="text-on-surface font-semibold shrink-0">${state.formatMoney(v.amt)}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
            <div class="h-full rounded-full" style="width: ${(v.amt / totalSpent) * 100}%; background-color: ${BD_GASTOS[v.macro]?.color || '#006c49'}"></div>
          </div>
          <span class="text-[11px] text-on-surface-variant shrink-0">${v.n} mov.</span>
        </div>
      </div>
    `).join('');
}

// --------------------------------------------------------
// Notificaciones (calculadas sobre el mes en curso)
// --------------------------------------------------------
function computeAlerts() {
  const key = currentMonthKey();
  const macroTotals = state.macroTotals(state.gastosEntre(...state.monthBounds(key)));
  const alerts = [];

  Object.keys(BD_GASTOS).forEach(macro => {
    const limit = state.budgetCOP(macro);
    if (limit <= 0) return;
    const spent = macroTotals[macro] || 0;
    const pct = (spent / limit) * 100;
    if (pct > 100) {
      alerts.push({ level: 'error', icon: 'error', title: `${macro}: presupuesto excedido`, text: `Llevas ${state.formatMoney(spent)} de ${state.formatMoney(limit)} (${Math.round(pct)}%).` });
    } else if (pct >= 85) {
      alerts.push({ level: 'warning', icon: 'warning', title: `${macro}: casi al tope`, text: `Has consumido el ${Math.round(pct)}% (${state.formatMoney(spent)} de ${state.formatMoney(limit)}).` });
    }
  });

  const pending = state.pendingCount();
  if (pending > 0 && state.data.googleScriptUrl) {
    alerts.push({ level: 'info', icon: 'cloud_off', title: 'Cambios sin sincronizar', text: `${pending} cambio(s) aún no llegan a Google Sheets. Se reintentará al recuperar la conexión.` });
  }
  if (state.isFullSync() && state.data.sheetsVersion > 0 && state.data.sheetsVersion < 5) {
    alerts.push({ level: 'info', icon: 'system_update', title: 'Actualiza tu Apps Script (v5)', text: 'La nueva versión de apps-script/Code.gs guarda tu Google Sheet en CAD, con la moneda original, la tasa y el medio de pago de cada movimiento.' });
  }
  if (state.data.googleScriptUrl && state.data.sheetsProtocol === 1) {
    alerts.push({ level: 'info', icon: 'system_update', title: 'Actualiza tu Apps Script', text: 'Con el script antiguo, editar o borrar no llega a Google Sheets. Reemplázalo por apps-script/Code.gs para sincronizar en ambos sentidos.' });
  }

  const ingresos = state.getIngresosMes(key);
  const gastos = state.getGastosMes(key);
  if (ingresos > 0 && gastos > ingresos) {
    alerts.push({ level: 'warning', icon: 'account_balance_wallet', title: 'Gastas más de lo que ingresa', text: `Este mes los gastos superan a los ingresos por ${state.formatMoney(gastos - ingresos)}.` });
  }
  return alerts;
}

function renderNotifications() {
  const alerts = computeAlerts();
  const dot = document.getElementById('notifDot');
  if (dot) dot.classList.toggle('hidden', alerts.length === 0);

  const list = document.getElementById('notificationsList');
  if (!list) return;
  const styles = {
    error: 'bg-error-container/60 text-error',
    warning: 'bg-error-container/30 text-error',
    info: 'bg-surface-container text-secondary'
  };
  list.innerHTML = alerts.length === 0
    ? `
      <div class="p-3 bg-secondary-container/40 rounded-xl flex items-start gap-3">
        <span class="material-symbols-outlined text-secondary text-[20px] mt-0.5">task_alt</span>
        <div>
          <p class="text-body-sm font-semibold text-on-surface">Todo en orden</p>
          <p class="text-body-sm text-on-surface-variant">Ninguna categoría está cerca de su límite este mes.</p>
        </div>
      </div>`
    : alerts.map(a => `
      <div class="p-3 rounded-xl flex items-start gap-3 ${styles[a.level].split(' ')[0]}">
        <span class="material-symbols-outlined ${styles[a.level].split(' ')[1]} text-[20px] mt-0.5">${a.icon}</span>
        <div>
          <p class="text-body-sm font-semibold text-on-surface">${escapeHtml(a.title)}</p>
          <p class="text-body-sm text-on-surface-variant">${escapeHtml(a.text)}</p>
        </div>
      </div>`).join('');
}

// --------------------------------------------------------
// Movimientos recurrentes (arriendo, nómina, suscripciones...)
// Cada plantilla genera como máximo un movimiento por mes, con id fijo
// rec_<plantilla>_<YYYY-MM>: así nunca se duplica, ni entre dispositivos ni en Sheets.
// --------------------------------------------------------
function addRecurring(type, item, modo) {
  const tpl = {
    id: 'rc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    modo: modo === 'auto' ? 'auto' : 'proponer',
    activo: true,
    dia: Number(String(item.fecha).slice(8)) || 1,
    ultimo: String(item.fecha).slice(0, 7), // último mes ya registrado u omitido
    datos: {
      macroCategoria: item.macroCategoria,
      subcategoria: item.subcategoria,
      tipoIngreso: item.tipoIngreso,
      concepto: item.concepto,
      nota: item.nota,
      moneda: item.moneda === 'CAD' ? 'CAD' : 'COP',
      medioPago: item.medioPago,
      montoOriginal: item.montoOriginal,
      valor: item.valor
    },
    creado: Date.now()
  };
  state.data.recurrentes.push(tpl);
  state.save();
  return tpl;
}

function recurringDueDate(tpl, monthKey) {
  return `${monthKey}-${String(Math.min(tpl.dia, daysInMonth(monthKey))).padStart(2, '0')}`;
}

function recurringMovementId(tpl, monthKey) {
  return `rec_${tpl.id}_${monthKey}`;
}

// Meses posteriores al último registrado cuya fecha ya llegó (máximo 12 hacia atrás)
function recurringDuePeriods(tpl) {
  const today = localISODate();
  const out = [];
  let k = shiftMonth(tpl.ultimo, 1);
  const oldest = shiftMonth(today.slice(0, 7), -11);
  if (k < oldest) k = oldest;
  while (k <= today.slice(0, 7)) {
    if (recurringDueDate(tpl, k) <= today) out.push(k);
    k = shiftMonth(k, 1);
  }
  return out;
}

function recurringFields(tpl, monthKey) {
  const d = tpl.datos;
  const rate = Math.round(cadRate() * 100) / 100;
  const money = d.moneda === 'CAD'
    ? { valor: Math.round(Number(d.montoOriginal) * rate), moneda: 'CAD', montoOriginal: Number(d.montoOriginal), tasa: rate }
    : { valor: Math.round(Number(d.valor)), moneda: 'COP' };
  const base = { ...money, fecha: recurringDueDate(tpl, monthKey), concepto: d.concepto, nota: d.nota || '', recurrenteId: tpl.id };
  return tpl.type === 'gasto'
    ? { ...base, macroCategoria: d.macroCategoria, subcategoria: d.subcategoria, medioPago: d.medioPago }
    : { ...base, tipoIngreso: d.tipoIngreso };
}

function markRecurringDone(tpl, monthKey) {
  if (monthKey > tpl.ultimo) tpl.ultimo = monthKey;
  state.save();
}

// Crea el movimiento de un mes si aún no existe
function createRecurring(tpl, monthKey) {
  const id = recurringMovementId(tpl, monthKey);
  if (!state.find(tpl.type, id)) {
    state.addMovement(tpl.type, { ...recurringFields(tpl, monthKey), id }).then(renderAll);
  }
  markRecurringDone(tpl, monthKey);
}

// Registra solos los recurrentes automáticos que ya vencieron; devuelve cuántos creó
function processRecurring() {
  let created = 0;
  state.data.recurrentes.filter(t => t.activo && t.modo === 'auto').forEach(tpl => {
    recurringDuePeriods(tpl).forEach(k => {
      if (!state.find(tpl.type, recurringMovementId(tpl, k))) created++;
      createRecurring(tpl, k);
    });
  });
  if (created > 0) {
    renderAll();
    showToast(`Se registraron ${created} movimiento(s) recurrente(s)`);
  }
  return created;
}

// Recurrentes "proponer" pendientes: el mes más antiguo de cada uno
function recurringProposals() {
  return state.data.recurrentes
    .filter(t => t.activo && t.modo === 'proponer')
    .map(tpl => {
      const periods = recurringDuePeriods(tpl).filter(k => !state.find(tpl.type, recurringMovementId(tpl, k)));
      return periods.length ? { tpl, monthKey: periods[0], count: periods.length } : null;
    })
    .filter(Boolean);
}

function recurringAmountText(tpl) {
  const d = tpl.datos;
  return d.moneda === 'CAD' ? formatCurrency(d.montoOriginal, 'CAD') : formatCurrency(d.valor, 'COP');
}

function recurringIcon(tpl) {
  return tpl.type === 'gasto' ? (BD_GASTOS[tpl.datos.macroCategoria]?.icon || 'event_repeat') : (BD_INGRESOS[tpl.datos.tipoIngreso]?.icon || 'event_repeat');
}

function renderRecurringCard() {
  const card = document.getElementById('recurringCard');
  const list = document.getElementById('recurringProposals');
  if (!card || !list) return;
  const proposals = recurringProposals();
  card.classList.toggle('hidden', proposals.length === 0);
  setText('recurringCount', String(proposals.reduce((a, p) => a + p.count, 0)));

  list.innerHTML = proposals.map(({ tpl, monthKey, count }) => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-surface-container-lowest">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-9 h-9 rounded-full ${tpl.type === 'gasto' ? 'bg-secondary-container/40 text-secondary' : 'bg-secondary text-on-secondary'} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[18px]">${recurringIcon(tpl)}</span>
        </div>
        <div class="min-w-0">
          <p class="text-body-sm font-semibold text-on-surface truncate">${escapeHtml(shortConcept(tpl.datos.concepto))}</p>
          <p class="text-[11px] text-on-surface-variant truncate">${tpl.type === 'gasto' ? '-' : '+'}${recurringAmountText(tpl)} · ${escapeHtml(formatDisplayDate(recurringDueDate(tpl, monthKey)))}${count > 1 ? ` · ${count} meses pendientes` : ''}</p>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button type="button" data-action="rec-skip" data-tpl="${tpl.id}" data-month="${monthKey}" class="px-2 py-1 rounded-lg text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container" title="Omitir este mes">Omitir</button>
        <button type="button" data-action="rec-edit" data-tpl="${tpl.id}" data-month="${monthKey}" class="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container" aria-label="Revisar antes de registrar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
        <button type="button" data-action="rec-register" data-tpl="${tpl.id}" data-month="${monthKey}" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary text-on-primary hover:bg-tertiary">Registrar</button>
      </div>
    </div>
  `).join('');
}

function renderRecurringModal() {
  const list = document.getElementById('recurringList');
  if (!list) return;
  const items = [...state.data.recurrentes].sort((a, b) => a.dia - b.dia);
  list.innerHTML = items.length === 0
    ? `<div class="p-4 text-center text-body-sm text-on-surface-variant bg-surface-container-low rounded-xl">
         Aún no tienes recurrentes. Al registrar un gasto o ingreso marca <b>“Repetir cada mes”</b>.
       </div>`
    : items.map(tpl => {
      const cur = tpl.datos.moneda === 'CAD' ? 'CAD' : 'COP';
      const amount = cur === 'CAD' ? tpl.datos.montoOriginal : tpl.datos.valor;
      return `
        <div class="p-3 rounded-xl bg-surface-container-low space-y-2 ${tpl.activo ? '' : 'opacity-60'}">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="material-symbols-outlined text-[20px] text-secondary">${recurringIcon(tpl)}</span>
              <div class="min-w-0">
                <p class="text-body-sm font-semibold text-on-surface truncate">${escapeHtml(shortConcept(tpl.datos.concepto))}</p>
                <p class="text-[11px] text-on-surface-variant">${tpl.type === 'gasto' ? 'Gasto' : 'Ingreso'} · día ${tpl.dia} de cada mes${tpl.activo ? '' : ' · en pausa'}</p>
              </div>
            </div>
            <button type="button" data-action="rec-delete" data-tpl="${tpl.id}" class="p-1 rounded-full text-on-surface-variant hover:text-error" aria-label="Eliminar recurrente"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          </div>
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <label class="flex items-center gap-1 text-[12px] text-on-surface-variant">
              Monto
              <span class="relative">
                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[11px]">${cur === 'CAD' ? 'CA$' : '$'}</span>
                <input type="number" inputmode="decimal" min="0" step="any" data-rec-amount="${tpl.id}" value="${amount}" class="w-28 h-8 pl-8 pr-2 rounded-lg bg-surface-container-lowest border border-slate-200 text-right text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary" aria-label="Monto del recurrente"/>
              </span>
            </label>
            <div class="flex items-center gap-1">
              <button type="button" data-action="rec-toggle-mode" data-tpl="${tpl.id}" class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface-container-lowest hover:bg-surface-container" title="Cambiar modo">
                ${tpl.modo === 'auto' ? '⚡ Automático' : '🔔 Proponer'}
              </button>
              <button type="button" data-action="rec-toggle-active" data-tpl="${tpl.id}" class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface-container-lowest hover:bg-surface-container">
                ${tpl.activo ? 'Pausar' : 'Reanudar'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
}

function handleRecurringAction(action, tplId, monthKey) {
  const tpl = state.data.recurrentes.find(t => t.id === tplId);
  if (!tpl) return;
  switch (action) {
    case 'rec-register':
      createRecurring(tpl, monthKey);
      showToast(`${shortConcept(tpl.datos.concepto)}: ${recurringAmountText(tpl)} registrado`);
      break;
    case 'rec-edit':
      startFromTemplate(tplId, monthKey);
      return;
    case 'rec-skip':
      markRecurringDone(tpl, monthKey);
      showToast(`${shortConcept(tpl.datos.concepto)} omitido en ${monthLabel(monthKey).toLowerCase()}`, 'info');
      break;
    case 'rec-toggle-mode':
      tpl.modo = tpl.modo === 'auto' ? 'proponer' : 'auto';
      state.save();
      if (tpl.modo === 'auto') processRecurring();
      break;
    case 'rec-toggle-active':
      tpl.activo = !tpl.activo;
      // Al reanudar no se recuperan los meses en pausa
      if (tpl.activo) {
        const prev = shiftMonth(currentMonthKey(), -1);
        if (tpl.ultimo < prev) tpl.ultimo = prev;
      }
      state.save();
      if (tpl.activo) processRecurring();
      break;
    case 'rec-delete':
      if (!confirm(`¿Eliminar el recurrente "${tpl.datos.concepto}"?\nLos movimientos ya registrados no se borran.`)) return;
      state.data.recurrentes = state.data.recurrentes.filter(t => t.id !== tplId);
      state.save();
      break;
  }
  renderAll();
}

function updateRecurringAmount(tplId, value) {
  const tpl = state.data.recurrentes.find(t => t.id === tplId);
  const num = Number(value);
  if (!tpl) return;
  if (!Number.isFinite(num) || num <= 0) {
    showToast('Introduce un monto válido', 'error');
    renderRecurringModal();
    return;
  }
  if (tpl.datos.moneda === 'CAD') tpl.datos.montoOriginal = Math.round(num * 100) / 100;
  else tpl.datos.valor = Math.round(num);
  state.save();
  renderAll();
  showToast('Monto del recurrente actualizado (aplica desde el próximo mes)');
}

// ========================================================
// FORMULARIO DE REGISTRO
// (Gasto: Macro -> Sub -> Concepto | Ingreso: Tipo -> Concepto)
// ========================================================
function initForm() {
  document.getElementById('regConceptoSelect')?.addEventListener('change', e => { form.concepto = e.target.value; });
  document.getElementById('regConceptoIngresoSelect')?.addEventListener('change', e => { form.conceptoIngreso = e.target.value; });
  document.getElementById('saveExpenseBtn')?.addEventListener('click', saveForm);
  document.getElementById('expenseAmountInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveForm(); });
  document.getElementById('expenseAmountInput')?.addEventListener('input', renderFormCurrency);
  document.getElementById('regDateInput')?.addEventListener('change', renderFormRecurrence);
  document.getElementById('regRecurrente')?.addEventListener('change', renderFormRecurrence);
  resetForm();
}

function resetForm() {
  form.editing = null;
  form.fromTemplate = null;
  form.moneda = state.data.registroMoneda;
  form.medio = state.data.registroMedio;
  const amt = document.getElementById('expenseAmountInput');
  const nota = document.getElementById('expenseNote');
  const date = document.getElementById('regDateInput');
  const rec = document.getElementById('regRecurrente');
  const modo = document.getElementById('regRecurrenteModo');
  if (amt) amt.value = '';
  if (nota) nota.value = '';
  if (date) date.value = localISODate();
  if (rec) rec.checked = false;
  if (modo) modo.value = 'proponer';
  document.getElementById('editBanner')?.classList.add('hidden');
  renderFormSelectors();
}

function setFormCurrency(currency) {
  form.moneda = currency === 'COP' ? 'COP' : 'CAD';
  // Se recuerda para el próximo registro
  state.data.registroMoneda = form.moneda;
  state.save();
  renderFormCurrency();
}

// Selector de moneda del monto y equivalencia en la otra moneda
function setFormMedio(medio) {
  if (!MEDIOS_PAGO[medio]) return;
  form.medio = medio;
  // Se recuerda para el próximo gasto
  state.data.registroMedio = medio;
  state.save();
  renderFormMedio();
}

function renderFormMedio() {
  const cur = form.medio || state.data.registroMedio;
  document.querySelectorAll('#medioPagoSegment [data-medio]').forEach(btn => {
    const active = btn.dataset.medio === cur;
    btn.classList.toggle('bg-primary', active);
    btn.classList.toggle('text-on-primary', active);
    btn.classList.toggle('shadow-xs', active);
    btn.classList.toggle('text-on-surface-variant', !active);
    btn.setAttribute('aria-pressed', active);
  });
  setText('medioPagoHint', cur === 'credito'
    ? 'Cuenta como gasto hoy. Al pagar la tarjeta no registres otro gasto: solo los intereses o cargos.'
    : '');
}

function renderFormCurrency() {
  const cur = form.moneda || state.data.registroMoneda;
  document.querySelectorAll('#amountCurrencySegment [data-currency]').forEach(btn => {
    const active = btn.dataset.currency === cur;
    btn.classList.toggle('bg-surface-container-lowest', active);
    btn.classList.toggle('text-primary', active);
    btn.classList.toggle('text-primary-fixed', !active);
    btn.setAttribute('aria-pressed', active);
  });
  setText('amountCurrencyPrefix', cur === 'CAD' ? 'CA$' : '$');
  const val = parseFloat(document.getElementById('expenseAmountInput')?.value) || 0;
  const rate = formRate();
  const rateTxt = `1 CAD = ${formatCurrency(rate, 'COP')} COP`;
  setText('amountEquivalent', val > 0
    ? (cur === 'CAD' ? `≈ ${formatCurrency(val * rate, 'COP')} COP · ${rateTxt}` : `≈ ${formatCurrency(val / rate, 'CAD')} · ${rateTxt}`)
    : rateTxt);
}

// Tasa a usar: la del registro original si se edita uno en CAD, si no la de hoy
function formRate() {
  if (form.editing) {
    const prev = state.find(form.editing.type, form.editing.id);
    if (prev && prev.moneda === 'CAD' && prev.tasa > 0) return prev.tasa;
  }
  return cadRate();
}

function renderFormRecurrence() {
  const box = document.getElementById('regRecurrenceBox');
  const linked = document.getElementById('regRecurrenceLinked');
  const options = document.getElementById('regRecurrenteOptions');
  const checkbox = document.getElementById('regRecurrente');
  if (!box) return;

  const item = form.editing ? state.find(form.editing.type, form.editing.id) : null;
  const tpl = item && item.recurrenteId ? state.data.recurrentes.find(t => t.id === item.recurrenteId) : null;
  const isLinked = !!tpl || !!form.fromTemplate;
  box.classList.toggle('hidden', isLinked);
  linked?.classList.toggle('hidden', !isLinked);
  if (isLinked) {
    const t = tpl || state.data.recurrentes.find(r => r.id === form.fromTemplate.tplId);
    setText('regRecurrenceLinkedText', t ? `Movimiento recurrente: el día ${t.dia} de cada mes.` : 'Movimiento recurrente.');
  }

  const fecha = document.getElementById('regDateInput')?.value || localISODate();
  const dia = Number(fecha.slice(8)) || 1;
  setText('regRecurrenteDia', `Se repetirá el día ${dia} de cada mes${dia > 28 ? ' (o el último día en meses más cortos)' : ''}.`);
  options?.classList.toggle('hidden', !checkbox?.checked);
}

function setFormType(type) {
  if (form.editing && form.editing.type !== type) return; // no se cambia el tipo de un registro existente
  form.type = type;
  renderFormSelectors();
}

window.setTransactionType = function(type) {
  if (form.editing) resetForm();
  setFormType(type);
};

function renderFormSelectors() {
  const isGasto = form.type === 'gasto';

  document.querySelectorAll('#typeSegment [data-type]').forEach(btn => {
    const active = btn.dataset.type === form.type;
    btn.classList.toggle('bg-primary', active);
    btn.classList.toggle('text-on-primary', active);
    btn.classList.toggle('shadow-xs', active);
    btn.classList.toggle('text-on-surface-variant', !active);
    btn.classList.toggle('opacity-40', !!form.editing && !active);
    btn.setAttribute('aria-pressed', active);
  });
  document.getElementById('gastoFields')?.classList.toggle('hidden', !isGasto);
  document.getElementById('ingresoFields')?.classList.toggle('hidden', isGasto);

  // Macro-categorías
  const categorias = getCategorias();
  if (!categorias[form.macro]) form.macro = Object.keys(categorias)[0];
  const macroGrid = document.getElementById('regMacroGrid');
  if (macroGrid) {
    macroGrid.innerHTML = Object.keys(categorias).map(macro => {
      const isSel = macro === form.macro;
      return `
        <button class="p-2.5 rounded-xl flex flex-col items-center justify-center transition-all ${isSel ? 'bg-secondary/15 ring-2 ring-secondary font-bold text-primary' : 'bg-surface-container text-on-surface-variant'}" type="button" data-action="select-macro" data-macro="${escapeHtml(macro)}" aria-pressed="${isSel}">
          <span class="material-symbols-outlined text-[22px] mb-1">${categorias[macro].icon}</span>
          <span class="text-label-md text-center truncate w-full">${escapeHtml(macro)}</span>
        </button>
      `;
    }).join('');
  }

  // Subcategorías
  const subcats = Object.keys(categorias[form.macro].subcategorias);
  if (!subcats.includes(form.sub)) form.sub = subcats[0] || '';
  const subList = document.getElementById('regSubcatList');
  if (subList) {
    subList.innerHTML = subcats.map(sub => {
      const isSel = sub === form.sub;
      return `
        <button class="px-3 py-1.5 rounded-lg text-label-md transition-all ${isSel ? 'bg-primary text-on-primary font-semibold shadow-xs' : 'bg-surface-container text-on-surface'}" type="button" data-action="select-sub" data-sub="${escapeHtml(sub)}" aria-pressed="${isSel}">
          ${escapeHtml(sub)}
        </button>
      `;
    }).join('');
  }

  // Conceptos (incluye el concepto del registro editado aunque ya no exista en el catálogo)
  const conceptos = [...(categorias[form.macro].subcategorias[form.sub] || [])];
  if (form.concepto && !conceptos.includes(form.concepto)) conceptos.unshift(form.concepto);
  if (!form.concepto) form.concepto = conceptos[0] || '';
  const select = document.getElementById('regConceptoSelect');
  if (select) {
    select.innerHTML = conceptos.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(shortConcept(c))}</option>`).join('');
    select.value = form.concepto;
  }

  // Tipos de ingreso
  if (!BD_INGRESOS[form.tipoIngreso]) form.tipoIngreso = Object.keys(BD_INGRESOS)[0];
  const tipoGrid = document.getElementById('regTipoIngresoGrid');
  if (tipoGrid) {
    tipoGrid.innerHTML = Object.keys(BD_INGRESOS).map(tipo => {
      const isSel = tipo === form.tipoIngreso;
      return `
        <button class="p-2.5 rounded-xl flex flex-col items-center justify-center transition-all ${isSel ? 'bg-secondary/15 ring-2 ring-secondary font-bold text-primary' : 'bg-surface-container text-on-surface-variant'}" type="button" data-action="select-tipo" data-tipo="${escapeHtml(tipo)}" aria-pressed="${isSel}">
          <span class="material-symbols-outlined text-[22px] mb-1">${BD_INGRESOS[tipo].icon}</span>
          <span class="text-label-md text-center truncate w-full">${escapeHtml(tipo)}</span>
        </button>
      `;
    }).join('');
  }

  const conceptosIng = [...BD_INGRESOS[form.tipoIngreso].conceptos];
  if (form.conceptoIngreso && !conceptosIng.includes(form.conceptoIngreso)) conceptosIng.unshift(form.conceptoIngreso);
  if (!form.conceptoIngreso) form.conceptoIngreso = conceptosIng[0] || '';
  const selectIng = document.getElementById('regConceptoIngresoSelect');
  if (selectIng) {
    selectIng.innerHTML = conceptosIng.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    selectIng.value = form.conceptoIngreso;
  }

  renderFormSyncHints();
}

function renderFormSyncHints() {
  const hasSheets = !!state.data.googleScriptUrl;
  const label = form.type === 'gasto' ? 'Gasto' : 'Ingreso';
  setText('saveExpenseText', form.editing ? 'Guardar cambios' : (hasSheets ? `Guardar ${label} en Google Sheets` : `Guardar ${label}`));
  setText('saveHintText', form.editing
    ? (state.isFullSync() ? 'Los cambios también se aplicarán en tu Google Sheet.'
      : form.editing.synced && hasSheets ? 'Los cambios se guardan en la app; en Google Sheets corrígelo a mano.' : 'Los cambios se guardan en este dispositivo.')
    : (hasSheets ? 'Se registrará en la pestaña correspondiente de tu Google Sheet' : 'Se guarda en este dispositivo. Conecta Google Sheets en Ajustes para sincronizar.'));
  setText('syncTargetText', hasSheets ? 'BDGastosApp' : 'este dispositivo');
  renderFormCurrency();
  renderFormMedio();
  renderFormRecurrence();
}

function startEdit(type, id) {
  const item = state.find(type, id);
  if (!item) return;
  form.editing = { type, id, synced: item.synced === true };
  form.type = type;
  if (type === 'gasto') {
    form.macro = item.macroCategoria;
    form.sub = item.subcategoria;
    form.concepto = item.concepto || '';
  } else {
    form.tipoIngreso = item.tipoIngreso;
    form.conceptoIngreso = item.concepto || '';
  }
  form.moneda = item.moneda === 'CAD' ? 'CAD' : 'COP';
  form.medio = MEDIOS_PAGO[item.medioPago] ? item.medioPago : state.data.registroMedio;
  switchView('registrar');

  document.getElementById('expenseAmountInput').value = item.moneda === 'CAD' ? item.montoOriginal : item.valor;
  document.getElementById('expenseNote').value = item.nota || '';
  document.getElementById('regDateInput').value = isIsoDate(item.fecha) ? item.fecha : localISODate();
  document.getElementById('regRecurrente').checked = false;
  document.getElementById('editBanner')?.classList.remove('hidden');
  renderFormSelectors();
}

// Abre el formulario con los datos de un recurrente para revisarlo antes de registrarlo
function startFromTemplate(tplId, monthKey) {
  const tpl = state.data.recurrentes.find(t => t.id === tplId);
  if (!tpl) return;
  resetForm();
  const d = tpl.datos;
  form.type = tpl.type;
  form.fromTemplate = { tplId, monthKey };
  form.moneda = d.moneda === 'CAD' ? 'CAD' : 'COP';
  form.medio = MEDIOS_PAGO[d.medioPago] ? d.medioPago : state.data.registroMedio;
  if (tpl.type === 'gasto') {
    form.macro = d.macroCategoria;
    form.sub = d.subcategoria;
    form.concepto = d.concepto || '';
  } else {
    form.tipoIngreso = d.tipoIngreso;
    form.conceptoIngreso = d.concepto || '';
  }
  switchView('registrar');
  document.getElementById('expenseAmountInput').value = d.moneda === 'CAD' ? d.montoOriginal : d.valor;
  document.getElementById('expenseNote').value = d.nota || '';
  document.getElementById('regDateInput').value = recurringDueDate(tpl, monthKey);
  renderFormSelectors();
}

async function saveForm() {
  const amtInput = document.getElementById('expenseAmountInput');
  const val = Math.round(parseFloat(amtInput ? amtInput.value : 0) * 100) / 100;

  if (!val || val <= 0) {
    showToast('Introduce un monto válido', 'error');
    if (amtInput) amtInput.focus();
    return;
  }

  const nota = (document.getElementById('expenseNote')?.value || '').trim();
  const dateVal = document.getElementById('regDateInput')?.value;
  const fecha = isIsoDate(dateVal) ? dateVal : localISODate();

  // En CAD se guarda el monto original y la tasa; `valor` queda en COP para totales y Sheets
  const rate = Math.round(formRate() * 100) / 100;
  const money = form.moneda === 'CAD'
    ? { valor: Math.round(val * rate), moneda: 'CAD', montoOriginal: val, tasa: rate }
    : { valor: Math.round(val), moneda: 'COP', montoOriginal: undefined, tasa: undefined };

  const fields = form.type === 'gasto'
    ? { ...money, fecha, macroCategoria: form.macro, subcategoria: form.sub, concepto: document.getElementById('regConceptoSelect')?.value || form.concepto, nota, medioPago: form.medio }
    : { ...money, fecha, tipoIngreso: form.tipoIngreso, concepto: document.getElementById('regConceptoIngresoSelect')?.value || form.conceptoIngreso, nota };

  const label = form.type === 'gasto' ? 'Gasto' : 'Ingreso';
  const wantsRecurring = document.getElementById('regRecurrente')?.checked;
  const recurringMode = document.getElementById('regRecurrenteModo')?.value === 'auto' ? 'auto' : 'proponer';
  const amountText = formatCurrency(val, form.moneda);

  if (form.fromTemplate) {
    // Registro de un recurrente propuesto (id fijo por mes: no se duplica)
    const { tplId, monthKey } = form.fromTemplate;
    const tpl = state.data.recurrentes.find(t => t.id === tplId);
    if (tpl) {
      state.addMovement(tpl.type, { ...fields, id: recurringMovementId(tpl, monthKey), recurrenteId: tpl.id }).then(renderAll);
      markRecurringDone(tpl, monthKey);
    }
    showToast(`${label} recurrente de ${amountText} registrado`);
  } else if (form.editing) {
    const { type, id, synced } = form.editing;
    const item = state.updateMovement(type, id, fields);
    if (item && wantsRecurring && !item.recurrenteId) {
      item.recurrenteId = addRecurring(type, item, recurringMode).id;
      state.save();
    }
    if (item && item.synced === false && state.data.googleScriptUrl) {
      state.syncItem(type, item).then(ok => {
        renderAll();
        if (!ok) showToast('Actualizado en la app; se enviará a Sheets al recuperar la conexión', 'info');
      });
    }
    showToast(synced && state.data.googleScriptUrl && !state.isFullSync()
      ? 'Registro actualizado en la app (corrígelo también en Google Sheets)'
      : 'Registro actualizado');
  } else {
    const type = form.type;
    const promise = state.addMovement(type, fields);
    // addMovement agrega el registro de inmediato; el envío a Sheets sigue en segundo plano
    const created = state.list(type)[0];
    if (wantsRecurring && created) {
      created.recurrenteId = addRecurring(type, created, recurringMode).id;
      state.save();
    }
    promise.then(item => {
      if (state.data.googleScriptUrl && item.synced === false) {
        showToast(`${label} guardado; se enviará a Google Sheets al recuperar la conexión`, 'info');
      }
      renderAll();
    });
    showToast(wantsRecurring
      ? `${label} de ${amountText} registrado y programado cada mes`
      : `${label} de ${amountText} registrado`);
  }

  // Ver el mes del registro guardado
  ui.viewMonth = fecha.slice(0, 7) <= currentMonthKey() ? fecha.slice(0, 7) : currentMonthKey();
  resetForm();
  switchView('inicio');
}

// ========================================================
// MODALES Y AJUSTES
// ========================================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (id === 'sheetsConfigModal') {
    const input = document.getElementById('googleScriptUrlInput');
    if (input) input.value = state.data.googleScriptUrl || '';
    const tokenInput = document.getElementById('sheetsTokenInput');
    if (tokenInput) tokenInput.value = state.data.sheetsToken || '';
    renderSettingsStatus();
  }
  modal.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  });
  document.getElementById('btnNewCategory')?.addEventListener('click', openCategoryModal);
  document.getElementById('newCatMacro')?.addEventListener('change', updateCategorySubOptions);
  document.getElementById('saveCategoryBtn')?.addEventListener('click', saveNewCategory);
}

window.openSheetsConfigModal = () => openModal('sheetsConfigModal');
window.closeSheetsConfigModal = () => closeModal('sheetsConfigModal');

function renderSettingsStatus() {
  const pending = state.pendingCount();
  const hasSheets = !!state.data.googleScriptUrl;
  const mode = { 2: 'Sincronización completa (crear, editar y borrar).', 1: 'Script antiguo: solo se envían registros nuevos. Actualiza el Apps Script para editar y borrar.', 0: 'Conexión sin verificar.' }[state.data.sheetsProtocol];
  const last = state.data.lastPull ? ` Última sincronización: ${new Date(state.data.lastPull).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}` : '';
  setText('syncStatusText', !hasSheets
    ? 'Sin conectar: los datos solo están en este dispositivo.'
    : `${mode} ${pending > 0 ? `${pending} cambio(s) pendientes de enviar.` : 'Todo enviado.'}${state.isFullSync() ? last : ''}`);
  document.getElementById('resendPendingBtn')?.classList.toggle('hidden', !hasSheets || pending === 0);
  setText('reloadFromSheetsText', state.isFullSync() ? 'Sincronizar ahora' : 'Cargar desde Google Sheets');
  setText('dataStatsText', `${state.data.gastos.length} gastos y ${state.data.ingresos.length} ingresos guardados.`);
}

function initSettings() {
  document.getElementById('saveSheetsUrlBtn')?.addEventListener('click', async () => {
    const url = (document.getElementById('googleScriptUrlInput')?.value || '').trim();
    const token = (document.getElementById('sheetsTokenInput')?.value || '').trim();
    if (url && /\/macros\/library\//.test(url)) {
      showToast('Esa es la URL de una Biblioteca. Implementa el script como "Aplicación web" y usa la URL que termina en /exec', 'error');
      return;
    }
    if (url && !/^https:\/\/script\.google\.com\/macros\/(s|u\/\d+\/s)\/[\w-]+\/(exec|dev)(\?.*)?$/.test(url)) {
      showToast('La URL debe ser de una aplicación web de Apps Script: https://script.google.com/macros/s/.../exec', 'error');
      return;
    }
    const changed = url !== state.data.googleScriptUrl || token !== state.data.sheetsToken;
    state.data.googleScriptUrl = url;
    state.data.sheetsToken = token;
    if (changed) state.data.sheetsProtocol = 0;
    state.save();

    if (!url) {
      closeModal('sheetsConfigModal');
      renderAll();
      showToast('Sincronización desconectada');
      return;
    }

    showToast('Verificando conexión con Google Sheets...', 'info');
    const { protocol, error } = await state.detectProtocol();
    renderAll();
    if (protocol === 2) {
      closeModal('sheetsConfigModal');
      showToast('Conectado: sincronización completa activada');
      state.fetchFromGoogleSheets({ silent: true }).then(renderAll);
    } else if (protocol === 1) {
      closeModal('sheetsConfigModal');
      showToast('Conectado con el script antiguo: actualízalo para editar y borrar en Sheets', 'info');
      backgroundSync({ force: true });
    } else {
      showToast(`URL guardada, pero ${error ? error.charAt(0).toLowerCase() + error.slice(1) : 'no se pudo verificar'}`, 'error');
    }
  });

  document.getElementById('reloadFromSheetsBtn')?.addEventListener('click', () => state.fetchFromGoogleSheets());

  document.getElementById('resendPendingBtn')?.addEventListener('click', async () => {
    const left = await state.resendPending();
    renderAll();
    showToast(left === 0 ? 'Pendientes enviados a Google Sheets' : `Aún quedan ${left} pendientes (¿sin conexión?)`, left === 0 ? 'success' : 'error');
  });

  document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
    downloadFile(`gastosapp-respaldo-${localISODate()}.json`, state.exportJSON(), 'application/json');
    showToast('Respaldo JSON descargado');
  });

  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    downloadFile(`gastosapp-movimientos-${localISODate()}.csv`, state.exportCSV(), 'text/csv;charset=utf-8');
    showToast('CSV descargado');
  });

  const importInput = document.getElementById('importJsonInput');
  importInput?.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (!confirm('Importar este respaldo reemplazará todos los datos actuales de la app. ¿Continuar?')) return;
      state.importJSON(text);
      ui.viewMonth = currentMonthKey();
      closeModal('sheetsConfigModal');
      resetForm();
      renderAll();
      showToast('Respaldo importado');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'No se pudo leer el archivo', 'error');
    }
  });
}

window.confirmResetAll = function() {
  const note = state.data.googleScriptUrl
    ? '\n\nSolo se vacía este dispositivo: tu Google Sheet no se modifica y los datos volverán al sincronizar.'
    : '\n\nTip: exporta un respaldo antes.';
  if (confirm(`¿Deseas vaciar todos los gastos e ingresos registrados en la app? Tu balance quedará en $0.${note}`)) {
    state.clearAllMovements();
    renderAll();
    closeModal('sheetsConfigModal');
    showToast('Registros vaciados: balance en $0');
  }
};

// Toast
let toastTimer = null;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');
  if (!toast || !toastMsg) return;

  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  toastMsg.textContent = message;
  if (toastIcon) toastIcon.textContent = icons[type] || icons.success;
  toast.classList.toggle('bg-error', type === 'error');
  toast.classList.toggle('bg-primary', type !== 'error');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ========================================================
// CONVERSOR DE DIVISAS (COP ⇄ CAD) EN TIEMPO REAL
// ========================================================
const CONVERTER_STATE = {
  direction: 'COP_TO_CAD', // 'COP_TO_CAD' | 'CAD_TO_COP'
  rateCadToCop: 2240.24,   // Tasa de partida estimada
  lastUpdated: null,
  isLoading: false
};

// Cargar tasa guardada en caché si existe
try {
  const savedRate = localStorage.getItem('gastosapp_cad_cop_rate');
  if (savedRate) {
    const parsed = JSON.parse(savedRate);
    if (parsed.rate > 0) {
      CONVERTER_STATE.rateCadToCop = parsed.rate;
      CONVERTER_STATE.lastUpdated = new Date(parsed.timestamp);
    }
  }
} catch (e) {
  console.warn('Error al leer tasa guardada en caché:', e);
}

function initCurrencyConverter() {
  updateConverterUI();
  calculateConversion();
  // Obtener cotización fresca en vivo al cargar la aplicación
  fetchLiveExchangeRate(false);
}

// Antes de sincronizar con Sheets se usa una tasa del día (se pide si la guardada tiene más de 6 h)
async function ensureFreshRate() {
  const last = CONVERTER_STATE.lastUpdated;
  if (last && Date.now() - last.getTime() < 6 * 60 * 60 * 1000) return;
  await fetchLiveExchangeRate(false);
}

async function fetchLiveExchangeRate(isManualRefresh = false) {
  const refreshIcon = document.getElementById('refreshIcon');
  if (refreshIcon) refreshIcon.classList.add('animate-spin');
  CONVERTER_STATE.isLoading = true;

  try {
    // API primaria: open.er-api.com (sin API key, tasas oficiales de mercado, alta velocidad)
    const res = await fetch('https://open.er-api.com/v6/latest/CAD');
    if (!res.ok) throw new Error('Error en API primaria');
    const data = await res.json();
    
    if (data && data.rates && data.rates.COP) {
      CONVERTER_STATE.rateCadToCop = parseFloat(data.rates.COP);
      CONVERTER_STATE.lastUpdated = new Date();
      localStorage.setItem('gastosapp_cad_cop_rate', JSON.stringify({
        rate: CONVERTER_STATE.rateCadToCop,
        timestamp: CONVERTER_STATE.lastUpdated.toISOString()
      }));

      updateConverterUI();
      calculateConversion();
      renderAll(); // los montos en CAD dependen de la tasa
      if (isManualRefresh) {
        showToast(`Cotización actualizada: 1 CAD = $${Math.round(CONVERTER_STATE.rateCadToCop).toLocaleString('es-CO')} COP`);
      }
      return;
    }
  } catch (err) {
    console.warn('Intentando API secundaria de respaldo...', err);
    try {
      // API secundaria (Fallback): exchangerate-api.com
      const resFallback = await fetch('https://api.exchangerate-api.com/v4/latest/CAD');
      const dataFallback = await resFallback.json();
      if (dataFallback && dataFallback.rates && dataFallback.rates.COP) {
        CONVERTER_STATE.rateCadToCop = parseFloat(dataFallback.rates.COP);
        CONVERTER_STATE.lastUpdated = new Date();
        localStorage.setItem('gastosapp_cad_cop_rate', JSON.stringify({
          rate: CONVERTER_STATE.rateCadToCop,
          timestamp: CONVERTER_STATE.lastUpdated.toISOString()
        }));

        updateConverterUI();
        calculateConversion();
        renderAll();
        if (isManualRefresh) {
          showToast(`Cotización actualizada: 1 CAD = $${Math.round(CONVERTER_STATE.rateCadToCop).toLocaleString('es-CO')} COP`);
        }
        return;
      }
    } catch (err2) {
      console.error('Error al consultar tasas de cambio:', err2);
      if (isManualRefresh) {
        showToast('No se pudo actualizar la tasa; usando última tasa guardada.');
      }
    }
  } finally {
    CONVERTER_STATE.isLoading = false;
    if (refreshIcon) {
      setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);
    }
  }
}

function updateConverterUI() {
  const isCopToCad = CONVERTER_STATE.direction === 'COP_TO_CAD';
  const modeCopBtn = document.getElementById('modeCopToCad');
  const modeCadBtn = document.getElementById('modeCadToCop');
  const inputLabel = document.getElementById('converterInputLabel');
  const outputLabel = document.getElementById('converterOutputLabel');
  const prefix = document.getElementById('converterCurrencyPrefix');
  const liveRateDisplay = document.getElementById('liveRateDisplay');
  const rateTimestamp = document.getElementById('rateTimestamp');

  // Estilos de botones de dirección
  if (modeCopBtn && modeCadBtn) {
    if (isCopToCad) {
      modeCopBtn.className = "flex-1 py-1.5 px-2 rounded-lg text-label-md font-semibold text-center transition-all bg-primary text-on-primary shadow-xs cursor-pointer flex items-center justify-center gap-1";
      modeCadBtn.className = "flex-1 py-1.5 px-2 rounded-lg text-label-md font-semibold text-center transition-all text-on-surface-variant hover:text-on-surface cursor-pointer flex items-center justify-center gap-1";
    } else {
      modeCadBtn.className = "flex-1 py-1.5 px-2 rounded-lg text-label-md font-semibold text-center transition-all bg-primary text-on-primary shadow-xs cursor-pointer flex items-center justify-center gap-1";
      modeCopBtn.className = "flex-1 py-1.5 px-2 rounded-lg text-label-md font-semibold text-center transition-all text-on-surface-variant hover:text-on-surface cursor-pointer flex items-center justify-center gap-1";
    }
  }

  if (inputLabel) inputLabel.textContent = isCopToCad ? 'Monto en COP ($)' : 'Monto en CAD ($)';
  if (outputLabel) outputLabel.textContent = isCopToCad ? 'Equivalente en CAD' : 'Equivalente en COP';
  if (prefix) prefix.textContent = isCopToCad ? 'COP $' : 'CAD $';

  const rate = CONVERTER_STATE.rateCadToCop;
  if (liveRateDisplay) {
    liveRateDisplay.textContent = `1 CAD = $${Math.round(rate).toLocaleString('es-CO')} COP`;
  }
  setText('converterHeaderRate', `1 CAD = $${Math.round(rate).toLocaleString('es-CO')} COP`);

  if (rateTimestamp) {
    if (CONVERTER_STATE.lastUpdated) {
      const timeStr = CONVERTER_STATE.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      rateTimestamp.textContent = `Tasa en vivo (${timeStr})`;
    } else {
      rateTimestamp.textContent = `Tasa en vivo al instante`;
    }
  }

}

function calculateConversion() {
  const inputEl = document.getElementById('converterInput');
  const outputEl = document.getElementById('converterOutputValue');
  if (!inputEl || !outputEl) return;

  const rawVal = parseFloat(inputEl.value) || 0;
  const rate = CONVERTER_STATE.rateCadToCop;

  if (CONVERTER_STATE.direction === 'COP_TO_CAD') {
    // COP a CAD
    const cadVal = rawVal > 0 && rate > 0 ? (rawVal / rate) : 0;
    outputEl.textContent = `$${cadVal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
  } else {
    // CAD a COP
    const copVal = rawVal > 0 ? (rawVal * rate) : 0;
    outputEl.textContent = `$${Math.round(copVal).toLocaleString('es-CO')} COP`;
  }
}

window.setConversionDirection = function(dir) {
  CONVERTER_STATE.direction = dir;
  const input = document.getElementById('converterInput');
  if (input) {
    // Valor inicial coherente al cambiar dirección
    input.value = dir === 'COP_TO_CAD' ? '100000' : '50';
  }
  updateConverterUI();
  calculateConversion();
};

window.toggleConversionDirection = function() {
  const newDir = CONVERTER_STATE.direction === 'COP_TO_CAD' ? 'CAD_TO_COP' : 'COP_TO_CAD';
  window.setConversionDirection(newDir);
};

// ========================================================
// CALCULADORA DE IMPUESTOS DE VENTA (QUEBEC)
// Federal: GST/TPS 5 %. Provincial: QST/TVQ 9,975 %. Si cambian, se actualizan aquí.
// ========================================================
const GST_RATE = 5;
const QST_RATE = 9.975;

function computeTaxes(amount) {
  const base = Math.round((Number(amount) || 0) * 100) / 100;
  // +1e-7 evita que 4,4999999 (coma flotante) se redondee hacia abajo
  const federal = Math.round(base * GST_RATE + 1e-7) / 100;
  const provincial = Math.round(base * QST_RATE + 1e-7) / 100;
  return { base, federal, provincial, total: Math.round((base + federal + provincial) * 100) / 100 };
}

function taxAmountValue() {
  return document.getElementById('taxAmount')?.value;
}

function initTaxCalculator() {
  document.getElementById('taxAmount')?.addEventListener('input', renderTaxCalculator);
  renderTaxCalculator();
}

function renderTaxCalculator() {
  const t = computeTaxes(taxAmountValue());
  setText('taxFederalValue', formatCurrency(t.federal, 'CAD'));
  setText('taxProvincialValue', formatCurrency(t.provincial, 'CAD'));
  setText('taxTotalValue', formatCurrency(t.total, 'CAD'));
  document.querySelectorAll('[data-tax-needs-amount]').forEach(b => {
    b.disabled = t.base <= 0;
    b.classList.toggle('opacity-40', t.base <= 0);
  });
}

function copyText(text, label) {
  const done = () => showToast(`Copiado: ${label || text}`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

// Respaldo para navegadores sin portapapeles asíncrono
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { showToast('No se pudo copiar', 'error'); }
  ta.remove();
}

// part: 'total' | 'federal' | 'provincial'
function copyTax(part) {
  const t = computeTaxes(taxAmountValue());
  if (t.base <= 0) return;
  copyText(t[part].toFixed(2), formatCurrency(t[part], 'CAD'));
}

window.copyConversionResult = function() {
  const outputEl = document.getElementById('converterOutputValue');
  if (outputEl) {
    const text = outputEl.textContent.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
    showToast(`Copiado: ${text}`);
  }
};




