import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

export default function Header({
  title = "MealOps",
  subtitle,
  onBack,
  rightAction,
  showBrandMark = true
}) {
  return (
    <View style={styles.container}>
      <View style={styles.leftRow}>
        {onBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        )}

        {showBrandMark && (
          <View style={styles.brandMarkContainer}>
            <Ionicons name="restaurant" size={18} color={colors.primary} />
          </View>
        )}

        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {rightAction ? (
        <View style={styles.rightAction}>{rightAction}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border
  },
  // REGLA ESTRICTA DE LOGOTIPOS: backgroundColor: '#FFFFFF' obligatorio
  brandMarkContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  },
  titleCol: {
    flex: 1
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.4,
    color: colors.text
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 1
  },
  rightAction: {
    marginLeft: 10
  }
});
