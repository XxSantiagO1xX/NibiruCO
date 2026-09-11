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
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../../context/AppContext";
import { API_URL } from "../../config/api";
import colors from "../../theme/colors";
import Header from "../../components/Header";
import EmptyState from "../../components/EmptyState";

export default function DriverShiftScreen({ navigation: propNavigation }) {
  const hookNavigation = useNavigation();
  const navigation = propNavigation || hookNavigation;

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
      await axios.post(
        `${API_URL}/deliveries/shifts/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
      "Cerrar Turno",
      "¿Estás seguro de cerrar tu turno y liquidar el efectivo?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, cerrar turno",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              // TODO: Petición al backend para marcar entregas como liquidadas
              await axios.post(
                `${API_URL}/deliveries/shifts/end`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
              );
              Alert.alert(
                "Turno Cerrado",
                "Tu turno ha sido cerrado y las entregas registradas para liquidación en caja."
              );
            } catch (err) {
              console.log("Error al cerrar turno en backend:", err?.response?.data || err.message);
              Alert.alert(
                "Aviso",
                err?.response?.data?.message || "Turno finalizado localmente. Presenta tu corte en caja."
              );
            } finally {
              // Reinicio de estados locales
              setSummary(null);
              setActionLoading(false);

              // Redirigir al usuario fuera de la pantalla de corte
              if (navigation && navigation.navigate) {
                navigation.navigate("Perfil");
              }
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

  const shift = summary?.shift || (summary?.shift_id ? summary : null);
  const isShiftActive =
    summary?.status === "open" ||
    summary?.status === "abierto" ||
    summary?.shift?.status === "open" ||
    summary?.shift?.status === "abierto";

  // Consistent array for delivered orders
  const orders = Array.isArray(summary?.completed_deliveries)
    ? summary.completed_deliveries
    : Array.isArray(summary?.orders)
    ? summary.orders
    : [];
  const deliveriesCount = orders.length;

  const initialFloat = Number(summary?.initial_cash_float ?? 0);
  const grossCash = Number(summary?.gross_cash_received ?? summary?.cash_collected ?? 0);
  const changeGiven = Number(summary?.total_cash_change_given ?? 0);
  const netCash = Number(summary?.net_cash_for_business ?? (grossCash - changeGiven));
  const expectedCash = Number(
    summary?.total_cash_expected ?? summary?.expected_cash ?? (netCash + initialFloat)
  );
  const cashSettled = Number(
    summary?.total_cash_settled ?? summary?.settled_cash ?? summary?.cash_settled ?? 0
  );
  const pendingSettlement = Number(
    summary?.pending_settlement ?? (expectedCash - cashSettled)
  );
  const difference = Number(summary?.difference ?? (cashSettled - expectedCash));

  // Dynamic conditional color for massive pending amount
  const pendingColor = pendingSettlement > 0 ? "#FF6B00" : "#28A745";

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
              {shift
                ? isShiftActive
                  ? "🟢 Turno Activo"
                  : `⚪ Turno #${shift.id} (${shift.status})`
                : "⚪ Sin Turno Iniciado"}
            </Text>
            {shift?.started_at && (
              <Text style={styles.shiftTimeText}>
                Iniciado:{" "}
                {new Date(shift.started_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </Text>
            )}
          </View>
          {!isShiftActive && (
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
          <Text style={[styles.pendingAmount, { color: pendingColor }]}>
            ${pendingSettlement.toFixed(2)}
          </Text>
          <Text style={styles.pendingSub}>
            {pendingSettlement > 0
              ? "Presenta este importe neto en mostrador para cerrar tu corte."
              : "Todo el efectivo recaudado está liquidado y al día."}
          </Text>

          {initialFloat > 0 && (
            <View style={styles.floatNoticeBox}>
              <Text style={styles.floatNoticeText}>
                Incluye fondo inicial para cambio de{" "}
                <Text style={styles.floatNoticeHighlight}>${initialFloat.toFixed(2)}</Text>
              </Text>
            </View>
          )}

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Entregas</Text>
              <Text style={styles.statVal}>{deliveriesCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Cobrado Bruto</Text>
              <Text style={styles.statVal}>${grossCash.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Cambio Dado</Text>
              <Text style={[styles.statVal, { color: colors.warning }]}>
                -${changeGiven.toFixed(2)}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Neto Negocio</Text>
              <Text style={[styles.statVal, { color: colors.primary }]}>
                ${netCash.toFixed(2)}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Liquidado</Text>
              <Text style={[styles.statVal, { color: colors.success }]}>
                ${cashSettled.toFixed(2)}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Diferencia</Text>
              <Text
                style={[
                  styles.statVal,
                  { color: difference < 0 ? colors.danger : colors.success }
                ]}
              >
                ${difference.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* History of Delivered Orders */}
        <Text style={styles.sectionHeading}>Entregas del Turno ({deliveriesCount})</Text>

        {orders.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="Aún no hay entregas completadas"
            description="Cuando completes entregas con validación de PIN o autorización, aparecerán en este desglose."
          />
        ) : (
          orders.map((ord, index) => {
            const orderTime = ord.delivery_time || ord.delivered_at;
            const orderTotalNum = Number(ord.total ?? ord.order_total ?? 0);
            return (
              <View
                key={ord?.id ? `${ord.id}-${index}` : index.toString()}
                style={styles.orderRibbonCard}
              >
                {/* Ribbon Tag attached flush to top-left corner */}
                <View style={styles.orderRibbonTag}>
                  <Text style={styles.orderRibbonTagText}>
                    F{String(ord.folio || ord.id || "").padStart(3, "0")}
                  </Text>
                </View>

                {/* Card Body with proper spacing */}
                <View style={styles.orderRibbonBody}>
                  <View style={styles.orderRibbonLeft}>
                    <Text style={styles.customerText} numberOfLines={1}>
                      {ord.customer_name || "Cliente"}
                    </Text>
                    <Text style={styles.timeText}>
                      {orderTime
                        ? new Date(orderTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })
                        : "Entregado"}
                    </Text>
                  </View>

                  <View style={styles.orderRibbonRight}>
                    <Text style={styles.orderTotal}>${orderTotalNum.toFixed(2)}</Text>
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
              </View>
            );
          })
        )}

        {/* Full-width End Shift Button placed at the very bottom */}
        {isShiftActive && (
          <TouchableOpacity
            style={[styles.fullWidthEndShiftBtn, actionLoading && { opacity: 0.6 }]}
            onPress={handleEndShift}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            {actionLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color="#ffffff" />
                <Text style={styles.fullWidthEndShiftBtnText}>
                  CERRAR TURNO Y LIQUIDAR EFECTIVO
                </Text>
              </>
            )}
          </TouchableOpacity>
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
    paddingBottom: 110,
    gap: 14
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
  mainCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  pendingAmount: {
    fontSize: 38,
    fontWeight: "900",
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
  floatNoticeBox: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  floatNoticeText: {
    fontSize: 11,
    color: colors.muted,
    textAlign: "center"
  },
  floatNoticeHighlight: {
    fontWeight: "800",
    color: colors.text
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
    color: colors.text,
    marginTop: 4
  },
  orderRibbonCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: "hidden"
  },
  orderRibbonTag: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomRightRadius: 12,
    alignSelf: "flex-start"
  },
  orderRibbonTagText: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.5
  },
  orderRibbonBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12
  },
  orderRibbonLeft: {
    flex: 1,
    paddingRight: 10
  },
  customerText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.text
  },
  timeText: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2
  },
  orderRibbonRight: {
    alignItems: "flex-end"
  },
  orderTotal: {
    fontSize: 14.5,
    fontWeight: "900",
    color: colors.text
  },
  methodBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginTop: 3
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
  },
  fullWidthEndShiftBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.danger,
    height: 52,
    borderRadius: 26,
    marginTop: 10,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3
  },
  fullWidthEndShiftBtnText: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "900",
    letterSpacing: 0.5
  }
});
