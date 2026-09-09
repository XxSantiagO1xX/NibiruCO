import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useContext } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../context/AppContext";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import { openPhoneCall } from "../utils/navigation";

// 10 Etapas Operativas Unificadas
const STAGES = [
  { key: "confirmado", label: "Confirmado", icon: "checkmark-circle-outline" },
  { key: "preparando", label: "En Cocina", icon: "flame-outline" },
  { key: "listo", label: "Listo", icon: "cube-outline" },
  { key: "buscando_repartidor", label: "Buscando Chofer", icon: "search-outline" },
  { key: "repartidor_asignado", label: "Chofer Asignado", icon: "person-outline" },
  { key: "esperando_recogida", label: "En Sucursal", icon: "bag-check-outline" },
  { key: "en_ruta", label: "En Ruta", icon: "bicycle-outline" },
  { key: "repartidor_cercano", label: "Chofer Cercano", icon: "navigate-outline" },
  { key: "repartidor_llego", label: "¡Ya Llegó!", icon: "home-outline" },
  { key: "entregado", label: "Entregado", icon: "checkmark-done-circle-outline" },
];

export default function OrderTrackModal({
  visible,
  orderId,
  token,
  onClose
}) {
  const { socket } = useContext(AppContext);
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

  // Suscripción en vivo por Socket.io (Room del pedido) + polling de respaldo
  useEffect(() => {
    if (visible && orderId) {
      setLoading(true);
      loadTracking();

      // Unirse al room privado del pedido
      if (socket) {
        socket.emit("join-order", orderId);

        const handleStopArrived = (data) => {
          if (data && (Number(data.order_id) === Number(orderId) || !data.order_id)) {
            setTrackingData((prev) => prev ? {
              ...prev,
              tracking_stage: "repartidor_llego",
              arrived_at: data.arrived_at || new Date().toISOString()
            } : prev);
            loadTracking();
          }
        };

        const handleOrderUpdated = (data) => {
          if (!data || Number(data.id) === Number(orderId) || Number(data.order_id) === Number(orderId)) {
            loadTracking();
          }
        };

        socket.on("stop-arrived", handleStopArrived);
        socket.on("order-updated", handleOrderUpdated);
        socket.on("orders-updated", loadTracking);
        socket.on("delivery-updated", loadTracking);

        const interval = setInterval(loadTracking, 8000);

        return () => {
          clearInterval(interval);
          socket.emit("leave-order", orderId);
          socket.off("stop-arrived", handleStopArrived);
          socket.off("order-updated", handleOrderUpdated);
          socket.off("orders-updated", loadTracking);
          socket.off("delivery-updated", loadTracking);
        };
      } else {
        const interval = setInterval(loadTracking, 8000);
        return () => clearInterval(interval);
      }
    }
  }, [visible, orderId, socket, loadTracking]);

  if (!visible) return null;

  const stageKey = trackingData?.tracking_stage || "confirmado";
  const isArrived = stageKey === "repartidor_llego" || trackingData?.stop_status === "arrived";
  const isDelivered = stageKey === "entregado" || trackingData?.status === "entregado";
  const isInTransit = stageKey === "en_ruta" || stageKey === "repartidor_cercano" || trackingData?.trip_status === "in_transit";
  const isNearby = stageKey === "repartidor_cercano";
  const stopsBefore = Number(trackingData?.stops_before || 0);

  const currentStageIndex = STAGES.findIndex((s) => s.key === stageKey);
  const activeIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

  // Datos normalizados del chofer
  const driver = trackingData?.driver_info || null;
  const driverName = driver?.name || null;
  const driverPhone = driver?.phone || null;
  const driverShortCode = driver?.short_code || null;
  const driverAvatar = driver?.avatar_url || null;
  const avatarFullUrl = driverAvatar ? (driverAvatar.startsWith("http") ? driverAvatar : `${API_URL}${driverAvatar}`) : null;

  const getStageTitle = () => {
    switch (stageKey) {
      case "entregado":
        return "¡Pedido entregado con éxito!";
      case "repartidor_llego":
        return "¡El repartidor ha llegado a tu puerta!";
      case "repartidor_cercano":
        return "¡Tu repartidor está muy cerca de tu domicilio!";
      case "en_ruta":
        return "Tu pedido va en camino a tu dirección";
      case "esperando_recogida":
        return "El repartidor está en sucursal recogiendo tu pedido";
      case "repartidor_asignado":
        return "Repartidor asignado, en camino a la sucursal";
      case "buscando_repartidor":
        return "Buscando repartidor disponible en la zona";
      case "listo":
        return "Tu pedido está listo y empaquetado";
      case "preparando":
        return "En cocina preparando tus platillos";
      case "confirmado":
      default:
        return "Pedido recibido y confirmado";
    }
  };

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
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {/* PIN Card Highlight */}
              {trackingData?.delivery_pin && !isDelivered ? (
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
              <View
                style={[
                  styles.statusCard,
                  isDelivered
                    ? styles.statusCardDelivered
                    : isArrived
                    ? styles.statusCardArrived
                    : isInTransit
                    ? styles.statusCardTransit
                    : styles.statusCardPrep
                ]}
              >
                <Ionicons
                  name={
                    isDelivered
                      ? "checkmark-done-circle"
                      : isArrived
                      ? "home"
                      : isInTransit
                      ? "bicycle"
                      : "restaurant"
                  }
                  size={24}
                  color={
                    isDelivered
                      ? colors.success
                      : isArrived
                      ? colors.success
                      : isInTransit
                      ? colors.primary
                      : colors.warning
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>
                    {getStageTitle()}
                  </Text>
                  {!isDelivered && (
                    <Text style={styles.statusEta}>
                      Tiempo estimado: <Text style={{ fontWeight: "800" }}>{trackingData?.eta_range || (trackingData?.eta_minutes ? `${trackingData.eta_minutes} min` : "20–30 min")}</Text>
                    </Text>
                  )}
                </View>
              </View>

              {/* 10-Stage Progress Timeline */}
              <View style={styles.timelineCard}>
                <Text style={styles.timelineTitle}>Progreso de tu Pedido</Text>
                <View style={styles.timelineSteps}>
                  {STAGES.map((st, idx) => {
                    const isDone = idx < activeIndex;
                    const isCurrent = idx === activeIndex;
                    return (
                      <View key={st.key} style={styles.stepRow}>
                        <View style={styles.stepIndicatorCol}>
                          <View
                            style={[
                              styles.stepCircle,
                              isDone && styles.stepCircleDone,
                              isCurrent && styles.stepCircleCurrent
                            ]}
                          >
                            <Ionicons
                              name={isDone ? "checkmark" : st.icon}
                              size={12}
                              color={isDone || isCurrent ? "#ffffff" : colors.muted}
                            />
                          </View>
                          {idx < STAGES.length - 1 && (
                            <View
                              style={[
                                styles.stepLine,
                                isDone && styles.stepLineDone
                              ]}
                            />
                          )}
                        </View>
                        <View style={styles.stepTextCol}>
                          <Text
                            style={[
                              styles.stepLabel,
                              isCurrent && styles.stepLabelCurrent,
                              isDone && styles.stepLabelDone
                            ]}
                          >
                            {st.label}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Prior Stops notice */}
              {stopsBefore > 0 && isInTransit && !isArrived && !isDelivered ? (
                <View style={styles.stopsNotice}>
                  <Ionicons name="navigate-circle-outline" size={20} color={colors.info} />
                  <Text style={styles.stopsNoticeText}>
                    Tu repartidor tiene {stopsBefore} {stopsBefore === 1 ? "entrega previa" : "entregas previas"} en la misma ruta antes de llegar contigo.
                  </Text>
                </View>
              ) : null}

              {/* Driver Contact */}
              {driverName && !isDelivered ? (
                <View style={styles.driverCard}>
                  <View style={styles.driverAvatar}>
                    {avatarFullUrl ? (
                      <Image source={{ uri: avatarFullUrl }} style={styles.driverAvatarImg} />
                    ) : (
                      <Ionicons name="person" size={20} color="#ffffff" />
                    )}
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={styles.driverRole}>Tu Repartidor Asignado</Text>
                    <Text style={styles.driverName}>{driverName}</Text>
                    {driverShortCode ? (
                      <Text style={styles.driverCode}>ID: {driverShortCode}</Text>
                    ) : null}
                  </View>
                  {driverPhone ? (
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => openPhoneCall(driverPhone)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call" size={16} color="#ffffff" />
                      <Text style={styles.callBtnText}>Llamar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {/* Live Tracking Architecture Container (Ready for MapLibre/Google/Geoapify renderer) */}
              {isInTransit && trackingData?.customer_lat && (
                <View style={styles.routeCard}>
                  <View style={styles.routeHeader}>
                    <Ionicons name="map-outline" size={18} color={colors.primary} />
                    <Text style={styles.routeTitle}>Ruta en Tiempo Real</Text>
                    <View style={styles.routeBadge}>
                      <Text style={styles.routeBadgeText}>{trackingData.eta_range || "En camino"}</Text>
                    </View>
                  </View>
                  <Text style={styles.routeDesc}>
                    {isNearby
                      ? "📍 El repartidor está a menos de 5 minutos de tu domicilio."
                      : "📍 Tu repartidor avanza por la ruta óptima hacia tu dirección."}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={loadTracking}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={16} color={colors.primary} />
                <Text style={styles.refreshBtnText}>Actualizar Estado</Text>
              </TouchableOpacity>
            </ScrollView>
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
  statusCardDelivered: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  timelineSteps: {
    paddingLeft: 4
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 32
  },
  stepIndicatorCol: {
    alignItems: "center",
    width: 22,
    marginRight: 10
  },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  stepCircleDone: {
    backgroundColor: colors.success,
    borderColor: colors.success
  },
  stepCircleCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  stepLine: {
    width: 2,
    height: 14,
    backgroundColor: colors.borderLight,
    marginVertical: 2
  },
  stepLineDone: {
    backgroundColor: colors.success
  },
  stepTextCol: {
    flex: 1,
    paddingTop: 1
  },
  stepLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600"
  },
  stepLabelCurrent: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 12.5
  },
  stepLabelDone: {
    color: colors.text,
    fontWeight: "700"
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
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  driverAvatarImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
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
  driverCode: {
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 1
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
  },
  routeCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 8
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  routeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    flex: 1
  },
  routeBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  routeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary
  },
  routeDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16
  }
});
