import type { ReactNode } from "react";
import { ActivitySpinner } from "./ActivitySpinner";
import { Icon } from "./icons";
import type { ThreadStatusPresentation } from "./threadStatus";

export function ThreadIndicator({status,nativeNode}:{status:ThreadStatusPresentation;nativeNode?:ReactNode}) {
  if(status.kind==="none")return null;
  if(status.kind==="working")return <ActivitySpinner label={status.label}/>;
  if(status.kind==="native")return <span className="ns-native-state" role="img" aria-label={status.label}><span aria-hidden="true">{nativeNode}</span></span>;
  return <span className={`ns-state ns-state-${status.kind}`} data-thread-state={status.kind} role="img" aria-label={status.label}>
    {status.kind==="unread"?<span className="ns-result-dot"/>:<Icon name={status.kind==="waiting"?"question":status.kind==="error"?"warning":status.kind==="queued"?"clock":status.kind==="draft"?"pencil":"archive"}/>}
  </span>;
}
