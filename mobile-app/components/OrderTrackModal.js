import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from "react";
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
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import { openPhoneCall } from "../utils/navigation";

const STAGES = [
  { key: "recibido", label: "Recibido", icon: "receipt-outline" },
  { key: "confirmado", label: "Confirmado", icon: "checkmark-circle-outline" },
  { key: "preparando", label: "En Cocina", icon: "flame-outline" },
  { key: "listo", label: "Listo", icon: "cube-outline" },
  { key: "buscando_repartidor", label: "Buscando Chofer", icon: "search-outline" },
  { key: "repartidor_asignado", label: "Chofer Asignado", icon: "person-outline" },
  { key: "repartidor_recogiendo", label: "Recogiendo", icon: "bag-check-outline" },
  { key: "en_camino", label: "En Camino", icon: "bicycle-outline" },
  { key: "entregado", label: "Entregado", icon: "home-outline" },
];

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
  const isInTransit = trackingData?.trip_status === "in_transit" || trackingData?.operational_stage === "en_camino";
  const isDelivered = trackingData?.status === "entregado" || trackingData?.operational_stage === "entregado";
  const stopsBefore = Number(trackingData?.stops_before || 0);

  const currentStageKey = trackingData?.operational_stage || "recibido";
  const currentStageIndex = STAGES.findIndex(s => s.key === currentStageKey);
  const activeIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

  const driver = trackingData?.driver || {};
  const driverName = driver.name || trackingData?.driver_name;
  const driverPhone = driver.phone || trackingData?.driver_phone;
  const driverAvatar = driver.avatar_url;
  const avatarFullUrl = driverAvatar ? (driverAvatar.startsWith("http") ? driverAvatar : `${API_URL}${driverAvatar}`) : null;

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
              <View style={[styles.statusCard, isDelivered ? styles.statusCardDelivered : isArrived ? styles.statusCardArrived : isInTransit ? styles.statusCardTransit : styles.statusCardPrep]}>
                <Ionicons
                  name={isDelivered ? "checkmark-done-circle" : isArrived ? "home" : isInTransit ? "bicycle" : "restaurant"}
                  size={24}
                  color={isDelivered ? colors.success : isArrived ? colors.success : isInTransit ? colors.primary : colors.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>
                    {trackingData?.operational_stage_label || (
                      isDelivered
                        ? "¡Pedido entregado con éxito!"
                        : isArrived
                        ? "¡El repartidor ha llegado a tu puerta!"
                        : isInTransit
                        ? "En camino a tu dirección"
                        : "Preparando y armando tu pedido"
                    )}
                  </Text>
                  {!isDelivered && (
                    <Text style={styles.statusEta}>
                      Tiempo estimado: <Text style={{ fontWeight: "800" }}>{trackingData?.eta_range || (trackingData?.eta_minutes ? `${trackingData.eta_minutes} min` : "20–30 min")}</Text>
                    </Text>
                  )}
                </View>
              </View>

              {/* 9-Stage Progress Timeline */}
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
                    {driver.short_code ? (
                      <Text style={styles.driverCode}>ID: {driver.short_code}</Text>
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
  }
});
