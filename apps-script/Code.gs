/**
 * GastosApp ⇄ Google Sheets (BDGastosApp) — protocolo v6
 *
 * Pega este archivo en Extensiones → Apps Script de tu hoja y publícalo como
 * aplicación web (Ejecutar como: tú · Acceso: cualquier usuario).
 *
 * La app envía POST con cuerpo JSON en text/plain (así el navegador no hace
 * preflight CORS y puede leer la respuesta). Acciones:
 *   ping                → { ok, version }
 *   list                → { ok, version, valorCurrency, gastos, ingresos, catalog }
 *   catalog             → { ok, version, catalog }
 *   upsert (o create)   → crea la fila o la actualiza si el id ya existe
 *   update              → igual que upsert
 *   delete              → borra la fila con ese id (no falla si ya no existe)
 *
 * Funciona con rangos normales o con Tablas de Google Sheets: cada columna se
 * ubica por su encabezado (fila 1), así que puedes reordenarlas o agregar otras.
 * Las columnas que falten (ID, Moneda, Monto original, Tasa CAD→COP, Medio de
 * pago) se agregan al final. Los registros nuevos van en la primera fila vacía.
 *
 * La hoja guarda los montos en CAD:
 *   Valor (CAD)     monto en dólares canadienses (si lo editas a mano, manda este)
 *   Moneda          moneda en que se registró (CAD o COP)
 *   Monto original  monto en esa moneda
 *   Tasa CAD→COP    tasa usada para convertir
 *   Medio de pago   Débito, Efectivo o Tarjeta de crédito (solo gastos)
 * Hacia la app, `valor` sigue en COP (compatibilidad); `valorCAD` va aparte.
 *
 * El catálogo de categorías se lee de las pestañas BDGastos (Macro-categoría,
 * Subcategoría, Concepto) y BDIngresos (Tipo de ingreso, Concepto): lo que
 * cambies ahí aparece en la app.
 */

const CONFIG = {
  // Opcional: si pones un texto aquí, la app debe enviar el mismo en Ajustes → Clave.
  TOKEN: '',
  // Tasa CAD→COP de respaldo, solo si nunca se ha recibido una de la app.
  FALLBACK_RATE: 3000,
  SHEETS: {
    gasto: {
      name: 'Registro de Gastos',
      columns: [
        ['fecha', 'Fecha', ['fecha']],
        ['valor', 'Valor (CAD)', ['valor', 'valor cad', 'monto', 'monto cad']],
        ['macroCategoria', 'Macro-categoría', ['macro categoria', 'macrocategoria', 'categoria']],
        ['subcategoria', 'Subcategoría', ['subcategoria', 'sub categoria']],
        ['concepto', 'Concepto de Gasto', ['concepto de gasto', 'concepto']],
        ['nota', 'Nota', ['nota', 'notas', 'descripcion']]
      ]
    },
    ingreso: {
      name: 'Registro de Ingresos',
      columns: [
        ['fecha', 'Fecha', ['fecha']],
        ['valor', 'Valor (CAD)', ['valor', 'valor cad', 'monto', 'monto cad']],
        ['tipoIngreso', 'Tipo de ingreso', ['tipo de ingreso', 'tipo', 'categoria']],
        ['concepto', 'Concepto de Ingreso', ['concepto de ingreso', 'concepto']],
        ['nota', 'Nota', ['nota', 'notas', 'descripcion']]
      ]
    }
  },
  CATALOG: {
    gasto: { name: 'BDGastos', macro: ['macro categoria', 'macrocategoria', 'categoria'], sub: ['subcategoria', 'sub categoria'], concepto: ['concepto de gasto', 'concepto'] },
    ingreso: { name: 'BDIngresos', tipo: ['tipo de ingreso', 'tipo', 'categoria'], concepto: ['concepto de ingreso', 'concepto'] }
  }
};

const VERSION = 6;
// Columnas comunes que se ubican por su encabezado: [campo, encabezado, sinónimos]
const EXTRA_COLUMNS = [
  ['id', 'ID', ['id']],
  ['moneda', 'Moneda', ['moneda']],
  ['montoOriginal', 'Monto original', ['monto original']],
  ['tasa', 'Tasa CAD→COP', ['tasa cad cop', 'tasa']],
  ['medioPago', 'Medio de pago', ['medio de pago', 'metodo de pago', 'forma de pago']]
];

