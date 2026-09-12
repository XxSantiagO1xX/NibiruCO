const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const { getBusinessDateStr } = require("../utils/timezone");

const adminOrManager = roles(["admin", "mesero"]);

/**
 * Parsea y normaliza el rango de fechas (startDate, endDate)
 */
function normalizeDateRange(startDateQuery, endDateQuery) {
  const todayStr = getBusinessDateStr();
  
  let startStr = startDateQuery;
  let endStr = endDateQuery;

  if (!endStr) {
    endStr = todayStr;
  }
  if (!startStr) {
    // Por defecto últimos 7 días
    const d = new Date(`${endStr}T00:00:00`);
    d.setDate(d.getDate() - 6);
    startStr = d.toISOString().slice(0, 10);
  }

  const startTimestamp = `${startStr} 00:00:00`;
  const endTimestamp = `${endStr} 23:59:59.999`;

  return {
    startStr,
    endStr,
    startTimestamp,
    endTimestamp
  };
}

/**
 * GET /analytics/summary
 * Obtiene métricas financieras, serie temporal diaria, top productos y eficiencia operativa
 */
router.get("/summary", auth, adminOrManager, async (req, res) => {
  try {
    const { startStr, endStr, startTimestamp, endTimestamp } = normalizeDateRange(
      req.query.startDate,
      req.query.endDate
    );

    // 1. Métricas Globales Financieras y de Volumen
    const globalRes = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'entregado')::int AS delivered_orders,
        COUNT(*) FILTER (WHERE status = 'cancelado')::int AS canceled_orders,
        COUNT(*) FILTER (WHERE status NOT IN ('entregado', 'cancelado'))::int AS in_progress_orders,
        COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue,
        COALESCE(SUM(delivery_fee) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_delivery_fees,
        COALESCE(AVG(total) FILTER (WHERE status = 'entregado'), 0)::numeric(10,2) AS average_ticket
      FROM orders
      WHERE (created_at >= $1 AND created_at <= $2)
         OR (service_date >= $3::date AND service_date <= $4::date)
      `,
      [startTimestamp, endTimestamp, startStr, endStr]
    );

    const globals = globalRes.rows[0] || {
      total_orders: 0,
      delivered_orders: 0,
      canceled_orders: 0,
      in_progress_orders: 0,
      total_revenue: 0,
      total_delivery_fees: 0,
      average_ticket: 0
    };

    // 2. Serie Temporal Diaria (Ventas y Pedidos por Día)
    const timelineRes = await pool.query(
      `
      SELECT
        TO_CHAR(COALESCE(service_date, created_at::date), 'YYYY-MM-DD') AS date_label,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'entregado')::int AS delivered_orders,
        COUNT(*) FILTER (WHERE status = 'cancelado')::int AS canceled_orders,
        COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue
      FROM orders
      WHERE (created_at >= $1 AND created_at <= $2)
         OR (service_date >= $3::date AND service_date <= $4::date)
      GROUP BY COALESCE(service_date, created_at::date)
      ORDER BY date_label ASC
      `,
      [startTimestamp, endTimestamp, startStr, endStr]
    );

    // 3. Top 10 Platillos y Combos Más Vendidos
    const topProductsRes = await pool.query(
      `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(p.product_kind, 'individual') AS product_kind,
        COALESCE(p.category, 'General') AS category,
        p.image_url,
        SUM(oi.quantity)::int AS units_sold,
        COALESCE(SUM(oi.quantity * p.price), 0)::numeric(12,2) AS total_sales
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE ((o.created_at >= $1 AND o.created_at <= $2) OR (o.service_date >= $3::date AND o.service_date <= $4::date))
        AND o.status <> 'cancelado'
      GROUP BY p.id, p.name, p.product_kind, p.category, p.image_url
      ORDER BY units_sold DESC, total_sales DESC
      LIMIT 10
      `,
      [startTimestamp, endTimestamp, startStr, endStr]
    );

    // 4. Desglose de Ventas por Canal (Service Type)
    const channelsRes = await pool.query(
      `
      SELECT
        CASE
          WHEN LOWER(COALESCE(service_type, type, 'local')) LIKE '%domicilio%' THEN 'domicilio'
          WHEN LOWER(COALESCE(service_type, type, 'local')) LIKE '%mesa%' THEN 'mesa'
          WHEN LOWER(COALESCE(service_type, type, 'local')) IN ('llevar', 'recoger', 'pickup') THEN 'llevar'
          ELSE 'local'
        END AS channel,
        COUNT(*)::int AS orders_count,
        COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue
      FROM orders
      WHERE ((created_at >= $1 AND created_at <= $2) OR (service_date >= $3::date AND service_date <= $4::date))
        AND status <> 'cancelado'
      GROUP BY 1
      ORDER BY total_revenue DESC
      `,
      [startTimestamp, endTimestamp, startStr, endStr]
    );

    // 5. Desglose de Ventas por Método de Pago
    const paymentMethodsRes = await pool.query(
      `
      SELECT
        COALESCE(payment_method, 'efectivo') AS payment_method,
        COUNT(*)::int AS orders_count,
        COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue
      FROM orders
      WHERE ((created_at >= $1 AND created_at <= $2) OR (service_date >= $3::date AND service_date <= $4::date))
        AND status <> 'cancelado'
      GROUP BY COALESCE(payment_method, 'efectivo')
      ORDER BY total_revenue DESC
      `,
      [startTimestamp, endTimestamp, startStr, endStr]
    );

    // 6. Tiempos Promedio de Eficiencia Operativa (Cocina y Entrega)
    const kitchenTimeRes = await pool.query(
      `
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (ready_at - created_at)) / 60), 0)::numeric(10,1) AS avg_kitchen_prep_minutes
      FROM orders
      WHERE ((created_at >= $1 AND created_at <= $2) OR (service_date >= $3::date AND service_date <= $4::date))
        AND ready_at IS NOT NULL
        AND ready_at >= created_at
        AND status IN ('listo', 'entregado')
      `,
      [startTimestamp, endTimestamp, startStr, endStr]
    );

    const deliveryTimeRes = await pool.query(
      `
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (dts.delivered_at - dt.created_at)) / 60), 0)::numeric(10,1) AS avg_delivery_minutes
      FROM delivery_trip_stops dts
      JOIN delivery_trips dt ON dt.id = dts.trip_id
      WHERE dt.created_at >= $1 AND dt.created_at <= $2
        AND dts.delivered_at IS NOT NULL
        AND dts.delivered_at >= dt.created_at
        AND dts.status = 'delivered'
      `,
      [startTimestamp, endTimestamp]
    );

    const avgKitchenMinutes = Number(kitchenTimeRes.rows[0]?.avg_kitchen_prep_minutes || 0);
    const avgDeliveryMinutes = Number(deliveryTimeRes.rows[0]?.avg_delivery_minutes || 0);

    const totalRevenueNum = Number(globals.total_revenue || 0);
    const totalOrdersNum = Number(globals.total_orders || 0);
    const deliveredOrdersNum = Number(globals.delivered_orders || 0);
    const canceledOrdersNum = Number(globals.canceled_orders || 0);
    const avgTicketNum = Number(globals.average_ticket || 0);

    const completionRate = totalOrdersNum > 0
      ? Number(((deliveredOrdersNum / totalOrdersNum) * 100).toFixed(1))
      : 0;

    res.json({
      period: {
        startDate: startStr,
        endDate: endStr
      },
      kpis: {
        total_revenue: totalRevenueNum,
        total_orders: totalOrdersNum,
        delivered_orders: deliveredOrdersNum,
        canceled_orders: canceledOrdersNum,
        in_progress_orders: Number(globals.in_progress_orders || 0),
        completion_rate_percent: completionRate,
        average_ticket: avgTicketNum,
        total_delivery_fees: Number(globals.total_delivery_fees || 0),
        avg_kitchen_prep_minutes: avgKitchenMinutes,
        avg_delivery_minutes: avgDeliveryMinutes
      },
      timeline: timelineRes.rows.map((row) => ({
        date: row.date_label,
        orders_count: Number(row.total_orders),
        delivered_count: Number(row.delivered_orders),
        canceled_count: Number(row.canceled_orders),
        revenue: Number(row.total_revenue)
      })),
      top_products: topProductsRes.rows.map((row, idx) => ({
        rank: idx + 1,
        product_id: Number(row.product_id),
        name: row.product_name,
        product_kind: row.product_kind,
        category: row.category,
        image_url: row.image_url,
        units_sold: Number(row.units_sold),
        total_sales: Number(row.total_sales)
      })),
      sales_by_channel: channelsRes.rows.map((row) => {
        const rev = Number(row.total_revenue);
        const percent = totalRevenueNum > 0 ? Number(((rev / totalRevenueNum) * 100).toFixed(1)) : 0;
        return {
          channel: row.channel,
          orders_count: Number(row.orders_count),
          revenue: rev,
          percentage: percent
        };
      }),
      sales_by_payment_method: paymentMethodsRes.rows.map((row) => {
        const rev = Number(row.total_revenue);
        const percent = totalRevenueNum > 0 ? Number(((rev / totalRevenueNum) * 100).toFixed(1)) : 0;
        return {
          payment_method: row.payment_method,
          orders_count: Number(row.orders_count),
          revenue: rev,
          percentage: percent
        };
      })
    });
  } catch (err) {
    console.error("ANALYTICS SUMMARY ERROR:", err);
    res.status(500).json({ message: "Error obteniendo analítica del sistema" });
  }
});

/**
 * Escapa strings para formato seguro CSV
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * GET /analytics/export
 * Genera y descarga el reporte en formato CSV con BOM UTF-8
 */
router.get("/export", auth, adminOrManager, async (req, res) => {
  try {
    const { startStr, endStr, startTimestamp, endTimestamp } = normalizeDateRange(
      req.query.startDate,
      req.query.endDate
    );

    // Consultas para armar el CSV completo
    const [globalRes, timelineRes, topProductsRes, channelsRes, paymentMethodsRes, ordersListRes] = await Promise.all([
      // 1. Resumen Global
      pool.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE status = 'entregado')::int AS delivered_orders,
          COUNT(*) FILTER (WHERE status = 'cancelado')::int AS canceled_orders,
          COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue,
          COALESCE(AVG(total) FILTER (WHERE status = 'entregado'), 0)::numeric(10,2) AS average_ticket
        FROM orders
        WHERE (created_at >= $1 AND created_at <= $2)
           OR (service_date >= $3::date AND service_date <= $4::date)
      `, [startTimestamp, endTimestamp, startStr, endStr]),

      // 2. Diario
      pool.query(`
        SELECT
          TO_CHAR(COALESCE(service_date, created_at::date), 'YYYY-MM-DD') AS date_label,
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE status = 'entregado')::int AS delivered_orders,
          COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue
        FROM orders
        WHERE (created_at >= $1 AND created_at <= $2)
           OR (service_date >= $3::date AND service_date <= $4::date)
        GROUP BY COALESCE(service_date, created_at::date)
        ORDER BY date_label ASC
      `, [startTimestamp, endTimestamp, startStr, endStr]),

      // 3. Top Productos
      pool.query(`
        SELECT
          p.name AS product_name,
          COALESCE(p.product_kind, 'individual') AS product_kind,
          COALESCE(p.category, 'General') AS category,
          SUM(oi.quantity)::int AS units_sold,
          COALESCE(SUM(oi.quantity * p.price), 0)::numeric(12,2) AS total_sales
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE ((o.created_at >= $1 AND o.created_at <= $2) OR (o.service_date >= $3::date AND o.service_date <= $4::date))
          AND o.status <> 'cancelado'
        GROUP BY p.id, p.name, p.product_kind, p.category
        ORDER BY units_sold DESC
        LIMIT 20
      `, [startTimestamp, endTimestamp, startStr, endStr]),

      // 4. Canales
      pool.query(`
        SELECT
          COALESCE(service_type, type, 'local') AS channel,
          COUNT(*)::int AS orders_count,
          COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue
        FROM orders
        WHERE ((created_at >= $1 AND created_at <= $2) OR (service_date >= $3::date AND service_date <= $4::date))
          AND status <> 'cancelado'
        GROUP BY 1
        ORDER BY total_revenue DESC
      `, [startTimestamp, endTimestamp, startStr, endStr]),

      // 5. Pagos
      pool.query(`
        SELECT
          COALESCE(payment_method, 'efectivo') AS payment_method,
          COUNT(*)::int AS orders_count,
          COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS total_revenue
        FROM orders
        WHERE ((created_at >= $1 AND created_at <= $2) OR (service_date >= $3::date AND service_date <= $4::date))
          AND status <> 'cancelado'
        GROUP BY 1
        ORDER BY total_revenue DESC
      `, [startTimestamp, endTimestamp, startStr, endStr]),

      // 6. Lista de pedidos individuales del periodo
      pool.query(`
        SELECT
          o.id,
          o.folio,
          TO_CHAR(o.created_at, 'YYYY-MM-DD HH24:MI:SS') AS date_time,
          COALESCE(o.service_type, o.type, 'local') AS service_type,
          o.status,
          o.total,
          o.payment_method,
          o.payment_status,
          u.name AS customer_name
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE ((o.created_at >= $1 AND o.created_at <= $2) OR (o.service_date >= $3::date AND o.service_date <= $4::date))
        ORDER BY o.created_at DESC
        LIMIT 500
      `, [startTimestamp, endTimestamp, startStr, endStr])
    ]);

    const g = globalRes.rows[0] || {};
    const lines = [];

    // Encabezado BOM UTF-8 para Excel
    lines.push("=== REPORTE EJECUTIVO DE VENTAS Y OPERACIONES MEALOPS ===");
    lines.push(`Periodo: ${startStr} al ${endStr}`);
    lines.push(`Generado: ${new Date().toLocaleString("es-MX")}`);
    lines.push("");

    // Bloque 1: Resumen General
    lines.push("--- RESUMEN FINANCIERO ---");
    lines.push("Metrica,Valor");
    lines.push(`Ventas Totales (Brutas),$${Number(g.total_revenue || 0).toFixed(2)}`);
    lines.push(`Total de Pedidos,${Number(g.total_orders || 0)}`);
    lines.push(`Pedidos Entregados,${Number(g.delivered_orders || 0)}`);
    lines.push(`Pedidos Cancelados,${Number(g.canceled_orders || 0)}`);
    lines.push(`Ticket Promedio,$${Number(g.average_ticket || 0).toFixed(2)}`);
    lines.push("");

    // Bloque 2: Ventas por Día
    lines.push("--- VENTAS POR DIA ---");
    lines.push("Fecha,Pedidos Totales,Pedidos Entregados,Ventas Totales ($)");
    for (const r of timelineRes.rows) {
      lines.push(`${escapeCsv(r.date_label)},${r.total_orders},${r.delivered_orders},${Number(r.total_revenue).toFixed(2)}`);
    }
    lines.push("");

    // Bloque 3: Top Productos
    lines.push("--- TOP PLATILLOS Y COMBOS MAS VENDIDOS ---");
    lines.push("Producto,Tipo,Categoria,Unidades Vendidas,Ingresos Generados ($)");
    for (const p of topProductsRes.rows) {
      lines.push(`${escapeCsv(p.product_name)},${escapeCsv(p.product_kind)},${escapeCsv(p.category)},${p.units_sold},${Number(p.total_sales).toFixed(2)}`);
    }
    lines.push("");

    // Bloque 4: Canales de Venta
    lines.push("--- DISTRIBUCION POR CANAL ---");
    lines.push("Canal de Venta,Cantidad de Pedidos,Ingresos Totales ($)");
    for (const c of channelsRes.rows) {
      lines.push(`${escapeCsv(c.channel)},${c.orders_count},${Number(c.total_revenue).toFixed(2)}`);
    }
    lines.push("");

    // Bloque 5: Formas de Pago
    lines.push("--- DISTRIBUCION POR FORMA DE PAGO ---");
    lines.push("Forma de Pago,Cantidad de Pedidos,Ingresos Totales ($)");
    for (const pm of paymentMethodsRes.rows) {
      lines.push(`${escapeCsv(pm.payment_method)},${pm.orders_count},${Number(pm.total_revenue).toFixed(2)}`);
    }
    lines.push("");

    // Bloque 6: Detalle de Pedidos
    lines.push("--- DETALLE DE PEDIDOS (HASTA 500 REGISTROS) ---");
    lines.push("Folio / ID,Fecha y Hora,Cliente,Canal,Estado,Metodo Pago,Estado Pago,Total ($)");
    for (const o of ordersListRes.rows) {
      const folioLabel = o.folio ? `F${String(o.folio).padStart(3, "0")}` : `#${o.id}`;
      lines.push(`${escapeCsv(folioLabel)},${escapeCsv(o.date_time)},${escapeCsv(o.customer_name || "Cliente")},${escapeCsv(o.service_type)},${escapeCsv(o.status)},${escapeCsv(o.payment_method || "Efectivo")},${escapeCsv(o.payment_status || "pending")},${Number(o.total || 0).toFixed(2)}`);
    }

    const csvContent = "\uFEFF" + lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reporte_mealops_${startStr}_${endStr}.csv"`
    );
    res.status(200).send(csvContent);
  } catch (err) {
    console.error("ANALYTICS EXPORT ERROR:", err);
    res.status(500).json({ message: "Error exportando reporte CSV" });
  }
});

module.exports = router;
