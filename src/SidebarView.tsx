import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type MouseEvent, type AnchorHTMLAttributes, type HTMLAttributes, type Ref, type PointerEvent as ReactPointerEvent } from "react";
import type { PluginSidebarThread, PluginSidebarProject } from "@get-bb/plugin-sdk/app";
import { Icon } from "./icons";
import { EmojiPicker } from "./EmojiPicker";
import { defaultAppearance, type ProjectAppearance } from "./preferences";
import { ProjectActivity } from "./ProjectActivity";
import type { ThreadStatusPresentation } from "./threadStatus";
import { useLanguage, useStrings } from "./i18n";

export interface RowOptions { depth: number; childrenCount: number; expanded: boolean; toggle(): void; favorite?: boolean; pending?: boolean; hiddenDescendants?: readonly PluginSidebarThread[]; contextLabel?: string }
export interface SidebarViewProps {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  appearances: Record<string, ProjectAppearance>;
  activeThreadId: string | null;
  hostTheme: "light" | "dark";
  compact?: boolean;
  storageKey: string;
  status: "loading" | "ready" | "error";
  showArchived: boolean;
  onArchiveView(value: boolean): void;
  onNewThread(projectId?: string): void;
  onAppearance(projectId: string, patch: Partial<ProjectAppearance>): Promise<void>;
  projectOrder?: readonly string[];
  onProjectOrder?(ids: string[]): void;
  renderRow(thread: PluginSidebarThread, options: RowOptions): ReactNode;
  getThreadStatus?(thread:PluginSidebarThread):ThreadStatusPresentation;
  hasMoreArchived?: boolean;
  fetchingArchived?: boolean;
  onMoreArchived?(): void;
}
function stored<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key)||"null")??fallback; } catch { return fallback; } }
function write(key: string, value: unknown) { try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Private browsing still gets an in-memory sidebar. */ } }

// Keep row options stable across route and sibling status updates. The live
// SDK row can then use ordinary React.memo without hiding real prop changes.
function SidebarRow({thread,depth,childrenCount,expanded,favorite,pending,hiddenDescendants,contextLabel,toggleThread,renderRow}:{thread:PluginSidebarThread;depth:number;childrenCount:number;expanded:boolean;favorite?:boolean;pending?:boolean;hiddenDescendants?:readonly PluginSidebarThread[];contextLabel?:string;toggleThread(id:string):void;renderRow:SidebarViewProps["renderRow"]}) {
  const toggle=useCallback(()=>toggleThread(thread.id),[toggleThread,thread.id]);
  const options=useMemo(()=>({depth,childrenCount,expanded,favorite,toggle,pending,hiddenDescendants,contextLabel}),[depth,childrenCount,expanded,favorite,toggle,pending,hiddenDescendants,contextLabel]);
  return <>{renderRow(thread,options)}</>;
}
const ignoreToggle=()=>{};

