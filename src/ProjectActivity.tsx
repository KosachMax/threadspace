import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ThreadIndicator } from "./ThreadIndicator";
import { projectActivity, projectActivityLabel, type ThreadStatusPresentation } from "./threadStatus";
import { useLanguage } from "./i18n";

export function ProjectActivity({threads,getStatus}:{threads:readonly PluginSidebarThread[];getStatus?:(thread:PluginSidebarThread)=>ThreadStatusPresentation}) {
  const language=useLanguage(),counts=projectActivity(threads,getStatus),label=projectActivityLabel(counts,language);
  if(!label)return null;
  const kinds=(["working","waiting"] as const).filter(kind=>counts[kind]>0);
  return <span className="ns-project-summary" role="img" aria-label={label} title={label}>
    {kinds.map((kind,index)=><span className="ns-summary-group" key={kind} aria-hidden="true">{index>0&&<span className="ns-summary-separator">/</span>}<span className="ns-summary-item"><span>{counts[kind]}</span><ThreadIndicator status={{kind,label,indicator:"none"}}/></span></span>)}
  </span>;
}
