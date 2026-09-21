import {computed,ref,onMounted,onUnmounted,nextTick,watch} from 'vue';

/** Move the support desk without turning clicks on its controls into drags. */
export function useMovableChatPanel(panel,expanded,storageKey) {
 const position=ref(null);
 let drag=null,observer;
 const style=computed(()=>position.value?{left:`${position.value.x}px`,top:`${position.value.y}px`,right:'auto',bottom:'auto'}:{});
 function persist(){try{localStorage.setItem(storageKey,JSON.stringify(position.value));}catch{}}
 function move(x,y){
  const rect=panel.value?.getBoundingClientRect();
  position.value={x:Math.max(8,Math.min(x,window.innerWidth-(rect?.width||0)-8)),y:Math.max(8,Math.min(y,window.innerHeight-(rect?.height||0)-8))};
  persist();
 }
 function fit(){if(position.value)move(position.value.x,position.value.y);}
 function start(event){
  if(event.button!==0)return;
  const rect=panel.value?.getBoundingClientRect();if(!rect)return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
  event.currentTarget.setPointerCapture?.(event.pointerId);event.preventDefault();
 }
 function pointerMove(event){if(drag&&event.pointerId===drag.id)move(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);}
 function stop(){drag=null;}
 function keyMove(event){
  const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];if(!delta)return;
  event.preventDefault();const rect=panel.value?.getBoundingClientRect();if(rect)move(rect.left+delta[0],rect.top+delta[1]);
 }
 watch(expanded,async()=>{await nextTick();fit();});
 onMounted(()=>{
  try{const saved=JSON.parse(localStorage.getItem(storageKey));if(Number.isFinite(saved?.x)&&Number.isFinite(saved?.y))position.value=saved;}catch{}
  fit();window.addEventListener('resize',fit);
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(fit);if(panel.value)observer.observe(panel.value);}
 });
 onUnmounted(()=>{observer?.disconnect();window.removeEventListener('resize',fit);});
 return {style,start,pointerMove,stop,keyMove};
}
