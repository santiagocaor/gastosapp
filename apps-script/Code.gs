/**
 * GastosApp ⇄ Google Sheets (BDGastosApp) — protocolo v5
 *
 * Pega este archivo en Extensiones → Apps Script de tu hoja y publícalo como
 * aplicación web (Ejecutar como: tú · Acceso: cualquier usuario).
 *
 * La app envía POST con cuerpo JSON en text/plain (así el navegador no hace
 * preflight CORS y puede leer la respuesta). Acciones:
 *   ping                → { ok, version }
 *   list                → { ok, version, valorCurrency, gastos: [...], ingresos: [...] }
 *   upsert (o create)   → crea la fila o la actualiza si el id ya existe
 *   update              → igual que upsert
 *   delete              → borra la fila con ese id (no falla si ya no existe)
 *
 * La hoja guarda los montos en CAD:
 *   Valor (CAD)     monto en dólares canadienses (si lo editas a mano, manda este)
 *   Moneda          moneda en que se registró (CAD o COP)
 *   Monto original  monto en esa moneda
 *   Tasa CAD→COP    tasa usada para convertir
 *   Medio de pago   Débito, Efectivo o Tarjeta de crédito (solo gastos)
 * Las columnas ID, Moneda, Monto original, Tasa y Medio de pago se agregan al final si faltan
 * (se buscan por su encabezado, así que puedes moverlas). La primera vez, las
 * filas que estaban en COP se convierten a CAD con la tasa del día que envía la
 * app; su monto en COP queda en "Monto original".
 *
 * Hacia la app, `valor` sigue en COP (compatibilidad); `valorCAD` va aparte.
 */

const CONFIG = {
  // Opcional: si pones un texto aquí, la app debe enviar el mismo en Ajustes → Clave.
  TOKEN: '',
  // Tasa CAD→COP de respaldo, solo si nunca se ha recibido una de la app.
  FALLBACK_RATE: 3000,
  SHEETS: {
    gasto: {
      name: 'Registro de Gastos',
      headers: ['Fecha', 'Valor (CAD)', 'Macro-categoría', 'Subcategoría', 'Concepto', 'Nota'],
      fields: ['fecha', 'valor', 'macroCategoria', 'subcategoria', 'concepto', 'nota']
    },
    ingreso: {
      name: 'Registro de Ingresos',
      headers: ['Fecha', 'Valor (CAD)', 'Tipo de ingreso', 'Concepto', 'Nota'],
      fields: ['fecha', 'valor', 'tipoIngreso', 'concepto', 'nota']
    }
  }
};

const VERSION = 5;
const ID_HEADER = 'ID';
// Columnas que se ubican por su encabezado: [campo, encabezado]
const EXTRA_COLUMNS = [
  ['moneda', 'Moneda'],
  ['montoOriginal', 'Monto original'],
  ['tasa', 'Tasa CAD→COP'],
  ['medioPago', 'Medio de pago']
];
const VALOR_COL = 2; // columna B: Valor (CAD)

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
        return json_({ ok: true, version: VERSION, valorCurrency: 'CAD', gastos: list_('gasto', body), ingresos: list_('ingreso', body) });
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

// ---------- Hojas ----------

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
    sh.appendRow(conf.headers.concat(ID_HEADER));
    isNew = true;
  }
  const idCol = columnFor_(sh, conf, ID_HEADER);
  const extraCols = {};
  EXTRA_COLUMNS.forEach(([field, header]) => { extraCols[field] = columnFor_(sh, conf, header); });
  const ctx = { sh, conf, idCol, extraCols };
  if (isNew) markMigrated_(ctx); // una hoja nueva nace en CAD
  return ctx;
}

// Columna (1-based) con ese encabezado; la crea al final si no existe
function columnFor_(sh, conf, name) {
  const lastCol = Math.max(sh.getLastColumn(), conf.headers.length);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = header.findIndex(h => String(h).trim().toUpperCase() === name.toUpperCase());
  if (idx >= 0) return idx + 1;
  const col = lastCol + 1;
  sh.getRange(1, col).setValue(name);
  return col;
}

