import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
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

export default function DriverShiftScreen({ navigation }) {
  const { token, user, tripsUpdateSignal, orderUpdateSignal } = useContext(AppContext);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/deliveries/shift-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSummary(res.data);
    } catch (err) {
      console.log("Error loading shift summary:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, tripsUpdateSignal, orderUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSummary();
  };

  const handleStartShift = async () => {
    setActionLoading(true);
    try {
      await axios.post(`${API_URL}/deliveries/shifts/start`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      Alert.alert("Turno Iniciado", "Tu turno de reparto ha iniciado exitosamente.");
      loadSummary();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo iniciar el turno.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndShift = () => {
    Alert.alert(
      "Finalizar Turno",
      "¿Deseas cerrar tu turno actual y preparar el corte de caja?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, finalizar turno",
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(`${API_URL}/deliveries/shifts/end`, {}, {
                headers: { Authorization: `Bearer ${token}` }
              });
              Alert.alert("Turno Finalizado", "Tu turno ha finalizado. Presenta tu corte en mostrador.");
              loadSummary();
            } catch (err) {
              Alert.alert("Error", err?.response?.data?.message || "No se pudo finalizar el turno.");
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Corte de Turno" showBrandMark={false} />
        <View style={styles.loaderBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Calculando resumen de turno...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const shift = summary?.shift;
  const isShiftActive = shift?.status === "abierto";
  const deliveredCount = summary?.delivered_count || 0;
  const grossCash = Number(summary?.gross_cash_received ?? summary?.cash_collected ?? 0);
  const changeGiven = Number(summary?.total_cash_change_given ?? 0);
  const netCash = Number(summary?.net_cash_for_business ?? (grossCash - changeGiven));
  const expectedCash = Number(summary?.expected_cash ?? netCash);
  const cashSettled = Number(summary?.settled_cash ?? summary?.cash_settled ?? 0);
  const pendingSettlement = Number(summary?.pending_settlement ?? (expectedCash - cashSettled));
  const difference = Number(summary?.difference ?? (cashSettled - expectedCash));
  const orders = Array.isArray(summary?.orders) ? summary.orders : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Corte de Turno"
        subtitle={`Liquidación: ${user?.name || "Repartidor"}`}
        rightAction={
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={colors.text} />
          </TouchableOpacity>
        }
      />

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
        {/* Shift Action Banner */}
        <View style={styles.shiftHeaderCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.shiftStatusLabel}>ESTADO DEL TURNO</Text>
            <Text style={styles.shiftStatusVal}>
              {shift ? (isShiftActive ? "🟢 Turno Activo" : `⚪ Turno #${shift.id} (${shift.status})`) : "⚪ Sin Turno Iniciado"}
            </Text>
            {shift?.started_at && (
              <Text style={styles.shiftTimeText}>
                Iniciado: {new Date(shift.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
          {isShiftActive ? (
            <TouchableOpacity
              style={[styles.endShiftBtn, actionLoading && { opacity: 0.6 }]}
              onPress={handleEndShift}
              disabled={actionLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={16} color="#ffffff" />
              <Text style={styles.endShiftBtnText}>Cerrar Turno</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.startShiftBtn, actionLoading && { opacity: 0.6 }]}
              onPress={handleStartShift}
              disabled={actionLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={16} color="#ffffff" />
              <Text style={styles.startShiftBtnText}>Iniciar Turno</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Main Settlement Box */}
        <View style={styles.mainCard}>
          <Text style={styles.cardHeaderTitle}>Neto a Entregar en Caja</Text>
          <Text style={styles.pendingAmount}>${pendingSettlement.toFixed(2)}</Text>
          <Text style={styles.pendingSub}>
            {pendingSettlement > 0
              ? "Presenta este importe neto en mostrador para cerrar tu corte."
              : "Todo el efectivo recaudado está liquidado y al día."}
          </Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Entregas</Text>
              <Text style={styles.statVal}>{deliveredCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Cobrado Bruto</Text>
              <Text style={styles.statVal}>${grossCash.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Cambio Dado</Text>
              <Text style={[styles.statVal, { color: colors.warning }]}>-${changeGiven.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Neto Negocio</Text>
              <Text style={[styles.statVal, { color: colors.primary }]}>${netCash.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Liquidado</Text>
              <Text style={[styles.statVal, { color: colors.success }]}>${cashSettled.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Diferencia</Text>
              <Text style={[styles.statVal, { color: difference < 0 ? colors.danger : colors.success }]}>
                ${difference.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* History of Delivered Orders */}
        <Text style={styles.sectionHeading}>Entregas del Turno ({orders.length})</Text>

        {orders.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="Aún no hay entregas completadas"
            description="Cuando completes entregas con validación de PIN o autorización, aparecerán en este desglose."
          />
        ) : (
          orders.map((ord) => (
            <View key={ord.id} style={styles.orderRowCard}>
              <View style={styles.orderLeft}>
                <View style={styles.folioBadge}>
                  <Text style={styles.folioText}>
                    F{String(ord.folio || ord.id).padStart(3, "0")}
                  </Text>
                </View>
                <View>
                  <Text style={styles.customerText}>{ord.customer_name || "Cliente"}</Text>
                  <Text style={styles.timeText}>
                    {ord.delivered_at
                      ? new Date(ord.delivered_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "Entregado"}
                  </Text>
                </View>
              </View>

              <View style={styles.orderRight}>
                <Text style={styles.orderTotal}>${Number(ord.total).toFixed(2)}</Text>
                <View
                  style={[
                    styles.methodBadge,
                    ord.payment_method === "efectivo"
                      ? styles.methodCash
                      : styles.methodDigital
                  ]}
                >
                  <Text
                    style={[
                      styles.methodBadgeText,
                      {
                        color:
                          ord.payment_method === "efectivo"
                            ? colors.primary
                            : colors.success
                      }
                    ]}
                  >
                    {ord.payment_method === "efectivo" ? "Efectivo" : "App / Digital"}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    paddingBottom: 40,
    gap: 14
  },
  mainCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  pendingAmount: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -1,
    marginTop: 6
  },
  pendingSub: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16
  },
  shiftHeaderCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  shiftStatusLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.muted,
    letterSpacing: 0.5
  },
  shiftStatusVal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2
  },
  shiftTimeText: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2
  },
  startShiftBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14
  },
  startShiftBtnText: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "800"
  },
  endShiftBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14
  },
  endShiftBtnText: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "800"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 16,
    justifyContent: "space-between"
  },
  statBox: {
    width: "31%",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 8,
    alignItems: "center",
    marginBottom: 4
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: colors.muted,
    textAlign: "center"
  },
  statVal: {
    fontSize: 13.5,
    fontWeight: "900",
    color: colors.text,
    marginTop: 3
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  orderRowCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  orderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  folioBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  folioText: {
    fontSize: 13,
    fontWeight: "900",
    color: colors.primary
  },
  customerText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text
  },
  timeText: {
    fontSize: 11,
    color: colors.muted
  },
  orderRight: {
    alignItems: "flex-end"
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text
  },
  methodBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2
  },
  methodCash: {
    backgroundColor: colors.primarySoft
  },
  methodDigital: {
    backgroundColor: colors.successSoft
  },
  methodBadgeText: {
    fontSize: 10,
    fontWeight: "800"
  }
});
