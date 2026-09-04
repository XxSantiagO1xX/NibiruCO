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

export default function ResetPasswordScreen({ route, navigation }) {
  const phone = route.params?.phone || "";
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const resetPassword = async () => {
    if (!code.trim() || !newPassword.trim()) {
      Alert.alert("Faltan datos", "Ingresa el código y la nueva contraseña.");
      return;
    }

    if (newPassword.trim().length < 6) {
      Alert.alert("Contraseña muy corta", "Usa al menos 6 caracteres.");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${API}/auth/reset-password`, {
        phone,
        code: code.trim(),
        newPassword
      });

      Alert.alert("Acceso actualizado", "Ya puedes iniciar sesión con tu nueva contraseña.");
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    } catch (err) {
      console.log(err?.response?.data || err.message);
      Alert.alert("No se pudo actualizar", err?.response?.data?.message || "Revisa el código e inténtalo nuevamente.");
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
          <Ionicons name="lock-closed-outline" size={24} color={colors.primary} />
        </View>
        <Text style={styles.eyebrow}>Recuperación</Text>
        <Text style={styles.title}>Crea una nueva contraseña.</Text>
        <Text style={styles.subtitle}>Valida el código temporal y define una contraseña nueva para tu cuenta.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>Código</Text>
          <TextInput
            placeholder="000000"
            placeholderTextColor="#AAA49D"
            value={code}
            onChangeText={setCode}
            keyboardType="numeric"
            maxLength={6}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Nueva contraseña</Text>
          <TextInput
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor="#AAA49D"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            style={styles.input}
          />
        </View>

        <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={resetPassword} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Actualizando…" : "Guardar contraseña"}</Text>
          {!loading && <Ionicons name="checkmark" size={18} color="#FFF" />}
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
  title: { marginTop: 7, maxWidth: 350, color: colors.text, fontSize: 32, lineHeight: 36, fontWeight: "800", letterSpacing: -1.05 },
  subtitle: { marginTop: 10, maxWidth: 340, color: colors.muted, fontSize: 13, lineHeight: 20 },
  card: { padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 23, backgroundColor: colors.surface, shadowColor: "#191714", shadowOpacity: .05, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  field: { marginBottom: 14 },
  label: { marginBottom: 7, color: colors.text, fontSize: 11, fontWeight: "800" },
  input: { minHeight: 52, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 15, color: colors.text, backgroundColor: colors.surfaceMuted },
  button: { minHeight: 53, marginTop: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary },
  disabled: { opacity: .55 },
  buttonText: { color: "#FFF", fontSize: 13, fontWeight: "800" }
});
