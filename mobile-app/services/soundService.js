import { Audio } from "expo-av";
import { Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Static mapping of sound files
const SOUND_ASSETS = {
  new_order: require("../assets/sounds/new_order.mp3"),
  ready_ping: require("../assets/sounds/ready_ping.mp3"),
  dispatch_alert: require("../assets/sounds/dispatch_alert.mp3"),
};

// Vibration patterns (in milliseconds)
// [delay, vibrate, pause, vibrate, ...]
const VIBRATION_PATTERNS = {
  new_order: [0, 300],
  ready_ping: [0, 250, 150, 250],
  dispatch_alert: [0, 500, 200, 500],
};

let isAudioConfigured = false;

/**
 * Configure audio mode to ensure sounds play properly across platforms
 */
export async function configureAudio() {
  if (isAudioConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });
    isAudioConfigured = true;
  } catch (err) {
    console.warn("[SoundService] configureAudio error:", err?.message);
  }
}

/**
 * Check if alerts are muted in AsyncStorage
 */
export async function isAlertMutedAsync() {
  try {
    const value = await AsyncStorage.getItem("alerts_muted");
    return value === "true";
  } catch (_) {
    return false;
  }
}

/**
 * Play an alert sound and trigger haptic feedback
 * @param {('new_order'|'ready_ping'|'dispatch_alert')} soundType
 * @param {Object} options
 * @param {boolean} [options.vibrate=true] Whether to trigger vibration
 * @param {boolean} [options.isMuted] If omitted, will check AsyncStorage
 */
export async function playSound(soundType, options = {}) {
  const { vibrate = true, isMuted } = options;

  // 1. Trigger haptic feedback (always unless explicitly vibrate=false)
  if (vibrate) {
    const pattern = VIBRATION_PATTERNS[soundType] || [0, 300];
    try {
      Vibration.vibrate(pattern);
    } catch (e) {
      console.warn("[SoundService] Vibration error:", e?.message);
    }
  }

  // 2. Determine mute status
  let muted = isMuted;
  if (muted === undefined) {
    muted = await isAlertMutedAsync();
  }

  if (muted) {
    return;
  }

  // 3. Play audio asset
  const asset = SOUND_ASSETS[soundType];
  if (!asset) {
    console.warn(`[SoundService] Unknown sound type: "${soundType}"`);
    return;
  }

  try {
    await configureAudio();
    const { sound } = await Audio.Sound.createAsync(
      asset,
      { shouldPlay: true, volume: 1.0 }
    );

    sound.setOnPlaybackStatusUpdate(async (status) => {
      if (status.didJustFinish || status.error) {
        try {
          await sound.unloadAsync();
        } catch (_) {}
      }
    });
  } catch (err) {
    console.warn(`[SoundService] Error playing sound "${soundType}":`, err?.message);
  }
}

export const playNewOrderAlert = (options) => playSound("new_order", options);
export const playReadyPingAlert = (options) => playSound("ready_ping", options);
export const playDispatchAlert = (options) => playSound("dispatch_alert", options);

export default {
  playSound,
  playNewOrderAlert,
  playReadyPingAlert,
  playDispatchAlert,
  configureAudio,
  isAlertMutedAsync,
};
