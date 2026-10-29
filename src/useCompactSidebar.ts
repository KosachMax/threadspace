import { useSyncExternalStore } from "react";

const touchQuery = "(pointer: coarse), (hover: none)";
function snapshot() { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(touchQuery).matches; }
function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(touchQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** A rotated phone still needs touch controls beyond the host's width breakpoint. */
export function useCompactSidebar(hostCompact: boolean) {
  return useSyncExternalStore(subscribe, snapshot, () => false) || hostCompact;
}
