import "react-native-gesture-handler";
import { useContext } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar, Platform } from "react-native";

import AppProvider, { AppContext } from "./context/AppContext";
import colors from "./theme/colors";

/* SCREENS */
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./screens/ResetPasswordScreen";
import ProductsScreen from "./screens/ProductsScreen";
import CartScreen from "./screens/CartScreen";
import OrdersScreen from "./screens/OrdersScreen";
import ProfileScreen from "./screens/ProfileScreen";
import AddressesScreen from "./screens/AddressesScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/* BOTTOM TABS */
function Tabs() {
  const { cartCount } = useContext(AppContext);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: Platform.OS === "ios" ? 84 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 6
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700"
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Productos") {
            iconName = focused ? "restaurant" : "restaurant-outline";
          } else if (route.name === "Carrito") {
            iconName = focused ? "cart" : "cart-outline";
          } else if (route.name === "Pedidos") {
            iconName = focused ? "receipt" : "receipt-outline";
          } else if (route.name === "Perfil") {
            iconName = focused ? "person" : "person-outline";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen
        name="Productos"
        component={ProductsScreen}
        options={{ tabBarLabel: "Menú" }}
      />
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
      <Tab.Screen
        name="Pedidos"
        component={OrdersScreen}
        options={{ tabBarLabel: "Pedidos" }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfileScreen}
        options={{ tabBarLabel: "Perfil" }}
      />
    </Tab.Navigator>
  );
}

/* ROOT APP WITH NAVIGATION */
function RootNavigator() {
  const { token, loadingAuth } = useContext(AppContext);

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
        <Stack.Screen name="Tabs" component={Tabs} />
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