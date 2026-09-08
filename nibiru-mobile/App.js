import "react-native-gesture-handler";

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import AppProvider from "./context/AppContext";
import colors from "./theme/colors";

import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import ProductsScreen from "./screens/ProductsScreen";
import CartScreen from "./screens/CartScreen";
import OrdersScreen from "./screens/OrdersScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./screens/ResetPasswordScreen";
import AdminOrdersScreen from "./screens/AdminOrdersScreen";
import AddressesScreen from "./screens/AddressesScreen";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const iconByRoute = {
  Menú: "restaurant-outline",
  Carrito: "bag-handle-outline",
  Pedidos: "receipt-outline",
  Cocina: "flame-outline",
  Perfil: "person-circle-outline"
};

function TabShell({ role }) {
  const isAdmin = role === "admin";
  const isKitchen = role === "cocina";
  const customerExperience = !isKitchen;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          marginBottom: 2
        },
        tabBarStyle: {
          height: 72,
          paddingTop: 7,
          paddingBottom: 8,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12
        },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={focused ? iconByRoute[route.name]?.replace("-outline", "") || "ellipse" : iconByRoute[route.name] || "ellipse-outline"}
            size={focused ? size + 1 : size}
            color={color}
          />
        )
      })}
    >
      {customerExperience && (
        <>
          <Tab.Screen name="Menú" component={ProductsScreen} />
          <Tab.Screen name="Carrito" component={CartScreen} />
          <Tab.Screen name="Pedidos" component={OrdersScreen} />
        </>
      )}

      {(isAdmin || isKitchen) && (
        <Tab.Screen name="Cocina" component={AdminOrdersScreen} />
      )}

      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function Tabs() {
  const [role, setRole] = useState(undefined);

  useEffect(() => {
    AsyncStorage.getItem("role")
      .then((savedRole) => setRole(savedRole || "cliente"))
      .catch(() => setRole("cliente"));
  }, []);

  if (role === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <TabShell role={role} />;
}

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen
            name="Addresses"
            component={AddressesScreen}
            options={{
              headerShown: true,
              title: "Direcciones",
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerShadowVisible: false
            }}
          />
          <Stack.Screen name="Tabs" component={Tabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}