function doGet(e) {
  // Compatibilidad: sin clave configurada, GET devuelve el listado
  if (CONFIG.TOKEN) return json_({ ok: false, error: 'Usa POST con la clave' });
  return handle_({ action: 'list' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'JSON inválido' });
  }
  if (CONFIG.TOKEN && body.token !== CONFIG.TOKEN) {
    return json_({ ok: false, error: 'Clave incorrecta' });
  }
  return handle_(body);
}

function handle_(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    rememberRate_(body.fx);
    const action = body.action || 'create'; // las versiones antiguas de la app no enviaban action
    switch (action) {
      case 'ping':
        return json_({ ok: true, version: VERSION });
      case 'list':
        return json_({ ok: true, version: VERSION, valorCurrency: 'CAD', gastos: list_('gasto', body), ingresos: list_('ingreso', body), catalog: catalog_() });
      case 'catalog':
        return json_({ ok: true, version: VERSION, catalog: catalog_() });
      case 'addCatalog':
        return json_(addCatalog_(body));
      case 'create':
      case 'update':
      case 'upsert':
        return json_(upsert_(body));
      case 'delete':
        return json_(remove_(body));
      default:
        return json_({ ok: false, error: 'Acción desconocida: ' + action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Tasa ----------

function props_() {
  return PropertiesService.getScriptProperties();
}

// Guarda la última tasa CAD→COP enviada por la app
function rememberRate_(fx) {
  const n = toNumber_(fx);
  if (n > 0) props_().setProperty('LAST_RATE', String(n));
}

// Tasa real conocida (de la app); 0 si nunca se ha recibido ninguna
function knownRate_(body) {
  return toNumber_(body && body.fx) || toNumber_(body && body.rate) || toNumber_(props_().getProperty('LAST_RATE'));
}

function currentRate_(body) {
  return knownRate_(body) || CONFIG.FALLBACK_RATE;
}

// ---------- Encabezados ----------

// "Macro-categoría" → "macro categoria"; "Valor (CAD)" → "valor"; "Tasa CAD→COP" → "tasa cad cop"
function normHeader_(h) {
  return String(h || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function headerRow_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, lastCol).getValues()[0];
}

// Columna (1-based) cuyo encabezado coincide con algún sinónimo; -1 si no hay
function findColumn_(header, synonyms) {
  const norm = header.map(normHeader_);
  for (const s of synonyms) {
    const i = norm.indexOf(s);
    if (i >= 0) return i + 1;
  }
  return -1;
}

// ---------- Hojas de registros ----------

function sheet_(type) {
  const conf = CONFIG.SHEETS[type];
  if (!conf) throw new Error('Tipo desconocido: ' + type);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(conf.name);
  let isNew = false;
  if (!sh) {
    sh = ss.insertSheet(conf.name);
    isNew = true;
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(conf.columns.map(c => c[1]).concat(EXTRA_COLUMNS.map(c => c[1])));
    isNew = true;
  }
  const header = headerRow_(sh);
  const cols = {};
  conf.columns.concat(EXTRA_COLUMNS).forEach(([field, title, synonyms]) => {
    let c = findColumn_(header, synonyms);
    if (c < 0) {
      c = header.length + 1;
      sh.getRange(1, c).setValue(title);
      header.push(title);
    }
    cols[field] = c;
  });
  const ctx = { sh, conf, cols, width: header.length };
  if (isNew) markMigrated_(ctx); // una hoja nueva nace en CAD
  return ctx;
}

// Última fila con datos: en una Tabla hay filas vacías (con listas desplegables)
// que getLastRow() también cuenta, así que se mira el contenido real.
function lastDataRow_(ctx) {
  const { sh, cols } = ctx;
  const last = sh.getLastRow();
  if (last < 2) return 1;
  const values = sh.getRange(2, 1, last - 1, ctx.width).getValues();
  const keys = [cols.fecha, cols.valor, cols.id, cols.concepto].filter(c => c > 0);
  for (let i = values.length - 1; i >= 0; i--) {
    if (keys.some(c => values[i][c - 1] !== '' && values[i][c - 1] !== null)) return i + 2;
  }
  return 1;
}

function readRows_(ctx) {
  const last = lastDataRow_(ctx);
  if (last < 2) return [];
  return ctx.sh.getRange(2, 1, last - 1, ctx.width).getValues();
}

function findRow_(ctx, id) {
  if (!id) return -1;
  const rows = readRows_(ctx);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][ctx.cols.id - 1]) === String(id)) return i + 2;
  }
  return -1;
}

