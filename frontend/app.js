(() => {
  if (!document.querySelector('link[data-mealops-theme]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/theme.css';
    link.dataset.mealopsTheme = 'true';
    document.head.appendChild(link);
  }

  document.querySelectorAll('.brand-copy span').forEach((element) => {
    if (element.textContent.trim() === 'Restaurant operations' || element.textContent.trim() === 'Operación de cocina') {
      element.textContent = 'Restaurante';
    }
  });

  document.querySelectorAll('.brand-mark').forEach((mark) => {
    if (!mark.querySelector('svg')) {
      mark.textContent = '';
      mark.innerHTML = '<svg class="ui-icon" width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><use href="assets/icons.svg#logo"></use></svg>';
    }
  });

  let user = null;
  let role = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
    role = user?.role || null;
  } catch (_) {}

  const current = window.location.pathname.split('/').pop() || 'home.html';
  const routeRoles = {
    'index.html': ['admin', 'mesero'],
    'waiter.html': ['admin', 'mesero'],
    'kds.html': ['admin', 'cocina'],
    'counter.html': ['admin', 'mesero', 'cocina', 'repartidor'],
    'menu.html': ['admin'],
    'products.html': ['admin'],
    'tables.html': ['admin'],
    'combos.html': ['admin'],
    'settings.html': ['admin'],
    'analytics.html': ['admin', 'mesero']
  };

  if (role && routeRoles[current] && !routeRoles[current].includes(role)) {
    window.location.replace('home.html');
    return;
  }

  // Sidebar Retractable Logic & Floating Toggle
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    const isCollapsed = localStorage.getItem('mealops_sidebar_collapsed') === 'true';
    if (isCollapsed) sidebar.classList.add('collapsed');

    if (!sidebar.querySelector('.sidebar-toggle-btn')) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'sidebar-toggle-btn';
      toggleBtn.title = 'Colapsar / expandir menú lateral';
      toggleBtn.setAttribute('aria-label', 'Colapsar menú lateral');
      toggleBtn.innerHTML = '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#chevron-left"></use></svg>';
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('mealops_sidebar_collapsed', sidebar.classList.contains('collapsed'));
      };
      sidebar.appendChild(toggleBtn);
    }
  }

  const nav = document.querySelector('.nav');
  if (nav && role) {
    const definitions = [
      { href: 'home.html', label: 'Panel', icon: 'logo', roles: ['admin', 'mesero', 'cocina', 'repartidor'] },
      { href: 'index.html', label: 'Ventas', icon: 'sales', roles: ['admin', 'mesero'] },
      { href: 'waiter.html', label: 'Mesero', icon: 'waiter', roles: ['admin', 'mesero'] },
      { href: 'kds.html', label: 'Cocina KDS', icon: 'kitchen', roles: ['admin', 'cocina'] },
      { href: 'counter.html', label: 'Mostrador', icon: 'counter', roles: ['admin', 'mesero', 'cocina', 'repartidor'] },
      { href: 'menu.html', label: 'Menú', icon: 'calendar', roles: ['admin'] },
      { href: 'products.html', label: 'Productos', icon: 'products', roles: ['admin'] },
      { href: 'tables.html', label: 'Mesas', icon: 'tables', roles: ['admin'] },
      { href: 'combos.html', label: 'Combos', icon: 'combo', roles: ['admin'] },
      { href: 'analytics.html', label: 'Reportes', icon: 'analytics', roles: ['admin', 'mesero'] },
      { href: 'settings.html', label: 'Configuración', icon: 'settings', roles: ['admin'] }
    ];
    nav.innerHTML = definitions
      .filter((item) => item.roles.includes(role))
      .map((item) => `<a href="${item.href}" class="${current === item.href ? 'active' : ''}" title="${item.label}"><svg class="nav-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#${item.icon}"></use></svg><span>${item.label}</span></a>`)
      .join('');
  }

  // Sidebar User Footer Enhancement
  const sidebarFooter = document.querySelector('.sidebar-footer');
  if (sidebarFooter && user) {
    const initials = (user.name || user.phone || 'U').substring(0, 2).toUpperCase();
    sidebarFooter.innerHTML = `
      <div class="sidebar-user">
        <div class="sidebar-user-avatar">${initials}</div>
        <div class="sidebar-user-info">
          <strong>${escapeHtml(user.name || user.phone || 'Usuario')}</strong>
          <span>${escapeHtml(user.role || 'Personal')}</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="logout()" style="width:100%;margin-top:4px" title="Cerrar sesión">
        <svg class="ui-icon" width="16" height="16" viewBox="0 0 24 24"><use href="assets/icons.svg#close"></use></svg>
        <span>Salir</span>
      </button>
    `;
  }
})();

const API = window.MEALOPS_API_URL || localStorage.getItem("mealops_api_url") || "http://localhost:3000";

function getToken() {
  return localStorage.getItem("token");
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function parseJwt(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(normalized))));
  } catch {
    return null;
  }
}

function requireAuth(roles = []) {
  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return null;
  }

  const user = getCurrentUser() || parseJwt(token);
  if (roles.length && (!user || !roles.includes(user.role))) {
    showToast("No tienes permisos para entrar a este módulo", "error");
    setTimeout(() => {
      window.location.href = "home.html";
    }, 900);
    return null;
  }

  return user;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3200);
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "login.html";
    throw new Error("Sesión expirada");
  }

  if (!response.ok) {
    const message = typeof data === "object" && (data?.error || data?.message) ? (data.error || data.message) : "Error en la solicitud";
    throw new Error(message);
  }

  return data;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
