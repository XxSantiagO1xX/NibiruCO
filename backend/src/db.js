require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 8080,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "mealops"
});

pool.query("SELECT 1")
  .then(() => console.log("✅ PostgreSQL conectado correctamente"))
  .catch((err) => console.error("❌ Error de conexión:", err.message));

module.exports = pool;
