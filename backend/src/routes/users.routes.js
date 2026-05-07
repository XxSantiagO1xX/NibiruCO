const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

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

module.exports = router;