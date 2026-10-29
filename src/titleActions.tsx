import { useCallback, useEffect, useRef, useState } from "react";
import { experimental_THREAD_ACTION_GROUPS, useRpc, type PluginThreadActionRegistration } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "../server";
import { useInterfaceLanguage } from "./i18n";
import { messages } from "./messages";
import type { Language } from "./messages";
import type { TitleRegenerationResult } from "./titleGeneration";

type ActionData = {
  language: Language;
  pending: ReadonlySet<string>;
  regenerate(threadId: string): Promise<void>;
};

function useTitleActionData(): ActionData {
  const rpc = useRpc<typeof rpcContract>();
  const language = useInterfaceLanguage();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const running = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const regenerate = useCallback(async (threadId: string) => {
    if (running.current.has(threadId)) return;
    running.current.add(threadId);
    setPending(new Set(running.current));
    const t = messages[language];
    const notification = toast.loading(t.regeneratingTitle);
    try {
      const result: TitleRegenerationResult = await rpc.call("title_regenerate", { threadId });
      if (!mounted.current) return;
      if (result.ok) toast.success(t.titleRegenerated, { description: result.title });
      else toast.error(t.titleGenerationErrors[result.reason], {
        description: result.serviceName ? t.titleService(result.serviceName) : undefined,
      });
    } catch {
      if (mounted.current) toast.error(t.titleGenerationErrors.failed);
    } finally {
      toast.dismiss(notification);
      running.current.delete(threadId);
      if (mounted.current) setPending(new Set(running.current));
    }
  }, [rpc, language]);
  return { language, pending, regenerate };
}

// One host subscription for all menus, including the sidebar, header and touch drawer.
export const titleRegenerationAction: PluginThreadActionRegistration<ActionData> = {
  id: "regenerate-title",
  title: "Regenerate title",
  icon: "Sparkles",
  group: experimental_THREAD_ACTION_GROUPS.organize,
  order: 21,
  useData: useTitleActionData,
  item: ({ thread, data }) => {
    const t = messages[data.language];
    const pending = data.pending.has(thread.id);
    return {
      label: pending ? t.regeneratingTitle : t.regenerateTitle,
      detail: t.titleGenerationSetting,
      icon: "Sparkles",
      disabled: pending,
      run: () => data.regenerate(thread.id),
    };
  },
};
