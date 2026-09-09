import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../theme/colors";

export default function DriverVerifyPinModal({
  visible,
  stop,
  loading,
  error,
  onClose,
  onVerify
}) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (visible) {
      setPin("");
    }
  }, [visible]);

  if (!visible) return null;

  const handleVerify = () => {
    if (pin.trim().length === 4) {
      Keyboard.dismiss();
      onVerify(pin.trim());
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardView}
          >
            <SafeAreaView style={styles.sheetContainer}>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Validar Entrega con PIN</Text>
                  <Text style={styles.subtitle}>
                    Parada #{stop?.sequence} · Folio F{String(stop?.folio || "").padStart(3, "0")}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.content}
              >
                <Text style={styles.instruction}>
                  Solicita el PIN de 4 dígitos que aparece en la pantalla del cliente para confirmar la entrega.
                </Text>

                <View style={styles.pinContainer}>
                  <TextInput
                    style={styles.pinInput}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={4}
                    value={pin}
                    onChangeText={(val) => {
                      const clean = val.replace(/[^0-9]/g, "");
                      setPin(clean);
                      if (clean.length === 4) {
                        Keyboard.dismiss();
                      }
                    }}
                    placeholder="••••"
                    placeholderTextColor={colors.textSubtle}
                    autoFocus={true}
                    textAlign="center"
                    onSubmitEditing={handleVerify}
                  />
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    (pin.length !== 4 || loading) && styles.confirmBtnDisabled
                  ]}
                  disabled={pin.length !== 4 || loading}
                  onPress={handleVerify}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                      <Text style={styles.confirmBtnText}>Confirmar Entrega</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(25, 23, 21, 0.65)",
    justifyContent: "flex-end"
  },
  keyboardView: {
    width: "100%",
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
    gap: 16
  },
  instruction: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18
  },
  pinContainer: {
    alignItems: "center",
    marginVertical: 10
  },
  pinInput: {
    backgroundColor: colors.surface,
    width: "70%",
    height: 64,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 10
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 16
  },
  confirmBtnDisabled: {
    opacity: 0.5
  },
  confirmBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  }
});
