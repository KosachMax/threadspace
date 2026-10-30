import { useEffect, useRef } from "react";
import { useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import { toast } from "sonner";
import { isPeekSpeed, mountSidebarPeek, peekSupported, setSidebarCollapsed } from "./sidebarPeek";
import { useStrings } from "./i18n";

/** Fired by the ⌘⇧S command; the controller owns the RPC call. */
export const TOGGLE_PEEK_EVENT = "threadspace:toggle-sidebar-peek";

// App-wide, renders nothing: applies the hover-mode settings to bb's sidebar.
export function SidebarPeekController() {
  const { values } = useSettings();
  const rpc = useRpc<typeof rpcContract>();
  const enabled = values?.sidebarHoverMode === true;
  const speed = isPeekSpeed(values?.sidebarHoverSpeed) ? values.sidebarHoverSpeed : "fast";
  const previous = useRef<boolean | undefined>(undefined);
  const t = useStrings();

  useEffect(() => {
    if (!enabled) return;
    // Hover mode uses BB's sidebar markup, not a public API; stay inert if it changed.
    // Phones and touch screens use BB's drawer; hover mode simply stays inactive there.
    if (window.matchMedia?.("(hover: none), (pointer: coarse)").matches || window.innerWidth < 768) return;
    if (!peekSupported()) { toast.error(t.peekUnsupported, { id: "threadspace-peek-unsupported" }); return; }
    const abort = new AbortController();
    const unmount = mountSidebarPeek(speed, abort.signal);
    return () => { abort.abort(); unmount(); };
  }, [enabled, speed, t.peekUnsupported]);

  // Collapse when the mode turns on, expand when it turns off (not on first load).
  useEffect(() => {
    if (values === undefined) return;
    if (previous.current !== undefined && previous.current !== enabled) setSidebarCollapsed(enabled);
    previous.current = enabled;
  }, [enabled, values]);

  useEffect(() => {
    const onToggle = () => { rpc.call("sidebar_hover_mode_toggle", {}).catch(() => {}); };
    window.addEventListener(TOGGLE_PEEK_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_PEEK_EVENT, onToggle);
  }, [rpc]);

  return null;
}
