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

let AudioModule = null;
let isAudioChecked = false;
let isAudioAvailable = false;
let isAudioConfigured = false;

/**
 * Safely obtain the expo-av Audio module without crashing if native module is missing
 */
function getAudioModule() {
  if (isAudioChecked) {
    return isAudioAvailable ? AudioModule : null;
  }
  isAudioChecked = true;
  try {
    // Dynamic require so module evaluation does not fail if native module is unlinked
    const expoAv = require("expo-av");
    if (expoAv && expoAv.Audio) {
      AudioModule = expoAv.Audio;
      isAudioAvailable = true;
      return AudioModule;
    }
  } catch (err) {
    isAudioAvailable = false;
    console.warn(
      "[SoundService] expo-av native module not available. Audio playback disabled in this environment:",
      err?.message || err
    );
  }
  isAudioAvailable = false;
  return null;
}

/**
 * Configure audio mode to ensure sounds play properly across platforms
 */
export async function configureAudio() {
  if (isAudioConfigured) return;
  const Audio = getAudioModule();
  if (!Audio || typeof Audio.setAudioModeAsync !== "function") {
    return;
  }
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });
    isAudioConfigured = true;
  } catch (err) {
    // If native module fails (e.g. ExponentAV not found), disable audio gracefully
    isAudioAvailable = false;
    console.warn("[SoundService] configureAudio error (audio playback disabled):", err?.message || err);
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
      console.warn("[SoundService] Vibration error:", e?.message || e);
    }
  }

  // 2. Determine mute status
  let muted = isMuted;
  if (muted === undefined) {
    try {
      muted = await isAlertMutedAsync();
    } catch (_) {
      muted = false;
    }
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

  const Audio = getAudioModule();
  if (!Audio || !isAudioAvailable) {
    return;
  }

  try {
    await configureAudio();
    if (!isAudioAvailable) return;

    if (!Audio.Sound || typeof Audio.Sound.createAsync !== "function") {
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      asset,
      { shouldPlay: true, volume: 1.0 }
    );

    if (sound && typeof sound.setOnPlaybackStatusUpdate === "function") {
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status && (status.didJustFinish || status.error)) {
          try {
            await sound.unloadAsync();
          } catch (_) {}
        }
      });
    }
  } catch (err) {
    // If native module fails (e.g. ExponentAV not found), disable future audio attempts gracefully
    isAudioAvailable = false;
    console.warn(`[SoundService] Error playing sound "${soundType}":`, err?.message || err);
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
