import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  definePluginApp, experimental_useSidebarThreads, useBbNavigate, useSdk, useRpc,
  useRealtime, useRealtimeConnectionState, experimental_usePluginId, experimental_useCodeTheme,
  experimental_useThreadActions, experimental_ThreadActionsMenu as ThreadActionsMenu,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_useSidebarThreadSplit, useSidebarThreadDraft, useSidebarThreadRowStatus,
  useSidebarThreadShortcut, experimental_ThreadStatusGlyph as ThreadStatusGlyph, ThreadTitle,
  useSidebarThreadRowStatuses,
  experimental_useProviders, experimental_ProviderIcon as ProviderIcon,
  type PluginThreadListProps, type PluginSidebarThread, type PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import type { ProjectAppearance } from "./src/preferences";
import { SidebarView, ThreadRowView, type RowOptions } from "./src/SidebarView";
import { Icon } from "./src/icons";
import { ThreadIndicator } from "./src/ThreadIndicator";
import { resolveThreadStatus, projectActivity, type ThreadStatusPresentation } from "./src/threadStatus";
import { InterfaceLanguageProvider, useLanguage, useStrings } from "./src/i18n";
import { ThreadPreviewProvider, useThreadPreviewTrigger } from "./src/ThreadPreview";
import { useCompactSidebar } from "./src/useCompactSidebar";
import { titleRegenerationAction } from "./src/titleActions";
import { SidebarPeekController, TOGGLE_PEEK_EVENT } from "./src/SidebarPeekController";
import "./src/notion.css";
import "./src/peek.css";
import "./src/mobile.css";

