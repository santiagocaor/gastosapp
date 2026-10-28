// GastosApp - Core Application Logic & State Store

const DEFAULT_STATE = {
  currencyIndex: 0,
  currencies: [
    { code: 'USD ($)', sym: '$' },
    { code: 'EUR (€)', sym: '€' },
    { code: 'MXN ($)', sym: '$' }
  ],
  balanceHidden: false,
  activeTab: 'inicio',
  activePeriod: 'mes',
  categories: {
    alimentacion: {
      id: 'alimentacion',
      name: 'Alimentación',
      icon: 'restaurant',
      color: '#006c49',
      budget: 600,
      subcategories: ['Supermercado', 'Restaurantes', 'Cafetería / Snacks', 'Delivery', 'Bebidas']
    },
    transporte: {
      id: 'transporte',
      name: 'Transporte',
      icon: 'directions_subway',
      color: '#2b6954',
      budget: 300,
      subcategories: ['Combustible', 'Metro / Autobús', 'Taxi / Uber', 'Mantenimiento']
    },
    vivienda: {
      id: 'vivienda',
      name: 'Vivienda',
      icon: 'home',
      color: '#004f35',
      budget: 800,
      subcategories: ['Alquiler', 'Servicios (Luz/Agua)', 'Internet', 'Mantenimiento']
    },
    ocio: {
      id: 'ocio',
      name: 'Ocio',
      icon: 'sports_esports',
      color: '#4edea3',
      budget: 250,
      subcategories: ['Streaming', 'Cine', 'Juegos', 'Salidas']
    },
    salud: {
      id: 'salud',
      name: 'Salud',
      icon: 'medical_services',
      color: '#ba1a1a',
      budget: 150,
      subcategories: ['Medicamentos', 'Consultas', 'Gimnasio']
    },
    educacion: {
      id: 'educacion',
      name: 'Educación',
      icon: 'school',
      color: '#003623',
      budget: 100,
      subcategories: ['Cursos', 'Libros', 'Materiales']
    }
  },
  transactions: [
    {
      id: 'tx_1',
      type: 'gasto',
      title: 'Supermercado El Trébol',
      amount: 64.50,
      categoryId: 'alimentacion',
      subcategory: 'Supermercado',
      date: new Date().toISOString(),
      displayDate: 'Hoy, 14:30',
      paymentMethod: 'Tarjeta Visa Débito',
      icon: 'shopping_cart'
    },
    {
      id: 'tx_2',
      type: 'gasto',
      title: 'Gasolinera Repsol',
      amount: 45.00,
      categoryId: 'transporte',
      subcategory: 'Combustible',
      date: new Date(Date.now() - 86400000).toISOString(),
      displayDate: 'Ayer',
      paymentMethod: 'Tarjeta Visa Débito',
      icon: 'local_gas_station'
    },
    {
      id: 'tx_3',
      type: 'gasto',
      title: 'Suscripción Netflix',
      amount: 15.99,
      categoryId: 'ocio',
      subcategory: 'Streaming',
      date: new Date(Date.now() - 86400000 * 2).toISOString(),
      displayDate: '28 Oct',
      paymentMethod: 'Tarjeta Crédito',
      icon: 'smart_display'
    },
    {
      id: 'tx_4',
      type: 'ingreso',
      title: 'Nómina Empresa Tech',
      amount: 1900.00,
      categoryId: 'educacion',
      subcategory: 'Salario',
      date: new Date(Date.now() - 86400000 * 3).toISOString(),
      displayDate: '27 Oct',
      paymentMethod: 'Transferencia',
      icon: 'work'
    },
    {
      id: 'tx_5',
      type: 'gasto',
      title: 'Farmacia San José',
      amount: 22.80,
      categoryId: 'salud',
      subcategory: 'Medicamentos',
      date: new Date(Date.now() - 86400000 * 4).toISOString(),
      displayDate: '26 Oct',
      paymentMethod: 'Efectivo',
      icon: 'medical_services'
    }
  ]
};

