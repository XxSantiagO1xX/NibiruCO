import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../services/api";
import colors from "../theme/colors";

export default function AddressesScreen() {
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  /* CARGAR DIRECCIONES */
  const loadAddresses = async () => {
    try {
      const res = await api.get("/users/addresses");
      setAddresses(res.data || []);
    } catch (err) {
      console.log("ERROR LOAD ADDRESSES:", err?.response?.data || err.message);
    } finally {
      setFetching(false);
    }
  };

  /* CREAR DIRECCIÓN */
  const createAddress = async () => {
    if (!address.trim()) {
      Alert.alert("Campo requerido", "Por favor ingresa tu calle y número.");
      return;
    }

    try {
      setLoading(true);

      await api.post("/users/addresses", {
        label: "Casa",
        address: address.trim(),
        details: details.trim() || undefined,
        is_default: addresses.length === 0
      });

      setAddress("");
      setDetails("");
      Alert.alert("Dirección guardada", "Tu nueva dirección se agregó correctamente.");
      loadAddresses();

    } catch (err) {
      console.log("ERROR CREATE ADDRESS:", err?.response?.data || err.message);
      Alert.alert("Error", "No se pudo registrar la dirección.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Mis Direcciones</Text>

      {/* FORMULARIO DE ALTA */}
      <View style={styles.form}>
        <TextInput
          placeholder="Calle, número, colonia"
          placeholderTextColor="#9ca3af"
          value={address}
          onChangeText={setAddress}
          style={styles.input}
        />

        <TextInput
          placeholder="Detalles / Referencias (opcional)"
          placeholderTextColor="#9ca3af"
          value={details}
          onChangeText={setDetails}
          style={styles.input}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={createAddress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>+ Guardar Nueva Dirección</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* LISTADO */}
      <Text style={styles.subtitle}>Direcciones Registradas</Text>

      {fetching ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Aún no tienes direcciones registradas.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.address}>{item.address}</Text>
                {item.is_default && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultText}>Principal</Text>
                  </View>
                )}
              </View>

              {item.details ? (
                <Text style={styles.details}>Ref: {item.details}</Text>
              ) : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 16,
    color: colors.text
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: colors.text
  },
  form: {
    marginBottom: 24,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center"
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  address: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
    marginRight: 8
  },
  details: {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 14
  },
  defaultBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  defaultText: {
    color: "#15803d",
    fontWeight: "700",
    fontSize: 11
  },
  emptyContainer: {
    padding: 30,
    alignItems: "center"
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 15
  }
});