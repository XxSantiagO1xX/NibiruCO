import { useContext, useCallback } from "react";
import { AppContext } from "../context/AppContext";
import {
  playSound,
  playNewOrderAlert,
  playReadyPingAlert,
  playDispatchAlert
} from "./soundService";

export function useAppSounds() {
  const context = useContext(AppContext);
  const alertsMuted = context?.alertsMuted ?? false;

  const play = useCallback(
    async (soundType, options = {}) => {
      try {
        return await playSound(soundType, { isMuted: alertsMuted, ...options });
      } catch (err) {
        console.warn("[useAppSounds] play error:", err?.message || err);
      }
    },
    [alertsMuted]
  );

  const playNewOrder = useCallback(
    async (options = {}) => {
      try {
        return await playNewOrderAlert({ isMuted: alertsMuted, ...options });
      } catch (err) {
        console.warn("[useAppSounds] playNewOrder error:", err?.message || err);
      }
    },
    [alertsMuted]
  );

  const playReadyPing = useCallback(
    async (options = {}) => {
      try {
        return await playReadyPingAlert({ isMuted: alertsMuted, ...options });
      } catch (err) {
        console.warn("[useAppSounds] playReadyPing error:", err?.message || err);
      }
    },
    [alertsMuted]
  );

  const playDispatch = useCallback(
    async (options = {}) => {
      try {
        return await playDispatchAlert({ isMuted: alertsMuted, ...options });
      } catch (err) {
        console.warn("[useAppSounds] playDispatch error:", err?.message || err);
      }
    },
    [alertsMuted]
  );

  return {
    alertsMuted,
    playSound: play,
    playNewOrderAlert: playNewOrder,
    playReadyPingAlert: playReadyPing,
    playDispatchAlert: playDispatch
  };
}

export default useAppSounds;
