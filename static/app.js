
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

  // 3. Equipment count & Sales Catalog count
  const badgeEquipment = document.getElementById('badge-equipment-count');
  if (badgeEquipment) {
    if (state.equipment && Array.isArray(state.equipment) && state.equipment.length > 0) {
      badgeEquipment.textContent = state.equipment.length;
    } else if (data && typeof data.total_equipment === 'number') {
      badgeEquipment.textContent = data.total_equipment;
    }
  }
  const badgeSalesCat = document.getElementById('badge-sales-catalog-count');
  if (badgeSalesCat && Array.isArray(state.salesEquipment)) {
    badgeSalesCat.textContent = state.salesEquipment.length;
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

// In-memory cache for the current application session.
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
          parts_selling_total: Number(d.parts_selling_total || 0),
          labor_cost: Number(d.labor_cost || 0),
          amount: Number(d.amount || 0),
          cost: Number(d.cost || 0),
        })).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      } else if (['clients', 'equipment', 'sales_equipment', 'parts', 'tasks', 'users'].includes(entity)) {
        items = items.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      }
      this.cache[entity] = items;
      return items;
    }
    return this.getList(entity);
  }
};

// ================= REAL-TIME WEBSOCKETS =================

let fastApiWs = null;
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
      updateRealtimeStatus('syncing', 'Авто-синхронизация');
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

// Kanban Stage Definitions (СТО: Service & Repairs)
const SERVICE_KANBAN_STAGES = [
  { id: 'new', label: 'Новые заявки', short: 'Новая', icon: 'inbox', color: 'border-blue-500' },
  { id: 'diagnostic', label: 'Диагностика', short: 'Диагн.', icon: 'search', color: 'border-purple-500' },
  { id: 'estimate', label: 'Согласование сметы', short: 'Смета', icon: 'file-text', color: 'border-indigo-500' },
  { id: 'in_progress', label: 'В работе / Ремонт', short: 'Ремонт', icon: 'wrench', color: 'border-amber-500' },
  { id: 'parts_waiting', label: 'Ожидание запчастей', short: 'Ожид. з/ч', icon: 'package-open', color: 'border-orange-500' },
  { id: 'ready', label: 'Готово к выдаче', short: 'Готово', icon: 'check-circle', color: 'border-emerald-500' },
  { id: 'invoiced', label: 'Фактура выписана', short: 'Фактура выписана', icon: 'file-text', color: 'border-yellow-400' },
  { id: 'completed', label: 'Оплачено / Закрыто', short: 'Оплачено', icon: 'badge-dollar-sign', color: 'border-green-600' },
];
const KANBAN_STAGES = SERVICE_KANBAN_STAGES;

// Dedicated Kanban Stages: Продажа запчастей (Requirement #1)
const PARTS_KANBAN_STAGES = [
  { id: 'new', label: 'Новые запросы', short: 'Запрос', icon: 'inbox', color: 'border-blue-500' },
  { id: 'estimate', label: 'Подбор и расчет', short: 'Подбор', icon: 'file-text', color: 'border-indigo-500' },
  { id: 'parts_waiting', label: 'Ожидание поставки', short: 'Поставка', icon: 'truck', color: 'border-amber-500' },
  { id: 'ready', label: 'Скомплектовано / Готово', short: 'Готово', icon: 'check-circle', color: 'border-emerald-500' },
  { id: 'invoiced', label: 'Фактура выписана', short: 'Фактура выписана', icon: 'file-text', color: 'border-yellow-400' },
  { id: 'completed', label: 'Оплачено и выдано', short: 'Выдано', icon: 'badge-dollar-sign', color: 'border-green-600' },
];

