/**
 * GastosApp ⇄ Google Sheets (BDGastosApp) — protocolo v3
 *
 * Pega este archivo en Extensiones → Apps Script de tu hoja y publícalo como
 * aplicación web (Ejecutar como: tú · Acceso: cualquier usuario).
 *
 * La app envía POST con cuerpo JSON en text/plain (así el navegador no hace
 * preflight CORS y puede leer la respuesta). Acciones:
 *   ping                → { ok, version }
 *   list                → { ok, version, gastos: [...], ingresos: [...] }
 *   upsert (o create)   → crea la fila o la actualiza si el id ya existe
 *   update              → igual que upsert
 *   delete              → borra la fila con ese id (no falla si ya no existe)
 *
 * Las columnas existentes no cambian: si la hoja no tiene las columnas "ID",
 * "Moneda", "Monto original" y "Tasa CAD→COP", se agregan al final (se buscan
 * por su encabezado, así que puedes moverlas) y se rellenan los ids de las
 * filas antiguas. "Valor" sigue siempre en COP.
 */

const CONFIG = {
  // Opcional: si pones un texto aquí, la app debe enviar el mismo en Ajustes → Clave.
  TOKEN: '',
  SHEETS: {
    gasto: {
      name: 'Registro de Gastos',
      headers: ['Fecha', 'Valor', 'Macro-categoría', 'Subcategoría', 'Concepto', 'Nota'],
      fields: ['fecha', 'valor', 'macroCategoria', 'subcategoria', 'concepto', 'nota']
    },
    ingreso: {
      name: 'Registro de Ingresos',
      headers: ['Fecha', 'Valor', 'Tipo de ingreso', 'Concepto', 'Nota'],
      fields: ['fecha', 'valor', 'tipoIngreso', 'concepto', 'nota']
    }
  }
};

const VERSION = 3;
const ID_HEADER = 'ID';
// Columnas opcionales que se ubican por su encabezado: [campo, encabezado]
const EXTRA_COLUMNS = [
  ['moneda', 'Moneda'],
  ['montoOriginal', 'Monto original'],
  ['tasa', 'Tasa CAD→COP']
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
    const action = body.action || 'create'; // las versiones antiguas de la app no enviaban action
    switch (action) {
      case 'ping':
        return json_({ ok: true, version: VERSION });
      case 'list':
        return json_({ ok: true, version: VERSION, gastos: list_('gasto'), ingresos: list_('ingreso') });
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

// ---------- Hojas ----------

function sheet_(type) {
  const conf = CONFIG.SHEETS[type];
  if (!conf) throw new Error('Tipo desconocido: ' + type);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(conf.name);
  if (!sh) {
    sh = ss.insertSheet(conf.name);
    sh.appendRow(conf.headers.concat(ID_HEADER));
  }
  if (sh.getLastRow() === 0) sh.appendRow(conf.headers.concat(ID_HEADER));
  const idCol = columnFor_(sh, conf, ID_HEADER);
  const extraCols = {};
  EXTRA_COLUMNS.forEach(([field, header]) => { extraCols[field] = columnFor_(sh, conf, header); });
  return { sh, conf, idCol, extraCols };
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

// ---------- Acciones ----------

function list_(type) {
  const { sh, conf, idCol, extraCols } = sheet_(type);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const width = Math.max(conf.fields.length, idCol, ...Object.values(extraCols));
  const values = sh.getRange(2, 1, last - 1, width).getValues();
  const tz = Session.getScriptTimeZone();
  const out = [];

  values.forEach((row, i) => {
    if (row[0] === '' && row[1] === '') return; // fila vacía
    let id = row[idCol - 1];
    if (!id) {
      // Filas antiguas sin id: se les asigna uno para poder editarlas o borrarlas
      id = 'gs_' + Utilities.getUuid();
      sh.getRange(i + 2, idCol).setValue(id);
    }
    const rec = { id: String(id), type };
    conf.fields.forEach((f, c) => { rec[f] = row[c]; });
    rec.fecha = formatDate_(rec.fecha, tz);
    rec.valor = toNumber_(rec.valor);
    rec.concepto = String(rec.concepto || '');
    rec.nota = String(rec.nota || '');
    const moneda = String(row[extraCols.moneda - 1] || '').trim().toUpperCase();
    if (moneda === 'CAD' || moneda === 'COP') rec.moneda = moneda;
    if (moneda === 'CAD') {
      rec.montoOriginal = toNumber_(row[extraCols.montoOriginal - 1]);
      rec.tasa = toNumber_(row[extraCols.tasa - 1]);
    }
    out.push(rec);
  });
  return out;
}

function upsert_(body) {
  const type = body.type;
  const { sh, conf, idCol, extraCols } = sheet_(type);
  const id = String(body.id || ('gs_' + Utilities.getUuid()));
  const rec = fromPayload_(type, body);
  const values = conf.fields.map(f => rec[f]);

  let row = findRow_(sh, idCol, id);
  if (row > 0) {
    sh.getRange(row, 1, 1, values.length).setValues([values]);
  } else {
    row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, values.length).setValues([values]);
    sh.getRange(row, idCol).setValue(id);
  }
  // Moneda original: solo si la app la envía (las versiones antiguas no lo hacen)
  if (body.currency) {
    const isCad = body.currency === 'CAD';
    sh.getRange(row, extraCols.moneda).setValue(isCad ? 'CAD' : 'COP');
    sh.getRange(row, extraCols.montoOriginal).setValue(isCad ? toNumber_(body.originalAmount) : '');
    sh.getRange(row, extraCols.tasa).setValue(isCad ? toNumber_(body.rate) : '');
  }
  sh.getRange(row, 1).setNumberFormat('yyyy-mm-dd');
  return { ok: true, action: 'upsert', id: id, row: row };
}

function remove_(body) {
  const { sh, idCol } = sheet_(body.type);
  const row = findRow_(sh, idCol, body.id);
  if (row > 0) sh.deleteRow(row);
  return { ok: true, action: 'delete', id: String(body.id), deleted: row > 0 };
}

// ---------- Utilidades ----------

// Acepta los nombres de campo de la app (date, amount, macroCategory, ...)
function fromPayload_(type, b) {
  const common = {
    fecha: parseDate_(b.date || b.fecha),
    valor: toNumber_(b.amount !== undefined ? b.amount : b.valor),
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
