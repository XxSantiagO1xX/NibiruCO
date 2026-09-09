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
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AppContext } from "../context/AppContext";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import Header from "../components/Header";
import EmptyState from "../components/EmptyState";

export default function AddressesScreen({ navigation }) {
  const { token } = useContext(AppContext);

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New address form fields
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("Casa");
  const [addressText, setAddressText] = useState("");
  const [details, setDetails] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const loadAddresses = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/users/addresses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setAddresses(res.data);
      }
    } catch (err) {
      console.log("Error loading addresses:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  // Create address handler
  const handleSaveAddress = async () => {
    const trimmed = addressText.trim();
    if (!trimmed) {
      Alert.alert("Dirección requerida", "Por favor ingresa calle y número.");
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/users/addresses`,
        {
          label: label.trim() || "Casa",
          address: trimmed,
          details: details.trim() || undefined,
          is_default: isDefault || addresses.length === 0
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAddressText("");
      setDetails("");
      setShowForm(false);
      loadAddresses();
      Alert.alert("Dirección guardada", "Tu dirección ha sido registrada exitosamente.");
    } catch (err) {
      console.log("Save address error:", err?.response?.data || err.message);
      Alert.alert("Error", err?.response?.data?.message || "No se pudo guardar la dirección.");
    } finally {
      setSaving(false);
    }
  };

  // Set default address
  const handleSetDefault = async (addressId) => {
    try {
      await axios.patch(
        `${API_URL}/users/addresses/${addressId}/default`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadAddresses();
    } catch (err) {
      console.log("Set default address error:", err?.response?.data || err.message);
    }
  };

  // Delete address
  const handleDeleteAddress = (addressId) => {
    Alert.alert(
      "Eliminar Dirección",
      "¿Deseas eliminar esta dirección de tu cuenta?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/users/addresses/${addressId}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              loadAddresses();
            } catch (err) {
              console.log("Delete address error:", err?.response?.data || err.message);
              Alert.alert("Error", "No se pudo eliminar la dirección.");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="Mis Direcciones"
        subtitle="Entrega a Domicilio"
        onBack={() => navigation.goBack()}
        showBrandMark={false}
        rightAction={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowForm(!showForm)}
          >
            <Ionicons
              name={showForm ? "close" : "add"}
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Add Address Collapsible Form */}
          {showForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Nueva Dirección</Text>

              {/* Label selector */}
              <View style={styles.labelRow}>
                {["Casa", "Trabajo", "Otro"].map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[
                      styles.labelChip,
                      label === l && styles.labelChipActive
                    ]}
                    onPress={() => setLabel(l)}
                  >
                    <Text
                      style={[
                        styles.labelChipText,
                        label === l && styles.labelChipTextActive
                      ]}
                    >
                      {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Street & Number */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputHeading}>Calle, número y colonia *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Av. Reforma 123, Col. Centro"
                  placeholderTextColor={colors.textSubtle}
                  value={addressText}
                  onChangeText={setAddressText}
                />
              </View>

              {/* Reference / Details */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputHeading}>Referencias de entrega</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Portón blanco, timbre 2B"
                  placeholderTextColor={colors.textSubtle}
                  value={details}
                  onChangeText={setDetails}
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveAddress}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveBtnText}>Guardar Dirección</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Addresses List */}
          <Text style={styles.sectionTitle}>Direcciones Guardadas</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : addresses.length === 0 ? (
            <EmptyState
              icon="location-outline"
              title="Aún no tienes direcciones"
              description="Agrega la dirección donde sueles recibir tus comidas a domicilio."
              actionLabel="+ Agregar Dirección"
              onAction={() => setShowForm(true)}
            />
          ) : (
            <View style={styles.addressList}>
              {addresses.map((addr) => (
                <View key={addr.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.labelBadge}>
                      <Ionicons
                        name={
                          addr.label === "Trabajo"
                            ? "briefcase-outline"
                            : "home-outline"
                        }
                        size={12}
                        color={colors.primary}
                      />
                      <Text style={styles.labelBadgeText}>
                        {addr.label || "Casa"}
                      </Text>
                    </View>

                    {addr.is_default ? (
                      <View style={styles.defaultPill}>
                        <Text style={styles.defaultPillText}>Principal</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleSetDefault(addr.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.makeDefaultText}>Hacer principal</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.addressStreet}>{addr.address}</Text>

                  {addr.details ? (
                    <Text style={styles.addressDetails}>
                      Referencia: {addr.details}
                    </Text>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteAddress(addr.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      <Text style={styles.deleteBtnText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 12
  },
  labelRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14
  },
  labelChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  labelChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  labelChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  labelChipTextActive: {
    color: "#ffffff"
  },
  inputGroup: {
    marginBottom: 12
  },
  inputHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 5
  },
  input: {
    height: 46,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text
  },
  saveBtn: {
    backgroundColor: colors.primary,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6
  },
  saveBtnDisabled: {
    opacity: 0.6
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 10
  },
  addressList: {
    gap: 10
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#1d1814",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  labelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  labelBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary
  },
  defaultPill: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999
  },
  defaultPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success
  },
  makeDefaultText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary
  },
  addressStreet: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 18
  },
  addressDetails: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.danger
  }
});
