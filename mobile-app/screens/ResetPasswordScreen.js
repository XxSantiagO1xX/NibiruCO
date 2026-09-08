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
  ScrollView,
  SafeAreaView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { API_URL } from "../config/api";
import colors from "../theme/colors";

export default function ResetPasswordScreen({ route, navigation }) {
  const initialPhone = route.params?.phone || "";
  const initialCode = route.params?.initialCode || "";

  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState(initialCode);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleResetPassword = async () => {
    setErrorMsg("");
    const trimmedPhone = phone.trim();
    const trimmedCode = code.trim();

    if (!trimmedPhone || !trimmedCode || !newPassword) {
      setErrorMsg("Completa todos los campos");
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg("La contraseña debe tener al menos 4 caracteres");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${API_URL}/auth/reset-password`, {
        phone: trimmedPhone,
        code: trimmedCode,
        newPassword
      });

      Alert.alert(
        "Contraseña Actualizada",
        "Tu contraseña ha sido restablecida exitosamente. Ya puedes iniciar sesión.",
        [
          {
            text: "Ir al Login",
            onPress: () => navigation.navigate("Login")
          }
        ]
      );
    } catch (err) {
      console.log("Reset password error:", err?.response?.data || err.message);
      setErrorMsg(
        err?.response?.data?.message || "Código inválido o expirado"
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
            <Text style={styles.title}>Nueva Contraseña</Text>
            <Text style={styles.subtitle}>
              Ingresa el código que recibiste y define tu nueva contraseña.
            </Text>
          </View>

          <View style={styles.card}>
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Phone */}
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
                  placeholder="Teléfono"
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

            {/* Code */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Código de verificación</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="key-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Código de 6 dígitos"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={(val) => {
                    setCode(val);
                    setErrorMsg("");
                  }}
                />
              </View>
            </View>

            {/* New Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nueva contraseña</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  placeholder="Mínimo 4 caracteres"
                  placeholderTextColor={colors.textSubtle}
                  secureTextEntry={!showPassword}
                  value={newPassword}
                  onChangeText={(val) => {
                    setNewPassword(val);
                    setErrorMsg("");
                  }}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={colors.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm New Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirmar nueva contraseña</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Repite la contraseña"
                  placeholderTextColor={colors.textSubtle}
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={(val) => {
                    setConfirmPassword(val);
                    setErrorMsg("");
                  }}
                />
              </View>
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Restablecer Contraseña</Text>
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
    marginBottom: 20
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.6
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18
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
    marginBottom: 12
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 5
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
    height: 46,
    fontSize: 14,
    color: colors.text
  },
  eyeButton: {
    padding: 6
  },
  submitButton: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
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
