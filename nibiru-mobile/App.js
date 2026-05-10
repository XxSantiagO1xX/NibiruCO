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
  useEffect,
  useState
} from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";

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

/* NAVIGATORS */
const Tab = createBottomTabNavigator();

const Stack = createStackNavigator();

/* TABS */
function Tabs() {


  const [role, setRole] = useState(null);

useEffect(() => {

  loadRole();

}, []);

const loadRole = async () => {

  const savedRole =
    await AsyncStorage.getItem("role");

  setRole(savedRole);
};

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

          /* PRODUCTOS */
          if (route.name === "Productos") {
            iconName = "restaurant";
          }

          /* CARRITO */
          if (route.name === "Carrito") {
            iconName = "cart";
          }

          /* PEDIDOS */
          if (route.name === "Pedidos") {
            iconName = "receipt";
          }

          /* COCINA */
          if (route.name === "Cocina") {
            iconName = "fast-food";
          }

          /* PERFIL */
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

      {/* PRODUCTOS */}
      <Tab.Screen
        name="Productos"
        component={ProductsScreen}
      />

      {/* CARRITO */}
      <Tab.Screen
        name="Carrito"
        component={CartScreen}
      />

      {/* PEDIDOS */}
      <Tab.Screen
        name="Pedidos"
        component={OrdersScreen}
      />

      {/* COCINA */}
      {
  role === "admin" && (

    <Tab.Screen
      name="Cocina"
      component={AdminOrdersScreen}
    />

  )
}

      {/* PERFIL */}
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

          {/* LOGIN */}
          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />

          <Stack.Screen
  name="ForgotPassword"
  component={ForgotPasswordScreen}
/>

<Stack.Screen
  name="ResetPassword"
  component={ResetPasswordScreen}
/>

          {/* REGISTRO */}
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
          />

          {/* APP */}
          <Stack.Screen
            name="Tabs"
            component={Tabs}
          />

        </Stack.Navigator>

      </NavigationContainer>

    </AppProvider>
  );
}