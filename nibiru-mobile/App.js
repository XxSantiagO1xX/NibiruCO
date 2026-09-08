import "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import AppProvider from "./context/AppContext";
import colors from "./theme/colors";

/* SCREENS */
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

/* TABS PRINCIPALES */
function Tabs() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    loadRole();
  }, []);

  const loadRole = async () => {
    try {
      const savedRole = await AsyncStorage.getItem("role");
      setRole(savedRole);
    } catch (e) {
      console.log("Error reading role:", e);
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: {
          height: 65,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb"
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600"
        },
        tabBarIcon: ({ color, size }) => {
          let iconName = "restaurant";

          if (route.name === "Productos") iconName = "restaurant";
          if (route.name === "Carrito") iconName = "cart";
          if (route.name === "Pedidos") iconName = "receipt";
          if (route.name === "Cocina") iconName = "flame";
          if (route.name === "Perfil") iconName = "person";

          return <Ionicons name={iconName} size={size || 22} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Productos" component={ProductsScreen} />
      <Tab.Screen name="Carrito" component={CartScreen} />
      <Tab.Screen name="Pedidos" component={OrdersScreen} />

      {(role === "admin" || role === "cocina") && (
        <Tab.Screen name="Cocina" component={AdminOrdersScreen} />
      )}

      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

/* APLICACIÓN PRINCIPAL */
export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          <Stack.Screen name="Addresses" component={AddressesScreen} />
          <Stack.Screen name="Tabs" component={Tabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}