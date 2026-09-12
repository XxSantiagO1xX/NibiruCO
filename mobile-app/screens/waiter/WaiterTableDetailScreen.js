import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  useWindowDimensions
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
  const { width } = useWindowDimensions();
  const isTablet = width > 768;

  const { tableId, sessionId: initialSessionId, tableName } = route.params || {};
  const { token, tablesUpdateSignal, orderUpdateSignal } = useContext(AppContext);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // In-app non-blocking toast feedback
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 2500);
  };

  // Add items modal
  const [menuProducts, setMenuProducts] = useState([]);
  const [addItemsModalVisible, setAddItemsModalVisible] = useState(false);
  const [selectedProductForCombo, setSelectedProductForCombo] = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [quantities, setQuantities] = useState({});

  // Payment modal
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const updateQuantity = (productId, delta) => {
    setQuantities((prev) => {
      const curr = prev[productId] || 1;
      const next = Math.max(1, curr + delta);
      return { ...prev, [productId]: next };
    });
  };

  const getQuantity = (productId) => quantities[productId] || 1;

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
      const res = await axios.get(`${API_URL}/products`, {
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

  const handleSelectProduct = (product, qty = 1) => {
    if (product.product_kind === "combo") {
      setSelectedProductForCombo(product);
    } else {
      handleAddDirectProduct(product, qty);
    }
  };

  const handleAddDirectProduct = async (product, qty = 1) => {
    if (!session?.id) return;
    try {
      await axios.post(
        `${API_URL}/orders`,
        {
          table_session_id: session.id,
          service_type: "mesa",
          type: session.table_name || "Mesa",
          items: [{ product_id: product.id, quantity: qty, choices: [] }]
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAddItemsModalVisible(false);
      loadSession();
      showToast(`Agregado: ${qty}x ${product.name}`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo agregar el producto");
    }
  };

  const handleConfirmComboChoices = async ({ combo, choices, quantity }) => {
    if (!session?.id) return;
    const qty = quantity || 1;
    try {
      await axios.post(
        `${API_URL}/orders`,
        {
          table_session_id: session.id,
          service_type: "mesa",
          type: session.table_name || "Mesa",
          items: [{ product_id: combo.id, quantity: qty, choices }]
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedProductForCombo(null);
      setAddItemsModalVisible(false);
      loadSession();
      showToast(`Agregado: Combo ${combo.name} (x${qty})`);
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
      // Non-blocking visual confirmation via toast
      showToast("Cuenta solicitada para la mesa");
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
      showToast("Mesa reabierta para consumos");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo reabrir la cuenta");
    }
  };

  const handleDeliverOrder = async (orderId) => {
    try {
      await axios.patch(
        `${API_URL}/counter/orders/${orderId}/deliver-table`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadSession();
      showToast("Comanda marcada como servida en mesa");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo marcar como entregado");
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
          "El saldo ha sido liquidado en su totalidad y la mesa queda libre.",
          [{ text: "Volver a Mesas", onPress: () => navigation.goBack() }]
        );
      } else {
        showToast(`Abono registrado: $${amt.toFixed(2)}. Saldo: $${res.data.balance.toFixed(2)}`);
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

      {/* Floating In-App Toast */}
      {toastMessage ? (
        <View style={styles.toastContainer}>
          <View style={styles.toastPill}>
            <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}

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

        {/* Orders Breakdown Section (Ticket Style) */}
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
              {/* Card / Ronda Header */}
              <View style={styles.orderCardHeader}>
                <View style={styles.orderIdBadge}>
                  <Text style={styles.orderIdText}>Ronda #{oIdx + 1}</Text>
                </View>
                <View
                  style={[
                    styles.orderStatusBadge,
                    ord.status === "listo" && styles.statusBadgeReady,
                    ord.status === "entregado" && styles.statusBadgeDelivered
                  ]}
                >
                  <Text
                    style={[
                      styles.orderStatusText,
                      ord.status === "listo" && styles.statusTextReady,
                      ord.status === "entregado" && styles.statusTextDelivered
                    ]}
                  >
                    {ord.status === "listo" ? "Listo para servir" : ord.status}
                  </Text>
                </View>
              </View>

              {/* Items Breakdown with Authentic Ticket Styling */}
              <View style={styles.orderItemsList}>
                {ord.items?.map((it, iIdx) => (
                  <View key={iIdx} style={styles.ticketRow}>
                    <View style={styles.ticketLeft}>
                      <Text style={styles.ticketQty}>{it.quantity}x</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ticketItemName}>{it.name}</Text>
                        {it.choices?.map((ch, cIdx) => (
                          <Text key={cIdx} style={styles.choiceNote}>
                            • {ch.name} {Number(ch.extra_price) > 0 ? `(+$${ch.extra_price})` : ""}
                          </Text>
                        ))}
                      </View>
                    </View>
                    <Text style={styles.ticketPrice}>
                      ${(Number(it.price) * Number(it.quantity)).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>

              {ord.status === "listo" && (
                <TouchableOpacity
                  style={styles.deliverOrderBtn}
                  onPress={() => handleDeliverOrder(ord.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-done-circle" size={16} color="#ffffff" />
                  <Text style={styles.deliverOrderBtnText}>Servido en Mesa</Text>
                </TouchableOpacity>
              )}
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

      {/* Footer: Cobrar Cuenta (Constrained width on Tablets) */}
      {!isClosed && session?.balance > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.payBtn, isTablet && styles.payBtnTablet]}
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

      {/* Modal: Add Menu Items (Responsive modal with Stepper) */}
      <Modal
        visible={addItemsModalVisible}
        animationType={isTablet ? "fade" : "slide"}
        transparent={true}
        onRequestClose={() => setAddItemsModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, isTablet && styles.modalBackdropTablet]}>
          <SafeAreaView style={[styles.modalSheet, isTablet && styles.modalSheetTablet]}>
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
            ) : menuProducts.length === 0 ? (
              <View style={{ padding: 24 }}>
                <EmptyState
                  icon="restaurant-outline"
                  title="No hay menú configurado para hoy"
                  description="Configura los productos del día en el panel de administración."
                />
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.menuListContent}>
                {menuProducts.map((prod) => {
                  const qty = getQuantity(prod.id);
                  const isCombo = prod.product_kind === "combo";

                  return (
                    <View key={prod.id} style={styles.menuProdCard}>
                      <View style={styles.menuProdInfo}>
                        <Text style={styles.menuProdName} numberOfLines={2}>{prod.name}</Text>
                        {isCombo ? (
                          <View style={styles.comboTagBadge}>
                            <Ionicons name="layers" size={11} color={colors.primary} />
                            <Text style={styles.comboBadgeText}>Combo personalizable</Text>
                          </View>
                        ) : null}
                        <Text style={styles.menuProdPrice}>${Number(prod.price).toFixed(2)}</Text>
                      </View>

                      {/* Stepper (- qty +) + Add Button */}
                      <View style={styles.stepperWrapper}>
                        <View style={styles.stepperBox}>
                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => updateQuantity(prod.id, -1)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="remove" size={14} color={colors.text} />
                          </TouchableOpacity>
                          <Text style={styles.stepperQtyText}>{qty}</Text>
                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => updateQuantity(prod.id, 1)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add" size={14} color={colors.text} />
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          style={styles.addItemBtn}
                          onPress={() => handleSelectProduct(prod, qty)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={isCombo ? "options-outline" : "checkmark"} size={14} color="#ffffff" />
                          <Text style={styles.addItemBtnText}>{isCombo ? "Elegir" : "+ Agregar"}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Combo Configuration Modal */}
      <ComboConfigModal
        visible={Boolean(selectedProductForCombo)}
        combo={selectedProductForCombo}
        onClose={() => setSelectedProductForCombo(null)}
        onAddToCart={handleConfirmComboChoices}
      />

      {/* Modal: Register Payment */}
      <Modal
        visible={paymentModalVisible}
        animationType={isTablet ? "fade" : "slide"}
        transparent={true}
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, isTablet && styles.modalBackdropTablet]}>
          <SafeAreaView style={[styles.modalSheet, isTablet && styles.modalSheetTablet]}>
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
  toastContainer: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    pointerEvents: "none"
  },
  toastPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1e1b18",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4
  },
  toastText: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "700"
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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1
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
  statusBadgeReady: {
    backgroundColor: colors.successSoft
  },
  statusBadgeDelivered: {
    backgroundColor: colors.surfaceMuted
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase"
  },
  statusTextReady: {
    color: colors.success
  },
  statusTextDelivered: {
    color: colors.muted
  },
  orderItemsList: {
    marginTop: 4
  },
  ticketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  ticketLeft: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
    paddingRight: 8
  },
  ticketQty: {
    fontSize: 13.5,
    fontWeight: "900",
    color: colors.primary,
    minWidth: 26
  },
  ticketItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  choiceNote: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 1
  },
  ticketPrice: {
    fontSize: 13.5,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
    minWidth: 65
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
    borderTopColor: colors.borderLight,
    alignItems: "center"
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.success,
    height: 52,
    width: "100%",
    borderRadius: 16,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  payBtnTablet: {
    maxWidth: 400
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
  modalBackdropTablet: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalSheet: {
    backgroundColor: colors.background,
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    paddingBottom: 20
  },
  modalSheetTablet: {
    maxWidth: 520,
    borderRadius: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
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
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 10
  },
  menuProdInfo: {
    flex: 1
  },
  menuProdName: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.text
  },
  comboTagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2
  },
  comboBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary
  },
  menuProdPrice: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.primary,
    marginTop: 4
  },
  stepperWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  stepperBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 4,
    height: 36
  },
  stepperBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6
  },
  stepperQtyText: {
    fontSize: 13,
    fontWeight: "900",
    color: colors.text,
    minWidth: 20,
    textAlign: "center"
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  addItemBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
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
  },
  deliverOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 10,
    gap: 6
  },
  deliverOrderBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff"
  }
});
