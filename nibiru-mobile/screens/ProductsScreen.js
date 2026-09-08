import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator
} from "react-native";

import {
  useEffect,
  useState,
  useContext
} from "react";

import axios from "axios";

import ProductCard from "../components/ProductCard";
import {
  SafeAreaView
} from "react-native-safe-area-context";

import { AppContext } from "../context/AppContext";

import colors from "../theme/colors";

const API = "http://192.168.1.78:3000";

export default function ProductsScreen() {

  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);

  const { addToCart } = useContext(AppContext);

  const loadProducts = async () => {

    try {

      const res = await axios.get(
        `${API}/products`
      );

      setProducts(res.data);

    } catch (err) {

      console.log(
        "ERROR PRODUCTS:",
        err?.response?.data || err.message
      );

    } finally {

      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  if (loading) {

    return (

      <SafeAreaView style={styles.center}>

        <ActivityIndicator
          size="large"
          color={colors.primary}
        />

      </SafeAreaView>
    );
  }

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        Menú del día
      </Text>

      <FlatList
        data={products}
        keyExtractor={(item) =>
          item.id.toString()
        }
        renderItem={({ item }) => (

          <ProductCard
            product={item}
            onAdd={() => addToCart(item)}
          />
        )}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20,
    color: colors.text
  }
});