import type { ReactNode } from "react";
import type { PluginSidebarProject, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ActivitySpinner } from "./ActivitySpinner";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";
import { defaultAppearance, type ProjectAppearance } from "./preferences";
import type { PreviewData, PreviewGit } from "./previewData";
import { ThreadIndicator } from "./ThreadIndicator";
import type { ThreadStatusPresentation } from "./threadStatus";

const copy = {
  ru: {
    project: "Проект", personal: "Личное", environment: "Среда", checkout: "Рабочая копия",
    noEnvironment: "Среда не назначена", details: "Путь и машина", path: "Путь", host: "Машина",
    checkingGit: "Проверяем Git…", noGit: "Нет репозитория", unknownGit: "Статус Git не получен",
    clean: "Рабочая копия чистая", changed: "Изменено", untracked: "Новых", conflicts: "Конфликты",
    relativeTo: "Относительно", noActiveWork: "Нет активной работы",
    latestUser: "Последняя задача", latestAssistant: "Последний ответ",
    loadingMessage: "Загружаем сообщение…", noMessages: "Сообщений пока нет",
    unavailableMessage: "Предпросмотр сообщения недоступен", updated: "Обновлён",
  },
  en: {
    project: "Project", personal: "Personal", environment: "Environment", checkout: "Checkout",
    noEnvironment: "No environment assigned", details: "Path and machine", path: "Path", host: "Machine",
    checkingGit: "Checking Git…", noGit: "No repository", unknownGit: "Git status unavailable",
    clean: "Working copy is clean", changed: "Changed", untracked: "New", conflicts: "Conflicts",
    relativeTo: "Compared with", noActiveWork: "No active work",
    latestUser: "Latest request", latestAssistant: "Latest reply",
    loadingMessage: "Loading message…", noMessages: "No messages yet",
    unavailableMessage: "Message preview unavailable", updated: "Updated",
  },
};

type PreviewIconName = "worktree" | "branch" | "changed" | "unknown";
function PreviewIcon({ name }: { name: PreviewIconName }) {
  const paths: Record<PreviewIconName, ReactNode> = {
    worktree: <><circle cx="4" cy="3.5" r="1.8"/><circle cx="4" cy="14.5" r="1.8"/><circle cx="14" cy="6" r="1.8"/><path d="M4 5.3v7.4M12.2 6H9a5 5 0 0 0-5 5"/></>,
    branch: <><circle cx="4.5" cy="3.5" r="1.7"/><circle cx="4.5" cy="14.5" r="1.7"/><circle cx="13.5" cy="4.5" r="1.7"/><path d="M4.5 5.2v7.6m9-6.6v1.3a5 5 0 0 1-5 5h-4"/></>,
    changed: <><path d="M10 2.5H4v13h10v-9l-4-4Z"/><path d="M10 2.5v4h4M6.5 10h5M6.5 12.5h4"/></>,
    unknown: <><circle cx="9" cy="9" r="6.5"/><path d="M9 5.6v3.7"/><circle cx="9" cy="12" r=".65" fill="currentColor" stroke="none"/></>,
  };
  return <svg className="ns-preview-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function GitSummary({ git, language }: { git: PreviewGit | null; language: "ru" | "en" }) {
  const t = copy[language];
  if (!git) return <div className="ns-preview-git"><ActivitySpinner label={t.checkingGit}/><span>{t.checkingGit}</span></div>;
  if (git.kind !== "ready") return <div className="ns-preview-git"><PreviewIcon name="unknown"/><span>{git.kind === "none" ? t.noGit : t.unknownGit}</span></div>;

  const counts = [
    git.conflicts > 0 ? `${t.conflicts}: ${git.conflicts}` : null,
    git.changed > 0 ? `${t.changed} ${git.changed}` : null,
    git.untracked > 0 ? `${t.untracked.toLocaleLowerCase(language)} ${git.untracked}` : null,
  ].filter(Boolean).join(" · ");
  const comparison = [
    git.ahead !== null ? `↑${git.ahead}` : null,
    git.behind !== null ? `↓${git.behind}` : null,
  ].filter(Boolean).join(" ");
  const showComparison = git.baseRef && comparison && ((git.ahead ?? 0) > 0 || (git.behind ?? 0) > 0);
  return <>
    <div className={`ns-preview-git${git.conflicts > 0 ? " has-conflicts" : ""}`}>
      {git.conflicts > 0 ? <Icon name="warning"/> : counts ? <PreviewIcon name="changed"/> : <Icon name="check"/>}
      <span>{counts || t.clean}</span>
    </div>
    {showComparison && <div className="ns-preview-comparison"><span>{t.relativeTo} <code>{git.baseRef}</code></span><span>{comparison}</span></div>}
  </>;
}

