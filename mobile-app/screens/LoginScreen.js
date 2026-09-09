import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useContext } from "react";
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
import { AppContext } from "../context/AppContext";
import colors from "../theme/colors";

export default function LoginScreen({ navigation }) {
  const { login } = useContext(AppContext);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    setErrorMsg("");
    const trimmedPhone = phone.trim();

    if (!trimmedPhone || !password) {
      setErrorMsg("Ingresa tu teléfono y contraseña");
      return;
    }

    try {
      setLoading(true);
      await login(trimmedPhone, password);
      navigation.replace("Tabs");
    } catch (err) {
      console.log("Login error:", err?.response?.data || err.message);
      const message =
        err?.response?.data?.message ||
        "Credenciales incorrectas o error de conexión";
      setErrorMsg(message);
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
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Mark & Header */}
          <View style={styles.brandContainer}>
            <View style={styles.brandIcon}>
              <Ionicons name="restaurant" size={32} color="#ffffff" />
            </View>
            <Text style={styles.brandName}>MealOps</Text>
            <Text style={styles.brandTagline}>Cocina & Menú Diario</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar Sesión</Text>
            <Text style={styles.cardSubtitle}>
              Ingresa con tu número de teléfono registrado
            </Text>

            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Phone input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Teléfono</Text>
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
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Password input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Contraseña</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  placeholder="Tu contraseña"
                  placeholderTextColor={colors.textSubtle}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
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

            {/* Forgot password */}
            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => navigation.navigate("ForgotPassword")}
            >
              <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Entrar a MealOps</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer: Register navigation */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("Register")}
              style={styles.registerLink}
            >
              <Text style={styles.registerLinkText}>Crear cuenta nueva</Text>
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
    justifyContent: "center",
    padding: 20
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 26
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 12
  },
  brandName: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.8
  },
  brandTagline: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 18
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
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
    marginBottom: 14
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
  eyeButton: {
    padding: 6
  },
  forgotBtn: {
    alignSelf: "flex-end",
    marginTop: 2,
    marginBottom: 18
  },
  forgotText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary
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
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
    gap: 6
  },
  footerText: {
    fontSize: 13,
    color: colors.muted
  },
  registerLink: {
    paddingVertical: 4
  },
  registerLinkText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary
  }
});