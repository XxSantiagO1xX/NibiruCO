const express = require("express");
const router = express.Router();
const path = require("path");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const fileStorage = require("../services/fileStorage");

const adminOnly = roles(["admin"]);
const staffOnly = roles(["admin", "mesero", "cocina", "repartidor"]);

/* PERFIL DE USUARIO */
router.get("/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, email, role, short_code, avatar_url, active, allow_push, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = result.rows[0];

    // Obtener permisos efectivos (rol + overrides específicos)
    const permsRes = await pool.query(`
      SELECT permission_code FROM role_permissions WHERE role = $1
      UNION
      SELECT permission_code FROM user_permissions WHERE user_id = $2 AND granted = TRUE
      EXCEPT
      SELECT permission_code FROM user_permissions WHERE user_id = $2 AND granted = FALSE
    `, [user.role, user.id]);

    user.permissions = permsRes.rows.map((r) => r.permission_code);

    res.json(user);
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
    const targetUserId = req.query.user_id && ["admin", "mesero"].includes(req.user.role)
      ? Number(req.query.user_id)
      : req.user.id;

    const result = await pool.query(
      `
        SELECT *
        FROM user_addresses
        WHERE user_id = $1
        ORDER BY is_default DESC, id DESC
      `,
      [targetUserId]
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
      is_default,
      target_user_id
    } = req.body;

    const targetUserId = target_user_id && ["admin", "mesero"].includes(req.user.role)
      ? Number(target_user_id)
      : req.user.id;

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
        [targetUserId]
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
        targetUserId,
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

    const isAdmin = req.user.role === "admin";
    const result = await pool.query(
      "DELETE FROM user_addresses WHERE id = $1 AND ($2::boolean = true OR user_id = $3) RETURNING id",
      [addressId, isAdmin, req.user.id]
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

/* ========================================================================== */
/* GESTIÓN DE PERSONAL / STAFF & ROLES (Admin)                                */
/* ========================================================================== */

// 1. Listar colaboradores del personal
router.get("/staff", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.phone,
        u.email,
        u.role,
        COALESCE(u.short_code, 'EMP-' || LPAD(u.id::text, 2, '0')) AS short_code,
        u.avatar_url,
        COALESCE(u.active, TRUE) AS active,
        COALESCE(u.driver_status, 'offline') AS driver_status,
        u.driver_status_updated_at,
        u.created_at,
        COALESCE(
          (SELECT json_agg(json_build_object('code', up.permission_code, 'granted', up.granted))
           FROM user_permissions up
           WHERE up.user_id = u.id),
          '[]'::json
        ) AS custom_permissions,
        COALESCE(
          (SELECT json_agg(rp.permission_code)
           FROM role_permissions rp
           WHERE rp.role = u.role),
          '[]'::json
        ) AS role_permissions,
        COALESCE(
          (SELECT COUNT(*)::int FROM delivery_trips dt WHERE dt.driver_user_id = u.id AND dt.status = 'completed'),
          0
        ) AS completed_trips_count,
        COALESCE(
          (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id),
          0
        ) AS orders_count
      FROM users u
      WHERE u.role IN ('admin', 'mesero', 'cocina', 'repartidor')
      ORDER BY
        CASE u.role
          WHEN 'admin' THEN 1
          WHEN 'mesero' THEN 2
          WHEN 'cocina' THEN 3
          WHEN 'repartidor' THEN 4
          ELSE 5
        END,
        u.name ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET STAFF ERROR:", err);
    res.status(500).json({ message: "Error obteniendo personal" });
  }
});

