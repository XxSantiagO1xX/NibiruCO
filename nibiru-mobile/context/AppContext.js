import {
  createContext,
  useState
} from "react";

export const AppContext = createContext();

export default function AppProvider({
  children
}) {

  const [cart, setCart] = useState([]);

  /* AGREGAR */
  const addToCart = (product) => {

    setCart(prev => {

      const existing = prev.find(
        item =>
          item.product_id === product.id
      );

      if (existing) {

        return prev.map(item =>

          item.product_id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1
              }
            : item
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

  /* ELIMINAR */
  const removeFromCart = (id) => {

    setCart(prev =>
      prev.filter(
        item => item.product_id !== id
      )
    );
  };

  /* LIMPIAR */
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