import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  StatusBar
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../context/AppContext";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import Header from "../components/Header";
import ProductCard from "../components/ProductCard";
import ComboConfigModal from "../components/ComboConfigModal";
import SkeletonList from "../components/SkeletonLoader";
import EmptyState from "../components/EmptyState";

export default function ProductsScreen({ navigation }) {
  const { cart, addToCart, cartCount } = useContext(AppContext);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all"); // 'all' | 'combos' | 'regular'
  const [feedbackToast, setFeedbackToast] = useState("");

  // Combo modal state
  const [selectedCombo, setSelectedCombo] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Load menu from backend
  const loadProducts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/products`);
      if (Array.isArray(res.data)) {
        setProducts(res.data);
      }
    } catch (err) {
      console.log("Error loading products:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  // Toast feedback helper
  const showFeedback = (text) => {
    setFeedbackToast(text);
    setTimeout(() => {
      setFeedbackToast("");
    }, 2500);
  };

  // Handle add to cart click on a product card
  const handleAddProduct = (product) => {
    if (product.product_kind === "combo") {
      setSelectedCombo(product);
      setModalVisible(true);
    } else {
      addToCart(product, [], 1);
      showFeedback(`"${product.name}" agregado al carrito`);
    }
  };

  // Handle combo modal confirmation
  const handleComboConfirmed = ({ combo, choices, quantity, unitPrice }) => {
    addToCart(combo, choices, quantity);
    showFeedback(`Combo "${combo.name}" agregado (x${quantity})`);
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedFilter === "combos") {
      result = result.filter((p) => p.product_kind === "combo");
    } else if (selectedFilter === "regular") {
      result = result.filter((p) => p.product_kind !== "combo");
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(query));
    }

    return result;
  }, [products, selectedFilter, searchQuery]);

  // Map product id to in-cart count
  const cartCountsByProduct = useMemo(() => {
    const counts = {};
    cart.forEach((item) => {
      counts[item.product_id] = (counts[item.product_id] || 0) + item.quantity;
    });
    return counts;
  }, [cart]);

  // Today day name for subtitle
  const todayName = useMemo(() => {
    const days = [
      "Domingo",
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado"
    ];
    return days[new Date().getDay()];
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* App Header */}
      <Header
        title="MealOps"
        subtitle={`Menú de hoy · ${todayName}`}
        rightAction={
          <TouchableOpacity
            style={styles.cartButton}
            onPress={() => navigation.navigate("Carrito")}
            activeOpacity={0.8}
          >
            <Ionicons name="cart" size={20} color={colors.text} />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        }
      />

      {/* Floating feedback toast */}
      {feedbackToast ? (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
          <Text style={styles.toastText} numberOfLines={1}>
            {feedbackToast}
          </Text>
        </View>
      ) : null}

      {/* Search Bar & Category Tabs */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar en el menú de hoy..."
            placeholderTextColor={colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterPill,
              selectedFilter === "all" && styles.filterPillActive
            ]}
            onPress={() => setSelectedFilter("all")}
          >
            <Text
              style={[
                styles.filterText,
                selectedFilter === "all" && styles.filterTextActive
              ]}
            >
              Todos ({products.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              selectedFilter === "combos" && styles.filterPillActive
            ]}
            onPress={() => setSelectedFilter("combos")}
          >
            <Ionicons
              name="layers-outline"
              size={14}
              color={selectedFilter === "combos" ? "#ffffff" : colors.muted}
            />
            <Text
              style={[
                styles.filterText,
                selectedFilter === "combos" && styles.filterTextActive
              ]}
            >
              Combos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              selectedFilter === "regular" && styles.filterPillActive
            ]}
            onPress={() => setSelectedFilter("regular")}
          >
            <Ionicons
              name="restaurant-outline"
              size={14}
              color={selectedFilter === "regular" ? "#ffffff" : colors.muted}
            />
            <Text
              style={[
                styles.filterText,
                selectedFilter === "regular" && styles.filterTextActive
              ]}
            >
              Platillos & Extras
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Products List or Loading Skeleton */}
      {loading ? (
        <View style={styles.listContainer}>
          <SkeletonList count={4} type="product" />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="restaurant-outline"
              title={
                searchQuery
                  ? "Sin resultados"
                  : "No hay productos para hoy"
              }
              description={
                searchQuery
                  ? `No encontramos productos que coincidan con "${searchQuery}".`
                  : "El menú del día se está actualizando o no hay platillos activos para hoy."
              }
              actionLabel="Recargar Menú"
              onAction={loadProducts}
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              cartQuantity={cartCountsByProduct[item.id] || 0}
              onAdd={handleAddProduct}
              onPress={handleAddProduct}
            />
          )}
        />
      )}

      {/* Combo Configuration Modal */}
      <ComboConfigModal
        visible={modalVisible}
        combo={selectedCombo}
        onClose={() => {
          setModalVisible(false);
          setSelectedCombo(null);
        }}
        onAddToCart={handleComboConfirmed}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  cartButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.surface
  },
  cartBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900"
  },
  toast: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 999,
    backgroundColor: colors.dark,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6
  },
  toastText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    flex: 1
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
    gap: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted
  },
  filterTextActive: {
    color: "#ffffff"
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40
  }
});