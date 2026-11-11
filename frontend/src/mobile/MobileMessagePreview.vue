<script setup>
import {computed,nextTick,onMounted,ref} from 'vue';
import MobileMessageText from './MobileMessageText.vue';
import {readableEmailHtml} from '../utils/emailPresentation.js';
import {trapDialogKey} from '../components/session-comments/dialogFocus.js';
const props=defineProps({item:Object,messages:{type:Array,default:()=>[]},loading:Boolean,error:String,unlocked:Boolean});
const emit=defineEmits(['close','unlock']);
const panel=ref(null);
const email=computed(()=>['email','sms'].includes(props.item?.kind));
const body=message=>readableEmailHtml(message,{collapseQuotes:false,compactLayout:true,simplifyAppChrome:true});
const sender=message=>props.item?.secure?'Secure participant':[message.sender_first_name,message.sender_last_name].filter(Boolean).join(' ') || message.from_json?.name || message.from_json?.email || props.item?.sender || 'Message';
onMounted(async()=>{await nextTick();panel.value?.focus({preventScroll:true});});
</script>
<template>
 <Teleport to="body"><div class="message-preview-overlay" @click.self="emit('close')" @keydown.esc.stop="emit('close')" @contextmenu.prevent>
  <section ref="panel" class="message-preview" role="dialog" aria-modal="true" aria-label="Message preview" tabindex="-1" @keydown="trapDialogKey($event,panel,()=>emit('close'))">
   <header><div><h2>{{ item?.secure?'Secure conversation':item?.groupName || item?.title }}</h2><small>Preview · stays unread</small></div><button type="button" @click="emit('close')">Close</button></header>
   <div class="message-preview-body">
    <template v-if="item?.secure && !unlocked"><p>Secure content is concealed until you reveal it.</p><button type="button" @click="emit('unlock')">Reveal secure preview</button></template>
    <p v-else-if="loading" role="status">Loading preview…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else><article v-for="message in messages" :key="message.id"><strong>{{ sender(message) }}</strong><div v-if="email" class="email-content" v-html="body(message)"/><p v-else><MobileMessageText :text="message.body || ''"/></p><small v-if="message.attachments?.length">{{ message.attachments.length }} attachment{{ message.attachments.length===1?'':'s' }} · open the conversation to view</small></article><p v-if="!messages.length">No message content is available.</p></template>
   </div>
  </section>
 </div></Teleport>
</template>
<style scoped>
.message-preview-overlay{position:fixed;inset:0;z-index:3100;background:#19345080;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));box-sizing:border-box;font-family:Inter,-apple-system,sans-serif}.message-preview{background:#fff;border-radius:16px;width:min(100%,680px);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;min-width:0;overflow:hidden;color:#193655;outline:none}.message-preview header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px;border-bottom:1px solid #e1e9f5;flex-shrink:0;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.message-preview h2{font-size:17px;line-height:1.4;margin:0;overflow-wrap:anywhere}.message-preview small{font-size:12px;color:#637895}.message-preview button{border:1px solid #c9d9ee;border-radius:9px;background:#f0f5fc;color:#2051a3;padding:10px 14px;font:inherit;font-size:16px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.message-preview-body{padding:0 18px 18px;overflow:auto;overscroll-behavior:contain;min-height:0;overflow-wrap:anywhere}.message-preview article{border-bottom:1px solid #e1e9f5;padding:18px 0}.message-preview article:last-child{border:0}.message-preview article>strong{font-size:13px}.message-preview p{font-size:15px;white-space:pre-wrap;line-height:1.6}.email-content{font-size:15px;line-height:1.6;max-width:100%;overflow-wrap:anywhere}.email-content :deep(img){max-width:100%;height:auto}.email-content :deep(table){max-width:100%}.email-content :deep(pre){white-space:pre-wrap}
</style>
