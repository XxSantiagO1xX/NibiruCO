import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity
} from "react-native";

import {
  useEffect,
  useState,
  useContext
} from "react";

import axios from "axios";

import { AppContext } from "../context/AppContext";

import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

export default function ProductsScreen() {

  const [products, setProducts] = useState([]);

  const { addToCart } = useContext(AppContext);

  const loadProducts = async () => {

  try {

    console.log("Cargando productos...");

    const res = await axios.get(
      `${API}/products`
    );

    console.log("RESPUESTA API:", res.data);

    setProducts(res.data);

  } catch (err) {

    console.log(
      "ERROR PRODUCTS:",
      err?.response?.data || err.message
    );
  }
};

  useEffect(() => {
    loadProducts();
  }, []);

  const renderItem = ({ item }) => (

    <View style={styles.card}>

      <Text style={styles.name}>
        {item.name}
      </Text>

      <Text style={styles.price}>
        ${item.price}
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => addToCart(item)}
      >

        <Text style={styles.buttonText}>
          Agregar
        </Text>

      </TouchableOpacity>

    </View>
  );

  return (
    <View style={styles.container}>

      <Text style={styles.title}>
        Menú del día
      </Text>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingBottom: 100
        }}
      />

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16
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

  price: {
    marginTop: 8,
    fontSize: 16,
    color: colors.primary
  },

  button: {
    marginTop: 15,
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 12,
    alignItems: "center"
  },

  buttonText: {
    color: "#fff",
    fontWeight: "600"
  }
});