class AppState {
  constructor() {
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem('gastosapp_data');
      if (saved) {
        this.data = JSON.parse(saved);
        // ensure default structure
        this.data.categories = { ...DEFAULT_STATE.categories, ...(this.data.categories || {}) };
        if (!this.data.transactions || this.data.transactions.length === 0) {
          this.data.transactions = [...DEFAULT_STATE.transactions];
        }
      } else {
        this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
        this.save();
      }
    } catch (e) {
      console.error('Error loading state from localStorage:', e);
      this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  save() {
    try {
      localStorage.setItem('gastosapp_data', JSON.stringify(this.data));
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }

  get currency() {
    return this.data.currencies[this.data.currencyIndex || 0];
  }

  cycleCurrency() {
    this.data.currencyIndex = (this.data.currencyIndex + 1) % this.data.currencies.length;
    this.save();
    return this.currency;
  }

  formatMoney(amount) {
    const sym = this.currency.sym;
    return `${sym}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  getTotalBalance() {
    let income = 1900.00; // baseline starting funds + records
    let expense = 0;
    this.data.transactions.forEach(tx => {
      if (tx.type === 'ingreso') income += Number(tx.amount);
      else if (tx.type === 'gasto') expense += Number(tx.amount);
    });
    return income - expense;
  }

  getMonthlyTotals() {
    let income = 3800.00; // base monthly income
    let expense = 0;
    this.data.transactions.forEach(tx => {
      if (tx.type === 'gasto') {
        expense += Number(tx.amount);
      } else if (tx.type === 'ingreso') {
        income += Number(tx.amount);
      }
    });
    return { income, expense };
  }

  getCategoryTotals() {
    const totals = {};
    Object.keys(this.data.categories).forEach(catId => {
      totals[catId] = 0;
    });
    this.data.transactions.forEach(tx => {
      if (tx.type === 'gasto' && totals[tx.categoryId] !== undefined) {
        totals[tx.categoryId] += Number(tx.amount);
      }
    });
    return totals;
  }

  getGlobalBudget() {
    return Object.values(this.data.categories).reduce((acc, c) => acc + (c.budget || 0), 0);
  }

  addTransaction(tx) {
    tx.id = 'tx_' + Date.now();
    tx.date = new Date().toISOString();
    tx.displayDate = 'Hoy, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.data.transactions.unshift(tx);
    this.save();
  }

  deleteTransaction(id) {
    this.data.transactions = this.data.transactions.filter(t => t.id !== id);
    this.save();
  }

  updateCategoryBudget(catId, newBudget) {
    if (this.data.categories[catId]) {
      this.data.categories[catId].budget = Number(newBudget);
      this.save();
    }
  }

  addCategory(name, icon, budget) {
    const id = name.toLowerCase().replace(/\s+/g, '_');
    this.data.categories[id] = {
      id,
      name,
      icon: icon || 'category',
      color: '#006c49',
      budget: Number(budget) || 200,
      subcategories: ['General']
    };
    this.save();
  }
}

const state = new AppState();

// UI Render & Controller
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initRegistrationForm();
  initPrivacyToggle();
  initCurrencyToggle();
  initCategorySearch();
  initNotificationsModal();
  renderAll();
});

// View Navigation
function initNavigation() {
  const navLinks = document.querySelectorAll('nav a[data-path]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const path = link.getAttribute('data-path');
      switchView(path);
    });
  });

  // Action buttons from dashboard
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-goto');
      switchView(target);
    });
  });
}

function switchView(viewName) {
  state.data.activeTab = viewName;
  state.save();


  // Hide all view panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  // Update nav bar active state
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

  // Update header title
  const headerTitle = document.getElementById('headerTitle');
  const headerBackBtn = document.getElementById('headerBackBtn');
  if (headerTitle) {
    const titles = {
      inicio: 'Inicio',
      estadisticas: 'Estadísticas',
      registrar: 'Registrar',
      categorias: 'Categorías',
      presupuestos: 'Presupuestos'
    };
    headerTitle.textContent = titles[viewName] || 'GastosApp';
  }

  if (headerBackBtn) {
    if (viewName === 'registrar') {
      headerBackBtn.classList.remove('hidden');
    } else {
      headerBackBtn.classList.add('hidden');
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}
window.switchView = switchView;


function initPrivacyToggle() {
  const toggleBtn = document.getElementById('balanceToggleBtn');
  const balanceTxt = document.getElementById('balanceAmount');
  const eyeIcon = document.getElementById('eyeIcon');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      state.data.balanceHidden = !state.data.balanceHidden;
      state.save();
      updateBalanceDisplay();
    });
  }
}

function updateBalanceDisplay() {
  const balanceTxt = document.getElementById('balanceAmount');
  const eyeIcon = document.getElementById('eyeIcon');
  if (!balanceTxt) return;

  const total = state.getTotalBalance();
  if (state.data.balanceHidden) {
    balanceTxt.textContent = '••••••••';
    if (eyeIcon) eyeIcon.textContent = 'visibility_off';
  } else {
    balanceTxt.textContent = state.formatMoney(total);
    if (eyeIcon) eyeIcon.textContent = 'visibility';
  }
}

function initCurrencyToggle() {
  const currencyBtn = document.getElementById('currencyBtn');
  if (currencyBtn) {
    currencyBtn.addEventListener('click', () => {
      const cur = state.cycleCurrency();
      document.querySelectorAll('.activeCurrencyText').forEach(el => el.textContent = cur.code);
      document.querySelectorAll('.currencySymbolText').forEach(el => el.textContent = cur.sym);
      renderAll();
      showToast(`Moneda cambiada a ${cur.code}`);
    });
  }
}

// Render Master
function renderAll() {
  updateBalanceDisplay();
  renderDashboard();
  renderTransactions();
  renderCategories();
  renderStatistics();
}

function renderDashboard() {
  const { income, expense } = state.getMonthlyTotals();
  const globalBudget = state.getGlobalBudget();
  const budgetPercent = globalBudget > 0 ? Math.min(Math.round((expense / globalBudget) * 100), 100) : 0;
  const remaining = Math.max(0, globalBudget - expense);

  // Income & Expense cards
  const incomeEl = document.getElementById('dashIncome');
  const expenseEl = document.getElementById('dashExpense');
  if (incomeEl) incomeEl.textContent = `+${state.formatMoney(income)}`;
  if (expenseEl) expenseEl.textContent = `-${state.formatMoney(expense)}`;

  // Budget progress
  const budgetProgressText = document.getElementById('budgetProgressText');
  const budgetRatioText = document.getElementById('budgetRatioText');
  const budgetBar = document.getElementById('budgetBar');
  const budgetRemainingText = document.getElementById('budgetRemainingText');

  if (budgetProgressText) budgetProgressText.textContent = `Presupuesto Global (${budgetPercent}% gastado)`;
  if (budgetRatioText) budgetRatioText.textContent = `${state.formatMoney(expense)} / ${state.formatMoney(globalBudget)}`;
  if (budgetBar) budgetBar.style.width = `${budgetPercent}%`;
  if (budgetRemainingText) budgetRemainingText.textContent = `Quedan ${state.formatMoney(remaining)} para el mes`;

  // Render Horizontal Category Chips on Dashboard
  const chipsContainer = document.getElementById('dashCategoryChips');
  if (chipsContainer) {
    const catTotals = state.getCategoryTotals();
    const totalSpent = Object.values(catTotals).reduce((a, b) => a + b, 0) || 1;

    chipsContainer.innerHTML = Object.values(state.data.categories).map(cat => {
      const spent = catTotals[cat.id] || 0;
      const pct = Math.round((spent / totalSpent) * 100);
      return `
        <div class="flex items-center gap-2.5 p-2.5 pr-3.5 bg-surface-container-lowest rounded-xl shadow-sm shrink-0 min-w-[150px] cursor-pointer hover:bg-surface-container-low transition-all active:scale-95" onclick="switchView('categorias')">
          <div class="w-9 h-9 rounded-lg bg-secondary-container/50 flex items-center justify-center text-secondary shrink-0">
            <span class="material-symbols-outlined text-[20px]">${cat.icon}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-body-sm font-semibold text-on-surface truncate">${cat.name}</span>
            <div class="flex items-center gap-1.5">
              <span class="text-label-md text-secondary font-bold">${pct}%</span>
              <span class="text-body-sm text-on-surface-variant truncate">${state.formatMoney(spent)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderTransactions() {
  const container = document.getElementById('recentTransactionsList');
  if (!container) return;

  if (state.data.transactions.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl shadow-sm">
        <span class="material-symbols-outlined text-4xl text-outline-variant mb-2">receipt_long</span>
        <p class="text-body-md font-medium">No hay movimientos registrados aún.</p>
        <button class="mt-3 px-4 py-1.5 bg-secondary text-on-secondary rounded-lg text-label-md font-semibold" onclick="switchView('registrar')">
          Registrar primer gasto
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.data.transactions.slice(0, 10).map(tx => {
    const isExpense = tx.type === 'gasto';
    const sign = isExpense ? '-' : '+';
    const amountColor = isExpense ? 'text-on-surface' : 'text-secondary font-semibold';
    const cat = state.data.categories[tx.categoryId] || { name: 'Varios', icon: 'payments' };

    return `
      <div class="p-3 bg-surface-container-lowest rounded-xl shadow-sm flex items-center justify-between transition-colors active:bg-surface-container-low group">
        <div class="flex items-center gap-3 min-w-0">
          <div class="relative w-10 h-10 rounded-full ${isExpense ? 'bg-secondary-container/40 text-secondary' : 'bg-secondary text-on-secondary'} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[20px]">${tx.icon || cat.icon || 'receipt'}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-body-md font-semibold text-on-surface truncate">${tx.title || cat.name}</span>
            <span class="text-body-sm text-on-surface-variant truncate">${cat.name} › ${tx.subcategory || 'General'} • ${tx.displayDate}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 pl-2">
          <div class="text-right">
            <span class="text-data-metric ${amountColor}">${sign}${state.formatMoney(tx.amount)}</span>
          </div>
          <button aria-label="Eliminar transacción" class="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-error transition-opacity" onclick="deleteTx('${tx.id}')">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteTx = function(id) {
  if (confirm('¿Eliminar este movimiento?')) {
    state.deleteTransaction(id);
    renderAll();
    showToast('Movimiento eliminado');
  }
};

// Categories & Budgets Page
function renderCategories(filter = 'all', query = '') {
  const container = document.getElementById('categoryFeed');
  if (!container) return;

  const catTotals = state.getCategoryTotals();
  const search = (query || '').toLowerCase().trim();

  let categories = Object.values(state.data.categories);

  // Apply filters
  if (filter === 'active') {
    categories = categories.filter(c => (c.budget || 0) > 0);
  } else if (filter === 'unlimited') {
    categories = categories.filter(c => !c.budget || c.budget === 0);
  }

  // Apply search
  if (search) {
    categories = categories.filter(c => 
      c.name.toLowerCase().includes(search) || 
      c.subcategories.some(s => s.toLowerCase().includes(search))
    );
  }

  if (categories.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl">
        <p class="text-body-md">No se encontraron categorías.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = categories.map(cat => {
    const spent = catTotals[cat.id] || 0;
    const limit = cat.budget || 0;
    const percent = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
    const isWarning = percent >= 85;
    const remaining = Math.max(0, limit - spent);

    return `
      <div class="category-card bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-all duration-300">
        <div class="p-space-md">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="flex items-center gap-space-sm min-w-0">
              <div class="w-12 h-12 rounded-xl bg-secondary-container/30 flex items-center justify-center shrink-0 text-secondary">
                <span class="material-symbols-outlined text-[26px]">${cat.icon}</span>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="text-headline-sm font-headline-sm text-on-surface truncate">${cat.name}</h2>
                  ${limit > 0 ? `
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-label-md font-semibold ${isWarning ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'}">
                      ${percent}%
                    </span>
                  ` : ''}
                </div>
                <p class="text-body-sm text-on-surface-variant">${cat.subcategories.length} subcategorías activas</p>
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
              <span class="text-body-sm font-medium">¡Casi al tope! Te quedan ${state.formatMoney(remaining)}</span>
            </div>
          ` : ''}

          <!-- Progress Bar -->
          <div class="mt-space-sm space-y-1">
            <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
              <div class="h-full ${isWarning ? 'bg-error' : 'bg-secondary'} rounded-full transition-all duration-500" style="width: ${percent}%;"></div>
            </div>
          </div>

          <!-- Accordion toggle -->
          <button class="accordion-toggle w-full mt-3 pt-2 flex items-center justify-between text-body-sm text-secondary font-semibold hover:underline" onclick="toggleAccordion('${cat.id}')">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[18px]">account_tree</span>
              Detalle por subcategoría
            </span>
            <span class="material-symbols-outlined text-[20px] transition-transform duration-200" id="icon-acc-${cat.id}">expand_more</span>
          </button>
        </div>

        <!-- Subcategories Drawer -->
        <div class="accordion-content hidden bg-surface-container-low px-space-md pb-space-md pt-space-xs space-y-2" id="acc-${cat.id}">
          ${cat.subcategories.map(sub => `
            <div class="flex items-center justify-between p-2.5 bg-surface-container-lowest rounded-lg shadow-xs">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-outline text-[18px]">subdirectory_arrow_right</span>
                <span class="text-body-sm text-on-surface font-medium">${sub}</span>
              </div>
              <span class="text-label-md text-on-surface-variant font-medium">Activa</span>
            </div>
          `).join('')}
          <div class="pt-1 flex gap-2">
            <button class="px-3 py-1.5 bg-surface-container-lowest text-secondary rounded-lg text-label-md font-semibold flex items-center gap-1 shadow-xs hover:bg-surface-container transition-colors" onclick="promptAddSubcat('${cat.id}')">
              <span class="material-symbols-outlined text-[16px]">add</span> Añadir Subcategoría
            </button>
            <button class="px-3 py-1.5 bg-surface-container-lowest text-on-surface-variant rounded-lg text-label-md font-medium hover:text-on-surface transition-colors" onclick="promptEditBudget('${cat.id}', ${cat.budget})">
              Editar Límite
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleAccordion = function(catId) {
  const el = document.getElementById(`acc-${catId}`);
  const icon = document.getElementById(`icon-acc-${catId}`);
  if (!el) return;

  const isHidden = el.classList.contains('hidden');
  if (isHidden) {
    el.classList.remove('hidden');
    if (icon) icon.classList.add('rotate-180');
  } else {
    el.classList.add('hidden');
    if (icon) icon.classList.remove('rotate-180');
  }
};

window.promptAddSubcat = function(catId) {
  const name = prompt('Nombre de la nueva subcategoría:');
  if (name && name.trim()) {
    state.data.categories[catId].subcategories.push(name.trim());
    state.save();
    renderCategories();
    showToast(`Subcategoría "${name.trim()}" agregada`);
  }
};

window.promptEditBudget = function(catId, current) {
  const val = prompt(`Nuevo presupuesto mensual para ${state.data.categories[catId].name}:`, current);
  if (val !== null && !isNaN(val)) {
    state.updateCategoryBudget(catId, parseFloat(val));
    renderAll();
    showToast('Presupuesto actualizado');
  }
};

function initCategorySearch() {
  const searchInput = document.getElementById('categorySearch');
  const clearBtn = document.getElementById('clearSearch');
  const filterPills = document.querySelectorAll('#filterPills button[data-filter]');

  let currentFilter = 'all';

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value;
      if (clearBtn) {
        if (q.length > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
      }
      renderCategories(currentFilter, q);
    });
  }

  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.add('hidden');
      renderCategories(currentFilter, '');
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => {
        p.classList.remove('bg-primary', 'text-on-primary', 'shadow-sm');
        p.classList.add('bg-surface-container-lowest', 'text-on-surface-variant');
      });
      pill.classList.remove('bg-surface-container-lowest', 'text-on-surface-variant');
      pill.classList.add('bg-primary', 'text-on-primary', 'shadow-sm');

      currentFilter = pill.getAttribute('data-filter');
      renderCategories(currentFilter, searchInput ? searchInput.value : '');
    });
  });

  const btnNewCategory = document.getElementById('btnNewCategory');
  if (btnNewCategory) {
    btnNewCategory.addEventListener('click', () => {
      const name = prompt('Nombre de la nueva categoría:');
      if (name && name.trim()) {
        const budget = prompt('Límite de presupuesto mensual (opcional):', '200');
        state.addCategory(name.trim(), 'category', budget);
        renderAll();
        showToast(`Categoría "${name.trim()}" creada con éxito`);
      }
    });
  }
}

// Statistics Page & Dynamic SVG Donut Chart
function renderStatistics() {
  const { expense } = state.getMonthlyTotals();
  const catTotals = state.getCategoryTotals();
  const totalSpent = Object.values(catTotals).reduce((a, b) => a + b, 0) || 1;

  // Stat hero
  const statTotalEl = document.getElementById('statTotalExpense');
  if (statTotalEl) statTotalEl.textContent = state.formatMoney(expense);

  // Daily pace
  const daysInMonth = 30;
  const currentDay = Math.max(1, new Date().getDate());
  const dailyPace = expense / currentDay;
  const dailyPaceEl = document.getElementById('statDailyPace');
  if (dailyPaceEl) dailyPaceEl.textContent = `${state.formatMoney(dailyPace)} / día`;

  // Dynamic SVG Donut segments calculation
  // Radius = 62, Circumference = 2 * PI * 62 = 389.55
  const circumference = 389.55;
  const donutSvg = document.getElementById('donutSvgContainer');
  const donutLegend = document.getElementById('donutLegendContainer');

  const categories = Object.values(state.data.categories).filter(c => (catTotals[c.id] || 0) > 0);
  
  if (donutSvg) {
    let accumulatedOffset = 0;
    const colors = ['#006c49', '#004f35', '#2b6954', '#4edea3', '#ba1a1a', '#95d3ba'];

    let circlesHtml = `
      <circle cx="80" cy="80" fill="none" r="62" stroke="#eff4ff" stroke-width="20"></circle>
    `;

    categories.forEach((cat, idx) => {
      const amount = catTotals[cat.id] || 0;
      const fraction = amount / totalSpent;
      const strokeLen = fraction * circumference;
      const color = colors[idx % colors.length];

      circlesHtml += `
        <circle class="transition-all duration-500 hover:opacity-80 cursor-pointer" 
          cx="80" cy="80" fill="none" r="62" 
          stroke="${color}" 
          stroke-dasharray="${strokeLen.toFixed(1)} ${(circumference - strokeLen).toFixed(1)}" 
          stroke-dashoffset="-${accumulatedOffset.toFixed(1)}" 
          stroke-width="20">
        </circle>
      `;
      accumulatedOffset += strokeLen;
    });

    donutSvg.innerHTML = circlesHtml;
  }

  // Legend
  if (donutLegend) {
    const colors = ['#006c49', '#004f35', '#2b6954', '#4edea3', '#ba1a1a', '#95d3ba'];
    donutLegend.innerHTML = categories.map((cat, idx) => {
      const amount = catTotals[cat.id] || 0;
      const pct = Math.round((amount / totalSpent) * 100);
      const color = colors[idx % colors.length];

      return `
        <div class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low transition-colors">
          <div class="flex items-center gap-space-sm">
            <div class="w-3.5 h-3.5 rounded-full" style="background-color: ${color}"></div>
            <span class="font-body-md text-on-surface font-medium">${cat.name}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-label-md text-on-surface-variant">${pct}%</span>
            <span class="text-data-sm text-on-surface font-semibold">${state.formatMoney(amount)}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Registration Form Logic
function initRegistrationForm() {
  let selectedType = 'gasto';
  let selectedCategory = 'alimentacion';
  let selectedSubcat = 'Supermercado';
  let selectedPaymentMethod = 'Tarjeta Visa Débito';
  let isRecurring = false;

  // Segment buttons
  const typeBtns = document.querySelectorAll('#typeSegment button');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => {
        b.classList.remove('bg-primary', 'text-on-primary', 'shadow-sm');
        b.classList.add('text-on-surface-variant');
      });
      btn.classList.add('bg-primary', 'text-on-primary', 'shadow-sm');
      btn.classList.remove('text-on-surface-variant');
      selectedType = btn.getAttribute('data-type');

      const saveBtnText = document.getElementById('saveExpenseText');
      if (saveBtnText) {
        saveBtnText.textContent = selectedType === 'gasto' ? 'Guardar Gasto' : (selectedType === 'ingreso' ? 'Guardar Ingreso' : 'Guardar Transferencia');
      }
    });
  });

  // Amount input interactive
  const amountInput = document.getElementById('expenseAmountInput');
  const amountDisplay = document.getElementById('amountDisplay');
  if (amountInput && amountDisplay) {
    amountInput.addEventListener('input', (e) => {
      const val = e.target.value;
      amountDisplay.textContent = val ? parseFloat(val).toFixed(2) : '0.00';
    });
  }

  // Category cards selector
  const catGrid = document.getElementById('regCategoryGrid');
  const subcatContainer = document.getElementById('regSubcategoryList');
  const subcatTitle = document.getElementById('regSubcategoryTitle');

  function renderRegCategories() {
    if (!catGrid) return;
    catGrid.innerHTML = Object.values(state.data.categories).map(cat => {
      const isSelected = cat.id === selectedCategory;
      return `
        <button class="cat-card flex flex-col items-center justify-center p-space-sm rounded-xl transition-all transform active:scale-95 shadow-sm ${isSelected ? 'bg-secondary/15 ring-2 ring-secondary' : 'bg-surface-container-lowest'}" type="button" onclick="selectRegCategory('${cat.id}')">
          <div class="w-12 h-12 rounded-full ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center mb-1 shadow-sm">
            <span class="material-symbols-outlined text-[24px]">${cat.icon}</span>
          </div>
          <span class="text-label-md text-center ${isSelected ? 'text-primary font-bold' : 'text-on-surface-variant'} truncate w-full">${cat.name}</span>
        </button>
      `;
    }).join('') + `
      <button class="flex flex-col items-center justify-center p-space-sm rounded-xl bg-surface-container-low text-secondary transition-all transform active:scale-95 shadow-sm" type="button" onclick="promptNewCategoryFromForm()">
        <div class="w-12 h-12 rounded-full bg-secondary-container/40 text-secondary flex items-center justify-center mb-1">
          <span class="material-symbols-outlined text-[24px]">add</span>
        </div>
        <span class="text-label-md text-center font-semibold text-secondary truncate w-full">Crear</span>
      </button>
    `;

    renderRegSubcategories();
  }

  function renderRegSubcategories() {
    if (!subcatContainer) return;
    const cat = state.data.categories[selectedCategory];
    if (!cat) return;

    if (subcatTitle) {
      subcatTitle.textContent = `Subcategorías de ${cat.name}`;
    }

    subcatContainer.innerHTML = cat.subcategories.map(sub => {
      const isSelected = sub === selectedSubcat;
      return `
        <button class="subcat-pill px-space-sm py-1.5 rounded-lg text-label-md flex items-center gap-1 transition-all ${isSelected ? 'bg-primary text-on-primary shadow-sm font-semibold' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'}" type="button" onclick="selectRegSubcategory('${sub}')">
          ${isSelected ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
          ${sub}
        </button>
      `;
    }).join('') + `
      <button class="px-space-sm py-1.5 rounded-lg bg-surface-container-low text-secondary text-label-md flex items-center gap-1 hover:bg-surface-container transition-colors" type="button" onclick="promptAddSubcat('${cat.id}')">
        <span class="material-symbols-outlined text-[16px]">add_circle</span> Añadir
      </button>
    `;
  }

  window.selectRegCategory = function(catId) {
    selectedCategory = catId;
    const cat = state.data.categories[catId];
    selectedSubcat = (cat && cat.subcategories.length > 0) ? cat.subcategories[0] : 'General';
    renderRegCategories();
  };

  window.selectRegSubcategory = function(sub) {
    selectedSubcat = sub;
    renderRegSubcategories();
  };

  window.promptNewCategoryFromForm = function() {
    const name = prompt('Nombre de la nueva categoría:');
    if (name && name.trim()) {
      state.addCategory(name.trim(), 'category', 200);
      selectedCategory = name.trim().toLowerCase().replace(/\s+/g, '_');
      renderRegCategories();
      renderAll();
    }
  };

  renderRegCategories();

  // Payment methods
  document.querySelectorAll('.payment-method-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.payment-method-pill').forEach(b => {
        b.classList.remove('ring-2', 'ring-secondary', 'bg-surface-container-low');
        b.classList.add('bg-surface-container');
      });
      btn.classList.add('ring-2', 'ring-secondary', 'bg-surface-container-low');
      btn.classList.remove('bg-surface-container');
      selectedPaymentMethod = btn.getAttribute('data-method');
    });
  });

