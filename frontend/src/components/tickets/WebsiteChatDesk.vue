<template>
 <Teleport to="body"><aside class="webchat-desk" aria-label="Website visitor chats">
  <button class="webchat-desk-toggle" @click="expanded=!expanded">Website chat <span v-if="sessions.length">{{sessions.length}}</span> · {{available?'On':'Off'}}</button>
  <section v-if="expanded" class="webchat-desk-panel">
   <header><strong>Website visitors</strong><label><input v-model="available" type="checkbox" @change="setAvailable"/>Available for chat</label><button aria-label="Minimize website chats" @click="expanded=false">−</button></header>
   <p class="webchat-desk-note">Colorado visitors only · support scope follows your organizations</p>
   <p v-if="error" role="alert">{{error}}</p>
   <div v-if="!sessions.length" class="webchat-desk-note">No current website conversations.</div>
   <div class="webchat-visitors" role="list"><div v-for="s in sessions" :key="s.id" role="listitem" class="visitor-toast" :style="{borderLeft:`5px solid ${s.color}`}" :class="{selected:selected?.id===s.id}">
    <button @click="select(s)"><img v-if="s.logoUrl" :src="s.logoUrl" alt=""/><span><strong>{{s.name}}</strong><small>Visitor {{s.id.slice(0,6)}} · {{s.visitorMessages?'Message received':'Browsing website'}}</small></span><b v-if="isUnread(s)">New</b></button><button aria-label="Dismiss this visitor toast" @click="dismiss(s)">×</button>
   </div></div>
   <template v-if="selected"><div class="webchat-selected"><strong>{{selected.name}} · Visitor {{selected.id.slice(0,6)}}</strong><button @click="endChat">End chat</button></div>
    <div ref="thread" class="webchat-staff-thread" role="log" aria-live="polite"><article v-for="m in messages" :key="m.id" :class="{staff:m.sender==='staff'}"><small>{{m.sender==='staff'?'Support':'Visitor'}}</small><p><WebsiteChatMessage :body="m.body"/></p></article></div>
    <div class="webchat-quick" aria-label="Quick replies"><button v-for="reply in quickReplies" :key="reply.label" @click="draft=reply.body">{{reply.label}}</button></div>
    <form @submit.prevent="send"><label for="staff-website-reply">Reply to this website visitor</label><textarea id="staff-website-reply" v-model="draft" rows="3" maxlength="2000" required/><button :disabled="sending||!draft.trim()">{{sending?'Sending…':'Send reply'}}</button></form>
   </template>
  </section>
 </aside></Teleport>
</template>
<script setup>
import WebsiteChatMessage from "../public/WebsiteChatMessage.vue";
import {computed,ref,onMounted,onUnmounted,nextTick} from 'vue';
import api from '../../services/api';
const rows=ref([]),selected=ref(null),messages=ref([]),quickReplies=ref([]),draft=ref(''),error=ref(''),available=ref(true),expanded=ref(false),sending=ref(false),thread=ref();
const dismissed=ref({}),seen=ref({}),drafts=new Map();let timer,busy=false,alive=true,selection=0;
const sessions=computed(()=>rows.value.filter(s=>dismissed.value[s.id]!==String(s.lastMessageId||0)));
const opts={skipGlobalLoading:true};
const isUnread=s=>seen.value[s.id]!==String(s.lastMessageId||0);
function dismiss(s){dismissed.value[s.id]=String(s.lastMessageId||0);if(selected.value?.id===s.id){drafts.set(s.id,draft.value);selected.value=null;selection++;}}
async function setAvailable(){try{localStorage.setItem('website-chat-staff-available',String(available.value));await api.post('/website-chat/presence',{available:available.value},opts);}catch{error.value='Website chat availability could not be updated.';}}
async function poll(){if(busy||document.hidden)return;busy=true;try{if(available.value)await api.post('/website-chat/presence',{available:true},opts);const {data}=await api.get('/website-chat/sessions',opts);if(!alive)return;const previous=new Map(rows.value.map(s=>[s.id,String(s.lastMessageId||0)]));rows.value=data.sessions||[];
 if(available.value&&rows.value.some(s=>!previous.has(s.id)||(previous.get(s.id)!==String(s.lastMessageId||0)&&isUnread(s))))expanded.value=true;
 if(selected.value){const s=rows.value.find(r=>r.id===selected.value.id);if(!s){selected.value=null;selection++;}else await readSelected();}
 error.value='';
 }catch(e){if(e.response?.status!==401)error.value='Website chat could not refresh. We’ll retry shortly.';}finally{busy=false;}}
