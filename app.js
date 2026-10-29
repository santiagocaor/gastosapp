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
      "Tarjetas de crédito": ["Pago mensual de TC"],
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

function sumValor(items) {
  return items.reduce((sum, item) => sum + Number(item.valor || 0), 0);
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
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Error saving state:', e);
      showToast('No se pudo guardar en este dispositivo', 'error');
    }
  }

  formatMoney(amount) {
    const sym = this.data.currency ? this.data.currency.sym : '$';
    const n = Math.round(Number(amount || 0));
    const sign = n < 0 ? '-' : '';
    return `${sign}${sym}${Math.abs(n).toLocaleString('es-CO')}`;
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
      if (totals[g.macroCategoria] !== undefined) totals[g.macroCategoria] += Number(g.valor || 0);
    });
    return totals;
  }

  getGlobalBudget() {
    return Object.values(this.data.presupuestos).reduce((a, b) => a + Number(b || 0), 0);
  }

  list(type) {
    return type === 'gasto' ? this.data.gastos : this.data.ingresos;
  }

  find(type, id) {
    return this.list(type).find(m => m.id === id);
  }

  payload(type, item) {
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
        paymentMethod: item.nota || "" // nombre que usaba el script antiguo
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
      paymentMethod: item.nota || ""
    };
  }

  async addMovement(type, item) {
    item.id = newId(type === 'gasto' ? 'tx_g_' : 'tx_i_');
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
        body: JSON.stringify(this.data.sheetsToken ? { ...body, token: this.data.sheetsToken } : body)
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
    } else if (data && data.ok === false && /clave/i.test(data.error || '')) {
      // Script v2 con clave: se confirma por POST
      const ping = await this.callSheets({ action: 'ping' });
      if (ping.ok) protocol = 2;
      else error = ping.error || 'Clave incorrecta';
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
          const createdAt = new Map(local.map(m => [m.id, m.createdAt]));
          const fromSheet = remote[key]
            .map((r, i) => this.remoteToLocal(type, r, i))
            .filter(m => !pendingIds.has(m.id) && !deleted.has(`${type}:${m.id}`))
            .map(m => (createdAt.get(m.id) ? { ...m, createdAt: createdAt.get(m.id) } : m));
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
    const rows = [['Tipo', 'Fecha', 'Valor', 'Categoría', 'Subcategoría', 'Concepto', 'Nota']];
    [...this.data.gastos.map(g => ({ ...g, t: 'Gasto' })), ...this.data.ingresos.map(i => ({ ...i, t: 'Ingreso' }))]
      .sort(sortMovements)
      .forEach(m => rows.push([
        m.t, m.fecha, m.valor,
        m.t === 'Gasto' ? m.macroCategoria : m.tipoIngreso,
        m.t === 'Gasto' ? m.subcategoria : '',
        m.concepto, m.nota
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
  showAllMovements: false,
  openAcc: new Set(),
  categorySearch: '',
  categoryFilter: 'all'
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
  initCurrencyConverter();
  switchView(state.data.activeTab || 'inicio', { scroll: false });
  backgroundSync();
  registerServiceWorker();
});

window.addEventListener('online', () => backgroundSync({ force: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') backgroundSync();
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
  categorias: 'Categorías',
  presupuestos: 'Presupuestos'
};

function switchView(viewName, { scroll = true } = {}) {
  if (!VIEW_TITLES[viewName]) viewName = 'inicio';
  if (viewName !== 'registrar' && form.editing) resetForm();

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
  if (titleEl) titleEl.textContent = viewName === 'registrar' && form.editing ? 'Editar registro' : VIEW_TITLES[viewName];
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
      case 'toggle-movements':
        ui.showAllMovements = !ui.showAllMovements;
        renderMovementsList();
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
        renderCategoriesView();
        break;
      case 'category-filter':
        ui.categoryFilter = d.filter;
        renderCategoriesView();
        break;
      case 'remove-concept': removeCustomConcept(d.macro, d.sub, d.concepto); break;
      case 'use-concept': useConcept(d.macro, d.sub, d.concepto); break;
      case 'reset-budgets': resetBudgets(); break;
      case 'open-modal': openModal(d.modal); break;
      case 'close-modal': closeModal(d.modal); break;
    }
  });

  // Presupuestos editables en línea
  document.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-budget]');
    if (!input) return;
    const num = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(num) || num < 0) {
      showToast('Introduce un monto válido para el presupuesto', 'error');
      input.value = state.data.presupuestos[input.dataset.budget] || 0;
      return;
    }
    state.data.presupuestos[input.dataset.budget] = Math.round(num);
    state.save();
    renderAll();
    showToast(`Presupuesto de ${input.dataset.budget} actualizado`);
  });
}

