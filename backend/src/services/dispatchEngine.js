const pool = require("../db");
const pushNotification = require("./pushNotification");

/**
 * Obtener la configuración actual de despacho
 */
async function getConfig(client = pool) {
  const res = await client.query(`
    SELECT *
    FROM delivery_dispatch_config
    WHERE id = 1
  `);
  if (res.rows.length) {
    const row = res.rows[0];
    return {
      dispatch_mode: row.dispatch_mode || "automatic",
      offer_timeout_seconds: Number(row.offer_timeout_seconds || 20),
      grouping_window_seconds: Number(row.grouping_window_seconds || 120),
      max_orders_per_trip: Number(row.max_orders_per_trip || 3),
      auto_dispatch_enabled: Boolean(row.auto_dispatch_enabled)
    };
  }
  return {
    dispatch_mode: "automatic",
    offer_timeout_seconds: 20,
    grouping_window_seconds: 120,
    max_orders_per_trip: 3,
    auto_dispatch_enabled: true
  };
}

/**
 * Actualizar configuración de despacho (Admin)
 */
async function updateConfig(newConfig, client = pool) {
  const current = await getConfig(client);
  const dispatchMode = newConfig.dispatch_mode && ["automatic", "manual"].includes(newConfig.dispatch_mode)
    ? newConfig.dispatch_mode
    : current.dispatch_mode;
  const timeoutSec = Number(newConfig.offer_timeout_seconds) >= 5
    ? Number(newConfig.offer_timeout_seconds)
    : current.offer_timeout_seconds;
  const groupingSec = Number(newConfig.grouping_window_seconds) >= 0
    ? Number(newConfig.grouping_window_seconds)
    : current.grouping_window_seconds;
  const maxPerTrip = Number(newConfig.max_orders_per_trip) >= 1
    ? Number(newConfig.max_orders_per_trip)
    : current.max_orders_per_trip;
  const autoEnabled = newConfig.auto_dispatch_enabled !== undefined
    ? Boolean(newConfig.auto_dispatch_enabled)
    : current.auto_dispatch_enabled;

  const res = await client.query(`
    UPDATE delivery_dispatch_config
    SET dispatch_mode = $1,
        offer_timeout_seconds = $2,
        grouping_window_seconds = $3,
        max_orders_per_trip = $4,
        auto_dispatch_enabled = $5,
        updated_at = NOW()
    WHERE id = 1
    RETURNING *
  `, [dispatchMode, timeoutSec, groupingSec, maxPerTrip, autoEnabled]);

  return res.rows[0];
}

/**
 * Obtener pedidos de domicilio listos para despacho que no estén asignados ni en oferta activa
 */
async function getPendingDeliveryOrders(client = pool) {
  const result = await client.query(`
    SELECT
      o.id,
      o.folio,
      o.total,
      o.status,
      o.created_at,
      o.ready_at,
      o.customer_name,
      o.payment_method,
      o.cash_paid_with,
      o.cash_change_due,
      o.delivery_fee,
      o.delivery_pin,
      u.name AS user_name,
      u.phone AS user_phone,
      ua.address,
      ua.details AS address_details,
      COALESCE(o.delivery_zone_id, 1) AS zone_id,
      COALESCE(dz.name, 'Zona General') AS zone_name,
      dz.estimated_min_minutes,
      dz.estimated_max_minutes
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN user_addresses ua ON ua.id = o.address_id
    LEFT JOIN delivery_zones dz ON dz.id = o.delivery_zone_id
    WHERE (o.service_type = 'domicilio' OR o.type = 'domicilio')
      AND o.status = 'listo'
      -- No tener un viaje activo asignado
      AND NOT EXISTS (
        SELECT 1
        FROM delivery_trip_stops dts
        JOIN delivery_trips dt ON dt.id = dts.trip_id
        WHERE dts.order_id = o.id
          AND dt.status IN ('assigned', 'in_transit')
      )
      -- No estar en una oferta activa pendiente
      AND NOT EXISTS (
        SELECT 1
        FROM delivery_assignment_offers dao
        WHERE o.id = ANY(dao.order_ids)
          AND dao.status = 'pending'
          AND dao.expires_at > NOW()
      )
    ORDER BY COALESCE(o.ready_at, o.created_at) ASC, o.id ASC
  `);

  return result.rows.map((row) => ({
    ...row,
    total: Number(row.total),
    delivery_fee: Number(row.delivery_fee || 0),
    cash_paid_with: row.cash_paid_with ? Number(row.cash_paid_with) : null,
    cash_change_due: row.cash_change_due ? Number(row.cash_change_due) : null,
    elapsed_ready_minutes: Math.max(0, Math.floor((Date.now() - new Date(row.ready_at || row.created_at).getTime()) / 60000))
  }));
}

