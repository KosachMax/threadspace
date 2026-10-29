import { useCallback, useLayoutEffect, useRef } from "react";
import { useStrings } from "./i18n";

/** Eight thin spokes. Shares a wall-clock phase, including spinners mounted later or in another frame. */
export function ActivitySpinner({label}:{label?:string}) {
  const t=useStrings(),accessibleLabel=label??t.working;
  const root=useRef<HTMLSpanElement>(null);
  const synchronize=useCallback(()=>{
    for(const animation of root.current?.getAnimations?.({subtree:true})??[]) {
      animation.startTime=-(performance.timeOrigin%1000);
    }
  },[]);
  useLayoutEffect(synchronize,[synchronize]);
  return <span ref={root} className="ns-activity-spinner" data-loader="fine-8" data-thread-state="working" role={accessibleLabel?"img":undefined} aria-label={accessibleLabel||undefined} aria-hidden={accessibleLabel?undefined:true} onAnimationStart={synchronize}>
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <g className="ns-loader-spokes" style={{animationTimingFunction:"steps(8, end)"}}>
        {Array.from({length:8},(_,index)=><line key={index} x1="8" y1="1.4" x2="8" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${index*45} 8 8)`} opacity={index===0?1:.16+.84*(index/8)**1.7}/>)}
      </g>
    </svg>
  </span>;
}
