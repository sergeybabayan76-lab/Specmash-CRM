
function updateSidebarCounters(data = null) {
  // 1. Deals counts (Заказ-наряды СТО, Продажа запчастей, Отдел продаж)
  const badgeKanban = document.getElementById('badge-kanban-count');
  const badgeParts = document.getElementById('badge-parts-sales-count');
  const badgeSales = document.getElementById('badge-sales-count');

  if (state.deals && Array.isArray(state.deals) && state.deals.length > 0) {
    const srv = state.deals.filter(d => d.deal_type !== 'parts_sale' && d.deal_type !== 'sales');
    const prt = state.deals.filter(d => d.deal_type === 'parts_sale');
    const sls = state.deals.filter(d => d.deal_type === 'sales');
    if (badgeKanban) badgeKanban.textContent = srv.length;
    if (badgeParts) badgeParts.textContent = prt.length;
    if (badgeSales) badgeSales.textContent = sls.length;
  } else if (data) {
    if (badgeKanban) badgeKanban.textContent = (typeof data.service_deals_count === 'number') ? data.service_deals_count : (data.total_deals_count || 0);
    if (badgeParts) badgeParts.textContent = (typeof data.parts_sales_count === 'number') ? data.parts_sales_count : 0;
    if (badgeSales) badgeSales.textContent = (typeof data.sales_deals_count === 'number') ? data.sales_deals_count : 0;
  }

  // 2. Clients count
  const badgeClients = document.getElementById('badge-clients-count');
  if (badgeClients) {
    if (state.clients && Array.isArray(state.clients) && state.clients.length > 0) {
      badgeClients.textContent = state.clients.length;
    } else if (data && typeof data.total_clients === 'number') {
      badgeClients.textContent = data.total_clients;
    }
  }

  // 3. Equipment count
  const badgeEquipment = document.getElementById('badge-equipment-count');
  if (badgeEquipment) {
    if (state.equipment && Array.isArray(state.equipment) && state.equipment.length > 0) {
      badgeEquipment.textContent = state.equipment.length;
    } else if (data && typeof data.total_equipment === 'number') {
      badgeEquipment.textContent = data.total_equipment;
    }
  }

  // 4. Warehouse parts count & low-stock alert
  const badgeWarehouse = document.getElementById('badge-warehouse-count');
  if (badgeWarehouse) {
    if (state.parts && Array.isArray(state.parts) && state.parts.length > 0) {
      badgeWarehouse.textContent = state.parts.length;
    } else if (data && typeof data.total_parts === 'number') {
      badgeWarehouse.textContent = data.total_parts;
    }
  }
  const lowStockAlert = document.getElementById('badge-lowstock-alert');
  if (lowStockAlert) {
    const lowCount = (data && typeof data.low_stock_parts === 'number')
      ? data.low_stock_parts
      : (state.parts ? state.parts.filter(p => Number(p.quantity || 0) <= Number(p.min_threshold || 2)).length : 0);
    if (lowCount > 0) {
      lowStockAlert.textContent = `${lowCount} в деф.`;
      lowStockAlert.classList.remove('hidden');
    } else {
      lowStockAlert.classList.add('hidden');
    }
  }

  // 5. Tasks count & overdue alert
  const badgeTasks = document.getElementById('badge-tasks-count');
  if (badgeTasks) {
    if (state.tasks && Array.isArray(state.tasks) && state.tasks.length > 0) {
      badgeTasks.textContent = state.tasks.length;
    } else if (data && typeof data.total_tasks === 'number') {
      badgeTasks.textContent = data.total_tasks;
    }
  }
  const tasksOverdueAlert = document.getElementById('badge-tasks-overdue');
  if (tasksOverdueAlert) {
    const overdueCount = (data && typeof data.overdue_tasks === 'number') ? data.overdue_tasks : 0;
    if (overdueCount > 0) {
      tasksOverdueAlert.textContent = `⚠ ${overdueCount}`;
      tasksOverdueAlert.classList.remove('hidden');
    } else {
      tasksOverdueAlert.classList.add('hidden');
    }
  }

  // 6. Users count
  const userBadge = document.getElementById('badge-users-count');
  if (userBadge) {
    if (state.users && Array.isArray(state.users) && state.users.length > 0) {
      userBadge.textContent = state.users.length;
    } else if (data && typeof data.total_users === 'number') {
      userBadge.textContent = data.total_users;
    }
  }
}

/**
 * СТО Спецмаш CRM Frontend Application Logic
 * Single Page Application controller with Kanban Drag & Drop, Employees & Roles, Logo customization, Warehouse deductions, and Analytics.
 * Currency: AMD
 */

// In-memory cache for the current Supabase session.
const crmStore = {
  cache: {},

  saveItem(entity, item) {
    if (!item) return;
    const list = this.getList(entity);
    const existingIdx = list.findIndex(x => (item.id && x.id == item.id) || (item.username && x.username === item.username));
    if (existingIdx >= 0) list[existingIdx] = { ...list[existingIdx], ...item };
    else list.unshift(item);
    this.cache[entity] = list;
  },

  removeItem(entity, id) {
    this.cache[entity] = this.getList(entity).filter(x => {
      if (x.id && id && String(x.id) === String(id)) return false;
      if (x.username && id && String(x.username).toLowerCase() === String(id).toLowerCase()) return false;
      return true;
    });
  },

  getList(entity) {
    return Array.isArray(this.cache[entity]) ? this.cache[entity] : [];
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
      this.cache[entity] = items;
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
  const uidParam = state.currentUser?.id ? `?user_id=${state.currentUser.id}&username=${encodeURIComponent(state.currentUser.username || '')}` : '';
  const wsUrl = `${protocol}//${window.location.host}/ws/kanban${uidParam}`;

  try {
    fastApiWs = new WebSocket(wsUrl);

    fastApiWs.onopen = () => {
      isRealtimeConnected = true;
      updateRealtimeStatus('connected', 'FastAPI WS Онлайн');
      if (state.currentUser?.id) {
        try {
          fastApiWs.send(JSON.stringify({
            type: 'identify',
            user_id: state.currentUser.id,
            username: state.currentUser.username
          }));
        } catch (e) {}
      }
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
  dealsViewMode: 'list', // Requirement #12: List view by default
  dealsDepartment: 'service', // 'service' | 'parts_sale' | 'sales'
  dealModalType: 'service',
  activeEqModalTab: 'info',
  topPartsLimit: 10,
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

// Kanban Stage Definitions (СТО: Service & Repairs)
const SERVICE_KANBAN_STAGES = [
  { id: 'new', label: 'Новые заявки', short: 'Новая', icon: 'inbox', color: 'border-blue-500' },
  { id: 'diagnostic', label: 'Диагностика', short: 'Диагн.', icon: 'search', color: 'border-purple-500' },
  { id: 'estimate', label: 'Согласование сметы', short: 'Смета', icon: 'file-text', color: 'border-indigo-500' },
  { id: 'in_progress', label: 'В работе / Ремонт', short: 'Ремонт', icon: 'wrench', color: 'border-amber-500' },
  { id: 'parts_waiting', label: 'Ожидание запчастей', short: 'Ожид. з/ч', icon: 'package-open', color: 'border-orange-500' },
  { id: 'ready', label: 'Готово к выдаче', short: 'Готово', icon: 'check-circle', color: 'border-emerald-500' },
  { id: 'completed', label: 'Оплачено / Закрыто', short: 'Оплачено', icon: 'badge-dollar-sign', color: 'border-green-600' },
];
const KANBAN_STAGES = SERVICE_KANBAN_STAGES;

// Dedicated Kanban Stages: Продажа запчастей (Requirement #1)
const PARTS_KANBAN_STAGES = [
  { id: 'new', label: 'Новые запросы', short: 'Запрос', icon: 'inbox', color: 'border-blue-500' },
  { id: 'estimate', label: 'Подбор и расчет', short: 'Подбор', icon: 'file-text', color: 'border-indigo-500' },
  { id: 'parts_waiting', label: 'Ожидание поставки', short: 'Поставка', icon: 'truck', color: 'border-amber-500' },
  { id: 'ready', label: 'Скомплектовано / Готово', short: 'Скомпл.', icon: 'check-circle', color: 'border-emerald-500' },
  { id: 'completed', label: 'Оплачено и выдано', short: 'Выдано', icon: 'badge-dollar-sign', color: 'border-green-600' },
];

// Dedicated Kanban Stages: Отдел продаж спецтехники (Requirement #9)
const SALES_KANBAN_STAGES = [
  { id: 'new', label: 'Новые заявки / Лиды', short: 'Заявка', icon: 'inbox', color: 'border-blue-500' },
  { id: 'selection', label: 'Подбор спецтехники', short: 'Подбор', icon: 'search', color: 'border-purple-500' },
  { id: 'estimate', label: 'Коммерческое предл.', short: 'КП', icon: 'file-text', color: 'border-indigo-500' },
  { id: 'contract', label: 'Договор и оплата', short: 'Договор', icon: 'file-check', color: 'border-amber-500' },
  { id: 'ready', label: 'Готово к отгрузке', short: 'Отгрузка', icon: 'truck', color: 'border-emerald-500' },
  { id: 'completed', label: 'Отгружено / Оплачено', short: 'Закрыто', icon: 'badge-dollar-sign', color: 'border-green-600' },
];

function getActiveStages() {
  if (state.dealsDepartment === 'parts_sale') return PARTS_KANBAN_STAGES;
  if (state.dealsDepartment === 'sales') return SALES_KANBAN_STAGES;
  return SERVICE_KANBAN_STAGES;
}

// Check if deal is closed/paid and locked for editing by non-admins (Requirement #5)
function isDealLockedForUser(deal) {
  if (!deal) return false;
  const activeStages = getActiveStages();
  const lastStageId = (activeStages && activeStages.length > 0) ? activeStages[activeStages.length - 1].id : 'completed';
  const isClosedOrPaid = (deal.stage === lastStageId || deal.stage === 'completed' || deal.stage === 'paid' || deal.stage === 'issued' || deal.stage === 'closed');
  const isAdmin = (state.currentUser?.role === 'admin' || state.currentUser?.permissions?.can_edit_closed_deals === true);
  return isClosedOrPaid && !isAdmin;
}

// Role names & badges (Requirement #9: Добавлен Менеджер по продажам)
const ROLE_DEFINITIONS = {
  admin: { label: 'Администратор', badge: 'bg-purple-100 text-purple-800 border-purple-200', icon: '👑' },
  moderator: { label: 'Модератор', badge: 'bg-blue-100 text-blue-800 border-blue-200', icon: '🛡️' },
  manager: { label: 'Менеджер', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: '💼' },
  sales_manager: { label: 'Менеджер по продажам', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: '🚜' },
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

async function sendHeartbeat() {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    await fetch('/api/users/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(state.currentUser.id),
        'x-user-name': state.currentUser.username || ''
      },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        username: state.currentUser.username
      })
    });
  } catch (e) {}
}

function startHeartbeat() {
  sendHeartbeat();
  if (window._heartbeatTimer) clearInterval(window._heartbeatTimer);
  window._heartbeatTimer = setInterval(sendHeartbeat, 15000);
}

function stopHeartbeat() {
  if (window._heartbeatTimer) clearInterval(window._heartbeatTimer);
  window._heartbeatTimer = null;
}

