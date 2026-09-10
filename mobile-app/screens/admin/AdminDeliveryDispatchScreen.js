import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../../context/AppContext";
import { API_URL } from "../../config/api";
import colors from "../../theme/colors";
import Header from "../../components/Header";
import EmptyState from "../../components/EmptyState";

export default function AdminDeliveryDispatchScreen({ navigation }) {
  const { token, tripsUpdateSignal, orderUpdateSignal, offerUpdateSignal } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState("dispatch"); // 'dispatch' | 'drivers' | 'settlements'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Core Data
  const [config, setConfig] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [readyOrders, setReadyOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [activeOffers, setActiveOffers] = useState([]);

  // Config Modal
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [configDispatchMode, setConfigDispatchMode] = useState("automatic");
  const [configTimeout, setConfigTimeout] = useState("20");
  const [configWindow, setConfigWindow] = useState("120");
  const [configMaxOrders, setConfigMaxOrders] = useState("3");
  const [savingConfig, setSavingConfig] = useState(false);

  // Manual Override / Assign modal
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [assigningTrip, setAssigningTrip] = useState(false);

  // Settlement modal
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [selectedDriverForSettle, setSelectedDriverForSettle] = useState(null);
  const [driverSummary, setDriverSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [settling, setSettling] = useState(false);

  // Change Driver Status Modal
  const [driverStatusModalVisible, setDriverStatusModalVisible] = useState(false);
  const [selectedDriverForStatus, setSelectedDriverForStatus] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [cfgRes, propRes, ordersRes, drivRes, offersRes] = await Promise.all([
        axios.get(`${API_URL}/deliveries/config`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: null })),
        axios.get(`${API_URL}/deliveries/proposals`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/deliveries/ready-orders`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/deliveries/drivers`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/deliveries/offers/active`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);

      if (cfgRes?.data) {
        setConfig(cfgRes.data);
        setConfigDispatchMode(cfgRes.data.dispatch_mode || "automatic");
        setConfigTimeout(String(cfgRes.data.offer_timeout_seconds || 20));
        setConfigWindow(String(cfgRes.data.grouping_window_seconds || 120));
        setConfigMaxOrders(String(cfgRes.data.max_orders_per_trip || 3));
      }
      if (Array.isArray(propRes.data)) setProposals(propRes.data);
      if (Array.isArray(ordersRes.data)) setReadyOrders(ordersRes.data);
      if (Array.isArray(drivRes.data)) setDrivers(drivRes.data);
      if (Array.isArray(offersRes.data)) setActiveOffers(offersRes.data);
    } catch (err) {
      console.log("Error loading dispatch data:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData, tripsUpdateSignal, orderUpdateSignal, offerUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggleDispatchMode = async () => {
    const nextMode = configDispatchMode === "automatic" ? "manual" : "automatic";
    try {
      const res = await axios.patch(
        `${API_URL}/deliveries/config`,
        { dispatch_mode: nextMode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setConfig(res.data);
      setConfigDispatchMode(res.data.dispatch_mode);
      loadData();
      Alert.alert(
        "Modo de Despacho Actualizado",
        nextMode === "automatic"
          ? "Modo Automático activado: el sistema emitirá ofertas exclusivas con scoring."
          : "Modo Manual activado: Admin despachará los viajes manualmente."
      );
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo cambiar el modo de despacho");
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSavingConfig(true);
      const res = await axios.patch(
        `${API_URL}/deliveries/config`,
        {
          dispatch_mode: configDispatchMode,
          offer_timeout_seconds: Number(configTimeout) || 20,
          grouping_window_seconds: Number(configWindow) || 120,
          max_orders_per_trip: Number(configMaxOrders) || 3
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setConfig(res.data);
      setConfigModalVisible(false);
      loadData();
      Alert.alert("Configuración Guardada", "Los parámetros del motor de despacho fueron actualizados.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo guardar la configuración");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCancelOffer = async (offerId) => {
    try {
      await axios.post(
        `${API_URL}/deliveries/offers/${offerId}/cancel`,
        { reason: "cancelada_por_admin" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadData();
      Alert.alert("Oferta Cancelada", "La oferta fue cancelada y los pedidos volvieron a la cola.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo cancelar la oferta");
    }
  };

  const handleOpenAssignModal = (proposal) => {
    setSelectedProposal(proposal);
    setSelectedOrderIds(proposal.orders.map((o) => o.id));
    if (drivers.length > 0) {
      setSelectedDriverId(drivers[0].id);
    }
    setAssignModalVisible(true);
  };

  const handleConfirmAssignTrip = async () => {
    if (!selectedOrderIds.length || !selectedDriverId) return;
    try {
      setAssigningTrip(true);
      await axios.post(
        `${API_URL}/deliveries/trips/override`,
        {
          driver_user_id: selectedDriverId,
          order_ids: selectedOrderIds
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAssignModalVisible(false);
      setSelectedOrderIds([]);
      loadData();
      Alert.alert("¡Viaje Despachado!", "El viaje ha sido asignado al repartidor mediante override de Admin.");
    } catch (err) {
      Alert.alert("Error al Asignar", err?.response?.data?.message || "No se pudo despachar el viaje");
    } finally {
      setAssigningTrip(false);
    }
  };

  const handleOpenDriverStatusModal = (driver) => {
    setSelectedDriverForStatus(driver);
    setDriverStatusModalVisible(true);
  };

  const handleChangeDriverStatus = async (newStatus) => {
    if (!selectedDriverForStatus) return;
    try {
      setChangingStatus(true);
      await axios.patch(
        `${API_URL}/deliveries/drivers/${selectedDriverForStatus.id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDriverStatusModalVisible(false);
      setSelectedDriverForStatus(null);
      loadData();
      Alert.alert("Estado Actualizado", `El repartidor ahora está ${newStatus}.`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo cambiar el estado del repartidor");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleOpenSettlement = async (driver) => {
    setSelectedDriverForSettle(driver);
    setSettleModalVisible(true);
    setLoadingSummary(true);
    try {
      const res = await axios.get(`${API_URL}/deliveries/shift-summary`, {
        params: { driver_user_id: driver.id },
        headers: { Authorization: `Bearer ${token}` }
      });
      setDriverSummary(res.data);
    } catch (err) {
      console.log("Error loading driver shift summary:", err.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleConfirmSettleShift = async () => {
    if (!selectedDriverForSettle) return;
    try {
      setSettling(true);
      const res = await axios.post(
        `${API_URL}/deliveries/settle-shift`,
        { driver_user_id: selectedDriverForSettle.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSettleModalVisible(false);
      setSelectedDriverForSettle(null);
      loadData();
      Alert.alert(
        "¡Corte Liquidado!",
        `Se liquidó exitosamente $${Number(res.data.settled_amount || 0).toFixed(2)} de ${res.data.orders_settled} pedidos.`
      );
    } catch (err) {
      Alert.alert("Error de Liquidación", err?.response?.data?.message || "No se pudo liquidar");
    } finally {
      setSettling(false);
    }
  };

  const renderDriverStatusBadge = (status) => {
    switch (status) {
      case "disponible":
        return <View style={[styles.statusBadge, { backgroundColor: "#dcfce7" }]}><Text style={[styles.statusBadgeText, { color: "#16a34a" }]}>🟢 Disponible</Text></View>;
      case "oferta_pendiente":
        return <View style={[styles.statusBadge, { backgroundColor: "#fef3c7" }]}><Text style={[styles.statusBadgeText, { color: "#b45309" }]}>⚡ Oferta Pendiente</Text></View>;
      case "esperando_recogida":
        return <View style={[styles.statusBadge, { backgroundColor: "#e0e7ff" }]}><Text style={[styles.statusBadgeText, { color: "#4338ca" }]}>📦 Esperando Recogida</Text></View>;
      case "en_ruta":
        return <View style={[styles.statusBadge, { backgroundColor: "#f3e8ff" }]}><Text style={[styles.statusBadgeText, { color: "#7e22ce" }]}>🚚 En Ruta</Text></View>;
      case "regresando":
        return <View style={[styles.statusBadge, { backgroundColor: "#e0f2fe" }]}><Text style={[styles.statusBadgeText, { color: "#0369a1" }]}>🛵 Regresando</Text></View>;
      case "pausa":
        return <View style={[styles.statusBadge, { backgroundColor: "#fef9c3" }]}><Text style={[styles.statusBadgeText, { color: "#a16207" }]}>🟡 Pausa</Text></View>;
      default:
        return <View style={[styles.statusBadge, { backgroundColor: "#f1f5f9" }]}><Text style={[styles.statusBadgeText, { color: "#64748b" }]}>⚪ Offline</Text></View>;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Centro de Supervisión Reparto" showBrandMark={false} />
        <View style={styles.loaderBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Cargando flota y cola de despacho...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isAutomatic = config?.dispatch_mode === "automatic";

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Centro de Despacho"
        subtitle="Supervisión & Automatización"
        rightAction={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity style={styles.iconActionBtn} onPress={() => setConfigModalVisible(true)}>
              <Ionicons name="settings-outline" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconActionBtn} onPress={onRefresh}>
              <Ionicons name="refresh" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Mode Status Banner */}
      <View style={[styles.modeBanner, isAutomatic ? styles.modeBannerAuto : styles.modeBannerManual]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Ionicons
            name={isAutomatic ? "hardware-chip" : "hand-right"}
            size={20}
            color={isAutomatic ? "#15803d" : "#c2410c"}
          />
          <View>
            <Text style={[styles.modeTitle, { color: isAutomatic ? "#15803d" : "#c2410c" }]}>
              Modo {isAutomatic ? "Automático (Scoring Activo)" : "Manual (Override Requerido)"}
            </Text>
            <Text style={styles.modeSubtitle}>
              {isAutomatic
                ? `Ofertas de ${config?.offer_timeout_seconds || 20}s · Agrupación máx ${config?.max_orders_per_trip || 3} pedidos`
                : "Admin asigna cada viaje manualmente a los repartidores"}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.switchModeBtn} onPress={handleToggleDispatchMode}>
          <Text style={styles.switchModeText}>{isAutomatic ? "Pasar a Manual" : "Activar Auto"}</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "dispatch" && styles.tabBtnActive]}
          onPress={() => setActiveTab("dispatch")}
        >
          <Text style={[styles.tabBtnText, activeTab === "dispatch" && styles.tabBtnTextActive]}>
            Despacho ({readyOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "drivers" && styles.tabBtnActive]}
          onPress={() => setActiveTab("drivers")}
        >
          <Text style={[styles.tabBtnText, activeTab === "drivers" && styles.tabBtnTextActive]}>
            Repartidores ({drivers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "settlements" && styles.tabBtnActive]}
          onPress={() => setActiveTab("settlements")}
        >
          <Text style={[styles.tabBtnText, activeTab === "settlements" && styles.tabBtnTextActive]}>
            Liquidación Caja
          </Text>
        </TouchableOpacity>
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
        {/* TAB 1: DESPACHO & OFERTAS ACTIVAS */}
        {activeTab === "dispatch" && (
          <View style={{ gap: 14 }}>
            {/* Active Offers Monitor */}
            {activeOffers.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>⚡ Ofertas Exclusivas en Curso ({activeOffers.length})</Text>
                </View>

                {activeOffers.map((off) => (
                  <View key={off.id} style={styles.activeOfferCard}>
                    <View style={styles.activeOfferHeader}>
                      <View>
                        <Text style={styles.activeOfferDriver}>{off.driver_name || "Repartidor"}</Text>
                        <Text style={styles.activeOfferMeta}>
                          {off.orders?.length || 1} pedidos · Scoring: {Number(off.score || 0).toFixed(1)} pts
                        </Text>
                      </View>
                      <View style={styles.timerPill}>
                        <Ionicons name="time-outline" size={14} color="#b45309" />
                        <Text style={styles.timerPillText}>{Math.max(0, off.seconds_left || 0)}s</Text>
                      </View>
                    </View>

                    {off.recommendation_reason ? (
                      <Text style={styles.offerReasonText}>💡 Motivo: {off.recommendation_reason}</Text>
                    ) : null}

                    <View style={styles.offerOrdersRow}>
                      {off.orders?.map((o) => (
                        <Text key={o.id} style={styles.miniFolioBadge}>
                          F{String(o.folio || o.id).padStart(3, "0")} ({o.zone_name || "Zona"})
                        </Text>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={styles.cancelOfferBtn}
                      onPress={() => handleCancelOffer(off.id)}
                    >
                      <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                      <Text style={styles.cancelOfferBtnText}>Cancelar Oferta (Volver a Cola)</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Ready Orders in Queue */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>📦 Pedidos Listos para Despacho ({readyOrders.length})</Text>
              </View>

              {readyOrders.length === 0 ? (
                <EmptyState
                  icon="bicycle-outline"
                  title="Cola de despacho vacía"
                  description="No hay pedidos a domicilio pendientes de asignar."
                />
              ) : (
                proposals.map((prop, idx) => (
                  <View key={idx} style={styles.proposalCard}>
                    <View style={styles.proposalHeader}>
                      <View>
                        <Text style={styles.proposalTitle}>{prop.zone_name}</Text>
                        <Text style={styles.proposalSubtitle}>
                          {prop.orders.length} pedidos agrupados · Total: ${Number(prop.total_amount).toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.propBadge}>
                        <Text style={styles.propBadgeText}>{prop.orders.length} Paradas</Text>
                      </View>
                    </View>

                    <View style={styles.ordersList}>
                      {prop.orders.map((ord, oIdx) => (
                        <View key={ord.id} style={styles.orderItemRow}>
                          <View style={styles.orderSeq}>
                            <Text style={styles.orderSeqText}>{oIdx + 1}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.orderFolio}>
                              Folio F{String(ord.folio || ord.id).padStart(3, "0")} · {ord.customer_name || "Cliente"}
                            </Text>
                            <Text style={styles.orderAddr} numberOfLines={1}>
                              {ord.address}
                            </Text>
                          </View>
                          <Text style={styles.orderAmt}>${Number(ord.total).toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={styles.dispatchBtn}
                      onPress={() => handleOpenAssignModal(prop)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="flash" size={16} color="#ffffff" />
                      <Text style={styles.dispatchBtnText}>Asignar Manualmente (Override)</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* TAB 2: FLOTA DE REPARTIDORES EN VIVO */}
        {activeTab === "drivers" && (
          <View style={{ gap: 12 }}>
            {drivers.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No hay repartidores registrados"
                description="Crea usuarios con rol repartidor para supervisar la flota."
              />
            ) : (
              drivers.map((drv) => (
                <View key={drv.id} style={styles.driverLiveCard}>
                  <View style={styles.driverLiveTop}>
                    <View style={styles.driverAvatar}>
                      <Ionicons name="bicycle" size={20} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName}>{drv.name}</Text>
                      <Text style={styles.driverPhone}>{drv.phone || "Sin teléfono"}</Text>
                    </View>
                    {renderDriverStatusBadge(drv.driver_status)}
                  </View>

                  <View style={styles.driverLiveMetaRow}>
                    <Text style={styles.driverMetaItem}>
                      Viajes hoy: <Text style={{ fontWeight: "800", color: colors.text }}>{drv.trips_count_today || 0}</Text>
                    </Text>
                    <Text style={styles.driverMetaItem}>
                      Entregas: <Text style={{ fontWeight: "800", color: colors.text }}>{drv.completed_stops_count || 0}</Text>
                    </Text>
                    {drv.active_trip_id ? (
                      <Text style={[styles.driverMetaItem, { color: colors.primary, fontWeight: "800" }]}>
                        Viaje #{drv.active_trip_id} activo
                      </Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={styles.changeStatusBtn}
                    onPress={() => handleOpenDriverStatusModal(drv)}
                  >
                    <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
                    <Text style={styles.changeStatusBtnText}>Cambiar Estado Operativo</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: LIQUIDACIONES DE CORTE */}
        {activeTab === "settlements" && (
          <View style={{ gap: 12 }}>
            {drivers.length === 0 ? (
              <EmptyState
                icon="cash-outline"
                title="Sin repartidores para liquidar"
                description="No hay repartidores registrados en el sistema."
              />
            ) : (
              drivers.map((drv) => (
                <TouchableOpacity
                  key={drv.id}
                  style={styles.driverCard}
                  onPress={() => handleOpenSettlement(drv)}
                  activeOpacity={0.8}
                >
                  <View style={styles.driverAvatar}>
                    <Ionicons name="person" size={20} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverName}>{drv.name}</Text>
                    <Text style={styles.driverPhone}>{drv.phone || "Sin teléfono"}</Text>
                  </View>
                  <View style={styles.settleActionBadge}>
                    <Text style={styles.settleActionText}>Ver Corte</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal: Configuración de Despacho */}
      <Modal
        visible={configModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setConfigModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Configuración de Despacho</Text>
                <Text style={styles.modalSubtitle}>Ajustes del motor automático y scoring</Text>
              </View>
              <TouchableOpacity onPress={() => setConfigModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Modo de Asignación:</Text>
              <View style={styles.modePickerRow}>
                <TouchableOpacity
                  style={[styles.modePickerBtn, configDispatchMode === "automatic" && styles.modePickerBtnActive]}
                  onPress={() => setConfigDispatchMode("automatic")}
                >
                  <Text style={[styles.modePickerBtnText, configDispatchMode === "automatic" && styles.modePickerBtnTextActive]}>
                    🤖 Automático
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modePickerBtn, configDispatchMode === "manual" && styles.modePickerBtnActive]}
                  onPress={() => setConfigDispatchMode("manual")}
                >
                  <Text style={[styles.modePickerBtnText, configDispatchMode === "manual" && styles.modePickerBtnTextActive]}>
                    🖐️ Manual (Admin)
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Tiempo de oferta por repartidor (segundos):</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={configTimeout}
                onChangeText={setConfigTimeout}
                placeholder="20"
              />

              <Text style={styles.inputLabel}>Ventana de agrupación inteligente (segundos):</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={configWindow}
                onChangeText={setConfigWindow}
                placeholder="120"
              />

              <Text style={styles.inputLabel}>Máximo de pedidos por viaje:</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={configMaxOrders}
                onChangeText={setConfigMaxOrders}
                placeholder="3"
              />

              <TouchableOpacity
                style={[styles.confirmDispatchBtn, savingConfig && { opacity: 0.6 }]}
                onPress={handleSaveConfig}
                disabled={savingConfig}
              >
                {savingConfig ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="save" size={18} color="#ffffff" />
                    <Text style={styles.confirmDispatchBtnText}>Guardar Parámetros</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Modal: Cambiar Estado de Repartidor */}
      <Modal
        visible={driverStatusModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDriverStatusModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Cambiar Estado</Text>
                <Text style={styles.modalSubtitle}>{selectedDriverForStatus?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setDriverStatusModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {["disponible", "pausa", "offline", "regresando"].map((st) => (
                <TouchableOpacity
                  key={st}
                  style={styles.statusOptionBtn}
                  onPress={() => handleChangeDriverStatus(st)}
                  disabled={changingStatus}
                >
                  <Text style={styles.statusOptionText}>{st.toUpperCase()}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Modal: Assign Trip (Manual Override) */}
      <Modal
        visible={assignModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Asignación Manual (Override)</Text>
                <Text style={styles.modalSubtitle}>{selectedOrderIds.length} pedidos seleccionados</Text>
              </View>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.pickerLabel}>Selecciona el Repartidor:</Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {drivers.map((drv) => {
                  const isSel = selectedDriverId === drv.id;
                  return (
                    <TouchableOpacity
                      key={drv.id}
                      style={[styles.driverPickerRow, isSel && styles.driverPickerRowSelected]}
                      onPress={() => setSelectedDriverId(drv.id)}
                    >
                      <Ionicons
                        name={isSel ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={isSel ? colors.primary : colors.muted}
                      />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={[styles.driverPickerName, isSel && { color: colors.primary, fontWeight: "800" }]}>
                          {drv.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          Estado: {drv.driver_status || "offline"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.confirmDispatchBtn, assigningTrip && { opacity: 0.6 }]}
                onPress={handleConfirmAssignTrip}
                disabled={assigningTrip}
              >
                {assigningTrip ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.confirmDispatchBtnText}>Confirmar Despacho Forzado</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Modal: Settle Shift */}
      <Modal
        visible={settleModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSettleModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Corte de Turno</Text>
                <Text style={styles.modalSubtitle}>{selectedDriverForSettle?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setSettleModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingSummary ? (
              <View style={styles.modalBody}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : (
              <View style={styles.modalBody}>
                <View style={styles.settleSummaryBox}>
                  <Text style={styles.settleLabel}>Efectivo Pendiente por Liquidar:</Text>
                  <Text style={styles.settleAmount}>
                    ${Number(driverSummary?.pending_settlement || 0).toFixed(2)}
                  </Text>
                  <Text style={styles.settleDetail}>
                    Entregas completadas hoy: {driverSummary?.delivered_count || 0}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.confirmSettleBtn,
                    (Number(driverSummary?.pending_settlement || 0) <= 0 || settling) && { opacity: 0.5 }
                  ]}
                  onPress={handleConfirmSettleShift}
                  disabled={Number(driverSummary?.pending_settlement || 0) <= 0 || settling}
                >
                  {settling ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="cash" size={20} color="#ffffff" />
                      <Text style={styles.confirmSettleBtnText}>Recibir Efectivo y Liquidar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
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
    gap: 12
  },
  loaderText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "600"
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center"
  },
  modeBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  modeBannerAuto: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac"
  },
  modeBannerManual: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa"
  },
  modeTitle: {
    fontSize: 13,
    fontWeight: "900"
  },
  modeSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1
  },
  switchModeBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  switchModeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 4
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  tabBtnTextActive: {
    color: colors.primary,
    fontWeight: "900"
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100
  },
  sectionContainer: {
    gap: 10
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text
  },
  activeOfferCard: {
    backgroundColor: "#fffbeb",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#fde68a",
    padding: 14,
    gap: 8
  },
  activeOfferHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  activeOfferDriver: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text
  },
  activeOfferMeta: {
    fontSize: 12,
    color: colors.muted
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fde68a"
  },
  timerPillText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#b45309"
  },
  offerReasonText: {
    fontSize: 11,
    color: "#92400e",
    fontWeight: "600"
  },
  offerOrdersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2
  },
  miniFolioBadge: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
    fontSize: 11,
    fontWeight: "700",
    color: colors.text
  },
  cancelOfferBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 4
  },
  cancelOfferBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#dc2626"
  },
  proposalCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    gap: 12
  },
  proposalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  proposalTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text
  },
  proposalSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2
  },
  propBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  propBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary
  },
  ordersList: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 10,
    gap: 8
  },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  orderSeq: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  orderSeqText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ffffff"
  },
  orderFolio: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text
  },
  orderAddr: {
    fontSize: 11,
    color: colors.muted
  },
  orderAmt: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text
  },
  dispatchBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  dispatchBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  driverLiveCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    gap: 10
  },
  driverLiveTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  driverLiveMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceMuted,
    padding: 8,
    borderRadius: 10
  },
  driverMetaItem: {
    fontSize: 11,
    color: colors.muted
  },
  changeStatusBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary
  },
  changeStatusBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary
  },
  driverCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  driverName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  driverPhone: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2
  },
  settleActionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  settleActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  modalBody: {
    padding: 20
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
    marginTop: 10
  },
  modePickerRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10
  },
  modePickerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted
  },
  modePickerBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  modePickerBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted
  },
  modePickerBtnTextActive: {
    color: colors.primary,
    fontWeight: "900"
  },
  textInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 10
  },
  driverPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 8,
    backgroundColor: colors.surfaceMuted
  },
  driverPickerRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  driverPickerName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  confirmDispatchBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16
  },
  confirmDispatchBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff"
  },
  statusOptionBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 10,
    backgroundColor: colors.surfaceMuted
  },
  statusOptionText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  settleSummaryBox: {
    backgroundColor: colors.surfaceMuted,
    padding: 16,
    borderRadius: 16,
    gap: 6,
    alignItems: "center"
  },
  settleLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  settleAmount: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.primary
  },
  settleDetail: {
    fontSize: 12,
    color: colors.muted
  },
  confirmSettleBtn: {
    backgroundColor: colors.success,
    borderRadius: 14,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16
  },
  confirmSettleBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff"
  }
});
