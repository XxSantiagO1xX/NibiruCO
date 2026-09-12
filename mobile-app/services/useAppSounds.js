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
    (soundType, options = {}) => {
      return playSound(soundType, { isMuted: alertsMuted, ...options });
    },
    [alertsMuted]
  );

  const playNewOrder = useCallback(
    (options = {}) => playNewOrderAlert({ isMuted: alertsMuted, ...options }),
    [alertsMuted]
  );

  const playReadyPing = useCallback(
    (options = {}) => playReadyPingAlert({ isMuted: alertsMuted, ...options }),
    [alertsMuted]
  );

  const playDispatch = useCallback(
    (options = {}) => playDispatchAlert({ isMuted: alertsMuted, ...options }),
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
