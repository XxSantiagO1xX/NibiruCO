import { createContext, useState } from "react";

export const AppContext = createContext();

export default function AppProvider({ children }) {

  const [cart, setCart] = useState([]);

  const addToCart = (product) => {

    setCart(prev => {

      const existing = prev.find(
        i => i.product_id === product.id
      );

      if (existing) {

        return prev.map(i =>
          i.product_id === product.id
            ? {
                ...i,
                quantity: i.quantity + 1
              }
            : i
        );
      }

      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1
        }
      ];
    });
  };

  const removeFromCart = (product_id) => {

    setCart(prev =>
      prev
        .map(i =>
          i.product_id === product_id
            ? {
                ...i,
                quantity: i.quantity - 1
              }
            : i
        )
        .filter(i => i.quantity > 0)
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  return (
    <AppContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        clearCart
      }}
    >
      {children}
    </AppContext.Provider>
  );
}