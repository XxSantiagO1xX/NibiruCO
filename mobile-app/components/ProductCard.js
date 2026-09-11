import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";
import ProductImage from "./ProductImage";

export default function ProductCard({
  product,
  cartQuantity = 0,
  onAdd,
  onPress
}) {
  const isCombo = product.product_kind === "combo";
  const price = Number(product.price || 0);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => (onPress ? onPress(product) : onAdd(product))}
      activeOpacity={0.88}
    >
      {/* Product Image */}
      <View style={styles.imageContainer}>
        <ProductImage
          imagePath={product.image}
          style={styles.image}
          borderRadius={14}
        />
        {isCombo && (
          <View style={styles.comboBadge}>
            <Ionicons name="layers" size={10} color="#ffffff" />
            <Text style={styles.comboBadgeText}>Combo</Text>
          </View>
        )}
      </View>

      {/* Details */}
      <View style={styles.content}>
        <View style={styles.infoCol}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>

          {isCombo ? (
            <Text style={styles.comboDescription} numberOfLines={1}>
              {product.groups?.length
                ? `${product.groups.length} grupos a elegir`
                : "Personalizable"}
            </Text>
          ) : (
            <Text style={styles.comboDescription} numberOfLines={1}>
              {product.kitchen_required ? "Preparado al momento" : "Entrega directa"}
            </Text>
          )}
        </View>

        {/* Footer: Price & Add Button */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.pricePrefix}>
              {isCombo ? "Desde" : "Precio"}
            </Text>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.addButton,
              isCombo ? styles.comboAddButton : styles.regularAddButton
            ]}
            onPress={() => onAdd(product)}
            activeOpacity={0.8}
          >
            {cartQuantity > 0 ? (
              <View style={styles.inCartRow}>
                <Ionicons name="checkmark" size={13} color="#ffffff" />
                <Text style={styles.inCartText}>{cartQuantity}</Text>
              </View>
            ) : isCombo ? (
              <View style={styles.btnRow}>
                <Text style={styles.comboBtnText}>Elegir</Text>
                <Ionicons name="chevron-forward" size={12} color="#ffffff" />
              </View>
            ) : (
              <Ionicons name="add" size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 14
  },
  imageContainer: {
    position: "relative"
  },
  image: {
    width: 90,
    height: 90
  },
  comboBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8
  },
  comboBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  content: {
    flex: 1,
    justifyContent: "space-between"
  },
  infoCol: {
    paddingTop: 2
  },
  name: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
    lineHeight: 20
  },
  comboDescription: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 3,
    fontWeight: "500"
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8
  },
  pricePrefix: {
    fontSize: 9.5,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  price: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: -0.5
  },
  // Pill-shaped button (borderRadius: 25)
  addButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 25,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3
  },
  regularAddButton: {
    width: 38,
    height: 38
  },
  comboAddButton: {
    paddingHorizontal: 14,
    height: 36
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3
  },
  comboBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },
  inCartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8
  },
  inCartText: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "800"
  }
});
