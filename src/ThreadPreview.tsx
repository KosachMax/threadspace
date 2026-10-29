import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useSdk, useSidebarThreadDraft, useSidebarThreadRowStatus, type PluginSidebarProject, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { createPreviewLoader, type PreviewData } from "./previewData";
import { ThreadPreviewCard } from "./ThreadPreviewCard";
import { resolveThreadStatus } from "./threadStatus";
import { useLanguage } from "./i18n";
import type { ProjectAppearance } from "./preferences";
import { CompactSheet } from "./CompactSheet";
import "./preview.css";

export const PREVIEW_OPEN_DELAY = 450;
const PREVIEW_CLOSE_DELAY = 180;
type Target = { id: string; anchor: HTMLElement; mode: "hover" | "details" };
interface PreviewController {
  enter(id: string, anchor: HTMLElement, keyboard?: boolean): void;
  leave(anchor: HTMLElement): void;
  remove(anchor: HTMLElement): void;
  dismiss(anchor?: HTMLElement): void;
  openDetails(id: string, anchor: HTMLElement): void;
}
const PreviewContext = createContext<PreviewController | null>(null);

/** One popup and one pair of timers for the entire list, including favorites. */
export function ThreadPreviewProvider({ children, threads, projects, appearances, providerNames, theme, activeThreadId, compact = false }: {
  children: ReactNode;
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  appearances: Record<string, ProjectAppearance>;
  providerNames: ReadonlyMap<string, string>;
  theme: "light" | "dark";
  activeThreadId: string | null;
  compact?: boolean;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const current = useRef<Target | null>(null), pending = useRef<Target | null>(null);
  const blocked = useRef<HTMLElement | null>(null), popup = useRef<HTMLDivElement>(null);
  const detailsAnchor = useRef<HTMLElement | null>(null);
  const opening = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const language = useLanguage(), sdk = useSdk();
  const popupId = useId();
  const compactMode = useRef(compact);
  compactMode.current = compact;
  const loader = useMemo(() => createPreviewLoader(sdk), [sdk]);
  useEffect(() => () => loader.clear(), [loader]);
  const controller = useMemo<PreviewController>(() => {
    const clear = () => { clearTimeout(opening.current); clearTimeout(closing.current); pending.current = null; };
    const close = () => { clear(); current.current = null; setTarget(null); };
    return {
      enter(id, anchor, keyboard = false) {
        if (compactMode.current) return;
        if (keyboard && blocked.current === anchor) return;
        if (!keyboard) blocked.current = null;
        clear();
        if (current.current?.anchor === anchor) return;
        current.current = null;
        setTarget(null);
        pending.current = { id, anchor, mode: "hover" };
        opening.current = setTimeout(() => {
          pending.current = null;
          if (!anchor.isConnected) return;
          current.current = { id, anchor, mode: "hover" };
          setTarget(current.current);
        }, PREVIEW_OPEN_DELAY);
      },
      leave(anchor) {
        if (current.current?.mode === "details" || pending.current?.mode === "details") return;
        if (pending.current?.anchor === anchor) { clearTimeout(opening.current); pending.current = null; }
        clearTimeout(closing.current);
        closing.current = setTimeout(() => {
          const row = current.current?.anchor;
          if (row?.matches(":hover") || row?.contains(document.activeElement) || popup.current?.matches(":hover") || popup.current?.contains(document.activeElement)) return;
          close();
        }, PREVIEW_CLOSE_DELAY);
      },
      remove(anchor) {
        if (pending.current?.anchor === anchor || current.current?.anchor === anchor) close();
        if (blocked.current === anchor) blocked.current = null;
      },
      dismiss(anchor) { blocked.current = anchor ?? current.current?.anchor ?? pending.current?.anchor ?? null; close(); },
      openDetails(id, anchor) {
        clear();
        blocked.current = anchor;
        detailsAnchor.current = anchor;
        pending.current = { id, anchor, mode: "details" };
        // Let the host's action drawer finish closing before mounting a modal.
        opening.current = setTimeout(() => {
          pending.current = null;
          if (!anchor.isConnected) return;
          current.current = { id, anchor, mode: "details" };
          setTarget(current.current);
        }, 0);
      },
    };
  }, []);
  useEffect(() => () => { clearTimeout(opening.current); clearTimeout(closing.current); }, []);
  useEffect(() => { controller.dismiss(); }, [activeThreadId, controller]);
  useEffect(() => { controller.dismiss(); }, [compact, controller]);
  useEffect(() => {
    const scroll = (event: Event) => {
      const anchor = current.current?.anchor ?? pending.current?.anchor;
      // A running conversation scrolls as output arrives. Only scrolling the
      // page or the row's own container invalidates this sidebar anchor.
      if (current.current?.mode !== "details" && pending.current?.mode !== "details" && anchor && (event.target === document || (event.target instanceof Node && event.target.contains(anchor)))) controller.dismiss();
    };
    const blur = () => controller.dismiss();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") controller.dismiss(); };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("blur", blur);
    document.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("scroll", scroll, true); window.removeEventListener("blur", blur); document.removeEventListener("keydown", keydown); };
  }, [controller]);
  const thread = target ? threads.find(thread => thread.id === target.id && !thread.isHidden) : undefined;
  useEffect(() => { if (target && (!thread || !target.anchor.isConnected)) controller.dismiss(); }, [target, thread, controller]);
  useEffect(() => {
    const link = target?.anchor.querySelector(target.mode === "details" ? ".ns-thread-menu" : ".ns-link");
    if (!link) return;
    link.setAttribute("aria-controls", popupId);
    link.setAttribute("aria-expanded", "true");
    return () => { link.removeAttribute("aria-controls"); link.removeAttribute("aria-expanded"); };
  }, [target, popupId]);
  const anchorRef = useMemo(() => ({ current: target?.anchor ?? null }), [target]);
  const content = thread && <LivePreview key={JSON.stringify([thread.id,thread.updatedAt,thread.environment,thread.providerId,thread.host?.id])} loader={loader} thread={thread} project={projects.find(project => project.id === thread.projectId)} appearance={appearances[thread.projectId]} providerName={providerNames.get(thread.providerId) || thread.providerId}/>;
  return <PreviewContext.Provider value={controller}>
    {children}
    <Popover.Root open={target?.mode === "hover" && !!thread} onOpenChange={open => { if (!open) controller.dismiss(); }}>
      <Popover.Anchor virtualRef={anchorRef}/>
      {thread && target?.mode === "hover" && <Popover.Portal><Popover.Content id={popupId} ref={popup} className="ns-thread-preview ns-surface" data-theme={theme} lang={language}
        side="right" align="start" sideOffset={8} collisionPadding={12} sticky="always" aria-label={thread.displayTitle}
        onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
        onPointerEnter={() => clearTimeout(closing.current)} onPointerLeave={() => controller.leave(target.anchor)}
        onFocusCapture={() => clearTimeout(closing.current)} onBlurCapture={() => controller.leave(target.anchor)}
        onFocusOutside={event => { if (event.target instanceof Element && event.target.closest(".ns-row .ns-link")) event.preventDefault(); }}
        onEscapeKeyDown={() => { const link = target.anchor.querySelector<HTMLElement>(".ns-link"); controller.dismiss(target.anchor); if (popup.current?.contains(document.activeElement)) link?.focus({ preventScroll: true }); }}>
        {content}
      </Popover.Content></Popover.Portal>}
    </Popover.Root>
    <CompactSheet open={target?.mode === "details" && !!thread} onOpenChange={open => { if (!open) controller.dismiss(); }} title={language === "ru" ? "Информация о треде" : "Thread information"} theme={theme} onCloseAutoFocus={event => { event.preventDefault(); detailsAnchor.current?.querySelector<HTMLElement>(".ns-thread-menu")?.focus({ preventScroll: true }); detailsAnchor.current = null; }}>{target?.mode === "details" && content}</CompactSheet>
  </PreviewContext.Provider>;
}

