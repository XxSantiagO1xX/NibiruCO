const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const dispatchEngine = require("../services/dispatchEngine");
const pushNotification = require("../services/pushNotification");
const { getBusinessDateStr } = require("../utils/timezone");

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
    const businessDayStr = getBusinessDateStr();

    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.phone,
        u.email,
        u.role,
        u.short_code,
        u.avatar_url,
        COALESCE(u.driver_status, 'offline') AS driver_status,
        u.driver_status_updated_at,
        u.driver_last_completed_at,
        COALESCE(
          (SELECT COUNT(*)::int
           FROM delivery_trips dt
           WHERE dt.driver_user_id = u.id
             AND dt.created_at >= $1::date
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
         ORDER BY dao.id DESC LIMIT 1) AS active_offer_remaining_seconds,
        (SELECT s.id FROM driver_shifts s
         WHERE s.driver_user_id = u.id AND s.status = 'open'
         ORDER BY s.id DESC LIMIT 1) AS active_shift_id
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
    `, [businessDayStr]);
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
      return res.json({ active_offer: null, offer: null });
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

    const offerPayload = {
      ...offer,
      remaining_seconds: Math.max(0, Number(offer.remaining_seconds || 0)),
      seconds_left: Math.max(0, Number(offer.remaining_seconds || 0)),
      total_cash_to_collect: totalCashToCollect,
      total_amount: orders.reduce((sum, o) => sum + o.total, 0),
      orders
    };

    res.json({
      active_offer: offerPayload,
      offer: offerPayload
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
      return res.json({ trip: null, stops: [], active_trip: null });
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

    const formattedStops = stopsRes.rows.map((s) => ({
      ...s,
      total: Number(s.total),
      order_total: Number(s.total),
      delivery_fee: Number(s.delivery_fee || 0),
      cash_paid_with: s.cash_paid_with ? Number(s.cash_paid_with) : null,
      cash_change_due: s.cash_change_due ? Number(s.cash_change_due) : null
    }));

    res.json({
      trip,
      stops: formattedStops,
      active_trip: {
        ...trip,
        stops: formattedStops
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

// 8. Marcar llegada al domicilio (Repartidor) — Dispara notificación en vivo al cliente
// 8. Marcar llegada a la parada (Repartidor) — Evento "Ya llegué"
router.patch("/stops/:id/arrived", auth, driverOrAdmin, async (req, res) => {
  try {
    const stopId = Number(req.params.id);

    // Obtener parada y validar autorización
    const stopRes = await pool.query(`
      SELECT dts.*, dt.driver_user_id, o.id AS order_id, o.folio, o.user_id AS customer_user_id, drv.name AS driver_name
      FROM delivery_trip_stops dts
      JOIN delivery_trips dt ON dt.id = dts.trip_id
      JOIN orders o ON o.id = dts.order_id
      JOIN users drv ON drv.id = dt.driver_user_id
      WHERE dts.id = $1
    `, [stopId]);

    if (!stopRes.rows.length) {
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = stopRes.rows[0];

    // Validación de pertenencia si el usuario es repartidor (admin tiene override)
    if (req.user.role === "repartidor" && Number(stop.driver_user_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "No tienes autorización para modificar paradas de otro repartidor" });
    }

    const result = await pool.query(`
      UPDATE delivery_trip_stops
      SET status = 'arrived', arrived_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [stopId]);

    const updatedStop = result.rows[0];

    const io = req.app.get("io");
    if (io) {
      // Evento privado enviado únicamente a los rooms del pedido y del cliente dueño
      if (stop.order_id) {
        io.to(`order_${stop.order_id}`).emit("stop-arrived", {
          stop_id: updatedStop.id,
          order_id: stop.order_id,
          arrived_at: updatedStop.arrived_at,
          tracking_stage: "repartidor_llego",
          message: "¡Tu repartidor ya llegó a tu domicilio!"
        });
      }
      if (stop.customer_user_id) {
        io.to(`user_${stop.customer_user_id}`).emit("stop-arrived", {
          stop_id: updatedStop.id,
          order_id: stop.order_id,
          arrived_at: updatedStop.arrived_at,
          tracking_stage: "repartidor_llego",
          message: "¡Tu repartidor ya llegó a tu domicilio!"
        });
      }

      // Señales genéricas operativas para choferes y mostrador (sin datos privados del cliente)
      io.emit("delivery-updated", { trip_id: updatedStop.trip_id, driver_id: stop.driver_user_id });
      io.emit("orders-updated");
      io.emit("counter-updated");
    }

    // Push notification al cliente
    if (stop.customer_user_id) {
      pushNotification.notifyCustomerDeliveryArrived(stop.customer_user_id, {
        folio: stop.folio,
        driver_name: stop.driver_name
      }).catch((pushErr) => {
        console.error("Push customer arrived error:", pushErr?.message || pushErr);
      });
    }

    res.json(updatedStop);
  } catch (err) {
    console.error("STOP ARRIVED ERROR:", err);
    res.status(500).json({ message: "Error marcando llegada" });
  }
});

