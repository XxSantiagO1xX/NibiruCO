import { createContext, useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { io } from "socket.io-client";
import { API_URL } from "../config/api";

export const AppContext = createContext();

export default function AppProvider({ children }) {
  // Auth state
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Cart state
  const [cart, setCart] = useState([]);

  // Socket state
  const [socket, setSocket] = useState(null);
  const [orderUpdateSignal, setOrderUpdateSignal] = useState(0);
  const [tablesUpdateSignal, setTablesUpdateSignal] = useState(0);
  const [tripsUpdateSignal, setTripsUpdateSignal] = useState(0);
  const [offerUpdateSignal, setOfferUpdateSignal] = useState(0);

  // Configure global Axios headers & interceptor
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  // Check saved session on mount
  const checkAuth = useCallback(async () => {
    try {
      setLoadingAuth(true);
      const storedToken = await AsyncStorage.getItem("token");
      const storedUser = await AsyncStorage.getItem("user");

      if (storedToken) {
        setToken(storedToken);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (_) {}
        }

        // Verify with /users/me
        try {
          const res = await axios.get(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          if (res.data) {
            setUser(res.data);
            await AsyncStorage.setItem("user", JSON.stringify(res.data));
          }
        } catch (verifyErr) {
          if (verifyErr?.response?.status === 401) {
            await logout();
          }
        }
      }
    } catch (err) {
      console.error("Error checking auth:", err);
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Setup Socket.io
  useEffect(() => {
    const s = io(API_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    s.on("connect", () => {
      console.log("Socket conectado:", s.id);
    });

    s.on("order-updated", () => {
      setOrderUpdateSignal((v) => v + 1);
    });

    s.on("orders-updated", () => {
      setOrderUpdateSignal((v) => v + 1);
    });

    s.on("counter-updated", () => {
      setOrderUpdateSignal((v) => v + 1);
    });

    s.on("tables-updated", () => {
      setTablesUpdateSignal((v) => v + 1);
    });

    s.on("waiter-table-ready", () => {
      setTablesUpdateSignal((v) => v + 1);
      setOrderUpdateSignal((v) => v + 1);
    });

    s.on("trips-updated", () => {
      setTripsUpdateSignal((v) => v + 1);
    });

    s.on("delivery-offer-created", () => {
      setOfferUpdateSignal((v) => v + 1);
      setTripsUpdateSignal((v) => v + 1);
    });

    s.on("delivery-offer-expired", () => {
      setOfferUpdateSignal((v) => v + 1);
      setTripsUpdateSignal((v) => v + 1);
    });

    s.on("delivery-offer-accepted", () => {
      setOfferUpdateSignal((v) => v + 1);
      setTripsUpdateSignal((v) => v + 1);
    });

    s.on("delivery-offer-rejected", () => {
      setOfferUpdateSignal((v) => v + 1);
      setTripsUpdateSignal((v) => v + 1);
    });

    s.on("driver-status-updated", () => {
      setOfferUpdateSignal((v) => v + 1);
      setTripsUpdateSignal((v) => v + 1);
    });

    s.on("delivery-config-updated", () => {
      setOfferUpdateSignal((v) => v + 1);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Auth methods
  const login = async (phone, password) => {
    const res = await axios.post(`${API_URL}/auth/login-phone`, {
      phone: String(phone).trim(),
      password
    });

    if (res.data?.token) {
      const receivedToken = res.data.token;
      const receivedUser = res.data.user;

      await AsyncStorage.setItem("token", receivedToken);
      if (receivedUser) {
        await AsyncStorage.setItem("user", JSON.stringify(receivedUser));
      }

      setToken(receivedToken);
      setUser(receivedUser);
      return res.data;
    }
    throw new Error(res.data?.message || "Error al iniciar sesión");
  };

  const register = async ({ name, phone, email, password }) => {
    const res = await axios.post(`${API_URL}/auth/register-phone`, {
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: email ? String(email).trim() : null,
      password
    });

    return res.data;
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem("token");
      await AsyncStorage.removeItem("user");
    } catch (_) {}
    setToken(null);
    setUser(null);
    setCart([]);
  };

  // Cart methods
  const addToCart = useCallback((product, customChoices = [], customQuantity = 1) => {
    setCart((prev) => {
      const isCombo = product.product_kind === "combo";
      const choices = Array.isArray(customChoices) ? customChoices : [];
      const quantityToAdd = Number(customQuantity) || 1;

      // Calculate choices extra price
      const choicesExtra = choices.reduce(
        (sum, c) => sum + (Number(c.extra_price) || 0),
        0
      );

      // Generate unique key based on product id and sorted choices
      const choicesKey = choices
        .map((c) => `${c.group_id}-${c.option_product_id}`)
        .sort()
        .join("|");

      const itemKey = isCombo
        ? `combo-${product.id}-${choicesKey}`
        : `regular-${product.id}`;

      const existingIndex = prev.findIndex((i) => i.key === itemKey);

      const basePrice = Number(product.price) || 0;
      const unitPrice = basePrice + choicesExtra;

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantityToAdd
        };
        return updated;
      }

      return [
        ...prev,
        {
          key: itemKey,
          product_id: product.id,
          name: product.name,
          image: product.image,
          product_kind: product.product_kind || "regular",
          base_price: basePrice,
          choices_extra: choicesExtra,
          unit_price: unitPrice,
          choices,
          quantity: quantityToAdd
        }
      ];
    });
  }, []);

  const removeFromCart = useCallback((itemKey) => {
    setCart((prev) => prev.filter((i) => i.key !== itemKey));
  }, []);

  const updateQuantity = useCallback((itemKey, delta) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.key === itemKey) {
            const nextQty = i.quantity + delta;
            return nextQty > 0 ? { ...i, quantity: nextQty } : null;
          }
          return i;
        })
        .filter(Boolean)
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0
    );
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  return (
    <AppContext.Provider
      value={{
        // Auth
        token,
        user,
        loadingAuth,
        login,
        register,
        logout,
        checkAuth,

        // Cart
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,

        // Real-time socket & signals
        socket,
        orderUpdateSignal,
        tablesUpdateSignal,
        tripsUpdateSignal,
        offerUpdateSignal
      }}
    >
      {children}
    </AppContext.Provider>
  );
}