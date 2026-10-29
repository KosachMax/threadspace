// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { PreviewSdk } from "../src/previewData";
import { project, provider, thread } from "./fixtures";

type Timeline = Awaited<ReturnType<PreviewSdk["threads"]["timeline"]>>;
type GitStatus = Awaited<ReturnType<PreviewSdk["environments"]["status"]>>;
const environment = { id: "env-1", name: "First checkout", branchName: "feature/first", path: "/project/first", isWorktree: true, providerId: "git-worktree", workspaceDisplayKind: "managed-worktree" as const };
const first = () => thread({ providerId: "codex", environment });
const second = () => thread({ id: "t2", displayTitle: "Вторая задача", href: "/projects/p1/threads/t2", providerId: "codex", environment: { ...environment, id: "env-2", name: "Second checkout", branchName: "fix/second", path: "/project/second" } });
function sdkFixture() {
  return {
    threads: {
      timeline: vi.fn<PreviewSdk["threads"]["timeline"]>().mockImplementation(async ({ threadId }) => ({ rows: [{ kind: "conversation", role: "assistant", text: `Ответ ${threadId}`, sourceSeqEnd: 20 }] }) as Timeline),
      defaultExecutionOptions: vi.fn<PreviewSdk["threads"]["defaultExecutionOptions"]>().mockResolvedValue({ model: "mobile-model", permissionMode: "full", reasoningLevel: "high", serviceTier: "default", source: "client/turn/start" }),
    },
    environments: { status: vi.fn<PreviewSdk["environments"]["status"]>().mockResolvedValue({ outcome: "available", workspace: { checkout: { kind: "branch", branchName: "fix/second" }, workingTree: { files: [] } } } as unknown as GitStatus) },
  };
}

