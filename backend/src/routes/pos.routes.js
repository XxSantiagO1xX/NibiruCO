const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

const staffOnly = roles(["admin", "mesero", "cocina"]);
const cashierRoles = roles(["admin", "mesero"]);

/**
 * Normaliza nombres de métodos de pago
 */
function normalizePaymentMethod(method) {
  if (!method) return "Efectivo";
  const str = String(method).trim().toLowerCase();
  if (str.includes("efectivo") || str.includes("cash")) return "Efectivo";
  if (str.includes("tarjeta") || str.includes("card") || str.includes("terminal")) return "Tarjeta";
  if (str.includes("transfer") || str.includes("spei")) return "Transferencia";
  if (str.includes("app")) return "Pago en App";
  return method.trim();
}

/* ========================================================================== */
/* 1. PAGOS MÚLTIPLES Y CUENTAS DIVIDIDAS (order_payments)                    */
/* ========================================================================== */

/**
 * POST /payments
 * Registra un pago parcial o total a una cuenta
 */
router.post("/payments", auth, cashierRoles, async (req, res) => {
  const client = await pool.connect();
  try {
    const { order_id, payment_method, amount, tip_amount } = req.body;

    const orderIdNum = Number(order_id);
    if (!Number.isInteger(orderIdNum)) {
      return res.status(400).json({ message: "ID de orden inválido o requerido" });
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ message: "El monto a pagar debe ser un número mayor a 0" });
    }

    const numTip = Number(tip_amount || 0);
    if (!Number.isFinite(numTip) || numTip < 0) {
      return res.status(400).json({ message: "La propina no puede ser negativa" });
    }

    const cleanMethod = normalizePaymentMethod(payment_method);

    await client.query("BEGIN");

    // Verificar orden
    const orderRes = await client.query(
      `SELECT id, total, payment_status, folio FROM orders WHERE id = $1 FOR UPDATE`,
      [orderIdNum]
    );

    if (!orderRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Orden no encontrada" });
    }

    const order = orderRes.rows[0];
    const orderTotal = Number(order.total);

    // Registrar pago
    const insertPaymentRes = await client.query(
      `INSERT INTO order_payments (order_id, payment_method, amount, tip_amount, registered_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orderIdNum, cleanMethod, numAmount, numTip, req.user?.id || null]
    );
    const paymentRecord = insertPaymentRes.rows[0];

    // Obtener total pagado acumulado
    const sumRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_paid,
              COALESCE(SUM(tip_amount), 0)::numeric(10,2) AS total_tips
       FROM order_payments
       WHERE order_id = $1`,
      [orderIdNum]
    );

    const totalPaid = Number(sumRes.rows[0].total_paid);
    const totalTips = Number(sumRes.rows[0].total_tips);
    const pendingAmount = Math.max(0, Number((orderTotal - totalPaid).toFixed(2)));
    const isFullyPaid = totalPaid >= orderTotal;

    // Si está completamente pagada o más, actualizar estado en tabla orders
    if (isFullyPaid) {
      await client.query(
        `UPDATE orders
         SET payment_status = 'paid',
             paid_at = COALESCE(paid_at, NOW()),
             payment_method = COALESCE(payment_method, $1),
             payment_collected_by = COALESCE(payment_collected_by, 'business'),
             payment_collector_user_id = COALESCE(payment_collector_user_id, $2),
             payment_collected_at = COALESCE(payment_collected_at, NOW())
         WHERE id = $3`,
        [cleanMethod.toLowerCase(), req.user?.id || null, orderIdNum]
      );
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("order-payment-added", {
        order_id: orderIdNum,
        payment: paymentRecord,
        summary: {
          order_id: orderIdNum,
          total: orderTotal,
          total_paid: totalPaid,
          total_tips: totalTips,
          pending_amount: pendingAmount,
          is_fully_paid: isFullyPaid
        }
      });
      io.emit("order-updated", { id: orderIdNum });
    }

    res.status(201).json({
      ok: true,
      message: isFullyPaid ? "Orden liquidada en su totalidad" : "Abono registrado correctamente",
      payment: paymentRecord,
      summary: {
        order_id: orderIdNum,
        total: orderTotal,
        total_paid: totalPaid,
        total_tips: totalTips,
        pending_amount: pendingAmount,
        is_fully_paid: isFullyPaid
      }
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("POST /pos/payments error:", err);
    res.status(500).json({ message: "Error registrando pago de orden" });
  } finally {
    client.release();
  }
});

/**
 * GET /payments/:orderId
 * Obtiene el desglose de pagos de una orden
 */