export function SidebarView(props: SidebarViewProps) {
  const t=useStrings(),language=useLanguage();
  const { threads, projects, activeThreadId, storageKey, hostTheme }=props;
  const [closed,setClosed]=useState<Set<string>>(()=>new Set((()=>{const value=stored<unknown>(`${storageKey}:closed`,[]);return Array.isArray(value)?value.filter((id):id is string=>typeof id==="string"):[];})()));
  const [limits,setLimits]=useState<Record<string,number>>({});
  const lastActive=useRef<string|null>(null);
  // Highlight a pressed thread at once; BB updates activeThreadId only after the thread view renders.
  const [pendingId,setPendingId]=useState<string|null>(null);
  useEffect(()=>setPendingId(null),[activeThreadId]);
  const markPending=useCallback((event:ReactPointerEvent<HTMLDivElement>|MouseEvent<HTMLDivElement>)=>{if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const link=(event.target as Element).closest?.(".ns-link");const id=link?.closest<HTMLElement>("[data-thread-id]")?.dataset.threadId;if(id&&id!==activeThreadId)setPendingId(id);},[activeThreadId]);
  // A finger down may start scrolling rather than opening a thread. Highlight
  // touch navigation only on the resulting click, after the gesture completes.
  const onPointerDown=useCallback((event:ReactPointerEvent<HTMLDivElement>)=>{if(event.pointerType!=="touch")markPending(event);},[markPending]);
  const live=useMemo(()=>threads.filter(t=>!t.isHidden&&t.isArchived===props.showArchived),[threads,props.showArchived]);
  const byId=useMemo(()=>new Map(live.map(t=>[t.id,t])),[live]);
  const children=useMemo(()=>{const result=new Map<string,PluginSidebarThread[]>();for(const t of live){const parent=t.parentThreadId?byId.get(t.parentThreadId):undefined;if(parent&&parent.projectId===t.projectId){const list=result.get(parent.id)||[];list.push(t);result.set(parent.id,list);}}return result;},[live,byId]);
  const toggle=useCallback((key:string)=>{setClosed(prev=>{const next=new Set(prev);next.has(key)?next.delete(key):next.add(key);write(`${storageKey}:closed`,[...next]);return next;});},[storageKey]);
  const toggleThread=useCallback((id:string)=>toggle(`thread:${id}`),[toggle]);
  useEffect(()=>{
    if(!activeThreadId||lastActive.current===activeThreadId||!byId.has(activeThreadId))return;
    lastActive.current=activeThreadId;let node=byId.get(activeThreadId);const keys=new Set<string>(),visited=new Set<string>();
    while(node&&!visited.has(node.id)){visited.add(node.id);keys.add(`project:${node.projectId}`);if(node.parentThreadId){keys.add(`thread:${node.parentThreadId}`);node=byId.get(node.parentThreadId);}else break;}
    setClosed(prev=>{if(![...keys].some(k=>prev.has(k)))return prev;const next=new Set([...prev].filter(k=>!keys.has(k)));write(`${storageKey}:closed`,[...next]);return next;});
  },[activeThreadId,byId,storageKey]);

  const descendantCache=useMemo(()=>new Map<string,PluginSidebarThread[]>(),[children]);
  function descendants(id:string):PluginSidebarThread[] {
    const cached=descendantCache.get(id);if(cached)return cached;
    const out:PluginSidebarThread[]=[],queue=[...(children.get(id)||[])],seen=new Set<string>([id]);
    while(queue.length){const next=queue.shift()!;if(seen.has(next.id))continue;seen.add(next.id);out.push(next);queue.push(...(children.get(next.id)||[]));}
    descendantCache.set(id,out);return out;
  }
  function renderTree(thread: PluginSidebarThread, depth=0, visited=new Set<string>()): ReactNode {
    if(visited.has(thread.id))return null;
    const next=new Set(visited);next.add(thread.id);
    const rows=children.get(thread.id)||[];
    const expanded=!closed.has(`thread:${thread.id}`);
    const hidden=!expanded&&rows.length?descendants(thread.id):undefined;
    return <div key={thread.id}><SidebarRow thread={thread} depth={depth} childrenCount={rows.length} expanded={expanded} pending={pendingId===thread.id} hiddenDescendants={hidden} toggleThread={toggleThread} renderRow={props.renderRow}/>{expanded&&rows.map(t=>renderTree(t,depth+1,next))}</div>;
  }
  const pinOrder=(a:PluginSidebarThread,b:PluginSidebarThread)=>(a.pinSortKey||"~").localeCompare(b.pinSortKey||"~")||(a.pinnedAt||0)-(b.pinnedAt||0);
  const waiting=props.showArchived||!props.getThreadStatus?[]:live.filter(t=>props.getThreadStatus!(t).kind==="waiting");
  const projectNames=useMemo(()=>new Map(projects.map(p=>[p.id,p.name])),[projects]);
  // One heading style for every section; the chevron appears on hover like Notion.
  const heading=(label:string,key:string,count?:number)=><button className="ns-section-heading" data-section={key} aria-expanded={!closed.has(key)} onClick={()=>toggle(key)}><span>{label}</span><Icon name="chevron" className={`ns-section-chevron ${!closed.has(key)?"ns-expanded":""}`}/>{count?<span className="ns-section-count">{count}</span>:null}</button>;
  const orderedProjects=useMemo(()=>{const order=props.projectOrder||[];const rank=new Map(order.map((id,i)=>[id,i]));return projects.map((p,i)=>({p,i})).sort((a,b)=>(rank.get(a.p.id)??order.length+a.i)-(rank.get(b.p.id)??order.length+b.i)).map(x=>x.p);},[projects,props.projectOrder]);
  const [drag,setDrag]=useState<{id:string;over?:string;after?:boolean}|null>(null);
  // Pointer-based reordering: HTML5 drag on the row would swallow clicks on its buttons.
  const dragRef=useRef<{id:string;x:number;y:number;over?:string;after?:boolean;moved:boolean}|null>(null);
  function startDrag(event:React.PointerEvent<HTMLDivElement>,id:string){
    if(event.button!==0||event.pointerType==="touch"||(event.target as Element).closest(".ns-icon-button"))return;
    dragRef.current={id,x:event.clientX,y:event.clientY,moved:false};
    const move=(e:PointerEvent)=>{const d=dragRef.current;if(!d)return;if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<5)return;d.moved=true;
      const section=(document.elementFromPoint(e.clientX,e.clientY) as Element|null)?.closest<HTMLElement>(".ns-project[data-project-id]");
      if(section){const box=section.getBoundingClientRect();d.over=section.dataset.projectId;d.after=e.clientY>box.top+Math.min(box.height,32)/2;}
      setDrag({id:d.id,over:d.over,after:d.after});};
    const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);const d=dragRef.current;dragRef.current=null;setDrag(null);
      if(!d?.moved)return;
      // Swallow the click that follows a drag so the project does not fold.
      const swallow=(e:Event)=>{e.stopPropagation();e.preventDefault();};window.addEventListener("click",swallow,{capture:true,once:true});setTimeout(()=>window.removeEventListener("click",swallow,{capture:true}),0);
      if(!d.over||d.over===d.id)return;const ids=orderedProjects.map(p=>p.id).filter(x=>x!==d.id);let to=ids.indexOf(d.over);if(d.after)to++;ids.splice(to,0,d.id);props.onProjectOrder?.(ids);};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
  }
  const rootRef=useRef<HTMLDivElement>(null);
  // Arrow keys move between visible rows; left/right fold the focused project or thread.
  function onKeyDown(event:React.KeyboardEvent<HTMLDivElement>){
    if(event.defaultPrevented||event.altKey||event.metaKey||event.ctrlKey||!["ArrowDown","ArrowUp","ArrowLeft","ArrowRight"].includes(event.key))return;
    const target=event.target as HTMLElement;if(target.matches("input,textarea"))return;
    const items:HTMLElement[]=Array.from(rootRef.current?.querySelectorAll<HTMLElement>(".ns-section-heading,.ns-project-name,.ns-link")??[]).filter(n=>!n.closest("[hidden]"));
    const current=items.indexOf(target.closest<HTMLElement>(".ns-section-heading,.ns-project-name,.ns-link")!);
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();const next=items[current<0?0:Math.max(0,Math.min(items.length-1,current+(event.key==="ArrowDown"?1:-1)))];next?.focus();return;}
    if(current<0)return;const item=items[current],open=event.key==="ArrowRight";
    if(item.matches(".ns-project-name,.ns-section-heading")){if((item.getAttribute("aria-expanded")==="true")!==open){event.preventDefault();item.click();}return;}
    const row=item.closest(".ns-row"),toggleButton=row?.querySelector<HTMLButtonElement>(":scope>.ns-toggle");
    if(toggleButton&&(toggleButton.getAttribute("aria-expanded")==="true")!==open){event.preventDefault();toggleButton.click();return;}
    if(!open){event.preventDefault();item.closest(".ns-project")?.querySelector<HTMLElement>(".ns-project-name")?.focus();}
  }
  return <div className="ns-sidebar ns-surface" data-theme={hostTheme} data-compact={props.compact || undefined} lang={language} ref={rootRef} onKeyDown={onKeyDown} onPointerDownCapture={onPointerDown} onClickCapture={markPending}>
    {props.status==="loading"&&<div className="ns-empty" role="status">{t.loadingThreads}</div>}
    {props.status==="error"&&<div className="ns-error" role="alert">{t.loadThreadsError}</div>}
    {waiting.length>0&&<section className="ns-section ns-waiting">{heading(t.waitingForYou,"waiting",waiting.length)}{!closed.has("waiting")&&waiting.map(thread=><div key={thread.id}><SidebarRow thread={thread} depth={0} childrenCount={0} expanded={false} pending={pendingId===thread.id} contextLabel={projectNames.get(thread.projectId)} toggleThread={ignoreToggle} renderRow={props.renderRow} favorite/></div>)}</section>}
    {props.showArchived?<div className="ns-projects-label">{t.archive}</div>:heading(t.projects,"projects")}
    {(props.showArchived||!closed.has("projects"))&&orderedProjects.map(project=>{
      const roots=live.filter(t=>t.projectId===project.id&&(!t.parentThreadId||!byId.has(t.parentThreadId)||byId.get(t.parentThreadId)?.projectId!==t.projectId));
      // Pinned threads lead their own project instead of a global favourites list.
      const pinned=props.showArchived?[]:roots.filter(t=>t.isPinned).sort(pinOrder),visible=[...pinned,...roots.filter(t=>props.showArchived||!t.isPinned)];
      const projectThreads=live.filter(t=>t.projectId===project.id);
      const open=!closed.has(`project:${project.id}`);
      const appearance=props.appearances[project.id]||{...defaultAppearance,emoji:project.isPersonal?"🏡":defaultAppearance.emoji};
      // Bound initial mounts for large projects. The selected thread is always included.
      const selectedRoot=(()=>{let t=byId.get(activeThreadId||"");const seen=new Set<string>();while(t?.parentThreadId&&byId.has(t.parentThreadId)&&!seen.has(t.id)){seen.add(t.id);t=byId.get(t.parentThreadId);}return t?.id;})();
      const limit=Math.max(limits[project.id]||40,visible.findIndex(t=>t.id===selectedRoot)+1);
      const dropClass=drag?.over===project.id&&drag.id!==project.id?(drag.after?" is-drop-after":" is-drop-before"):drag?.id===project.id&&drag.over?" is-dragging":"";
      const canDrag=!props.compact&&!props.showArchived&&!!props.onProjectOrder;
      return <section className={`ns-project${dropClass}`} key={project.id} data-color={appearance.color} data-project-id={project.id}>
        <div className="ns-project-heading" title={canDrag?t.moveProject:undefined} onPointerDown={canDrag?e=>startDrag(e,project.id):undefined}>{props.compact?<EmojiPicker name={project.name} value={appearance} theme={hostTheme} compact onChange={patch=>props.onAppearance(project.id,patch)}/>:
          // Desktop: the emoji turns into the disclosure chevron on hover; icon and colour live in "···".
          <button className="ns-toggle ns-project-icon" aria-label={t.projectToggle(project.name,open)} aria-expanded={open} onClick={()=>toggle(`project:${project.id}`)}>{appearance.emoji?<span className="ns-emoji">{appearance.emoji}</span>:<Icon name="folder" className="ns-project-folder"/>}<Icon name="chevron" className={`ns-project-chevron ${open?"ns-expanded":""}`}/></button>}
          <button className="ns-project-name" onClick={()=>toggle(`project:${project.id}`)} aria-expanded={open} aria-label={props.compact?t.projectToggle(project.name,open):undefined}><span className="ns-project-name-text">{project.name}</span><Icon name="chevron" className={`ns-project-name-disclosure ${open?"ns-expanded":""}`}/></button>
          {!props.compact&&<span className="ns-project-tools"><EmojiPicker name={project.name} value={appearance} theme={hostTheme} menuTrigger onChange={patch=>props.onAppearance(project.id,patch)}/></span>}<button className="ns-project-add ns-icon-button" aria-label={t.newProjectThread(project.name)} title={t.addThread} onClick={()=>props.onNewThread(project.id)}><Icon name="plus"/></button>{!open&&!props.showArchived&&<ProjectActivity threads={projectThreads} getStatus={props.getThreadStatus}/>}
        </div>
        {open&&<div className="ns-project-children">{visible.slice(0,limit).map((t,i)=><div key={t.id} className={i===pinned.length-1&&visible.length>pinned.length?"ns-pinned-last":undefined}>{renderTree(t)}</div>)}{visible.length>limit&&<button className="ns-show-more" onClick={()=>setLimits(prev=>({...prev,[project.id]:limit+40}))}>{t.showMore(visible.length-limit)}</button>}{!visible.length&&<>{props.showArchived?<p className="ns-empty-project">{t.emptyArchive}</p>:<button className="ns-empty-project" onClick={()=>props.onNewThread(project.id)}>{t.addThread}</button>}</>}</div>}
      </section>;
    })}
    {props.showArchived&&props.hasMoreArchived&&<button className="ns-show-more" disabled={props.fetchingArchived} onClick={props.onMoreArchived}>{props.fetchingArchived?t.loading:t.moreArchived}</button>}
    <div className="ns-bottom"><button className={`ns-bottom-button ${props.showArchived?"is-active":""}`} aria-pressed={props.showArchived} onClick={()=>props.onArchiveView(!props.showArchived)}><Icon name="archive"/>{props.showArchived?t.allThreads:t.archive}</button></div>
  </div>;
}

