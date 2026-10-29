import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createTitleRegenerator, sanitizeGeneratedTitle, type TitleGenerationSdk } from "../src/titleGeneration";
import plugin from "../server";

type AiServices = Awaited<ReturnType<TitleGenerationSdk["system"]["aiServices"]>>;
type Host = ReturnType<typeof createFakePluginHost>;
const hosts: Host[] = [];
const regenerators: ReturnType<typeof createTitleRegenerator>[] = [];
const cloud: AiServices["services"][number] = { id: "bb", pluginId: "bb-ai", displayName: "bb cloud", automaticRank: 0, status: { ready: true }, tasks: ["thread-title"] };
const local: AiServices["services"][number] = { ...cloud, id: "local", pluginId: "local-ai", displayName: "Local AI", automaticRank: 200 };
function services(selection: AiServices["selections"]["thread-title"] = { mode: "automatic" }, available: AiServices["services"] = [cloud]): AiServices {
  return { selections: { "thread-title": selection, "commit-message": { mode: "automatic" }, voice: { mode: "automatic" } }, services: available };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fetchCalls(host: Host): unknown[][] {
  return host.harness.sdk.callsTo("plugins.callRpc").filter(([args]) => (args as { pluginId: string }).pluginId === "bb-account");
}
function fixture(options: Parameters<typeof createTitleRegenerator>[1] = {}) {
  let view = services();
  const titles = new Map<string, string | null>([["chosen", "Old title"], ["other", "Other title"]]);
  const get = vi.fn(async ({ threadId }: { threadId: string }) => makeThreadResponse({ id: threadId, title: titles.get(threadId) ?? null }));
  const aiServices = vi.fn(async () => view);
  let rows: unknown[] = [
    { kind: "conversation", role: "user", initiator: "user", text: "Fix authentication redirect", sourceSeqEnd: 1 },
    { kind: "conversation", role: "assistant", text: "The callback currently drops the return URL.", sourceSeqEnd: 2 },
  ];
  const timeline = vi.fn(async () => ({ rows }));
  const overview = vi.fn(async (): Promise<unknown> => ({ enabled: true, status: { ready: true } }));
  const complete = vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ status: 200, body: { text: "Authentication redirect fix" } }));
  const update = vi.fn(async ({ threadId, title }: { threadId: string; title?: string | null }) => {
    titles.set(threadId, title ?? null);
    return makeThreadResponse({ id: threadId, title: title ?? null });
  });
  const host = createFakePluginHost({ pluginId: "threadspace", sdk: {
    system: { aiServices },
    threads: { get, timeline, update },
    plugins: { callRpc: async args => args.pluginId === "bb-ai" && args.method === "overview" ? overview() : complete(args) },
  } });
  hosts.push(host);
  const regenerator = createTitleRegenerator(host.bb.sdk, options);
  regenerators.push(regenerator);
  return { host, regenerator, get, timeline, overview, complete, update, titles, setRows: (next: unknown[]) => { rows = next; }, setServices: (next: AiServices) => { view = next; } };
}
afterEach(async () => {
  regenerators.splice(0).forEach(generator => generator.dispose());
  await Promise.all(hosts.splice(0).map(host => host.harness.lifecycle.dispose()));
  vi.useRealTimers();
});

