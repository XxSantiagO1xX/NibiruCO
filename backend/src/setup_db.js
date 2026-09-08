const fs = require("fs");
const path = require("path");
const { Client, Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function setupDatabase() {
  const dbName = process.env.DB_NAME || "mealops";
  console.log(`🔌 Conectando a PostgreSQL para verificar base de datos '${dbName}'...`);

  // 1. Conectar a postgres para verificar/crear base de datos
  const adminClient = new Client({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: "postgres"
  });

  try {
    await adminClient.connect();
    console.log("✅ Conexión con PostgreSQL establecida.");

    const res = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (res.rows.length === 0) {
      console.log(`ℹ️ Base de datos '${dbName}' no existe. Creándola...`);
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Base de datos '${dbName}' creada.`);
    } else {
      console.log(`✅ Base de datos '${dbName}' ya existe.`);
    }
  } catch (err) {
    console.error("⚠️ Error en admin connection:", err);
  } finally {
    try {
      await adminClient.end();
    } catch(e) {}
  }

  // 2. Conectar a la base de datos mealops y aplicar schema.sql
  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: dbName
  });

  try {
    const schemaPath = path.resolve(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    console.log("📄 Aplicando schema.sql en la base de datos...");
    await pool.query(schemaSql);
    console.log("✅ Esquema SQL aplicado exitosamente (Tablas, Constraints, Índices listos).");

    // 3. Verificar si hay productos y usuarios para sembrar datos demo
    const usersCount = await pool.query("SELECT COUNT(*) FROM users");
    const prodsCount = await pool.query("SELECT COUNT(*) FROM products");

    if (parseInt(usersCount.rows[0].count, 10) === 0 || parseInt(prodsCount.rows[0].count, 10) === 0) {
      console.log("🌱 Base de datos vacía. Ejecutando seed de datos iniciales...");
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash("123456", 10);

      // Usuarios
      await pool.query(`
        INSERT INTO users (name, phone, email, password, role, allow_push)
        VALUES
          ('Administrador', '0000000000', 'admin@mealops.com', $1, 'admin', true),
          ('Chef / Cocina', '1111111111', 'cocina@mealops.com', $1, 'cocina', true),
          ('Cliente Demo', '2222222222', 'cliente@mealops.com', $1, 'cliente', true)
        ON CONFLICT (phone) DO NOTHING;
      `, [hashedPassword]);

      // Productos
      await pool.query(`
        INSERT INTO products (id, name, price, available)
        VALUES
          (1, 'Milanesa con arroz', 80.00, true),
          (2, 'Pollo en salsa verde', 75.00, true),
          (3, 'Tacos al pastor (Orden de 4)', 65.00, true),
          (4, 'Ensalada César con pollo', 70.00, true),
          (5, 'Hamburguesa clásica con papas', 90.00, true)
        ON CONFLICT (id) DO NOTHING;
      `);

      // Menú para todos los días
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      for (const d of days) {
        for (let pId = 1; pId <= 5; pId++) {
          await pool.query(`
            INSERT INTO menu (product_id, day)
            VALUES ($1, $2)
            ON CONFLICT (product_id, day) DO NOTHING;
          `, [pId, d]);
        }
      }
      console.log("✅ Seed de datos demo completado exitosamente.");
    } else {
      console.log("✅ La base de datos ya contiene datos existentes (no se sobrescribieron).");
    }

  } catch (err) {
    console.error("❌ Error configurando esquema/datos en PostgreSQL:", err);
  } finally {
    await pool.end();
  }
}

setupDatabase();