// ---------- Migración COP → CAD (una sola vez por pestaña) ----------

function migratedKey_(ctx) {
  return 'CAD_MIGRATED:' + ctx.conf.name;
}

function isMigrated_(ctx) {
  return props_().getProperty(migratedKey_(ctx)) === '1';
}

function markMigrated_(ctx) {
  props_().setProperty(migratedKey_(ctx), '1');
  const c = ctx.cols.valor;
  if (normHeader_(ctx.sh.getRange(1, c).getValue()) === 'valor') ctx.sh.getRange(1, c).setValue('Valor (CAD)');
}

// Antes de la v4, "Valor" estaba en COP. Se pasa a CAD: los registros hechos en CAD
// recuperan su monto original exacto y los hechos en COP se convierten con `rate`.
function migrate_(ctx, rate) {
  const { sh, cols } = ctx;
  readRows_(ctx).forEach((row, i) => {
    if (row[cols.fecha - 1] === '' && row[cols.valor - 1] === '') return;
    const r = i + 2;
    const cop = toNumber_(row[cols.valor - 1]);
    const moneda = String(row[cols.moneda - 1] || '').trim().toUpperCase();
    const original = toNumber_(row[cols.montoOriginal - 1]);
    if (moneda === 'CAD' && original > 0) {
      const t = toNumber_(row[cols.tasa - 1]) || (cop > 0 ? cop / original : rate);
      sh.getRange(r, cols.valor).setValue(round2_(original));
      sh.getRange(r, cols.tasa).setValue(t);
    } else {
      sh.getRange(r, cols.valor).setValue(round2_(cop / rate));
      sh.getRange(r, cols.moneda).setValue('COP');
      sh.getRange(r, cols.montoOriginal).setValue(cop);
      sh.getRange(r, cols.tasa).setValue(rate);
    }
  });
  markMigrated_(ctx);
}

// Solo se migra con una tasa real recibida de la app; sin ella se sigue en el formato anterior
function ensureMigrated_(ctx, body) {
  if (isMigrated_(ctx)) return true;
  const fx = knownRate_(body);
  if (!fx) return false;
  migrate_(ctx, fx);
  return true;
}

// ---------- Acciones ----------

function list_(type, body) {
  const ctx = sheet_(type);
  const { sh, conf, cols } = ctx;
  const inCad = ensureMigrated_(ctx, body);
  const tz = Session.getScriptTimeZone();
  const rate = currentRate_(body);
  const out = [];

  readRows_(ctx).forEach((row, i) => {
    const get = f => row[cols[f] - 1];
    if (get('fecha') === '' && get('valor') === '') return; // fila vacía
    const r = i + 2;
    let id = get('id');
    if (!id) {
      // Filas sin id (antiguas o escritas a mano): se les asigna uno
      id = 'gs_' + Utilities.getUuid();
      sh.getRange(r, cols.id).setValue(id);
    }
    const rec = { id: String(id), type };
    conf.columns.forEach(([field]) => { rec[field] = get(field); });
    rec.fecha = formatDate_(rec.fecha, tz);
    rec.concepto = String(rec.concepto || '');
    rec.nota = String(rec.nota || '');
    const medio = String(get('medioPago') || '').trim();
    if (medio) rec.medioPago = medio;

    let moneda = String(get('moneda') || '').trim().toUpperCase();
    let original = toNumber_(get('montoOriginal'));
    let tasa = toNumber_(get('tasa'));
    const valor = toNumber_(get('valor'));

    if (!inCad) {
      // Formato anterior: Valor en COP
      rec.valor = valor;
      if (moneda === 'CAD' && original > 0) Object.assign(rec, { moneda, montoOriginal: original, tasa });
      out.push(rec);
      return;
    }

    if (moneda !== 'CAD' && moneda !== 'COP') {
      // Fila agregada a mano en la hoja: su Valor está en CAD
      moneda = 'CAD'; original = valor; tasa = rate;
      sh.getRange(r, cols.moneda).setValue(moneda);
      sh.getRange(r, cols.montoOriginal).setValue(original);
      sh.getRange(r, cols.tasa).setValue(tasa);
    }
    if (!(tasa > 0)) {
      tasa = rate;
      sh.getRange(r, cols.tasa).setValue(tasa);
    }
    // "Valor (CAD)" manda: si se editó a mano, se ajusta el monto original
    if (moneda === 'CAD' && Math.abs(original - valor) > 0.005) {
      original = valor;
      sh.getRange(r, cols.montoOriginal).setValue(original);
    } else if (moneda === 'COP' && Math.abs(round2_(original / tasa) - valor) > 0.01) {
      original = Math.round(valor * tasa);
      sh.getRange(r, cols.montoOriginal).setValue(original);
    }

    rec.valorCAD = valor;
    rec.moneda = moneda;
    rec.tasa = tasa;
    rec.montoOriginal = original;
    rec.valor = moneda === 'CAD' ? Math.round(original * tasa) : original; // COP
    out.push(rec);
  });
  return out;
}

