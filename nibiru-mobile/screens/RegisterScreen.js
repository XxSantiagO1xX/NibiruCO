import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator
} from "react-native";
import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../services/api";
import colors from "../theme/colors";

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!name.trim() || !phone.trim() || !password.trim() || !confirm.trim()) {
      Alert.alert("Campos requeridos", "Por favor completa todos los campos requeridos.");
      return;
    }

    if (password !== confirm) {
      Alert.alert("Error", "Las contraseñas no coinciden.");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/auth/register-phone", {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password: password.trim()
      });

      if (res.data.token) {
        await AsyncStorage.setItem("token", res.data.token);
        if (res.data.user) {
          await AsyncStorage.setItem("role", res.data.user.role || "cliente");
          await AsyncStorage.setItem("user", JSON.stringify(res.data.user));
        }
        Alert.alert("¡Cuenta creada!", "Bienvenido a MealOps.", [
          { text: "Continuar", onPress: () => navigation.replace("Tabs") }
        ]);
      } else {
        Alert.alert("Registro exitoso", "Ahora puedes iniciar sesión.", [
          { text: "OK", onPress: () => navigation.goBack() }
        ]);
      }

    } catch (err) {
      console.log("REGISTER ERROR:", err?.response?.data || err.message);
      const msg = err?.response?.data?.message || "No se pudo completar el registro.";
      Alert.alert("Error de registro", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Crear Cuenta</Text>
      <Text style={styles.subtitle}>Únete a MealOps para pedir tu comida fácil y rápido</Text>

      <TextInput
        placeholder="Nombre completo"
        placeholderTextColor="#9ca3af"
        style={styles.input}
        value={name}
        onChangeText={setName}
      />

      <TextInput
        placeholder="Teléfono (ej. 5512345678)"
        placeholderTextColor="#9ca3af"
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <TextInput
        placeholder="Correo electrónico (opcional)"
        placeholderTextColor="#9ca3af"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
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

      <TextInput
        placeholder="Confirmar contraseña"
        placeholderTextColor="#9ca3af"
        style={styles.input}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={register}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Registrarse</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.linkContainer}
      >
        <Text style={styles.linkText}>
          ¿Ya tienes cuenta? <Text style={styles.linkBold}>Inicia sesión</Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
    color: colors.primary,
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#6b7280",
    marginBottom: 28
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
    marginTop: 8
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
  linkText: {
    color: "#6b7280",
    fontSize: 15
  },
  linkBold: {
    color: colors.primary,
    fontWeight: "700"
  }
});