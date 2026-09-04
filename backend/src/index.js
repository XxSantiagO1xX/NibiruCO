const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
require("./db");

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

const routes = [authRoutes, productRoutes, orderRoutes, menuRoutes, usersRoutes];
if (routes.some((route) => typeof route !== "function")) {
  throw new Error("Una o más rutas de MealOps no son válidas");
}

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/menu", menuRoutes);
app.use("/users", usersRoutes);

const projectRoot = path.resolve(__dirname, "../..");
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

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`MealOps disponible en http://localhost:${PORT}`);
});
