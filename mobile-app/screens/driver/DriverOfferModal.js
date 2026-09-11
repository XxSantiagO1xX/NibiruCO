import { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Vibration,
  ScrollView,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../theme/colors";

export default function DriverOfferModal({
  visible,
  offer,
  secondsLeft,
  loading,
  onAccept,
  onReject
}) {
  useEffect(() => {
    if (visible && offer) {
      try {
        // Vibración de atención para nueva entrega entrante
        Vibration.vibrate(Platform.OS === "android" ? [0, 600, 250, 600] : [0, 400]);
      } catch (_) {}
    }
  }, [visible, offer]);

  if (!offer) return null;

  const orders = Array.isArray(offer.orders) ? offer.orders : [];
  const ordersCount = orders.length || 1;
  const firstOrder = orders[0];
  const zoneName = firstOrder?.zone_name || offer.zone_name || "Zona General";
  const totalCash = Number(offer.total_cash_to_collect || 0);
  const totalAmount = Number(offer.total_amount || 0);

  const isUrgent = secondsLeft <= 6;
  const timerColor = isUrgent ? colors.danger : secondsLeft <= 12 ? "#d97706" : colors.primary;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      statusBarTranslucent={true}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <View style={styles.pulseBadge}>
              <Ionicons name="flash" size={16} color="#ffffff" />
              <Text style={styles.pulseBadgeText}>NUEVA ENTREGA EXCLUSIVA</Text>
            </View>

            <View style={[styles.timerBadge, { borderColor: timerColor }]}>
              <Ionicons name="time" size={16} color={timerColor} />
              <Text style={[styles.timerText, { color: timerColor }]}>
                {secondsLeft}s
              </Text>
            </View>
          </View>

          {/* Folio & Batch Info */}
          <View style={styles.folioSection}>
            <Text style={styles.ordersCountText}>
              {ordersCount === 1 ? "1 Entrega Asignada" : `${ordersCount} Entregas Agrupadas`}
            </Text>
            <Text style={styles.folioDisplayText}>
              {orders.map((o) => `F${String(o.folio || o.id).padStart(3, "0")}`).join("  ·  ")}
            </Text>
            <View style={styles.zonePill}>
              <Ionicons name="location-sharp" size={13} color={colors.primary} />
              <Text style={styles.zonePillText}>{zoneName}</Text>
            </View>
          </View>

          <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
            {/* Financial Summary Box */}
            <View style={styles.financialCard}>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Total en Efectivo a Cobrar:</Text>
                <Text style={styles.financialValueCash}>
                  ${totalCash.toFixed(2)}
                </Text>
              </View>
              <View style={styles.financialDivider} />
              <View style={styles.financialRow}>
                <Text style={styles.financialSublabel}>Valor total de pedidos:</Text>
                <Text style={styles.financialSubvalue}>
                  ${totalAmount.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Addresses list */}
            <Text style={styles.destinationsHeader}>Destinos de Entrega:</Text>
            {orders.map((ord, idx) => (
              <View key={ord?.id ? `${ord.id}-${idx}` : idx.toString()} style={styles.orderItemCard}>
                <View style={styles.orderSeqCircle}>
                  <Text style={styles.orderSeqText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>
                    {ord.customer_name || ord.user_name || "Cliente"}
                  </Text>
                  <Text style={styles.orderAddress}>{ord.address}</Text>
                  {ord.address_details ? (
                    <Text style={styles.orderRef}>Ref: {ord.address_details}</Text>
                  ) : null}
                  <Text style={styles.orderPaymentTag}>
                    {ord.payment_method === "efectivo"
                      ? `💵 Cobro: $${Number(ord.total).toFixed(2)}`
                      : `💳 Pagado en App · $${Number(ord.total).toFixed(2)}`}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Countdown Warning Bar */}
          <View style={[styles.timerProgressBar, { backgroundColor: isUrgent ? "#fee2e2" : "#fef3c7" }]}>
            <Text style={[styles.timerProgressText, { color: timerColor }]}>
              ⏳ Tienes {secondsLeft} segundos para responder antes de reasignar
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.btnReject, loading && { opacity: 0.5 }]}
              onPress={() => onReject(false)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.btnRejectText}>Rechazar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnAccept, loading && { opacity: 0.7 }]}
              onPress={onAccept}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                  <Text style={styles.btnAcceptText}>ACEPTAR VIAJE</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14
  },
  pulseBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dc2626",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6
  },
  pulseBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4
  },
  timerText: {
    fontSize: 14,
    fontWeight: "900"
  },
  folioSection: {
    alignItems: "center",
    marginVertical: 6
  },
  ordersCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  folioDisplayText: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.5,
    marginVertical: 4
  },
  zonePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4
  },
  zonePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary
  },
  detailsScroll: {
    maxHeight: 280,
    marginVertical: 12
  },
  financialCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  financialLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  financialValueCash: {
    fontSize: 18,
    fontWeight: "900",
    color: "#16a34a"
  },
  financialDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 8
  },
  financialSublabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600"
  },
  financialSubvalue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text
  },
  destinationsHeader: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4
  },
  orderItemCard: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 8,
    gap: 10,
    alignItems: "flex-start"
  },
  orderSeqCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  orderSeqText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  customerName: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text
  },
  orderAddress: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: 2
  },
  orderRef: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: "italic",
    marginTop: 1
  },
  orderPaymentTag: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 4
  },
  timerProgressBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 14
  },
  timerProgressText: {
    fontSize: 11,
    fontWeight: "800"
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12
  },
  btnReject: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center"
  },
  btnRejectText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.muted
  },
  btnAccept: {
    flex: 2,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#16a34a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  btnAcceptText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5
  }
});
