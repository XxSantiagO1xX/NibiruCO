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
  const { token, user, checkAuth, tripsUpdateSignal, orderUpdateSignal, offerUpdateSignal } = useContext(AppContext);

  const [tripData, setTripData] = useState(null);
  const [activeOffer, setActiveOffer] = useState(null);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(0);
  const [driverStatus, setDriverStatus] = useState(user?.driver_status || "offline");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);
  const [respondingOffer, setRespondingOffer] = useState(false);

  // Modals state
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [activeStopForPin, setActiveStopForPin] = useState(null);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState("");

  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [activeStopForIssue, setActiveStopForIssue] = useState(null);
  const [submittingIssue, setSubmittingIssue] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [tripRes, offerRes] = await Promise.all([
        axios.get(`${API_URL}/deliveries/my-trip`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: null })),
        axios.get(`${API_URL}/deliveries/my-offer`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: { offer: null } }))
      ]);

      setTripData(tripRes?.data || null);

      const offer = offerRes?.data?.offer || null;
      setActiveOffer(offer);
      if (offer) {
        setOfferSecondsLeft(Math.max(0, Number(offer.seconds_left || 0)));
      } else {
        setOfferSecondsLeft(0);
      }
    } catch (err) {
      console.log("Error loading driver trip/offer:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (user?.driver_status) {
      setDriverStatus(user.driver_status);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData, tripsUpdateSignal, orderUpdateSignal, offerUpdateSignal]);

  // Offer countdown timer interval
  useEffect(() => {
    if (!activeOffer || offerSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setOfferSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          loadData();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeOffer, offerSecondsLeft, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    checkAuth();
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      setUpdatingStatus(true);
      await axios.patch(
        `${API_URL}/deliveries/drivers/${user.id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDriverStatus(newStatus);
      await checkAuth();
      loadData();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo actualizar estado");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAcceptOffer = async () => {
    if (!activeOffer) return;
    try {
      setRespondingOffer(true);
      await axios.post(
        `${API_URL}/deliveries/offers/${activeOffer.id}/accept`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActiveOffer(null);
      await checkAuth();
      loadData();
      Alert.alert("¡Oferta Aceptada!", "El viaje ha sido asignado a tu ruta.");
    } catch (err) {
      Alert.alert("Oferta no disponible", err?.response?.data?.message || "La oferta expiró o fue cancelada");
      setActiveOffer(null);
      loadData();
    } finally {
      setRespondingOffer(false);
    }
  };

  const handleRejectOffer = async (shouldPause = false) => {
    if (!activeOffer) return;
    try {
      setRespondingOffer(true);
      await axios.post(
        `${API_URL}/deliveries/offers/${activeOffer.id}/reject`,
        { reason: "rechazado_por_repartidor", pause: shouldPause },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActiveOffer(null);
      if (shouldPause) {
        setDriverStatus("pausa");
      }
      await checkAuth();
      loadData();
    } catch (err) {
      console.log("Error rejecting offer:", err.message);
      setActiveOffer(null);
      loadData();
    } finally {
      setRespondingOffer(false);
    }
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

      {/* Driver Operational Status Bar */}
      <View style={styles.statusBarContainer}>
        <Text style={styles.statusLabel}>Mi Estado:</Text>
        <View style={styles.statusPillsRow}>
          <TouchableOpacity
            style={[
              styles.statusPill,
              driverStatus === "disponible" && styles.statusPillActiveAvailable
            ]}
            onPress={() => handleUpdateStatus("disponible")}
            disabled={updatingStatus}
          >
            <View style={[styles.statusDot, { backgroundColor: "#16a34a" }]} />
            <Text
              style={[
                styles.statusPillText,
                driverStatus === "disponible" && styles.statusPillTextActive
              ]}
            >
              Disponible
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusPill,
              driverStatus === "pausa" && styles.statusPillActivePause
            ]}
            onPress={() => handleUpdateStatus("pausa")}
            disabled={updatingStatus}
          >
            <View style={[styles.statusDot, { backgroundColor: "#eab308" }]} />
            <Text
              style={[
                styles.statusPillText,
                driverStatus === "pausa" && styles.statusPillTextActive
              ]}
            >
              Pausa
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusPill,
              driverStatus === "offline" && styles.statusPillActiveOffline
            ]}
            onPress={() => handleUpdateStatus("offline")}
            disabled={updatingStatus}
          >
            <View style={[styles.statusDot, { backgroundColor: "#94a3b8" }]} />
            <Text
              style={[
                styles.statusPillText,
                driverStatus === "offline" && styles.statusPillTextActive
              ]}
            >
              Offline
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
        {/* Incoming Exclusive Offer Alert */}
        {activeOffer ? (
          <View style={styles.offerAlertCard}>
            <View style={styles.offerHeaderRow}>
              <View style={styles.offerBadge}>
                <Ionicons name="flash" size={14} color="#ffffff" />
                <Text style={styles.offerBadgeText}>Oferta Exclusiva</Text>
              </View>
              <View style={styles.countdownBadge}>
                <Ionicons name="time" size={14} color="#b45309" />
                <Text style={styles.countdownText}>{offerSecondsLeft}s restantes</Text>
              </View>
            </View>

            <Text style={styles.offerTitle}>
              {activeOffer.orders?.length || 1} {(activeOffer.orders?.length || 1) === 1 ? "Pedido disponible" : "Pedidos agrupados"}
            </Text>

            <View style={styles.offerDetailsBox}>
              <View style={styles.offerDetailRow}>
                <Text style={styles.offerDetailLabel}>Zona:</Text>
                <Text style={styles.offerDetailVal}>
                  {activeOffer.orders?.[0]?.zone_name || "Zona general"}
                </Text>
              </View>
              <View style={styles.offerDetailRow}>
                <Text style={styles.offerDetailLabel}>Efectivo a cobrar:</Text>
                <Text style={styles.offerDetailValHighlight}>
                  ${Number(activeOffer.total_cash_to_collect || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.offerAddressesList}>
                {activeOffer.orders?.map((ord, i) => (
                  <Text key={ord.id || i} style={styles.offerAddressItem} numberOfLines={1}>
                    📍 F{String(ord.folio || ord.id).padStart(3, "0")} · {ord.address}
                  </Text>
                ))}
              </View>
            </View>

            <View style={styles.offerActionsRow}>
              <TouchableOpacity
                style={[styles.rejectOfferBtn, respondingOffer && { opacity: 0.6 }]}
                onPress={() => handleRejectOffer(false)}
                disabled={respondingOffer}
              >
                <Text style={styles.rejectOfferBtnText}>Rechazar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptOfferBtn, respondingOffer && { opacity: 0.6 }]}
                onPress={handleAcceptOffer}
                disabled={respondingOffer}
              >
                {respondingOffer ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                    <Text style={styles.acceptOfferBtnText}>Aceptar Viaje</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Returning to Base Banner */}
        {driverStatus === "regresando" && (
          <View style={styles.returningCard}>
            <Ionicons name="bicycle" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.returningTitle}>Ruta completada · Regresando a base</Text>
              <Text style={styles.returningSubtitle}>
                Al llegar al restaurante, márcate como disponible para recibir nuevos pedidos.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.setAvailableBtn}
              onPress={() => handleUpdateStatus("disponible")}
            >
              <Text style={styles.setAvailableBtnText}>En Base 🟢</Text>
            </TouchableOpacity>
          </View>
        )}

        {!trip ? (
          <EmptyState
            icon="bicycle-outline"
            title={driverStatus === "disponible" ? "Esperando pedidos listos..." : "Sin viaje activo"}
            description={
              driverStatus === "disponible"
                ? "Estás disponible. En cuanto mostrador marque pedidos listos en tu zona, recibirás una oferta exclusiva."
                : driverStatus === "pausa"
                ? "Estás en pausa. Cambia tu estado a 'Disponible' para empezar a recibir viajes."
                : "Estás desconectado. Activa tu estado para recibir asignaciones automáticas."
            }
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
  },
  statusBarContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text
  },
  statusPillsRow: {
    flexDirection: "row",
    gap: 6
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceMuted
  },
  statusPillActiveAvailable: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac"
  },
  statusPillActivePause: {
    backgroundColor: "#fef9c3",
    borderColor: "#fde047"
  },
  statusPillActiveOffline: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1"
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted
  },
  statusPillTextActive: {
    color: colors.text,
    fontWeight: "900"
  },
  offerAlertCard: {
    backgroundColor: "#fffbeb",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#f59e0b",
    padding: 16,
    marginBottom: 14,
    gap: 10,
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4
  },
  offerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  offerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#d97706",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  offerBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fde68a"
  },
  countdownText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#b45309"
  },
  offerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text
  },
  offerDetailsBox: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#fde68a"
  },
  offerDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  offerDetailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  offerDetailVal: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text
  },
  offerDetailValHighlight: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.primary
  },
  offerAddressesList: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 4
  },
  offerAddressItem: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600"
  },
  offerActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4
  },
  rejectOfferBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    alignItems: "center",
    justifyContent: "center"
  },
  rejectOfferBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#dc2626"
  },
  acceptOfferBtn: {
    flex: 2,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  acceptOfferBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff"
  },
  returningCard: {
    backgroundColor: "#eff6ff",
    borderWidth: 1.5,
    borderColor: "#93c5fd",
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14
  },
  returningTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#1d4ed8"
  },
  returningSubtitle: {
    fontSize: 11,
    color: "#3b82f6",
    marginTop: 2
  },
  setAvailableBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10
  },
  setAvailableBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
