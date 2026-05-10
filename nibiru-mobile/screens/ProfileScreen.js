import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet
} from "react-native";

import {
  SafeAreaView
} from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  Ionicons
} from "@expo/vector-icons";

import colors from "../theme/colors";

export default function ProfileScreen({
  navigation
}) {

  const logout = async () => {

    await AsyncStorage.removeItem(
      "token"
    );

    navigation.replace("Login");
  };

  return (

    <SafeAreaView style={styles.container}>

      {/* HEADER */}

      <View style={styles.header}>

        <View style={styles.avatar}>

          <Ionicons
            name="person-outline"
            size={40}
            color={colors.primary}
          />

        </View>

        <View>

          <Text style={styles.name}>
            Ariel Santiago
          </Text>

          <Text style={styles.subtitle}>
            Bienvenido
          </Text>

        </View>

      </View>

      {/* TARJETA */}

      <View style={styles.card}>

        <Text style={styles.cardTitle}>
          Acerca de
        </Text>

        <Text style={styles.cardText}>
          NibiruCO es una plataforma para
          pedidos inteligentes de comida
          local y para llevar.
        </Text>

      </View>

      {/* OPCIONES */}

      <View style={styles.menu}>

        <TouchableOpacity style={styles.menuItem}>

          <Ionicons
            name="settings-outline"
            size={24}
            color={colors.text}
          />

          <Text style={styles.menuText}>
            Configuración
          </Text>

        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>

          <Ionicons
            name="help-circle-outline"
            size={24}
            color={colors.text}
          />

          <Text style={styles.menuText}>
            Ayuda
          </Text>

        </TouchableOpacity>

      </View>

      {/* LOGOUT */}

      <TouchableOpacity
        style={styles.logout}
        onPress={logout}
      >

        <Text style={styles.logoutText}>
          Cerrar sesión
        </Text>

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
    marginTop: 20,
    marginBottom: 30
  },

  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFF7ED",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 18
  },

  name: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text
  },

  subtitle: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 18
  },

  card: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 24,
    marginBottom: 20
  },

  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    color: colors.text
  },

  cardText: {
    color: colors.muted,
    lineHeight: 24,
    fontSize: 16
  },

  menu: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 10
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18
  },

  menuText: {
    marginLeft: 14,
    fontSize: 17,
    color: colors.text
  },

  logout: {
    marginTop: "auto",
    backgroundColor: "#EF4444",
    padding: 18,
    borderRadius: 18,
    alignItems: "center"
  },

  logoutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});