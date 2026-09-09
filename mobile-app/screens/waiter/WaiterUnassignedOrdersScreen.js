import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../../context/AppContext";
import { API_URL } from "../../config/api";
import colors from "../../theme/colors";
import Header from "../../components/Header";
import EmptyState from "../../components/EmptyState";

export default function WaiterUnassignedOrdersScreen({ navigation }) {
  const { token, orderUpdateSignal, tablesUpdateSignal } = useContext(AppContext);

  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Assign modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const loadUnassignedOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/tables/unassigned-local-orders`, {
        params: { query: searchQuery.trim() || undefined },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setOrders(res.data);
      }
    } catch (err) {
      console.log("Error loading unassigned orders:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, searchQuery]);

  const loadTables = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setTables(res.data);
      }
    } catch (err) {
      console.log("Error loading tables:", err.message);
    }
  }, [token]);

  useEffect(() => {
    loadUnassignedOrders();
    loadTables();
  }, [loadUnassignedOrders, loadTables, orderUpdateSignal, tablesUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadUnassignedOrders();
    loadTables();
  };

  const handleOpenAssignModal = (order) => {
    setSelectedOrder(order);
    setAssignModalVisible(true);
  };

  const handleConfirmAssign = async (table) => {
    if (!selectedOrder) return;
    try {
      setAssigning(true);
      const res = await axios.post(
        `${API_URL}/tables/orders/${selectedOrder.id}/assign-table`,
        { table_id: table.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAssignModalVisible(false);
      setSelectedOrder(null);
      loadUnassignedOrders();

      Alert.alert(
        "¡Pedido Asignado!",
        res.data.message || `El pedido ha sido vinculado a ${table.name}.`,
        [
          {
            text: "Ver Mesa",
            onPress: () =>
              navigation.navigate("WaiterTableDetail", {
                tableId: table.id,
                sessionId: table.session_id,
                tableName: table.name
              })
          },
          { text: "Continuar", style: "cancel" }
        ]
      );
    } catch (err) {
      Alert.alert(
        "Error al Asignar",
        err?.response?.data?.message || "No se pudo asignar el pedido a la mesa."
      );
    } finally {
      setAssigning(false);
    }
  };

  const renderOrderItem = ({ item }) => {
    const folioStr = item.folio
      ? `F${String(item.folio).padStart(3, "0")}`
      : `#${item.id}`;
    const items = Array.isArray(item.items) ? item.items : [];
    const clientName = item.customer_name || item.user_name || "Cliente en local";

    return (
      <View style={styles.orderCard}>
        <View style={styles.cardHeader}>
          <View style={styles.folioBadge}>
            <Text style={styles.folioText}>{folioStr}</Text>
          </View>
          <Text style={styles.statusWait}>Esperando Llegada</Text>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.clientRow}>
            <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.clientName}>{clientName}</Text>
            {item.user_phone ? (
              <Text style={styles.clientPhone}>· {item.user_phone}</Text>
            ) : null}
          </View>

          <View style={styles.itemsSummary}>
            {items.map((it, idx) => (
              <Text key={idx} style={styles.itemLine}>
                {it.quantity}x {it.name}
              </Text>
            ))}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Total del Pedido:</Text>
            <Text style={styles.totalAmount}>${Number(item.total).toFixed(2)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.assignBtn}
          onPress={() => handleOpenAssignModal(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="restaurant" size={16} color="#ffffff" />
          <Text style={styles.assignBtnText}>Asignar a Mesa Física</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Esperando Llegada"
        subtitle="Buscar clientes para sentar en mesa"
        showBack={true}
        onBack={() => navigation.goBack()}
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

      {/* Search bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por folio (ej. 12) o nombre..."
            placeholderTextColor={colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Buscando pedidos...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
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
              icon="checkmark-done-circle-outline"
              title="No hay pedidos esperando mesa"
              description="Cuando un comensal haga un pedido para comer en el restaurante, aparecerá aquí para que lo vincules a su mesa al llegar."
            />
          }
          renderItem={renderOrderItem}
        />
      )}

      {/* Modal: Select Table to Assign */}
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
                <Text style={styles.modalTitle}>Selecciona la Mesa</Text>
                <Text style={styles.modalSubtitle}>
                  Vincular pedido{" "}
                  {selectedOrder?.folio
                    ? `F${String(selectedOrder.folio).padStart(3, "0")}`
                    : `#${selectedOrder?.id}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAssignModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {assigning ? (
              <View style={styles.assigningBox}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.assigningText}>Vinculando comanda a mesa...</Text>
              </View>
            ) : (
              <FlatList
                data={tables}
                keyExtractor={(item) => item.id.toString()}
                numColumns={2}
                columnWrapperStyle={styles.tableGridWrapper}
                contentContainerStyle={styles.modalListContent}
                renderItem={({ item }) => {
                  const isOccupied = Boolean(item.session_id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.tablePickerCard,
                        isOccupied ? styles.tableCardOcc : styles.tableCardAvail
                      ]}
                      onPress={() => handleConfirmAssign(item)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.tablePickerName}>{item.name}</Text>
                      {item.zone ? (
                        <Text style={styles.tablePickerZone}>{item.zone}</Text>
                      ) : null}
                      <View style={styles.tablePickerBadge}>
                        <Text
                          style={[
                            styles.tablePickerBadgeText,
                            { color: isOccupied ? colors.primary : colors.success }
                          ]}
                        >
                          {isOccupied ? "Mesa Abierta" : "Mesa Libre"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
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
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontWeight: "600"
  },
  loaderBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  loaderText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 12
  },
  listContent: {
    padding: 16,
    paddingBottom: 40
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  folioBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  folioText: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.primary
  },
  statusWait: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ea580c",
    backgroundColor: "#fff7ed",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fed7aa"
  },
  cardBody: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 8
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  clientName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  clientPhone: {
    fontSize: 12,
    color: colors.muted
  },
  itemsSummary: {
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    borderRadius: 12,
    gap: 3
  },
  itemLine: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "600"
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4
  },
  totalLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "600"
  },
  totalAmount: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.primary
  },
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 12,
    gap: 6
  },
  assignBtnText: {
    fontSize: 13,
    fontWeight: "800",
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
    maxHeight: "80%",
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
  modalListContent: {
    padding: 16
  },
  tableGridWrapper: {
    justifyContent: "space-between",
    marginBottom: 10
  },
  tablePickerCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    alignItems: "center"
  },
  tableCardAvail: {
    borderColor: colors.borderLight
  },
  tableCardOcc: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  tablePickerName: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text
  },
  tablePickerZone: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2
  },
  tablePickerBadge: {
    marginTop: 6
  },
  tablePickerBadgeText: {
    fontSize: 10,
    fontWeight: "800"
  },
  assigningBox: {
    padding: 40,
    alignItems: "center"
  },
  assigningText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted
  }
});
