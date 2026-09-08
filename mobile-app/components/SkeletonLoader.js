import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import colors from "../theme/colors";

export function SkeletonItem({ width = "100%", height = 20, borderRadius = 8, style }) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.borderLight,
          opacity
        },
        style
      ]}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonItem width={96} height={96} borderRadius={16} />
      <View style={styles.cardBody}>
        <SkeletonItem width="60%" height={16} borderRadius={6} />
        <SkeletonItem width="35%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
        <View style={styles.cardFooter}>
          <SkeletonItem width={60} height={20} borderRadius={6} />
          <SkeletonItem width={74} height={34} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

export function OrderCardSkeleton() {
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <SkeletonItem width={90} height={18} borderRadius={6} />
        <SkeletonItem width={70} height={24} borderRadius={12} />
      </View>
      <SkeletonItem width="100%" height={12} borderRadius={4} style={{ marginTop: 12 }} />
      <SkeletonItem width="75%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
      <View style={styles.orderFooter}>
        <SkeletonItem width={80} height={16} borderRadius={6} />
        <SkeletonItem width={60} height={16} borderRadius={6} />
      </View>
    </View>
  );
}

export default function SkeletonList({ count = 4, type = "product" }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <View style={styles.container}>
      {items.map((key) =>
        type === "product" ? (
          <ProductCardSkeleton key={key} />
        ) : (
          <OrderCardSkeleton key={key} />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8
  },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 14
  },
  cardBody: {
    flex: 1,
    justifyContent: "space-between"
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10
  },
  orderCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  }
});
