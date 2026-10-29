import type { PluginSidebarThread, useSdk } from "@get-bb/plugin-sdk/app";

type AppSdk = ReturnType<typeof useSdk>;
export type PreviewSdk = {
  threads: Pick<AppSdk["threads"], "timeline" | "defaultExecutionOptions">;
  environments: Pick<AppSdk["environments"], "status">;
};
type Timeline = Awaited<ReturnType<PreviewSdk["threads"]["timeline"]>>;
type TimelineRow = Timeline["rows"][number];
type GitStatus = Awaited<ReturnType<PreviewSdk["environments"]["status"]>>;

export type PreviewGit = {
  kind: "ready";
  branch: string | null;
  /** Tracked files excluding conflicts; the three file counts do not overlap. */
  changed: number;
  untracked: number;
  conflicts: number;
  /** Comparison with baseRef, not with the branch's remote upstream. */
  ahead: number | null;
  behind: number | null;
  baseRef: string | null;
} | { kind: "none" } | { kind: "unavailable" };

export interface PreviewData {
  model: string | null;
  excerpt: { text: string; role: "assistant" | "user" } | null;
  git: PreviewGit;
  /** Describes the excerpt request; model and Git failures are independent. */
  contentState: "ready" | "unavailable";
}

const EXCERPT_LENGTH = 240;
const CACHE_TTL = 15_000;
const CACHE_LIMIT = 40;
const REQUEST_TIMEOUT = 8_000;

function plainExcerpt(text: string): string {
  const plain = text.replace(/```[^\n]*\n?/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/(^|\s)[#>*]+\s/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ").trim();
  if (plain.length <= EXCERPT_LENGTH) return plain;
  return plain.slice(0, EXCERPT_LENGTH - 1).trimEnd() + "…";
}

function excerptFrom(rows: readonly TimelineRow[]): PreviewData["excerpt"] {
  const latest: { value: { text: string; role: "assistant" | "user"; sequence: number } | null } = { value: null };
  function visit(row: TimelineRow): void {
    if (row.kind === "turn") {
      row.children?.forEach(visit);
    } else if (row.kind === "conversation") {
      const text = plainExcerpt(row.text);
      // Host-generated manager messages are not the human's latest prompt.
      if (row.role === "user" && row.initiator !== "user") return;
      if (text && (!latest.value || row.sourceSeqEnd >= latest.value.sequence)) {
        latest.value = { text, role: row.role, sequence: row.sourceSeqEnd };
      }
    }
  }
  rows.forEach(visit);
  const result = latest.value;
  return result ? { text: result.text, role: result.role } : null;
}

function gitFrom(status: GitStatus): PreviewGit {
  if (status.outcome === "not_applicable") return { kind: "none" };
  if (status.outcome !== "available") return { kind: "unavailable" };
  const { checkout, workingTree, mergeBase } = status.workspace;
  let changed = 0, untracked = 0, conflicts = 0;
  for (const file of workingTree.files) {
    if (file.status === "?" || file.status === "??") untracked++;
    else if (file.status === "U") conflicts++;
    else changed++;
  }
  return {
    kind: "ready",
    branch: checkout.kind === "branch" || checkout.kind === "unborn" ? checkout.branchName : null,
    changed, untracked, conflicts,
    ahead: mergeBase?.aheadCount ?? null,
    behind: mergeBase?.behindCount ?? null,
    baseRef: mergeBase?.baseRef ?? mergeBase?.mergeBaseBranch ?? null,
  };
}

function cacheKey(thread: PluginSidebarThread): string {
  const env = thread.environment;
  return JSON.stringify([thread.id, thread.updatedAt, thread.providerId, thread.host?.id,
    env?.id, env?.name, env?.path, env?.branchName, env?.isWorktree]);
}
function abortError(): DOMException { return new DOMException("Preview request cancelled", "AbortError"); }

/** Only call load after the hover delay. This never opens or marks a thread read. */
export function createPreviewLoader(sdk: PreviewSdk) {
  const cache = new Map<string, { data: PreviewData; expires: number }>();
  const active = new Set<AbortController>();
  function peek(thread: PluginSidebarThread): PreviewData | undefined {
    const key = cacheKey(thread), entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) { cache.delete(key); return undefined; }
    return entry.data;
  }
  return {
    peek,
    clear(): void {
      cache.clear();
      active.forEach(controller => controller.abort());
      active.clear();
    },
    async load(thread: PluginSidebarThread, { signal }: { signal?: AbortSignal } = {}): Promise<PreviewData> {
      if (signal?.aborted) throw abortError();
      const cached = peek(thread);
      if (cached) return cached;
      const controller = new AbortController();
      active.add(controller);
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; abort(); }, REQUEST_TIMEOUT);
      let rejectAbort: (() => void) | undefined;
      const cancelled = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(abortError());
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
      });
      const request = { threadId: thread.id, signal: controller.signal };
      // A timeout settles only still-pending requests; already loaded parts
      // remain usable when another host operation is slow or unavailable.
      function bounded<T>(read: () => Promise<T>): Promise<T> {
        return Promise.race([Promise.resolve().then(() => {
          if (controller.signal.aborted) throw abortError();
          return read();
        }), cancelled]);
      }
      try {
        // The tail is one segment, including nested conversation rows. No full
        // history, runtime load, navigation, or mutation is requested on hover.
        const environmentId = thread.environment?.id;
        const [timeline, options, git] = await Promise.allSettled([
          bounded(() => sdk.threads.timeline({ ...request, segmentLimit: "1", includeNestedRows: "true", summaryOnly: "false", deferContent: "false" })),
          bounded(() => sdk.threads.defaultExecutionOptions(request)),
          environmentId
            ? bounded(() => sdk.environments.status({ environmentId, signal: controller.signal }))
            : Promise.resolve(null),
        ] as const);
        if (signal?.aborted || controller.signal.aborted && !timedOut) throw abortError();
        const data: PreviewData = {
          model: options.status === "fulfilled" ? options.value?.model || null : null,
          excerpt: timeline.status === "fulfilled" ? excerptFrom(timeline.value.rows) : null,
          contentState: timeline.status === "fulfilled" ? "ready" : "unavailable",
          git: git.status === "fulfilled" ? git.value ? gitFrom(git.value) : { kind: thread.environment ? "unavailable" : "none" } : { kind: "unavailable" },
        };
        const key = cacheKey(thread);
        cache.set(key, { data, expires: Date.now() + CACHE_TTL });
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        return data;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
        active.delete(controller);
      }
    },
  };
}
