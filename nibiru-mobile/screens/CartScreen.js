import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";

import {
  useContext,
  useState
} from "react";

import {
  SafeAreaView
} from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";

import axios from "axios";

import { AppContext } from "../context/AppContext";

import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

export default function CartScreen() {

  const {
    cart,
    removeFromCart,
    clearCart
  } = useContext(AppContext);

  /* TIPO DE PEDIDO */
  const [orderType, setOrderType] = useState("local");

  /* TOTAL */
  const total = cart.reduce(
    (acc, item) =>
      acc + (item.price * item.quantity),
    0
  );

  /* CREAR PEDIDO */
  const createOrder = async () => {

    if (!cart.length) {

      Alert.alert(
        "Carrito vacío"
      );

      return;
    }

    try {

      const token = await AsyncStorage.getItem(
        "token"
      );

      const items = cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity
      }));

      const res = await axios.post(
        `${API}/orders`,
        {
          items,
          type: orderType
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log(
        "PEDIDO:",
        res.data
      );

      clearCart();

      Alert.alert(
        "Pedido creado"
      );

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

      Alert.alert(
        "Error creando pedido"
      );
    }
  };

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        Carrito
      </Text>

      <FlatList
        data={cart}
        keyExtractor={(item) =>
          item.product_id.toString()
        }
        renderItem={({ item }) => (

          <View style={styles.card}>

            <Text style={styles.name}>
              {item.name}
            </Text>

            <Text style={styles.quantity}>
              x{item.quantity}
            </Text>

            <Text style={styles.price}>
              ${item.price * item.quantity}
            </Text>

            <TouchableOpacity
              style={styles.remove}
              onPress={() =>
                removeFromCart(
                  item.product_id
                )
              }
            >

              <Text style={styles.removeText}>
                Eliminar
              </Text>

            </TouchableOpacity>

          </View>
        )}
      />

      <View style={styles.footer}>

        {/* TIPOS */}

        <View style={styles.types}>

          <TouchableOpacity
            style={[
              styles.typeButton,
              orderType === "local" &&
              styles.typeActive
            ]}
            onPress={() =>
              setOrderType("local")
            }
          >

            <Text style={[
              styles.typeText,
              orderType === "local" &&
              styles.typeTextActive
            ]}>
              Local
            </Text>

          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              orderType === "pickup" &&
              styles.typeActive
            ]}
            onPress={() =>
              setOrderType("pickup")
            }
          >

            <Text style={[
              styles.typeText,
              orderType === "pickup" &&
              styles.typeTextActive
            ]}>
              Para llevar
            </Text>

          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              orderType === "delivery" &&
              styles.typeActive
            ]}
            onPress={() =>
              setOrderType("delivery")
            }
          >

            <Text style={[
              styles.typeText,
              orderType === "delivery" &&
              styles.typeTextActive
            ]}>
              Domicilio
            </Text>

          </TouchableOpacity>

        </View>

        {/* TOTAL */}

        <Text style={styles.total}>
          Total: ${total}
        </Text>

        {/* BOTÓN */}

        <TouchableOpacity
          style={styles.button}
          onPress={createOrder}
        >

          <Text style={styles.buttonText}>
            Crear pedido
          </Text>

        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20,
    color: colors.text
  },

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 18,
    marginBottom: 14
  },

  name: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text
  },

  quantity: {
    marginTop: 5,
    color: colors.muted
  },

  price: {
    marginTop: 8,
    color: colors.primary,
    fontWeight: "700"
  },

  remove: {
    marginTop: 14,
    backgroundColor: "#EF4444",
    padding: 12,
    borderRadius: 12,
    alignItems: "center"
  },

  removeText: {
    color: "#fff",
    fontWeight: "700"
  },

  footer: {
    marginTop: 10
  },

  types: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20
  },

  typeButton: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginHorizontal: 4,
    alignItems: "center"
  },

  typeActive: {
    backgroundColor: colors.primary
  },

  typeText: {
    color: colors.text,
    fontWeight: "700"
  },

  typeTextActive: {
    color: "#fff"
  },

  total: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 16,
    color: colors.text
  },

  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center"
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});