const express = require("express");
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

    // evitar duplicados por teléfono
    const exists = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phone]
    );

    if (exists.rows.length) {
      return res.status(400).json({ message: "Teléfono ya registrado" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, phone, email, password, allow_push)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, phone`,
      [name, phone, email || null, hashed, allowPush ?? true]
    );

    res.json({ ok: true, user: result.rows[0] });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Error en registro backend" });
  }
});

// LOGIN POR TELÉFONO
router.post("/login-phone", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "Usuario no existe" });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Error login" });
  }
});

module.exports = router;