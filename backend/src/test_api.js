const http = require("http");
const express = require("express");
const pool = require("./db");

// Cargar routers
const authRoutes = require("./middleware/auth.routes");
const productRoutes = require("./routes/products.routes");
const orderRoutes = require("./routes/orders.routes");
const menuRoutes = require("./routes/menu.routes");
const usersRoutes = require("./routes/users.routes");

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

async function runTests() {
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  console.log(`🧪 Servidor de prueba iniciado en ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAILED: ${name} ->`, e.message);
      failed++;
    }
  }

  // TEST 1: Healthcheck
  await test("GET / status OK", async () => {
    const res = await fetch(`${baseUrl}/`);
    const data = await res.json();
    if (res.status !== 200 || data.status !== "ok") {
      throw new Error(`Expected 200 ok, got ${res.status}: ${JSON.stringify(data)}`);
    }
  });

  // TEST 2: Validación de Registro sin campos
  await test("POST /auth/register-phone validation", async () => {
    const res = await fetch(`${baseUrl}/auth/register-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400 bad request, got ${res.status}`);
    }
  });

  // TEST 3: Validación de Login sin campos
  await test("POST /auth/login-phone validation", async () => {
    const res = await fetch(`${baseUrl}/auth/login-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400 bad request, got ${res.status}`);
    }
  });

  // TEST 4: Validación de Menú con día inválido
  await test("GET /menu/:day invalid day validation", async () => {
    const res = await fetch(`${baseUrl}/menu/martes_invalido`);
    if (res.status !== 400) {
      throw new Error(`Expected 400 for invalid day, got ${res.status}`);
    }
  });

  // TEST 5: Validación de Producto sin nombre ni precio
  await test("POST /products validation", async () => {
    const res = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400 for empty product, got ${res.status}`);
    }
  });

  // TEST 6: Validación de Pedido sin token (401 Unauthorized)
  await test("POST /orders requires authentication (401)", async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ product_id: 1, quantity: 1 }] })
    });
    if (res.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
    }
  });

  // TEST 7: Actualización de estado de pedido requiere Auth y Rol Cocina/Admin (401)
  await test("PATCH /orders/:id/status requires authentication (401)", async () => {
    const res = await fetch(`${baseUrl}/orders/1/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "preparando" })
    });
    if (res.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for status change, got ${res.status}`);
    }
  });

  console.log(`\n📊 RESULTADOS: ${passed} pruebas pasadas, ${failed} fallidas.\n`);

  server.close(async () => {
    try {
      await pool.end();
    } catch(e) {}
    process.exit(failed > 0 ? 1 : 0);
  });
}

runTests();
