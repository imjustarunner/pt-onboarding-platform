<script setup>
import {onBeforeUnmount,ref} from 'vue';
import {Check,CalendarClock,MoreHorizontal} from '@lucide/vue';
const props=defineProps({task:{type:Object,required:true},dueLabel:String});
const emit=defineEmits(['open','preview','complete','due']);
const offset=ref(0);let drag=null,timer=null,suppressUntil=0;
const done=()=>['completed','done','cancelled','overridden'].includes(String(props.task.status).toLowerCase());
function clearHold(){clearTimeout(timer);timer=null;}
function cancel(){clearHold();drag=null;offset.value=0;}
function start(event){if(event.button && event.pointerType==='mouse')return;cancel();drag={x:event.clientX,y:event.clientY,node:event.currentTarget,id:event.pointerId};timer=setTimeout(preview,500);}
function move(event){if(!drag)return;const x=event.clientX-drag.x,y=event.clientY-drag.y;if(Math.abs(x)>8||Math.abs(y)>8)clearHold();if(Math.abs(y)>Math.abs(x)&&Math.abs(y)>12){cancel();return;}if(Math.abs(x)>12){try{drag.node.setPointerCapture?.(drag.id);}catch{}offset.value=Math.max(-110,Math.min(110,x));}}
function finish(){clearHold();const x=offset.value;cancel();if(Math.abs(x)<70)return;suppressUntil=Date.now()+700;if(x<0&&!done())emit('complete',props.task);else if(x>0)emit('due',props.task);}
function preview(){if(Date.now()<suppressUntil)return;suppressUntil=Date.now()+700;cancel();emit('preview',props.task);}
function open(){if(Date.now()<suppressUntil)return;emit('open',props.task);}
onBeforeUnmount(cancel);
</script>
<template>
 <article class="mt-row" :class="{dragging:offset!==0}">
  <div class="mt-reveal" :class="offset<0?'mt-done':'mt-due'" aria-hidden="true"><template v-if="offset<0"><Check :size="20"/>{{ done()?'Done':'Mark done' }}</template><template v-else><CalendarClock :size="20"/>Due date</template></div>
  <button type="button" class="mt-card" :style="{transform:`translateX(${offset}px)`}" @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @click="open" @contextmenu.prevent="preview"><strong>{{ task.title }}</strong><small>{{ task.status }} · {{ dueLabel || 'No due date' }}<template v-if="task.assignee"> · {{ task.assignee }}</template></small></button>
  <button type="button" class="mt-options" :aria-label="`Preview ${task.title}`" @click="preview"><MoreHorizontal :size="19"/></button>
 </article>
</template>
<style scoped>
.mt-row{position:relative;overflow:hidden;border-bottom:1px solid #e4eaf4;min-width:0}.mt-card{display:flex;flex-direction:column;gap:7px;text-align:left;width:100%;padding:21px 48px 21px 17px;border:0;background:white;color:#193655;font:inherit;min-width:0;min-height:85px;touch-action:pan-y;position:relative;z-index:1}.mt-card strong{font-size:14px;line-height:1.5;overflow-wrap:anywhere}.mt-card small{font-size:12px;color:#657b98;line-height:1.5}.mt-reveal{position:absolute;inset:0;display:flex;align-items:center;gap:6px;font:600 12px system-ui;padding:15px;visibility:hidden}.mt-row.dragging .mt-reveal{visibility:visible}.mt-done{justify-content:flex-end;background:#def2e8;color:#24664c}.mt-due{background:#e5efff;color:#2455a3}.mt-options{position:absolute;z-index:2;top:12px;right:7px;border:0;background:transparent;color:#617997;min-width:36px;min-height:40px;display:grid;place-items:center}.mt-card:focus-visible,.mt-options:focus-visible{outline:3px solid #7ca4ed;outline-offset:-3px}
</style>
