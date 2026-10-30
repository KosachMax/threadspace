// Hover mode: bb's left sidebar stays collapsed and slides in over the
// content while the pointer is at the left window edge. Only <html> data
// attributes change; bb's own collapsed state is driven by its toggle.
export type PeekSpeed = "instant" | "fast" | "normal" | "slow";
export const PEEK_SPEEDS: readonly PeekSpeed[] = ["instant", "fast", "normal", "slow"];
export const isPeekSpeed = (v: unknown): v is PeekSpeed => typeof v === "string" && (PEEK_SPEEDS as readonly string[]).includes(v);

// Wait before opening, and slide duration, per speed.
const TIMING: Record<PeekSpeed, { delay: number; slide: number }> = {
  instant: { delay: 0, slide: 0 },
  fast: { delay: 60, slide: 120 },
  normal: { delay: 180, slide: 200 },
  slow: { delay: 400, slide: 300 },
};
const EDGE_PX = 8;
const LEAVE_PX = 24;
const CLOSE_DELAY = 250;

const sidebar = () => document.querySelector<HTMLElement>('.peer[data-side="left"][data-state]');
const panel = (s: HTMLElement) => s.querySelector<HTMLElement>(":scope > .fixed");
// Any open bb menu or popover: often opened from the sidebar, so keep it open.
const overlayOpen = () => !!document.querySelector('[data-radix-popper-content-wrapper], [data-bb-portaled-overlay][data-state="open"]');

function sidebarToggle(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('button[data-sidebar="trigger"]')
    ?? Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-label]")).find((b) => /^toggle sidebar/i.test(b.getAttribute("aria-label") ?? "")) ?? null;
}

/** False when this BB build no longer has the sidebar markup hover mode relies on. */
export function peekSupported(): boolean { return !!sidebar() && !!sidebarToggle(); }

/** Collapse (true) or expand (false) bb's sidebar through its own toggle. */
export function setSidebarCollapsed(collapsed: boolean): void {
  const s = sidebar();
  if (!s || (s.dataset.state === "collapsed") === collapsed) return;
  sidebarToggle()?.click();
}

export function mountSidebarPeek(speed: PeekSpeed, signal: AbortSignal): () => void {
  const root = document.documentElement;
  const { delay, slide } = TIMING[speed];
  root.style.setProperty("--ns-peek-slide", `${slide}ms`);
  root.setAttribute("data-ns-peek-mode", "");
  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  const isOpen = () => root.hasAttribute("data-ns-peek");
  const clear = () => { window.clearTimeout(openTimer); window.clearTimeout(closeTimer); openTimer = closeTimer = undefined; };
  const open = () => { openTimer = undefined; root.setAttribute("data-ns-peek", ""); };
  const close = () => { clear(); root.removeAttribute("data-ns-peek"); };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const s = sidebar();
    if (!s || s.dataset.state !== "collapsed") { if (isOpen()) close(); return; }
    if (!isOpen()) {
      if (e.clientX <= EDGE_PX) {
        window.clearTimeout(closeTimer); closeTimer = undefined;
        if (delay === 0) open();
        else if (openTimer === undefined) openTimer = window.setTimeout(open, delay);
      } else if (openTimer !== undefined) { window.clearTimeout(openTimer); openTimer = undefined; }
      return;
    }
    const width = panel(s)?.getBoundingClientRect().width ?? 280;
    if (e.clientX > width + LEAVE_PX && !overlayOpen()) {
      if (closeTimer === undefined) closeTimer = window.setTimeout(close, CLOSE_DELAY);
    } else { window.clearTimeout(closeTimer); closeTimer = undefined; }
  };
  const onLeaveWindow = (e: MouseEvent) => {
    if (!e.relatedTarget && isOpen() && !overlayOpen()) { window.clearTimeout(closeTimer); closeTimer = window.setTimeout(close, CLOSE_DELAY); }
  };
  // Expanding the sidebar for real (button or ⌘\) ends the peek.
  // Watch only the sidebar's own state; Radix flips data-state across the page on every menu.
  const observer = new MutationObserver(() => { if (sidebar()?.dataset.state !== "collapsed" && isOpen()) close(); });
  const target = sidebar();
  if (target) observer.observe(target, { attributes: true, attributeFilter: ["data-state"] });

  document.addEventListener("pointermove", onMove, { passive: true, signal });
  document.addEventListener("mouseout", onLeaveWindow, { signal });
  return () => {
    observer.disconnect();
    close();
    root.removeAttribute("data-ns-peek-mode");
    root.style.removeProperty("--ns-peek-slide");
  };
}
