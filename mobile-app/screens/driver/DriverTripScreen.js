import { useState, useEffect, useContext, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../../context/AppContext";
import { API_URL } from "../../config/api";
import colors from "../../theme/colors";
import Header from "../../components/Header";
import EmptyState from "../../components/EmptyState";
import DriverVerifyPinModal from "./DriverVerifyPinModal";
import DriverIssueModal from "./DriverIssueModal";
import { openWazeNavigation, openPhoneCall } from "../../utils/navigation";

export default function DriverTripScreen({ navigation }) {
  const { token, user, tripsUpdateSignal, orderUpdateSignal } = useContext(AppContext);

  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);

  // Modals state
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [activeStopForPin, setActiveStopForPin] = useState(null);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState("");

  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [activeStopForIssue, setActiveStopForIssue] = useState(null);
  const [submittingIssue, setSubmittingIssue] = useState(false);

  const loadMyTrip = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/deliveries/my-trip`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTripData(res.data);
    } catch (err) {
      console.log("Error loading driver trip:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadMyTrip();
  }, [loadMyTrip, tripsUpdateSignal, orderUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadMyTrip();
  };

  const handleStartTrip = async () => {
    try {
      setStartingTrip(true);
      await axios.patch(
        `${API_URL}/deliveries/my-trip/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadMyTrip();
      Alert.alert("¡En Ruta!", "Viaje iniciado. Conduce con precaución.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo iniciar el viaje");
    } finally {
      setStartingTrip(false);
    }
  };

  const handleMarkArrived = async (stop) => {
    try {
      await axios.patch(
        `${API_URL}/deliveries/stops/${stop.id}/arrived`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadMyTrip();
      Alert.alert("Llegada Notificada", "El cliente ha recibido el aviso de tu llegada.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo marcar la llegada");
    }
  };

  const handleOpenPinModal = (stop) => {
    setActiveStopForPin(stop);
    setPinError("");
    setPinModalVisible(true);
  };

  const handleVerifyPin = async (pin) => {
    if (!activeStopForPin) return;
    try {
      setVerifyingPin(true);
      setPinError("");
      const res = await axios.post(
        `${API_URL}/deliveries/stops/${activeStopForPin.id}/verify-pin`,
        { pin },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPinModalVisible(false);
      setActiveStopForPin(null);
      loadMyTrip();

      if (res.data?.trip_completed) {
        Alert.alert("¡Viaje Completado!", "Has entregado todos los pedidos asignados a esta ruta.");
      } else {
        Alert.alert("¡Entrega Confirmada!", "PIN verificado correctamente.");
      }
    } catch (err) {
      setPinError(err?.response?.data?.message || "PIN inválido");
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleOpenIssueModal = (stop) => {
    setActiveStopForIssue(stop);
    setIssueModalVisible(true);
  };

  const handleSubmitIssue = async ({ issue_reason, notes }) => {
    if (!activeStopForIssue) return;
    try {
      setSubmittingIssue(true);
      await axios.post(
        `${API_URL}/deliveries/stops/${activeStopForIssue.id}/report-issue`,
        { issue_reason, notes },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setIssueModalVisible(false);
      setActiveStopForIssue(null);
      loadMyTrip();
      Alert.alert("Incidencia Reportada", "Se ha notificado al administrador.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo reportar la incidencia");
    } finally {
      setSubmittingIssue(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Ruta de Entregas" showBrandMark={false} />
        <View style={styles.loaderBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Cargando viaje activo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const trip = tripData?.trip;
  const stops = Array.isArray(tripData?.stops) ? tripData.stops : [];
  const isInTransit = trip?.status === "in_transit";
  const isAssigned = trip?.status === "assigned";

  // Total cash to collect
  const totalCashToCollect = stops.reduce((sum, s) => {
    if (s.payment_method === "efectivo" && s.status !== "delivered") {
      return sum + Number(s.order_total || 0);
    }
    return sum;
  }, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Ruta de Reparto"
        subtitle={`Repartidor: ${user?.name || "Activo"}`}
        rightAction={
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {!trip ? (
          <EmptyState
            icon="bicycle-outline"
            title="Sin viaje activo asignado"
            description="Cuando cocina/despacho arme un viaje para tu ruta, aparecerá aquí con los destinos y navegación en tiempo real."
          />
        ) : (
          <View style={{ gap: 14 }}>
            {/* Active Trip Header Card */}
            <View style={styles.tripCard}>
              <View style={styles.tripHeaderRow}>
                <View>
                  <Text style={styles.tripId}>Viaje #{trip.id}</Text>
                  <Text style={styles.stopsCount}>
                    {stops.length} {stops.length === 1 ? "entrega agrupada" : "entregas agrupadas"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.tripStatusBadge,
                    isInTransit ? styles.badgeInTransit : styles.badgeAssigned
                  ]}
                >
                  <Ionicons
                    name={isInTransit ? "bicycle" : "restaurant"}
                    size={14}
                    color={isInTransit ? colors.primary : colors.warning}
                  />
                  <Text
                    style={[
                      styles.tripStatusText,
                      { color: isInTransit ? colors.primary : colors.warning }
                    ]}
                  >
                    {isInTransit ? "En Ruta" : "Listo en Restaurante"}
                  </Text>
                </View>
              </View>

              {/* Cash collection alert */}
              {totalCashToCollect > 0 ? (
                <View style={styles.cashAlertBox}>
                  <Ionicons name="cash" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cashAlertTitle}>Efectivo a Cobrar en Ruta</Text>
                    <Text style={styles.cashAlertAmount}>
                      ${totalCashToCollect.toFixed(2)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Start trip button if assigned */}
              {isAssigned && (
                <TouchableOpacity
                  style={[styles.startTripBtn, startingTrip && { opacity: 0.6 }]}
                  onPress={handleStartTrip}
                  disabled={startingTrip}
                  activeOpacity={0.85}
                >
                  {startingTrip ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="navigate" size={18} color="#ffffff" />
                      <Text style={styles.startTripBtnText}>Salir a Ruta / Iniciar Viaje</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Stops list */}
            <Text style={styles.sectionHeading}>Paradas en Orden de Ruta</Text>

            {stops.map((stop, idx) => {
              const isDelivered = stop.status === "delivered";
              const isFailed = stop.status === "failed";
              const isArrived = stop.status === "arrived";
              const isCash = stop.payment_method === "efectivo";

              return (
                <View
                  key={stop.id}
                  style={[
                    styles.stopCard,
                    isDelivered && styles.stopCardDelivered,
                    isFailed && styles.stopCardFailed
                  ]}
                >
                  {/* Sequence header */}
                  <View style={styles.stopHeader}>
                    <View style={styles.seqBadge}>
                      <Text style={styles.seqText}>{stop.sequence}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.stopFolio}>
                        Folio F{String(stop.folio || "").padStart(3, "0")}
                      </Text>
                      <Text style={styles.stopZone}>{stop.zone_name || "Zona de Entrega"}</Text>
                    </View>

                    {isDelivered ? (
                      <View style={styles.deliveredBadge}>
                        <Ionicons name="checkmark-done" size={14} color={colors.success} />
                        <Text style={styles.deliveredText}>Entregado</Text>
                      </View>
                    ) : isFailed ? (
                      <View style={styles.failedBadge}>
                        <Ionicons name="close" size={14} color={colors.danger} />
                        <Text style={styles.failedText}>Incidencia</Text>
                      </View>
                    ) : isArrived ? (
                      <View style={styles.arrivedBadge}>
                        <Ionicons name="location" size={14} color={colors.primary} />
                        <Text style={styles.arrivedText}>En Destino</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Customer details */}
                  <View style={styles.customerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>{stop.customer_name || "Cliente"}</Text>
                      <Text style={styles.addressLine}>{stop.address}</Text>
                      {stop.address_details ? (
                        <Text style={styles.refLine}>Ref: {stop.address_details}</Text>
                      ) : null}
                    </View>

                    {stop.customer_phone ? (
                      <TouchableOpacity
                        style={styles.callCircle}
                        onPress={() => openPhoneCall(stop.customer_phone)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="call" size={18} color="#ffffff" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Cash / Payment details box */}
                  <View style={styles.stopPaymentBox}>
                    <View style={styles.paymentStatusRow}>
                      <Text style={styles.paymentMethodLabel}>
                        {isCash ? "Pago en Efectivo:" : "Pago en App / Digital:"}
                      </Text>
                      <Text style={styles.orderTotalAmount}>
                        ${Number(stop.order_total || 0).toFixed(2)}
                      </Text>
                    </View>

                    {isCash && Number(stop.cash_paid_with) > 0 ? (
                      <View style={styles.cashDetailRow}>
                        <Text style={styles.cashSubdetail}>
                          Cliente paga con: ${Number(stop.cash_paid_with).toFixed(2)}
                        </Text>
                        <Text style={styles.cashChangeHighlight}>
                          Cambio a dar: ${Number(stop.cash_change_due || 0).toFixed(2)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Actions if pending */}
                  {!isDelivered && !isFailed && (
                    <View style={styles.stopActions}>
                      {/* Waze / Maps */}
                      <TouchableOpacity
                        style={styles.wazeBtn}
                        onPress={() =>
                          openWazeNavigation(
                            stop.latitude,
                            stop.longitude,
                            stop.address
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="navigate" size={16} color="#ffffff" />
                        <Text style={styles.wazeBtnText}>Navegar Waze</Text>
                      </TouchableOpacity>

                      {/* Arrived button */}
                      {!isArrived && (
                        <TouchableOpacity
                          style={styles.arrivedBtn}
                          onPress={() => handleMarkArrived(stop)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="location-outline" size={16} color={colors.primary} />
                          <Text style={styles.arrivedBtnText}>¡Ya Llegué!</Text>
                        </TouchableOpacity>
                      )}

                      {/* Verify PIN */}
                      <TouchableOpacity
                        style={styles.pinBtn}
                        onPress={() => handleOpenPinModal(stop)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="key" size={16} color="#ffffff" />
                        <Text style={styles.pinBtnText}>Validar PIN</Text>
                      </TouchableOpacity>

                      {/* Report issue */}
                      <TouchableOpacity
                        style={styles.issueBtn}
                        onPress={() => handleOpenIssueModal(stop)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="warning-outline" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* PIN Verification Modal */}
      <DriverVerifyPinModal
        visible={pinModalVisible}
        stop={activeStopForPin}
        loading={verifyingPin}
        error={pinError}
        onClose={() => setPinModalVisible(false)}
        onVerify={handleVerifyPin}
      />

      {/* Issue Modal */}
      <DriverIssueModal
        visible={issueModalVisible}
        stop={activeStopForIssue}
        loading={submittingIssue}
        onClose={() => setIssueModalVisible(false)}
        onSubmit={handleSubmitIssue}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  loaderBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30
  },
  loaderText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 12
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 12
  },
  tripHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  tripId: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text
  },
  stopsCount: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    fontWeight: "600"
  },
  tripStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1
  },
  badgeInTransit: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  badgeAssigned: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder
  },
  tripStatusText: {
    fontSize: 11,
    fontWeight: "800"
  },
  cashAlertBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 10
  },
  cashAlertTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase"
  },
  cashAlertAmount: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text
  },
  startTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14
  },
  startTripBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginTop: 6
  },
  stopCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    gap: 12
  },
  stopCardDelivered: {
    opacity: 0.6,
    backgroundColor: colors.surfaceMuted
  },
  stopCardFailed: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center"
  },
  seqBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  seqText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff"
  },
  stopFolio: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text
  },
  stopZone: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600"
  },
  deliveredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  deliveredText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.success
  },
  failedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  failedText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.danger
  },
  arrivedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  arrivedText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  custName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  addressLine: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2
  },
  refLine: {
    fontSize: 11,
    color: colors.textSubtle,
    marginTop: 1
  },
  callCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center"
  },
  stopPaymentBox: {
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    borderRadius: 12,
    gap: 4
  },
  paymentStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  paymentMethodLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted
  },
  orderTotalAmount: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text
  },
  cashDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2
  },
  cashSubdetail: {
    fontSize: 11,
    color: colors.muted
  },
  cashChangeHighlight: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary
  },
  stopActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4
  },
  wazeBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#33ccff",
    borderRadius: 12,
    paddingVertical: 10
  },
  wazeBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff"
  },
  arrivedBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.primary
  },
  arrivedBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary
  },
  pinBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 10
  },
  pinBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff"
  },
  issueBtn: {
    width: 38,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: "center",
    justifyContent: "center"
  }
});