function upsert_(body) {
  const type = body.type;
  const ctx = sheet_(type);
  const { sh, conf, cols } = ctx;
  const inCad = ensureMigrated_(ctx, body);
  const id = String(body.id || ('gs_' + Utilities.getUuid()));
  const rec = fromPayload_(type, body);

  // Monto: la app envía `amount` en COP y, si se registró en CAD, el monto original
  const cop = toNumber_(body.amount !== undefined ? body.amount : body.valor);
  const moneda = body.currency === 'CAD' ? 'CAD' : 'COP';
  const tasa = toNumber_(body.rate) || currentRate_(body);
  const original = moneda === 'CAD' ? (toNumber_(body.originalAmount) || round2_(cop / tasa)) : cop;
  // Sin tasa conocida todavía no se migró: se escribe en el formato anterior (Valor en COP)
  rec.valor = !inCad ? cop : moneda === 'CAD' ? round2_(original) : round2_(cop / tasa);

  let row = findRow_(ctx, id);
  const isNew = row < 0;
  if (isNew) row = lastDataRow_(ctx) + 1;

  const writes = conf.columns.map(([field, title]) => [cols[field], rec[field], title]);
  writes.push([cols.id, id, 'ID'], [cols.moneda, moneda, 'Moneda'], [cols.montoOriginal, original, 'Monto original'], [cols.tasa, tasa, 'Tasa CAD→COP']);
  // Medio de pago: solo si la app lo envía (las versiones antiguas no lo hacen)
  if (body.paymentType !== undefined) writes.push([cols.medioPago, String(body.paymentType || ''), 'Medio de pago']);

  try {
    writes.forEach(([c, v]) => sh.getRange(row, c).setValue(v));
    SpreadsheetApp.flush(); // las listas desplegables validan al escribir
  } catch (err) {
    // Si la hoja rechaza un valor (lista desplegable), no se deja la fila a medias
    if (isNew) writes.forEach(([c]) => sh.getRange(row, c).clearContent());
    // El mensaje de Google nombra la celda ("cell C2" / "celda C2"): se traduce a su columna
    const m = String(err && err.message || err).match(/\b([A-Z]{1,3})\d+\b/);
    const col = m ? m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) : -1;
    const bad = writes.find(([c]) => c === col);
    throw new Error(bad
      ? `La hoja rechazó «${bad[1]}» en la columna ${bad[2]}: no está en su lista desplegable.`
      : 'La hoja rechazó el registro (¿un valor que no está en una lista desplegable?): ' + (err && err.message || err));
  }
  sh.getRange(row, cols.fecha).setNumberFormat('yyyy-mm-dd');
  if (inCad) sh.getRange(row, cols.valor).setNumberFormat('#,##0.00');
  return { ok: true, action: 'upsert', id: id, row: row, valorCAD: inCad ? rec.valor : undefined };
}

function remove_(body) {
  const ctx = sheet_(body.type);
  const row = findRow_(ctx, body.id);
  if (row > 0) ctx.sh.deleteRow(row);
  return { ok: true, action: 'delete', id: String(body.id), deleted: row > 0 };
}

// ---------- Catálogo ----------

