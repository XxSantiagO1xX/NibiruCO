import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../services/api";
import colors from "../theme/colors";

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert("Campos requeridos", "Por favor ingresa tu teléfono y contraseña.");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/auth/login-phone", {
        phone: phone.trim(),
        password: password.trim()
      });

      if (!res.data.token) {
        Alert.alert("Error", "Respuesta de autenticación inválida");
        return;
      }

      await AsyncStorage.setItem("token", res.data.token);
      if (res.data.user) {
        await AsyncStorage.setItem("role", res.data.user.role || "cliente");
        await AsyncStorage.setItem("user", JSON.stringify(res.data.user));
      }

      navigation.replace("Tabs");

    } catch (err) {
      console.log("LOGIN ERROR:", err?.response?.data || err.message);
      const msg = err?.response?.data?.message || "Credenciales incorrectas o problema de conexión";
      Alert.alert("Error de acceso", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>MealOps</Text>
      <Text style={styles.subtitle}>Inicia sesión para ordenar tus platillos favoritos</Text>

      <TextInput
        placeholder="Teléfono"
        placeholderTextColor="#9ca3af"
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />

      <TextInput
        placeholder="Contraseña"
        placeholderTextColor="#9ca3af"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={login}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate("ForgotPassword")}
        style={styles.forgotContainer}
      >
        <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate("Register")}
        style={styles.linkContainer}
      >
        <Text style={styles.linkText}>
          ¿No tienes cuenta? <Text style={styles.linkBold}>Crear cuenta</Text>
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background
  },
  title: {
    fontSize: 38,
    fontWeight: "800",
    textAlign: "center",
    color: colors.primary,
    marginBottom: 8
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    color: "#6b7280",
    marginBottom: 32
  },
  input: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
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
  forgotContainer: {
    marginTop: 18,
    alignItems: "center"
  },
  forgot: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14
  },
  linkContainer: {
    marginTop: 24,
    alignItems: "center"
  },
  linkText: {
    color: "#6b7280",
    fontSize: 15
  },
  linkBold: {
    color: colors.primary,
    fontWeight: "700"
  }
});