import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import axios from "axios";

// Configurar cómo se comportan las notificaciones cuando la app está en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

let lastRegisteredUserToken = null;
let lastRegisteredPushToken = null;
let isRegistering = false;

/**
 * Registra el dispositivo para recibir notificaciones push en MealOps
 */
export async function registerForPushNotificationsAsync(token, apiBaseUrl) {
  if (!token || !apiBaseUrl) return null;
  if (token === lastRegisteredUserToken && lastRegisteredPushToken) {
    return lastRegisteredPushToken;
  }
  if (isRegistering) return null;
  isRegistering = true;

  let pushToken = null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("delivery-offers", {
        name: "Ofertas de Entrega",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: "#f97316",
        sound: "default"
      });
    } catch (_) {}
  }

  if (Device.isDevice) {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        console.log("[NOTIFICATIONS] Permiso de notificaciones no concedido.");
        return null;
      }

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      const pushTokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      pushToken = pushTokenData?.data;
    } catch (tokenErr) {
      console.log("[NOTIFICATIONS] Aviso: Push remoto no disponible en este entorno (normal en Expo Go):", tokenErr.message);
    }
  } else {
    console.log("[NOTIFICATIONS] Ejecutando en simulador.");
  }

  if (pushToken && token && apiBaseUrl) {
    try {
      await axios.post(
        `${apiBaseUrl}/users/push-token`,
        { tokenExpo: pushToken },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      lastRegisteredUserToken = token;
      lastRegisteredPushToken = pushToken;
      console.log("[NOTIFICATIONS] Token registrado en backend con éxito.");
    } catch (saveErr) {
      console.log("[NOTIFICATIONS] Error enviando token al backend:", saveErr.message);
    }
  }

  isRegistering = false;
  return pushToken;
}
