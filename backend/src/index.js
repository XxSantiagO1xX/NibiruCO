const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
  console.error("FATAL: La variable de entorno JWT_SECRET no está configurada. El servidor MealOps no puede iniciar.");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const pool = require("./db");
const ensureOperationalSchema = require("./schema");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origen no permitido por CORS"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "1mb" }));

const authRoutes = require("./middleware/auth.routes");
const productRoutes = require("./routes/products.routes");
const orderRoutes = require("./routes/orders.routes");
const menuRoutes = require("./routes/menu.routes");
const usersRoutes = require("./routes/users.routes");
const tableRoutes = require("./routes/tables.routes");
const comboRoutes = require("./routes/combos.routes");
const counterRoutes = require("./routes/counter.routes");
const deliveryRoutes = require("./routes/deliveries.routes");
const settingsRoutes = require("./routes/settings.routes");
const settlementsRoutes = require("./routes/settlements.routes");

const routes = [
  authRoutes,
  productRoutes,
  orderRoutes,
  menuRoutes,
  usersRoutes,
  tableRoutes,
  comboRoutes,
  counterRoutes,
  deliveryRoutes,
  settingsRoutes,
  settlementsRoutes
];
if (routes.some((route) => typeof route !== "function")) {
  throw new Error("Una o más rutas de MealOps no son válidas");
}

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/menu", menuRoutes);
app.use("/users", usersRoutes);
app.use("/tables", tableRoutes);
app.use("/combos", comboRoutes);
app.use("/counter", counterRoutes);
app.use("/deliveries", deliveryRoutes);
app.use("/settings", settingsRoutes);
app.use("/settlements", settlementsRoutes);
app.use("/api/settlements", settlementsRoutes);

const projectRoot = path.resolve(__dirname, "../..");
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));
app.use("/css", express.static(path.join(projectRoot, "css")));
app.use(express.static(path.join(projectRoot, "frontend")));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "MealOps API" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(projectRoot, "frontend", "login.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === "Origen no permitido por CORS") {
    return res.status(403).json({ message: err.message });
  }
  return res.status(500).json({ message: "Error interno del servidor" });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ["GET", "POST", "PATCH"]
  }
});

app.set("io", io);

// Socket.io JWT Authentication Middleware
io.use((socket, next) => {
  try {
    const rawToken =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
        : null) ||
      socket.handshake.query?.token;

    if (!rawToken) {
      socket.user = null;
      return next();
    }

    const decoded = jwt.verify(rawToken, JWT_SECRET);
    socket.user = decoded;
    return next();
  } catch (err) {
    // If token invalid/expired, connect as unauthenticated guest
    socket.user = null;
    return next();
  }
});

io.on("connection", (socket) => {
  // Auto-join authenticated user private room
  if (socket.user && socket.user.id) {
    socket.join(`user_${socket.user.id}`);
  }

  // Safe client user room join (only allows joining own user room)
  socket.on("join-user", (userId) => {
    if (socket.user && socket.user.id && Number(userId) === Number(socket.user.id)) {
      socket.join(`user_${socket.user.id}`);
    }
  });

  // Private room subscription for order tracking with strict authorization
  socket.on("join-order", async (orderId, callback) => {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!socket.user) {
      socket.emit("auth-error", { message: "Autenticación requerida para acceder al pedido" });
      return cb({ ok: false, error: "unauthorized" });
    }

    const numOrderId = parseInt(orderId, 10);
    if (!numOrderId || isNaN(numOrderId)) {
      socket.emit("auth-error", { message: "ID de pedido inválido" });
      return cb({ ok: false, error: "invalid_order_id" });
    }

    try {
      // Staff roles with operational access
      const staffRoles = ["admin", "mostrador", "mesero", "cocina"];
      if (staffRoles.includes(socket.user.role)) {
        socket.join(`order_${numOrderId}`);
        return cb({ ok: true });
      }

      // Check order ownership or driver assignment
      const orderRes = await pool.query(
        `SELECT o.id, o.user_id, dt.driver_user_id
         FROM orders o
         LEFT JOIN delivery_trip_stops dts ON dts.order_id = o.id
         LEFT JOIN delivery_trips dt ON dt.id = dts.trip_id
         WHERE o.id = $1
         LIMIT 1`,
        [numOrderId]
      );

      if (orderRes.rowCount === 0) {
        socket.emit("auth-error", { message: "Pedido no encontrado" });
        return cb({ ok: false, error: "order_not_found" });
      }

      const order = orderRes.rows[0];
      const isOwner = Number(order.user_id) === Number(socket.user.id);
      const isAssignedDriver = Number(order.driver_user_id) === Number(socket.user.id);

      if (isOwner || isAssignedDriver) {
        socket.join(`order_${numOrderId}`);
        return cb({ ok: true });
      } else {
        socket.emit("auth-error", { message: "No autorizado para ver este pedido" });
        return cb({ ok: false, error: "forbidden" });
      }
    } catch (err) {
      console.error("Error authorizing join-order:", err);
      socket.emit("auth-error", { message: "Error interno al autorizar pedido" });
      return cb({ ok: false, error: "server_error" });
    }
  });

  socket.on("leave-order", (orderId) => {
    const numOrderId = parseInt(orderId, 10);
    if (numOrderId) {
      socket.leave(`order_${numOrderId}`);
    }
  });

  // Room subscription for driver trip with strict authorization
  socket.on("join-trip", async (tripId, callback) => {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!socket.user) {
      socket.emit("auth-error", { message: "Autenticación requerida para acceder al viaje" });
      return cb({ ok: false, error: "unauthorized" });
    }

    const numTripId = parseInt(tripId, 10);
    if (!numTripId || isNaN(numTripId)) {
      socket.emit("auth-error", { message: "ID de viaje inválido" });
      return cb({ ok: false, error: "invalid_trip_id" });
    }

    try {
      if (["admin", "mostrador"].includes(socket.user.role)) {
        socket.join(`trip_${numTripId}`);
        return cb({ ok: true });
      }

      const tripRes = await pool.query(
        `SELECT id, driver_user_id FROM delivery_trips WHERE id = $1`,
        [numTripId]
      );

      if (tripRes.rowCount === 0) {
        socket.emit("auth-error", { message: "Viaje no encontrado" });
        return cb({ ok: false, error: "trip_not_found" });
      }

      const trip = tripRes.rows[0];
      if (Number(trip.driver_user_id) === Number(socket.user.id)) {
        socket.join(`trip_${numTripId}`);
        return cb({ ok: true });
      } else {
        socket.emit("auth-error", { message: "No autorizado para ver este viaje" });
        return cb({ ok: false, error: "forbidden" });
      }
    } catch (err) {
      console.error("Error authorizing join-trip:", err);
      socket.emit("auth-error", { message: "Error interno al autorizar viaje" });
      return cb({ ok: false, error: "server_error" });
    }
  });

  socket.on("disconnect", () => {
    // disconnected
  });
});

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  await ensureOperationalSchema();
  server.listen(PORT, () => {
    console.log(`MealOps disponible en http://localhost:${PORT}`);
  });

  // Motor de Despacho Automático periódico (verificar expiraciones y pedidos en cola)
  const dispatchEngine = require("./services/dispatchEngine");
  setInterval(async () => {
    try {
      await dispatchEngine.checkExpiredOffers(io);
      await dispatchEngine.evaluateDispatchQueue(io);
    } catch (err) {
      console.error("DISPATCH TICKER ERROR:", err.message);
    }
  }, 5000);
}

start().catch((error) => {
  console.error("No se pudo iniciar MealOps:", error);
  process.exit(1);
});
