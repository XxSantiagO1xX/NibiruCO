import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

const roleLabel = {
  admin: "Administrador",
  cocina: "Cocina",
  mesero: "Mesero",
  cliente: "Cliente"
};

export default function ProfileScreen({ navigation }) {
  const [role, setRole] = useState("cliente");

  useEffect(() => {
    AsyncStorage.getItem("role")
      .then((value) => setRole(value || "cliente"))
      .catch(() => setRole("cliente"));
  }, []);

  const logout = async () => {
    await AsyncStorage.multiRemove(["token", "role", "user"]);
    navigation.replace("Login");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person-outline" size={26} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Cuenta MealOps</Text>
          <Text style={styles.title}>Mi perfil</Text>
          <Text style={styles.subtitle}>{roleLabel[role] || "Usuario"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardIcon}>
          <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Tu acceso está conectado a MealOps</Text>
          <Text style={styles.cardText}>
            El menú, tus pedidos y sus estados se sincronizan con la misma operación que utiliza cocina y mostrador.
          </Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <View>
          <Text style={styles.infoLabel}>Tipo de acceso</Text>
          <Text style={styles.infoValue}>{roleLabel[role] || role}</Text>
        </View>
        <View style={styles.roleIcon}>
          <Ionicons
            name={role === "cocina" ? "flame-outline" : role === "admin" ? "shield-checkmark-outline" : "person-outline"}
            size={18}
            color={colors.primary}
          />
        </View>
      </View>

      {role === "cliente" && (
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate("Addresses")}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="location-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Direcciones de entrega</Text>
            <Text style={styles.actionText}>Agrega o consulta los lugares donde recibes tus pedidos.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.background },
  header: { marginTop: 8, marginBottom: 28, flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  eyebrow: { color: colors.primary, fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  title: { marginTop: 3, color: colors.text, fontSize: 27, fontWeight: "800", letterSpacing: -.8 },
  subtitle: { marginTop: 2, color: colors.muted, fontSize: 11 },
  card: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 20, flexDirection: "row", gap: 13, backgroundColor: colors.surface },
  cardIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  cardText: { marginTop: 6, color: colors.muted, fontSize: 10, lineHeight: 16 },
  infoRow: { marginTop: 12, minHeight: 70, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface },
  infoLabel: { color: colors.muted, fontSize: 9 },
  infoValue: { marginTop: 3, color: colors.text, fontSize: 13, fontWeight: "800" },
  roleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  actionRow: { marginTop: 12, minHeight: 78, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface },
  actionIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  actionTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  actionText: { marginTop: 4, color: colors.muted, fontSize: 10, lineHeight: 15 },
  logout: { marginTop: "auto", minHeight: 52, borderWidth: 1, borderColor: "#FECACA", borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FEF2F2" },
  logoutText: { color: colors.danger, fontSize: 12, fontWeight: "800" }
});
