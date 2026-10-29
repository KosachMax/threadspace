// Screenshot stand: the real Threadspace panel components with neutral demo data.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SidebarView, ThreadRowView, type RowOptions } from "../src/SidebarView";
import { Icon } from "../src/icons";
import { ThreadIndicator } from "../src/ThreadIndicator";
import { resolveThreadStatus } from "../src/threadStatus";
import { InterfaceLanguageProvider } from "../src/i18n";
import type { PluginSidebarThread, PluginSidebarProject } from "@get-bb/plugin-sdk/app";
import type { ProjectAppearance } from "../src/preferences";
import "../src/notion.css";
import "../src/mobile.css";
import "./logos.css";
import "./stand.css";

const projects:PluginSidebarProject[]=[
  {id:"web",name:"acme-web",isPersonal:false,href:"#",settingsHref:"#"},
  {id:"api",name:"billing-api",isPersonal:false,href:"#",settingsHref:"#"},
  {id:"docs",name:"handbook",isPersonal:false,href:"#",settingsHref:"#"},
  {id:"me",name:"Personal",isPersonal:true,href:"#",settingsHref:"#"},
];
type Seed={id:string;title:string;project:string;p:"claude"|"codex";state?:"working"|"waiting"|"error"|"unread";pinned?:number;parent?:string};
const seed:Seed[]=[
  {id:"w1",title:"Checkout redesign: mobile layout",project:"web",p:"claude",state:"working",pinned:1},
  {id:"w2",title:"Release checklist for 3.2",project:"web",p:"codex",pinned:2},
  {id:"w3",title:"Fix flaky cart tests",project:"web",p:"codex",state:"waiting"},
  {id:"w4",title:"Migrate icons to SVG sprites",project:"web",p:"claude",state:"unread"},
  {id:"w5",title:"Audit image sizes on product pages",project:"web",p:"claude"},
  {id:"w6",title:"Split product page into islands",project:"web",p:"codex",parent:"w5"},
  {id:"a1",title:"Invoice PDF renderer",project:"api",p:"codex",state:"error"},
  {id:"a2",title:"Rate limits for webhook retries",project:"api",p:"claude",state:"waiting"},
  {id:"a3",title:"Refund flow edge cases",project:"api",p:"claude"},
  {id:"d1",title:"Onboarding guide rewrite",project:"docs",p:"claude",state:"working"},
  {id:"d2",title:"Glossary cleanup",project:"docs",p:"codex",state:"working"},
  {id:"m1",title:"Trip planning notes",project:"me",p:"claude"},
];
const threads:PluginSidebarThread[]=seed.map((s,i)=>({id:s.id,title:s.title,titleFallback:null,displayTitle:s.title,projectId:s.project,parentThreadId:s.parent||null,lifecycleOwnerThreadId:null,sourceThreadId:null,sectionId:null,originKind:null,originPluginId:null,providerId:s.p,
  status:s.state==="working"?"active":s.state==="error"?"error":"idle",runtimeStatus:s.state==="working"?"active":"idle",queuedWork:"none",hasPendingInteraction:s.state==="waiting",
  activity:{workflows:0,backgroundAgents:0,backgroundCommands:0,planMode:0,goals:0},indicator:s.state==="working"?"runtime":s.state==="waiting"?"waiting-for-input":s.state==="unread"?"unread-success":"none",indicatorLabel:null,
  isUnread:s.state==="unread",isPinned:Boolean(s.pinned),pinnedAt:s.pinned??null,pinSortKey:null,isArchived:false,archivedAt:null,href:"#"+s.id,isHidden:false,environment:null,host:null,createdAt:i,updatedAt:i,lastReadAt:null,latestAttentionAt:0}) as unknown as PluginSidebarThread);
const params=new URLSearchParams(location.search);
const theme=params.get("theme")==="dark"?"dark":"light";
document.documentElement.lang="en";
const appearances:Record<string,ProjectAppearance>={web:{emoji:"🛒",color:"blue"},api:{emoji:"💳",color:"default"},docs:{emoji:"📚",color:"green"},me:{emoji:"🏡",color:"default"}};
try{localStorage.setItem("stand:closed",JSON.stringify(["project:docs","thread:w5"]));}catch{}

function Stand(){
  const [active,setActive]=useState("w1");
  function renderRow(thread:PluginSidebarThread,options:RowOptions){
    const status=resolveThreadStatus(thread,null,false,"en");
    return <ThreadRowView key={thread.id} thread={thread} active={active===thread.id} {...options} onOpen={e=>{e.preventDefault();setActive(thread.id);}}
      leadingNode={<span className="ns-provider"><span className={`stand-logo logo-${thread.providerId}`}/></span>}
      statusNode={status.kind==="none"&&thread.isPinned&&!options.contextLabel?<span className="ns-state ns-state-pinned" role="img" aria-label="Pinned"><Icon name="pin"/></span>:<ThreadIndicator status={status}/>}
      statusLabel={status.label||undefined}
      pinNode={<button className={`ns-icon-button ns-pin${thread.isPinned?" is-pinned":""}`} title="Pin"><Icon name="pin"/></button>}
      archiveNode={<button className="ns-icon-button ns-archive" title="Archive"><Icon name="archive"/></button>}
      menuNode={<button className="ns-icon-button" title="Actions"><Icon name="dots"/></button>}/>;
  }
  return <div className={`stand stand-${theme}`}>
    <aside className="stand-sidebar">
      <div className="stand-head"><Icon name="plus"/>New thread</div>
      <SidebarView projects={projects} threads={threads} appearances={appearances} activeThreadId={active} hostTheme={theme} storageKey="stand" status="ready" showArchived={false} onArchiveView={()=>{}} onNewThread={()=>{}} onAppearance={async()=>{}} renderRow={renderRow} getThreadStatus={t=>resolveThreadStatus(t,null,false,"en")} projectOrder={["web","api","docs","me"]} onProjectOrder={()=>{}}/>
    </aside>
    <main className="stand-main"><div className="stand-title">Checkout redesign: mobile layout</div><div className="stand-msg"/><div className="stand-msg short"/><div className="stand-msg"/><div className="stand-composer">Ask anything…</div></main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<InterfaceLanguageProvider><Stand/></InterfaceLanguageProvider>);
