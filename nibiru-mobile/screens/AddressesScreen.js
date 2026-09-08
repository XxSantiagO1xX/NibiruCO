import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert
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

const API = "http://192.168.1.78:3000";

export default function AddressesScreen() {

  const [addresses, setAddresses] = useState([]);

  const [address, setAddress] = useState("");

  const [details, setDetails] = useState("");

  const [loading, setLoading] = useState(false);

  /* CARGAR */

  const loadAddresses = async () => {

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

      setAddresses(res.data);

    } catch (err) {

      console.log(
        err?.response?.data || err.message
      );
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
          address,
          details,
          is_default: addresses.length === 0
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setAddress("");

      setDetails("");

      loadAddresses();

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

      <Text style={styles.title}>
        Direcciones
      </Text>

      {/* FORM */}

      <View style={styles.form}>

        <TextInput
          placeholder="Dirección"
          placeholderTextColor="#999"
          value={address}
          onChangeText={setAddress}
          style={styles.input}
        />

        <TextInput
          placeholder="Detalles (opcional)"
          placeholderTextColor="#999"
          value={details}
          onChangeText={setDetails}
          style={styles.input}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={createAddress}
          disabled={loading}
        >

          <Text style={styles.buttonText}>
            Guardar dirección
          </Text>

        </TouchableOpacity>

      </View>

      {/* LISTA */}

      <FlatList
        data={addresses}
        keyExtractor={(item) =>
          item.id.toString()
        }
        contentContainerStyle={{
          paddingBottom: 40
        }}
        renderItem={({ item }) => (

          <View style={styles.card}>

            <Text style={styles.address}>
              {item.address}
            </Text>

            {
              item.details ? (
                <Text style={styles.details}>
                  {item.details}
                </Text>
              ) : null
            }

            {
              item.is_default && (
                <View style={styles.defaultBadge}>

                  <Text style={styles.defaultText}>
                    Principal
                  </Text>

                </View>
              )
            }

          </View>
        )}
      />

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
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 20,
    color: colors.text
  },

  form: {
    marginBottom: 24
  },

  input: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    color: colors.text
  },

  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 16,
    alignItems: "center"
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 18,
    marginBottom: 14
  },

  address: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text
  },

  details: {
    marginTop: 8,
    color: colors.muted
  },

  defaultBadge: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10
  },

  defaultText: {
    color: "#fff",
    fontWeight: "700"
  }
});