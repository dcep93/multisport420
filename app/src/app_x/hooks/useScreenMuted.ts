import { useState } from "react";

// Keep app/remote mute choices for the current spotlight session only.
export function useScreenMuted(isFocused: boolean, shouldToggleMute: boolean, requestId: number) {
  const [state, setState] = useState({ isFocused, requestId, muted: false });
  let current = state;
  if (state.isFocused !== isFocused || state.requestId !== requestId) {
    const toggle = state.requestId !== requestId && shouldToggleMute;
    current = {
      isFocused,
      requestId,
      muted: isFocused && state.isFocused && (toggle ? !state.muted : state.muted),
    };
    // Adjust before effects run so a focus change sends only its final mute state.
    setState(current);
  }
  return !isFocused || current.muted;
}
