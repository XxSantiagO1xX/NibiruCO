const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Generador de Token JWT centralizado
function generateToken(user) {
  const secret = process.env.JWT_SECRET || "super_secret_jwt_key_mealops_2026";
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    secret,
    { expiresIn: "7d" }
  );
}

// 1. REGISTRO POR TELÉFONO
router.post("/register-phone", async (req, res) => {
  try {
    const { name, phone, password, email, allowPush, role } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: "Nombre, teléfono y contraseña son requeridos" });
    }

    const trimmedPhone = phone.toString().trim();

    // Evitar duplicados por teléfono
    const exists = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [trimmedPhone]
    );

    if (exists.rows.length) {
      return res.status(400).json({ message: "El teléfono ya se encuentra registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role && ["admin", "cocina", "cliente"].includes(role) ? role : "cliente";

    const result = await pool.query(
      `INSERT INTO users (name, phone, email, password, role, allow_push)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, phone, email, role`,
      [name.trim(), trimmedPhone, email ? email.trim() : null, hashedPassword, userRole, allowPush ?? true]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Error interno en el registro" });
  }
});

// 2. LOGIN POR TELÉFONO
router.post("/login-phone", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Teléfono y contraseña son requeridos" });
    }

    const trimmedPhone = phone.toString().trim();

    const result = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [trimmedPhone]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    const token = generateToken(user);

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Error interno en login" });
  }
});

// 3. ALIAS COMPATIBLE: LOGIN GENERAL (Teléfono o Email)
router.post("/login", async (req, res) => {
  try {
    const { phone, email, password } = req.body;
    const identifier = phone || email;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Identificador (teléfono o correo) y contraseña requeridos" });
    }

    const trimmedIdentifier = identifier.toString().trim();

    const result = await pool.query(
      "SELECT * FROM users WHERE phone = $1 OR email = $1",
      [trimmedIdentifier]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    const token = generateToken(user);

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Error interno en login" });
  }
});

// 4. ALIAS COMPATIBLE: REGISTRO GENERAL
router.post("/register", async (req, res) => {
  try {
    const { name, phone, email, password, allowPush, role } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Teléfono y contraseña son requeridos" });
    }

    const userName = name || email || `Usuario-${phone.slice(-4)}`;
    const trimmedPhone = phone.toString().trim();

    const exists = await pool.query(
      "SELECT id FROM users WHERE phone = $1 OR (email IS NOT NULL AND email = $2)",
      [trimmedPhone, email || ""]
    );

    if (exists.rows.length) {
      return res.status(400).json({ message: "El usuario ya se encuentra registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role && ["admin", "cocina", "cliente"].includes(role) ? role : "cliente";

    const result = await pool.query(
      `INSERT INTO users (name, phone, email, password, role, allow_push)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, phone, email, role`,
      [userName.trim(), trimmedPhone, email ? email.trim() : null, hashedPassword, userRole, allowPush ?? true]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Error interno en registro" });
  }
});

// 5. SOLICITUD DE RECUPERACIÓN DE CONTRASEÑA
router.post("/forgot-password", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Teléfono requerido" });
    }

    const trimmedPhone = phone.toString().trim();

    const userResult = await pool.query(
      "SELECT id, phone FROM users WHERE phone = $1",
      [trimmedPhone]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Generar código numérico de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Limpiar códigos previos pendientes para este teléfono
    await pool.query(
      "DELETE FROM password_resets WHERE phone = $1",
      [trimmedPhone]
    );

    await pool.query(
      `INSERT INTO password_resets (phone, code, expires_at)
       VALUES ($1, $2, $3)`,
      [trimmedPhone, code, expiresAt]
    );

    const responsePayload = {
      ok: true,
      message: "Código de recuperación generado exitosamente"
    };

    // En desarrollo exponemos el código para pruebas; en producción se enviaría por SMS/WhatsApp
    if (process.env.NODE_ENV !== "production") {
      responsePayload.code = code;
    }

    res.json(responsePayload);

  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ message: "Error al procesar recuperación de contraseña" });
  }
});

// 6. RESETEO DE CONTRASEÑA
router.post("/reset-password", async (req, res) => {
  try {
    const { phone, code, newPassword } = req.body;

    if (!phone || !code || !newPassword) {
      return res.status(400).json({ message: "Teléfono, código y nueva contraseña requeridos" });
    }

    const trimmedPhone = phone.toString().trim();
    const trimmedCode = code.toString().trim();

    const resetResult = await pool.query(
      `SELECT * FROM password_resets
       WHERE phone = $1 AND code = $2
       ORDER BY id DESC
       LIMIT 1`,
      [trimmedPhone, trimmedCode]
    );

    const reset = resetResult.rows[0];

    if (!reset) {
      return res.status(400).json({ message: "Código inválido" });
    }

    const now = new Date();
    if (now > new Date(reset.expires_at)) {
      await pool.query("DELETE FROM password_resets WHERE id = $1", [reset.id]);
      return res.status(400).json({ message: "El código ha expirado" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password = $1 WHERE phone = $2",
      [hashedPassword, trimmedPhone]
    );

    // Eliminar el código tras su uso exitoso
    await pool.query("DELETE FROM password_resets WHERE phone = $1", [trimmedPhone]);

    res.json({
      ok: true,
      message: "Contraseña actualizada exitosamente"
    });

  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ message: "Error al resetear contraseña" });
  }
});

module.exports = router;