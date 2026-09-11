import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

const SERVICE_OPTIONS = [
  {
    id: "local",
    label: "Comer aquí",
    description: "En mesa o salón",
    icon: "restaurant"
  },
  {
    id: "llevar",
    label: "Para llevar",
    description: "Recoger en mostrador",
    icon: "bag-handle"
  },
  {
    id: "domicilio",
    label: "A domicilio",
    description: "Envío a tu dirección",
    icon: "bicycle"
  }
];

export default function ServiceTypeSelector({ selected, onSelect }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tipo de servicio</Text>
      <View style={styles.grid}>
        {SERVICE_OPTIONS.map((opt) => {
          const isSelected = selected === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.optionCard,
                isSelected && styles.optionCardSelected
              ]}
              onPress={() => onSelect(opt.id)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.iconContainer,
                  isSelected && styles.iconContainerSelected
                ]}
              >
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={isSelected ? "#ffffff" : colors.muted}
                />
              </View>

              <Text
                style={[
                  styles.label,
                  isSelected && styles.labelSelected
                ]}
              >
                {opt.label}
              </Text>
              <Text style={styles.description}>{opt.description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12
  },
  title: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 10,
    letterSpacing: -0.2
  },
  grid: {
    flexDirection: "row",
    gap: 10
  },
  optionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1
  },
  optionCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  iconContainerSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center"
  },
  labelSelected: {
    color: colors.primaryDark
  },
  description: {
    fontSize: 9.5,
    color: colors.muted,
    textAlign: "center",
    marginTop: 2,
    fontWeight: "500"
  }
});
