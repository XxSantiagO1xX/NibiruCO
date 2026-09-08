import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import api, { socket } from "../services/api";
import colors from "../theme/colors";

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* CARGAR PEDIDOS DE COCINA */
  const loadOrders = async () => {
    try {
      const res = await api.get("/orders/admin/all");
      setOrders(res.data || []);
    } catch (err) {
      console.log("ERROR ADMIN ORDERS:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();

    socket.on("new-order", () => {
      loadOrders();
    });

    socket.on("order-updated", () => {
      loadOrders();
    });

    return () => {
      socket.off("new-order");
      socket.off("order-updated");
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, []);

  /* ACTUALIZAR STATUS */
  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/orders/${id}/status`, { status });
      loadOrders();
    } catch (err) {
      console.log("ERROR STATUS:", err?.response?.data || err.message);
      const msg = err?.response?.data?.message || "No se pudo actualizar el estado";
      Alert.alert("Error", msg);
    }
  };

  const getStatusBadge = (status) => {
    const s = status ? status.toLowerCase() : "";
    if (s === "pendiente") return { bg: "#fef3c7", text: "#b45309" };
    if (s === "aceptado") return { bg: "#e0e7ff", text: "#4338ca" };
    if (s === "preparando") return { bg: "#ffedd5", text: "#c2410c" };
    if (s === "listo") return { bg: "#dcfce7", text: "#15803d" };
    if (s === "entregado") return { bg: "#f3f4f6", text: "#4b5563" };
    return { bg: "#fee2e2", text: "#b91c1c" };
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando comandas de cocina...</Text>
      </View>
    );
  }

  const activeOrders = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado");

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Comandas de Cocina</Text>
      <Text style={styles.subtitle}>En cola activa: {activeOrders.length} pedidos</Text>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay pedidos registrados en el sistema.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const badge = getStatusBadge(item.status);
          const isPending = item.status === "pendiente";
          const isPreparing = item.status === "preparando" || item.status === "aceptado";
          const isReady = item.status === "listo";
          const isFinished = item.status === "entregado" || item.status === "cancelado";

          return (
            <View style={[styles.card, isFinished && styles.cardFinished]}>
              <View style={styles.headerRow}>
                <Text style={styles.orderId}>Pedido #{item.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.statusText, { color: badge.text }]}>{item.status}</Text>
                </View>
              </View>

              <Text style={styles.metaText}>
                Tipo: <Text style={styles.bold}>{item.type}</Text> | Pago: <Text style={styles.bold}>{item.payment_method === "card" ? "Tarjeta" : "Efectivo"}</Text>
              </Text>
              <Text style={styles.metaText}>
                Cliente: <Text style={styles.bold}>{item.user_name || item.user_phone || "Comensal"}</Text>
              </Text>
              {item.delivery_address ? (
                <Text style={styles.metaText}>
                  Dirección: <Text style={styles.bold}>{item.delivery_address}</Text>
                </Text>
              ) : null}

              {item.items && item.items.length > 0 && (
                <View style={styles.itemsBox}>
                  {item.items.map((it, idx) => (
                    <Text key={idx} style={styles.itemText}>
                      • {it.name || `Producto #${it.product_id}`} <Text style={styles.bold}>x{it.quantity}</Text>
                    </Text>
                  ))}
                </View>
              )}

              <Text style={styles.total}>Total: ${Number(item.total).toFixed(2)}</Text>

              {/* BOTONES DE ACCIÓN SEGÚN EL FLUJO DE COCINA */}
              {!isFinished && (
                <View style={styles.actionsRow}>
                  {isPending && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                      onPress={() => updateStatus(item.id, "preparando")}
                    >
                      <Text style={styles.actionBtnText}>Iniciar Preparación</Text>
                    </TouchableOpacity>
                  )}

                  {isPreparing && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#0284c7" }]}
                      onPress={() => updateStatus(item.id, "listo")}
                    >
                      <Text style={styles.actionBtnText}>Marcar como Listo</Text>
                    </TouchableOpacity>
                  )}

                  {isReady && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#16a34a" }]}
                      onPress={() => updateStatus(item.id, "entregado")}
                    >
                      <Text style={styles.actionBtnText}>Confirmar Entrega</Text>
                    </TouchableOpacity>
                  )}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16
  },
  center: {
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
    color: colors.text
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 14,
    marginBottom: 16
  },
  listContent: {
    paddingBottom: 30
  },
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  cardFinished: {
    opacity: 0.65,
    backgroundColor: "#f9fafb"
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  orderId: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  statusText: {
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase"
  },
  metaText: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 3
  },
  bold: {
    fontWeight: "700",
    color: colors.text
  },
  itemsBox: {
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#f3f4f6"
  },
  itemText: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 3
  },
  total: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 4
  },
  actionsRow: {
    marginTop: 12
  },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center"
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 15
  }
});