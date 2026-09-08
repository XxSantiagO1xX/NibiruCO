import "react-native-gesture-handler";

import { NavigationContainer } from "@react-navigation/native";

import {
  createBottomTabNavigator
} from "@react-navigation/bottom-tabs";

import {
  createNativeStackNavigator
} from "@react-navigation/native-stack";

import { Ionicons } from "@expo/vector-icons";

import AppProvider from "./context/AppContext.js";

import colors from "./theme/colors.js";

/* SCREENS */
import LoginScreen from "./screens/LoginScreen.js";
import RegisterScreen from "./screens/RegisterScreen.js";

import ProductsScreen from "./screens/ProductsScreen.js";
import CartScreen from "./screens/CartScreen.js";
import OrdersScreen from "./screens/OrdersScreen.js";
import ProfileScreen from "./screens/ProfileScreen.js";

const Tab = createBottomTabNavigator();

const Stack = createNativeStackNavigator();

/* TABS */
function Tabs() {

  return (

    <Tab.Navigator
      screenOptions={({ route }) => ({

        headerShown: false,

        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "#999",

        tabBarStyle: {
          height: 65,
          paddingBottom: 8,
          paddingTop: 5,
          borderTopWidth: 1,
          borderTopColor: colors.border
        },

        tabBarIcon: ({ color, size }) => {

          let iconName;

          if (route.name === "Productos") {
            iconName = "restaurant";
          }

          if (route.name === "Carrito") {
            iconName = "cart";
          }

          if (route.name === "Pedidos") {
            iconName = "receipt";
          }

          if (route.name === "Perfil") {
            iconName = "person";
          }

          return (
            <Ionicons
              name={iconName}
              size={size}
              color={color}
            />
          );
        }
      })}
    >

      <Tab.Screen
        name="Productos"
        component={ProductsScreen}
      />

      <Tab.Screen
        name="Carrito"
        component={CartScreen}
      />

      <Tab.Screen
        name="Pedidos"
        component={OrdersScreen}
      />

      <Tab.Screen
        name="Perfil"
        component={ProfileScreen}
      />

    </Tab.Navigator>
  );
}

/* APP */
export default function App() {

  return (

    <AppProvider>

      <NavigationContainer>

        <Stack.Navigator
          screenOptions={{
            headerShown: false
          }}
        >

          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />

          <Stack.Screen
            name="Register"
            component={RegisterScreen}
          />

          <Stack.Screen
            name="Tabs"
            component={Tabs}
          />

        </Stack.Navigator>

      </NavigationContainer>

    </AppProvider>
  );
}