function changeViewMonth(delta) {
  const next = shiftMonth(ui.viewMonth, delta);
  if (next > currentMonthKey()) return;
  ui.viewMonth = next;
  ui.showAllMovements = false;
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
  renderCategoriesView();
  renderBudgetsView();
  renderStatisticsView();
  renderNotifications();
  renderSettingsStatus();
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

  setText('dashIncome', `+${state.formatMoney(totalIngresos)}`);
  setText('dashExpense', `-${state.formatMoney(totalGastos)}`);

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
  setText('budgetRatioText', `${state.formatMoney(b.spent)} / ${state.formatMoney(b.budget)}`);
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
        <button type="button" data-action="goto" data-view="categorias" class="flex items-center gap-2.5 p-2.5 pr-3.5 bg-surface-container-lowest rounded-xl shadow-xs shrink-0 min-w-[155px] text-left hover:bg-surface-container-low transition-all active:scale-95">
          <div class="w-9 h-9 rounded-lg bg-secondary-container/40 flex items-center justify-center text-secondary shrink-0">
            <span class="material-symbols-outlined text-[20px]">${conf.icon}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-body-sm font-semibold text-on-surface truncate">${escapeHtml(macro)}</span>
            <div class="flex items-center gap-1.5">
              <span class="text-label-md text-secondary font-bold">${percent}%</span>
              <span class="text-body-sm text-on-surface-variant truncate">${state.formatMoney(spent)}</span>
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
  const title = escapeHtml(m.concepto || (isGasto ? m.subcategoria : m.tipoIngreso));
  const subtitle = escapeHtml(isGasto ? `${m.macroCategoria} › ${m.subcategoria}` : `Ingreso › ${m.tipoIngreso}`);
  const pending = m.synced === false && state.data.googleScriptUrl
    ? `<span class="material-symbols-outlined text-[14px] text-outline align-middle" title="Pendiente de enviar a Google Sheets">cloud_off</span>`
    : '';

  return `
    <div role="button" tabindex="0" data-action="edit" data-type="${m.type}" data-id="${escapeHtml(m.id)}" class="p-3 bg-surface-container-lowest rounded-xl shadow-xs flex items-center justify-between transition-colors hover:bg-surface-container-low active:bg-surface-container-low group cursor-pointer" title="Toca para editar">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-full ${isGasto ? 'bg-secondary-container/40 text-secondary' : 'bg-secondary text-on-secondary'} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[20px]">${icon}</span>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-body-md font-semibold text-on-surface truncate">${title}</span>
          <span class="text-body-sm text-on-surface-variant truncate">${subtitle} • ${escapeHtml(formatDisplayDate(m.fecha))} ${pending}</span>
          ${m.nota ? `<span class="text-[11px] text-outline truncate italic">${escapeHtml(m.nota)}</span>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0 pl-2">
        <span class="font-data-metric text-[15px] tracking-tight ${color} whitespace-nowrap">${sign}${state.formatMoney(m.valor)}</span>
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

  const toggleBtn = document.getElementById('toggleMovementsBtn');
  const LIMIT = 8;
  if (toggleBtn) {
    toggleBtn.classList.toggle('hidden', all.length <= LIMIT);
    toggleBtn.textContent = ui.showAllMovements ? 'Ver menos' : `Ver todos (${all.length})`;
  }

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

  container.innerHTML = (ui.showAllMovements ? all : all.slice(0, LIMIT)).map(movementRow).join('');
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
// Categorías
// --------------------------------------------------------
function initCategorySearch() {
  const input = document.getElementById('categorySearch');
  const clear = document.getElementById('clearSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    ui.categorySearch = input.value;
    if (clear) clear.classList.toggle('hidden', !input.value);
    renderCategoriesView();
  });
  if (clear) {
    clear.addEventListener('click', () => {
      input.value = '';
      ui.categorySearch = '';
      clear.classList.add('hidden');
      renderCategoriesView();
      input.focus();
    });
  }
}

