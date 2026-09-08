const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const pool = require("./db");
const bcrypt = require("bcryptjs");

async function seed() {
  const client = await pool.connect();

  try {
    console.log("🌱 Iniciando inserción de datos iniciales (Seed)...");

    await client.query("BEGIN");

    // 1. Usuarios demo
    const hashedPassword = await bcrypt.hash("123456", 10);

    const usersQuery = `
      INSERT INTO users (name, phone, email, password, role, allow_push)
      VALUES
        ('Administrador', '0000000000', 'admin@mealops.com', $1, 'admin', true),
        ('Cocina', '1111111111', 'cocina@mealops.com', $1, 'cocina', true),
        ('Cliente Demo', '2222222222', 'cliente@mealops.com', $1, 'cliente', true)
      ON CONFLICT (phone) DO UPDATE
      SET password = EXCLUDED.password, role = EXCLUDED.role;
    `;
    await client.query(usersQuery, [hashedPassword]);
    console.log("✅ Usuarios creados/actualizados (Contraseña: 123456)");

    // 2. Productos demo
    const productsQuery = `
      INSERT INTO products (id, name, price, available)
      VALUES
        (1, 'Milanesa con arroz', 80.00, true),
        (2, 'Pollo en salsa', 75.00, true),
        (3, 'Tacos al pastor (Orden de 4)', 65.00, true),
        (4, 'Ensalada César con pollo', 70.00, true),
        (5, 'Hamburguesa clásica con papas', 90.00, true)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, price = EXCLUDED.price, available = EXCLUDED.available;
    `;
    await client.query(productsQuery);
    console.log("✅ Catálogo de productos creado");

    // 3. Menú semanal para todos los días
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (const day of days) {
      await client.query(
        `INSERT INTO menu (product_id, day)
         VALUES (1, $1), (2, $1), (3, $1), (4, $1), (5, $1)
         ON CONFLICT (product_id, day) DO NOTHING;`,
        [day]
      );
    }
    console.log("✅ Menú semanal configurado para todos los días");

    await client.query("COMMIT");
    console.log("🎉 Seed completado exitosamente.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error ejecutando seed:", err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
