import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import { openPhoneCall } from "../utils/navigation";

export default function OrderTrackModal({
  visible,
  orderId,
  token,
  onClose
}) {
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTracking = useCallback(async () => {
    if (!orderId || !token) return;
    try {
      const res = await axios.get(`${API_URL}/deliveries/orders/${orderId}/track`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrackingData(res.data);
    } catch (err) {
      console.log("Error loading tracking:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      loadTracking();
      const interval = setInterval(loadTracking, 8000);
      return () => clearInterval(interval);
    }
  }, [visible, loadTracking]);

  if (!visible) return null;

  const isArrived = trackingData?.stop_status === "arrived";
  const isInTransit = trackingData?.trip_status === "in_transit";
  const stopsBefore = Number(trackingData?.stops_before || 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>
                Seguimiento de Entrega
              </Text>
              <Text style={styles.headerSubtitle}>
                {trackingData?.folio ? `Folio F${String(trackingData.folio).padStart(3, "0")}` : `Pedido #${orderId}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loading && !trackingData ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>Cargando estado en tiempo real...</Text>
            </View>
          ) : (
            <View style={styles.content}>
              {/* PIN Card Highlight */}
              {trackingData?.delivery_pin ? (
                <View style={styles.pinCard}>
                  <View style={styles.pinIconCircle}>
                    <Ionicons name="key" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.pinInfo}>
                    <Text style={styles.pinLabel}>TU PIN DE ENTREGA</Text>
                    <Text style={styles.pinCode}>{trackingData.delivery_pin}</Text>
                    <Text style={styles.pinHelp}>
                      Proporciona este código a tu repartidor al recibir tu pedido.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Status Banner */}
              <View style={[styles.statusCard, isArrived ? styles.statusCardArrived : isInTransit ? styles.statusCardTransit : styles.statusCardPrep]}>
                <Ionicons
                  name={isArrived ? "home" : isInTransit ? "bicycle" : "restaurant"}
                  size={24}
                  color={isArrived ? colors.success : isInTransit ? colors.primary : colors.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>
                    {isArrived
                      ? "¡El repartidor ha llegado!"
                      : isInTransit
                      ? "En camino a tu dirección"
                      : "Preparando y armando tu pedido"}
                  </Text>
                  <Text style={styles.statusEta}>
                    Tiempo estimado: <Text style={{ fontWeight: "800" }}>{trackingData?.eta_range || "25–35 min"}</Text>
                  </Text>
                </View>
              </View>

              {/* Prior Stops notice */}
              {stopsBefore > 0 && isInTransit && !isArrived ? (
                <View style={styles.stopsNotice}>
                  <Ionicons name="navigate-circle-outline" size={20} color={colors.info} />
                  <Text style={styles.stopsNoticeText}>
                    Tu repartidor tiene {stopsBefore} {stopsBefore === 1 ? "entrega previa" : "entregas previas"} en la misma ruta antes de llegar contigo.
                  </Text>
                </View>
              ) : null}

              {/* Driver Contact */}
              {trackingData?.driver_name ? (
                <View style={styles.driverCard}>
                  <View style={styles.driverAvatar}>
                    <Ionicons name="person" size={20} color="#ffffff" />
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={styles.driverRole}>Tu Repartidor Asignado</Text>
                    <Text style={styles.driverName}>{trackingData.driver_name}</Text>
                  </View>
                  {trackingData.driver_phone ? (
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => openPhoneCall(trackingData.driver_phone)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call" size={16} color="#ffffff" />
                      <Text style={styles.callBtnText}>Llamar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={loadTracking}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={16} color={colors.primary} />
                <Text style={styles.refreshBtnText}>Actualizar Ubicación</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(25, 23, 21, 0.65)",
    justifyContent: "flex-end"
  },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    paddingBottom: 20
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.4
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    fontWeight: "600"
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  loadingBox: {
    padding: 40,
    alignItems: "center"
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted
  },
  content: {
    padding: 20,
    gap: 14
  },
  pinCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
    gap: 14
  },
  pinIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  pinInfo: {
    flex: 1
  },
  pinLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 1
  },
  pinCode: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 6,
    marginTop: 2
  },
  pinHelp: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 15
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12
  },
  statusCardPrep: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder
  },
  statusCardTransit: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  statusCardArrived: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  statusEta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 3
  },
  stopsNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.infoSoft,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    gap: 10
  },
  stopsNoticeText: {
    fontSize: 12,
    color: colors.info,
    fontWeight: "600",
    flex: 1,
    lineHeight: 16
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 12
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  driverInfo: {
    flex: 1
  },
  driverRole: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase"
  },
  driverName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12
  },
  callBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary
  }
});
