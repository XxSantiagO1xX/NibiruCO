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

export default function AdminTableAssignmentScreen({ navigation }) {
  const { token, tablesUpdateSignal } = useContext(AppContext);

  const [assignments, setAssignments] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New assignment modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWaiterId, setSelectedWaiterId] = useState(null);
  const [selectedTableIds, setSelectedTableIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [assignRes, waitRes, tabRes] = await Promise.all([
        axios.get(`${API_URL}/tables/waiter-assignments`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/tables/waiters`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/tables`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (Array.isArray(assignRes.data)) setAssignments(assignRes.data);
      if (Array.isArray(waitRes.data)) setWaiters(waitRes.data);
      if (Array.isArray(tabRes.data)) setTables(tabRes.data);
    } catch (err) {
      console.log("Error loading table assignments:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData, tablesUpdateSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenAssignModal = (waiter = null) => {
    if (waiter) {
      setSelectedWaiterId(waiter.id);
      const currentAssigned = new Set(
        assignments
          .filter((a) => a.waiter_user_id === waiter.id)
          .map((a) => a.table_id)
      );
      setSelectedTableIds(currentAssigned);
    } else {
      setSelectedWaiterId(waiters[0]?.id || null);
      setSelectedTableIds(new Set());
    }
    setModalVisible(true);
  };

  const toggleTableSelection = (tableId) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  };

  const handleSaveAssignments = async () => {
    if (!selectedWaiterId) {
      Alert.alert("Error", "Selecciona un mesero");
      return;
    }
    if (selectedTableIds.size === 0) {
      Alert.alert("Error", "Selecciona al menos una mesa");
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/tables/waiter-assignments`,
        {
          waiter_user_id: selectedWaiterId,
          table_ids: Array.from(selectedTableIds)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setModalVisible(false);
      loadData();
      Alert.alert("¡Guardado!", "Asignaciones del turno actualizadas.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "No se pudo guardar la asignación");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = (assignId) => {
    Alert.alert(
      "Eliminar Asignación",
      "¿Deseas desvincular esta mesa del mesero para este turno?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/tables/waiter-assignments/${assignId}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              loadData();
            } catch (err) {
              Alert.alert("Error", "No se pudo eliminar la asignación");
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Asignación de Mesas" showBrandMark={false} />
        <View style={styles.loaderBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loaderText}>Cargando roles y mesas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Group assignments by waiter
  const assignmentsByWaiter = waiters.map((w) => {
    const assigned = assignments.filter((a) => a.waiter_user_id === w.id);
    return {
      waiter: w,
      assignments: assigned
    };
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Turno de Meseros"
        subtitle="Asignación de Mesas por Turno"
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
        <TouchableOpacity
          style={styles.newAssignBtn}
          onPress={() => handleOpenAssignModal()}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={20} color="#ffffff" />
          <Text style={styles.newAssignBtnText}>+ Nueva Asignación de Turno</Text>
        </TouchableOpacity>

        {waiters.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No hay meseros registrados"
            description="Crea usuarios con rol 'mesero' para poder asignarles mesas por turno."
          />
        ) : (
          assignmentsByWaiter.map(({ waiter, assignments: wAssignments }) => (
            <View key={waiter.id} style={styles.waiterCard}>
              <View style={styles.waiterCardHeader}>
                <View style={styles.waiterAvatar}>
                  <Ionicons name="person" size={20} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.waiterName}>{waiter.name}</Text>
                  <Text style={styles.waiterPhone}>
                    {wAssignments.length} mesa(s) asignada(s) hoy
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => handleOpenAssignModal(waiter)}
                >
                  <Ionicons name="pencil" size={14} color={colors.primary} />
                  <Text style={styles.editBtnText}>Editar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.tablesChipsRow}>
                {wAssignments.length === 0 ? (
                  <Text style={styles.noTablesText}>Sin mesas asignadas para hoy.</Text>
                ) : (
                  wAssignments.map((a) => (
                    <View key={a.id} style={styles.tableChip}>
                      <Text style={styles.tableChipText}>{a.table_name}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteAssignment(a.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close-circle" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Assignment Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Asignar Mesas al Mesero</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.modalSectionHeading}>1. Selecciona el Mesero</Text>
              <View style={styles.waitersPickerGrid}>
                {waiters.map((w) => {
                  const isSel = selectedWaiterId === w.id;
                  return (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.waiterSelectCard, isSel && styles.waiterSelectCardActive]}
                      onPress={() => setSelectedWaiterId(w.id)}
                    >
                      <Text style={[styles.waiterSelectName, isSel && { color: colors.primary }]}>
                        {w.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.modalSectionHeading}>
                2. Selecciona las Mesas ({selectedTableIds.size} seleccionadas)
              </Text>
              <View style={styles.tablesGrid}>
                {tables.map((t) => {
                  const isSelected = selectedTableIds.has(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.tableSelectBox,
                        isSelected && styles.tableSelectBoxActive
                      ]}
                      onPress={() => toggleTableSelection(t.id)}
                    >
                      <Ionicons
                        name={isSelected ? "checkbox" : "square-outline"}
                        size={18}
                        color={isSelected ? colors.primary : colors.muted}
                      />
                      <Text
                        style={[
                          styles.tableSelectName,
                          isSelected && styles.tableSelectNameActive
                        ]}
                      >
                        {t.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveAssignments}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.saveBtnText}>Guardar Asignaciones</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 14
  },
  newAssignBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3
  },
  newAssignBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  waiterCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 12
  },
  waiterCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  waiterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  waiterName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text
  },
  waiterPhone: {
    fontSize: 12,
    color: colors.muted
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary
  },
  tablesChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  noTablesText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: "italic"
  },
  tableChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  tableChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text
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
    maxHeight: "85%",
    paddingBottom: 24
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
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  modalBody: {
    padding: 20,
    gap: 12
  },
  modalSectionHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginTop: 4
  },
  waitersPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  waiterSelectCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  waiterSelectCardActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  waiterSelectName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  tablesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tableSelectBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    minWidth: "45%"
  },
  tableSelectBoxActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  tableSelectName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  tableSelectNameActive: {
    color: colors.primary,
    fontWeight: "800"
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 16,
    marginTop: 14
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  }
});
