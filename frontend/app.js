(() => {
  if (!document.querySelector('link[data-mealops-theme]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/theme.css';
    link.dataset.mealopsTheme = 'true';
    document.head.appendChild(link);
  }

  document.querySelectorAll('.brand-copy span').forEach((element) => {
    if (element.textContent.trim() === 'Restaurant operations') {
      element.textContent = 'Operación de cocina';
    }
  });

  document.querySelectorAll('.brand-mark').forEach((mark) => {
    if (!mark.querySelector('svg')) {
      mark.textContent = '';
      mark.innerHTML = '<svg class="ui-icon" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><use href="assets/icons.svg#logo"></use></svg>';
    }
  });

  let role = null;
  try {
    role = JSON.parse(localStorage.getItem('user') || 'null')?.role || null;
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
    'settings.html': ['admin']
  };

  if (role && routeRoles[current] && !routeRoles[current].includes(role)) {
    window.location.replace('home.html');
    return;
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
      { href: 'settings.html', label: 'Configuración', icon: 'settings', roles: ['admin'] }
    ];
    nav.innerHTML = definitions
      .filter((item) => item.roles.includes(role))
      .map((item) => `<a href="${item.href}" class="${current === item.href ? 'active' : ''}"><svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-3px;margin-right:9px;opacity:.88"><use href="assets/icons.svg#${item.icon}"></use></svg>${item.label}</a>`)
      .join('');
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
    const message = typeof data === "object" && data?.message ? data.message : "Error en la solicitud";
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
