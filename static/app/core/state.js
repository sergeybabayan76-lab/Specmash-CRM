(function () {
  const state = {
    currentTab: 'dashboard',
    currentUser: null,
    dealsViewMode: 'list',
    dealsDepartment: 'service',
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
    draggedDealId: null
  };

  window.SpecmashApp = window.SpecmashApp || {};
  window.SpecmashApp.state = state;
  window.state = state;
}());