/**
 * Obtener repartidores elegibles para recibir ofertas
 */
async function getEligibleDrivers(client = pool) {
  const result = await client.query(`
    SELECT
      u.id,
      u.name,
      u.phone,
      u.driver_status,
      u.driver_status_updated_at,
      u.driver_last_completed_at,
      -- Conteo de viajes completados hoy para balanceo de carga
      COALESCE(
        (SELECT COUNT(*)::int
         FROM delivery_trips dt
         WHERE dt.driver_user_id = u.id
           AND dt.created_at >= CURRENT_DATE
           AND dt.status = 'completed'),
        0
      ) AS completed_trips_today,
      -- Zona del último viaje
      COALESCE(
        (SELECT o.delivery_zone_id
         FROM delivery_trips dt
         JOIN delivery_trip_stops dts ON dts.trip_id = dt.id
         JOIN orders o ON o.id = dts.order_id
         WHERE dt.driver_user_id = u.id
         ORDER BY dt.id DESC LIMIT 1),
        NULL
      ) AS last_zone_id,
      -- Viaje asignado actual esperando recogida si existe
      (SELECT dt.id
       FROM delivery_trips dt
       WHERE dt.driver_user_id = u.id
         AND dt.status = 'assigned'
       LIMIT 1) AS waiting_pickup_trip_id,
      -- Conteo de paradas del viaje asignado actual
      COALESCE(
        (SELECT COUNT(dts.id)::int
         FROM delivery_trips dt
         JOIN delivery_trip_stops dts ON dts.trip_id = dt.id
         WHERE dt.driver_user_id = u.id
           AND dt.status = 'assigned'),
        0
      ) AS waiting_pickup_stops_count
    FROM users u
    WHERE u.role = 'repartidor'
      AND u.driver_status IN ('disponible', 'regresando', 'esperando_recogida')
      -- No tener una oferta pendiente activa
      AND NOT EXISTS (
        SELECT 1
        FROM delivery_assignment_offers dao
        WHERE dao.driver_user_id = u.id
          AND dao.status = 'pending'
          AND dao.expires_at > NOW()
      )
    ORDER BY u.id ASC
  `);

  return result.rows.map((r) => ({
    ...r,
    completed_trips_today: Number(r.completed_trips_today),
    waiting_pickup_stops_count: Number(r.waiting_pickup_stops_count),
    waiting_minutes_in_status: Math.max(0, Math.floor((Date.now() - new Date(r.driver_status_updated_at || Date.now()).getTime()) / 60000))
  }));
}

/**
 * Puntuación determinista y explicable para emparejar un grupo de pedidos con un repartidor
 */
