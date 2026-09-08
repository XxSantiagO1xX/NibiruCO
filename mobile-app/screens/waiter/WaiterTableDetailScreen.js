import { useState, useEffect, useContext, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
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
import ComboConfigModal from "../../components/ComboConfigModal";

export default function WaiterTableDetailScreen({ route, navigation }) {
  const { tableId, sessionId: initialSessionId, tableName } = route.params || {};
  const { token, tablesUpdateSignal, orderUpdateSignal } = useContext(AppContext);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Add items modal
  const [menuProducts, setMenuProducts] = useState([]);
  const [addItemsModalVisible, setAddItemsModalVisible] = useState(false);
  const [selectedProductForCombo, setSelectedProductForCombo] = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(false);

  // Payment modal
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const loadSession = useCallback(async () => {
    if (!token) return;
    try {
      let targetSessionId = session?.id || initialSessionId;

      // If no session ID passed, fetch table to find active session
      if (!targetSessionId && tableId) {
        const tableRes = await axios.get(`${API_URL}/tables`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const currentTable = tableRes.data.find((t) => t.id === Number(tableId));
        if (currentTable?.session_id) {
          targetSessionId = currentTable.session_id;
        }
      }

      if (targetSessionId) {
        const res = await axios.get(
          `${API_URL}/tables/sessions/${targetSessionId}/check`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSession(res.data);
      }
    } catch (err) {
      console.log("Error loading table session:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [token, tableId, initialSessionId, session?.id]);

  useEffect(() => {
    loadSession();
  }, [loadSession, tablesUpdateSignal, orderUpdateSignal]);

  const loadMenu = async () => {
    try {
      setLoadingMenu(true);
      const res = await axios.get(`${API_URL}/menu/today`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setMenuProducts(res.data);
      }
    } catch (err) {
      console.log("Error loading menu:", err.message);
    } finally {
      setLoadingMenu(false);
    }
  };

  const handleOpenAddItems = () => {
    loadMenu();
    setAddItemsModalVisible(true);
  };

  const handleSelectProduct = (product) => {
    if (product.product_kind === "combo") {
      setSelectedProductForCombo(product);
    } else {
      handleAddDirectProduct(product);
    }
  };

  const handleAddDirectProduct = async (product) => {
    if (!session?.id) return;
    try {
      await axios.post(
        `${API_URL}/orders`,
        {
          table_session_id: session.id,
          service_type: "mesa",
          type: session.table_name || "Mesa",
          items: [{ product_id: product.id, quantity: 1, choices: [] }]
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAddItemsModalVisible(false);
      loadSession();
      Alert.alert("Agregado", `${product.name} agregado a la comanda.`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo agregar el producto");
    }
  };

  const handleConfirmComboChoices = async (product, choices) => {
    if (!session?.id) return;
    try {
      await axios.post(
        `${API_URL}/orders`,
        {
          table_session_id: session.id,
          service_type: "mesa",
          type: session.table_name || "Mesa",
          items: [{ product_id: product.id, quantity: 1, choices }]
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedProductForCombo(null);
      setAddItemsModalVisible(false);
      loadSession();
      Alert.alert("Combo Agregado", `${product.name} agregado a la comanda de la mesa.`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo agregar el combo");
    }
  };

  const handleRequestAccount = async () => {
    if (!session?.id) return;
    try {
      await axios.post(
        `${API_URL}/tables/sessions/${session.id}/request-account`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadSession();
      Alert.alert("Cuenta Solicitada", "La mesa ha pasado a estado de cuenta solicitada.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo solicitar la cuenta");
    }
  };

  const handleReopen = async () => {
    if (!session?.id) return;
    try {
      await axios.post(
        `${API_URL}/tables/sessions/${session.id}/reopen`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadSession();
      Alert.alert("Cuenta Reabierta", "La mesa está abierta nuevamente para agregar consumos.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo reabrir la cuenta");
    }
  };

  const handleOpenPayment = () => {
    const balance = session?.balance || 0;
    setPaymentAmount(balance.toFixed(2));
    setPaymentModalVisible(true);
  };

  const handleConfirmPayment = async () => {
    if (!session?.id) return;
    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) {
      Alert.alert("Monto Inválido", "Ingresa un monto válido para el cobro.");
      return;
    }

    try {
      setSubmittingPayment(true);
      const res = await axios.post(
        `${API_URL}/tables/sessions/${session.id}/payments`,
        {
          amount: amt,
          method: paymentMethod
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPaymentModalVisible(false);
      setSession(res.data);

      if (res.data.status === "closed") {
        Alert.alert(
          "¡Mesa Cobrada y Cerrada!",
          "El saldo ha sido liquidado en su totalidad y la mesa queda libre para los siguientes comensales.",
          [{ text: "Volver a Mesas", onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          "Pago Registrado",
          `Se registró el abono de $${amt.toFixed(2)}. Saldo restante: $${res.data.balance.toFixed(2)}.`
        );
      }
    } catch (err) {
      Alert.alert("Error de Cobro", err?.response?.data?.message || "No se pudo registrar el pago.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title={tableName || "Detalle de Mesa"} showBack={true} onBack={() => navigation.goBack()} />
        <View style={styles.loaderBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Cargando comanda de mesa...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isAccountRequested = session?.status === "account_requested";
  const isClosed = session?.status === "closed";
  const orders = Array.isArray(session?.orders) ? session.orders : [];
  const payments = Array.isArray(session?.payments) ? session.payments : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title={session?.table_name || tableName || "Mesa"}
        subtitle={
          isClosed
            ? "Mesa Cerrada"
            : isAccountRequested
            ? "Cuenta Solicitada"
            : "Comanda Activa"
        }
        showBack={true}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity style={styles.refreshBtn} onPress={loadSession}>
            <Ionicons name="refresh" size={18} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Session Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryTitle}>{session?.table_name || tableName}</Text>
              <Text style={styles.zoneSubtitle}>{session?.zone || "Área principal"}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                isAccountRequested
                  ? styles.badgeWarning
                  : isClosed
                  ? styles.badgeClosed
                  : styles.badgeActive
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isAccountRequested
                    ? styles.textWarning
                    : isClosed
                    ? styles.textClosed
                    : styles.textActive
                ]}
              >
                {isClosed ? "Cerrada" : isAccountRequested ? "Cuenta Pedida" : "Abierta"}
              </Text>
            </View>
          </View>

          <View style={styles.balanceGrid}>
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>Total Consumos</Text>
              <Text style={styles.balanceVal}>${Number(session?.total || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>Abonado</Text>
              <Text style={[styles.balanceVal, { color: colors.success }]}>
                ${Number(session?.paid || 0).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.balanceBox, styles.balanceBoxHighlight]}>
              <Text style={styles.balanceLabel}>Saldo Pendiente</Text>
              <Text style={[styles.balanceVal, { color: colors.primary }]}>
                ${Number(session?.balance || 0).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Operations Action Bar */}
        {!isClosed && (
          <View style={styles.quickActionsBar}>
            <TouchableOpacity
              style={styles.actionAddBtn}
              onPress={handleOpenAddItems}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={18} color="#ffffff" />
              <Text style={styles.actionAddBtnText}>+ Agregar a Comanda</Text>
            </TouchableOpacity>

            {isAccountRequested ? (
              <TouchableOpacity
                style={styles.actionReopenBtn}
                onPress={handleReopen}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-undo" size={16} color={colors.text} />
                <Text style={styles.actionReopenBtnText}>Reabrir</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.actionAccountBtn}
                onPress={handleRequestAccount}
                activeOpacity={0.8}
              >
                <Ionicons name="receipt-outline" size={16} color={colors.warning} />
                <Text style={styles.actionAccountBtnText}>Pedir Cuenta</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Orders Breakdown Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Comandas de la Mesa ({orders.length})</Text>
        </View>

        {orders.length === 0 ? (
          <EmptyState
            icon="fast-food-outline"
            title="Sin consumos registrados"
            description="Toca '+ Agregar a Comanda' para registrar platillos o combos a esta mesa."
          />
        ) : (
          orders.map((ord, oIdx) => (
            <View key={ord.id || oIdx} style={styles.orderBreakdownCard}>
              <View style={styles.orderCardHeader}>
                <View style={styles.orderIdBadge}>
                  <Text style={styles.orderIdText}>Ronda #{oIdx + 1}</Text>
                </View>
                <View style={styles.orderStatusBadge}>
                  <Text style={styles.orderStatusText}>{ord.status}</Text>
                </View>
              </View>

              <View style={styles.orderItemsList}>
                {ord.items?.map((it, iIdx) => (
                  <View key={iIdx} style={styles.orderItemRow}>
                    <View style={styles.orderItemLeft}>
                      <Text style={styles.orderItemQty}>{it.quantity}x</Text>
                      <View>
                        <Text style={styles.orderItemName}>{it.name}</Text>
                        {it.choices?.map((ch, cIdx) => (
                          <Text key={cIdx} style={styles.choiceNote}>
                            • {ch.name} {Number(ch.extra_price) > 0 ? `(+$${ch.extra_price})` : ""}
                          </Text>
                        ))}
                      </View>
                    </View>
                    <Text style={styles.orderItemPrice}>
                      ${(Number(it.price) * Number(it.quantity)).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        {/* Payments History if any */}
        {payments.length > 0 && (
          <View style={styles.paymentsCard}>
            <Text style={styles.sectionTitle}>Pagos Recibidos</Text>
            {payments.map((p) => (
              <View key={p.id} style={styles.paymentRow}>
                <View style={styles.paymentInfo}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.paymentMethod}>{p.method?.toUpperCase()}</Text>
                </View>
                <Text style={styles.paymentAmount}>+${p.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer: Cobro Button */}
      {!isClosed && session?.balance > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.payBtn}
            onPress={handleOpenPayment}
            activeOpacity={0.85}
          >
            <Ionicons name="cash" size={20} color="#ffffff" />
            <Text style={styles.payBtnText}>
              Cobrar Cuenta · Saldo ${Number(session?.balance || 0).toFixed(2)}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal: Add Menu Items */}
      <Modal
        visible={addItemsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddItemsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Menú del Día</Text>
                <Text style={styles.modalSubtitle}>Agregar a {session?.table_name}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setAddItemsModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingMenu ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.loaderText}>Cargando platillos disponibles...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.menuListContent}>
                {menuProducts.map((prod) => (
                  <TouchableOpacity
                    key={prod.id}
                    style={styles.menuProdCard}
                    onPress={() => handleSelectProduct(prod)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuProdName}>{prod.name}</Text>
                      {prod.product_kind === "combo" ? (
                        <Text style={styles.comboBadgeText}>Combo con selección</Text>
                      ) : null}
                    </View>
                    <Text style={styles.menuProdPrice}>${Number(prod.price).toFixed(2)}</Text>
                    <View style={styles.menuAddIcon}>
                      <Ionicons name="add" size={18} color="#ffffff" />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Combo Configuration Modal */}
      <ComboConfigModal
        visible={Boolean(selectedProductForCombo)}
        product={selectedProductForCombo}
        token={token}
        onClose={() => setSelectedProductForCombo(null)}
        onConfirm={handleConfirmComboChoices}
      />

      {/* Modal: Register Payment */}
      <Modal
        visible={paymentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Cobro de Mesa</Text>
                <Text style={styles.modalSubtitle}>
                  Saldo pendiente: ${Number(session?.balance || 0).toFixed(2)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPaymentModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.paymentModalBody}>
              <Text style={styles.inputLabel}>Monto a Cobrar ($)</Text>
              <TextInput
                style={styles.paymentInput}
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
              />

              <Text style={styles.inputLabel}>Método de Pago</Text>
              <View style={styles.methodsRow}>
                {[
                  { id: "efectivo", label: "Efectivo", icon: "cash-outline" },
                  { id: "tarjeta", label: "Tarjeta", icon: "card-outline" },
                  { id: "transferencia", label: "Transferencia", icon: "swap-horizontal-outline" }
                ].map((m) => {
                  const isSel = paymentMethod === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.methodCard, isSel && styles.methodCardSelected]}
                      onPress={() => setPaymentMethod(m.id)}
                    >
                      <Ionicons
                        name={m.icon}
                        size={20}
                        color={isSel ? colors.primary : colors.muted}
                      />
                      <Text style={[styles.methodLabel, isSel && styles.methodLabelSelected]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.confirmPayBtn, submittingPayment && { opacity: 0.6 }]}
                onPress={handleConfirmPayment}
                disabled={submittingPayment}
                activeOpacity={0.85}
              >
                {submittingPayment ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#ffffff" />
                    <Text style={styles.confirmPayBtnText}>Registrar Cobro</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.4
  },
  zoneSubtitle: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1
  },
  badgeActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  badgeWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder
  },
  badgeClosed: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800"
  },
  textActive: { color: colors.primary },
  textWarning: { color: colors.warning },
  textClosed: { color: colors.muted },
  balanceGrid: {
    flexDirection: "row",
    gap: 8
  },
  balanceBox: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 10,
    alignItems: "center"
  },
  balanceBoxHighlight: {
    backgroundColor: colors.primarySoft
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 4
  },
  balanceVal: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text
  },
  quickActionsBar: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 14
  },
  actionAddBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 14
  },
  actionAddBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  actionAccountBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.warningSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    paddingVertical: 12
  },
  actionAccountBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.warning
  },
  actionReopenBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12
  },
  actionReopenBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  orderBreakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  orderIdBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  orderIdText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.primarySoft
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase"
  },
  orderItemsList: {
    marginTop: 8,
    gap: 6
  },
  orderItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  orderItemLeft: {
    flexDirection: "row",
    gap: 8,
    flex: 1
  },
  orderItemQty: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  choiceNote: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 1
  },
  orderItemPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text
  },
  paymentsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8
  },
  paymentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  paymentMethod: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text
  },
  paymentAmount: {
    fontSize: 13,
    fontWeight: "900",
    color: colors.success
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.success,
    height: 52,
    borderRadius: 16,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  payBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff"
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
    paddingBottom: 20
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
  menuListContent: {
    padding: 16,
    gap: 10
  },
  menuProdCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 10
  },
  menuProdName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  comboBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 2
  },
  menuProdPrice: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.primary
  },
  menuAddIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  paymentModalBody: {
    padding: 20,
    gap: 12
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  paymentInput: {
    backgroundColor: colors.surface,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: "900",
    color: colors.text
  },
  methodsRow: {
    flexDirection: "row",
    gap: 8
  },
  methodCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  methodCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  methodLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted
  },
  methodLabelSelected: {
    color: colors.primary,
    fontWeight: "800"
  },
  confirmPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 10,
    gap: 6
  },
  confirmPayBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff"
  }
});
