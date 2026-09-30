import {onMounted,onUnmounted,toValue} from 'vue';
// Native overflow remains available. Animation never moves keyboard focus or
// counts as visitor activity, and respects the operating system motion setting.
export function useKioskTabScroll(element,enabled){
 let timer,direction=1,pauseUntil=Date.now()+3000,pointerHeld=false;
 const pause=()=>{pauseUntil=Date.now()+10000;};
 const down=()=>{pointerHeld=true;pause();};
 const up=()=>{pointerHeld=false;pause();};
 const events=[['pointerdown',down],['pointerup',up],['pointercancel',up],['wheel',pause],['keydown',pause],['focusin',pause]];
 onMounted(()=>{
  const node=toValue(element);for(const [name,fn] of events)node?.addEventListener(name,fn,{passive:true});
  window.addEventListener('pointerup',up,{passive:true});
  timer=setInterval(()=>{
   const el=toValue(element);
   if(!el||!toValue(enabled)||pointerHeld||document.hidden||Date.now()<pauseUntil||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
   if(el.contains(document.activeElement)&&document.activeElement?.matches?.(':focus-visible'))return;
   const max=el.scrollWidth-el.clientWidth;if(max<=1)return;
   const next=Math.min(max,Math.max(0,el.scrollLeft+direction*1.6));el.scrollLeft=next;
   if(next===max||next===0){direction*=-1;pauseUntil=Date.now()+1500;}
  },100);
 });
 onUnmounted(()=>{clearInterval(timer);const node=toValue(element);for(const [name,fn] of events)node?.removeEventListener(name,fn);window.removeEventListener('pointerup',up);});
 return {pause};
}
