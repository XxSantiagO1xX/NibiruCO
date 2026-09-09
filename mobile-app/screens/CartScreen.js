import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useContext, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../context/AppContext";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import Header from "../components/Header";
import ServiceTypeSelector from "../components/ServiceTypeSelector";
import ProductImage from "../components/ProductImage";
import EmptyState from "../components/EmptyState";

export default function CartScreen({ navigation }) {
  const { cart, removeFromCart, updateQuantity, clearCart, cartTotal, user, token } =
    useContext(AppContext);

  const [serviceType, setServiceType] = useState("local"); // 'local' | 'llevar' | 'domicilio'
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");

  // Delivery zones & fee
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  // Payment methods
  const [paymentMethod, setPaymentMethod] = useState("efectivo"); // 'efectivo' | 'tarjeta' | 'transferencia' | 'pago_en_app'
  const [cashPaidWith, setCashPaidWith] = useState("");

  // Addresses state
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  // Submit order loading state
  const [submitting, setSubmitting] = useState(false);

  // Load delivery zones
  useEffect(() => {
    async function loadZones() {
      try {
        const res = await axios.get(`${API_URL}/deliveries/zones`);
        if (Array.isArray(res.data)) {
          setZones(res.data);
          if (res.data.length > 0 && !selectedZoneId) {
            setSelectedZoneId(res.data[0].id);
          }
        }
      } catch (err) {
        console.log("Error loading delivery zones:", err.message);
      }
    }
    loadZones();
  }, []);

  // Set default customer name from user profile
  useEffect(() => {
    if (user?.name && !customerName) {
      setCustomerName(user.name);
    }
  }, [user, customerName]);

  // Load user addresses if token available
  const loadAddresses = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingAddresses(true);
      const res = await axios.get(`${API_URL}/users/addresses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setAddresses(res.data);
        // Select default address if none selected
        if (res.data.length > 0 && !selectedAddressId) {
          const def = res.data.find((a) => a.is_default) || res.data[0];
          setSelectedAddressId(def.id);
        }
      }
    } catch (err) {
      console.log("Error loading addresses:", err?.response?.data || err.message);
    } finally {
      setLoadingAddresses(false);
    }
  }, [token, selectedAddressId]);

  useEffect(() => {
    if (serviceType === "domicilio") {
      loadAddresses();
    }
  }, [serviceType, loadAddresses]);

  // Create Order handler
  const handleCreateOrder = async () => {
    if (!token) {
      Alert.alert(
        "Inicia Sesión",
        "Debes iniciar sesión para confirmar tu pedido.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Iniciar Sesión", onPress: () => navigation.navigate("Login") }
        ]
      );
      return;
    }

    if (cart.length === 0) {
      Alert.alert("Carrito Vacío", "Agrega productos antes de confirmar el pedido.");
      return;
    }

    if (serviceType === "domicilio" && !selectedAddressId) {
      Alert.alert(
        "Dirección Requerida",
        "Por favor selecciona o registra una dirección para tu entrega a domicilio.",
        [
          { text: "Entendido", style: "cancel" },
          {
            text: "Agregar Dirección",
            onPress: () => navigation.navigate("Addresses")
          }
        ]
      );
      return;
    }

    try {
      setSubmitting(true);

      // Build payload matching backend orders API
      const itemsPayload = cart.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        choices: item.choices || []
      }));

      const payload = {
        items: itemsPayload,
        type: serviceType,
        service_type: serviceType,
        customer_name: customerName.trim() || undefined,
        address_id: serviceType === "domicilio" ? selectedAddressId : undefined,
        delivery_zone_id: serviceType === "domicilio" ? selectedZoneId : undefined,
        payment_method: paymentMethod,
        cash_paid_with: paymentMethod === "efectivo" && cashPaidWith ? Number(cashPaidWith) : undefined
      };

      const res = await axios.post(`${API_URL}/orders`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const createdOrder = res.data;
      const folioStr = createdOrder.folio
        ? `Folio F${String(createdOrder.folio).padStart(3, "0")}`
        : `Pedido #${createdOrder.id}`;

      clearCart();

      Alert.alert(
        "¡Pedido Registrado con Éxito!",
        `Tu pedido (${folioStr}) ha sido recibido por la cocina.${
          createdOrder.delivery_pin ? ` Tu PIN de entrega es ${createdOrder.delivery_pin}.` : ""
        } Puedes darle seguimiento en tiempo real.`,
        [
          {
            text: "Ver Mis Pedidos",
            onPress: () => navigation.navigate("Pedidos")
          }
        ]
      );
    } catch (err) {
      console.log("Create order error:", err?.response?.data || err.message);
      const message =
        err?.response?.data?.message || "No se pudo procesar tu pedido.";
      Alert.alert("Error al Crear Pedido", message);
    } finally {
      setSubmitting(false);
    }
  };

  // Render individual cart item card
  const renderCartItem = ({ item }) => {
    const isCombo = item.product_kind === "combo";
    const itemTotal = item.unit_price * item.quantity;

    return (
      <View style={styles.itemCard}>
        <ProductImage
          imagePath={item.image}
          style={styles.itemImage}
          borderRadius={12}
        />

        <View style={styles.itemInfo}>
          <View style={styles.itemTitleRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <TouchableOpacity
              onPress={() => removeFromCart(item.key)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>

          {isCombo && item.choices?.length > 0 ? (
            <View style={styles.comboChoicesBox}>
              {item.choices.map((choice, idx) => (
                <Text key={idx} style={styles.choiceText}>
                  • {choice.group_name}: <Text style={{ fontWeight: "700" }}>{choice.option_name}</Text>
                  {Number(choice.extra_price) > 0 ? ` (+$${Number(choice.extra_price).toFixed(2)})` : ""}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.itemBottomRow}>
            <Text style={styles.itemPrice}>${itemTotal.toFixed(2)}</Text>

            {/* Qty controller */}
            <View style={styles.qtyBox}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(item.key, -1)}
              >
                <Ionicons name="remove" size={14} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(item.key, 1)}
              >
                <Ionicons name="add" size={14} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (cart.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Tu Carrito" showBrandMark={false} />
        <EmptyState
          icon="cart-outline"
          title="Tu carrito está vacío"
          description="Explora nuestro menú diario de hoy y elige tus platillos o combos favoritos."
          actionLabel="Explorar Menú"
          onAction={() => navigation.navigate("Productos")}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <Header
          title="Tu Carrito"
          subtitle={`${cart.length} producto(s) en orden`}
          rightAction={
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                Alert.alert(
                  "Vaciar Carrito",
                  "¿Deseas eliminar todos los productos de tu carrito?",
                  [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Vaciar", style: "destructive", onPress: clearCart }
                  ]
                );
              }}
            >
              <Text style={styles.clearBtnText}>Vaciar</Text>
            </TouchableOpacity>
          }
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cart Items List */}
          <View style={styles.itemsSection}>
            <Text style={styles.sectionHeading}>Platillos & Combos</Text>
            <FlatList
              data={cart}
              keyExtractor={(item) => item.key}
              renderItem={renderCartItem}
              scrollEnabled={false}
            />
          </View>

          {/* Service Type Selector */}
          <ServiceTypeSelector
            selected={serviceType}
            onSelect={setServiceType}
          />

          {/* Delivery Address Section if 'domicilio' */}
          {serviceType === "domicilio" ? (
            <View style={styles.addressSection}>
              <View style={styles.addressSectionHeader}>
                <Text style={styles.sectionHeading}>Dirección de Entrega</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate("Addresses")}
                >
                  <Text style={styles.manageAddressText}>Administrar</Text>
                </TouchableOpacity>
              </View>

              {loadingAddresses ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
              ) : addresses.length === 0 ? (
                <View style={styles.noAddressCard}>
                  <Ionicons name="location-outline" size={24} color={colors.primary} />
                  <Text style={styles.noAddressTitle}>No tienes direcciones guardadas</Text>
                  <TouchableOpacity
                    style={styles.addAddressBtn}
                    onPress={() => navigation.navigate("Addresses")}
                  >
                    <Text style={styles.addAddressBtnText}>+ Agregar Dirección</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.addressList}>
                  {addresses.map((addr) => {
                    const isSelected = selectedAddressId === addr.id;
                    return (
                      <TouchableOpacity
                        key={addr.id}
                        style={[
                          styles.addressCard,
                          isSelected && styles.addressCardSelected
                        ]}
                        onPress={() => setSelectedAddressId(addr.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isSelected ? "radio-button-on" : "radio-button-off"}
                          size={18}
                          color={isSelected ? colors.primary : colors.muted}
                        />
                        <View style={styles.addressInfo}>
                          <Text style={styles.addressLabel}>
                            {addr.label || "Casa"}
                            {addr.is_default ? " (Principal)" : ""}
                          </Text>
                          <Text style={styles.addressStreet} numberOfLines={1}>
                            {addr.address}
                          </Text>
                          {addr.details ? (
                            <Text style={styles.addressDetails} numberOfLines={1}>
                              Ref: {addr.details}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Delivery Zone Selector */}
              {zones.length > 0 ? (
                <View style={styles.zoneSection}>
                  <Text style={styles.subHeading}>Zona de Entrega</Text>
                  <View style={styles.zoneGrid}>
                    {zones.map((z) => {
                      const isZSelected = selectedZoneId === z.id;
                      return (
                        <TouchableOpacity
                          key={z.id}
                          style={[
                            styles.zoneCard,
                            isZSelected && styles.zoneCardSelected
                          ]}
                          onPress={() => setSelectedZoneId(z.id)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.zoneName,
                              isZSelected && styles.zoneNameSelected
                            ]}
                          >
                            {z.name}
                          </Text>
                          <Text
                            style={[
                              styles.zoneFee,
                              isZSelected && styles.zoneFeeSelected
                            ]}
                          >
                            +${Number(z.fee).toFixed(2)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Payment Method Selector */}
          <View style={styles.paymentSection}>
            <Text style={styles.sectionHeading}>Método de Pago</Text>
            <View style={styles.paymentGrid}>
              {[
                { id: "efectivo", label: "Efectivo", icon: "cash-outline" },
                { id: "tarjeta", label: "Tarjeta", icon: "card-outline" },
                { id: "transferencia", label: "Transferencia", icon: "swap-horizontal-outline" },
                { id: "pago_en_app", label: "Pago en App", icon: "phone-portrait-outline" }
              ].map((p) => {
                const isSelected = paymentMethod === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.paymentCard,
                      isSelected && styles.paymentCardSelected
                    ]}
                    onPress={() => setPaymentMethod(p.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={p.icon}
                      size={20}
                      color={isSelected ? colors.primary : colors.muted}
                    />
                    <Text
                      style={[
                        styles.paymentLabel,
                        isSelected && styles.paymentLabelSelected
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Cash paid with and change calculation */}
            {paymentMethod === "efectivo" && (
              <View style={styles.cashChangeBox}>
                <Text style={styles.cashChangeLabel}>¿Con cuánto vas a pagar? (opcional)</Text>
                <View style={styles.cashInputRow}>
                  <Text style={styles.cashPrefix}>$</Text>
                  <TextInput
                    style={styles.cashInput}
                    placeholder="Ej. 200, 500"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="numeric"
                    value={cashPaidWith}
                    onChangeText={setCashPaidWith}
                  />
                </View>
                {Number(cashPaidWith) > 0 ? (
                  <Text style={styles.changeNotice}>
                    {Number(cashPaidWith) >= (cartTotal + (serviceType === "domicilio" && zones.find((z) => z.id === selectedZoneId) ? Number(zones.find((z) => z.id === selectedZoneId).fee || 0) : 0))
                      ? `Tu cambio estimado será de: $${(Number(cashPaidWith) - (cartTotal + (serviceType === "domicilio" && zones.find((z) => z.id === selectedZoneId) ? Number(zones.find((z) => z.id === selectedZoneId).fee || 0) : 0))).toFixed(2)}`
                      : "El monto ingresado es menor al total"}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          {/* Customer Personalization */}
          <View style={styles.notesSection}>
            <Text style={styles.sectionHeading}>Datos del Pedido</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre de quien recibe (opcional)"
              placeholderTextColor={colors.textSubtle}
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          {/* Order Summary breakdown */}
          {(() => {
            const activeZone = zones.find((z) => z.id === selectedZoneId);
            const deliveryFee = serviceType === "domicilio" && activeZone ? Number(activeZone.fee || 0) : 0;
            const finalTotal = cartTotal + deliveryFee;

            return (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Resumen de Cuenta</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>${cartTotal.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Servicio ({serviceType})</Text>
                  <Text style={styles.summaryValueFree}>
                    {deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : "Incluido"}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total a Pagar</Text>
                  <Text style={styles.totalAmount}>${finalTotal.toFixed(2)}</Text>
                </View>
              </View>
            );
          })()}
        </ScrollView>

        {/* Fixed Footer Checkout Button */}
        {(() => {
          const activeZone = zones.find((z) => z.id === selectedZoneId);
          const deliveryFee = serviceType === "domicilio" && activeZone ? Number(activeZone.fee || 0) : 0;
          const finalTotal = cartTotal + deliveryFee;

          return (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.checkoutBtn, submitting && styles.checkoutBtnDisabled]}
                onPress={handleCreateOrder}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.checkoutBtnText}>
                      Confirmar Pedido · ${finalTotal.toFixed(2)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  container: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  clearBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700"
  },
  itemsSection: {
    marginBottom: 10
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -0.2
  },
  itemCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: 12
  },
  itemImage: {
    width: 68,
    height: 68
  },
  itemInfo: {
    flex: 1,
    justifyContent: "space-between"
  },
  itemTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  itemName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    flex: 1,
    marginRight: 6
  },
  comboChoicesBox: {
    backgroundColor: colors.surfaceMuted,
    padding: 6,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 4
  },
  choiceText: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 14
  },
  itemBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.primary
  },
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  qtyText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    minWidth: 20,
    textAlign: "center"
  },
  addressSection: {
    marginVertical: 10
  },
  addressSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  manageAddressText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary
  },
  noAddressCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 6
  },
  noAddressTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  addAddressBtn: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 6
  },
  addAddressBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800"
  },
  addressList: {
    gap: 8
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 10
  },
  addressCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  addressInfo: {
    flex: 1
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text
  },
  addressStreet: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1
  },
  addressDetails: {
    fontSize: 10,
    color: colors.textSubtle,
    marginTop: 1
  },
  notesSection: {
    marginVertical: 10
  },
  input: {
    backgroundColor: colors.surface,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 13,
    color: colors.text
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 12
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.muted
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text
  },
  summaryValueFree: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.success
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 10
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: -0.5
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  checkoutBtn: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  checkoutBtnDisabled: {
    opacity: 0.6
  },
  checkoutBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  zoneSection: {
    marginTop: 12
  },
  subHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 8
  },
  zoneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  zoneCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center"
  },
  zoneCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  zoneName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text
  },
  zoneNameSelected: {
    color: colors.primary
  },
  zoneFee: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    marginTop: 2
  },
  zoneFeeSelected: {
    color: colors.primary
  },
  paymentSection: {
    marginVertical: 10
  },
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  paymentCard: {
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  paymentCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  paymentLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  paymentLabelSelected: {
    color: colors.primary,
    fontWeight: "800"
  },
  cashChangeBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  cashChangeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 6
  },
  cashInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    height: 40
  },
  cashPrefix: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
    marginRight: 4
  },
  cashInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontWeight: "700"
  },
  changeNotice: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
    marginTop: 6
  }
});