import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!name || !phone || !password || !confirm) {
      Alert.alert("Faltan datos", "Completa nombre, teléfono y contraseña.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Revisa la contraseña", "Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/register-phone`, {
        name,
        phone,
        email: email.trim() || null,
        password,
        allowPush: true
      });
      Alert.alert("Cuenta creada", "Ya puedes iniciar sesión y pedir desde MealOps.", [
        { text: "Continuar", onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      console.log(err?.response?.data || err.message);
      Alert.alert("No se pudo crear la cuenta", err?.response?.data?.message || "Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={19} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Cuenta de cliente</Text>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>Regístrate para consultar el menú, hacer pedidos y darles seguimiento.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput placeholder="Nombre completo" placeholderTextColor="#AAA49D" style={styles.input} value={name} onChangeText={setName} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Teléfono</Text>
          <TextInput placeholder="442 123 4567" placeholderTextColor="#AAA49D" style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Correo opcional</Text>
          <TextInput placeholder="nombre@correo.com" placeholderTextColor="#AAA49D" style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Contraseña</Text>
          <TextInput placeholder="••••••••" placeholderTextColor="#AAA49D" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Confirmar contraseña</Text>
          <TextInput placeholder="••••••••" placeholderTextColor="#AAA49D" style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry />
        </View>

        <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={register} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Creando…" : "Crear cuenta"}</Text>
          {!loading && <Ionicons name="arrow-forward" size={18} color="#FFF" />}
        </TouchableOpacity>
      </View>

      <Text style={styles.note}>Las cuentas creadas desde aquí son para la experiencia de cliente. Los accesos internos dependen del rol asignado en MealOps.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 22, paddingTop: 28, backgroundColor: colors.background },
  back: { width: 42, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { marginTop: 26, marginBottom: 22 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  title: { marginTop: 5, color: colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -1 },
  subtitle: { marginTop: 7, color: colors.muted, fontSize: 12, lineHeight: 18 },
  card: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, shadowColor: "#191714", shadowOpacity: .05, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  field: { marginBottom: 13 },
  label: { marginBottom: 6, color: colors.text, fontSize: 10, fontWeight: "700" },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surfaceMuted, color: colors.text, fontSize: 13 },
  button: { minHeight: 54, marginTop: 6, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary },
  buttonText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: .55 },
  note: { marginTop: 16, paddingHorizontal: 8, color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" }
});
