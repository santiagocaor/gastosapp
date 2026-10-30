/**
 * GastosApp ⇄ Google Sheets (BDGastosApp) — protocolo v7 (presupuestos y recurrentes compartidos entre dispositivos)
 *
 * Pega este archivo en Extensiones → Apps Script de tu hoja y publícalo como
 * aplicación web (Ejecutar como: tú · Acceso: cualquier usuario).
 *
 * La app envía POST con cuerpo JSON en text/plain (así el navegador no hace
 * preflight CORS y puede leer la respuesta). Acciones:
 *   ping                → { ok, version }
 *   list                → { ok, version, valorCurrency, gastos, ingresos, catalog, budgets, recurring }
 *   catalog             → { ok, version, catalog }
 *   upsert (o create)   → crea la fila o la actualiza si el id ya existe
 *   update              → igual que upsert
 *   delete              → borra la fila con ese id (no falla si ya no existe)
 *   setBudgets          → reemplaza la pestaña Presupuestos ({ currency, budgets: { macro: límite } })
 *   upsertRecurring     → crea o actualiza recurrentes por id ({ items: [...] })
 *   deleteRecurring     → borra recurrentes por id ({ ids: [...] })
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
 *
 * Desde la v7, los presupuestos (pestaña Presupuestos) y los movimientos recurrentes
 * (pestaña Recurrentes) también viven en la hoja: así son los mismos en todos los
 * dispositivos. Las pestañas se crean solas la primera vez que la app los envía.
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
  },
  // Configuración compartida entre dispositivos (v7): [campo, encabezado, sinónimos]
  CONFIG_SHEETS: {
    budgets: {
      name: 'Presupuestos',
      key: 'macro',
      columns: [
        ['macro', 'Macro-categoría', ['macro categoria', 'macrocategoria', 'categoria']],
        ['limite', 'Límite', ['limite', 'limite mensual', 'presupuesto', 'monto']],
        ['moneda', 'Moneda', ['moneda']]
      ]
    },
    recurring: {
      name: 'Recurrentes',
      key: 'id',
      columns: [
        ['id', 'ID', ['id']],
        ['tipo', 'Tipo', ['tipo']],
        ['categoria', 'Macro-categoría / Tipo de ingreso', ['macro categoria tipo de ingreso', 'macro categoria', 'categoria', 'tipo de ingreso']],
        ['subcategoria', 'Subcategoría', ['subcategoria', 'sub categoria']],
        ['concepto', 'Concepto', ['concepto']],
        ['nota', 'Nota', ['nota', 'notas']],
        ['monto', 'Monto', ['monto', 'valor']],
        ['moneda', 'Moneda', ['moneda']],
        ['medioPago', 'Medio de pago', ['medio de pago', 'metodo de pago', 'forma de pago']],
        ['dia', 'Día', ['dia', 'dia del mes']],
        ['modo', 'Modo', ['modo']],
        ['activo', 'Activo', ['activo']],
        ['ultimo', 'Último mes', ['ultimo mes', 'ultimo']]
      ]
    }
  }
};

const VERSION = 7;
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
        return json_({ ok: true, version: VERSION, valorCurrency: 'CAD', gastos: list_('gasto', body), ingresos: list_('ingreso', body), catalog: catalog_(), budgets: listBudgets_(), recurring: listRecurring_() });
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
      case 'setBudgets':
        return json_(setBudgets_(body));
      case 'upsertRecurring':
        return json_(upsertRecurring_(body));
      case 'deleteRecurring':
        return json_(deleteRecurring_(body));
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
    sh.appendRow(conf.columns.map(c => c[1]).concat(EXTRA_COLUMNS.filter(([f]) => type === 'gasto' || f !== 'medioPago').map(c => c[1])));
    isNew = true;
  }
  const header = headerRow_(sh);
  const cols = {};
  // El medio de pago solo aplica a gastos
  const extras = EXTRA_COLUMNS.filter(([field]) => type === 'gasto' || field !== 'medioPago');
  conf.columns.concat(extras).forEach(([field, title, synonyms]) => {
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
  const keys = (ctx.keyCols || [cols.fecha, cols.valor, cols.id, cols.concepto]).filter(c => c > 0);
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

// Escribe varias celdas de una fila y las aplica de inmediato; si la hoja rechaza un valor
// (lista desplegable), no deja la fila nueva a medias y explica qué columna fue.
// writes: [[columna, valor, encabezado], ...]
function writeRow_(sh, row, writes, isNew) {
  try {
    writes.forEach(([c, v]) => sh.getRange(row, c).setValue(v));
    SpreadsheetApp.flush(); // las listas desplegables validan al escribir
  } catch (err) {
    if (isNew) writes.forEach(([c]) => sh.getRange(row, c).clearContent());
    // El mensaje de Google nombra la celda ("cell C2" / "celda C2"): se traduce a su columna
    const m = String(err && err.message || err).match(/\b([A-Z]{1,3})\d+\b/);
    const col = m ? m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) : -1;
    const bad = writes.find(([c]) => c === col);
    throw new Error(bad
      ? `La hoja rechazó «${bad[1]}» en la columna ${bad[2]}: no está en su lista desplegable.`
      : 'La hoja rechazó el registro (¿un valor que no está en una lista desplegable?): ' + (err && err.message || err));
  }
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

  writeRow_(sh, row, writes, isNew);
  return { ok: true, action: 'upsert', id: id, row: row, valorCAD: inCad ? rec.valor : undefined };
}

function remove_(body) {
  const ctx = sheet_(body.type);
  const row = findRow_(ctx, body.id);
  if (row > 0) ctx.sh.deleteRow(row);
  return { ok: true, action: 'delete', id: String(body.id), deleted: row > 0 };
}

// ---------- Presupuestos y recurrentes (v7) ----------

// Pestaña de configuración con sus columnas ubicadas por encabezado. Con create=false
// devuelve null si la pestaña no existe (leer no crea pestañas en la hoja).
function configSheet_(kind, create) {
  const conf = CONFIG.CONFIG_SHEETS[kind];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(conf.name);
  if (!sh) {
    if (!create) return null;
    sh = ss.insertSheet(conf.name);
  }
  if (sh.getLastRow() === 0) {
    if (!create) return null;
    sh.getRange(1, 1, 1, conf.columns.length).setValues([conf.columns.map(c => c[1])]);
    safe_(() => sh.getRange(1, 1, 1, conf.columns.length).setFontWeight('bold'));
    safe_(() => sh.setFrozenRows(1));
  }
  const header = headerRow_(sh);
  const cols = {};
  conf.columns.forEach(([field, title, synonyms]) => {
    let c = findColumn_(header, synonyms);
    if (c < 0) {
      if (!create) { cols[field] = -1; return; }
      c = header.length + 1;
      sh.getRange(1, c).setValue(title);
      header.push(title);
    }
    cols[field] = c;
  });
  return { sh, conf, cols, width: header.length, keyCols: [cols[conf.key], cols.concepto].filter(c => c > 0) };
}

function configRows_(ctx) {
  return readRows_(ctx).map((row, i) => ({ row: i + 2, get: f => (ctx.cols[f] > 0 ? row[ctx.cols[f] - 1] : '') }));
}

// [{ macro, limite, moneda }]; [] si la pestaña no existe o está vacía
function listBudgets_() {
  const ctx = configSheet_('budgets', false);
  if (!ctx || ctx.cols.macro < 0) return [];
  return configRows_(ctx)
    .map(r => ({ macro: String(r.get('macro') || '').trim(), limite: toNumber_(r.get('limite')), moneda: normCurrency_(r.get('moneda')) }))
    .filter(b => b.macro);
}

// Reemplaza los presupuestos: actualiza la fila de cada macro, agrega las nuevas y borra las que ya no están
function setBudgets_(body) {
  const budgets = body.budgets && typeof body.budgets === 'object' ? body.budgets : null;
  if (!budgets) return { ok: false, error: 'Faltan los presupuestos' };
  const moneda = normCurrency_(body.currency);
  const ctx = configSheet_('budgets', true);
  const { sh, cols } = ctx;
  const key = v => String(v || '').trim().toLowerCase();
  const wanted = Object.keys(budgets).filter(m => String(m).trim());
  const seen = {};
  const remove = [];
  configRows_(ctx).forEach(r => {
    const m = key(r.get('macro'));
    if (!m) return;
    const name = wanted.find(w => key(w) === m);
    if (!name || seen[m]) { remove.push(r.row); return; } // ya no existe o está repetida
    seen[m] = true;
    writeRow_(sh, r.row, [[cols.limite, toNumber_(budgets[name]), 'Límite'], [cols.moneda, moneda, 'Moneda']], false);
  });
  remove.sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
  wanted.filter(w => !seen[key(w)]).forEach(name => {
    const row = lastDataRow_(ctx) + 1;
    writeRow_(sh, row, [[cols.macro, String(name).trim(), 'Macro-categoría'], [cols.limite, toNumber_(budgets[name]), 'Límite'], [cols.moneda, moneda, 'Moneda']], true);
  });
  return { ok: true, action: 'setBudgets', count: wanted.length };
}

// Id de recurrente sin "_" (los movimientos generados usan rec_<plantilla>_<AAAA-MM>)
function newRecurringId_() {
  return 'rc' + Utilities.getUuid().replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
}

function clampDay_(v) {
  return Math.min(Math.max(Math.round(toNumber_(v)) || 1, 1), 31);
}

function listRecurring_() {
  const ctx = configSheet_('recurring', false);
  if (!ctx || ctx.cols.id < 0) return [];
  const tz = Session.getScriptTimeZone();
  const out = [];
  configRows_(ctx).forEach(r => {
    const concepto = String(r.get('concepto') || '').trim();
    let id = String(r.get('id') || '').trim();
    if (!id && !concepto) return; // fila vacía
    if (!id || id.indexOf('_') >= 0) {
      // Fila escrita a mano en la hoja (o id con "_", que la app no admite): se le asigna uno
      id = newRecurringId_();
      ctx.sh.getRange(r.row, ctx.cols.id).setValue(id);
    }
    const medio = String(r.get('medioPago') || '').trim();
    const rec = {
      id: id,
      type: normHeader_(r.get('tipo')) === 'ingreso' ? 'ingreso' : 'gasto',
      categoria: String(r.get('categoria') || '').trim(),
      subcategoria: String(r.get('subcategoria') || '').trim(),
      concepto: concepto,
      nota: String(r.get('nota') || ''),
      monto: toNumber_(r.get('monto')),
      moneda: normCurrency_(r.get('moneda')),
      dia: clampDay_(r.get('dia')),
      modo: /auto/.test(normHeader_(r.get('modo'))) ? 'auto' : 'proponer',
      activo: toBool_(r.get('activo'), true),
      ultimo: formatMonth_(r.get('ultimo'), tz)
    };
    if (medio) rec.medioPago = medio;
    out.push(rec);
  });
  return out;
}

// items: [{ id, type, categoria, subcategoria, concepto, nota, monto, moneda, medioPago, dia, modo, activo, ultimo }]
function upsertRecurring_(body) {
  const items = Array.isArray(body.items) ? body.items : body.recurring ? [body.recurring] : [];
  const ctx = configSheet_('recurring', true);
  const { sh, cols } = ctx;
  const ids = [];
  items.forEach(it => {
    const id = String(it.id || newRecurringId_());
    let row = findRow_(ctx, id);
    const isNew = row < 0;
    if (isNew) row = lastDataRow_(ctx) + 1;
    const gasto = it.type !== 'ingreso';
    writeRow_(sh, row, [
      [cols.id, id, 'ID'],
      [cols.tipo, gasto ? 'Gasto' : 'Ingreso', 'Tipo'],
      [cols.categoria, String(it.categoria || ''), 'Macro-categoría / Tipo de ingreso'],
      [cols.subcategoria, gasto ? String(it.subcategoria || '') : '', 'Subcategoría'],
      [cols.concepto, String(it.concepto || ''), 'Concepto'],
      [cols.nota, String(it.nota || ''), 'Nota'],
      [cols.monto, toNumber_(it.monto), 'Monto'],
      [cols.moneda, normCurrency_(it.moneda), 'Moneda'],
      [cols.medioPago, gasto ? String(it.medioPago || '') : '', 'Medio de pago'],
      [cols.dia, clampDay_(it.dia), 'Día'],
      [cols.modo, it.modo === 'auto' ? 'Automático' : 'Proponer', 'Modo'],
      [cols.activo, it.activo !== false, 'Activo'],
      // Con "'" Sheets lo guarda como texto (si no, convierte "2026-10" en una fecha)
      [cols.ultimo, it.ultimo ? "'" + String(it.ultimo) : '', 'Último mes']
    ], isNew);
    ids.push(id);
  });
  return { ok: true, action: 'upsertRecurring', ids: ids };
}

function deleteRecurring_(body) {
  const ids = (Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []).map(String);
  const ctx = configSheet_('recurring', false);
  if (!ctx || ctx.cols.id < 0) return { ok: true, action: 'deleteRecurring', ids: ids, deleted: 0 };
  // De abajo hacia arriba para que los números de fila no cambien
  const rows = configRows_(ctx).filter(r => ids.indexOf(String(r.get('id'))) >= 0).map(r => r.row).sort((a, b) => b - a);
  rows.forEach(r => ctx.sh.deleteRow(r));
  return { ok: true, action: 'deleteRecurring', ids: ids, deleted: rows.length };
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

// ---------- Preparar la hoja (se ejecuta una vez desde el menú GastosApp) ----------

// Menú en la hoja: GastosApp → Preparar hoja
function onOpen() {
  SpreadsheetApp.getUi().createMenu('GastosApp')
    .addItem('Preparar hoja para la app', 'prepararHoja')
    .addToUi();
}

/**
 * Deja la hoja lista para sincronizar con la app, sin borrar ni mover datos:
 *  - Crea las pestañas que falten (registros y catálogos) con sus encabezados.
 *  - Agrega las columnas que falten al final (Medio de pago, ID, Moneda...).
 *  - Fija la fila de encabezados y da formato de fecha y número.
 *  - Pone listas desplegables (en modo "advertencia") donde no hay ninguna:
 *    categorías desde BDGastos/BDIngresos y medio de pago.
 *  - Crea las pestañas Presupuestos y Recurrentes (v7), que la app llena al sincronizar.
 *  - Crea la pestaña Resumen (gastos por mes y macro-categoría, ingresos por mes).
 * Se puede ejecutar varias veces: lo que ya está bien no se toca.
 */
function prepararHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const notas = [];

  // Catálogos
  const catSheet = ensureSheet_(ss, CONFIG.CATALOG.gasto.name, ['Macro-categoría', 'Subcategoría', 'Concepto de Gasto'], notas);
  const ingCatSheet = ensureSheet_(ss, CONFIG.CATALOG.ingreso.name, ['Tipo de ingreso', 'Concepto de Ingreso'], notas);
  safe_(() => catSheet.setFrozenRows(1));
  safe_(() => ingCatSheet.setFrozenRows(1));
  const catHeader = headerRow_(catSheet);
  const ingHeader = headerRow_(ingCatSheet);
  const catCol = k => findColumn_(catHeader, CONFIG.CATALOG.gasto[k]);
  const ingCol = k => findColumn_(ingHeader, CONFIG.CATALOG.ingreso[k]);

  // Registros (sheet_ crea la pestaña y agrega las columnas que falten)
  ['gasto', 'ingreso'].forEach(type => {
    const existed = !!ss.getSheetByName(CONFIG.SHEETS[type].name);
    const before = existed ? headerRow_(ss.getSheetByName(CONFIG.SHEETS[type].name)).length : 0;
    const ctx = sheet_(type);
    const { sh, cols } = ctx;
    if (!existed) notas.push('Creada la pestaña ' + CONFIG.SHEETS[type].name);
    else if (ctx.width > before) notas.push(`${CONFIG.SHEETS[type].name}: agregadas ${ctx.width - before} columna(s) al final`);
    safe_(() => sh.setFrozenRows(1));

    const rows = Math.max(sh.getMaxRows() - 1, 1);
    const colRange = c => sh.getRange(2, c, rows, 1);
    // En una Tabla, las columnas con tipo (fecha, moneda...) ya traen su formato y no se cambian
    [[cols.fecha, 'yyyy-mm-dd'], [cols.valor, '#,##0.00'], [cols.montoOriginal, '#,##0.##'], [cols.tasa, '#,##0.00']]
      .forEach(([c, f]) => setFormat_(colRange(c), f));

    const lists = type === 'gasto'
      ? [
          ['Macro-categoría', cols.macroCategoria, catSheet, catCol('macro')],
          ['Subcategoría', cols.subcategoria, catSheet, catCol('sub')],
          ['Concepto de Gasto', cols.concepto, catSheet, catCol('concepto')]
        ]
      : [
          ['Tipo de ingreso', cols.tipoIngreso, ingCatSheet, ingCol('tipo')],
          ['Concepto de Ingreso', cols.concepto, ingCatSheet, ingCol('concepto')]
        ];
    lists.forEach(([title, c, src, srcCol]) => {
      if (srcCol < 0) return;
      const source = src.getRange(2, srcCol, Math.max(src.getMaxRows() - 1, 1), 1);
      applyDropdown_(colRange(c), title, CONFIG.SHEETS[type].name,
        SpreadsheetApp.newDataValidation().requireValueInRange(source, true), notas);
    });
    if (type === 'gasto') {
      applyDropdown_(colRange(cols.medioPago), 'Medio de pago', CONFIG.SHEETS[type].name,
        SpreadsheetApp.newDataValidation().requireValueInList(['Débito', 'Efectivo', 'Tarjeta de crédito'], true), notas);
    }
  });

  // Presupuestos y recurrentes compartidos entre dispositivos (v7)
  ['budgets', 'recurring'].forEach(kind => {
    const name = CONFIG.CONFIG_SHEETS[kind].name;
    const existed = !!ss.getSheetByName(name);
    const before = existed ? headerRow_(ss.getSheetByName(name)).length : 0;
    const ctx = configSheet_(kind, true);
    if (!existed) notas.push(`Creada la pestaña ${name} (la app la llena al sincronizar)`);
    else if (before > 1 && ctx.width > before) notas.push(`${name}: agregadas ${ctx.width - before} columna(s) al final`);
  });

  createSummary_(ss, notas);

  const msg = notas.length ? notas.join('\n') : 'La hoja ya estaba lista: no hubo cambios.';
  try {
    SpreadsheetApp.getUi().alert('GastosApp', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(msg); // ejecutado desde el editor de Apps Script
  }
  return msg;
}

