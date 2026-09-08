const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "mealops",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on("error", (err) => {
  console.error("⚠️ Error inesperado en el pool inactivo de PostgreSQL:", err.message);
});

// Prueba inicial de conexión
pool.connect()
  .then((client) => {
    console.log("✅ PostgreSQL conectado correctamente");
    client.release();
  })
  .catch(err => {
    console.warn("⚠️ Aviso: No se pudo establecer conexión inicial con PostgreSQL:", err.message);
    console.warn("   Verifique las credenciales en backend/.env o asegúrese de que el servicio PostgreSQL esté activo.");
  });

module.exports = pool;