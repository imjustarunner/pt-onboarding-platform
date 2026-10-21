<template>
  <section class="office-messages" :aria-label="`Private messages with ${recipient}`">
    <header><div><strong>Message {{ recipient }}</strong><p>Private office conversation</p></div><button v-if="closable" type="button" aria-label="Close conversation" @click="$emit('close')">✕</button></header>
    <p class="privacy">Only you and {{ recipient }} can see this conversation. It is separate from the session chat.</p>
    <p v-if="notice" class="availability" role="status">{{ notice }}</p>
    <p v-if="error" role="alert" class="message-error">{{ error }}</p>
    <div class="message-history" role="log" aria-live="polite" aria-relevant="additions">
      <p v-if="!messages.length" class="empty">Leave a message about your visit.</p>
      <article v-for="message in messages" :key="message.id" :class="{mine:message.author===role}"><small>{{ message.author===role?'You':recipient }}</small><p>{{ message.body }}</p></article>
    </div>
    <form v-if="canSend" @submit.prevent="send">
      <label>Message<textarea v-model="draft" rows="3" maxlength="2000" :disabled="sending" placeholder="Write your message…" /></label>
      <button type="submit" :disabled="sending||!draft.trim()">{{ sending?'Sending…':'Send private message' }}</button>
    </form>
    <p v-else>{{ closedReason }}</p>
  </section>
</template>
<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
const props=defineProps({request:{type:Function,required:true},recipient:{type:String,required:true},role:{type:String,default:'guest'},notice:{type:String,default:''},closable:Boolean});
defineEmits(['close']);
const messages=ref([]),draft=ref(''),error=ref(''),sending=ref(false),canSend=ref(true),closedReason=ref('This visit has ended. Start a new visit to send another message.');
let timer,stopped=false,loading=false,pending=null;
async function refresh(){if(loading||stopped)return;loading=true;try{const data=await props.request({method:'GET'});if(!stopped){messages.value=data.messages||[];canSend.value=data.canSend!==false;closedReason.value=data.closedReason||closedReason.value;error.value='';}}catch{if(!stopped)error.value='Messages could not be loaded. Please try again.';}finally{loading=false;}}
async function send(){if(sending.value||!draft.value.trim())return;sending.value=true;error.value='';const body=draft.value.trim();if(!pending||pending.body!==body)pending={body,nonce:crypto.randomUUID()};try{await props.request({method:'POST',body:pending});if(stopped)return;draft.value='';pending=null;await refresh();}catch(e){if(!stopped)error.value=e.response?.data?.error?.message||'Your message could not be sent. Please try again.';}finally{sending.value=false;}}
onMounted(()=>{void refresh();timer=setInterval(refresh,5000);});
onBeforeUnmount(()=>{stopped=true;clearInterval(timer);draft.value='';messages.value=[];});
</script>
<style scoped>
.office-messages{background:#fff;border:1px solid #cbdbe5;border-radius:16px;padding:18px;text-align:left;color:#203b52}.office-messages header{display:flex;align-items:start;justify-content:space-between;gap:12px}.office-messages header p{margin:4px 0;font-size:12px;color:#5a6c7b}.privacy,.empty{font-size:13px;line-height:1.5;color:#526575}.availability{border-radius:10px;background:#eef5fa;padding:12px;font-size:14px;line-height:1.6}.message-history{max-height:260px;overflow:auto;overscroll-behavior:contain}.message-history article{background:#f2f5f7;border-radius:12px;padding:10px 12px;margin:10px 20px 10px 0}.message-history article.mine{background:#e9f3ef;margin:10px 0 10px 20px}.message-history small{font-weight:600}.message-history p{white-space:pre-wrap;overflow-wrap:anywhere;margin:5px 0;font-size:14px;line-height:1.5}label{display:block;font-size:14px;font-weight:600}textarea{box-sizing:border-box;width:100%;margin:8px 0;padding:12px;border:1px solid #b4c6d3;border-radius:10px;resize:vertical;font:16px system-ui;color:#183347;background:white}button{border:1px solid #b4c6d3;border-radius:10px;padding:10px 14px;background:#fff;color:#234f70;cursor:pointer}button[type=submit]{background:#214e78;color:white;min-height:44px}button:disabled{opacity:.55;cursor:default}.message-error{color:#a12626}
</style>
