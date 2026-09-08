import {
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  View
} from "react-native";
import { useEffect, useState, useContext, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../services/api";
import ProductCard from "../components/ProductCard";
import { AppContext } from "../context/AppContext";
import colors from "../theme/colors";

export default function ProductsScreen() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { addToCart } = useContext(AppContext);

  const loadProducts = async () => {
    try {
      const res = await api.get("/products");
      setProducts(res.data || []);
    } catch (err) {
      console.log("ERROR PRODUCTS:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProducts();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando menú del día...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Menú del Día</Text>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay platillos disponibles en el menú de hoy.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
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
    alignItems: "center",
    backgroundColor: colors.background
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 15
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 16,
    color: colors.text
  },
  listContent: {
    paddingBottom: 20
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center"
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
    textAlign: "center"
  }
});