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

export default function ForgotPasswordScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!phone.trim()) {
      Alert.alert("Campo requerido", "Ingresa tu número de teléfono.");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/auth/forgot-password", {
        phone: phone.trim()
      });

      // Si el backend devolvió el código en desarrollo, se informa al usuario
      const codeMsg = res.data.code
        ? `Código temporal de desarrollo: ${res.data.code}`
        : "Revisa tu mensaje con el código de 6 dígitos.";

      Alert.alert("Código enviado", codeMsg, [
        {
          text: "Continuar",
          onPress: () => navigation.navigate("ResetPassword", { phone: phone.trim() })
        }
      ]);

    } catch (err) {
      console.log("FORGOT ERROR:", err?.response?.data || err.message);
      const msg = err?.response?.data?.message || "No se pudo generar el código de recuperación.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Recuperar Contraseña</Text>
      <Text style={styles.subtitle}>Ingresa tu número de teléfono registrado para recibir tu código de seguridad.</Text>

      <TextInput
        placeholder="Teléfono"
        placeholderTextColor="#9ca3af"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={sendCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Enviar Código</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.linkContainer}
      >
        <Text style={styles.link}>← Volver al inicio de sesión</Text>
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
    fontSize: 15,
    marginBottom: 24,
    lineHeight: 22
  },
  input: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 14,
    alignItems: "center"
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
    color: colors.primary,
    fontWeight: "600",
    fontSize: 15
  }
});