function scoreCandidateDriver(driver, orderGroup) {
  let score = 0;
  const reasons = [];

  // 1. Estado de disponibilidad base
  if (driver.driver_status === "disponible") {
    score += 100;
    reasons.push("Repartidor disponible en base (+100 pts)");
  } else if (driver.driver_status === "esperando_recogida") {
    score += 80;
    reasons.push("Repartidor en restaurante esperando recogida (+80 pts)");
  } else if (driver.driver_status === "regresando") {
    score += 50;
    reasons.push("Repartidor regresando a restaurante (+50 pts)");
  }

  // 2. Balanceo de carga y rotación equitativa (menos viajes hoy = mayor prioridad)
  const tripPenalty = driver.completed_trips_today * 10;
  const rotationBonus = Math.max(0, 40 - tripPenalty);
  score += rotationBonus;
  reasons.push(`Rotación equitativa: ${driver.completed_trips_today} viajes hoy (+${rotationBonus} pts)`);

  // 3. Tiempo de espera en estatus actual (favorecer a quien lleva más tiempo esperando asignación)
  const waitingBonus = Math.min(20, Math.floor(driver.waiting_minutes_in_status * 0.5));
  if (waitingBonus > 0) {
    score += waitingBonus;
    reasons.push(`Tiempo en espera: ${driver.waiting_minutes_in_status} min (+${waitingBonus} pts)`);
  }

  // 4. Afinidad y compatibilidad de zona
  const primaryZoneId = orderGroup[0]?.zone_id;
  if (driver.last_zone_id && Number(driver.last_zone_id) === Number(primaryZoneId)) {
    score += 25;
    reasons.push(`Zona compatible: ${orderGroup[0]?.zone_name || 'Zona'} (+25 pts)`);
  }

  // 5. Antigüedad del pedido más viejo del grupo (Starvation prevention)
  const maxElapsedMinutes = Math.max(...orderGroup.map((o) => o.elapsed_ready_minutes || 0), 0);
  const urgencyBonus = Math.min(30, maxElapsedMinutes * 2);
  if (urgencyBonus > 0) {
    score += urgencyBonus;
    reasons.push(`Urgencia por espera de pedido: ${maxElapsedMinutes} min (+${urgencyBonus} pts)`);
  }

  return {
    score,
    recommendation_reason: reasons.join(" · ") + ` · Score final: ${score} pts`
  };
}

/**
 * Agrupar pedidos de forma inteligente respetando max_orders_per_trip y ventana de agrupación
 */
function groupOrders(pendingOrders, maxPerTrip) {
  if (!pendingOrders.length) return [];

  // Agrupación por zona
  const byZone = {};
  for (const ord of pendingOrders) {
    const zKey = ord.zone_id || "general";
    if (!byZone[zKey]) byZone[zKey] = [];
    byZone[zKey].push(ord);
  }

  const groups = [];
  for (const [_, zoneOrders] of Object.entries(byZone)) {
    for (let i = 0; i < zoneOrders.length; i += maxPerTrip) {
      groups.push(zoneOrders.slice(i, i + maxPerTrip));
    }
  }

  // Ordenar grupos por la antigüedad del pedido más viejo
  groups.sort((a, b) => {
    const aMin = Math.min(...a.map((o) => new Date(o.ready_at || o.created_at).getTime()));
    const bMin = Math.min(...b.map((o) => new Date(o.ready_at || o.created_at).getTime()));
    return aMin - bMin;
  });

  return groups;
}

/**
 * Evaluar la cola de despacho y generar ofertas automáticas
 */
