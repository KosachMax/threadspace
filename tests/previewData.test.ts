import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewLoader, type PreviewSdk } from "../src/previewData";
import { thread } from "./fixtures";

type Timeline = Awaited<ReturnType<PreviewSdk["threads"]["timeline"]>>;
type GitStatus = Awaited<ReturnType<PreviewSdk["environments"]["status"]>>;
const environment = { id: "env-1", name: "Checkout", branchName: "feature/preview", path: "/project/tree", isWorktree: true, providerId: "git-worktree", workspaceDisplayKind: "managed-worktree" as const };
// These fixtures cover the response fields this read-only adapter consumes.
function timeline(text = "**The latest result**", sequence = 20): Timeline {
  return { rows: [{ kind: "turn", children: [
    { kind: "conversation", role: "assistant", text, sourceSeqEnd: sequence },
    { kind: "conversation", role: "user", initiator: "system", text: "Internal manager notification", sourceSeqEnd: sequence + 1 },
  ] }] } as unknown as Timeline;
}
function git(files: { status: string }[] = []): GitStatus {
  return { outcome: "available", workspace: {
    checkout: { kind: "branch", branchName: "feature/preview" },
    branch: { currentBranch: "feature/preview", defaultBranch: "main" },
    workingTree: { files, fileCount: files.length, state: files.length ? "dirty_uncommitted" : "clean" },
    mergeBase: { aheadCount: 2, behindCount: 3, baseRef: "origin/main", mergeBaseBranch: "main" },
  } } as unknown as GitStatus;
}
function fixture() {
  const sdk = {
    threads: {
      timeline: vi.fn<PreviewSdk["threads"]["timeline"]>().mockResolvedValue(timeline()),
      defaultExecutionOptions: vi.fn<PreviewSdk["threads"]["defaultExecutionOptions"]>().mockResolvedValue({ model: "test-model", permissionMode: "full", reasoningLevel: "high", serviceTier: "default", source: "client/turn/start" }),
    },
    environments: { status: vi.fn<PreviewSdk["environments"]["status"]>().mockResolvedValue(git()) },
  };
  return { sdk, loader: createPreviewLoader(sdk) };
}
afterEach(() => vi.useRealTimers());