async function readSelected(){const s=selected.value,version=selection;if(!s)return;const {data}=await api.get(`/website-chat/sessions/${s.id}`,opts);if(!alive||version!==selection)return;messages.value=data.messages;quickReplies.value=data.quickReplies;seen.value[s.id]=String(data.messages.at(-1)?.id||0);}
async function select(s){if(selected.value)drafts.set(selected.value.id,draft.value);selected.value=s;selection++;messages.value=[];draft.value=drafts.get(s.id)||'';try{await readSelected();await nextTick();if(thread.value)thread.value.scrollTop=thread.value.scrollHeight;}catch{error.value='This conversation could not be loaded.';}}
async function send(){if(!selected.value||sending.value)return;sending.value=true;error.value='';const id=selected.value.id,version=selection;try{const {data}=await api.post(`/website-chat/sessions/${id}/messages`,{body:draft.value,clientMessageId:crypto.randomUUID()},opts);drafts.delete(id);if(version===selection){messages.value=data.messages;draft.value='';seen.value[id]=String(data.messages.at(-1)?.id||0);await nextTick();if(thread.value)thread.value.scrollTop=thread.value.scrollHeight;}}catch(e){error.value=e.response?.data?.error?.message||'Reply could not be sent.';}finally{sending.value=false;}}
async function endChat(){if(!selected.value)return;try{await api.post(`/website-chat/sessions/${selected.value.id}/close`,{},opts);selected.value=null;selection++;await poll();}catch{error.value='The chat could not be closed.';}}
onMounted(()=>{try{available.value=localStorage.getItem('website-chat-staff-available')!=='false';}catch{}poll();timer=setInterval(poll,15000);});
onUnmounted(()=>{alive=false;selection++;clearInterval(timer);});
</script>
<style scoped>
.webchat-desk{position:fixed;right:18px;bottom:150px;z-index:1200;color:#233238;font:14px/1.45 system-ui,sans-serif}.webchat-desk button{font:inherit;cursor:pointer;border:1px solid #bccdc8;background:#fff;color:#23473d;border-radius:7px;padding:7px 10px}.webchat-desk .webchat-desk-toggle{background:#173e36;color:white;box-shadow:0 3px 14px #0003}.webchat-desk-toggle span{background:#b3293d;border-radius:20px;padding:2px 7px}.webchat-desk-panel{margin-top:8px;background:#fff;border:1px solid #b8cbc5;border-radius:12px;width:410px;max-width:calc(100vw - 24px);max-height:75vh;overflow:auto;box-shadow:0 8px 40px #0003}.webchat-desk-panel>header{padding:12px;display:flex;align-items:center;justify-content:space-between;gap:6px;background:#f0f5f3}.webchat-desk-panel header label{font-size:12px}.webchat-desk-note{padding:0 12px;font-size:12px}.webchat-visitors{max-height:180px;overflow:auto}.visitor-toast{display:flex;margin:8px;border:1px solid #d5e1dd;border-radius:8px}.visitor-toast.selected{background:#e4eeea}.visitor-toast button:first-child{display:flex;align-items:center;gap:8px;flex:1;text-align:left;border:0;background:transparent}.visitor-toast img{width:34px;height:30px;object-fit:contain}.visitor-toast small{display:block;font-size:11px}.visitor-toast b{font-size:10px;color:#a31e36}.webchat-selected{padding:10px;display:flex;justify-content:space-between;gap:8px;font-size:12px}.webchat-staff-thread{max-height:240px;overflow:auto;padding:10px}.webchat-staff-thread article{background:#f3f3f3;margin-bottom:7px;padding:8px 12px;border-radius:8px}.webchat-staff-thread article.staff{background:#e4f1e9;margin-left:20px}.webchat-staff-thread p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.webchat-quick{display:flex;flex-wrap:wrap;gap:5px;padding:10px}.webchat-quick button{font-size:12px}.webchat-desk form{display:grid;gap:8px;padding:12px}.webchat-desk textarea{font:inherit;border:1px solid #9db7ad;border-radius:7px;padding:8px;color:#233238;background:white}.webchat-desk form>button{background:#175b49;color:white}
</style>
