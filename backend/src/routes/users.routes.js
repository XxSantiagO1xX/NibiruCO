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
    console.log(err);
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
label,
address,
details,
is_default || false
]
);
res.json(result.rows[0]);
} catch (err) {
console.log(err);
res.status(500).json({
message: "Error creando dirección"
});
}
});

module.exports = router;