const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const dispatchEngine = require("../services/dispatchEngine");

const adminOnly = roles(["admin"]);

// 1. Obtener configuraciones generales (Admin)
router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM system_settings");
    const settingsMap = {};
    for (const row of result.rows) {
      settingsMap[row.key] = row.value;
    }

    const dispatchConfig = await dispatchEngine.getConfig();

    res.json({
      restaurant_info: settingsMap.restaurant_info || {
        name: "MealOps Cocina",
        phone: "555-0199",
        address: "Av. Principal 123",
        timezone: "America/Mexico_City",
        operating_hours: "08:00 - 18:00"
      },
      operational_flow: settingsMap.operational_flow || {
        kds_mode: "kitchen_only",
        direct_counter_for_ready_items: true,
        sound_alerts_enabled: true
      },
      dispatch_config: dispatchConfig
    });
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo configuración del sistema" });
  }
});

// 2. Información pública básica del restaurante
router.get("/public", async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM system_settings WHERE key = 'restaurant_info'");
    if (result.rows.length) {
      return res.json(result.rows[0].value);
    }
    res.json({
      name: "MealOps Cocina",
      timezone: "America/Mexico_City"
    });
  } catch (err) {
    console.error("GET PUBLIC SETTINGS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo configuración pública" });
  }
});

// 3. Actualizar configuraciones del sistema (Admin)
router.patch("/", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { restaurant_info, operational_flow, dispatch_config } = req.body;
    await client.query("BEGIN");

    if (restaurant_info && typeof restaurant_info === "object") {
      await client.query(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('restaurant_info', $1::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
      `, [JSON.stringify(restaurant_info)]);
    }

    if (operational_flow && typeof operational_flow === "object") {
      await client.query(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('operational_flow', $1::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
      `, [JSON.stringify(operational_flow)]);
    }

    await client.query("COMMIT");

    let updatedDispatch = null;
    if (dispatch_config && typeof dispatch_config === "object") {
      updatedDispatch = await dispatchEngine.updateConfig(dispatch_config);
    } else {
      updatedDispatch = await dispatchEngine.getConfig();
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("system-settings-updated", { restaurant_info, operational_flow });
      if (dispatch_config) io.emit("delivery-config-updated", updatedDispatch);
    }

    res.json({
      ok: true,
      message: "Configuración actualizada con éxito",
      restaurant_info,
      operational_flow,
      dispatch_config: updatedDispatch
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("UPDATE SETTINGS ERROR:", err);
    res.status(500).json({ message: "Error guardando configuración" });
  } finally {
    client.release();
  }
});

// 4. Catálogo de Permisos y Matriz de Roles (Admin)
router.get("/permissions", auth, adminOnly, async (req, res) => {
  try {
    const [permsRes, rolePermsRes] = await Promise.all([
      pool.query("SELECT * FROM permissions ORDER BY category, code"),
      pool.query("SELECT role, permission_code FROM role_permissions")
    ]);

    const permissions = permsRes.rows;
    const rolePermissions = {};
    for (const row of rolePermsRes.rows) {
      if (!rolePermissions[row.role]) rolePermissions[row.role] = [];
      rolePermissions[row.role].push(row.permission_code);
    }

    res.json({
      permissions,
      role_permissions: rolePermissions
    });
  } catch (err) {
    console.error("GET PERMISSIONS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo permisos" });
  }
});

// 5. Guardar Matriz de Permisos por Rol (Admin)
router.patch("/permissions/roles", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { role, permissions } = req.body;
    if (!role || !Array.isArray(permissions)) {
      return res.status(400).json({ message: "Rol y array de permisos requeridos" });
    }

    const validRoles = ["admin", "mesero", "cocina", "repartidor"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM role_permissions WHERE role = $1", [role]);

    for (const code of permissions) {
      await client.query(
        "INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [role, code]
      );
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("role-permissions-updated", { role, permissions });

    res.json({
      ok: true,
      message: `Permisos actualizados para el rol ${role}`,
      role,
      permissions
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("UPDATE ROLE PERMISSIONS ERROR:", err);
    res.status(500).json({ message: "Error guardando permisos del rol" });
  } finally {
    client.release();
  }
});

module.exports = router;
