import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../../context/AppContext";
import { API_URL } from "../../config/api";
import colors from "../../theme/colors";
import Header from "../../components/Header";
import EmptyState from "../../components/EmptyState";

export default function WaiterTablesScreen({ navigation }) {
  const { token, user, tablesUpdateSignal, orderUpdateSignal } = useContext(AppContext);

  const [tables, setTables] = useState([]);
  const [assignedTableIds, setAssignedTableIds] = useState(new Set());
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterMode, setFilterMode] = useState("my_tables"); // 'my_tables' | 'all' | 'occupied' | 'free'

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      // 1. Load all tables
      const tablesRes = await axios.get(`${API_URL}/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(tablesRes.data)) {
        setTables(tablesRes.data);
      }

      // 2. Load waiter assignments for today
      try {
        const assignRes = await axios.get(`${API_URL}/tables/waiter-assignments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (Array.isArray(assignRes.data)) {
          const ids = new Set(assignRes.data.map((a) => a.table_id));
          setAssignedTableIds(ids);
        }
      } catch (assignErr) {
        console.log("Assignments load:", assignErr.message);
      }

      // 3. Count unassigned local orders (waiting arrival)
      try {
        const unassignedRes = await axios.get(`${API_URL}/tables/unassigned-local-orders`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (Array.isArray(unassignedRes.data)) {
          setUnassignedCount(unassignedRes.data.length);
        }
      } catch (_) {}
    } catch (err) {
      console.log("Error loading waiter tables:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData, tablesUpdateSignal, orderUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenTable = async (table) => {
    try {
      const res = await axios.post(
        `${API_URL}/tables/${table.id}/open`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadData();
      navigation.navigate("WaiterTableDetail", {
        tableId: table.id,
        sessionId: res.data.id,
        tableName: table.name
      });
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo abrir la mesa");
    }
  };

  const handleTablePress = (table) => {
    if (table.session_id) {
      navigation.navigate("WaiterTableDetail", {
        tableId: table.id,
        sessionId: table.session_id,
        tableName: table.name
      });
    } else {
      Alert.alert(
        `Abrir ${table.name}`,
        "Esta mesa no tiene una cuenta abierta. ¿Deseas abrirla ahora para comenzar a comandar?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Abrir Mesa", onPress: () => handleOpenTable(table) }
        ]
      );
    }
  };

  // Filter tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const isAssigned = assignedTableIds.has(t.id);
      const isOccupied = Boolean(t.session_id);

      if (filterMode === "my_tables") {
        return assignedTableIds.size > 0 ? isAssigned : true;
      }
      if (filterMode === "occupied") {
        return isOccupied;
      }
      if (filterMode === "free") {
        return !isOccupied;
      }
      return true; // 'all'
    });
  }, [tables, assignedTableIds, filterMode]);

  const renderTableCard = ({ item }) => {
    const isOccupied = Boolean(item.session_id);
    const isAccountReq = item.session_status === "account_requested";
    const isAssigned = assignedTableIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.tableCard,
          isAccountReq
            ? styles.cardAccountReq
            : isOccupied
            ? styles.cardOccupied
            : styles.cardFree
        ]}
        onPress={() => handleTablePress(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.tableName}>{item.name}</Text>
          {isAssigned ? (
            <View style={styles.assignedBadge}>
              <Text style={styles.assignedBadgeText}>Mi Turno</Text>
            </View>
          ) : null}
        </View>

        {item.zone ? <Text style={styles.zoneText}>{item.zone}</Text> : null}

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isAccountReq
                  ? colors.warning
                  : isOccupied
                  ? colors.primary
                  : colors.success
              }
            ]}
          />
          <Text
            style={[
              styles.statusLabel,
              {
                color: isAccountReq
                  ? colors.warning
                  : isOccupied
                  ? colors.primary
                  : colors.success
              }
            ]}
          >
            {isAccountReq
              ? "Cuenta Solicitada"
              : isOccupied
              ? "Mesa Ocupada"
              : "Disponible"}
          </Text>
        </View>

        {isOccupied ? (
          <View style={styles.occupiedInfoBox}>
            <Text style={styles.totalRunning}>
              ${Number(item.running_total || 0).toFixed(2)}
            </Text>
            <Text style={styles.sessionMeta}>
              {item.capacity ? `Capacidad: ${item.capacity}p` : "Consumo activo"}
            </Text>
          </View>
        ) : (
          <View style={styles.freeActionBox}>
            <Ionicons name="add-circle-outline" size={18} color={colors.muted} />
            <Text style={styles.freeActionText}>Toca para abrir</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Mesas de Salón"
        subtitle={`Turno de: ${user?.name || "Mesero"}`}
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

      {/* Waiting arrival banner link */}
      <TouchableOpacity
        style={styles.unassignedBanner}
        onPress={() => navigation.navigate("WaiterUnassignedOrders")}
        activeOpacity={0.85}
      >
        <View style={styles.unassignedBannerLeft}>
          <View style={styles.unassignedBadge}>
            <Text style={styles.unassignedBadgeCount}>{unassignedCount}</Text>
          </View>
          <View>
            <Text style={styles.unassignedBannerTitle}>
              Pedidos "Comer Aquí" Esperando Mesa
            </Text>
            <Text style={styles.unassignedBannerSubtitle}>
              Buscar folio o cliente para sentar y vincular
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </TouchableOpacity>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        {[
          { id: "my_tables", label: `Mis Mesas (${assignedTableIds.size})` },
          { id: "all", label: `Todas (${tables.length})` },
          { id: "occupied", label: "Ocupadas" },
          { id: "free", label: "Libres" }
        ].map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[
              styles.filterTab,
              filterMode === f.id && styles.filterTabActive
            ]}
            onPress={() => setFilterMode(f.id)}
          >
            <Text
              style={[
                styles.filterTabText,
                filterMode === f.id && styles.filterTabTextActive
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tables Grid */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Cargando estado de salón...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTables}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
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
              icon="restaurant-outline"
              title="No hay mesas en este filtro"
              description="Ajusta el filtro superior para ver las mesas disponibles en el restaurante."
            />
          }
          renderItem={renderTableCard}
        />
      )}
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
  unassignedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2
  },
  unassignedBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1
  },
  unassignedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  unassignedBadgeCount: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff"
  },
  unassignedBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text
  },
  unassignedBannerSubtitle: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 1
  },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center"
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted
  },
  filterTabTextActive: {
    color: "#ffffff"
  },
  loaderContainer: {
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
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: 12
  },
  tableCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    minHeight: 140,
    justifyContent: "space-between"
  },
  cardFree: {
    borderColor: colors.borderLight
  },
  cardOccupied: {
    borderColor: colors.primary,
    backgroundColor: "#fffbf7"
  },
  cardAccountReq: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  tableName: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.3
  },
  assignedBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  assignedBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary
  },
  zoneText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 1
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: "800"
  },
  occupiedInfoBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  totalRunning: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.primary
  },
  sessionMeta: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 2
  },
  freeActionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12
  },
  freeActionText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted
  }
});