describe("thread title regeneration backend", () => {
  it("uses the configured cloud service and only mutates the requested thread title", async () => {
    const f = fixture();
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: true, title: "Authentication redirect fix", previousTitle: "Old title" });
    const { sdk } = f.host.harness.inspection;
    expect(sdk.callsTo("threads.timeline")).toEqual([[expect.objectContaining({ threadId: "chosen", segmentLimit: "6", includeNestedRows: "true", summaryOnly: "false", deferContent: "false", signal: expect.any(AbortSignal) })]]);
    expect(sdk.callsTo("plugins.callRpc")).toEqual([
      [expect.objectContaining({ pluginId: "bb-ai", method: "overview", input: null, signal: expect.any(AbortSignal) })],
      [expect.objectContaining({ pluginId: "bb-account", method: "bb-account.v1.fetch", signal: expect.any(AbortSignal), input: expect.objectContaining({ target: "api", method: "POST", path: "/api/ai/v1/complete", timeoutMs: 7_000 }) })],
    ]);
    expect(sdk.callsTo("threads.update")).toEqual([[{ threadId: "chosen", title: "Authentication redirect fix" }]]);
    expect(f.titles.get("other")).toBe("Other title");
    expect(sdk.calls.map(call => call.path)).not.toContain("threads.markRead");
    expect(sdk.calls.map(call => call.path)).not.toContain("threads.send");
  });

  it("honors an off setting without calling a completion service or updating the title", async () => {
    const f = fixture();
    f.setServices(services({ mode: "off" }));
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "off" });
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.titles.get("chosen")).toBe("Old title");
  });

  it("does not substitute cloud for an explicitly selected unsupported service", async () => {
    const f = fixture();
    f.setServices(services({ mode: "service", pluginId: "local-ai", serviceId: "local" }, [cloud, local]));
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "unsupported", serviceName: "Local AI" });
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("uses the same automatic priority and readiness choice as the helper-task setting", async () => {
    const f = fixture();
    f.setServices(services({ mode: "automatic" }, [cloud, { ...local, automaticRank: -1 }]));
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "unsupported", serviceName: "Local AI" });
    expect(f.complete).not.toHaveBeenCalled();
    f.setServices(services({ mode: "automatic" }, [cloud, { ...local, automaticRank: -1, status: { ready: false, message: "Offline" } }]));
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: true });
    expect(f.complete).toHaveBeenCalledTimes(1);
  });

  it("does not use an unavailable selected service and rereads settings on the next request", async () => {
    const f = fixture();
    f.setServices(services({ mode: "service", pluginId: cloud.pluginId, serviceId: cloud.id }, [{ ...cloud, status: { ready: false, message: "Sign in" } }]));
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "unavailable" });
    expect(f.complete).not.toHaveBeenCalled();
    f.setServices(services());
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: true });
    expect(f.complete).toHaveBeenCalledTimes(1);
  });

  it("honors a newly disabled cloud service even while the core readiness snapshot is cached as ready", async () => {
    const f = fixture();
    f.overview.mockResolvedValue({ enabled: false, status: { ready: true } });
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "unavailable" });
    expect(f.overview).toHaveBeenCalledTimes(1);
    expect(f.timeline).not.toHaveBeenCalled();
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("fails closed when the live cloud overview is unavailable or malformed", async () => {
    const f = fixture();
    for (const view of [{ enabled: true, status: { ready: false, message: "Signed out" } }, { enabled: true }, null]) {
      f.overview.mockResolvedValue(view);
      expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false });
    }
    expect(f.timeline).not.toHaveBeenCalled();
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("keeps model context bounded and excludes non-conversation and agent-generated content", async () => {
    const f = fixture();
    f.setRows([{ kind: "turn", children: [
      { kind: "conversation", role: "user", initiator: "system", text: "SYSTEM_PRIVATE_SENTINEL", sourceSeqEnd: 1 },
      { kind: "conversation", role: "user", initiator: "agent", text: "AGENT_PRIVATE_SENTINEL", sourceSeqEnd: 2 },
      { kind: "tool", text: "TOOL_PRIVATE_SENTINEL", sourceSeqEnd: 3 },
      ...Array.from({ length: 18 }, (_, i) => ({ kind: "conversation", role: i % 2 ? "assistant" : "user", initiator: "user", text: `Message ${i} ${"context ".repeat(250)}`, sourceSeqEnd: i + 4 })),
    ] }]);
    await f.regenerator.regenerate("chosen");
    const request = JSON.stringify(fetchCalls(f.host)[0]);
    expect(request).toContain("Message 17");
    expect(request).not.toContain("SYSTEM_PRIVATE_SENTINEL");
    expect(request).not.toContain("AGENT_PRIVATE_SENTINEL");
    expect(request).not.toContain("TOOL_PRIVATE_SENTINEL");
    expect(request.length).toBeLessThan(8_500);
  });

  it("does not ask a service to invent a title when no human or assistant context exists", async () => {
    const f = fixture();
    f.setRows([{ kind: "conversation", role: "user", initiator: "agent", text: "Only a manager message", sourceSeqEnd: 1 }]);
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "empty" });
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("preserves the current title on cloud failure, invalid output or a rejected request", async () => {
    const f = fixture();
    for (const response of [{ status: 503, body: { text: "Unavailable" } }, { status: 200, body: {} }, { status: 200, body: { text: " \n\t " } }]) {
      f.complete.mockResolvedValue(response);
      expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false });
    }
    f.complete.mockRejectedValueOnce(new Error("Network unavailable"));
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "failed" });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.titles.get("chosen")).toBe("Old title");
  });

  it("reports a failed title mutation instead of claiming the generated title was saved", async () => {
    const f = fixture();
    f.update.mockRejectedValueOnce(new Error("Thread update refused"));
    expect(await f.regenerator.regenerate("chosen")).toMatchObject({ ok: false, reason: "failed" });
    expect(f.titles.get("chosen")).toBe("Old title");
  });

  it("does not overwrite a manual rename completed while generation was pending", async () => {
    const f = fixture(), pending = deferred<{ status: number; body: { text: string } }>();
    f.complete.mockReturnValueOnce(pending.promise);
    const result = f.regenerator.regenerate("chosen");
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1));
    f.titles.set("chosen", "Manually chosen title");
    pending.resolve({ status: 200, body: { text: "Late automatic title" } });
    expect(await result).toMatchObject({ ok: false, reason: "conflict" });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.titles.get("chosen")).toBe("Manually chosen title");
  });

  it("does not mutate a thread deleted while generation was pending", async () => {
    const f = fixture(), pending = deferred<{ status: number; body: { text: string } }>();
    f.complete.mockReturnValueOnce(pending.promise);
    const result = f.regenerator.regenerate("chosen");
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1));
    f.get.mockResolvedValueOnce(makeThreadResponse({ id: "chosen", title: "Old title", deletedAt: 20 }));
    pending.resolve({ status: 200, body: { text: "Late title" } });
    expect(await result).toMatchObject({ ok: false, reason: "unavailable" });
    expect(f.update).not.toHaveBeenCalled();
  });

  it("deduplicates simultaneous requests for the same thread", async () => {
    const f = fixture(), pending = deferred<{ status: number; body: { text: string } }>();
    f.complete.mockReturnValueOnce(pending.promise);
    const first = f.regenerator.regenerate("chosen"), second = f.regenerator.regenerate("chosen");
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1));
    pending.resolve({ status: 200, body: { text: "One generated title" } });
    expect(await first).toEqual(await second);
    expect(f.update).toHaveBeenCalledTimes(1);
  });

  it("limits concurrent work across different threads", async () => {
    const f = fixture({ maxConcurrent: 1 }), pending = deferred<{ status: number; body: { text: string } }>();
    f.complete.mockReturnValueOnce(pending.promise);
    const first = f.regenerator.regenerate("chosen");
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1));
    expect(await f.regenerator.regenerate("other")).toMatchObject({ ok: false, reason: "busy" });
    pending.resolve({ status: 200, body: { text: "First title" } });
    await first;
    expect(f.complete).toHaveBeenCalledTimes(1);
    expect(f.titles.get("other")).toBe("Other title");
  });

  it("aborts disposed work and ignores a late completion even when transport ignores cancellation", async () => {
    const f = fixture(), pending = deferred<{ status: number; body: { text: string } }>();
    f.complete.mockReturnValueOnce(pending.promise);
    const result = f.regenerator.regenerate("chosen");
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1));
    const call = fetchCalls(f.host)[0][0] as { signal: AbortSignal };
    f.regenerator.dispose();
    expect(call.signal.aborted).toBe(true);
    expect(await result).toMatchObject({ ok: false, reason: "cancelled" });
    pending.resolve({ status: 200, body: { text: "Late title" } });
    await Promise.resolve();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.titles.get("chosen")).toBe("Old title");
    expect(await f.regenerator.regenerate("other")).toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("waits for the actual acknowledgement once a title mutation has been submitted", async () => {
    const f = fixture(), accepted = deferred<ReturnType<typeof makeThreadResponse>>();
    f.update.mockReturnValueOnce(accepted.promise);
    const result = f.regenerator.regenerate("chosen");
    await vi.waitFor(() => expect(f.update).toHaveBeenCalledTimes(1));
    f.regenerator.dispose();
    accepted.resolve(makeThreadResponse({ id: "chosen", title: "Authentication redirect fix" }));
    expect(await result).toMatchObject({ ok: true, title: "Authentication redirect fix" });
  });

  it("bounds completion time and never applies a timed-out response", async () => {
    vi.useFakeTimers();
    const f = fixture({ timeoutMs: 100 }), pending = deferred<{ status: number; body: { text: string } }>();
    f.complete.mockReturnValueOnce(pending.promise);
    const result = f.regenerator.regenerate("chosen");
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toMatchObject({ ok: false });
    pending.resolve({ status: 200, body: { text: "Too late" } });
    await Promise.resolve();
    expect(f.update).not.toHaveBeenCalled();
  });
});

