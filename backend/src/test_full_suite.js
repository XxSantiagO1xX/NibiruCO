const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");

// Cargar controladores y middlewares
const auth = require("./middleware/auth");
const roles = require("./middleware/roles");
const authRoutes = require("./middleware/auth.routes");
const productRoutes = require("./routes/products.routes");
const orderRoutes = require("./routes/orders.routes");
const menuRoutes = require("./routes/menu.routes");
const usersRoutes = require("./routes/users.routes");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_mealops_2026";

// Crear servidor Express de prueba
const app = express();
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/menu", menuRoutes);
app.use("/users", usersRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", app: "MealOps / NibiruCO API" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: process.uptime() });
});

app.use((req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

async function runTestSuite() {
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  console.log(`\n======================================================`);
  console.log(`🧪 EJECUTANDO SUITE COMPLETA DE PRUEBAS MEALOPS API`);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAILED: ${name} -> ${e.message}`);
      failed++;
    }
  }

  // Generar tokens para pruebas
  const tokenCliente = jwt.sign({ id: 999, phone: "1111111111", role: "cliente" }, JWT_SECRET, { expiresIn: "1h" });
  const tokenCocina = jwt.sign({ id: 888, phone: "2222222222", role: "cocina" }, JWT_SECRET, { expiresIn: "1h" });
  const tokenAdmin = jwt.sign({ id: 777, phone: "3333333333", role: "admin" }, JWT_SECRET, { expiresIn: "1h" });
  const tokenInvalido = "Bearer token_falso_invalido";

  // 1. Healthcheck & Rutas Base
  await test("1. Healthcheck (GET /)", async () => {
    const res = await fetch(`${baseUrl}/`);
    const data = await res.json();
    if (res.status !== 200 || data.status !== "ok") throw new Error(`Estado inesperado: ${res.status}`);
  });

  await test("2. Healthcheck Uptime (GET /health)", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    if (res.status !== 200 || data.status !== "healthy") throw new Error(`Estado inesperado: ${res.status}`);
  });

  await test("3. Manejo de 404 en ruta inexistente", async () => {
    const res = await fetch(`${baseUrl}/api/v1/ruta_que_no_existe`);
    if (res.status !== 404) throw new Error(`Se esperaba 404, se obtuvo ${res.status}`);
  });

  // 2. Validaciones de Autenticación
  await test("4. Validación de campos en registro (/auth/register-phone)", async () => {
    const res = await fetch(`${baseUrl}/auth/register-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  await test("5. Validación de campos en login (/auth/login-phone)", async () => {
    const res = await fetch(`${baseUrl}/auth/login-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  await test("6. Validación de campos en alias login (/auth/login)", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  // 3. Seguridad de OTP / Recuperación
  await test("7. Forgot Password sin teléfono responde 400", async () => {
    const res = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  await test("8. Reset Password sin campos completos responde 400", async () => {
    const res = await fetch(`${baseUrl}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "12345" })
    });
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  // 4. Seguridad de JWT y Permisos
  await test("9. Endpoint protegido sin Token responde 401 (/orders)", async () => {
    const res = await fetch(`${baseUrl}/orders`);
    if (res.status !== 401) throw new Error(`Se esperaba 401, se obtuvo ${res.status}`);
  });

  await test("10. Endpoint protegido con Token Inválido responde 401 (/orders)", async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      headers: { "Authorization": tokenInvalido }
    });
    if (res.status !== 401) throw new Error(`Se esperaba 401, se obtuvo ${res.status}`);
  });

  await test("11. Endpoint protegido sin Token responde 401 (/users/me)", async () => {
    const res = await fetch(`${baseUrl}/users/me`);
    if (res.status !== 401) throw new Error(`Se esperaba 401, se obtuvo ${res.status}`);
  });

  // 5. Control de Acceso basado en Roles (RBAC)
  await test("12. Rol Cliente intentando ver comandas de cocina (/orders/admin/all) es bloqueado con 403 Forbidden", async () => {
    const res = await fetch(`${baseUrl}/orders/admin/all`, {
      headers: { "Authorization": `Bearer ${tokenCliente}` }
    });
    if (res.status !== 403) throw new Error(`Se esperaba 403 Forbidden, se obtuvo ${res.status}`);
  });

  await test("13. Rol Cliente intentando cambiar status de pedido (PATCH /orders/1/status) es bloqueado con 403 Forbidden", async () => {
    const res = await fetch(`${baseUrl}/orders/1/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenCliente}`
      },
      body: JSON.stringify({ status: "preparando" })
    });
    if (res.status !== 403) throw new Error(`Se esperaba 403 Forbidden, se obtuvo ${res.status}`);
  });

  await test("14. Rol Cocina tiene autorización para el endpoint de status (No responde 401 ni 403)", async () => {
    const res = await fetch(`${baseUrl}/orders/1/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenCocina}`
      },
      body: JSON.stringify({ status: "status_invalido" })
    });
    // Debe pasar auth y roles, y fallar por validación de status (400) o pedido inexistente (404/500 por DB), pero NUNCA 401/403
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Rol cocina fue denegado incorrectamente con código ${res.status}`);
    }
  });

  await test("15. Rol Admin tiene autorización para el endpoint de status (No responde 401 ni 403)", async () => {
    const res = await fetch(`${baseUrl}/orders/1/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ status: "status_invalido" })
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Rol admin fue denegado incorrectamente con código ${res.status}`);
    }
  });

  // 6. Validación de Productos y Menú
  await test("16. Validación de creación de producto sin nombre ni precio (POST /products)", async () => {
    const res = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", price: -10 })
    });
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  await test("17. Consulta de Menú con día inválido responde 400 (/menu/dia_invalido)", async () => {
    const res = await fetch(`${baseUrl}/menu/dia_inventado_xyz`);
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  await test("18. Guardar menú con payload vacío responde 400 (POST /menu/day)", async () => {
    const res = await fetch(`${baseUrl}/menu/day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) throw new Error(`Se esperaba 400, se obtuvo ${res.status}`);
  });

  console.log(`\n======================================================`);
  console.log(`📊 RESULTADO FINAL: ${passed} PASADAS, ${failed} FALLIDAS`);
  console.log(`======================================================\n`);

  server.close();
}

runTestSuite();