function targetFor(thread: PluginSidebarThread): PluginThreadActionTarget {
  return {...thread,environment:thread.environment?.id?{id:thread.environment.id,path:thread.environment.path}:null};
}
type AgentProvider=ReturnType<typeof experimental_useProviders>["providers"][number];
// Native action data also changes when another thread becomes focused. Keep
// that subscription local to its button instead of re-rendering the whole row.
function NativeArchiveAction({thread,target,requestRename}:{thread:PluginSidebarThread;target:PluginThreadActionTarget;requestRename():void}) {
  const t=useStrings(),[archiving,setArchiving]=useState(false);
  const actions=experimental_useThreadActions(target,{keys:["bb--core/archive"],requestRename});
  const archive=actions.find(action=>action.key==="bb--core/archive")?.action;
  if(!archive)return null;
  return <button className="ns-icon-button ns-archive" disabled={archive.disabled||archiving} aria-label={`${thread.isArchived?t.restoreThread:t.archiveThread} ${thread.displayTitle}`} title={thread.isArchived?t.restoreThread:t.archiveThread} onClick={async()=>{setArchiving(true);try{await archive.run();}finally{setArchiving(false);}}}><Icon name={thread.isArchived?"restore":"archive"}/></button>;
}
// Pin into the thread's own project with BB's native pin state.
function PinButton({thread}:{thread:PluginSidebarThread}) {
  const sdk=useSdk(),t=useStrings(),[busy,setBusy]=useState(false);
  const label=thread.isPinned?t.unpinThread:t.pinThread;
  return <button className={`ns-icon-button ns-pin${thread.isPinned?" is-pinned":""}`} disabled={busy} aria-label={`${label} ${thread.displayTitle}`} aria-pressed={thread.isPinned} title={label} onClick={async()=>{setBusy(true);try{await (thread.isPinned?sdk.threads.unpin:sdk.threads.pin)({threadId:thread.id});}catch{toast.error(label);}finally{setBusy(false);}}}><Icon name="pin"/></button>;
}
const LiveThreadRow=memo(function LiveThreadRow({thread,active,options,onOpenThread,provider,compact}:{thread:PluginSidebarThread;active:boolean;options:RowOptions;onOpenThread(threadId:string):void;provider?:AgentProvider;compact:boolean}){
  const sdk=useSdk();
  const language=useLanguage(),t=useStrings();
  const [renaming,setRenaming]=useState(false),[title,setTitle]=useState(thread.title||thread.displayTitle),[saving,setSaving]=useState(false);
  const {rowProps,openDetails}=useThreadPreviewTrigger(thread.id,renaming);
  const openingDetails=useRef(false);
  const restoreMenuFocus=useCallback((event:Event)=>{if(openingDetails.current){event.preventDefault();openingDetails.current=false;}},[]);
  const inline=compact?[{key:"threadspace/details",group:"navigation",action:{label:language==="ru"?"Информация о треде":"Thread information",icon:"Info",run:()=>{openingDetails.current=true;openDetails();}}}]:undefined;
  const committed=useRef(false);
  const requestRename=useCallback(()=>{setTitle(thread.title||thread.displayTitle);committed.current=false;setRenaming(true);},[thread.title,thread.displayTitle]);
  const target=useMemo(()=>targetFor(thread),[thread]);
  const {splitProps}=experimental_useSidebarThreadSplit(thread.id);
  const draft=useSidebarThreadDraft(thread.id),rowStatus=useSidebarThreadRowStatus(thread.id),shortcut=useSidebarThreadShortcut(thread.id);
  const presentation=resolveThreadStatus(thread,rowStatus,draft.hasUnsubmittedDraft,language),indicator=presentation.indicator;
  const descendantActivity=compact&&options.hiddenDescendants?projectActivity(options.hiddenDescendants):null;
  const compactStatus:ThreadStatusPresentation=presentation.kind!=="none"||!descendantActivity?presentation:descendantActivity.waiting?{kind:"waiting",label:t.waitingCount(descendantActivity.waiting),indicator:"waiting-for-input"}:descendantActivity.working?{kind:"working",label:t.workingCount(descendantActivity.working),indicator:"runtime"}:presentation;
  async function commit(){if(committed.current)return;committed.current=true;const next=title.trim();if(!next||next===thread.title){setRenaming(false);return;}setSaving(true);try{await sdk.threads.update({threadId:thread.id,title:next});setRenaming(false);}catch{toast.error(t.renameError);committed.current=false;}finally{setSaving(false);}}
  return <ThreadActionsContextMenu thread={target} requestRename={requestRename} disabled={renaming} inline={inline} onCloseAutoFocus={restoreMenuFocus}>
    <ThreadRowView {...options} compact={compact} rowProps={rowProps} thread={thread} active={active} titleNode={<ThreadTitle threadId={thread.id}/>} shortcut={compact?undefined:shortcut?.label} anchorProps={{...splitProps,"aria-keyshortcuts":shortcut?.ariaKeyshortcuts}}
      leadingNode={<span className="ns-provider" title={provider?.displayName||thread.providerId}><ProviderIcon providerKind="agent" provider={provider??{id:thread.providerId}} fallback="Code" className="ns-provider-icon" aria-label={t.provider(provider?.displayName||thread.providerId)}/></span>}
      onOpen={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpenThread(thread.id);}}
      statusNode={presentation.kind==="none"&&thread.isPinned&&!options.contextLabel?<span className="ns-state ns-state-pinned" role="img" aria-label={t.pinned}><Icon name="pin"/></span>:<ThreadIndicator status={presentation} nativeNode={<ThreadStatusGlyph indicator={indicator} rowStatus={rowStatus} archived={thread.isArchived} size="compact"/>}/>}
      statusLabel={presentation.label||(thread.isPinned?t.pinned:undefined)}
      pinNode={compact||thread.isArchived?undefined:<PinButton thread={thread}/>}
      archiveNode={<NativeArchiveAction thread={thread} target={target} requestRename={requestRename}/>}
      menuNode={<ThreadActionsMenu thread={target} requestRename={requestRename} inline={inline} onCloseAutoFocus={restoreMenuFocus} trigger={trigger=><button {...trigger} className={["ns-icon-button ns-thread-menu",trigger.className].filter(Boolean).join(" ")} aria-label={t.threadActions(thread.displayTitle)} aria-description={compact&&compactStatus.label?compactStatus.label:undefined} title={compact&&compactStatus.label?compactStatus.label:t.actions}>{compact&&compactStatus.kind!=="none"?<ThreadIndicator status={compactStatus} nativeNode={<ThreadStatusGlyph indicator={compactStatus.indicator} rowStatus={rowStatus} archived={thread.isArchived} size="compact"/>}/>:<Icon name="dots"/>}</button>}/>}
      editingNode={renaming&&<input className="ns-rename" aria-label={t.threadTitle} autoFocus disabled={saving} value={title} onFocus={e=>e.target.select()} onChange={e=>setTitle(e.target.value)} onBlur={()=>void commit()} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"){e.preventDefault();void commit();}if(e.key==="Escape"){committed.current=true;setRenaming(false);}}}/>}
    />
  </ThreadActionsContextMenu>;
});

