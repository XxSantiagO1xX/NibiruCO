import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";

import { useState } from "react";

import {
  SafeAreaView
} from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";

import axios from "axios";

import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

export default function LoginScreen({ navigation }) {

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {

    if (!phone || !password) {

      Alert.alert(
        "Error",
        "Completa todos los campos"
      );

      return;
    }

    try {

      const res = await axios.post(
        `${API}/auth/login-phone`,
        {
          phone,
          password
        }
      );

      if (!res.data.token) {

        Alert.alert(
          "Error",
          "No se recibió token"
        );

        return;
      }

      await AsyncStorage.setItem(
        "token",
        res.data.token
      );

      await AsyncStorage.setItem(
  "role",
  res.data.user.role
);

      navigation.replace("Tabs");

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

      Alert.alert(
        "Error",
        "Credenciales incorrectas"
      );
    }
  };

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        NibiruCO
      </Text>

      <TextInput
        placeholder="Teléfono"
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <TextInput
        placeholder="Contraseña"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.button}
        onPress={login}
      >

        <Text style={styles.buttonText}>
          Entrar
        </Text>


      </TouchableOpacity>

      <TouchableOpacity
  onPress={() =>
    navigation.navigate(
      "ForgotPassword"
    )
  }
>

  <Text style={styles.forgot}>
    ¿Olvidaste tu contraseña?
  </Text>

</TouchableOpacity>

      <TouchableOpacity
        onPress={() =>
          navigation.navigate("Register")
        }
      >

        <Text style={styles.link}>
          Crear cuenta
        </Text>

      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background
  },

  title: {
    fontSize: 38,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 40,
    color: colors.primary
  },

  input: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,

    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,

    elevation: 3
  },

  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },

  link: {
    marginTop: 20,
    textAlign: "center",
    color: colors.primary,
    fontWeight: "600"
  },
  forgot: {
  marginTop: 18,
  textAlign: "center",
  color: colors.primary,
  fontWeight: "700"
},
});