export interface ThreadRowViewProps extends RowOptions {
  thread: PluginSidebarThread;
  active: boolean;
  leadingNode?: ReactNode;
  titleNode?: ReactNode;
  statusNode?: ReactNode;
  statusLabel?: string;
  archiveNode?: ReactNode;
  pinNode?: ReactNode;
  menuNode?: ReactNode;
  editingNode?: ReactNode;
  shortcut?: string;
  anchorProps?: AnchorHTMLAttributes<HTMLAnchorElement>;
  rowProps?: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> };
  compact?: boolean;
  onOpen(event: MouseEvent<HTMLAnchorElement>): void;
}
export function ThreadRowView({thread,active,depth,childrenCount,expanded,toggle,favorite,pending,hiddenDescendants,contextLabel,leadingNode,titleNode,statusNode,statusLabel,pinNode,archiveNode,menuNode,editingNode,shortcut,anchorProps,rowProps,compact,onOpen}: ThreadRowViewProps){
  const t=useStrings();
  return <div {...rowProps} className={`ns-row ${active?"is-active":""} ${pending&&!active?"is-pending":""} ${thread.isUnread?"is-unread":""} ${childrenCount?"has-children":""}`} style={{"--depth":Math.min(depth,8)} as CSSProperties} data-thread-id={thread.id}>
    {childrenCount?<button className="ns-toggle" aria-expanded={expanded} aria-label={t.threadToggle(thread.displayTitle,expanded)} onClick={toggle}>{compact&&<span className="ns-disclosure-provider">{leadingNode??<Icon name="code"/>}</span>}<Icon name="chevron" className={expanded?"ns-expanded":""}/></button>:<span className="ns-row-spacer"/>}
    {editingNode||<a {...anchorProps} className="ns-link" href={thread.href} onClick={onOpen} aria-current={active?"page":undefined} title={rowProps?undefined:thread.displayTitle} aria-label={contextLabel?`${thread.displayTitle}, ${contextLabel}`:thread.displayTitle} aria-haspopup={rowProps?"dialog":undefined} {...(!favorite?{"data-sidebar-thread-shortcut-target":"","data-sidebar-thread-id":thread.id}:{})}>{!(compact&&childrenCount)&&(leadingNode??<Icon name="code"/>)}<span className="ns-row-title">{titleNode??thread.displayTitle}</span>{contextLabel&&<span className="ns-row-context">{contextLabel}</span>}</a>}
    <div className="ns-row-end">{shortcut?<kbd className="ns-shortcut">{shortcut}</kbd>:<>{!compact&&<span className="ns-status" title={statusLabel}>{statusLabel||!hiddenDescendants?.length?statusNode:<ProjectActivity threads={hiddenDescendants}/>}</span>}<span className="ns-hover-tools">{pinNode}{archiveNode}{menuNode}</span></>}</div>
  </div>;
}
