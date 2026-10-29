// @vitest-environment jsdom
import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PluginSidebarThread, experimental_useThreadActions } from "@get-bb/plugin-sdk/app";
import { project, provider, thread } from "./fixtures";
import { NotionSidebar } from "../app";

const RouteContext=createContext("t1");
const ActionStoreContext=createContext("t1");
const navigation={toThread:vi.fn(),toCompose:vi.fn()};
const titleRenders=new Map<string,number>(),providerRenders=new Map<string,number>();
const providers=[provider,{...provider,id:"provider-2"},{...provider,id:"provider-3"}];
const rowStatuses=new Map();
const rpc={call:vi.fn(async()=>({p1:{emoji:"📁",color:"default"}}))};
const onNavigate=vi.fn();
let threads:PluginSidebarThread[]=[];
const archiveActions=new Map<string,ReturnType<typeof experimental_useThreadActions>[number]["action"]>();

vi.mock("@get-bb/plugin-sdk/app",async importOriginal=>{
  const actual=await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return {...actual,
    // The host navigation hook consumes router location even though toThread
    // itself remains stable. A row must not subscribe to that route context.
    useBbNavigate:()=>{useContext(RouteContext);return {...navigation};},
    useSdk:()=>({}),useRpc:()=>rpc,
    useRealtime:()=>{},useRealtimeConnectionState:()=>"connected",
    experimental_usePluginId:()=>"threadspace",
    experimental_useCodeTheme:()=>({mode:"light"}),
    experimental_useProviders:()=>({providers}),
    experimental_useSidebarThreads:()=>({threads,projects:[project],status:"ready"}),
    useSidebarThreadRowStatuses:()=>rowStatuses,
    useSidebarThreadRowStatus:()=>null,
    useSidebarThreadDraft:()=>({hasUnsubmittedDraft:false}),
    useSidebarThreadShortcut:()=>null,
    experimental_useSidebarThreadSplit:()=>({splitProps:{}}),
    // The real SDK subscribes to its whole action store even when keys filters
    // to archive. Core Split action data changes with the focused route.
    experimental_useThreadActions:(thread:PluginSidebarThread)=>{useContext(ActionStoreContext);const action=archiveActions.get(thread.id);return action?[{key:"bb--core/archive",pluginId:"bb--core",group:"lifecycle",action}]:[];},
    experimental_ThreadStatusGlyph:()=>null,
    experimental_ThreadActionsContextMenu:({children}:{children:ReactNode})=>children,
    experimental_ThreadActionsMenu:({trigger}:{trigger:(props:ButtonHTMLAttributes<HTMLButtonElement>)=>ReactNode})=>trigger({}),
    ThreadTitle:({threadId}:{threadId:string})=>{titleRenders.set(threadId,(titleRenders.get(threadId)||0)+1);return <span>{threads.find(thread=>thread.id===threadId)?.displayTitle}</span>;},
    experimental_ProviderIcon:({provider:current}:{provider:{id:string}})=>{providerRenders.set(current.id,(providerRenders.get(current.id)||0)+1);return <span/>;},
  };
});

function sidebar(activeThreadId:string,actionStoreVersion=activeThreadId){
  return <RouteContext.Provider value={activeThreadId}><ActionStoreContext.Provider value={actionStoreVersion}><NotionSidebar activeThreadId={activeThreadId} activeProjectId="p1" isCompactViewport={false} onNavigate={onNavigate} searchQuery=""/></ActionStoreContext.Provider></RouteContext.Provider>;
}

beforeEach(()=>{
  document.documentElement.lang="en";
  const values=new Map<string,string>();
  vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  threads=[thread({providerId:provider.id}),thread({id:"t2",providerId:"provider-2",displayTitle:"Second task"}),thread({id:"t3",providerId:"provider-3",displayTitle:"Unchanged task"})];
  titleRenders.clear();providerRenders.clear();archiveActions.clear();vi.clearAllMocks();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.documentElement.removeAttribute("lang");});

