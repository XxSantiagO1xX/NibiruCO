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
      mark.innerHTML = '<svg class="ui-icon" viewBox="0 0 32 32" aria-hidden="true"><use href="assets/icons.svg#logo"></use></svg>';
    }
  });

  const navIcons = {
    'home.html': 'logo',
    'index.html': 'sales',
    'waiter.html': 'waiter',
    'kds.html': 'kitchen',
    'counter.html': 'counter',
    'menu.html': 'calendar',
    'products.html': 'products',
    'tables.html': 'tables',
    'combos.html': 'combo'
  };

  document.querySelectorAll('.nav a').forEach((link) => {
    if (link.querySelector('.nav-icon')) return;
    const href = (link.getAttribute('href') || '').split('/').pop();
    const icon = navIcons[href];
    if (!icon) return;
    link.insertAdjacentHTML('afterbegin', `<svg class="nav-icon" aria-hidden="true"><use href="assets/icons.svg#${icon}"></use></svg>`);
  });
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
