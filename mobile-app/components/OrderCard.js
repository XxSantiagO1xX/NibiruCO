import { useState } from "react";
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
    bg: "#FFF7ED",
    text: "#EA580C",
    border: "#FED7AA",
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
    bg: "#F3F4F6",
    text: "#4B5563",
    border: "#E5E7EB",
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
  const [isExpanded, setIsExpanded] = useState(false);

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
  const isDelivered = statusKey === "entregado";
  const isCanceled = statusKey === "cancelado";
  const isFinished = isDelivered || isCanceled;

  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.total || 0);

  // Dynamic folio and button color
  const folioBg = isFinished ? "#343A40" : colors.primary;

  // Format date
  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";

  return (
    <TouchableOpacity
      style={[styles.card, isFinished && styles.cardFinished]}
      onPress={() => setIsExpanded((prev) => !prev)}
      activeOpacity={0.88}
    >
      {/* Barra superior con Folio al ras en la esquina */}
      <View style={styles.topBar}>
        <View style={[styles.folioBadge, { backgroundColor: folioBg }]}>
          <Text style={styles.folioBadgeText}>{folioText}</Text>
        </View>

        <View style={styles.topBarRight}>
          <Text
            style={[
              styles.summaryTotal,
              isFinished && { color: "#343A40" }
            ]}
          >
            ${total.toFixed(2)}
          </Text>
          <View
            style={[
              styles.chevronCircle,
              isFinished && { backgroundColor: colors.surfaceMuted }
            ]}
          >
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={isFinished ? colors.muted : colors.primary}
            />
          </View>
        </View>
      </View>

      {/* Cuerpo de la tarjeta con badges y resumen */}
      <View style={styles.cardBody}>
        <View style={styles.badgesRow}>
          <View style={styles.serviceBadge}>
            <Text style={styles.serviceBadgeText}>{serviceLabel}</Text>
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
              size={11}
              color={statusMeta.text}
            />
            <Text style={[styles.statusText, { color: statusMeta.text }]}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        {/* Vista Expandida (Desplegable) */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Customer / Address info if applicable */}
            {order.customer_name ? (
              <Text style={styles.customerName}>
                Cliente:{" "}
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {order.customer_name}
                </Text>
              </Text>
            ) : null}

            {order.address ? (
              <View style={styles.addressRow}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={isFinished ? colors.muted : colors.primary}
                />
                <Text style={styles.addressText} numberOfLines={2}>
                  {order.address} {order.details ? `(${order.details})` : ""}
                </Text>
              </View>
            ) : null}

            {/* Items list breakdown */}
            <View style={styles.itemsContainer}>
              {items.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={styles.itemMain}>
                    <Text
                      style={[
                        styles.itemQty,
                        isFinished && { color: "#343A40" }
                      ]}
                    >
                      {item.quantity}x
                    </Text>
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

            {/* Footer: Date, items count & Actions */}
            <View style={styles.footer}>
              <View style={styles.metaCol}>
                <Text style={styles.timeText}>
                  {dateStr ? `Hora: ${dateStr}` : ""}
                  {order.payment_status === "paid"
                    ? " · Pagado"
                    : " · Pago pendiente"}
                </Text>
                <Text style={styles.itemsCountText}>
                  {items.length} {items.length === 1 ? "artículo" : "artículos"}
                </Text>
              </View>

              <View style={styles.actionsRow}>
                {(order.service_type === "domicilio" ||
                  order.type === "domicilio") &&
                onTrack ? (
                  <TouchableOpacity
                    style={[
                      styles.trackButton,
                      isFinished && {
                        backgroundColor: "#343A40",
                        borderColor: "#343A40",
                        shadowColor: "#343A40"
                      }
                    ]}
                    onPress={() => onTrack(order.id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="location" size={14} color="#ffffff" />
                    <Text style={styles.trackButtonText}>
                      {order.delivery_pin
                        ? `PIN: ${order.delivery_pin}`
                        : "Seguimiento"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {isPending && onCancel ? (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => onCancel(order.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  cardFinished: {
    opacity: 0.7
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 14
  },
  folioBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopLeftRadius: 16,
    borderBottomRightRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  folioBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4
  },
  summaryTotal: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: -0.4
  },
  chevronCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
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
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.muted
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  customerName: {
    fontSize: 12.5,
    color: colors.muted,
    fontWeight: "500",
    marginBottom: 4
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10
  },
  addressText: {
    fontSize: 11.5,
    color: colors.muted,
    flex: 1
  },
  itemsContainer: {
    paddingVertical: 10,
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
    fontWeight: "900",
    color: colors.primary,
    marginTop: 1
  },
  itemDetailCol: {
    flex: 1
  },
  itemName: {
    fontSize: 13.5,
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
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.text
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12
  },
  metaCol: {
    flex: 1
  },
  timeText: {
    fontSize: 10.5,
    color: colors.muted,
    fontWeight: "600"
  },
  itemsCountText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 1
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  // Pill button (borderRadius: 25)
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 2
  },
  trackButtonText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#ffffff"
  },
  // Pill secondary button (borderRadius: 25)
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder
  },
  cancelButtonText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.danger
  }
});
