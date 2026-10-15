/**
 * СТО Спецмаш CRM Frontend Application Logic
 * Single Page Application controller with Kanban Drag & Drop, Employees & Roles, Logo customization, Warehouse deductions, and Analytics.
 * Currency: AMD
 */

// LocalStorage Persistence & Auto-Hydration Layer for СТО Спецмаш CRM
const crmStore = {
  KEY_PREFIX: 'specmash_crm_',

  saveItem(entity, item) {
    if (!item) return;
    try {
      const list = this.getList(entity);
      const existingIdx = list.findIndex(x => (item.id && x.id == item.id) || (item.username && x.username === item.username));
      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...item };
      } else {
        list.unshift(item);
      }
      localStorage.setItem(this.KEY_PREFIX + entity, JSON.stringify(list));
    } catch (e) {}
  },

  removeItem(entity, id) {
    try {
      const list = this.getList(entity).filter(x => {
        if (x.id && id && String(x.id) === String(id)) return false;
        if (x.username && id && String(x.username).toLowerCase() === String(id).toLowerCase()) return false;
        return true;
      });
      localStorage.setItem(this.KEY_PREFIX + entity, JSON.stringify(list));
    } catch (e) {}
  },

  getList(entity) {
    try {
      const raw = localStorage.getItem(this.KEY_PREFIX + entity);
      const list = raw ? JSON.parse(raw) : [];
      if (entity === 'users') {
        return list.filter(u => {
          if (!u) return false;
          const un = String(u.username || '').trim().toLowerCase();
          return un && un !== 'undefined' && un !== 'null' && un.length >= 3;
        });
      }
      return list;
    } catch (e) {
      return [];
    }
  },

  mergeWithServer(entity, serverItems) {
    if (Array.isArray(serverItems)) {
      let items = serverItems;
      if (entity === 'deals') {
        items = items.map(d => ({
          ...d,
          parts_count: Number(d.parts_count || 0),
          amount: Number(d.amount || 0),
          cost: Number(d.cost || 0),
        })).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      } else if (['clients', 'equipment', 'parts', 'tasks', 'users'].includes(entity)) {
        items = items.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      }
      try {
        localStorage.setItem(this.KEY_PREFIX + entity, JSON.stringify(items));
      } catch (e) {}
      return items;
    }
    return this.getList(entity);
  }
};

// ================= REAL-TIME WEBSOCKETS & SUPABASE REALTIME =================

let fastApiWs = null;
let supabaseWs = null;
let realtimeHeartbeatInterval = null;
let kanbanPollingTimer = null;
let isRealtimeConnected = false;

function updateRealtimeStatus(status, text) {
  const pill = document.getElementById('realtime-status-pill');
  const txt = document.getElementById('realtime-status-text');
  const dot = pill ? pill.querySelector('span:first-child') : null;
  if (!pill) return;
  if (status === 'connected') {
    pill.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium transition-all';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    if (txt) txt.textContent = text || 'WebSockets Онлайн';
  } else if (status === 'syncing') {
    pill.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium transition-all';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-blue-500 animate-spin';
    if (txt) txt.textContent = text || 'Синхронизация...';
  } else {
    pill.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium transition-all';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400';
    if (txt) txt.textContent = text || 'Авто-синхронизация';
  }
}

function initRealtimeSync() {
  initFastApiWebSocket();
  initSupabaseRealtime();
  startKanbanBackgroundPolling();
}

function initFastApiWebSocket() {
  if (fastApiWs && (fastApiWs.readyState === WebSocket.OPEN || fastApiWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/kanban`;

  try {
    fastApiWs = new WebSocket(wsUrl);

    fastApiWs.onopen = () => {
      isRealtimeConnected = true;
      updateRealtimeStatus('connected', 'FastAPI WS Онлайн');
    };

    fastApiWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleIncomingRealtimeMessage(msg);
      } catch (e) {}
    };

    fastApiWs.onerror = () => {
      if (!supabaseWs || supabaseWs.readyState !== WebSocket.OPEN) {
        updateRealtimeStatus('syncing', 'Supabase Realtime');
      }
    };

    fastApiWs.onclose = () => {
      fastApiWs = null;
      setTimeout(() => {
        if (state.currentUser && state.currentUser.id) {
          initFastApiWebSocket();
        }
      }, 4000);
    };
  } catch (e) {
    console.warn('[FastAPI WS Init Warning]', e);
  }
}

async function initSupabaseRealtime() {
  if (supabaseWs && (supabaseWs.readyState === WebSocket.OPEN || supabaseWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  let sbHost = 'wnrnbptadgvmyibszpvk.supabase.co';
  let sbKey = '';

  try {
    const res = await fetch('/api/realtime/config');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.url) sbHost = cfg.url.replace(/^https?:\/\//, '');
      if (cfg.key) sbKey = cfg.key;
    }
  } catch (e) {}

  if (!sbKey) return;
  const sbUrl = `wss://${sbHost}/realtime/v1/websocket?apikey=${encodeURIComponent(sbKey)}&vsn=1.0.0`;

  try {
    supabaseWs = new WebSocket(sbUrl);

    supabaseWs.onopen = () => {
      updateRealtimeStatus('connected', 'Supabase Realtime Онлайн');
      // Join realtime channel for deals table postgres_changes
      const joinMsg = {
        topic: 'realtime:public:deals',
        event: 'phx_join',
        payload: {
          config: {
            broadcast: { self: true },
            postgres_changes: [{ event: '*', schema: 'public', table: 'deals' }]
          }
        },
        ref: '1'
      };
      supabaseWs.send(JSON.stringify(joinMsg));

      if (realtimeHeartbeatInterval) clearInterval(realtimeHeartbeatInterval);
      realtimeHeartbeatInterval = setInterval(() => {
        if (supabaseWs && supabaseWs.readyState === WebSocket.OPEN) {
          supabaseWs.send(JSON.stringify({
            topic: 'phoenix',
            event: 'heartbeat',
            payload: {},
            ref: 'hb'
          }));
        }
      }, 25000);
    };

    supabaseWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'postgres_changes' && msg.payload && msg.payload.data) {
          const change = msg.payload.data;
          const changeType = change.type;
          const record = change.record;
          const oldRecord = change.old_record;

          if (changeType === 'UPDATE' && record) {
            handleRemoteDealStageChange(record.id, record.stage, record);
          } else if (changeType === 'INSERT' && record) {
            handleRemoteDealCreated(record);
          } else if (changeType === 'DELETE' && oldRecord) {
            handleRemoteDealDeleted(oldRecord.id);
          }
        }
      } catch (e) {}
    };

    supabaseWs.onerror = () => {
      updateRealtimeStatus('idle', 'Авто-синхронизация');
    };

    supabaseWs.onclose = () => {
      supabaseWs = null;
      if (realtimeHeartbeatInterval) clearInterval(realtimeHeartbeatInterval);
      setTimeout(() => {
        if (state.currentUser && state.currentUser.id) {
          initSupabaseRealtime();
        }
      }, 5000);
    };
  } catch (e) {
    console.warn('[Supabase Realtime Init Warning]', e);
  }
}

function handleIncomingRealtimeMessage(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'deal_stage_updated' || msg.type === 'deal_moved' || msg.type === 'stage_changed') {
    const dealId = msg.deal_id;
    const newStage = msg.stage;
    handleRemoteDealStageChange(dealId, newStage, msg.data);
  } else if (msg.type === 'deal_created' && msg.deal) {
    handleRemoteDealCreated(msg.deal);
  } else if (msg.type === 'deal_updated' && msg.deal) {
    handleRemoteDealUpdated(msg.deal);
  } else if (msg.type === 'deal_deleted') {
    handleRemoteDealDeleted(msg.deal_id);
  } else if (msg.type === 'deal_parts_updated') {
    loadDeals();
  }
}

function handleRemoteDealStageChange(dealId, newStage, recordData) {
  if (!state.deals) return;
  const numId = Number(dealId);
  const deal = state.deals.find(d => Number(d.id) === numId);

  if (deal) {
    if (deal.stage === newStage && !recordData) return;
    deal.stage = newStage;
    if (recordData) {
      if (recordData.amount !== undefined) deal.amount = recordData.amount;
      if (recordData.cost !== undefined) deal.cost = recordData.cost;
      if (recordData.title !== undefined) deal.title = recordData.title;
      if (recordData.completed_at !== undefined) deal.completed_at = recordData.completed_at;
    }

    if (state.draggedDealId && Number(state.draggedDealId) === numId) {
      return;
    }

    renderDeals();
    highlightMovedCard(numId);
  } else {
    loadDeals();
  }
}

function handleRemoteDealCreated(dealRecord) {
  if (!state.deals) state.deals = [];
  const numId = Number(dealRecord.id);
  const exists = state.deals.some(d => Number(d.id) === numId);
  if (!exists) {
    state.deals.unshift(dealRecord);
    renderDeals();
    highlightMovedCard(numId);
  }
}

function handleRemoteDealUpdated(dealRecord) {
  if (!state.deals) return;
  const numId = Number(dealRecord.id);
  const idx = state.deals.findIndex(d => Number(d.id) === numId);
  if (idx >= 0) {
    state.deals[idx] = { ...state.deals[idx], ...dealRecord };
    renderDeals();
    highlightMovedCard(numId);
  }
}

function handleRemoteDealDeleted(dealId) {
  if (!state.deals) return;
  const numId = Number(dealId);
  state.deals = state.deals.filter(d => Number(d.id) !== numId);
  renderDeals();
}

function highlightMovedCard(dealId) {
  setTimeout(() => {
    const card = document.getElementById(`kanban-card-${dealId}`);
    if (card) {
      card.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50/50');
      setTimeout(() => {
        card.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50/50');
      }, 1800);
    }
  }, 50);
}

function startKanbanBackgroundPolling() {
  if (kanbanPollingTimer) clearInterval(kanbanPollingTimer);
  kanbanPollingTimer = setInterval(async () => {
    if (!state.currentUser || !state.currentUser.id || document.hidden) return;
    if (state.draggedDealId) return;

    if (state.currentTab === 'deals') {
      try {
        const res = await fetch('/api/deals');
        if (res.ok) {
          const freshDeals = await res.json();
          if (Array.isArray(freshDeals)) {
            const currentStr = JSON.stringify((state.deals || []).map(d => ({ id: d.id, stage: d.stage, amount: d.amount })));
            const freshStr = JSON.stringify(freshDeals.map(d => ({ id: d.id, stage: d.stage, amount: d.amount })));
            if (currentStr !== freshStr) {
              state.deals = freshDeals;
              renderDeals();
            }
          }
        }
      } catch (e) {}
    }
  }, 3500);
}

// Global State Cache
const state = {
  currentTab: 'dashboard',
  currentUser: null,
  dealsViewMode: 'kanban', // 'kanban' | 'list'
  settings: {
    company_name: 'СТО Спецмаш',
    logo_url: ''
  },
  clients: [],
  equipment: [],
  parts: [],
  deals: [],
  tasks: [],
  users: [],
  dashboard: {},
  draggedDealId: null,
};

// Kanban Stage Definitions (with Bitrix24 short labels)
const KANBAN_STAGES = [
  { id: 'new', label: 'Новые заявки', short: 'Новая', icon: 'inbox', color: 'border-blue-500' },
  { id: 'diagnostic', label: 'Диагностика', short: 'Диагн.', icon: 'search', color: 'border-purple-500' },
  { id: 'estimate', label: 'Согласование сметы', short: 'Смета', icon: 'file-text', color: 'border-indigo-500' },
  { id: 'in_progress', label: 'В работе / Ремонт', short: 'Ремонт', icon: 'wrench', color: 'border-amber-500' },
  { id: 'parts_waiting', label: 'Ожидание запчастей', short: 'Ожид. з/ч', icon: 'package-open', color: 'border-orange-500' },
  { id: 'ready', label: 'Готово к выдаче', short: 'Готово', icon: 'check-circle', color: 'border-emerald-500' },
  { id: 'completed', label: 'Оплачено / Закрыто', short: 'Оплачено', icon: 'badge-dollar-sign', color: 'border-green-600' },
];

