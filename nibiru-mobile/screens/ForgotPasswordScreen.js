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

const API = "http://192.168.1.78:3000";

export default function ForgotPasswordScreen({
  navigation
}) {

  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);

  const sendCode = async () => {

    if (!phone.trim()) {

      Alert.alert(
        "Ingresa tu teléfono"
      );

      return;
    }

    try {

      setLoading(true);

      const res = await axios.post(
        `${API}/auth/forgot-password`,
        {
          phone
        }
      );

      console.log(
        "CÓDIGO:",
        res.data.code
      );

      Alert.alert(
        "Código generado",
        `Código temporal: ${res.data.code}`
      );

      navigation.navigate(
        "ResetPassword",
        { phone }
      );

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

      Alert.alert(
        "ERROR",
        JSON.stringify(
          err?.response?.data ||
          err.message
        )
      );

    } finally {

      setLoading(false);
    }
  };

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        Recuperar contraseña
      </Text>

      <Text style={styles.subtitle}>
        Ingresa tu teléfono
      </Text>

      <TextInput
        placeholder="Teléfono"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        style={styles.input}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={sendCode}
        disabled={loading}
      >

        <Text style={styles.buttonText}>
          Enviar código
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