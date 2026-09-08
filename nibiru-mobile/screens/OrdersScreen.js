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
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import api, { socket } from "../services/api";
import colors from "../theme/colors";

export default function OrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* CARGAR PEDIDOS */
  const loadOrders = async () => {
    try {
      const res = await api.get("/orders");
      setOrders(res.data || []);
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
      "¿Estás seguro de que deseas cancelar este pedido?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            try {
              await api.patch(`/orders/${id}/cancel`);
              Alert.alert("Pedido cancelado", "Tu pedido ha sido cancelado exitosamente.");
              loadOrders();
            } catch (err) {
              console.log("ERROR CANCEL:", err?.response?.data || err.message);
              const msg = err?.response?.data?.message || "No se pudo cancelar el pedido.";
              Alert.alert("Aviso", msg);
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

  useEffect(() => {
    socket.on("order-updated", () => {
      loadOrders();
    });

    return () => {
      socket.off("order-updated");
    };
  }, []);

  const getStatusColor = (status) => {
    const s = status ? status.toLowerCase() : "";
    if (s === "pendiente") return "#f59e0b";
    if (s === "aceptado") return "#6366f1";
    if (s === "preparando") return "#ea580c";
    if (s === "listo") return "#0284c7";
    if (s === "entregado") return "#16a34a";
    if (s === "cancelado") return "#ef4444";
    return "#64748b";
  };

  const getTypeText = (type) => {
    if (type === "local") return "Consumo en Local";
    if (type === "pickup") return "Para Llevar";
    if (type === "delivery") return "A Domicilio";
    return type || "Local";
  };

  const activeOrders = orders.filter(order =>
    ["pendiente", "aceptado", "preparando", "listo"].includes(order.status?.toLowerCase())
  );

  const historyOrders = orders.filter(order =>
    ["entregado", "cancelado"].includes(order.status?.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando tus pedidos...</Text>
      </View>
    );
  }

  const currentData = tab === "active" ? activeOrders : historyOrders;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Mis Pedidos</Text>

      <View style={styles.tabs}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setTab("active")}>
          <Text style={[styles.tabText, tab === "active" && styles.tabActive]}>
            En Curso ({activeOrders.length})
          </Text>
          {tab === "active" && <View style={styles.line} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setTab("history")}>
          <Text style={[styles.tabText, tab === "history" && styles.tabActive]}>
            Historial ({historyOrders.length})
          </Text>
          {tab === "history" && <View style={styles.line} />}
        </TouchableOpacity>
      </View>

      <FlatList
        data={currentData}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {tab === "active" ? "No tienes pedidos en curso actualmente." : "Aún no tienes pedidos en el historial."}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.orderId}>Pedido #{item.id}</Text>
              <View style={[styles.status, { backgroundColor: getStatusColor(item.status) }]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>

            <Text style={styles.type}>Entrega: <Text style={styles.bold}>{getTypeText(item.type)}</Text></Text>
            <Text style={styles.type}>Pago: <Text style={styles.bold}>{item.payment_method === "card" ? "Tarjeta" : "Efectivo"}</Text></Text>

            {item.items && item.items.length > 0 && (
              <View style={styles.itemsBox}>
                {item.items.map((it, idx) => (
                  <Text key={idx} style={styles.itemText}>
                    • {it.name || `Producto #${it.product_id}`} x{it.quantity}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.footerRow}>
              <Text style={styles.total}>Total: ${Number(item.total).toFixed(2)}</Text>
              <Text style={styles.date}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>

            {item.status?.toLowerCase() === "pendiente" && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => cancelOrder(item.id)}
              >
                <Text style={styles.cancelText}>Cancelar Pedido</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280"
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 16,
    color: colors.text
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 20
  },
  tabButton: {
    marginRight: 24
  },
  tabText: {
    fontSize: 17,
    color: "#9ca3af",
    fontWeight: "600"
  },
  tabActive: {
    color: colors.text,
    fontWeight: "800"
  },
  line: {
    marginTop: 6,
    height: 3,
    width: "100%",
    borderRadius: 2,
    backgroundColor: colors.primary
  },
  listContent: {
    paddingBottom: 24
  },
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  orderId: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text
  },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  statusText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase"
  },
  type: {
    color: "#4b5563",
    fontSize: 14,
    marginBottom: 4
  },
  bold: {
    fontWeight: "700",
    color: colors.text
  },
  itemsBox: {
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 8,
    marginVertical: 8
  },
  itemText: {
    color: "#374151",
    fontSize: 13,
    marginBottom: 2
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6
  },
  total: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary
  },
  date: {
    color: "#9ca3af",
    fontSize: 12
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: "#fee2e2",
    padding: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  cancelText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 14
  },
  empty: {
    marginTop: 60,
    alignItems: "center",
    padding: 24
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 15,
    textAlign: "center"
  }
});