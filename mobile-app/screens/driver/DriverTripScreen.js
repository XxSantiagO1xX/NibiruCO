import { useState, useEffect, useContext, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  AppState,
  Vibration,
  Platform
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../../context/AppContext";
import { API_URL } from "../../config/api";
import colors from "../../theme/colors";
import Header from "../../components/Header";
import EmptyState from "../../components/EmptyState";
import DriverVerifyPinModal from "./DriverVerifyPinModal";
import DriverIssueModal from "./DriverIssueModal";
import DriverOfferModal from "./DriverOfferModal";
import { openWazeNavigation, openPhoneCall } from "../../utils/navigation";

export default function DriverTripScreen({ navigation }) {
  const { token, user, refreshUser, tripsUpdateSignal, orderUpdateSignal, offerUpdateSignal } = useContext(AppContext);

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

  const appState = useRef(AppState.currentState);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [tripRes, offerRes, userRes] = await Promise.all([
        axios.get(`${API_URL}/deliveries/my-trip`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: null })),
        axios.get(`${API_URL}/deliveries/my-offer`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: { offer: null, active_offer: null } })),
        axios.get(`${API_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: null }))
      ]);

      setTripData(tripRes?.data || null);

      if (userRes?.data?.driver_status) {
        setDriverStatus(userRes.data.driver_status);
      }

      const offer = offerRes?.data?.offer || offerRes?.data?.active_offer || null;
      setActiveOffer(offer);
      if (offer) {
        const remaining = Number(offer.remaining_seconds ?? offer.seconds_left ?? 0);
        setOfferSecondsLeft(Math.max(0, remaining));
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
  }, [user?.driver_status]);

  // Sockets and external signal updates
  useEffect(() => {
    loadData();
  }, [loadData, tripsUpdateSignal, orderUpdateSignal, offerUpdateSignal]);

  // App focus / foreground recovery without triggering global auth loading
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        loadData();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [loadData]);

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
      if (refreshUser) refreshUser().catch(() => {});
      await loadData();
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
      if (refreshUser) refreshUser().catch(() => {});
      await loadData();
      Alert.alert("¡Oferta Aceptada!", "El viaje ha sido asignado a tu ruta. Pasa a recoger el pedido a Mostrador.");
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
      if (refreshUser) refreshUser().catch(() => {});
      await loadData();
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
      if (refreshUser) refreshUser().catch(() => {});
      await loadData();
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
      await loadData();
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
      if (refreshUser) refreshUser().catch(() => {});
      await loadData();

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
      if (refreshUser) refreshUser().catch(() => {});
      await loadData();
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
          <Text style={styles.loaderText}>Cargando estado de reparto...</Text>
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

  // Render Dominant Header Component
  const renderDominantHeader = () => {
    if (isAssigned || driverStatus === "esperando_recogida") {
      return (
        <View style={[styles.dominantCard, styles.dominantCardAssigned]}>
          <View style={styles.dominantTopRow}>
            <View style={[styles.dominantBadge, styles.dominantBadgeAssigned]}>
              <Ionicons name="restaurant" size={15} color="#c2410c" />
              <Text style={[styles.dominantBadgeText, { color: "#c2410c" }]}>
                ESPERANDO RECOGIDA
              </Text>
            </View>
            <Text style={styles.dominantSubtitle}>Viaje #{trip?.id || "Activo"}</Text>
          </View>
          <Text style={styles.dominantTitle}>
            Pasa a Mostrador a recoger {stops.length} {stops.length === 1 ? "pedido" : "pedidos"}
          </Text>
          <Text style={styles.dominantHint}>
            Verifica que los paquetes coincidan con tus folios antes de iniciar la ruta.
          </Text>
          <TouchableOpacity
            style={[styles.dominantPrimaryBtn, styles.btnStartRoute, startingTrip && { opacity: 0.6 }]}
            onPress={handleStartTrip}
            disabled={startingTrip}
            activeOpacity={0.85}
          >
            {startingTrip ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="navigate" size={18} color="#ffffff" />
                <Text style={styles.dominantPrimaryBtnText}>SALIR A RUTA / INICIAR VIAJE</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (isInTransit || driverStatus === "en_ruta") {
      const pendingStops = stops.filter((s) => s.status !== "delivered" && s.status !== "failed");
      return (
        <View style={[styles.dominantCard, styles.dominantCardInTransit]}>
          <View style={styles.dominantTopRow}>
            <View style={[styles.dominantBadge, styles.dominantBadgeInTransit]}>
              <Ionicons name="bicycle" size={15} color={colors.primary} />
              <Text style={[styles.dominantBadgeText, { color: colors.primary }]}>
                EN RUTA DE ENTREGA
              </Text>
            </View>
            <Text style={styles.dominantSubtitle}>
              {pendingStops.length} {pendingStops.length === 1 ? "parada restante" : "paradas restantes"}
            </Text>
          </View>
          <Text style={styles.dominantTitle}>Entregando pedidos a clientes</Text>
          <Text style={styles.dominantHint}>
            Valida el PIN de 4 dígitos de cada cliente para confirmar la entrega.
          </Text>
        </View>
      );
    }

    if (driverStatus === "disponible") {
      return (
        <View style={[styles.dominantCard, styles.dominantCardAvailable]}>
          <View style={styles.dominantTopRow}>
            <View style={[styles.dominantBadge, styles.dominantBadgeAvailable]}>
              <View style={[styles.pulseDot, { backgroundColor: "#16a34a" }]} />
              <Text style={[styles.dominantBadgeText, { color: "#16a34a" }]}>
                DISPONIBLE
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleUpdateStatus("offline")}
              disabled={updatingStatus}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.secondaryActionText}>Finalizar turno</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dominantTitle}>Estás recibiendo pedidos automáticamente</Text>
          <Text style={styles.dominantHint}>
            Mantente alerta. Cuando haya pedidos listos en tu zona recibirás una oferta exclusiva con alerta sonora.
          </Text>
          <TouchableOpacity
            style={[styles.dominantPrimaryBtn, styles.btnPause, updatingStatus && { opacity: 0.6 }]}
            onPress={() => handleUpdateStatus("pausa")}
            disabled={updatingStatus}
            activeOpacity={0.8}
          >
            {updatingStatus ? (
              <ActivityIndicator color="#854d0e" size="small" />
            ) : (
              <>
                <Ionicons name="pause-circle-outline" size={18} color="#854d0e" />
                <Text style={styles.btnPauseText}>Ponerme en pausa</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (driverStatus === "pausa") {
      return (
        <View style={[styles.dominantCard, styles.dominantCardPause]}>
          <View style={styles.dominantTopRow}>
            <View style={[styles.dominantBadge, styles.dominantBadgePause]}>
              <View style={[styles.pulseDot, { backgroundColor: "#ca8a04" }]} />
              <Text style={[styles.dominantBadgeText, { color: "#ca8a04" }]}>
                EN PAUSA
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleUpdateStatus("offline")}
              disabled={updatingStatus}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.secondaryActionText}>Finalizar turno</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dominantTitle}>No recibirás nuevas entregas</Text>
          <Text style={styles.dominantHint}>
            El sistema de despacho automático excluirá tu perfil hasta que vuelvas a estar disponible.
          </Text>
          <TouchableOpacity
            style={[styles.dominantPrimaryBtn, styles.btnResume, updatingStatus && { opacity: 0.6 }]}
            onPress={() => handleUpdateStatus("disponible")}
            disabled={updatingStatus}
            activeOpacity={0.8}
          >
            {updatingStatus ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="play-circle" size={18} color="#ffffff" />
                <Text style={styles.btnResumeText}>Volver a estar disponible</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (driverStatus === "regresando") {
      return (
        <View style={[styles.dominantCard, styles.dominantCardReturning]}>
          <View style={styles.dominantTopRow}>
            <View style={[styles.dominantBadge, styles.dominantBadgeReturning]}>
              <Ionicons name="bicycle" size={15} color="#1d4ed8" />
              <Text style={[styles.dominantBadgeText, { color: "#1d4ed8" }]}>
                REGRESANDO A BASE
              </Text>
            </View>
          </View>
          <Text style={styles.dominantTitle}>Ruta completada · En camino al local</Text>
          <Text style={styles.dominantHint}>
            Al llegar al restaurante, márcate como disponible para recibir las siguientes entregas preparadas.
          </Text>
          <TouchableOpacity
            style={[styles.dominantPrimaryBtn, styles.btnReturningAvailable, updatingStatus && { opacity: 0.6 }]}
            onPress={() => handleUpdateStatus("disponible")}
            disabled={updatingStatus}
            activeOpacity={0.8}
          >
            {updatingStatus ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                <Text style={styles.dominantPrimaryBtnText}>YA LLEGUÉ / ESTAR DISPONIBLE</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    // Default: offline
    return (
      <View style={[styles.dominantCard, styles.dominantCardOffline]}>
        <View style={styles.dominantTopRow}>
          <View style={[styles.dominantBadge, styles.dominantBadgeOffline]}>
            <View style={[styles.pulseDot, { backgroundColor: "#64748b" }]} />
            <Text style={[styles.dominantBadgeText, { color: "#475569" }]}>
              FUERA DE TURNO
            </Text>
          </View>
        </View>
        <Text style={styles.dominantTitle}>No estás participando en el despacho</Text>
        <Text style={styles.dominantHint}>
          Inicia tu turno para que el motor inteligente de MealOps te asigne entregas a domicilio.
        </Text>
        <TouchableOpacity
          style={[styles.dominantPrimaryBtn, styles.btnStartShift, updatingStatus && { opacity: 0.6 }]}
          onPress={() => handleUpdateStatus("disponible")}
          disabled={updatingStatus}
          activeOpacity={0.8}
        >
          {updatingStatus ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="power" size={18} color="#ffffff" />
              <Text style={styles.dominantPrimaryBtnText}>INICIAR TURNO / ESTAR DISPONIBLE</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

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

      {/* Dominant Status Card */}
      <View style={styles.dominantContainer}>
        {renderDominantHeader()}
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
        {/* Secondary Inline Offer Alert Card (if offer is active) */}
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
              {activeOffer.orders?.length || 1} {(activeOffer.orders?.length || 1) === 1 ? "Pedido asignado disponible" : "Pedidos agrupados"}
            </Text>

            <View style={styles.offerDetailsBox}>
              <View style={styles.offerDetailRow}>
                <Text style={styles.offerDetailLabel}>Zona:</Text>
                <Text style={styles.offerDetailVal}>
                  {activeOffer.orders?.[0]?.zone_name || activeOffer.zone_name || "Zona general"}
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

        {!trip ? (
          <EmptyState
            icon="bicycle-outline"
            title={driverStatus === "disponible" ? "Esperando pedidos listos..." : "Sin viaje activo"}
            description={
              driverStatus === "disponible"
                ? "Estás disponible. En cuanto mostrador prepare pedidos listos en tu zona, recibirás una oferta exclusiva."
                : driverStatus === "pausa"
                ? "Estás en pausa. Cambia tu estado a 'Disponible' para empezar a recibir viajes."
                : "Estás fuera de turno. Activa tu turno para recibir asignaciones automáticas de reparto."
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

            {stops.map((stop) => {
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

      {/* Priority Incoming Offer Modal */}
      <DriverOfferModal
        visible={!!activeOffer}
        offer={activeOffer}
        secondsLeft={offerSecondsLeft}
        loading={respondingOffer}
        onAccept={handleAcceptOffer}
        onReject={handleRejectOffer}
      />

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
  dominantContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4
  },
  dominantCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2
  },
  dominantCardAvailable: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac"
  },
  dominantCardPause: {
    backgroundColor: "#fefce8",
    borderColor: "#fde047"
  },
  dominantCardOffline: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1"
  },
  dominantCardReturning: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd"
  },
  dominantCardAssigned: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74"
  },
  dominantCardInTransit: {
    backgroundColor: "#faf5ff",
    borderColor: "#c084fc"
  },
  dominantTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  dominantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1
  },
  dominantBadgeAvailable: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac"
  },
  dominantBadgePause: {
    backgroundColor: "#fef9c3",
    borderColor: "#fde047"
  },
  dominantBadgeOffline: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1"
  },
  dominantBadgeReturning: {
    backgroundColor: "#dbeafe",
    borderColor: "#bfdbfe"
  },
  dominantBadgeAssigned: {
    backgroundColor: "#ffedd5",
    borderColor: "#fed7aa"
  },
  dominantBadgeInTransit: {
    backgroundColor: "#f3e8ff",
    borderColor: "#e9d5ff"
  },
  dominantBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  dominantSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textDecorationLine: "underline"
  },
  dominantTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginTop: 2
  },
  dominantHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16
  },
  dominantPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 14,
    marginTop: 4
  },
  dominantPrimaryBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  btnStartShift: {
    backgroundColor: "#16a34a"
  },
  btnPause: {
    backgroundColor: "#fef08a",
    borderWidth: 1,
    borderColor: "#facc15"
  },
  btnPauseText: {
    color: "#854d0e",
    fontSize: 13,
    fontWeight: "800"
  },
  btnResume: {
    backgroundColor: "#16a34a"
  },
  btnResumeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  btnReturningAvailable: {
    backgroundColor: "#16a34a"
  },
  btnStartRoute: {
    backgroundColor: colors.primary
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
  }
});