// 9. Validar PIN de entrega (Repartidor) — Con registro de cobro físico y vínculo a turno
router.post("/stops/:id/verify-pin", auth, driverOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const stopId = Number(req.params.id);
    const pin = String(req.body.pin || "").trim();
    const driverUserId = req.user.id;

    if (!pin) {
      return res.status(400).json({ message: "Introduce el PIN de entrega proporcionado por el cliente" });
    }

    const stopRes = await client.query(`
      SELECT dts.*, dt.driver_user_id, o.delivery_pin, o.total, o.payment_method, o.cash_paid_with, o.cash_change_due, o.user_id AS customer_user_id
      FROM delivery_trip_stops dts
      JOIN delivery_trips dt ON dt.id = dts.trip_id
      JOIN orders o ON o.id = dts.order_id
      WHERE dts.id = $1
    `, [stopId]);

    if (!stopRes.rows.length) {
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = stopRes.rows[0];

    // Validación de pertenencia si el usuario es repartidor (admin tiene override)
    if (req.user.role === "repartidor" && Number(stop.driver_user_id) !== Number(driverUserId)) {
      return res.status(403).json({ message: "No tienes autorización para modificar paradas de otro repartidor" });
    }

    if (stop.delivery_pin !== pin) {
      return res.status(400).json({ message: "PIN incorrecto. Pídele al cliente que revise su app de MealOps." });
    }

    await client.query("BEGIN");

    // Consultar turno activo del repartidor
    const shiftRes = await client.query(`
      SELECT id FROM driver_shifts
      WHERE driver_user_id = $1 AND status = 'open'
      ORDER BY id DESC LIMIT 1
    `, [driverUserId]);
    const activeShiftId = shiftRes.rows.length ? shiftRes.rows[0].id : null;

    // 1. Marcar parada como entregada
    await client.query(`
      UPDATE delivery_trip_stops
      SET status = 'delivered', delivered_at = NOW()
      WHERE id = $1
    `, [stopId]);

    // 2. Actualizar pedido con estado y fuente de cobro
    const isCash = stop.payment_method === "efectivo";
    await client.query(`
      UPDATE orders
      SET status = 'entregado',
          payment_status = 'paid',
          paid_at = COALESCE(paid_at, NOW()),
          delivery_pin_validated_at = NOW(),
          cash_received = total,
          payment_collected_by = CASE WHEN payment_collected_by IS NULL THEN 'driver' ELSE payment_collected_by END,
          payment_collector_user_id = CASE WHEN payment_collector_user_id IS NULL THEN $2 ELSE payment_collector_user_id END,
          payment_collected_at = COALESCE(payment_collected_at, NOW()),
          cash_collected_amount = CASE WHEN $3 = TRUE THEN total ELSE 0 END,
          shift_id = COALESCE(shift_id, $4)
      WHERE id = $1
    `, [stop.order_id, driverUserId, isCash, activeShiftId]);

    // 3. Verificar si quedan paradas en el viaje
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
      io.emit("delivery-updated", { trip_id: stop.trip_id, driver_id: driverUserId });
      io.emit("shift-updated", { driver_id: driverUserId, shift_id: activeShiftId });
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

// 10. Excepción manual de entrega por Admin (Override)
router.post("/stops/:id/admin-override", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const stopId = Number(req.params.id);
    const reason = String(req.body.reason || "").trim();

    if (!reason) {
      return res.status(400).json({ message: "Debes registrar el motivo de la excepción de entrega" });
    }

    const stopRes = await client.query(`
      SELECT dts.*, o.total, o.payment_method, dt.driver_user_id
      FROM delivery_trip_stops dts
      JOIN orders o ON o.id = dts.order_id
      JOIN delivery_trips dt ON dt.id = dts.trip_id
      WHERE dts.id = $1
    `, [stopId]);

    if (!stopRes.rows.length) {
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = stopRes.rows[0];
    const driverUserId = stop.driver_user_id;

    await client.query("BEGIN");

    const shiftRes = await client.query(`
      SELECT id FROM driver_shifts
      WHERE driver_user_id = $1 AND status = 'open'
      ORDER BY id DESC LIMIT 1
    `, [driverUserId]);
    const activeShiftId = shiftRes.rows.length ? shiftRes.rows[0].id : null;

    await client.query(`
      UPDATE delivery_trip_stops
      SET status = 'delivered', delivered_at = NOW()
      WHERE id = $1
    `, [stopId]);

    const isCash = stop.payment_method === "efectivo";
    await client.query(`
      UPDATE orders
      SET status = 'entregado',
          payment_status = 'paid',
          paid_at = COALESCE(paid_at, NOW()),
          delivery_admin_override = TRUE,
          delivery_admin_override_reason = $1,
          cash_received = total,
          payment_collected_by = CASE WHEN payment_collected_by IS NULL THEN 'driver' ELSE payment_collected_by END,
          payment_collector_user_id = CASE WHEN payment_collector_user_id IS NULL THEN $3 ELSE payment_collector_user_id END,
          payment_collected_at = COALESCE(payment_collected_at, NOW()),
          cash_collected_amount = CASE WHEN $4 = TRUE THEN total ELSE 0 END,
          shift_id = COALESCE(shift_id, $5)
      WHERE id = $2
    `, [reason, stop.order_id, driverUserId, isCash, activeShiftId]);

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
      io.emit("delivery-updated", { trip_id: stop.trip_id, driver_id: driverUserId });
      io.emit("shift-updated", { driver_id: driverUserId, shift_id: activeShiftId });
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

// 11. Reportar incidencia en parada (Repartidor) — Crea registro en Centro de Incidencias
router.post("/stops/:id/report-issue", auth, driverOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const stopId = Number(req.params.id);
    const category = String(req.body.category || "Problema en entrega").trim();
    const description = String(req.body.description || req.body.reason || "Incidencia reportada por repartidor").trim();
    const priority = ["baja", "media", "alta", "urgente"].includes(req.body.priority) ? req.body.priority : "media";
    const driverUserId = req.user.id;

    await client.query("BEGIN");

    const stopRes = await client.query(`
      SELECT dts.*, dt.driver_user_id, o.folio
      FROM delivery_trip_stops dts
      JOIN delivery_trips dt ON dt.id = dts.trip_id
      JOIN orders o ON o.id = dts.order_id
      WHERE dts.id = $1
    `, [stopId]);

    if (!stopRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Parada no encontrada" });
    }

    const stop = stopRes.rows[0];

    // Validación de pertenencia si el usuario es repartidor (admin tiene override)
    if (req.user.role === "repartidor" && Number(stop.driver_user_id) !== Number(driverUserId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No tienes autorización para reportar incidencias en paradas de otro repartidor" });
    }

    // 1. Marcar parada como failed
    await client.query(`
      UPDATE delivery_trip_stops
      SET status = 'failed', failed_at = NOW(), fail_reason = $1
      WHERE id = $2
    `, [description, stopId]);

    // 2. Insertar en delivery_incidents
    const incRes = await client.query(`
      INSERT INTO delivery_incidents
        (stop_id, trip_id, order_id, driver_user_id, category, description, priority, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'nueva')
      RETURNING *
    `, [stopId, stop.trip_id, stop.order_id, driverUserId, category, description, priority]);

    const incident = incRes.rows[0];

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("incident-created", {
        incident: {
          ...incident,
          folio: stop.folio,
          driver_name: req.user.name
        },
        message: `🚨 Nueva Incidencia [${category}]: Pedido F${String(stop.folio).padStart(3, "0")}`
      });
      io.emit("delivery-updated", { trip_id: stop.trip_id, driver_id: driverUserId });
      io.emit("orders-updated");
      io.emit("counter-updated");
    }

    res.status(201).json({ ok: true, message: "Incidencia registrada exitosamente", incident });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("REPORT ISSUE ERROR:", err);
    res.status(500).json({ message: "Error reportando incidencia" });
  } finally {
    client.release();
  }
});

// 12. Centro de Incidencias Operativo (Admin)
router.get("/incidents", auth, staffRoles, async (req, res) => {
  try {
    const { status, priority, driver_id } = req.query;
    const businessDayStr = getBusinessDateStr();

    let query = `
      SELECT
        di.*,
        o.folio AS order_folio,
        o.total AS order_total,
        o.customer_name,
        ua.address AS delivery_address,
        u.name AS driver_name,
        u.phone AS driver_phone,
        u.short_code AS driver_short_code,
        u.avatar_url AS driver_avatar_url,
        dt.trip_folio,
        ru.name AS resolved_by_name
      FROM delivery_incidents di
      LEFT JOIN orders o ON o.id = di.order_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN users u ON u.id = di.driver_user_id
      LEFT JOIN delivery_trips dt ON dt.id = di.trip_id
      LEFT JOIN users ru ON ru.id = di.resolved_by
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== "todos") {
      params.push(status);
      query += ` AND di.status = $${params.length}`;
    }
    if (priority && priority !== "todos") {
      params.push(priority);
      query += ` AND di.priority = $${params.length}`;
    }
    if (driver_id) {
      params.push(Number(driver_id));
      query += ` AND di.driver_user_id = $${params.length}`;
    }

    query += ` ORDER BY CASE WHEN di.status = 'nueva' THEN 1 WHEN di.status = 'en_revision' THEN 2 ELSE 3 END, di.created_at DESC`;

    const result = await pool.query(query, params);

    // Calcular KPIs
    const kpisRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'nueva')::int AS nuevas,
        COUNT(*) FILTER (WHERE status = 'en_revision')::int AS en_revision,
        COUNT(*) FILTER (WHERE status = 'resuelta' AND resolved_at::date = $1::date)::int AS resueltas_hoy
      FROM delivery_incidents
    `, [businessDayStr]);

    const kpis = kpisRes.rows[0] || { nuevas: 0, en_revision: 0, resueltas_hoy: 0 };

    res.json({
      incidents: result.rows,
      kpis
    });
  } catch (err) {
    console.error("GET INCIDENTS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo incidencias" });
  }
});

