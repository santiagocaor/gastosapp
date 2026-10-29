// GastosApp - Sincronizada con Google Sheets BDGastosApp
// Spreadsheet ID: 1LCPp8qmQC0G-5-w6rTzA4aIG_PQkPs-BDLppPNJ4TbA

const SPREADSHEET_ID = "1LCPp8qmQC0G-5-w6rTzA4aIG_PQkPs-BDLppPNJ4TbA";

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

// Estado Inicial con los registros reales existentes en tu Google Sheet
const DEFAULT_STATE = {
  currency: { code: 'COP ($)', sym: '$' },
  balanceHidden: false,
  activeTab: 'inicio',
  googleScriptUrl: '', // URL del Webhook de Google Apps Script
  presupuestos: { ...PRESUPUESTOS_DEFAULT },
  
  // Registros iniciales vacíos para empezar desde cero
  gastos: [],
  ingresos: []
};

class AppState {
  constructor() {
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem('gastosapp_sheets_state');
      if (saved) {
        this.data = JSON.parse(saved);
        if (!Array.isArray(this.data.gastos)) {
          this.data.gastos = [];
        }
        if (!Array.isArray(this.data.ingresos)) {
          this.data.ingresos = [];
        }
        if (!this.data.presupuestos) {
          this.data.presupuestos = { ...PRESUPUESTOS_DEFAULT };
        }
      } else {
        this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
        this.save();
      }
    } catch (e) {
      console.error('Error loading state:', e);
      this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  save() {
    try {
      localStorage.setItem('gastosapp_sheets_state', JSON.stringify(this.data));
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }

  formatMoney(amount) {
    const sym = this.data.currency ? this.data.currency.sym : '$';
    return `${sym}${Number(amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  getTotalIngresos() {
    return this.data.ingresos.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  }

  getTotalGastos() {
    return this.data.gastos.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  }

  getBalanceTotal() {
    return this.getTotalIngresos() - this.getTotalGastos();
  }

  getGastosPorMacroCategoria() {
    const totals = {};
    Object.keys(BD_GASTOS).forEach(macro => {
      totals[macro] = 0;
    });
    this.data.gastos.forEach(g => {
      if (totals[g.macroCategoria] !== undefined) {
        totals[g.macroCategoria] += Number(g.valor || 0);
      }
    });
    return totals;
  }

  getGlobalBudget() {
    return Object.values(this.data.presupuestos).reduce((a, b) => a + Number(b || 0), 0);
  }

  async addGasto(gasto) {
    gasto.id = "tx_g_" + Date.now();
    gasto.fecha = new Date().toISOString().split('T')[0];
    gasto.displayDate = "Hoy, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.data.gastos.unshift(gasto);
    this.save();

    // Sincronizar con Google Sheets si la URL está configurada
    if (this.data.googleScriptUrl) {
      this.syncToGoogleSheets({
        type: "gasto",
        id: gasto.id,
        date: gasto.fecha,
        macroCategory: gasto.macroCategoria,
        subcategory: gasto.subcategoria,
        concept: gasto.concepto,
        amount: gasto.valor,
        paymentMethod: gasto.nota || ""
      });
    }
  }

  async addIngreso(ingreso) {
    ingreso.id = "tx_i_" + Date.now();
    ingreso.fecha = new Date().toISOString().split('T')[0];
    ingreso.displayDate = "Hoy, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.data.ingresos.unshift(ingreso);
    this.save();

    // Sincronizar con Google Sheets si la URL está configurada
    if (this.data.googleScriptUrl) {
      this.syncToGoogleSheets({
        type: "ingreso",
        id: ingreso.id,
        date: ingreso.fecha,
        incomeType: ingreso.tipoIngreso,
        concept: ingreso.concepto,
        amount: ingreso.valor,
        paymentMethod: ingreso.nota || ""
      });
    }
  }

  clearAllMovements() {
    this.data.gastos = [];
    this.data.ingresos = [];
    this.save();
  }

  async fetchFromGoogleSheets() {
    if (!this.data.googleScriptUrl) {
      alert("Por favor configura primero la URL de tu Google Apps Script.");
      return;
    }
    try {
      showToast("Descargando registros desde Google Sheets...");
      const res = await fetch(this.data.googleScriptUrl);
      const data = await res.json();
      if (data) {
        // Gastos: omitir fila 0 de encabezados
        if (Array.isArray(data.gastos)) {
          this.data.gastos = data.gastos.slice(1).filter(r => r[0] && r[1]).map((r, i) => ({
            id: "tx_g_gs_" + i,
            fecha: typeof r[0] === 'string' ? r[0].split('T')[0] : r[0],
            valor: Number(String(r[1]).replace(/[^0-9.-]+/g,"")) || 0,
            macroCategoria: r[2] || "Necesidades",
            subcategoria: r[3] || "Varios",
            concepto: r[4] || "",
            nota: r[5] || "",
            displayDate: typeof r[0] === 'string' ? r[0].split('T')[0] : r[0]
          }));
        }
        // Ingresos: omitir fila 0 de encabezados
        if (Array.isArray(data.ingresos)) {
          this.data.ingresos = data.ingresos.slice(1).filter(r => r[0] && r[1]).map((r, i) => ({
            id: "tx_i_gs_" + i,
            fecha: typeof r[0] === 'string' ? r[0].split('T')[0] : r[0],
            valor: Number(String(r[1]).replace(/[^0-9.-]+/g,"")) || 0,
            tipoIngreso: r[2] || "Laboral",
            concepto: r[3] || "",
            nota: r[4] || "",
            displayDate: typeof r[0] === 'string' ? r[0].split('T')[0] : r[0]
          }));
        }
        this.save();
        renderAll();
        showToast("¡Datos sincronizados con éxito desde Google Sheets!");
      }
    } catch (err) {
      console.error("Error al cargar de Google Sheets:", err);
      showToast("Error al leer desde Google Sheets");
    }
  }

  deleteGasto(id) {
    this.data.gastos = this.data.gastos.filter(g => g.id !== id);
    this.save();
  }

  deleteIngreso(id) {
    this.data.ingresos = this.data.ingresos.filter(i => i.id !== id);
    this.save();
  }

  async syncToGoogleSheets(payload) {
    try {
      await fetch(this.data.googleScriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      console.log("Sincronizado con Google Sheets con éxito");
    } catch (err) {
      console.error("Error al sincronizar con Google Sheets:", err);
    }
  }
}

const state = new AppState();

// Inicializador de Interfaz
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFormSelectors();
  initPrivacyToggle();
  initSheetsConfigModal();
  initCurrencyConverter();
  renderAll();
});

// Navegación
function initNavigation() {
  document.querySelectorAll('nav a[data-path]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.getAttribute('data-path'));
    });
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.getAttribute('data-goto'));
    });
  });
}

function switchView(viewName) {
  state.data.activeTab = viewName;
  state.save();

  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`view-${viewName}`);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('nav a[data-path]').forEach(link => {
    const isCurrent = link.getAttribute('data-path') === viewName;
    if (isCurrent) {
      link.classList.add('text-secondary', 'font-semibold');
      link.classList.remove('text-on-surface-variant');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('text-secondary', 'font-semibold');
      link.classList.add('text-on-surface-variant');
      link.removeAttribute('aria-current');
    }
  });

  const titleEl = document.getElementById('headerTitle');
  const backBtn = document.getElementById('headerBackBtn');
  const titles = {
    inicio: 'Inicio',
    estadisticas: 'Estadísticas',
    registrar: 'Registrar',
    categorias: 'Categorías',
    presupuestos: 'Presupuestos'
  };
  if (titleEl) titleEl.textContent = titles[viewName] || 'GastosApp';
  if (backBtn) {
    if (viewName === 'registrar') backBtn.classList.remove('hidden');
    else backBtn.classList.add('hidden');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}
window.switchView = switchView;

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

  const total = state.getBalanceTotal();
  if (state.data.balanceHidden) {
    balEl.textContent = '••••••••';
    if (eye) eye.textContent = 'visibility_off';
  } else {
    balEl.textContent = state.formatMoney(total);
    if (eye) eye.textContent = 'visibility';
  }
}

// Render Master
function renderAll() {
  updateBalance();
  renderDashboard();
  renderMovementsList();
  renderCategoriesView();
  renderStatisticsView();
}

function renderDashboard() {
  const totalIngresos = state.getTotalIngresos();
  const totalGastos = state.getTotalGastos();
  const budgetGlobal = state.getGlobalBudget();
  const pct = budgetGlobal > 0 ? Math.min(Math.round((totalGastos / budgetGlobal) * 100), 100) : 0;
  const rem = Math.max(0, budgetGlobal - totalGastos);

  const incEl = document.getElementById('dashIncome');
  const expEl = document.getElementById('dashExpense');
  if (incEl) incEl.textContent = `+${state.formatMoney(totalIngresos)}`;
  if (expEl) expEl.textContent = `-${state.formatMoney(totalGastos)}`;

  const bProg = document.getElementById('budgetProgressText');
  const bRatio = document.getElementById('budgetRatioText');
  const bBar = document.getElementById('budgetBar');
  const bRem = document.getElementById('budgetRemainingText');

  if (bProg) bProg.textContent = `Presupuesto Global (${pct}% gastado)`;
  if (bRatio) bRatio.textContent = `${state.formatMoney(totalGastos)} / ${state.formatMoney(budgetGlobal)}`;
  if (bBar) bBar.style.width = `${pct}%`;
  if (bRem) bRem.textContent = `Quedan ${state.formatMoney(rem)} este mes`;

  // Horizontal Macro-Category Chips
  const chips = document.getElementById('dashCategoryChips');
  if (chips) {
    const macroTotals = state.getGastosPorMacroCategoria();
    const totalSpent = totalGastos || 1;

    chips.innerHTML = Object.keys(BD_GASTOS).map(macro => {
      const spent = macroTotals[macro] || 0;
      const percent = Math.round((spent / totalSpent) * 100);
      const conf = BD_GASTOS[macro];

      return `
        <div class="flex items-center gap-2.5 p-2.5 pr-3.5 bg-surface-container-lowest rounded-xl shadow-xs shrink-0 min-w-[155px] cursor-pointer hover:bg-surface-container-low transition-all active:scale-95" onclick="switchView('categorias')">
          <div class="w-9 h-9 rounded-lg bg-secondary-container/40 flex items-center justify-center text-secondary shrink-0">
            <span class="material-symbols-outlined text-[20px]">${conf.icon}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-body-sm font-semibold text-on-surface truncate">${macro}</span>
            <div class="flex items-center gap-1.5">
              <span class="text-label-md text-secondary font-bold">${percent}%</span>
              <span class="text-body-sm text-on-surface-variant truncate">${state.formatMoney(spent)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderMovementsList() {
  const container = document.getElementById('recentTransactionsList');
  if (!container) return;

  // Unificar y ordenar movimientos (gastos + ingresos)
  const all = [
    ...state.data.gastos.map(g => ({ ...g, type: 'gasto' })),
    ...state.data.ingresos.map(i => ({ ...i, type: 'ingreso' }))
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  if (all.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl">
        <p class="text-body-md">No hay movimientos registrados.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = all.slice(0, 15).map(m => {
    const isGasto = m.type === 'gasto';
    const sign = isGasto ? '-' : '+';
    const color = isGasto ? 'text-on-surface font-semibold' : 'text-secondary font-bold';
    const icon = isGasto ? (BD_GASTOS[m.macroCategoria]?.icon || 'trending_down') : (BD_INGRESOS[m.tipoIngreso]?.icon || 'trending_up');
    const title = m.concepto || (isGasto ? m.subcategoria : m.tipoIngreso);
    const subtitle = isGasto ? `${m.macroCategoria} › ${m.subcategoria}` : `Ingreso › ${m.tipoIngreso}`;

    return `
      <div class="p-3 bg-surface-container-lowest rounded-xl shadow-xs flex items-center justify-between transition-colors active:bg-surface-container-low group">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-full ${isGasto ? 'bg-secondary-container/40 text-secondary' : 'bg-secondary text-on-secondary'} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[20px]">${icon}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-body-md font-semibold text-on-surface truncate">${title}</span>
            <span class="text-body-sm text-on-surface-variant truncate">${subtitle} • ${m.displayDate || m.fecha}</span>
            ${m.nota ? `<span class="text-[11px] text-outline truncate italic">${m.nota}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 pl-2">
          <span class="text-data-metric ${color}">${sign}${state.formatMoney(m.valor)}</span>
          <button aria-label="Eliminar" class="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-error transition-opacity" onclick="deleteItem('${m.type}', '${m.id}')">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteItem = function(type, id) {
  if (confirm('¿Deseas eliminar este registro?')) {
    if (type === 'gasto') state.deleteGasto(id);
    else state.deleteIngreso(id);
    renderAll();
    showToast('Registro eliminado');
  }
};

// Categorías y Presupuestos
function renderCategoriesView() {
  const container = document.getElementById('categoryFeed');
  if (!container) return;

  const macroTotals = state.getGastosPorMacroCategoria();

  container.innerHTML = Object.keys(BD_GASTOS).map(macro => {
    const conf = BD_GASTOS[macro];
    const spent = macroTotals[macro] || 0;
    const limit = state.data.presupuestos[macro] || 0;
    const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
    const isWarning = pct >= 85;
    const rem = Math.max(0, limit - spent);
    const subcats = Object.keys(conf.subcategorias);

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
                  <h2 class="text-headline-sm font-headline-sm text-on-surface truncate">${macro}</h2>
                  ${limit > 0 ? `
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-label-md font-semibold ${isWarning ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'}">
                      ${pct}%
                    </span>
                  ` : ''}
                </div>
                <p class="text-body-sm text-on-surface-variant">${subcats.length} subcategorías registradas</p>
              </div>
            </div>
            <div class="flex flex-col items-end shrink-0">
              <span class="text-data-metric text-on-surface font-semibold">${state.formatMoney(spent)}</span>
              <span class="text-body-sm text-outline">Límite ${state.formatMoney(limit)}</span>
            </div>
          </div>

          ${isWarning && limit > 0 ? `
            <div class="mt-space-sm flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container-high text-on-surface">
              <span class="material-symbols-outlined text-[17px] text-error">warning</span>
              <span class="text-body-sm font-medium">¡Casi al tope! Te quedan ${state.formatMoney(rem)}</span>
            </div>
          ` : ''}

          <div class="mt-space-sm space-y-1">
            <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
              <div class="h-full ${isWarning ? 'bg-error' : 'bg-secondary'} rounded-full transition-all duration-500" style="width: ${pct}%;"></div>
            </div>
          </div>

          <button class="w-full mt-3 pt-2 flex items-center justify-between text-body-sm text-secondary font-semibold hover:underline" onclick="toggleAcc('${macro}')">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[18px]">account_tree</span>
              Ver subcategorías y conceptos de gasto
            </span>
            <span class="material-symbols-outlined text-[20px] transition-transform duration-200" id="icon-acc-${macro}">expand_more</span>
          </button>
        </div>

        <div class="hidden bg-surface-container-low px-space-md pb-space-md pt-space-xs space-y-2.5" id="acc-${macro}">
          ${subcats.map(sub => `
            <div class="p-2.5 bg-surface-container-lowest rounded-lg shadow-xs">
              <div class="flex items-center justify-between">
                <span class="text-body-md font-semibold text-on-surface">${sub}</span>
                <span class="text-[11px] px-2 py-0.5 rounded bg-surface-container-high text-primary font-medium">${conf.subcategorias[sub].length} conceptos</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                ${conf.subcategorias[sub].map(c => `
                  <span class="text-body-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">${c}</span>
                `).join('')}
              </div>
            </div>
          `).join('')}
          <div class="pt-1">
            <button class="px-3 py-1.5 bg-surface-container-lowest text-secondary rounded-lg text-label-md font-semibold shadow-xs hover:bg-surface-container" onclick="editBudgetMacro('${macro}', ${limit})">
              Editar Presupuesto de ${macro}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleAcc = function(id) {
  const el = document.getElementById(`acc-${id}`);
  const icon = document.getElementById(`icon-acc-${id}`);
  if (el) {
    el.classList.toggle('hidden');
    if (icon) icon.classList.toggle('rotate-180');
  }
};

window.editBudgetMacro = function(macro, current) {
  const val = prompt(`Nuevo presupuesto mensual para ${macro} ($):`, current);
  if (val !== null && !isNaN(val)) {
    state.data.presupuestos[macro] = Number(val);
    state.save();
    renderAll();
    showToast(`Presupuesto de ${macro} actualizado`);
  }
};

// Estadísticas & SVG Donut
function renderStatisticsView() {
  const totalGastos = state.getTotalGastos();
  const macroTotals = state.getGastosPorMacroCategoria();
  const totalSpent = totalGastos || 1;

  const statTot = document.getElementById('statTotalExpense');
  if (statTot) statTot.textContent = state.formatMoney(totalGastos);

  const curDay = Math.max(1, new Date().getDate());
  const dailyPace = totalGastos / curDay;
  const paceEl = document.getElementById('statDailyPace');
  if (paceEl) paceEl.textContent = `${state.formatMoney(dailyPace)} / día`;

  const circumference = 389.55;
  const donutSvg = document.getElementById('donutSvgContainer');
  const donutLegend = document.getElementById('donutLegendContainer');

  const macros = Object.keys(BD_GASTOS).filter(m => (macroTotals[m] || 0) > 0);

  if (donutSvg) {
    let accOffset = 0;
    let circlesHtml = `<circle cx="80" cy="80" fill="none" r="62" stroke="#eff4ff" stroke-width="20"></circle>`;

    macros.forEach(macro => {
      const amt = macroTotals[macro] || 0;
      const frac = amt / totalSpent;
      const len = frac * circumference;
      const color = BD_GASTOS[macro]?.color || '#006c49';

      circlesHtml += `
        <circle class="transition-all duration-500 hover:opacity-80 cursor-pointer" 
          cx="80" cy="80" fill="none" r="62" 
          stroke="${color}" 
          stroke-dasharray="${len.toFixed(1)} ${(circumference - len).toFixed(1)}" 
          stroke-dashoffset="-${accOffset.toFixed(1)}" 
          stroke-width="20">
        </circle>
      `;
      accOffset += len;
    });
    donutSvg.innerHTML = circlesHtml;
  }

  if (donutLegend) {
    donutLegend.innerHTML = macros.map(macro => {
      const amt = macroTotals[macro] || 0;
      const pct = Math.round((amt / totalSpent) * 100);
      const color = BD_GASTOS[macro]?.color || '#006c49';

      return `
        <div class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low transition-colors">
          <div class="flex items-center gap-space-sm">
            <div class="w-3.5 h-3.5 rounded-full" style="background-color: ${color}"></div>
            <span class="font-body-md text-on-surface font-medium">${macro}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-label-md text-on-surface-variant">${pct}%</span>
            <span class="text-data-sm text-on-surface font-semibold">${state.formatMoney(amt)}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Formulario de Registro Dependiente (Gasto: Macro -> Sub -> Concepto | Ingreso: Tipo -> Concepto)
function initFormSelectors() {
  let activeType = 'gasto';
  let selectedMacro = 'Necesidades';
  let selectedSub = 'Vivienda';
  let selectedConcepto = 'Alquiler de vivienda';
  let selectedTipoIngreso = 'Laboral';
  let selectedConceptoIngreso = 'Nómina Santiago';

  const typeButtons = document.querySelectorAll('#typeSegment button');
  const gastoSection = document.getElementById('gastoFields');
  const ingresoSection = document.getElementById('ingresoFields');
  const saveBtnText = document.getElementById('saveExpenseText');

  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      typeButtons.forEach(b => {
        b.classList.remove('bg-primary', 'text-on-primary', 'shadow-xs');
        b.classList.add('text-on-surface-variant');
      });
      btn.classList.add('bg-primary', 'text-on-primary', 'shadow-xs');
      btn.classList.remove('text-on-surface-variant');

      activeType = btn.getAttribute('data-type');
      if (activeType === 'gasto') {
        if (gastoSection) gastoSection.classList.remove('hidden');
        if (ingresoSection) ingresoSection.classList.add('hidden');
        if (saveBtnText) saveBtnText.textContent = 'Guardar Gasto en Google Sheets';
      } else {
        if (gastoSection) gastoSection.classList.add('hidden');
        if (ingresoSection) ingresoSection.classList.remove('hidden');
        if (saveBtnText) saveBtnText.textContent = 'Guardar Ingreso en Google Sheets';
      }
    });
  });

  // Render Macro-categorías
  function renderMacroButtons() {
    const container = document.getElementById('regMacroGrid');
    if (!container) return;
    container.innerHTML = Object.keys(BD_GASTOS).map(macro => {
      const isSel = macro === selectedMacro;
      const conf = BD_GASTOS[macro];
      return `
        <button class="p-2.5 rounded-xl flex flex-col items-center justify-center transition-all ${isSel ? 'bg-secondary/15 ring-2 ring-secondary font-bold text-primary' : 'bg-surface-container text-on-surface-variant'}" type="button" onclick="selectMacro('${macro}')">
          <span class="material-symbols-outlined text-[22px] mb-1">${conf.icon}</span>
          <span class="text-label-md text-center truncate w-full">${macro}</span>
        </button>
      `;
    }).join('');
    renderSubcatButtons();
  }

  function renderSubcatButtons() {
    const container = document.getElementById('regSubcatList');
    if (!container) return;
    const subcats = Object.keys(BD_GASTOS[selectedMacro]?.subcategorias || {});
    if (!subcats.includes(selectedSub)) selectedSub = subcats[0] || '';

    container.innerHTML = subcats.map(sub => {
      const isSel = sub === selectedSub;
      return `
        <button class="px-3 py-1.5 rounded-lg text-label-md transition-all ${isSel ? 'bg-primary text-on-primary font-semibold shadow-xs' : 'bg-surface-container text-on-surface'}" type="button" onclick="selectSub('${sub}')">
          ${sub}
        </button>
      `;
    }).join('');
    renderConceptoOptions();
  }

  function renderConceptoOptions() {
    const select = document.getElementById('regConceptoSelect');
    if (!select) return;
    const conceptos = BD_GASTOS[selectedMacro]?.subcategorias[selectedSub] || [];
    selectedConcepto = conceptos[0] || '';
    select.innerHTML = conceptos.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  window.selectMacro = function(m) {
    selectedMacro = m;
    renderMacroButtons();
  };

  window.selectSub = function(s) {
    selectedSub = s;
    renderSubcatButtons();
    setTimeout(() => {
      const selectBox = document.getElementById('regConceptoSelect');
      if (selectBox) {
        selectBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  // Render Ingresos Selectors
  function renderIngresoSelectors() {
    const tipoContainer = document.getElementById('regTipoIngresoGrid');
    if (!tipoContainer) return;

    tipoContainer.innerHTML = Object.keys(BD_INGRESOS).map(tipo => {
      const isSel = tipo === selectedTipoIngreso;
      const conf = BD_INGRESOS[tipo];
      return `
        <button class="p-2.5 rounded-xl flex flex-col items-center justify-center transition-all ${isSel ? 'bg-secondary/15 ring-2 ring-secondary font-bold text-primary' : 'bg-surface-container text-on-surface-variant'}" type="button" onclick="selectTipoIngreso('${tipo}')">
          <span class="material-symbols-outlined text-[22px] mb-1">${conf.icon}</span>
          <span class="text-label-md text-center truncate w-full">${tipo}</span>
        </button>
      `;
    }).join('');

    renderConceptoIngresoOptions();
  }

  function renderConceptoIngresoOptions() {
    const select = document.getElementById('regConceptoIngresoSelect');
    if (!select) return;
    const conceptos = BD_INGRESOS[selectedTipoIngreso]?.conceptos || [];
    selectedConceptoIngreso = conceptos[0] || '';
    select.innerHTML = conceptos.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  window.selectTipoIngreso = function(t) {
    selectedTipoIngreso = t;
    renderIngresoSelectors();
  };

  renderMacroButtons();
  renderIngresoSelectors();

  // Guardar Gasto / Ingreso
  const saveBtn = document.getElementById('saveExpenseBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const amtInput = document.getElementById('expenseAmountInput');
      const val = parseFloat(amtInput ? amtInput.value : 0);

      if (!val || val <= 0) {
        alert('Por favor introduce un monto válido.');
        if (amtInput) amtInput.focus();
        return;
      }

      const notaInput = document.getElementById('expenseNote');
      const nota = notaInput ? notaInput.value.trim() : '';

      if (activeType === 'gasto') {
        const concSelect = document.getElementById('regConceptoSelect');
        const concepto = concSelect ? concSelect.value : selectedConcepto;

        state.addGasto({
          valor: val,
          macroCategoria: selectedMacro,
          subcategoria: selectedSub,
          concepto: concepto,
          nota: nota
        });
        showToast(`Gasto de ${state.formatMoney(val)} registrado en "Registro de Gastos"`);
      } else {
        const concIngresoSelect = document.getElementById('regConceptoIngresoSelect');
        const concepto = concIngresoSelect ? concIngresoSelect.value : selectedConceptoIngreso;

        state.addIngreso({
          valor: val,
          tipoIngreso: selectedTipoIngreso,
          concepto: concepto,
          nota: nota
        });
        showToast(`Ingreso de ${state.formatMoney(val)} registrado en "Registro de Ingresos"`);
      }

      if (amtInput) amtInput.value = '';
      if (notaInput) notaInput.value = '';
      renderAll();
      switchView('inicio');
    });
  }
}

// Configuración de URL de Google Apps Script
function initSheetsConfigModal() {
  const modal = document.getElementById('sheetsConfigModal');
  const openBtn = document.getElementById('openSheetsConfigBtn');
  const closeBtn = document.getElementById('closeSheetsConfigBtn');
  const saveBtn = document.getElementById('saveSheetsUrlBtn');
  const input = document.getElementById('googleScriptUrlInput');

  const reloadBtn = document.getElementById('reloadFromSheetsBtn');
  const resetBtn = document.getElementById('resetLocalDataBtn');

  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      await state.fetchFromGoogleSheets();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('¿Deseas reiniciar todos los registros a cero en la aplicación? Tu balance quedará en $0.')) {
        state.clearAllMovements();
        renderAll();
        if (modal) modal.classList.remove('open');
        showToast('Registros reiniciados a cero');
      }
    });
  }

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      if (input) input.value = state.data.googleScriptUrl || '';
      modal.classList.add('open');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (input) {
        state.data.googleScriptUrl = input.value.trim();
        state.save();
        if (modal) modal.classList.remove('open');
        showToast('URL de sincronización guardada');
      }
    });
  }
}

// Toast
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

window.openSheetsConfigModal = function() {
  const modal = document.getElementById('sheetsConfigModal');
  const input = document.getElementById('googleScriptUrlInput');
  if (input) input.value = state.data.googleScriptUrl || '';
  if (modal) modal.classList.add('open');
};

window.closeSheetsConfigModal = function() {
  const modal = document.getElementById('sheetsConfigModal');
  if (modal) modal.classList.remove('open');
};

window.confirmResetAll = function() {
  if (confirm('¿Deseas vaciar todos los gastos e ingresos registrados para empezar desde cero? Tu balance quedará en $0.')) {
    state.clearAllMovements();
    renderAll();
    const modal = document.getElementById('sheetsConfigModal');
    if (modal) modal.classList.remove('open');
    showToast('Registros vaciados: balance en $0');
  }
};

window.setTransactionType = function(type) {
  const typeButtons = document.querySelectorAll('#typeSegment button');
  typeButtons.forEach(btn => {
    if (btn.getAttribute('data-type') === type) {
      btn.click();
    }
  });
};

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



