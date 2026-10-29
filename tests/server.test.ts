import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost, experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

const hosts:ReturnType<typeof createFakePluginHost>[]=[];
async function host(){const h=createFakePluginHost({pluginId:"threadspace"});hosts.push(h);await plugin(h.bb);return h;}
afterEach(async()=>{await Promise.all(hosts.splice(0).map(h=>h.harness.lifecycle.dispose()));});
describe("project emoji storage",()=>{
  it("keeps the dragged project order across plugin reloads",async()=>{
    const {harness}=await host();
    expect(await harness.behavior.callRpc("project_order_get",{})).toEqual([]);
    await harness.behavior.callRpc("project_order_set",{projectIds:["p2","p1","p2"]});
    const reloaded=await harness.lifecycle.reload(plugin);hosts.push(reloaded);
    expect(await reloaded.harness.behavior.callRpc("project_order_get",{})).toEqual(["p2","p1"]);
  });
  it("preserves concurrent emoji and color edits across plugin reloads",async()=>{
    const {harness}=await host();
    await Promise.all([harness.behavior.callRpc("appearance_set",{projectId:"p1",patch:{emoji:"🧑🏽‍💻"}}),harness.behavior.callRpc("appearance_set",{projectId:"p1",patch:{color:"green"}})]);
    const reloaded=await harness.lifecycle.reload(plugin);hosts.push(reloaded);
    expect(await reloaded.harness.behavior.callRpc("appearance_get",{projectIds:["p1"]})).toEqual({p1:{emoji:"🧑🏽‍💻",color:"green"}});
  });
  it("rejects text, multiple emoji and unknown fields at the RPC boundary",async()=>{
    const {harness}=await host();
    for(const patch of [{emoji:"hello"},{emoji:"🚀🚀"},{emoji:"🚀",unexpected:true}])await expect(harness.behavior.callRpc("appearance_set",{projectId:"p1",patch})).rejects.toThrow();
    expect(await harness.behavior.callRpc("appearance_get",{projectIds:["p1"]})).toEqual({p1:{emoji:"📁",color:"default"}});
  });
  it("can remove emoji without erasing the project color",async()=>{
    const {harness}=await host();
    await harness.behavior.callRpc("appearance_set",{projectId:"p1",patch:{emoji:"🚀",color:"blue"}});
    await harness.behavior.callRpc("appearance_set",{projectId:"p1",patch:{emoji:null}});
    expect(await harness.behavior.callRpc("appearance_get",{projectIds:["p1"]})).toEqual({p1:{emoji:null,color:"blue"}});
  });
  it("uses public SDK imports",async()=>{
    const result=await experimental_scanPublicSdkOnly(process.cwd(),{allow:[/^react(?:-dom\/client)?$/, /^@radix-ui\//, /^@emoji-mart\/data/, /^@testing-library\/react$/, /^vitest$/, /^esbuild$/, /^sonner$/]});
    expect(result.violations).toEqual([]);expect(result.privateDependencies).toEqual([]);
  });
});
