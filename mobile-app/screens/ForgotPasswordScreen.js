import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { API_URL } from "../config/api";
import colors from "../theme/colors";

export default function ForgotPasswordScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleRequestCode = async () => {
    setErrorMsg("");
    const trimmedPhone = phone.trim();

    if (!trimmedPhone) {
      setErrorMsg("Ingresa tu número de teléfono");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/auth/forgot-password`, {
        phone: trimmedPhone
      });

      // If backend returned code in development, show it to user for easy testing
      if (res.data?.code) {
        Alert.alert(
          "Código de Recuperación",
          `Tu código de verificación es: ${res.data.code}`,
          [
            {
              text: "Continuar",
              onPress: () =>
                navigation.navigate("ResetPassword", {
                  phone: trimmedPhone,
                  initialCode: res.data.code
                })
            }
          ]
        );
      } else {
        Alert.alert(
          "Código Enviado",
          "Si el teléfono está registrado, recibirás un código de recuperación.",
          [
            {
              text: "Continuar",
              onPress: () =>
                navigation.navigate("ResetPassword", { phone: trimmedPhone })
            }
          ]
        );
      }
    } catch (err) {
      console.log("Forgot password error:", err?.response?.data || err.message);
      setErrorMsg(
        err?.response?.data?.message || "No se pudo solicitar el código"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="key-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.title}>Recuperar Contraseña</Text>
            <Text style={styles.subtitle}>
              Ingresa el número de teléfono con el que te registraste para recibir un código de verificación.
            </Text>
          </View>

          <View style={styles.card}>
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Teléfono móvil</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="call-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Ej. 5512345678"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(val) => {
                    setPhone(val);
                    setErrorMsg("");
                  }}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleRequestCode}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Enviar Código</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  container: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 10
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 20
  },
  header: {
    alignItems: "center",
    marginBottom: 24
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.6
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
    maxWidth: 300
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.dangerBorder
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "600",
    flex: 1
  },
  inputGroup: {
    marginBottom: 18
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12
  },
  inputIcon: {
    marginRight: 8
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: colors.text
  },
  submitButton: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  }
});