describe("live sidebar navigation",()=>{
  it("only renders changed rows on a route switch, while subsequent runtime changes stay live",async()=>{
    const view=render(sidebar("t1"));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Collapse project Проект"}).textContent).toBe("📁"));
    const beforeTitles=new Map(titleRenders),beforeProviders=new Map(providerRenders);
    const appearanceLoads=rpc.call.mock.calls.length;

    await act(async()=>{view.rerender(sidebar("t2"));});

    expect(screen.getByRole("link",{name:"Second task"}).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link",{name:"Задача"}).getAttribute("aria-current")).toBeNull();
    expect(titleRenders.get("t3")).toBe(beforeTitles.get("t3"));
    expect(providerRenders.get("provider-3")).toBe(beforeProviders.get("provider-3"));
    expect(titleRenders.get("t1")).toBeGreaterThan(beforeTitles.get("t1")!);
    expect(titleRenders.get("t2")).toBeGreaterThan(beforeTitles.get("t2")!);
    expect(rpc.call.mock.calls.length).toBe(appearanceLoads);

    fireEvent.click(screen.getByRole("link",{name:"Unchanged task"}));
    expect(navigation.toThread).toHaveBeenCalledWith("t3");
    expect(onNavigate).toHaveBeenCalledOnce();

    threads=threads.map(thread=>thread.id==="t3"?{...thread,status:"active",runtimeStatus:"active",indicator:"runtime"}:thread);
    await act(async()=>{view.rerender(sidebar("t2"));});
    expect(view.container.querySelector('[data-thread-id="t3"] [data-thread-state="working"]')).toBeTruthy();
    expect(titleRenders.get("t3")).toBeGreaterThan(beforeTitles.get("t3")!);
  });
  it.each(["success","host-contained failure"])("keeps live archive availability and pending state isolated from row content on %s",async outcome=>{
    const firstRun=vi.fn();
    archiveActions.set("t3",{label:"Archive",icon:"Archive",disabled:true,run:firstRun});
    const view=render(sidebar("t1"));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Collapse project Проект"}).textContent).toBe("📁"));
    const beforeTitles=titleRenders.get("t3"),beforeProviders=providerRenders.get("provider-3");
    const button=()=>screen.getByRole("button",{name:"Archive Unchanged task"});
    expect(button().hasAttribute("disabled")).toBe(true);

    let complete=()=>{};
    const pending=new Promise<void>(resolve=>{complete=resolve;});
    const nativeFailure=new Error("Native archive failed"),hostError=vi.fn();
    const nativeRun=vi.fn(async()=>{await pending;if(outcome==="host-contained failure")throw nativeFailure;});
    // Bound SDK actions contain errors after the native host reports them.
    const boundRun=async()=>{try{await nativeRun();}catch(error){hostError(error);}};
    archiveActions.set("t3",{label:"Archive",icon:"Archive",run:boundRun});
    await act(async()=>{view.rerender(sidebar("t1","archive-enabled"));});
    expect(button().hasAttribute("disabled")).toBe(false);
    fireEvent.click(button());
    expect(button().hasAttribute("disabled")).toBe(true);

    const latestRun=vi.fn();
    archiveActions.set("t3",{label:"Archive",icon:"Archive",run:latestRun});
    await act(async()=>{view.rerender(sidebar("t1","archive-updated-while-pending"));});
    expect(button().hasAttribute("disabled")).toBe(true);
    expect(titleRenders.get("t3")).toBe(beforeTitles);
    expect(providerRenders.get("provider-3")).toBe(beforeProviders);

    await act(async()=>{complete();await pending;});
    await waitFor(()=>expect(button().hasAttribute("disabled")).toBe(false));
    expect(nativeRun).toHaveBeenCalledOnce();
    expect(firstRun).not.toHaveBeenCalled();
    if(outcome==="host-contained failure")expect(hostError).toHaveBeenCalledWith(nativeFailure);
    else expect(hostError).not.toHaveBeenCalled();
    fireEvent.click(button());
    expect(latestRun).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(titleRenders.get("t3")).toBe(beforeTitles);
  });
});
