const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTRO POR TELÉFONO (sin SMS)
router.post("/register-phone", async (req, res) => {
  try {
    const { name, phone, password, email, allowPush } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: "Faltan datos" });
    }

    const normalizedPhone = String(phone).trim();
    const normalizedName = String(name).trim();
    if (!normalizedPhone || !normalizedName) {
      return res.status(400).json({ message: "Nombre y teléfono son requeridos" });
    }

    const exists = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [normalizedPhone]
    );

    if (exists.rows.length) {
      return res.status(400).json({ message: "Teléfono ya registrado" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, phone, email, password, allow_push)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, phone`,
      [normalizedName, normalizedPhone, email ? String(email).trim() : null, hashed, allowPush ?? true]
    );

    res.status(201).json({ ok: true, user: result.rows[0] });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Error en registro backend" });
  }
});

// LOGIN POR TELÉFONO
router.post("/login-phone", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();
    const password = req.body.password;

    if (!phone || !password) {
      return res.status(400).json({ message: "Teléfono y contraseña son requeridos" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    if (user.active === false) {
      return res.status(403).json({ message: "Esta cuenta está desactivada. Contacta al administrador." });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Error login" });
  }
});

// RECUPERACIÓN DE CONTRASEÑA
router.post("/forgot-password", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();
    if (!phone) {
      return res.status(400).json({ message: "Teléfono requerido" });
    }

    const userResult = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phone]
    );

    // Respuesta deliberadamente genérica para no revelar si un teléfono está registrado.
    if (!userResult.rows.length) {
      return res.json({
        message: "Si la cuenta existe, se generó un código de recuperación"
      });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Solo el código más reciente debe ser válido.
    await pool.query("DELETE FROM password_resets WHERE phone = $1", [phone]);
    await pool.query(
      `INSERT INTO password_resets (phone, code, expires_at)
       VALUES ($1, $2, $3)`,
      [phone, code, expiresAt]
    );

    const response = {
      message: "Si la cuenta existe, se generó un código de recuperación"
    };

    // En desarrollo se conserva el código en la respuesta para permitir probar el flujo sin SMS.
    if (process.env.NODE_ENV !== "production") {
      response.code = code;
    }

    res.json(response);
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ message: "Error recuperando contraseña" });
  }
});

router.post("/reset-password", async (req, res) => {
  const client = await pool.connect();

  try {
    const phone = String(req.body.phone || "").trim();
    const code = String(req.body.code || "").trim();
    const newPassword = req.body.newPassword;

    if (!phone || !code || !newPassword) {
      return res.status(400).json({ message: "Faltan datos" });
    }

    await client.query("BEGIN");

    const resetResult = await client.query(
      `SELECT id, expires_at
       FROM password_resets
       WHERE phone = $1
         AND code = $2
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [phone, code]
    );

    if (!resetResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Código inválido o expirado" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await client.query(
      `UPDATE users
       SET password = $1
       WHERE phone = $2
       RETURNING id`,
      [hashedPassword, phone]
    );

    if (!updated.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Código inválido o expirado" });
    }

    // Invalida el código usado y cualquier otro código previo de la cuenta.
    await client.query("DELETE FROM password_resets WHERE phone = $1", [phone]);
    await client.query("COMMIT");

    res.json({ message: "Contraseña actualizada" });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ message: "Error reseteando contraseña" });
  } finally {
    client.release();
  }
});

module.exports = router;
