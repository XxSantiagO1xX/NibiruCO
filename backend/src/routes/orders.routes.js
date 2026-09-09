const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const pool = require("../db");
const { getBusinessDayKey, getBusinessDateStr } = require("../utils/timezone");

function normalizeServiceType(value) {
  const normalized = String(value || "local").toLowerCase();
  const aliases = {
    pickup: "llevar",
    delivery: "domicilio"
  };
  const canonical = aliases[normalized] || normalized;
  const allowed = ["local", "llevar", "recoger", "domicilio"];
  return allowed.includes(canonical) ? canonical : "local";
}

function normalizePaymentMethod(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).toLowerCase();
  const aliases = {
    cash: "efectivo",
    card: "tarjeta"
  };
  const canonical = aliases[normalized] || normalized;
  return ["efectivo", "tarjeta", "transferencia", "pago_en_app", "otro"].includes(canonical)
    ? canonical
    : null;
}

async function validateComboChoices(client, comboProduct, rawChoices) {
  const groupsResult = await client.query(`
    SELECT id, name, min_select, max_select
    FROM combo_groups
    WHERE combo_product_id = $1
    ORDER BY sort_order, id
  `, [comboProduct.id]);

  const choices = Array.isArray(rawChoices) ? rawChoices : [];
  const normalized = [];
  let extraTotal = 0;
  let optionNeedsKitchen = false;

  for (const group of groupsResult.rows) {
    const selected = choices.filter((choice) => Number(choice.group_id) === Number(group.id));
    if (selected.length < Number(group.min_select) || selected.length > Number(group.max_select)) {
      throw Object.assign(
        new Error(`Selecciona ${group.min_select === group.max_select ? group.min_select : `${group.min_select}-${group.max_select}`} opción(es) en ${group.name}`),
        { status: 400 }
      );
    }

    for (const choice of selected) {
      const optionId = Number(choice.option_product_id);
      if (!Number.isInteger(optionId)) {
        throw Object.assign(new Error("Opción de combo inválida"), { status: 400 });
      }

      const optionResult = await client.query(`
        SELECT
          o.option_product_id,
          o.extra_price,
          p.name,
          p.available,
          p.kitchen_required
        FROM combo_group_options o
        JOIN products p ON p.id = o.option_product_id
        WHERE o.group_id = $1
          AND o.option_product_id = $2
          AND o.active = TRUE
      `, [group.id, optionId]);

      const option = optionResult.rows[0];
      if (!option) {
        throw Object.assign(new Error(`Una opción de ${group.name} ya no está disponible`), { status: 400 });
      }
      if (!option.available) {
        throw Object.assign(new Error(`Agotado: ${option.name}`), { status: 400 });
      }

      const extraPrice = Number(option.extra_price || 0);
      extraTotal += extraPrice;
      optionNeedsKitchen = optionNeedsKitchen || Boolean(option.kitchen_required);
      normalized.push({
        group_id: Number(group.id),
        group_name: group.name,
        option_product_id: Number(option.option_product_id),
        option_name: option.name,
        extra_price: extraPrice
      });
    }
  }

  if (!groupsResult.rows.length && choices.length) {
    throw Object.assign(new Error("Este combo no tiene opciones configuradas"), { status: 400 });
  }

  return { choices: normalized, extraTotal, optionNeedsKitchen };
}