export function NotionSidebar(props:PluginThreadListProps){
  return <InterfaceLanguageProvider><NotionSidebarContent {...props}/></InterfaceLanguageProvider>;
}
function NotionSidebarContent({activeThreadId,onNavigate,isCompactViewport}:PluginThreadListProps){
  const compact=useCompactSidebar(isCompactViewport);
  const language=useLanguage(),t=useStrings();
  const [showArchived,setShowArchived]=useState(false);
  const data=experimental_useSidebarThreads({experimental_lifecycles:showArchived?["archived"]:["active"]});
  const rpc=useRpc<typeof rpcContract>(),navigate=useBbNavigate(),pluginId=experimental_usePluginId(),hostTheme=experimental_useCodeTheme();
  const {toThread,toCompose}=navigate;
  const openThread=useCallback((threadId:string)=>{toThread(threadId);onNavigate();},[toThread,onNavigate]);
  const newThread=useCallback((projectId?:string)=>{toCompose({projectId,focusPrompt:true});onNavigate();},[toCompose,onNavigate]);
  const {providers}=experimental_useProviders();
  const rowStatuses=useSidebarThreadRowStatuses();
  const getThreadStatus=useCallback((thread:PluginSidebarThread)=>resolveThreadStatus(thread,rowStatuses.get(thread.id),false,language),[rowStatuses,language]);
  const providerById=useMemo(()=>new Map(providers.map(provider=>[provider.id,provider])),[providers]);
  const providerNames=useMemo(()=>new Map(providers.map(provider=>[provider.id,provider.displayName])),[providers]);
  const [appearances,setAppearances]=useState<Record<string,ProjectAppearance>>({});
  const updateAppearance=useCallback(async(projectId:string,patch:Partial<ProjectAppearance>)=>{const next=await rpc.call("appearance_set",{projectId,patch});setAppearances(prev=>({...prev,[projectId]:next}));},[rpc]);
  const ids=data.projects.map(p=>p.id).sort().join(","),generation=useRef(0),connection=useRealtimeConnectionState();
  const load=useCallback(async()=>{const current=++generation.current;try{const next=await rpc.call("appearance_get",{projectIds:ids?ids.split(","):[]});if(current===generation.current)setAppearances(next);}catch{toast.error(t.loadEmojiError);}},[rpc,ids,t.loadEmojiError]);
  useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
  useRealtime("appearance-changed",()=>void load());
  const [projectOrder,setProjectOrder]=useState<string[]>([]);
  const loadOrder=useCallback(()=>{rpc.call("project_order_get",{}).then(ids=>setProjectOrder(Array.isArray(ids)?ids:[]),()=>{});},[rpc]);
  useEffect(loadOrder,[loadOrder]);
  useRealtime("project-order-changed",loadOrder);
  const saveOrder=useCallback((ids:string[])=>{setProjectOrder(ids);rpc.call("project_order_set",{projectIds:ids}).catch(()=>{toast.error(t.loadEmojiError);loadOrder();});},[rpc,loadOrder,t.loadEmojiError]);
  const previousConnection=useRef(connection);
  useEffect(()=>{if(connection==="connected"&&previousConnection.current!=="connected")void load();previousConnection.current=connection;},[connection,load]);
  return <ThreadPreviewProvider threads={data.threads} projects={data.projects} appearances={appearances} providerNames={providerNames} theme={hostTheme.mode} activeThreadId={activeThreadId} compact={compact}><SidebarView threads={data.threads} projects={data.projects} activeThreadId={activeThreadId} appearances={appearances} status={data.status} hostTheme={hostTheme.mode} compact={compact} storageKey={`plugin:${pluginId}`} showArchived={showArchived} onArchiveView={setShowArchived} getThreadStatus={getThreadStatus}
    onNewThread={newThread}
    onAppearance={updateAppearance}
    projectOrder={projectOrder} onProjectOrder={saveOrder}
    renderRow={(thread,options)=><LiveThreadRow key={thread.id} thread={thread} active={thread.id===activeThreadId} compact={compact} options={options} onOpenThread={openThread} provider={providerById.get(thread.providerId)}/>}
    hasMoreArchived={data.experimental_archived?.hasNextPage} fetchingArchived={data.experimental_archived?.isFetchingNextPage} onMoreArchived={()=>void data.experimental_archived?.fetchNextPage().catch(()=>toast.error(t.loadArchiveError))}
  /></ThreadPreviewProvider>;
}
export default definePluginApp(app=>{app.slots.experimental_threadList({id:"notion-sidebar",title:"Threadspace · Notion",description:"Notion-style project tree, editable emoji and archive on hover.",component:NotionSidebar});app.slots.experimental_threadAction(titleRegenerationAction);
  app.slots.experimental_appOverlay({id:"sidebar-hover-mode",component:SidebarPeekController});
  app.commands.register({id:"toggle-sidebar-hover-mode",title:"Threadspace: hide sidebar, show on hover",defaultShortcut:{key:"s",mod:true,shift:true},run:()=>{window.dispatchEvent(new Event(TOGGLE_PEEK_EVENT));}});
});