describe("thread title RPC lifecycle", () => {
  it("validates the thread id and rejects extra fields at the public RPC boundary", async () => {
    const f = fixture();
    await plugin(f.host.bb);
    for (const input of [{ threadId: "" }, { threadId: "a".repeat(201) }, { threadId: "chosen", model: "unapproved-override" }, {}]) {
      await expect(f.host.harness.behavior.callRpc("title_regenerate", input)).rejects.toThrow();
    }
    expect(f.get).not.toHaveBeenCalled();
    expect(f.complete).not.toHaveBeenCalled();
    expect(await f.host.harness.behavior.callRpc("title_regenerate", { threadId: "chosen" })).toMatchObject({ ok: true, title: "Authentication redirect fix" });
  });

  it("connects plugin disposal to in-flight generation cancellation", async () => {
    const f = fixture(), pending = deferred<{ status: number; body: { text: string } }>();
    await plugin(f.host.bb);
    f.complete.mockReturnValueOnce(pending.promise);
    const result = f.host.harness.behavior.callRpc("title_regenerate", { threadId: "chosen" });
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1));
    const call = fetchCalls(f.host)[0][0] as { signal: AbortSignal };
    await f.host.harness.lifecycle.dispose();
    expect(call.signal.aborted).toBe(true);
    expect(await result).toMatchObject({ ok: false, reason: "cancelled" });
    pending.resolve({ status: 200, body: { text: "Late title" } });
    await Promise.resolve();
    expect(f.update).not.toHaveBeenCalled();
  });
});

describe("generated title sanitization", () => {
  it("removes surrounding quotes, code fences and control characters and returns one line", () => {
    expect(sanitizeGeneratedTitle('"Clean title"')).toBe("Clean title");
    expect(sanitizeGeneratedTitle("```\nClean title\n```")).toBe("Clean title");
    const clean = sanitizeGeneratedTitle("  Fix\u0000 login\nredirect\tflow  ");
    expect(clean).not.toBeNull();
    expect(clean).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(clean).toContain("Fix");
  });
  it("bounds Unicode code points without splitting a surrogate pair", () => {
    const clean = sanitizeGeneratedTitle("😀".repeat(80));
    expect(Array.from(clean ?? "")).toHaveLength(48);
    expect(clean).not.toMatch(/[\ud800-\udbff]$/u);
  });
});
