import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

export default function ProductCard({ product, onAdd }) {
  const isCombo = product.product_kind === "combo";
  const quick = product.kitchen_required === false;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={isCombo ? "restaurant-outline" : quick ? "flash-outline" : "fast-food-outline"}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={styles.badges}>
          {isCombo && <Text style={styles.badge}>Comida corrida</Text>}
          {quick && !isCombo && <Text style={styles.badge}>Entrega rápida</Text>}
        </View>
      </View>

      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.caption}>{isCombo ? "Elige tus opciones antes de agregar" : "Disponible en el menú de hoy"}</Text>

      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.priceLabel}>{isCombo ? "Desde" : "Precio"}</Text>
          <Text style={styles.price}>${Number(product.price).toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={onAdd} activeOpacity={0.85}>
          <Text style={styles.buttonText}>{isCombo ? "Elegir" : "Agregar"}</Text>
          <Ionicons name={isCombo ? "chevron-forward" : "add"} size={16} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 11,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#191714",
    shadowOpacity: 0.045,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  topRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft
  },
  badges: { flexDirection: "row", gap: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
    color: colors.muted,
    backgroundColor: colors.surfaceMuted,
    fontSize: 9,
    fontWeight: "800"
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -.3
  },
  caption: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15
  },
  bottomRow: {
    marginTop: 17,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  priceLabel: { color: colors.muted, fontSize: 9 },
  price: {
    marginTop: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  button: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary
  },
  buttonText: { color: "#FFF", fontSize: 11, fontWeight: "800" }
});
