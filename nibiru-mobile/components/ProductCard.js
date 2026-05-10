import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet
} from "react-native";

import colors from "../theme/colors";

export default function ProductCard({
  product,
  onAdd
}) {

  return (

    <View style={styles.card}>

      <Text style={styles.name}>
        {product.name}
      </Text>

      <Text style={styles.price}>
        ${product.price}
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={onAdd}
      >

        <Text style={styles.buttonText}>
          Agregar
        </Text>

      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 18,
    marginBottom: 14,

    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,

    elevation: 3
  },

  name: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text
  },

  price: {
    marginTop: 8,
    marginBottom: 14,
    color: colors.primary,
    fontWeight: "700"
  },

  button: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 14,
    alignItems: "center"
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700"
  }
});