import {
  View,
  Text,
  StyleSheet
} from "react-native";

import colors from "../theme/colors";

import {
  SafeAreaView
} from "react-native-safe-area-context";

export default function OrdersScreen() {

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        Mis pedidos
      </Text>

      <Text style={styles.text}>
        Próximamente verás tus pedidos aquí
      </Text>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text
  },

  text: {
    marginTop: 10,
    color: colors.muted
  }
});