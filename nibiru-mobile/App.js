import "react-native-gesture-handler";

import { NavigationContainer } from "@react-navigation/native";

import {
  createBottomTabNavigator
} from "@react-navigation/bottom-tabs";

import {
  createStackNavigator
} from "@react-navigation/stack";

import { Ionicons } from "@expo/vector-icons";

import AppProvider from "./context/AppContext";

import colors from "./theme/colors";
import {
  SafeAreaView
} from "react-native-safe-area-context";

/* SCREENS */
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";

import ProductsScreen from "./screens/ProductsScreen";
import CartScreen from "./screens/CartScreen";
import OrdersScreen from "./screens/OrdersScreen";
import ProfileScreen from "./screens/ProfileScreen";

const Tab = createBottomTabNavigator();

const Stack = createStackNavigator();

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
          paddingTop: 5
        },

        tabBarIcon: ({
          color,
          size
        }) => {

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