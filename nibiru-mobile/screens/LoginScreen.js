import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!phone || !password) {
      Alert.alert("Faltan datos", "Completa teléfono y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/login-phone`, { phone, password });
      if (!res.data.token) {
        Alert.alert("Error", "No se recibió una sesión válida.");
        return;
      }

      await AsyncStorage.multiSet([
        ["token", res.data.token],
        ["role", res.data.user?.role || "cliente"]
      ]);

      navigation.replace("Tabs");
    } catch (err) {
      console.log(err?.response?.data || err.message);
      Alert.alert("No pudimos entrar", err?.response?.data?.message || "Revisa tus datos e inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.mark}><Text style={styles.markText}>M</Text></View>
        <Text style={styles.brand}>MealOps</Text>
        <Text style={styles.title}>Tu comida, sin complicaciones.</Text>
        <Text style={styles.subtitle}>Consulta el menú del día, realiza pedidos y sigue su preparación desde un solo lugar.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            placeholder="442 123 4567"
            placeholderTextColor="#AAA49D"
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            placeholder="••••••••"
            placeholderTextColor="#AAA49D"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={login} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Entrando…" : "Entrar"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword")}> 
          <Text style={styles.secondaryLink}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.register} onPress={() => navigation.navigate("Register")}>
        <Text style={styles.registerMuted}>¿Primera vez en MealOps? </Text>
        <Text style={styles.registerLink}>Crear cuenta</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    backgroundColor: colors.background
  },
  hero: {
    marginBottom: 26
  },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    marginBottom: 14,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  markText: {
    color: "#FFF",
    fontSize: 25,
    fontWeight: "900"
  },
  brand: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.2
  },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 20,
    shadowColor: "#191714",
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5
  },
  field: {
    marginBottom: 14
  },
  label: {
    marginBottom: 7,
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: 15
  },
  button: {
    minHeight: 54,
    marginTop: 4,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 15
  },
  secondaryLink: {
    marginTop: 17,
    textAlign: "center",
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12
  },
  register: {
    marginTop: 22,
    flexDirection: "row",
    alignSelf: "center"
  },
  registerMuted: {
    color: colors.muted,
    fontSize: 12
  },
  registerLink: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800"
  }
});
