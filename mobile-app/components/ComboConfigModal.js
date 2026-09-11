import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";
import ProductImage from "./ProductImage";

export default function ComboConfigModal({
  visible,
  combo,
  onClose,
  onAddToCart
}) {
  // selectedOptions: { [groupId]: [optionId, ...] }
  const [selectedOptions, setSelectedOptions] = useState({});
  const [quantity, setQuantity] = useState(1);

  // Initialize or reset selections when modal opens with a combo
  useEffect(() => {
    if (visible && combo) {
      const initial = {};
      (combo.groups || []).forEach((group) => {
        initial[group.id] = [];
      });
      setSelectedOptions(initial);
      setQuantity(1);
    }
  }, [visible, combo]);

  const groups = combo?.groups || [];

  // Toggle or select option in a group
  const handleSelectOption = (groupId, optionId, maxSelect) => {
    setSelectedOptions((prev) => {
      const current = prev[groupId] || [];
      const isSelected = current.includes(optionId);

      if (maxSelect === 1) {
        // Radio behavior: if already selected and minSelect is 0, allow deselect, else replace
        if (isSelected) {
          const group = groups.find((g) => g.id === groupId);
          if (group && group.min_select === 0) {
            return { ...prev, [groupId]: [] };
          }
          return prev;
        }
        return { ...prev, [groupId]: [optionId] };
      }

      // Multi-select behavior
      if (isSelected) {
        return {
          ...prev,
          [groupId]: current.filter((id) => id !== optionId)
        };
      }

      if (current.length < maxSelect) {
        return {
          ...prev,
          [groupId]: [...current, optionId]
        };
      }

      return prev;
    });
  };

  // Check validity for each group
  const validationInfo = useMemo(() => {
    let isValid = true;
    const errors = [];
    let extraTotal = 0;
    const choicesList = [];

    groups.forEach((group) => {
      const selected = selectedOptions[group.id] || [];
      const count = selected.length;
      const min = Number(group.min_select || 0);
      const max = Number(group.max_select || 1);

      const isGroupValid = count >= min && count <= max;
      if (!isGroupValid) {
        isValid = false;
        if (min === max) {
          errors.push(`Elige ${min} opción(es) en ${group.name}`);
        } else {
          errors.push(`Elige entre ${min} y ${max} opción(es) en ${group.name}`);
        }
      }

      // Calculate extra price and build normalized choices
      selected.forEach((optId) => {
        const option = (group.options || []).find((o) => o.option_product_id === optId);
        if (option) {
          const extra = Number(option.extra_price || 0);
          extraTotal += extra;
          choicesList.push({
            group_id: Number(group.id),
            group_name: group.name,
            option_product_id: Number(option.option_product_id),
            option_name: option.name,
            extra_price: extra
          });
        }
      });
    });

    return {
      isValid,
      errors,
      extraTotal,
      choicesList
    };
  }, [groups, selectedOptions]);

  const basePrice = Number(combo?.price || 0);
  const unitPrice = basePrice + validationInfo.extraTotal;
  const totalPrice = unitPrice * quantity;

  const handleConfirm = () => {
    if (!validationInfo.isValid) return;

    onAddToCart({
      combo,
      choices: validationInfo.choicesList,
      quantity,
      unitPrice,
      totalPrice
    });
    onClose();
  };

  if (!combo) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.comboBadge}>
                <Ionicons name="layers" size={14} color={colors.primary} />
                <Text style={styles.comboBadgeText}>Combo Especial</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.comboName}>{combo.name}</Text>
            <Text style={styles.comboPrice}>
              Desde ${basePrice.toFixed(2)}
            </Text>
          </View>

          {/* Groups & Options List */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {combo.image ? (
              <ProductImage
                imagePath={combo.image}
                style={styles.heroImage}
                borderRadius={18}
              />
            ) : null}

            {groups.length === 0 ? (
              <View style={styles.emptyGroups}>
                <Text style={styles.emptyGroupsText}>
                  Este combo no tiene grupos configurados aún.
                </Text>
              </View>
            ) : (
              groups.map((group) => {
                const selected = selectedOptions[group.id] || [];
                const min = Number(group.min_select || 0);
                const max = Number(group.max_select || 1);
                const isSatisfied = selected.length >= min && selected.length <= max;
                const isRequired = min > 0;

                return (
                  <View key={group.id} style={styles.groupCard}>
                    <View style={styles.groupHeader}>
                      <View style={styles.groupTitleCol}>
                        <Text style={styles.groupName}>{group.name}</Text>
                        <Text style={styles.groupRule}>
                          {min === max
                            ? `Selecciona ${min}`
                            : min === 0
                            ? `Opcional (hasta ${max})`
                            : `Selecciona de ${min} a ${max}`}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statusPill,
                          isSatisfied ? styles.statusPillValid : styles.statusPillPending
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            isSatisfied ? styles.statusTextValid : styles.statusTextPending
                          ]}
                        >
                          {selected.length}/{max} {isSatisfied ? "✓" : isRequired ? "Requerido" : ""}
                        </Text>
                      </View>
                    </View>

                    {/* Options list */}
                    <View style={styles.optionsList}>
                      {(group.options || []).map((option) => {
                        const isOptSelected = selected.includes(option.option_product_id);
                        const extra = Number(option.extra_price || 0);
                        const isAvailable = option.available !== false && option.active !== false;

                        return (
                          <TouchableOpacity
                            key={option.id || option.option_product_id}
                            style={[
                              styles.optionRow,
                              isOptSelected && styles.optionRowSelected,
                              !isAvailable && styles.optionRowDisabled
                            ]}
                            onPress={() =>
                              isAvailable &&
                              handleSelectOption(group.id, option.option_product_id, max)
                            }
                            activeOpacity={0.7}
                            disabled={!isAvailable}
                          >
                            <View style={styles.optionLeft}>
                              <View
                                style={[
                                  styles.indicator,
                                  max === 1 ? styles.radio : styles.checkbox,
                                  isOptSelected && styles.indicatorSelected
                                ]}
                              >
                                {isOptSelected && (
                                  <Ionicons
                                    name={max === 1 ? "checkmark" : "checkmark"}
                                    size={12}
                                    color="#ffffff"
                                  />
                                )}
                              </View>

                              <View style={styles.optionNameCol}>
                                <Text
                                  style={[
                                    styles.optionName,
                                    isOptSelected && styles.optionNameSelected,
                                    !isAvailable && styles.optionNameDisabled
                                  ]}
                                >
                                  {option.name}
                                </Text>
                                {!isAvailable && (
                                  <Text style={styles.unavailableTag}>Agotado</Text>
                                )}
                              </View>
                            </View>

                            {extra > 0 ? (
                              <View style={styles.extraBadge}>
                                <Text style={styles.extraBadgeText}>
                                  +${extra.toFixed(2)}
                                </Text>
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer with Quantity and Add Button */}
          <View style={styles.footer}>
            {/* Validation errors summary */}
            {!validationInfo.isValid && validationInfo.errors.length > 0 && (
              <View style={styles.errorNotice}>
                <Ionicons name="alert-circle" size={16} color={colors.warning} />
                <Text style={styles.errorNoticeText}>
                  {validationInfo.errors[0]}
                </Text>
              </View>
            )}

            <View style={styles.footerRow}>
              {/* Quantity selector */}
              <View style={styles.qtyControl}>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Ionicons
                    name="remove"
                    size={16}
                    color={quantity <= 1 ? colors.border : colors.text}
                  />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => setQuantity((q) => q + 1)}
                >
                  <Ionicons name="add" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Submit Pill Button */}
              <TouchableOpacity
                style={[
                  styles.addButton,
                  !validationInfo.isValid && styles.addButtonDisabled
                ]}
                onPress={handleConfirm}
                disabled={!validationInfo.isValid}
                activeOpacity={0.85}
              >
                <Ionicons name="cart" size={18} color="#ffffff" />
                <Text style={styles.addButtonText}>
                  Agregar · ${totalPrice.toFixed(2)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(25, 23, 21, 0.6)",
    justifyContent: "flex-end"
  },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "90%",
    minHeight: "60%"
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  comboBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  comboBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  comboName: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: 8
  },
  comboPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30
  },
  heroImage: {
    width: "100%",
    height: 160,
    marginBottom: 16
  },
  emptyGroups: {
    padding: 30,
    alignItems: "center"
  },
  emptyGroupsText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center"
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12
  },
  groupTitleCol: {
    flex: 1,
    marginRight: 10
  },
  groupName: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3
  },
  groupRule: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    fontWeight: "500"
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  statusPillValid: {
    backgroundColor: colors.successSoft
  },
  statusPillPending: {
    backgroundColor: colors.warningSoft
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: "800"
  },
  statusTextValid: {
    color: colors.success
  },
  statusTextPending: {
    color: colors.warning
  },
  optionsList: {
    gap: 8
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  optionRowSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  optionRowDisabled: {
    opacity: 0.5
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10
  },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff"
  },
  radio: {
    borderRadius: 11
  },
  checkbox: {
    borderRadius: 6
  },
  indicatorSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  optionNameCol: {
    flex: 1
  },
  optionName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text
  },
  optionNameSelected: {
    color: colors.primaryDark,
    fontWeight: "700"
  },
  optionNameDisabled: {
    color: colors.muted,
    textDecorationLine: "line-through"
  },
  unavailableTag: {
    fontSize: 10,
    color: colors.danger,
    fontWeight: "700",
    marginTop: 2
  },
  extraBadge: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  extraBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight
  },
  errorNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 12
  },
  errorNoticeText: {
    color: colors.warning,
    fontSize: 11.5,
    fontWeight: "700",
    flex: 1
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6
  },
  qtyButton: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  qtyText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    minWidth: 24,
    textAlign: "center"
  },
  // Pill button (borderRadius: 25)
  addButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 25,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  addButtonDisabled: {
    backgroundColor: colors.muted,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.6
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  }
});