router.get("/incidents/:id", auth, staffRoles, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query(`
      SELECT
        di.*,
        o.folio AS order_folio,
        o.total AS order_total,
        o.customer_name,
        ua.address AS delivery_address,
        u.name AS driver_name,
        u.phone AS driver_phone,
        u.short_code AS driver_short_code,
        u.avatar_url AS driver_avatar_url,
        dt.trip_folio,
        ru.name AS resolved_by_name
      FROM delivery_incidents di
      LEFT JOIN orders o ON o.id = di.order_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN users u ON u.id = di.driver_user_id
      LEFT JOIN delivery_trips dt ON dt.id = di.trip_id
      LEFT JOIN users ru ON ru.id = di.resolved_by
      WHERE di.id = $1
    `, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "Incidencia no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET INCIDENT ERROR:", err);
    res.status(500).json({ message: "Error obteniendo detalle de incidencia" });
  }
});

router.patch("/incidents/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, admin_notes } = req.body;

    const validStatuses = ["nueva", "en_revision", "resuelta", "cerrada"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Estado de incidencia inválido" });
    }

    const isResolved = ["resuelta", "cerrada"].includes(status);

    const result = await pool.query(`
      UPDATE delivery_incidents
      SET status = COALESCE($1, status),
          admin_notes = COALESCE($2, admin_notes),
          resolved_by = CASE WHEN $3 = TRUE THEN $4 ELSE resolved_by END,
          resolved_at = CASE WHEN $3 = TRUE THEN NOW() ELSE resolved_at END,
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [status, admin_notes, isResolved, req.user.id, id]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "Incidencia no encontrada" });
    }

    const updated = result.rows[0];
    const io = req.app.get("io");
    if (io) {
      io.emit("incident-updated", updated);
      if (isResolved) io.emit("incident-resolved", updated);
    }

    res.json(updated);
  } catch (err) {
    console.error("UPDATE INCIDENT ERROR:", err);
    res.status(500).json({ message: "Error actualizando incidencia" });
  }
});

// 13. Actualización de ubicación GPS del repartidor
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

// 14. Tracking en vivo para el cliente — Aislamiento de privacidad total y 9 etapas operativas
router.get("/orders/:id/track", auth, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.user.id;

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
        o.ready_at,
        o.delivery_lat AS customer_lat,
        o.delivery_lng AS customer_lng,
        dts.id AS stop_id,
        dts.stop_order,
        dts.status AS stop_status,
        dts.eta_minutes,
        dts.eta_min_minutes,
        dts.eta_max_minutes,
        dts.estimated_arrival_at,
        dts.eta_source,
        dts.arrived_at,
        dts.delivered_at,
        dt.id AS trip_id,
        dt.trip_folio,
        dt.driver_user_id AS driver_id,
        dt.status AS trip_status,
        dt.current_lat AS driver_lat,
        dt.current_lng AS driver_lng,
        drv.name AS driver_name,
        drv.phone AS driver_phone,
        drv.short_code AS driver_short_code,
        drv.avatar_url AS driver_avatar_url,
        drv.driver_status AS driver_status,
        (SELECT dao.id FROM delivery_assignment_offers dao
         WHERE o.id = ANY(dao.order_ids) AND dao.status = 'pending' AND dao.expires_at > NOW()
         LIMIT 1) AS active_offer_id
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

    // Calcular paradas previas sin exponer datos sensibles de otros clientes
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

    // Determinar etapa operativa dominante (10 etapas unificadas conceptuales)
    let trackingStage = "confirmado";
    if (order.status === "entregado" || order.stop_status === "delivered") {
      trackingStage = "entregado";
    } else if (order.stop_status === "arrived") {
      trackingStage = "repartidor_llego";
    } else if (order.trip_status === "in_transit") {
      const remainingEta = order.eta_minutes || 15;
      if (stopsBefore === 0 && remainingEta <= 5) {
        trackingStage = "repartidor_cercano";
      } else {
        trackingStage = "en_ruta";
      }
    } else if (order.trip_status === "assigned") {
      if (order.driver_status === "esperando_recogida") {
        trackingStage = "esperando_recogida";
      } else {
        trackingStage = "repartidor_asignado";
      }
    } else if (order.active_offer_id) {
      trackingStage = "buscando_repartidor";
    } else if (order.status === "listo") {
      trackingStage = "listo";
    } else if (["preparando", "aceptado"].includes(order.status)) {
      trackingStage = "preparando";
    } else {
      trackingStage = "confirmado";
    }

    // Formatear rango de ETA
    const baseEta = order.eta_minutes || 25;
    const minEta = order.eta_min_minutes || Math.max(1, baseEta - 3);
    const maxEta = order.eta_max_minutes || (baseEta + 5);
    const etaRange = `${minEta}–${maxEta} min`;

    res.json({
      order_id: order.id,
      folio: order.folio,
      status: order.status,
      tracking_stage: trackingStage,
      eta_source: order.eta_source || "heuristic",
      eta_minutes: baseEta,
      eta_range: etaRange,
      estimated_arrival_at: order.estimated_arrival_at,
      delivery_pin: order.delivery_pin,
      driver_info: order.driver_name ? {
        id: order.driver_id,
        name: order.driver_name,
        short_code: order.driver_short_code || "REP-01",
        avatar_url: order.driver_avatar_url || null,
        phone: order.driver_phone
      } : null,
      driver_lat: order.driver_lat,
      driver_lng: order.driver_lng,
      customer_lat: order.customer_lat,
      customer_lng: order.customer_lng,
      stops_before: stopsBefore,
      arrived_at: order.arrived_at,
      delivered_at: order.delivered_at
    });
  } catch (err) {
    console.error("GET ORDER TRACK ERROR:", err);
    res.status(500).json({ message: "Error obteniendo tracking del pedido" });
  }
});

// 15. Turnos Operativos de Repartidores & Liquidaciones Reales
router.post("/shifts/start", auth, driverOrAdmin, async (req, res) => {
  try {
    const driverUserId = req.user.role === "admin" && req.body.driver_user_id
      ? Number(req.body.driver_user_id)
      : req.user.id;
    const initialFloat = Number(req.body.initial_cash_float || 0);
    const businessDayStr = getBusinessDateStr();

    // Verificar si ya tiene un turno abierto
    const existingRes = await pool.query(`
      SELECT * FROM driver_shifts
      WHERE driver_user_id = $1 AND status = 'open'
      ORDER BY id DESC LIMIT 1
    `, [driverUserId]);

    if (existingRes.rows.length) {
      return res.json({
        ok: true,
        message: "Turno ya se encontraba abierto",
        shift: existingRes.rows[0]
      });
    }

    const result = await pool.query(`
      INSERT INTO driver_shifts
        (driver_user_id, shift_date, started_at, status, initial_cash_float, settlement_status)
      VALUES ($1, $2::date, NOW(), 'open', $3, 'pendiente')
      RETURNING *
    `, [driverUserId, businessDayStr, initialFloat]);

    const shift = result.rows[0];
    const io = req.app.get("io");
    if (io) io.emit("shift-started", shift);

    res.status(201).json({
      ok: true,
      message: "Turno iniciado exitosamente",
      shift
    });
  } catch (err) {
    console.error("START SHIFT ERROR:", err);
    res.status(500).json({ message: "Error iniciando turno de repartidor" });
  }
});

router.post("/shifts/end", auth, driverOrAdmin, async (req, res) => {
  try {
    const driverUserId = req.user.role === "admin" && req.body.driver_user_id
      ? Number(req.body.driver_user_id)
      : req.user.id;

    const result = await pool.query(`
      UPDATE driver_shifts
      SET status = 'closed', ended_at = NOW()
      WHERE driver_user_id = $1 AND status = 'open'
      RETURNING *
    `, [driverUserId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "No se encontró un turno abierto para cerrar" });
    }

    const shift = result.rows[0];
    const io = req.app.get("io");
    if (io) io.emit("shift-ended", shift);

    res.json({
      ok: true,
      message: "Turno cerrado exitosamente",
      shift
    });
  } catch (err) {
    console.error("END SHIFT ERROR:", err);
    res.status(500).json({ message: "Error cerrando turno de repartidor" });
  }
});

// 16. Resumen Contable Exacto de Turno y Corte de Repartidor
router.get("/shift-summary", auth, driverOrAdmin, async (req, res) => {
  try {
    const driverId = req.user.role === "admin" && req.query.driver_id
      ? Number(req.query.driver_id)
      : req.user.id;
    const requestedShiftId = req.query.shift_id ? Number(req.query.shift_id) : null;
    const businessDayStr = getBusinessDateStr();

    // Obtener el turno objetivo
    let shift = null;
    if (requestedShiftId) {
      const shiftRes = await pool.query(`SELECT * FROM driver_shifts WHERE id = $1`, [requestedShiftId]);
      shift = shiftRes.rows[0] || null;
    } else {
      const shiftRes = await pool.query(`
        SELECT * FROM driver_shifts
        WHERE driver_user_id = $1 AND (status = 'open' OR shift_date = $2::date)
        ORDER BY CASE WHEN status = 'open' THEN 1 ELSE 2 END, id DESC
        LIMIT 1
      `, [driverId, businessDayStr]);
      shift = shiftRes.rows[0] || null;
    }

    const shiftId = shift ? shift.id : null;
    const initialFloat = shift ? Number(shift.initial_cash_float || 0) : 0;

    // Obtener entregas completadas en este turno / fecha
    const deliveriesRes = await pool.query(`
      SELECT
        o.id,
        o.folio,
        dt.trip_folio,
        o.customer_name,
        COALESCE(o.delivery_pin_validated_at, o.paid_at, o.created_at) AS delivery_time,
        o.payment_method,
        o.payment_collected_by,
        o.total AS order_total,
        o.cash_paid_with,
        o.cash_change_due,
        COALESCE(o.cash_collected_amount, CASE WHEN o.payment_collected_by = 'driver' AND o.payment_method = 'efectivo' THEN o.total ELSE 0 END) AS cash_collected_amount,
        o.status,
        di.category AS incident_category
      FROM orders o
      LEFT JOIN delivery_trip_stops dts ON dts.order_id = o.id
      LEFT JOIN delivery_trips dt ON dt.id = dts.trip_id
      LEFT JOIN delivery_incidents di ON di.order_id = o.id
      WHERE (
        ($1::bigint IS NOT NULL AND o.shift_id = $1)
        OR (
          $1::bigint IS NULL AND o.delivery_driver_id = $2
          AND (o.service_date = $3::date OR o.created_at::date = $3::date)
        )
      )
      ORDER BY o.id ASC
    `, [shiftId, driverId, businessDayStr]);

    const completedDeliveries = deliveriesRes.rows.map((d) => ({
      ...d,
      total: Number(d.order_total),
      order_total: Number(d.order_total),
      cash_paid_with: d.cash_paid_with ? Number(d.cash_paid_with) : (d.payment_collected_by === "driver" && d.payment_method === "efectivo" ? Number(d.order_total) : null),
      cash_change_due: d.cash_change_due ? Number(d.cash_change_due) : 0,
      cash_collected_amount: Number(d.cash_collected_amount || 0)
    }));

    // Conteo de paradas
    const stopsCountRes = await pool.query(`
      SELECT
        COUNT(dts.id)::int AS assigned_stops_count,
        COUNT(dts.id) FILTER (WHERE dts.status = 'delivered')::int AS delivered_count,
        COUNT(dts.id) FILTER (WHERE dts.status = 'failed')::int AS failed_count
      FROM delivery_trip_stops dts
      JOIN delivery_trips dt ON dt.id = dts.trip_id
      WHERE dt.driver_user_id = $1
        AND (
          ($3::bigint IS NOT NULL AND dt.id IN (SELECT DISTINCT trip_id FROM delivery_trip_stops WHERE order_id IN (SELECT id FROM orders WHERE shift_id = $3)))
          OR ($3::bigint IS NULL AND dt.created_at >= $2::date)
        )
    `, [driverId, businessDayStr, shiftId]);

    const stopsCounts = stopsCountRes.rows[0] || { assigned_stops_count: 0, delivered_count: 0, failed_count: 0 };

    // Desglose de efectivo
    const driverCashOrders = completedDeliveries.filter((d) => d.payment_collected_by === "driver" && d.payment_method === "efectivo");
    const grossCashReceived = driverCashOrders.reduce((sum, d) => sum + (d.cash_paid_with || d.order_total), 0);
    const totalCashChangeGiven = driverCashOrders.reduce((sum, d) => sum + (d.cash_change_due || 0), 0);
    const netCashForBusiness = driverCashOrders.reduce((sum, d) => sum + d.cash_collected_amount, 0);

    const prepaidBusinessOrders = completedDeliveries.filter((d) => d.payment_collected_by === "business" || ["tarjeta", "transferencia", "pago_en_app"].includes(d.payment_method));
    const prepaidBusinessAmount = prepaidBusinessOrders.reduce((sum, d) => sum + d.order_total, 0);

    const totalCashExpected = netCashForBusiness + initialFloat;

    // Obtener abonos registrados
    let settlementEntries = [];
    if (shiftId) {
      const entriesRes = await pool.query(`
        SELECT dse.*, u.name AS received_by_name
        FROM driver_settlement_entries dse
        JOIN users u ON u.id = dse.received_by
        WHERE dse.shift_id = $1
        ORDER BY dse.created_at ASC
      `, [shiftId]);
      settlementEntries = entriesRes.rows.map((e) => ({
        ...e,
        amount: Number(e.amount)
      }));
    }

    const totalCashSettled = settlementEntries.reduce((sum, e) => sum + e.amount, 0);
    const pendingSettlement = Math.max(0, totalCashExpected - totalCashSettled);
    const difference = totalCashSettled - totalCashExpected;

    let settlementStatus = "pendiente";
    if (totalCashSettled >= totalCashExpected && totalCashExpected > 0) {
      settlementStatus = "liquidado";
    } else if (totalCashSettled > 0) {
      settlementStatus = "parcial";
    } else if (difference < 0 && shift?.status === "closed") {
      settlementStatus = "diferencia";
    }

    res.json({
      shift_id: shiftId,
      driver_id: driverId,
      shift_date: shift?.shift_date || businessDayStr,
      started_at: shift?.started_at || null,
      ended_at: shift?.ended_at || null,
      status: shift?.status || "open",
      assigned_stops_count: stopsCounts.assigned_stops_count,
      delivered_count: stopsCounts.delivered_count,
      failed_count: stopsCounts.failed_count,
      gross_cash_received: grossCashReceived,
      total_cash_change_given: totalCashChangeGiven,
      net_cash_for_business: netCashForBusiness,
      prepaid_business_amount: prepaidBusinessAmount,
      initial_cash_float: initialFloat,
      total_cash_expected: totalCashExpected,
      total_cash_settled: totalCashSettled,
      pending_settlement: pendingSettlement,
      difference,
      settlement_status: settlementStatus,
      settlement_entries: settlementEntries,
      completed_deliveries: completedDeliveries
    });
  } catch (err) {
    console.error("SHIFT SUMMARY ERROR:", err);
    res.status(500).json({ message: "Error obteniendo resumen de turno" });
  }
});

// 17. Registrar abono de liquidación en caja (Admin)
router.post("/shifts/:id/settle", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const shiftId = Number(req.params.id);
    const amount = Number(req.body.amount);
    const notes = String(req.body.notes || "").trim();
    const receivedBy = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Monto de liquidación debe ser mayor a cero" });
    }

    await client.query("BEGIN");

    const shiftRes = await client.query(`SELECT * FROM driver_shifts WHERE id = $1`, [shiftId]);
    if (!shiftRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Turno no encontrado" });
    }

    const shift = shiftRes.rows[0];

    // 1. Insertar movimiento en driver_settlement_entries
    const entryRes = await client.query(`
      INSERT INTO driver_settlement_entries (shift_id, driver_user_id, amount, received_by, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [shiftId, shift.driver_user_id, amount, receivedBy, notes]);

    const entry = entryRes.rows[0];

    // 2. Recalcular total liquidado del turno
    const sumRes = await client.query(`
      SELECT SUM(amount)::numeric AS total_settled
      FROM driver_settlement_entries
      WHERE shift_id = $1
    `, [shiftId]);

    const totalSettled = Number(sumRes.rows[0].total_settled || 0);

    // 3. Actualizar resumen en driver_shifts
    await client.query(`
      UPDATE driver_shifts
      SET total_cash_settled = $1,
          settlement_status = CASE WHEN $1 >= total_cash_expected AND total_cash_expected > 0 THEN 'liquidado' ELSE 'parcial' END
      WHERE id = $2
    `, [totalSettled, shiftId]);

    // 4. Marcar pedidos como driver_settled
    await client.query(`
      UPDATE orders
      SET driver_settled = TRUE
      WHERE shift_id = $1
    `, [shiftId]);

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("shift-settled", {
        shift_id: shiftId,
        driver_user_id: shift.driver_user_id,
        entry
      });
    }

    res.status(201).json({
      ok: true,
      message: `Abono de $${amount.toFixed(2)} registrado con éxito`,
      entry,
      total_settled: totalSettled
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("SETTLE SHIFT ERROR:", err);
    res.status(500).json({ message: "Error registrando liquidación" });
  } finally {
    client.release();
  }
});

// 18. Reconciliación Administrativa de Viajes Stale
router.post("/admin/reconcile-stale-trips", auth, adminOnly, async (req, res) => {
  try {
    const io = req.app.get("io");
    await dispatchEngine.reconcileStaleTrips(pool, io);
    res.json({ ok: true, message: "Viajes inconsistentes reconciliados exitosamente" });
  } catch (err) {
    console.error("RECONCILE STALE TRIPS ERROR:", err);
    res.status(500).json({ message: "Error reconciliando viajes" });
  }
});

module.exports = router;
