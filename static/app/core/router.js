(function () {
  const tabs = [
    'dashboard',
    'kanban',
    'clients',
    'equipment',
    'warehouse',
    'tasks',
    'users',
    'export',
    'settings',
    'marketing'
  ];

  function canAccess(tabName, user) {
    if (!user || !user.id) return false;
    const permissions = user.permissions || {};
    if (tabName === 'settings' || tabName === 'users' || tabName === 'marketing') {
      return user.role === 'admin' || permissions[tabName] === true;
    }
    if (tabName === 'export') {
      return user.role === 'admin' || !['mechanic', 'manager', 'sales_manager'].includes(user.role);
    }
    return true;
  }

  function fromHash() {
    const requested = window.location.hash.replace(/^#\/?/, '');
    return tabs.includes(requested) ? requested : 'dashboard';
  }

  window.SpecmashApp = window.SpecmashApp || {};
  window.SpecmashApp.router = { tabs, canAccess, fromHash };
}());