// 2. Crear nuevo colaborador (Admin)
router.post("/staff", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, phone, password, role, short_code, avatar_url, custom_permissions } = req.body;

    if (!name || !phone || !password || !role) {
      return res.status(400).json({ message: "Nombre, teléfono, contraseña y rol son obligatorios" });
    }

    const validRoles = ["admin", "mesero", "cocina", "repartidor"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    const normalizedPhone = String(phone).trim();
    const exists = await client.query("SELECT id FROM users WHERE phone = $1", [normalizedPhone]);
    if (exists.rows.length) {
      return res.status(400).json({ message: "Este teléfono ya está registrado" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const generatedShortCode = short_code ? String(short_code).trim() : null;

    await client.query("BEGIN");

    const userRes = await client.query(`
      INSERT INTO users (name, phone, password, role, short_code, avatar_url, active)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      RETURNING id, name, phone, email, role, short_code, avatar_url, active, created_at
    `, [name.trim(), normalizedPhone, hashed, role, generatedShortCode, avatar_url || null]);

    const newUser = userRes.rows[0];

    // Asignar código corto por defecto si no se especificó
    if (!newUser.short_code) {
      const defaultPrefix = { admin: 'ADM', mesero: 'MES', cocina: 'COC', repartidor: 'REP' }[role] || 'EMP';
      const autoCode = `${defaultPrefix}-${String(newUser.id).padStart(2, '0')}`;
      await client.query("UPDATE users SET short_code = $1 WHERE id = $2", [autoCode, newUser.id]);
      newUser.short_code = autoCode;
    }

    // Permisos personalizados específicos
    if (Array.isArray(custom_permissions)) {
      for (const p of custom_permissions) {
        if (p.code) {
          await client.query(`
            INSERT INTO user_permissions (user_id, permission_code, granted)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, permission_code) DO UPDATE SET granted = EXCLUDED.granted
          `, [newUser.id, p.code, p.granted !== false]);
        }
      }
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("staff-updated", { user_id: newUser.id, action: "created" });

    res.status(201).json(newUser);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("CREATE STAFF ERROR:", err);
    res.status(500).json({ message: "Error creando colaborador" });
  } finally {
    client.release();
  }
});

// 3. Modificar colaborador / cambiar rol / baja lógica (Admin)
router.patch("/staff/:id", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = Number(req.params.id);
    const { name, phone, password, role, short_code, avatar_url, active, custom_permissions } = req.body;

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "ID de usuario inválido" });
    }

    const currentUserRes = await client.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (!currentUserRes.rows.length) {
      return res.status(404).json({ message: "Colaborador no encontrado" });
    }
    const current = currentUserRes.rows[0];

    await client.query("BEGIN");

    let newHash = current.password;
    if (password && String(password).trim().length >= 4) {
      newHash = await bcrypt.hash(String(password).trim(), 10);
    }

    const updatedRole = role && ["admin", "mesero", "cocina", "repartidor", "cliente"].includes(role)
      ? role
      : current.role;

    const updatedActive = active !== undefined ? Boolean(active) : current.active;
    const updatedName = name !== undefined ? String(name).trim() : current.name;
    const updatedPhone = phone !== undefined ? String(phone).trim() : current.phone;
    const updatedShortCode = short_code !== undefined ? String(short_code).trim() : current.short_code;
    const updatedAvatar = avatar_url !== undefined ? String(avatar_url).trim() : current.avatar_url;

    const result = await client.query(`
      UPDATE users
      SET name = $1, phone = $2, password = $3, role = $4, short_code = $5, avatar_url = $6, active = $7
      WHERE id = $8
      RETURNING id, name, phone, email, role, short_code, avatar_url, active, created_at
    `, [updatedName, updatedPhone, newHash, updatedRole, updatedShortCode, updatedAvatar, updatedActive, userId]);

    const updatedUser = result.rows[0];

    // Actualizar overrides de permisos específicos si se enviaron
    if (Array.isArray(custom_permissions)) {
      await client.query("DELETE FROM user_permissions WHERE user_id = $1", [userId]);
      for (const p of custom_permissions) {
        if (p.code) {
          await client.query(`
            INSERT INTO user_permissions (user_id, permission_code, granted)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, permission_code) DO UPDATE SET granted = EXCLUDED.granted
          `, [userId, p.code, p.granted !== false]);
        }
      }
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("staff-updated", { user_id: userId, action: "updated" });

    res.json(updatedUser);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("UPDATE STAFF ERROR:", err);
    res.status(500).json({ message: "Error actualizando colaborador" });
  } finally {
    client.release();
  }
});

// 4. Baja lógica / Desactivación de colaborador (Admin)
router.delete("/staff/:id", auth, adminOnly, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "ID de usuario inválido" });
    }

    const result = await pool.query(`
      UPDATE users
      SET active = FALSE, driver_status = 'offline'
      WHERE id = $1
      RETURNING id, name, active
    `, [userId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "Colaborador no encontrado" });
    }

    const io = req.app.get("io");
    if (io) io.emit("staff-updated", { user_id: userId, action: "deactivated" });

    res.json({ ok: true, message: "Colaborador desactivado", user: result.rows[0] });
  } catch (err) {
    console.error("DEACTIVATE STAFF ERROR:", err);
    res.status(500).json({ message: "Error desactivando colaborador" });
  }
});

