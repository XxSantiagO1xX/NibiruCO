import { useState } from "react";
import {
  View, Text, TextInput, Button, StyleSheet, TouchableOpacity
} from "react-native";
import axios from "axios";

const API = "http://192.168.1.78:3000";

export default function App() {

  // login | register
  const [mode, setMode] = useState("login");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");

  /* SEGURIDAD CONTRASEÑA */
  const passwordStrength = () => {
    let score = 0;
    if (password.length > 5) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return ["Muy débil", "Débil", "Media", "Fuerte", "Muy fuerte"][score];
  };

  /* VALIDACIÓN BÁSICA TELÉFONO (MX simple) */
  const isValidPhone = (p) => {
    return /^[0-9]{10}$/.test(p);
  };

  /* LOGIN */
  const login = async () => {
    setMsg("");

    if (!phone || !password) {
      setMsg("Completa todos los campos");
      return;
    }

    try {
      await axios.post(`${API}/auth/login-phone`, {
        phone,
        password
      });

      setMsg("Login correcto");

    } catch (err) {
      console.log("LOGIN ERROR:", err?.response?.data || err.message);
      setMsg(err?.response?.data?.message || "Error en login");
    }
  };

  /* REGISTRO */
  const register = async () => {
    setMsg("");

    if (!name || !phone || !password || !confirm) {
      setMsg("Completa todos los campos obligatorios");
      return;
    }

    if (!isValidPhone(phone)) {
      setMsg("Teléfono inválido (10 dígitos)");
      return;
    }

    if (password !== confirm) {
      setMsg("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 6) {
      setMsg("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    try {
      await axios.post(`${API}/auth/register-phone`, {
        name,
        phone,
        email,
        password
      });

      setMsg("Usuario creado. Inicia sesión.");
      setMode("login");

      // limpiar campos
      setName("");
      setPhone("");
      setEmail("");
      setPassword("");
      setConfirm("");

    } catch (err) {
      console.log("REGISTER ERROR:", err?.response?.data || err.message);
      setMsg(err?.response?.data?.message || "Error en registro");
    }
  };

  /* LOGIN UI */
  if (mode === "login") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>NibiruCO</Text>

        <TextInput
          placeholder="Teléfono"
          style={styles.input}
          keyboardType="numeric"
          onChangeText={setPhone}
          value={phone}
        />

        <TextInput
          placeholder="Contraseña"
          secureTextEntry
          style={styles.input}
          onChangeText={setPassword}
          value={password}
        />

        <Button title="Entrar" onPress={login} />

        <TouchableOpacity onPress={() => setMode("register")}>
          <Text style={styles.link}>Crear cuenta</Text>
        </TouchableOpacity>

        <Text style={styles.msg}>{msg}</Text>
      </View>
    );
  }

  /* REGISTRO UI */
  return (
    <View style={styles.container}>

      <Text style={styles.title}>Registro</Text>

      <TextInput
        placeholder="Nombre"
        style={styles.input}
        onChangeText={setName}
        value={name}
      />

      <TextInput
        placeholder="Teléfono (10 dígitos)"
        style={styles.input}
        keyboardType="numeric"
        onChangeText={setPhone}
        value={phone}
      />

      <TextInput
        placeholder="Correo (opcional)"
        style={styles.input}
        onChangeText={setEmail}
        value={email}
      />

      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        style={styles.input}
        onChangeText={setPassword}
        value={password}
      />

      <Text style={styles.strength}>
        Seguridad: {passwordStrength()}
      </Text>

      <TextInput
        placeholder="Confirmar contraseña"
        secureTextEntry
        style={styles.input}
        onChangeText={setConfirm}
        value={confirm}
      />

      <Button title="Crear cuenta" onPress={register} />

      <TouchableOpacity onPress={() => setMode("login")}>
        <Text style={styles.link}>Volver al login</Text>
      </TouchableOpacity>

      <Text style={styles.msg}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#fff"
  },
  title: {
    fontSize: 24,
    textAlign: "center",
    marginBottom: 20
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    marginBottom: 10,
    borderRadius: 8
  },
  link: {
    color: "#F97316",
    textAlign: "center",
    marginTop: 10
  },
  msg: {
    textAlign: "center",
    marginTop: 10
  },
  strength: {
    marginBottom: 10,
    color: "#6B7280"
  }
});