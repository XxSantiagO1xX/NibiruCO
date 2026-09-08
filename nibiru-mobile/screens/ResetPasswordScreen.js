import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../services/api";
import colors from "../theme/colors";

export default function ResetPasswordScreen({ route, navigation }) {
  const { phone } = route.params || {};

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const resetPassword = async () => {
    if (!code.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert("Campos requeridos", "Por favor completa todos los campos.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Las contraseñas no coinciden.");
      return;
    }

    try {
      setLoading(true);

      await api.post("/auth/reset-password", {
        phone,
        code: code.trim(),
        newPassword: newPassword.trim()
      });

      Alert.alert(
        "¡Contraseña actualizada!",
        "Tu contraseña ha sido restablecida exitosamente. Inicia sesión con tus nuevas credenciales.",
        [{ text: "Entrar", onPress: () => navigation.navigate("Login") }]
      );

    } catch (err) {
      console.log("RESET ERROR:", err?.response?.data || err.message);
      const msg = err?.response?.data?.message || "El código es inválido o ha expirado.";
      Alert.alert("Error de validación", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Nueva Contraseña</Text>
      <Text style={styles.subtitle}>
        Ingresa el código de 6 dígitos enviado al teléfono {phone} y define tu nueva contraseña.
      </Text>

      <TextInput
        placeholder="Código de 6 dígitos"
        placeholderTextColor="#9ca3af"
        value={code}
        onChangeText={setCode}
        keyboardType="numeric"
        maxLength={6}
        style={styles.input}
      />

      <TextInput
        placeholder="Nueva contraseña"
        placeholderTextColor="#9ca3af"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        style={styles.input}
      />

      <TextInput
        placeholder="Confirmar nueva contraseña"
        placeholderTextColor="#9ca3af"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={resetPassword}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Actualizar Contraseña</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate("Login")}
        style={styles.linkContainer}
      >
        <Text style={styles.link}>Cancelar y volver al login</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: "center"
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20
  },
  input: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },
  linkContainer: {
    marginTop: 20,
    alignItems: "center"
  },
  link: {
    color: "#6b7280",
    fontSize: 15
  }
});