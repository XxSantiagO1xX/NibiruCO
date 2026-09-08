import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../theme/colors";

const ISSUE_REASONS = [
  "Cliente no responde / ausente",
  "Dirección no encontrada / incorrecta",
  "Cliente rechazó el pedido",
  "Problema con el cobro en efectivo",
  "Accidente / problema de vehículo",
  "Otro motivo"
];

export default function DriverIssueModal({
  visible,
  stop,
  loading,
  onClose,
  onSubmit
}) {
  const [selectedReason, setSelectedReason] = useState(ISSUE_REASONS[0]);
  const [notes, setNotes] = useState("");

  if (!visible) return null;

  const handleSubmit = () => {
    onSubmit({
      issue_reason: selectedReason,
      notes: notes.trim()
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheetContainer}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Reportar Incidencia</Text>
              <Text style={styles.subtitle}>
                Parada #{stop?.sequence} · Folio F{String(stop?.folio || "").padStart(3, "0")}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.sectionLabel}>Motivo de la Incidencia</Text>
            <View style={styles.reasonsList}>
              {ISSUE_REASONS.map((r, idx) => {
                const isSel = selectedReason === r;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.reasonItem, isSel && styles.reasonItemSelected]}
                    onPress={() => setSelectedReason(r)}
                  >
                    <Ionicons
                      name={isSel ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={isSel ? colors.danger : colors.muted}
                    />
                    <Text
                      style={[
                        styles.reasonText,
                        isSel && styles.reasonTextSelected
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Detalles Adicionales</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Describe lo sucedido brevemente..."
              placeholderTextColor={colors.textSubtle}
              value={notes}
              onChangeText={setNotes}
              multiline={true}
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.6 }]}
              disabled={loading}
              onPress={handleSubmit}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="warning" size={18} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Enviar Reporte a Administración</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(25, 23, 21, 0.65)",
    justifyContent: "flex-end"
  },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24
  },
  header: {
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
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text
  },
  subtitle: {
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
  content: {
    padding: 20,
    gap: 12
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted
  },
  reasonsList: {
    gap: 8
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 10
  },
  reasonItemSelected: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder
  },
  reasonText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600"
  },
  reasonTextSelected: {
    color: colors.danger,
    fontWeight: "800"
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 13,
    color: colors.text,
    minHeight: 70,
    textAlignVertical: "top"
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.danger,
    height: 50,
    borderRadius: 16,
    marginTop: 8
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  }
});
