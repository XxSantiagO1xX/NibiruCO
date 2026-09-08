const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

/* PERFIL DE USUARIO */
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
    console.error("USER PROFILE ERROR:", err);
    res.status(500).json({ message: "Error obteniendo perfil" });
  }
});

/* GUARDAR TOKEN DE NOTIFICACIÓN */
router.post("/push-token", auth, async (req, res) => {
  try {
    const { tokenExpo } = req.body;

    if (!tokenExpo) {
      return res.status(400).json({ message: "Falta tokenExpo" });
    }

    await pool.query(
      "UPDATE users SET expo_push_token = $1 WHERE id = $2",
      [tokenExpo, req.user.id]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("PUSH TOKEN ERROR:", err);
    res.status(500).json({ message: "Error guardando token" });
  }
});

/* DIRECCIONES */
router.get("/addresses", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT *
        FROM user_addresses
        WHERE user_id = $1
        ORDER BY is_default DESC, id DESC
      `,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET ADDRESSES ERROR:", err);
    res.status(500).json({
      message: "Error obteniendo direcciones"
    });
  }
});

router.post("/addresses", auth, async (req, res) => {
  try {
    const {
      label,
      address,
      details,
      is_default
    } = req.body;

    if (!address) {
      return res.status(400).json({
        message: "Dirección requerida"
      });
    }

    if (is_default) {
      await pool.query(
        `
          UPDATE user_addresses
          SET is_default = false
          WHERE user_id = $1
        `,
        [req.user.id]
      );
    }

    const result = await pool.query(
      `
        INSERT INTO user_addresses
        (
          user_id,
          label,
          address,
          details,
          is_default
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        req.user.id,
        label || "Casa",
        address.trim(),
        details ? details.trim() : null,
        is_default || false
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("CREATE ADDRESS ERROR:", err);
    res.status(500).json({
      message: "Error creando dirección"
    });
  }
});

router.delete("/addresses/:id", auth, async (req, res) => {
  try {
    const addressId = Number(req.params.id);
    if (!Number.isInteger(addressId)) {
      return res.status(400).json({ message: "ID de dirección inválido" });
    }

    const result = await pool.query(
      "DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id",
      [addressId, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Dirección no encontrada" });
    }

    res.json({ ok: true, message: "Dirección eliminada" });
  } catch (err) {
    console.error("DELETE ADDRESS ERROR:", err);
    res.status(500).json({ message: "Error eliminando dirección" });
  }
});

router.patch("/addresses/:id/default", auth, async (req, res) => {
  try {
    const addressId = Number(req.params.id);
    if (!Number.isInteger(addressId)) {
      return res.status(400).json({ message: "ID de dirección inválido" });
    }

    await pool.query(
      "UPDATE user_addresses SET is_default = false WHERE user_id = $1",
      [req.user.id]
    );

    const result = await pool.query(
      "UPDATE user_addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *",
      [addressId, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Dirección no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("SET DEFAULT ADDRESS ERROR:", err);
    res.status(500).json({ message: "Error actualizando dirección principal" });
  }
});

module.exports = router;