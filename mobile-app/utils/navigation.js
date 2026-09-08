import { Linking, Platform } from "react-native";

/**
 * Abre la app de navegación preferida (Waze como prioridad, fallback a Google Maps / Apple Maps).
 */
export function openWazeNavigation(address, lat, lng) {
  const cleanAddress = (address || "").trim();
  const hasCoords = lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));

  const wazeUrl = hasCoords
    ? `waze://?ll=${lat},${lng}&navigate=yes`
    : `waze://?q=${encodeURIComponent(cleanAddress)}&navigate=yes`;

  const webWazeFallback = hasCoords
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(cleanAddress)}&navigate=yes`;

  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddress)}`;

  Linking.canOpenURL(wazeUrl)
    .then((supported) => {
      if (supported) {
        return Linking.openURL(wazeUrl);
      }
      // Fallback
      return Linking.openURL(googleMapsUrl);
    })
    .catch(() => {
      Linking.openURL(googleMapsUrl);
    });
}

/**
 * Abre el marcador telefónico para llamar al cliente o restaurante.
 */
export function openPhoneCall(phoneNumber) {
  if (!phoneNumber) return;
  const cleanPhone = String(phoneNumber).replace(/[^0-9+]/g, "");
  Linking.openURL(`tel:${cleanPhone}`).catch((err) => {
    console.log("No se pudo iniciar la llamada:", err);
  });
}
