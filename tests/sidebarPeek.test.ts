// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSidebarPeek, peekSupported, setSidebarCollapsed } from "../src/sidebarPeek";

// Minimal copy of the BB sidebar markup that hover mode reads.
function fakeSidebar(state: "collapsed" | "expanded") {
  document.body.innerHTML = `<div class="peer" data-side="left" data-state="${state}"><div class="fixed"></div></div><button data-sidebar="trigger">Toggle</button>`;
  const peer = document.querySelector<HTMLElement>(".peer")!;
  document.querySelector(".fixed")!.getBoundingClientRect = () => ({ width: 280 } as DOMRect);
  const toggle = document.querySelector<HTMLButtonElement>("button")!;
  toggle.addEventListener("click", () => { peer.dataset.state = peer.dataset.state === "collapsed" ? "expanded" : "collapsed"; });
  return { peer, toggle };
}
const move = (x: number, pointerType = "mouse") => {
  const e = new MouseEvent("pointermove", { clientX: x, bubbles: true }) as MouseEvent & { pointerType: string };
  Object.defineProperty(e, "pointerType", { value: pointerType });
  document.dispatchEvent(e);
};
const peeking = () => document.documentElement.hasAttribute("data-ns-peek");

let abort: AbortController, unmount: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); abort = new AbortController(); });
afterEach(() => { unmount?.(); unmount = undefined; abort.abort(); vi.useRealTimers(); document.body.innerHTML = ""; });

describe("sidebar hover mode", () => {
  it("opens at the left edge after the speed delay and closes after the pointer leaves", () => {
    fakeSidebar("collapsed");
    unmount = mountSidebarPeek("fast", abort.signal);
    move(4);
    expect(peeking()).toBe(false);
    vi.advanceTimersByTime(60);
    expect(peeking()).toBe(true);
    move(200);
    vi.advanceTimersByTime(300);
    expect(peeking()).toBe(true);
    move(320);
    vi.advanceTimersByTime(249);
    expect(peeking()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(peeking()).toBe(false);
  });
  it("cancels a pending open when the pointer leaves the edge first", () => {
    fakeSidebar("collapsed");
    unmount = mountSidebarPeek("slow", abort.signal);
    move(2); vi.advanceTimersByTime(200); move(100); vi.advanceTimersByTime(400);
    expect(peeking()).toBe(false);
  });
  it("stays open while a menu is open and ignores touch", () => {
    fakeSidebar("collapsed");
    unmount = mountSidebarPeek("instant", abort.signal);
    move(0, "touch");
    expect(peeking()).toBe(false);
    move(0);
    expect(peeking()).toBe(true);
    document.body.insertAdjacentHTML("beforeend", "<div data-radix-popper-content-wrapper></div>");
    move(600); vi.advanceTimersByTime(1000);
    expect(peeking()).toBe(true);
  });
  it("does nothing while the sidebar is expanded and cleans up on unmount", () => {
    fakeSidebar("expanded");
    unmount = mountSidebarPeek("instant", abort.signal);
    expect(document.documentElement.hasAttribute("data-ns-peek-mode")).toBe(true);
    move(0);
    expect(peeking()).toBe(false);
    unmount(); unmount = undefined;
    expect(document.documentElement.hasAttribute("data-ns-peek-mode")).toBe(false);
  });
  it("collapses and expands through BB's own toggle, and reports missing markup", () => {
    const { peer } = fakeSidebar("expanded");
    expect(peekSupported()).toBe(true);
    setSidebarCollapsed(true);
    expect(peer.dataset.state).toBe("collapsed");
    setSidebarCollapsed(true);
    expect(peer.dataset.state).toBe("collapsed");
    setSidebarCollapsed(false);
    expect(peer.dataset.state).toBe("expanded");
    document.body.innerHTML = "";
    expect(peekSupported()).toBe(false);
  });
});