async function evaluateDispatchQueue(io) {
  const client = await pool.connect();
  try {
    const config = await getConfig(client);

    // Si el modo es manual o auto dispatch está desactivado, no generamos ofertas automáticas
    if (config.dispatch_mode !== "automatic" || !config.auto_dispatch_enabled) {
      return { ok: true, message: "Modo manual activo. Asignación automática pausada." };
    }

    // 1. Revisar y expirar ofertas vencidas primero
    await checkExpiredOffers(io, client);

    // 2. Obtener pedidos pendientes de domicilio
    const pendingOrders = await getPendingDeliveryOrders(client);
    if (!pendingOrders.length) {
      return { ok: true, message: "Sin pedidos pendientes de despacho." };
    }

    // 3. Obtener repartidores elegibles
    const eligibleDrivers = await getEligibleDrivers(client);
    if (!eligibleDrivers.length) {
      return { ok: true, message: "Sin repartidores disponibles en este momento." };
    }

    // 4. Agrupar pedidos
    const orderGroups = groupOrders(pendingOrders, config.max_orders_per_trip);

    const generatedOffers = [];

    // Conjunto de choferes que ya recibieron oferta en este ciclo
    const assignedDriverIds = new Set();

    for (const group of orderGroups) {
      // Filtrar choferes disponibles que aún no hayan recibido oferta en este pase
      const availableCandidates = eligibleDrivers.filter((d) => !assignedDriverIds.has(d.id));
      if (!availableCandidates.length) break;

      // Calcular puntuación para cada candidato
      const scoredCandidates = availableCandidates.map((driver) => {
        const { score, recommendation_reason } = scoreCandidateDriver(driver, group);
        return { driver, score, recommendation_reason };
      });

      // Ordenar por mayor puntuación
      scoredCandidates.sort((a, b) => b.score - a.score);
      const winner = scoredCandidates[0];

      if (winner && winner.score > 0) {
        const orderIds = group.map((o) => o.id);
        const timeoutSeconds = config.offer_timeout_seconds;

        await client.query("BEGIN");

        // Crear la oferta exclusiva
        const offerRes = await client.query(`
          INSERT INTO delivery_assignment_offers
            (order_ids, driver_user_id, status, score, recommendation_reason, expires_at)
          VALUES
            ($1, $2, 'pending', $3, $4, NOW() + ($5 * INTERVAL '1 second'))
          RETURNING *
        `, [orderIds, winner.driver.id, winner.score, winner.recommendation_reason, timeoutSeconds]);

        const offer = offerRes.rows[0];

        // Actualizar estatus del repartidor
        await client.query(`
          UPDATE users
          SET driver_status = 'oferta_pendiente',
              driver_status_updated_at = NOW()
          WHERE id = $1
        `, [winner.driver.id]);

        await client.query("COMMIT");

        assignedDriverIds.add(winner.driver.id);
        generatedOffers.push(offer);

        // Enviar notificación Push al repartidor si tiene token registrado y activo
        pushNotification.notifyDriverOffer(winner.driver.id, offer, group, timeoutSeconds).catch((pushErr) => {
          console.error("Push offer dispatch error:", pushErr?.message || pushErr);
        });

        // Emitir eventos en tiempo real
        if (io) {
          const zoneName = group[0]?.zone_name || "Zona General";
          const totalAmount = group.reduce((sum, o) => sum + Number(o.total), 0);

          io.emit("delivery-offer-created", {
            offer_id: offer.id,
            driver_user_id: winner.driver.id,
            expires_at: offer.expires_at,
            timeout_seconds: timeoutSeconds,
            order_ids: orderIds,
            orders_count: group.length,
            zone_name: zoneName,
            total_amount: totalAmount,
            recommendation_reason: winner.recommendation_reason,
            orders: group.map((o) => ({
              id: o.id,
              folio: o.folio,
              customer_name: o.customer_name || o.user_name || "Cliente",
              address: o.address || "Dirección",
              total: o.total,
              payment_method: o.payment_method,
              cash_paid_with: o.cash_paid_with,
              cash_change_due: o.cash_change_due
            }))
          });

          io.emit("delivery-updated", { driver_id: winner.driver.id, offer_id: offer.id });
          io.emit("counter-updated");
          io.emit("orders-updated");
        }
      }
    }

    return {
      ok: true,
      offers_generated: generatedOffers.length,
      offers: generatedOffers
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("EVALUATE DISPATCH QUEUE ERROR:", err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Expirar ofertas vencidas y liberar repartidores de forma atómica
 */
async function checkExpiredOffers(io, client = pool) {
  try {
    const expiredRes = await client.query(`
      SELECT id, driver_user_id, order_ids
      FROM delivery_assignment_offers
      WHERE status = 'pending'
        AND expires_at <= NOW()
      FOR UPDATE SKIP LOCKED
    `);

    if (!expiredRes.rows.length) return [];

    const expiredList = [];

    for (const offer of expiredRes.rows) {
      await client.query(`
        UPDATE delivery_assignment_offers
        SET status = 'expired', responded_at = NOW()
        WHERE id = $1
      `, [offer.id]);

      // Verificar si el chofer tiene un viaje activo
      const tripCheck = await client.query(`
        SELECT id FROM delivery_trips
        WHERE driver_user_id = $1 AND status IN ('assigned', 'in_transit')
      `, [offer.driver_user_id]);

      if (!tripCheck.rows.length) {
        await client.query(`
          UPDATE users
          SET driver_status = 'disponible', driver_status_updated_at = NOW()
          WHERE id = $1 AND driver_status = 'oferta_pendiente'
        `, [offer.driver_user_id]);
      }

      expiredList.push(offer);

      if (io) {
        io.emit("delivery-offer-expired", {
          offer_id: offer.id,
          driver_user_id: offer.driver_user_id
        });
        io.emit("delivery-updated", { driver_id: offer.driver_user_id });
        io.emit("counter-updated");
      }
    }

    return expiredList;
  } catch (err) {
    console.error("CHECK EXPIRED OFFERS ERROR:", err);
    return [];
  }
}

/**
 * Aceptación atómica de una oferta por el repartidor
 */
async function acceptOffer(offerId, driverUserId, io) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Bloqueo exclusivo de la oferta
    const offerRes = await client.query(`
      SELECT *
      FROM delivery_assignment_offers
      WHERE id = $1
      FOR UPDATE
    `, [offerId]);

    if (!offerRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("La oferta no existe"), { status: 404 });
    }

    const offer = offerRes.rows[0];

    if (Number(offer.driver_user_id) !== Number(driverUserId)) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Esta oferta pertenece a otro repartidor"), { status: 403 });
    }

    if (offer.status !== "pending") {
      await client.query("ROLLBACK");
      throw Object.assign(new Error(`La oferta ya no está disponible (${offer.status})`), { status: 409 });
    }

    if (new Date(offer.expires_at).getTime() <= Date.now()) {
      await client.query(`
        UPDATE delivery_assignment_offers
        SET status = 'expired', responded_at = NOW()
        WHERE id = $1
      `, [offerId]);
      await client.query("COMMIT");
      throw Object.assign(new Error("El tiempo de la oferta ha expirado"), { status: 410 });
    }

    // 1. Marcar oferta como aceptada
    await client.query(`
      UPDATE delivery_assignment_offers
      SET status = 'accepted', responded_at = NOW()
      WHERE id = $1
    `, [offerId]);

    // 2. Crear el viaje confirmado (delivery_trips)
    const tripRes = await client.query(`
      INSERT INTO delivery_trips (driver_user_id, status)
      VALUES ($1, 'assigned')
      RETURNING *
    `, [driverUserId]);
    const trip = tripRes.rows[0];

    // 3. Crear paradas (delivery_trip_stops) y actualizar pedidos
    const stops = [];
    const orderIds = Array.isArray(offer.order_ids) ? offer.order_ids : [];

    for (let idx = 0; idx < orderIds.length; idx += 1) {
      const ordId = Number(orderIds[idx]);
      const stopOrder = idx + 1;
      const etaMinutes = 25 + idx * 10;

      const stopRes = await client.query(`
        INSERT INTO delivery_trip_stops (trip_id, order_id, stop_order, status, eta_minutes)
        VALUES ($1, $2, $3, 'pending', $4)
        RETURNING *
      `, [trip.id, ordId, stopOrder, etaMinutes]);

      await client.query(`
        UPDATE orders
        SET delivery_driver_id = $1
        WHERE id = $2
      `, [driverUserId, ordId]);

      stops.push(stopRes.rows[0]);
    }

    // 4. Vincular trip_id en la oferta
    await client.query(`
      UPDATE delivery_assignment_offers
      SET trip_id = $1
      WHERE id = $2
    `, [trip.id, offerId]);

    // 5. Actualizar estado del repartidor a esperando_recogida
    await client.query(`
      UPDATE users
      SET driver_status = 'esperando_recogida',
          driver_status_updated_at = NOW()
      WHERE id = $1
    `, [driverUserId]);

    await client.query("COMMIT");

    if (io) {
      io.emit("delivery-offer-accepted", { offer_id: offerId, trip_id: trip.id, driver_user_id: driverUserId });
      io.emit("delivery-updated", { trip_id: trip.id, driver_id: driverUserId });
      io.emit("counter-updated");
      io.emit("orders-updated");
    }

    return {
      ok: true,
      message: "Oferta aceptada y viaje confirmado.",
      trip: { ...trip, stops }
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rechazo de una oferta por el repartidor
 */
async function rejectOffer(offerId, driverUserId, reason = "Rechazado por repartidor", pauseDriver = false, io) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const offerRes = await client.query(`
      SELECT *
      FROM delivery_assignment_offers
      WHERE id = $1
      FOR UPDATE
    `, [offerId]);

    if (!offerRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Oferta no encontrada"), { status: 404 });
    }

    const offer = offerRes.rows[0];
    if (Number(offer.driver_user_id) !== Number(driverUserId)) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Esta oferta pertenece a otro repartidor"), { status: 403 });
    }

    if (offer.status !== "pending") {
      await client.query("ROLLBACK");
      return { ok: false, message: `La oferta ya estaba en estado ${offer.status}` };
    }

    await client.query(`
      UPDATE delivery_assignment_offers
      SET status = 'rejected', responded_at = NOW(), reject_reason = $1
      WHERE id = $2
    `, [reason, offerId]);

    const newDriverStatus = pauseDriver ? "pausa" : "disponible";
    await client.query(`
      UPDATE users
      SET driver_status = $1, driver_status_updated_at = NOW()
      WHERE id = $2
    `, [newDriverStatus, driverUserId]);

    await client.query("COMMIT");

    if (io) {
      io.emit("delivery-offer-rejected", { offer_id: offerId, driver_user_id: driverUserId });
      io.emit("delivery-updated", { driver_id: driverUserId });
      io.emit("counter-updated");
    }

    // Reevaluar cola inmediatamente para ofertar al siguiente candidato
    setTimeout(() => {
      evaluateDispatchQueue(io).catch((e) => console.error("AUTO DISPATCH AFTER REJECT ERROR:", e));
    }, 100);

    return { ok: true, message: "Oferta rechazada." };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancelación manual de oferta por Administrador
 */
async function cancelOffer(offerId, reason = "Cancelado por Administrador", io) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const offerRes = await client.query(`
      SELECT *
      FROM delivery_assignment_offers
      WHERE id = $1
      FOR UPDATE
    `, [offerId]);

    if (!offerRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Oferta no encontrada"), { status: 404 });
    }

    const offer = offerRes.rows[0];

    await client.query(`
      UPDATE delivery_assignment_offers
      SET status = 'cancelled', responded_at = NOW(), reject_reason = $1
      WHERE id = $2
    `, [reason, offerId]);

    // Regresar al chofer a disponible si no tiene viaje activo
    const tripCheck = await client.query(`
      SELECT id FROM delivery_trips
      WHERE driver_user_id = $1 AND status IN ('assigned', 'in_transit')
    `, [offer.driver_user_id]);

    if (!tripCheck.rows.length) {
      await client.query(`
        UPDATE users
        SET driver_status = 'disponible', driver_status_updated_at = NOW()
        WHERE id = $1 AND driver_status = 'oferta_pendiente'
      `, [offer.driver_user_id]);
    }

    await client.query("COMMIT");

    if (io) {
      io.emit("delivery-offer-cancelled", { offer_id: offerId, driver_user_id: offer.driver_user_id });
      io.emit("delivery-updated", { driver_id: offer.driver_user_id });
      io.emit("counter-updated");
    }

    return { ok: true, message: "Oferta cancelada exitosamente." };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Asignación manual / Override de Administrador
 */
async function adminForceAssign(driverUserId, orderIds, io) {
  const client = await pool.connect();
  try {
    if (!driverUserId || !Array.isArray(orderIds) || !orderIds.length) {
      throw Object.assign(new Error("Repartidor y pedidos requeridos"), { status: 400 });
    }

    await client.query("BEGIN");

    // 1. Cancelar cualquier oferta pendiente que contenga alguno de estos pedidos
    for (const ordId of orderIds) {
      const activeOffers = await client.query(`
        SELECT id, driver_user_id
        FROM delivery_assignment_offers
        WHERE $1 = ANY(order_ids) AND status = 'pending'
      `, [ordId]);

      for (const off of activeOffers.rows) {
        await client.query(`
          UPDATE delivery_assignment_offers
          SET status = 'cancelled', responded_at = NOW(), reject_reason = 'Reasignado manualmente por Administrador'
          WHERE id = $1
        `, [off.id]);

        if (Number(off.driver_user_id) !== Number(driverUserId)) {
          await client.query(`
            UPDATE users
            SET driver_status = 'disponible', driver_status_updated_at = NOW()
            WHERE id = $1 AND driver_status = 'oferta_pendiente'
          `, [off.driver_user_id]);
        }
      }
    }

    // 2. Crear el viaje
    const tripRes = await client.query(`
      INSERT INTO delivery_trips (driver_user_id, status)
      VALUES ($1, 'assigned')
      RETURNING *
    `, [driverUserId]);
    const trip = tripRes.rows[0];

    // 3. Crear paradas
    const stops = [];
    for (let i = 0; i < orderIds.length; i += 1) {
      const ordId = Number(orderIds[i]);
      const stopOrder = i + 1;
      const etaMinutes = 25 + i * 10;

      const stopRes = await client.query(`
        INSERT INTO delivery_trip_stops (trip_id, order_id, stop_order, status, eta_minutes)
        VALUES ($1, $2, $3, 'pending', $4)
        RETURNING *
      `, [trip.id, ordId, stopOrder, etaMinutes]);

      await client.query(`
        UPDATE orders
        SET delivery_driver_id = $1
        WHERE id = $2
      `, [driverUserId, ordId]);

      stops.push(stopRes.rows[0]);
    }

    // 4. Actualizar estado del repartidor a esperando_recogida
    await client.query(`
      UPDATE users
      SET driver_status = 'esperando_recogida', driver_status_updated_at = NOW()
      WHERE id = $1
    `, [driverUserId]);

    await client.query("COMMIT");

    if (io) {
      io.emit("delivery-updated", { trip_id: trip.id, driver_id: driverUserId });
      io.emit("counter-updated");
      io.emit("orders-updated");
    }

    return { ...trip, stops };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancelar ofertas pendientes asociadas a un pedido específico (ej. al completarse o cancelarse)
 */
async function cleanupPendingOffersForOrder(orderId, client = pool, reason = "Pedido entregado o cancelado") {
  const activeOffers = await client.query(`
    SELECT id, driver_user_id
    FROM delivery_assignment_offers
    WHERE $1 = ANY(order_ids) AND status = 'pending'
  `, [orderId]);

  for (const off of activeOffers.rows) {
    await client.query(`
      UPDATE delivery_assignment_offers
      SET status = 'cancelled', responded_at = NOW(), reject_reason = $1
      WHERE id = $2
    `, [reason, off.id]);

    const otherPending = await client.query(`
      SELECT 1 FROM delivery_assignment_offers
      WHERE driver_user_id = $1 AND status = 'pending' AND expires_at > NOW()
    `, [off.driver_user_id]);

    if (!otherPending.rows.length) {
      await client.query(`
        UPDATE users
        SET driver_status = 'disponible', driver_status_updated_at = NOW()
        WHERE id = $1 AND driver_status = 'oferta_pendiente'
      `, [off.driver_user_id]);
    }
  }
}

module.exports = {
  getConfig,
  updateConfig,
  getPendingDeliveryOrders,
  getEligibleDrivers,
  scoreCandidateDriver,
  groupOrders,
  evaluateDispatchQueue,
  checkExpiredOffers,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  adminForceAssign,
  cleanupPendingOffersForOrder
};

