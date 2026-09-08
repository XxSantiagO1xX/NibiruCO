import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

const STATUS_MAP = {
  pendiente: {
    label: "Pendiente",
    bg: colors.warningSoft,
    text: colors.warning,
    border: colors.warningBorder,
    icon: "time-outline"
  },
  aceptado: {
    label: "Aceptado",
    bg: colors.infoSoft,
    text: colors.info,
    border: colors.infoBorder,
    icon: "checkmark-circle-outline"
  },
  preparando: {
    label: "En Preparación",
    bg: "#fff7ed",
    text: "#ea580c",
    border: "#fed7aa",
    icon: "flame-outline"
  },
  listo: {
    label: "Listo para entrega",
    bg: colors.successSoft,
    text: colors.success,
    border: colors.successBorder,
    icon: "restaurant-outline"
  },
  entregado: {
    label: "Entregado",
    bg: "#f3f4f6",
    text: "#4b5563",
    border: "#e5e7eb",
    icon: "checkmark-done-outline"
  },
  cancelado: {
    label: "Cancelado",
    bg: colors.dangerSoft,
    text: colors.danger,
    border: colors.dangerBorder,
    icon: "close-circle-outline"
  }
};

const SERVICE_TYPE_MAP = {
  local: "Comer aquí",
  llevar: "Para llevar",
  recoger: "Recoger",
  domicilio: "A domicilio",
  mesa: "Mesa"
};

export default function OrderCard({ order, onCancel, onTrack }) {
  const statusKey = String(order.status || "pendiente").toLowerCase();
  const statusMeta = STATUS_MAP[statusKey] || STATUS_MAP.pendiente;
  const serviceLabel =
    SERVICE_TYPE_MAP[order.service_type || order.type] ||
    order.service_type ||
    order.type ||
    "Local";

  const folioText = order.folio
    ? `F${String(order.folio).padStart(3, "0")}`
    : `Pedido #${order.id}`;

  const isPending = statusKey === "pendiente";
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.total || 0);

  // Format date
  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";

  return (
    <View style={styles.card}>
      {/* Top row: Folio + Status */}
      <View style={styles.header}>
        <View style={styles.folioRow}>
          <Text style={styles.folio}>{folioText}</Text>
          <View style={styles.serviceBadge}>
            <Text style={styles.serviceBadgeText}>{serviceLabel}</Text>
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: statusMeta.bg,
              borderColor: statusMeta.border
            }
          ]}
        >
          <Ionicons
            name={statusMeta.icon}
            size={13}
            color={statusMeta.text}
          />
          <Text style={[styles.statusText, { color: statusMeta.text }]}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      {/* Customer / Address info if applicable */}
      {order.customer_name ? (
        <Text style={styles.customerName}>
          Cliente: <Text style={{ color: colors.text }}>{order.customer_name}</Text>
        </Text>
      ) : null}

      {order.address ? (
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={13} color={colors.muted} />
          <Text style={styles.addressText} numberOfLines={1}>
            {order.address} {order.details ? `(${order.details})` : ""}
          </Text>
        </View>
      ) : null}

      {/* Items list */}
      <View style={styles.itemsContainer}>
        {items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <View style={styles.itemMain}>
              <Text style={styles.itemQty}>{item.quantity}x</Text>
              <View style={styles.itemDetailCol}>
                <Text style={styles.itemName}>
                  {item.name || `Producto #${item.product_id}`}
                </Text>

                {/* Combo choices */}
                {Array.isArray(item.choices) && item.choices.length > 0 && (
                  <View style={styles.choicesList}>
                    {item.choices.map((choice, cIdx) => (
                      <Text key={cIdx} style={styles.choiceText}>
                        • {choice.name || choice.option_name}
                        {Number(choice.extra_price) > 0
                          ? ` (+$${Number(choice.extra_price).toFixed(2)})`
                          : ""}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {item.price ? (
              <Text style={styles.itemPrice}>
                ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {/* Footer: Total & Actions */}
      <View style={styles.footer}>
        <View style={styles.totalCol}>
          <Text style={styles.timeText}>
            {dateStr ? `Hora: ${dateStr}` : ""}
            {order.payment_status === "paid" ? " · Pagado" : " · Pago pendiente"}
          </Text>
          <Text style={styles.totalText}>Total: ${total.toFixed(2)}</Text>
        </View>

        <View style={styles.actionsRow}>
          {(order.service_type === "domicilio" || order.type === "domicilio") && onTrack ? (
            <TouchableOpacity
              style={styles.trackButton}
              onPress={() => onTrack(order.id)}
              activeOpacity={0.8}
            >
              <Ionicons name="location" size={13} color="#ffffff" />
              <Text style={styles.trackButtonText}>
                {order.delivery_pin ? `PIN: ${order.delivery_pin}` : "Seguimiento"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isPending && onCancel ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => onCancel(order.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  folioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  folio: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.5
  },
  serviceBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  serviceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  customerName: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
    marginBottom: 4
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10
  },
  addressText: {
    fontSize: 11,
    color: colors.muted,
    flex: 1
  },
  itemsContainer: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
    gap: 8
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  itemMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 8
  },
  itemQty: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 1
  },
  itemDetailCol: {
    flex: 1
  },
  itemName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  choicesList: {
    marginTop: 2,
    paddingLeft: 4
  },
  choiceText: {
    fontSize: 11,
    color: colors.muted
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12
  },
  totalCol: {
    flex: 1
  },
  timeText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: "600"
  },
  totalText: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.primary,
    marginTop: 2,
    letterSpacing: -0.3
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.primary
  },
  trackButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff"
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder
  },
  cancelButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.danger
  }
});
