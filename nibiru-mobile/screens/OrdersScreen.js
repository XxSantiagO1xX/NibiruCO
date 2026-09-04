import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

const serviceLabel = {
  local: "Local",
  llevar: "Para llevar",
  recoger: "Recoger",
  domicilio: "Domicilio"
};

const statusLabel = {
  pendiente: "Pendiente",
  aceptado: "Aceptado",
  preparando: "Preparando",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Cancelado"
};

const statusTone = {
  pendiente: { background: "#FFF7ED", color: "#C2410C" },
  aceptado: { background: "#FFF7ED", color: "#C2410C" },
  preparando: { background: "#FEFCE8", color: "#A16207" },
  listo: { background: "#ECFDF3", color: "#15803D" },
  entregado: { background: "#F0FDF4", color: "#166534" },
  cancelado: { background: "#FEF2F2", color: "#B91C1C" }
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${API}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(res.data);
    } catch (err) {
      console.log("ERROR ORDERS:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const cancelOrder = async (id) => {
    Alert.alert(
      "Cancelar pedido",
      "Solo los pedidos pendientes pueden cancelarse.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar pedido",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem("token");
              await axios.patch(`${API}/orders/${id}/cancel`, {}, {
                headers: { Authorization: `Bearer ${token}` }
              });
              await loadOrders();
            } catch (err) {
              Alert.alert("No se pudo cancelar", err?.response?.data?.message || "El pedido ya avanzó en cocina.");
            }
          }
        }
      ]
    );
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [])
  );

  const activeOrders = orders.filter((order) =>
    ["pendiente", "aceptado", "preparando", "listo"].includes(order.status?.toLowerCase())
  );
  const historyOrders = orders.filter((order) =>
    ["entregado", "cancelado"].includes(order.status?.toLowerCase())
  );
  const visibleOrders = tab === "active" ? activeOrders : historyOrders;

  const folio = (order) => order.folio ? `F${String(order.folio).padStart(3, "0")}` : `#${order.id}`;

  const pickupTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Seguimiento</Text>
        <Text style={styles.title}>Mis pedidos</Text>
        <Text style={styles.subtitle}>Revisa el estado y conserva tu folio para recoger.</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabButton, tab === "active" && styles.tabActive]} onPress={() => setTab("active")}>
          <Text style={[styles.tabText, tab === "active" && styles.tabTextActive]}>Activos · {activeOrders.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "history" && styles.tabActive]} onPress={() => setTab("history")}>
          <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>Historial</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={visibleOrders}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={visibleOrders.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={34} color={colors.muted} />
            <Text style={styles.emptyTitle}>{tab === "active" ? "No tienes pedidos activos" : "Aún no hay historial"}</Text>
            <Text style={styles.emptyCopy}>{tab === "active" ? "Tu próximo pedido aparecerá aquí." : "Los pedidos terminados aparecerán en esta sección."}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = item.status?.toLowerCase();
          const tone = statusTone[status] || { background: colors.surfaceMuted, color: colors.muted };
          const pickup = pickupTime(item.pickup_at);
          const type = item.service_type || item.type || "local";
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.folio}>{folio(item)}</Text>
                  <Text style={styles.service}>{serviceLabel[type] || type}</Text>
                </View>
                <View style={[styles.status, { backgroundColor: tone.background }]}>
                  <Text style={[styles.statusText, { color: tone.color }]}>{statusLabel[status] || status}</Text>
                </View>
              </View>

              {!!item.customer_name && <Text style={styles.customer}>{item.customer_name}</Text>}

              <View style={styles.metaRow}>
                {pickup && (
                  <View style={styles.metaPill}>
                    <Ionicons name="time-outline" size={13} color={colors.muted} />
                    <Text style={styles.metaText}>{pickup}</Text>
                  </View>
                )}
                <View style={styles.metaPill}>
                  <Ionicons name="wallet-outline" size={13} color={colors.muted} />
                  <Text style={styles.metaText}>${Number(item.total || 0).toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.progress}>
                {["pendiente", "preparando", "listo"].map((step, index) => {
                  const rank = { pendiente: 0, aceptado: 0, preparando: 1, listo: 2, entregado: 3 };
                  const current = rank[status] ?? -1;
                  return <View key={step} style={[styles.progressBar, current >= index && styles.progressDone]} />;
                })}
              </View>

              {status === "pendiente" && (
                <TouchableOpacity style={styles.cancelButton} onPress={() => cancelOrder(item.id)}>
                  <Text style={styles.cancelText}>Cancelar pedido</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  title: { marginTop: 4, color: colors.text, fontSize: 30, fontWeight: "800", letterSpacing: -1 },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 12 },
  tabs: { marginHorizontal: 16, marginBottom: 13, padding: 4, borderRadius: 14, flexDirection: "row", backgroundColor: "#EEEAE5" },
  tabButton: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  tabTextActive: { color: colors.text, fontWeight: "800" },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  emptyList: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 30 },
  empty: { alignItems: "center" },
  emptyTitle: { marginTop: 12, color: colors.text, fontSize: 16, fontWeight: "800" },
  emptyCopy: { marginTop: 5, color: colors.muted, fontSize: 11, textAlign: "center" },
  card: { marginBottom: 11, padding: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, shadowColor: "#191714", shadowOpacity: .04, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  folio: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -1 },
  service: { marginTop: 2, color: colors.muted, fontSize: 10, fontWeight: "700" },
  status: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: .4 },
  customer: { marginTop: 13, color: colors.text, fontSize: 12, fontWeight: "700" },
  metaRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  metaPill: { minHeight: 28, paddingHorizontal: 9, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surfaceMuted },
  metaText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  progress: { marginTop: 15, flexDirection: "row", gap: 5 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#E9E5DF" },
  progressDone: { backgroundColor: colors.primary },
  cancelButton: { marginTop: 15, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF2F2" },
  cancelText: { color: colors.danger, fontSize: 10, fontWeight: "800" }
});
