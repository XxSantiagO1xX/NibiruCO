const pool = require("../db");

const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autorizado", message: "No autorizado" });
    }

    const role = String(req.user.role || "").toLowerCase();
    if (role === "admin" || req.user.role === "ADMIN") {
      return next();
    }

    if (Array.isArray(req.user.permissions) && req.user.permissions.includes(permission)) {
      return next();
    }

    try {
      const permsRes = await pool.query(`
        SELECT permission_code FROM role_permissions WHERE LOWER(role) = LOWER($1)
        UNION
        SELECT permission_code FROM user_permissions WHERE user_id = $2 AND granted = TRUE
        EXCEPT
        SELECT permission_code FROM user_permissions WHERE user_id = $2 AND granted = FALSE
      `, [req.user.role, req.user.id]);

      const perms = permsRes.rows.map((r) => r.permission_code);
      req.user.permissions = perms;

      if (perms.includes(permission)) {
        return next();
      }

      return res.status(403).json({
        error: "Permiso insuficiente para esta acción.",
        message: "Permiso insuficiente para esta acción."
      });
    } catch (err) {
      console.error("RBAC ERROR:", err);
      return res.status(403).json({
        error: "Acceso denegado. Sin permisos.",
        message: "Acceso denegado. Sin permisos."
      });
    }
  };
};

module.exports = { requirePermission };
