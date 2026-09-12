import "react-native-gesture-handler";
import { useContext } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar, Platform, View, ActivityIndicator } from "react-native";

import AppProvider, { AppContext } from "./context/AppContext";
import colors from "./theme/colors";

/* GENERAL SCREENS */
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./screens/ResetPasswordScreen";
import ProductsScreen from "./screens/ProductsScreen";
import CartScreen from "./screens/CartScreen";
import OrdersScreen from "./screens/OrdersScreen";
import ProfileScreen from "./screens/ProfileScreen";
import AddressesScreen from "./screens/AddressesScreen";
import DeliveryTrackingScreen from "./screens/DeliveryTrackingScreen";

/* WAITER SCREENS */
import WaiterTablesScreen from "./screens/waiter/WaiterTablesScreen";
import WaiterUnassignedOrdersScreen from "./screens/waiter/WaiterUnassignedOrdersScreen";
import WaiterTableDetailScreen from "./screens/waiter/WaiterTableDetailScreen";

/* DRIVER SCREENS */
import DriverTripScreen from "./screens/driver/DriverTripScreen";
import DriverShiftScreen from "./screens/driver/DriverShiftScreen";

/* ADMIN SCREENS */
import AdminDeliveryDispatchScreen from "./screens/admin/AdminDeliveryDispatchScreen";
import AdminTableAssignmentScreen from "./screens/admin/AdminTableAssignmentScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const commonTabOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarHideOnKeyboard: true,
  tabBarStyle: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 22 : 12,
    left: 14,
    right: 14,
    height: Platform.OS === "ios" ? 64 : 60,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 10 : 6,
    elevation: 10,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12
  },
  tabBarLabelStyle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: -0.1
  },
  tabBarItemStyle: {
    paddingVertical: 2
  }
};

/* 1. CLIENT TABS */
function ClientTabs() {
  const { cartCount } = useContext(AppContext);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...commonTabOptions,
        tabBarActiveTintColor: colors.primary,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = "restaurant-outline";
          if (route.name === "Productos") iconName = focused ? "restaurant" : "restaurant-outline";
          if (route.name === "Carrito") iconName = focused ? "cart" : "cart-outline";
          if (route.name === "Pedidos") iconName = focused ? "receipt" : "receipt-outline";
          if (route.name === "Perfil") iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={20} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Productos" component={ProductsScreen} options={{ tabBarLabel: "Menú" }} />
      <Tab.Screen
        name="Carrito"
        component={CartScreen}
        options={{
          tabBarLabel: "Carrito",
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: "#ffffff",
            fontSize: 10,
            fontWeight: "900"
          }
        }}
      />
      <Tab.Screen name="Pedidos" component={OrdersScreen} options={{ tabBarLabel: "Mis Pedidos" }} />
      <Tab.Screen name="Perfil" component={ProfileScreen} options={{ tabBarLabel: "Perfil" }} />
    </Tab.Navigator>
  );
}

/* 2. WAITER TABS */
function WaiterTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...commonTabOptions,
        tabBarActiveTintColor: colors.roleWaiter,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = "grid-outline";
          if (route.name === "Mesas") iconName = focused ? "grid" : "grid-outline";
          if (route.name === "Esperando") iconName = focused ? "search-circle" : "search-circle-outline";
          if (route.name === "Menu") iconName = focused ? "restaurant" : "restaurant-outline";
          if (route.name === "Perfil") iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={20} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Mesas" component={WaiterTablesScreen} options={{ tabBarLabel: "Salón / Mesas" }} />
      <Tab.Screen name="Esperando" component={WaiterUnassignedOrdersScreen} options={{ tabBarLabel: "Esperando" }} />
      <Tab.Screen name="Menu" component={ProductsScreen} options={{ tabBarLabel: "Menú del Día" }} />
      <Tab.Screen name="Perfil" component={ProfileScreen} options={{ tabBarLabel: "Mi Perfil" }} />
    </Tab.Navigator>
  );
}

/* 3. DRIVER TABS */
function DriverTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...commonTabOptions,
        tabBarActiveTintColor: colors.roleDriver,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = "bicycle-outline";
          if (route.name === "Ruta") iconName = focused ? "bicycle" : "bicycle-outline";
          if (route.name === "Corte") iconName = focused ? "cash" : "cash-outline";
          if (route.name === "Perfil") iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={20} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Ruta" component={DriverTripScreen} options={{ tabBarLabel: "Mi Ruta" }} />
      <Tab.Screen name="Corte" component={DriverShiftScreen} options={{ tabBarLabel: "Corte de Turno" }} />
      <Tab.Screen name="Perfil" component={ProfileScreen} options={{ tabBarLabel: "Mi Perfil" }} />
    </Tab.Navigator>
  );
}

/* 4. ADMIN TABS */
function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...commonTabOptions,
        tabBarActiveTintColor: colors.roleAdmin,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = "speedometer-outline";
          if (route.name === "Salon") iconName = focused ? "grid" : "grid-outline";
          if (route.name === "Despacho") iconName = focused ? "paper-plane" : "paper-plane-outline";
          if (route.name === "Turnos") iconName = focused ? "people" : "people-outline";
          if (route.name === "Menu") iconName = focused ? "restaurant" : "restaurant-outline";
          if (route.name === "Perfil") iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={19} color={color} />;
        },
        tabBarLabelStyle: {
          fontSize: 9.5,
          fontWeight: "700",
          letterSpacing: -0.2
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          paddingHorizontal: 0
        }
      })}
    >
      <Tab.Screen name="Salon" component={WaiterTablesScreen} options={{ tabBarLabel: "Salón" }} />
      <Tab.Screen name="Despacho" component={AdminDeliveryDispatchScreen} options={{ tabBarLabel: "Despacho" }} />
      <Tab.Screen name="Turnos" component={AdminTableAssignmentScreen} options={{ tabBarLabel: "Turnos" }} />
      <Tab.Screen name="Menu" component={ProductsScreen} options={{ tabBarLabel: "Menú" }} />
      <Tab.Screen name="Perfil" component={ProfileScreen} options={{ tabBarLabel: "Perfil" }} />
    </Tab.Navigator>
  );
}

/* ROLE ADAPTIVE ROOT TABS */
function RoleAdaptiveTabs() {
  const { user } = useContext(AppContext);
  const role = String(user?.role || "cliente").toLowerCase();

  if (role === "mesero") return <WaiterTabs />;
  if (role === "repartidor") return <DriverTabs />;
  if (role === "admin") return <AdminTabs />;
  return <ClientTabs />;
}

/* ROOT APP WITH NAVIGATION */
function RootNavigator() {
  const { token, loadingAuth } = useContext(AppContext);

  if (loadingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <Stack.Navigator
        initialRouteName={token ? "Tabs" : "Login"}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background }
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="Addresses" component={AddressesScreen} />
        <Stack.Screen name="DeliveryTracking" component={DeliveryTrackingScreen} />
        <Stack.Screen name="WaiterTableDetail" component={WaiterTableDetailScreen} />
        <Stack.Screen name="WaiterUnassignedOrders" component={WaiterUnassignedOrdersScreen} />
        <Stack.Screen name="AdminDeliveryDispatch" component={AdminDeliveryDispatchScreen} />
        <Stack.Screen name="AdminTableAssignment" component={AdminTableAssignmentScreen} />
        <Stack.Screen name="Tabs" component={RoleAdaptiveTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
}