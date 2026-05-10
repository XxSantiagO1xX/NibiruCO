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
/* FORGOT PASSWORD */
router.post(
  "/forgot-password",
  async (req, res) => {

    try {

      const { phone } = req.body;

      if (!phone) {

        return res.status(400).json({
          message: "Teléfono requerido"
        });
      }

      const userResult = await pool.query(
        `
        SELECT *
        FROM users
        WHERE phone = $1
        `,
        [phone]
      );

      const user = userResult.rows[0];

      if (!user) {

        return res.status(404).json({
          message: "Usuario no encontrado"
        });
      }

      /* GENERAR CÓDIGO */

      const code = Math.floor(
        100000 + Math.random() * 900000
      ).toString();

      /* EXPIRA 10 MIN */

      const expiresAt = new Date(
        Date.now() + 10 * 60 * 1000
      );

      await pool.query(
        `
        INSERT INTO password_resets
        (
          phone,
          code,
          expires_at
        )
        VALUES ($1, $2, $3)
        `,
        [
          phone,
          code,
          expiresAt
        ]
      );

      /* TEMPORAL DEV */

      res.json({
        message: "Código generado",
        code
      });

    } catch (err) {

      console.log(err);

      res.status(500).json({
        message: "Error recuperando contraseña"
      });
    }
  }
);
/* RESET PASSWORD */
router.post(
  "/reset-password",
  async (req, res) => {

    try {

      const {
        phone,
        code,
        newPassword
      } = req.body;

      if (
        !phone ||
        !code ||
        !newPassword
      ) {

        return res.status(400).json({
          message: "Faltan datos"
        });
      }

      const resetResult = await pool.query(
        `
        SELECT *
        FROM password_resets
        WHERE phone = $1
        AND code = $2
        ORDER BY id DESC
        LIMIT 1
        `,
        [phone, code]
      );

      const reset = resetResult.rows[0];

      if (!reset) {

        return res.status(400).json({
          message: "Código inválido"
        });
      }

      const now = new Date();

      if (now > reset.expires_at) {

        return res.status(400).json({
          message: "Código expirado"
        });
      }

      const hashedPassword =
        await bcrypt.hash(newPassword, 10);

      await pool.query(
        `
        UPDATE users
        SET password = $1
        WHERE phone = $2
        `,
        [
          hashedPassword,
          phone
        ]
      );

      res.json({
        message: "Contraseña actualizada"
      });

    } catch (err) {

      console.log(err);

      res.status(500).json({
        message: "Error reseteando contraseña"
      });
    }
  }
);
module.exports = router;