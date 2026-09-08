const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

/* 1. PERFIL DEL USUARIO AUTENTICADO */
router.get("/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, email, role, allow_push, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({ message: "Error obteniendo perfil de usuario" });
  }
});

/* 2. GUARDAR TOKEN DE NOTIFICACIONES PUSH */
router.post("/push-token", auth, async (req, res) => {
  try {
    const { tokenExpo } = req.body;

    if (!tokenExpo) {
      return res.status(400).json({ message: "Token de notificación es requerido (tokenExpo)" });
    }

    await pool.query(
      "UPDATE users SET expo_push_token = $1 WHERE id = $2",
      [tokenExpo, req.user.id]
    );

    res.json({ ok: true, message: "Token de notificación guardado" });

  } catch (err) {
    console.error("PUSH TOKEN ERROR:", err);
    res.status(500).json({ message: "Error guardando token de notificación" });
  }
});

/* 3. OBTENER DIRECCIONES DEL USUARIO */
router.get("/addresses", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, id DESC`,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("GET ADDRESSES ERROR:", err);
    res.status(500).json({ message: "Error obteniendo direcciones" });
  }
});

/* 4. CREAR DIRECCIÓN */
router.post("/addresses", auth, async (req, res) => {
  try {
    const { label, address, details, is_default } = req.body;

    if (!address || !address.trim()) {
      return res.status(400).json({ message: "La dirección es requerida" });
    }

    // Si la nueva dirección es predeterminada, quitar predeterminado a las demás
    if (is_default) {
      await pool.query(
        "UPDATE user_addresses SET is_default = false WHERE user_id = $1",
        [req.user.id]
      );
    }

    const result = await pool.query(
      `INSERT INTO user_addresses (user_id, label, address, details, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.id,
        label ? label.trim() : "Principal",
        address.trim(),
        details ? details.trim() : null,
        Boolean(is_default)
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("CREATE ADDRESS ERROR:", err);
    res.status(500).json({ message: "Error guardando dirección" });
  }
});

module.exports = router;