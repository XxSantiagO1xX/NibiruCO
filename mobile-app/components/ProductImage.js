import { useState } from "react";
import { View, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";
import { getImageUrl } from "../config/api";

export default function ProductImage({
  imagePath,
  style,
  fallbackIcon = "restaurant-outline",
  fallbackSize = 28,
  borderRadius = 14
}) {
  const [hasError, setHasError] = useState(false);
  const resolvedUrl = getImageUrl(imagePath);

  if (!resolvedUrl || hasError) {
    return (
      <View
        style={[
          styles.placeholder,
          { borderRadius },
          style
        ]}
      >
        <Ionicons
          name={fallbackIcon}
          size={fallbackSize}
          color={colors.textSubtle}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolvedUrl }}
      style={[{ borderRadius }, style]}
      resizeMode="cover"
      onError={() => setHasError(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center"
  }
});
