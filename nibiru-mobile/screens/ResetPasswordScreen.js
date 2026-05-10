import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";

import {
  useState
} from "react";

import {
  SafeAreaView
} from "react-native-safe-area-context";

import axios from "axios";

import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

export default function ResetPasswordScreen({
  route,
  navigation
}) {

  const { phone } = route.params;

  const [code, setCode] = useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const resetPassword = async () => {

    if (
      !code.trim() ||
      !newPassword.trim()
    ) {

      Alert.alert(
        "Completa todos los campos"
      );

      return;
    }

    try {

      setLoading(true);

      await axios.post(
        `${API}/auth/reset-password`,
        {
          phone,
          code,
          newPassword
        }
      );

      Alert.alert(
        "Contraseña actualizada"
      );

      navigation.navigate("Login");

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

      Alert.alert(
        "Código inválido o expirado"
      );

    } finally {

      setLoading(false);
    }
  };

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        Nueva contraseña
      </Text>

      <Text style={styles.subtitle}>
        Ingresa el código y tu nueva contraseña
      </Text>

      <TextInput
        placeholder="Código"
        placeholderTextColor="#999"
        value={code}
        onChangeText={setCode}
        keyboardType="numeric"
        style={styles.input}
      />

      <TextInput
        placeholder="Nueva contraseña"
        placeholderTextColor="#999"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={resetPassword}
        disabled={loading}
      >

        <Text style={styles.buttonText}>
          Actualizar contraseña
        </Text>

      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: "center"
  },

  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 10
  },

  subtitle: {
    color: colors.muted,
    marginBottom: 24
  },

  input: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    color: colors.text
  },

  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 18,
    alignItems: "center"
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});