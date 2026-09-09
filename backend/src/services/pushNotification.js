const pool = require("../db");

/**
 * Enviar notificación push mediante la API de Expo
 * @param {string} pushToken - Token del dispositivo (ej. ExponentPushToken[...])
 * @param {object} payload - { title, body, data, sound, priority }
 */
async function sendExpoPushNotification(pushToken, { title, body, data = {}, sound = "default", priority = "high" }) {
  if (!pushToken || typeof pushToken !== "string") return { ok: false, message: "Token inválido" };
  if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
    if (!pushToken.trim()) return { ok: false, message: "Token vacío" };
  }

  try {
    const message = {
      to: pushToken,
      sound,
      title: title || "MealOps",
      body: body || "Nueva actualización en MealOps",
      data,
      priority,
      channelId: "delivery-offers"
    };

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });

    const result = await res.json();

    if (result?.data?.status === "error" && result?.data?.details?.error === "DeviceNotRegistered") {
      console.log(`[PUSH] Token obsoleto detectado, invalidando token: ${pushToken}`);
      await pool.query("UPDATE users SET expo_push_token = NULL WHERE expo_push_token = $1", [pushToken]);
    }

    return { ok: true, result };
  } catch (err) {
    console.error("[PUSH] Error enviando notificación push a Expo:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Enviar push notification a un repartidor si tiene token y está disponible
 */
async function notifyDriverOffer(driverUserId, offer, group, timeoutSeconds) {
  try {
    const userRes = await pool.query(`
      SELECT id, name, expo_push_token, allow_push, driver_status
      FROM users
      WHERE id = $1
    `, [driverUserId]);

    if (!userRes.rows.length) return;
    const driver = userRes.rows[0];

    // Nunca enviar push si está en pausa u offline o no permite push
    if (driver.allow_push === false || ["pausa", "offline"].includes(driver.driver_status)) {
      return;
    }

    if (!driver.expo_push_token) return;

    const ordersCount = group.length;
    const firstOrder = group[0];
    const folioText = firstOrder?.folio ? `F${String(firstOrder.folio).padStart(3, "0")}` : `#${firstOrder?.id}`;
    const zoneName = firstOrder?.zone_name || "Zona de reparto";
    const totalAmount = group.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const title = `🚨 Nueva Entrega Asignada (${folioText})`;
    const body = ordersCount === 1
      ? `1 pedido listo en ${zoneName} · Cobro: $${totalAmount.toFixed(2)} (${timeoutSeconds}s para responder)`
      : `${ordersCount} pedidos agrupados en ${zoneName} · Cobro: $${totalAmount.toFixed(2)} (${timeoutSeconds}s para responder)`;

    await sendExpoPushNotification(driver.expo_push_token, {
      title,
      body,
      data: {
        type: "delivery_offer",
        offer_id: offer.id,
        order_ids: offer.order_ids,
        expires_at: offer.expires_at,
        timeout_seconds: timeoutSeconds
      }
    });
  } catch (err) {
    console.error("[PUSH] Error en notifyDriverOffer:", err.message);
  }
}

module.exports = {
  sendExpoPushNotification,
  notifyDriverOffer
};