// Role names & badges
const ROLE_DEFINITIONS = {
  admin: { label: 'Администратор', badge: 'bg-purple-100 text-purple-800 border-purple-200', icon: '👑' },
  moderator: { label: 'Модератор', badge: 'bg-blue-100 text-blue-800 border-blue-200', icon: '🛡️' },
  mechanic: { label: 'Механик', badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: '🔧' },
};

// Currency Formatter: AMD
function formatMoney(amount) {
  if (amount === undefined || amount === null) return '0 AMD';
  return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' AMD';
}

// Date Formatter
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ================= INITIALIZATION & AUTH =================

function initAuth() {
  const saved = localStorage.getItem('specmash_user');
  if (saved) {
    try {
      state.currentUser = JSON.parse(saved);
    } catch (e) {
      state.currentUser = null;
    }
  } else {
    state.currentUser = null;
  }

  // Enforce auth: if no logged-in user, strictly show auth screen and block all views
  if (!state.currentUser || !state.currentUser.id) {
    showAuthScreen();
    return;
  }

  showAppLayout();
  applyUserPermissions();
  loadSettings();
  // Preload core entities so cache and relations are always ready
  loadClients();
  loadEquipment();
  loadParts();
  switchTab(state.currentTab || 'dashboard');
}

function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const appLayout = document.getElementById('app-layout');
  if (authScreen) authScreen.classList.remove('hidden');
  if (appLayout) appLayout.classList.add('hidden');
  hideAuthError();
  if (window.lucide) lucide.createIcons();
}

function showAppLayout() {
  const authScreen = document.getElementById('auth-screen');
  const appLayout = document.getElementById('app-layout');
  if (authScreen) authScreen.classList.add('hidden');
  if (appLayout) appLayout.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
  initRealtimeSync();
}

function showAuthError(msg) {
  const alertEl = document.getElementById('auth-error-alert');
  const textEl = document.getElementById('auth-error-text');
  if (textEl) textEl.textContent = msg;
  if (alertEl) alertEl.classList.remove('hidden');
}

function hideAuthError() {
  const alertEl = document.getElementById('auth-error-alert');
  if (alertEl) alertEl.classList.add('hidden');
}

function toggleAuthPasswordVisibility() {
  const p = document.getElementById('auth-password');
  const icon = document.getElementById('auth-password-toggle-icon');
  if (!p) return;
  if (p.type === 'password') {
    p.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    p.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  if (window.lucide) lucide.createIcons();
}

async function handleAuthScreenLogin(e) {
  if (e) e.preventDefault();
  hideAuthError();

  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');

  const username = usernameInput ? usernameInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!username || !password) {
    showAuthError('Пожалуйста, введите логин и пароль сотрудника');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Проверка доступа...</span>';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Неверный логин или пароль');

    state.currentUser = data;
    localStorage.setItem('specmash_user', JSON.stringify(data));
    showAppLayout();
    applyUserPermissions();
    await loadSettings();
    await switchTab('dashboard');
    showToast(`Добро пожаловать, ${data.full_name}!`);
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
  } catch (err) {
    showAuthError(err.message || 'Ошибка входа');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="log-in" class="w-4 h-4"></i><span>Войти в программу</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

function quickFillAndLogin(u, p) {
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  if (usernameInput) usernameInput.value = u;
  if (passwordInput) passwordInput.value = p;
  handleAuthScreenLogin();
}

function handleLogout() {
  localStorage.removeItem('specmash_user');
  state.currentUser = null;
  closeUserDropdown();
  showAuthScreen();
  showToast('Вы вышли из системы СТО Спецмаш');
}

function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) {
    menu.classList.toggle('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeUserDropdown() {
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.classList.add('hidden');
}

// Global listener to close dropdown on outside clicks
document.addEventListener('click', (e) => {
  const menu = document.getElementById('user-dropdown-menu');
  const btn = document.getElementById('user-profile-btn');
  if (menu && !menu.classList.contains('hidden')) {
    if (btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  }
});

function applyUserPermissions() {
  const u = state.currentUser;
  if (!u) return;

  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const avatarEl = document.getElementById('user-avatar');
  const ddNameEl = document.getElementById('dropdown-user-name');
  const ddRoleEl = document.getElementById('dropdown-user-role');

  const roleInfo = ROLE_DEFINITIONS[u.role] || { label: u.role, icon: '' };

  if (nameEl) nameEl.textContent = u.full_name.split(' (')[0];
  if (roleEl) roleEl.textContent = `${roleInfo.icon} ${roleInfo.label}`;
  if (ddNameEl) ddNameEl.textContent = u.full_name;
  if (ddRoleEl) ddRoleEl.textContent = `${roleInfo.icon} ${roleInfo.label}`;
  
  if (avatarEl) {
    const initials = u.full_name.split(' ').map(n => n[0]).slice(0, 2).join('');
    avatarEl.textContent = initials || 'СП';
    if (u.role === 'admin') avatarEl.className = 'w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm';
    else if (u.role === 'moderator') avatarEl.className = 'w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm';
    else avatarEl.className = 'w-8 h-8 rounded-full bg-amber-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm';
  }

  // Role visibility: Hide finance details & cost from mechanic
  const isMechanic = u.role === 'mechanic';
  const isAdmin = u.role === 'admin';
  const financeBlock = document.getElementById('header-finance-block');
  const revCard = document.getElementById('dash-card-revenue');
  const chartsRow = document.getElementById('dash-charts-row');

  if (financeBlock) financeBlock.classList.toggle('hidden', isMechanic);
  if (revCard) revCard.classList.toggle('hidden', isMechanic);
  if (chartsRow) chartsRow.classList.toggle('hidden', isMechanic);

  // Settings: strictly visible to Admin only (Requirement #10)
  const navSettings = document.getElementById('nav-settings');
  if (navSettings) navSettings.classList.toggle('hidden', !isAdmin);

  // Employees tab: hidden for mechanic
  const navUsers = document.getElementById('nav-users');
  if (navUsers) navUsers.classList.toggle('hidden', isMechanic);

  // Body classes for global CSS role hiding (e.g. .role-mechanic .col-deal-cost)
  document.body.classList.toggle('role-mechanic', isMechanic);
  document.body.classList.toggle('role-admin', isAdmin);
}

function openLoginModal() {
  openModal('modal-login');
  if (window.lucide) lucide.createIcons();
}

async function quickLogin(role) {
  const credentials = {
    admin: { username: 'admin', password: 'admin123' },
    moderator: { username: 'moderator', password: 'mod123' },
    mechanic: { username: 'mechanic', password: 'mech123' },
  };

  const cred = credentials[role];
  if (!cred) return;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cred)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка входа');

    state.currentUser = data;
    localStorage.setItem('specmash_user', JSON.stringify(data));
    applyUserPermissions();
    closeModal('modal-login');
    showToast(`Вы вошли как ${data.full_name} (${ROLE_DEFINITIONS[data.role]?.label})`);
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleManualLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Неверный логин или пароль');

    state.currentUser = data;
    localStorage.setItem('specmash_user', JSON.stringify(data));
    applyUserPermissions();
    closeModal('modal-login');
    showToast(`Вы вошли как ${data.full_name}`);
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ================= SETTINGS & BRANDING (LOGO) =================

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    state.settings = data;

    const title = data.company_name || 'СТО Спецмаш';
    document.title = `${title} — Управление сервисом, техникой и складом`;
    const sidebarTitle = document.getElementById('sidebar-company-name');
    if (sidebarTitle) sidebarTitle.textContent = title;
    const inputTitle = document.getElementById('input-company-name');
    if (inputTitle) inputTitle.value = title;

    const logoImgWrapper = document.getElementById('sidebar-logo-img-wrapper');
    const logoFallback = document.getElementById('sidebar-logo-fallback');
    const logoImg = document.getElementById('sidebar-logo-img');
    const previewBox = document.getElementById('settings-logo-preview');
    const statusText = document.getElementById('settings-logo-status');

    if (data.logo_url && data.logo_url.trim().length > 0) {
      if (logoImg) logoImg.src = data.logo_url;
      if (logoImgWrapper) logoImgWrapper.classList.remove('hidden');
      if (logoFallback) logoFallback.classList.add('hidden');

      if (previewBox) {
        previewBox.innerHTML = `<img src="${data.logo_url}" class="w-full h-full object-contain">`;
      }
      if (statusText) statusText.textContent = 'Установлен собственный логотип компании';
    } else {
      if (logoImgWrapper) logoImgWrapper.classList.add('hidden');
      if (logoFallback) logoFallback.classList.remove('hidden');

      if (previewBox) {
        previewBox.innerHTML = `<i data-lucide="wrench" class="w-7 h-7 text-blue-600"></i>`;
      }
      if (statusText) statusText.textContent = 'Используется стандартный значок сервиса';
    }

    // Apply login screen branding & icon (Requirement #9)
    applyAuthScreenBranding(data);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function applyAuthScreenBranding(settings) {
  if (!settings) return;
  const nameEl = document.getElementById('auth-screen-company-name');
  if (nameEl && settings.company_name) nameEl.textContent = settings.company_name;

  const sloganEl = document.getElementById('auth-screen-company-slogan');
  if (sloganEl && settings.company_slogan) sloganEl.textContent = settings.company_slogan;

  const authImg = document.getElementById('auth-screen-logo-img');
  const authIcon = document.getElementById('auth-screen-icon');

  if (settings.auth_logo_url && settings.auth_logo_url.trim().length > 0) {
    if (authImg) {
      authImg.src = settings.auth_logo_url;
      authImg.classList.remove('hidden');
    }
    if (authIcon) authIcon.classList.add('hidden');
  } else {
    if (authImg) authImg.classList.add('hidden');
    if (authIcon) {
      authIcon.classList.remove('hidden');
      authIcon.setAttribute('data-lucide', settings.auth_icon || 'wrench');
    }
  }
  if (window.lucide) lucide.createIcons();
}

function selectAuthIcon(iconName) {
  const iconInput = document.getElementById('setting-auth-icon');
  const logoInput = document.getElementById('setting-auth-logo-url');
  if (iconInput) iconInput.value = iconName;
  if (logoInput) logoInput.value = '';

  updateAuthIconPreview(iconName, '');
}

function handleAuthLogoUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const dataUrl = evt.target.result;
    const logoInput = document.getElementById('setting-auth-logo-url');
    if (logoInput) logoInput.value = dataUrl;
    updateAuthIconPreview('', dataUrl);
  };
  reader.readAsDataURL(file);
}

function resetAuthIcon() {
  const iconInput = document.getElementById('setting-auth-icon');
  const logoInput = document.getElementById('setting-auth-logo-url');
  if (iconInput) iconInput.value = 'wrench';
  if (logoInput) logoInput.value = '';
  updateAuthIconPreview('wrench', '');
}

function updateAuthIconPreview(iconName, logoUrl) {
  const imgEl = document.getElementById('settings-auth-logo-img');
  const iconEl = document.getElementById('settings-auth-icon-i');

  if (logoUrl && logoUrl.trim().length > 0) {
    if (imgEl) {
      imgEl.src = logoUrl;
      imgEl.classList.remove('hidden');
    }
    if (iconEl) iconEl.classList.add('hidden');
  } else {
    if (imgEl) imgEl.classList.add('hidden');
    if (iconEl) {
      iconEl.classList.remove('hidden');
      iconEl.setAttribute('data-lucide', iconName || 'wrench');
    }
  }

  // Highlight active button in options
  document.querySelectorAll('#auth-icon-options .auth-icon-btn').forEach(btn => {
    const isSelected = !logoUrl && btn.getAttribute('data-icon') === iconName;
    btn.classList.toggle('border-blue-500', isSelected);
    btn.classList.toggle('bg-blue-50', isSelected);
    btn.classList.toggle('ring-1', isSelected);
    btn.classList.toggle('ring-blue-500', isSelected);
  });

  if (window.lucide) lucide.createIcons();
}