  // Recurring toggle
  const toggleBtn = document.getElementById('recurringToggle');
  const toggleCircle = document.getElementById('toggleCircle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isRecurring = !isRecurring;
      toggleBtn.setAttribute('aria-checked', isRecurring);
      if (isRecurring) {
        toggleBtn.classList.remove('bg-outline-variant');
        toggleBtn.classList.add('bg-secondary');
        toggleCircle.classList.add('translate-x-6');
      } else {
        toggleBtn.classList.remove('bg-secondary');
        toggleBtn.classList.add('bg-outline-variant');
        toggleCircle.classList.remove('translate-x-6');
      }
    });
  }

  // Save Transaction
  const saveBtn = document.getElementById('saveExpenseBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const amtInput = document.getElementById('expenseAmountInput');
      const amount = parseFloat(amtInput ? amtInput.value : 0);

      if (!amount || amount <= 0) {
        alert('Por favor introduce un monto válido.');
        if (amtInput) amtInput.focus();
        return;
      }

      const noteInput = document.getElementById('expenseNote');
      const title = noteInput && noteInput.value.trim() ? noteInput.value.trim() : (state.data.categories[selectedCategory]?.name || 'Movimiento');

      state.addTransaction({
        type: selectedType,
        title,
        amount,
        categoryId: selectedCategory,
        subcategory: selectedSubcat,
        paymentMethod: selectedPaymentMethod,
        isRecurring
      });

      // Clear input
      if (amtInput) amtInput.value = '';
      if (amountDisplay) amountDisplay.textContent = '0.00';
      if (noteInput) noteInput.value = '';

      renderAll();
      showToast(`${selectedType === 'gasto' ? 'Gasto' : 'Ingreso'} de ${state.formatMoney(amount)} guardado con éxito`);
      switchView('inicio');
    });
  }
}

// Notifications modal
function initNotificationsModal() {
  const modal = document.getElementById('notificationsModal');
  const closeBtn = document.getElementById('closeNotificationsBtn');
  const openBtns = document.querySelectorAll('[data-open-notifications]');

  openBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (modal) modal.classList.add('open');
    });
  });

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }
}

// Toast Feedback System
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}