router.get("/payments/:orderId", auth, staffOnly, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ message: "ID de orden inválido" });
    }

    const orderRes = await pool.query(
      `SELECT id, total, payment_status, payment_method, folio, customer_name FROM orders WHERE id = $1`,
      [orderId]
    );

    if (!orderRes.rows.length) {
      return res.status(404).json({ message: "Orden no encontrada" });
    }

    const order = orderRes.rows[0];
    const orderTotal = Number(order.total);

    const paymentsRes = await pool.query(
      `SELECT op.*, u.name AS registered_by_name
       FROM order_payments op
       LEFT JOIN users u ON u.id = op.registered_by
       WHERE op.order_id = $1
       ORDER BY op.created_at ASC`,
      [orderId]
    );

    const totalPaid = paymentsRes.rows.reduce((acc, p) => acc + Number(p.amount), 0);
    const totalTips = paymentsRes.rows.reduce((acc, p) => acc + Number(p.tip_amount || 0), 0);
    const pendingAmount = Math.max(0, Number((orderTotal - totalPaid).toFixed(2)));

    res.json({
      order_id: orderId,
      folio: order.folio,
      total: orderTotal,
      total_paid: totalPaid,
      total_tips: totalTips,
      pending_amount: pendingAmount,
      is_fully_paid: totalPaid >= orderTotal,
      payment_status: order.payment_status,
      payments: paymentsRes.rows
    });
  } catch (err) {
    console.error("GET /pos/payments/:orderId error:", err);
    res.status(500).json({ message: "Error consultando pagos de la orden" });
  }
});

/* ========================================================================== */
/* 2. CORTES DE CAJA (cash_register_shifts)                                   */
/* ========================================================================== */

/**
 * POST /shift/open
 * Apertura de turno con fondo inicial de caja
 */
router.post("/shift/open", auth, cashierRoles, async (req, res) => {
  try {
    const rawBalance = req.body.opening_balance !== undefined ? req.body.opening_balance : 0;
    const openingBalance = Number(rawBalance);
    const notes = req.body.notes ? String(req.body.notes).trim() : null;

    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      return res.status(400).json({ message: "El fondo inicial de caja debe ser un número mayor o igual a 0" });
    }

    // Verificar si ya hay un turno abierto
    const existingRes = await pool.query(
      `SELECT * FROM cash_register_shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1`
    );

    if (existingRes.rows.length) {
      return res.status(400).json({
        message: "Ya existe un turno de caja abierto actualmente",
        shift: existingRes.rows[0]
      });
    }

    const insertRes = await pool.query(
      `INSERT INTO cash_register_shifts (opened_by, opening_balance, status, notes, opening_time)
       VALUES ($1, $2, 'OPEN', $3, NOW())
       RETURNING *`,
      [req.user.id, openingBalance, notes]
    );

    const newShift = insertRes.rows[0];

    const io = req.app.get("io");
    if (io) io.emit("pos-shift-opened", { shift: newShift });

    res.status(201).json({
      ok: true,
      message: "Turno de caja abierto exitosamente",
      shift: newShift
    });
  } catch (err) {
    console.error("POST /pos/shift/open error:", err);
    res.status(500).json({ message: "Error abriendo turno de caja" });
  }
});

/**
 * GET /shift/current
 * Obtiene el turno activo y métricas financieras en tiempo real
 */
router.get("/shift/current", auth, cashierRoles, async (req, res) => {
  try {
    const shiftRes = await pool.query(
      `SELECT crs.*, u.name AS opened_by_name
       FROM cash_register_shifts crs
       LEFT JOIN users u ON u.id = crs.opened_by
       WHERE crs.status = 'OPEN'
       ORDER BY crs.id DESC
       LIMIT 1`
    );

    if (!shiftRes.rows.length) {
      return res.json({
        ok: true,
        shift: null,
        message: "No hay ningún turno de caja abierto actualmente"
      });
    }

    const shift = shiftRes.rows[0];
    const openingTime = shift.opening_time;

    // Calcular métricas acumuladas durante el turno
    const [cashRes, cardRes, transferRes, settlementsRes] = await Promise.all([
      // Pagos en efectivo
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
         FROM order_payments
         WHERE (LOWER(payment_method) LIKE '%efectivo%' OR LOWER(payment_method) LIKE '%cash%')
           AND created_at >= $1`,
        [openingTime]
      ),
      // Pagos en tarjeta
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
         FROM order_payments
         WHERE (LOWER(payment_method) LIKE '%tarjeta%' OR LOWER(payment_method) LIKE '%card%')
           AND created_at >= $1`,
        [openingTime]
      ),
      // Pagos en transferencia
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
         FROM order_payments
         WHERE (LOWER(payment_method) LIKE '%transfer%' OR LOWER(payment_method) LIKE '%spei%')
           AND created_at >= $1`,
        [openingTime]
      ),
      // Liquidaciones / Egresos en efectivo durante el turno
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
         FROM driver_settlement_entries
         WHERE created_at >= $1`,
        [openingTime]
      )
    ]);

    const cashPayments = Number(cashRes.rows[0].total);
    const cardPayments = Number(cardRes.rows[0].total);
    const transferPayments = Number(transferRes.rows[0].total);
    const settlementsPaid = Number(settlementsRes.rows[0].total);
    const openingBalance = Number(shift.opening_balance);

    const expectedCash = Number((openingBalance + cashPayments - settlementsPaid).toFixed(2));

    res.json({
      ok: true,
      shift,
      live_metrics: {
        opening_balance: openingBalance,
        cash_payments: cashPayments,
        card_payments: cardPayments,
        transfer_payments: transferPayments,
        settlements_paid: settlementsPaid,
        expected_cash: expectedCash
      }
    });
  } catch (err) {
    console.error("GET /pos/shift/current error:", err);
    res.status(500).json({ message: "Error obteniendo turno actual de caja" });
  }
});