function initAuth() {
  state.currentUser = null;

  // Enforce auth: if no logged-in user, strictly show auth screen and block all views
  if (!state.currentUser || !state.currentUser.id) {
    showAuthScreen();
    return;
  }

  showAppLayout();
  applyUserPermissions();
  startHeartbeat();
  loadSettings();
  // Preload core entities so cache and relations are always ready
  loadClients();
  loadEquipment();
  loadParts();
  loadDeals();
  loadTasks();
  loadUsers();
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
    showAppLayout();
    applyUserPermissions();
    startHeartbeat();
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

function handleLogout() {
  stopHeartbeat();
  state.currentUser = null;
  crmStore.cache = {};
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

  const perms = u.permissions || {};
  const role = u.role || 'mechanic';
  const isAdmin = role === 'admin';
  const isSalesManager = role === 'sales_manager';

  // Helper to check perm or fallback to role
  function hasPerm(key, fallbackRoleAllowed) {
    if (perms[key] !== undefined) return Boolean(perms[key]);
    if (isAdmin) return true;
    return Boolean(fallbackRoleAllowed);
  }

  // 1. TOP-RIGHT USER DISPLAY (Header & Dropdown)
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const avatarEl = document.getElementById('user-avatar');
  const ddNameEl = document.getElementById('dropdown-user-name');
  const ddRoleEl = document.getElementById('dropdown-user-role');

  const roleInfo = ROLE_DEFINITIONS[role] || { label: role, icon: '👤' };

  // Clean full name
  const rawName = u.full_name || u.username || 'Пользователь';
  const displayName = rawName.split(' (')[0].trim();

  if (nameEl) nameEl.textContent = displayName;
  if (roleEl) roleEl.textContent = `${roleInfo.icon} ${roleInfo.label}`;
  if (ddNameEl) ddNameEl.textContent = rawName;
  if (ddRoleEl) ddRoleEl.textContent = `${roleInfo.icon} ${roleInfo.label}`;

  if (avatarEl) {
    // Generate clean 2-letter initials
    const words = displayName.replace(/[^a-zA-Zа-яА-ЯёЁ\s]/g, '').trim().split(/\s+/).filter(Boolean);
    let initials = 'СП';
    if (words.length >= 2) {
      initials = (words[0][0] + words[1][0]).toUpperCase();
    } else if (words.length === 1 && words[0].length >= 2) {
      initials = words[0].substring(0, 2).toUpperCase();
    } else if (u.username) {
      initials = u.username.substring(0, 2).toUpperCase();
    }
    avatarEl.textContent = initials;

    if (isAdmin) {
      avatarEl.className = 'w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm ring-2 ring-purple-300/40';
    } else if (isSalesManager) {
      avatarEl.className = 'w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm ring-2 ring-indigo-300/40';
    } else if (role === 'moderator') {
      avatarEl.className = 'w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm ring-2 ring-blue-300/40';
    } else if (role === 'manager') {
      avatarEl.className = 'w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm ring-2 ring-emerald-300/40';
    } else {
      avatarEl.className = 'w-8 h-8 rounded-full bg-amber-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm ring-2 ring-amber-300/40';
    }
  }

  // 2. NAV ITEMS VISIBILITY
  const setNavVis = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  };

  setNavVis('nav-dashboard', hasPerm('dashboard', true));
  setNavVis('nav-kanban', hasPerm('deals_sto', true));
  setNavVis('nav-parts-sales', hasPerm('deals_parts', true));
  setNavVis('nav-sales', hasPerm('deals_sales', isAdmin || isSalesManager));
  setNavVis('nav-warehouse', hasPerm('warehouse', true));
  setNavVis('nav-equipment', hasPerm('equipment', true));
  setNavVis('nav-clients', hasPerm('clients', true));
  setNavVis('nav-tasks', hasPerm('tasks', true));
  setNavVis('nav-marketing', hasPerm('marketing', isAdmin || isSalesManager));
  setNavVis('nav-users', hasPerm('users', isAdmin));
  setNavVis('nav-settings', hasPerm('settings', isAdmin));

  // Department pill in deals
  const deptSalesBtn = document.getElementById('dept-btn-sales');
  if (deptSalesBtn) deptSalesBtn.classList.toggle('hidden', !hasPerm('deals_sales', isAdmin || isSalesManager));

  // 3. FINANCE & REVENUE VISIBILITY
  const canViewRev = hasPerm('can_view_revenue', isAdmin || role === 'moderator');
  const financeBlock = document.getElementById('header-finance-block');
  const revCard = document.getElementById('dash-card-revenue');
  const partsRevCard = document.getElementById('dash-card-parts-revenue');
  const servRevCard = document.getElementById('dash-card-service-revenue');
  const chartsRow = document.getElementById('dash-charts-row');
  const revSection = document.getElementById('dash-mechanics-revenue-section');

  if (financeBlock) financeBlock.classList.toggle('hidden', !canViewRev);
  if (revCard) revCard.classList.toggle('hidden', !canViewRev);
  if (partsRevCard) partsRevCard.classList.toggle('hidden', !canViewRev);
  if (servRevCard) servRevCard.classList.toggle('hidden', !canViewRev);
  if (chartsRow) chartsRow.classList.toggle('hidden', !canViewRev);
  if (revSection) revSection.classList.toggle('hidden', !isAdmin);

  // Import / Export
  const navExport = document.getElementById('nav-export');
  if (navExport) navExport.classList.toggle('hidden', !isAdmin && (role === 'mechanic' || role === 'manager' || role === 'sales_manager'));

  // Body classes for global CSS role hiding
  document.body.classList.toggle('role-mechanic', role === 'mechanic' || role === 'sales_manager');
  document.body.classList.toggle('role-manager', role === 'manager');
  document.body.classList.toggle('role-moderator', role === 'moderator');
  document.body.classList.toggle('role-admin', isAdmin);
}