function ensureSheet_(ss, name, headers, notas) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    notas.push('Creada la pestaña ' + name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

// Lista desplegable en modo advertencia (no rechaza): solo si la columna no tiene una propia
function applyDropdown_(range, title, sheetName, builder, notas) {
  const current = range.getCell(1, 1).getDataValidation();
  if (current) {
    if (!current.getAllowInvalid()) {
      notas.push(`${sheetName} · ${title}: tu lista desplegable rechaza valores; se recomienda "Mostrar advertencia" (no se cambió).`);
    }
    return;
  }
  let error = null;
  const ok = safe_(() => {
    try {
      range.setDataValidation(builder.setAllowInvalid(true).build());
    } catch (e) {
      error = e;
      throw e;
    }
  });
  notas.push(ok
    ? `${sheetName} · ${title}: agregada lista desplegable`
    : `${sheetName} · ${title}: no se pudo agregar la lista${error ? ` (${error.message || error})` : ' (es una columna con tipo de la Tabla)'}`);
}

// Ejecuta un cambio de la hoja y lo aplica de inmediato. Google acumula los cambios y los
// aplica al final del script, así que sin flush() el error (p. ej. cambiar el formato de una
// columna con tipo en una Tabla) saltaría fuera del try y detendría todo.
function safe_(fn) {
  try {
    fn();
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return false;
  }
}

// Formato de número sin fallar: Google no permite cambiarlo en las columnas con tipo de una Tabla
function setFormat_(range, format) {
  return safe_(() => range.setNumberFormat(format));
}

function columnLetter_(c) {
  let s = '';
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

// Pestaña Resumen con fórmulas QUERY (se crea solo si no existe)
function createSummary_(ss, notas) {
  if (ss.getSheetByName('Resumen')) return;
  const g = sheet_('gasto');
  const i = sheet_('ingreso');
  const L = (ctx, f) => columnLetter_(ctx.cols[f]);
  const range = (ctx, name) => `'${name}'!A:${columnLetter_(ctx.width)}`;
  const sh = ss.insertSheet('Resumen');
  sh.getRange(1, 1).setValue('Gastos por mes y macro-categoría (CAD)');
  sh.getRange(2, 1).setFormula(
    `=IFERROR(QUERY(${range(g, CONFIG.SHEETS.gasto.name)}, "select year(${L(g, 'fecha')}), month(${L(g, 'fecha')})+1, sum(${L(g, 'valor')}) ` +
    `where ${L(g, 'fecha')} is not null group by year(${L(g, 'fecha')}), month(${L(g, 'fecha')})+1 pivot ${L(g, 'macroCategoria')} ` +
    `label year(${L(g, 'fecha')}) 'Año', month(${L(g, 'fecha')})+1 'Mes'", 1), "Sin datos todavía")`);
  sh.getRange(1, 12).setValue('Ingresos por mes (CAD)');
  sh.getRange(2, 12).setFormula(
    `=IFERROR(QUERY(${range(i, CONFIG.SHEETS.ingreso.name)}, "select year(${L(i, 'fecha')}), month(${L(i, 'fecha')})+1, sum(${L(i, 'valor')}) ` +
    `where ${L(i, 'fecha')} is not null group by year(${L(i, 'fecha')}), month(${L(i, 'fecha')})+1 ` +
    `label year(${L(i, 'fecha')}) 'Año', month(${L(i, 'fecha')})+1 'Mes', sum(${L(i, 'valor')}) 'Ingresos'", 1), "Sin datos todavía")`);
  sh.getRange(1, 1, 1, 12).setFontWeight('bold');
  sh.setFrozenRows(2);
  notas.push('Creada la pestaña Resumen (la app no la modifica)');
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

// Mes "AAAA-MM". Sheets convierte "2026-10" en fecha al escribirlo, así que se aceptan ambos
function formatMonth_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM');
  const s = String(v || '').trim().replace(/^'/, '');
  const ym = s.match(/^(\d{4})-(\d{1,2})/);
  if (ym) return ym[1] + '-' + ('0' + ym[2]).slice(-2);
  const my = s.match(/^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})/);
  if (my) return my[2] + '-' + ('0' + my[1]).slice(-2);
  return '';
}

function normCurrency_(v) {
  return String(v || '').trim().toUpperCase() === 'COP' ? 'COP' : 'CAD';
}

function toBool_(v, dflt) {
  if (v === true || v === false) return v;
  const s = normHeader_(v);
  if (!s) return dflt;
  return !/^(no|n|false|falso|0|inactivo|pausa|en pausa)$/.test(s);
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
