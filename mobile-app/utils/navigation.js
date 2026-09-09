import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const NAV_PREFERENCE_KEY = "@mealops_nav_preference";

/**
 * Obtiene la app de navegación preferida guardada ('waze' o 'google_maps').
 */
export async function getNavPreference() {
  try {
    const saved = await AsyncStorage.getItem(NAV_PREFERENCE_KEY);
    return saved === "google_maps" ? "google_maps" : "waze";
  } catch (_) {
    return "waze";
  }
}

/**
 * Guarda la app de navegación preferida ('waze' o 'google_maps').
 */
export async function setNavPreference(pref) {
  try {
    const value = pref === "google_maps" ? "google_maps" : "waze";
    await AsyncStorage.setItem(NAV_PREFERENCE_KEY, value);
    return value;
  } catch (_) {
    return pref;
  }
}

/**
 * Abre la app de navegación según la preferencia del usuario (Waze o Google Maps).
 */
export async function openPreferredNavigation(arg1, arg2, arg3) {
  const pref = await getNavPreference();
  if (pref === "google_maps") {
    return openGoogleMapsNavigation(arg1, arg2, arg3);
  }
  return openWazeNavigation(arg1, arg2, arg3);
}

/**
 * Normaliza los parámetros de navegación aceptando:
 * - (lat, lng, address)
 * - (address, lat, lng)
 * - ({ address, lat, lng, latitude, longitude })
 */
function parseNavArgs(arg1, arg2, arg3) {
  let address = "";
  let lat = null;
  let lng = null;

  if (arg1 && typeof arg1 === "object") {
    address = arg1.address || "";
    lat = arg1.latitude !== undefined ? arg1.latitude : arg1.lat;
    lng = arg1.longitude !== undefined ? arg1.longitude : arg1.lng;
  } else if (
    (typeof arg1 === "number" || (!Number.isNaN(Number(arg1)) && String(arg1).includes("."))) &&
    (typeof arg2 === "number" || (!Number.isNaN(Number(arg2)) && String(arg2).includes(".")))
  ) {
    // (lat, lng, address)
    lat = arg1;
    lng = arg2;
    address = typeof arg3 === "string" ? arg3 : "";
  } else {
    // (address, lat, lng)
    address = typeof arg1 === "string" ? arg1 : "";
    lat = arg2;
    lng = arg3;
  }

  const cleanAddress = String(address || "").trim();
  const validLat = lat !== null && lat !== undefined && !Number.isNaN(Number(lat)) ? Number(lat) : null;
  const validLng = lng !== null && lng !== undefined && !Number.isNaN(Number(lng)) ? Number(lng) : null;
  const hasCoords = validLat !== null && validLng !== null;

  return { address: cleanAddress, lat: validLat, lng: validLng, hasCoords };
}

/**
 * Abre la app de navegación con Waze (o fallback a Google Maps).
 */
export async function openWazeNavigation(arg1, arg2, arg3) {
  const { address, lat, lng, hasCoords } = parseNavArgs(arg1, arg2, arg3);

  const wazeUrl = hasCoords
    ? `waze://?ll=${lat},${lng}&navigate=yes`
    : `waze://?q=${encodeURIComponent(address)}&navigate=yes`;

  const googleUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

  try {
    const supported = await Linking.canOpenURL(wazeUrl);
    if (supported) {
      await Linking.openURL(wazeUrl);
    } else {
      await Linking.openURL(googleUrl);
    }
  } catch (err) {
    console.warn("Error abriendo Waze, intentando Google Maps fallback:", err);
    try {
      await Linking.openURL(googleUrl);
    } catch (fallbackErr) {
      console.error("Error abriendo navegador de mapas:", fallbackErr);
    }
  }
}

/**
 * Abre Google Maps directamente.
 */
export async function openGoogleMapsNavigation(arg1, arg2, arg3) {
  const { address, lat, lng, hasCoords } = parseNavArgs(arg1, arg2, arg3);

  const googleAppUrl = hasCoords
    ? Platform.OS === "android"
      ? `google.navigation:q=${lat},${lng}`
      : `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`
    : Platform.OS === "android"
      ? `google.navigation:q=${encodeURIComponent(address)}`
      : `comgooglemaps://?daddr=${encodeURIComponent(address)}&directionsmode=driving`;

  const webUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

  try {
    const supported = await Linking.canOpenURL(googleAppUrl);
    if (supported) {
      await Linking.openURL(googleAppUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch (_) {
    await Linking.openURL(webUrl).catch(() => {});
  }
}

/**
 * Abre el marcador telefónico para llamar al cliente o restaurante.
 */
export function openPhoneCall(phoneNumber) {
  if (!phoneNumber) return;
  const cleanPhone = String(phoneNumber).replace(/[^0-9+]/g, "");
  Linking.openURL(`tel:${cleanPhone}`).catch((err) => {
    console.warn("No se pudo iniciar la llamada:", err);
  });
}


