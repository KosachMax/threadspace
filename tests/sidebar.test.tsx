// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import { project, thread, provider } from "./fixtures";

let slot:RenderedSlot|undefined;
beforeEach(()=>{document.documentElement.lang="ru";const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key),clear:()=>values.clear(),key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size;}});});
afterEach(()=>{slot?.lifecycle.unmount();slot=undefined;cleanup();vi.restoreAllMocks();document.documentElement.removeAttribute("lang");});
async function mount(options:Parameters<typeof renderSlot>[2]={}) {
  const app=await loadPluginApp(()=>import("../app"));
  const onNavigate=vi.fn();
  slot=renderSlot(app.threadLists[0],{activeThreadId:"t1",activeProjectId:"p1",isCompactViewport:false,onNavigate,searchQuery:""},{pluginId:"threadspace",sidebarThreads:{status:"ready",threads:[thread()],projects:[project],sections:[]},rpc:{appearance_get:()=>({p1:{emoji:"📁",color:"default"}}),appearance_set:()=>({emoji:"🚀",color:"default"})},...options});
  await slot.findByRole("link",{name:"Задача"});
  return {slot,onNavigate};
}
describe("Notion sidebar",()=>{
  it("follows the BB interface language before the browser language",async()=>{
    document.documentElement.lang="en-GB";
    vi.spyOn(navigator,"language","get").mockReturnValue("ru-RU");
    await mount({threadActions:()=>[{key:"bb--core/archive",pluginId:"bb--core",group:"lifecycle",action:{label:"Archive",icon:"Archive",run:async()=>{}}}],sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({hasPendingInteraction:true}),thread({id:"error",displayTitle:"Сбой",status:"error"})]}});
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getAllByRole("button",{name:"Archive Задача"}).length).toBe(2);
    expect(screen.getAllByRole("img",{name:"Waiting for you — question or approval"}).length).toBe(2);
    expect(screen.getByRole("img",{name:"Execution failed — open the thread for details"})).toBeTruthy();
    expect(screen.getByRole("link",{name:"Задача"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Icon, colour and actions for Проект"}));
    expect(screen.getByRole("textbox",{name:"Find emoji"})).toBeTruthy();
    expect(screen.getByRole("button",{name:"Blue"})).toBeTruthy();
  });
  it("updates an open picker, validation and live statuses without remounting",async()=>{
    await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({status:"active",indicator:"runtime"})]}});
    fireEvent.click(screen.getByRole("button",{name:"Иконка, цвет и действия: Проект"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Свой эмодзи"}),{target:{value:"abc"}});
    fireEvent.click(screen.getByRole("button",{name:"Применить"}));
    expect(screen.getByRole("alert").textContent).toBe("Вставьте один эмодзи.");
    await act(async()=>{document.documentElement.lang="en";});
    expect(await screen.findByRole("button",{name:"Collapse project Проект"})).toBeTruthy();
    expect(screen.getByRole("textbox",{name:"Custom emoji"}).getAttribute("value")).toBe("abc");
    expect(screen.getByRole("alert").textContent).toBe("Paste a single emoji.");
    expect(screen.getByRole("img",{name:"Agent working"})).toBeTruthy();
    await act(async()=>{document.documentElement.lang="ru-RU";});
    expect(await screen.findByRole("button",{name:"Свернуть проект Проект"})).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Вставьте один эмодзи.");
  });
  it("falls back to browser Russian when BB has no language attribute",async()=>{
    document.documentElement.removeAttribute("lang");
    vi.spyOn(navigator,"language","get").mockReturnValue("ru-RU");
    await mount();
    expect(screen.getByText("Проекты")).toBeTruthy();
  });
  it("uses each thread's connected provider icon and keeps project emoji",async()=>{
    const {slot}=await mount({providers:{status:"ready",providers:[provider,{...provider,id:"claude",displayName:"Claude",logoUrl:"/provider-logos/claude.svg"}]},sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({providerId:"codex"}),thread({id:"t2",providerId:"claude",displayTitle:"Вторая задача"})]}});
    expect(slot.getByLabelText("Провайдер: Codex").getAttribute("data-provider-logo")).toBe("/provider-logos/codex.svg");
    expect(slot.getByLabelText("Провайдер: Claude").getAttribute("data-provider-logo")).toBe("/provider-logos/claude.svg");
    await waitFor(()=>expect(screen.getByRole("button",{name:"Свернуть проект Проект"}).textContent).toBe("📁"));
  });
  it("shows one unread status without a duplicate dot",async()=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({isUnread:true,indicator:"unread-success",indicatorLabel:"Unread thread succeeded"})]}});
    expect(slot.container.querySelectorAll('[data-thread-state="unread"]')).toHaveLength(1);
    expect(slot.container.querySelector(".ns-unread")).toBeNull();
    expect(screen.getByTitle("Готово — результат не прочитан")).toBeTruthy();
  });
  it("binds pending input and errors to distinct accessible glyphs",async()=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({status:"active",indicator:"runtime",hasPendingInteraction:true}),thread({id:"t2",displayTitle:"Ошибка",status:"error"})]}});
    expect(screen.getAllByRole("img",{name:"Ждёт тебя — вопрос или подтверждение"}).length).toBe(2);
    expect(screen.getByRole("img",{name:"Ошибка выполнения — открой тред для подробностей"})).toBeTruthy();
    const question=slot.container.querySelector('[data-thread-state="waiting"] svg')!;
    const warning=slot.container.querySelector('[data-thread-state="error"] svg')!;
    expect(question.innerHTML).not.toBe(warning.innerHTML);
  });
  it("shows only compact work/input counts when the project is collapsed",async()=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({status:"active",indicator:"runtime"}),thread({id:"t2",displayTitle:"Нужно решение",hasPendingInteraction:true}),thread({id:"t3",displayTitle:"Вторая работа",status:"active",indicator:"runtime"})]}});
    expect(slot.container.querySelector(".ns-project-summary")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Свернуть проект Проект"}));
    const summary=screen.getByRole("img",{name:"Работают: 2 · Ждут тебя: 1"});
    expect(summary.textContent).toBe("2/1");
    expect(summary.querySelector('[data-thread-state="working"]')).toBeTruthy();
    expect(summary.querySelector('[data-thread-state="waiting"]')).toBeTruthy();
    expect(screen.queryByRole("link",{name:"Нужно решение"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Развернуть проект Проект"}));
    expect(slot.container.querySelector(".ns-project-summary")).toBeNull();
  });
  it("leaves completed collapsed projects without any counts or status details",async()=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread(),thread({id:"done",isUnread:true,indicator:"unread-success",displayTitle:"Готово"})]}});
    fireEvent.click(screen.getByRole("button",{name:"Свернуть проект Проект"}));
    expect(slot.container.querySelector(".ns-project-summary")).toBeNull();
    expect(slot.container.querySelector(".ns-project-count")).toBeNull();
  });
  it.each(["working","waiting"] as const)("omits the slash and zero group when only %s remains",async(kind)=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread(kind==="working"?{status:"active",indicator:"runtime"}:{hasPendingInteraction:true})]}});
    fireEvent.click(screen.getByRole("button",{name:"Свернуть проект Проект"}));
    const summary=slot.container.querySelector(".ns-project-summary")!;
    expect(summary.textContent).toBe("1");
    expect(summary.querySelector(".ns-summary-separator")).toBeNull();
    expect(summary.querySelector(`[data-thread-state="${kind}"]`)).toBeTruthy();
  });
  it("puts pinned threads first inside their own project instead of a favourites section",async()=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread(),thread({id:"t2",displayTitle:"Закреплённая",isPinned:true,pinnedAt:1})]}});
    expect(screen.queryByText("Избранное")).toBeNull();
    const ids=Array.from(slot.container.querySelectorAll(".ns-project .ns-row[data-thread-id]")).map(n=>n.getAttribute("data-thread-id"));
    expect(ids).toEqual(["t2","t1"]);
    expect(screen.getByRole("img",{name:"Закреплён"})).toBeTruthy();
  });
  it("lists threads waiting for an answer in their own section with the project name",async()=>{
    await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({hasPendingInteraction:true})]}});
    expect(screen.getByRole("button",{name:/Ждёт тебя/})).toBeTruthy();
    expect(screen.getByRole("link",{name:"Задача, Проект"})).toBeTruthy();
  });
  it("moves focus between rows with arrow keys and folds the project",async()=>{
    await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread(),thread({id:"t2",displayTitle:"Вторая"})]}});
    const first=screen.getByRole("link",{name:"Задача"});first.focus();
    fireEvent.keyDown(first,{key:"ArrowDown"});
    expect(document.activeElement).toBe(screen.getByRole("link",{name:"Вторая"}));
    fireEvent.keyDown(document.activeElement!,{key:"ArrowLeft"});
    const name=document.activeElement as HTMLElement;
    expect(name.classList.contains("ns-project-name")).toBe(true);
    fireEvent.keyDown(name,{key:"ArrowLeft"});
    expect(screen.queryByRole("link",{name:"Вторая"})).toBeNull();
  });
  it("shows hidden subthread activity on a collapsed parent",async()=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread(),thread({id:"child",displayTitle:"Дочерний",parentThreadId:"t1",status:"active",indicator:"runtime"})]}});
    expect(slot.container.querySelector('.ns-row[data-thread-id="t1"] .ns-project-summary')).toBeNull();
    fireEvent.click(slot.container.querySelector('.ns-row[data-thread-id="t1"] .ns-toggle')!);
    const summary=slot.container.querySelector('.ns-row[data-thread-id="t1"] .ns-project-summary')!;
    expect(summary.textContent).toBe("1");
    expect(summary.querySelector('[data-thread-state="working"]')).toBeTruthy();
  });
  it("highlights a pressed thread before the route changes",async()=>{
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread(),thread({id:"t2",displayTitle:"Вторая"})]}});
    fireEvent.pointerDown(screen.getByRole("link",{name:"Вторая"}),{button:0});
    expect(slot.container.querySelector('.ns-row[data-thread-id="t2"]')!.classList.contains("is-pending")).toBe(true);
    expect(slot.container.querySelector('.ns-row[data-thread-id="t1"]')!.classList.contains("is-active")).toBe(true);
  });
  it("uses eight thin spokes without a loader settings button or legacy preference",async()=>{
    localStorage.setItem("plugin:threadspace:loader",'"classic-12"');
    const {slot}=await mount({sidebarThreads:{status:"ready",projects:[project],sections:[],threads:[thread({status:"active",indicator:"runtime"})]}});
    expect(screen.queryByRole("button",{name:"Выбрать лоадер"})).toBeNull();
    expect(slot.container.querySelector('.ns-row [data-loader="fine-8"]')).toBeTruthy();
    expect(slot.container.querySelectorAll('.ns-row .ns-activity-spinner line')).toHaveLength(8);
  });
  it("runs the host archive action for the hovered row without navigating",async()=>{
    const archive=vi.fn(async(_id:string)=>{});
    const {slot,onNavigate}=await mount({threadActions:target=>[{key:"bb--core/archive",pluginId:"bb--core",group:"lifecycle",action:{label:"Archive",icon:"Archive",run:async()=>archive(target.id)}}]});
    fireEvent.click(screen.getByRole("button",{name:"Архивировать Задача"}));
    await waitFor(()=>expect(archive).toHaveBeenCalledWith("t1"));
    expect(onNavigate).not.toHaveBeenCalled();expect(slot.inspection.navigateCalls).toHaveLength(0);
  });
  it("saves a selected project emoji over RPC",async()=>{
    const {slot}=await mount();
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Иконка, цвет и действия: Проект"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Найти эмодзи"}),{target:{value:"rocket"}});
    fireEvent.click(screen.getByRole("button",{name:"Ракета"}));
    await waitFor(()=>expect(slot.inspection.rpcCalls).toContainEqual({method:"appearance_set",input:{projectId:"p1",patch:{emoji:"🚀"}}}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Свернуть проект Проект"}).textContent).toBe("🚀"));
  });
  it("keeps active children accessible when their parent is archived",async()=>{
    await mount({sidebarThreads:{status:"ready",projects:[project],threads:[thread({id:"parent",isArchived:true}),thread({id:"child",parentThreadId:"parent",title:"Дочерний тред",displayTitle:"Дочерний тред"}),thread()],sections:[]}});
    expect(screen.getByRole("link",{name:"Дочерний тред"})).toBeTruthy();
  });
  it("hides archived and internal helper threads in the active list",async()=>{
    await mount({sidebarThreads:{status:"ready",projects:[project],threads:[thread(),thread({id:"archived",isArchived:true,displayTitle:"Старый тред"}),thread({id:"helper",isHidden:true,displayTitle:"Внутренний тред"})],sections:[]}});
    expect(screen.queryByRole("link",{name:"Старый тред"})).toBeNull();expect(screen.queryByRole("link",{name:"Внутренний тред"})).toBeNull();
  });
  it.each(["light","dark"] as const)("follows BB's %s mode despite an old local override",async(mode)=>{
    const oldPreference=mode==="dark"?"light":"dark";
    localStorage.setItem("plugin:threadspace:theme",JSON.stringify(oldPreference));
    const {slot}=await mount({codeTheme:{mode}});
    expect(slot.container.querySelector(".ns-sidebar")?.getAttribute("data-theme")).toBe(mode);
    expect(slot.container.querySelector(".ns-theme-button")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Иконка, цвет и действия: Проект"}));
    expect(document.querySelector(".ns-picker")?.getAttribute("data-theme")).toBe(mode);
  });
  it("opens the selected thread with native navigation and mobile drawer cleanup",async()=>{
    const {slot,onNavigate}=await mount();
    fireEvent.click(screen.getByRole("link",{name:"Задача"}));
    expect(slot.inspection.navigateCalls).toContainEqual({method:"toThread",threadId:"t1"});expect(onNavigate).toHaveBeenCalledOnce();
  });
});
