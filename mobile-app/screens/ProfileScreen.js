import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import colors from "../theme/colors";

export default function ProfileScreen({ navigation }) {

  const logout = async () => {

    await AsyncStorage.removeItem("token");

    Alert.alert(
      "Sesión cerrada"
    );

    navigation.replace("Login");
  };

  return (
    <View style={styles.container}>

      <Text style={styles.title}>
        Perfil
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={logout}
      >

        <Text style={styles.buttonText}>
          Cerrar sesión
        </Text>

      </TouchableOpacity>

    </View>
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
    marginBottom: 30,
    color: colors.text
  },

  button: {
    backgroundColor: "#EF4444",
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 16
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});