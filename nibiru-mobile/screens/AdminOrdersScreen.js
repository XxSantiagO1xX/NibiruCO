import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from "react-native";

import {
  useEffect,
  useState
} from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  SafeAreaView
} from "react-native-safe-area-context";

import axios from "axios";

import { io } from "socket.io-client";

import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

const socket = io(API);

export default function AdminOrdersScreen() {

  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);

  /* CARGAR PEDIDOS */

  const loadOrders = async () => {

    try {

      const token = await AsyncStorage.getItem(
  "token"
);

const res = await axios.get(
  `${API}/orders/admin/all`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
);

      setOrders(res.data);

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

    } finally {

      setLoading(false);
    }
  };

  /* SOCKET */

  useEffect(() => {

    loadOrders();

    socket.on("new-order", () => {
      loadOrders();
    });

    socket.on("order-updated", () => {
      loadOrders();
    });

    return () => {

      socket.off("new-order");

      socket.off("order-updated");
    };

  }, []);

  /* ACTUALIZAR STATUS */

  const updateStatus = async (
    id,
    status
  ) => {

    try {

      await axios.patch(
        `${API}/orders/${id}/status`,
        { status }
      );

      loadOrders();

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );
    }
  };

  /* LOADING */

  if (loading) {

    return (

      <View style={styles.center}>

        <ActivityIndicator
          size="large"
          color={colors.primary}
        />

      </View>
    );
  }

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        Cocina
      </Text>

      <FlatList
        data={orders}
        keyExtractor={(item) =>
          item.id.toString()
        }
        renderItem={({ item }) => (

          <View style={styles.card}>

            <Text style={styles.orderId}>
              Pedido #{item.id}
            </Text>

            <Text style={styles.text}>
              Tipo: {item.type}
            </Text>

            <Text style={styles.text}>
              Pago:
              {" "}
              {
                item.payment_method === "card"
                  ? "Tarjeta"
                  : "Efectivo"
              }
            </Text>

            <Text style={styles.text}>
              Estado: {item.status}
            </Text>

            <Text style={styles.total}>
              ${item.total}
            </Text>

            <View style={styles.buttons}>

              <TouchableOpacity
                style={styles.button}
                onPress={() =>
                  updateStatus(
                    item.id,
                    "aceptado"
                  )
                }
              >

                <Text style={styles.buttonText}>
                  Aceptar
                </Text>

              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={() =>
                  updateStatus(
                    item.id,
                    "preparando"
                  )
                }
              >

                <Text style={styles.buttonText}>
                  Preparando
                </Text>

              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={() =>
                  updateStatus(
                    item.id,
                    "listo"
                  )
                }
              >

                <Text style={styles.buttonText}>
                  Listo
                </Text>

              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deliverButton}
                onPress={() =>
                  updateStatus(
                    item.id,
                    "entregado"
                  )
                }
              >

                <Text style={styles.buttonText}>
                  Entregado
                </Text>

              </TouchableOpacity>

            </View>

          </View>
        )}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 20,
    color: colors.text
  },

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 20,
    marginBottom: 16
  },

  orderId: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    color: colors.text
  },

  text: {
    marginBottom: 8,
    color: colors.text
  },

  total: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary
  },

  buttons: {
    marginTop: 16
  },

  button: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center"
  },

  deliverButton: {
    backgroundColor: "#22C55E",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center"
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700"
  }
});