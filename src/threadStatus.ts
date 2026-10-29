import type { PluginSidebarThread, PluginSidebarThreadIndicator, PluginSidebarThreadRowStatus } from "@get-bb/plugin-sdk/app";
import { messages, type Language } from "./messages";

export type ThreadStateKind="working"|"waiting"|"error"|"queued"|"unread"|"draft"|"archived"|"native"|"none";
export interface ThreadStatusPresentation {kind:ThreadStateKind;label:string;indicator:PluginSidebarThreadIndicator;busy?:boolean}

/** The sidebar feed is live. Derive attention from current facts, never from timers. */
export function resolveThreadStatus(thread:PluginSidebarThread,rowStatus?:PluginSidebarThreadRowStatus|null,hasDraft=false,language:Language="en"):ThreadStatusPresentation {
  const t=messages[language],nativeLabels:Partial<Record<PluginSidebarThreadIndicator,string>>=t.nativeStatus;
  const indicator=hasDraft&&thread.indicator==="none"?"draft":thread.indicator;
  const view=(kind:ThreadStateKind,label:string):ThreadStatusPresentation=>({kind,label,indicator});
  if(thread.isArchived)return view("archived",t.archived);
  if(indicator==="waiting-for-input"||thread.hasPendingInteraction)return view("waiting",t.needsInput);
  if(indicator==="unread-error"||thread.status==="error"||thread.runtimeStatus==="error")return view("error",t.executionError);
  if(indicator==="queued-failed"||thread.queuedWork==="failed")return view("error",t.queuedError);
  if(thread.runtimeStatus==="waiting-for-host")return view("queued",t.waitingHost);
  if(thread.runtimeStatus==="provisioning")return view("queued",t.provisioning);
  // Preserve another plugin's row glyph, matching BB's exception for runtime.
  if(rowStatus&&indicator!=="runtime")return {...view(rowStatus.tone==="error"?"error":"native",rowStatus.label),busy:rowStatus.tone==="running"};
  if(nativeLabels[indicator])return {...view("native",nativeLabels[indicator]!),busy:true};
  if(indicator==="runtime"||indicator==="working-draft"||["active","starting","stopping"].includes(thread.status)) {
    const label=thread.runtimeStatus==="starting"||thread.status==="starting"?t.starting:thread.runtimeStatus==="stopping"||thread.status==="stopping"?t.stopping:t.working;
    return view("working",label+(thread.queuedWork==="waiting"?t.nextQueued:hasDraft||indicator==="working-draft"?t.hasDraft:""));
  }
  if(indicator==="unread-success")return view("unread",t.unreadResult);
  if(indicator==="queued-waiting"||thread.queuedWork==="waiting"||thread.status==="pending")return view("queued",t.queued);
  if(indicator==="draft")return view("draft",t.draft);
  return view("none","");
}

export interface ProjectActivity {working:number;waiting:number}
export function projectActivity(threads:readonly PluginSidebarThread[],getStatus:(thread:PluginSidebarThread)=>ThreadStatusPresentation=resolveThreadStatus):ProjectActivity {
  const counts:ProjectActivity={working:0,waiting:0};
  for(const thread of threads) {
    if(thread.isHidden||thread.isArchived)continue;
    const {kind,busy}=getStatus(thread);
    if(kind==="working"||kind==="waiting")counts[kind]++;
    else if(kind==="native"&&(busy||Object.values(thread.activity).some(count=>count>0)))counts.working++;
  }
  return counts;
}
export function projectActivityLabel(counts:ProjectActivity,language:Language="en"):string {
  const t=messages[language];
  return [counts.working&&t.workingCount(counts.working),counts.waiting&&t.waitingCount(counts.waiting)].filter(Boolean).join(" · ");
}