router.get(
  "/admin/all",
  auth,
  roles(["cocina", "admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          o.*,
          u.name,
          u.phone,
          ua.address,
          ua.details,
          rt.name AS table_name,
          COALESCE(
            json_agg(
              json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'name', p.name,
                'quantity', oi.quantity,
                'status', oi.status,
                'kitchen_required', COALESCE(oi.kitchen_required, p.kitchen_required, TRUE),
                'product_kind', p.product_kind,
                'choices', COALESCE((
                  SELECT json_agg(
                    json_build_object(
                      'option_product_id', occ.option_product_id,
                      'name', op.name,
                      'quantity', occ.quantity,
                      'kitchen_required', COALESCE(op.kitchen_required, FALSE)
                    ) ORDER BY occ.id
                  )
                  FROM order_item_combo_choices occ
                  JOIN products op ON op.id = occ.option_product_id
                  WHERE occ.order_item_id = oi.id
                    AND op.kitchen_required = TRUE
                ), '[]'::json)
              ) ORDER BY oi.id
            ) FILTER (
              WHERE oi.id IS NOT NULL
                AND (
                  oi.kitchen_required = TRUE
                  OR p.kitchen_required = TRUE
                  OR EXISTS (
                    SELECT 1
                    FROM order_item_combo_choices occ2
                    JOIN products op2 ON op2.id = occ2.option_product_id
                    WHERE occ2.order_item_id = oi.id
                      AND op2.kitchen_required = TRUE
                  )
                )
            ),
            '[]'
          ) AS items
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN user_addresses ua ON ua.id = o.address_id
        LEFT JOIN table_sessions ts ON ts.id = o.table_session_id
        LEFT JOIN restaurant_tables rt ON rt.id = ts.table_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE (o.service_date = $1::date OR o.created_at::date = $1::date)
          AND o.status IN ('pendiente', 'aceptado', 'preparando')
          AND EXISTS (
            SELECT 1
            FROM order_items koi
            JOIN products kp ON kp.id = koi.product_id
            WHERE koi.order_id = o.id
              AND (
                koi.kitchen_required = TRUE
                OR kp.kitchen_required = TRUE
                OR EXISTS (
                  SELECT 1
                  FROM order_item_combo_choices kocc
                  JOIN products kop ON kop.id = kocc.option_product_id
                  WHERE kocc.order_item_id = koi.id
                    AND kop.kitchen_required = TRUE
                )
              )
          )
        GROUP BY o.id, u.id, ua.id, rt.id
        ORDER BY
          CASE
            WHEN o.status = 'preparando' THEN 1
            WHEN o.status = 'aceptado' THEN 2
            ELSE 3
          END,
          COALESCE(o.pickup_at, o.created_at) ASC,
          o.id ASC
      `, [getBusinessDateStr()]);

      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error obteniendo pedidos de cocina" });
    }
  }
);

router.post("/", auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      items,
      type,
      service_type,
      payment_method = null,
      mark_paid = false,
      customer_name = null,
      pickup_at = null,
      address_id = null,
      table_session_id = null,
      cash_paid_with = null,
      delivery_zone_id = null
    } = req.body;

    const userId = req.user.id;
    const overrideDay = req.query.override_day || req.headers["x-override-day"];
    const today = getBusinessDayKey(overrideDay);
    const staffCanCollect = ["mesero", "admin"].includes(req.user.role);
    let effectiveType = type || "local";
    let serviceType = normalizeServiceType(service_type || type);
    let tableSessionId = null;
    let customerName = customer_name ? String(customer_name).trim().slice(0, 120) : null;
    let pickupAt = pickup_at || null;
    let addressId = address_id === null || address_id === undefined || address_id === ""
      ? null
      : Number(address_id);
    let deliveryZoneId = delivery_zone_id ? Number(delivery_zone_id) : null;
    let deliveryFee = 0;
    let deliveryPin = null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No hay productos en el pedido" });
    }

    if (pickupAt && Number.isNaN(new Date(pickupAt).getTime())) {
      return res.status(400).json({ message: "Hora de recolección inválida" });
    }

    const paymentMethod = normalizePaymentMethod(payment_method);
    if (payment_method && !paymentMethod) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }

    if (mark_paid && !staffCanCollect) {
      return res.status(403).json({ message: "Solo el personal puede confirmar un pedido como pagado" });
    }
    if (mark_paid && !paymentMethod) {
      return res.status(400).json({ message: "Selecciona la forma de pago antes de marcar como pagado" });
    }

    if (addressId !== null && !Number.isInteger(addressId)) {
      return res.status(400).json({ message: "Dirección inválida" });
    }

    if (table_session_id !== null && table_session_id !== undefined) {
      if (!["mesero", "admin"].includes(req.user.role)) {
        return res.status(403).json({ message: "No tienes permisos para crear comandas de mesa" });
      }

      tableSessionId = Number(table_session_id);
      if (!Number.isInteger(tableSessionId)) {
        return res.status(400).json({ message: "Sesión de mesa inválida" });
      }

      const sessionResult = await client.query(`
        SELECT s.id, s.status, t.name
        FROM table_sessions s
        JOIN restaurant_tables t ON t.id = s.table_id
        WHERE s.id = $1
      `, [tableSessionId]);
      const session = sessionResult.rows[0];

      if (!session) return res.status(404).json({ message: "Sesión de mesa no encontrada" });
      if (session.status !== "open") {
        return res.status(409).json({ message: "La mesa tiene la cuenta solicitada o ya fue cerrada" });
      }

      serviceType = "mesa";
      effectiveType = session.name;
      customerName = null;
      pickupAt = null;
      addressId = null;
    } else {
      effectiveType = serviceType;

      if (serviceType !== "domicilio") {
        addressId = null;
        deliveryZoneId = null;
      } else {
        // Para domicilio generar PIN de 4 dígitos aleatorio
        deliveryPin = String(crypto.randomInt(1000, 10000));

        if (deliveryZoneId) {
          const zoneResult = await client.query(
            "SELECT fee FROM delivery_zones WHERE id = $1 AND active = TRUE",
            [deliveryZoneId]
          );
          if (zoneResult.rows.length) {
            deliveryFee = Number(zoneResult.rows[0].fee);
          }
        }

        let effectiveUserId = userId;
        if (staffCanCollect && req.body.customer_user_id) {
          effectiveUserId = Number(req.body.customer_user_id);
        }

        if (addressId !== null) {
          const addressResult = await client.query(
            "SELECT id FROM user_addresses WHERE id = $1 AND ($2::boolean = TRUE OR user_id = $3)",
            [addressId, staffCanCollect, userId]
          );
          if (!addressResult.rows.length) {
            return res.status(404).json({ message: "La dirección no es válida" });
          }
        } else if (staffCanCollect && (req.body.delivery_address || req.body.address_text)) {
          const targetAddress = String(req.body.delivery_address || req.body.address_text).trim();
          const targetDetails = req.body.delivery_details || req.body.address_details || null;

          const createdAddr = await client.query(
            `INSERT INTO user_addresses (user_id, label, address, details) VALUES ($1, 'Domicilio POS', $2, $3) RETURNING id`,
            [effectiveUserId, targetAddress, targetDetails]
          );
          addressId = createdAddr.rows[0].id;
        } else if (!staffCanCollect) {
          return res.status(400).json({ message: "Selecciona una dirección para el pedido a domicilio" });
        }
      }
    }

    const menuResult = await client.query(
      "SELECT product_id FROM menu WHERE day = $1",
      [today]
    );
    const todayMenu = new Set(menuResult.rows.map((row) => Number(row.product_id)));

    if (todayMenu.size === 0) {
      return res.status(400).json({ message: "No hay menú configurado para hoy" });
    }

    let total = deliveryFee;
    let requiresKitchen = false;
    const normalizedItems = [];

    for (const rawItem of items) {
      const productId = Number(rawItem.product_id);
      const quantity = Number(rawItem.quantity);

      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "El pedido contiene cantidades inválidas" });
      }

      const result = await client.query(
        "SELECT id, name, price, available, kitchen_required, product_kind FROM products WHERE id = $1",
        [productId]
      );
      const product = result.rows[0];

      if (!product) {
        return res.status(404).json({ message: `Producto ${productId} no existe` });
      }
      if (!todayMenu.has(Number(product.id))) {
        return res.status(400).json({ message: `Producto fuera del menú: ${product.name}` });
      }
      if (!product.available) {
        return res.status(400).json({ message: `Producto agotado: ${product.name}` });
      }

      let choices = [];
      let extraTotal = 0;
      let optionNeedsKitchen = false;
      if (product.product_kind === "combo") {
        const validated = await validateComboChoices(client, product, rawItem.choices);
        choices = validated.choices;
        extraTotal = validated.extraTotal;
        optionNeedsKitchen = validated.optionNeedsKitchen;
      } else if (Array.isArray(rawItem.choices) && rawItem.choices.length) {
        return res.status(400).json({ message: `${product.name} no acepta opciones de combo` });
      }

      const unitPrice = Number(product.price) + extraTotal;
      total += unitPrice * quantity;
      const itemNeedsKitchen = Boolean(product.kitchen_required) || optionNeedsKitchen;
      requiresKitchen = requiresKitchen || itemNeedsKitchen;
      normalizedItems.push({
        product_id: productId,
        quantity,
        choices,
        kitchen_required: itemNeedsKitchen
      });
    }

    // Efectivo y cambio esperado
    const parsedCashPaidWith = cash_paid_with ? Number(cash_paid_with) : null;
    const cashChangeDue = parsedCashPaidWith && parsedCashPaidWith > total
      ? parsedCashPaidWith - total
      : 0;

    await client.query("BEGIN");

    let folio = null;
    let serviceDate = null;
    const todayStr = getBusinessDateStr();
    if (!tableSessionId) {
      const folioResult = await client.query(`
        INSERT INTO daily_folio_counters (day, last_folio)
        VALUES ($1::date, 1)
        ON CONFLICT (day)
        DO UPDATE SET last_folio = daily_folio_counters.last_folio + 1
        RETURNING day, last_folio
      `, [todayStr]);
      folio = Number(folioResult.rows[0].last_folio);
      serviceDate = folioResult.rows[0].day;
    } else {
      serviceDate = todayStr;
    }

    const paid = Boolean(mark_paid);
    const immediateInternalSale = !requiresKitchen && !tableSessionId && paid && staffCanCollect;
    const orderStatus = requiresKitchen
      ? "pendiente"
      : tableSessionId
        ? "listo"
        : immediateInternalSale
          ? "entregado"
          : "listo";

    const paymentCollectedBy = paid && staffCanCollect ? "business" : null;
    const paymentCollectorUserId = paid && staffCanCollect ? req.user.id : null;
    const paymentCollectedAt = paid && staffCanCollect ? new Date() : null;
    const cashCollectedAmount = paid && staffCanCollect && paymentMethod === "efectivo" ? total : 0;

    const orderResult = await client.query(
      `
        INSERT INTO orders
          (user_id, type, total, status, payment_method, address_id, table_session_id,
           service_type, customer_name, pickup_at, folio, service_date, payment_status, paid_at,
           delivery_pin, delivery_zone_id, delivery_fee, cash_paid_with, cash_change_due, ready_at,
           payment_collected_by, payment_collector_user_id, payment_collected_at, cash_collected_amount)
        VALUES ($1, $2, $3, $4::varchar, $5, $6, $7, $8, $9, $10, $11,
                COALESCE($12::date, $19::date), $13::varchar, CASE WHEN $13::varchar = 'paid' THEN NOW() ELSE NULL END,
                $14, $15, $16, $17, $18, CASE WHEN $4::varchar = 'listo' THEN NOW() ELSE NULL END,
                $20, $21, $22, $23)
        RETURNING *
      `,
      [
        userId,
        effectiveType,
        total,
        orderStatus,
        paymentMethod,
        addressId,
        tableSessionId,
        serviceType,
        customerName,
        pickupAt,
        folio,
        serviceDate,
        paid ? "paid" : "pending",
        deliveryPin,
        deliveryZoneId,
        deliveryFee,
        parsedCashPaidWith,
        cashChangeDue,
        todayStr,
        paymentCollectedBy,
        paymentCollectorUserId,
        paymentCollectedAt,
        cashCollectedAmount
      ]
    );

    const order = orderResult.rows[0];

    for (const item of normalizedItems) {
      const itemStatus = item.kitchen_required ? "pendiente" : "listo";
      const itemResult = await client.query(
        `
          INSERT INTO order_items (order_id, product_id, quantity, kitchen_required, status, ready_at)
          VALUES ($1, $2, $3, $4, $5::varchar, CASE WHEN $5::varchar = 'listo' THEN NOW() ELSE NULL END)
          RETURNING id
        `,
        [order.id, item.product_id, item.quantity, item.kitchen_required, itemStatus]
      );

      const orderItemId = itemResult.rows[0].id;
      for (const choice of item.choices) {
        await client.query(`
          INSERT INTO order_item_combo_choices
            (order_item_id, option_product_id, quantity, extra_price)
          VALUES ($1, $2, $3, $4)
        `, [orderItemId, choice.option_product_id, item.quantity, choice.extra_price]);
      }
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      if (requiresKitchen) io.emit("new-order", order);
      io.emit("orders-updated", order);
      io.emit("counter-updated", order);
      if (tableSessionId) io.emit("tables-updated");
    }

    if (order.status === "listo" && (order.type === "domicilio" || order.service_type === "domicilio")) {
      const dispatchEngine = require("../services/dispatchEngine");
      dispatchEngine.evaluateDispatchQueue(io).catch((err) => {
        console.error("DISPATCH ON ORDER CREATED ERROR:", err.message);
      });
    }

    res.status(201).json({ ...order, requires_kitchen: requiresKitchen });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // La transacción puede no haber iniciado todavía.
    }
    console.error(err);
    res.status(err.status || 500).json({ message: err.status ? err.message : "Error creando pedido" });
  } finally {
    client.release();
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
        SELECT
          o.*,
          ua.address,
          ua.details,
          COALESCE(
            json_agg(
              json_build_object(
                'product_id', oi.product_id,
                'name', p.name,
                'price', p.price,
                'quantity', oi.quantity,
                'product_kind', p.product_kind,
                'choices', COALESCE((
                  SELECT json_agg(
                    json_build_object(
                      'option_product_id', occ.option_product_id,
                      'name', op.name,
                      'quantity', occ.quantity,
                      'extra_price', occ.extra_price
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
        LEFT JOIN user_addresses ua ON ua.id = o.address_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.user_id = $1
        GROUP BY o.id, ua.id
        ORDER BY o.created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo pedidos" });
  }
});

router.patch(
  "/:id/status",
  auth,
  roles(["cocina", "admin"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const id = Number(req.params.id);
      const status = String(req.body.status || "").toLowerCase();
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Pedido inválido" });

      await client.query("BEGIN");

      const currentResult = await client.query(
        "SELECT id, status, table_session_id FROM orders WHERE id = $1 FOR UPDATE",
        [id]
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Pedido no encontrado" });
      }

      const transitions = {
        pendiente: ["aceptado", "cancelado"],
        aceptado: ["preparando", "cancelado"],
        preparando: ["listo"],
        listo: ["entregado"],
        entregado: [],
        cancelado: []
      };

      if (!(transitions[current.status] || []).includes(status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: `No se puede pasar de ${current.status} a ${status}` });
      }

      if (current.status === "listo" && status === "entregado" && !current.table_session_id) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Los pedidos de mostrador se entregan desde el módulo Mostrador" });
      }

      // Sincronizar items de cocina
      if (status === "aceptado") {
        await client.query(
          "UPDATE order_items SET status = 'aceptado' WHERE order_id = $1 AND kitchen_required = TRUE AND status = 'pendiente'",
          [id]
        );
      } else if (status === "preparando") {
        await client.query(
          "UPDATE order_items SET status = 'preparando' WHERE order_id = $1 AND kitchen_required = TRUE AND status IN ('pendiente', 'aceptado')",
          [id]
        );
      } else if (status === "listo") {
        await client.query(
          "UPDATE order_items SET status = 'listo', ready_at = COALESCE(ready_at, NOW()) WHERE order_id = $1 AND kitchen_required = TRUE AND status <> 'entregado'",
          [id]
        );
      } else if (status === "entregado") {
        await client.query(
          "UPDATE order_items SET status = 'entregado' WHERE order_id = $1",
          [id]
        );
      }

      const result = await client.query(
        "UPDATE orders SET status = $1::varchar, ready_at = CASE WHEN $1::varchar = 'listo' THEN COALESCE(ready_at, NOW()) ELSE ready_at END WHERE id = $2 RETURNING *",
        [status, id]
      );

      const updatedOrder = result.rows[0];

      if (["entregado", "cancelado"].includes(status)) {
        const dispatchEngine = require("../services/dispatchEngine");
        await dispatchEngine.cleanupPendingOffersForOrder(id, client, `Pedido ${status}`);
      }

      await client.query("COMMIT");

      const io = req.app.get("io");
      if (io) {
        io.emit("order-updated", updatedOrder);
        io.emit("orders-updated", updatedOrder);
        io.emit("counter-updated", updatedOrder);
        if (updatedOrder.table_session_id) io.emit("tables-updated");
      }

      if (updatedOrder.status === "listo" && (updatedOrder.type === "domicilio" || updatedOrder.service_type === "domicilio")) {
        const dispatchEngine = require("../services/dispatchEngine");
        dispatchEngine.evaluateDispatchQueue(io).catch((err) => {
          console.error("DISPATCH ON ORDER STATUS READY ERROR:", err.message);
        });
      }

      res.json(updatedOrder);
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      console.error(err);
      res.status(500).json({ message: "Error actualizando pedido" });
    } finally {
      client.release();
    }
  }
);

router.patch("/:id/cancel", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin";

    const result = await pool.query(
      `
        UPDATE orders
        SET status = 'cancelado'
        WHERE id = $1
          AND LOWER(status) = 'pendiente'
          AND ($2::boolean = true OR user_id = $3)
        RETURNING *
      `,
      [id, isAdmin, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(400).json({ message: "No se puede cancelar este pedido" });
    }

    const updatedOrder = result.rows[0];

    const dispatchEngine = require("../services/dispatchEngine");
    await dispatchEngine.cleanupPendingOffersForOrder(id, pool, "Pedido cancelado");

    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", updatedOrder);
      io.emit("orders-updated", updatedOrder);
      io.emit("counter-updated", updatedOrder);
      if (updatedOrder.table_session_id) io.emit("tables-updated");
    }

    res.json({ message: "Pedido cancelado", order: updatedOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error cancelando pedido" });
  }
});

module.exports = router;
