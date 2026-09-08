import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert
} from "react-native";

import { useContext } from "react";

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
        "Carrito vacío",
        "Agrega productos primero"
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
          type: "local"
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log("PEDIDO:", res.data);

      clearCart();

      Alert.alert(
        "Pedido creado",
        "Tu pedido fue enviado correctamente"
      );

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

      Alert.alert(
        "Error",
        "No se pudo crear el pedido"
      );
    }
  };

  /* CARD */
  const renderItem = ({ item }) => (

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
          removeFromCart(item.product_id)
        }
      >

        <Text style={{
          color: "#fff",
          fontSize: 18
        }}>
          -
        </Text>

      </TouchableOpacity>

    </View>
  );

  return (
    <View style={styles.container}>

      <Text style={styles.title}>
        Carrito
      </Text>

      <FlatList
        data={cart}
        renderItem={renderItem}
        keyExtractor={(item) =>
          item.product_id.toString()
        }
      />

      <View style={styles.footer}>

        <Text style={styles.total}>
          Total: ${total}
        </Text>

        <TouchableOpacity
          style={styles.orderButton}
          onPress={createOrder}
        >

          <Text style={styles.orderText}>
            Crear Pedido
          </Text>

        </TouchableOpacity>

        <TouchableOpacity
          style={styles.clear}
          onPress={clearCart}
        >

          <Text style={styles.clearText}>
            Vaciar carrito
          </Text>

        </TouchableOpacity>

      </View>

    </View>
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
    marginBottom: 14,

    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,

    elevation: 3
  },

  name: {
    fontSize: 18,
    fontWeight: "600",
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
    marginTop: 12,
    backgroundColor: "#EF4444",
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center"
  },

  footer: {
    marginTop: 20
  },

  total: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 20,
    color: colors.text
  },

  orderButton: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center"
  },

  orderText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },

  clear: {
    marginTop: 12,
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: 16,
    alignItems: "center"
  },

  clearText: {
    color: "#fff",
    fontWeight: "600"
  }
});