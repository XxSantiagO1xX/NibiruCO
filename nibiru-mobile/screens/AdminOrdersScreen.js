import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import { io } from "socket.io-client";
import colors from "../theme/colors";
import API from "../config/api";

const socket = io(API);

const nextStatus = {
  pendiente: "aceptado",
  aceptado: "preparando",
  preparando: "listo"
};

const actionLabel = {
  pendiente: "Aceptar",
  aceptado: "Preparar",
  preparando: "Marcar listo"
};

const statusLabel = {
  pendiente: "Pendiente",
  aceptado: "Aceptado",
  preparando: "Preparando",
  listo: "Listo"
};

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const activeOrders = useMemo(
    () => orders.filter((order) => !["entregado", "cancelado"].includes(order.status)),
    [orders]
  );

  const loadOrders = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${API}/orders/admin/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(res.data);
    } catch (err) {
      console.log(err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const token = await AsyncStorage.getItem("token");
      await axios.patch(
        `${API}/orders/${id}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await loadOrders();
    } catch (err) {
      console.log(err?.response?.data || err.message);
    }
  };

  useEffect(() => {
    loadOrders();
    const refresh = () => loadOrders();
    socket.on("new-order", refresh);
    socket.on("order-updated", refresh);
    socket.on("orders-updated", refresh);
    return () => {
      socket.off("new-order", refresh);
      socket.off("order-updated", refresh);
      socket.off("orders-updated", refresh);
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MealOps</Text>
          <Text style={styles.title}>Cocina</Text>
          <Text style={styles.subtitle}>{activeOrders.length} pedido{activeOrders.length === 1 ? "" : "s"} activo{activeOrders.length === 1 ? "" : "s"}</Text>
        </View>
        <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>En vivo</Text></View>
      </View>

      <FlatList
        data={activeOrders}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={activeOrders.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<Text style={styles.empty}>La cocina está al día.</Text>}
        renderItem={({ item }) => {
          const items = Array.isArray(item.items) ? item.items : [];
          const next = nextStatus[item.status];
          const tableReady = item.status === "listo" && item.service_type === "mesa";
          const counterReady = item.status === "listo" && item.service_type !== "mesa";

          return (
            <View style={[styles.card, item.status === "listo" && styles.readyCard]}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.orderId}>{item.folio ? `F${String(item.folio).padStart(3, "0")}` : `#${item.id}`}</Text>
                  <Text style={styles.meta}>{item.customer_name || item.type || "Pedido"}</Text>
                </View>
                <View style={[styles.status, item.status === "listo" && styles.statusReady]}>
                  <Text style={[styles.statusText, item.status === "listo" && styles.statusReadyText]}>{statusLabel[item.status] || item.status}</Text>
                </View>
              </View>

              <View style={styles.items}>
                {items.map((product, index) => (
                  <View key={`${item.id}-${index}`} style={styles.itemBlock}>
                    <View style={styles.itemRow}>
                      <Text style={styles.itemName}>{product.name || `Producto ${product.product_id}`}</Text>
                      <Text style={styles.itemQty}>×{product.quantity || 1}</Text>
                    </View>
                    {Array.isArray(product.choices) && product.choices.length > 0 && (
                      <Text style={styles.choiceText}>{product.choices.map((choice) => choice.name).join(" · ")}</Text>
                    )}
                  </View>
                ))}
              </View>

              {next && (
                <TouchableOpacity style={styles.button} onPress={() => updateStatus(item.id, next)}>
                  <Text style={styles.buttonText}>{actionLabel[item.status]}</Text>
                </TouchableOpacity>
              )}

              {tableReady && (
                <TouchableOpacity style={[styles.button, styles.buttonReady]} onPress={() => updateStatus(item.id, "entregado")}>
                  <Text style={styles.buttonText}>Entregado en mesa</Text>
                </TouchableOpacity>
              )}

              {counterReady && (
                <View style={styles.counterNotice}>
                  <Text style={styles.counterNoticeText}>Listo para entrega en Mostrador</Text>
                </View>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { marginTop: 4, color: colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -1 },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 12 },
  live: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  emptyList: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  empty: { color: colors.muted, fontSize: 13 },
  card: { marginBottom: 12, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: "#191714", shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  readyCard: { borderColor: "#BFE5CD" },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  orderId: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -1 },
  meta: { marginTop: 3, color: colors.muted, fontSize: 11 },
  status: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 12, backgroundColor: colors.primarySoft },
  statusReady: { backgroundColor: "#ECFDF3" },
  statusText: { color: colors.primaryDark, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  statusReadyText: { color: colors.success },
  items: { marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  itemBlock: { gap: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  itemName: { flex: 1, color: colors.text, fontSize: 13 },
  itemQty: { color: colors.text, fontSize: 13, fontWeight: "800" },
  choiceText: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  button: { marginTop: 16, minHeight: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  buttonReady: { backgroundColor: colors.success },
  buttonText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  counterNotice: { marginTop: 16, minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF3" },
  counterNoticeText: { color: colors.success, fontSize: 11, fontWeight: "800" }
});
