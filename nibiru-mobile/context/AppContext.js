import { createContext, useState } from "react";

export const AppContext = createContext();

function buildCartKey(productId, choices = []) {
  const choiceKey = choices
    .map((choice) => `${choice.group_id}:${choice.option_product_id}`)
    .sort()
    .join("|");
  return `${productId}:${choiceKey || "base"}`;
}

export default function AppProvider({ children }) {
  const [cart, setCart] = useState([]);

  const addToCart = (product, choices = []) => {
    const normalizedChoices = Array.isArray(choices) ? choices : [];
    const cartKey = buildCartKey(product.id, normalizedChoices);
    const extra = normalizedChoices.reduce((sum, choice) => sum + Number(choice.extra_price || 0), 0);
    const unitPrice = Number(product.price) + extra;

    setCart((prev) => {
      const existing = prev.find((item) => item.cart_key === cartKey);
      if (existing) {
        return prev.map((item) =>
          item.cart_key === cartKey
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...prev,
        {
          cart_key: cartKey,
          product_id: Number(product.id),
          name: product.name,
          price: unitPrice,
          base_price: Number(product.price),
          quantity: 1,
          product_kind: product.product_kind || "regular",
          choices: normalizedChoices
        }
      ];
    });
  };

  const updateQuantity = (cartKey, delta) => {
    setCart((prev) =>
      prev
        .map((item) => item.cart_key === cartKey ? { ...item, quantity: item.quantity + delta } : item)
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (cartKey) => {
    setCart((prev) => prev.filter((item) => item.cart_key !== cartKey));
  };

  const clearCart = () => setCart([]);

  return (
    <AppContext.Provider value={{ cart, addToCart, updateQuantity, removeFromCart, clearCart }}>
      {children}
    </AppContext.Provider>
  );
}