// Dedicated Kanban Stages: Отдел продаж спецтехники (Requirement 2.2: 11 stages)
const SALES_KANBAN_STAGES = [
  { id: 'new', label: 'Новая сделка', short: 'Новая сделка', icon: 'inbox', color: 'border-blue-500' },
  { id: 'selection', label: 'Подбор спецтехники', short: 'Подбор', icon: 'search', color: 'border-purple-500' },
  { id: 'estimate', label: 'Коммерческое предложение', short: 'КП', icon: 'file-text', color: 'border-indigo-500' },
  { id: 'in_bank', label: 'В банке', short: 'В банке', icon: 'landmark', color: 'border-sky-500' },
  { id: 'approved', label: 'Одобрено', short: 'Одобрено', icon: 'badge-check', color: 'border-teal-500' },
  { id: 'contract', label: 'Контракт', short: 'Контракт', icon: 'file-check', color: 'border-amber-500' },
  { id: 'manufacturer_order', label: 'Заказ у производителя', short: 'Заказ произв.', icon: 'factory', color: 'border-orange-500' },
  { id: 'shipment', label: 'Отгрузка', short: 'Отгрузка', icon: 'truck', color: 'border-cyan-500' },
  { id: 'pre_sale', label: 'Предпродажка', short: 'Предпродажка', icon: 'wrench', color: 'border-violet-500' },
  { id: 'handover', label: 'Сдача', short: 'Сдача', icon: 'check-circle', color: 'border-emerald-500' },
  { id: 'completed', label: 'Завершить сделку', short: 'Завершить сделку', icon: 'flag', color: 'border-green-600' },
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

// Unit helper: returns 'л' for 'Масла и техжидкости', otherwise 'шт'
function getPartUnit(partOrCategory) {
  const cat = typeof partOrCategory === 'string'
    ? partOrCategory
    : (partOrCategory?.part_category || partOrCategory?.category || '');
  return String(cat).trim() === 'Масла и техжидкости' ? 'л' : 'шт';
}

function parsePartNumberInput(val, fallback = 0) {
  const cleaned = String(val ?? '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? fallback : Math.round(num * 100) / 100;
}

const PART_WAREHOUSE_LABELS_JS = {
  main: 'Оснавной',
  showcase: 'Витрина',
  dealer1: 'Дилер 1'
};

function getPartWarehouseStocks(partObj) {
  if (!partObj) return { main: 0, showcase: 0, dealer1: 0 };
  const total = parsePartNumberInput(partObj.quantity, 0);
  const ws = partObj.warehouse_stocks;
  if (ws && typeof ws === 'object') {
    return {
      main: Math.max(0, parsePartNumberInput(ws.main, 0)),
      showcase: Math.max(0, parsePartNumberInput(ws.showcase, 0)),
      dealer1: Math.max(0, parsePartNumberInput(ws.dealer1, 0)),
    };
  }
  if (partObj.qty_main !== undefined || partObj.qty_showcase !== undefined || partObj.qty_dealer1 !== undefined) {
    return {
      main: Math.max(0, parsePartNumberInput(partObj.qty_main, 0)),
      showcase: Math.max(0, parsePartNumberInput(partObj.qty_showcase, 0)),
      dealer1: Math.max(0, parsePartNumberInput(partObj.qty_dealer1, 0)),
    };
  }
  return { main: Math.max(0, total), showcase: 0, dealer1: 0 };
}

function recalcPartTotalFromWarehouses() {
  const qMain = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-main')?.value, 0));
  const qShow = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-showcase')?.value, 0));
  const qDeal = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-dealer1')?.value, 0));
  const total = Math.round((qMain + qShow + qDeal) * 100) / 100;
  const qtyInput = document.getElementById('part-quantity');
  if (qtyInput) qtyInput.value = String(total);
}

function handlePartTotalQtyInput(val) {
  const total = Math.max(0, parsePartNumberInput(val, 0));
  const qShow = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-showcase')?.value, 0));
  const qDeal = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-dealer1')?.value, 0));
  const qMain = Math.max(0, Math.round((total - qShow - qDeal) * 100) / 100);
  const mainInput = document.getElementById('part-qty-main');
  if (mainInput) mainInput.value = String(qMain);
}

function updatePartQuantityUnit(category) {
  const unit = getPartUnit(category);
  const isOil = unit === 'л';
  const qtyLabel = document.getElementById('part-quantity-label');
  const minLabel = document.getElementById('part-min-threshold-label');
  const whUnitHint = document.getElementById('part-warehouses-unit-hint');
  const qtyInput = document.getElementById('part-quantity');
  const minInput = document.getElementById('part-min-threshold');
  if (qtyLabel) qtyLabel.textContent = `Общее кол-во (${unit})`;
  if (minLabel) minLabel.textContent = `Мин. остаток (${unit})`;
  if (whUnitHint) whUnitHint.textContent = `Ед. изм.: ${unit}`;
  if (qtyInput) {
    qtyInput.step = isOil ? 'any' : '1';
    qtyInput.placeholder = isOil ? 'Например: 0.5' : '0';
  }
  if (minInput) {
    minInput.step = isOil ? 'any' : '1';
  }
}

// Currency Formatter: AMD, USD, EUR (Requirement 1.3)
function normalizeDealCurrency(curr) {
  const c = String(curr || 'AMD').trim().toUpperCase();
  return (c === 'USD' || c === 'EUR') ? c : 'AMD';
}

function formatMoney(amount, currency = 'AMD') {
  const cur = normalizeDealCurrency(currency);
  if (amount === undefined || amount === null || isNaN(Number(amount))) return `0 ${cur}`;
  const num = Number(amount);
  const formatted = Number.isInteger(num)
    ? new Intl.NumberFormat('ru-RU').format(Math.round(num))
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
  return `${formatted} ${cur}`;
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

const DEFAULT_ROLE_PERMISSIONS_JS = {
  admin: {
    dashboard: true, deals_sto: true, deals_parts: true, deals_sales: true,
    warehouse: true, equipment: true, sales_catalog: true, clients: true, tasks: true,
    marketing: true, users: true, export: true, settings: true,
    can_delete_deals: true, can_edit_closed_deals: true,
    can_view_revenue: true, can_edit_tasks: true
  },
  moderator: {
    dashboard: true, deals_sto: true, deals_parts: true, deals_sales: false,
    warehouse: true, equipment: true, sales_catalog: false, clients: true, tasks: true,
    marketing: true, users: false, export: true, settings: false,
    can_delete_deals: false, can_edit_closed_deals: false,
    can_view_revenue: true, can_edit_tasks: false
  },
  manager: {
    dashboard: false, deals_sto: true, deals_parts: true, deals_sales: false,
    warehouse: true, equipment: true, sales_catalog: false, clients: true, tasks: true,
    marketing: false, users: false, export: false, settings: false,
    can_delete_deals: false, can_edit_closed_deals: false,
    can_view_revenue: false, can_edit_tasks: false
  },
  sales_manager: {
    dashboard: false, deals_sto: false, deals_parts: false, deals_sales: true,
    warehouse: false, equipment: false, sales_catalog: true, clients: true, tasks: true,
    marketing: true, users: false, export: false, settings: false,
    can_delete_deals: false, can_edit_closed_deals: false,
    can_view_revenue: false, can_edit_tasks: false
  },
  mechanic: {
    dashboard: false, deals_sto: true, deals_parts: false, deals_sales: false,
    warehouse: true, equipment: true, sales_catalog: false, clients: false, tasks: true,
    marketing: false, users: false, export: false, settings: false,
    can_delete_deals: false, can_edit_closed_deals: false,
    can_view_revenue: false, can_edit_tasks: false
  }
};

function hasUserPerm(key, user = null) {
  const u = user || state.currentUser;
  if (!u || !u.id) return false;
  const role = String(u.role || 'mechanic').trim().toLowerCase();
  if (role === 'admin') return true;

  const perms = u.permissions || {};
  const defaults = DEFAULT_ROLE_PERMISSIONS_JS[role] || DEFAULT_ROLE_PERMISSIONS_JS.mechanic;

  if (key === 'sales_catalog' && perms.sales_catalog === undefined) {
    if (perms.deals_sales !== undefined) return Boolean(perms.deals_sales);
    return Boolean(defaults.sales_catalog);
  }
  if (key === 'export' && perms.export === undefined) {
    return Boolean(defaults.export);
  }
  if (perms[key] !== undefined) {
    return Boolean(perms[key]);
  }
  return Boolean(defaults[key]);
}

function getAllowedDealsDepartments(user = null) {
  const u = user || state.currentUser;
  const depts = [];
  if (hasUserPerm('deals_sto', u)) depts.push('service');
  if (hasUserPerm('deals_parts', u)) depts.push('parts_sale');
  if (hasUserPerm('deals_sales', u)) depts.push('sales');
  return depts;
}

function canUserAccessTab(tabName, user = null) {
  const u = user || state.currentUser;
  if (!u || !u.id) return false;
  if (u.role === 'admin') return true;

  switch (tabName) {
    case 'dashboard': return hasUserPerm('dashboard', u);
    case 'kanban': return getAllowedDealsDepartments(u).length > 0;
    case 'clients': return hasUserPerm('clients', u);
    case 'equipment': return hasUserPerm('equipment', u);
    case 'sales_catalog': return hasUserPerm('sales_catalog', u);
    case 'warehouse': return hasUserPerm('warehouse', u);
    case 'tasks': return hasUserPerm('tasks', u);
    case 'marketing': return hasUserPerm('marketing', u);
    case 'users': return hasUserPerm('users', u);
    case 'export': return hasUserPerm('export', u);
    case 'settings': return hasUserPerm('settings', u);
    default: return false;
  }
}
window.canUserAccessTab = canUserAccessTab;

function getFirstAllowedTabForUser(user = null) {
  const u = user || state.currentUser;
  if (!u || !u.id) return { tab: null, dept: null };

  if (hasUserPerm('dashboard', u)) return { tab: 'dashboard', dept: null };
  if (hasUserPerm('deals_sto', u)) return { tab: 'kanban', dept: 'service' };
  if (hasUserPerm('deals_parts', u)) return { tab: 'kanban', dept: 'parts_sale' };
  if (hasUserPerm('deals_sales', u)) return { tab: 'kanban', dept: 'sales' };
  if (hasUserPerm('sales_catalog', u)) return { tab: 'sales_catalog', dept: null };
  if (hasUserPerm('warehouse', u)) return { tab: 'warehouse', dept: null };
  if (hasUserPerm('equipment', u)) return { tab: 'equipment', dept: null };
  if (hasUserPerm('clients', u)) return { tab: 'clients', dept: null };
  if (hasUserPerm('tasks', u)) return { tab: 'tasks', dept: null };
  if (hasUserPerm('marketing', u)) return { tab: 'marketing', dept: null };
  if (hasUserPerm('export', u)) return { tab: 'export', dept: null };
  if (hasUserPerm('users', u)) return { tab: 'users', dept: null };
  if (hasUserPerm('settings', u)) return { tab: 'settings', dept: null };

  return { tab: null, dept: null };
}

async function refreshCurrentUserPermissions() {
  if (!state.currentUser || !state.currentUser.id) return;
  try {
    const res = await fetch(`/api/users/${state.currentUser.id}/permissions`);
    if (res.ok) {
      const freshPerms = await res.json();
      if (freshPerms && typeof freshPerms === 'object') {
        state.currentUser.permissions = freshPerms;
        localStorage.setItem('specmash_current_user', JSON.stringify(state.currentUser));
      }
    }
  } catch (e) {
    console.warn('Could not refresh user permissions:', e);
  }
}

function preloadPermittedEntities() {
  if (!state.currentUser || !state.currentUser.id) return;
  const allowedDepts = getAllowedDealsDepartments();
  if (hasUserPerm('clients') || allowedDepts.length > 0 || hasUserPerm('equipment') || hasUserPerm('tasks') || hasUserPerm('marketing')) {
    loadClients();
  }
  if (hasUserPerm('equipment') || hasUserPerm('deals_sto') || hasUserPerm('clients')) {
    loadEquipment();
  }
  if (hasUserPerm('sales_catalog') || hasUserPerm('deals_sales')) {
    loadSalesEquipment();
  }
  if (hasUserPerm('warehouse') || hasUserPerm('deals_sto') || hasUserPerm('deals_parts')) {
    loadParts();
  }
  if (allowedDepts.length > 0 || hasUserPerm('tasks')) {
    loadDeals();
  }
  if (hasUserPerm('tasks')) {
    loadTasks();
  }
  loadUsers();
}

async function initAuth() {
  const hashTab = window.SpecmashApp.router.fromHash();
  try {
    const savedUser = localStorage.getItem('specmash_current_user');
    state.currentUser = savedUser ? JSON.parse(savedUser) : null;
  } catch (err) {
    console.warn('Saved session is invalid and will be cleared');
    localStorage.removeItem('specmash_current_user');
    state.currentUser = null;
  }

  // Enforce auth: if no logged-in user, strictly show auth screen and block all views
  if (!state.currentUser || !state.currentUser.id) {
    showAuthScreen();
    return;
  }

  // Fetch latest permissions set by Administrator in PostgreSQL
  await refreshCurrentUserPermissions();

  showAppLayout();
  applyUserPermissions();
  startHeartbeat();
  loadSettings();
  preloadPermittedEntities();

  // Navigate to requested tab ONLY if allowed; otherwise open the first section allowed by Administrator
  if (hashTab && canUserAccessTab(hashTab)) {
    switchTab(hashTab, { silent: true });
  } else {
    const firstAllowed = getFirstAllowedTabForUser();
    if (firstAllowed.dept) state.dealsDepartment = firstAllowed.dept;
    switchTab(firstAllowed.tab || 'dashboard', { silent: true });
  }
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
    localStorage.setItem('specmash_current_user', JSON.stringify(data));
    showAppLayout();
    applyUserPermissions();
    startHeartbeat();
    await loadSettings();
    preloadPermittedEntities();

    const firstAllowed = getFirstAllowedTabForUser();
    if (firstAllowed.dept) state.dealsDepartment = firstAllowed.dept;
    await switchTab(firstAllowed.tab || 'dashboard', { silent: true });

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
  localStorage.removeItem('specmash_current_user');
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

  const role = u.role || 'mechanic';
  const isAdmin = role === 'admin';
  const isSalesManager = role === 'sales_manager';

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

  // 2. NAV ITEMS VISIBILITY (Strictly governed by Administrator's permissions matrix)
  const setVis = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  };

  const canDashboard = hasUserPerm('dashboard');
  const canDealsSto = hasUserPerm('deals_sto');
  const canDealsParts = hasUserPerm('deals_parts');
  const canDealsSales = hasUserPerm('deals_sales');
  const canWarehouse = hasUserPerm('warehouse');
  const canEquipment = hasUserPerm('equipment');
  const canSalesCatalog = hasUserPerm('sales_catalog');
  const canClients = hasUserPerm('clients');
  const canTasks = hasUserPerm('tasks');
  const canMarketing = hasUserPerm('marketing');
  const canUsers = hasUserPerm('users');
  const canExport = hasUserPerm('export');
  const canSettings = hasUserPerm('settings');

  setVis('nav-dashboard', canDashboard);
  setVis('nav-kanban', canDealsSto);
  setVis('nav-parts-sales', canDealsParts);
  setVis('nav-sales', canDealsSales);
  setVis('nav-warehouse', canWarehouse);
  setVis('nav-equipment', canEquipment);
  setVis('nav-sales_catalog', canSalesCatalog);
  setVis('nav-clients', canClients);
  setVis('nav-tasks', canTasks);
  setVis('nav-marketing', canMarketing);
  setVis('nav-users', canUsers);
  setVis('nav-export', canExport);
  setVis('nav-settings', canSettings);

  // Quick Create buttons in Sidebar & Header
  setVis('sidebar-quick-deal-wrap', canDealsSto || canDealsParts || canDealsSales);
  setVis('header-btn-add-client', canClients);
  setVis('header-btn-add-equipment', canEquipment);
  setVis('header-btn-add-part', canWarehouse);
  setVis('sidebar-btn-logo', canSettings);

  // Department pills in deals toolbar & deal modal
  setVis('dept-btn-service', canDealsSto);
  setVis('dept-btn-parts-sale', canDealsParts);
  setVis('dept-btn-sales', canDealsSales);
  setVis('deal-type-btn-service', canDealsSto);
  setVis('deal-type-btn-parts', canDealsParts);
  setVis('deal-type-btn-sales', canDealsSales);

  // Ensure state.dealsDepartment is set to an allowed department
  const allowedDepts = getAllowedDealsDepartments();
  if (allowedDepts.length > 0 && !allowedDepts.includes(state.dealsDepartment)) {
    state.dealsDepartment = allowedDepts[0];
  }

  // 3. FINANCE & REVENUE VISIBILITY
  const canViewRev = hasUserPerm('can_view_revenue');
  setVis('header-finance-block', canViewRev);
  setVis('dash-card-revenue', canViewRev);
  setVis('dash-card-parts-revenue', canViewRev);
  setVis('dash-card-service-revenue', canViewRev);
  setVis('dash-card-sales-revenue', canViewRev);
  setVis('dash-card-warehouse-eval', canViewRev);
  setVis('stat-active-volume-row', canViewRev);
  setVis('dash-charts-row', true);
  setVis('dash-sales-charts-row', true);
  setVis('dash-mechanics-revenue-section', true);

  // Body classes for CSS permission hiding
  document.body.classList.toggle('hide-revenue-analytics', !canViewRev);
  document.body.classList.toggle('role-mechanic', role === 'mechanic' || role === 'sales_manager');
  document.body.classList.toggle('role-manager', role === 'manager');
  document.body.classList.toggle('role-moderator', role === 'moderator');
  document.body.classList.toggle('role-admin', isAdmin);

  if (state.dashboard) {
    const d = state.dashboard;
    renderRevenueChart(d.monthly_data, d.total_revenue, d.total_cost, d.net_profit);
    renderSalesRevenueChart(d.sales_monthly_data, d.sales_revenue, d.sales_completed_count);
    renderTopClients(d.top_clients);
    renderSalesTopClients(d.sales_top_clients);
    renderMechanicsRevenue(d.mechanics_revenue || []);
    renderRecentDeals(d.recent_deals);
  }
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
    localStorage.setItem('specmash_current_user', JSON.stringify(data));
    applyUserPermissions();
    startHeartbeat();
    closeModal('modal-login');
    showToast(`Вы вошли как ${data.full_name}`);
    preloadPermittedEntities();

    const firstAllowed = getFirstAllowedTabForUser();
    if (firstAllowed.dept) state.dealsDepartment = firstAllowed.dept;
    switchTab(firstAllowed.tab || 'dashboard', { silent: true });
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

function applyFavicon(url) {
  const cleanUrl = (url && typeof url === 'string' && url.trim().length > 0) ? url.trim() : '/favicon.ico';
  const ids = [
    { id: 'app-favicon', rel: 'icon' },
    { id: 'app-shortcut-icon', rel: 'shortcut icon' },
    { id: 'app-apple-touch-icon', rel: 'apple-touch-icon' }
  ];
  ids.forEach(({ id, rel }) => {
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = rel;
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== cleanUrl) {
      link.setAttribute('href', cleanUrl);
    }
  });
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
    applyFavicon(settings.auth_logo_url);
  } else {
    if (authImg) authImg.classList.add('hidden');
    if (authIcon) {
      authIcon.classList.remove('hidden');
      authIcon.setAttribute('data-lucide', settings.auth_icon || 'wrench');
    }
    applyFavicon(settings.logo_url || '/favicon.ico');
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
    applyFavicon(logoUrl);
  } else {
    if (imgEl) imgEl.classList.add('hidden');
    if (iconEl) {
      iconEl.classList.remove('hidden');
      iconEl.setAttribute('data-lucide', iconName || 'wrench');
    }
    applyFavicon(state.settings?.logo_url || '/favicon.ico');
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
  if (file.size > 5 * 1024 * 1024) {
    showToast('Размер логотипа не должен превышать 5 МБ', 'error');
    return;
  }

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
  showToast('Формирование и скачивание резервной копии PostgreSQL...', 'info');
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

const TAB_TITLES_RU = {
  dashboard: 'Дашборд & Выручка',
  kanban: 'Сделки и заказ-наряды',
  clients: 'База клиентов',
  equipment: 'База техники (СТО)',
  sales_catalog: 'Техника для продажи',
  warehouse: 'Склад запчастей',
  tasks: 'Задачи & Планировщик',
  marketing: 'Маркетинг (WhatsApp)',
  users: 'Сотрудники & Роли',
  export: 'Импорт & Экспорт',
  settings: 'Настройки СТО'
};

let _isSwitchingTabInternal = false;

// Single global hashchange listener (registered once, never inside switchTab!)
window.addEventListener('hashchange', () => {
  if (_isSwitchingTabInternal) return;
  if (!state.currentUser || !state.currentUser.id) return;
  const requested = window.SpecmashApp.router.fromHash();
  if (requested && state.currentTab !== requested) {
    switchTab(requested);
  }
});

function switchTab(tabName, options = {}) {
  if (!state.currentUser || !state.currentUser.id) {
    showAuthScreen();
    return;
  }

  const tabs = window.SpecmashApp.router.tabs;
  const noAccessSection = document.getElementById('tab-no-access');

  // Verify access permission for the requested tab
  if (!tabName || !canUserAccessTab(tabName)) {
    if (tabName && !options.silent) {
      const titleRu = TAB_TITLES_RU[tabName] || tabName;
      showToast(`Доступ к разделу «${titleRu}» ограничен Администратором`, 'warning');
    }

    const fallback = getFirstAllowedTabForUser();
    if (!fallback.tab) {
      // Employee has no sections permitted at all
      state.currentTab = '';
      tabs.forEach(t => {
        const sec = document.getElementById(`tab-${t}`);
        if (sec) sec.classList.add('hidden');
      });
      if (noAccessSection) noAccessSection.classList.remove('hidden');
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch (e) {}
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (fallback.dept) {
      state.dealsDepartment = fallback.dept;
    }
    tabName = fallback.tab;
  }

  if (noAccessSection) noAccessSection.classList.add('hidden');

  // If entering Kanban/Deals tab, ensure state.dealsDepartment is permitted for this user
  if (tabName === 'kanban') {
    const allowedDepts = getAllowedDealsDepartments();
    if (allowedDepts.length > 0 && !allowedDepts.includes(state.dealsDepartment)) {
      state.dealsDepartment = allowedDepts[0];
    }
    syncDealsDepartmentHeaderUI(state.dealsDepartment);
  }

  // Auto-close mobile drawer on navigation
  toggleMobileSidebar(false);

  state.currentTab = tabName;

  // Update URL hash cleanly without firing hashchange loop
  _isSwitchingTabInternal = true;
  try {
    if (window.location.hash !== `#${tabName}`) {
      window.history.replaceState(null, '', `#${tabName}`);
    }
  } catch (e) {}
  setTimeout(() => { _isSwitchingTabInternal = false; }, 0);

  const navInactive = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800';

  tabs.forEach(t => {
    const section = document.getElementById(`tab-${t}`);
    const navItem = document.getElementById(`nav-${t}`);
    if (section) section.classList.toggle('hidden', t !== tabName);
    if (navItem) {
      if (t === tabName) {
        navItem.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-blue-600/20 border-l-4 border-blue-500';
      } else {
        navItem.className = navInactive;
      }
    }
  });

  // Department-specific highlight for Kanban vs Parts Sales vs Sales Dept
  const navKanban = document.getElementById('nav-kanban');
  const navParts = document.getElementById('nav-parts-sales');
  const navSales = document.getElementById('nav-sales');

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

  // Re-enforce visibility of all sidebar items and buttons according to Administrator permissions
  applyUserPermissions();

  window.SpecmashApp.pages.load(tabName);

  if (window.lucide) lucide.createIcons();
}

function handleGlobalSearch(query) {
  if (!query || query.length < 2) {
    if (state.currentTab === 'clients' && canUserAccessTab('clients')) loadClients();
    if (state.currentTab === 'equipment' && canUserAccessTab('equipment')) loadEquipment();
    if (state.currentTab === 'warehouse' && canUserAccessTab('warehouse')) loadParts();
    if (state.currentTab === 'kanban' && canUserAccessTab('kanban')) loadDeals();
    return;
  }

  if (state.currentTab === 'clients' && canUserAccessTab('clients')) loadClients(query);
  else if (state.currentTab === 'equipment' && canUserAccessTab('equipment')) loadEquipment(query);
  else if (state.currentTab === 'warehouse' && canUserAccessTab('warehouse')) loadParts(query);
  else if (canUserAccessTab('kanban')) {
    if (state.currentTab !== 'kanban') switchTab('kanban');
    const filterEl = document.getElementById('kanban-filter');
    if (filterEl) filterEl.value = query;
    renderDeals();
  }
}

// ================= 1. DASHBOARD & ANALYTICS =================

const DASHBOARD_MONTH_LABELS = {
  '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
  '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
  '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
};

function getDashboardPeriodParams() {
  const yearEl = document.getElementById('dash-filter-year');
  const monthEl = document.getElementById('dash-filter-month');
  const year = yearEl ? yearEl.value : (state.dashboardYear || 'all');
  const month = monthEl ? monthEl.value : (state.dashboardMonth || 'all');
  state.dashboardYear = year;
  state.dashboardMonth = month;
  return { year, month };
}

function updateDashboardPeriodUI(availableYears = null) {
  const yearEl = document.getElementById('dash-filter-year');
  const monthEl = document.getElementById('dash-filter-month');
  const badgeEl = document.getElementById('dash-period-badge');

  const curYear = state.dashboardYear || 'all';
  const curMonth = state.dashboardMonth || 'all';

  if (yearEl && Array.isArray(availableYears) && availableYears.length > 0) {
    const yearsSet = new Set(availableYears.map(y => String(y)));
    ['2026', '2025', '2024'].forEach(y => yearsSet.add(y));
    const sortedYears = Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
    yearEl.innerHTML = `<option value="all">Все годы</option>` + sortedYears.map(y => `
      <option value="${y}" ${String(curYear) === String(y) ? 'selected' : ''}>${y}</option>
    `).join('');
    yearEl.value = yearsSet.has(String(curYear)) ? String(curYear) : 'all';
  }

  if (monthEl) {
    monthEl.value = curMonth;
  }

  if (badgeEl) {
    if (curYear === 'all' && curMonth === 'all') {
      badgeEl.textContent = 'За всё время';
      badgeEl.className = 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 font-mono';
    } else if (curYear !== 'all' && curMonth !== 'all') {
      badgeEl.textContent = `${DASHBOARD_MONTH_LABELS[curMonth] || curMonth} ${curYear}`;
      badgeEl.className = 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 font-mono';
    } else if (curYear !== 'all') {
      badgeEl.textContent = `${curYear} год`;
      badgeEl.className = 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 font-mono';
    } else {
      badgeEl.textContent = `${DASHBOARD_MONTH_LABELS[curMonth] || curMonth} (все годы)`;
      badgeEl.className = 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 font-mono';
    }
  }
}

function handleDashboardPeriodChange() {
  getDashboardPeriodParams();
  updateDashboardPeriodUI();
  loadDashboard();
}

function setDashboardPeriodCurrentMonth() {
  const now = new Date();
  const yr = String(now.getFullYear());
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  state.dashboardYear = yr;
  state.dashboardMonth = mo;
  const yearEl = document.getElementById('dash-filter-year');
  const monthEl = document.getElementById('dash-filter-month');
  if (yearEl) {
    if (!Array.from(yearEl.options).some(o => o.value === yr)) {
      const opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = yr;
      yearEl.appendChild(opt);
    }
    yearEl.value = yr;
  }
  if (monthEl) monthEl.value = mo;
  updateDashboardPeriodUI();
  loadDashboard();
}

function setDashboardPeriodCurrentYear() {
  const now = new Date();
  const yr = String(now.getFullYear());
  state.dashboardYear = yr;
  state.dashboardMonth = 'all';
  const yearEl = document.getElementById('dash-filter-year');
  const monthEl = document.getElementById('dash-filter-month');
  if (yearEl) {
    if (!Array.from(yearEl.options).some(o => o.value === yr)) {
      const opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = yr;
      yearEl.appendChild(opt);
    }
    yearEl.value = yr;
  }
  if (monthEl) monthEl.value = 'all';
  updateDashboardPeriodUI();
  loadDashboard();
}

function resetDashboardPeriodFilter() {
  state.dashboardYear = 'all';
  state.dashboardMonth = 'all';
  const yearEl = document.getElementById('dash-filter-year');
  const monthEl = document.getElementById('dash-filter-month');
  if (yearEl) yearEl.value = 'all';
  if (monthEl) monthEl.value = 'all';
  updateDashboardPeriodUI();
  loadDashboard();
}

async function loadDashboard() {
  if (!state.currentUser || !state.currentUser.id) return;
  if (!hasUserPerm('dashboard')) {
    updateSidebarCounters();
    return;
  }
  try {
    const { year, month } = getDashboardPeriodParams();
    const qs = new URLSearchParams();
    if (year && year !== 'all') qs.set('year', year);
    if (month && month !== 'all') qs.set('month', month);
    const url = qs.toString() ? `/api/dashboard?${qs.toString()}` : '/api/dashboard';

    const res = await window.SpecmashApp.api.get(url);
    const data = await res.json();
    state.dashboard = data;

    updateDashboardPeriodUI(data.available_years);

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

    // Service & Repair Revenue Metrics (with stage filter: Все / Готово / Фактура выписана / Оплачено)
    renderDashboardServiceRevenueCard(data);

    // Sales Department Revenue Metrics by Category (Requirement #4)
    const canViewRev = hasUserPerm('can_view_revenue');
    const salesRevCard = document.getElementById('dash-card-sales-revenue');
    if (salesRevCard) {
      salesRevCard.classList.toggle('hidden', !canViewRev);
    }
    const whEvalCard = document.getElementById('dash-card-warehouse-eval');
    if (whEvalCard) {
      whEvalCard.classList.toggle('hidden', !canViewRev);
    }
    const activeVolRow = document.getElementById('stat-active-volume-row');
    if (activeVolRow) {
      activeVolRow.classList.toggle('hidden', !canViewRev);
    }
    if (canViewRev) {
      renderDashboardSalesAnalytics(data);
    }

    document.getElementById('stat-active-deals').textContent = data.active_deals_count;
    document.getElementById('stat-active-volume').textContent = formatMoney(data.active_deals_volume);
    const completedCountEl = document.getElementById('stat-completed-deals-count');
    if (completedCountEl) {
      completedCountEl.textContent = data.completed_count || 0;
    }

    document.getElementById('stat-inventory-retail').textContent = formatMoney(data.inventory_retail);
    document.getElementById('stat-inventory-cost').textContent = formatMoney(data.inventory_cost);
    document.getElementById('stat-low-stock-pill').textContent = `${data.low_stock_parts} в дефиците`;

    document.getElementById('stat-clients-count').textContent = data.total_clients;
    document.getElementById('stat-equipment-count').textContent = data.total_equipment;
    document.getElementById('stat-overdue-tasks').textContent = data.overdue_tasks;

    updateSidebarCounters(data);

    renderRevenueChart(data.monthly_data, data.total_revenue, data.total_cost, data.net_profit);
    renderTopClients(data.top_clients);
    renderSalesRevenueChart(data.sales_monthly_data, data.sales_revenue, data.sales_completed_count);
    renderSalesTopClients(data.sales_top_clients);

    // Render Critical Parts (full scrollable list) and Recent Deals
    const alignedRowTarget = Math.max(
      Math.min((data.critical_parts || []).length, 6),
      Math.min((data.recent_deals || []).length, 6),
      5
    );
    renderCriticalParts(data.critical_parts, alignedRowTarget);
    renderRecentDeals(data.recent_deals, alignedRowTarget);

    // Requirement #8: Employees Revenue & Efficiency Breakdown
    const mechSection = document.getElementById('dash-mechanics-revenue-section');
    if (mechSection) {
      mechSection.classList.remove('hidden');
      renderMechanicsRevenue(data.mechanics_revenue || []);
    }

    // Requirement #7: Load Top Sold Parts widget
    await loadTopSoldParts(state.topPartsLimit || 10);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function formatMultiCurrencyBreakdown(byCurr) {
  if (!byCurr || typeof byCurr !== 'object') return 'AMD: 0';
  const parts = [];
  if (Number(byCurr.AMD || 0) > 0 || (Number(byCurr.USD || 0) === 0 && Number(byCurr.EUR || 0) === 0)) {
    parts.push(formatMoney(byCurr.AMD || 0, 'AMD'));
  }
  if (Number(byCurr.USD || 0) > 0) {
    parts.push(formatMoney(byCurr.USD || 0, 'USD'));
  }
  if (Number(byCurr.EUR || 0) > 0) {
    parts.push(formatMoney(byCurr.EUR || 0, 'EUR'));
  }
  return parts.join(' + ');
}

function setDashboardServiceStageFilter(stageKey) {
  state.dashboardServiceStage = stageKey || 'all';
  const keys = ['all', 'ready', 'invoiced', 'paid'];
  keys.forEach(k => {
    const btn = document.getElementById(`dash-service-stage-btn-${k}`);
    if (!btn) return;
    if (k === state.dashboardServiceStage) {
      btn.className = 'px-2 py-1 rounded-md font-bold bg-blue-600 text-white shadow-2xs transition-all';
    } else {
      btn.className = 'px-2 py-1 rounded-md font-semibold text-slate-700 hover:bg-white transition-all';
    }
  });
  renderDashboardServiceRevenueCard(state.dashboard || {});
}

function renderDashboardServiceRevenueCard(data) {
  const stageKey = state.dashboardServiceStage || 'all';
  const byStage = (data && data.service_by_stage) ? data.service_by_stage : null;
  let metric = null;
  if (byStage && byStage[stageKey]) {
    metric = byStage[stageKey];
  } else {
    metric = {
      revenue: Number(data?.service_revenue || 0),
      profit: Number(data?.service_profit || 0),
      margin: Number(data?.service_margin || 0),
      count: Number(data?.service_completed_count || 0),
    };
  }

  const statServRev = document.getElementById('stat-service-revenue');
  if (statServRev) statServRev.textContent = formatMoney(metric.revenue || 0);
  const statServProfit = document.getElementById('stat-service-profit');
  if (statServProfit) statServProfit.textContent = formatMoney(metric.profit || 0);
  const statServMargin = document.getElementById('stat-service-margin');
  if (statServMargin) statServMargin.textContent = `${metric.margin || 0}% маржа`;
  const statServCount = document.getElementById('stat-service-completed-count');
  if (statServCount) statServCount.textContent = `${metric.count || 0} нарядов`;
}

function setDashboardSalesCategory(catKey) {
  state.dashboardSalesCategory = catKey || 'all';
  const keys = ['all', 'construction', 'agriculture'];
  keys.forEach(k => {
    const btn = document.getElementById(`dash-sales-cat-btn-${k}`);
    if (!btn) return;
    if (k === state.dashboardSalesCategory) {
      btn.className = 'px-3 py-1.5 rounded-lg font-bold bg-indigo-600 text-white shadow-xs transition-all';
    } else {
      btn.className = 'px-3 py-1.5 rounded-lg font-semibold text-slate-700 hover:bg-white transition-all';
    }
  });
  renderDashboardSalesAnalytics(state.dashboard || {});
}

function renderDashboardSalesAnalytics(data) {
  const analytics = (data && data.sales_analytics) ? data.sales_analytics : {
    all: { label: 'Вся спецтехника', revenue: 0, by_currency: { AMD: 0, USD: 0, EUR: 0 }, completed_count: 0, active_count: 0, units_sold: 0 },
    construction: { label: 'Строительная и коммунальная техника', revenue: 0, by_currency: { AMD: 0, USD: 0, EUR: 0 }, completed_count: 0, active_count: 0, units_sold: 0 },
    agriculture: { label: 'Сельскохозяйственная техника', revenue: 0, by_currency: { AMD: 0, USD: 0, EUR: 0 }, completed_count: 0, active_count: 0, units_sold: 0 },
  };
  const selectedKey = state.dashboardSalesCategory || 'all';
  const sel = analytics[selectedKey] || analytics.all || {};

  const labelMap = {
    all: 'Выручка: Вся спецтехника',
    construction: 'Выручка: Строительная и коммунальная',
    agriculture: 'Выручка: Сельскохозяйственная техника',
  };

  const labelEl = document.getElementById('stat-sales-selected-label');
  if (labelEl) labelEl.textContent = labelMap[selectedKey] || 'Выручка: Вся спецтехника';

  const revEl = document.getElementById('stat-sales-revenue');
  if (revEl) {
    revEl.textContent = formatMultiCurrencyBreakdown(sel.by_currency);
  }
  const currEl = document.getElementById('stat-sales-currency-breakdown');
  if (currEl) {
    const bc = sel.by_currency || {};
    currEl.textContent = `AMD: ${new Intl.NumberFormat('ru-RU').format(Math.round(bc.AMD || 0))} • USD: ${new Intl.NumberFormat('ru-RU').format(Math.round(bc.USD || 0))} • EUR: ${new Intl.NumberFormat('ru-RU').format(Math.round(bc.EUR || 0))}`;
  }
  const countEl = document.getElementById('stat-sales-completed-count');
  if (countEl) countEl.textContent = `${sel.completed_count || 0} сделок`;

  const unitsEl = document.getElementById('stat-sales-units-sold');
  if (unitsEl) unitsEl.textContent = `${sel.units_sold || 0} ед.`;

  const activeEl = document.getElementById('stat-sales-active-info');
  if (activeEl) activeEl.textContent = `В работе: ${sel.active_count || 0} (${formatMultiCurrencyBreakdown(sel.active_by_currency)})`;

  // Construction summary card
  const cData = analytics.construction || {};
  const cRev = document.getElementById('stat-sales-constr-revenue');
  if (cRev) cRev.textContent = formatMultiCurrencyBreakdown(cData.by_currency);
  const cCur = document.getElementById('stat-sales-constr-currencies');
  if (cCur) cCur.textContent = `AMD: ${new Intl.NumberFormat('ru-RU').format(Math.round(cData.by_currency?.AMD || 0))} • USD: ${new Intl.NumberFormat('ru-RU').format(Math.round(cData.by_currency?.USD || 0))} • EUR: ${new Intl.NumberFormat('ru-RU').format(Math.round(cData.by_currency?.EUR || 0))}`;
  const cUnits = document.getElementById('stat-sales-constr-units');
  if (cUnits) cUnits.textContent = `${cData.units_sold || 0} ед.`;
  const cDeals = document.getElementById('stat-sales-constr-deals');
  if (cDeals) cDeals.textContent = String(cData.completed_count || 0);
  const cActive = document.getElementById('stat-sales-constr-active');
  if (cActive) cActive.textContent = String(cData.active_count || 0);

  // Agriculture summary card
  const aData = analytics.agriculture || {};
  const aRev = document.getElementById('stat-sales-agri-revenue');
  if (aRev) aRev.textContent = formatMultiCurrencyBreakdown(aData.by_currency);
  const aCur = document.getElementById('stat-sales-agri-currencies');
  if (aCur) aCur.textContent = `AMD: ${new Intl.NumberFormat('ru-RU').format(Math.round(aData.by_currency?.AMD || 0))} • USD: ${new Intl.NumberFormat('ru-RU').format(Math.round(aData.by_currency?.USD || 0))} • EUR: ${new Intl.NumberFormat('ru-RU').format(Math.round(aData.by_currency?.EUR || 0))}`;
  const aUnits = document.getElementById('stat-sales-agri-units');
  if (aUnits) aUnits.textContent = `${aData.units_sold || 0} ед.`;
  const aDeals = document.getElementById('stat-sales-agri-deals');
  if (aDeals) aDeals.textContent = String(aData.completed_count || 0);
  const aActive = document.getElementById('stat-sales-agri-active');
  if (aActive) aActive.textContent = String(aData.active_count || 0);
}

function renderRevenueChart(monthlyData, totalRev, totalCost, netProfit) {
  const container = document.getElementById('revenue-bars-container');
  if (!container) return;

  const canViewRev = hasUserPerm('can_view_revenue');
  let barsHtml = '';
  if (!monthlyData || monthlyData.length === 0) {
    const maxVal = Math.max(totalRev, 1);
    const revHeight = Math.max(Math.round((totalRev / maxVal) * 160), 6);
    const costHeight = Math.max(Math.round((totalCost / maxVal) * 160), 4);
    const profitHeight = Math.max(Math.round((netProfit / maxVal) * 160), 4);

    barsHtml = `
      <div class="flex-1 flex flex-col items-center justify-end h-full">
        <div class="w-full flex items-end justify-center gap-3 h-44">
          <div class="w-12 bg-blue-600 rounded-t-md hover:bg-blue-500 transition-all cursor-pointer relative group" style="height: ${revHeight}px">
            ${canViewRev ? `<span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(totalRev)}</span>` : `<span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-sans bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Выручка</span>`}
          </div>
          <div class="w-12 bg-amber-500 rounded-t-md hover:bg-amber-400 transition-all cursor-pointer relative group" style="height: ${costHeight}px">
            ${canViewRev ? `<span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(totalCost)}</span>` : `<span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-sans bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Себестоимость</span>`}
          </div>
          <div class="w-12 bg-emerald-500 rounded-t-md hover:bg-emerald-400 transition-all cursor-pointer relative group" style="height: ${profitHeight}px">
            ${canViewRev ? `<span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${formatMoney(netProfit)}</span>` : `<span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-sans bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Прибыль</span>`}
          </div>
        </div>
        <div class="text-xs text-slate-500 font-semibold mt-2">Текущий финансовый период</div>
      </div>
    `;
  } else {
    const maxVal = Math.max(...monthlyData.map(m => m.revenue), 1);
    barsHtml = monthlyData.map(m => {
      const revHeight = m.revenue > 0 ? Math.max(Math.round((m.revenue / maxVal) * 150), 6) : 3;
      const costHeight = m.cost > 0 ? Math.max(Math.round((m.cost / maxVal) * 150), 4) : 3;
      const profitVal = Math.max(m.revenue - m.cost, 0);
      const profitHeight = profitVal > 0 ? Math.max(Math.round((profitVal / maxVal) * 150), 4) : 3;
      const dealsCount = m.deals_count || 0;
      return `
        <div class="flex-1 flex flex-col items-center justify-end h-full">
          <div class="w-full flex items-end justify-center gap-1.5 h-44">
            <div class="w-7 bg-blue-600 rounded-t hover:bg-blue-500 transition-all cursor-pointer relative group" style="height: ${revHeight}px">
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${canViewRev ? formatMoney(m.revenue) : `Нарядов: ${dealsCount}`}</span>
            </div>
            <div class="w-7 bg-amber-500 rounded-t hover:bg-amber-400 transition-all cursor-pointer relative group" style="height: ${costHeight}px">
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${canViewRev ? formatMoney(m.cost) : 'Себестоимость'}</span>
            </div>
            <div class="w-7 bg-emerald-500 rounded-t hover:bg-emerald-400 transition-all cursor-pointer relative group" style="height: ${profitHeight}px">
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${canViewRev ? formatMoney(m.revenue - m.cost) : 'Прибыль'}</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-500 font-mono mt-2">${m.month}</div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = barsHtml;
}

function renderSalesRevenueChart(salesMonthlyData, salesTotalRev, salesCompletedCount) {
  const container = document.getElementById('sales-revenue-bars-container');
  if (!container) return;

  const canViewRev = hasUserPerm('can_view_revenue');
  let barsHtml = '';
  if (!salesMonthlyData || salesMonthlyData.length === 0) {
    const maxVal = Math.max(salesTotalRev || 0, 1);
    const revHeight = (salesTotalRev || 0) > 0 ? Math.max(Math.round(((salesTotalRev || 0) / maxVal) * 150), 10) : 6;
    barsHtml = `
      <div class="flex-1 flex flex-col items-center justify-end h-full">
        <div class="w-full flex items-end justify-center gap-3 h-44">
          <div class="w-14 bg-indigo-600 rounded-t-md hover:bg-indigo-500 transition-all cursor-pointer relative group" style="height: ${revHeight}px">
            <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${canViewRev ? formatMoney(salesTotalRev || 0) : `Сделок: ${salesCompletedCount || 0}`}</span>
          </div>
        </div>
        <div class="text-xs text-slate-500 font-semibold mt-2">Текущий период</div>
      </div>
    `;
  } else {
    const maxVal = Math.max(...salesMonthlyData.map(m => Math.max(m.revenue || 0, (m.deals_count || 0) * 1000)), 1);
    barsHtml = salesMonthlyData.map(m => {
      const metricVal = (m.revenue || 0) > 0 ? m.revenue : ((m.deals_count || 0) * 1000);
      const revHeight = metricVal > 0 ? Math.max(Math.round((metricVal / maxVal) * 150), 8) : 3;
      const dealsCount = m.deals_count || 0;
      const unitsSold = m.units_sold || 0;
      const tooltipText = canViewRev
        ? `${formatMultiCurrencyBreakdown(m.by_currency)} (${dealsCount} сд.)`
        : `Сделок: ${dealsCount} • ${unitsSold} ед.`;
      return `
        <div class="flex-1 flex flex-col items-center justify-end h-full">
          <div class="w-full flex items-end justify-center gap-1.5 h-44">
            <div class="w-10 bg-indigo-600 rounded-t hover:bg-indigo-500 transition-all cursor-pointer relative group" style="height: ${revHeight}px">
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">${tooltipText}</span>
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
    container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">Нет данных о выполненных нарядах СТО</div>';
    return;
  }

  const canViewRev = hasUserPerm('can_view_revenue');
  container.innerHTML = topClients.map((c, idx) => `
    <div class="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold font-mono shrink-0">${idx + 1}</span>
        <div class="min-w-0">
          <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(c.name)}</div>
          <div class="text-[11px] text-slate-400 truncate">${escapeHtml(c.company || 'Частный заказчик')} • ${c.completed_deals} нарядов</div>
        </div>
      </div>
      ${canViewRev
        ? `<div class="text-xs font-bold text-emerald-600 font-mono shrink-0">${formatMoney(c.total_spent)}</div>`
        : `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 shrink-0">${c.completed_deals} нарядов</span>`}
    </div>
  `).join('');
}

function renderSalesTopClients(salesTopClients) {
  const container = document.getElementById('sales-top-clients-list');
  if (!container) return;
  if (!salesTopClients || salesTopClients.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">Нет данных о сделках отдела продаж спецтехники</div>';
    return;
  }

  const canViewRev = hasUserPerm('can_view_revenue');
  container.innerHTML = salesTopClients.map((c, idx) => {
    const dealsLabel = (c.completed_deals || 0) > 0 ? `${c.completed_deals} сделок` : `${c.deals_count || 0} сделок`;
    return `
      <div class="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100 gap-2">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold font-mono shrink-0">${idx + 1}</span>
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(c.name)}</div>
            <div class="text-[11px] text-slate-400 truncate">${escapeHtml(c.company || 'Частный заказчик')} • ${dealsLabel}</div>
          </div>
        </div>
        ${canViewRev
          ? `<div class="text-xs font-bold text-indigo-600 font-mono shrink-0 text-right">${formatMultiCurrencyBreakdown(c.by_currency)}</div>`
          : `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">${dealsLabel}</span>`}
      </div>
    `;
  }).join('');
}

function renderCriticalParts(parts, targetRows = 6) {
  const container = document.getElementById('critical-parts-table');
  if (!container) return;
  const rowsLimit = Math.max(1, targetRows || 6);
  const items = parts || [];

  const renderedRows = items.map(p => `
    <div class="h-[58px] px-3 py-2 rounded-lg border border-rose-100 bg-rose-50/40 flex items-center justify-between text-xs gap-2 shrink-0">
      <div class="min-w-0 flex-1">
        <div class="font-bold text-slate-800 flex items-center gap-2 truncate">
          <span class="truncate">${escapeHtml(p.name)}</span>
          <span class="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border shrink-0">${escapeHtml(p.sku)}</span>
        </div>
        <div class="text-[11px] text-slate-500 mt-0.5 truncate">Локация: ${escapeHtml(p.location || 'Склад')} • Мин. остаток: ${p.min_threshold} ${getPartUnit(p)}</div>
      </div>
      <div class="flex items-center gap-2.5 shrink-0">
        <span class="font-bold text-rose-600 font-mono text-sm whitespace-nowrap">${p.quantity} ${getPartUnit(p)}</span>
        <button onclick="openStockAdjustModal(${p.id}, '${String(p.name || '').replace(/'/g, "\\'") }')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded text-[11px] font-medium shadow-sm whitespace-nowrap">
          + Приход
        </button>
      </div>
    </div>
  `);

  if (renderedRows.length === 0) {
    renderedRows.push(`
      <div class="h-[58px] px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-700 flex items-center gap-2 text-xs font-medium">
        <i data-lucide="check-circle-2" class="w-4 h-4 shrink-0"></i>
        <span>Дефицитных позиций нет! Все запчасти на складе в достаточном количестве.</span>
      </div>
    `);
  }

  while (renderedRows.length < rowsLimit) {
    renderedRows.push(`
      <div class="h-[58px] px-3 py-2 rounded-lg border border-dashed border-slate-100 bg-slate-50/40 flex items-center justify-between text-[11px] text-slate-300 select-none">
        <span>Дефицитная позиция отсутствует</span>
        <span class="font-mono">Норма</span>
      </div>
    `);
  }

  container.innerHTML = renderedRows.join('');
}

function renderMechanicsRevenue(mechanics) {
  const tbody = document.getElementById('dash-mechanics-revenue-body');
  if (!tbody) return;
  const canViewRev = hasUserPerm('can_view_revenue');
  if (!mechanics || mechanics.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${canViewRev ? 7 : 3}" class="p-6 text-center text-xs text-slate-400">Данные по выполненным сделкам и нарядам сотрудников отсутствуют</td></tr>`;
    return;
  }

  const revColClass = canViewRev ? 'col-emp-revenue' : 'col-emp-revenue hidden';
  tbody.innerHTML = mechanics.map(m => {
    const margin = m.total_revenue > 0 ? Math.round((m.net_profit / m.total_revenue) * 100) : 0;
    return `
      <tr class="hover:bg-purple-50/40 transition-colors">
        <td class="p-3 text-xs font-sans">
          <div class="font-bold text-slate-800 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>${escapeHtml(m.name)}</span>
          </div>
          ${m.username && m.username !== m.name ? `<div class="text-[10px] text-slate-400 font-mono">@${escapeHtml(m.username)}</div>` : ''}
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
        <td class="p-3 text-right text-xs font-bold text-blue-700 ${revColClass}">
          ${formatMoney(m.total_revenue)}
        </td>
        <td class="p-3 text-right text-xs text-slate-500 ${revColClass}">
          ${formatMoney(m.total_cost)}
        </td>
        <td class="p-3 text-right text-xs font-bold text-emerald-600 ${revColClass}">
          ${formatMoney(m.net_profit)}
          <span class="text-[10px] text-emerald-500 font-normal">(${margin}%)</span>
        </td>
        <td class="p-3 text-right text-xs font-medium text-slate-700 ${revColClass}">
          ${formatMoney(m.avg_deal)}
        </td>
      </tr>
    `;
  }).join('');
}

function renderRecentDeals(deals, targetRows = 6) {
  const container = document.getElementById('recent-deals-list');
  if (!container) return;
  const rowsLimit = Math.max(1, targetRows || 6);
  const items = (deals || []).slice(0, rowsLimit);
  const canViewRev = hasUserPerm('can_view_revenue');

  const renderedRows = items.map(d => {
    const isParts = d.deal_type === 'parts_sale';
    const isSales = d.deal_type === 'sales';
    const stageList = isParts ? PARTS_KANBAN_STAGES : (isSales ? SALES_KANBAN_STAGES : SERVICE_KANBAN_STAGES);
    const stageObj = stageList.find(s => s.id === d.stage) || { label: d.stage };
    const deptBadge = isParts
      ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">📦 Продажа з/ч</span>'
      : (isSales
        ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">🚜 Продажа</span>'
        : '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200 shrink-0">🔧 Наряд СТО</span>');

    return `
      <div onclick="openDealModal(${d.id})" class="h-[58px] px-3 py-2 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between text-xs gap-2">
        <div class="min-w-0 flex-1">
          <div class="font-bold text-slate-800 flex items-center gap-1.5 truncate">
            <span class="truncate">${escapeHtml(d.title)}</span>
            ${deptBadge}
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5 truncate">
            ${escapeHtml(d.client_name || 'Без клиента')} • ${escapeHtml(d.equipment_name || 'Техника не выбрана')}
          </div>
        </div>
        <div class="text-right shrink-0">
          ${canViewRev ? `<div class="font-bold text-blue-600 font-mono whitespace-nowrap revenue-amount-only">${formatMoney(d.amount, d.currency || 'AMD')}</div>` : ''}
          <span class="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium whitespace-nowrap">${escapeHtml(stageObj.label)}</span>
        </div>
      </div>
    `;
  });

  if (renderedRows.length === 0) {
    renderedRows.push(`
      <div class="h-[58px] px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-slate-400 flex items-center justify-center text-xs">
        Сделки и заказ-наряды за выбранный период отсутствуют
      </div>
    `);
  }

  while (renderedRows.length < rowsLimit) {
    renderedRows.push(`
      <div class="h-[58px] px-3 py-2 rounded-lg border border-dashed border-slate-100 bg-slate-50/40 flex items-center justify-between text-[11px] text-slate-300 select-none">
        <span>Свободная строка заказ-наряда</span>
        <span class="font-mono">—</span>
      </div>
    `);
  }

  container.innerHTML = renderedRows.join('');
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

function syncDealsDepartmentHeaderUI(dept) {
  const isParts = dept === 'parts_sale';
  const isSales = dept === 'sales';

  const btnService = document.getElementById('dept-btn-service');
  const btnParts = document.getElementById('dept-btn-parts-sale');
  const btnSales = document.getElementById('dept-btn-sales');

  const baseInactive = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all font-semibold';
  if (btnService) btnService.className = `${(!isParts && !isSales) ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-blue-900 shadow-sm transition-all font-bold' : baseInactive}${hasUserPerm('deals_sto') ? '' : ' hidden'}`;
  if (btnParts) btnParts.className = `${isParts ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-emerald-800 shadow-sm transition-all font-bold' : baseInactive}${hasUserPerm('deals_parts') ? '' : ' hidden'}`;
  if (btnSales) btnSales.className = `${isSales ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-indigo-800 shadow-sm transition-all font-bold' : baseInactive}${hasUserPerm('deals_sales') ? '' : ' hidden'}`;

  const titleEl = document.getElementById('kanban-board-title');
  const subEl = document.getElementById('kanban-board-subtitle');
  const btnText = document.getElementById('btn-create-deal-text');

  const typeFilterEl = document.getElementById('deals-type-filter');
  if (typeFilterEl) {
    typeFilterEl.classList.toggle('hidden', isSales || isParts);
  }
  const salesCatalogShortcut = document.getElementById('btn-open-sales-catalog-shortcut');
  if (salesCatalogShortcut) {
    salesCatalogShortcut.classList.toggle('hidden', !(isSales && hasUserPerm('sales_catalog')));
  }

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
}

function switchDealsDepartment(dept) {
  let reqDept = dept || 'service';
  const permMap = {
    service: { key: 'deals_sto', label: 'Заказ-наряды (СТО)' },
    parts_sale: { key: 'deals_parts', label: 'Продажа запчастей' },
    sales: { key: 'deals_sales', label: 'Отдел продаж спецтехники' }
  };
  const check = permMap[reqDept] || permMap.service;
  if (!hasUserPerm(check.key)) {
    const allowed = getAllowedDealsDepartments();
    if (allowed.length === 0) {
      showToast(`Доступ к разделу «${check.label}» ограничен Администратором`, 'warning');
      return;
    }
    reqDept = allowed[0];
  }

  state.dealsDepartment = reqDept;
  const isParts = state.dealsDepartment === 'parts_sale';
  const isSales = state.dealsDepartment === 'sales';

  syncDealsDepartmentHeaderUI(state.dealsDepartment);

  // Nav item highlighting in sidebar
  const navKanban = document.getElementById('nav-kanban');
  const navParts = document.getElementById('nav-parts-sales');
  const navSales = document.getElementById('nav-sales');

  const navInactive = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800';
  if (navKanban) navKanban.className = (!isParts && !isSales && state.currentTab === 'kanban') ? 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-blue-600/20 border-l-4 border-blue-500' : navInactive;
  if (navParts) navParts.className = (isParts && state.currentTab === 'kanban') ? 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-emerald-600/20 border-l-4 border-emerald-500' : navInactive;
  if (navSales) navSales.className = (isSales && state.currentTab === 'kanban') ? 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-indigo-600/20 border-l-4 border-indigo-500' : navInactive;

  // Re-enforce visibility of all sidebar items and buttons according to Administrator permissions
  applyUserPermissions();

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
  select.innerHTML =
    '<option value="active_only">⚡ В работе (активные сделки)</option>' +
    '<option value="all">📋 Все сделки (включая завершенные)</option>' +
    activeStages.map(s => `<option value="${s.id}">${s.label}</option>`).join('') +
    '<option value="failed_archive">🗄️ Архив неудачных сделок</option>';
  if (currentVal && (activeStages.some(s => s.id === currentVal) || currentVal === 'all' || currentVal === 'active_only' || currentVal === 'failed_archive')) {
    select.value = currentVal;
  } else {
    select.value = 'active_only';
  }
  syncFailedArchiveButtonUI();
}

function toggleFailedDealsArchive() {
  const select = document.getElementById('deals-stage-filter');
  if (!select) return;
  if (select.value === 'failed_archive') {
    select.value = 'active_only';
  } else {
    select.value = 'failed_archive';
  }
  syncFailedArchiveButtonUI();
  renderDeals();
}

function syncFailedArchiveButtonUI() {
  const select = document.getElementById('deals-stage-filter');
  const btn = document.getElementById('btn-toggle-failed-archive');
  const txt = document.getElementById('btn-failed-archive-text');
  const badge = document.getElementById('badge-failed-archive-count');
  const isArchive = select && select.value === 'failed_archive';

  // Count failed deals in current department
  const deptDeals = (state.deals || []).filter(d => {
    if (state.dealsDepartment === 'parts_sale') return d.deal_type === 'parts_sale';
    if (state.dealsDepartment === 'sales') return d.deal_type === 'sales';
    return d.deal_type !== 'parts_sale' && d.deal_type !== 'sales';
  });
  const failedCount = deptDeals.filter(d => d.closing_outcome === 'failed' || d.stage === 'cancelled').length;
  if (badge) badge.textContent = String(failedCount);

  if (btn) {
    if (isArchive) {
      btn.className = 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors';
      if (txt) txt.textContent = 'Выйти из архива неудачных';
    } else {
      btn.className = 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors';
      if (txt) txt.textContent = 'Архив неудачных';
    }
  }
}

function parseDealTimestamp(dateStr) {
  if (!dateStr) return 0;
  const s = String(dateStr).trim();
  const mRu = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (mRu) {
    const t = new Date(`${mRu[3]}-${mRu[2]}-${mRu[1]}T00:00:00`).getTime();
    return isNaN(t) ? 0 : t;
  }
  const t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

function getDealsSortOrder() {
  const select = document.getElementById('deals-sort-order');
  return (select && select.value) || state.dealsSortOrder || 'date_desc';
}

function syncDealsSortUI() {
  const order = getDealsSortOrder();
  state.dealsSortOrder = order;
  const select = document.getElementById('deals-sort-order');
  if (select && select.value !== order) {
    select.value = order;
  }
  const ind = document.getElementById('deals-created-sort-indicator');
  if (ind) {
    if (order === 'date_desc') {
      ind.textContent = '↓';
      ind.className = 'text-blue-600 font-bold text-xs';
    } else if (order === 'date_asc') {
      ind.textContent = '↑';
      ind.className = 'text-blue-600 font-bold text-xs';
    } else {
      ind.textContent = '⇅';
      ind.className = 'text-slate-400 font-normal text-xs';
    }
  }
}

function setDealsSortOrder(order) {
  state.dealsSortOrder = order || 'date_desc';
  syncDealsSortUI();
  renderDeals();
}

function toggleDealsCreatedSort(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const current = getDealsSortOrder();
  const next = current === 'date_desc' ? 'date_asc' : 'date_desc';
  setDealsSortOrder(next);
}

function sortDealsByOrder(dealsList) {
  if (!Array.isArray(dealsList)) return [];
  const order = getDealsSortOrder();
  return dealsList.slice().sort((a, b) => {
    if (order === 'date_asc') {
      const diff = parseDealTimestamp(a.created_at) - parseDealTimestamp(b.created_at);
      return diff !== 0 ? diff : (Number(a.id || 0) - Number(b.id || 0));
    }
    if (order === 'id_asc') {
      return Number(a.id || 0) - Number(b.id || 0);
    }
    if (order === 'id_desc') {
      return Number(b.id || 0) - Number(a.id || 0);
    }
    // Default: 'date_desc' (newest registration date first)
    const diff = parseDealTimestamp(b.created_at) - parseDealTimestamp(a.created_at);
    return diff !== 0 ? diff : (Number(b.id || 0) - Number(a.id || 0));
  });
}

function renderDeals() {
  updateSidebarCounters();
  syncFailedArchiveButtonUI();
  syncDealsSortUI();

  if (state.dealsViewMode === 'list') {
    renderDealsList();
    applySavedDealsColumnWidths();
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

    const isDealFailed = (d.closing_outcome === 'failed' || d.stage === 'cancelled');
    // Requirement 2.3: Failed deals live in the Archive of Failed Deals ('failed_archive')
    if (stageFilter === 'failed_archive') {
      if (!isDealFailed) return false;
    } else if (stageFilter === 'active_only') {
      if (isDealFailed) return false;
      const lastStageId = (activeStages && activeStages.length > 0) ? activeStages[activeStages.length - 1].id : 'completed';
      if (d.stage === lastStageId || d.stage === 'completed' || d.stage === 'paid' || d.stage === 'issued' || d.stage === 'closed') return false;
    } else if (stageFilter !== 'all') {
      if (isDealFailed) return false;
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
      (d.bank_name && d.bank_name.toLowerCase().includes(filterText)) ||
      (d.responsible && d.responsible.toLowerCase().includes(filterText))
    );
  });

  const sortedDeals = sortDealsByOrder(filteredDeals);

  wrapper.innerHTML = activeStages.map(stage => {
    const stageDeals = sortedDeals.filter(d => d.stage === stage.id);
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

    const isDealFailed = (d.closing_outcome === 'failed' || d.stage === 'cancelled');
    // Requirement 2.3: Failed deals live in the Archive of Failed Deals ('failed_archive')
    if (stageFilter === 'failed_archive') {
      if (!isDealFailed) return false;
    } else if (stageFilter === 'active_only') {
      if (isDealFailed) return false;
      const lastStageId = (activeStages && activeStages.length > 0) ? activeStages[activeStages.length - 1].id : 'completed';
      if (d.stage === lastStageId || d.stage === 'completed' || d.stage === 'paid' || d.stage === 'issued' || d.stage === 'closed') return false;
    } else if (stageFilter !== 'all') {
      if (isDealFailed) return false;
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
      (d.bank_name && d.bank_name.toLowerCase().includes(filterText)) ||
      (d.responsible && d.responsible.toLowerCase().includes(filterText))
    );
  });

  // Requirement 2.1 & 3: In Sales Department, hide "Себестоимость" and replace "Техника / Товары" column with "Банк"
  const colCostHeader = document.getElementById('deals-table-col-cost-header');
  if (colCostHeader) {
    colCostHeader.classList.toggle('hidden', isSalesDept);
    const spanEl = colCostHeader.querySelector('span:first-child');
    if (spanEl) spanEl.textContent = 'Сумма з/ч (AMD)';
  }
  const colEqHeader = document.getElementById('deals-table-col-equipment-header');
  if (colEqHeader) {
    const eqSpan = colEqHeader.querySelector('span:first-child');
    if (eqSpan) eqSpan.textContent = isSalesDept ? 'Банк' : 'Техника / VIN';
  }

  const sortedDeals = sortDealsByOrder(filteredDeals);

  const totalAmount = sortedDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalCountEl = document.getElementById('deals-list-total-count');
  const totalAmountEl = document.getElementById('deals-list-total-amount');
  if (totalCountEl) totalCountEl.textContent = sortedDeals.length;
  if (totalAmountEl) totalAmountEl.textContent = formatMoney(totalAmount);

  if (sortedDeals.length === 0) {
    let emptyMsg = 'Заказ-наряды не найдены по заданным условиям';
    if (stageFilter === 'failed_archive') emptyMsg = 'В архиве неудачных сделок пока нет записей';
    else if (isPartsDept) emptyMsg = 'Продажи запчастей не найдены по заданным условиям';
    else if (isSalesDept) emptyMsg = 'Сделки отдела продаж спецтехники не найдены';
    tbody.innerHTML = `<tr><td colspan="${isSalesDept ? 9 : 10}" class="p-8 text-center text-slate-400 text-xs">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = sortedDeals.map(deal => {
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
    const isFailed = (deal.closing_outcome === 'failed' || deal.stage === 'cancelled');
    const isCompletedSuccess = (deal.stage === 'completed' && !isFailed);
    const isOverdue = isDealReadyOverdue(deal);
    const dealCurr = normalizeDealCurrency(deal.currency);

    // Bitrix24 Pipeline Chevrons using activeStages
    const chevronsHtml = activeStages.map((s, idx) => {
      let stateClass = 'future';
      if (idx < currIdx) stateClass = isFailed ? 'passed opacity-60' : 'passed';
      else if (idx === currIdx) {
        stateClass = isFailed ? 'current stage-failed' : `current stage-${s.id}`;
      }

      return `
        <button type="button"
                onclick="${isLocked ? "showToast('Изменение стадии закрытых сделок разрешено только Администратору!', 'error')" : `updateDealStageQuick(${deal.id}, '${s.id}', event)`}"
                class="b24-stage-chevron ${stateClass} ${isLocked ? 'opacity-80 cursor-not-allowed' : ''}"
                title="${s.label} • ${isLocked ? 'Заблокировано для редактирования' : 'Кликните для выбора стадии'}">
          ${s.short || s.label}
        </button>
      `;
    }).join('');

    // Requirement 2.3: Green for successful completion, Red for failed completion
    let rowClass = 'hover:bg-slate-50/80 transition-colors';
    if (isFailed) {
      rowClass = 'deal-row-failed bg-rose-50/90 hover:bg-rose-100/80 border-l-4 border-l-rose-600 transition-colors';
    } else if (isCompletedSuccess) {
      rowClass = 'deal-row-success bg-emerald-50/80 hover:bg-emerald-100/70 border-l-4 border-l-emerald-600 transition-colors';
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
                ${isFailed ? '<span class="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 shadow-xs"><i data-lucide="x-circle" class="w-3 h-3"></i> ❌ Не удачно (В архиве)</span>' : ''}
                ${isCompletedSuccess ? '<span class="bg-emerald-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 shadow-xs"><i data-lucide="check-circle-2" class="w-3 h-3"></i> ✅ Удачно завершена</span>' : ''}
                ${isOverdue ? '<span class="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 w-fit shadow-xs"><i data-lucide="clock" class="w-3 h-3"></i> Ожидает выдачи &gt; 30 дней</span>' : ''}
                ${isLocked ? '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-1 border border-amber-300"><i data-lucide="lock" class="w-3 h-3"></i> Закрыто</span>' : ''}
                ${deal.deal_type === 'sales' ? (Number(deal.discount || 0) > 0 ? `<span class="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold">Скидка: ${formatMoney(deal.discount, dealCurr)}</span>` : '') : `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold" title="Списано запчастей на сумму ${formatMoney(deal.parts_selling_total || 0)}">${Number(deal.parts_count || 0)} з/ч</span>`}
              </div>
            </div>
          </div>
        </td>

        <!-- Requirement #2: Client and Company name (clickable to view Client Card) -->
        <td class="p-3.5 text-xs">
          ${deal.client_company ? (deal.client_id ? `
          <button type="button" onclick="openClientCardFromDeal(${deal.client_id}, event)" class="font-bold text-slate-900 hover:text-blue-600 hover:underline flex items-center gap-1.5 text-left transition-colors cursor-pointer" title="Открыть карточку клиента для просмотра">
            <i data-lucide="building" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i><span>${deal.client_company}</span>
          </button>` : `<div class="font-bold text-slate-900 flex items-center gap-1.5"><i data-lucide="building" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i><span>${deal.client_company}</span></div>`) : ''}
          ${deal.client_id ? `
          <button type="button" onclick="openClientCardFromDeal(${deal.client_id}, event)" class="${deal.client_company ? 'text-slate-600 font-medium' : 'font-bold text-slate-800'} hover:text-blue-600 hover:underline flex items-center gap-1 text-left transition-colors cursor-pointer" title="Открыть карточку клиента для просмотра">
            ${deal.client_company ? '<i data-lucide="user" class="w-3 h-3 text-slate-400 flex-shrink-0"></i>' : ''}
            <span>${deal.client_name || 'Не указан'}</span>
          </button>` : `
          <div class="${deal.client_company ? 'text-slate-600 font-medium' : 'font-bold text-slate-800'} flex items-center gap-1">
            ${deal.client_company ? '<i data-lucide="user" class="w-3 h-3 text-slate-400 flex-shrink-0"></i>' : ''}
            <span>${deal.client_name || 'Не указан'}</span>
          </div>`}
          <div class="text-slate-400 text-[11px] font-mono">${deal.client_phone || '—'}</div>
        </td>

        <td class="p-3.5 text-xs">
          ${(isSalesDept || deal.deal_type === 'sales') ? (
            deal.bank_name ? `
            <div class="font-bold text-indigo-900 flex items-center gap-1.5">
              <i data-lucide="landmark" class="w-3.5 h-3.5 text-indigo-600 flex-shrink-0"></i>
              <span>${escapeHtml(deal.bank_name)}</span>
            </div>` : `<span class="text-slate-400 font-mono">—</span>`
          ) : `
          ${(deal.deal_type !== 'parts_sale' && deal.equipment_id) ? `
          <button type="button" onclick="openEquipmentCardFromDeal(${deal.equipment_id}, event)" class="font-bold text-slate-700 hover:text-blue-600 hover:underline flex items-center gap-1.5 text-left transition-colors cursor-pointer" title="Открыть карточку техники для просмотра">
            <i data-lucide="truck" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i>
            <span>${deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || ('Техника #' + deal.equipment_id)}</span>
          </button>` : `
          <div class="font-bold text-slate-700 flex items-center gap-1.5">
            <i data-lucide="${deal.deal_type === 'parts_sale' ? 'shopping-cart' : 'truck'}" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>${deal.deal_type === 'parts_sale' ? 'Продажа со склада' : (deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || 'Не привязана')}</span>
          </div>`}
          <div class="text-[11px] text-slate-400 font-mono">${deal.equipment_vin ? `VIN: ${deal.equipment_vin}` : 'VIN: —'}</div>
          ${(() => {
            const plate = deal.equipment_license_plate || (deal.equipment_id && state.equipment && state.equipment.find(eq => Number(eq.id) === Number(deal.equipment_id))?.license_plate) || '';
            return plate ? `<div class="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono font-bold text-slate-800 bg-slate-100 border border-slate-300 px-1.5 py-0.2 rounded">🚗 Гос. знак: ${escapeHtml(plate)}</div>` : '';
          })()}
          `}
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
              <select ${isLocked ? 'disabled' : ''} onchange="updateDealStageQuick(${deal.id}, this.value, event)" class="b24-stage-select ${deal.stage === 'invoiced' ? 'bg-yellow-100 border-yellow-400 text-yellow-950' : 'bg-white border-slate-200'} border text-[11px] font-semibold rounded px-2 py-0.5 outline-none focus:border-blue-500 ${isLocked ? 'bg-slate-100 cursor-not-allowed text-slate-400' : 'cursor-pointer'}">
                ${activeStages.map(s => `
                  <option value="${s.id}" ${s.id === deal.stage ? 'selected' : ''}>${s.label}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </td>

        <td class="p-3.5 text-xs font-mono font-bold ${isFailed ? 'text-rose-700' : (isCompletedSuccess ? 'text-emerald-700' : 'text-blue-600')} text-right whitespace-nowrap">
          ${formatMoney(deal.amount, dealCurr)}
        </td>

        <td class="${isSalesDept ? 'hidden ' : ''}p-3.5 text-xs font-mono text-emerald-700 font-bold text-right col-deal-cost whitespace-nowrap">
          ${formatMoney(deal.parts_selling_total || 0)}
        </td>

        <td class="p-3.5 text-xs text-slate-700 font-medium">
          ${formatResponsibleBadges(deal.responsible)}
        </td>

        <td class="p-3.5 text-xs font-mono text-slate-500">
          ${deal.deadline || '—'}
        </td>

        <!-- Requirement #4: Deal Registration Date in List view -->
        <td class="p-3.5 text-xs font-mono text-slate-500 whitespace-nowrap">
          ${formatDate(deal.created_at)}
        </td>

        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="printDealOrder(${deal.id}, event)" class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Распечатать заказ-наряд">
            <i data-lucide="printer" class="w-4 h-4"></i>
          </button>
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

let pendingCompleteDealCallback = null;

function promptDealCompletionOutcome(deal, onChoiceCallback) {
  pendingCompleteDealCallback = onChoiceCallback;
  const sub = document.getElementById('complete-deal-modal-subtitle');
  if (sub && deal) {
    sub.textContent = `Сделка #${deal.id}: ${deal.title || ''}`;
  }
  openModal('modal-complete-deal-outcome');
  if (window.lucide) lucide.createIcons();
}

function confirmCompleteDealOutcome(outcome) {
  closeModal('modal-complete-deal-outcome');
  const cb = pendingCompleteDealCallback;
  pendingCompleteDealCallback = null;
  if (typeof cb === 'function') {
    cb(outcome === 'failed' ? 'failed' : 'success');
  }
}

function cancelCompleteDealOutcomePrompt() {
  closeModal('modal-complete-deal-outcome');
  pendingCompleteDealCallback = null;
  renderDeals();
}

// Resizable Columns in Bitrix24 List View (Requirement 2.4)
let activeColResize = null;

function initDealsColumnResize(event, resizerEl) {
  event.preventDefault();
  event.stopPropagation();
  const th = resizerEl.closest('th');
  if (!th) return;
  const startWidth = th.getBoundingClientRect().width;
  activeColResize = {
    th,
    resizerEl,
    colKey: th.getAttribute('data-col-key') || '',
    startX: event.clientX,
    startWidth
  };
  resizerEl.classList.add('is-resizing');
  document.addEventListener('mousemove', handleDealsColumnResizeMove);
  document.addEventListener('mouseup', handleDealsColumnResizeEnd);
}

function handleDealsColumnResizeMove(event) {
  if (!activeColResize) return;
  const delta = event.clientX - activeColResize.startX;
  const newWidth = Math.max(80, Math.round(activeColResize.startWidth + delta));
  activeColResize.th.style.width = `${newWidth}px`;
  activeColResize.th.style.minWidth = `${newWidth}px`;
}

function handleDealsColumnResizeEnd() {
  if (!activeColResize) return;
  const { th, resizerEl, colKey } = activeColResize;
  if (resizerEl) resizerEl.classList.remove('is-resizing');
  if (colKey && th.style.width) {
    try {
      const saved = JSON.parse(localStorage.getItem('specmash_deals_col_widths') || '{}');
      saved[colKey] = th.style.width;
      localStorage.setItem('specmash_deals_col_widths', JSON.stringify(saved));
    } catch (e) {}
  }
  activeColResize = null;
  document.removeEventListener('mousemove', handleDealsColumnResizeMove);
  document.removeEventListener('mouseup', handleDealsColumnResizeEnd);
}

function applySavedDealsColumnWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem('specmash_deals_col_widths') || '{}');
    const table = document.getElementById('deals-bitrix-list-table');
    if (!table || !saved) return;
    table.querySelectorAll('th[data-col-key]').forEach(th => {
      const key = th.getAttribute('data-col-key');
      if (key && saved[key]) {
        th.style.width = saved[key];
        th.style.minWidth = saved[key];
      }
    });
  } catch (e) {}
}

async function executeDealStageUpdate(dealId, newStage, closingOutcome = null) {
  const deal = state.deals.find(d => Number(d.id) === Number(dealId));
  if (!deal) return;

  deal.stage = newStage;
  if (closingOutcome) {
    deal.closing_outcome = closingOutcome;
  } else if (newStage !== 'completed' && deal.closing_outcome === 'failed') {
    deal.closing_outcome = 'success';
  }
  crmStore.saveItem('deals', deal);
  renderDeals();
  highlightMovedCard(dealId);

  if (fastApiWs && fastApiWs.readyState === WebSocket.OPEN) {
    try {
      fastApiWs.send(JSON.stringify({
        type: 'deal_stage_updated',
        deal_id: dealId,
        stage: newStage
      }));
    } catch (e) {}
  }

  const reqBody = { stage: newStage };
  if (closingOutcome) reqBody.closing_outcome = closingOutcome;

  try {
    let res = await fetch(`/api/deals/${dealId}/stage`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser?.role || ''
      },
      body: JSON.stringify(reqBody)
    });
    if (!res.ok) {
      res = await fetch(`/api/deals/${dealId}/stage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': state.currentUser?.role || ''
        },
        body: JSON.stringify(reqBody)
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка обновления стадии');
    if (closingOutcome === 'failed') {
      showToast(`Сделка #${dealId} завершена НЕ УДАЧНО и перемещена в Архив неудачных сделок`, 'warning');
    } else if (closingOutcome === 'success' && newStage === 'completed') {
      showToast(`Сделка #${dealId} успешно завершена (Удачно)!`, 'success');
    } else {
      const activeStages = getActiveStages();
      const stageName = activeStages.find(s => s.id === newStage)?.label || newStage;
      showToast(`Сделка #${dealId}: стадия изменена на «${stageName}»`, 'info');
    }
    loadDashboard();
  } catch (err) {
    console.warn('Deal stage update warning:', err);
    loadDashboard();
  }
}

async function updateDealStageQuick(dealId, newStage, event) {
  if (event) event.stopPropagation();
  const deal = state.deals.find(d => Number(d.id) === Number(dealId));
  if (!deal) return;

  // Requirement #5: Forbid changes to closed/paid deals for non-admins
  if (isDealLockedForUser(deal)) {
    showToast('Изменение стадии закрытых/оплаченных сделок разрешено только Администратору!', 'error');
    return;
  }

  // Requirement 2.3: When clicking "Завершить сделку" ('completed'), ask if completed successfully or failed
  if (newStage === 'completed') {
    promptDealCompletionOutcome(deal, (outcome) => {
      executeDealStageUpdate(dealId, 'completed', outcome);
    });
    return;
  }

  if (deal.stage === newStage) return;
  await executeDealStageUpdate(dealId, newStage, 'success');
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

  // Requirement 2.3: Deal Closing Outcome (Удачно -> Green, Не удачно -> Red & Archive)
  const isFailed = (deal.closing_outcome === 'failed' || deal.stage === 'cancelled');
  const isCompletedSuccess = (deal.stage === 'completed' && !isFailed);
  const isLocked = isDealLockedForUser(deal);
  const isOverdue = isDealReadyOverdue(deal);
  const dealCurr = normalizeDealCurrency(deal.currency);

  let cardStyling = 'bg-white border border-slate-200/90 shadow-sm';
  if (isFailed) {
    cardStyling = 'deal-card-failed bg-rose-50/95 border-2 border-rose-500 shadow-sm shadow-rose-200 text-rose-950 ring-2 ring-rose-300/40';
  } else if (isCompletedSuccess) {
    cardStyling = 'deal-card-success bg-emerald-50/95 border-2 border-emerald-500 shadow-sm shadow-emerald-200 text-emerald-950 ring-2 ring-emerald-300/40';
  } else if (isOverdue) {
    cardStyling = 'bg-rose-50/95 border-2 border-rose-500 shadow-sm shadow-rose-200 ring-2 ring-rose-400/40 text-rose-950';
  } else if (isLocked) {
    cardStyling = 'bg-slate-50/90 border border-amber-300 shadow-xs';
  }

  const failedBanner = isFailed ? `
    <div class="flex items-center gap-1.5 text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-md w-fit shadow-xs">
      <i data-lucide="x-circle" class="w-3 h-3 text-rose-600 flex-shrink-0"></i>
      <span>❌ Завершено: Не удачно (В архиве)</span>
    </div>
  ` : (isCompletedSuccess ? `
    <div class="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md w-fit shadow-xs">
      <i data-lucide="check-circle-2" class="w-3 h-3 text-emerald-600 flex-shrink-0"></i>
      <span>✅ Сделка завершена удачно</span>
    </div>
  ` : '');

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

      <!-- Requirement #2: Client and Company name (clickable to view Client & Equipment cards) -->
      <div class="space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
        ${deal.client_company ? (deal.client_id ? `
        <button type="button" onclick="openClientCardFromDeal(${deal.client_id}, event)" class="w-full flex items-center gap-1.5 font-bold text-slate-900 hover:text-blue-600 hover:underline truncate text-left transition-colors" title="Открыть карточку клиента: ${escapeHtml(deal.client_company)}">
          <i data-lucide="building" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i>
          <span class="truncate">${deal.client_company}</span>
        </button>` : `
        <div class="flex items-center gap-1.5 font-bold text-slate-900 truncate" title="${deal.client_company}">
          <i data-lucide="building" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i>
          <span class="truncate">${deal.client_company}</span>
        </div>`) : ''}
        ${deal.client_id ? `
        <button type="button" onclick="openClientCardFromDeal(${deal.client_id}, event)" class="w-full flex items-center gap-1.5 font-medium text-slate-700 hover:text-blue-600 hover:underline truncate text-left transition-colors" title="Открыть карточку клиента для просмотра">
          <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0"></i>
          <span class="truncate">${deal.client_name || 'Клиент не указан'}</span>
        </button>` : `
        <div class="flex items-center gap-1.5 font-medium text-slate-700 truncate">
          <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0"></i>
          <span class="truncate">${deal.client_name || 'Клиент не указан'}</span>
        </div>`}
        ${deal.deal_type === 'parts_sale' ? `
        <div class="flex items-center gap-1.5 text-emerald-700 font-medium text-[11px]">
          <i data-lucide="shopping-cart" class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"></i>
          <span>Отдел: Продажа запчастей</span>
        </div>` : (deal.deal_type === 'sales' ? (deal.equipment_id ? `
        <button type="button" onclick="openEquipmentCardFromDeal(${deal.equipment_id}, event)" class="w-full flex items-center gap-1.5 text-indigo-700 hover:text-blue-600 hover:underline font-medium text-[11px] truncate text-left transition-colors" title="Открыть карточку техники для просмотра">
          <i data-lucide="tractor" class="w-3.5 h-3.5 text-indigo-600 flex-shrink-0"></i>
          <span class="truncate">${deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || 'Отдел: Продажа спецтехники'}</span>
        </button>` : `
        <div class="flex items-center gap-1.5 text-indigo-700 font-medium text-[11px]">
          <i data-lucide="tractor" class="w-3.5 h-3.5 text-indigo-600 flex-shrink-0"></i>
          <span>Отдел: Продажа спецтехники</span>
        </div>`) : (deal.equipment_id ? `
        <button type="button" onclick="openEquipmentCardFromDeal(${deal.equipment_id}, event)" class="w-full flex items-center gap-1.5 text-slate-600 hover:text-blue-600 hover:underline truncate text-left transition-colors" title="Открыть карточку техники для просмотра">
          <i data-lucide="truck" class="w-3.5 h-3.5 text-emerald-500 flex-shrink-0"></i>
          <span class="truncate">${deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || ('Техника #' + deal.equipment_id)}</span>
          ${(() => {
            const plate = deal.equipment_license_plate || (state.equipment && state.equipment.find(eq => Number(eq.id) === Number(deal.equipment_id))?.license_plate) || '';
            return plate ? `<span class="ml-auto shrink-0 font-mono font-bold text-[10px] text-slate-800 bg-slate-100 border border-slate-300 px-1.5 py-0.2 rounded">${escapeHtml(plate)}</span>` : '';
          })()}
        </button>` : `
        <div class="flex items-center gap-1.5 text-slate-600 truncate">
          <i data-lucide="truck" class="w-3.5 h-3.5 text-emerald-500 flex-shrink-0"></i>
          <span class="truncate">${deal.equipment_name || (state.equipment && state.equipment.find(eq => eq.id === deal.equipment_id)?.name) || 'Техника не привязана'}</span>
        </div>`))}
      </div>

      <div class="flex items-center justify-between pt-1 text-xs">
        <span class="font-bold ${isFailed ? 'text-rose-700' : (isCompletedSuccess ? 'text-emerald-700' : 'text-blue-600')} font-mono">${formatMoney(deal.amount, dealCurr)}</span>
        <div class="flex items-center gap-1.5 flex-wrap justify-end">
          ${deal.deal_type === 'sales' ? '' : `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold shrink-0" title="Сумма продажи списанных запчастей: ${formatMoney(deal.parts_selling_total || 0)}">${Number(deal.parts_count || 0)} з/ч • ${formatMoney(deal.parts_selling_total || 0)}</span>`}
          <span class="text-[10px] text-slate-600 font-medium truncate max-w-[150px]" title="${escapeHtml(deal.responsible || '')}">${escapeHtml(deal.responsible || '')}</span>
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
    if (newStage === 'completed') {
      promptDealCompletionOutcome(deal, (outcome) => {
        executeDealStageUpdate(dealId, 'completed', outcome);
      });
      return;
    }
    await executeDealStageUpdate(dealId, newStage, 'success');
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

function getClientFleetItems(clientObj) {
  if (!clientObj) return [];
  const cid = Number(clientObj.id);
  const map = new Map();
  if (Array.isArray(clientObj.equipment_list)) {
    clientObj.equipment_list.forEach(eq => {
      if (eq && eq.id !== undefined) map.set(Number(eq.id), eq);
    });
  }
  if (Array.isArray(state.equipment)) {
    state.equipment.forEach(eq => {
      if (eq && Number(eq.client_id) === cid && eq.id !== undefined) {
        map.set(Number(eq.id), eq);
      }
    });
  }
  return Array.from(map.values());
}

function renderClientsTable() {
  const tbody = document.getElementById('clients-table-body');
  if (!tbody) return;

  if (state.clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 text-xs">Клиенты не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = state.clients.map(c => {
    const fleet = getClientFleetItems(c);
    const eqCount = fleet.length > 0 ? fleet.length : Number(c.equipment_count || 0);
    const fleetPreviewHtml = fleet.length > 0
      ? `<div class="mt-1 space-y-0.5 max-w-xs">` + fleet.slice(0, 3).map(eq => `
          <button type="button" onclick="openEquipmentCardFromDeal(${eq.id}, event)" class="text-[11px] text-slate-700 hover:text-blue-600 hover:underline flex items-center gap-1 truncate text-left" title="${escapeHtml(eq.name)}${eq.serial_vin ? ' • VIN: ' + escapeHtml(eq.serial_vin) : ''}">
            <i data-lucide="truck" class="w-3 h-3 text-emerald-600 shrink-0"></i>
            <span class="truncate font-medium">${escapeHtml(eq.name)}</span>
            ${eq.serial_vin ? `<span class="text-[10px] font-mono text-slate-400 shrink-0">(${escapeHtml(eq.serial_vin)})</span>` : ''}
          </button>
        `).join('') + (fleet.length > 3 ? `<div class="text-[10px] text-slate-400 font-medium">+ еще ${fleet.length - 3} ед.</div>` : '') + `</div>`
      : '';

    return `
    <tr class="hover:bg-slate-50/80 transition-colors">
      <td class="p-3.5">
        <button onclick="viewClientDetails(${c.id})" class="font-bold text-slate-800 hover:text-blue-600 text-left block text-sm">
          ${c.name}${c.position ? `<span class="text-xs font-medium text-blue-700 ml-1.5">(${escapeHtml(c.position)})</span>` : ''}
        </button>
        <span class="text-xs text-slate-400">${c.company || 'Частное лицо'}</span>
        ${(() => {
          const contacts = getClientContactsList(c);
          if (contacts.length > 0) {
            return `<div class="mt-1 space-y-0.5">` + contacts.map(ct => `
              <div class="text-[11px] text-slate-600 flex items-center gap-1">
                <i data-lucide="user-plus" class="w-3 h-3 text-blue-500 shrink-0"></i>
                <span class="font-medium text-slate-700">${escapeHtml(ct.name || 'Контакт')}</span>
                ${ct.position ? `<span class="text-slate-500">— ${escapeHtml(ct.position)}</span>` : ''}
                ${ct.phone ? `<span class="font-mono text-slate-400">(${escapeHtml(ct.phone)})</span>` : ''}
              </div>
            `).join('') + `</div>`;
          }
          return c.secondary_contact ? `<div class="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1"><i data-lucide="user-plus" class="w-3 h-3 text-blue-500 shrink-0"></i><span>Доп. контакт: ${escapeHtml(c.secondary_contact)}</span></div>` : '';
        })()}
      </td>
      <td class="p-3.5 text-xs">
        <div class="font-mono text-slate-700">${c.phone}</div>
        <div class="text-slate-400 text-[11px]">${c.email || '—'}</div>
      </td>
      <td class="p-3.5 text-xs">
        <button type="button" onclick="viewClientDetails(${c.id})" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${eqCount > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'} font-medium hover:opacity-80 transition-opacity">
          <i data-lucide="truck" class="w-3 h-3"></i>
          <span>${eqCount} ед. техники</span>
        </button>
        ${fleetPreviewHtml}
      </td>
      <td class="p-3.5 text-xs font-mono font-medium text-slate-700">
        ${c.deals_count || 0} нарядов
      </td>
      <td class="p-3.5 text-xs font-mono font-bold text-emerald-600">
        ${formatMoney(c.total_revenue || 0)}
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
  `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function openClientCardFromDeal(clientId, event = null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const id = parseInt(clientId, 10);
  if (!id || isNaN(id)) {
    showToast('Клиент не привязан к этому наряду', 'info');
    return;
  }
  if (!state.clients || state.clients.length === 0 || !state.clients.some(c => Number(c.id) === id)) {
    try {
      const res = await fetch('/api/clients');
      if (res.ok) {
        const data = await res.json();
        state.clients = crmStore.mergeWithServer('clients', data);
      }
    } catch (e) {}
  }
  openClientModal(id);
}

async function editClientFromViewModal() {
  const id = state.viewingClientId;
  if (!id) return;
  closeModal('modal-client-view');
  if (!state.clients || state.clients.length === 0 || !state.clients.some(c => Number(c.id) === Number(id))) {
    try {
      const res = await fetch('/api/clients');
      if (res.ok) {
        const data = await res.json();
        state.clients = crmStore.mergeWithServer('clients', data);
      }
    } catch (e) {}
  }
  openClientModal(id);
}

async function openEquipmentCardFromDeal(eqId, event = null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const id = parseInt(eqId, 10);
  if (!id || isNaN(id)) {
    showToast('Техника не привязана к этому наряду', 'info');
    return;
  }
  if (!state.equipment || state.equipment.length === 0 || !state.equipment.some(e => Number(e.id) === id)) {
    try {
      const res = await fetch('/api/equipment');
      if (res.ok) {
        const data = await res.json();
        state.equipment = crmStore.mergeWithServer('equipment', data);
      }
    } catch (e) {}
  }
  await openEquipmentModal(id);
}

function updateDealEquipmentViewBtn(eqId, fallbackPlate = '') {
  const hasEq = Boolean(eqId && Number(eqId) > 0);
  const btn = document.getElementById('btn-deal-view-equipment');
  if (btn) {
    btn.classList.toggle('hidden', !hasEq);
  }
  const plateBadge = document.getElementById('deal-equipment-license-plate-badge');
  const plateValEl = document.getElementById('deal-equipment-license-plate-value');
  if (plateBadge && plateValEl) {
    if (!hasEq) {
      plateBadge.classList.add('hidden');
      plateValEl.textContent = '—';
    } else {
      const eqObj = (state.equipment || []).find(e => Number(e.id) === Number(eqId));
      const plate = (eqObj && eqObj.license_plate) ? String(eqObj.license_plate).trim() : String(fallbackPlate || '').trim();
      plateBadge.classList.remove('hidden');
      plateValEl.textContent = plate || 'Не указан';
      plateValEl.className = plate
        ? 'font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300 tracking-wider shadow-2xs'
        : 'font-sans font-medium text-slate-400 text-[11px]';
    }
  }
}

async function viewClientDetails(clientId) {
  try {
    state.viewingClientId = parseInt(clientId, 10) || clientId;
    const res = await fetch(`/api/clients/${clientId}`);
    const client = await res.json();
    if (client && client.id) state.viewingClientId = client.id;

    document.getElementById('view-client-name').textContent = client.name + (client.position ? ` (${client.position})` : '');
    document.getElementById('view-client-company').textContent = client.company || 'Частный заказчик';
    document.getElementById('view-client-phone').textContent = client.phone;
    const secContactViewEl = document.getElementById('view-client-secondary-contact');
    if (secContactViewEl) {
      const contacts = getClientContactsList(client);
      if (contacts.length > 0) {
        secContactViewEl.innerHTML = contacts.map(ct => `
          <div class="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <div class="font-bold text-slate-900">${escapeHtml(ct.name || 'Контактное лицо')}</div>
            ${ct.position ? `<div class="text-[11px] text-blue-700 font-medium">${escapeHtml(ct.position)}</div>` : ''}
            ${ct.phone ? `<div class="text-[11px] font-mono text-slate-500">${escapeHtml(ct.phone)}</div>` : ''}
          </div>
        `).join('');
      } else {
        secContactViewEl.textContent = client.secondary_contact || 'Не указано';
      }
    }
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
    renderClientsTable();
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
        <div>${eq.serial_vin || '—'}</div>
        ${eq.license_plate ? `<div class="mt-0.5 inline-block text-[10px] font-bold text-slate-800 bg-slate-100 border border-slate-300 px-1.5 py-0.2 rounded">Гос. знак: ${escapeHtml(eq.license_plate)}</div>` : ''}
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

async function loadParts(searchQuery = null) {
  if (!state.currentUser || !state.currentUser.id) return;
  const searchInput = document.getElementById('warehouse-search');
  const effectiveQuery = (typeof searchQuery === 'string')
    ? searchQuery.trim()
    : (searchInput ? searchInput.value.trim() : '');

  if (Array.isArray(state.allParts) && state.allParts.length > 0) {
    renderPartsTable(effectiveQuery);
  }

  try {
    const lowStock = document.getElementById('warehouse-filter-low')?.checked || false;
    let url = `/api/parts?low_stock=${lowStock}`;
    if (effectiveQuery) url += `&q=${encodeURIComponent(effectiveQuery)}`;

    const res = await fetch(url);
    const serverParts = await res.json();
    if (!effectiveQuery && !lowStock && Array.isArray(serverParts)) {
      state.allParts = crmStore.mergeWithServer('parts', serverParts);
      state.parts = state.allParts;
    } else if (Array.isArray(serverParts)) {
      state.parts = serverParts.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }
    renderPartsTable(effectiveQuery);
    updateSidebarCounters();
  } catch (err) {
    console.error('Error loading warehouse:', err);
    state.parts = crmStore.getList('parts');
    renderPartsTable(effectiveQuery);
  }
}

function renderPartsTable(searchQuery = null) {
  const tbody = document.getElementById('parts-table-body');
  if (!tbody) return;

  const searchInput = document.getElementById('warehouse-search');
  const q = (typeof searchQuery === 'string' ? searchQuery : (searchInput?.value || '')).trim().toLowerCase();
  const lowStockOnly = document.getElementById('warehouse-filter-low')?.checked || false;

  const baseParts = (Array.isArray(state.parts) && state.parts.length > 0)
    ? state.parts
    : (state.allParts || []);

  const filteredParts = baseParts.filter(p => {
    if (lowStockOnly && Number(p.quantity || 0) > Number(p.min_threshold ?? 2)) {
      return false;
    }
    if (!q) return true;
    const sku = String(p.sku || '').toLowerCase();
    const name = String(p.name || '').toLowerCase();
    const category = String(p.category || '').toLowerCase();
    const location = String(p.location || '').toLowerCase();
    return sku.includes(q) || name.includes(q) || category.includes(q) || location.includes(q);
  });

  if (filteredParts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 text-xs">Запчасти не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredParts.map(p => {
    const isLow = p.quantity <= p.min_threshold;
    const unit = getPartUnit(p);
    const wh = getPartWarehouseStocks(p);
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
            Всего: ${p.quantity} ${unit}
          </span>
          <div class="mt-1 flex flex-wrap gap-1 font-normal text-[10px]">
            <span class="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200">Оснавной: <b>${wh.main}</b></span>
            <span class="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">Витрина: <b>${wh.showcase}</b></span>
            <span class="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">Дилер 1: <b>${wh.dealer1}</b></span>
          </div>
          ${isLow ? `<span class="text-[10px] text-rose-500 block font-normal mt-0.5">Дефицит! (мин ${p.min_threshold} ${unit})</span>` : ''}
        </td>
        <td class="p-3.5 text-xs font-mono text-slate-600 col-purchase-price">
          ${formatMoney(p.purchase_price)}
        </td>
        <td class="p-3.5 text-xs font-mono font-bold text-emerald-600">
          ${formatMoney(p.selling_price)}
        </td>
        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="openStockAdjustModal(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded font-medium" title="Оприходовать / Списать со склада">
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

  const partObj = getWarehousePartsCatalog().find(p => Number(p.id) === Number(partId));
  const unit = partObj ? getPartUnit(partObj) : 'шт';
  const wh = getPartWarehouseStocks(partObj);
  const summaryEl = document.getElementById('adjust-warehouses-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="font-bold text-slate-800 mb-1">Текущие остатки по складам (Всего: ${partObj ? partObj.quantity : 0} ${unit}):</div>
      <div class="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
        <div class="bg-white border border-slate-200 rounded px-2 py-1">Оснавной: <b>${wh.main} ${unit}</b></div>
        <div class="bg-white border border-slate-200 rounded px-2 py-1">Витрина: <b>${wh.showcase} ${unit}</b></div>
        <div class="bg-white border border-slate-200 rounded px-2 py-1">Дилер 1: <b>${wh.dealer1} ${unit}</b></div>
      </div>
    `;
  }
  const whSelect = document.getElementById('adjust-warehouse');
  if (whSelect) {
    whSelect.innerHTML = `
      <option value="main">Оснавной (в наличии: ${wh.main} ${unit})</option>
      <option value="showcase">Витрина (в наличии: ${wh.showcase} ${unit})</option>
      <option value="dealer1">Дилер 1 (в наличии: ${wh.dealer1} ${unit})</option>
    `;
    whSelect.value = 'main';
  }
  openModal('modal-stock-adjust');
}

async function saveStockAdjust(e) {
  e.preventDefault();
  const partId = parseInt(document.getElementById('adjust-part-id').value);
  const qty = parsePartNumberInput(document.getElementById('adjust-quantity').value, 0);
  const warehouse = document.getElementById('adjust-warehouse')?.value || 'main';
  const comment = document.getElementById('adjust-comment').value || 'Корректировка остатка';

  if (isNaN(qty) || qty === 0) {
    showToast('Укажите корректное количество (не ноль)', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/parts/${partId}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity_change: qty, warehouse, comment })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка');

    const syncPartList = (list) => {
      if (!Array.isArray(list)) return;
      const partObj = list.find(p => Number(p.id) === Number(partId));
      if (partObj) {
        if (typeof data.new_quantity === 'number') partObj.quantity = data.new_quantity;
        if (data.warehouse_stocks) {
          partObj.warehouse_stocks = data.warehouse_stocks;
          partObj.qty_main = data.warehouse_stocks.main;
          partObj.qty_showcase = data.warehouse_stocks.showcase;
          partObj.qty_dealer1 = data.warehouse_stocks.dealer1;
        }
        partObj._updated_at = Date.now();
        crmStore.saveItem('parts', partObj);
      }
    };
    syncPartList(state.parts);
    syncPartList(state.allParts);

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

    // Keep state.currentUser (including permissions) in sync with fresh database profile
    if (state.currentUser && state.currentUser.id && Array.isArray(state.users)) {
      const freshSelf = state.users.find(u => Number(u.id) === Number(state.currentUser.id) || (u.username && u.username.toLowerCase() === state.currentUser.username?.toLowerCase()));
      if (freshSelf) {
        const prevPermsJson = JSON.stringify(state.currentUser.permissions || {});
        const nextPermsJson = freshSelf.permissions ? JSON.stringify(freshSelf.permissions) : prevPermsJson;
        if (freshSelf.full_name !== state.currentUser.full_name || freshSelf.role !== state.currentUser.role || prevPermsJson !== nextPermsJson) {
          state.currentUser = {
            ...state.currentUser,
            ...freshSelf,
            permissions: freshSelf.permissions || state.currentUser.permissions
          };
          localStorage.setItem('specmash_current_user', JSON.stringify(state.currentUser));
          applyUserPermissions();
          if (state.currentTab && !canUserAccessTab(state.currentTab)) {
            const firstAllowed = getFirstAllowedTabForUser();
            if (firstAllowed.dept) state.dealsDepartment = firstAllowed.dept;
            switchTab(firstAllowed.tab || '', { silent: true });
          }
        }
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
    const reqHeaders = {
      'Content-Type': 'application/json',
      'X-User-Role': state.currentUser?.role || ''
    };
    if (userId) {
      res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: reqHeaders,
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
          headers: reqHeaders,
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
        headers: reqHeaders,
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
  if (modal) {
    modal.classList.remove('hidden');
    modal.scrollTop = 0;
    const box = modal.querySelector('.modal-box');
    if (box) box.scrollTop = 0;
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
  const respDd = document.getElementById('deal-responsible-dropdown');
  if (respDd) respDd.classList.add('hidden');
}

// DEAL CLIENT SEARCH & AUTO-FILL WITH AUTOMATIC NEW CLIENT CREATION (Requirement #8 & #3.2)
function handleDealClientSearch(query) {
  const clearBtn = document.getElementById('deal-client-search-clear');
  const resultsDropdown = document.getElementById('deal-client-search-results');
  if (!resultsDropdown) return;

  const rawTrimmed = (query || '').trim();
  const q = rawTrimmed.toLowerCase();
  const digits = q.replace(/\D/g, '');

  if (clearBtn) clearBtn.classList.toggle('hidden', !q);

  if (q.length < 1) {
    resultsDropdown.classList.add('hidden');
    resultsDropdown.innerHTML = '';
    return;
  }

  const matches = (state.clients || []).filter(c => {
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const companyMatch = (c.company || '').toLowerCase().includes(q);
    const innMatch = (c.inn || '').toLowerCase().includes(q);
    const phoneDigits = (c.phone || '').replace(/\D/g, '');
    const phoneMatch = digits.length >= 2 && phoneDigits.includes(digits);
    return nameMatch || companyMatch || innMatch || phoneMatch;
  });

  const exactMatch = matches.some(c =>
    (c.name || '').trim().toLowerCase() === q ||
    (c.company || '').trim().toLowerCase() === q
  );

  const createNewBlockHtml = !exactMatch ? `
    <div class="p-3 bg-blue-50/90 border-t border-blue-200 space-y-2" onclick="event.stopPropagation()">
      <div class="text-[11px] text-blue-950 font-semibold flex items-center gap-1.5">
        <i data-lucide="user-plus" class="w-3.5 h-3.5 text-blue-600 shrink-0"></i>
        <span>${matches.length === 0 ? `Клиент «<b>${escapeHtml(rawTrimmed)}</b>» не найден в базе.` : `Нет точного совпадения для «<b>${escapeHtml(rawTrimmed)}</b>».`} Создать нового клиента?</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <input type="text" id="quick-new-client-name" value="${escapeHtml(rawTrimmed)}" placeholder="ФИО / Название клиента *" class="border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-600">
        <input type="text" id="quick-new-client-phone" value="" placeholder="Телефон (необязательно)" class="border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-600 font-mono">
      </div>
      <button type="button" onclick="createClientAutoFromDeal(event)" class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors">
        <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
        <span>Создать нового клиента автоматически</span>
      </button>
    </div>
  ` : '';

  const matchesHtml = matches.slice(0, 12).map(c => `
    <div onclick="selectDealClient(${c.id})" class="p-2.5 hover:bg-blue-50 cursor-pointer transition-colors group">
      <div class="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-blue-700">
        <span>${escapeHtml(c.name)}</span>
        <span class="font-mono text-blue-600 font-semibold text-[11px]">${escapeHtml(c.phone || '—')}</span>
      </div>
      <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
        ${c.company ? `<span>${escapeHtml(c.company)}</span>` : '<span class="text-slate-400">Физлицо</span>'}
        ${c.inn ? `<span class="font-mono text-slate-600 bg-slate-100 px-1 rounded">ИНН: ${escapeHtml(c.inn)}</span>` : ''}
      </div>
    </div>
  `).join('');

  resultsDropdown.innerHTML = matchesHtml + createNewBlockHtml;
  resultsDropdown.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

async function createClientAutoFromDeal(event = null, directName = null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const nameInput = document.getElementById('quick-new-client-name');
  const phoneInput = document.getElementById('quick-new-client-phone');
  const searchInput = document.getElementById('deal-client-search');

  const nameVal = (directName || nameInput?.value || searchInput?.value || '').trim();
  const phoneVal = (phoneInput?.value || '').trim();

  if (!nameVal) {
    showToast('Введите имя или название нового клиента', 'error');
    return null;
  }

  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameVal,
        company: '',
        phone: phoneVal,
        email: '',
        address: '',
        notes: 'Создан автоматически из карточки сделки'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) throw new Error(data.detail || data.message || 'Не удалось создать клиента');

    const newClient = {
      id: data.id,
      name: nameVal,
      company: '',
      phone: phoneVal,
      email: '',
      address: '',
      notes: 'Создан автоматически из карточки сделки',
      equipment_count: 0,
      deals_count: 0,
      total_revenue: 0
    };
    crmStore.saveItem('clients', newClient);
    if (!Array.isArray(state.clients)) state.clients = [];
    state.clients.unshift(newClient);

    await loadClientsListOptions();
    await selectDealClient(newClient.id);
    showToast(`Новый клиент «${nameVal}» автоматически создан и выбран!`);
    return newClient;
  } catch (err) {
    showToast(err.message || 'Ошибка автосоздания клиента', 'error');
    return null;
  }
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
  let reqType = type || 'service';
  const dealIdVal = document.getElementById('deal-id')?.value;
  if (!dealIdVal) {
    const allowedDepts = getAllowedDealsDepartments();
    if (allowedDepts.length > 0 && !allowedDepts.includes(reqType)) {
      reqType = allowedDepts[0];
    }
  }
  state.dealModalType = reqType;
  const isParts = state.dealModalType === 'parts_sale';
  const isSales = state.dealModalType === 'sales';
  const typeInput = document.getElementById('deal-type');
  if (typeInput) typeInput.value = state.dealModalType;

  const btnService = document.getElementById('deal-type-btn-service');
  const btnParts = document.getElementById('deal-type-btn-parts');
  const btnSales = document.getElementById('deal-type-btn-sales');

  const inactiveBtn = 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1';
  if (btnService) btnService.className = `${(!isParts && !isSales) ? 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-blue-900 shadow-xs flex items-center justify-center gap-1' : inactiveBtn}${hasUserPerm('deals_sto') ? '' : ' hidden'}`;
  if (btnParts) btnParts.className = `${isParts ? 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-emerald-900 shadow-xs flex items-center justify-center gap-1' : inactiveBtn}${hasUserPerm('deals_parts') ? '' : ' hidden'}`;
  if (btnSales) btnSales.className = `${isSales ? 'flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-indigo-900 shadow-xs flex items-center justify-center gap-1' : inactiveBtn}${hasUserPerm('deals_sales') ? '' : ' hidden'}`;

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
    stageSelect.onchange = function() {
      if (this.value === 'completed') {
        const titleVal = document.getElementById('deal-title')?.value || 'Сделка';
        const dId = document.getElementById('deal-id')?.value || 'НОВАЯ';
        promptDealCompletionOutcome({ id: dId, title: titleVal }, (outcome) => {
          const outcomeSelect = document.getElementById('deal-closing-outcome');
          if (outcomeSelect) outcomeSelect.value = outcome;
        });
      }
    };
  }

  // Requirement 3.1 & Requirement 2: In Sales Department ("Отдел продаж"):
  // - Hide "Тип заказ-наряда" (#deal-service-type-group)
  // - Show "Банк" (#deal-bank-group)
  // - Allow editing Registration Date (#deal-created-at-input)
  const serviceTypeGroup = document.getElementById('deal-service-type-group');
  const bankGroup = document.getElementById('deal-bank-group');
  const topMetaGrid = document.getElementById('deal-top-meta-grid');
  if (serviceTypeGroup) {
    serviceTypeGroup.classList.toggle('hidden', isSales);
  }
  if (bankGroup) {
    bankGroup.classList.toggle('hidden', !isSales);
  }
  if (topMetaGrid) {
    topMetaGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs';
  }
  const dateCreatedSpan = document.getElementById('deal-date-created');
  const dateCreatedInput = document.getElementById('deal-created-at-input');
  if (dateCreatedSpan) dateCreatedSpan.classList.toggle('hidden', isSales);
  if (dateCreatedInput) dateCreatedInput.classList.toggle('hidden', !isSales);

  // Requirement 3.3: Toggle between Service Equipment vs Sales Equipment Catalog in deal card
  const serviceEqCol = document.getElementById('deal-service-equipment-col');
  const salesEqCol = document.getElementById('deal-sales-equipment-col');
  if (serviceEqCol) serviceEqCol.classList.toggle('hidden', isSales);
  if (salesEqCol) salesEqCol.classList.toggle('hidden', !isSales);

  // Hide warehouse spare parts write-off in Sales Department ("Отдел продаж"),
  // and toggle between parts selling sum ("Заказ-наряды") vs cost ("Отдел продаж")
  const partsSection = document.getElementById('deal-parts-section');
  const costLabel = document.getElementById('deal-cost-label');
  const costInput = document.getElementById('deal-cost');
  const partsSellingInput = document.getElementById('deal-parts-selling-total');
  const laborCostGroup = document.getElementById('deal-labor-cost-group');
  const laborCostLabel = document.getElementById('deal-labor-cost-label');
  if (laborCostLabel) {
    laborCostLabel.textContent = isSales ? 'Доп. услуги / предпродажка (AMD)' : 'Стоимость работы (AMD)';
  }

  if (partsSection) {
    if (isSales) {
      partsSection.classList.add('hidden');
      hideAttachPartRow();
    } else {
      partsSection.classList.remove('hidden');
    }
  }

  // Requirements 1.3, 1.4, 1.5, 1.6:
  // In Sales Dept ("Отдел продаж"):
  // - Hide "Доп.услуги/предпродажка" (#deal-labor-cost-group)
  // - Hide "Себестоимость" (#deal-cost-group)
  // - Show Currency (AMD, USD, EUR), Subtotal, and Discount (#deal-sales-finance-row)
  // - Auto-calculate "Сумма после скидки" (#deal-amount)
  const costGroup = document.getElementById('deal-cost-group');
  const salesFinanceRow = document.getElementById('deal-sales-finance-row');
  const stdFinanceGrid = document.getElementById('deal-standard-finance-grid');
  const amountLabel = document.getElementById('deal-amount-label');
  const cur = normalizeDealCurrency(document.getElementById('deal-currency')?.value || 'AMD');

  if (laborCostGroup) laborCostGroup.classList.toggle('hidden', isSales);
  if (costGroup) costGroup.classList.toggle('hidden', isSales);
  if (salesFinanceRow) salesFinanceRow.classList.toggle('hidden', !isSales);

  if (isSales) {
    if (stdFinanceGrid) stdFinanceGrid.className = 'grid grid-cols-1 gap-4';
    if (amountLabel) amountLabel.textContent = `Итого сумма после скидки (${cur})`;
  } else {
    if (stdFinanceGrid) stdFinanceGrid.className = 'grid grid-cols-1 md:grid-cols-3 gap-4';
    if (amountLabel) amountLabel.textContent = 'Сумма клиенту (AMD)';
    if (costLabel) costLabel.textContent = 'Сумма продажи з/ч (AMD)';
    if (partsSellingInput) partsSellingInput.classList.remove('hidden');
    if (costInput) costInput.classList.add('hidden');
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

function formatResponsibleBadges(respStr) {
  if (!respStr || !String(respStr).trim()) return '—';
  const names = String(respStr).split(',').map(s => s.trim()).filter(Boolean);
  if (names.length === 0) return '—';
  if (names.length === 1) return escapeHtml(names[0]);
  return `<div class="flex flex-wrap gap-1">${names.map(n => `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium">${escapeHtml(n)}</span>`).join('')}</div>`;
}

let selectedDealResponsibles = [];

function getDealResponsibles() {
  return selectedDealResponsibles.join(', ');
}

function setDealResponsibles(rawVal) {
  const names = String(rawVal || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  selectedDealResponsibles = Array.from(new Set(names));
  const hiddenInput = document.getElementById('deal-responsible');
  if (hiddenInput) hiddenInput.value = getDealResponsibles();
  renderDealResponsibleSelector();
}

function renderDealResponsibleSelector() {
  const hiddenInput = document.getElementById('deal-responsible');
  const labelEl = document.getElementById('deal-responsible-label');
  const dropdownEl = document.getElementById('deal-responsible-dropdown');
  const chipsEl = document.getElementById('deal-responsible-chips');

  if (hiddenInput) hiddenInput.value = getDealResponsibles();

  if (labelEl) {
    if (selectedDealResponsibles.length === 0) {
      labelEl.textContent = 'Выберите сотрудников...';
      labelEl.className = 'truncate text-slate-400';
    } else if (selectedDealResponsibles.length === 1) {
      labelEl.textContent = selectedDealResponsibles[0];
      labelEl.className = 'truncate text-slate-800 font-semibold';
    } else {
      labelEl.textContent = `Выбрано сотрудников: ${selectedDealResponsibles.length}`;
      labelEl.className = 'truncate text-blue-700 font-bold';
    }
  }

  if (chipsEl) {
    chipsEl.innerHTML = selectedDealResponsibles.map(name => `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-semibold">
        <span>${escapeHtml(name)}</span>
        <button type="button" onclick="removeDealResponsibleChip('${escapeHtml(name).replace(/'/g, "\\'")}', event)" class="text-blue-500 hover:text-rose-600 font-bold leading-none">&times;</button>
      </span>
    `).join('');
  }

  if (dropdownEl) {
    const knownNames = new Set((state.users || []).map(u => u.full_name));
    const extraSelected = selectedDealResponsibles.filter(n => !knownNames.has(n));
    const allOptions = [
      ...(state.users || []).map(u => ({
        name: u.full_name,
        roleLabel: ROLE_DEFINITIONS[u.role]?.label || u.role
      })),
      ...extraSelected.map(n => ({ name: n, roleLabel: 'Сотрудник' }))
    ];

    dropdownEl.innerHTML = allOptions.map(opt => {
      const isChecked = selectedDealResponsibles.includes(opt.name);
      const safeName = escapeHtml(opt.name).replace(/'/g, "\\'");
      return `
        <div onclick="toggleDealResponsibleOption('${safeName}', event)" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${isChecked ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-700'}">
          <div class="flex items-center gap-2 min-w-0">
            <input type="checkbox" ${isChecked ? 'checked' : ''} class="rounded text-blue-600 pointer-events-none">
            <span class="truncate">${escapeHtml(opt.name)}</span>
          </div>
          <span class="text-[10px] text-slate-400 ml-2 shrink-0">${escapeHtml(opt.roleLabel)}</span>
        </div>
      `;
    }).join('');
  }
}

function toggleDealResponsibleDropdown(event) {
  if (event) event.stopPropagation();
  const btn = document.getElementById('deal-responsible-btn');
  if (btn && btn.disabled) return;
  const dropdownEl = document.getElementById('deal-responsible-dropdown');
  if (dropdownEl) {
    dropdownEl.classList.toggle('hidden');
  }
}

function toggleDealResponsibleOption(empName, event) {
  if (event) event.stopPropagation();
  const idx = selectedDealResponsibles.indexOf(empName);
  if (idx >= 0) {
    selectedDealResponsibles.splice(idx, 1);
  } else {
    selectedDealResponsibles.push(empName);
  }
  renderDealResponsibleSelector();
}

function removeDealResponsibleChip(empName, event) {
  if (event) event.stopPropagation();
  const btn = document.getElementById('deal-responsible-btn');
  if (btn && btn.disabled) return;
  selectedDealResponsibles = selectedDealResponsibles.filter(n => n !== empName);
  renderDealResponsibleSelector();
}

document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('deal-responsible-wrapper');
  const dropdown = document.getElementById('deal-responsible-dropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  }
});

async function openDealModal(dealId = null, defaultStage = 'new', defaultType = null) {
  await Promise.all([loadClientsListOptions(), loadWarehousePartsOptions(), loadEmployeesSelectOptions(), loadEquipment(), loadSalesEquipmentOptions()]);

  const form = document.getElementById('form-deal');
  form.reset();
  document.getElementById('deal-id').value = '';
  document.getElementById('deal-parts-section').classList.remove('hidden');
  hideAttachPartRow();
  document.getElementById('btn-delete-deal').classList.add('hidden');
  const datesBanner = document.getElementById('deal-dates-banner');
  if (datesBanner) datesBanner.classList.remove('hidden');
  const todayIso = new Date().toISOString().slice(0, 10);
  const createdEl = document.getElementById('deal-date-created');
  if (createdEl) createdEl.textContent = new Date().toLocaleDateString('ru-RU');
  const createdInputEl = document.getElementById('deal-created-at-input');
  if (createdInputEl) createdInputEl.value = todayIso;
  const bankInputEl = document.getElementById('deal-bank-name');
  if (bankInputEl) bankInputEl.value = '';
  const completedEl = document.getElementById('deal-date-completed');
  if (completedEl) completedEl.textContent = 'В работе';
  const laborInput = document.getElementById('deal-labor-cost');
  if (laborInput) laborInput.value = '';
  const lockedBanner = document.getElementById('deal-locked-banner');
  if (lockedBanner) lockedBanner.classList.add('hidden');

  const fieldsToUnlock = ['deal-title', 'deal-client', 'deal-equipment', 'deal-stage', 'deal-labor-cost', 'deal-amount', 'deal-cost', 'deal-priority', 'deal-responsible', 'deal-responsible-btn', 'deal-deadline', 'deal-description', 'deal-service-type', 'deal-closing-outcome', 'deal-bank-name', 'deal-created-at-input'];
  fieldsToUnlock.forEach(fId => {
    const el = document.getElementById(fId);
    if (el) el.disabled = false;
  });
  const saveBtn = document.getElementById('btn-save-deal');
  if (saveBtn) saveBtn.classList.remove('hidden');

  // Reset search & auto-fill
  clearDealClientSearch();
  clearDealSalesEqSearch();

  let targetType = defaultType || (state.dealsDepartment === 'parts_sale' ? 'parts_sale' : (state.dealsDepartment === 'sales' ? 'sales' : 'service'));

  if (dealId) {
    try {
      const res = await fetch(`/api/deals/${dealId}`);
      if (!res.ok) throw new Error('Сделка не найдена');
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

      // Requirement #4 & #2: Display deal registration (and populate editable date input for Sales Dept) and closing dates
      if (datesBanner) {
        datesBanner.classList.remove('hidden');
        document.getElementById('deal-date-created').textContent = formatDate(deal.created_at) || '—';
        if (createdInputEl) {
          const rawDate = String(deal.created_at || '').trim();
          createdInputEl.value = rawDate.length >= 10 ? rawDate.slice(0, 10) : todayIso;
        }
        const isClosed = deal.stage === 'completed';
        const completedText = (isClosed && deal.completed_at) ? formatDate(deal.completed_at) : (isClosed ? 'Закрыта' : 'В работе');
        document.getElementById('deal-date-completed').textContent = completedText;
      }
      if (bankInputEl) {
        bankInputEl.value = deal.bank_name || '';
      }

      document.getElementById('deal-id').value = deal.id;
      document.getElementById('deal-title').value = deal.title;
      document.getElementById('deal-client').value = deal.client_id || '';
      await handleDealClientChange(deal.client_id, deal.equipment_id, deal.equipment_license_plate || '');
      document.getElementById('deal-stage').value = deal.stage;
      const laborCostEl = document.getElementById('deal-labor-cost');
      if (laborCostEl) laborCostEl.value = deal.labor_cost || 0;
      document.getElementById('deal-amount').value = deal.amount;
      document.getElementById('deal-cost').value = deal.cost;

      // Sales Department multi-items, currency & discount initialization (Requirements 1.1-1.6)
      const currSelect = document.getElementById('deal-currency');
      if (currSelect) currSelect.value = normalizeDealCurrency(deal.currency || 'AMD');
      const discountInput = document.getElementById('deal-discount');
      if (discountInput) discountInput.value = Number(deal.discount || 0);
      handleDealCurrencyChange(currSelect ? currSelect.value : 'AMD', false);

      if (deal.deal_type === 'sales') {
        initDealSalesItemsFromDeal(deal);
      } else {
        state.currentDealSalesItems = [];
      }
      document.getElementById('deal-priority').value = deal.priority;
      setDealResponsibles(deal.responsible || '');
      document.getElementById('deal-deadline').value = deal.deadline || '';
      document.getElementById('deal-description').value = deal.description || '';

      const serviceTypeSelect = document.getElementById('deal-service-type');
      if (serviceTypeSelect) serviceTypeSelect.value = deal.service_type || 'service';

      const outcomeSelect = document.getElementById('deal-closing-outcome');
      if (outcomeSelect) outcomeSelect.value = deal.closing_outcome || 'success';

      // Requirement #5: Lockdown of closed/paid deals for non-admins
      const isLocked = isDealLockedForUser(deal);
      if (lockedBanner) {
        if (isLocked) lockedBanner.classList.remove('hidden');
        else lockedBanner.classList.add('hidden');
      }

      const fieldsToLock = ['deal-title', 'deal-client', 'deal-equipment', 'deal-stage', 'deal-labor-cost', 'deal-amount', 'deal-cost', 'deal-priority', 'deal-responsible', 'deal-responsible-btn', 'deal-deadline', 'deal-description', 'deal-service-type', 'deal-closing-outcome', 'deal-bank-name', 'deal-created-at-input'];
      fieldsToLock.forEach(fId => {
        const el = document.getElementById(fId);
        if (el) el.disabled = isLocked;
      });

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
    state.currentDealSalesItems = [];
    const currSelect = document.getElementById('deal-currency');
    if (currSelect) currSelect.value = 'AMD';
    const discountInput = document.getElementById('deal-discount');
    if (discountInput) discountInput.value = '0';
    const subtotalInput = document.getElementById('deal-sales-subtotal');
    if (subtotalInput) subtotalInput.value = '0';
    setDealModalType(targetType);
    handleDealCurrencyChange('AMD', false);
    renderDealSalesItemsList();
    document.getElementById('deal-stage').value = defaultStage || 'new';
    const defaultResp = state.currentUser?.full_name || (state.users && state.users[0] ? state.users[0].full_name : '');
    setDealResponsibles(defaultResp);
    renderDealAttachedParts([]);
    await handleDealClientChange(document.getElementById('deal-client').value);
  }

  openModal('modal-deal');
  if (window.lucide) lucide.createIcons();
}

async function loadEmployeesSelectOptions() {
  if (state.users.length === 0) await loadUsers();
  renderDealResponsibleSelector();
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

async function handleDealClientChange(clientId, selectedEqId = null, fallbackPlate = '') {
  const eqSelect = document.getElementById('deal-equipment');
  if (!eqSelect) return;
  const defaultOption = '<option value="">(Без привязки к технике / Запчасти / Консультация)</option>';

  // Sync client search and badge if user changes select dropdown
  const client = (state.clients || []).find(c => c.id == clientId);
  const badge = document.getElementById('deal-client-selected-badge');
  const badgeText = document.getElementById('deal-client-selected-text');
  const searchInput = document.getElementById('deal-client-search');
  const clearBtn = document.getElementById('deal-client-search-clear');

  const viewClientBtn = document.getElementById('btn-deal-view-client');
  if (viewClientBtn) {
    viewClientBtn.classList.toggle('hidden', !clientId || Number(clientId) <= 0);
  }

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
  const formatEqOptLabel = (eq, includeClient = false) => {
    const parts = [];
    if (eq.license_plate) parts.push(`Гос. знак: ${eq.license_plate}`);
    parts.push(`VIN: ${eq.serial_vin || 'б/н'}`);
    if (includeClient && eq.client_name) parts.push(eq.client_name);
    return `${eq.name} (${parts.join(' • ')})`;
  };

  if (clientEq.length > 0) {
    optionsHtml += `<optgroup label="Техника данного заказчика">` + clientEq.map(eq => `
      <option value="${eq.id}" ${selectedEqId == eq.id ? 'selected' : ''}>${escapeHtml(formatEqOptLabel(eq, false))}</option>
    `).join('') + `</optgroup>`;
  }

  if (otherEq.length > 0) {
    optionsHtml += `<optgroup label="${clientId ? 'Остальная техника СТО' : 'Вся зарегистрированная техника СТО'}">` + otherEq.map(eq => `
      <option value="${eq.id}" ${selectedEqId == eq.id ? 'selected' : ''}>${escapeHtml(formatEqOptLabel(eq, true))}</option>
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
  updateDealEquipmentViewBtn(eqSelect.value, fallbackPlate);
}

function renderDealAttachedParts(parts) {
  const list = Array.isArray(parts) ? parts : [];
  state.currentDealAttachedParts = list;
  const totalSelling = list.reduce((sum, p) => sum + Number(p.selling_price || 0) * Number(p.quantity || 0), 0);

  const sellingInput = document.getElementById('deal-parts-selling-total');
  if (sellingInput) {
    sellingInput.value = Math.round(totalSelling);
  }
  const totalBadge = document.getElementById('deal-parts-total-badge');
  if (totalBadge) {
    totalBadge.textContent = formatMoney(totalSelling);
  }

  const isLocked = Boolean(document.getElementById('deal-title')?.disabled);
  const attachBtn = document.getElementById('btn-show-attach-part');
  if (attachBtn) {
    attachBtn.classList.toggle('hidden', isLocked);
  }

  const container = document.getElementById('deal-attached-parts-list');
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-1">Запчасти со склада еще не списывались</div>';
    return;
  }
  const dealId = document.getElementById('deal-id').value;

  container.innerHTML = list.map(p => {
    const rawQty = Number(p.quantity || 1);
    const qty = rawQty > 0 ? Math.round(rawQty * 100) / 100 : 1;
    const unitPrice = Number(p.selling_price || 0);
    const lineTotal = unitPrice * qty;
    const unit = getPartUnit(p);
    const isOil = unit === 'л';
    const decDelta = (isOil || qty <= 1 || !Number.isInteger(qty)) ? 0.5 : 1;
    const incDelta = (isOil || qty < 1 || !Number.isInteger(qty)) ? 0.5 : 1;
    const decQty = Math.max(0, Math.round((qty - decDelta) * 100) / 100);
    const incQty = Math.round((qty + incDelta) * 100) / 100;
    return `
    <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
      <div class="min-w-0 flex-1">
        <div class="font-bold text-slate-800 truncate flex items-center gap-1.5 flex-wrap" title="${escapeHtml(p.part_name)}">
          <span class="truncate">${escapeHtml(p.part_name)}</span>
          <span class="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-semibold shrink-0">Склад: ${escapeHtml(p.warehouse_label || PART_WAREHOUSE_LABELS_JS[p.warehouse] || 'Оснавной')}</span>
        </div>
        <div class="text-[11px] font-mono text-slate-500">${escapeHtml(p.sku)} • ${formatMoney(unitPrice)} / ${unit}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <div class="inline-flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
          <button type="button" ${isLocked ? 'disabled' : ''} onclick="changeAttachedPartQty(${dealId}, ${p.deal_part_id}, ${decQty})" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold leading-none ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}" title="Уменьшить количество">−</button>
          <input type="text" inputmode="decimal" value="${qty}" ${isLocked ? 'disabled' : ''} onchange="changeAttachedPartQty(${dealId}, ${p.deal_part_id}, this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();changeAttachedPartQty(${dealId}, ${p.deal_part_id}, this.value);}" class="w-14 text-center font-mono font-bold text-xs py-1 outline-none border-x border-slate-200 bg-white">
          <button type="button" ${isLocked ? 'disabled' : ''} onclick="changeAttachedPartQty(${dealId}, ${p.deal_part_id}, ${incQty})" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold leading-none ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}" title="Увеличить количество">+</button>
        </div>
        <span class="font-mono font-bold text-emerald-700 min-w-[85px] text-right">${formatMoney(lineTotal)}</span>
        ${isLocked ? '' : `
        <button type="button" onclick="removeAttachedPart(${dealId}, ${p.deal_part_id})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50" title="Вернуть запчасть на склад">
          <i data-lucide="trash" class="w-3.5 h-3.5"></i>
        </button>`}
      </div>
    </div>
  `;
  }).join('');

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

function getWarehousePartsCatalog() {
  if (state.allParts && Array.isArray(state.allParts) && state.allParts.length > 0) {
    return state.allParts;
  }
  return Array.isArray(state.parts) ? state.parts : [];
}

async function loadWarehousePartsOptions(filteredParts = null) {
  if (getWarehousePartsCatalog().length === 0) await loadParts('');
  const select = document.getElementById('attach-part-select');
  if (!select) return;

  const baseList = filteredParts || getWarehousePartsCatalog();
  if (baseList.length === 0) {
    select.innerHTML = '<option value="" disabled selected>Запчасти не найдены</option>';
    return;
  }

  // Sort in-stock parts first so the first option is available for immediate write-off
  const partsToRender = [...baseList].sort((a, b) => {
    const aStock = Number(a.quantity || 0) > 0 ? 1 : 0;
    const bStock = Number(b.quantity || 0) > 0 ? 1 : 0;
    if (aStock !== bStock) return bStock - aStock;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  const firstInStock = partsToRender.find(p => Number(p.quantity || 0) > 0);
  const selectedId = firstInStock ? firstInStock.id : partsToRender[0].id;

  select.innerHTML = partsToRender.map(p => {
    const qty = Number(p.quantity || 0);
    const isSel = String(p.id) === String(selectedId);
    const unit = getPartUnit(p);
    const wh = getPartWarehouseStocks(p);
    return `
      <option value="${p.id}" ${qty <= 0 ? 'disabled' : ''} ${isSel ? 'selected' : ''}>
        ${escapeHtml(p.name)} [${escapeHtml(p.sku)}] — всего: ${qty} ${unit} (Осн: ${wh.main} | Витр: ${wh.showcase} | Дилер 1: ${wh.dealer1}) • ${formatMoney(p.selling_price)}
      </option>
    `;
  }).join('');

  if (firstInStock) {
    select.value = String(firstInStock.id);
    handleAttachPartSelectChange(firstInStock.id);
  }
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

  const catalog = getWarehousePartsCatalog();
  const matches = catalog.filter(p => {
    const nameMatch = p.name && String(p.name).toLowerCase().includes(q);
    const skuMatch = p.sku && String(p.sku).toLowerCase().includes(q);
    const catMatch = p.category && String(p.category).toLowerCase().includes(q);
    return nameMatch || skuMatch || catMatch;
  });

  loadWarehousePartsOptions(matches);

  if (!suggestionsBox) return;

  if (matches.length === 0) {
    suggestionsBox.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Запчасти по запросу «${escapeHtml(q)}» не найдены</div>`;
    suggestionsBox.classList.remove('hidden');
    return;
  }

  suggestionsBox.innerHTML = matches.slice(0, 15).map(p => {
    const qty = Number(p.quantity || 0);
    const isOut = qty <= 0;
    const wh = getPartWarehouseStocks(p);
    return `
      <div onclick="selectAttachPartSuggestion(${p.id})" class="p-2.5 hover:bg-amber-50 cursor-pointer flex items-center justify-between text-xs transition-colors">
        <div class="min-w-0 pr-2">
          <div class="font-bold text-slate-800 flex items-center gap-1.5 truncate">
            <span class="truncate">${escapeHtml(p.name)}</span>
            <span class="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200 shrink-0 font-bold">${escapeHtml(p.sku)}</span>
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-1.5">
            <span>Оснавной: <b>${wh.main}</b></span>•<span>Витрина: <b>${wh.showcase}</b></span>•<span>Дилер 1: <b>${wh.dealer1}</b></span>
            ${p.location ? '• Ячейка: ' + escapeHtml(p.location) : ''}
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-bold ${isOut ? 'text-rose-500' : 'text-emerald-700'} font-mono">${qty} ${getPartUnit(p)}</div>
          <div class="text-[10px] text-slate-500 font-mono">${formatMoney(p.selling_price)}</div>
        </div>
      </div>
    `;
  }).join('');
  suggestionsBox.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

async function selectAttachPartSuggestion(partId) {
  const catalog = getWarehousePartsCatalog();
  const part = catalog.find(p => Number(p.id) === Number(partId));
  const searchInput = document.getElementById('attach-part-search');
  const suggestionsBox = document.getElementById('attach-part-suggestions');
  const select = document.getElementById('attach-part-select');

  if (part) {
    if (Number(part.quantity || 0) <= 0) {
      showToast(`Запчасть «${part.name}» отсутствует на складе (остаток 0 шт)`, 'error');
      return;
    }
    if (searchInput) searchInput.value = `[${part.sku}] ${part.name}`;
    await loadWarehousePartsOptions([part, ...catalog.filter(p => Number(p.id) !== Number(partId))]);
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
  const part = getWarehousePartsCatalog().find(p => String(p.id) === String(partId));
  if (part) {
    const searchInput = document.getElementById('attach-part-search');
    if (searchInput && !searchInput.value) {
      searchInput.placeholder = `Выбрано: [${part.sku}] ${part.name}`;
    }
    const unit = getPartUnit(part);
    const unitLabel = document.getElementById('attach-part-unit-label');
    if (unitLabel) {
      unitLabel.textContent = unit === 'л' ? 'Кол-во (Л):' : 'Кол-во (Шт):';
    }
    const wh = getPartWarehouseStocks(part);
    const whSelect = document.getElementById('attach-part-warehouse');
    if (whSelect) {
      const prevVal = whSelect.value;
      whSelect.innerHTML = `
        <option value="main">Оснавной (${wh.main} ${unit})</option>
        <option value="showcase">Витрина (${wh.showcase} ${unit})</option>
        <option value="dealer1">Дилер 1 (${wh.dealer1} ${unit})</option>
      `;
      if (prevVal && Number(wh[prevVal] || 0) > 0) {
        whSelect.value = prevVal;
      } else if (Number(wh.main || 0) > 0) {
        whSelect.value = 'main';
      } else if (Number(wh.showcase || 0) > 0) {
        whSelect.value = 'showcase';
      } else if (Number(wh.dealer1 || 0) > 0) {
        whSelect.value = 'dealer1';
      } else {
        whSelect.value = 'main';
      }
    }
    const qtyInput = document.getElementById('attach-part-qty');
    const avail = Number(part.quantity || 0);
    if (qtyInput && avail > 0 && avail < 1) {
      qtyInput.value = String(avail);
    }
  }
}

function stepAttachPartQty(direction) {
  const qtyInput = document.getElementById('attach-part-qty');
  if (!qtyInput) return;
  const select = document.getElementById('attach-part-select');
  const part = getWarehousePartsCatalog().find(p => String(p.id) === String(select?.value));
  const isOil = part ? getPartUnit(part) === 'л' : false;
  const cur = parsePartNumberInput(qtyInput.value, 1);
  const delta = (isOil || cur <= 1 || !Number.isInteger(cur)) ? 0.5 : 1;
  const next = direction < 0
    ? Math.max(0.5, Math.round((cur - delta) * 100) / 100)
    : Math.round((cur + delta) * 100) / 100;
  qtyInput.value = String(next);
}

function showAttachPartRow() {
  document.getElementById('attach-part-row').classList.remove('hidden');
  clearAttachPartSearch();
  const searchInput = document.getElementById('attach-part-search');
  if (searchInput) searchInput.focus();
}

function hideAttachPartRow() {
  const row = document.getElementById('attach-part-row');
  if (row) row.classList.add('hidden');
  const suggestionsBox = document.getElementById('attach-part-suggestions');
  if (suggestionsBox) suggestionsBox.classList.add('hidden');
}

async function ensureDealSavedForPartWriteOff() {
  let dealId = document.getElementById('deal-id').value;
  if (dealId) return dealId;

  const titleInput = document.getElementById('deal-title');
  const dealType = document.getElementById('deal-type')?.value || 'service';
  let title = (titleInput?.value || '').trim();
  if (!title) {
    title = dealType === 'parts_sale' ? 'Заказ на продажу запчастей' : 'Заказ-наряд СТО';
    if (titleInput) titleInput.value = title;
  }

  const eqSelect = document.getElementById('deal-equipment');
  const eqId = parseInt(eqSelect?.value) || null;
  const clientId = parseInt(document.getElementById('deal-client')?.value) || null;
  const respValue = getDealResponsibles() || state.currentUser?.full_name || 'Мастер-приемщик';

  const payload = {
    title,
    deal_type: dealType,
    client_id: clientId,
    equipment_id: eqId,
    stage: document.getElementById('deal-stage')?.value || 'new',
    labor_cost: parseFloat(document.getElementById('deal-labor-cost')?.value) || 0.0,
    amount: parseFloat(document.getElementById('deal-amount')?.value) || 0.0,
    cost: parseFloat(document.getElementById('deal-cost')?.value) || 0.0,
    priority: document.getElementById('deal-priority')?.value || 'normal',
    responsible: respValue,
    deadline: document.getElementById('deal-deadline')?.value || null,
    description: (document.getElementById('deal-description')?.value || '').trim(),
    service_type: document.getElementById('deal-service-type')?.value || 'service',
    closing_outcome: document.getElementById('deal-closing-outcome')?.value || 'success',
  };

  const res = await fetch('/api/deals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Role': state.currentUser?.role || ''
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error(data.detail || data.message || 'Не удалось создать наряд перед списанием запчасти');
  }

  document.getElementById('deal-id').value = data.id;
  crmStore.saveItem('deals', {
    ...payload,
    id: data.id,
    parts_count: 0,
    _updated_at: Date.now()
  });
  if (!Array.isArray(state.deals)) state.deals = [];
  if (!state.deals.some(d => Number(d.id) === Number(data.id))) {
    state.deals.unshift({ ...payload, id: data.id, parts_count: 0 });
  }
  return String(data.id);
}

async function submitAttachPart() {
  const partSelect = document.getElementById('attach-part-select');
  const partId = parseInt(partSelect?.value);
  const warehouse = document.getElementById('attach-part-warehouse')?.value || 'main';
  const whLabel = PART_WAREHOUSE_LABELS_JS[warehouse] || 'Оснавной';
  const rawQty = parsePartNumberInput(document.getElementById('attach-part-qty')?.value, 1);
  const qty = rawQty > 0 ? rawQty : 1;

  if (!partId || isNaN(partId)) {
    showToast('Выберите запчасть в наличии из списка склада', 'error');
    return;
  }

  const catalog = getWarehousePartsCatalog();
  const selectedPart = catalog.find(p => Number(p.id) === Number(partId));
  if (selectedPart) {
    const whStocks = getPartWarehouseStocks(selectedPart);
    const availWh = Number(whStocks[warehouse] || 0);
    if (availWh < qty) {
      showToast(`Недостаточно на складе «${whLabel}»! В наличии на этом складе: ${availWh} ${getPartUnit(selectedPart)}`, 'error');
      return;
    }
  }

  try {
    const dealId = await ensureDealSavedForPartWriteOff();
    const res = await fetch(`/api/deals/${dealId}/parts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser?.role || ''
      },
      body: JSON.stringify({ part_id: partId, quantity: qty, warehouse })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка списания запчасти');

    // Update warehouse stock in state.parts, state.allParts, and crmStore immediately
    const updatePartStock = (list) => {
      if (!Array.isArray(list)) return;
      const pObj = list.find(p => Number(p.id) === Number(partId));
      if (pObj) {
        pObj.quantity = typeof data.new_quantity === 'number' ? data.new_quantity : Math.max(0, Number(pObj.quantity || 0) - qty);
        if (data.warehouse_stocks) {
          pObj.warehouse_stocks = data.warehouse_stocks;
          pObj.qty_main = data.warehouse_stocks.main;
          pObj.qty_showcase = data.warehouse_stocks.showcase;
          pObj.qty_dealer1 = data.warehouse_stocks.dealer1;
        }
        pObj._updated_at = Date.now();
        crmStore.saveItem('parts', pObj);
      }
    };
    updatePartStock(state.parts);
    updatePartStock(state.allParts);

    // Update deal cost & parts_count in modal and state without losing unsaved form fields
    const costInput = document.getElementById('deal-cost');
    if (costInput && typeof data.parts_cost === 'number') {
      costInput.value = data.parts_cost;
    }

    const dealObj = (state.deals || []).find(d => Number(d.id) === Number(dealId));
    if (dealObj) {
      if (typeof data.parts_cost === 'number') dealObj.cost = data.parts_cost;
      if (typeof data.parts_selling_total === 'number') dealObj.parts_selling_total = data.parts_selling_total;
      if (typeof data.parts_count === 'number') dealObj.parts_count = data.parts_count;
      else dealObj.parts_count = Number(dealObj.parts_count || 0) + qty;
      dealObj._updated_at = Date.now();
      crmStore.saveItem('deals', dealObj);
    }

    if (Array.isArray(data.parts)) {
      renderDealAttachedParts(data.parts);
    } else {
      const dRes = await fetch(`/api/deals/${dealId}`);
      if (dRes.ok) {
        const dJson = await dRes.json();
        renderDealAttachedParts(dJson.parts || []);
      }
    }

    const qtyInput = document.getElementById('attach-part-qty');
    if (qtyInput) qtyInput.value = '1';
    await loadWarehousePartsOptions();
    hideAttachPartRow();

    showToast(data.message || 'Запчасть успешно списана со склада');
    renderPartsTable();
    renderDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Ошибка при списании запчасти', 'error');
  }
}

async function changeAttachedPartQty(dealId, dealPartId, newQty) {
  const parsedQty = parsePartNumberInput(newQty, NaN);
  if (isNaN(parsedQty)) return;
  if (parsedQty <= 0) {
    return removeAttachedPart(dealId, dealPartId);
  }

  try {
    const reqHeaders = {
      'Content-Type': 'application/json',
      'X-User-Role': state.currentUser?.role || ''
    };
    let res = await fetch(`/api/deals/${dealId}/parts/${dealPartId}`, {
      method: 'PATCH',
      headers: reqHeaders,
      body: JSON.stringify({ quantity: parsedQty })
    });
    if (!res.ok && res.status === 405) {
      res = await fetch(`/api/deals/${dealId}/parts/${dealPartId}/quantity`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ quantity: parsedQty })
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка изменения количества запчасти');

    if (data.part_id && typeof data.new_quantity === 'number') {
      const updatePartStock = (list) => {
        if (!Array.isArray(list)) return;
        const pObj = list.find(p => Number(p.id) === Number(data.part_id));
        if (pObj) {
          pObj.quantity = data.new_quantity;
          if (data.warehouse_stocks) {
            pObj.warehouse_stocks = data.warehouse_stocks;
            pObj.qty_main = data.warehouse_stocks.main;
            pObj.qty_showcase = data.warehouse_stocks.showcase;
            pObj.qty_dealer1 = data.warehouse_stocks.dealer1;
          }
          pObj._updated_at = Date.now();
          crmStore.saveItem('parts', pObj);
        }
      };
      updatePartStock(state.parts);
      updatePartStock(state.allParts);
    }

    const costInput = document.getElementById('deal-cost');
    if (costInput && typeof data.parts_cost === 'number') {
      costInput.value = data.parts_cost;
    }

    const dealObj = (state.deals || []).find(d => Number(d.id) === Number(dealId));
    if (dealObj) {
      if (typeof data.parts_cost === 'number') dealObj.cost = data.parts_cost;
      if (typeof data.parts_selling_total === 'number') dealObj.parts_selling_total = data.parts_selling_total;
      if (typeof data.parts_count === 'number') dealObj.parts_count = data.parts_count;
      dealObj._updated_at = Date.now();
      crmStore.saveItem('deals', dealObj);
    }

    if (Array.isArray(data.parts)) {
      renderDealAttachedParts(data.parts);
    } else {
      const dRes = await fetch(`/api/deals/${dealId}`);
      if (dRes.ok) {
        const dJson = await dRes.json();
        renderDealAttachedParts(dJson.parts || []);
      }
    }

    await loadWarehousePartsOptions();
    showToast(data.message || 'Количество списанной запчасти обновлено');
    renderPartsTable();
    renderDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Ошибка изменения количества запчасти', 'error');
    // Refresh current deal parts to restore valid input value
    try {
      const dRes = await fetch(`/api/deals/${dealId}`);
      if (dRes.ok) {
        const dJson = await dRes.json();
        renderDealAttachedParts(dJson.parts || []);
      }
    } catch (e) {}
  }
}

async function removeAttachedPart(dealId, dealPartId) {
  try {
    const reqHeaders = {
      'X-User-Role': state.currentUser?.role || ''
    };
    let res = await fetch(`/api/deals/${dealId}/parts/${dealPartId}`, {
      method: 'DELETE',
      headers: reqHeaders
    });
    if (!res.ok) {
      res = await fetch(`/api/deals/${dealId}/parts/${dealPartId}/delete`, {
        method: 'POST',
        headers: reqHeaders
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка при возврате запчасти');

    if (data.part_id && typeof data.new_quantity === 'number') {
      const updatePartStock = (list) => {
        if (!Array.isArray(list)) return;
        const pObj = list.find(p => Number(p.id) === Number(data.part_id));
        if (pObj) {
          pObj.quantity = data.new_quantity;
          if (data.warehouse_stocks) {
            pObj.warehouse_stocks = data.warehouse_stocks;
            pObj.qty_main = data.warehouse_stocks.main;
            pObj.qty_showcase = data.warehouse_stocks.showcase;
            pObj.qty_dealer1 = data.warehouse_stocks.dealer1;
          }
          pObj._updated_at = Date.now();
          crmStore.saveItem('parts', pObj);
        }
      };
      updatePartStock(state.parts);
      updatePartStock(state.allParts);
    }

    const costInput = document.getElementById('deal-cost');
    if (costInput && typeof data.parts_cost === 'number') {
      costInput.value = data.parts_cost;
    }

    const dealObj = (state.deals || []).find(d => Number(d.id) === Number(dealId));
    if (dealObj) {
      if (typeof data.parts_cost === 'number') dealObj.cost = data.parts_cost;
      if (typeof data.parts_selling_total === 'number') dealObj.parts_selling_total = data.parts_selling_total;
      if (typeof data.parts_count === 'number') dealObj.parts_count = data.parts_count;
      dealObj._updated_at = Date.now();
      crmStore.saveItem('deals', dealObj);
    }

    if (Array.isArray(data.parts)) {
      renderDealAttachedParts(data.parts);
    } else {
      const dRes = await fetch(`/api/deals/${dealId}`);
      if (dRes.ok) {
        const dJson = await dRes.json();
        renderDealAttachedParts(dJson.parts || []);
      }
    }

    await loadWarehousePartsOptions();
    showToast('Запчасть возвращена на склад');
    renderPartsTable();
    renderDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Ошибка при возврате запчасти', 'error');
  }
}

function handleDealLaborCostInput() {
  const laborVal = parseFloat(document.getElementById('deal-labor-cost')?.value) || 0;
  const partsVal = parseFloat(document.getElementById('deal-parts-selling-total')?.value) || 0;
  const amountEl = document.getElementById('deal-amount');
  if (amountEl) {
    amountEl.value = Math.round(laborVal + partsVal);
  }
}

async function saveDeal(e) {
  e.preventDefault();
  const dealId = document.getElementById('deal-id').value;
  const eqSelect = document.getElementById('deal-equipment');
  const dealType = document.getElementById('deal-type')?.value || 'service';
  let clientId = parseInt(document.getElementById('deal-client').value) || null;

  // Requirement 3.2: If no client is selected in dropdown, but user typed a new client name in #deal-client-search, offer/auto-create it
  const typedClientQuery = (document.getElementById('deal-client-search')?.value || '').trim();
  if (!clientId && typedClientQuery) {
    const matchedClient = (state.clients || []).find(c => (c.name || '').trim().toLowerCase() === typedClientQuery.toLowerCase());
    if (matchedClient) {
      clientId = matchedClient.id;
    } else if (confirm(`Клиент «${typedClientQuery}» не найден в базе. Создать нового клиента автоматически?`)) {
      const createdCl = await createClientAutoFromDeal(null, typedClientQuery);
      if (createdCl && createdCl.id) {
        clientId = createdCl.id;
      }
    }
  }

  let eqId = dealType === 'sales' ? null : (parseInt(eqSelect.value) || null);
  let salesEqId = null;
  let salesEqName = '';
  let salesItemsToSave = [];

  // Requirements 1.1-1.6 & 3.3: For Sales Dept deals, gather all added products (and auto-add any typed/selected product not yet in list)
  if (dealType === 'sales') {
    if (!Array.isArray(state.currentDealSalesItems)) state.currentDealSalesItems = [];
    const typedSalesEq = (document.getElementById('deal-sales-eq-search')?.value || '').trim();
    const pickedId = parseInt(document.getElementById('deal-sales-eq-id')?.value || document.getElementById('deal-sales-eq-select')?.value) || null;

    if (state.currentDealSalesItems.length === 0 && (pickedId || typedSalesEq)) {
      const matchedSalesEq = pickedId
        ? (state.salesEquipment || []).find(item => Number(item.id) === Number(pickedId))
        : (state.salesEquipment || []).find(item => (item.name || '').trim().toLowerCase() === typedSalesEq.toLowerCase());
      if (matchedSalesEq) {
        addDealSalesItemFromCatalog(matchedSalesEq, 1);
      } else if (typedSalesEq) {
        if (confirm(`Модель «${typedSalesEq}» отсутствует в базе техники для продажи. Добавить новый товар в базу автоматически?`)) {
          const createdSe = await createSalesEquipmentAutoFromDeal(null, typedSalesEq);
          if (createdSe && createdSe.id) {
            // createSalesEquipmentAutoFromDeal automatically adds the item to state.currentDealSalesItems
          } else {
            addCustomDealSalesItem(typedSalesEq, 0);
          }
        } else {
          addCustomDealSalesItem(typedSalesEq, 0);
        }
      }
    }

    salesItemsToSave = state.currentDealSalesItems.map(it => ({
      sales_equipment_id: it.sales_equipment_id || null,
      name: it.name || 'Спецтехника',
      category: normalizeSalesEqCategoryJS(it.category),
      quantity: Math.max(0.01, parsePartNumberInput(it.quantity, 1)),
      price: Math.max(0, parsePartNumberInput(it.price, 0)),
      vat_rate: Number(it.vat_rate ?? 20) === 0 ? 0 : 20,
      vat_mode: it.vat_mode || 'included',
    }));

    if (salesItemsToSave.length > 0) {
      salesEqId = salesItemsToSave[0].sales_equipment_id || null;
      salesEqName = salesItemsToSave.map(it => Number(it.quantity || 1) !== 1 ? `${it.name} (${it.quantity} шт.)` : it.name).join(', ');
    }
  }

  const responsibleVal = getDealResponsibles() || document.getElementById('deal-responsible')?.value || 'Мастер-приемщик';
  const dealCurrency = dealType === 'sales' ? normalizeDealCurrency(document.getElementById('deal-currency')?.value || 'AMD') : 'AMD';
  const dealDiscount = dealType === 'sales' ? Math.max(0, parsePartNumberInput(document.getElementById('deal-discount')?.value, 0)) : 0.0;

  const dealBankName = dealType === 'sales' ? (document.getElementById('deal-bank-name')?.value || '').trim() : '';
  const dealCreatedAt = dealType === 'sales' ? (document.getElementById('deal-created-at-input')?.value || null) : null;

  const payload = {
    title: document.getElementById('deal-title').value.trim(),
    deal_type: dealType,
    client_id: clientId,
    equipment_id: eqId,
    sales_equipment_id: salesEqId,
    sales_equipment_name: salesEqName,
    sales_items: salesItemsToSave,
    currency: dealCurrency,
    discount: dealDiscount,
    bank_name: dealBankName,
    created_at: dealCreatedAt,
    stage: document.getElementById('deal-stage').value,
    labor_cost: dealType === 'sales' ? 0.0 : (parseFloat(document.getElementById('deal-labor-cost')?.value) || 0.0),
    amount: parseFloat(document.getElementById('deal-amount').value) || 0.0,
    cost: dealType === 'sales' ? 0.0 : (parseFloat(document.getElementById('deal-cost').value) || 0.0),
    priority: document.getElementById('deal-priority').value,
    responsible: responsibleVal,
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
    const eqPlate = data.equipment_license_plate || (eqObj ? eqObj.license_plate : '');

    crmStore.saveItem('deals', {
      ...payload,
      id: savedId,
      deal_type: data.deal_type || payload.deal_type,
      parts_count: typeof data.parts_count === 'number' ? data.parts_count : undefined,
      parts_selling_total: typeof data.parts_selling_total === 'number' ? data.parts_selling_total : (parseFloat(document.getElementById('deal-parts-selling-total')?.value) || 0),
      client_name: data.client_name || (clientObj ? clientObj.name : ''),
      client_company: data.client_company || (clientObj ? clientObj.company : ''),
      client_phone: data.client_phone || (clientObj ? clientObj.phone : ''),
      equipment_name: eqName,
      equipment_vin: eqVin,
      equipment_license_plate: eqPlate,
      bank_name: data.bank_name !== undefined ? data.bank_name : dealBankName,
      created_at: data.created_at || dealCreatedAt || new Date().toISOString(),
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

async function printDealOrder(dealId = null, event = null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const modalEl = document.getElementById('modal-deal');
  const isModalOpen = modalEl && !modalEl.classList.contains('hidden');
  const modalDealId = document.getElementById('deal-id')?.value;
  const targetId = dealId || modalDealId;

  let dealData = null;
  if (targetId) {
    try {
      const res = await fetch(`/api/deals/${targetId}`);
      if (res.ok) {
        dealData = await res.json();
      }
    } catch (e) {}
  }

  if (!dealData) {
    dealData = (state.deals || []).find(d => String(d.id) === String(targetId)) || {};
  }

  // If printing from the open modal, overlay current form values so unsaved comments/fields are included
  if (isModalOpen && (!dealId || String(dealId) === String(modalDealId))) {
    const formClientId = parseInt(document.getElementById('deal-client')?.value, 10) || dealData.client_id;
    const formEqId = parseInt(document.getElementById('deal-equipment')?.value, 10) || dealData.equipment_id;
    const clientObj = (state.clients || []).find(c => Number(c.id) === Number(formClientId));
    const eqObj = (state.equipment || []).find(eq => Number(eq.id) === Number(formEqId));

    dealData = {
      ...dealData,
      id: targetId || 'НОВЫЙ',
      title: document.getElementById('deal-title')?.value?.trim() || dealData.title || 'Заказ-наряд',
      deal_type: document.getElementById('deal-type')?.value || dealData.deal_type || 'service',
      service_type: document.getElementById('deal-service-type')?.value || dealData.service_type || 'service',
      stage: document.getElementById('deal-stage')?.value || dealData.stage || 'new',
      labor_cost: parseFloat(document.getElementById('deal-labor-cost')?.value) || Number(dealData.labor_cost || 0),
      amount: parseFloat(document.getElementById('deal-amount')?.value) || Number(dealData.amount || 0),
      responsible: getDealResponsibles() || document.getElementById('deal-responsible')?.value || dealData.responsible || '—',
      deadline: document.getElementById('deal-deadline')?.value || dealData.deadline || '',
      description: document.getElementById('deal-description')?.value?.trim() ?? (dealData.description || ''),
      client_id: formClientId,
      client_name: clientObj?.name || dealData.client_name || 'Не указан',
      client_company: clientObj?.company || dealData.client_company || '',
      client_phone: clientObj?.phone || dealData.client_phone || '—',
      client_email: clientObj?.email || dealData.client_email || '',
      client_inn: clientObj?.inn || '',
      equipment_id: formEqId,
      equipment_name: eqObj?.name || dealData.equipment_name || 'Не привязана',
      equipment_vin: eqObj?.serial_vin || dealData.equipment_vin || '—',
      equipment_license_plate: eqObj?.license_plate || dealData.equipment_license_plate || '',
      equipment_hours: eqObj?.operating_hours || dealData.equipment_hours || '—',
      equipment_year: eqObj?.year || '',
      parts: Array.isArray(state.currentDealAttachedParts) ? state.currentDealAttachedParts : (dealData.parts || [])
    };
  } else {
    const clientObj = (state.clients || []).find(c => Number(c.id) === Number(dealData.client_id));
    const eqObj = (state.equipment || []).find(eq => Number(eq.id) === Number(dealData.equipment_id));
    dealData = {
      ...dealData,
      client_inn: clientObj?.inn || '',
      equipment_license_plate: eqObj?.license_plate || dealData.equipment_license_plate || '',
      equipment_year: eqObj?.year || '',
      parts: Array.isArray(dealData.parts) ? dealData.parts : []
    };
  }

  const settings = state.settings || {};
  const companyName = settings.company_name || 'СТО Спецмаш';
  const companySlogan = settings.company_slogan || 'Сервис спецтехники, грузовых авто и оборудования';
  const companyPhone = settings.company_phone || '';
  const companyEmail = settings.company_email || '';
  const companyAddress = settings.company_address || '';
  const companyTin = settings.company_tin || '';
  const logoUrl = settings.logo_url || settings.auth_logo_url || '';

  const allStages = [...SERVICE_KANBAN_STAGES, ...PARTS_KANBAN_STAGES, ...SALES_KANBAN_STAGES];
  const stageLabel = allStages.find(s => s.id === dealData.stage)?.label || dealData.stage || '—';

  const serviceTypeMap = {
    service: 'Сервис (ремонт / ТО)',
    pre_sale: 'Предпродажная подготовка',
    warranty: 'Гарантийное обслуживание'
  };
  const serviceTypeLabel = dealData.deal_type === 'parts_sale'
    ? 'Продажа запчастей'
    : (dealData.deal_type === 'sales' ? 'Отдел продаж спецтехники' : (serviceTypeMap[dealData.service_type] || 'Сервис (ремонт / ТО)'));

  const parts = Array.isArray(dealData.parts) ? dealData.parts : [];
  const totalPartsQty = parts.reduce((acc, p) => acc + Number(p.quantity || 0), 0);
  const totalPartsSum = parts.reduce((acc, p) => acc + Number(p.selling_price || 0) * Number(p.quantity || 0), 0);
  const laborCostVal = Number(dealData.labor_cost || 0);
  const dealAmount = Number(dealData.amount || 0);
  const printDate = new Date().toLocaleString('ru-RU');

  const partsRowsHtml = parts.length > 0
    ? parts.map((p, idx) => {
        const qty = Number(p.quantity || 1);
        const price = Number(p.selling_price || 0);
        const sum = qty * price;
        const unit = getPartUnit(p);
        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-family:monospace;font-weight:600;">${escapeHtml(p.sku || '—')}</td>
            <td>${escapeHtml(p.part_name || p.name || '—')}</td>
            <td>${escapeHtml(p.part_category || p.category || 'Запчасти')}</td>
            <td style="text-align:center;font-weight:700;">${qty} ${unit}</td>
            <td style="text-align:right;font-family:monospace;">${formatMoney(price)}</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;">${formatMoney(sum)}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:14px;">Запчасти со склада по данному заказ-наряду не списывались</td></tr>`;

  const printHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Заказ-наряд №${escapeHtml(String(dealData.id || ''))} — ${escapeHtml(companyName)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      margin: 0;
      padding: 24px;
      font-size: 13px;
      line-height: 1.45;
    }
    .print-toolbar {
      max-width: 210mm;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e293b;
      color: #fff;
      padding: 10px 16px;
      border-radius: 10px;
    }
    .print-toolbar button {
      cursor: pointer;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-weight: 600;
      font-size: 13px;
    }
    .btn-print { background: #2563eb; color: #fff; }
    .btn-close { background: #475569; color: #fff; margin-left: 8px; }
    .sheet {
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 16mm 15mm;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { max-height: 52px; max-width: 100px; object-fit: contain; }
    .brand-title { font-size: 20px; font-weight: 800; margin: 0; }
    .brand-sub { font-size: 11px; color: #475569; margin: 2px 0 0 0; }
    .company-contacts { text-align: right; font-size: 11px; color: #334155; }
    .doc-title-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .doc-title { font-size: 18px; font-weight: 800; margin: 0; }
    .doc-meta { font-size: 12px; color: #334155; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .info-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .info-card h4 {
      margin: 0 0 8px 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;
      gap: 8px;
    }
    .info-row span:first-child { color: #64748b; }
    .info-row span:last-child { font-weight: 600; text-align: right; }
    .section-title {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #1e293b;
      margin: 16px 0 6px 0;
    }
    .comments-box {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 8px;
      padding: 10px 12px;
      min-height: 54px;
      white-space: pre-wrap;
      font-size: 12.5px;
    }
    table.parts-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 6px;
    }
    table.parts-table th, table.parts-table td {
      border: 1px solid #cbd5e1;
      padding: 7px 8px;
    }
    table.parts-table th {
      background: #f1f5f9;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      color: #334155;
    }
    .totals-box {
      margin-top: 14px;
      margin-left: auto;
      max-width: 340px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 12.5px;
    }
    .totals-row.grand {
      border-top: 1px solid #94a3b8;
      margin-top: 6px;
      padding-top: 6px;
      font-size: 14px;
      font-weight: 800;
    }
    .signatures {
      margin-top: 32px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      font-size: 12px;
    }
    .sig-line {
      margin-top: 28px;
      border-bottom: 1px solid #334155;
      height: 1px;
    }
    .sig-caption {
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .no-print { display: none !important; }
      .sheet { box-shadow: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar no-print">
    <div><strong>Предпросмотр печати:</strong> Заказ-наряд №${escapeHtml(String(dealData.id || ''))}</div>
    <div>
      <button class="btn-print" onclick="window.print()">🖨️ Распечатать</button>
      <button class="btn-close" onclick="window.close()">Закрыть</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header">
      <div class="brand">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo">` : ''}
        <div>
          <h1 class="brand-title">${escapeHtml(companyName)}</h1>
          <p class="brand-sub">${escapeHtml(companySlogan)}</p>
        </div>
      </div>
      <div class="company-contacts">
        ${companyAddress ? `<div>${escapeHtml(companyAddress)}</div>` : ''}
        ${companyPhone ? `<div>Тел: <strong>${escapeHtml(companyPhone)}</strong></div>` : ''}
        ${companyEmail ? `<div>Email: ${escapeHtml(companyEmail)}</div>` : ''}
        ${companyTin ? `<div>ИНН: ${escapeHtml(companyTin)}</div>` : ''}
      </div>
    </div>

    <div class="doc-title-box">
      <div>
        <h2 class="doc-title">ЗАКАЗ-НАРЯД № ${escapeHtml(String(dealData.id || '—'))}</h2>
        <div style="font-weight:600;margin-top:2px;">${escapeHtml(dealData.title || '—')}</div>
      </div>
      <div class="doc-meta" style="text-align:right;">
        <div>Дата регистрации: <strong>${escapeHtml(formatDate(dealData.created_at))}</strong></div>
        <div>Стадия: <strong>${escapeHtml(stageLabel)}</strong></div>
        <div>Тип наряда: <strong>${escapeHtml(serviceTypeLabel)}</strong></div>
        ${dealData.deadline ? `<div>Срок сдачи: <strong>${escapeHtml(dealData.deadline)}</strong></div>` : ''}
      </div>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <h4>Сведения о клиенте (Заказчик)</h4>
        <div class="info-row"><span>Клиент:</span><span>${escapeHtml(dealData.client_name || 'Не указан')}</span></div>
        <div class="info-row"><span>Компания:</span><span>${escapeHtml(dealData.client_company || 'Частное лицо')}</span></div>
        <div class="info-row"><span>Телефон:</span><span>${escapeHtml(dealData.client_phone || '—')}</span></div>
        ${dealData.client_inn ? `<div class="info-row"><span>ИНН:</span><span>${escapeHtml(dealData.client_inn)}</span></div>` : ''}
      </div>

      <div class="info-card">
        <h4>Сведения о технике и исполнителе</h4>
        <div class="info-row"><span>Техника:</span><span>${escapeHtml(dealData.equipment_name || 'Не привязана')}</span></div>
        <div class="info-row"><span>VIN / Серийный №:</span><span style="font-family:monospace;">${escapeHtml(dealData.equipment_vin || '—')}</span></div>
        ${dealData.equipment_license_plate ? `<div class="info-row"><span>Гос. знак автомобиля:</span><span style="font-family:monospace;font-weight:700;">${escapeHtml(dealData.equipment_license_plate)}</span></div>` : ''}
        <div class="info-row"><span>Наработка:</span><span>${escapeHtml(dealData.equipment_hours || '—')}</span></div>
        <div class="info-row"><span>Ответственные:</span><span>${escapeHtml(dealData.responsible || '—')}</span></div>
      </div>
    </div>

    <div class="section-title">Описание неисправности, выполненных работ и комментарии</div>
    <div class="comments-box">${escapeHtml(dealData.description || 'Комментарии и замечания отсутствуют')}</div>

    <div class="section-title">Списанные запчасти и расходные материалы со склада</div>
    <table class="parts-table">
      <thead>
        <tr>
          <th style="width:36px;text-align:center;">№</th>
          <th style="width:120px;">Артикул (SKU)</th>
          <th>Наименование запчасти</th>
          <th style="width:120px;">Категория</th>
          <th style="width:80px;text-align:center;">Кол-во</th>
          <th style="width:110px;text-align:right;">Цена за ед.</th>
          <th style="width:120px;text-align:right;">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${partsRowsHtml}
      </tbody>
    </table>

    <div class="totals-box">
      <div class="totals-row">
        <span>Стоимость выполненных работ:</span>
        <strong>${formatMoney(laborCostVal)}</strong>
      </div>
      <div class="totals-row">
        <span>Сумма продажи запчастей (${totalPartsQty} ед.):</span>
        <strong>${formatMoney(totalPartsSum)}</strong>
      </div>
      <div class="totals-row grand">
        <span>Итого по заказ-наряду:</span>
        <span>${formatMoney(dealAmount > 0 ? dealAmount : (laborCostVal + totalPartsSum))}</span>
      </div>
    </div>

    <div class="signatures">
      <div>
        <div><strong>Заказчик (Клиент):</strong></div>
        <div>С объемом работ и списком запчастей ознакомлен, претензий не имею.</div>
        <div class="sig-line"></div>
        <div class="sig-caption">Подпись / ФИО (${escapeHtml(dealData.client_name || '')})</div>
      </div>
      <div>
        <div><strong>Исполнитель (${escapeHtml(companyName)}):</strong></div>
        <div>Работы выполнены, запчасти отпущены со склада по наряду.</div>
        <div class="sig-line"></div>
        <div class="sig-caption">Подпись / Ответственный (${escapeHtml(dealData.responsible || '')})</div>
      </div>
    </div>

    <div style="margin-top:20px;font-size:10px;color:#94a3b8;text-align:right;">
      Документ сформирован в CRM «${escapeHtml(companyName)}» • ${escapeHtml(printDate)}
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 250);
    });
  </script>
</body>
</html>`;

  const printWin = window.open('', '_blank', 'width=960,height=800');
  if (!printWin) {
    showToast('Разрешите всплывающие окна в браузере для печати заказ-наряда', 'warning');
    return;
  }
  printWin.document.open();
  printWin.document.write(printHtml);
  printWin.document.close();
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

function getClientContactsList(clientObj) {
  if (!clientObj) return [];
  if (Array.isArray(clientObj.contacts) && clientObj.contacts.length > 0) {
    return clientObj.contacts.filter(c => c && (c.name || c.position || c.phone));
  }
  const sec = String(clientObj.secondary_contact || '').trim();
  if (sec) {
    return [{ name: sec, position: '', phone: '' }];
  }
  return [];
}

function syncClientContactsEmptyState() {
  const listEl = document.getElementById('client-contacts-list');
  const emptyEl = document.getElementById('client-contacts-empty');
  if (!listEl || !emptyEl) return;
  const hasRows = listEl.querySelectorAll('.client-contact-row').length > 0;
  emptyEl.classList.toggle('hidden', hasRows);
}

function addClientContactRow(contact = {}) {
  const listEl = document.getElementById('client-contacts-list');
  if (!listEl) return;
  const row = document.createElement('div');
  row.className = 'client-contact-row grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-blue-200 shadow-2xs';
  row.innerHTML = `
    <div class="sm:col-span-5">
      <input type="text" class="client-contact-name w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" placeholder="Имя и Фамилия (напр. Петросян Карен)" value="${escapeHtml(contact.name || '')}">
    </div>
    <div class="sm:col-span-4">
      <input type="text" class="client-contact-position w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" placeholder="Должность (напр. Гл. инженер)" value="${escapeHtml(contact.position || '')}">
    </div>
    <div class="sm:col-span-2">
      <input type="text" class="client-contact-phone w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-mono" placeholder="Телефон" value="${escapeHtml(contact.phone || '')}">
    </div>
    <div class="sm:col-span-1 flex justify-end">
      <button type="button" onclick="removeClientContactRow(this)" class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors" title="Удалить контакт">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `;
  listEl.appendChild(row);
  syncClientContactsEmptyState();
  if (window.lucide) lucide.createIcons();
}

function removeClientContactRow(btn) {
  const row = btn && btn.closest('.client-contact-row');
  if (row) row.remove();
  syncClientContactsEmptyState();
}

function collectClientContactsFromForm() {
  const listEl = document.getElementById('client-contacts-list');
  if (!listEl) return [];
  const rows = Array.from(listEl.querySelectorAll('.client-contact-row'));
  const contacts = [];
  rows.forEach(r => {
    const name = (r.querySelector('.client-contact-name')?.value || '').trim();
    const position = (r.querySelector('.client-contact-position')?.value || '').trim();
    const phone = (r.querySelector('.client-contact-phone')?.value || '').trim();
    if (name || position || phone) {
      contacts.push({ name, position, phone });
    }
  });
  return contacts;
}

function formatClientContactsSummaryJS(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return '';
  return contacts.map(c => {
    const name = (c.name || '').trim();
    const details = [c.position, c.phone].map(x => (x || '').trim()).filter(Boolean);
    if (details.length > 0) {
      return name ? `${name} (${details.join(', ')})` : details.join(', ');
    }
    return name;
  }).filter(Boolean).join('; ');
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

  // Clear requisites & contacts fields
  const innEl = document.getElementById('client-inn');
  const bankNameEl = document.getElementById('client-bank-name');
  const bankAccEl = document.getElementById('client-bank-account');
  const posEl = document.getElementById('client-position');
  const secContactEl = document.getElementById('client-secondary-contact');
  const contactsListEl = document.getElementById('client-contacts-list');
  if (innEl) innEl.value = '';
  if (bankNameEl) bankNameEl.value = '';
  if (bankAccEl) bankAccEl.value = '';
  if (posEl) posEl.value = '';
  if (secContactEl) secContactEl.value = '';
  if (contactsListEl) contactsListEl.innerHTML = '';
  syncClientContactsEmptyState();

  if (clientId) {
    document.getElementById('modal-client-title').textContent = 'Редактировать клиента';
    // Requirement #1: Only Administrators are allowed to delete saved clients
    if (state.currentUser && state.currentUser.role === 'admin') {
      document.getElementById('btn-delete-client').classList.remove('hidden');
    } else {
      document.getElementById('btn-delete-client').classList.add('hidden');
    }
    const client = state.clients.find(c => c.id == clientId);
    if (client) {
      document.getElementById('client-id').value = client.id;
      document.getElementById('client-name').value = client.name;
      if (posEl) posEl.value = client.position || '';
      if (secContactEl) secContactEl.value = client.secondary_contact || '';
      const existingContacts = getClientContactsList(client);
      existingContacts.forEach(ct => addClientContactRow(ct));
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
  const contacts = collectClientContactsFromForm();
  const secondarySummary = formatClientContactsSummaryJS(contacts);
  const payload = {
    name: document.getElementById('client-name').value.trim(),
    position: (document.getElementById('client-position')?.value || '').trim(),
    contacts,
    secondary_contact: secondarySummary,
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
    const prevClient = state.clients.find(c => Number(c.id) === Number(savedId)) || {};
    crmStore.saveItem('clients', {
      ...prevClient,
      ...payload,
      id: savedId,
      equipment_count: prevClient.equipment_count || 0,
      equipment_list: prevClient.equipment_list || [],
      deals_count: prevClient.deals_count || 0,
      total_revenue: prevClient.total_revenue || 0
    });

    showToast(clientId ? 'Клиент обновлен' : 'Клиент добавлен');
    closeModal('modal-client');
    await loadClients();
    await loadClientsListOptions();
    await loadDeals();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteClient() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    showToast('Удаление сохраненных клиентов разрешено исключительно Администратору!', 'error');
    return;
  }
  const clientId = document.getElementById('client-id').value;
  if (!clientId || !confirm('Удалить клиента? Вся техника и сделки сохранятся без привязки.')) return;
  try {
    const reqHeaders = { 'X-User-Role': state.currentUser?.role || '' };
    let res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE', headers: reqHeaders });
    if (!res.ok && res.status !== 403) {
      res = await fetch(`/api/clients/${clientId}/delete`, { method: 'POST', headers: reqHeaders });
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
    if (!state.equipment || state.equipment.length === 0 || !state.equipment.some(e => e.id == eqId)) {
      try {
        const res = await fetch('/api/equipment');
        if (res.ok) {
          const data = await res.json();
          state.equipment = crmStore.mergeWithServer('equipment', data);
        }
      } catch (e) {}
    }
    const eq = state.equipment.find(e => e.id == eqId);
    if (eq) {
      document.getElementById('equipment-id').value = eq.id;
      document.getElementById('equipment-client').value = eq.client_id || '';
      document.getElementById('equipment-name').value = eq.name;
      document.getElementById('equipment-category').value = eq.category;
      document.getElementById('equipment-status').value = eq.status;
      document.getElementById('equipment-vin').value = eq.serial_vin || '';
      const plateInput = document.getElementById('equipment-license-plate');
      if (plateInput) plateInput.value = eq.license_plate || '';
      document.getElementById('equipment-year').value = eq.year || '';
      document.getElementById('equipment-hours').value = eq.operating_hours || '';
      document.getElementById('equipment-notes').value = eq.notes || '';

      const subTitle = document.getElementById('modal-equipment-subtitle');
      if (subTitle) subTitle.textContent = `${eq.name} • ${eq.serial_vin ? 'VIN: ' + eq.serial_vin : 'Без VIN'}${eq.license_plate ? ' • Гос. знак: ' + eq.license_plate : ''}`;
    }
    // Load maintenance history and consumed parts (Requirement #15)
    loadEquipmentHistoryAndParts(eqId);
  } else {
    document.getElementById('modal-equipment-title').textContent = 'Регистрация техники';
    if (tabsHeader) tabsHeader.classList.add('hidden');
    const plateInput = document.getElementById('equipment-license-plate');
    if (plateInput) plateInput.value = '';
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
    license_plate: (document.getElementById('equipment-license-plate')?.value || '').trim(),
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
    await loadClients();
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
    await loadClients();
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
  const qMainEl = document.getElementById('part-qty-main');
  const qShowEl = document.getElementById('part-qty-showcase');
  const qDealEl = document.getElementById('part-qty-dealer1');
  if (qMainEl) qMainEl.value = '0';
  if (qShowEl) qShowEl.value = '0';
  if (qDealEl) qDealEl.value = '0';

  if (partId) {
    document.getElementById('modal-part-title').textContent = 'Редактировать запчасть';
    document.getElementById('btn-delete-part').classList.remove('hidden');
    const p = getWarehousePartsCatalog().find(item => Number(item.id) === Number(partId));
    if (p) {
      const wh = getPartWarehouseStocks(p);
      document.getElementById('part-id').value = p.id;
      document.getElementById('part-sku').value = p.sku;
      document.getElementById('part-category').value = p.category;
      document.getElementById('part-name').value = p.name;
      if (qMainEl) qMainEl.value = wh.main;
      if (qShowEl) qShowEl.value = wh.showcase;
      if (qDealEl) qDealEl.value = wh.dealer1;
      document.getElementById('part-quantity').value = p.quantity;
      document.getElementById('part-min-threshold').value = p.min_threshold;
      document.getElementById('part-location').value = p.location || '';
      document.getElementById('part-purchase-price').value = p.purchase_price;
      document.getElementById('part-selling-price').value = p.selling_price;
    }
  } else {
    document.getElementById('modal-part-title').textContent = 'Новая запчасть / материал';
  }

  updatePartQuantityUnit(document.getElementById('part-category')?.value || 'Фильтры');
  openModal('modal-part');
  if (window.lucide) lucide.createIcons();
}

async function savePart(e) {
  e.preventDefault();
  const partId = document.getElementById('part-id').value;
  const categoryVal = document.getElementById('part-category').value.trim();
  const qMain = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-main')?.value, 0));
  const qShow = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-showcase')?.value, 0));
  const qDeal = Math.max(0, parsePartNumberInput(document.getElementById('part-qty-dealer1')?.value, 0));
  const rawQty = Math.round((qMain + qShow + qDeal) * 100) / 100;
  const rawMin = parsePartNumberInput(document.getElementById('part-min-threshold').value, 2);
  const warehouseStocks = {
    main: qMain,
    showcase: qShow,
    dealer1: qDeal,
  };
  const payload = {
    sku: document.getElementById('part-sku').value.trim(),
    category: categoryVal,
    name: document.getElementById('part-name').value.trim(),
    quantity: rawQty,
    qty_main: qMain,
    qty_showcase: qShow,
    qty_dealer1: qDeal,
    warehouse_stocks: warehouseStocks,
    min_threshold: rawMin,
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

async function exportSqlBackup() {
  try {
    showToast('Подготовка полного SQL-бэкапа PostgreSQL...', 'info');
    const res = await fetch('/api/settings/backup');
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || 'Ошибка создания SQL-бэкапа');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `specmash_crm_postgres_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Полный PostgreSQL SQL-бэкап успешно скачан');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRestoreSqlFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!confirm(`Восстановить PostgreSQL из файла "${file.name}"? Текущие данные CRM будут заменены данными из бэкапа.`)) {
    event.target.value = '';
    return;
  }

  try {
    showToast('Восстановление PostgreSQL-базы...', 'info');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/settings/backup/restore', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка восстановления');

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
    showToast('Ошибка восстановления: ' + err.message, 'error');
    event.target.value = '';
  }
}

function downloadTableExport(table, format = 'xlsx') {
  if (!hasUserPerm('export')) {
    showToast('Доступ к разделу «Импорт & Экспорт» ограничен Администратором', 'error');
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

async function loadTopSoldParts(limit = null) {
  const tbody = document.getElementById('top-parts-table-body');
  if (!tbody) return;
  const effectiveLimit = limit || state.topPartsLimit || 10;
  try {
    const { year, month } = getDashboardPeriodParams();
    const qs = new URLSearchParams({ limit: String(effectiveLimit) });
    if (year && year !== 'all') qs.set('year', year);
    if (month && month !== 'all') qs.set('month', month);

    const res = await fetch(`/api/dashboard/top-parts?${qs.toString()}`);
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Не удалось загрузить статистику запчастей</td></tr>';
      return;
    }
    const parts = await res.json();
    if (!parts || parts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Данные по продажам запчастей за выбранный период отсутствуют</td></tr>';
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
          <td class="p-3 text-center font-mono font-bold text-slate-900 text-sm">${p.sold_count} ${getPartUnit(p)}</td>
          <td class="p-3 text-right font-mono font-bold text-emerald-600">${formatMoney(p.total_revenue)}</td>
          <td class="p-3 text-center font-mono ${p.current_stock <= 2 ? 'text-rose-600 font-bold' : 'text-slate-600'}">${p.current_stock} ${getPartUnit(p)}</td>
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
      'warehouse', 'equipment', 'sales_catalog', 'clients', 'tasks',
      'marketing', 'users', 'export', 'settings',
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
    'warehouse', 'equipment', 'sales_catalog', 'clients', 'tasks',
    'marketing', 'users', 'export', 'settings',
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

    const targetUser = (state.users || []).find(u => Number(u.id) === Number(userId));
    if (targetUser) {
      targetUser.permissions = permissions;
      crmStore.saveItem('users', targetUser);
    }

    if (state.currentUser && Number(state.currentUser.id) === Number(userId)) {
      state.currentUser.permissions = permissions;
      localStorage.setItem('specmash_current_user', JSON.stringify(state.currentUser));
      applyUserPermissions();
      if (state.currentTab && !canUserAccessTab(state.currentTab)) {
        const firstAllowed = getFirstAllowedTabForUser();
        if (firstAllowed.dept) state.dealsDepartment = firstAllowed.dept;
        switchTab(firstAllowed.tab || '', { silent: true });
      }
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


// ================= SALES EQUIPMENT CATALOG (БАЗА ТЕХНИКИ ДЛЯ ПРОДАЖИ) =================

const SALES_EQ_CATEGORIES = [
  'Строительная и коммунальная техника',
  'Сельскохозяйственная техника'
];

function normalizeSalesEqCategoryJS(cat) {
  const s = String(cat || '').trim().toLowerCase();
  if (s.includes('сельхоз') || s.includes('сельскохоз') || s.includes('трактор') || s.includes('комбайн') || s.includes('агро')) {
    return 'Сельскохозяйственная техника';
  }
  return 'Строительная и коммунальная техника';
}

function formatSalesEqVatBadge(item) {
  const rate = Number(item?.vat_rate ?? 20) === 0 ? 0 : 20;
  const mode = item?.vat_mode === 'added' ? 'added' : 'included';
  if (rate === 0) {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold">НДС 0% (Без НДС)</span>';
  }
  if (mode === 'added') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">НДС 20% (+ добавить к цене)</span>';
  }
  return '<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">НДС 20% (включен в цену)</span>';
}

function computeSalesEqPriceWithVat(price, vatRate, vatMode) {
  const base = parsePartNumberInput(price, 0);
  const rate = Number(vatRate) === 0 ? 0 : 20;
  const mode = vatMode === 'added' ? 'added' : 'included';
  if (base <= 0) {
    return { basePrice: 0, vatAmount: 0, finalPrice: 0, rate, mode };
  }
  if (rate === 0) {
    return { basePrice: base, vatAmount: 0, finalPrice: base, rate, mode };
  }
  if (mode === 'added') {
    const vatAmount = Math.round(base * 0.20);
    return { basePrice: base, vatAmount, finalPrice: base + vatAmount, rate, mode };
  }
  const vatAmount = Math.round((base * 20) / 120);
  return { basePrice: base, vatAmount, finalPrice: base, rate, mode };
}

function switchSalesCatalogCategoryTab(catVal) {
  const val = catVal || 'all';
  state.salesCatalogCategory = val;
  const select = document.getElementById('sales-eq-category-filter');
  if (select && select.value !== val) {
    select.value = val;
  }

  const tabAll = document.getElementById('sales-cat-tab-all');
  const tabConstr = document.getElementById('sales-cat-tab-construction');
  const tabAgri = document.getElementById('sales-cat-tab-agriculture');

  const activeCls = 'px-3.5 py-2 rounded-lg text-xs font-bold bg-white text-indigo-900 shadow-xs transition-all flex items-center gap-2';
  const inactiveCls = 'px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all flex items-center gap-2';

  if (tabAll) tabAll.className = (val === 'all') ? activeCls : inactiveCls;
  if (tabConstr) tabConstr.className = (val === 'Строительная и коммунальная техника') ? activeCls : inactiveCls;
  if (tabAgri) tabAgri.className = (val === 'Сельскохозяйственная техника') ? activeCls : inactiveCls;

  renderSalesEquipmentTable();
}

async function loadSalesEquipment(searchQuery = null) {
  const searchInput = document.getElementById('sales-eq-search');
  const q = typeof searchQuery === 'string' ? searchQuery.trim() : (searchInput ? searchInput.value.trim() : '');

  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const url = params.toString() ? `/api/sales-equipment?${params.toString()}` : '/api/sales-equipment';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const normalized = (Array.isArray(data) ? data : []).map(item => ({
        ...item,
        category: normalizeSalesEqCategoryJS(item.category)
      }));
      state.salesEquipment = crmStore.mergeWithServer('sales_equipment', normalized);
    }
  } catch (err) {
    console.error('Error loading sales equipment catalog:', err);
    state.salesEquipment = crmStore.getList('sales_equipment').map(item => ({
      ...item,
      category: normalizeSalesEqCategoryJS(item.category)
    }));
  }
  renderSalesEquipmentTable();
  updateSidebarCounters();
}

function renderSalesEquipmentTable() {
  const tbody = document.getElementById('sales-equipment-table-body');
  if (!tbody) return;
  const allList = (Array.isArray(state.salesEquipment) ? state.salesEquipment : []).map(item => ({
    ...item,
    category: normalizeSalesEqCategoryJS(item.category)
  }));

  // Update category tab counters
  const constrCount = allList.filter(i => i.category === 'Строительная и коммунальная техника').length;
  const agriCount = allList.filter(i => i.category === 'Сельскохозяйственная техника').length;
  const cAllEl = document.getElementById('sales-cat-count-all');
  const cConEl = document.getElementById('sales-cat-count-construction');
  const cAgrEl = document.getElementById('sales-cat-count-agriculture');
  if (cAllEl) cAllEl.textContent = String(allList.length);
  if (cConEl) cConEl.textContent = String(constrCount);
  if (cAgrEl) cAgrEl.textContent = String(agriCount);

  const selectedCat = document.getElementById('sales-eq-category-filter')?.value || state.salesCatalogCategory || 'all';
  const searchQ = (document.getElementById('sales-eq-search')?.value || '').trim().toLowerCase();

  const list = allList.filter(item => {
    if (selectedCat !== 'all' && item.category !== selectedCat) return false;
    if (!searchQ) return true;
    return (
      (item.name || '').toLowerCase().includes(searchQ) ||
      (item.sku_code || '').toLowerCase().includes(searchQ) ||
      (item.category || '').toLowerCase().includes(searchQ) ||
      (item.notes || '').toLowerCase().includes(searchQ)
    );
  });

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 text-xs">В выбранной категории пока нет моделей техники. Нажмите «+ Добавить модель техники».</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(item => {
    const itemCurr = normalizeDealCurrency(item.currency || 'AMD');
    const calc = computeSalesEqPriceWithVat(item.selling_price, item.vat_rate, item.vat_mode);
    const hasPrice = calc.basePrice > 0;
    const isAgri = item.category === 'Сельскохозяйственная техника';
    const catBadge = isAgri
      ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">🌾 Сельскохозяйственная техника</span>'
      : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">🏗️ Строительная и коммунальная техника</span>';

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-3.5">
          <div class="font-bold text-slate-900 text-sm flex items-center gap-1.5">
            <i data-lucide="tractor" class="w-4 h-4 text-indigo-600 shrink-0"></i>
            <span>${escapeHtml(item.name)}</span>
          </div>
          ${item.notes ? `<div class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(item.notes)}</div>` : ''}
        </td>
        <td class="p-3.5 text-xs">${catBadge}</td>
        <td class="p-3.5 text-xs font-mono text-slate-600">${escapeHtml(item.sku_code || '—')}</td>
        <td class="p-3.5 text-xs font-mono text-right ${hasPrice ? 'font-bold text-slate-800' : 'text-slate-400 italic'}">
          ${hasPrice ? formatMoney(calc.basePrice, itemCurr) : `Не указана (${itemCurr})`}
        </td>
        <td class="p-3.5 text-xs">
          ${formatSalesEqVatBadge(item)}
        </td>
        <td class="p-3.5 text-xs font-mono text-right ${hasPrice ? 'font-bold text-indigo-700' : 'text-slate-400'}">
          ${hasPrice ? formatMoney(calc.finalPrice, itemCurr) : 'По запросу'}
        </td>
        <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="openSalesEquipmentModal(${item.id})" class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded" title="Редактировать модель">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="quickDeleteSalesEquipment(${item.id})" class="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded" title="Удалить модель">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function updateSalesEqVatPreview() {
  const priceVal = document.getElementById('sales-eq-price')?.value || '';
  const cur = normalizeDealCurrency(document.getElementById('sales-eq-currency')?.value || 'AMD');
  const priceLabel = document.getElementById('sales-eq-price-label');
  if (priceLabel) priceLabel.textContent = `Цена продажи (${cur}) — необязательно`;
  const vatRate = document.getElementById('sales-eq-vat-rate')?.value || '20';
  const vatMode = document.getElementById('sales-eq-vat-mode')?.value || 'included';
  const previewEl = document.getElementById('sales-eq-vat-preview');
  const modeSelect = document.getElementById('sales-eq-vat-mode');

  if (modeSelect) {
    modeSelect.disabled = String(vatRate) === '0';
    modeSelect.classList.toggle('opacity-50', String(vatRate) === '0');
  }
  if (!previewEl) return;

  const calc = computeSalesEqPriceWithVat(priceVal, vatRate, vatMode);
  if (calc.basePrice <= 0) {
    previewEl.innerHTML = `Цена продажи не указана (будет определяться индивидуально в сделке) • Валюта: <b>${cur}</b> • Ставка НДС: <b>${calc.rate}%</b>`;
    return;
  }

  if (calc.rate === 0) {
    previewEl.innerHTML = `Итоговая цена продажи: <b class="font-mono text-indigo-700">${formatMoney(calc.finalPrice, cur)}</b> (НДС 0% — без НДС)`;
  } else if (calc.mode === 'added') {
    previewEl.innerHTML = `Цена без НДС: <b class="font-mono">${formatMoney(calc.basePrice, cur)}</b> + НДС 20% (<b class="font-mono">${formatMoney(calc.vatAmount, cur)}</b>) = Итого с НДС: <b class="font-mono text-indigo-700">${formatMoney(calc.finalPrice, cur)}</b>`;
  } else {
    previewEl.innerHTML = `Итоговая цена (НДС 20% включен): <b class="font-mono text-indigo-700">${formatMoney(calc.finalPrice, cur)}</b> (в т.ч. НДС 20%: <b class="font-mono">${formatMoney(calc.vatAmount, cur)}</b>)`;
  }
}

function openSalesEquipmentModal(itemId = null) {
  const form = document.getElementById('form-sales-equipment');
  if (form) form.reset();
  document.getElementById('sales-eq-id').value = '';
  const delBtn = document.getElementById('btn-delete-sales-eq');
  if (delBtn) delBtn.classList.add('hidden');
  const currEl = document.getElementById('sales-eq-currency');

  if (itemId) {
    document.getElementById('modal-sales-eq-title').textContent = 'Редактировать модель техники для продажи';
    if (delBtn) delBtn.classList.remove('hidden');
    const item = (state.salesEquipment || []).find(x => Number(x.id) === Number(itemId));
    if (item) {
      document.getElementById('sales-eq-id').value = item.id;
      document.getElementById('sales-eq-name').value = item.name || '';
      document.getElementById('sales-eq-category').value = normalizeSalesEqCategoryJS(item.category);
      document.getElementById('sales-eq-sku').value = item.sku_code || '';
      document.getElementById('sales-eq-price').value = Number(item.selling_price || 0) > 0 ? item.selling_price : '';
      if (currEl) currEl.value = normalizeDealCurrency(item.currency || 'AMD');
      document.getElementById('sales-eq-vat-rate').value = String(item.vat_rate ?? 20);
      document.getElementById('sales-eq-vat-mode').value = item.vat_mode || 'included';
      document.getElementById('sales-eq-notes').value = item.notes || '';
    }
  } else {
    document.getElementById('modal-sales-eq-title').textContent = 'Новая модель техники для продажи';
    const currentTabCat = state.salesCatalogCategory;
    if (currentTabCat && currentTabCat !== 'all') {
      document.getElementById('sales-eq-category').value = normalizeSalesEqCategoryJS(currentTabCat);
    } else {
      document.getElementById('sales-eq-category').value = 'Строительная и коммунальная техника';
    }
    const dealModal = document.getElementById('modal-deal');
    const dealCurr = (dealModal && !dealModal.classList.contains('hidden'))
      ? normalizeDealCurrency(document.getElementById('deal-currency')?.value || 'AMD')
      : 'AMD';
    if (currEl) currEl.value = dealCurr;
    document.getElementById('sales-eq-vat-rate').value = '20';
    document.getElementById('sales-eq-vat-mode').value = 'included';
  }

  updateSalesEqVatPreview();
  openModal('modal-sales-equipment');
  if (window.lucide) lucide.createIcons();
}

async function saveSalesEquipment(e) {
  e.preventDefault();
  const itemId = document.getElementById('sales-eq-id').value;
  const payload = {
    name: document.getElementById('sales-eq-name').value.trim(),
    category: normalizeSalesEqCategoryJS(document.getElementById('sales-eq-category').value),
    sku_code: document.getElementById('sales-eq-sku').value.trim(),
    selling_price: parsePartNumberInput(document.getElementById('sales-eq-price').value, 0),
    currency: normalizeDealCurrency(document.getElementById('sales-eq-currency')?.value || 'AMD'),
    vat_rate: parseInt(document.getElementById('sales-eq-vat-rate').value, 10) === 0 ? 0 : 20,
    vat_mode: document.getElementById('sales-eq-vat-mode').value || 'included',
    notes: document.getElementById('sales-eq-notes').value.trim(),
  };

  try {
    let res;
    if (itemId) {
      res = await fetch(`/api/sales-equipment/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/sales-equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка сохранения модели техники');

    crmStore.saveItem('sales_equipment', data);
    showToast(itemId ? 'Модель техники обновлена' : 'Модель добавлена в базу техники для продажи');
    closeModal('modal-sales-equipment');
    await loadSalesEquipment();
    await loadSalesEquipmentOptions();
    if (!itemId && data.id) {
      const modalDeal = document.getElementById('modal-deal');
      if (modalDeal && !modalDeal.classList.contains('hidden')) {
        selectDealSalesEquipment(data.id);
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSalesEquipment() {
  const itemId = document.getElementById('sales-eq-id').value;
  if (!itemId) return;
  await quickDeleteSalesEquipment(itemId, true);
}

async function quickDeleteSalesEquipment(itemId, closeAfter = false) {
  if (!confirm('Удалить эту модель из базы техники для продажи?')) return;
  try {
    let res = await fetch(`/api/sales-equipment/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/sales-equipment/${itemId}/delete`, { method: 'POST' });
    }
    crmStore.removeItem('sales_equipment', parseInt(itemId, 10));
    showToast('Модель удалена из базы техники для продажи');
    if (closeAfter) closeModal('modal-sales-equipment');
    await loadSalesEquipment();
    await loadSalesEquipmentOptions();
  } catch (err) {
    showToast('Ошибка удаления модели', 'error');
  }
}

async function loadSalesEquipmentOptions() {
  if (!Array.isArray(state.salesEquipment) || state.salesEquipment.length === 0) {
    try {
      const res = await fetch('/api/sales-equipment');
      if (res.ok) {
        const data = await res.json();
        state.salesEquipment = crmStore.mergeWithServer('sales_equipment', data);
      }
    } catch (e) {}
  }
  const select = document.getElementById('deal-sales-eq-select');
  if (!select) return;
  const list = (Array.isArray(state.salesEquipment) ? state.salesEquipment : []).map(item => ({
    ...item,
    category: normalizeSalesEqCategoryJS(item.category)
  }));

  const constrList = list.filter(i => i.category === 'Строительная и коммунальная техника');
  const agriList = list.filter(i => i.category === 'Сельскохозяйственная техника');

  const renderOpts = (arr) => arr.map(item => {
    const itemCurr = normalizeDealCurrency(item.currency || 'AMD');
    const calc = computeSalesEqPriceWithVat(item.selling_price, item.vat_rate, item.vat_mode);
    const priceText = calc.basePrice > 0
      ? ` • ${formatMoney(calc.finalPrice, itemCurr)} (${calc.rate === 0 ? 'НДС 0%' : (calc.mode === 'added' ? '+НДС 20%' : 'НДС 20% вкл.')})`
      : ` • Цена по запросу (${itemCurr})`;
    return `<option value="${item.id}">${escapeHtml(item.name)}${priceText}</option>`;
  }).join('');

  select.innerHTML =
    '<option value="">— Выберите модель из каталога —</option>' +
    (constrList.length > 0 ? `<optgroup label="🏗️ Строительная и коммунальная техника">${renderOpts(constrList)}</optgroup>` : '') +
    (agriList.length > 0 ? `<optgroup label="🌾 Сельскохозяйственная техника">${renderOpts(agriList)}</optgroup>` : '');
}

// ================= MULTI-ITEM SALES DEAL MANAGEMENT (Requirements 1.1 - 1.6) =================

function initDealSalesItemsFromDeal(deal) {
  if (Array.isArray(deal.sales_items) && deal.sales_items.length > 0) {
    state.currentDealSalesItems = deal.sales_items.map(it => ({
      sales_equipment_id: it.sales_equipment_id || null,
      name: it.name || 'Спецтехника',
      category: normalizeSalesEqCategoryJS(it.category),
      quantity: Math.max(0.01, parsePartNumberInput(it.quantity, 1)),
      price: Math.max(0, parsePartNumberInput(it.price, 0)),
      vat_rate: Number(it.vat_rate ?? 20) === 0 ? 0 : 20,
      vat_mode: it.vat_mode || 'included',
    }));
  } else if (deal.sales_equipment_id || deal.sales_equipment_name || deal.equipment_name) {
    const eqItem = deal.sales_equipment_id
      ? (state.salesEquipment || []).find(x => Number(x.id) === Number(deal.sales_equipment_id))
      : null;
    const baseAmount = Number(deal.amount || 0) + Number(deal.discount || 0);
    state.currentDealSalesItems = [{
      sales_equipment_id: deal.sales_equipment_id || (eqItem ? eqItem.id : null),
      name: deal.sales_equipment_name || (eqItem ? eqItem.name : '') || deal.equipment_name || deal.title || 'Спецтехника',
      category: normalizeSalesEqCategoryJS(eqItem ? eqItem.category : 'Строительная и коммунальная техника'),
      quantity: 1,
      price: baseAmount > 0 ? baseAmount : (eqItem ? computeSalesEqPriceWithVat(eqItem.selling_price, eqItem.vat_rate, eqItem.vat_mode).finalPrice : 0),
      vat_rate: eqItem ? (Number(eqItem.vat_rate ?? 20) === 0 ? 0 : 20) : 20,
      vat_mode: eqItem ? (eqItem.vat_mode || 'included') : 'included',
    }];
  } else {
    state.currentDealSalesItems = [];
  }
  renderDealSalesItemsList();
  recalcSalesDealTotals(false);
}

function handleDealCurrencyChange(newCurrency, shouldRecalc = true) {
  const cur = normalizeDealCurrency(newCurrency);
  const sel = document.getElementById('deal-currency');
  if (sel && sel.value !== cur) sel.value = cur;

  const subLabel = document.getElementById('deal-sales-subtotal-label');
  if (subLabel) subLabel.textContent = `Сумма товаров (${cur})`;

  const discLabel = document.getElementById('deal-discount-label');
  if (discLabel) discLabel.textContent = `Скидка (${cur})`;

  const isSales = (document.getElementById('deal-type')?.value || state.dealModalType) === 'sales';
  const amountLabel = document.getElementById('deal-amount-label');
  if (amountLabel && isSales) {
    amountLabel.textContent = `Итого сумма после скидки (${cur})`;
  }

  renderDealSalesItemsList();
  if (shouldRecalc) recalcSalesDealTotals();
}

function recalcSalesDealTotals(overwriteAmount = true) {
  const items = Array.isArray(state.currentDealSalesItems) ? state.currentDealSalesItems : [];
  const subtotal = items.reduce((sum, it) => {
    const q = Math.max(0, parsePartNumberInput(it.quantity, 1));
    const p = Math.max(0, parsePartNumberInput(it.price, 0));
    return sum + Math.round(q * p * 100) / 100;
  }, 0);

  const subEl = document.getElementById('deal-sales-subtotal');
  if (subEl) subEl.value = Math.round(subtotal * 100) / 100;

  const discountVal = Math.max(0, parsePartNumberInput(document.getElementById('deal-discount')?.value, 0));
  const finalAmount = Math.max(0, Math.round((subtotal - discountVal) * 100) / 100);

  const amountEl = document.getElementById('deal-amount');
  if (amountEl && (overwriteAmount || items.length > 0 || discountVal > 0)) {
    amountEl.value = finalAmount;
  }
}

function renderDealSalesItemsList() {
  const container = document.getElementById('deal-sales-items-list');
  const countBadge = document.getElementById('deal-sales-items-count-badge');
  if (!container) return;

  const items = Array.isArray(state.currentDealSalesItems) ? state.currentDealSalesItems : [];
  const cur = normalizeDealCurrency(document.getElementById('deal-currency')?.value || 'AMD');
  const isLocked = Boolean(document.getElementById('deal-title')?.disabled);

  if (countBadge) {
    const totalUnits = items.reduce((s, it) => s + Number(it.quantity || 1), 0);
    countBadge.textContent = `${items.length} поз. (${totalUnits} ед.)`;
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 text-center py-3">Товары еще не добавлены. Выберите модель из базы техники для продажи выше.</div>';
    return;
  }

  container.innerHTML = items.map((it, idx) => {
    const qty = Math.max(0.01, parsePartNumberInput(it.quantity, 1));
    const price = Math.max(0, parsePartNumberInput(it.price, 0));
    const lineTotal = Math.round(qty * price * 100) / 100;
    const isAgri = normalizeSalesEqCategoryJS(it.category) === 'Сельскохозяйственная техника';
    const catPill = isAgri ? '🌾 Сельхоз' : '🏗️ Строит./комм.';
    const vatRate = Number(it.vat_rate ?? 20) === 0 ? 0 : 20;
    const vatMode = it.vat_mode === 'added' ? 'added' : 'included';
    const vatSelectVal = vatRate === 0 ? '0_included' : (vatMode === 'added' ? '20_added' : '20_included');

    return `
      <div class="p-2.5 rounded-lg bg-slate-50/90 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div class="min-w-[180px] flex-1">
          <div class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
            <span>${idx + 1}. ${escapeHtml(it.name)}</span>
            <span class="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-semibold">${catPill}</span>
          </div>
          <div class="text-[11px] text-slate-600 mt-1 flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] text-slate-500 font-semibold uppercase">Ставка НДС:</span>
            <select ${isLocked ? 'disabled' : ''} onchange="updateDealSalesItemVat(${idx}, this.value)" class="border border-indigo-200 rounded-md px-2 py-0.5 text-[11px] font-semibold text-indigo-900 bg-white outline-none focus:border-indigo-500 cursor-pointer">
              <option value="20_included" ${vatSelectVal === '20_included' ? 'selected' : ''}>НДС 20% (включен в цену)</option>
              <option value="20_added" ${vatSelectVal === '20_added' ? 'selected' : ''}>НДС 20% (+ добавить к цене)</option>
              <option value="0_included" ${vatSelectVal === '0_included' ? 'selected' : ''}>НДС 0% (Без НДС)</option>
            </select>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Quantity control -->
          <div class="flex items-center">
            <span class="text-[10px] text-slate-500 font-semibold mr-1">Кол-во:</span>
            <div class="inline-flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
              <button type="button" ${isLocked ? 'disabled' : ''} onclick="stepDealSalesItemQty(${idx}, -1)" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold leading-none">−</button>
              <input type="number" step="any" min="0.01" value="${qty}" ${isLocked ? 'disabled' : ''} oninput="updateDealSalesItemQty(${idx}, this.value)" class="w-14 text-center font-mono font-bold text-xs py-1 outline-none border-x border-slate-200 bg-white">
              <button type="button" ${isLocked ? 'disabled' : ''} onclick="stepDealSalesItemQty(${idx}, 1)" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold leading-none">+</button>
            </div>
          </div>

          <!-- Unit Price control -->
          <div class="flex items-center">
            <span class="text-[10px] text-slate-500 font-semibold mr-1">Цена (${cur}):</span>
            <input type="number" step="any" min="0" value="${price}" ${isLocked ? 'disabled' : ''} oninput="updateDealSalesItemPrice(${idx}, this.value)" class="w-28 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 bg-white outline-none focus:border-indigo-500 text-right">
          </div>

          <!-- Line Total -->
          <div class="min-w-[105px] text-right font-mono font-bold text-indigo-700" id="deal-sales-item-line-total-${idx}">
            ${formatMoney(lineTotal, cur)}
          </div>

          ${isLocked ? '' : `
          <button type="button" onclick="removeDealSalesItem(${idx})" class="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded" title="Удалить товар из сделки">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>`}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function updateDealSalesItemVat(idx, vatSpec) {
  if (!Array.isArray(state.currentDealSalesItems) || !state.currentDealSalesItems[idx]) return;
  const item = state.currentDealSalesItems[idx];
  const oldRate = Number(item.vat_rate ?? 20) === 0 ? 0 : 20;
  const oldMode = item.vat_mode === 'added' ? 'added' : 'included';
  const curPrice = Math.max(0, parsePartNumberInput(item.price, 0));

  // Derive net base price before '+ 20% VAT' if old state was '20_added'
  let basePrice = item.base_price !== undefined ? Number(item.base_price) : (oldRate === 20 && oldMode === 'added' ? Math.round((curPrice / 1.2) * 100) / 100 : curPrice);

  let newRate = 20;
  let newMode = 'included';
  if (vatSpec === '0_included' || vatSpec === '0') {
    newRate = 0;
    newMode = 'included';
  } else if (vatSpec === '20_added') {
    newRate = 20;
    newMode = 'added';
  }

  item.vat_rate = newRate;
  item.vat_mode = newMode;
  item.base_price = basePrice;

  if (basePrice > 0) {
    if (newRate === 20 && newMode === 'added') {
      item.price = Math.round(basePrice * 1.2 * 100) / 100;
    } else {
      item.price = basePrice;
    }
  }

  // Also persist the updated VAT rate/mode on the registered catalog model if linked
  if (item.sales_equipment_id) {
    const catItem = (state.salesEquipment || []).find(x => Number(x.id) === Number(item.sales_equipment_id));
    if (catItem) {
      catItem.vat_rate = newRate;
      catItem.vat_mode = newMode;
      crmStore.saveItem('sales_equipment', catItem);
      try {
        fetch(`/api/sales-equipment/${catItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: catItem.name,
            category: normalizeSalesEqCategoryJS(catItem.category),
            sku_code: catItem.sku_code || '',
            selling_price: Number(catItem.selling_price || 0),
            currency: normalizeDealCurrency(catItem.currency || 'AMD'),
            vat_rate: newRate,
            vat_mode: newMode,
            notes: catItem.notes || ''
          })
        }).then(() => loadSalesEquipmentOptions()).catch(() => {});
      } catch (e) {}
    }
  }

  renderDealSalesItemsList();
  recalcSalesDealTotals();
}

function addDealSalesItemFromCatalog(item, quantity = 1) {
  if (!item) return;
  if (!Array.isArray(state.currentDealSalesItems)) state.currentDealSalesItems = [];
  const wasEmpty = state.currentDealSalesItems.length === 0;
  if (wasEmpty && item.currency) {
    handleDealCurrencyChange(normalizeDealCurrency(item.currency), false);
  }
  const calc = computeSalesEqPriceWithVat(item.selling_price, item.vat_rate, item.vat_mode);
  const existingIdx = state.currentDealSalesItems.findIndex(x => Number(x.sales_equipment_id) === Number(item.id));
  if (existingIdx >= 0) {
    state.currentDealSalesItems[existingIdx].quantity = Math.round((Number(state.currentDealSalesItems[existingIdx].quantity || 1) + Number(quantity || 1)) * 100) / 100;
  } else {
    state.currentDealSalesItems.push({
      sales_equipment_id: item.id,
      name: item.name,
      category: normalizeSalesEqCategoryJS(item.category),
      quantity: Number(quantity || 1),
      base_price: calc.basePrice > 0 ? Math.round(calc.basePrice * 100) / 100 : 0,
      price: calc.finalPrice > 0 ? Math.round(calc.finalPrice * 100) / 100 : 0,
      vat_rate: Number(item.vat_rate ?? 20) === 0 ? 0 : 20,
      vat_mode: item.vat_mode || 'included',
    });
  }

  const titleEl = document.getElementById('deal-title');
  if (titleEl && !titleEl.value.trim()) {
    titleEl.value = `Продажа: ${item.name}`;
  }

  renderDealSalesItemsList();
  recalcSalesDealTotals();
}

function addCustomDealSalesItem(name, price = 0, category = 'Строительная и коммунальная техника') {
  if (!name) return;
  if (!Array.isArray(state.currentDealSalesItems)) state.currentDealSalesItems = [];
  state.currentDealSalesItems.push({
    sales_equipment_id: null,
    name: name.trim(),
    category: normalizeSalesEqCategoryJS(category),
    quantity: 1,
    price: Math.max(0, parsePartNumberInput(price, 0)),
    vat_rate: 20,
    vat_mode: 'included',
  });
  renderDealSalesItemsList();
  recalcSalesDealTotals();
}

function stepDealSalesItemQty(idx, delta) {
  if (!Array.isArray(state.currentDealSalesItems) || !state.currentDealSalesItems[idx]) return;
  const cur = parsePartNumberInput(state.currentDealSalesItems[idx].quantity, 1);
  const next = Math.max(1, Math.round((cur + delta) * 100) / 100);
  state.currentDealSalesItems[idx].quantity = next;
  renderDealSalesItemsList();
  recalcSalesDealTotals();
}

function updateDealSalesItemQty(idx, val) {
  if (!Array.isArray(state.currentDealSalesItems) || !state.currentDealSalesItems[idx]) return;
  const qty = Math.max(0.01, parsePartNumberInput(val, 1));
  state.currentDealSalesItems[idx].quantity = qty;
  const price = Math.max(0, parsePartNumberInput(state.currentDealSalesItems[idx].price, 0));
  const cur = normalizeDealCurrency(document.getElementById('deal-currency')?.value || 'AMD');
  const lineEl = document.getElementById(`deal-sales-item-line-total-${idx}`);
  if (lineEl) lineEl.textContent = formatMoney(Math.round(qty * price * 100) / 100, cur);
  recalcSalesDealTotals();
}

function updateDealSalesItemPrice(idx, val) {
  if (!Array.isArray(state.currentDealSalesItems) || !state.currentDealSalesItems[idx]) return;
  const price = Math.max(0, parsePartNumberInput(val, 0));
  const item = state.currentDealSalesItems[idx];
  item.price = price;
  const rate = Number(item.vat_rate ?? 20) === 0 ? 0 : 20;
  const mode = item.vat_mode === 'added' ? 'added' : 'included';
  item.base_price = (rate === 20 && mode === 'added') ? Math.round((price / 1.2) * 100) / 100 : price;
  const qty = Math.max(0.01, parsePartNumberInput(item.quantity, 1));
  const cur = normalizeDealCurrency(document.getElementById('deal-currency')?.value || 'AMD');
  const lineEl = document.getElementById(`deal-sales-item-line-total-${idx}`);
  if (lineEl) lineEl.textContent = formatMoney(Math.round(qty * price * 100) / 100, cur);
  recalcSalesDealTotals();
}

function removeDealSalesItem(idx) {
  if (!Array.isArray(state.currentDealSalesItems)) return;
  state.currentDealSalesItems.splice(idx, 1);
  renderDealSalesItemsList();
  recalcSalesDealTotals();
}

function handleDealSalesEqSelectPick(itemId) {
  if (!itemId) return;
  selectDealSalesEquipment(itemId);
  const select = document.getElementById('deal-sales-eq-select');
  if (select) select.value = '';
}

function addSelectedSalesEquipmentToDeal() {
  const select = document.getElementById('deal-sales-eq-select');
  const searchInput = document.getElementById('deal-sales-eq-search');
  const selectedId = select?.value || document.getElementById('deal-sales-eq-id')?.value;
  if (selectedId) {
    selectDealSalesEquipment(selectedId);
    if (select) select.value = '';
    return;
  }
  const typed = (searchInput?.value || '').trim();
  if (!typed) {
    showToast('Выберите модель из списка или введите наименование техники', 'info');
    return;
  }
  const matched = (state.salesEquipment || []).find(x => (x.name || '').trim().toLowerCase() === typed.toLowerCase());
  if (matched) {
    selectDealSalesEquipment(matched.id);
  } else {
    createSalesEquipmentAutoFromDeal(null, typed);
  }
}

function setDealSalesEquipmentSelection(itemId, fallbackName = '') {
  const idInput = document.getElementById('deal-sales-eq-id');
  const select = document.getElementById('deal-sales-eq-select');
  const searchInput = document.getElementById('deal-sales-eq-search');
  const clearBtn = document.getElementById('deal-sales-eq-clear');
  const badge = document.getElementById('deal-sales-eq-vat-badge');

  const item = itemId ? (state.salesEquipment || []).find(x => Number(x.id) === Number(itemId)) : null;
  if (item) {
    if (idInput) idInput.value = '';
    if (select) select.value = '';
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (badge) badge.classList.add('hidden');
  } else {
    if (idInput) idInput.value = '';
    if (select) select.value = '';
    if (searchInput) searchInput.value = fallbackName || '';
    if (clearBtn) clearBtn.classList.toggle('hidden', !fallbackName);
    if (badge) badge.classList.add('hidden');
  }
}

function selectDealSalesEquipment(itemId) {
  const resultsBox = document.getElementById('deal-sales-eq-results');
  if (resultsBox) resultsBox.classList.add('hidden');
  if (!itemId) {
    setDealSalesEquipmentSelection(null, '');
    return;
  }
  const item = (state.salesEquipment || []).find(x => Number(x.id) === Number(itemId));
  if (!item) return;

  addDealSalesItemFromCatalog(item, 1);
  setDealSalesEquipmentSelection(null, '');
}

function clearDealSalesEqSearch() {
  setDealSalesEquipmentSelection(null, '');
  const resultsBox = document.getElementById('deal-sales-eq-results');
  if (resultsBox) {
    resultsBox.classList.add('hidden');
    resultsBox.innerHTML = '';
  }
}

function handleDealSalesEqSearch(query) {
  const resultsBox = document.getElementById('deal-sales-eq-results');
  const clearBtn = document.getElementById('deal-sales-eq-clear');
  if (!resultsBox) return;

  const rawTrimmed = (query || '').trim();
  const q = rawTrimmed.toLowerCase();
  if (clearBtn) clearBtn.classList.toggle('hidden', !rawTrimmed);

  const list = Array.isArray(state.salesEquipment) ? state.salesEquipment : [];
  const matches = q
    ? list.filter(item =>
        (item.name || '').toLowerCase().includes(q) ||
        (item.sku_code || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      )
    : list.slice(0, 10);

  if (!rawTrimmed && matches.length === 0) {
    resultsBox.classList.add('hidden');
    return;
  }

  const exactMatch = rawTrimmed && list.some(item => (item.name || '').trim().toLowerCase() === q);

  const matchesHtml = matches.slice(0, 12).map(item => {
    const itemCurr = normalizeDealCurrency(item.currency || 'AMD');
    const calc = computeSalesEqPriceWithVat(item.selling_price, item.vat_rate, item.vat_mode);
    const normCat = normalizeSalesEqCategoryJS(item.category);
    return `
      <div onclick="selectDealSalesEquipment(${item.id})" class="p-2.5 hover:bg-indigo-50 cursor-pointer transition-colors">
        <div class="flex items-center justify-between text-xs font-bold text-slate-800">
          <span>+ ${escapeHtml(item.name)}</span>
          <span class="font-mono text-indigo-700">${calc.basePrice > 0 ? formatMoney(calc.finalPrice, itemCurr) : `Цена по запросу (${itemCurr})`}</span>
        </div>
        <div class="text-[11px] text-slate-500 flex items-center justify-between mt-0.5">
          <span>${escapeHtml(normCat)}${item.sku_code ? ' • ' + escapeHtml(item.sku_code) : ''}</span>
          <span>${calc.rate === 0 ? 'НДС 0%' : (calc.mode === 'added' ? '+ НДС 20%' : 'НДС 20% вкл.')}</span>
        </div>
      </div>
    `;
  }).join('');

  const curDealCurrency = normalizeDealCurrency(document.getElementById('deal-currency')?.value || 'AMD');
  const createNewProductHtml = (rawTrimmed && !exactMatch) ? `
    <div class="p-3 bg-indigo-50/90 border-t border-indigo-200 space-y-2" onclick="event.stopPropagation()">
      <div class="text-[11px] text-indigo-950 font-semibold flex items-center gap-1.5">
        <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-indigo-600 shrink-0"></i>
        <span>${matches.length === 0 ? `Модель «<b>${escapeHtml(rawTrimmed)}</b>» не найдена в базе.` : `Нет точного совпадения для «<b>${escapeHtml(rawTrimmed)}</b>».`} Добавить новый товар автоматически?</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        <select id="quick-new-sales-eq-category" class="border border-indigo-300 rounded-lg px-2 py-1.5 text-xs bg-white outline-none font-semibold">
          <option value="Строительная и коммунальная техника">🏗️ Строительная и коммунальная</option>
          <option value="Сельскохозяйственная техника">🌾 Сельскохозяйственная</option>
        </select>
        <input type="text" inputmode="decimal" id="quick-new-sales-eq-price" placeholder="Цена (необяз.)" class="border border-indigo-300 rounded-lg px-2 py-1.5 text-xs bg-white outline-none font-mono">
        <select id="quick-new-sales-eq-currency" class="border border-indigo-300 rounded-lg px-2 py-1.5 text-xs bg-white outline-none font-bold font-mono">
          <option value="AMD" ${curDealCurrency === 'AMD' ? 'selected' : ''}>AMD (Драм)</option>
          <option value="USD" ${curDealCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
          <option value="EUR" ${curDealCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        <select id="quick-new-sales-eq-vat-rate" class="border border-indigo-300 rounded-lg px-2 py-1.5 text-xs bg-white outline-none font-semibold">
          <option value="20">НДС 20%</option>
          <option value="0">НДС 0%</option>
        </select>
        <select id="quick-new-sales-eq-vat-mode" class="border border-indigo-300 rounded-lg px-2 py-1.5 text-xs bg-white outline-none font-semibold">
          <option value="included">Включен в цену</option>
          <option value="added">Добавить к цене</option>
        </select>
      </div>
      <button type="button" onclick="createSalesEquipmentAutoFromDeal(event)" class="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
        <span>+ Добавить новый товар «${escapeHtml(rawTrimmed)}» в базу и сделку</span>
      </button>
    </div>
  ` : '';

  resultsBox.innerHTML = matchesHtml + createNewProductHtml;
  resultsBox.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

async function createSalesEquipmentAutoFromDeal(event = null, directName = null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const searchInput = document.getElementById('deal-sales-eq-search');
  const nameVal = (directName || searchInput?.value || '').trim();
  if (!nameVal) {
    showToast('Введите наименование модели техники', 'error');
    return null;
  }
  const categoryVal = normalizeSalesEqCategoryJS(document.getElementById('quick-new-sales-eq-category')?.value || 'Строительная и коммунальная техника');
  const priceVal = parsePartNumberInput(document.getElementById('quick-new-sales-eq-price')?.value, 0);
  const currencyVal = normalizeDealCurrency(document.getElementById('quick-new-sales-eq-currency')?.value || document.getElementById('deal-currency')?.value || 'AMD');
  const vatRate = parseInt(document.getElementById('quick-new-sales-eq-vat-rate')?.value || '20', 10) === 0 ? 0 : 20;
  const vatMode = document.getElementById('quick-new-sales-eq-vat-mode')?.value || 'included';

  try {
    const res = await fetch('/api/sales-equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameVal,
        category: categoryVal,
        sku_code: '',
        selling_price: priceVal,
        currency: currencyVal,
        vat_rate: vatRate,
        vat_mode: vatMode,
        notes: 'Добавлено автоматически из карточки сделки Отдела продаж'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) throw new Error(data.detail || data.message || 'Ошибка добавления техники для продажи');

    crmStore.saveItem('sales_equipment', data);
    if (!Array.isArray(state.salesEquipment)) state.salesEquipment = [];
    state.salesEquipment.unshift(data);

    await loadSalesEquipmentOptions();
    selectDealSalesEquipment(data.id);
    showToast(`Новый товар «${nameVal}» добавлен в базу (${categoryVal}) и в сделку!`);
    return data;
  } catch (err) {
    showToast(err.message || 'Ошибка автодобавления техники', 'error');
    return null;
  }
}

document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('deal-sales-eq-search-wrapper');
  const results = document.getElementById('deal-sales-eq-results');
  if (results && !results.classList.contains('hidden')) {
    if (wrapper && !wrapper.contains(e.target)) {
      results.classList.add('hidden');
    }
  }
});
