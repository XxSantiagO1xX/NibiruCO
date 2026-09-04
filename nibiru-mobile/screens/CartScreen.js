import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView
} from "react-native";
import { useContext, useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

import { AppContext } from "../context/AppContext";
import colors from "../theme/colors";

const API = "http://192.168.1.86:3000";

const serviceOptions = [
  { id: "local", label: "Local", icon: "restaurant-outline" },
  { id: "llevar", label: "Para llevar", icon: "bag-handle-outline" },
  { id: "recoger", label: "Recoger", icon: "time-outline" },
  { id: "domicilio", label: "Domicilio", icon: "bicycle-outline" }
];

const paymentOptions = [
  { id: "efectivo", label: "Efectivo", icon: "cash-outline" },
  { id: "tarjeta", label: "Tarjeta", icon: "card-outline" }
];

export default function CartScreen() {
  const { cart, updateQuantity, removeFromCart, clearCart } = useContext(AppContext);
  const [serviceType, setServiceType] = useState("local");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [customerName, setCustomerName] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [defaultAddress, setDefaultAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0),
    [cart]
  );

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) return;
      const res = await axios.get(`${API}/users/addresses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAddresses(res.data);
      const preferred = res.data.find((item) => item.is_default) || res.data[0];
      if (preferred) setSelectedAddress(preferred.id);
    } catch (err) {
      console.log(err?.response?.data || err.message);
    }
  };

  const createAddress = async () => {
    const address = newAddress.trim();
    if (!address) {
      Alert.alert("Falta la dirección", "Escribe la dirección de entrega.");
      return null;
    }

    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.post(
        `${API}/users/addresses`,
        {
          label: "Dirección",
          address,
          details: newDetails.trim() || null,
          is_default: defaultAddress
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await loadAddresses();
      setNewAddress("");
      setNewDetails("");
      setShowNewAddress(false);
      setSelectedAddress(res.data.id);
      return res.data.id;
    } catch (err) {
      console.log(err?.response?.data || err.message);
      Alert.alert("No se pudo guardar", "Intenta guardar la dirección nuevamente.");
      return null;
    }
  };

  const pickupIso = () => {
    if (serviceType !== "recoger" || !pickupTime.trim()) return null;
    const match = pickupTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return undefined;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return undefined;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  };

  const createOrder = async () => {
    if (!cart.length) {
      Alert.alert("Carrito vacío", "Agrega algo del menú antes de continuar.");
      return;
    }

    if (["llevar", "recoger"].includes(serviceType) && !customerName.trim()) {
      Alert.alert("Falta un nombre", "Escribe el nombre o referencia para identificar el pedido.");
      return;
    }

    const pickupAt = pickupIso();
    if (pickupAt === undefined) {
      Alert.alert("Hora inválida", "Usa formato de 24 horas, por ejemplo 14:30.");
      return;
    }

    let addressId = selectedAddress;
    if (serviceType === "domicilio") {
      if (showNewAddress) {
        addressId = await createAddress();
      }
      if (!addressId) {
        Alert.alert("Falta una dirección", "Selecciona o agrega una dirección de entrega.");
        return;
      }
    }

    const items = cart.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
      choices: (item.choices || []).map((choice) => ({
        group_id: Number(choice.group_id),
        option_product_id: Number(choice.option_product_id)
      }))
    }));

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.post(
        `${API}/orders`,
        {
          items,
          type: serviceType,
          service_type: serviceType,
          payment_method: paymentMethod,
          customer_name: ["llevar", "recoger"].includes(serviceType) ? customerName.trim() : null,
          pickup_at: pickupAt,
          address_id: serviceType === "domicilio" ? addressId : null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      clearCart();
      const folio = res.data?.folio ? `F${String(res.data.folio).padStart(3, "0")}` : `#${res.data?.id || ""}`;
      Alert.alert("Pedido recibido", `Tu folio es ${folio}. Puedes seguirlo desde Pedidos.`);
    } catch (err) {
      console.log(err?.response?.data || err.message);
      Alert.alert("No se pudo crear el pedido", err?.response?.data?.message || "Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.itemHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          {(item.choices || []).length > 0 && (
            <Text style={styles.choices}>
              {(item.choices || []).map((choice) => choice.option_name).join(" · ")}
            </Text>
          )}
        </View>
        <Text style={styles.price}>${(Number(item.price) * Number(item.quantity)).toFixed(2)}</Text>
      </View>

      <View style={styles.itemFooter}>
        <View style={styles.qtyControls}>
          <TouchableOpacity style={styles.qtyButton} onPress={() => updateQuantity(item.cart_key, -1)}>
            <Ionicons name="remove" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.quantity}>{item.quantity}</Text>
          <TouchableOpacity style={styles.qtyButton} onPress={() => updateQuantity(item.cart_key, 1)}>
            <Ionicons name="add" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => removeFromCart(item.cart_key)}>
          <Text style={styles.removeText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Tu pedido</Text>
          <Text style={styles.title}>Carrito</Text>
        </View>
        <Text style={styles.headerTotal}>${total.toFixed(2)}</Text>
      </View>

      <FlatList
        data={cart}
        keyExtractor={(item) => item.cart_key}
        renderItem={renderCartItem}
        contentContainerStyle={cart.length ? styles.list : styles.emptyList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bag-handle-outline" size={34} color={colors.muted} />
            <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
            <Text style={styles.emptyCopy}>Agrega productos desde el menú del día.</Text>
          </View>
        }
      />

      {cart.length > 0 && (
        <View style={styles.checkoutWrap}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.checkout}>
            <Text style={styles.sectionTitle}>¿Cómo lo quieres?</Text>
            <View style={styles.optionGrid}>
              {serviceOptions.map((option) => {
                const selected = serviceType === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionButton, selected && styles.optionActive]}
                    onPress={() => setServiceType(option.id)}
                  >
                    <Ionicons name={option.icon} size={17} color={selected ? colors.primary : colors.muted} />
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {["llevar", "recoger"].includes(serviceType) && (
              <View style={styles.field}>
                <Text style={styles.label}>Nombre o referencia</Text>
                <TextInput
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Ej. Laura / Oficina 3"
                  placeholderTextColor="#AAA49D"
                  style={styles.input}
                />
              </View>
            )}

            {serviceType === "recoger" && (
              <View style={styles.field}>
                <Text style={styles.label}>Hora de recolección opcional</Text>
                <TextInput
                  value={pickupTime}
                  onChangeText={setPickupTime}
                  placeholder="14:30"
                  placeholderTextColor="#AAA49D"
                  keyboardType="numbers-and-punctuation"
                  style={styles.input}
                />
              </View>
            )}

            {serviceType === "domicilio" && (
              <View style={styles.addressSection}>
                <Text style={styles.sectionTitle}>Dirección de entrega</Text>
                <View style={styles.addressList}>
                  {addresses.map((item) => {
                    const selected = Number(selectedAddress) === Number(item.id) && !showNewAddress;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.addressCard, selected && styles.addressActive]}
                        onPress={() => {
                          setSelectedAddress(item.id);
                          setShowNewAddress(false);
                        }}
                      >
                        <View style={[styles.radio, selected && styles.radioActive]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.addressText}>{item.address}</Text>
                          {!!item.details && <Text style={styles.addressDetails}>{item.details}</Text>}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity style={styles.addAddress} onPress={() => setShowNewAddress((value) => !value)}>
                  <Ionicons name={showNewAddress ? "close" : "add"} size={17} color={colors.primary} />
                  <Text style={styles.addAddressText}>{showNewAddress ? "Cancelar nueva dirección" : "Agregar dirección"}</Text>
                </TouchableOpacity>

                {showNewAddress && (
                  <View style={styles.newAddressCard}>
                    <View style={styles.field}>
                      <Text style={styles.label}>Dirección</Text>
                      <TextInput value={newAddress} onChangeText={setNewAddress} placeholder="Calle, número, colonia" placeholderTextColor="#AAA49D" style={styles.input} />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>Referencias</Text>
                      <TextInput value={newDetails} onChangeText={setNewDetails} placeholder="Portón, piso, entre calles…" placeholderTextColor="#AAA49D" style={styles.input} />
                    </View>
                    <TouchableOpacity style={styles.defaultRow} onPress={() => setDefaultAddress((value) => !value)}>
                      <View style={[styles.checkbox, defaultAddress && styles.checkboxActive]}>
                        {defaultAddress && <Ionicons name="checkmark" size={13} color="#FFF" />}
                      </View>
                      <Text style={styles.defaultText}>Guardar como dirección predeterminada</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <Text style={styles.sectionTitle}>Forma de pago</Text>
            <View style={styles.optionGridTwo}>
              {paymentOptions.map((option) => {
                const selected = paymentMethod === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionButton, selected && styles.optionActive]}
                    onPress={() => setPaymentMethod(option.id)}
                  >
                    <Ionicons name={option.icon} size={17} color={selected ? colors.primary : colors.muted} />
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.createButton, submitting && styles.disabled]}
              onPress={createOrder}
              disabled={submitting}
            >
              <Text style={styles.createButtonText}>{submitting ? "Enviando…" : "Confirmar pedido"}</Text>
              {!submitting && <Ionicons name="arrow-forward" size={18} color="#FFF" />}
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  title: { marginTop: 4, color: colors.text, fontSize: 30, fontWeight: "800", letterSpacing: -1 },
  headerTotal: { color: colors.text, fontSize: 20, fontWeight: "900" },
  list: { paddingHorizontal: 16, paddingBottom: 12 },
  emptyList: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 30 },
  empty: { alignItems: "center" },
  emptyTitle: { marginTop: 12, color: colors.text, fontSize: 17, fontWeight: "800" },
  emptyCopy: { marginTop: 5, color: colors.muted, fontSize: 12, textAlign: "center" },
  card: { marginBottom: 10, padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  itemHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  name: { color: colors.text, fontSize: 14, fontWeight: "800" },
  choices: { marginTop: 4, color: colors.muted, fontSize: 10, lineHeight: 15 },
  price: { color: colors.text, fontSize: 14, fontWeight: "900" },
  itemFooter: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 9 },
  qtyButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  quantity: { minWidth: 18, color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "center" },
  removeText: { color: colors.danger, fontSize: 10, fontWeight: "700" },
  checkoutWrap: { maxHeight: "58%", borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, shadowColor: "#191714", shadowOpacity: .07, shadowRadius: 20, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  checkout: { padding: 18, paddingBottom: 28 },
  sectionTitle: { marginBottom: 10, color: colors.text, fontSize: 12, fontWeight: "800" },
  optionGrid: { marginBottom: 17, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionGridTwo: { marginBottom: 17, flexDirection: "row", gap: 8 },
  optionButton: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surfaceMuted },
  optionActive: { borderColor: "#F8B98E", backgroundColor: colors.primarySoft },
  optionText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  optionTextActive: { color: colors.primaryDark },
  field: { marginBottom: 13 },
  label: { marginBottom: 6, color: colors.text, fontSize: 10, fontWeight: "700" },
  input: { minHeight: 47, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surfaceMuted, color: colors.text, fontSize: 13 },
  addressSection: { marginBottom: 4 },
  addressList: { gap: 8, marginBottom: 9 },
  addressCard: { minHeight: 54, padding: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.surfaceMuted },
  addressActive: { borderColor: "#F8B98E", backgroundColor: colors.primarySoft },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  radioActive: { borderWidth: 5, borderColor: colors.primary },
  addressText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  addressDetails: { marginTop: 2, color: colors.muted, fontSize: 9 },
  addAddress: { minHeight: 40, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 5 },
  addAddressText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  newAddressCard: { marginBottom: 14, padding: 13, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  defaultRow: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 9 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  defaultText: { flex: 1, color: colors.muted, fontSize: 10 },
  totalRow: { marginTop: 2, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  totalLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  totalValue: { color: colors.text, fontSize: 25, fontWeight: "900", letterSpacing: -.7 },
  createButton: { minHeight: 54, marginTop: 14, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary },
  createButtonText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: .55 }
});
