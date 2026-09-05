import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView
} from "react-native";
import { useEffect, useState, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ProductCard from "../components/ProductCard";
import { AppContext } from "../context/AppContext";
import colors from "../theme/colors";
import API from "../config/api";

export default function ProductsScreen() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [combo, setCombo] = useState(null);
  const [comboChoices, setComboChoices] = useState({});
  const [comboLoading, setComboLoading] = useState(false);
  const { addToCart } = useContext(AppContext);

  const loadProducts = async () => {
    try {
      const res = await axios.get(`${API}/products`);
      setProducts(res.data);
    } catch (err) {
      console.log("ERROR PRODUCTS:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openProduct = async (product) => {
    if (product.product_kind !== "combo") {
      addToCart(product);
      return;
    }

    setComboLoading(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${API}/combos/${product.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setCombo(res.data);
      setComboChoices({});
    } catch (err) {
      console.log(err?.response?.data || err.message);
    } finally {
      setComboLoading(false);
    }
  };

  const selectedForGroup = (groupId) => comboChoices[groupId] || [];

  const toggleChoice = (group, option) => {
    const current = selectedForGroup(group.id);
    const exists = current.some((choice) => Number(choice.option_product_id) === Number(option.option_product_id));

    if (exists) {
      setComboChoices((prev) => ({
        ...prev,
        [group.id]: current.filter((choice) => Number(choice.option_product_id) !== Number(option.option_product_id))
      }));
      return;
    }

    if (current.length >= Number(group.max_select)) {
      if (Number(group.max_select) === 1) {
        setComboChoices((prev) => ({
          ...prev,
          [group.id]: [{
            group_id: Number(group.id),
            group_name: group.name,
            option_product_id: Number(option.option_product_id),
            option_name: option.name,
            extra_price: Number(option.extra_price || 0)
          }]
        }));
      }
      return;
    }

    setComboChoices((prev) => ({
      ...prev,
      [group.id]: [
        ...current,
        {
          group_id: Number(group.id),
          group_name: group.name,
          option_product_id: Number(option.option_product_id),
          option_name: option.name,
          extra_price: Number(option.extra_price || 0)
        }
      ]
    }));
  };

  const comboIsValid = () => {
    if (!combo) return false;
    return combo.groups.every((group) => {
      const count = selectedForGroup(group.id).length;
      return count >= Number(group.min_select) && count <= Number(group.max_select);
    });
  };

  const comboTotal = () => {
    if (!combo) return 0;
    const extra = Object.values(comboChoices)
      .flat()
      .reduce((sum, choice) => sum + Number(choice.extra_price || 0), 0);
    return Number(combo.price) + extra;
  };

  const confirmCombo = () => {
    if (!combo || !comboIsValid()) return;
    addToCart(combo, Object.values(comboChoices).flat());
    setCombo(null);
    setComboChoices({});
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MealOps</Text>
          <Text style={styles.title}>Menú del día</Text>
          <Text style={styles.subtitle}>Lo disponible hoy, actualizado desde cocina.</Text>
        </View>
        <TouchableOpacity style={styles.refresh} onPress={loadProducts}>
          <Ionicons name="refresh" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {comboLoading && (
        <View style={styles.loadingStrip}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingStripText}>Preparando opciones…</Text>
        </View>
      )}

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onAdd={() => openProduct(item)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>Hoy no hay productos disponibles.</Text>}
      />

      <Modal
        visible={Boolean(combo)}
        transparent
        animationType="slide"
        onRequestClose={() => setCombo(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetEyebrow}>Comida corrida</Text>
                <Text style={styles.sheetTitle}>{combo?.name}</Text>
                <Text style={styles.sheetPrice}>Desde ${Number(combo?.price || 0).toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.close} onPress={() => setCombo(null)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.groups}>
              {(combo?.groups || []).map((group) => (
                <View key={group.id} style={styles.group}>
                  <View style={styles.groupHead}>
                    <View>
                      <Text style={styles.groupTitle}>{group.name}</Text>
                      <Text style={styles.groupHint}>
                        {Number(group.min_select) === Number(group.max_select)
                          ? `Elige ${group.min_select}`
                          : `Elige de ${group.min_select} a ${group.max_select}`}
                      </Text>
                    </View>
                    <Text style={styles.groupCount}>{selectedForGroup(group.id).length}/{group.max_select}</Text>
                  </View>

                  <View style={styles.options}>
                    {(group.options || []).filter((option) => option.active && option.available).map((option) => {
                      const selected = selectedForGroup(group.id).some((choice) => Number(choice.option_product_id) === Number(option.option_product_id));
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.option, selected && styles.optionSelected]}
                          onPress={() => toggleChoice(group, option)}
                        >
                          <View style={[styles.optionCheck, selected && styles.optionCheckSelected]}>
                            {selected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.optionName, selected && styles.optionNameSelected]}>{option.name}</Text>
                            {Number(option.extra_price) > 0 && (
                              <Text style={styles.optionExtra}>+ ${Number(option.extra_price).toFixed(2)}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <View>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${comboTotal().toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.confirm, !comboIsValid() && styles.confirmDisabled]}
                onPress={confirmCombo}
                disabled={!comboIsValid()}
              >
                <Text style={styles.confirmText}>Agregar al carrito</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1 },
  title: { marginTop: 4, color: colors.text, fontSize: 30, fontWeight: "800", letterSpacing: -1 },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 12 },
  refresh: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 80 },
  loadingStrip: { marginHorizontal: 16, marginBottom: 10, minHeight: 38, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primarySoft },
  loadingStripText: { color: colors.primaryDark, fontSize: 11, fontWeight: "700" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(24,20,17,.42)" },
  sheet: { maxHeight: "88%", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, backgroundColor: colors.surface },
  sheetHead: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "flex-start", gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetEyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  sheetTitle: { marginTop: 4, color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -.7 },
  sheetPrice: { marginTop: 4, color: colors.muted, fontSize: 11 },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  groups: { padding: 20, paddingBottom: 8 },
  group: { marginBottom: 22 },
  groupHead: { marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  groupHint: { marginTop: 3, color: colors.muted, fontSize: 10 },
  groupCount: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  options: { gap: 8 },
  option: { minHeight: 56, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.surfaceMuted },
  optionSelected: { borderColor: "#F8B98E", backgroundColor: colors.primarySoft },
  optionCheck: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  optionCheckSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  optionNameSelected: { color: colors.primaryDark },
  optionExtra: { marginTop: 2, color: colors.primary, fontSize: 10, fontWeight: "700" },
  sheetFooter: { padding: 16, paddingBottom: 22, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", gap: 16 },
  totalLabel: { color: colors.muted, fontSize: 10 },
  totalValue: { color: colors.text, fontSize: 22, fontWeight: "900" },
  confirm: { flex: 1, minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  confirmDisabled: { opacity: .4 },
  confirmText: { color: "#FFF", fontSize: 13, fontWeight: "800" }
});
