const express = require("express");
const router = express.Router();

const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const dispatchEngine = require("../services/dispatchEngine");

const counterRoles = roles(["mesero", "cocina", "repartidor", "admin"]);

// 1. OBTENER TODOS LOS PEDIDOS DE MOSTRADOR (NÚCLEO OPERATIVO CENTRAL)
router.get("/orders", auth, counterRoles, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.id,
        o.folio,
        o.service_date,
        COALESCE(o.service_type, o.type, 'local') AS service_type,
        o.type,
        o.customer_name,
        u.name AS user_name,
        u.phone AS user_phone,
        o.pickup_at,
        o.status,
        o.total,
        o.payment_status,
        o.payment_method,
        o.created_at,
        o.ready_at,
        o.picked_up_from_counter_at,
        o.delivered_to_table_at,
        o.delivery_pin,
        o.delivery_fee,
        o.cash_paid_with,
        o.cash_change_due,
        o.table_session_id,
        rt.id AS table_id,
        rt.name AS table_name,
        rt.zone AS table_zone,
        ts.opened_by AS session_waiter_id,
        wu.name AS assigned_waiter_name,
        wta.waiter_user_id AS shift_waiter_id,
        shift_wu.name AS shift_waiter_name,
        ua.address,
        ua.details,
        dt.id AS trip_id,
        dt.status AS trip_status,
        drv.name AS driver_name,
        drv.phone AS driver_phone,
        dao.id AS active_offer_id,
        dao.driver_user_id AS active_offer_driver_id,
        offer_drv.name AS active_offer_driver_name,
        dao.expires_at AS active_offer_expires_at,
        ROUND(EXTRACT(EPOCH FROM (dao.expires_at - NOW()))) AS active_offer_seconds_left,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'name', p.name,
              'quantity', oi.quantity,
              'product_kind', p.product_kind,
              'kitchen_required', COALESCE(oi.kitchen_required, p.kitchen_required, FALSE),
              'status', COALESCE(oi.status, 'pendiente'),
              'ready_at', oi.ready_at,
              'choices', COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'name', op.name,
                    'quantity', occ.quantity,
                    'extra_price', occ.extra_price,
                    'kitchen_required', COALESCE(op.kitchen_required, FALSE)
                  ) ORDER BY occ.id
                )
                FROM order_item_combo_choices occ
                JOIN products op ON op.id = occ.option_product_id
                WHERE occ.order_item_id = oi.id
              ), '[]'::json)
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN table_sessions ts ON ts.id = o.table_session_id
      LEFT JOIN restaurant_tables rt ON rt.id = ts.table_id
      LEFT JOIN users wu ON wu.id = ts.opened_by
      LEFT JOIN waiter_table_assignments wta
        ON wta.table_id = rt.id
       AND wta.shift_date = CURRENT_DATE
       AND wta.active = TRUE
      LEFT JOIN users shift_wu ON shift_wu.id = wta.waiter_user_id
      LEFT JOIN delivery_trip_stops dts ON dts.order_id = o.id
      LEFT JOIN delivery_trips dt ON dt.id = dts.trip_id
      LEFT JOIN users drv ON drv.id = COALESCE(dt.driver_user_id, o.delivery_driver_id)
      LEFT JOIN delivery_assignment_offers dao
        ON dao.status = 'pending'
       AND o.status NOT IN ('entregado', 'cancelado')
       AND o.id = ANY(dao.order_ids)
       AND dao.expires_at > NOW()
      LEFT JOIN users offer_drv ON offer_drv.id = dao.driver_user_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.service_date = CURRENT_DATE
         OR o.created_at::date = CURRENT_DATE
      GROUP BY
        o.id, u.id, ua.id, ts.id, rt.id, wu.id, wta.id, shift_wu.id, dt.id, drv.id, dao.id, dao.driver_user_id, offer_drv.name, dao.expires_at
      ORDER BY
        CASE
          WHEN o.status = 'listo' THEN 1
          WHEN o.status IN ('pendiente', 'aceptado', 'preparando') THEN 2
          ELSE 3
        END,
        COALESCE(o.pickup_at, o.created_at) ASC,
        o.id ASC
    `);

    const orders = result.rows.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const totalItems = items.reduce((sum, i) => sum + Number(i.quantity || 1), 0);

      const kitchenItems = items.filter((i) => Boolean(i.kitchen_required));
      const kitchenItemsCount = kitchenItems.reduce((sum, i) => sum + Number(i.quantity || 1), 0);
      const kitchenItemsReadyCount = kitchenItems
        .filter((i) => i.status === "listo" || i.status === "entregado")
        .reduce((sum, i) => sum + Number(i.quantity || 1), 0);

      const requiresKitchen = kitchenItemsCount > 0;
      const allKitchenReady = requiresKitchen ? kitchenItemsReadyCount >= kitchenItemsCount : true;
      const isMixed = requiresKitchen && items.length > kitchenItems.length;

      // Determinación de la etapa operativa de mostrador
      let counterStage = "esperando_cocina";
      const statusKey = String(order.status || "").toLowerCase();
      const serviceType = String(order.service_type || "local").toLowerCase();

      if (statusKey === "cancelado") {
        counterStage = "cancelado";
      } else if (statusKey === "entregado") {
        counterStage = "entregado";
      } else if (statusKey === "listo") {
        if (serviceType === "mesa") {
          counterStage = order.picked_up_from_counter_at ? "en_camino_a_mesa" : "listo_para_mesa";
        } else if (serviceType === "local" && !order.table_session_id) {
          counterStage = "listo_esperando_llegada";
        } else if (serviceType === "llevar" || serviceType === "recoger") {
          counterStage = "listo_para_recoger";
        } else if (serviceType === "domicilio") {
          if (order.trip_status === "in_transit") {
            counterStage = "en_ruta";
          } else if (order.driver_name) {
            counterStage = "esperando_recogida";
          } else if (order.active_offer_id) {
            counterStage = "oferta_enviada";
          } else {
            counterStage = "buscando_repartidor";
          }
        } else {
          counterStage = "listo_para_recoger";
        }
      } else {
        // pendiente, aceptado, preparando
        if (requiresKitchen && !allKitchenReady) {
          counterStage = "esperando_cocina";
        } else {
          counterStage = "armando";
        }
      }

      // Tiempo transcurrido en minutos
      const createdAtMs = order.created_at ? new Date(order.created_at).getTime() : Date.now();
      const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdAtMs) / 60000));
      const isDelayed = elapsedMinutes >= 15 && statusKey !== "entregado" && statusKey !== "cancelado";

      const hasActiveOffer = Boolean(order.active_offer_id && statusKey !== "entregado" && statusKey !== "cancelado");
      const activeOfferData = hasActiveOffer ? {
        id: order.active_offer_id,
        driver_user_id: order.active_offer_driver_id,
        driver_name: order.active_offer_driver_name,
        expires_at: order.active_offer_expires_at,
        seconds_left: Math.max(0, Number(order.active_offer_seconds_left || 0))
      } : null;

      return {
        ...order,
        total: Number(order.total),
        waiter_display_name: order.assigned_waiter_name || order.shift_waiter_name || null,
        active_offer: activeOfferData,
        summary: {
          total_items: totalItems,
          kitchen_items_count: kitchenItemsCount,
          kitchen_items_ready_count: kitchenItemsReadyCount,
          requires_kitchen: requiresKitchen,
          all_kitchen_ready: allKitchenReady,
          is_mixed: isMixed,
          elapsed_minutes: elapsedMinutes,
          is_delayed: isDelayed,
          counter_stage: counterStage,
          active_offer: activeOfferData
        }
      };
    });

    res.json(orders);
  } catch (err) {
    console.error("GET COUNTER ORDERS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo pedidos de mostrador" });
  }
});

// 2. MARCAR PEDIDO COMO LISTO EN MOSTRADOR (COMPLETAR ARMADO)
router.patch("/orders/:id/mark-ready", auth, counterRoles, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Pedido inválido" });

    await client.query("BEGIN");

    // Sincronizar todos los items a listo
    await client.query(`
      UPDATE order_items
      SET status = 'listo', ready_at = COALESCE(ready_at, NOW())
      WHERE order_id = $1 AND status <> 'entregado'
    `, [id]);

    const result = await client.query(`
      UPDATE orders
      SET status = 'listo', ready_at = COALESCE(ready_at, NOW())
      WHERE id = $1 AND status NOT IN ('listo', 'entregado', 'cancelado')
      RETURNING *
    `, [id]);

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El pedido ya se encuentra listo o finalizado" });
    }

    const order = result.rows[0];
    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", order);
      io.emit("orders-updated", order);
      io.emit("counter-updated", order);
      if (order.table_session_id) io.emit("tables-updated");
    }

    // Si es a domicilio, evaluar despacho automático
    if (order.service_type === "domicilio" || order.type === "domicilio") {
      setTimeout(() => {
        dispatchEngine.evaluateDispatchQueue(io).catch((err) => {
          console.error("DISPATCH ON COUNTER MARK READY ERROR:", err.message);
        });
      }, 50);
    }

    res.json(order);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("COUNTER MARK READY ERROR:", err);
    res.status(500).json({ message: "Error marcando pedido como listo" });
  } finally {
    client.release();
  }
});

// 3. MESERO RECOGE DE MOSTRADOR PARA LLEVAR A MESA
router.patch("/orders/:id/pickup-waiter", auth, counterRoles, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Pedido inválido" });

    const result = await pool.query(`
      UPDATE orders
      SET picked_up_from_counter_at = NOW()
      WHERE id = $1 AND status = 'listo'
      RETURNING *
    `, [id]);

    if (!result.rows.length) {
      return res.status(409).json({ message: "El pedido no está listo en mostrador" });
    }

    const order = result.rows[0];
    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", order);
      io.emit("orders-updated", order);
      io.emit("counter-updated", order);
      if (order.table_session_id) io.emit("tables-updated");
    }

    res.json(order);
  } catch (err) {
    console.error("COUNTER PICKUP WAITER ERROR:", err);
    res.status(500).json({ message: "Error registrando recogida de mesero" });
  }
});

// 4. ENTREGAR PEDIDO EN MESA (SERVICIO SALÓN)
router.patch("/orders/:id/deliver-table", auth, counterRoles, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Pedido inválido" });

    await client.query("BEGIN");

    await client.query(`
      UPDATE order_items
      SET status = 'entregado'
      WHERE order_id = $1
    `, [id]);

    const result = await client.query(`
      UPDATE orders
      SET status = 'entregado', delivered_to_table_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Pedido no encontrado" });
    }

    const order = result.rows[0];

    // Limpiar cualquier oferta pendiente asociada
    await dispatchEngine.cleanupPendingOffersForOrder(id, client, "Pedido entregado en mesa");

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", order);
      io.emit("orders-updated", order);
      io.emit("counter-updated", order);
      if (order.table_session_id) io.emit("tables-updated");
    }

    res.json(order);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("COUNTER DELIVER TABLE ERROR:", err);
    res.status(500).json({ message: "Error registrando entrega en mesa" });
  } finally {
    client.release();
  }
});

