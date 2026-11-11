<script setup>
import {onBeforeUnmount,ref} from 'vue';
import {MoreHorizontal,Bell} from '@lucide/vue';
const props=defineProps({item:Object,unread:Boolean,agencyName:String,preferences:Object,disabled:Boolean});
const emit=defineEmits(['open','options','action']);const offset=ref(0);let drag,timer,suppress=0;
const action=()=>{const value=offset.value<0?props.preferences?.swipeLeft || 'archive':props.preferences?.swipeRight || 'read';return value==='archive'?(props.item.dismissed_at?'restore':'delete'):value;};
const label=()=>({delete:'Delete',restore:'Restore',read:'Read',unread:'Unread',none:''}[action()] || '');
function cancel(){clearTimeout(timer);drag=null;offset.value=0;}
function options(){if(props.disabled || Date.now()<suppress)return;suppress=Date.now()+700;cancel();emit('options',props.item);}
function start(e){if(props.disabled || e.button && e.pointerType==='mouse')return;cancel();drag={x:e.clientX,y:e.clientY,node:e.currentTarget,id:e.pointerId};timer=setTimeout(options,500);}
function move(e){if(!drag)return;const x=e.clientX-drag.x,y=e.clientY-drag.y;if(Math.abs(x)>8||Math.abs(y)>8)clearTimeout(timer);if(Math.abs(y)>Math.abs(x)&&Math.abs(y)>12){cancel();return;}if(Math.abs(x)>12){try{drag.node.setPointerCapture?.(drag.id);}catch{}offset.value=Math.max(-100,Math.min(100,x));}}
function finish(){clearTimeout(timer);const act=action(),swiped=Math.abs(offset.value)>=65;cancel();if(swiped){suppress=Date.now()+700;if(act!=='none')emit('action',props.item,act);}}
function open(){if(Date.now()<suppress || props.disabled)return;emit('open',props.item);}
onBeforeUnmount(cancel);
</script>
<template>
 <article class="notification-row" :class="{unread,swiping:offset!==0}"><div class="reveal" :class="action()">{{ label() }}</div><button type="button" class="notification-card" :disabled="disabled" :style="{transform:`translateX(${offset}px)`}" @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @click="open" @contextmenu.prevent="options"><Bell :size="19" aria-hidden="true"/><span class="copy"><strong>{{item.title}}</strong><span class="preview">{{item.message}}</span><small>{{agencyName}}<template v-if="agencyName"> · </template>{{new Date(item.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}}</small></span><span v-if="unread" class="unread-dot" aria-label="Unread"/></button><button class="options" type="button" :disabled="disabled" :aria-label="`Options for ${item.title}`" @click="options"><MoreHorizontal :size="20"/></button></article>
</template>
<style scoped>
.notification-row{position:relative;overflow:hidden;border-bottom:1px solid #e0e7f2;background:white}.notification-card{position:relative;z-index:1;display:flex;align-items:flex-start;gap:10px;width:100%;box-sizing:border-box;padding:14px 42px 14px 13px;text-align:left;border:0;background:white;color:#203b5b;font:inherit;touch-action:pan-y;user-select:none;-webkit-touch-callout:none}.notification-card>svg{flex-shrink:0;margin-top:2px;color:#5577ad}.copy{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}.copy strong{font-size:13px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.preview{font-size:12px;line-height:1.45;color:#536b87;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.copy small{font-size:10px;color:#6e8097}.unread .notification-card{background:#f0f5ff}.unread-dot{width:6px;height:6px;border-radius:50%;background:#2d60d7;flex-shrink:0;margin-top:6px}.options{position:absolute;top:6px;right:0;z-index:2;display:grid;place-items:center;width:40px;min-height:42px;border:0;background:transparent;color:#637f9f}.reveal{position:absolute;inset:0;display:flex;align-items:center;padding:12px;background:#e4efff;color:#315da8;visibility:hidden;font:600 12px system-ui}.swiping .reveal{visibility:visible}.reveal.delete,.reveal.restore{justify-content:flex-end;background:#f9e7e7;color:#9c3c43}button:focus-visible{outline:3px solid #7ba5f0;outline-offset:-3px}
</style>