function findRow_(sh, idCol, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return -1;
  const ids = sh.getRange(2, idCol, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function width_(ctx) {
  return Math.max(ctx.conf.fields.length, ctx.idCol, ...Object.values(ctx.extraCols));
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
  ctx.sh.getRange(1, VALOR_COL).setValue(ctx.conf.headers[VALOR_COL - 1]);
}

// Antes de la v4, "Valor" estaba en COP. Se pasa a CAD: los registros hechos en CAD
// recuperan su monto original exacto y los hechos en COP se convierten con `rate`.
function migrate_(ctx, rate) {
  const { sh, extraCols } = ctx;
  const last = sh.getLastRow();
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, width_(ctx)).getValues();
    values.forEach((row, i) => {
      if (row[0] === '' && row[1] === '') return;
      const r = i + 2;
      const cop = toNumber_(row[VALOR_COL - 1]);
      const moneda = String(row[extraCols.moneda - 1] || '').trim().toUpperCase();
      const original = toNumber_(row[extraCols.montoOriginal - 1]);
      if (moneda === 'CAD' && original > 0) {
        const t = toNumber_(row[extraCols.tasa - 1]) || (cop > 0 ? cop / original : rate);
        sh.getRange(r, VALOR_COL).setValue(round2_(original));
        sh.getRange(r, extraCols.tasa).setValue(t);
      } else {
        sh.getRange(r, VALOR_COL).setValue(round2_(cop / rate));
        sh.getRange(r, extraCols.moneda).setValue('COP');
        sh.getRange(r, extraCols.montoOriginal).setValue(cop);
        sh.getRange(r, extraCols.tasa).setValue(rate);
      }
    });
  }
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
  const { sh, conf, idCol, extraCols } = ctx;
  const inCad = ensureMigrated_(ctx, body);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, width_(ctx)).getValues();
  const tz = Session.getScriptTimeZone();
  const rate = currentRate_(body);
  const out = [];

  values.forEach((row, i) => {
    if (row[0] === '' && row[1] === '') return; // fila vacía
    const r = i + 2;
    let id = row[idCol - 1];
    if (!id) {
      // Filas sin id (antiguas o escritas a mano): se les asigna uno
      id = 'gs_' + Utilities.getUuid();
      sh.getRange(r, idCol).setValue(id);
    }
    const rec = { id: String(id), type };
    conf.fields.forEach((f, c) => { rec[f] = row[c]; });
    rec.fecha = formatDate_(rec.fecha, tz);
    rec.concepto = String(rec.concepto || '');
    rec.nota = String(rec.nota || '');
    const medio = String(row[extraCols.medioPago - 1] || '').trim();
    if (medio) rec.medioPago = medio;

    let moneda = String(row[extraCols.moneda - 1] || '').trim().toUpperCase();
    let original = toNumber_(row[extraCols.montoOriginal - 1]);
    let tasa = toNumber_(row[extraCols.tasa - 1]);
    const valor = toNumber_(row[VALOR_COL - 1]);

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
      sh.getRange(r, extraCols.moneda).setValue(moneda);
      sh.getRange(r, extraCols.montoOriginal).setValue(original);
      sh.getRange(r, extraCols.tasa).setValue(tasa);
    }
    if (!(tasa > 0)) {
      tasa = rate;
      sh.getRange(r, extraCols.tasa).setValue(tasa);
    }
    // "Valor (CAD)" manda: si se editó a mano, se ajusta el monto original
    if (moneda === 'CAD' && Math.abs(original - valor) > 0.005) {
      original = valor;
      sh.getRange(r, extraCols.montoOriginal).setValue(original);
    } else if (moneda === 'COP' && Math.abs(round2_(original / tasa) - valor) > 0.01) {
      original = Math.round(valor * tasa);
      sh.getRange(r, extraCols.montoOriginal).setValue(original);
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
  const { sh, conf, idCol, extraCols } = ctx;
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

  const values = conf.fields.map(f => rec[f]);
  let row = findRow_(sh, idCol, id);
  if (row < 0) {
    row = sh.getLastRow() + 1;
    sh.getRange(row, idCol).setValue(id);
  }
  sh.getRange(row, 1, 1, values.length).setValues([values]);
  sh.getRange(row, extraCols.moneda).setValue(moneda);
  sh.getRange(row, extraCols.montoOriginal).setValue(original);
  sh.getRange(row, extraCols.tasa).setValue(tasa);
  // Medio de pago: solo si la app lo envía (las versiones antiguas no lo hacen)
  if (body.paymentType !== undefined) sh.getRange(row, extraCols.medioPago).setValue(String(body.paymentType || ''));
  sh.getRange(row, 1).setNumberFormat('yyyy-mm-dd');
  if (inCad) sh.getRange(row, VALOR_COL).setNumberFormat('#,##0.00');
  return { ok: true, action: 'upsert', id: id, row: row, valorCAD: inCad ? rec.valor : undefined };
}

function remove_(body) {
  const { sh, idCol } = sheet_(body.type);
  const row = findRow_(sh, idCol, body.id);
  if (row > 0) sh.deleteRow(row);
  return { ok: true, action: 'delete', id: String(body.id), deleted: row > 0 };
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
