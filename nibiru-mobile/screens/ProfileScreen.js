import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState({ name: "Usuario", phone: "", role: "cliente" });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userStr = await AsyncStorage.getItem("user");
      if (userStr) {
        setUser(JSON.parse(userStr));
      }
    } catch (e) {
      console.log("Error loading user profile:", e);
    }
  };

  const logout = async () => {
    Alert.alert(
      "Cerrar sesión",
      "¿Deseas salir de tu cuenta?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Salir",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.multiRemove(["token", "role", "user"]);
            navigation.replace("Login");
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER DE USUARIO */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={38} color={colors.primary} />
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.name}>{user.name || "Comensal"}</Text>
          <Text style={styles.subtitle}>Tel: {user.phone || "Sin teléfono"}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>Rol: {user.role || "cliente"}</Text>
          </View>
        </View>
      </View>

      {/* OPCIONES DEL MENÚ */}
      <View style={styles.menu}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate("Addresses")}
        >
          <Ionicons name="location-outline" size={24} color={colors.text} />
          <Text style={styles.menuText}>Mis Direcciones de Entrega</Text>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => Alert.alert("MealOps", "Versión 1.0.0 - Plataforma gastronómica")}
        >
          <Ionicons name="information-circle-outline" size={24} color={colors.text} />
          <Text style={styles.menuText}>Acerca de MealOps</Text>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" style={{ marginLeft: "auto" }} />
        </TouchableOpacity>
      </View>

      {/* BOTÓN DE CIERRE DE SESIÓN */}
      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 28,
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#fff7ed",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16
  },
  userInfo: {
    flex: 1
  },
  name: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text
  },
  subtitle: {
    marginTop: 2,
    color: "#6b7280",
    fontSize: 14
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ffedd5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6
  },
  roleText: {
    color: "#c2410c",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  menu: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6"
  },
  menuText: {
    marginLeft: 14,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text
  },
  logout: {
    marginTop: "auto",
    backgroundColor: "#ef4444",
    padding: 18,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center"
  },
  logoutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});