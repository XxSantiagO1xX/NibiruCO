import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import Constants from "expo-constants";

/**
 * CONFIGURACIÓN CENTRALIZADA DE API Y WEBSOCKETS
 * Permite cambiar la dirección IP o dominio en un único lugar
 */

// Si se ejecuta en Expo Go, podemos intentar obtener la IP del host del manifiesto o usar un fallback configurable
const getDevServerHost = () => {
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    return `http://${ip}:3000`;
  }
  return "http://192.168.1.86:3000";
};

export const API_URL = getDevServerHost();

console.log("🌐 MealOps API conectada a:", API_URL);

// Instancia de Axios configurada
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
});

// Interceptor para inyectar token JWT automáticamente
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn("Error leyendo token en interceptor de API:", e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Conexión Socket.IO centralizada
export const socket = io(API_URL, {
  autoConnect: true,
  transports: ["websocket"]
});

export default api;