function openLogoModal() {
  openModal('modal-logo');
  if (window.lucide) lucide.createIcons();
}

async function uploadLogoFile(file) {
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/settings/logo', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка загрузки');

    showToast('Логотип СТО Спецмаш успешно обновлен!');
    closeModal('modal-logo');
    loadSettings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveLogoUrl() {
  const url = document.getElementById('logo-url-input').value.trim();
  if (!url) return;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo_url: url })
    });
    if (!res.ok) throw new Error();

    showToast('Логотип обновлен!');
    closeModal('modal-logo');
    loadSettings();
  } catch (err) {
    showToast('Ошибка сохранения логотипа', 'error');
  }
}

async function resetLogo() {
  try {
    const res = await fetch('/api/settings/logo', { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast('Логотип сброшен к стандартному значку');
    closeModal('modal-logo');
    loadSettings();
  } catch (err) {
    showToast('Ошибка сброса логотипа', 'error');
  }
}

async function saveCompanyName(e) {
  e.preventDefault();
  const name = document.getElementById('input-company-name').value.trim();
  if (!name) return;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: name })
    });
    if (!res.ok) throw new Error();
    showToast('Название организации успешно сохранено');
    loadSettings();
  } catch (err) {
    showToast('Ошибка при сохранении названия', 'error');
  }
}

// ================= ADMINISTRATOR SETTINGS =================

async function loadAdminSettings() {
  try {
    const [resSettings, resStats] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/settings/stats')
    ]);

    const settingsData = await resSettings.json();
    const statsData = await resStats.json();

    state.settings = settingsData;

    // Populate Settings Form Inputs
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined && val !== null ? val : '';
    };

    setVal('setting-company-name', settingsData.company_name || 'СТО Спецмаш');
    setVal('setting-company-slogan', settingsData.company_slogan || '');
    setVal('setting-company-phone', settingsData.company_phone || '+374 99 999999');
    setVal('setting-company-email', settingsData.company_email || 'info@specmash-sto.am');
    setVal('setting-company-address', settingsData.company_address || 'г. Ереван, ул. Себастия, 12');
    setVal('setting-company-tin', settingsData.company_tin || '02589412');
    setVal('setting-default-responsible', settingsData.default_responsible || '');
    setVal('setting-warranty-months', settingsData.warranty_months || '6');
    setVal('setting-currency', settingsData.currency || 'AMD');

    // Login screen icon & logo preview and inputs (Requirement #9)
    const authIcon = settingsData.auth_icon || 'wrench';
    const authLogoUrl = settingsData.auth_logo_url || '';
    setVal('setting-auth-icon', authIcon);
    setVal('setting-auth-logo-url', authLogoUrl);
    updateAuthIconPreview(authIcon, authLogoUrl);

    // Live preview card in Admin tab
    const previewName = document.getElementById('settings-brand-name-preview');
    if (previewName) previewName.textContent = settingsData.company_name || 'СТО Спецмаш';

    const previewLogo = document.getElementById('settings-brand-logo-preview');
    if (previewLogo) {
      if (settingsData.logo_url) {
        previewLogo.innerHTML = `<img src="${settingsData.logo_url}" class="w-full h-full object-contain">`;
      } else {
        previewLogo.innerHTML = `<i data-lucide="wrench" class="w-6 h-6 text-blue-600"></i>`;
      }
    }

    // Populate System Database Stats
    if (statsData) {
      const dbSizeEl = document.getElementById('settings-db-size');
      if (dbSizeEl) dbSizeEl.textContent = `${statsData.db_size_kb || 0} KB`;

      if (statsData.counts) {
        const setTxt = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.textContent = val !== undefined ? val : 0;
        };
        setTxt('settings-count-clients', statsData.counts.clients);
        setTxt('settings-count-equipment', statsData.counts.equipment);
        setTxt('settings-count-parts', statsData.counts.parts);
        setTxt('settings-count-deals', statsData.counts.deals);
        setTxt('settings-count-users', statsData.counts.users);
      }
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading admin settings:', err);
    showToast('Ошибка при загрузке настроек', 'error');
  }
}

async function saveAdminSettings(e) {
  if (e) e.preventDefault();

  const payload = {
    company_name: document.getElementById('setting-company-name')?.value.trim() || 'СТО Спецмаш',
    company_slogan: document.getElementById('setting-company-slogan')?.value.trim() || '',
    company_phone: document.getElementById('setting-company-phone')?.value.trim() || '+374 99 999999',
    company_email: document.getElementById('setting-company-email')?.value.trim() || '',
    company_address: document.getElementById('setting-company-address')?.value.trim() || '',
    company_tin: document.getElementById('setting-company-tin')?.value.trim() || '',
    default_responsible: document.getElementById('setting-default-responsible')?.value.trim() || '',
    warranty_months: document.getElementById('setting-warranty-months')?.value || '6',
    currency: 'AMD',
    auth_icon: document.getElementById('setting-auth-icon')?.value || 'wrench',
    auth_logo_url: document.getElementById('setting-auth-logo-url')?.value || '',
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка сохранения');

    showToast('Основные настройки СТО Спецмаш успешно сохранены!');
    await loadSettings();
    await loadAdminSettings();
  } catch (err) {
    showToast(err.message || 'Ошибка при сохранении настроек', 'error');
  }
}

function downloadDatabaseBackup() {
  showToast('Формирование и скачивание резервной копии crm.db...', 'info');
  window.location.href = '/api/settings/backup';
}


// ================= MOBILE NAVIGATION & SIDEBAR DRAWER =================

