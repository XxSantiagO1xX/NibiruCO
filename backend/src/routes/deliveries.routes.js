const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const dispatchEngine = require("../services/dispatchEngine");

const adminOnly = roles(["admin"]);
const driverOrAdmin = roles(["repartidor", "admin"]);
const staffRoles = roles(["mesero", "cocina", "repartidor", "admin"]);

// 0. Configuración de Despacho Automático
router.get("/config", auth, staffRoles, async (req, res) => {
  try {
    const config = await dispatchEngine.getConfig();
    res.json(config);
  } catch (err) {
    console.error("GET CONFIG ERROR:", err);
    res.status(500).json({ message: "Error obteniendo configuración de despacho" });
  }
});

router.patch("/config", auth, adminOnly, async (req, res) => {
  try {
    const updated = await dispatchEngine.updateConfig(req.body);
    const io = req.app.get("io");
    if (io) io.emit("delivery-config-updated", updated);

    if (updated.dispatch_mode === "automatic" && updated.auto_dispatch_enabled) {
      setTimeout(() => {
        dispatchEngine.evaluateDispatchQueue(io).catch((e) => console.error("AUTO DISPATCH ON CONFIG ERROR:", e));
      }, 50);
    }

    res.json(updated);
  } catch (err) {
    console.error("UPDATE CONFIG ERROR:", err);
    res.status(500).json({ message: "Error actualizando configuración de despacho" });
  }
});

