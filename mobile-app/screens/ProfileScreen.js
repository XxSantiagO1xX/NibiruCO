import { SafeAreaView } from 'react-native-safe-area-context';
import { useContext } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppContext } from "../context/AppContext";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import Header from "../components/Header";

export default function ProfileScreen({ navigation }) {
  const { user, token, logout } = useContext(AppContext);

  const handleLogout = () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Estás seguro de que deseas salir de tu cuenta?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar Sesión",
          style: "destructive",
          onPress: async () => {
            await logout();
            navigation.replace("Login");
          }
        }
      ]
    );
  };

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Mi Perfil" showBrandMark={false} />
        <View style={styles.notLoggedContainer}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person-outline" size={40} color={colors.muted} />
          </View>
          <Text style={styles.notLoggedTitle}>Inicia sesión en MealOps</Text>
          <Text style={styles.notLoggedDesc}>
            Accede a tu cuenta para guardar direcciones, ver historial de pedidos y recibir promociones.
          </Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.loginBtnText}>Iniciar Sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const roleText =
    user.role === "admin"
      ? "Administrador MealOps"
      : user.role === "repartidor"
      ? "Repartidor / Despacho Móvil"
      : user.role === "cocina"
      ? "Cocina / Chef KDS"
      : user.role === "mesero"
      ? "Mesero / Servicio en Sala"
      : "Cliente MealOps";

  const avatarUrl = user.avatar_url
    ? (user.avatar_url.startsWith("http") ? user.avatar_url : `${API_URL}${user.avatar_url}`)
    : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header title="Mi Cuenta" subtitle="Perfil y Ajustes" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>
                {(user.name || "U")[0].toUpperCase()}
              </Text>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name || "Usuario"}</Text>
            <Text style={styles.userPhone}>{user.phone}</Text>
            {user.short_code ? (
              <Text style={styles.userCode}>ID: {user.short_code}</Text>
            ) : null}
            {user.email ? (
              <Text style={styles.userEmail}>{user.email}</Text>
            ) : null}

            <View style={styles.roleBadge}>
              <View style={styles.roleDot} />
              <Text style={styles.roleText}>{roleText}</Text>
            </View>
          </View>
        </View>

        {/* Menu Options Section */}
        <Text style={styles.sectionTitle}>Opciones Operativas y de Cuenta</Text>
        <View style={styles.menuCard}>
          {user.role === "repartidor" && (
            <>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => navigation.navigate("Reparto")}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="bicycle-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>Mi Ruta de Reparto</Text>
                  <Text style={styles.menuSubtitle}>Ver viajes, paradas y ofertas activas</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => navigation.navigate("Corte")}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconCircle, { backgroundColor: colors.successSoft }]}>
                  <Ionicons name="cash-outline" size={18} color={colors.success} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>Corte de Turno</Text>
                  <Text style={styles.menuSubtitle}>Control de efectivo y liquidaciones</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </TouchableOpacity>
              <View style={styles.menuDivider} />
            </>
          )}

          {user.role === "admin" && (
            <>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => navigation.navigate("AdminDeliveryDispatch")}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>Control de Despacho</Text>
                  <Text style={styles.menuSubtitle}>Monitoreo de pedidos y repartidores</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </TouchableOpacity>
              <View style={styles.menuDivider} />
            </>
          )}

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate("Addresses")}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="location-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuTitle}>Direcciones de Entrega</Text>
              <Text style={styles.menuSubtitle}>Gestiona tus lugares de entrega</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate("Pedidos")}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconCircle, { backgroundColor: colors.infoSoft }]}>
              <Ionicons name="receipt-outline" size={18} color={colors.info} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuTitle}>Historial de Pedidos</Text>
              <Text style={styles.menuSubtitle}>Revisa tus compras anteriores</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        </View>

        {/* Service & System Info Section */}
        <Text style={styles.sectionTitle}>Sistema MealOps</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Versión de App</Text>
            <Text style={styles.infoValue}>v1.0.0 (SDK 57)</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Servidor Backend</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {API_URL}
            </Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Identificador</Text>
            <Text style={styles.infoValue}>ID #{user.id}</Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  notLoggedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  notLoggedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3
  },
  notLoggedDesc: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 280
  },
  loginBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 14
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
    overflow: "hidden"
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900"
  },
  userInfo: {
    flex: 1
  },
  userName: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.4
  },
  userPhone: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2
  },
  userCode: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 1
  },
  userEmail: {
    fontSize: 11,
    color: colors.textSubtle,
    marginTop: 1
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginTop: 6
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.text
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4
  },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 20,
    overflow: "hidden"
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12
  },
  menuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  menuTextCol: {
    flex: 1
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text
  },
  menuSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 64
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 24
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  infoLabel: {
    fontSize: 13,
    color: colors.muted
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    maxWidth: 200
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 10
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    height: 48,
    borderRadius: 16
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.danger
  }
});