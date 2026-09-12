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
      {/* Top Full-Width Image */}
      <View style={styles.imageContainer}>
        <ProductImage
          imagePath={product.image}
          style={styles.image}
          borderRadius={14}
        />
        {isCombo && (
          <View style={styles.comboBadge}>
            <Ionicons name="layers" size={11} color="#ffffff" />
            <Text style={styles.comboBadgeText}>Combo</Text>
          </View>
        )}
      </View>

      {/* Details Below Image */}
      <View style={styles.content}>
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>

          {isCombo ? (
            <Text style={styles.description} numberOfLines={2}>
              {product.groups?.length
                ? `Combo configurable con ${product.groups.length} grupos de opciones a elegir.`
                : "Combo especial personalizable con complementos."}
            </Text>
          ) : (
            <Text style={styles.description} numberOfLines={2}>
              {product.kitchen_required
                ? "Platillo caliente preparado al momento en cocina."
                : "Listo para servir · Entrega directa."}
            </Text>
          )}
        </View>

        {/* Footer: Price & Right-Aligned Pill Add Button with Orange Border */}
        <View style={styles.footer}>
          <View style={styles.priceContainer}>
            <Text style={styles.pricePrefix}>
              {isCombo ? "Desde" : "Precio"}
            </Text>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.addPillButton,
              cartQuantity > 0 && styles.addPillButtonActive
            ]}
            onPress={() => onAdd(product)}
            activeOpacity={0.8}
          >
            {cartQuantity > 0 ? (
              <View style={styles.pillContent}>
                <Ionicons name="checkmark" size={14} color="#ffffff" />
                <Text style={styles.pillTextActive}>En Carrito ({cartQuantity})</Text>
              </View>
            ) : isCombo ? (
              <View style={styles.pillContent}>
                <Text style={styles.pillText}>Elegir Combo</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.primary} />
              </View>
            ) : (
              <View style={styles.pillContent}>
                <Ionicons name="add" size={15} color={colors.primary} />
                <Text style={styles.pillText}>+ Agregar</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  imageContainer: {
    width: "100%",
    height: 150,
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    marginBottom: 12
  },
  image: {
    width: "100%",
    height: "100%"
  },
  comboBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  comboBadgeText: {
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  content: {
    width: "100%"
  },
  headerInfo: {
    marginBottom: 10
  },
  name: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 22
  },
  description: {
    fontSize: 12.5,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 17,
    fontWeight: "500"
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  priceContainer: {
    justifyContent: "center"
  },
  pricePrefix: {
    fontSize: 9.5,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  price: {
    fontSize: 19,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: -0.5
  },
  // Pill-shaped button aligned to the right with orange border
  addPillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 25,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primary
  },
  addPillButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  pillText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800"
  },
  pillTextActive: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  }
});
