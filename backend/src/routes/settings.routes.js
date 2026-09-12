const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const { requirePermission } = require("../middleware/rbac");
const dispatchEngine = require("../services/dispatchEngine");

const adminOnly = roles(["admin"]);

// 1. Obtener configuraciones generales (Admin / Settings Manage)
router.get("/", auth, requirePermission("settings_manage"), async (req, res) => {
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

// 3. Actualizar configuraciones del sistema (Admin / Settings Manage)
router.patch("/", auth, requirePermission("settings_manage"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { restaurant, timezone, operational_flow, dispatch_config } = req.body;

    await client.query("BEGIN");

    if (restaurant || timezone) {
      const currentRes = await client.query("SELECT value FROM system_settings WHERE key = 'restaurant_info'");
      const current = (currentRes.rows[0] && currentRes.rows[0].value) || {};
      const updated = {
        ...current,
        ...(restaurant || {}),
        timezone: timezone || current.timezone || "America/Mexico_City"
      };

      await client.query(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('restaurant_info', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [JSON.stringify(updated)]);
    }

    if (operational_flow) {
      const currentRes = await client.query("SELECT value FROM system_settings WHERE key = 'operational_flow'");
      const current = (currentRes.rows[0] && currentRes.rows[0].value) || {};
      const updated = {
        ...current,
        ...operational_flow
      };

      await client.query(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('operational_flow', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [JSON.stringify(updated)]);
    }

    let updatedDispatch = null;
    if (dispatch_config) {
      updatedDispatch = await dispatchEngine.updateConfig(dispatch_config);
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("settings-updated", { restaurant_info: restaurant, operational_flow, dispatch_config });

    res.json({
      ok: true,
      message: "Configuración actualizada con éxito",
      restaurant_info: restaurant,
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

// 4. Catálogo de Permisos y Matriz de Roles (Admin / Settings Manage)
router.get("/permissions", auth, requirePermission("settings_manage"), async (req, res) => {
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

// 5. Guardar Matriz de Permisos por Rol individual (Admin / Settings Manage)
router.patch("/permissions/roles", auth, requirePermission("settings_manage"), async (req, res) => {
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

    const permsToSave = [...permissions];
    if (role === "admin") {
      if (!permsToSave.includes("settings_manage")) permsToSave.push("settings_manage");
      if (!permsToSave.includes("staff_manage")) permsToSave.push("staff_manage");
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM role_permissions WHERE role = $1", [role]);

    for (const code of permsToSave) {
      await client.query(
        "INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [role, code]
      );
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("role-permissions-updated", { role, permissions: permsToSave });

    res.json({
      ok: true,
      message: `Permisos actualizados para el rol ${role}`,
      role,
      permissions: permsToSave
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("UPDATE ROLE PERMISSIONS ERROR:", err);
    res.status(500).json({ message: "Error guardando permisos del rol" });
  } finally {
    client.release();
  }
});

// 6. Guardar Matriz Completa de Permisos (Admin / Settings Manage)
router.put("/permissions/matrix", auth, requirePermission("settings_manage"), async (req, res) => {
  const client = await pool.connect();
  try {
    const matrix = req.body || {};
    const validRoles = ["admin", "mesero", "cocina", "repartidor"];

    await client.query("BEGIN");

    for (const role of validRoles) {
      let perms = Array.isArray(matrix[role]) ? [...matrix[role]] : [];

      // Protección de seguridad anti-lockout: Admin siempre conserva administración y staff
      if (role === "admin") {
        if (!perms.includes("settings_manage")) perms.push("settings_manage");
        if (!perms.includes("staff_manage")) perms.push("staff_manage");
      }

      await client.query("DELETE FROM role_permissions WHERE role = $1", [role]);

      for (const code of perms) {
        await client.query(
          "INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [role, code]
        );
      }
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("role-permissions-updated", { matrix });

    res.json({
      ok: true,
      message: "Matriz de permisos guardada exitosamente",
      matrix
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("UPDATE RBAC MATRIX ERROR:", err);
    res.status(500).json({ message: "Error guardando matriz de permisos" });
  } finally {
    client.release();
  }
});

module.exports = router;
