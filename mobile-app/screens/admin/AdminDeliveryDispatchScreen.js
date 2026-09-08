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
  const { token, tripsUpdateSignal, orderUpdateSignal } = useContext(AppContext);

  const [proposals, setProposals] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("proposals"); // 'proposals' | 'settlements'

  // Assign driver modal
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [assigningTrip, setAssigningTrip] = useState(false);

  // Settlement modal
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [selectedDriverForSettle, setSelectedDriverForSettle] = useState(null);
  const [driverSummary, setDriverSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [settling, setSettling] = useState(false);

  // Admin override modal
  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [propRes, drivRes] = await Promise.all([
        axios.get(`${API_URL}/deliveries/proposals`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/deliveries/drivers`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (Array.isArray(propRes.data)) setProposals(propRes.data);
      if (Array.isArray(drivRes.data)) setDrivers(drivRes.data);
    } catch (err) {
      console.log("Error loading dispatch data:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData, tripsUpdateSignal, orderUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenAssignModal = (proposal) => {
    setSelectedProposal(proposal);
    if (drivers.length > 0) {
      setSelectedDriverId(drivers[0].id);
    }
    setAssignModalVisible(true);
  };

  const handleConfirmAssignTrip = async () => {
    if (!selectedProposal || !selectedDriverId) return;
    try {
      setAssigningTrip(true);
      await axios.post(
        `${API_URL}/deliveries/trips`,
        {
          driver_user_id: selectedDriverId,
          order_ids: selectedProposal.orders.map((o) => o.id)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAssignModalVisible(false);
      setSelectedProposal(null);
      loadData();
      Alert.alert("¡Viaje Asignado!", "El viaje ha sido despachado al repartidor.");
    } catch (err) {
      Alert.alert("Error al Asignar", err?.response?.data?.message || "No se pudo despachar el viaje");
    } finally {
      setAssigningTrip(false);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Despacho & Rutas" showBrandMark={false} />
        <View style={styles.loaderBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Cargando propuestas y repartidores...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Despacho de Reparto"
        subtitle="Agrupación Inteligente & Cortes"
        rightAction={
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={colors.text} />
          </TouchableOpacity>
        }
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "proposals" && styles.tabBtnActive]}
          onPress={() => setActiveTab("proposals")}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "proposals" && styles.tabBtnTextActive
            ]}
          >
            Propuestas de Viaje ({proposals.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "settlements" && styles.tabBtnActive]}
          onPress={() => setActiveTab("settlements")}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "settlements" && styles.tabBtnTextActive
            ]}
          >
            Liquidación de Caja ({drivers.length})
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
        {activeTab === "proposals" ? (
          proposals.length === 0 ? (
            <EmptyState
              icon="bicycle-outline"
              title="No hay pedidos listos para despacho"
              description="Cuando cocina o mostrador marque pedidos a domicilio como 'listos', el motor agrupará hasta 3 pedidos por zona automáticamente."
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

                {/* Orders in this proposal */}
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
                  <Ionicons name="paper-plane" size={16} color="#ffffff" />
                  <Text style={styles.dispatchBtnText}>Asignar Viaje a Repartidor</Text>
                </TouchableOpacity>
              </View>
            ))
          )
        ) : (
          /* Settlements Tab */
          drivers.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No hay repartidores registrados"
              description="Crea usuarios con rol repartidor para administrar sus cortes y turnos."
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
          )
        )}
      </ScrollView>

      {/* Modal: Assign Trip */}
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
                <Text style={styles.modalTitle}>Asignar Viaje</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedProposal?.orders?.length} pedidos en {selectedProposal?.zone_name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAssignModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.pickerLabel}>Selecciona el Repartidor:</Text>
              <ScrollView style={{ maxHeight: 200 }}>
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
                      <Text style={[styles.driverPickerName, isSel && { color: colors.primary, fontWeight: "800" }]}>
                        {drv.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.confirmDispatchBtn, assigningTrip && { opacity: 0.6 }]}
                onPress={handleConfirmAssignTrip}
                disabled={assigningTrip}
                activeOpacity={0.85}
              >
                {assigningTrip ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.confirmDispatchBtnText}>Confirmar y Despachar</Text>
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
              <TouchableOpacity
                onPress={() => setSettleModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingSummary ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.loaderText}>Calculando corte...</Text>
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
                    (Number(driverSummary?.pending_settlement || 0) <= 0 || settling) && {
                      opacity: 0.5
                    }
                  ]}
                  onPress={handleConfirmSettleShift}
                  disabled={Number(driverSummary?.pending_settlement || 0) <= 0 || settling}
                  activeOpacity={0.85}
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
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 8
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  tabBtnTextActive: {
    color: "#ffffff"
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14
  },
  proposalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
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
  proposalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  proposalTitle: {
    fontSize: 16,
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
    borderRadius: 14,
    padding: 10,
    gap: 8
  },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  orderSeq: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  orderSeqText: {
    fontSize: 11,
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
    color: colors.primary
  },
  dispatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 14
  },
  dispatchBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff"
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 12
  },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
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
    color: colors.muted
  },
  settleActionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10
  },
  settleActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(25, 23, 21, 0.65)",
    justifyContent: "flex-end"
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    paddingBottom: 24
  },
  modalHeader: {
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text
  },
  modalSubtitle: {
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
    justifyContent: "center"
  },
  modalBody: {
    padding: 20,
    gap: 14
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted
  },
  driverPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 8
  },
  driverPickerRowSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  driverPickerName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text
  },
  confirmDispatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 16
  },
  confirmDispatchBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  settleSummaryBox: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    gap: 6
  },
  settleLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  settleAmount: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text
  },
  settleDetail: {
    fontSize: 12,
    color: colors.muted
  },
  confirmSettleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.success,
    height: 50,
    borderRadius: 16
  },
  confirmSettleBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  }
});
