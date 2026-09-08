import Constants from "expo-constants";

/**
 * Resuelve dinámicamente la URL del backend:
 * 1. Variable de entorno pública EXPO_PUBLIC_API_URL (si está configurada)
 * 2. Host URI de Metro Bundler cuando se ejecuta en Expo Go / desarrollo
 * 3. Fallback a la IP local por defecto o localhost
 */
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, "");
  }

  // En Expo SDK 57, hostUri provee la IP del servidor de Metro (ej. "192.168.1.86:8081")
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    const ip = hostUri.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return `http://${ip}:3000`;
    }
  }

  return "http://192.168.1.86:3000";
}

export const API_URL = resolveBaseUrl();

/**
 * Resuelve la URL completa de una imagen (relativa o absoluta).
 * Retorna null si la imagen está vacía o es inválida.
 */
export function getImageUrl(imagePath) {
  if (!imagePath || typeof imagePath !== "string") return null;
  const trimmed = imagePath.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${API_URL}${cleanPath}`;
}

export default API_URL;