// 1. Zonas de reparto
router.get("/zones", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM delivery_zones
      WHERE active = TRUE
      ORDER BY fee ASC, name ASC
    `);
    res.json(result.rows.map((r) => ({
      ...r,
      fee: Number(r.fee),
      min_order: Number(r.min_order)
    })));
  } catch (err) {
    console.error("GET ZONES ERROR:", err);
    res.status(500).json({ message: "Error obteniendo zonas de reparto" });
  }
});

// 2. Lista de repartidores con estado operativo en tiempo real
router.get("/drivers", auth, staffRoles, async (req, res) => {
  try {
    // Expirar ofertas vencidas antes de responder
    const io = req.app.get("io");
    await dispatchEngine.checkExpiredOffers(io);

    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.phone,
        u.email,
        u.role,
        COALESCE(u.driver_status, 'offline') AS driver_status,
        u.driver_status_updated_at,
        u.driver_last_completed_at,
        COALESCE(
          (SELECT COUNT(*)::int
           FROM delivery_trips dt
           WHERE dt.driver_user_id = u.id
             AND dt.created_at >= CURRENT_DATE
             AND dt.status = 'completed'),
          0
        ) AS completed_trips_today,
        COALESCE(
          (SELECT t.id FROM delivery_trips t
           WHERE t.driver_user_id = u.id AND t.status IN ('assigned', 'in_transit')
           ORDER BY t.id DESC LIMIT 1),
          NULL
        ) AS active_trip_id,
        COALESCE(
          (SELECT t.status FROM delivery_trips t
           WHERE t.driver_user_id = u.id AND t.status IN ('assigned', 'in_transit')
           ORDER BY t.id DESC LIMIT 1),
          NULL
        ) AS active_trip_status,
        (SELECT dao.id FROM delivery_assignment_offers dao
         WHERE dao.driver_user_id = u.id AND dao.status = 'pending' AND dao.expires_at > NOW()
         ORDER BY dao.id DESC LIMIT 1) AS active_offer_id,
        (SELECT EXTRACT(EPOCH FROM (dao.expires_at - NOW()))::int FROM delivery_assignment_offers dao
         WHERE dao.driver_user_id = u.id AND dao.status = 'pending' AND dao.expires_at > NOW()
         ORDER BY dao.id DESC LIMIT 1) AS active_offer_remaining_seconds
      FROM users u
      WHERE u.role = 'repartidor'
      ORDER BY
        CASE
          WHEN u.driver_status = 'disponible' THEN 1
          WHEN u.driver_status = 'esperando_recogida' THEN 2
          WHEN u.driver_status = 'en_ruta' THEN 3
          WHEN u.driver_status = 'regresando' THEN 4
          WHEN u.driver_status = 'oferta_pendiente' THEN 5
          WHEN u.driver_status = 'pausa' THEN 6
          ELSE 7
        END,
        u.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("GET DRIVERS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo repartidores" });
  }
});

// 2.1 Actualizar estado operativo de un repartidor (Chofer o Admin)
router.patch("/drivers/:id/status", auth, driverOrAdmin, async (req, res) => {
  try {
    const driverId = Number(req.params.id);
    const { status } = req.body;
    const isSelf = Number(req.user.id) === driverId;
    const isAdmin = req.user.role === "admin";

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ message: "No tienes permisos para cambiar el estado de este repartidor" });
    }

    const validStatuses = ["offline", "disponible", "oferta_pendiente", "esperando_recogida", "en_ruta", "regresando", "pausa"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Estado de repartidor no válido" });
    }

    const result = await pool.query(`
      UPDATE users
      SET driver_status = $1, driver_status_updated_at = NOW()
      WHERE id = $2 AND role = 'repartidor'
      RETURNING id, name, driver_status, driver_status_updated_at
    `, [status, driverId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "Repartidor no encontrado" });
    }

    const updatedDriver = result.rows[0];
    const io = req.app.get("io");
    if (io) {
      io.emit("driver-status-updated", updatedDriver);
      io.emit("delivery-updated", { driver_id: driverId });
      io.emit("counter-updated");
    }

    if (["disponible", "regresando"].includes(status)) {
      setTimeout(() => {
        dispatchEngine.evaluateDispatchQueue(io).catch((e) => console.error("DISPATCH ON DRIVER STATUS CHANGE ERROR:", e));
      }, 50);
    }

    res.json(updatedDriver);
  } catch (err) {
    console.error("UPDATE DRIVER STATUS ERROR:", err);
    res.status(500).json({ message: "Error actualizando estado del repartidor" });
  }
});

// 3. Pedidos listos o pendientes de asignación de domicilio
router.get("/ready-orders", auth, staffRoles, async (req, res) => {
  try {
    const io = req.app.get("io");
    await dispatchEngine.checkExpiredOffers(io);

    const result = await pool.query(`
      SELECT
        o.*,
        u.name AS customer_name_user,
        u.phone AS customer_phone,
        ua.address,
        ua.details AS address_details,
        dz.name AS zone_name,
        dz.fee AS zone_fee,
        dts.id AS trip_stop_id,
        dts.trip_id,
        dts.status AS stop_status,
        drv.name AS driver_name,
        drv.phone AS driver_phone,
        dao.id AS active_offer_id,
        dao.driver_user_id AS offer_driver_id,
        off_drv.name AS offer_driver_name,
        dao.expires_at AS offer_expires_at,
        EXTRACT(EPOCH FROM (dao.expires_at - NOW()))::int AS offer_remaining_seconds,
        dao.recommendation_reason AS offer_recommendation_reason
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN delivery_zones dz ON dz.id = o.delivery_zone_id
      LEFT JOIN delivery_trip_stops dts ON dts.order_id = o.id
      LEFT JOIN delivery_trips dt ON dt.id = dts.trip_id
      LEFT JOIN users drv ON drv.id = dt.driver_user_id
      LEFT JOIN delivery_assignment_offers dao
        ON o.id = ANY(dao.order_ids)
       AND dao.status = 'pending'
       AND dao.expires_at > NOW()
      LEFT JOIN users off_drv ON off_drv.id = dao.driver_user_id
      WHERE (o.service_type = 'domicilio' OR o.type = 'domicilio')
        AND o.status NOT IN ('cancelado', 'entregado')
      ORDER BY
        CASE
          WHEN o.status = 'listo' AND dts.id IS NULL AND dao.id IS NULL THEN 1
          WHEN o.status = 'listo' AND dao.id IS NOT NULL THEN 2
          WHEN dts.id IS NOT NULL THEN 3
          ELSE 4
        END,
        COALESCE(o.ready_at, o.created_at) ASC
    `);

    res.json(result.rows.map((r) => {
      const createdAtMs = new Date(r.ready_at || r.created_at).getTime();
      const elapsedQueueMinutes = Math.max(0, Math.floor((Date.now() - createdAtMs) / 60000));
      return {
        ...r,
        total: Number(r.total),
        delivery_fee: Number(r.delivery_fee || 0),
        cash_paid_with: r.cash_paid_with ? Number(r.cash_paid_with) : null,
        cash_change_due: r.cash_change_due ? Number(r.cash_change_due) : null,
        elapsed_queue_minutes: elapsedQueueMinutes,
        offer_remaining_seconds: r.offer_remaining_seconds ? Math.max(0, Number(r.offer_remaining_seconds)) : null
      };
    }));
  } catch (err) {
    console.error("GET READY ORDERS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo pedidos de reparto" });
  }
});

// 3.1 Ofertas activas en tiempo real (Admin / Mostrador)
router.get("/offers/active", auth, staffRoles, async (req, res) => {
  try {
    const io = req.app.get("io");
    await dispatchEngine.checkExpiredOffers(io);

    const result = await pool.query(`
      SELECT
        dao.*,
        u.name AS driver_name,
        u.phone AS driver_phone,
        EXTRACT(EPOCH FROM (dao.expires_at - NOW()))::int AS remaining_seconds
      FROM delivery_assignment_offers dao
      JOIN users u ON u.id = dao.driver_user_id
      WHERE dao.status = 'pending'
        AND dao.expires_at > NOW()
      ORDER BY dao.expires_at ASC
    `);

    res.json(result.rows.map((r) => ({
      ...r,
      remaining_seconds: Math.max(0, Number(r.remaining_seconds || 0)),
      score: Number(r.score)
    })));
  } catch (err) {
    console.error("GET ACTIVE OFFERS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo ofertas activas" });
  }
});

// 3.2 Oferta activa del repartidor autenticado
router.get("/my-offer", auth, driverOrAdmin, async (req, res) => {
  try {
    const driverId = req.user.id;
    const io = req.app.get("io");
    await dispatchEngine.checkExpiredOffers(io);

    const offerRes = await pool.query(`
      SELECT
        dao.*,
        EXTRACT(EPOCH FROM (dao.expires_at - NOW()))::int AS remaining_seconds,
        dz.name AS zone_name
      FROM delivery_assignment_offers dao
      LEFT JOIN orders o ON o.id = dao.order_ids[1]
      LEFT JOIN delivery_zones dz ON dz.id = o.delivery_zone_id
      WHERE dao.driver_user_id = $1
        AND dao.status = 'pending'
        AND dao.expires_at > NOW()
      ORDER BY dao.id DESC
      LIMIT 1
    `, [driverId]);

    if (!offerRes.rows.length) {
      return res.json({ active_offer: null });
    }

    const offer = offerRes.rows[0];
    const orderIds = Array.isArray(offer.order_ids) ? offer.order_ids : [];

    const ordersRes = await pool.query(`
      SELECT
        o.id,
        o.folio,
        o.total,
        o.payment_method,
        o.cash_paid_with,
        o.cash_change_due,
        o.customer_name,
        u.name AS user_name,
        u.phone AS user_phone,
        ua.address,
        ua.details AS address_details,
        dz.name AS zone_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN delivery_zones dz ON dz.id = o.delivery_zone_id
      WHERE o.id = ANY($1::bigint[])
      ORDER BY o.id ASC
    `, [orderIds]);

    const orders = ordersRes.rows.map((o) => ({
      ...o,
      total: Number(o.total),
      cash_paid_with: o.cash_paid_with ? Number(o.cash_paid_with) : null,
      cash_change_due: o.cash_change_due ? Number(o.cash_change_due) : null
    }));

    const totalCashToCollect = orders
      .filter((o) => o.payment_method === "efectivo")
      .reduce((sum, o) => sum + o.total, 0);

    res.json({
      active_offer: {
        ...offer,
        remaining_seconds: Math.max(0, Number(offer.remaining_seconds || 0)),
        total_cash_to_collect: totalCashToCollect,
        total_amount: orders.reduce((sum, o) => sum + o.total, 0),
        orders
      }
    });
  } catch (err) {
    console.error("GET MY OFFER ERROR:", err);
    res.status(500).json({ message: "Error obteniendo oferta activa" });
  }
});

// 3.3 Aceptar oferta (Repartidor)
router.post("/offers/:id/accept", auth, driverOrAdmin, async (req, res) => {
  try {
    const offerId = Number(req.params.id);
    const driverId = req.user.id;
    const io = req.app.get("io");

    const result = await dispatchEngine.acceptOffer(offerId, driverId, io);
    res.json(result);
  } catch (err) {
    console.error("ACCEPT OFFER ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Error aceptando oferta" });
  }
});

// 3.4 Rechazar oferta (Repartidor)
router.post("/offers/:id/reject", auth, driverOrAdmin, async (req, res) => {
  try {
    const offerId = Number(req.params.id);
    const driverId = req.user.id;
    const { reason, pause } = req.body;
    const io = req.app.get("io");

    const result = await dispatchEngine.rejectOffer(offerId, driverId, reason, Boolean(pause), io);
    res.json(result);
  } catch (err) {
    console.error("REJECT OFFER ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Error rechazando oferta" });
  }
});

// 3.5 Cancelar oferta (Admin)
router.post("/offers/:id/cancel", auth, adminOnly, async (req, res) => {
  try {
    const offerId = Number(req.params.id);
    const { reason } = req.body;
    const io = req.app.get("io");

    const result = await dispatchEngine.cancelOffer(offerId, reason, io);
    res.json(result);
  } catch (err) {
    console.error("CANCEL OFFER ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Error cancelando oferta" });
  }
});

// 3.6 Forzar reasignación / Asignación manual de Administrador (Override)
router.post("/trips/override", auth, adminOnly, async (req, res) => {
  try {
    const { driver_user_id, order_ids } = req.body;
    const io = req.app.get("io");

    const trip = await dispatchEngine.adminForceAssign(driver_user_id, order_ids, io);
    res.status(201).json(trip);
  } catch (err) {
    console.error("ADMIN OVERRIDE ASSIGN ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Error asignando viaje" });
  }
});

// 4. Propuestas inteligentes de agrupación de viajes
router.get("/proposals", auth, adminOnly, async (req, res) => {
  try {
    const maxPerTrip = Number(req.query.max_per_trip) || 3;

    // Obtener pedidos no asignados o con viaje no iniciado
    const result = await pool.query(`
      SELECT
        o.id,
        o.folio,
        o.total,
        o.status,
        o.created_at,
        o.payment_method,
        o.cash_paid_with,
        o.cash_change_due,
        o.customer_name,
        u.name AS user_name,
        u.phone AS user_phone,
        ua.address,
        ua.details AS address_details,
        COALESCE(o.delivery_zone_id, 1) AS zone_id,
        dz.name AS zone_name,
        dz.estimated_min_minutes,
        dz.estimated_max_minutes
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN delivery_zones dz ON dz.id = o.delivery_zone_id
      WHERE (o.service_type = 'domicilio' OR o.type = 'domicilio')
        AND o.status IN ('pendiente', 'aceptado', 'preparando', 'listo')
        AND NOT EXISTS (
          SELECT 1 FROM delivery_trip_stops dts
          JOIN delivery_trips dt ON dt.id = dts.trip_id
          WHERE dts.order_id = o.id AND dt.status IN ('assigned', 'in_transit')
        )
      ORDER BY o.created_at ASC
    `);

    const unassignedOrders = result.rows;

    // Agrupación heurística: primero por zona, luego por antigüedad
    const ordersByZone = {};
    for (const order of unassignedOrders) {
      const zId = order.zone_id || "general";
      if (!ordersByZone[zId]) ordersByZone[zId] = [];
      ordersByZone[zId].push(order);
    }

    const proposals = [];
    let proposalIndex = 1;

    for (const [zId, zoneOrders] of Object.entries(ordersByZone)) {
      // Chunk into groups of maxPerTrip
      for (let i = 0; i < zoneOrders.length; i += maxPerTrip) {
        const chunk = zoneOrders.slice(i, i + maxPerTrip);
        const zoneName = chunk[0].zone_name || `Zona ${zId}`;
        const totalAmount = chunk.reduce((sum, o) => sum + Number(o.total), 0);

        // Sequence calculation: oldest order first
        const stops = chunk.map((order, sIdx) => {
          const baseMin = Number(order.estimated_min_minutes || 25);
          const stopOffset = sIdx * 10;
          return {
            order_id: order.id,
            folio: order.folio,
            customer_name: order.customer_name || order.user_name || "Cliente",
            phone: order.user_phone,
            address: order.address || "Dirección registrada",
            address_details: order.address_details,
            total: Number(order.total),
            payment_method: order.payment_method,
            cash_paid_with: order.cash_paid_with ? Number(order.cash_paid_with) : null,
            cash_change_due: order.cash_change_due ? Number(order.cash_change_due) : null,
            stop_order: sIdx + 1,
            eta_minutes: baseMin + stopOffset
          };
        });

        proposals.push({
          proposal_id: `prop-${proposalIndex++}`,
          zone_name: zoneName,
          order_count: chunk.length,
          total_amount: totalAmount,
          estimated_duration_range: `${20 + chunk.length * 8}-${35 + chunk.length * 10} min`,
          stops
        });
      }
    }

    res.json({
      total_unassigned: unassignedOrders.length,
      proposals
    });
  } catch (err) {
    console.error("GET PROPOSALS ERROR:", err);
    res.status(500).json({ message: "Error calculando propuestas de viaje" });
  }
});

// 5. Crear / Asignar viaje de reparto (Admin)
router.post("/trips", auth, adminOnly, async (req, res) => {
  try {
    const { driver_user_id, order_ids } = req.body;
    const io = req.app.get("io");

    const trip = await dispatchEngine.adminForceAssign(driver_user_id, order_ids, io);
    res.status(201).json(trip);
  } catch (err) {
    console.error("CREATE TRIP ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Error creando viaje de reparto" });
  }
});

// 6. Viaje activo del repartidor autenticado
router.get("/my-trip", auth, driverOrAdmin, async (req, res) => {
  try {
    const driverId = req.user.role === "admin" && req.query.driver_id
      ? Number(req.query.driver_id)
      : req.user.id;

    const tripRes = await pool.query(`
      SELECT *
      FROM delivery_trips
      WHERE driver_user_id = $1
        AND status IN ('assigned', 'in_transit')
      ORDER BY id DESC
      LIMIT 1
    `, [driverId]);

    if (!tripRes.rows.length) {
      return res.json({ active_trip: null });
    }

    const trip = tripRes.rows[0];

    const stopsRes = await pool.query(`
      SELECT
        dts.*,
        o.folio,
        o.total,
        o.status AS order_status,
        o.payment_method,
        o.cash_paid_with,
        o.cash_change_due,
        o.delivery_fee,
        o.customer_name,
        u.name AS user_name,
        u.phone AS user_phone,
        ua.address,
        ua.details AS address_details,
        o.delivery_lat,
        o.delivery_lng
      FROM delivery_trip_stops dts
      JOIN orders o ON o.id = dts.order_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      WHERE dts.trip_id = $1
      ORDER BY dts.stop_order ASC
    `, [trip.id]);

    res.json({
      active_trip: {
        ...trip,
        stops: stopsRes.rows.map((s) => ({
          ...s,
          total: Number(s.total),
          delivery_fee: Number(s.delivery_fee || 0),
          cash_paid_with: s.cash_paid_with ? Number(s.cash_paid_with) : null,
          cash_change_due: s.cash_change_due ? Number(s.cash_change_due) : null
        }))
      }
    });
  } catch (err) {
    console.error("GET MY TRIP ERROR:", err);
    res.status(500).json({ message: "Error obteniendo viaje del repartidor" });
  }
});

// 7. Iniciar viaje / En ruta (Repartidor)
router.patch("/my-trip/start", auth, driverOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const driverId = req.user.id;

    const tripRes = await client.query(`
      SELECT id FROM delivery_trips
      WHERE driver_user_id = $1 AND status = 'assigned'
      ORDER BY id DESC LIMIT 1
    `, [driverId]);

    if (!tripRes.rows.length) {
      return res.status(404).json({ message: "No tienes un viaje asignado para iniciar" });
    }

    const tripId = tripRes.rows[0].id;

    await client.query("BEGIN");

    await client.query(`
      UPDATE delivery_trips
      SET status = 'in_transit', started_at = NOW()
      WHERE id = $1
    `, [tripId]);

    await client.query(`
      UPDATE users
      SET driver_status = 'en_ruta', driver_status_updated_at = NOW()
      WHERE id = $1
    `, [driverId]);

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("delivery-updated", { trip_id: tripId, driver_id: driverId });
      io.emit("orders-updated");
      io.emit("counter-updated");
    }

    res.json({ ok: true, message: "Viaje iniciado", trip_id: tripId });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("START TRIP ERROR:", err);
    res.status(500).json({ message: "Error iniciando viaje" });
  } finally {
    client.release();
  }
});

// 8. Marcar llegada al domicilio (Repartidor)
router.patch("/stops/:id/arrived", auth, driverOrAdmin, async (req, res) => {
  try {
    const stopId = Number(req.params.id);

    const result = await pool.query(`
      UPDATE delivery_trip_stops
      SET status = 'arrived', arrived_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [stopId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = result.rows[0];
    const io = req.app.get("io");
    if (io) {
      io.emit("delivery-updated", { trip_id: stop.trip_id });
      io.emit("orders-updated");
    }

    res.json(stop);
  } catch (err) {
    console.error("STOP ARRIVED ERROR:", err);
    res.status(500).json({ message: "Error marcando llegada" });
  }
});