function toggleMobileSidebar(force) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('sidebar-open');
  const shouldOpen = typeof force === 'boolean' ? force : !isOpen;

  if (shouldOpen) {
    sidebar.classList.add('sidebar-open');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.remove('sidebar-open');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

// ================= TAB MANAGEMENT =================

function switchTab(tabName) {
  if (!state.currentUser || !state.currentUser.id) {
    showAuthScreen();
    return;
  }

  // Security check: Only Admin can access Settings (Requirement #10)
  if (tabName === 'settings' && state.currentUser.role !== 'admin') {
    showToast('Настройки СТО доступны исключительно Администратору', 'warning');
    return switchTab('dashboard');
  }

  // Security check: Mechanics do not access Users tab
  if (tabName === 'users' && state.currentUser.role === 'mechanic') {
    showToast('Раздел недоступен для роли Механик', 'warning');
    return switchTab('dashboard');
  }

  // Auto-close mobile drawer on navigation
  toggleMobileSidebar(false);

  state.currentTab = tabName;
  const tabs = ['dashboard', 'kanban', 'clients', 'equipment', 'warehouse', 'tasks', 'users', 'export', 'settings'];
  
  tabs.forEach(t => {
    const section = document.getElementById(`tab-${t}`);
    const navItem = document.getElementById(`nav-${t}`);
    if (section) section.classList.toggle('hidden', t !== tabName);
    if (navItem) {
      if (t === tabName) {
        navItem.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-blue-600/20 border-l-4 border-blue-500';
      } else {
        navItem.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800';
      }
    }
  });

  if (tabName === 'dashboard') loadDashboard();
  else if (tabName === 'kanban') loadDeals();
  else if (tabName === 'clients') loadClients();
  else if (tabName === 'equipment') loadEquipment();
  else if (tabName === 'warehouse') loadParts();
  else if (tabName === 'tasks') loadTasks();
  else if (tabName === 'users') loadUsers();
  else if (tabName === 'settings') loadAdminSettings();

  if (window.lucide) lucide.createIcons();
}

function handleGlobalSearch(query) {
  if (!query || query.length < 2) {
    if (state.currentTab === 'clients') loadClients();
    if (state.currentTab === 'equipment') loadEquipment();
    if (state.currentTab === 'warehouse') loadParts();
    if (state.currentTab === 'kanban') loadDeals();
    return;
  }

  if (state.currentTab === 'clients') loadClients(query);
  else if (state.currentTab === 'equipment') loadEquipment(query);
  else if (state.currentTab === 'warehouse') loadParts(query);
  else {
    if (state.currentTab !== 'kanban') switchTab('kanban');
    document.getElementById('kanban-filter').value = query;
    renderKanban();
  }
}

// ================= 1. DASHBOARD & ANALYTICS =================

async function loadDashboard() {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();
    state.dashboard = data;

    // Header stats (AMD)
    document.getElementById('header-revenue').textContent = formatMoney(data.total_revenue);
    document.getElementById('header-active-deals').textContent = `${data.active_deals_count} нарядов`;

    // Cards (AMD)
    document.getElementById('stat-revenue').textContent = formatMoney(data.total_revenue);
    document.getElementById('stat-profit').textContent = formatMoney(data.net_profit);
    document.getElementById('stat-margin').textContent = `${data.margin_percent}% маржа`;

    document.getElementById('stat-active-deals').textContent = data.active_deals_count;
    document.getElementById('stat-active-volume').textContent = formatMoney(data.active_deals_volume);

    document.getElementById('stat-inventory-retail').textContent = formatMoney(data.inventory_retail);
    document.getElementById('stat-inventory-cost').textContent = formatMoney(data.inventory_cost);
    document.getElementById('stat-low-stock-pill').textContent = `${data.low_stock_parts} в дефиците`;

    document.getElementById('stat-clients-count').textContent = data.total_clients;
    document.getElementById('stat-equipment-count').textContent = data.total_equipment;
    document.getElementById('stat-overdue-tasks').textContent = data.overdue_tasks;

    const kanbanCount = (typeof data.total_deals_count === 'number') 
      ? data.total_deals_count 
      : (state.deals && state.deals.length > 0 ? state.deals.length : data.active_deals_count);
    document.getElementById('badge-kanban-count').textContent = kanbanCount;
    document.getElementById('badge-clients-count').textContent = data.total_clients;
    document.getElementById('badge-equipment-count').textContent = data.total_equipment;
    const userBadge = document.getElementById('badge-users-count');
    if (userBadge) userBadge.textContent = data.total_users || 3;

    const lowStockAlert = document.getElementById('badge-lowstock-alert');
    if (data.low_stock_parts > 0) {
      lowStockAlert.textContent = data.low_stock_parts;
      lowStockAlert.classList.remove('hidden');
    } else {
      lowStockAlert.classList.add('hidden');
    }

    const tasksOverdueAlert = document.getElementById('badge-tasks-overdue');
    if (data.overdue_tasks > 0) {
      tasksOverdueAlert.textContent = data.overdue_tasks;
      tasksOverdueAlert.classList.remove('hidden');
    } else {
      tasksOverdueAlert.classList.add('hidden');
    }

    renderRevenueChart(data.monthly_data, data.total_revenue, data.total_cost, data.net_profit);
    renderTopClients(data.top_clients);
    renderCriticalParts(data.critical_parts);
    renderRecentDeals(data.recent_deals);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderRevenueChart(monthlyData, totalRev, totalCost, netProfit) {
  const container = document.getElementById('revenue-bars-container');
  if (!container) return;

  let barsHtml = '';
  if (!monthlyData || monthlyData.length === 0) {
    const maxVal = Math.max(totalRev, 1);
    const revHeight = Math.round((totalRev / maxVal) * 160);
    const costHeight = Math.round((totalCost / maxVal) * 160);
    const profitHeight = Math.round((netProfit / maxVal) * 160);

    barsHtml = `
      <div class="flex-1 flex flex-col items-center justify-end h-full">
        <div class="w-full flex items-end justify-center gap-3 h-44">
          <div class="w-12 bg-blue-600 rounded-t-md hover:bg-blue-500 transition-all cursor-pointer relative group" style="height: ${revHeight}px">
            <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(totalRev)}</span>
          </div>
          <div class="w-12 bg-amber-500 rounded-t-md hover:bg-amber-400 transition-all cursor-pointer relative group" style="height: ${costHeight}px">
            <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(totalCost)}</span>
          </div>
          <div class="w-12 bg-emerald-500 rounded-t-md hover:bg-emerald-400 transition-all cursor-pointer relative group" style="height: ${profitHeight}px">
            <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(netProfit)}</span>
          </div>
        </div>
        <div class="text-xs text-slate-500 font-semibold mt-2">Текущий финансовый период</div>
      </div>
    `;
  } else {
    const maxVal = Math.max(...monthlyData.map(m => m.revenue), 1);
    barsHtml = monthlyData.map(m => {
      const revHeight = Math.round((m.revenue / maxVal) * 150);
      const costHeight = Math.round((m.cost / maxVal) * 150);
      const profitHeight = Math.round(((m.revenue - m.cost) / maxVal) * 150);
      return `
        <div class="flex-1 flex flex-col items-center justify-end h-full">
          <div class="w-full flex items-end justify-center gap-1.5 h-44">
            <div class="w-7 bg-blue-600 rounded-t hover:bg-blue-500 transition-all cursor-pointer relative group" style="height: ${revHeight}px">
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(m.revenue)}</span>
            </div>
            <div class="w-7 bg-amber-500 rounded-t hover:bg-amber-400 transition-all cursor-pointer relative group" style="height: ${costHeight}px">
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(m.cost)}</span>
            </div>
            <div class="w-7 bg-emerald-500 rounded-t hover:bg-emerald-400 transition-all cursor-pointer relative group" style="height: ${profitHeight}px">
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(m.revenue - m.cost)}</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-500 font-mono mt-2">${m.month}</div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = barsHtml;
}

function renderTopClients(topClients) {
  const container = document.getElementById('top-clients-list');
  if (!container) return;
  if (!topClients || topClients.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">Нет данных о выполненных сделках</div>';
    return;
  }

  container.innerHTML = topClients.map((c, idx) => `
    <div class="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100">
      <div class="flex items-center gap-3">
        <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold font-mono">${idx + 1}</span>
        <div>
          <div class="text-xs font-bold text-slate-800">${c.name}</div>
          <div class="text-[11px] text-slate-400">${c.company || 'Частный заказчик'} • ${c.completed_deals} нарядов</div>
        </div>
      </div>
      <div class="text-xs font-bold text-emerald-600 font-mono">${formatMoney(c.total_spent)}</div>
    </div>
  `).join('');
}

function renderCriticalParts(parts) {
  const container = document.getElementById('critical-parts-table');
  if (!container) return;
  if (!parts || parts.length === 0) {
    container.innerHTML = '<div class="text-xs text-emerald-600 bg-emerald-50 p-3 rounded-lg flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i> Дефицитных позиций нет! Все запчасти в достаточном количестве.</div>';
    return;
  }

  container.innerHTML = parts.map(p => `
    <div class="flex items-center justify-between p-2.5 rounded-lg border border-rose-100 bg-rose-50/40 text-xs">
      <div>
        <div class="font-bold text-slate-800 flex items-center gap-2">
          <span>${p.name}</span>
          <span class="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border">${p.sku}</span>
        </div>
        <div class="text-[11px] text-slate-500 mt-0.5">Локация: ${p.location || 'Склад'} • Мин. остаток: ${p.min_threshold} шт</div>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-bold text-rose-600 font-mono text-sm">${p.quantity} шт</span>
        <button onclick="openStockAdjustModal(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded text-[11px] font-medium shadow-sm">
          + Приход
        </button>
      </div>
    </div>
  `).join('');
}

function renderRecentDeals(deals) {
  const container = document.getElementById('recent-deals-list');
  if (!container) return;
  if (!deals || deals.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-3">Сделки отсутствуют</div>';
    return;
  }

  container.innerHTML = deals.map(d => {
    const stageObj = KANBAN_STAGES.find(s => s.id === d.stage) || { label: d.stage };
    return `
      <div onclick="openDealModal(${d.id})" class="p-2.5 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between text-xs">
        <div>
          <div class="font-bold text-slate-800">${d.title}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">
            ${d.client_name || 'Без клиента'} • ${d.equipment_name || 'Техника не выбрана'}
          </div>
        </div>
        <div class="text-right">
          <div class="font-bold text-blue-600 font-mono">${formatMoney(d.amount)}</div>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">${stageObj.label}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ================= 2. DEALS (KANBAN & BITRIX24 LIST) =================

function setDealsViewMode(mode) {
  state.dealsViewMode = mode;

  const btnKanban = document.getElementById('view-mode-kanban');
  const btnList = document.getElementById('view-mode-list');
  const kanbanView = document.getElementById('deals-kanban-view');
  const listView = document.getElementById('deals-list-view');
  const stageFilter = document.getElementById('deals-stage-filter');

  if (mode === 'kanban') {
    if (btnKanban) {
      btnKanban.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 shadow-sm transition-all';
    }
    if (btnList) {
      btnList.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all';
    }
    if (kanbanView) kanbanView.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');
    if (stageFilter) stageFilter.classList.add('hidden');
  } else {
    if (btnKanban) {
      btnKanban.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all';
    }
    if (btnList) {
      btnList.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 shadow-sm transition-all';
    }
    if (kanbanView) kanbanView.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');
    if (stageFilter) stageFilter.classList.remove('hidden');
  }

  renderDeals();
}

async function loadDeals() {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const res = await fetch('/api/deals');
    const serverDeals = await res.json();
    state.deals = crmStore.mergeWithServer('deals', serverDeals);
    renderDeals();
  } catch (err) {
    console.error('Error loading deals:', err);
    state.deals = crmStore.getList('deals');
    renderDeals();
  }
}

function renderDeals() {
  const badgeKanban = document.getElementById('badge-kanban-count');
  if (badgeKanban) badgeKanban.textContent = state.deals ? state.deals.length : 0;

  if (state.dealsViewMode === 'list') {
    renderDealsList();
  } else {
    renderKanban();
  }
}

function renderKanban() {
  const wrapper = document.getElementById('kanban-columns-wrapper');
  if (!wrapper) return;

  const filterText = (document.getElementById('kanban-filter')?.value || '').toLowerCase().trim();

  const filteredDeals = state.deals.filter(d => {
    if (!filterText) return true;
    return (
      d.title.toLowerCase().includes(filterText) ||
      (d.client_name && d.client_name.toLowerCase().includes(filterText)) ||
      (d.equipment_name && d.equipment_name.toLowerCase().includes(filterText)) ||
      (d.responsible && d.responsible.toLowerCase().includes(filterText))
    );
  });

  wrapper.innerHTML = KANBAN_STAGES.map(stage => {
    const stageDeals = filteredDeals.filter(d => d.stage === stage.id);
    const stageTotal = stageDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

    return `
      <div class="kanban-col flex-shrink-0" data-stage="${stage.id}">
        <div class="p-3 border-b border-slate-200/80 bg-white rounded-t-xl border-t-4 ${stage.color} flex items-center justify-between">
          <div>
            <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <span>${stage.label}</span>
              <span class="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold">${stageDeals.length}</span>
            </div>
            <div class="text-[10px] font-mono text-slate-400 mt-0.5">${formatMoney(stageTotal)}</div>
          </div>
          <button onclick="openDealModal(null, '${stage.id}')" class="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100" title="Добавить наряд">
            <i data-lucide="plus" class="w-4 h-4"></i>
          </button>
        </div>

        <div class="kanban-cards-container flex-1 space-y-2.5" 
             ondragover="handleDragOver(event)" 
             ondragleave="handleDragLeave(event)" 
             ondrop="handleDrop(event, '${stage.id}')">
          ${stageDeals.map(d => renderKanbanCard(d)).join('')}
          ${stageDeals.length === 0 ? `<div class="h-20 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-[11px] text-slate-400 select-none">Пусто</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderDealsList() {
  const tbody = document.getElementById('deals-table-body');
  if (!tbody) return;

  const filterText = (document.getElementById('kanban-filter')?.value || '').toLowerCase().trim();
  const stageFilter = document.getElementById('deals-stage-filter')?.value || 'all';

  const filteredDeals = state.deals.filter(d => {
    if (stageFilter !== 'all' && d.stage !== stageFilter) return false;
    if (!filterText) return true;
    return (
      d.title.toLowerCase().includes(filterText) ||
      (d.client_name && d.client_name.toLowerCase().includes(filterText)) ||
      (d.equipment_name && d.equipment_name.toLowerCase().includes(filterText)) ||
      (d.responsible && d.responsible.toLowerCase().includes(filterText))
    );
  });

  const totalAmount = filteredDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalCountEl = document.getElementById('deals-list-total-count');
  const totalAmountEl = document.getElementById('deals-list-total-amount');
  if (totalCountEl) totalCountEl.textContent = filteredDeals.length;
  if (totalAmountEl) totalAmountEl.textContent = formatMoney(totalAmount);

  if (filteredDeals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 text-xs">Заказ-наряды не найдены по заданным условиям</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredDeals.map(deal => {
    let priorityBadge = '';
    if (deal.priority === 'urgent') priorityBadge = '<span class="badge-urgent text-[10px] font-bold px-1.5 py-0.5 rounded">🔥 Срочно</span>';
    else if (deal.priority === 'high') priorityBadge = '<span class="badge-high text-[10px] font-bold px-1.5 py-0.5 rounded">Высокий</span>';
    else if (deal.priority === 'low') priorityBadge = '<span class="badge-low text-[10px] font-medium px-1.5 py-0.5 rounded">Низкий</span>';

    const currIdx = KANBAN_STAGES.findIndex(s => s.id === deal.stage);
    const stageObj = KANBAN_STAGES.find(s => s.id === deal.stage) || { label: deal.stage };

    // Bitrix24 Pipeline Chevrons
    const chevronsHtml = KANBAN_STAGES.map((s, idx) => {
      let stateClass = 'future';
      if (idx < currIdx) stateClass = 'passed';
      else if (idx === currIdx) stateClass = `current stage-${s.id}`;

      return `
        <button type="button" 
                onclick="updateDealStageQuick(${deal.id}, '${s.id}', event)" 
                class="b24-stage-chevron ${stateClass}" 
                title="${s.label} • Кликните для быстрого выбора стадии">
          ${s.short || s.label}
        </button>
      `;
    }).join('');

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-3.5">
          <div class="flex items-start gap-2">
            <span class="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">#${deal.id}</span>
            <div>
              <button onclick="openDealModal(${deal.id})" class="font-bold text-slate-800 hover:text-blue-600 text-left block text-sm transition-colors">
                ${deal.title}
              </button>
              <div class="mt-1 flex items-center gap-1.5">
                ${priorityBadge}
                ${Number(deal.parts_count || 0) > 0 ? `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold" title="Списано со склада">${deal.parts_count} з/ч</span>` : ''}
              </div>
            </div>
          </div>
        </td>

        <td class="p-3.5 text-xs">
          <div class="font-bold text-slate-800">${deal.client_name || 'Не указан'}</div>
          <div class="text-slate-400 text-[11px] font-mono">${deal.client_phone || '—'}</div>
        </td>

        <td class="p-3.5 text-xs">
          <div class="font-bold text-slate-700 flex items-center gap-1.5">
            <i data-lucide="truck" class="w-3.5 h-3.5 text-emerald-600"></i>
            <span>${deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || 'Не привязана'}</span>
          </div>
          <div class="text-[11px] text-slate-400 font-mono">${deal.equipment_category || ''}</div>
        </td>

        <td class="p-3.5">
          <div class="space-y-1.5">
            <!-- Bitrix24 segmented chevron bar -->
            <div class="b24-pipeline-container" title="Текущая стадия: ${stageObj.label}">
              ${chevronsHtml}
            </div>

            <!-- Quick Inline Dropdown Selector -->
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-slate-400 font-medium">Стадия:</span>
              <select onchange="updateDealStageQuick(${deal.id}, this.value, event)" class="b24-stage-select bg-white border border-slate-200 text-[11px] font-semibold rounded px-2 py-0.5 outline-none focus:border-blue-500 cursor-pointer">
                ${KANBAN_STAGES.map(s => `
                  <option value="${s.id}" ${s.id === deal.stage ? 'selected' : ''}>${s.label}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </td>

        <td class="p-3.5 text-xs font-mono font-bold text-blue-600 text-right">
          ${formatMoney(deal.amount)}
        </td>

        <td class="p-3.5 text-xs font-mono text-slate-500 text-right col-deal-cost">
          ${formatMoney(deal.cost)}
        </td>

        <td class="p-3.5 text-xs text-slate-700 font-medium">
          ${deal.responsible ? deal.responsible.split(' ')[0] : '—'}
        </td>

        <td class="p-3.5 text-xs font-mono text-slate-500">
          ${deal.deadline || '—'}
        </td>

        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="openDealModal(${deal.id})" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded" title="Редактировать наряд">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="quickDeleteDeal(${deal.id})" class="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded" title="Удалить наряд">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function updateDealStageQuick(dealId, newStage, event) {
  if (event) event.stopPropagation();
  const deal = state.deals.find(d => Number(d.id) === Number(dealId));
  if (!deal || deal.stage === newStage) return;

  const oldStage = deal.stage;
  deal.stage = newStage;
  crmStore.saveItem('deals', deal);
  renderDeals();
  highlightMovedCard(dealId);

  // Send real-time notification to FastAPI WebSocket
  if (fastApiWs && fastApiWs.readyState === WebSocket.OPEN) {
    try {
      fastApiWs.send(JSON.stringify({
        type: 'deal_stage_updated',
        deal_id: dealId,
        stage: newStage
      }));
    } catch (e) {}
  }

  try {
    let res = await fetch(`/api/deals/${dealId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage })
    });
    if (!res.ok) {
      res = await fetch(`/api/deals/${dealId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка обновления стадии');
    const stageName = KANBAN_STAGES.find(s => s.id === newStage)?.label || newStage;
    showToast(`Наряд #${dealId}: стадия изменена на «${stageName}»`, 'info');
    loadDashboard();
  } catch (err) {
    console.warn('Deal stage update warning:', err);
    const stageName = KANBAN_STAGES.find(s => s.id === newStage)?.label || newStage;
    showToast(`Стадия наряда сохранена: «${stageName}»`, 'info');
  }
}

async function quickDeleteDeal(dealId) {
  if (!confirm(`Удалить заказ-наряд #${dealId}?`)) return;
  try {
    const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast(`Заказ-наряд #${dealId} удален`);
    loadDeals();
    loadDashboard();
  } catch (err) {
    showToast('Ошибка при удалении наряда', 'error');
  }
}

function renderKanbanCard(deal) {
  let priorityBadge = '';
  if (deal.priority === 'urgent') priorityBadge = '<span class="badge-urgent text-[10px] font-bold px-1.5 py-0.5 rounded">🔥 Срочно</span>';
  else if (deal.priority === 'high') priorityBadge = '<span class="badge-high text-[10px] font-bold px-1.5 py-0.5 rounded">Высокий</span>';
  else if (deal.priority === 'low') priorityBadge = '<span class="badge-low text-[10px] font-medium px-1.5 py-0.5 rounded">Низкий</span>';

  return `
    <div class="kanban-card bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-sm relative space-y-2 transition-all duration-300" 
         id="kanban-card-${deal.id}"
         data-deal-id="${deal.id}"
         draggable="true" 
         ondragstart="handleDragStart(event, ${deal.id})"
         ondragend="handleDragEnd(event)"
         onclick="openDealModal(${deal.id})">
      
      <div class="flex items-start justify-between gap-2">
        <h4 class="font-bold text-slate-800 text-xs leading-snug hover:text-blue-600 transition-colors">${deal.title}</h4>
        ${priorityBadge}
      </div>

      <div class="space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
        <div class="flex items-center gap-1.5 font-medium text-slate-700">
          <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
          <span class="truncate">${deal.client_name || 'Клиент не указан'}</span>
        </div>
        <div class="flex items-center gap-1.5 text-slate-600">
          <i data-lucide="truck" class="w-3.5 h-3.5 text-emerald-500"></i>
          <span class="truncate">${deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || 'Техника не привязана'}</span>
        </div>
      </div>

      <div class="flex items-center justify-between pt-1 text-xs">
        <span class="font-bold text-blue-600 font-mono">${formatMoney(deal.amount)}</span>
        <div class="flex items-center gap-1.5">
          ${deal.parts_count > 0 ? `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold" title="Списано запчастей">${deal.parts_count} з/ч</span>` : ''}
          <span class="text-[10px] text-slate-500 font-medium">${deal.responsible ? deal.responsible.split(' ')[0] : ''}</span>
        </div>
      </div>
    </div>
  `;
}

function handleDragStart(e, dealId) {
  state.draggedDealId = dealId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.setData('text/plain', dealId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  state.draggedDealId = null;
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.kanban-cards-container').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, newStage) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const dealId = state.draggedDealId;
  state.draggedDealId = null;
  if (!dealId) return;

  const deal = state.deals.find(d => Number(d.id) === Number(dealId));
  if (deal && deal.stage !== newStage) {
    deal.stage = newStage;
    crmStore.saveItem('deals', deal);
    renderDeals();
    highlightMovedCard(dealId);

    // Send real-time notification to FastAPI WebSocket
    if (fastApiWs && fastApiWs.readyState === WebSocket.OPEN) {
      try {
        fastApiWs.send(JSON.stringify({
          type: 'deal_stage_updated',
          deal_id: dealId,
          stage: newStage
        }));
      } catch (e) {}
    }

    try {
      let res = await fetch(`/api/deals/${dealId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });
      if (!res.ok) {
        res = await fetch(`/api/deals/${dealId}/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage })
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка обновления стадии');
      showToast(`Статус наряда изменен на «${KANBAN_STAGES.find(s=>s.id===newStage)?.label}»`, 'info');
      loadDashboard();
    } catch (err) {
      console.warn('Handle drop warning:', err);
      showToast(`Статус наряда сохранен: «${KANBAN_STAGES.find(s=>s.id===newStage)?.label}»`, 'info');
    }
  }
}

// ================= 3. CLIENTS LOGIC =================

async function loadClients(searchQuery = '') {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const url = searchQuery ? `/api/clients?q=${encodeURIComponent(searchQuery)}` : '/api/clients';
    const res = await fetch(url);
    const serverClients = await res.json();
    state.clients = crmStore.mergeWithServer('clients', serverClients);
    renderClientsTable();
  } catch (err) {
    console.error('Error loading clients:', err);
    state.clients = crmStore.getList('clients');
    renderClientsTable();
  }
}

function renderClientsTable() {
  const tbody = document.getElementById('clients-table-body');
  if (!tbody) return;

  if (state.clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 text-xs">Клиенты не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = state.clients.map(c => `
    <tr class="hover:bg-slate-50/80 transition-colors">
      <td class="p-3.5">
        <button onclick="viewClientDetails(${c.id})" class="font-bold text-slate-800 hover:text-blue-600 text-left block text-sm">
          ${c.name}
        </button>
        <span class="text-xs text-slate-400">${c.company || 'Частное лицо'}</span>
      </td>
      <td class="p-3.5 text-xs">
        <div class="font-mono text-slate-700">${c.phone}</div>
        <div class="text-slate-400 text-[11px]">${c.email || '—'}</div>
      </td>
      <td class="p-3.5 text-xs">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
          <i data-lucide="truck" class="w-3 h-3"></i>
          <span>${c.equipment_count} ед. техники</span>
        </span>
      </td>
      <td class="p-3.5 text-xs font-mono font-medium text-slate-700">
        ${c.deals_count} нарядов
      </td>
      <td class="p-3.5 text-xs font-mono font-bold text-emerald-600">
        ${formatMoney(c.total_revenue)}
      </td>
      <td class="p-3.5 text-right space-x-1">
        <button onclick="viewClientDetails(${c.id})" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded" title="Просмотр">
          <i data-lucide="eye" class="w-4 h-4"></i>
        </button>
        <button onclick="openClientModal(${c.id})" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Редактировать">
          <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

async function viewClientDetails(clientId) {
  try {
    const res = await fetch(`/api/clients/${clientId}`);
    const client = await res.json();

    document.getElementById('view-client-name').textContent = client.name;
    document.getElementById('view-client-company').textContent = client.company || 'Частный заказчик';
    document.getElementById('view-client-phone').textContent = client.phone;
    document.getElementById('view-client-email').textContent = client.email || 'Не указан';
    document.getElementById('view-client-address').textContent = client.address || 'Не указан';

    const eqList = document.getElementById('view-client-equipment-list');
    if (client.equipment && client.equipment.length > 0) {
      eqList.innerHTML = client.equipment.map(eq => `
        <div class="flex items-center justify-between p-2 rounded-lg border border-slate-200 text-xs">
          <div>
            <div class="font-bold text-slate-800">${eq.name}</div>
            <div class="text-[11px] text-slate-400 font-mono">VIN: ${eq.serial_vin || '—'} • ${eq.operating_hours || '0 м/ч'}</div>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${eq.status === 'Исправна' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${eq.status}</span>
        </div>
      `).join('');
    } else {
      eqList.innerHTML = '<div class="text-xs text-slate-400 py-2">За этим клиентом техника еще не зарегистрирована</div>';
    }

    const dealsList = document.getElementById('view-client-deals-list');
    if (client.deals && client.deals.length > 0) {
      dealsList.innerHTML = client.deals.map(d => `
        <div class="flex items-center justify-between p-2 rounded-lg border border-slate-200 text-xs">
          <div>
            <div class="font-bold text-slate-800">${d.title}</div>
            <div class="text-[11px] text-slate-400">${d.equipment_name || 'Техника'} • ${formatDate(d.created_at)}</div>
          </div>
          <div class="text-right">
            <div class="font-bold font-mono text-blue-600">${formatMoney(d.amount)}</div>
            <span class="text-[10px] text-slate-500">${d.stage}</span>
          </div>
        </div>
      `).join('');
    } else {
      dealsList.innerHTML = '<div class="text-xs text-slate-400 py-2">История нарядов пуста</div>';
    }

    openModal('modal-client-view');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    showToast('Ошибка при загрузке данных клиента', 'error');
  }
}

// ================= 4. EQUIPMENT LOGIC =================

async function loadEquipment(searchQuery = '') {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const category = document.getElementById('equipment-category-filter')?.value || 'all';
    let url = `/api/equipment?category=${category}`;
    if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;

    const res = await fetch(url);
    const serverEq = await res.json();
    state.equipment = crmStore.mergeWithServer('equipment', serverEq);
    renderEquipmentTable();
  } catch (err) {
    console.error('Error loading equipment:', err);
    state.equipment = crmStore.getList('equipment');
    renderEquipmentTable();
  }
}

function renderEquipmentTable() {
  const tbody = document.getElementById('equipment-table-body');
  if (!tbody) return;

  if (state.equipment.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 text-xs">Техника не найдена</td></tr>`;
    return;
  }

  tbody.innerHTML = state.equipment.map(eq => `
    <tr class="hover:bg-slate-50/80 transition-colors">
      <td class="p-3.5">
        <div class="font-bold text-slate-800 text-sm">${eq.name}</div>
        <div class="text-[11px] text-slate-400">${eq.notes || '—'}</div>
      </td>
      <td class="p-3.5 text-xs text-slate-600 font-medium">
        ${eq.category}
      </td>
      <td class="p-3.5 text-xs">
        <div class="font-bold text-slate-800">${eq.client_name || 'Не привязан'}</div>
        <div class="text-slate-400 text-[11px]">${eq.client_phone || ''}</div>
      </td>
      <td class="p-3.5 text-xs font-mono text-slate-700">
        ${eq.serial_vin || '—'}
      </td>
      <td class="p-3.5 text-xs font-mono text-slate-700">
        <div>${eq.operating_hours || '—'}</div>
        <div class="text-[11px] text-slate-400">${eq.year ? eq.year + ' г.в.' : ''}</div>
      </td>
      <td class="p-3.5 text-xs">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
          eq.status === 'Исправна' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
          eq.status === 'В ремонте' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
          'bg-slate-100 text-slate-700 border border-slate-200'
        }">
          ${eq.status}
        </span>
      </td>
      <td class="p-3.5 text-right space-x-1">
        <button onclick="openEquipmentModal(${eq.id})" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Редактировать">
          <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// ================= 5. WAREHOUSE & PARTS =================

async function loadParts(searchQuery = '') {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const lowStock = document.getElementById('warehouse-filter-low')?.checked || false;
    let url = `/api/parts?low_stock=${lowStock}`;
    if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;

    const res = await fetch(url);
    const serverParts = await res.json();
    state.parts = crmStore.mergeWithServer('parts', serverParts);
    renderPartsTable();
  } catch (err) {
    console.error('Error loading warehouse:', err);
    state.parts = crmStore.getList('parts');
    renderPartsTable();
  }
}

function renderPartsTable() {
  const tbody = document.getElementById('parts-table-body');
  if (!tbody) return;

  if (state.parts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 text-xs">Запчасти не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = state.parts.map(p => {
    const isLow = p.quantity <= p.min_threshold;
    return `
      <tr class="hover:bg-slate-50/80 transition-colors ${isLow ? 'bg-rose-50/30' : ''}">
        <td class="p-3.5 font-mono text-xs font-bold text-slate-700">
          ${p.sku}
        </td>
        <td class="p-3.5">
          <div class="font-bold text-slate-800 text-sm">${p.name}</div>
        </td>
        <td class="p-3.5 text-xs text-slate-600">
          ${p.category}
        </td>
        <td class="p-3.5 text-xs text-slate-600 font-mono">
          ${p.location || '—'}
        </td>
        <td class="p-3.5 text-xs font-mono font-bold">
          <span class="px-2 py-0.5 rounded-full ${isLow ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-800'}">
            ${p.quantity} шт
          </span>
          ${isLow ? '<span class="text-[10px] text-rose-500 block font-normal mt-0.5">Дефицит! (мин ' + p.min_threshold + ')</span>' : ''}
        </td>
        <td class="p-3.5 text-xs font-mono text-slate-600 col-purchase-price">
          ${formatMoney(p.purchase_price)}
        </td>
        <td class="p-3.5 text-xs font-mono font-bold text-emerald-600">
          ${formatMoney(p.selling_price)}
        </td>
        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="openStockAdjustModal(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded font-medium" title="Оприходовать / Списать">
            ± Кол-во
          </button>
          <button onclick="openPartModal(${p.id})" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Редактировать">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function openStockAdjustModal(partId, partName) {
  document.getElementById('adjust-part-id').value = partId;
  document.getElementById('adjust-part-name').textContent = `Приход / расход: ${partName}`;
  document.getElementById('adjust-quantity').value = '';
  document.getElementById('adjust-comment').value = '';
  openModal('modal-stock-adjust');
}

async function saveStockAdjust(e) {
  e.preventDefault();
  const partId = parseInt(document.getElementById('adjust-part-id').value);
  const qty = parseInt(document.getElementById('adjust-quantity').value);
  const comment = document.getElementById('adjust-comment').value || 'Корректировка остатка';

  if (isNaN(qty) || qty === 0) {
    showToast('Укажите корректное количество (не ноль)', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/parts/${partId}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity_change: qty, comment: comment })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка');

    const partObj = state.parts.find(p => p.id === partId);
    if (partObj && typeof data.new_quantity === 'number') {
      partObj.quantity = data.new_quantity;
      partObj._updated_at = Date.now();
      crmStore.saveItem('parts', partObj);
    }

    showToast(data.message);
    closeModal('modal-stock-adjust');
    await loadParts();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openStockMovementsModal() {
  try {
    const res = await fetch('/api/stock/movements');
    const movements = await res.json();
    const tbody = document.getElementById('stock-movements-table-body');
    
    if (movements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Движений нет</td></tr>`;
    } else {
      tbody.innerHTML = movements.map(m => `
        <tr class="hover:bg-slate-50">
          <td class="p-2.5 font-mono text-slate-500">${m.created_at}</td>
          <td class="p-2.5 font-bold text-slate-800">${m.part_name} <span class="font-mono text-slate-400">(${m.part_sku})</span></td>
          <td class="p-2.5">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${m.type === 'incoming' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
              ${m.type === 'incoming' ? 'ПРИХОД' : 'СПИСАНИЕ'}
            </span>
          </td>
          <td class="p-2.5 font-mono font-bold">${m.quantity} шт</td>
          <td class="p-2.5 text-slate-500">${m.comment || '—'}</td>
        </tr>
      `).join('');
    }

    openModal('modal-stock-movements');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    showToast('Ошибка при загрузке журнала движений', 'error');
  }
}

// ================= 6. TASKS & PLANNER =================

async function loadTasks() {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const status = document.getElementById('tasks-status-filter')?.value || 'all';
    const res = await fetch(`/api/tasks?status=${status}`);
    state.tasks = await res.json();
    renderTasksList();
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

function renderTasksList() {
  const container = document.getElementById('tasks-list-container');
  if (!container) return;

  if (state.tasks.length === 0) {
    container.innerHTML = `<div class="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">Задач нет. Все дела выполнены!</div>`;
    return;
  }

  const now = new Date();

  container.innerHTML = state.tasks.map(t => {
    const isCompleted = t.status === 'completed';
    const dueDate = new Date(t.due_date);
    const isOverdue = !isCompleted && dueDate < now;

    let priorityBadge = '';
    if (t.priority === 'urgent') priorityBadge = '<span class="badge-urgent text-[10px] font-bold px-1.5 py-0.5 rounded">🔥 Срочно</span>';
    else if (t.priority === 'high') priorityBadge = '<span class="badge-high text-[10px] font-bold px-1.5 py-0.5 rounded">Высокий</span>';

    return `
      <div class="bg-white p-4 rounded-xl border ${isOverdue ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'} shadow-sm flex items-start justify-between gap-4 transition-all">
        <div class="flex items-start gap-3">
          <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="toggleTaskStatus(${t.id})" class="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-bold text-sm text-slate-800 ${isCompleted ? 'line-through text-slate-400' : ''}">${t.title}</span>
              ${priorityBadge}
              ${isOverdue ? '<span class="px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 text-[10px] font-mono font-bold">ПРОСРОЧЕНО</span>' : ''}
            </div>
            <div class="text-xs text-slate-500 flex flex-wrap items-center gap-3">
              <span class="flex items-center gap-1 font-mono ${isOverdue ? 'text-rose-600 font-bold' : ''}">
                <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                <span>${t.due_date}</span>
              </span>
              ${t.client_name ? `<span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i> ${t.client_name}</span>` : ''}
              ${t.deal_title ? `<span class="flex items-center gap-1"><i data-lucide="trello" class="w-3.5 h-3.5 text-blue-500"></i> ${t.deal_title}</span>` : ''}
            </div>
            ${t.notes ? `<div class="text-[11px] text-slate-400 mt-1">${t.notes}</div>` : ''}
          </div>
        </div>

        <button onclick="deleteTaskItem(${t.id})" class="text-slate-300 hover:text-rose-600 p-1 rounded" title="Удалить задачу">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function toggleTaskStatus(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error();
    loadTasks();
    loadDashboard();
  } catch (err) {
    showToast('Ошибка при изменении задачи', 'error');
  }
}

async function deleteTaskItem(taskId) {
  if (!confirm('Удалить эту задачу?')) return;
  try {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    showToast('Задача удалена');
    loadTasks();
    loadDashboard();
  } catch (err) {
    showToast('Ошибка', 'error');
  }
}

// ================= 7. USERS & ROLES MANAGEMENT =================

async function loadUsers() {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const res = await fetch('/api/users');
    let serverUsers = await res.json();
    if (Array.isArray(serverUsers)) {
      serverUsers = serverUsers.filter(u => {
        if (!u) return false;
        const un = String(u.username || '').trim().toLowerCase();
        return un && un !== 'undefined' && un !== 'null' && un.length >= 3;
      });
    }
    state.users = crmStore.mergeWithServer('users', serverUsers);
    renderUsersTable();
  } catch (err) {
    console.error('Error loading users:', err);
    state.users = crmStore.getList('users').filter(u => {
      if (!u) return false;
      const un = String(u.username || '').trim().toLowerCase();
      return un && un !== 'undefined' && un !== 'null' && un.length >= 3;
    });
    renderUsersTable();
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (state.users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 text-xs">Сотрудники не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = state.users.map(u => {
    const roleInfo = ROLE_DEFINITIONS[u.role] || { label: u.role, badge: 'bg-slate-100 text-slate-700', icon: '👤' };
    const isCurrent = state.currentUser && state.currentUser.id === u.id;

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-3.5">
          <div class="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span>${u.full_name}</span>
            ${isCurrent ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-semibold font-mono">ВЫ</span>' : ''}
          </div>
        </td>
        <td class="p-3.5 text-xs font-mono font-bold text-slate-700">
          ${u.username}
        </td>
        <td class="p-3.5 text-xs">
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleInfo.badge}">
            <span>${roleInfo.icon}</span>
            <span>${roleInfo.label}</span>
          </span>
        </td>
        <td class="p-3.5 text-xs font-mono text-slate-600">
          ${u.phone || '—'}
        </td>
        <td class="p-3.5 text-xs text-slate-400">
          ${formatDate(u.created_at)}
        </td>
        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="openUserModal(${u.id})" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Редактировать сотрудника">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          ${!isCurrent ? `
          <button onclick="deleteUser('${u.id || u.username}')" class="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded" title="Удалить сотрудника">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function openUserModal(userId = null) {
  const form = document.getElementById('form-user');
  form.reset();
  document.getElementById('user-id').value = '';
  document.getElementById('btn-delete-user').classList.add('hidden');
  document.getElementById('user-username').disabled = false;
  document.getElementById('user-pass-hint').textContent = '';
  document.getElementById('user-password').required = false;

  if (userId) {
    document.getElementById('modal-user-title').textContent = 'Редактировать сотрудника';
    document.getElementById('btn-delete-user').classList.remove('hidden');
    document.getElementById('user-username').disabled = true;
    document.getElementById('user-pass-hint').textContent = '(оставьте пустым, если не меняете)';
    document.getElementById('user-password').required = false;

    const u = state.users.find(item => item.id == userId);
    if (u) {
      document.getElementById('user-id').value = u.id;
      document.getElementById('user-fullname').value = u.full_name;
      document.getElementById('user-username').value = u.username;
      document.getElementById('user-role').value = u.role;
      document.getElementById('user-phone').value = u.phone || '';
    }
  } else {
    document.getElementById('modal-user-title').textContent = 'Добавить сотрудника';
    document.getElementById('user-password').required = true;
    document.getElementById('user-pass-hint').textContent = '(мин. 4 символа)';
  }

  openModal('modal-user');
}

async function saveUser(e) {
  e.preventDefault();
  const userId = document.getElementById('user-id').value;
  const fullName = document.getElementById('user-fullname').value.trim();
  const role = document.getElementById('user-role').value;
  const phone = document.getElementById('user-phone').value.trim();
  const password = document.getElementById('user-password').value;
  const username = document.getElementById('user-username').value.trim().toLowerCase();

  try {
    let res;
    if (userId) {
      res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          role: role,
          phone: phone,
          password: password.length > 0 ? password : null
        })
      });
      if (!res.ok) {
        res = await fetch(`/api/users/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName,
            role: role,
            phone: phone,
            password: password.length > 0 ? password : null
          })
        });
      }
    } else {
      res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          password: password,
          full_name: fullName,
          role: role,
          phone: phone
        })
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения');

    const realId = userId ? parseInt(userId) : data.id;
    crmStore.saveItem('users', {
      id: realId,
      username: username,
      full_name: fullName,
      role: role,
      phone: phone,
      password: password || undefined,
      created_at: data.created_at || new Date().toISOString(),
      _updated_at: Date.now()
    });

    showToast(data.message || 'Данные сотрудника сохранены');
    closeModal('modal-user');
    await loadUsers();
    await loadEmployeesSelectOptions();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Ошибка сохранения сотрудника', 'error');
  }
}

async function deleteUser(directId = null) {
  const userId = directId || document.getElementById('user-id').value;
  if (!userId || !confirm('Удалить этого сотрудника из системы СТО Спецмаш?')) return;

  try {
    let res = await fetch(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/users/${encodeURIComponent(userId)}/delete`, { method: 'POST' });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status >= 400 && res.status !== 404) {
      throw new Error(data.detail || data.message || 'Ошибка удаления');
    }

    crmStore.removeItem('users', userId);
    state.users = state.users.filter(u => String(u.id) !== String(userId) && u.username !== userId);
    showToast(data.message || 'Сотрудник успешно удален');
    closeModal('modal-user');
    await loadUsers();
    await loadEmployeesSelectOptions();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Ошибка удаления сотрудника', 'error');
  }
}

// ================= MODAL OPERATIONS (CRUD) =================

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

// DEAL MODAL
async function openDealModal(dealId = null, defaultStage = 'new') {
  await Promise.all([loadClientsListOptions(), loadWarehousePartsOptions(), loadEmployeesSelectOptions(), loadEquipment()]);
  
  const form = document.getElementById('form-deal');
  form.reset();
  document.getElementById('deal-id').value = '';
  document.getElementById('deal-parts-section').classList.add('hidden');
  document.getElementById('btn-delete-deal').classList.add('hidden');

  if (dealId) {
    document.getElementById('modal-deal-title').textContent = 'Редактирование наряда';
    document.getElementById('btn-delete-deal').classList.remove('hidden');
    document.getElementById('deal-parts-section').classList.remove('hidden');

    try {
      const res = await fetch(`/api/deals/${dealId}`);
      const deal = await res.json();
      document.getElementById('deal-id').value = deal.id;
      document.getElementById('deal-title').value = deal.title;
      document.getElementById('deal-client').value = deal.client_id || '';
      await handleDealClientChange(deal.client_id, deal.equipment_id);
      document.getElementById('deal-stage').value = deal.stage;
      document.getElementById('deal-amount').value = deal.amount;
      document.getElementById('deal-cost').value = deal.cost;
      document.getElementById('deal-priority').value = deal.priority;
      document.getElementById('deal-responsible').value = deal.responsible;
      document.getElementById('deal-deadline').value = deal.deadline || '';
      document.getElementById('deal-description').value = deal.description || '';

      renderDealAttachedParts(deal.parts || []);
    } catch (e) {
      showToast('Ошибка загрузки сделки', 'error');
    }
  } else {
    document.getElementById('modal-deal-title').textContent = 'Новый заказ-наряд СТО Спецмаш';
    document.getElementById('deal-stage').value = defaultStage;
    await handleDealClientChange(document.getElementById('deal-client').value);
  }

  openModal('modal-deal');
  if (window.lucide) lucide.createIcons();
}

async function loadEmployeesSelectOptions() {
  if (state.users.length === 0) await loadUsers();
  const select = document.getElementById('deal-responsible');
  if (!select) return;

  select.innerHTML = state.users.map(u => `
    <option value="${u.full_name}">${u.full_name} (${ROLE_DEFINITIONS[u.role]?.label || u.role})</option>
  `).join('');
}

async function loadClientsListOptions() {
  if (state.clients.length === 0) await loadClients();
  const select = document.getElementById('deal-client');
  const taskClientSelect = document.getElementById('task-client');
  const eqClientSelect = document.getElementById('equipment-client');

  const clientOptions = state.clients.map(c => `
    <option value="${c.id}">${c.name} (${c.company || 'Физлицо'})</option>
  `).join('');

  if (select) select.innerHTML = '<option value="">— Выберите клиента (или оставьте пустым) —</option>' + clientOptions;
  if (eqClientSelect) eqClientSelect.innerHTML = `<option value="">— Без привязки / На балансе СТО —</option>` + clientOptions;
  if (taskClientSelect) taskClientSelect.innerHTML = `<option value="">Не привязан</option>` + clientOptions;
}

async function handleDealClientChange(clientId, selectedEqId = null) {
  const eqSelect = document.getElementById('deal-equipment');
  if (!eqSelect) return;
  const defaultOption = '<option value="">(Без привязки к технике / Запчасти / Консультация)</option>';

  if (!state.equipment || state.equipment.length === 0) {
    try {
      const res = await fetch('/api/equipment');
      const data = await res.json();
      state.equipment = crmStore.mergeWithServer('equipment', data);
    } catch (e) {}
  }

  const allEq = state.equipment || [];
  const clientEq = clientId ? allEq.filter(eq => String(eq.client_id) === String(clientId)) : [];
  const otherEq = clientId ? allEq.filter(eq => String(eq.client_id) !== String(clientId)) : allEq;

  let optionsHtml = defaultOption;

  if (clientEq.length > 0) {
    optionsHtml += `<optgroup label="Техника данного заказчика">` + clientEq.map(eq => `
      <option value="${eq.id}" ${selectedEqId == eq.id ? 'selected' : ''}>${eq.name} (${eq.serial_vin || 'б/н'})</option>
    `).join('') + `</optgroup>`;
  }

  if (otherEq.length > 0) {
    optionsHtml += `<optgroup label="${clientId ? 'Остальная техника СТО' : 'Вся зарегистрированная техника СТО'}">` + otherEq.map(eq => `
      <option value="${eq.id}" ${selectedEqId == eq.id ? 'selected' : ''}>${eq.name} (${eq.serial_vin || 'б/н'}${eq.client_name ? ' • ' + eq.client_name : ''})</option>
    `).join('') + `</optgroup>`;
  }

  if (selectedEqId && !allEq.some(eq => eq.id == selectedEqId)) {
    optionsHtml += `<optgroup label="Привязанная техника">
      <option value="${selectedEqId}" selected>Техника #${selectedEqId}</option>
    </optgroup>`;
  }

  eqSelect.innerHTML = optionsHtml;
  if (selectedEqId) {
    eqSelect.value = String(selectedEqId);
  }
}

function renderDealAttachedParts(parts) {
  const container = document.getElementById('deal-attached-parts-list');
  if (!container) return;
  if (!parts || parts.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-1">Запчасти со склада еще не списывались</div>';
    return;
  }
  const dealId = document.getElementById('deal-id').value;

  container.innerHTML = parts.map(p => `
    <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 text-xs">
      <div>
        <span class="font-bold text-slate-800">${p.part_name}</span>
        <span class="font-mono text-slate-500">(${p.sku}) × ${p.quantity} шт</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-mono font-bold text-emerald-600">${formatMoney(p.selling_price * p.quantity)}</span>
        <button type="button" onclick="removeAttachedPart(${dealId}, ${p.deal_part_id})" class="text-rose-500 hover:text-rose-700 p-1" title="Вернуть на склад">
          <i data-lucide="trash" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

async function loadWarehousePartsOptions() {
  if (state.parts.length === 0) await loadParts();
  const select = document.getElementById('attach-part-select');
  if (!select) return;

  select.innerHTML = state.parts.map(p => `
    <option value="${p.id}" ${p.quantity <= 0 ? 'disabled' : ''}>
      ${p.name} [${p.sku}] — ост: ${p.quantity} шт (${formatMoney(p.selling_price)})
    </option>
  `).join('');
}

function showAttachPartRow() {
  document.getElementById('attach-part-row').classList.remove('hidden');
}
function hideAttachPartRow() {
  document.getElementById('attach-part-row').classList.add('hidden');
}

async function submitAttachPart() {
  const dealId = document.getElementById('deal-id').value;
  const partSelect = document.getElementById('attach-part-select');
  const partId = parseInt(partSelect.value);
  const qty = parseInt(document.getElementById('attach-part-qty').value) || 1;

  if (!dealId || !partId) return;

  try {
    const res = await fetch(`/api/deals/${dealId}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id: partId, quantity: qty })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка списания запчасти');

    // Update warehouse stock in state and crmStore immediately!
    const partObj = state.parts.find(p => p.id === partId);
    if (partObj) {
      partObj.quantity = typeof data.new_quantity === 'number' ? data.new_quantity : Math.max(0, partObj.quantity - qty);
      partObj._updated_at = Date.now();
      crmStore.saveItem('parts', partObj);
    }

    // Update deal cost & parts_count in state and crmStore
    const dealObj = state.deals.find(d => d.id == dealId);
    if (dealObj) {
      if (typeof data.parts_cost === 'number') dealObj.cost = data.parts_cost;
      if (typeof data.parts_count === 'number') dealObj.parts_count = data.parts_count;
      else dealObj.parts_count = (dealObj.parts_count || 0) + qty;
      dealObj._updated_at = Date.now();
      crmStore.saveItem('deals', dealObj);
    }

    showToast(data.message || 'Запчасть успешно списана');
    hideAttachPartRow();
    await openDealModal(dealId);
    renderPartsTable();
    renderDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Ошибка при списании запчасти', 'error');
  }
}

async function removeAttachedPart(dealId, dealPartId) {
  try {
    let res = await fetch(`/api/deals/${dealId}/parts/${dealPartId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/deals/${dealId}/parts/${dealPartId}/delete`, { method: 'POST' });
    }
    const data = await res.json().catch(() => ({}));

    if (data.part_id && typeof data.new_quantity === 'number') {
      const partObj = state.parts.find(p => p.id === data.part_id);
      if (partObj) {
        partObj.quantity = data.new_quantity;
        partObj._updated_at = Date.now();
        crmStore.saveItem('parts', partObj);
      }
    }

    // Update deal cost & parts_count in state and crmStore
    const dealObj = state.deals.find(d => d.id == dealId);
    if (dealObj) {
      if (typeof data.parts_cost === 'number') dealObj.cost = data.parts_cost;
      if (typeof data.parts_count === 'number') dealObj.parts_count = data.parts_count;
      dealObj._updated_at = Date.now();
      crmStore.saveItem('deals', dealObj);
    }

    showToast('Запчасть возвращена на склад');
    await openDealModal(dealId);
    renderPartsTable();
    renderDeals();
    loadDashboard();
  } catch (err) {
    showToast('Ошибка при возврате запчасти', 'error');
  }
}

async function saveDeal(e) {
  e.preventDefault();
  const dealId = document.getElementById('deal-id').value;
  const eqSelect = document.getElementById('deal-equipment');
  const eqId = parseInt(eqSelect.value) || null;
  const clientId = parseInt(document.getElementById('deal-client').value) || null;

  const payload = {
    title: document.getElementById('deal-title').value.trim(),
    client_id: clientId,
    equipment_id: eqId,
    stage: document.getElementById('deal-stage').value,
    amount: parseFloat(document.getElementById('deal-amount').value) || 0.0,
    cost: parseFloat(document.getElementById('deal-cost').value) || 0.0,
    priority: document.getElementById('deal-priority').value,
    responsible: document.getElementById('deal-responsible').value,
    deadline: document.getElementById('deal-deadline').value || null,
    description: document.getElementById('deal-description').value.trim(),
  };

  try {
    let res;
    if (dealId) {
      res = await fetch(`/api/deals/${dealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch(`/api/deals/${dealId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } else {
      res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения наряда');

    const savedId = dealId ? parseInt(dealId) : data.id;
    const clientObj = state.clients.find(c => c.id === payload.client_id);
    const eqObj = state.equipment.find(eq => eq.id === payload.equipment_id);
    const selectedOptionText = eqSelect.selectedOptions[0] ? eqSelect.selectedOptions[0].text : '';
    const eqName = data.equipment_name || (eqObj ? eqObj.name : (selectedOptionText.includes('(') ? selectedOptionText.split(' (')[0].trim() : ''));
    const eqVin = data.equipment_vin || (eqObj ? eqObj.serial_vin : '');

    crmStore.saveItem('deals', {
      ...payload,
      id: savedId,
      client_name: data.client_name || (clientObj ? clientObj.name : ''),
      client_company: data.client_company || (clientObj ? clientObj.company : ''),
      client_phone: data.client_phone || (clientObj ? clientObj.phone : ''),
      equipment_name: eqName,
      equipment_vin: eqVin,
      _updated_at: Date.now()
    });

    showToast(dealId ? 'Сделка обновлена' : 'Сделка создана');
    closeModal('modal-deal');
    await loadDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteDeal() {
  const dealId = document.getElementById('deal-id').value;
  if (!dealId || !confirm('Удалить эту сделку?')) return;
  try {
    let res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/deals/${dealId}/delete`, { method: 'POST' });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка удаления');

    crmStore.removeItem('deals', parseInt(dealId));
    showToast('Сделка удалена');
    closeModal('modal-deal');
    await loadDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// CLIENT MODAL
function openClientModal(clientId = null) {
  const form = document.getElementById('form-client');
  form.reset();
  document.getElementById('client-id').value = '';
  document.getElementById('btn-delete-client').classList.add('hidden');

  if (clientId) {
    document.getElementById('modal-client-title').textContent = 'Редактировать клиента';
    document.getElementById('btn-delete-client').classList.remove('hidden');
    const client = state.clients.find(c => c.id == clientId);
    if (client) {
      document.getElementById('client-id').value = client.id;
      document.getElementById('client-name').value = client.name;
      document.getElementById('client-company').value = client.company || '';
      document.getElementById('client-phone').value = client.phone;
      document.getElementById('client-email').value = client.email || '';
      document.getElementById('client-address').value = client.address || '';
      document.getElementById('client-notes').value = client.notes || '';
    }
  } else {
    document.getElementById('modal-client-title').textContent = 'Новый клиент';
  }

  openModal('modal-client');
}

async function saveClient(e) {
  e.preventDefault();
  const clientId = document.getElementById('client-id').value;
  const payload = {
    name: document.getElementById('client-name').value.trim(),
    company: document.getElementById('client-company').value.trim(),
    phone: document.getElementById('client-phone').value.trim(),
    email: document.getElementById('client-email').value.trim(),
    address: document.getElementById('client-address').value.trim(),
    notes: document.getElementById('client-notes').value.trim(),
  };

  try {
    let res;
    if (clientId) {
      res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch(`/api/clients/${clientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } else {
      res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения клиента');

    const savedId = clientId ? parseInt(clientId) : data.id;
    crmStore.saveItem('clients', {
      ...payload,
      id: savedId,
      equipment_count: 0,
      deals_count: 0,
      total_revenue: 0
    });

    showToast(clientId ? 'Клиент обновлен' : 'Клиент добавлен');
    closeModal('modal-client');
    await loadClients();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteClient() {
  const clientId = document.getElementById('client-id').value;
  if (!clientId || !confirm('Удалить клиента? Вся техника и сделки сохранятся без привязки.')) return;
  try {
    let res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/clients/${clientId}/delete`, { method: 'POST' });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка удаления');

    crmStore.removeItem('clients', parseInt(clientId));
    showToast('Клиент удален');
    closeModal('modal-client');
    await loadClients();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// EQUIPMENT MODAL
async function openEquipmentModal(eqId = null) {
  await loadClientsListOptions();
  const form = document.getElementById('form-equipment');
  form.reset();
  document.getElementById('equipment-id').value = '';
  document.getElementById('btn-delete-equipment').classList.add('hidden');

  if (eqId) {
    document.getElementById('modal-equipment-title').textContent = 'Редактировать технику';
    document.getElementById('btn-delete-equipment').classList.remove('hidden');
    const eq = state.equipment.find(e => e.id == eqId);
    if (eq) {
      document.getElementById('equipment-id').value = eq.id;
      document.getElementById('equipment-client').value = eq.client_id || '';
      document.getElementById('equipment-name').value = eq.name;
      document.getElementById('equipment-category').value = eq.category;
      document.getElementById('equipment-status').value = eq.status;
      document.getElementById('equipment-vin').value = eq.serial_vin || '';
      document.getElementById('equipment-year').value = eq.year || '';
      document.getElementById('equipment-hours').value = eq.operating_hours || '';
      document.getElementById('equipment-notes').value = eq.notes || '';
    }
  } else {
    document.getElementById('modal-equipment-title').textContent = 'Регистрация техники';
  }

  openModal('modal-equipment');
}

async function saveEquipment(e) {
  e.preventDefault();
  const eqId = document.getElementById('equipment-id').value;
  const payload = {
    client_id: parseInt(document.getElementById('equipment-client').value) || null,
    name: document.getElementById('equipment-name').value.trim(),
    category: document.getElementById('equipment-category').value,
    status: document.getElementById('equipment-status').value,
    serial_vin: document.getElementById('equipment-vin').value.trim(),
    year: parseInt(document.getElementById('equipment-year').value) || null,
    operating_hours: document.getElementById('equipment-hours').value.trim(),
    notes: document.getElementById('equipment-notes').value.trim(),
  };

  try {
    let res;
    if (eqId) {
      res = await fetch(`/api/equipment/${eqId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch(`/api/equipment/${eqId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } else {
      res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения техники');

    const savedId = eqId ? parseInt(eqId) : data.id;
    const clientObj = state.clients.find(c => c.id === payload.client_id);
    crmStore.saveItem('equipment', {
      ...payload,
      id: savedId,
      client_name: clientObj ? clientObj.name : 'Не привязан',
      client_company: clientObj ? clientObj.company : '',
      client_phone: clientObj ? clientObj.phone : ''
    });

    showToast(eqId ? 'Техника обновлена' : 'Техника зарегистрирована');
    closeModal('modal-equipment');
    await loadEquipment();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteEquipment() {
  const eqId = document.getElementById('equipment-id').value;
  if (!eqId || !confirm('Удалить единицу техники?')) return;
  try {
    let res = await fetch(`/api/equipment/${eqId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/equipment/${eqId}/delete`, { method: 'POST' });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка удаления');

    crmStore.removeItem('equipment', parseInt(eqId));
    showToast(data.message || 'Техника удалена');
    closeModal('modal-equipment');
    await loadEquipment();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// PART MODAL
function openPartModal(partId = null) {
  const form = document.getElementById('form-part');
  form.reset();
  document.getElementById('part-id').value = '';
  document.getElementById('btn-delete-part').classList.add('hidden');

  if (partId) {
    document.getElementById('modal-part-title').textContent = 'Редактировать запчасть';
    document.getElementById('btn-delete-part').classList.remove('hidden');
    const p = state.parts.find(item => item.id === partId);
    if (p) {
      document.getElementById('part-id').value = p.id;
      document.getElementById('part-sku').value = p.sku;
      document.getElementById('part-category').value = p.category;
      document.getElementById('part-name').value = p.name;
      document.getElementById('part-quantity').value = p.quantity;
      document.getElementById('part-min-threshold').value = p.min_threshold;
      document.getElementById('part-location').value = p.location || '';
      document.getElementById('part-purchase-price').value = p.purchase_price;
      document.getElementById('part-selling-price').value = p.selling_price;
    }
  } else {
    document.getElementById('modal-part-title').textContent = 'Новая запчасть / материал';
  }

  openModal('modal-part');
}

async function savePart(e) {
  e.preventDefault();
  const partId = document.getElementById('part-id').value;
  const payload = {
    sku: document.getElementById('part-sku').value.trim(),
    category: document.getElementById('part-category').value.trim(),
    name: document.getElementById('part-name').value.trim(),
    quantity: parseInt(document.getElementById('part-quantity').value) || 0,
    min_threshold: parseInt(document.getElementById('part-min-threshold').value) || 2,
    location: document.getElementById('part-location').value.trim(),
    purchase_price: parseFloat(document.getElementById('part-purchase-price').value) || 0.0,
    selling_price: parseFloat(document.getElementById('part-selling-price').value) || 0.0,
  };

  try {
    let res;
    if (partId) {
      res = await fetch(`/api/parts/${partId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch(`/api/parts/${partId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } else {
      res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения запчасти');

    const savedId = partId ? parseInt(partId) : (data.id || Date.now());
    crmStore.saveItem('parts', {
      ...payload,
      id: savedId
    });

    showToast(partId ? 'Запчасть обновлена' : 'Запчасть добавлена на склад');
    closeModal('modal-part');
    await loadParts();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePart() {
  const partId = document.getElementById('part-id').value;
  if (!partId || !confirm('Удалить эту позицию со склада?')) return;
  try {
    let res = await fetch(`/api/parts/${partId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/parts/${partId}/delete`, { method: 'POST' });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка удаления');

    crmStore.removeItem('parts', parseInt(partId));
    showToast('Позиция удалена со склада');
    closeModal('modal-part');
    await loadParts();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// TASK MODAL
async function openTaskModal() {
  await loadClientsListOptions();
  const form = document.getElementById('form-task');
  form.reset();
  
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  tom.setHours(10, 0, 0, 0);
  document.getElementById('task-due').value = tom.toISOString().slice(0, 16);

  openModal('modal-task');
}

async function saveTask(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById('task-title').value,
    due_date: document.getElementById('task-due').value.replace('T', ' '),
    priority: document.getElementById('task-priority').value,
    client_id: parseInt(document.getElementById('task-client').value) || null,
    deal_id: parseInt(document.getElementById('task-deal').value) || null,
    notes: document.getElementById('task-notes').value,
    remind: 1,
    status: 'pending'
  };

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка создания задачи');

    const savedId = data.id || Date.now();
    crmStore.saveItem('tasks', {
      ...payload,
      id: savedId
    });

    showToast('Задача создана');
    closeModal('modal-task');
    await loadTasks();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ================= IMPORT & EXPORT =================

async function handleImport(type) {
  const fileInput = document.getElementById(`import-${type}-file`);
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('Выберите файл CSV для загрузки', 'error');
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/api/import/${type}`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка импорта');

    showToast(data.message, 'success');
    fileInput.value = '';
    loadDashboard();
    if (type === 'clients') loadClients();
    if (type === 'parts') loadParts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function exportJsonBackup() {
  try {
    showToast('Подготовка резервной копии базы данных...', 'info');
    const res = await fetch('/api/backup/json');
    if (!res.ok) throw new Error('Ошибка создания резервной копии');
    const data = await res.json();

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `specmash_crm_backup_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Резервная копия базы данных успешно выгружена (JSON)');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRestoreJsonFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!confirm(`Вы действительно хотите восстановить базу данных из файла "${file.name}"? Записи будут синхронизированы и обновлены.`)) {
    event.target.value = '';
    return;
  }

  try {
    showToast('Восстановление базы данных...', 'info');
    const text = await file.text();
    const json = JSON.parse(text);

    const res = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка восстановления');

    // Update local store
    if (json.users) json.users.forEach(u => crmStore.saveItem('users', u));
    if (json.clients) json.clients.forEach(c => crmStore.saveItem('clients', c));
    if (json.equipment) json.equipment.forEach(e => crmStore.saveItem('equipment', e));
    if (json.deals) json.deals.forEach(d => crmStore.saveItem('deals', d));
    if (json.parts) json.parts.forEach(p => crmStore.saveItem('parts', p));

    showToast(data.message || 'База успешно восстановлена!', 'success');
    event.target.value = '';

    await Promise.all([
      loadSettings(),
      loadDashboard(),
      loadDeals(),
      loadClients(),
      loadEquipment(),
      loadParts(),
      loadTasks(),
      loadUsers()
    ]);
  } catch (err) {
    showToast('Ошибка при чтении файла: ' + err.message, 'error');
    event.target.value = '';
  }
}

async function handleResetDemo() {
  if (!confirm('Вы уверены? Это сбросит базу данных к демонстрационному набору техники CASE, клиентов, склада и сотрудников СТО Спецмаш.')) return;
  try {
    const res = await fetch('/api/reset-demo', { method: 'POST' });
    const data = await res.json();

    // Clear local storage cache for CRM entities
    ['users', 'clients', 'equipment', 'deals', 'parts'].forEach(k => {
      localStorage.removeItem(crmStore.KEY_PREFIX + k);
    });

    showToast(data.message, 'success');
    await Promise.all([
      loadSettings(),
      loadDashboard(),
      loadDeals(),
      loadClients(),
      loadEquipment(),
      loadParts(),
      loadTasks(),
      loadUsers()
    ]);
  } catch (err) {
    showToast('Ошибка при сбросе базы', 'error');
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