// 5. Búsqueda y listado de clientes para POS de ventas (Admin / Mesero)
router.get("/customers", auth, staffOnly, async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().toLowerCase();
    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.phone,
        u.email,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', ua.id,
              'label', ua.label,
              'address', ua.address,
              'details', ua.details,
              'is_default', ua.is_default
            ) ORDER BY ua.is_default DESC, ua.id DESC
          ) FROM user_addresses ua WHERE ua.user_id = u.id),
          '[]'::json
        ) AS addresses
      FROM users u
      WHERE ($1 = '' OR LOWER(u.name) LIKE '%' || $1 || '%' OR u.phone LIKE '%' || $1 || '%')
      ORDER BY u.name ASC
      LIMIT 30
    `, [query]);

    res.json(result.rows);
  } catch (err) {
    console.error("GET CUSTOMERS ERROR:", err);
    res.status(500).json({ message: "Error buscando clientes" });
  }
});

/* ========================================================================== */
/* GESTIÓN DE FOTO DE PERFIL / AVATAR                                         */
/* ========================================================================== */

router.post("/staff/:id/avatar", auth, adminOnly, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const { image_base64, avatar_base64, filename } = req.body;
    const raw = image_base64 || avatar_base64;

    if (!raw) {
      return res.status(400).json({ message: "Se requiere la imagen en base64" });
    }

    const base64Data = raw.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const originalName = filename || "avatar.jpg";

    const { url, filename: savedFilename } = await fileStorage.saveAvatar(buffer, originalName, targetUserId);

    await pool.query("UPDATE users SET avatar_url = $1 WHERE id = $2", [url, targetUserId]);

    const io = req.app.get("io");
    if (io) io.emit("staff-updated", { user_id: targetUserId, action: "avatar_updated", avatar_url: url });

    res.json({ ok: true, avatar_url: url, filename: savedFilename });
  } catch (err) {
    console.error("UPLOAD AVATAR ERROR:", err);
    res.status(400).json({ message: err.message || "Error al subir avatar" });
  }
});

router.post("/me/avatar", auth, async (req, res) => {
  try {
    const targetUserId = req.user.id;
    const { image_base64, avatar_base64, filename } = req.body;
    const raw = image_base64 || avatar_base64;

    if (!raw) {
      return res.status(400).json({ message: "Se requiere la imagen en base64" });
    }

    const base64Data = raw.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const originalName = filename || "avatar.jpg";

    const { url, filename: savedFilename } = await fileStorage.saveAvatar(buffer, originalName, targetUserId);

    await pool.query("UPDATE users SET avatar_url = $1 WHERE id = $2", [url, targetUserId]);

    const io = req.app.get("io");
    if (io) io.emit("staff-updated", { user_id: targetUserId, action: "avatar_updated", avatar_url: url });

    res.json({ ok: true, avatar_url: url, filename: savedFilename });
  } catch (err) {
    console.error("UPLOAD MY AVATAR ERROR:", err);
    res.status(400).json({ message: err.message || "Error al subir avatar" });
  }
});

router.delete("/staff/:id/avatar", auth, adminOnly, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const userRes = await pool.query("SELECT avatar_url FROM users WHERE id = $1", [targetUserId]);
    if (userRes.rows.length && userRes.rows[0].avatar_url) {
      const filename = path.basename(userRes.rows[0].avatar_url);
      await fileStorage.deleteAvatar(filename);
    }

    await pool.query("UPDATE users SET avatar_url = NULL WHERE id = $1", [targetUserId]);

    const io = req.app.get("io");
    if (io) io.emit("staff-updated", { user_id: targetUserId, action: "avatar_removed" });

    res.json({ ok: true, message: "Avatar eliminado correctamente" });
  } catch (err) {
    console.error("DELETE AVATAR ERROR:", err);
    res.status(500).json({ message: "Error eliminando avatar" });
  }
});

router.delete("/me/avatar", auth, async (req, res) => {
  try {
    const targetUserId = req.user.id;
    const userRes = await pool.query("SELECT avatar_url FROM users WHERE id = $1", [targetUserId]);
    if (userRes.rows.length && userRes.rows[0].avatar_url) {
      const filename = path.basename(userRes.rows[0].avatar_url);
      await fileStorage.deleteAvatar(filename);
    }

    await pool.query("UPDATE users SET avatar_url = NULL WHERE id = $1", [targetUserId]);

    const io = req.app.get("io");
    if (io) io.emit("staff-updated", { user_id: targetUserId, action: "avatar_removed" });

    res.json({ ok: true, message: "Avatar eliminado correctamente" });
  } catch (err) {
    console.error("DELETE MY AVATAR ERROR:", err);
    res.status(500).json({ message: "Error eliminando avatar" });
  }
});

module.exports = router;
