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

import {
  useEffect,
  useState
} from "react";

import {
  SafeAreaView
} from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";

import axios from "axios";

import colors from "../theme/colors";
import API from "../config/api";

export default function AddressesScreen() {

  const [addresses, setAddresses] = useState([]);

  const [address, setAddress] = useState("");

  const [details, setDetails] = useState("");

  const [loading, setLoading] = useState(false);

  const [fetching, setFetching] = useState(true);

  const [addressesLoaded, setAddressesLoaded] = useState(false);

  const [loadError, setLoadError] = useState(false);

  /* CARGAR */

  const loadAddresses = async () => {

    setFetching(true);
    setLoadError(false);

    try {

      const token = await AsyncStorage.getItem(
        "token"
      );

      const res = await axios.get(
        `${API}/users/addresses`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setAddresses(res.data || []);

      setAddressesLoaded(true);

      return true;

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

      setAddressesLoaded(false);
      setLoadError(true);

      return false;
    } finally {

      setFetching(false);
    }
  };

  /* CREAR */

  const createAddress = async () => {

    if (!address.trim()) {

      Alert.alert(
        "Escribe una dirección"
      );

      return;
    }

    try {

      setLoading(true);

      const token = await AsyncStorage.getItem(
        "token"
      );

      await axios.post(
        `${API}/users/addresses`,
        {
          label: "Casa",
          address: address.trim(),
          details: details.trim() || undefined,
          is_default: addressesLoaded && addresses.length === 0
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setAddress("");

      setDetails("");

      const refreshed = await loadAddresses();

      Alert.alert(
        "Dirección guardada",
        refreshed
          ? "Ya puedes seleccionarla en tus pedidos a domicilio."
          : "Se guardó correctamente, pero no pudimos actualizar la lista."
      );

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );

      Alert.alert(
        "Error guardando dirección"
      );

    } finally {

      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.eyebrow}>Cuenta MealOps</Text>

      <Text style={styles.title}>Mis direcciones</Text>

      <Text style={styles.subtitle}>
        Guarda los lugares donde quieres recibir tus pedidos.
      </Text>

      {/* FORM */}

      <View style={styles.form}>

        <TextInput
          placeholder="Calle, número y colonia"
          placeholderTextColor={colors.muted}
          value={address}
          onChangeText={setAddress}
          style={styles.input}
        />

        <TextInput
          placeholder="Referencias (opcional)"
          placeholderTextColor={colors.muted}
          value={details}
          onChangeText={setDetails}
          style={styles.input}
        />

        <TouchableOpacity
          style={[
            styles.button,
            (loading || fetching || !addressesLoaded) && styles.buttonDisabled
          ]}
          onPress={createAddress}
          disabled={loading || fetching || !addressesLoaded}
        >

          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Guardar dirección</Text>
          )}

        </TouchableOpacity>

      </View>

      {/* LISTA */}

      <Text style={styles.sectionTitle}>Direcciones registradas</Text>

      {fetching ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : loadError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No pudimos cargar tus direcciones</Text>
          <Text style={styles.emptyText}>Revisa tu conexión e inténtalo otra vez.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadAddresses}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aún no tienes direcciones</Text>
              <Text style={styles.emptyText}>La primera que agregues quedará como principal.</Text>
            </View>
          )}
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
                <Text style={styles.details}>
                  Referencia: {item.details}
                </Text>
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
    padding: 20
  },

  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1
  },

  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.text
  },

  subtitle: {
    marginTop: 7,
    marginBottom: 20,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18
  },

  form: {
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface
  },

  input: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: 14
  },

  button: {
    backgroundColor: colors.primary,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },

  buttonDisabled: {
    opacity: 0.6
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14
  },

  sectionTitle: {
    marginBottom: 12,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },

  loader: {
    marginTop: 24
  },

  listContent: {
    paddingBottom: 40
  },

  card: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },

  address: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },

  details: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17
  },

  defaultBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#DCFCE7"
  },

  defaultText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: "800"
  },

  empty: {
    padding: 26,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },

  emptyText: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 10,
    textAlign: "center"
  },

  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.primarySoft
  },

  retryText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800"
  }
});