describe("hover preview data", () => {
  it("starts no work before load and requests only the chosen thread's bounded tail and environment", async () => {
    const { sdk, loader } = fixture();
    expect(sdk.threads.timeline).not.toHaveBeenCalled();
    sdk.environments.status.mockResolvedValue(git([{ status: "M" }, { status: "??" }, { status: "U" }]));
    const result = await loader.load(thread({ id: "chosen", environment }));
    expect(sdk.threads.timeline).toHaveBeenCalledWith({ threadId: "chosen", segmentLimit: "1", includeNestedRows: "true", summaryOnly: "false", deferContent: "false", signal: expect.any(AbortSignal) });
    expect(sdk.environments.status).toHaveBeenCalledWith({ environmentId: "env-1", signal: expect.any(AbortSignal) });
    expect(result).toEqual({ model: "test-model", contentState: "ready", excerpt: { role: "assistant", text: "The latest result" }, git: { kind: "ready", branch: "feature/preview", changed: 1, untracked: 1, conflicts: 1, ahead: 2, behind: 3, baseRef: "origin/main" } });
  });
  it("limits retained text, selects by sequence, and ignores host-generated prompts", async () => {
    const { sdk, loader } = fixture();
    sdk.threads.timeline.mockResolvedValue({ rows: [
      { kind: "conversation", role: "user", initiator: "user", text: "Newest prompt ".repeat(40), sourceSeqEnd: 30 },
      { kind: "conversation", role: "assistant", text: "Older response", sourceSeqEnd: 20 },
      { kind: "conversation", role: "user", initiator: "agent", text: "Manager message", sourceSeqEnd: 40 },
    ] } as unknown as Timeline);
    const result = await loader.load(thread());
    expect(result.excerpt?.role).toBe("user");
    expect(result.excerpt?.text.length).toBeLessThanOrEqual(240);
    expect(result.excerpt?.text.endsWith("…")).toBe(true);
    expect(sdk.environments.status).not.toHaveBeenCalled();
    expect(result.git).toEqual({ kind: "none" });
  });
  it("keeps failures independent and never treats unavailable Git as clean", async () => {
    const { sdk, loader } = fixture();
    sdk.threads.defaultExecutionOptions.mockRejectedValue(new Error("Model unavailable"));
    sdk.environments.status.mockRejectedValue(new Error("Host offline"));
    expect(await loader.load(thread({ environment }))).toMatchObject({ model: null, contentState: "ready", excerpt: { text: "The latest result" }, git: { kind: "unavailable" } });
    sdk.threads.timeline.mockRejectedValue(new Error("Timeline unavailable"));
    sdk.environments.status.mockResolvedValue({ outcome: "not_applicable", reason: "non_git_environment", message: "No repository" });
    expect(await loader.load(thread({ id: "personal", environment }))).toMatchObject({ contentState: "unavailable", excerpt: null, git: { kind: "none" } });
  });
  it("does not invent divergence or a branch for detached or unknown comparisons", async () => {
    const { sdk, loader } = fixture();
    const status = git();
    if (status.outcome !== "available") throw new Error("Invalid fixture");
    status.workspace.checkout = { kind: "detached", headSha: "abc" };
    status.workspace.mergeBase = null;
    sdk.environments.status.mockResolvedValue(status);
    expect((await loader.load(thread({ environment }))).git).toMatchObject({ kind: "ready", branch: null, ahead: null, behind: null, baseRef: null });
  });
  it("reuses fresh data but invalidates it on thread updates, environment changes and expiry", async () => {
    vi.useFakeTimers();
    const { sdk, loader } = fixture(), current = thread({ environment });
    const first = await loader.load(current);
    expect(loader.peek(current)).toBe(first);
    expect(await loader.load(current)).toBe(first);
    expect(sdk.threads.timeline).toHaveBeenCalledTimes(1);
    await loader.load({ ...current, updatedAt: 2 });
    await loader.load({ ...current, environment: { ...environment, id: "env-2" } });
    expect(sdk.threads.timeline).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(15_001);
    expect(loader.peek(current)).toBeUndefined();
    await loader.load(current);
    expect(sdk.threads.timeline).toHaveBeenCalledTimes(4);
  });
  it("aborts promptly even if an SDK promise ignores cancellation and never caches its late result", async () => {
    const { sdk, loader } = fixture(), current = thread({ environment }), controller = new AbortController();
    let resolve!: (value: Timeline) => void;
    sdk.threads.timeline.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = loader.load(current, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(sdk.environments.status.mock.calls[0][0].signal?.aborted).toBe(true);
    resolve(timeline("Late text"));
    await Promise.resolve();
    expect(loader.peek(current)).toBeUndefined();
    const alreadyAborted = loader.load(current, { signal: controller.signal });
    await expect(alreadyAborted).rejects.toMatchObject({ name: "AbortError" });
    expect(sdk.threads.timeline).toHaveBeenCalledTimes(1);
  });
  it("keeps loaded excerpt and model when the Git request times out", async () => {
    vi.useFakeTimers();
    const { sdk, loader } = fixture();
    sdk.environments.status.mockReturnValue(new Promise(() => {}));
    const pending = loader.load(thread({ environment }));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await pending).toMatchObject({ model: "test-model", excerpt: { text: "The latest result" }, contentState: "ready", git: { kind: "unavailable" } });
    expect(sdk.environments.status.mock.calls[0][0].signal?.aborted).toBe(true);
  });
  it("bounds content requests independently and lets unmount clear pending work", async () => {
    vi.useFakeTimers();
    const { sdk, loader } = fixture();
    sdk.threads.timeline.mockReturnValue(new Promise(() => {}));
    const timeout = loader.load(thread());
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await timeout).toMatchObject({ model: "test-model", contentState: "unavailable", excerpt: null });
    const cancelled = loader.load(thread({ id: "other" }));
    loader.clear();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  });
  it("reports unknown Git for an attached environment that has no queryable id", async () => {
    const { sdk, loader } = fixture();
    const result = await loader.load(thread({ environment: { ...environment, id: null } }));
    expect(result.git).toEqual({ kind: "unavailable" });
    expect(sdk.environments.status).not.toHaveBeenCalled();
  });
  it("bounds completed entries instead of retaining every hovered thread indefinitely", async () => {
    const { sdk, loader } = fixture();
    for (let index = 0; index < 41; index++) await loader.load(thread({ id: `t-${index}` }));
    expect(loader.peek(thread({ id: "t-0" }))).toBeUndefined();
    expect(loader.peek(thread({ id: "t-40" }))).toBeDefined();
    expect(sdk.threads.timeline).toHaveBeenCalledTimes(41);
    loader.clear();
    expect(loader.peek(thread({ id: "t-40" }))).toBeUndefined();
  });
});
