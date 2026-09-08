import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator
} from "react-native";
import { useContext, useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../services/api";
import { AppContext } from "../context/AppContext";
import colors from "../theme/colors";

export default function CartScreen({ navigation }) {
  const { cart, removeFromCart, clearCart } = useContext(AppContext);

  /* TIPO DE PEDIDO Y PAGO */
  const [orderType, setOrderType] = useState("local"); // 'local', 'pickup', 'delivery'
  const [paymentMethod, setPaymentMethod] = useState("cash"); // 'cash', 'card'

  /* DIRECCIONES */
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [defaultAddress, setDefaultAddress] = useState(false);

  const [loading, setLoading] = useState(false);

  /* TOTAL */
  const total = cart.reduce(
    (acc, item) => acc + (Number(item.price) * Number(item.quantity)),
    0
  );

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    try {
      const res = await api.get("/users/addresses");
      const list = res.data || [];
      setAddresses(list);

      const defaultItem = list.find(item => item.is_default);
      if (defaultItem) {
        setSelectedAddress(defaultItem.id);
      } else if (list.length > 0) {
        setSelectedAddress(list[0].id);
      }
    } catch (err) {
      console.log("Error cargando direcciones:", err?.response?.data || err.message);
    }
  };

  const createAddress = async () => {
    if (!newAddress.trim()) {
      Alert.alert("Campo requerido", "Por favor escribe una dirección válida.");
      return null;
    }

    try {
      const res = await api.post("/users/addresses", {
        label: "Dirección",
        address: newAddress.trim(),
        details: newDetails.trim() || undefined,
        is_default: defaultAddress
      });

      await loadAddresses();
      setNewAddress("");
      setNewDetails("");
      setShowNewAddress(false);
      setSelectedAddress(res.data.id);
      return res.data.id;

    } catch (err) {
      console.log("Error creando dirección:", err?.response?.data || err.message);
      Alert.alert("Error", "No se pudo guardar la dirección.");
      return null;
    }
  };

  /* CREAR PEDIDO */
  const createOrder = async () => {
    if (!cart.length) {
      Alert.alert("Carrito vacío", "Agrega al menos un platillo al carrito.");
      return;
    }

    let finalAddressId = selectedAddress;

    if (orderType === "delivery") {
      if (showNewAddress && newAddress.trim()) {
        finalAddressId = await createAddress();
        if (!finalAddressId) return;
      } else if (!selectedAddress) {
        Alert.alert("Dirección requerida", "Por favor selecciona o agrega una dirección de entrega.");
        return;
      }
    }

    try {
      setLoading(true);

      const items = cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity
      }));

      const res = await api.post("/orders", {
        items,
        type: orderType,
        payment_method: paymentMethod,
        address_id: orderType === "delivery" ? finalAddressId : undefined
      });

      clearCart();

      Alert.alert(
        "¡Pedido confirmado!",
        `Tu pedido #${res.data.id} ha sido enviado a la cocina.`,
        [{ text: "Ver pedidos", onPress: () => navigation?.navigate("Pedidos") }]
      );

    } catch (err) {
      console.log("ERROR CREATING ORDER:", err?.response?.data || err.message);
      const msg = err?.response?.data?.message || "No se pudo procesar tu pedido. Intenta nuevamente.";
      Alert.alert("Error al ordenar", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Carrito de Compras</Text>

      {cart.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Tu carrito está vacío.</Text>
          <Text style={styles.emptySubtext}>Explora nuestro menú del día para agregar platillos.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ITEMS EN CARRITO */}
          {cart.map(item => (
            <View key={item.product_id} style={styles.card}>
              <View style={styles.itemHeader}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.price}>${(Number(item.price) * item.quantity).toFixed(2)}</Text>
              </View>

              <Text style={styles.quantity}>Cantidad: {item.quantity} x ${Number(item.price).toFixed(2)}</Text>

              <TouchableOpacity
                style={styles.remove}
                onPress={() => removeFromCart(item.product_id)}
              >
                <Text style={styles.removeText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.footer}>
            {/* TIPO DE PEDIDO */}
            <Text style={styles.sectionTitle}>Tipo de Entrega</Text>
            <View style={styles.types}>
              <TouchableOpacity
                style={[styles.typeButton, orderType === "local" && styles.typeActive]}
                onPress={() => setOrderType("local")}
              >
                <Text style={[styles.typeText, orderType === "local" && styles.typeTextActive]}>
                  En Local
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, orderType === "pickup" && styles.typeActive]}
                onPress={() => setOrderType("pickup")}
              >
                <Text style={[styles.typeText, orderType === "pickup" && styles.typeTextActive]}>
                  Para Llevar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, orderType === "delivery" && styles.typeActive]}
                onPress={() => setOrderType("delivery")}
              >
                <Text style={[styles.typeText, orderType === "delivery" && styles.typeTextActive]}>
                  Domicilio
                </Text>
              </TouchableOpacity>
            </View>

            {/* MÉTODO DE PAGO */}
            <Text style={styles.sectionTitle}>Método de Pago</Text>
            <View style={styles.types}>
              <TouchableOpacity
                style={[styles.typeButton, paymentMethod === "cash" && styles.typeActive]}
                onPress={() => setPaymentMethod("cash")}
              >
                <Text style={[styles.typeText, paymentMethod === "cash" && styles.typeTextActive]}>
                  💵 Efectivo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, paymentMethod === "card" && styles.typeActive]}
                onPress={() => setPaymentMethod("card")}
              >
                <Text style={[styles.typeText, paymentMethod === "card" && styles.typeTextActive]}>
                  💳 Tarjeta
                </Text>
              </TouchableOpacity>
            </View>

            {/* SELECCIÓN DE DIRECCIÓN (SOLO SI ES DOMICILIO) */}
            {orderType === "delivery" && (
              <View style={styles.addressSection}>
                <Text style={styles.sectionTitle}>Dirección de Entrega</Text>

                {addresses.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.addressCard, selectedAddress === item.id && styles.addressActive]}
                    onPress={() => setSelectedAddress(item.id)}
                  >
                    <Text style={[styles.addressText, selectedAddress === item.id && styles.addressTextActive]}>
                      {item.address}
                    </Text>
                    {item.details ? (
                      <Text style={[styles.addressDetails, selectedAddress === item.id && styles.addressTextActive]}>
                        {item.details}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setShowNewAddress(!showNewAddress)}
                >
                  <Text style={styles.addButtonText}>
                    {showNewAddress ? "− Ocultar formulario" : "+ Agregar nueva dirección"}
                  </Text>
                </TouchableOpacity>

                {showNewAddress && (
                  <View style={styles.form}>
                    <TextInput
                      placeholder="Calle, número y colonia"
                      placeholderTextColor="#9ca3af"
                      value={newAddress}
                      onChangeText={setNewAddress}
                      style={styles.input}
                    />
                    <TextInput
                      placeholder="Referencias (piso, depto, fachada)"
                      placeholderTextColor="#9ca3af"
                      value={newDetails}
                      onChangeText={setNewDetails}
                      style={styles.input}
                    />
                    <TouchableOpacity
                      style={[styles.optionButton, defaultAddress && styles.optionActive]}
                      onPress={() => setDefaultAddress(!defaultAddress)}
                    >
                      <Text style={[styles.optionText, defaultAddress && styles.optionTextActive]}>
                        {defaultAddress ? "✓ Guardar como principal" : "Guardar como principal"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* RESUMEN Y BOTÓN DE CONFIRMACIÓN */}
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Total a pagar:</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={createOrder}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Confirmar y Enviar Pedido</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background
  },
  scrollContent: {
    paddingBottom: 40
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 16,
    color: colors.text
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center"
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6"
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    flex: 1
  },
  quantity: {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 14
  },
  price: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 17
  },
  remove: {
    marginTop: 10,
    alignSelf: "flex-start"
  },
  removeText: {
    color: "#ef4444",
    fontWeight: "600",
    fontSize: 14
  },
  footer: {
    marginTop: 16
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
    color: colors.text
  },
  types: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20
  },
  typeButton: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  typeActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  typeText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14
  },
  typeTextActive: {
    color: "#fff"
  },
  addressSection: {
    marginBottom: 20
  },
  addressCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  addressActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  addressText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 15
  },
  addressDetails: {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 13
  },
  addressTextActive: {
    color: "#fff"
  },
  addButton: {
    marginTop: 6,
    marginBottom: 12
  },
  addButtonText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 14
  },
  form: {
    backgroundColor: "#f9fafb",
    padding: 14,
    borderRadius: 12,
    marginBottom: 14
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  optionButton: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  optionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  optionText: {
    color: colors.text,
    fontWeight: "600"
  },
  optionTextActive: {
    color: "#fff"
  },
  totalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary
  },
  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 14,
    alignItems: "center"
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});