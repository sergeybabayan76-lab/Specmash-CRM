(function () {
  const tabs = [
    'dashboard',
    'kanban',
    'clients',
    'equipment',
    'sales_catalog',
    'warehouse',
    'tasks',
    'users',
    'export',
    'settings',
    'marketing'
  ];

  function canAccess(tabName, user) {
    if (typeof window.canUserAccessTab === 'function') {
      return window.canUserAccessTab(tabName, user);
    }
    if (!user || !user.id) return false;
    return true;
  }

  function fromHash() {
    const requested = window.location.hash.replace(/^#\/?/, '');
    return tabs.includes(requested) ? requested : '';
  }

  window.SpecmashApp = window.SpecmashApp || {};
  window.SpecmashApp.router = { tabs, canAccess, fromHash };
}());