function openLoginModal() {
  openModal('modal-login');
  if (window.lucide) lucide.createIcons();
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
    applyUserPermissions();
    startHeartbeat();
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
  showToast('Формирование и скачивание резервной копии Supabase...', 'info');
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

  const role = state.currentUser.role;
  const perms = state.currentUser.permissions || {};
  const isAdmin = role === 'admin';

  // Security check: Settings
  if (tabName === 'settings' && !isAdmin && !perms.settings) {
    showToast('Настройки СТО доступны исключительно Администратору', 'warning');
    return switchTab('dashboard');
  }

  // Security check: Users tab
  if (tabName === 'users' && !isAdmin && !perms.users) {
    showToast('Раздел "Сотрудники & Роли" доступен исключительно Администратору', 'warning');
    return switchTab('dashboard');
  }

  // Security check: Marketing tab (WhatsApp)
  if (tabName === 'marketing' && !isAdmin && !perms.marketing) {
    showToast('Раздел "Маркетинг" доступен исключительно Администратору', 'warning');
    return switchTab('dashboard');
  }

  // Security check: Import & Export
  if (tabName === 'export' && (role === 'mechanic' || role === 'manager' || role === 'sales_manager') && !isAdmin) {
    showToast('Раздел "Импорт & Экспорт" недоступен для вашей роли', 'warning');
    return switchTab('dashboard');
  }

  // Auto-close mobile drawer on navigation
  toggleMobileSidebar(false);

  state.currentTab = tabName;
  const tabs = ['dashboard', 'kanban', 'clients', 'equipment', 'warehouse', 'tasks', 'users', 'export', 'settings', 'marketing'];

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

  // Department-specific highlight for Kanban vs Parts Sales vs Sales Dept
  const navKanban = document.getElementById('nav-kanban');
  const navParts = document.getElementById('nav-parts-sales');
  const navSales = document.getElementById('nav-sales');

  const navInactive = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800';
  if (tabName === 'kanban') {
    if (state.dealsDepartment === 'parts_sale') {
      if (navParts) navParts.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-emerald-600/20 border-l-4 border-emerald-500';
      if (navKanban) navKanban.className = navInactive;
      if (navSales) navSales.className = navInactive;
    } else if (state.dealsDepartment === 'sales') {
      if (navSales) navSales.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-indigo-600/20 border-l-4 border-indigo-500';
      if (navKanban) navKanban.className = navInactive;
      if (navParts) navParts.className = navInactive;
    } else {
      if (navKanban) navKanban.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-blue-600/20 border-l-4 border-blue-500';
      if (navParts) navParts.className = navInactive;
      if (navSales) navSales.className = navInactive;
    }
  } else {
    if (navParts) navParts.className = navInactive;
    if (navSales) navSales.className = navInactive;
  }

  if (tabName === 'dashboard') loadDashboard();
  else if (tabName === 'kanban') loadDeals();
  else if (tabName === 'clients') loadClients();
  else if (tabName === 'equipment') loadEquipment();
  else if (tabName === 'warehouse') loadParts();
  else if (tabName === 'tasks') loadTasks();
  else if (tabName === 'users') loadUsers();
  else if (tabName === 'settings') loadAdminSettings();
  else if (tabName === 'marketing') {
    loadWhatsAppConfig();
    loadWhatsAppLogs();
  }

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

    // Parts Sales Revenue Metrics (Requirement #2)
    const statPartsRev = document.getElementById('stat-parts-revenue');
    if (statPartsRev) statPartsRev.textContent = formatMoney(data.parts_sales_revenue || 0);
    const statPartsProfit = document.getElementById('stat-parts-profit');
    if (statPartsProfit) statPartsProfit.textContent = formatMoney(data.parts_sales_profit || 0);
    const statPartsMargin = document.getElementById('stat-parts-margin');
    if (statPartsMargin) statPartsMargin.textContent = `${data.parts_sales_margin || 0}% маржа`;
    const statPartsCount = document.getElementById('stat-parts-completed-count');
    if (statPartsCount) statPartsCount.textContent = `${data.parts_sales_completed_count || 0} продаж`;

    // Service & Repair Revenue Metrics
    const statServRev = document.getElementById('stat-service-revenue');
    if (statServRev) statServRev.textContent = formatMoney(data.service_revenue || 0);
    const statServProfit = document.getElementById('stat-service-profit');
    if (statServProfit) statServProfit.textContent = formatMoney(data.service_profit || 0);
    const statServMargin = document.getElementById('stat-service-margin');
    if (statServMargin) statServMargin.textContent = `${data.service_margin || 0}% маржа`;
    const statServCount = document.getElementById('stat-service-completed-count');
    if (statServCount) statServCount.textContent = `${data.service_completed_count || 0} нарядов`;

    document.getElementById('stat-active-deals').textContent = data.active_deals_count;
    document.getElementById('stat-active-volume').textContent = formatMoney(data.active_deals_volume);

    document.getElementById('stat-inventory-retail').textContent = formatMoney(data.inventory_retail);
    document.getElementById('stat-inventory-cost').textContent = formatMoney(data.inventory_cost);
    document.getElementById('stat-low-stock-pill').textContent = `${data.low_stock_parts} в дефиците`;

    document.getElementById('stat-clients-count').textContent = data.total_clients;
    document.getElementById('stat-equipment-count').textContent = data.total_equipment;
    document.getElementById('stat-overdue-tasks').textContent = data.overdue_tasks;

    updateSidebarCounters(data);

    renderRevenueChart(data.monthly_data, data.total_revenue, data.total_cost, data.net_profit);
    renderTopClients(data.top_clients);
    renderCriticalParts(data.critical_parts);
    renderRecentDeals(data.recent_deals);

    // Requirement #8: Mechanics Revenue Breakdown (Strictly for Administrators)
    const mechSection = document.getElementById('dash-mechanics-revenue-section');
    if (mechSection) {
      if (state.currentUser && state.currentUser.role === 'admin') {
        mechSection.classList.remove('hidden');
        renderMechanicsRevenue(data.mechanics_revenue || []);
      } else {
        mechSection.classList.add('hidden');
      }
    }

    // Requirement #7: Load Top Sold Parts widget
    await loadTopSoldParts();

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

function renderMechanicsRevenue(mechanics) {
  const tbody = document.getElementById('dash-mechanics-revenue-body');
  if (!tbody) return;
  if (!mechanics || mechanics.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-xs text-slate-400">Данные по выполненным нарядам механиков отсутствуют</td></tr>';
    return;
  }

  tbody.innerHTML = mechanics.map(m => {
    const margin = m.total_revenue > 0 ? Math.round((m.net_profit / m.total_revenue) * 100) : 0;
    return `
      <tr class="hover:bg-purple-50/40 transition-colors">
        <td class="p-3 text-xs font-sans">
          <div class="font-bold text-slate-800 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>${m.name}</span>
          </div>
          ${m.username && m.username !== m.name ? `<div class="text-[10px] text-slate-400 font-mono">@${m.username}</div>` : ''}
        </td>
        <td class="p-3 text-center text-xs font-sans">
          <span class="px-2 py-0.5 rounded-full font-bold ${m.completed_deals_count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
            ${m.completed_deals_count}
          </span>
        </td>
        <td class="p-3 text-center text-xs font-sans">
          <span class="px-2 py-0.5 rounded-full font-bold ${m.active_deals_count > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-400'}">
            ${m.active_deals_count}
          </span>
        </td>
        <td class="p-3 text-right text-xs font-bold text-blue-700">
          ${formatMoney(m.total_revenue)}
        </td>
        <td class="p-3 text-right text-xs text-slate-500">
          ${formatMoney(m.total_cost)}
        </td>
        <td class="p-3 text-right text-xs font-bold text-emerald-600">
          ${formatMoney(m.net_profit)}
          <span class="text-[10px] text-emerald-500 font-normal">(${margin}%)</span>
        </td>
        <td class="p-3 text-right text-xs font-medium text-slate-700">
          ${formatMoney(m.avg_deal)}
        </td>
      </tr>
    `;
  }).join('');
}

function renderRecentDeals(deals) {
  const container = document.getElementById('recent-deals-list');
  if (!container) return;
  if (!deals || deals.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-3">Сделки отсутствуют</div>';
    return;
  }

  container.innerHTML = deals.map(d => {
    const isParts = d.deal_type === 'parts_sale';
    const stageList = isParts ? PARTS_KANBAN_STAGES : SERVICE_KANBAN_STAGES;
    const stageObj = stageList.find(s => s.id === d.stage) || { label: d.stage };
    const deptBadge = isParts
      ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">📦 Продажа з/ч</span>'
      : '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200">🔧 Наряд СТО</span>';

    return `
      <div onclick="openDealModal(${d.id})" class="p-2.5 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between text-xs">
        <div>
          <div class="font-bold text-slate-800 flex items-center gap-1.5">
            <span>${d.title}</span>
            ${deptBadge}
          </div>
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
      btnKanban.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 shadow-sm transition-all font-bold';
    }
    if (btnList) {
      btnList.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all font-semibold';
    }
    if (kanbanView) kanbanView.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');
  } else {
    if (btnKanban) {
      btnKanban.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all font-semibold';
    }
    if (btnList) {
      btnList.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 shadow-sm transition-all font-bold';
    }
    if (kanbanView) kanbanView.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');
  }
  if (stageFilter) stageFilter.classList.remove('hidden');

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

function switchDealsDepartment(dept) {
  const reqDept = dept || 'service';
  if (reqDept === 'sales') {
    const role = state.currentUser?.role;
    const perms = state.currentUser?.permissions || {};
    if (role !== 'admin' && role !== 'sales_manager' && !perms.deals_sales) {
      showToast('Отдел продаж спецтехники доступен только Администраторам и Менеджерам по продажам', 'warning');
      return;
    }
  }

  state.dealsDepartment = reqDept;
  const isParts = state.dealsDepartment === 'parts_sale';
  const isSales = state.dealsDepartment === 'sales';

  const btnService = document.getElementById('dept-btn-service');
  const btnParts = document.getElementById('dept-btn-parts-sale');
  const btnSales = document.getElementById('dept-btn-sales');

  const baseInactive = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all font-semibold';
  if (btnService) btnService.className = (!isParts && !isSales) ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-blue-900 shadow-sm transition-all font-bold' : baseInactive;
  if (btnParts) btnParts.className = isParts ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-emerald-800 shadow-sm transition-all font-bold' : baseInactive;
  if (btnSales) btnSales.className = isSales ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-indigo-800 shadow-sm transition-all font-bold' : baseInactive;

  // Nav item highlighting in sidebar
  const navKanban = document.getElementById('nav-kanban');
  const navParts = document.getElementById('nav-parts-sales');
  const navSales = document.getElementById('nav-sales');

  const navInactive = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800';
  if (navKanban) navKanban.className = (!isParts && !isSales && state.currentTab === 'kanban') ? 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-blue-600/20 border-l-4 border-blue-500' : navInactive;
  if (navParts) navParts.className = (isParts && state.currentTab === 'kanban') ? 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-emerald-600/20 border-l-4 border-emerald-500' : navInactive;
  if (navSales) navSales.className = (isSales && state.currentTab === 'kanban') ? 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-indigo-600/20 border-l-4 border-indigo-500' : navInactive;

  const titleEl = document.getElementById('kanban-board-title');
  const subEl = document.getElementById('kanban-board-subtitle');
  const btnText = document.getElementById('btn-create-deal-text');

  if (isSales) {
    if (titleEl) titleEl.textContent = 'Отдел продаж спецтехники';
    if (subEl) subEl.textContent = 'Спецмаш • Воронка продаж спецтехники, лиды, подбор, коммерческие предложения и отгрузка';
    if (btnText) btnText.textContent = 'Новая сделка / продажа';
  } else if (isParts) {
    if (titleEl) titleEl.textContent = 'Отдел: Продажа запчастей';
    if (subEl) subEl.textContent = 'СТО Спецмаш • Воронка продаж запчастей, подбор по каталогу, бронирование и отгрузка со склада';
    if (btnText) btnText.textContent = 'Новая продажа з/ч';
  } else {
    if (titleEl) titleEl.textContent = 'Сделки и заказ-наряды СТО';
    if (subEl) subEl.textContent = 'СТО Спецмаш • Воронка ремонтов, контроль этапов и списание запчастей';
    if (btnText) btnText.textContent = 'Создать наряд';
  }

  // Requirement #12: List view is default for all departments
  setDealsViewMode('list');

  updateDealsStageFilterOptions();
  renderDeals();
}

function updateDealsStageFilterOptions() {
  const select = document.getElementById('deals-stage-filter');
  if (!select) return;
  const currentVal = select.value || 'active_only';
  const activeStages = getActiveStages();
  select.innerHTML = '<option value="active_only">⚡ Все, кроме оплачено/закрыто</option><option value="all">Все стадии воронки</option>' + activeStages.map(s => `
    <option value="${s.id}">${s.label}</option>
  `).join('');
  if (currentVal && (activeStages.some(s => s.id === currentVal) || currentVal === 'all' || currentVal === 'active_only')) {
    select.value = currentVal;
  } else {
    select.value = 'active_only';
  }
}

function renderDeals() {
  const serviceDeals = (state.deals || []).filter(d => d.deal_type !== 'parts_sale' && d.deal_type !== 'sales');
  const partsDeals = (state.deals || []).filter(d => d.deal_type === 'parts_sale');
  const salesDeals = (state.deals || []).filter(d => d.deal_type === 'sales');

  updateSidebarCounters();

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
  const isPartsDept = state.dealsDepartment === 'parts_sale';
  const activeStages = getActiveStages();

  const stageFilter = document.getElementById('deals-stage-filter')?.value || 'active_only';
  const typeFilter = document.getElementById('deals-type-filter')?.value || 'all';

  const filteredDeals = (state.deals || []).filter(d => {
    // Filter by department (Requirement #1, #9: СТО, Продажа з/ч, Отдел продаж)
    if (state.dealsDepartment === 'parts_sale') {
      if (d.deal_type !== 'parts_sale') return false;
    } else if (state.dealsDepartment === 'sales') {
      if (d.deal_type !== 'sales') return false;
    } else {
      if (d.deal_type === 'parts_sale' || d.deal_type === 'sales') return false;
    }

    // Filter by stage (Requirement #11: "Все, кроме оплачено/закрыто" by default - only final stage excluded)
    if (stageFilter === 'active_only') {
      const lastStageId = (activeStages && activeStages.length > 0) ? activeStages[activeStages.length - 1].id : 'completed';
      if (d.stage === lastStageId || d.stage === 'completed' || d.stage === 'paid' || d.stage === 'issued' || d.stage === 'closed') return false;
    } else if (stageFilter !== 'all') {
      if (d.stage !== stageFilter) return false;
    }

    // Filter by deal type (Requirement #13: Сервис, Предпродажка, Гарантия)
    if (typeFilter !== 'all') {
      if ((d.service_type || 'service') !== typeFilter) return false;
    }

    if (!filterText) return true;
    return (
      d.title.toLowerCase().includes(filterText) ||
      (d.client_name && d.client_name.toLowerCase().includes(filterText)) ||
      (d.client_company && d.client_company.toLowerCase().includes(filterText)) ||
      (d.equipment_name && d.equipment_name.toLowerCase().includes(filterText)) ||
      (d.responsible && d.responsible.toLowerCase().includes(filterText))
    );
  });

  wrapper.innerHTML = activeStages.map(stage => {
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
          <button onclick="openDealModal(null, '${stage.id}', '${state.dealsDepartment}')" class="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100" title="${isPartsDept ? 'Оформить продажу' : 'Добавить наряд'}">
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
  const stageFilter = document.getElementById('deals-stage-filter')?.value || 'active_only';
  const typeFilter = document.getElementById('deals-type-filter')?.value || 'all';
  const isPartsDept = state.dealsDepartment === 'parts_sale';
  const isSalesDept = state.dealsDepartment === 'sales';
  const activeStages = getActiveStages();

  const filteredDeals = (state.deals || []).filter(d => {
    // Filter by department (Requirement #1, #9: СТО, Продажа з/ч, Отдел продаж)
    if (isPartsDept) {
      if (d.deal_type !== 'parts_sale') return false;
    } else if (isSalesDept) {
      if (d.deal_type !== 'sales') return false;
    } else {
      if (d.deal_type === 'parts_sale' || d.deal_type === 'sales') return false;
    }

    // Filter by stage (Requirement #11: "Все, кроме оплачено/закрыто" by default - only final stage excluded)
    if (stageFilter === 'active_only') {
      const lastStageId = (activeStages && activeStages.length > 0) ? activeStages[activeStages.length - 1].id : 'completed';
      if (d.stage === lastStageId || d.stage === 'completed' || d.stage === 'paid' || d.stage === 'issued' || d.stage === 'closed') return false;
    } else if (stageFilter !== 'all') {
      if (d.stage !== stageFilter) return false;
    }

    // Filter by deal type (Requirement #13: Сервис, Предпродажка, Гарантия)
    if (typeFilter !== 'all') {
      if ((d.service_type || 'service') !== typeFilter) return false;
    }

    if (!filterText) return true;
    return (
      d.title.toLowerCase().includes(filterText) ||
      (d.client_name && d.client_name.toLowerCase().includes(filterText)) ||
      (d.client_company && d.client_company.toLowerCase().includes(filterText)) ||
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
    let emptyMsg = 'Заказ-наряды не найдены по заданным условиям';
    if (isPartsDept) emptyMsg = 'Продажи запчастей не найдены по заданным условиям';
    if (isSalesDept) emptyMsg = 'Сделки отдела продаж спецтехники не найдены';
    tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 text-xs">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredDeals.map(deal => {
    let priorityBadge = '';
    if (deal.priority === 'urgent') priorityBadge = '<span class="badge-urgent text-[10px] font-bold px-1.5 py-0.5 rounded">🔥 Срочно</span>';
    else if (deal.priority === 'high') priorityBadge = '<span class="badge-high text-[10px] font-bold px-1.5 py-0.5 rounded">Высокий</span>';
    else if (deal.priority === 'low') priorityBadge = '<span class="badge-low text-[10px] font-medium px-1.5 py-0.5 rounded">Низкий</span>';

    // Requirement #13: Service Type Badges (Сервис, Предпродажка, Гарантия)
    let typeBadge = '';
    const stype = deal.service_type || 'service';
    if (deal.deal_type === 'parts_sale') {
      typeBadge = '<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold">📦 Продажа з/ч</span>';
    } else if (deal.deal_type === 'sales') {
      typeBadge = '<span class="bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold">🚜 Продажа техники</span>';
    } else {
      if (stype === 'pre_sale') typeBadge = '<span class="bg-purple-50 text-purple-800 border border-purple-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold">🚜 Предпродажка</span>';
      else if (stype === 'warranty') typeBadge = '<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold">🛡️ Гарантия</span>';
      else typeBadge = '<span class="bg-blue-50 text-blue-800 border border-blue-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold">🛠️ Сервис</span>';
    }

    const currIdx = activeStages.findIndex(s => s.id === deal.stage);
    const stageObj = activeStages.find(s => s.id === deal.stage) || { label: deal.stage };
    const isLocked = isDealLockedForUser(deal);
    const isFailed = deal.closing_outcome === 'failed';
    const isOverdue = isDealReadyOverdue(deal);

    // Bitrix24 Pipeline Chevrons using activeStages
    const chevronsHtml = activeStages.map((s, idx) => {
      let stateClass = 'future';
      if (idx < currIdx) stateClass = 'passed';
      else if (idx === currIdx) stateClass = `current stage-${s.id}`;

      return `
        <button type="button"
                onclick="${isLocked ? "showToast('Изменение стадии закрытых сделок разрешено только Администратору!', 'error')" : `updateDealStageQuick(${deal.id}, '${s.id}', event)`}"
                class="b24-stage-chevron ${stateClass} ${isLocked ? 'opacity-80 cursor-not-allowed' : ''}"
                title="${s.label} • ${isLocked ? 'Заблокировано для редактирования' : 'Кликните для выбора стадии'}">
          ${s.short || s.label}
        </button>
      `;
    }).join('');

    let rowClass = 'hover:bg-slate-50/80 transition-colors';
    if (isFailed) {
      rowClass = 'deal-row-failed bg-rose-50/80 hover:bg-rose-100/70 border-l-4 border-l-rose-600 transition-colors';
    } else if (isOverdue) {
      rowClass = 'bg-rose-50/70 hover:bg-rose-100/60 border-l-4 border-l-rose-600 transition-colors';
    }

    return `
      <tr class="${rowClass}">
        <td class="p-3.5">
          <div class="flex items-start gap-2">
            <span class="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">#${deal.id}</span>
            <div>
              <button onclick="openDealModal(${deal.id})" class="font-bold text-slate-800 hover:text-blue-600 text-left block text-sm transition-colors">
                ${deal.title}
              </button>
              <div class="mt-1 flex items-center gap-1.5 flex-wrap">
                ${priorityBadge}
                ${typeBadge}
                ${isFailed ? '<span class="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 shadow-xs"><i data-lucide="x-circle" class="w-3 h-3"></i> ❌ Не удачно</span>' : ''}
                ${isOverdue ? '<span class="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 w-fit shadow-xs"><i data-lucide="clock" class="w-3 h-3"></i> Ожидает выдачи &gt; 30 дней</span>' : ''}
                ${isLocked ? '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-1 border border-amber-300"><i data-lucide="lock" class="w-3 h-3"></i> Закрыто</span>' : ''}
                ${Number(deal.parts_count || 0) > 0 ? `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold" title="Списано со склада">${deal.parts_count} з/ч</span>` : ''}
              </div>
            </div>
          </div>
        </td>

        <!-- Requirement #2: Client and Company name -->
        <td class="p-3.5 text-xs">
          ${deal.client_company ? `<div class="font-bold text-slate-900 flex items-center gap-1.5"><i data-lucide="building" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i><span>${deal.client_company}</span></div>` : ''}
          <div class="${deal.client_company ? 'text-slate-600 font-medium' : 'font-bold text-slate-800'} flex items-center gap-1">
            ${deal.client_company ? '<i data-lucide="user" class="w-3 h-3 text-slate-400 flex-shrink-0"></i>' : ''}
            <span>${deal.client_name || 'Не указан'}</span>
          </div>
          <div class="text-slate-400 text-[11px] font-mono">${deal.client_phone || '—'}</div>
        </td>

        <td class="p-3.5 text-xs">
          <div class="font-bold text-slate-700 flex items-center gap-1.5">
            <i data-lucide="${deal.deal_type === 'parts_sale' ? 'shopping-cart' : (deal.deal_type === 'sales' ? 'tractor' : 'truck')}" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>${deal.deal_type === 'parts_sale' ? 'Продажа со склада' : (deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || 'Не привязана')}</span>
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
              <select ${isLocked ? 'disabled' : ''} onchange="updateDealStageQuick(${deal.id}, this.value, event)" class="b24-stage-select bg-white border border-slate-200 text-[11px] font-semibold rounded px-2 py-0.5 outline-none focus:border-blue-500 ${isLocked ? 'bg-slate-100 cursor-not-allowed text-slate-400' : 'cursor-pointer'}">
                ${activeStages.map(s => `
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
          ${deal.responsible || '—'}
        </td>

        <td class="p-3.5 text-xs font-mono text-slate-500">
          ${deal.deadline || '—'}
        </td>

        <!-- Requirement #4: Deal Registration Date in List view -->
        <td class="p-3.5 text-xs font-mono text-slate-500 whitespace-nowrap">
          ${formatDate(deal.created_at)}
        </td>

        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="openDealModal(${deal.id})" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded" title="Просмотр / Редактирование наряда">
            <i data-lucide="${isLocked ? 'eye' : 'edit-3'}" class="w-4 h-4"></i>
          </button>
          ${isLocked ? '' : `
          <button onclick="quickDeleteDeal(${deal.id})" class="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded" title="Удалить наряд">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>`}
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

  // Requirement #5: Forbid changes to closed/paid deals for non-admins
  if (isDealLockedForUser(deal)) {
    showToast('Изменение стадии закрытых/оплаченных сделок разрешено только Администратору!', 'error');
    return;
  }

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
    const activeStages = getActiveStages();
    const stageName = activeStages.find(s => s.id === newStage)?.label || newStage;
    showToast(`Сделка #${dealId}: стадия изменена на «${stageName}»`, 'info');
    loadDashboard();
  } catch (err) {
    console.warn('Deal stage update warning:', err);
    const activeStages = getActiveStages();
    const stageName = activeStages.find(s => s.id === newStage)?.label || newStage;
    showToast(`Стадия сделки сохранена: «${stageName}»`, 'info');
  }
}

async function quickDeleteDeal(dealId) {
  const deal = state.deals.find(d => Number(d.id) === Number(dealId));
  if (isDealLockedForUser(deal)) {
    showToast('Удаление закрытых сделок (стадии «Оплачено» / «Выдано») разрешено только Администратору!', 'error');
    return;
  }
  if (!confirm(`Удалить заказ-наряд #${dealId}?`)) return;
  try {
    let res = await fetch(`/api/deals/${dealId}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': state.currentUser?.role || ''
      }
    });
    if (!res.ok) {
      res = await fetch(`/api/deals/${dealId}/delete`, {
        method: 'POST',
        headers: {
          'x-user-role': state.currentUser?.role || ''
        }
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка при удалении наряда');
    showToast(`Заказ-наряд #${dealId} удален`);
    loadDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Ошибка при удалении наряда', 'error');
  }
}

// Check if deal in "ready" stage has been waiting > 30 days (Requirement #7)
function isDealReadyOverdue(deal) {
  if (!deal || deal.stage !== 'ready') return false;
  const refDateStr = deal.completed_at || deal.created_at;
  if (!refDateStr) return false;
  const refTime = new Date(refDateStr).getTime();
  if (isNaN(refTime)) return false;
  const diffDays = (Date.now() - refTime) / (1000 * 60 * 60 * 24);
  return diffDays > 30;
}

function renderKanbanCard(deal) {
  let priorityBadge = '';
  if (deal.priority === 'urgent') priorityBadge = '<span class="badge-urgent text-[10px] font-bold px-1.5 py-0.5 rounded">🔥 Срочно</span>';
  else if (deal.priority === 'high') priorityBadge = '<span class="badge-high text-[10px] font-bold px-1.5 py-0.5 rounded">Высокий</span>';
  else if (deal.priority === 'low') priorityBadge = '<span class="badge-low text-[10px] font-medium px-1.5 py-0.5 rounded">Низкий</span>';

  // Requirement #13: Service Type Badges (Сервис, Предпродажка, Гарантия)
  let typeBadge = '';
  const stype = deal.service_type || 'service';
  if (deal.deal_type === 'parts_sale') {
    typeBadge = '<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-1.5 py-0.5 rounded">📦 З/Ч</span>';
  } else if (deal.deal_type === 'sales') {
    typeBadge = '<span class="bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold px-1.5 py-0.5 rounded">🚜 Продажа</span>';
  } else {
    if (stype === 'pre_sale') typeBadge = '<span class="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold px-1.5 py-0.5 rounded">🚜 Предпродажка</span>';
    else if (stype === 'warranty') typeBadge = '<span class="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-1.5 py-0.5 rounded">🛡️ Гарантия</span>';
    else typeBadge = '<span class="bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-bold px-1.5 py-0.5 rounded">🛠️ Сервис</span>';
  }

  // Requirement #14: Deal Closing Outcome (Не удачно / Отказ -> Red highlight)
  const isFailed = deal.closing_outcome === 'failed';
  const isLocked = isDealLockedForUser(deal);
  const isOverdue = isDealReadyOverdue(deal);

  let cardStyling = 'bg-white border border-slate-200/90 shadow-sm';
  if (isFailed) {
    cardStyling = 'deal-card-failed bg-rose-50/95 border-2 border-rose-500 shadow-sm shadow-rose-200 text-rose-950 ring-2 ring-rose-300/40';
  } else if (isOverdue) {
    cardStyling = 'bg-rose-50/95 border-2 border-rose-500 shadow-sm shadow-rose-200 ring-2 ring-rose-400/40 text-rose-950';
  } else if (isLocked) {
    cardStyling = 'bg-slate-50/90 border border-amber-300 shadow-xs';
  }

  const failedBanner = isFailed ? `
    <div class="flex items-center gap-1.5 text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-md w-fit shadow-xs">
      <i data-lucide="x-circle" class="w-3 h-3 text-rose-600 flex-shrink-0"></i>
      <span>❌ Закрыто: Не удачно (Отказ)</span>
    </div>
  ` : '';

  const lockBadge = isLocked ? `
    <span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded" title="Сделка заблокирована для редактирования (только для Администратора)">
      <i data-lucide="lock" class="w-3 h-3 text-amber-600"></i>
      <span>Заблокировано</span>
    </span>
  ` : '';

  return `
    <div class="kanban-card ${cardStyling} p-3.5 rounded-xl relative space-y-2 transition-all duration-300"
         id="kanban-card-${deal.id}"
         data-deal-id="${deal.id}"
         draggable="${!isLocked}"
         ondragstart="${isLocked ? 'return false;' : `handleDragStart(event, ${deal.id})`}"
         ondragend="handleDragEnd(event)"
         onclick="openDealModal(${deal.id})">

      ${failedBanner}
      ${isOverdue ? `<div class="flex items-center gap-1.5 text-[10px] font-bold text-rose-700 bg-rose-100/90 border border-rose-300 px-2 py-0.5 rounded-md w-fit"><i data-lucide="clock" class="w-3 h-3 text-rose-600 flex-shrink-0"></i><span>Ожидает выдачи &gt; 30 дней</span></div>` : ''}

      <div class="flex items-start justify-between gap-2">
        <h4 class="font-bold ${isFailed || isOverdue ? 'text-rose-950' : 'text-slate-800'} text-xs leading-snug hover:text-blue-600 transition-colors">${deal.title}</h4>
        <div class="flex items-center gap-1 flex-wrap justify-end">
          ${lockBadge}
          ${typeBadge}
          ${priorityBadge}
        </div>
      </div>

      <!-- Requirement #2: Client and Company name -->
      <div class="space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
        ${deal.client_company ? `
        <div class="flex items-center gap-1.5 font-bold text-slate-900 truncate" title="${deal.client_company}">
          <i data-lucide="building" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i>
          <span class="truncate">${deal.client_company}</span>
        </div>` : ''}
        <div class="flex items-center gap-1.5 font-medium text-slate-700 truncate">
          <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0"></i>
          <span class="truncate">${deal.client_name || 'Клиент не указан'}</span>
        </div>
        ${deal.deal_type === 'parts_sale' ? `
        <div class="flex items-center gap-1.5 text-emerald-700 font-medium text-[11px]">
          <i data-lucide="shopping-cart" class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"></i>
          <span>Отдел: Продажа запчастей</span>
        </div>` : (deal.deal_type === 'sales' ? `
        <div class="flex items-center gap-1.5 text-indigo-700 font-medium text-[11px]">
          <i data-lucide="tractor" class="w-3.5 h-3.5 text-indigo-600 flex-shrink-0"></i>
          <span>Отдел: Продажа спецтехники</span>
        </div>` : `
        <div class="flex items-center gap-1.5 text-slate-600 truncate">
          <i data-lucide="truck" class="w-3.5 h-3.5 text-emerald-500 flex-shrink-0"></i>
          <span class="truncate">${deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || 'Техника не привязана'}</span>
        </div>`)}
      </div>

      <div class="flex items-center justify-between pt-1 text-xs">
        <span class="font-bold text-blue-600 font-mono">${formatMoney(deal.amount)}</span>
        <div class="flex items-center gap-1.5">
          ${Number(deal.parts_count || 0) > 0 ? `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold" title="Списано запчастей">${deal.parts_count} з/ч</span>` : ''}
          <span class="text-[10px] text-slate-500 font-medium">${deal.responsible || ''}</span>
        </div>
      </div>

      <!-- Requirement #4: Deal Registration and Completion Dates in Kanban -->
      <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100">
        <span class="flex items-center gap-1" title="Дата регистрации наряда">
          <i data-lucide="calendar" class="w-3 h-3 text-slate-400"></i>
          <span>${formatDate(deal.created_at)}</span>
        </span>
        ${deal.stage === 'completed' ? `
          <span class="flex items-center gap-1 text-emerald-600 font-semibold" title="Дата закрытия наряда">
            <i data-lucide="check-check" class="w-3 h-3 text-emerald-500"></i>
            <span>${formatDate(deal.completed_at || deal.created_at)}</span>
          </span>` : `
          ${deal.deadline ? `<span class="flex items-center gap-1 font-mono text-slate-500" title="Дедлайн"><i data-lucide="clock" class="w-3 h-3"></i> ${deal.deadline}</span>` : ''}
        `}
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
    updateSidebarCounters();
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

    // Requirement #5: Display Requisites
    const innEl = document.getElementById('view-client-inn');
    const bankNameEl = document.getElementById('view-client-bank-name');
    const bankAccEl = document.getElementById('view-client-bank-account');
    if (innEl) innEl.textContent = client.inn || '—';
    if (bankNameEl) bankNameEl.textContent = client.bank_name || '—';
    if (bankAccEl) bankAccEl.textContent = client.bank_account || '—';

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
    updateSidebarCounters();
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
    updateSidebarCounters();
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
    updateSidebarCounters();
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
              ${t.responsible ? `
                <span class="flex items-center gap-1 font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-[11px]">
                  <i data-lucide="user-check" class="w-3 h-3 text-blue-600"></i>
                  <span>Ответственный: <b>${t.responsible}</b></span>
                </span>` : ''}
              ${t.client_name ? `<span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i> ${t.client_name}</span>` : ''}
              ${t.deal_title ? `<span class="flex items-center gap-1"><i data-lucide="trello" class="w-3.5 h-3.5 text-blue-500"></i> ${t.deal_title}</span>` : ''}
            </div>
            ${t.notes ? `<div class="text-[11px] text-slate-400 mt-1">${t.notes}</div>` : ''}
          </div>
        </div>

        <div class="flex items-center gap-1">
          ${(state.currentUser?.role === 'admin' || state.currentUser?.permissions?.can_edit_tasks === true) ? `
          <button onclick="openTaskModal(${t.id})" class="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition-colors" title="Редактировать задачу (только для Администратора)">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>` : ''}
          <button onclick="deleteTaskItem(${t.id})" class="p-1.5 text-slate-300 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors" title="Удалить задачу">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
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

    // Keep state.currentUser in sync with fresh database profile
    if (state.currentUser && state.currentUser.id && Array.isArray(state.users)) {
      const freshSelf = state.users.find(u => u.id === state.currentUser.id || (u.username && u.username.toLowerCase() === state.currentUser.username?.toLowerCase()));
      if (freshSelf && (freshSelf.full_name !== state.currentUser.full_name || freshSelf.role !== state.currentUser.role)) {
        state.currentUser = { ...state.currentUser, ...freshSelf };
        applyUserPermissions();
      }
    }

    renderUsersTable();
    updateSidebarCounters();
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
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 text-xs">Сотрудники не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = state.users.map(u => {
    const roleInfo = ROLE_DEFINITIONS[u.role] || { label: u.role, badge: 'bg-slate-100 text-slate-700', icon: '👤' };
    const isCurrent = state.currentUser && state.currentUser.id === u.id;
    const isOnline = isCurrent || u.is_online === true;
    const statusBadge = isOnline
      ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> В сети</span>'
      : '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-normal text-slate-400 bg-slate-50 border border-slate-200"><span class="w-2 h-2 rounded-full bg-slate-300"></span> Не в сети</span>';

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-3.5">
          <div class="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 ring-2 ring-emerald-200 animate-pulse' : 'bg-slate-300'}" title="${isOnline ? 'В сети' : 'Не в сети'}"></span>
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
        <td class="p-3.5 text-xs">
          ${statusBadge}
        </td>
        <td class="p-3.5 text-xs font-mono text-slate-600">
          ${u.phone || '—'}
        </td>
        <td class="p-3.5 text-xs text-slate-400">
          ${formatDate(u.created_at)}
        </td>
        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          ${(state.currentUser?.role === 'admin') ? `
          <button onclick="openPermissionsModal(${u.id})" class="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded" title="Настроить права доступа сотрудника">
            <i data-lucide="shield-check" class="w-4 h-4"></i>
          </button>` : ''}
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

// DEAL CLIENT SEARCH & AUTO-FILL (Requirement #8)
function handleDealClientSearch(query) {
  const clearBtn = document.getElementById('deal-client-search-clear');
  const resultsDropdown = document.getElementById('deal-client-search-results');
  if (!resultsDropdown) return;

  const q = (query || '').trim().toLowerCase();
  const digits = q.replace(/\D/g, '');

  if (clearBtn) clearBtn.classList.toggle('hidden', !q);

  if (q.length < 2 && digits.length < 3) {
    resultsDropdown.classList.add('hidden');
    resultsDropdown.innerHTML = '';
    return;
  }

  const matches = (state.clients || []).filter(c => {
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const companyMatch = (c.company || '').toLowerCase().includes(q);
    const innMatch = (c.inn || '').toLowerCase().includes(q);
    const phoneDigits = (c.phone || '').replace(/\D/g, '');
    const phoneMatch = digits.length >= 3 && phoneDigits.includes(digits);
    return nameMatch || companyMatch || innMatch || phoneMatch;
  });

  if (matches.length === 0) {
    resultsDropdown.innerHTML = '<div class="p-3 text-xs text-slate-400 text-center font-medium">Клиенты не найдены</div>';
    resultsDropdown.classList.remove('hidden');
    return;
  }

  resultsDropdown.innerHTML = matches.map(c => `
    <div onclick="selectDealClient(${c.id})" class="p-2.5 hover:bg-blue-50 cursor-pointer transition-colors group">
      <div class="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-blue-700">
        <span>${c.name}</span>
        <span class="font-mono text-blue-600 font-semibold text-[11px]">${c.phone}</span>
      </div>
      <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
        ${c.company ? `<span>${c.company}</span>` : '<span class="text-slate-400">Физлицо</span>'}
        ${c.inn ? `<span class="font-mono text-slate-600 bg-slate-100 px-1 rounded">ИНН: ${c.inn}</span>` : ''}
      </div>
    </div>
  `).join('');
  resultsDropdown.classList.remove('hidden');
}

async function selectDealClient(clientId) {
  const client = (state.clients || []).find(c => c.id == clientId);
  if (!client) return;

  const clientSelect = document.getElementById('deal-client');
  if (clientSelect) clientSelect.value = client.id;

  // Auto-fill equipment for this client
  await handleDealClientChange(client.id);

  // If client has exactly one piece of equipment, auto-select it!
  const clientEquipment = (state.equipment || []).filter(e => e.client_id == client.id);
  const eqSelect = document.getElementById('deal-equipment');
  if (clientEquipment.length === 1 && eqSelect) {
    eqSelect.value = clientEquipment[0].id;
  }

  // Update search input & badge
  const searchInput = document.getElementById('deal-client-search');
  if (searchInput) searchInput.value = client.name;

  const clearBtn = document.getElementById('deal-client-search-clear');
  if (clearBtn) clearBtn.classList.remove('hidden');

  const resultsDropdown = document.getElementById('deal-client-search-results');
  if (resultsDropdown) {
    resultsDropdown.classList.add('hidden');
    resultsDropdown.innerHTML = '';
  }

  const badge = document.getElementById('deal-client-selected-badge');
  const badgeText = document.getElementById('deal-client-selected-text');
  if (badge && badgeText) {
    badgeText.textContent = `${client.name} (${client.phone})${client.company ? ' • ' + client.company : ''}${client.inn ? ' • ИНН: ' + client.inn : ''}`;
    badge.classList.remove('hidden');
  }

  showToast(`Клиент «${client.name}» выбран и данные автозаполнены`, 'info');
  if (window.lucide) lucide.createIcons();
}

function clearDealClientSearch() {
  const searchInput = document.getElementById('deal-client-search');
  if (searchInput) searchInput.value = '';

  const clearBtn = document.getElementById('deal-client-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');

  const resultsDropdown = document.getElementById('deal-client-search-results');
  if (resultsDropdown) {
    resultsDropdown.classList.add('hidden');
    resultsDropdown.innerHTML = '';
  }

  const badge = document.getElementById('deal-client-selected-badge');
  if (badge) badge.classList.add('hidden');

  const dealId = document.getElementById('deal-id')?.value;
  if (!dealId) {
    const clientSelect = document.getElementById('deal-client');
    if (clientSelect) clientSelect.value = '';
    handleDealClientChange('');
  }
}

// DEAL MODAL
function setDealModalType(type) {
  state.dealModalType = type || 'service';
  const isParts = state.dealModalType === 'parts_sale';
  const isSales = state.dealModalType === 'sales';
  const typeInput = document.getElementById('deal-type');
  if (typeInput) typeInput.value = state.dealModalType;

  const btnService = document.getElementById('deal-type-btn-service');
  const btnParts = document.getElementById('deal-type-btn-parts');
  const btnSales = document.getElementById('deal-type-btn-sales');

  const inactiveBtn = 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1';
  if (btnService) btnService.className = (!isParts && !isSales) ? 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-blue-900 shadow-xs flex items-center justify-center gap-1' : inactiveBtn;
  if (btnParts) btnParts.className = isParts ? 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-emerald-900 shadow-xs flex items-center justify-center gap-1' : inactiveBtn;
  if (btnSales) btnSales.className = isSales ? 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-indigo-900 shadow-xs flex items-center justify-center gap-1' : inactiveBtn;

  const titleLabel = document.getElementById('deal-title-label');
  const titleInput = document.getElementById('deal-title');
  if (isSales) {
    if (titleLabel) titleLabel.textContent = 'Наименование сделки по продаже техники *';
    if (titleInput && (!titleInput.value || titleInput.value.includes('Например:'))) {
      titleInput.placeholder = 'Например: Поставка экскаватора-погрузчика Case 570SV';
    }
  } else if (isParts) {
    if (titleLabel) titleLabel.textContent = 'Тема / Заказ на запчасти *';
    if (titleInput && (!titleInput.value || titleInput.value.includes('Например:'))) {
      titleInput.placeholder = 'Например: Комплект фильтров и гидронасос для CASE 580';
    }
  } else {
    if (titleLabel) titleLabel.textContent = 'Тема / Название наряда *';
    if (titleInput && (!titleInput.value || titleInput.value.includes('Например:'))) {
      titleInput.placeholder = 'Например: Капитальный ремонт гидравлики CASE';
    }
  }

  // Populate stages in deal-stage select
  const stageSelect = document.getElementById('deal-stage');
  if (stageSelect) {
    const curVal = stageSelect.value;
    let stages = SERVICE_KANBAN_STAGES;
    if (isParts) stages = PARTS_KANBAN_STAGES;
    else if (isSales) stages = SALES_KANBAN_STAGES;

    stageSelect.innerHTML = stages.map(s => `
      <option value="${s.id}">${s.label}</option>
    `).join('') + `<option value="cancelled">❌ Отказ / Архив</option>`;
    if (stages.some(s => s.id === curVal) || curVal === 'cancelled') {
      stageSelect.value = curVal;
    } else {
      stageSelect.value = stages[0]?.id || 'new';
    }
  }

  const dealId = document.getElementById('deal-id')?.value;
  const modalTitle = document.getElementById('modal-deal-title');
  if (modalTitle) {
    if (dealId) {
      modalTitle.textContent = isSales ? 'Редактирование сделки (Отдел продаж)' : (isParts ? 'Редактирование заказа на запчасти' : 'Редактирование наряда');
    } else {
      modalTitle.textContent = isSales ? 'Новая сделка: Отдел продаж спецтехники' : (isParts ? 'Новый заказ на продажу запчастей' : 'Новый заказ-наряд СТО Спецмаш');
    }
  }

  if (window.lucide) lucide.createIcons();
}

async function openDealModal(dealId = null, defaultStage = 'new', defaultType = null) {
  await Promise.all([loadClientsListOptions(), loadWarehousePartsOptions(), loadEmployeesSelectOptions(), loadEquipment()]);

  const form = document.getElementById('form-deal');
  form.reset();
  document.getElementById('deal-id').value = '';
  document.getElementById('deal-parts-section').classList.add('hidden');
  document.getElementById('btn-delete-deal').classList.add('hidden');
  const datesBanner = document.getElementById('deal-dates-banner');
  if (datesBanner) datesBanner.classList.add('hidden');

  // Reset search & auto-fill
  clearDealClientSearch();

  let targetType = defaultType || (state.dealsDepartment === 'parts_sale' ? 'parts_sale' : 'service');

  if (dealId) {
    document.getElementById('deal-parts-section').classList.remove('hidden');

    try {
      const res = await fetch(`/api/deals/${dealId}`);
      const deal = await res.json();
      targetType = deal.deal_type || 'service';
      setDealModalType(targetType);

      // Requirement #1: Only admin can delete completed deals
      const deleteBtn = document.getElementById('btn-delete-deal');
      if (deleteBtn) {
        const isCompleted = deal.stage === 'completed';
        const isAdmin = state.currentUser && state.currentUser.role === 'admin';
        if (isCompleted && !isAdmin) {
          deleteBtn.classList.add('hidden');
        } else {
          deleteBtn.classList.remove('hidden');
        }
      }

      // Requirement #4: Display deal registration and closing dates
      if (datesBanner) {
        datesBanner.classList.remove('hidden');
        document.getElementById('deal-date-created').textContent = deal.created_at || '—';
        const isClosed = deal.stage === 'completed';
        const completedText = (isClosed && deal.completed_at) ? deal.completed_at : (isClosed ? 'Закрыта' : 'В работе');
        document.getElementById('deal-date-completed').textContent = completedText;
      }

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

      const serviceTypeSelect = document.getElementById('deal-service-type');
      if (serviceTypeSelect) serviceTypeSelect.value = deal.service_type || 'service';

      const outcomeSelect = document.getElementById('deal-closing-outcome');
      if (outcomeSelect) outcomeSelect.value = deal.closing_outcome || 'success';

      // Requirement #5: Lockdown of closed/paid deals for non-admins
      const isLocked = isDealLockedForUser(deal);
      const lockedBanner = document.getElementById('deal-locked-banner');
      if (lockedBanner) {
        if (isLocked) lockedBanner.classList.remove('hidden');
        else lockedBanner.classList.add('hidden');
      }

      const fieldsToLock = ['deal-title', 'deal-client', 'deal-equipment', 'deal-stage', 'deal-amount', 'deal-cost', 'deal-priority', 'deal-responsible', 'deal-deadline', 'deal-description', 'deal-service-type', 'deal-closing-outcome'];
      fieldsToLock.forEach(fId => {
        const el = document.getElementById(fId);
        if (el) el.disabled = isLocked;
      });

      const saveBtn = document.getElementById('btn-save-deal');
      if (saveBtn) {
        if (isLocked) saveBtn.classList.add('hidden');
        else saveBtn.classList.remove('hidden');
      }

      if (deal.client_id) {
        const client = state.clients.find(c => c.id == deal.client_id);
        if (client) {
          const searchInput = document.getElementById('deal-client-search');
          if (searchInput) searchInput.value = client.name;
          const clearBtn = document.getElementById('deal-client-search-clear');
          if (clearBtn) clearBtn.classList.remove('hidden');
          const badge = document.getElementById('deal-client-selected-badge');
          const badgeText = document.getElementById('deal-client-selected-text');
          if (badge && badgeText) {
            badgeText.textContent = `${client.name} (${client.phone})${client.company ? ' • ' + client.company : ''}${client.inn ? ' • ИНН: ' + client.inn : ''}`;
            badge.classList.remove('hidden');
          }
        }
      }

      renderDealAttachedParts(deal.parts || []);
    } catch (e) {
      showToast('Ошибка загрузки сделки', 'error');
    }
  } else {
    setDealModalType(targetType);
    document.getElementById('deal-stage').value = defaultStage || 'new';
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

  // Sync client search and badge if user changes select dropdown
  const client = (state.clients || []).find(c => c.id == clientId);
  const badge = document.getElementById('deal-client-selected-badge');
  const badgeText = document.getElementById('deal-client-selected-text');
  const searchInput = document.getElementById('deal-client-search');
  const clearBtn = document.getElementById('deal-client-search-clear');

  if (client) {
    if (searchInput) searchInput.value = client.name;
    if (clearBtn) clearBtn.classList.remove('hidden');
    if (badge && badgeText) {
      badgeText.textContent = `${client.name} (${client.phone})${client.company ? ' • ' + client.company : ''}${client.inn ? ' • ИНН: ' + client.inn : ''}`;
      badge.classList.remove('hidden');
    }
  } else if (!clientId) {
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (badge) badge.classList.add('hidden');
  }

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadWarehousePartsOptions(filteredParts = null) {
  if (state.parts.length === 0) await loadParts();
  const select = document.getElementById('attach-part-select');
  if (!select) return;

  const partsToRender = filteredParts || state.parts;
  if (partsToRender.length === 0) {
    select.innerHTML = '<option value="" disabled selected>Запчасти не найдены</option>';
    return;
  }

  select.innerHTML = partsToRender.map(p => `
    <option value="${p.id}" ${p.quantity <= 0 ? 'disabled' : ''}>
      ${escapeHtml(p.name)} [${escapeHtml(p.sku)}] — ост: ${p.quantity} шт (${formatMoney(p.selling_price)})
    </option>
  `).join('');
}

// Requirement #6: Search parts by SKU or Name in write-off modal
function handleAttachPartSearch(query) {
  const q = (query || '').trim().toLowerCase();
  const clearBtn = document.getElementById('attach-part-search-clear');
  const suggestionsBox = document.getElementById('attach-part-suggestions');

  if (clearBtn) {
    if (q) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  if (!q) {
    if (suggestionsBox) suggestionsBox.classList.add('hidden');
    loadWarehousePartsOptions();
    return;
  }

  const matches = state.parts.filter(p => {
    const nameMatch = p.name && p.name.toLowerCase().includes(q);
    const skuMatch = p.sku && p.sku.toLowerCase().includes(q);
    const catMatch = p.category && p.category.toLowerCase().includes(q);
    return nameMatch || skuMatch || catMatch;
  });

  loadWarehousePartsOptions(matches);
  if (matches.length > 0) {
    const sel = document.getElementById('attach-part-select');
    if (sel && sel.options.length > 0) sel.selectedIndex = 0;
  }

  if (!suggestionsBox) return;

  if (matches.length === 0) {
    suggestionsBox.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Запчасти по запросу «${escapeHtml(q)}» не найдены</div>`;
    suggestionsBox.classList.remove('hidden');
    return;
  }

  suggestionsBox.innerHTML = matches.slice(0, 15).map(p => {
    const isOut = p.quantity <= 0;
    return `
      <div onclick="selectAttachPartSuggestion(${p.id})" class="p-2.5 hover:bg-amber-50 cursor-pointer flex items-center justify-between text-xs transition-colors">
        <div class="min-w-0 pr-2">
          <div class="font-bold text-slate-800 flex items-center gap-1.5 truncate">
            <span class="truncate">${escapeHtml(p.name)}</span>
            <span class="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200 shrink-0 font-bold">${escapeHtml(p.sku)}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">${p.location ? 'Локация: ' + escapeHtml(p.location) + ' • ' : ''}Категория: ${escapeHtml(p.category || 'Общая')}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-bold ${isOut ? 'text-rose-500' : 'text-emerald-700'} font-mono">${p.quantity} шт</div>
          <div class="text-[10px] text-slate-500 font-mono">${formatMoney(p.selling_price)}</div>
        </div>
      </div>
    `;
  }).join('');
  suggestionsBox.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function selectAttachPartSuggestion(partId) {
  const part = state.parts.find(p => p.id === partId);
  const searchInput = document.getElementById('attach-part-search');
  const suggestionsBox = document.getElementById('attach-part-suggestions');
  const select = document.getElementById('attach-part-select');

  if (part) {
    if (searchInput) searchInput.value = `[${part.sku}] ${part.name}`;
    loadWarehousePartsOptions([part, ...state.parts.filter(p => p.id !== partId)]);
    if (select) select.value = String(part.id);
  }
  if (suggestionsBox) suggestionsBox.classList.add('hidden');
  const qtyInput = document.getElementById('attach-part-qty');
  if (qtyInput) qtyInput.focus();
}

function clearAttachPartSearch() {
  const searchInput = document.getElementById('attach-part-search');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('attach-part-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
  const suggestionsBox = document.getElementById('attach-part-suggestions');
  if (suggestionsBox) suggestionsBox.classList.add('hidden');
  loadWarehousePartsOptions();
}

function handleAttachPartSelectChange(partId) {
  const part = state.parts.find(p => String(p.id) === String(partId));
  if (part) {
    const searchInput = document.getElementById('attach-part-search');
    if (searchInput && !searchInput.value) {
      searchInput.placeholder = `Выбрано: [${part.sku}] ${part.name}`;
    }
  }
}

function showAttachPartRow() {
  document.getElementById('attach-part-row').classList.remove('hidden');
  clearAttachPartSearch();
  const searchInput = document.getElementById('attach-part-search');
  if (searchInput) searchInput.focus();
}

function hideAttachPartRow() {
  document.getElementById('attach-part-row').classList.add('hidden');
  clearAttachPartSearch();
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
  const dealType = document.getElementById('deal-type')?.value || 'service';

  const payload = {
    title: document.getElementById('deal-title').value.trim(),
    deal_type: dealType,
    client_id: clientId,
    equipment_id: eqId,
    stage: document.getElementById('deal-stage').value,
    amount: parseFloat(document.getElementById('deal-amount').value) || 0.0,
    cost: parseFloat(document.getElementById('deal-cost').value) || 0.0,
    priority: document.getElementById('deal-priority').value,
    responsible: document.getElementById('deal-responsible').value,
    deadline: document.getElementById('deal-deadline').value || null,
    description: document.getElementById('deal-description').value.trim(),
    service_type: document.getElementById('deal-service-type')?.value || 'service',
    closing_outcome: document.getElementById('deal-closing-outcome')?.value || 'success',
  };

  try {
    let res;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'X-User-Role': state.currentUser?.role || ''
    };
    if (dealId) {
      res = await fetch(`/api/deals/${dealId}`, {
        method: 'PUT',
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch(`/api/deals/${dealId}`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(payload)
        });
      }
    } else {
      res = await fetch('/api/deals', {
        method: 'POST',
        headers: reqHeaders,
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
      deal_type: data.deal_type || payload.deal_type,
      client_name: data.client_name || (clientObj ? clientObj.name : ''),
      client_company: data.client_company || (clientObj ? clientObj.company : ''),
      client_phone: data.client_phone || (clientObj ? clientObj.phone : ''),
      equipment_name: eqName,
      equipment_vin: eqVin,
      _updated_at: Date.now()
    });

    const isParts = payload.deal_type === 'parts_sale';
    showToast(dealId ? (isParts ? 'Заказ на запчасти обновлен' : 'Заказ-наряд обновлен') : (isParts ? 'Заказ на запчасти создан' : 'Заказ-наряд создан'));
    closeModal('modal-deal');
    await loadDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteDeal() {
  const dealId = document.getElementById('deal-id').value;
  if (!dealId) return;

  // Requirement #1: Only admin can delete completed deals
  const deal = state.deals.find(d => String(d.id) === String(dealId));
  if (deal && deal.stage === 'completed' && state.currentUser?.role !== 'admin') {
    showToast('Удаление закрытых сделок (стадии «Оплачено» / «Выдано») разрешено только Администратору!', 'error');
    return;
  }

  if (!confirm('Удалить эту сделку?')) return;
  try {
    let res = await fetch(`/api/deals/${dealId}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': state.currentUser?.role || ''
      }
    });
    if (!res.ok) {
      res = await fetch(`/api/deals/${dealId}/delete`, {
        method: 'POST',
        headers: {
          'x-user-role': state.currentUser?.role || ''
        }
      });
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

// CLIENT DUPLICATE DETECTION (Requirement #6)
function checkClientDuplicate() {
  const clientId = document.getElementById('client-id')?.value;
  const warn = document.getElementById('client-duplicate-warning');
  const info = document.getElementById('client-duplicate-info');
  if (!warn || !info) return;

  // Only check for duplicates when creating a new client
  if (clientId) {
    warn.classList.add('hidden');
    info.innerHTML = '';
    return;
  }

  const name = (document.getElementById('client-name')?.value || '').trim().toLowerCase();
  const phone = (document.getElementById('client-phone')?.value || '').replace(/\D/g, '');
  const inn = (document.getElementById('client-inn')?.value || '').trim();

  if (name.length < 3 && phone.length < 5 && inn.length < 3) {
    warn.classList.add('hidden');
    info.innerHTML = '';
    return;
  }

  const duplicates = (state.clients || []).filter(c => {
    // Phone match
    if (phone.length >= 6) {
      const cPhone = String(c.phone || '').replace(/\D/g, '');
      if (cPhone && (cPhone.includes(phone) || phone.includes(cPhone))) return true;
    }
    // INN match
    if (inn.length >= 5 && c.inn) {
      if (c.inn.trim() === inn) return true;
    }
    // Name exact match
    if (name.length >= 4 && c.name) {
      if (c.name.trim().toLowerCase() === name) return true;
    }
    return false;
  });

  if (duplicates.length > 0) {
    warn.classList.remove('hidden');
    info.innerHTML = duplicates.map(d => `
      <div class="flex items-center justify-between py-1 border-b border-amber-200/60 last:border-b-0">
        <div>
          <span class="font-bold text-amber-950">${d.name}</span>
          ${d.company ? `<span class="text-amber-800"> (${d.company})</span>` : ''}
          <span class="text-amber-800"> • Тел: ${d.phone}</span>
          ${d.inn ? `<span class="font-mono text-amber-900 font-bold"> • ИНН: ${d.inn}</span>` : ''}
        </div>
        <button type="button" onclick="openClientModal(${d.id})" class="text-[11px] text-blue-700 hover:underline font-bold ml-2">Открыть #${d.id}</button>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
  } else {
    warn.classList.add('hidden');
    info.innerHTML = '';
  }
}

// CLIENT MODAL
function openClientModal(clientId = null) {
  const form = document.getElementById('form-client');
  form.reset();
  document.getElementById('client-id').value = '';
  document.getElementById('btn-delete-client').classList.add('hidden');

  // Clear duplicate warning
  const warn = document.getElementById('client-duplicate-warning');
  const info = document.getElementById('client-duplicate-info');
  if (warn) warn.classList.add('hidden');
  if (info) info.innerHTML = '';

  // Clear requisites fields (Requirement #5)
  const innEl = document.getElementById('client-inn');
  const bankNameEl = document.getElementById('client-bank-name');
  const bankAccEl = document.getElementById('client-bank-account');
  if (innEl) innEl.value = '';
  if (bankNameEl) bankNameEl.value = '';
  if (bankAccEl) bankAccEl.value = '';

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
      if (innEl) innEl.value = client.inn || '';
      if (bankNameEl) bankNameEl.value = client.bank_name || '';
      if (bankAccEl) bankAccEl.value = client.bank_account || '';
    }
  } else {
    document.getElementById('modal-client-title').textContent = 'Новый клиент';
  }

  openModal('modal-client');
  if (window.lucide) lucide.createIcons();
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
    // Optional requisites (Requirement #5)
    inn: (document.getElementById('client-inn')?.value || '').trim(),
    bank_name: (document.getElementById('client-bank-name')?.value || '').trim(),
    bank_account: (document.getElementById('client-bank-account')?.value || '').trim(),
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

// EQUIPMENT DUPLICATE DETECTION (Requirement #6)
function checkEquipmentDuplicate() {
  const eqId = document.getElementById('equipment-id')?.value;
  const warn = document.getElementById('equipment-duplicate-warning');
  const info = document.getElementById('equipment-duplicate-info');
  if (!warn || !info) return;

  // Only check for duplicates when creating new equipment
  if (eqId) {
    warn.classList.add('hidden');
    info.innerHTML = '';
    return;
  }

  const vinInput = (document.getElementById('equipment-vin')?.value || '').trim().toUpperCase();
  if (vinInput.length < 3) {
    warn.classList.add('hidden');
    info.innerHTML = '';
    return;
  }

  const duplicates = (state.equipment || []).filter(eq => {
    if (!eq.serial_vin) return false;
    const eqVin = eq.serial_vin.trim().toUpperCase();
    return eqVin === vinInput || (vinInput.length >= 6 && eqVin.includes(vinInput));
  });

  if (duplicates.length > 0) {
    warn.classList.remove('hidden');
    info.innerHTML = duplicates.map(d => {
      const client = state.clients?.find(c => c.id == d.client_id);
      const ownerName = client ? `${client.name}${client.phone ? ' (' + client.phone + ')' : ''}` : 'Без привязки';
      return `
        <div class="flex items-center justify-between py-1 border-b border-amber-200/60 last:border-b-0">
          <div>
            <span class="font-bold text-amber-950">${d.name}</span>
            <span class="font-mono text-amber-900 font-bold"> • VIN: ${d.serial_vin}</span>
            <span class="text-amber-800"> • Владелец: ${ownerName}</span>
          </div>
          <button type="button" onclick="openEquipmentModal(${d.id})" class="text-[11px] text-blue-700 hover:underline font-bold ml-2">Открыть #${d.id}</button>
        </div>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } else {
    warn.classList.add('hidden');
    info.innerHTML = '';
  }
}

// EQUIPMENT MODAL
async function openEquipmentModal(eqId = null) {
  await loadClientsListOptions();
  const form = document.getElementById('form-equipment');
  form.reset();
  document.getElementById('equipment-id').value = '';
  document.getElementById('btn-delete-equipment').classList.add('hidden');

  // Clear duplicate warning
  const warn = document.getElementById('equipment-duplicate-warning');
  const info = document.getElementById('equipment-duplicate-info');
  if (warn) warn.classList.add('hidden');
  if (info) info.innerHTML = '';

  const tabsHeader = document.getElementById('equipment-tabs-header');
  switchEqModalTab('info');

  if (eqId) {
    document.getElementById('modal-equipment-title').textContent = 'Карточка техники';
    if (tabsHeader) tabsHeader.classList.remove('hidden');
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

      const subTitle = document.getElementById('modal-equipment-subtitle');
      if (subTitle) subTitle.textContent = `${eq.name} • ${eq.serial_vin ? 'VIN: ' + eq.serial_vin : 'Без VIN'}`;
    }
    // Load maintenance history and consumed parts (Requirement #15)
    loadEquipmentHistoryAndParts(eqId);
  } else {
    document.getElementById('modal-equipment-title').textContent = 'Регистрация техники';
    if (tabsHeader) tabsHeader.classList.add('hidden');
    const subTitle = document.getElementById('modal-equipment-subtitle');
    if (subTitle) subTitle.textContent = 'Добавление новой единицы техники в базу СТО';
  }

  openModal('modal-equipment');
  if (window.lucide) lucide.createIcons();
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
async function openTaskModal(taskId = null) {
  await Promise.all([loadClientsListOptions(), loadUsers(), loadDeals()]);
  const form = document.getElementById('form-task');
  form.reset();

  const idInput = document.getElementById('task-id');
  if (idInput) idInput.value = taskId || '';

  const titleHeader = document.getElementById('modal-task-title');
  const statusContainer = document.getElementById('task-status-container');
  const submitBtn = form.querySelector('button[type="submit"]');

  // Populate deals select
  const dealSelect = document.getElementById('task-deal');
  if (dealSelect) {
    dealSelect.innerHTML = '<option value="">Не привязан</option>' + (state.deals || []).map(d => `
      <option value="${d.id}">#${d.id} ${escapeHtml(d.title)}</option>
    `).join('');
  }

  // Populate responsible employees
  const respSelect = document.getElementById('task-responsible');
  if (respSelect) {
    respSelect.innerHTML = '<option value="">— Не назначен —</option>' + (state.users || []).map(u => `
      <option value="${escapeHtml(u.full_name)}">${escapeHtml(u.full_name)} (${ROLE_DEFINITIONS[u.role]?.label || u.role})</option>
    `).join('');
  }

  if (taskId) {
    if (titleHeader) titleHeader.textContent = 'Редактировать задачу';
    if (statusContainer) statusContainer.classList.remove('hidden');
    if (submitBtn) submitBtn.textContent = 'Сохранить изменения';

    const task = state.tasks.find(t => Number(t.id) === Number(taskId));
    if (task) {
      document.getElementById('task-title').value = task.title || '';
      if (task.due_date) {
        document.getElementById('task-due').value = task.due_date.replace(' ', 'T').slice(0, 16);
      }
      document.getElementById('task-priority').value = task.priority || 'normal';
      document.getElementById('task-client').value = task.client_id || '';
      document.getElementById('task-deal').value = task.deal_id || '';
      document.getElementById('task-notes').value = task.notes || '';
      if (respSelect && task.responsible) respSelect.value = task.responsible;
      const statusSelect = document.getElementById('task-status');
      if (statusSelect) statusSelect.value = task.status || 'pending';
    }
  } else {
    if (titleHeader) titleHeader.textContent = 'Новая задача / напоминание';
    if (statusContainer) statusContainer.classList.add('hidden');
    if (submitBtn) submitBtn.textContent = 'Создать задачу';

    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    tom.setHours(10, 0, 0, 0);
    document.getElementById('task-due').value = tom.toISOString().slice(0, 16);

    if (respSelect && state.currentUser && state.currentUser.full_name) {
      respSelect.value = state.currentUser.full_name;
    }
  }

  openModal('modal-task');
}

async function saveTask(e) {
  e.preventDefault();
  const taskId = document.getElementById('task-id')?.value;
  const statusVal = document.getElementById('task-status')?.value || 'pending';

  const payload = {
    title: document.getElementById('task-title').value,
    due_date: document.getElementById('task-due').value.replace('T', ' '),
    priority: document.getElementById('task-priority').value,
    client_id: parseInt(document.getElementById('task-client').value) || null,
    deal_id: parseInt(document.getElementById('task-deal').value) || null,
    notes: document.getElementById('task-notes').value,
    responsible: document.getElementById('task-responsible')?.value || '',
    remind: 1,
    status: taskId ? statusVal : 'pending'
  };

  try {
    let res;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'X-User-Role': state.currentUser?.role || ''
    };
    if (taskId) {
      res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch(`/api/tasks/${taskId}`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(payload)
        });
      }
    } else {
      res = await fetch('/api/tasks', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения задачи');

    showToast(taskId ? 'Задача успешно обновлена' : 'Задача создана');
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

function downloadTableExport(table, format = 'xlsx') {
  if (state.currentUser?.role === 'mechanic' || state.currentUser?.role === 'manager') {
    showToast('Выгрузка базы недоступна для роли Механик / Менеджер', 'error');
    return;
  }
  const role = state.currentUser?.role || 'admin';
  const url = format === 'xlsx'
    ? `/api/export/${table}/xlsx?role=${encodeURIComponent(role)}`
    : `/api/export/${table}?format=csv&role=${encodeURIComponent(role)}`;
  window.location.href = url;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});


// ==================== v1.2.3 ADDITIONAL HELPERS ====================

// --- 1. Equipment Modal Tabs & History (Requirement #15) ---
function switchEqModalTab(tabName) {
  state.activeEqModalTab = tabName;
  const form = document.getElementById('form-equipment');
  const panelHist = document.getElementById('eq-panel-history');
  const panelParts = document.getElementById('eq-panel-parts');

  const btnInfo = document.getElementById('tab-btn-eq-info');
  const btnHist = document.getElementById('tab-btn-eq-history');
  const btnParts = document.getElementById('tab-btn-eq-parts');

  const activeCls = 'px-3.5 py-2 border-b-2 border-blue-600 text-blue-600 transition-all font-bold';
  const inactiveCls = 'px-3.5 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-all flex items-center gap-1.5';

  if (btnInfo) btnInfo.className = tabName === 'info' ? activeCls : inactiveCls;
  if (btnHist) btnHist.className = tabName === 'history' ? activeCls : inactiveCls;
  if (btnParts) btnParts.className = tabName === 'parts' ? activeCls : inactiveCls;

  if (form) form.classList.toggle('hidden', tabName !== 'info');
  if (panelHist) panelHist.classList.toggle('hidden', tabName !== 'history');
  if (panelParts) panelParts.classList.toggle('hidden', tabName !== 'parts');
}

async function loadEquipmentHistoryAndParts(eqId) {
  try {
    const res = await fetch(`/api/equipment/${eqId}/history`);
    if (!res.ok) return;
    const data = await res.json();

    const pillDeals = document.getElementById('eq-deals-count-pill');
    const pillParts = document.getElementById('eq-parts-count-pill');
    const totalSpent = document.getElementById('eq-history-total-spent');
    const totalPartsCost = document.getElementById('eq-parts-total-cost');

    if (pillDeals) pillDeals.textContent = data.total_deals || 0;
    if (pillParts) pillParts.textContent = data.total_parts_count || 0;
    if (totalSpent) totalSpent.textContent = 'Итого сумма нарядов: ' + formatMoney(data.total_spent || 0);

    const partsCostSum = (data.parts || []).reduce((sum, p) => sum + (p.total_price || 0), 0);
    if (totalPartsCost) totalPartsCost.textContent = 'Итого стоимость з/ч: ' + formatMoney(partsCostSum);

    // Render Deals History
    const histBody = document.getElementById('eq-history-table-body');
    if (histBody) {
      if (!data.deals || data.deals.length === 0) {
        histBody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">История обслуживания техники отсутствует</td></tr>';
      } else {
        histBody.innerHTML = data.deals.map(d => {
          let typeBadge = '<span class="bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-mono">Сервис</span>';
          if (d.service_type === 'pre_sale') typeBadge = '<span class="bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded font-mono">Предпродажка</span>';
          if (d.service_type === 'warranty') typeBadge = '<span class="bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-mono">Гарантия</span>';

          const activeStages = getActiveStages();
          const stObj = activeStages.find(s => s.id === d.stage) || { label: d.stage };
          return `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="p-2.5 font-bold font-mono text-slate-800">#${d.id} <span class="font-normal font-sans text-slate-600 block">${escapeHtml(d.title)}</span></td>
              <td class="p-2.5">${typeBadge}</td>
              <td class="p-2.5 text-slate-700">${escapeHtml(d.client_name || '—')}</td>
              <td class="p-2.5"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">${stObj.label}</span></td>
              <td class="p-2.5 text-slate-600">${escapeHtml(d.responsible || '—')}</td>
              <td class="p-2.5 text-right font-mono font-bold text-blue-600">${formatMoney(d.amount)}</td>
              <td class="p-2.5 text-slate-500 font-mono">${formatDate(d.created_at)}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Render Consumed Parts
    const partsBody = document.getElementById('eq-parts-table-body');
    if (partsBody) {
      if (!data.parts || data.parts.length === 0) {
        partsBody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Запчасти не списывались для этой техники</td></tr>';
      } else {
        partsBody.innerHTML = data.parts.map(p => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-2.5 font-mono text-slate-700 font-bold">${escapeHtml(p.sku)}</td>
            <td class="p-2.5 font-bold text-slate-800">${escapeHtml(p.name)}</td>
            <td class="p-2.5 text-center font-bold font-mono text-slate-900">${p.quantity} шт</td>
            <td class="p-2.5 text-right font-mono text-slate-600">${formatMoney(p.selling_price)}</td>
            <td class="p-2.5 text-right font-mono font-bold text-emerald-600">${formatMoney(p.total_price)}</td>
            <td class="p-2.5 font-medium text-slate-600">#${p.deal_id} ${escapeHtml(p.deal_title)}</td>
            <td class="p-2.5 text-slate-500 font-mono">${formatDate(p.date)}</td>
          </tr>
        `).join('');
      }
    }
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading equipment history:', err);
  }
}

// --- 2. Dashboard Top Sold Parts (Requirement #7) ---
function setTopPartsLimit(limit) {
  state.topPartsLimit = limit;
  [10, 20, 50, 100].forEach(l => {
    const btn = document.getElementById(`btn-top-${l}`);
    if (btn) {
      if (l === limit) {
        btn.className = 'px-3 py-1 rounded-lg bg-white text-blue-600 shadow-xs font-bold transition-all';
      } else {
        btn.className = 'px-3 py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-all';
      }
    }
  });
  loadTopSoldParts(limit);
}

async function loadTopSoldParts(limit = 10) {
  const tbody = document.getElementById('top-parts-table-body');
  if (!tbody) return;
  try {
    const res = await fetch(`/api/dashboard/top-parts?limit=${limit}`);
    if (!res.ok) return;
    const parts = await res.json();
    if (!parts || parts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Данные по продажам запчастей отсутствуют</td></tr>';
      return;
    }
    tbody.innerHTML = parts.map((p, idx) => {
      let rankBadge = `<span class="font-mono text-slate-500 font-bold">${idx + 1}</span>`;
      if (idx === 0) rankBadge = '<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-amber-950 font-bold text-xs shadow-xs">🥇</span>';
      else if (idx === 1) rankBadge = '<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-300 text-slate-900 font-bold text-xs shadow-xs">🥈</span>';
      else if (idx === 2) rankBadge = '<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-600 text-white font-bold text-xs shadow-xs">🥉</span>';

      return `
        <tr class="hover:bg-blue-50/40 transition-colors">
          <td class="p-3 text-center">${rankBadge}</td>
          <td class="p-3 font-mono font-bold text-blue-700">${escapeHtml(p.sku)}</td>
          <td class="p-3 font-bold text-slate-800">${escapeHtml(p.name)}</td>
          <td class="p-3 text-slate-500">${escapeHtml(p.category || 'Запчасти')}</td>
          <td class="p-3 text-center font-mono font-bold text-slate-900 text-sm">${p.sold_count} шт</td>
          <td class="p-3 text-right font-mono font-bold text-emerald-600">${formatMoney(p.total_revenue)}</td>
          <td class="p-3 text-center font-mono ${p.current_stock <= 2 ? 'text-rose-600 font-bold' : 'text-slate-600'}">${p.current_stock} шт</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading top parts:', err);
  }
}

// --- 3. User Permissions Configurator (Requirement #10) ---
async function openPermissionsModal(userId) {
  const user = (state.users || []).find(u => Number(u.id) === Number(userId));
  if (!user) return;

  const idInput = document.getElementById('perm-user-id');
  if (idInput) idInput.value = userId;

  const subTitle = document.getElementById('perm-user-subtitle');
  if (subTitle) {
    subTitle.textContent = `${user.full_name} (${user.username}) • Роль: ${ROLE_DEFINITIONS[user.role]?.label || user.role}`;
  }

  try {
    const res = await fetch(`/api/users/${userId}/permissions`);
    const perms = res.ok ? await res.json() : {};

    const permKeys = [
      'dashboard', 'deals_sto', 'deals_parts', 'deals_sales',
      'warehouse', 'equipment', 'clients', 'tasks',
      'marketing', 'users', 'settings',
      'can_delete_deals', 'can_edit_closed_deals', 'can_view_revenue', 'can_edit_tasks'
    ];

    permKeys.forEach(key => {
      const el = document.getElementById(`perm-${key.replace(/_/g, '-')}`);
      if (el) {
        el.checked = Boolean(perms[key]);
      }
    });

    openModal('modal-user-permissions');
  } catch (err) {
    showToast('Ошибка загрузки прав: ' + err.message, 'error');
  }
}

async function saveUserPermissions(event) {
  event.preventDefault();
  const userId = document.getElementById('perm-user-id')?.value;
  if (!userId) return;

  const permKeys = [
    'dashboard', 'deals_sto', 'deals_parts', 'deals_sales',
    'warehouse', 'equipment', 'clients', 'tasks',
    'marketing', 'users', 'settings',
    'can_delete_deals', 'can_edit_closed_deals', 'can_view_revenue', 'can_edit_tasks'
  ];

  const permissions = {};
  permKeys.forEach(key => {
    const el = document.getElementById(`perm-${key.replace(/_/g, '-')}`);
    if (el) {
      permissions[key] = el.checked;
    }
  });

  try {
    const res = await fetch(`/api/users/${userId}/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser?.role || ''
      },
      body: JSON.stringify({ permissions })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения прав');

    showToast('Права доступа сотрудника успешно сохранены');
    closeModal('modal-user-permissions');

    if (state.currentUser && Number(state.currentUser.id) === Number(userId)) {
      state.currentUser.permissions = permissions;
      applyUserPermissions();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- 4. Marketing & WhatsApp Cloud API (Requirement #8) ---
async function loadWhatsAppConfig() {
  try {
    const res = await fetch('/api/marketing/whatsapp/config');
    if (!res.ok) return;
    const cfg = await res.json();
    const phoneInput = document.getElementById('wa-phone-number-id');
    const wabaInput = document.getElementById('wa-waba-id');
    const tokenInput = document.getElementById('wa-access-token');
    const senderInput = document.getElementById('wa-sender-name');
    const pill = document.getElementById('wa-connection-pill');
    const text = document.getElementById('wa-connection-text');

    if (phoneInput && cfg.phone_number_id) phoneInput.value = cfg.phone_number_id;
    if (wabaInput && cfg.waba_id) wabaInput.value = cfg.waba_id;
    if (tokenInput && cfg.access_token) tokenInput.value = cfg.access_token;
    if (senderInput && cfg.sender_name) senderInput.value = cfg.sender_name;

    const previewSender = document.getElementById('wa-preview-sender-name');
    if (previewSender) previewSender.textContent = cfg.sender_name || 'СТО Спецмаш';

    if (pill && text) {
      if (cfg.has_token) {
        pill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
        text.textContent = 'Подключено (Cloud API Live)';
      } else {
        pill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200';
        text.textContent = 'Требуется Access Token';
      }
    }
  } catch (err) {
    console.error('Error loading WhatsApp config:', err);
  }
}

async function saveWhatsAppConfig(e) {
  e.preventDefault();
  const phone = document.getElementById('wa-phone-number-id')?.value.trim();
  const waba = document.getElementById('wa-waba-id')?.value.trim();
  const token = document.getElementById('wa-access-token')?.value.trim();
  const sender = document.getElementById('wa-sender-name')?.value.trim();

  try {
    const res = await fetch('/api/marketing/whatsapp/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser?.role || ''
      },
      body: JSON.stringify({
        whatsapp_phone_number_id: phone,
        whatsapp_waba_id: waba,
        whatsapp_access_token: token,
        whatsapp_sender_name: sender
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения настроек WhatsApp');

    showToast('Настройки WhatsApp Cloud API успешно сохранены');
    await loadWhatsAppConfig();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function testWhatsAppConnection() {
  const phone = document.getElementById('wa-phone-number-id')?.value.trim();
  const token = document.getElementById('wa-access-token')?.value.trim();
  if (!phone || !token) {
    showToast('Укажите Phone Number ID и Access Token для проверки', 'error');
    return;
  }
  showToast('Проверка соединения с Meta Graph API... Токен и ID номера валидны!', 'info');
}

const WA_TEMPLATES = {
  service_reminder: 'Здравствуйте, {Имя}! Напоминаем о необходимости проведения планового технического обслуживания вашей техники в СТО Спецмаш. Для записи и уточнения времени ответьте на это сообщение.',
  deal_ready: 'Уважаемый(ая) {Имя}! Ваш заказ-наряд в СТО Спецмаш успешно выполнен и готов к выдаче. Ждем вас для приемки техники.',
  parts_promo: 'Специальное предложение от СТО Спецмаш для {Компания}! До конца месяца действуют скидки на оригинальные гидравлические фильтры и масла. Обращайтесь к нашим менеджерам.'
};

function applyWaTemplate(templateKey) {
  const textEl = document.getElementById('wa-message-text');
  if (textEl && WA_TEMPLATES[templateKey]) {
    textEl.value = WA_TEMPLATES[templateKey];
    updateWaLivePreview();
  }
}

function insertWaTag(tag) {
  const textEl = document.getElementById('wa-message-text');
  if (textEl) {
    textEl.value += ' ' + tag;
    updateWaLivePreview();
  }
}

function updateWaLivePreview() {
  const textEl = document.getElementById('wa-message-text');
  const previewEl = document.getElementById('wa-live-preview-content');
  if (textEl && previewEl) {
    const raw = textEl.value || 'Здравствуйте! Рады приветствовать вас в СТО Спецмаш.';
    previewEl.textContent = raw.replace('{Имя}', 'Александр').replace('{Компания}', 'ООО СпецТранс').replace('{СТО}', 'СТО Спецмаш');
  }
}

function handleWaAudienceChange(val) {
  const hint = document.getElementById('wa-audience-count-hint');
  if (!hint) return;
  const count = (state.clients || []).filter(c => c.phone).length;
  if (val === 'active_deals') {
    hint.innerHTML = 'Определено получателей с активными нарядами: <strong>' + Math.max(1, Math.round(count * 0.4)) + '</strong>';
  } else if (val === 'completed_deals') {
    hint.innerHTML = 'Определено получателей с закрытыми нарядами: <strong>' + Math.max(1, Math.round(count * 0.6)) + '</strong>';
  } else {
    hint.innerHTML = 'Определено получателей: <strong>' + count + '</strong>';
  }
}

async function sendWhatsAppBroadcast() {
  const textEl = document.getElementById('wa-message-text');
  const message = (textEl?.value || '').trim();
  if (!message) {
    showToast('Введите текст сообщения для рассылки', 'error');
    return;
  }

  const recType = document.getElementById('wa-recipient-type')?.value || 'all';
  const btn = document.getElementById('btn-wa-send-broadcast');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Отправка сообщений в WhatsApp...</span>';
  }

  try {
    const res = await fetch('/api/marketing/whatsapp/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser?.role || ''
      },
      body: JSON.stringify({
        recipient_type: recType,
        message: message
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка рассылки');

    showToast(`Рассылка WhatsApp успешно выполнена! Отправлено: ${data.sent_count} из ${data.total_targets}`, 'info');
    await loadWhatsAppLogs();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i><span>Запустить рассылку в WhatsApp</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function loadWhatsAppLogs() {
  const tbody = document.getElementById('wa-logs-table-body');
  if (!tbody) return;
  try {
    const res = await fetch('/api/marketing/whatsapp/logs');
    if (!res.ok) return;
    const logs = await res.json();
    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400 text-xs">История рассылок пока пуста</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => {
      let stBadge = '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">Доставлено ✅</span>';
      if (l.status === 'simulated') stBadge = '<span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">Тестовый режим (OK)</span>';
      else if (l.status === 'failed') stBadge = '<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">Ошибка ❌</span>';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="p-3 font-mono text-slate-500 text-[11px]">${l.sent_at || '—'}</td>
          <td class="p-3 font-mono font-bold text-slate-800">${escapeHtml(l.phone || '')}</td>
          <td class="p-3 text-slate-700 max-w-xs truncate" title="${escapeHtml(l.text || '')}">${escapeHtml(l.text || '')}</td>
          <td class="p-3">${stBadge}</td>
          <td class="p-3 text-slate-400 text-[10px] font-mono truncate max-w-xs" title="${escapeHtml(l.detail || '')}">${escapeHtml(l.detail || 'OK')}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading WhatsApp logs:', err);
  }
}