function LivePreview({ thread, loader, ...props }: { thread: PluginSidebarThread; loader: ReturnType<typeof createPreviewLoader>; project?: PluginSidebarProject; appearance?: ProjectAppearance; providerName: string }) {
  const language = useLanguage();
  const [data, setData] = useState<PreviewData | null>(() => loader.peek(thread) ?? null);
  const rowStatus = useSidebarThreadRowStatus(thread.id), draft = useSidebarThreadDraft(thread.id);
  // Keep the request tied to this thread and environment. Late responses never
  // appear in another thread's card; closing aborts the public read requests.
  useEffect(() => {
    const abort = new AbortController();
    setData(loader.peek(thread) ?? null);
    void loader.load(thread, { signal: abort.signal }).then(next => { if (!abort.signal.aborted) setData(next); }).catch(() => {
      if (!abort.signal.aborted) setData({ model: null, excerpt: null, git: { kind: "unavailable" }, contentState: "unavailable" });
    });
    return () => abort.abort();
  }, [loader, thread.id, thread.updatedAt, thread.environment?.id, thread.environment?.path, thread.environment?.branchName]);
  return <ThreadPreviewCard {...props} thread={thread} data={data} status={resolveThreadStatus(thread, rowStatus, draft.hasUnsubmittedDraft, language)}/>;
}

/** Event handlers add no row-level data subscriptions or fetches. */
export function useThreadPreviewTrigger(threadId: string, disabled = false): { rowProps: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement> }; openDetails(): void } {
  const controller = useContext(PreviewContext), anchor = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => { if (!node && anchor.current) controller?.remove(anchor.current); anchor.current = node; }, [controller]);
  return { openDetails: () => { if (!disabled && anchor.current) controller?.openDetails(threadId, anchor.current); }, rowProps: {
    ref,
    onPointerEnter: event => { if (!disabled && event.pointerType !== "touch") controller?.enter(threadId, event.currentTarget); },
    onPointerLeave: event => controller?.leave(event.currentTarget),
    onFocusCapture: event => { if (!disabled && (event.target as Element).closest(".ns-link")) controller?.enter(threadId, event.currentTarget, true); },
    onBlurCapture: event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) controller?.leave(event.currentTarget); },
    onPointerDownCapture: event => controller?.dismiss(event.currentTarget),
    onContextMenu: event => controller?.dismiss(event.currentTarget),
  } };
}
