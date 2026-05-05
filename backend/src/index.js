const http = require("http");
const { Server } = require("socket.io");

// Crear servidor HTTP
const server = http.createServer(app);

// Inicializar socket.io
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// Hacer io global
app.set("io", io);

// Evento de conexión
io.on("connection", (socket) => {
  console.log("🔌 Cliente conectado:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Cliente desconectado:", socket.id);
  });
});

// Puerto
const PORT = process.env.PORT || 3000;

// Levantar servidor
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});