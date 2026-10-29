// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import { useBbNavigate, useSdk, type PluginThreadAction, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { titleRegenerationAction } from "../src/titleActions";
import type { TitleRegenerationResult } from "../src/titleGeneration";
import { project, provider, thread } from "./fixtures";

vi.mock("sonner", () => ({ toast: { loading: vi.fn(() => "title-notice"), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));

const threads = [thread({ providerId: provider.id }), thread({ id: "t2", title: "Вторая задача", displayTitle: "Вторая задача", href: "/projects/p1/threads/t2", providerId: provider.id, isUnread: true })];
let slot: RenderedSlot | undefined;
beforeEach(() => {
  document.documentElement.lang = "ru";
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.clearAllMocks();
});
afterEach(() => {
  slot?.lifecycle.unmount();
  slot = undefined;
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("lang");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

async function mount({ compact = false, language = "ru", response = async () => ({ ok: true, title: "Новое название", previousTitle: "Вторая задача" } as const) }: {
  compact?: boolean;
  language?: "ru" | "en";
  response?: (input: { threadId: string }) => Promise<TitleRegenerationResult>;
} = {}) {
  document.documentElement.lang = language;
  const app = await loadPluginApp(() => import("../app"));
  const NotionSidebar = app.threadLists[0].component;
  const actions = new Map<string, PluginThreadAction>();
  // The official harness captures global registrations but deliberately leaves
  // their host evaluation to threadActions. Mount the real registration hook
  // once, then give its evaluated items to the real sidebar's native menus.
  function Host(props: PluginThreadListProps) {
    const data = titleRegenerationAction.useData!({ threadIds: threads.map(item => item.id) });
    const sdk = useSdk(), navigate = useBbNavigate();
    for (const target of threads) {
      const action = titleRegenerationAction.item({ thread: { ...target, environment: null }, data, sdk, navigate });
      if (action) actions.set(target.id, action);
    }
    return <NotionSidebar {...props}/>;
  }
  const onNavigate = vi.fn(), update = vi.fn<ReturnType<typeof useSdk>["threads"]["update"]>().mockRejectedValue(new Error("Unexpected browser title write"));
  slot = renderSlot({ component: Host }, { activeThreadId: "t1", activeProjectId: "p1", isCompactViewport: compact, onNavigate, searchQuery: "" }, {
    pluginId: "threadspace",
    context: { projectId: "p1", threadId: "t1" },
    sidebarThreads: { status: "ready", threads, projects: [project], sections: [] },
    providers: { status: "ready", providers: [provider] },
    sdk: { threads: { update } },
    rpc: {
      appearance_get: () => ({ p1: { emoji: "📁", color: "default" } }),
      title_regenerate: input => response(input as { threadId: string }),
    },
    threadActions: (target, { requestRename }) => {
      const action = actions.get(target.id);
      return [
        { key: "bb--core/rename", pluginId: "bb--core", group: "organize", action: { label: language === "ru" ? "Переименовать" : "Rename", icon: "Pencil", run: async () => requestRename(target.id) } },
        ...(action ? [{ key: "threadspace/regenerate-title", pluginId: "threadspace", group: titleRegenerationAction.group, action: { ...action, run: async (value?: string) => { await action.run({ value, requestRename }); } } }] : []),
      ];
    },
  });
  await slot.findByRole("button", { name: language === "ru" ? "Иконка, цвет и действия: Проект" : "Icon, colour and actions for Проект" });
  await act(async () => {});
  return { app, slot, actions, onNavigate, update };
}
function row(id = "t2") {
  const element = slot!.container.querySelector<HTMLElement>(`.ns-row[data-thread-id="${id}"]`);
  if (!element) throw new Error(`Missing thread row ${id}`);
  return element;
}
function openMenu(id = "t2", language = "ru") {
  fireEvent.click(within(row(id)).getByRole("button", { name: language === "ru" ? `Действия с тредом ${id === "t1" ? "Задача" : "Вторая задача"}` : `Actions for ${id === "t1" ? "Задача" : "Вторая задача"}` }));
}
function expectNoNavigationOrWrite(current: Awaited<ReturnType<typeof mount>>) {
  expect(current.slot.inspection.navigateCalls).toHaveLength(0);
  expect(current.slot.inspection.sdkCalls).toHaveLength(0);
  expect(current.onNavigate).not.toHaveBeenCalled();
  expect(current.update).not.toHaveBeenCalled();
  expect(within(row("t1")).getByRole("link").getAttribute("aria-current")).toBe("page");
  expect(within(row("t2")).getByRole("link").getAttribute("aria-current")).toBeNull();
  expect(within(row("t2")).getByRole("link").textContent).toBe("Вторая задача");
}

describe("thread title regeneration actions", () => {
  it("registers one global organize action for every host menu and retains native manual rename", async () => {
    const current = await mount();
    expect(current.app.threadActions).toHaveLength(1);
    expect(current.app.threadActions[0]).toMatchObject({ id: "regenerate-title", title: "Regenerate title", icon: "Sparkles", group: titleRegenerationAction.group });
    expect(current.app.threadActions[0].useData).toBe(titleRegenerationAction.useData);
    expect(current.app.threadActions[0].item).toBe(titleRegenerationAction.item);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Сгенерировать название заново" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Переименовать" }));
    const input = screen.getByRole("textbox", { name: "Название треда" });
    expect((input as HTMLInputElement).value).toBe("Вторая задача");
    fireEvent.keyDown(input, { key: "Escape" });
    expectNoNavigationOrWrite(current);
    expect(current.slot.inspection.rpcCalls.filter(call => call.method === "title_regenerate")).toHaveLength(0);
  });

  it.each([false, true])("regenerates the clicked thread through its native menu when compact=%s without selecting or marking it read", async compact => {
    const current = await mount({ compact });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Сгенерировать название заново" }));
    await act(async () => {});
    expect(current.slot.inspection.rpcCalls.filter(call => call.method === "title_regenerate")).toEqual([{ method: "title_regenerate", input: { threadId: "t2" } }]);
    expect(toast.loading).toHaveBeenCalledWith("Генерируем название…");
    expect(toast.success).toHaveBeenCalledWith("Название обновлено", { description: "Новое название" });
    expect(toast.dismiss).toHaveBeenCalledWith("title-notice");
    expect(screen.queryByRole("menu")).toBeNull();
    expectNoNavigationOrWrite(current);
  });

  it("exposes regeneration from the native context menu", async () => {
    const current = await mount();
    fireEvent.contextMenu(row());
    fireEvent.click(screen.getByRole("menuitem", { name: "Сгенерировать название заново" }));
    await act(async () => {});
    expect(current.slot.inspection.rpcCalls.filter(call => call.method === "title_regenerate")).toEqual([{ method: "title_regenerate", input: { threadId: "t2" } }]);
    expectNoNavigationOrWrite(current);
  });

  it("shares pending state between menus, disables only that thread, and allows retry after completion", async () => {
    const job = deferred<TitleRegenerationResult>();
    const current = await mount({ compact: true, response: () => job.promise });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Сгенерировать название заново" }));
    fireEvent.contextMenu(row());
    expect(screen.getByRole("menuitem", { name: "Генерируем название…" }).hasAttribute("disabled")).toBe(true);
    // Close the harness menu through its native rename item; unlike the real
    // host, its resolver has no store subscription to redraw an already-open menu.
    fireEvent.click(screen.getByRole("menuitem", { name: "Переименовать" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Название треда" }), { key: "Escape" });
    openMenu("t1");
    expect(within(row("t1")).getByRole("menuitem", { name: "Сгенерировать название заново" }).hasAttribute("disabled")).toBe(false);
    await act(async () => { job.resolve({ ok: true, title: "Готово", previousTitle: "Вторая задача" }); await job.promise; });
    const context = row().closest('[data-testid="bb-thread-actions-context-menu"]')!;
    // Reopen to read the current host action after its shared data changed.
    fireEvent.contextMenu(row());
    expect(within(context as HTMLElement).getByRole("menuitem", { name: "Сгенерировать название заново" }).hasAttribute("disabled")).toBe(false);
    expectNoNavigationOrWrite(current);
  });

  it("suppresses two activations of the same pre-render action while allowing another thread", async () => {
    const job = deferred<TitleRegenerationResult>();
    const current = await mount({ response: () => job.promise });
    const first = current.actions.get("t2")!, other = current.actions.get("t1")!;
    let firstRun!: void | Promise<void>, duplicateRun!: void | Promise<void>, otherRun!: void | Promise<void>;
    act(() => {
      firstRun = first.run({ requestRename: vi.fn() });
      duplicateRun = first.run({ requestRename: vi.fn() });
      otherRun = other.run({ requestRename: vi.fn() });
    });
    expect(current.slot.inspection.rpcCalls.filter(call => call.method === "title_regenerate")).toEqual([
      { method: "title_regenerate", input: { threadId: "t2" } }, { method: "title_regenerate", input: { threadId: "t1" } },
    ]);
    expect(toast.loading).toHaveBeenCalledTimes(2);
    await act(async () => { job.resolve({ ok: false, reason: "busy" }); await Promise.all([firstRun, duplicateRun, otherRun]); });
    expect(current.actions.get("t2")!.disabled).toBe(false);
    expect(current.actions.get("t1")!.disabled).toBe(false);
    expectNoNavigationOrWrite(current);
  });

  it("reports English success from the current BB interface language", async () => {
    const current = await mount({ language: "en" });
    openMenu("t2", "en");
    fireEvent.click(screen.getByRole("menuitem", { name: "Regenerate title" }));
    await act(async () => {});
    expect(toast.loading).toHaveBeenCalledWith("Generating title…");
    expect(toast.success).toHaveBeenCalledWith("Title updated", { description: "Новое название" });
    expectNoNavigationOrWrite(current);
  });

  const failures = [
    ["off", "Генерация названий отключена в BB → AI services", "Thread title generation is off in BB → AI services"],
    ["unavailable", "Сервис названий недоступен. Проверь BB → AI services", "The title service is unavailable. Check BB → AI services"],
    ["unsupported", "Для этого сервиса нужен API генерации от BB. Сейчас поддерживается bb cloud", "This service needs a title-generation API from BB. Currently supported: bb cloud"],
    ["empty", "В треде пока нет сообщений для названия", "This thread has no messages to name"],
    ["invalid-response", "Сервис не вернул подходящее название", "The service returned no usable title"],
    ["conflict", "Во время генерации название изменилось. Попробуй ещё раз", "The title changed during generation. Try again"],
    ["failed", "Не удалось сгенерировать название. Попробуй ещё раз", "Couldn’t generate a title. Try again"],
    ["cancelled", "Генерация названия отменена", "Title generation was cancelled"],
    ["busy", "Сейчас генерируются другие названия. Попробуй чуть позже", "Other titles are being generated. Try again shortly"],
  ] as const;
  describe.each(["ru", "en"] as const)("%s failures", language => {
    it.each(failures)("explains %s and preserves the existing title", async (reason, ru, en) => {
      const current = await mount({ language, response: async () => ({ ok: false, reason, ...(reason === "unavailable" || reason === "unsupported" ? { serviceName: "Custom AI" } : {}) }) });
      openMenu("t2", language);
      fireEvent.click(screen.getByRole("menuitem", { name: language === "ru" ? "Сгенерировать название заново" : "Regenerate title" }));
      await act(async () => {});
      expect(toast.error).toHaveBeenCalledWith(language === "ru" ? ru : en, { description: reason === "unavailable" || reason === "unsupported" ? `${language === "ru" ? "Сервис" : "Service"}: Custom AI` : undefined });
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.dismiss).toHaveBeenCalledWith("title-notice");
      openMenu("t2", language);
      expect(screen.getByRole("menuitem", { name: language === "ru" ? "Сгенерировать название заново" : "Regenerate title" }).hasAttribute("disabled")).toBe(false);
      expectNoNavigationOrWrite(current);
    });
  });

  it("contains transport rejection, clears pending state, and keeps the title untouched", async () => {
    const current = await mount({ response: async () => { throw new Error("disconnected"); } });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Сгенерировать название заново" }));
    await act(async () => {});
    expect(toast.error).toHaveBeenCalledWith("Не удалось сгенерировать название. Попробуй ещё раз");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith("title-notice");
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Сгенерировать название заново" }).hasAttribute("disabled")).toBe(false);
    expectNoNavigationOrWrite(current);
  });

  it.each(["success", "failure", "exception"] as const)("dismisses its loading notice without stale feedback after unmount on %s", async outcome => {
    const job = deferred<TitleRegenerationResult>();
    const current = await mount({ response: () => job.promise });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Сгенерировать название заново" }));
    current.slot.lifecycle.unmount();
    slot = undefined;
    await act(async () => {
      if (outcome === "exception") job.reject(new Error("disconnected"));
      else job.resolve(outcome === "success" ? { ok: true, title: "После закрытия", previousTitle: "Вторая задача" } : { ok: false, reason: "failed" });
      await Promise.resolve();
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith("title-notice");
    expect(current.slot.inspection.navigateCalls).toHaveLength(0);
    expect(current.slot.inspection.sdkCalls).toHaveLength(0);
  });
});
