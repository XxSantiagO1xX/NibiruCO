const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

/* CARGAR VARIABLES DE ENTORNO */
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

/* INICIALIZAR APP */
const app = express();

/* INICIALIZAR BASE DE DATOS */
require("./db");

/* MIDDLEWARES GLOBALES */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* SERVER HTTP Y SOCKET.IO */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
  }
});

/* HACER SOCKET.IO ACCESIBLE EN CONTROLADORES Y RUTAS */
app.set("io", io);

/* EVENTOS WEBSOCKET */
io.on("connection", (socket) => {
  console.log(`🔌 Cliente WebSocket conectado: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`🔌 Cliente WebSocket desconectado: ${socket.id}`);
  });
});

/* IMPORTACIÓN DE RUTAS */
const authRoutes = require("./middleware/auth.routes");
const productRoutes = require("./routes/products.routes");
const orderRoutes = require("./routes/orders.routes");
const menuRoutes = require("./routes/menu.routes");
const usersRoutes = require("./routes/users.routes");

/* MONTAJE DE RUTAS (ÚNICO Y CENTRALIZADO) */
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/menu", menuRoutes);
app.use("/users", usersRoutes);

/* RUTAS BASE / HEALTHCHECK */
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    app: "MealOps / NibiruCO API",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: process.uptime() });
});

/* MANEJO DE RUTAS NO ENCONTRADAS (404) */
app.use((req, res) => {
  res.status(404).json({
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

/* MANEJO GLOBAL DE ERRORES (500) */
app.use((err, req, res, next) => {
  console.error("🔥 Error no controlado:", err);
  res.status(500).json({
    message: "Error interno del servidor",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

/* PUERTO DE ESCUCHA */
const PORT = process.env.PORT || 3000;

/* INICIO DEL SERVIDOR */
server.listen(PORT, () => {
  console.log(`🚀 Servidor MealOps backend ejecutándose en http://localhost:${PORT}`);
});