function relativeTime(timestamp: number, language: "ru" | "en") {
  const difference = (timestamp - Date.now()) / 1000;
  const magnitude = Math.abs(difference);
  const [unit, seconds]: [Intl.RelativeTimeFormatUnit, number] = magnitude < 60 ? ["second", 1]
    : magnitude < 3600 ? ["minute", 60] : magnitude < 86400 ? ["hour", 3600]
      : magnitude < 604800 ? ["day", 86400] : magnitude < 2629800 ? ["week", 604800]
        : magnitude < 31557600 ? ["month", 2629800] : ["year", 31557600];
  return new Intl.RelativeTimeFormat(language, { numeric: "auto", style: "short" }).format(Math.trunc(difference / seconds), unit);
}

export interface ThreadPreviewCardProps {
  thread: PluginSidebarThread;
  project?: PluginSidebarProject;
  appearance?: ProjectAppearance;
  providerName: string;
  status: ThreadStatusPresentation;
  data: PreviewData | null;
}

/** The context-first card: live sidebar facts remain visible while details load. */
export function ThreadPreviewCard({ thread, project, appearance, providerName, status, data }: ThreadPreviewCardProps) {
  const language = useLanguage(), t = copy[language];
  const environment = thread.environment;
  const projectName = project?.name || (project?.isPersonal ? t.personal : t.project);
  const emoji = appearance ? appearance.emoji : project?.isPersonal ? "🏡" : defaultAppearance.emoji;
  const environmentType = environment?.isWorktree === true ? "Worktree" : environment?.isWorktree === false ? t.checkout : t.environment;
  const environmentName = environment?.name || (environment?.isWorktree === false ? project?.name : null);
  const environmentLabel = environment ? [environmentType, environmentName].filter(Boolean).join(" · ") : t.noEnvironment;
  const hasEnvironmentDetails = Boolean(environment?.path || thread.host?.name);
  const branch = data?.git.kind === "ready" ? data.git.branch : data?.git.kind === "none" ? null : environment?.branchName;
  const timestamp = Number.isFinite(thread.updatedAt) && thread.updatedAt > 0 ? new Date(thread.updatedAt) : null;
  // A native plugin may supply its own accessible text without a shareable icon.
  const indicatorStatus = status.kind === "native" && status.busy ? { ...status, kind: "working" as const } : status;
  const environmentIcon = environment?.isWorktree === true ? <PreviewIcon name="worktree"/> : <Icon name="folder"/>;

  return <article className="ns-preview-card" data-preview-thread-id={thread.id} aria-label={thread.displayTitle}>
    <div className="ns-preview-eyebrow">{emoji ? <span className="ns-preview-emoji" aria-hidden="true">{emoji}</span> : <Icon name="folder"/>}<span>{projectName}</span></div>
    <h3 className="ns-preview-title">{thread.displayTitle}</h3>
    <div className="ns-preview-context">
      {hasEnvironmentDetails ? <details className="ns-preview-environment">
        <summary aria-label={`${environmentLabel}. ${t.details}`}>
          {environmentIcon}<span>{environmentLabel}</span><Icon name="chevron" className="ns-preview-chevron"/>
        </summary>
        <dl className="ns-preview-environment-details">
          {environment?.path && <><dt>{t.path}</dt><dd><code>{environment.path}</code></dd></>}
          {thread.host?.name && <><dt>{t.host}</dt><dd>{thread.host.name}</dd></>}
        </dl>
      </details> : <div className="ns-preview-environment-label">{environmentIcon}<span>{environmentLabel}</span></div>}
      {branch && <div className="ns-preview-branch"><PreviewIcon name="branch"/><code>{branch}</code></div>}
      <GitSummary git={data?.git ?? null} language={language}/>
    </div>
    <div className={`ns-preview-status is-${status.kind}`}>
      {status.kind === "none" ? <Icon name="clock"/> : status.kind === "native" && !status.busy ? <Icon name="code"/> : <ThreadIndicator status={indicatorStatus}/>}
      <span>{status.kind === "none" ? t.noActiveWork : status.label}</span>
    </div>
    {data?.excerpt ? <div className="ns-preview-message"><span className="ns-preview-message-label">{data.excerpt.role === "user" ? t.latestUser : t.latestAssistant}</span><p className="ns-preview-excerpt">{data.excerpt.text}</p></div>
      : data === null ? <div className="ns-preview-message-loading" role="status" aria-label={t.loadingMessage}><span/><span/></div>
        : <p className="ns-preview-message-empty">{data.contentState === "unavailable" ? t.unavailableMessage : t.noMessages}</p>}
    <footer className="ns-preview-footer">
      <span className="ns-preview-agent" title={[providerName || thread.providerId, data?.model].filter(Boolean).join(" · ")}>{[providerName || thread.providerId, data?.model].filter(Boolean).join(" · ")}</span>
      {timestamp && <time dateTime={timestamp.toISOString()} title={`${t.updated}: ${new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(timestamp)}`} aria-label={`${t.updated}: ${relativeTime(thread.updatedAt, language)}`}>{relativeTime(thread.updatedAt, language)}</time>}
    </footer>
  </article>;
}