// 5. ENTREGAR PEDIDO PARA LLEVAR O RECOGER EN MOSTRADOR
router.patch("/orders/:id/deliver", auth, counterRoles, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Pedido inválido" });

    await client.query("BEGIN");

    await client.query(`
      UPDATE order_items
      SET status = 'entregado'
      WHERE order_id = $1
    `, [id]);

    const result = await client.query(`
      UPDATE orders
      SET status = 'entregado'
      WHERE id = $1 AND status = 'listo'
      RETURNING *
    `, [id]);

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El pedido no está listo para entregar" });
    }

    const order = result.rows[0];

    // Limpiar ofertas pendientes asociadas a este pedido
    await dispatchEngine.cleanupPendingOffersForOrder(id, client, "Pedido entregado en mostrador");

    // Si estaba en una parada de viaje activo, marcar la parada como entregada
    const stopRes = await client.query(`
      SELECT id, trip_id FROM delivery_trip_stops
      WHERE order_id = $1 AND status NOT IN ('delivered', 'failed')
    `, [id]);

    for (const stop of stopRes.rows) {
      await client.query(`
        UPDATE delivery_trip_stops
        SET status = 'delivered', delivered_at = NOW()
        WHERE id = $1
      `, [stop.id]);

      const remRes = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM delivery_trip_stops
        WHERE trip_id = $1 AND status NOT IN ('delivered', 'failed')
      `, [stop.trip_id]);

      if (remRes.rows[0].count === 0) {
        await client.query(`
          UPDATE delivery_trips
          SET status = 'completed', completed_at = NOW()
          WHERE id = $1
        `, [stop.trip_id]);

        await client.query(`
          UPDATE users
          SET driver_status = 'regresando',
              driver_status_updated_at = NOW(),
              driver_last_completed_at = NOW()
          WHERE id = (SELECT driver_user_id FROM delivery_trips WHERE id = $1)
        `, [stop.trip_id]);
      }
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", order);
      io.emit("orders-updated", order);
      io.emit("counter-updated", order);
      io.emit("trips-updated");
    }

    res.json(order);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("COUNTER DELIVER ERROR:", err);
    res.status(500).json({ message: "Error marcando pedido como entregado" });
  } finally {
    client.release();
  }
});

// 6. NOTIFICAR AL MESERO DE SALÓN QUE EL PEDIDO ESTÁ LISTO
router.post("/orders/:id/notify-waiter", auth, counterRoles, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const orderRes = await pool.query(`
      SELECT o.id, o.folio, rt.name AS table_name, ts.opened_by AS waiter_id, wta.waiter_user_id AS shift_waiter_id
      FROM orders o
      LEFT JOIN table_sessions ts ON ts.id = o.table_session_id
      LEFT JOIN restaurant_tables rt ON rt.id = ts.table_id
      LEFT JOIN waiter_table_assignments wta ON wta.table_id = rt.id AND wta.shift_date = CURRENT_DATE AND wta.active = TRUE
      WHERE o.id = $1
    `, [id]);

    if (!orderRes.rows.length) return res.status(404).json({ message: "Pedido no encontrado" });
    const order = orderRes.rows[0];

    const io = req.app.get("io");
    if (io) {
      io.emit("waiter-table-ready", {
        orderId: order.id,
        folio: order.folio,
        tableName: order.table_name,
        waiterId: order.waiter_id || order.shift_waiter_id
      });
      io.emit("tables-updated");
    }

    res.json({ ok: true, message: `Mesero notificado para ${order.table_name || 'mesa'}` });
  } catch (err) {
    console.error("NOTIFY WAITER ERROR:", err);
    res.status(500).json({ message: "Error notificando al mesero" });
  }
});

module.exports = router;