/**
 * POST /shift/close
 * Cierre de turno y cálculo ciego de arqueo de caja
 */
router.post("/shift/close", auth, cashierRoles, async (req, res) => {
  const client = await pool.connect();
  try {
    const { reported_cash, notes, shift_id } = req.body;

    const reportedCashNum = Number(reported_cash);
    if (!Number.isFinite(reportedCashNum) || reportedCashNum < 0) {
      return res.status(400).json({ message: "El efectivo reportado (reported_cash) es obligatorio y debe ser >= 0" });
    }

    await client.query("BEGIN");

    // Buscar turno a cerrar
    let shiftQuery = `SELECT * FROM cash_register_shifts WHERE status = 'OPEN'`;
    const params = [];
    if (shift_id) {
      params.push(Number(shift_id));
      shiftQuery += ` AND id = $1`;
    }
    shiftQuery += ` ORDER BY id DESC LIMIT 1 FOR UPDATE`;

    const shiftRes = await client.query(shiftQuery, params);
    if (!shiftRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No hay ningún turno de caja abierto para cerrar" });
    }

    const shift = shiftRes.rows[0];
    const openingTime = shift.opening_time;
    const openingBalance = Number(shift.opening_balance);

    // Calcular cobros en efectivo durante el turno
    const cashRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
       FROM order_payments
       WHERE (LOWER(payment_method) LIKE '%efectivo%' OR LOWER(payment_method) LIKE '%cash%')
         AND created_at >= $1`,
      [openingTime]
    );
    const cashPayments = Number(cashRes.rows[0].total);

    // Calcular otros métodos para el reporte de cierre
    const cardRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
       FROM order_payments
       WHERE (LOWER(payment_method) LIKE '%tarjeta%' OR LOWER(payment_method) LIKE '%card%')
         AND created_at >= $1`,
      [openingTime]
    );
    const cardPayments = Number(cardRes.rows[0].total);

    const transferRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
       FROM order_payments
       WHERE (LOWER(payment_method) LIKE '%transfer%' OR LOWER(payment_method) LIKE '%spei%')
         AND created_at >= $1`,
      [openingTime]
    );
    const transferPayments = Number(transferRes.rows[0].total);

    // Liquidaciones pagadas durante el turno
    const settlementsRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total
       FROM driver_settlement_entries
       WHERE created_at >= $1`,
      [openingTime]
    );
    const settlementsPaid = Number(settlementsRes.rows[0].total);

    // expected_cash = opening_balance + pagos_efectivo - liquidaciones
    const expectedCash = Number((openingBalance + cashPayments - settlementsPaid).toFixed(2));
    const difference = Number((reportedCashNum - expectedCash).toFixed(2));

    const closingNotes = notes ? String(notes).trim() : null;

    // Actualizar turno a CLOSED
    const updateRes = await client.query(
      `UPDATE cash_register_shifts
       SET status = 'CLOSED',
           closing_time = NOW(),
           reported_cash = $1,
           expected_cash = $2,
           difference = $3,
           notes = CASE WHEN $4::text IS NOT NULL THEN COALESCE(notes || ' | ', '') || $4::text ELSE notes END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [reportedCashNum, expectedCash, difference, closingNotes, shift.id]
    );

    const closedShift = updateRes.rows[0];

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("pos-shift-closed", {
        shift: closedShift,
        breakdown: {
          opening_balance: openingBalance,
          cash_payments: cashPayments,
          card_payments: cardPayments,
          transfer_payments: transferPayments,
          settlements_paid: settlementsPaid,
          expected_cash: expectedCash,
          reported_cash: reportedCashNum,
          difference: difference
        }
      });
    }

    res.json({
      ok: true,
      message: "Turno de caja cerrado exitosamente",
      shift: closedShift,
      calculation_breakdown: {
        opening_balance: openingBalance,
        cash_payments: cashPayments,
        card_payments: cardPayments,
        transfer_payments: transferPayments,
        settlements_paid: settlementsPaid,
        expected_cash: expectedCash,
        reported_cash: reportedCashNum,
        difference: difference
      }
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("POST /pos/shift/close error:", err);
    res.status(500).json({ message: "Error cerrando turno de caja" });
  } finally {
    client.release();
  }
});

/**
 * GET /shift/history
 * Historial de turnos de caja para auditoría
 */
router.get("/shift/history", auth, cashierRoles, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const result = await pool.query(
      `SELECT crs.*, u.name AS opened_by_name
       FROM cash_register_shifts crs
       LEFT JOIN users u ON u.id = crs.opened_by
       ORDER BY crs.id DESC
       LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /pos/shift/history error:", err);
    res.status(500).json({ message: "Error obteniendo historial de turnos de caja" });
  }
});

module.exports = router;