// { gasto: { Macro: { Subcategoría: [conceptos] } }, ingreso: { Tipo: [conceptos] } }
// Cada parte es null si su pestaña no existe o no tiene las columnas esperadas.
function catalog_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const readTable = (conf, keys) => {
    const sh = ss.getSheetByName(conf.name);
    if (!sh || sh.getLastRow() < 2) return null;
    const header = headerRow_(sh);
    const idx = keys.map(k => findColumn_(header, conf[k]));
    if (idx.some(c => c < 0)) return null;
    return sh.getRange(2, 1, sh.getLastRow() - 1, header.length).getValues()
      .map(row => idx.map(c => String(row[c - 1] || '').trim()))
      .filter(vals => vals.every(v => v));
  };

  let gasto = null;
  const g = readTable(CONFIG.CATALOG.gasto, ['macro', 'sub', 'concepto']);
  if (g && g.length) {
    gasto = {};
    g.forEach(([macro, sub, concepto]) => {
      gasto[macro] = gasto[macro] || {};
      gasto[macro][sub] = gasto[macro][sub] || [];
      if (gasto[macro][sub].indexOf(concepto) < 0) gasto[macro][sub].push(concepto);
    });
  }

  let ingreso = null;
  const i = readTable(CONFIG.CATALOG.ingreso, ['tipo', 'concepto']);
  if (i && i.length) {
    ingreso = {};
    i.forEach(([tipo, concepto]) => {
      ingreso[tipo] = ingreso[tipo] || [];
      if (ingreso[tipo].indexOf(concepto) < 0) ingreso[tipo].push(concepto);
    });
  }
  return { gasto, ingreso };
}

// Agrega un concepto nuevo a BDGastos (para que también aparezca en las listas desplegables)
function addCatalog_(body) {
  const conf = CONFIG.CATALOG.gasto;
  const macro = String(body.macro || '').trim();
  const sub = String(body.sub || '').trim();
  const concepto = String(body.concepto || '').trim();
  if (!macro || !sub || !concepto) return { ok: false, error: 'Faltan macro-categoría, subcategoría o concepto' };

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(conf.name);
  if (!sh) return { ok: false, error: 'No existe la pestaña ' + conf.name };
  const header = headerRow_(sh);
  const cols = ['macro', 'sub', 'concepto'].map(k => findColumn_(header, conf[k]));
  if (cols.some(c => c < 0)) return { ok: false, error: 'La pestaña ' + conf.name + ' no tiene las columnas esperadas' };

  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, header.length).getValues() : [];
  const key = v => String(v || '').trim().toLowerCase();
  if (rows.some(r => key(r[cols[0] - 1]) === key(macro) && key(r[cols[1] - 1]) === key(sub) && key(r[cols[2] - 1]) === key(concepto))) {
    return { ok: true, action: 'addCatalog', existed: true };
  }
  // Primera fila vacía (en una Tabla hay filas vacías al final)
  let row = rows.length + 2;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (cols.some(c => String(rows[i][c - 1] || '').trim())) { row = i + 3; break; }
    if (i === 0) row = 2;
  }
  [macro, sub, concepto].forEach((v, i) => sh.getRange(row, cols[i]).setValue(v));
  return { ok: true, action: 'addCatalog', row: row };
}

// ---------- Utilidades ----------

// Acepta los nombres de campo de la app (date, macroCategory, ...); el monto se calcula aparte
function fromPayload_(type, b) {
  const common = {
    fecha: parseDate_(b.date || b.fecha),
    valor: 0,
    concepto: b.concept || b.concepto || '',
    nota: b.note || b.nota || b.paymentMethod || ''
  };
  if (type === 'gasto') {
    common.macroCategoria = b.macroCategory || b.macroCategoria || '';
    common.subcategoria = b.subcategory || b.subcategoria || '';
  } else {
    common.tipoIngreso = b.incomeType || b.tipoIngreso || '';
  }
  return common;
}

// "2026-10-28" → fecha a medianoche en la zona horaria del script (sin saltos de día)
function parseDate_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  const s = String(v || '');
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return dmy[3] + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
  return s.slice(0, 10);
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/[^0-9.,-]+/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 3.200.000,50
  else s = s.replace(/,/g, '');                                                          // 3,200,000.50
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function round2_(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
