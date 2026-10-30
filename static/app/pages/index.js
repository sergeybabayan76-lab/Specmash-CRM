(function () {
  const loaders = {
    dashboard: () => window.loadDashboard(),
    kanban: () => window.loadDeals(),
    clients: () => window.loadClients(),
    equipment: () => window.loadEquipment(),
    warehouse: () => window.loadParts(),
    tasks: () => window.loadTasks(),
    users: () => window.loadUsers(),
    settings: () => window.loadAdminSettings(),
    marketing: () => {
      window.loadWhatsAppConfig();
      window.loadWhatsAppLogs();
    }
  };

  function load(tabName) {
    const loader = loaders[tabName];
    if (loader) return loader();
    return Promise.resolve();
  }

  window.SpecmashApp = window.SpecmashApp || {};
  window.SpecmashApp.pages = { load };
}());