let slot: RenderedSlot | undefined;
beforeEach(() => {
  document.documentElement.lang = "ru";
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  slot?.lifecycle.unmount();
  slot = undefined;
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("lang");
});
async function mount(threads: PluginSidebarThread[] = [first(), second()], options: Parameters<typeof renderSlot>[2] = {}, isCompactViewport = true) {
  const app = await loadPluginApp(() => import("../app"));
  const onNavigate = vi.fn(), sdk = sdkFixture();
  slot = renderSlot(app.threadLists[0], { activeThreadId: "t1", activeProjectId: "p1", isCompactViewport, onNavigate, searchQuery: "" }, {
    pluginId: "threadspace", sidebarThreads: { status: "ready", threads, projects: [project], sections: [] },
    providers: { status: "ready", providers: [provider] }, sdk,
    rpc: { appearance_get: () => ({ p1: { emoji: "📁", color: "default" } }), appearance_set: () => ({ emoji: "🚀", color: "default" }) },
    ...options,
  });
  await slot.findByRole("link", { name: "Задача" });
  vi.useFakeTimers();
  return { slot, onNavigate, sdk };
}
function row(id: string) {
  const node = slot!.container.querySelector<HTMLElement>(`.ns-row[data-thread-id="${id}"]`);
  if (!node) throw new Error(`Thread row ${id} not found`);
  return node;
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function openActions(id: string) { fireEvent.click(within(row(id)).getByRole("button", { name: `Действия с тредом ${id === "t1" ? "Задача" : "Вторая задача"}` })); }
async function showDetails(id: string) {
  openActions(id);
  fireEvent.click(screen.getByRole("menuitem", { name: "Информация о треде" }));
  await advance(1);
  return screen.getByRole("dialog");
}

describe("compact sidebar interactions", () => {
  it("keeps touch controls on a landscape phone beyond the host breakpoint and reacts when a fine pointer becomes available", async () => {
    let touch = true;
    const events = new EventTarget();
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() { return touch; },
      media: "(pointer: coarse), (hover: none)",
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    })));
    const { slot, sdk } = await mount(undefined, {}, false);
    expect(slot.container.querySelector(".ns-sidebar")?.getAttribute("data-compact")).toBe("true");
    fireEvent.pointerEnter(row("t2"), { pointerType: "mouse" });
    await advance(500);
    expect(sdk.threads.timeline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Иконка, цвет и действия: Проект" }));
    await advance(1);
    const sheet = screen.getByRole("dialog", { name: "Значок проекта Проект" });
    expect(sheet.classList.contains("ns-compact-sheet")).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Закрыть" }));
    await advance(1);
    act(() => { touch = false; events.dispatchEvent(new Event("change")); });
    expect(slot.container.querySelector(".ns-sidebar")?.hasAttribute("data-compact")).toBe(false);
    fireEvent.pointerEnter(row("t2"), { pointerType: "mouse" });
    await advance(450);
    const preview = screen.getByRole("dialog", { name: "Вторая задача" });
    expect(within(preview).getByText("Ответ t2")).toBeTruthy();
    expect(preview.classList.contains("ns-compact-sheet")).toBe(false);
  });

  it("uses the host compact flag and never fetches a preview after touch, synthetic hover, or link focus", async () => {
    const { slot, sdk } = await mount();
    expect(slot.container.querySelector(".ns-sidebar")?.getAttribute("data-compact")).toBe("true");
    const link = within(row("t2")).getByRole("link", { name: "Вторая задача" });
    fireEvent.pointerEnter(row("t2"), { pointerType: "touch" });
    fireEvent.pointerDown(link, { pointerType: "touch", button: 0 });
    act(() => { link.focus(); });
    fireEvent.pointerEnter(row("t2"), { pointerType: "mouse" });
    await advance(1000);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sdk.threads.timeline).not.toHaveBeenCalled();
    expect(slot.inspection.sdkCalls).toHaveLength(0);
    expect(link.getAttribute("aria-current")).toBeNull();
    expect(within(row("t1")).getByRole("link").getAttribute("aria-current")).toBe("page");
  });

  it("opens a tapped thread through native navigation and closes the host drawer once", async () => {
    const { slot, onNavigate, sdk } = await mount();
    const link = within(row("t2")).getByRole("link", { name: "Вторая задача" });
    fireEvent.pointerDown(link, { pointerType: "touch", button: 0 });
    fireEvent.click(link, { button: 0 });
    await advance(1000);
    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "t2" }]);
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sdk.threads.timeline).not.toHaveBeenCalled();
  });

  it("does not select a thread when a touch is cancelled for scrolling", async () => {
    const { slot, onNavigate } = await mount();
    const link = within(row("t2")).getByRole("link", { name: "Вторая задача" });
    fireEvent.pointerDown(link, { pointerType: "touch", button: 0 });
    fireEvent.pointerCancel(link, { pointerType: "touch" });
    await advance(500);
    expect(row("t2").classList.contains("is-pending")).toBe(false);
    expect(row("t1").classList.contains("is-active")).toBe(true);
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("opens the tapped menu's own thread in a sheet, then closes without selecting or marking it read", async () => {
    const { slot, onNavigate, sdk } = await mount();
    const dialog = await showDetails("t2");
    expect(dialog.classList.contains("ns-compact-sheet")).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(within(dialog).getByRole("heading", { name: "Вторая задача" })).toBeTruthy();
    expect(within(dialog).getByText("Worktree · Second checkout")).toBeTruthy();
    expect(within(dialog).getByText("Ответ t2")).toBeTruthy();
    expect(sdk.environments.status).toHaveBeenCalledWith({ environmentId: "env-2", signal: expect.any(AbortSignal) });
    expect(slot.inspection.sdkCalls.map(call => call.method).sort()).toEqual(["environments.status", "threads.defaultExecutionOptions", "threads.timeline"]);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Закрыть" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
    await advance(500);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(row("t1")).getByRole("link").getAttribute("aria-current")).toBe("page");
    expect(within(row("t2")).getByRole("link").getAttribute("aria-current")).toBeNull();
    expect(document.activeElement).toBe(within(row("t2")).getByRole("button", { name: "Действия с тредом Вторая задача" }));
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("makes the same information action available from the host context menu and aborts pending reads on dismissal", async () => {
    const { sdk } = await mount();
    sdk.threads.timeline.mockReturnValue(new Promise(() => {}));
    fireEvent.contextMenu(row("t2"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Информация о треде" }));
    await advance(1);
    const dialog = screen.getByRole("dialog");
    const signal = sdk.threads.timeline.mock.calls[0][0].signal!;
    expect(within(dialog).getByRole("status", { name: "Загружаем сообщение…" })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await advance(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(signal.aborted).toBe(true);
  });

  it("keeps information scheduled when the closing host drawer moves focus and the pointer out of the row", async () => {
    const { sdk } = await mount();
    openActions("t2");
    fireEvent.click(screen.getByRole("menuitem", { name: "Информация о треде" }));
    // The native drawer leaves the row before the deferred modal can mount.
    fireEvent.pointerLeave(row("t2"), { pointerType: "touch" });
    fireEvent.blur(row("t2"), { relatedTarget: document.body });
    expect(screen.queryByRole("dialog")).toBeNull();
    await advance(1);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Вторая задача" })).toBeTruthy();
    expect(within(dialog).getByText("Ответ t2")).toBeTruthy();
    expect(sdk.threads.timeline).toHaveBeenCalledOnce();
  });

  it("keeps waiting, failure and activity visible inside their usable action menus", async () => {
    await mount([
      first(),
      thread({ id: "waiting", displayTitle: "Вопрос", hasPendingInteraction: true }),
      thread({ id: "error", displayTitle: "Сбой", status: "error" }),
      thread({ id: "working", displayTitle: "Работа", status: "active", indicator: "runtime" }),
    ]);
    const waiting = within(row("waiting")).getByRole("button", { name: "Действия с тредом Вопрос" });
    const error = within(row("error")).getByRole("button", { name: "Действия с тредом Сбой" });
    const working = within(row("working")).getByRole("button", { name: "Действия с тредом Работа" });
    const question = within(waiting).getByRole("img", { name: "Ждёт тебя — вопрос или подтверждение" });
    const warning = within(error).getByRole("img", { name: "Ошибка выполнения — открой тред для подробностей" });
    expect(within(working).getByRole("img", { name: "Агент работает" })).toBeTruthy();
    expect(question.querySelector("svg")?.innerHTML).not.toBe(warning.querySelector("svg")?.innerHTML);
    expect(within(row("waiting")).getAllByRole("img", { name: "Ждёт тебя — вопрос или подтверждение" })).toHaveLength(1);
    fireEvent.click(waiting);
    expect(screen.getByRole("menuitem", { name: "Информация о треде" })).toBeTruthy();
  });

  it.each(["working", "waiting"] as const)("keeps hidden child %s activity in the collapsed parent's action menu", async kind => {
    await mount([first(), thread({ id: "child", displayTitle: "Дочерний", parentThreadId: "t1", ...(kind === "working" ? { status: "active", indicator: "runtime" } : { hasPendingInteraction: true }) })]);
    const menu = within(row("t1")).getByRole("button", { name: "Действия с тредом Задача" });
    expect(within(menu).queryByRole("img")).toBeNull();
    fireEvent.click(within(row("t1")).getByRole("button", { name: "Свернуть Задача" }));
    expect(screen.queryByRole("link", { name: "Дочерний" })).toBeNull();
    const indicator = within(menu).getByRole("img", { name: kind === "working" ? "Работают: 1" : "Ждут тебя: 1" });
    expect(indicator.getAttribute("data-thread-state")).toBe(kind);
    fireEvent.click(menu);
    expect(screen.getByRole("menuitem", { name: "Информация о треде" })).toBeTruthy();
  });

  it("opens the emoji sheet without summoning the keyboard and saves through the existing appearance RPC", async () => {
    const { slot, onNavigate } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Иконка, цвет и действия: Проект" }));
    await advance(1);
    const dialog = screen.getByRole("dialog", { name: "Значок проекта Проект" });
    expect(dialog.classList.contains("ns-compact-sheet")).toBe(true);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Закрыть" }));
    expect(document.activeElement).not.toBe(within(dialog).getByRole("textbox", { name: "Найти эмодзи" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Найти эмодзи" }), { target: { value: "ракета" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ракета" }));
    await advance(1);
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "appearance_set", input: { projectId: "p1", patch: { emoji: "🚀" } } });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Иконка, цвет и действия: Проект" }).textContent).toBe("🚀");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("retains accessible project and nested toggles without activating a thread", async () => {
    const { slot, onNavigate } = await mount([first(), thread({ id: "child", displayTitle: "Дочерний", parentThreadId: "t1", status: "active", indicator: "runtime" })]);
    const parentToggle = within(row("t1")).getByRole("button", { name: "Свернуть Задача" });
    expect(parentToggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(parentToggle);
    expect(screen.queryByRole("link", { name: "Дочерний" })).toBeNull();
    expect(within(row("t1")).getByRole("button", { name: "Развернуть Задача" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(row("t1")).getByRole("img", { name: "Работают: 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Свернуть проект Проект" }));
    expect(screen.queryByRole("link", { name: "Задача" })).toBeNull();
    expect(screen.getByRole("button", { name: "Развернуть проект Проект" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Развернуть проект Проект" }));
    fireEvent.click(within(row("t1")).getByRole("button", { name: "Развернуть Задача" }));
    expect(screen.getByRole("link", { name: "Дочерний" })).toBeTruthy();
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
