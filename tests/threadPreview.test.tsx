// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { PreviewSdk } from "../src/previewData";
import { project, provider, thread } from "./fixtures";

type Timeline = Awaited<ReturnType<PreviewSdk["threads"]["timeline"]>>;
type GitStatus = Awaited<ReturnType<PreviewSdk["environments"]["status"]>>;
const environment = { id: "env-1", name: "Preview worktree", branchName: "feature/preview", path: "/project/preview", isWorktree: true, providerId: "git-worktree", workspaceDisplayKind: "managed-worktree" as const };
const first = () => thread({ providerId: "codex", environment, host: { id: "host-1", name: "MacBook" } });
const second = () => thread({ id: "t2", displayTitle: "Вторая задача", href: "/projects/p1/threads/t2", providerId: "codex", environment: { ...environment, id: "env-2", name: "Second worktree", path: "/project/second", branchName: "fix/second" } });
function timeline(text: string): Timeline {
  return { rows: [{ kind: "conversation", role: "assistant", text, sourceSeqEnd: 20 }] } as unknown as Timeline;
}
function git(): GitStatus {
  return { outcome: "available", workspace: {
    checkout: { kind: "branch", branchName: "feature/preview" },
    workingTree: { files: [{ status: "M" }, { status: "??" }] },
    mergeBase: { aheadCount: 2, behindCount: 0, baseRef: "origin/main", mergeBaseBranch: "main" },
  } } as unknown as GitStatus;
}
function sdkFixture() {
  return {
    threads: {
      timeline: vi.fn<PreviewSdk["threads"]["timeline"]>().mockImplementation(async ({ threadId }) => timeline(`Ответ ${threadId}`)),
      defaultExecutionOptions: vi.fn<PreviewSdk["threads"]["defaultExecutionOptions"]>().mockResolvedValue({ model: "test-model", permissionMode: "full", reasoningLevel: "high", serviceTier: "default", source: "client/turn/start" }),
    },
    environments: { status: vi.fn<PreviewSdk["environments"]["status"]>().mockResolvedValue(git()) },
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
async function mount(threads: PluginSidebarThread[] = [first(), second()], sdk = sdkFixture(), options: Parameters<typeof renderSlot>[2] = {}) {
  const app = await loadPluginApp(() => import("../app"));
  const onNavigate = vi.fn();
  slot = renderSlot(app.threadLists[0], { activeThreadId: "t1", activeProjectId: "p1", isCompactViewport: false, onNavigate, searchQuery: "" }, {
    pluginId: "threadspace", sidebarThreads: { status: "ready", threads, projects: [project], sections: [] },
    providers: { status: "ready", providers: [provider] },
    rpc: { appearance_get: () => ({ p1: { emoji: "📁", color: "default" } }) }, sdk, ...options,
  });
  await slot.findAllByRole("link", { name: "Задача" });
  vi.useFakeTimers();
  return { slot, sdk, onNavigate };
}
function row(id: string, index = 0): HTMLElement {
  const node = slot!.container.querySelectorAll<HTMLElement>(`.ns-row[data-thread-id="${id}"]`)[index];
  if (!node) throw new Error(`Thread row ${id}/${index} not found`);
  return node;
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function hover(id: string, index = 0) { fireEvent.pointerEnter(row(id, index), { pointerType: "mouse" }); await advance(450); }
function popup() { return screen.getByRole("dialog"); }

describe("thread hover preview", () => {
  it("waits 450ms before any data reads and shows the hovered thread without navigation or read mutations", async () => {
    const { slot, sdk, onNavigate } = await mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.pointerEnter(row("t2"), { pointerType: "mouse" });
    await advance(449);
    expect(slot.inspection.sdkCalls).toHaveLength(0);
    await advance(1);
    expect(within(popup()).getByRole("heading", { name: "Вторая задача" })).toBeTruthy();
    expect(within(popup()).getByText("Worktree · Second worktree")).toBeTruthy();
    expect(within(popup()).getByText("Ответ t2")).toBeTruthy();
    expect(within(popup()).getByText("Codex · test-model")).toBeTruthy();
    expect(within(popup()).getByText("Изменено 1 · новых 1")).toBeTruthy();
    expect(sdk.environments.status).toHaveBeenCalledWith({ environmentId: "env-2", signal: expect.any(AbortSignal) });
    expect(slot.inspection.sdkCalls.map(call => call.method).sort()).toEqual(["environments.status", "threads.defaultExecutionOptions", "threads.timeline"]);
    expect(row("t1").querySelector("a")?.getAttribute("aria-current")).toBe("page");
    expect(row("t2").classList.contains("is-pending")).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    fireEvent.pointerLeave(row("t2"));
    await advance(200);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels a brief hover instead of loading a row after the pointer has left", async () => {
    const { sdk } = await mount();
    fireEvent.pointerEnter(row("t1"));
    await advance(300);
    fireEvent.pointerLeave(row("t1"));
    await advance(500);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sdk.threads.timeline).not.toHaveBeenCalled();
    await hover("t2");
    expect(sdk.threads.timeline.mock.calls.map(([request]) => request.threadId)).toEqual(["t2"]);
  });

  it("aborts the old row and ignores its late response when another thread is hovered", async () => {
    const sdk = sdkFixture();
    let resolveOld!: (value: Timeline) => void;
    sdk.threads.timeline.mockImplementation(({ threadId }) => threadId === "t1" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(timeline("Ответ второй задачи")));
    await mount(undefined, sdk);
    await hover("t1");
    const oldSignal = sdk.threads.timeline.mock.calls[0][0].signal!;
    expect(within(popup()).getByRole("status", { name: "Загружаем сообщение…" })).toBeTruthy();
    fireEvent.pointerEnter(row("t2"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(oldSignal.aborted).toBe(true);
    await advance(450);
    await act(async () => { resolveOld(timeline("Устаревший ответ первой задачи")); });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(popup()).getByRole("heading", { name: "Вторая задача" })).toBeTruthy();
    expect(within(popup()).getByText("Ответ второй задачи")).toBeTruthy();
    expect(screen.queryByText("Устаревший ответ первой задачи")).toBeNull();
  });

  it("uses one popup for waiting duplicates and nested rows with each row's own data", async () => {
    const { sdk } = await mount([first(), thread({ ...second(), hasPendingInteraction: true, parentThreadId: "t1" })]);
    expect(slot!.container.querySelectorAll('.ns-row[data-thread-id="t2"]')).toHaveLength(2);
    expect(row("t2", 1).style.getPropertyValue("--depth")).toBe("1");
    await hover("t2", 0);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await hover("t2", 1);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(popup()).getByText("Ответ t2")).toBeTruthy();
    expect(sdk.threads.timeline).toHaveBeenCalledTimes(1);
    await hover("t1");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(popup()).getByText("Ответ t1")).toBeTruthy();
  });

  it("lets the pointer cross into the popup and keeps expanded environment details available", async () => {
    await mount();
    await hover("t1");
    const dialog = popup();
    fireEvent.pointerLeave(row("t1"));
    fireEvent.pointerEnter(dialog);
    await advance(200);
    expect(popup()).toBe(dialog);
    const summary = within(dialog).getByText("Worktree · Preview worktree").closest("summary")!;
    fireEvent.click(summary);
    expect(summary.parentElement?.hasAttribute("open")).toBe(true);
    expect(within(dialog).getByText("/project/preview")).toBeTruthy();
    expect(within(dialog).getByText("MacBook")).toBeTruthy();
    act(() => { summary.focus(); });
    fireEvent.pointerLeave(dialog);
    await advance(200);
    expect(popup()).toBe(dialog);
  });

  it("opens from keyboard focus, closes with Escape without reopening, and preserves native thread navigation", async () => {
    const { slot, onNavigate } = await mount();
    const link = within(row("t2")).getByRole("link", { name: "Вторая задача" });
    act(() => { link.focus(); });
    await advance(450);
    const summary = popup().querySelector("summary")!;
    act(() => { summary.focus(); });
    fireEvent.keyDown(summary, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(link);
    await advance(500);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.pointerDown(link, { button: 0 });
    fireEvent.click(link, { button: 0 });
    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "t2" }]);
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(row("t1").classList.contains("is-active")).toBe(true);
  });

  it("switches a keyboard preview to the next focused row without cancelling it or navigating", async () => {
    const { slot, onNavigate } = await mount();
    const firstLink = within(row("t1")).getByRole("link", { name: "Задача" });
    const secondLink = within(row("t2")).getByRole("link", { name: "Вторая задача" });
    act(() => { firstLink.focus(); });
    await advance(450);
    expect(within(popup()).getByRole("heading", { name: "Задача" })).toBeTruthy();
    act(() => { secondLink.focus(); });
    await advance(450);
    expect(document.activeElement).toBe(secondLink);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(popup()).getByRole("heading", { name: "Вторая задача" })).toBeTruthy();
    expect(within(popup()).getByText("Ответ t2")).toBeTruthy();
    expect(firstLink.getAttribute("aria-current")).toBe("page");
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("uses the app's dark theme and updates an open card when the interface language changes", async () => {
    const { sdk } = await mount(undefined, undefined, { codeTheme: { mode: "dark" } });
    await hover("t1");
    expect(popup().getAttribute("data-theme")).toBe("dark");
    expect(popup().getAttribute("lang")).toBe("ru");
    expect(within(popup()).getByText("Нет активной работы")).toBeTruthy();
    await act(async () => { document.documentElement.lang = "en"; });
    expect(popup().getAttribute("data-theme")).toBe("dark");
    expect(popup().getAttribute("lang")).toBe("en");
    expect(within(popup()).getByText("No active work")).toBeTruthy();
    expect(within(popup()).getByText("Latest reply")).toBeTruthy();
    expect(within(popup()).getByText("Ответ t1")).toBeTruthy();
    expect(sdk.threads.timeline).toHaveBeenCalledOnce();
  });

  it("survives conversation autoscroll during the hover delay and while open, but closes when the sidebar scrolls", async () => {
    await mount();
    const conversation = document.createElement("main");
    conversation.className = "conversation";
    document.body.append(conversation);
    try {
      fireEvent.pointerEnter(row("t2"));
      await advance(300);
      fireEvent.scroll(conversation);
      await advance(150);
      const dialog = popup();
      expect(within(dialog).getByRole("heading", { name: "Вторая задача" })).toBeTruthy();
      fireEvent.scroll(conversation);
      fireEvent.scroll(dialog);
      await advance(200);
      expect(popup()).toBe(dialog);
      fireEvent.scroll(row("t2").closest(".ns-sidebar")!);
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      conversation.remove();
    }
  });

  it("dismisses and aborts when a project collapses, and cancels a pending hover on unmount", async () => {
    const sdk = sdkFixture();
    sdk.threads.timeline.mockReturnValue(new Promise(() => {}));
    const { slot } = await mount(undefined, sdk);
    await hover("t2");
    const signal = sdk.threads.timeline.mock.calls[0][0].signal!;
    fireEvent.click(screen.getByRole("button", { name: "Свернуть проект Проект" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(signal.aborted).toBe(true);
    await advance(500);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Развернуть проект Проект" }));
    fireEvent.pointerEnter(row("t1"));
    await advance(300);
    slot.lifecycle.unmount();
    await advance(500);
    expect(sdk.threads.timeline).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