function renderCategoriesView() {
  const container = document.getElementById('categoryFeed');
  if (!container) return;

  const key = ui.viewMonth;
  const b = budgetSummary(key);
  setText('catHeroSpent', state.formatMoney(b.spent));
  setText('catHeroBudget', `de ${state.formatMoney(b.budget)} presupuestados`);
  setText('catHeroPct', `${Math.round(b.pctRaw)}% consumido`);
  setText('catHeroAvailable', b.rem >= 0 ? `${state.formatMoney(b.rem)} disponible` : `Excedido por ${state.formatMoney(-b.rem)}`);
  setText('catHeroDays', b.isCurrent ? `Faltan ${b.daysLeft} día${b.daysLeft === 1 ? '' : 's'}` : monthLabel(key, true));
  const heroBar = document.getElementById('catHeroBar');
  if (heroBar) heroBar.style.width = `${b.pct}%`;

  document.querySelectorAll('#filterPills [data-filter]').forEach(btn => {
    const active = btn.dataset.filter === ui.categoryFilter;
    btn.classList.toggle('bg-primary', active);
    btn.classList.toggle('text-on-primary', active);
    btn.classList.toggle('shadow-xs', active);
    btn.classList.toggle('font-semibold', active);
    btn.classList.toggle('bg-surface-container-lowest', !active);
    btn.classList.toggle('text-on-surface-variant', !active);
  });

  const categorias = getCategorias();
  const macroTotals = state.macroTotals(state.gastosEntre(...state.monthBounds(key)));
  const q = normalizeText(ui.categorySearch.trim());

  const cards = Object.keys(categorias).map(macro => {
    const conf = categorias[macro];
    const limit = Number(state.data.presupuestos[macro] || 0);
    if (ui.categoryFilter === 'active' && limit <= 0) return '';
    if (ui.categoryFilter === 'unlimited' && limit > 0) return '';

    // Filtrado por búsqueda: macro → todo; subcategoría → sus conceptos; concepto → solo coincidencias
    let subs = Object.entries(conf.subcategorias);
    if (q && !normalizeText(macro).includes(q)) {
      subs = subs
        .map(([sub, list]) => [sub, normalizeText(sub).includes(q) ? list : list.filter(c => normalizeText(c).includes(q))])
        .filter(([, list]) => list.length > 0);
      if (subs.length === 0) return '';
    }

    const spent = macroTotals[macro] || 0;
    const pctRaw = limit > 0 ? (spent / limit) * 100 : 0;
    const pct = Math.min(Math.round(pctRaw), 100);
    const isOver = limit > 0 && pctRaw > 100;
    const isWarning = limit > 0 && pctRaw >= 85;
    const rem = limit - spent;
    const isOpen = q ? true : ui.openAcc.has(macro);
    const m = escapeHtml(macro);

    return `
      <div class="category-card bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden transition-all duration-300">
        <div class="p-space-md">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="flex items-center gap-space-sm min-w-0">
              <div class="w-12 h-12 rounded-xl bg-secondary-container/30 flex items-center justify-center shrink-0 text-secondary">
                <span class="material-symbols-outlined text-[26px]">${conf.icon}</span>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="text-headline-sm font-headline-sm text-on-surface truncate">${m}</h2>
                  ${limit > 0 ? `
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-label-md font-semibold ${isWarning ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'}">
                      ${Math.round(pctRaw)}%
                    </span>
                  ` : ''}
                </div>
                <p class="text-body-sm text-on-surface-variant">${Object.keys(conf.subcategorias).length} subcategorías</p>
              </div>
            </div>
            <div class="flex flex-col items-end shrink-0">
              <span class="text-data-metric text-on-surface font-semibold">${state.formatMoney(spent)}</span>
              <span class="text-body-sm text-outline">${limit > 0 ? `Límite ${state.formatMoney(limit)}` : 'Sin límite'}</span>
            </div>
          </div>

          ${isWarning ? `
            <div class="mt-space-sm flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container-high text-on-surface">
              <span class="material-symbols-outlined text-[17px] text-error">warning</span>
              <span class="text-body-sm font-medium">${isOver ? `Excediste el límite por ${state.formatMoney(-rem)}` : `¡Casi al tope! Te quedan ${state.formatMoney(rem)}`}</span>
            </div>
          ` : ''}

          ${limit > 0 ? `
            <div class="mt-space-sm w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
              <div class="h-full ${isWarning ? 'bg-error' : 'bg-secondary'} rounded-full transition-all duration-500" style="width: ${pct}%;"></div>
            </div>
          ` : ''}

          <button type="button" class="w-full mt-3 pt-2 flex items-center justify-between text-body-sm text-secondary font-semibold hover:underline" data-action="toggle-acc" data-macro="${m}" aria-expanded="${isOpen}">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[18px]">account_tree</span>
              Ver subcategorías y conceptos
            </span>
            <span class="material-symbols-outlined text-[20px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}">expand_more</span>
          </button>
        </div>

        <div class="${isOpen ? '' : 'hidden'} bg-surface-container-low px-space-md pb-space-md pt-space-xs space-y-2.5">
          ${subs.map(([sub, list]) => `
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
                      <button type="button" data-action="use-concept" ${attrs} class="px-2 py-0.5 text-left hover:text-primary" title="Registrar un gasto con este concepto">${escapeHtml(c)}</button>
                      ${custom ? `<button type="button" data-action="remove-concept" ${attrs} class="pr-1.5 leading-none hover:text-error" aria-label="Quitar concepto"><span class="material-symbols-outlined text-[14px] align-middle">close</span></button>` : ''}
                    </span>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
          <div class="pt-1">
            <button type="button" data-action="goto" data-view="presupuestos" class="px-3 py-1.5 bg-surface-container-lowest text-secondary rounded-lg text-label-md font-semibold shadow-xs hover:bg-surface-container">
              Editar presupuesto de ${m}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = cards.trim() || `
    <div class="p-6 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl">
      <p class="text-body-md">No hay categorías que coincidan.</p>
    </div>
  `;
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

  container.innerHTML = Object.keys(BD_GASTOS).map(macro => {
    const conf = BD_GASTOS[macro];
    const limit = Number(state.data.presupuestos[macro] || 0);
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
              <span class="absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[13px]">$</span>
              <input type="number" inputmode="numeric" min="0" step="10000" data-budget="${m}" value="${limit}" class="w-32 h-9 pl-5 pr-2 rounded-lg bg-surface-container-low border border-slate-200 text-right text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary" aria-label="Presupuesto mensual de ${m}"/>
            </span>
          </label>
        </div>
      </div>
    `;
  }).join('');
}

function resetBudgets() {
  if (!confirm('¿Restablecer los presupuestos sugeridos para todas las categorías?')) return;
  state.data.presupuestos = { ...PRESUPUESTOS_DEFAULT };
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
    byConcept[k].amt += Number(g.valor || 0);
    byConcept[k].n += 1;
  });
  const top = Object.entries(byConcept).sort((a, b) => b[1].amt - a[1].amt).slice(0, 5);

  container.innerHTML = top.length === 0
    ? `<p class="text-body-sm text-on-surface-variant text-center py-2">Sin datos en este periodo.</p>`
    : top.map(([name, v], i) => `
      <div class="space-y-1">
        <div class="flex items-center justify-between gap-2 text-body-sm">
          <span class="text-on-surface font-medium truncate">${i + 1}. ${escapeHtml(name)}</span>
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
    const limit = Number(state.data.presupuestos[macro] || 0);
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

// ========================================================
// FORMULARIO DE REGISTRO
// (Gasto: Macro -> Sub -> Concepto | Ingreso: Tipo -> Concepto)
// ========================================================
function initForm() {
  document.getElementById('regConceptoSelect')?.addEventListener('change', e => { form.concepto = e.target.value; });
  document.getElementById('regConceptoIngresoSelect')?.addEventListener('change', e => { form.conceptoIngreso = e.target.value; });
  document.getElementById('saveExpenseBtn')?.addEventListener('click', saveForm);
  document.getElementById('expenseAmountInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveForm(); });
  resetForm();
}

function resetForm() {
  form.editing = null;
  const amt = document.getElementById('expenseAmountInput');
  const nota = document.getElementById('expenseNote');
  const date = document.getElementById('regDateInput');
  if (amt) amt.value = '';
  if (nota) nota.value = '';
  if (date) date.value = localISODate();
  document.getElementById('editBanner')?.classList.add('hidden');
  renderFormSelectors();
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
    select.innerHTML = conceptos.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
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
  switchView('registrar');

  document.getElementById('expenseAmountInput').value = item.valor;
  document.getElementById('expenseNote').value = item.nota || '';
  document.getElementById('regDateInput').value = isIsoDate(item.fecha) ? item.fecha : localISODate();
  document.getElementById('editBanner')?.classList.remove('hidden');
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

  const fields = form.type === 'gasto'
    ? { valor: val, fecha, macroCategoria: form.macro, subcategoria: form.sub, concepto: document.getElementById('regConceptoSelect')?.value || form.concepto, nota }
    : { valor: val, fecha, tipoIngreso: form.tipoIngreso, concepto: document.getElementById('regConceptoIngresoSelect')?.value || form.conceptoIngreso, nota };

  const label = form.type === 'gasto' ? 'Gasto' : 'Ingreso';

  if (form.editing) {
    const { type, id, synced } = form.editing;
    const item = state.updateMovement(type, id, fields);
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
    state.addMovement(type, fields).then(item => {
      if (state.data.googleScriptUrl && item.synced === false) {
        showToast(`${label} guardado; se enviará a Google Sheets al recuperar la conexión`, 'info');
      }
      renderAll();
    });
    showToast(`${label} de ${state.formatMoney(val)} registrado`);
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

  if (rateTimestamp) {
    if (CONVERTER_STATE.lastUpdated) {
      const timeStr = CONVERTER_STATE.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      rateTimestamp.textContent = `Tasa en vivo (${timeStr})`;
    } else {
      rateTimestamp.textContent = `Tasa en vivo al instante`;
    }
  }

  renderConverterPresets();
}

function renderConverterPresets() {
  const container = document.getElementById('converterPresetChips');
  if (!container) return;

  const isCopToCad = CONVERTER_STATE.direction === 'COP_TO_CAD';
  const presets = isCopToCad
    ? [
        { label: '$50k COP', val: 50000 },
        { label: '$100k COP', val: 100000 },
        { label: '$200k COP', val: 200000 },
        { label: '$500k COP', val: 500000 },
        { label: '$1M COP', val: 1000000 }
      ]
    : [
        { label: '$25 CAD', val: 25 },
        { label: '$50 CAD', val: 50 },
        { label: '$100 CAD', val: 100 },
        { label: '$250 CAD', val: 250 },
        { label: '$500 CAD', val: 500 }
      ];

  container.innerHTML = presets.map(p => `
    <button onclick="setConverterValue(${p.val})" class="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors font-medium whitespace-nowrap cursor-pointer text-[11px]" type="button">
      ${p.label}
    </button>
  `).join('');
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

window.setConverterValue = function(val) {
  const input = document.getElementById('converterInput');
  if (input) {
    input.value = val;
    calculateConversion();
  }
};

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

// Atajo en formulario de Registrar: permite ingresar en CAD y se convierte al instante a COP
window.quickConvertCadToCopPrompt = async function() {
  // Asegurar que tengamos la tasa más fresca del momento
  if (!CONVERTER_STATE.lastUpdated || (Date.now() - CONVERTER_STATE.lastUpdated.getTime() > 1000 * 60 * 30)) {
    await fetchLiveExchangeRate(false);
  }

  const cadInput = prompt(`Cotización actual: 1 CAD = $${Math.round(CONVERTER_STATE.rateCadToCop).toLocaleString('es-CO')} COP\n\nIngresa el monto en Dólares Canadienses (CAD):`, "50");
  if (cadInput !== null) {
    const val = parseFloat(cadInput.replace(/,/g, '.'));
    if (!isNaN(val) && val > 0) {
      const copTotal = Math.round(val * CONVERTER_STATE.rateCadToCop);
      const input = document.getElementById('expenseAmountInput');
      if (input) {
        input.value = copTotal;
        showToast(`$${val} CAD convertidos a $${copTotal.toLocaleString('es-CO')} COP`);
      }
    }
  }
};