// 9. Validar PIN de entrega (Repartidor)
router.post("/stops/:id/verify-pin", auth, driverOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const stopId = Number(req.params.id);
    const pin = String(req.body.pin || "").trim();

    if (!pin) {
      return res.status(400).json({ message: "Introduce el PIN de entrega proporcionado por el cliente" });
    }

    const stopRes = await client.query(`
      SELECT dts.*, o.delivery_pin, o.total
      FROM delivery_trip_stops dts
      JOIN orders o ON o.id = dts.order_id
      WHERE dts.id = $1
    `, [stopId]);

    if (!stopRes.rows.length) {
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = stopRes.rows[0];

    if (stop.delivery_pin !== pin) {
      return res.status(400).json({ message: "PIN incorrecto. Pídele al cliente que revise su app de MealOps." });
    }

    await client.query("BEGIN");

    // Marcar parada como entregada
    await client.query(`
      UPDATE delivery_trip_stops
      SET status = 'delivered', delivered_at = NOW()
      WHERE id = $1
    `, [stopId]);

    // Actualizar pedido
    await client.query(`
      UPDATE orders
      SET status = 'entregado',
          payment_status = 'paid',
          paid_at = COALESCE(paid_at, NOW()),
          delivery_pin_validated_at = NOW(),
          cash_received = total
      WHERE id = $1
    `, [stop.order_id]);

    // Verificar si quedan paradas en el viaje
    const remainingRes = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM delivery_trip_stops
      WHERE trip_id = $1 AND status NOT IN ('delivered', 'failed')
    `, [stop.trip_id]);

    let tripCompleted = false;
    if (remainingRes.rows[0].count === 0) {
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

      tripCompleted = true;
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("delivery-updated", { trip_id: stop.trip_id });
      io.emit("orders-updated");
      io.emit("counter-updated");
    }

    if (tripCompleted) {
      setTimeout(() => {
        dispatchEngine.evaluateDispatchQueue(io).catch((e) => console.error("AUTO DISPATCH ON TRIP COMPLETION ERROR:", e));
      }, 50);
    }

    res.json({
      ok: true,
      message: "Entrega validada con éxito",
      trip_completed: tripCompleted
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("VERIFY PIN ERROR:", err);
    res.status(500).json({ message: "Error validando PIN" });
  } finally {
    client.release();
  }
});

// 10. Excepción manual de entrega por Admin
router.post("/stops/:id/admin-override", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const stopId = Number(req.params.id);
    const reason = String(req.body.reason || "").trim();

    if (!reason) {
      return res.status(400).json({ message: "Debes registrar el motivo de la excepción de entrega" });
    }

    const stopRes = await client.query(`
      SELECT dts.*, o.total
      FROM delivery_trip_stops dts
      JOIN orders o ON o.id = dts.order_id
      WHERE dts.id = $1
    `, [stopId]);

    if (!stopRes.rows.length) {
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = stopRes.rows[0];

    await client.query("BEGIN");

    await client.query(`
      UPDATE delivery_trip_stops
      SET status = 'delivered', delivered_at = NOW()
      WHERE id = $1
    `, [stopId]);

    await client.query(`
      UPDATE orders
      SET status = 'entregado',
          payment_status = 'paid',
          paid_at = COALESCE(paid_at, NOW()),
          delivery_admin_override = TRUE,
          delivery_admin_override_reason = $1,
          cash_received = total
      WHERE id = $2
    `, [reason, stop.order_id]);

    const remainingRes = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM delivery_trip_stops
      WHERE trip_id = $1 AND status NOT IN ('delivered', 'failed')
    `, [stop.trip_id]);

    let tripCompleted = false;
    if (remainingRes.rows[0].count === 0) {
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

      tripCompleted = true;
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("delivery-updated", { trip_id: stop.trip_id });
      io.emit("orders-updated");
      io.emit("counter-updated");
    }

    if (tripCompleted) {
      setTimeout(() => {
        dispatchEngine.evaluateDispatchQueue(io).catch((e) => console.error("AUTO DISPATCH ON ADMIN OVERRIDE COMPLETION ERROR:", e));
      }, 50);
    }

    res.json({ ok: true, message: "Entrega autorizada por administrador" });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("ADMIN OVERRIDE ERROR:", err);
    res.status(500).json({ message: "Error autorizando entrega" });
  } finally {
    client.release();
  }
});

