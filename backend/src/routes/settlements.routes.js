const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");

// POST /driver/:id or /api/settlements/driver/:id
router.post("/driver/:id", auth, requirePermission("settings_manage"), async (req, res) => {
  const client = await pool.connect();
  try {
    const driverId = Number(req.params.id);
    if (!Number.isInteger(driverId)) {
      return res.status(400).json({ error: "ID de repartidor inválido", message: "ID de repartidor inválido" });
    }

    const driverRes = await client.query("SELECT id, name, role FROM users WHERE id = $1", [driverId]);
    if (!driverRes.rows.length) {
      return res.status(404).json({ error: "Repartidor no encontrado", message: "Repartidor no encontrado" });
    }

    await client.query("BEGIN");

    // 1. Obtener turno activo/abierto del chofer
    const shiftRes = await client.query(
      `SELECT * FROM driver_shifts WHERE driver_user_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [driverId]
    );

    let shift = shiftRes.rows[0];
    let shiftId = shift ? shift.id : null;

    // 2. Calcular montos pendientes del chofer
    let pendingAmount = 0;
    if (shift) {
      const cashOrdersRes = await client.query(`
        SELECT
           COALESCE(SUM(total), 0)::numeric AS gross_cash,
           COALESCE(SUM(customer_cash_change), 0)::numeric AS change_given
         FROM orders
         WHERE driver_user_id = $1
           AND shift_id = $2
           AND payment_method = 'cash'
           AND status = 'entregado'
      `, [driverId, shift.id]);

      const grossCash = Number(cashOrdersRes.rows[0].gross_cash || 0);
      const changeGiven = Number(cashOrdersRes.rows[0].change_given || 0);
      const expectedCash = Math.max(0, grossCash - changeGiven);

      const settledRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total_settled FROM driver_settlement_entries WHERE shift_id = $1`,
        [shift.id]
      );
      const currentSettled = Number(settledRes.rows[0].total_settled || 0);
      pendingAmount = Math.max(0, expectedCash - currentSettled);

      // 3. Registrar movimiento de liquidación
      if (pendingAmount > 0) {
        await client.query(
          `INSERT INTO driver_settlement_entries (shift_id, driver_user_id, amount, received_by, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [shift.id, driverId, pendingAmount, req.user.id, req.body.notes || "Liquidación total de turno"]
        );
      }

      // 4. Actualizar estado del turno
      await client.query(
        `UPDATE driver_shifts
         SET total_cash_settled = total_cash_expected,
             settlement_status = 'liquidado',
             status = 'closed',
             ended_at = COALESCE(ended_at, NOW())
         WHERE id = $1`,
        [shift.id]
      );

      // 5. Marcar pedidos como liquidados
      await client.query(
        `UPDATE orders
         SET driver_settled = TRUE
         WHERE shift_id = $1 OR (driver_user_id = $2 AND status = 'entregado' AND driver_settled = FALSE)`,
        [shift.id, driverId]
      );
    } else {
      await client.query(
        `UPDATE orders
         SET driver_settled = TRUE
         WHERE driver_user_id = $1 AND status = 'entregado' AND driver_settled = FALSE`,
        [driverId]
      );
    }

    // 6. Cambiar estado de chofer a offline
    await client.query(
      `UPDATE users SET driver_status = 'offline', driver_status_updated_at = NOW() WHERE id = $1`,
      [driverId]
    );

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("shift-settled", { driver_user_id: driverId, shift_id: shiftId, pending_amount: pendingAmount });
      io.emit("driver-status-updated", { driver_user_id: driverId, status: "offline" });
    }

    res.status(200).json({ message: "Turno liquidado correctamente", ok: true });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("SETTLE DRIVER ERROR:", error);
    res.status(500).json({ error: "Error al liquidar el turno", message: "Error al liquidar el turno" });
  } finally {
    client.release();
  }
});

module.exports = router;
