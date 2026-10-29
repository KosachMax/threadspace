import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { resolveThreadStatus, projectActivity } from "../src/threadStatus";
import { thread } from "./fixtures";

describe("live thread status",()=>{
  it.each<{name:string;facts:Partial<PluginSidebarThread>;kind:string}>([
    {name:"approval takes priority over an active run",facts:{status:"active",indicator:"runtime",hasPendingInteraction:true},kind:"waiting"},
    {name:"a read execution error remains actionable",facts:{status:"error",isUnread:false},kind:"error"},
    {name:"failed queued send is visible during a run",facts:{status:"active",indicator:"runtime",queuedWork:"failed"},kind:"error"},
    {name:"an unavailable host is not shown as working",facts:{status:"active",indicator:"runtime",runtimeStatus:"waiting-for-host"},kind:"queued"},
    {name:"environment provisioning is distinct from agent work",facts:{status:"starting",indicator:"runtime",runtimeStatus:"provisioning"},kind:"queued"},
    {name:"a queued next message does not hide active work",facts:{status:"active",indicator:"runtime",queuedWork:"waiting"},kind:"working"},
    {name:"an idle queued message waits for launch",facts:{queuedWork:"waiting"},kind:"queued"},
    {name:"an unread completion has a single result mark",facts:{isUnread:true,indicator:"unread-success"},kind:"unread"},
    {name:"a read idle thread is quiet",facts:{isUnread:false,indicator:"none"},kind:"none"},
    {name:"archived rows do not ask for input",facts:{isArchived:true,hasPendingInteraction:true},kind:"archived"},
    {name:"workflow glyphs keep their meaning during an active run",facts:{status:"active",indicator:"workflow"},kind:"native"},
    {name:"plan glyphs keep their meaning during an active run",facts:{status:"active",indicator:"plan-mode"},kind:"native"},
  ])("$name",({facts,kind})=>{expect(resolveThreadStatus(thread(facts)).kind).toBe(kind);});

  it("follows run, question, resume, completion and read snapshots without stale badges",()=>{
    const snapshots=[thread({indicator:"runtime",status:"active"}),thread({indicator:"waiting-for-input",status:"active",hasPendingInteraction:true}),thread({indicator:"runtime",status:"active"}),thread({indicator:"unread-success",isUnread:true}),thread()];
    expect(snapshots.map(t=>resolveThreadStatus(t).kind)).toEqual(["working","waiting","working","unread","none"]);
  });
  it("preserves client drafts and third-party row status",()=>{
    expect(resolveThreadStatus(thread(),null,true).kind).toBe("draft");
    expect(resolveThreadStatus(thread(),{icon:"Terminal",label:"Deployment running",tone:"running"})).toMatchObject({kind:"native",label:"Deployment running",busy:true});
    expect(resolveThreadStatus(thread({indicator:"runtime"}),{icon:"Check",label:"Old result",tone:"success"}).kind).toBe("working");
  });
  it("localizes waiting and work details without changing state priority",()=>{
    const waiting=thread({status:"active",indicator:"runtime",hasPendingInteraction:true});
    expect(resolveThreadStatus(waiting,null,false,"ru")).toMatchObject({kind:"waiting",label:"Ждёт тебя — вопрос или подтверждение"});
    expect(resolveThreadStatus(waiting,null,false,"en")).toMatchObject({kind:"waiting",label:"Waiting for you — question or approval"});
    expect(resolveThreadStatus(thread({indicator:"runtime",queuedWork:"waiting"}),null,false,"en").label).toBe("Agent working · next message queued");
  });
  it("counts children once, excluding archived and hidden helper threads",()=>{
    expect(projectActivity([
      thread({id:"parent",status:"active",indicator:"runtime"}),
      thread({id:"child",parentThreadId:"parent",hasPendingInteraction:true,status:"active"}),
      thread({id:"failure",status:"error"}),thread({id:"queue",queuedWork:"waiting"}),thread({id:"new",indicator:"unread-success",isUnread:true}),
      thread({id:"hidden",isHidden:true,status:"active"}),thread({id:"archived",isArchived:true,status:"active"}),
    ])).toEqual({working:1,waiting:1});
  });
  it("clears project activity when work completes, even before its result is read",()=>{
    expect(projectActivity([thread({status:"active",indicator:"runtime"})])).toEqual({working:1,waiting:0});
    expect(projectActivity([thread({isUnread:true,indicator:"unread-success"}),thread({queuedWork:"waiting"}),thread()])).toEqual({working:0,waiting:0});
  });
});