// 11. Reportar incidencia en parada (Repartidor)
router.post("/stops/:id/report-issue", auth, driverOrAdmin, async (req, res) => {
  try {
    const stopId = Number(req.params.id);
    const reason = String(req.body.reason || "Incidencia sin especificar").trim();

    const result = await pool.query(`
      UPDATE delivery_trip_stops
      SET status = 'failed', failed_at = NOW(), fail_reason = $1
      WHERE id = $2
      RETURNING *
    `, [reason, stopId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = result.rows[0];
    const io = req.app.get("io");
    if (io) {
      io.emit("delivery-updated", { trip_id: stop.trip_id });
      io.emit("orders-updated");
    }

    res.json({ ok: true, message: "Incidencia registrada", stop });
  } catch (err) {
    console.error("REPORT ISSUE ERROR:", err);
    res.status(500).json({ message: "Error reportando incidencia" });
  }
});

// 12. Actualización de ubicación GPS del repartidor
router.patch("/my-location", auth, driverOrAdmin, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const driverId = req.user.id;

    if (!lat || !lng) {
      return res.status(400).json({ message: "Coordenadas lat y lng requeridas" });
    }

    const result = await pool.query(`
      UPDATE delivery_trips
      SET current_lat = $1, current_lng = $2
      WHERE driver_user_id = $3 AND status = 'in_transit'
      RETURNING id
    `, [lat, lng, driverId]);

    if (result.rows.length) {
      const io = req.app.get("io");
      if (io) {
        io.emit("driver-location-updated", {
          trip_id: result.rows[0].id,
          driver_id: driverId,
          lat,
          lng
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("LOCATION UPDATE ERROR:", err);
    res.status(500).json({ message: "Error actualizando ubicación" });
  }
});

// 13. Tracking en vivo para el cliente
router.get("/orders/:id/track", auth, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.user.id;
    const isStaff = staffRoles(req, res, () => true);

    const orderRes = await pool.query(`
      SELECT
        o.id,
        o.folio,
        o.status,
        o.service_type,
        o.total,
        o.delivery_pin,
        o.user_id,
        o.created_at,
        dts.id AS stop_id,
        dts.stop_order,
        dts.status AS stop_status,
        dts.eta_minutes,
        dts.arrived_at,
        dt.id AS trip_id,
        dt.status AS trip_status,
        dt.current_lat AS driver_lat,
        dt.current_lng AS driver_lng,
        drv.name AS driver_name,
        drv.phone AS driver_phone
      FROM orders o
      LEFT JOIN delivery_trip_stops dts ON dts.order_id = o.id
      LEFT JOIN delivery_trips dt ON dt.id = dts.trip_id
      LEFT JOIN users drv ON drv.id = dt.driver_user_id
      WHERE o.id = $1
    `, [orderId]);

    if (!orderRes.rows.length) {
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const order = orderRes.rows[0];

    // Verificar permisos: dueño del pedido o personal
    if (order.user_id !== userId && !["admin", "mesero", "cocina", "repartidor"].includes(req.user.role)) {
      return res.status(403).json({ message: "No tienes permiso para ver este pedido" });
    }

    // Calcular paradas pendientes anteriores en la misma ruta
    let stopsBefore = 0;
    if (order.trip_id && order.stop_order > 1) {
      const stopsBeforeRes = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM delivery_trip_stops
        WHERE trip_id = $1
          AND stop_order < $2
          AND status NOT IN ('delivered', 'failed')
      `, [order.trip_id, order.stop_order]);
      stopsBefore = stopsBeforeRes.rows[0].count;
    }

    // Calcular rango de ETA
    const baseEta = order.eta_minutes || 30;
    const etaMin = Math.max(5, baseEta - 5);
    const etaMax = baseEta + 10;

    res.json({
      order_id: order.id,
      folio: order.folio,
      status: order.status,
      delivery_pin: order.delivery_pin,
      trip_status: order.trip_status || "preparing",
      stop_status: order.stop_status || "pending",
      driver_name: order.driver_name || null,
      driver_phone: order.driver_phone || null,
      driver_lat: order.driver_lat,
      driver_lng: order.driver_lng,
      stops_before: stopsBefore,
      eta_range: `${etaMin}–${etaMax} min`,
      arrived_at: order.arrived_at
    });
  } catch (err) {
    console.error("GET ORDER TRACK ERROR:", err);
    res.status(500).json({ message: "Error obteniendo tracking del pedido" });
  }
});

// 14. Resumen de turno y liquidación del repartidor
router.get("/shift-summary", auth, driverOrAdmin, async (req, res) => {
  try {
    const driverId = req.user.role === "admin" && req.query.driver_id
      ? Number(req.query.driver_id)
      : req.user.id;

    const result = await pool.query(`
      SELECT
        COUNT(dts.id)::int AS total_stops,
        COUNT(dts.id) FILTER (WHERE dts.status = 'delivered')::int AS delivered_count,
        COUNT(dts.id) FILTER (WHERE dts.status = 'failed')::int AS failed_count,
        COALESCE(SUM(o.cash_received) FILTER (WHERE dts.status = 'delivered'), 0)::numeric AS total_cash_collected,
        COALESCE(SUM(o.cash_received) FILTER (WHERE dts.status = 'delivered' AND o.driver_settled = FALSE), 0)::numeric AS pending_settlement_cash
      FROM delivery_trip_stops dts
      JOIN delivery_trips dt ON dt.id = dts.trip_id
      JOIN orders o ON o.id = dts.order_id
      WHERE dt.driver_user_id = $1
        AND dt.created_at >= CURRENT_DATE
    `, [driverId]);

    const summary = result.rows[0];
    res.json({
      driver_id: driverId,
      total_stops: summary.total_stops,
      delivered_count: summary.delivered_count,
      failed_count: summary.failed_count,
      total_cash_collected: Number(summary.total_cash_collected),
      pending_settlement_cash: Number(summary.pending_settlement_cash)
    });
  } catch (err) {
    console.error("SHIFT SUMMARY ERROR:", err);
    res.status(500).json({ message: "Error obteniendo resumen de turno" });
  }
});

// 15. Liquidar turno de repartidor en caja (Admin)
router.post("/settle-shift", auth, adminOnly, async (req, res) => {
  try {
    const driverUserId = Number(req.body.driver_user_id);
    if (!driverUserId) {
      return res.status(400).json({ message: "ID de repartidor requerido" });
    }

    const result = await pool.query(`
      UPDATE orders
      SET driver_settled = TRUE
      WHERE delivery_driver_id = $1
        AND status = 'entregado'
        AND driver_settled = FALSE
      RETURNING id, total
    `, [driverUserId]);

    const settledTotal = result.rows.reduce((sum, r) => sum + Number(r.total), 0);

    res.json({
      ok: true,
      settled_orders_count: result.rows.length,
      settled_total: settledTotal,
      message: `Corte liquidado: ${result.rows.length} pedidos por un total de $${settledTotal.toFixed(2)}`
    });
  } catch (err) {
    console.error("SETTLE SHIFT ERROR:", err);
    res.status(500).json({ message: "Error liquidando turno" });
  }
});

module.exports = router;
