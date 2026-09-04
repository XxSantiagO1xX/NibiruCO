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
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

export default function ForgotPasswordScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!phone.trim()) {
      Alert.alert("Falta tu teléfono", "Ingresa el número asociado a tu cuenta.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API}/auth/forgot-password`, { phone: phone.trim() });
      const code = res.data?.code;

      if (code) {
        Alert.alert("Código temporal", `Usa ${code} para continuar con la recuperación.`);
      } else {
        Alert.alert("Solicitud recibida", "Continúa con el código de recuperación que recibiste.");
      }

      navigation.navigate("ResetPassword", { phone: phone.trim() });
    } catch (err) {
      console.log(err?.response?.data || err.message);
      Alert.alert("No se pudo continuar", err?.response?.data?.message || "Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={19} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.hero}>
        <View style={styles.icon}>
          <Ionicons name="key-outline" size={24} color={colors.primary} />
        </View>
        <Text style={styles.eyebrow}>Cuenta MealOps</Text>
        <Text style={styles.title}>Recupera tu acceso.</Text>
        <Text style={styles.subtitle}>Ingresa el teléfono con el que creaste tu cuenta para generar un código temporal.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Teléfono</Text>
        <TextInput
          placeholder="442 123 4567"
          placeholderTextColor="#AAA49D"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          style={styles.input}
        />

        <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={sendCode} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Generando…" : "Continuar"}</Text>
          {!loading && <Ionicons name="arrow-forward" size={18} color="#FFF" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 22, backgroundColor: colors.background },
  back: { position: "absolute", top: 58, left: 22, width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  hero: { marginBottom: 24 },
  icon: { width: 52, height: 52, marginBottom: 15, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1 },
  title: { marginTop: 7, color: colors.text, fontSize: 33, lineHeight: 37, fontWeight: "800", letterSpacing: -1.1 },
  subtitle: { marginTop: 10, maxWidth: 340, color: colors.muted, fontSize: 13, lineHeight: 20 },
  card: { padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 23, backgroundColor: colors.surface, shadowColor: "#191714", shadowOpacity: .05, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  label: { marginBottom: 7, color: colors.text, fontSize: 11, fontWeight: "800" },
  input: { minHeight: 52, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 15, color: colors.text, backgroundColor: colors.surfaceMuted },
  button: { minHeight: 53, marginTop: 15, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary },
  disabled: { opacity: .55 },
  buttonText: { color: "#FFF", fontSize: 13, fontWeight: "800" }
});
