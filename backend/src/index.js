const path = require("path");

/* CARGAR VARIABLES DE ENTORNO */
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

console.log("JWT_SECRET:", process.env.JWT_SECRET);

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

/* APP */
const app = express();

/* DB */
require("./db");

/* MIDDLEWARES */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* RUTAS */
const authRoutes = require("./middleware/auth.routes");
const productRoutes = require("./routes/products.routes");
const orderRoutes = require("./routes/orders.routes");
const menuRoutes = require("./routes/menu.routes");
const usersRoutes = require("./routes/users.routes");

/* VALIDACIÓN CRÍTICA (NO BORRAR) */
if (!authRoutes || typeof authRoutes !== "function") {
  throw new Error("authRoutes NO es válido");
}
if (!productRoutes || typeof productRoutes !== "function") {
  throw new Error("productRoutes NO es válido");
}
if (!orderRoutes || typeof orderRoutes !== "function") {
  throw new Error("orderRoutes NO es válido");
}
if (!menuRoutes || typeof menuRoutes !== "function") {
  throw new Error("menuRoutes NO es válido");
}
if (!usersRoutes || typeof usersRoutes !== "function") {
  throw new Error("usersRoutes NO es válido");
}

/* USO */
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/menu", menuRoutes);
app.use("/users", usersRoutes);

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/menu", menuRoutes);
app.use("/users", usersRoutes);

/* RUTAS BASE */
app.get("/", (req, res) => {
  res.send("MealOps API funcionando");
});

app.get("/test", (req, res) => {
  res.send("test ok");
});

/* SERVER HTTP */
const server = http.createServer(app);

/* SOCKET.IO */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/* DISPONIBLE EN TODAS LAS RUTAS */
app.set("io", io);

/* EVENTOS SOCKET */
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

/* PUERTO */
const PORT = process.env.PORT || 3000;

/* START */
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});