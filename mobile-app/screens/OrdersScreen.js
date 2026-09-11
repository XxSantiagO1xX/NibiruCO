import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../context/AppContext";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";
import OrderTrackModal from "../components/OrderTrackModal";
import SkeletonList from "../components/SkeletonLoader";
import EmptyState from "../components/EmptyState";

export default function OrdersScreen({ navigation }) {
  const { token, orderUpdateSignal } = useContext(AppContext);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active"); // 'all' | 'active' | 'completed'
  const [trackModalVisible, setTrackModalVisible] = useState(false);
  const [selectedTrackOrderId, setSelectedTrackOrderId] = useState(null);

  // Fetch orders from backend
  const loadOrders = useCallback(async () => {
    if (!token) {
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const res = await axios.get(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setOrders(res.data);
      }
    } catch (err) {
      console.log("Error loading orders:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, orderUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  // Cancel order handler
  const handleCancelOrder = (orderId) => {
    Alert.alert(
      "Cancelar Pedido",
      "¿Estás seguro de que deseas cancelar este pedido?",
      [
        { text: "No, mantener", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            try {
              await axios.patch(
                `${API_URL}/orders/${orderId}/cancel`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
              );
              loadOrders();
              Alert.alert("Pedido Cancelado", "El pedido ha sido cancelado.");
            } catch (err) {
              console.log("Cancel order error:", err?.response?.data || err.message);
              Alert.alert(
                "Error",
                err?.response?.data?.message || "No se pudo cancelar el pedido."
              );
            }
          }
        }
      ]
    );
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    if (statusFilter === "active") {
      return orders.filter((o) =>
        ["pendiente", "aceptado", "preparando", "listo"].includes(
          String(o.status || "").toLowerCase()
        )
      );
    }
    if (statusFilter === "completed") {
      return orders.filter((o) =>
        ["entregado", "cancelado"].includes(String(o.status || "").toLowerCase())
      );
    }
    return orders;
  }, [orders, statusFilter]);

  if (!token) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Mis Pedidos" showBrandMark={false} />
        <EmptyState
          icon="receipt-outline"
          title="Inicia sesión"
          description="Inicia sesión con tu cuenta para ver el historial y seguimiento en tiempo real de tus pedidos."
          actionLabel="Iniciar Sesión"
          onAction={() => navigation.navigate("Login")}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Mis Pedidos"
        subtitle="Seguimiento y Folios en Tiempo Real"
        rightAction={
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={onRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
          </TouchableOpacity>
        }
      />

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            statusFilter === "all" && styles.filterTabActive
          ]}
          onPress={() => setStatusFilter("all")}
        >
          <Text
            style={[
              styles.filterTabText,
              statusFilter === "all" && styles.filterTabTextActive
            ]}
          >
            Todos ({orders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterTab,
            statusFilter === "active" && styles.filterTabActive
          ]}
          onPress={() => setStatusFilter("active")}
        >
          <Text
            style={[
              styles.filterTabText,
              statusFilter === "active" && styles.filterTabTextActive
            ]}
          >
            En Curso
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterTab,
            statusFilter === "completed" && styles.filterTabActive
          ]}
          onPress={() => setStatusFilter("completed")}
        >
          <Text
            style={[
              styles.filterTabText,
              statusFilter === "completed" && styles.filterTabTextActive
            ]}
          >
            Finalizados
          </Text>
        </TouchableOpacity>
      </View>

      {/* Orders List */}
      {loading ? (
        <View style={styles.listContainer}>
          <SkeletonList count={3} type="order" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item, index) => (item?.id ? `${item.id}-${index}` : index.toString())}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="No hay pedidos registrados"
              description="Cuando hagas tu primer pedido, podrás seguir el estado de preparación y entrega aquí."
              actionLabel="Ver Menú del Día"
              onAction={() => navigation.navigate("Productos")}
            />
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onCancel={handleCancelOrder}
              onTrack={(id) => {
                setSelectedTrackOrderId(id);
                setTrackModalVisible(true);
              }}
            />
          )}
        />
      )}

      {/* Real-time Order Tracking Modal */}
      <OrderTrackModal
        visible={trackModalVisible}
        orderId={selectedTrackOrderId}
        token={token}
        onClose={() => {
          setTrackModalVisible(false);
          setSelectedTrackOrderId(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
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
  filterSection: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 8
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  filterTabTextActive: {
    color: "#ffffff"
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100
  }
});