<template>
 <Teleport to="body"><aside v-if="visible" class="webchat-visitor" :style="{'--webchat-color':settings?.site?.color||'#175c4f'}" aria-label="Website support chat" data-analytics-ignore>
  <button v-if="!open" class="webchat-launch" @click="open=true">{{unread?'New reply · ':''}}Chat with {{settings.site.name}}</button>
  <section v-else class="webchat-panel">
   <header><img v-if="settings.site.logoUrl" :src="settings.site.logoUrl" alt=""/><strong>{{settings.site.name}}</strong><button aria-label="Minimize chat" @click="open=false">−</button><button aria-label="Dismiss chat" @click="dismiss">×</button></header>
   <template v-if="!contact"><p v-if="!messages.length" class="webchat-intro">Our support team is logged on. Please feel free to ask us a question.</p>
    <p class="webchat-note">Website support only. Please leave out private medical details. Approximate IP location is used to offer local chat.</p>
    <div ref="thread" class="webchat-thread" role="log" aria-live="polite"><article v-for="m in messages" :key="m.id" :class="{'from-visitor':m.sender==='visitor'}"><small>{{m.sender==='staff'?'Support team':'You'}}</small><p><WebsiteChatMessage :body="m.body"/></p></article></div>
    <div v-if="timedOut||closed" class="webchat-fallback" role="status"><p>{{closed?'This chat has ended.':'Sorry we’re taking too long to respond.'}} Please submit an inquiry and we’ll get back to you.</p><button @click="contact=true">Submit an inquiry</button></div>
    <p v-if="error" role="alert">{{error}}</p>
    <form v-if="!closed" @submit.prevent="send"><label class="webchat-sr" for="website-chat-message">Your message</label><textarea id="website-chat-message" v-model="draft" maxlength="2000" rows="2" required placeholder="Ask our support team…"/><button :disabled="sending||!draft.trim()">{{sending?'Sending…':'Send'}}</button></form>
   </template>
   <PublicWebsiteContactForm v-else :agency-slug="slug" :initial-message="transcript"/>
  </section>
 </aside></Teleport>
</template>
<script setup>
import WebsiteChatMessage from "./WebsiteChatMessage.vue";
import {computed,ref,watch,onUnmounted,nextTick} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
import {websiteCaptchaToken} from '../../utils/websiteCaptcha';
import PublicWebsiteContactForm from './PublicWebsiteContactForm.vue';
const route=useRoute(),slug=computed(()=>String(route.params.slug||route.path.match(/^\/p\/([^/]+)/)?.[1]||''));
const settings=ref(null),session=ref(null),messages=ref([]),visible=ref(false),open=ref(true),contact=ref(false),closed=ref(false),draft=ref(''),error=ref(''),sending=ref(false),now=ref(Date.now()),thread=ref();
let timer,clock,generation=0,busy=false,lastSeenReply=0;
const unread=computed(()=>!open.value&&messages.value.some(m=>m.sender==='staff'&&m.id>lastSeenReply));
const transcript=computed(()=>messages.value.map(m=>`${m.sender==='visitor'?'Visitor':'Support'}: ${m.body}`).join('\n\n'));
const timedOut=computed(()=>{const lastStaff=messages.value.filter(m=>m.sender==='staff').at(-1)?.id||0;const pending=messages.value.find(m=>m.sender==='visitor'&&m.id>lastStaff);return pending&&now.value-new Date(pending.createdAt).getTime()>=60000;});
const options=()=>({skipAuthRedirect:true,skipGlobalLoading:true,headers:{'X-Website-Chat-Token':session.value?.token}});
function store(key,value){try{sessionStorage.setItem(`website-chat:${slug.value}:${key}`,JSON.stringify(value));}catch{}}
function read(key){try{return JSON.parse(sessionStorage.getItem(`website-chat:${slug.value}:${key}`)||'null');}catch{return null;}}
function dismiss(){visible.value=false;store('dismissed',true);clearInterval(timer);}
async function poll(){if(busy||document.hidden||!session.value)return;busy=true;const current=generation;try{const{data}=await api.get(`/public/website-chat/${slug.value}/sessions/${session.value.id}`,options());if(current!==generation)return;messages.value=data.messages;closed.value=data.state==='closed';if(open.value)lastSeenReply=messages.value.at(-1)?.id||0;}catch(e){if(current===generation&&e.response?.status===404){closed.value=true;clearInterval(timer);}}finally{busy=false;}}
async function init(){const id=++generation;clearInterval(timer);clearInterval(clock);visible.value=false;session.value=null;messages.value=[];contact.value=false;closed.value=false;error.value='';if(!slug.value||route.query.marketingPreview==='1'||read('dismissed'))return;
 try{const {data}=await api.get(`/public/website-chat/${slug.value}/config`,{skipAuthRedirect:true,skipGlobalLoading:true});if(id!==generation)return;settings.value=data;const previous=read('session');if(!data.eligible)return;
  if(!data.online&&!previous){timer=setInterval(()=>{if(!document.hidden)init();},30000);return;}
  session.value=previous;
  if(!session.value){const captchaToken=await websiteCaptchaToken(data.captchaSiteKey,'public_website_chat');if(id!==generation)return;const response=await api.post(`/public/website-chat/${slug.value}/sessions`,{captchaToken},{skipAuthRedirect:true,skipGlobalLoading:true});if(id!==generation)return;session.value=response.data;store('session',session.value);}
  visible.value=true;await poll();if(id!==generation)return;timer=setInterval(poll,7000);clock=setInterval(()=>now.value=Date.now(),1000);
 }catch{/* Contact forms remain available when live chat or local lookup is unavailable. */}}
async function send(){if(sending.value||!draft.value.trim())return;sending.value=true;error.value='';const current=generation;try{const {data}=await api.post(`/public/website-chat/${slug.value}/sessions/${session.value.id}/messages`,{body:draft.value,clientMessageId:crypto.randomUUID()},options());if(current!==generation)return;messages.value=data.messages;draft.value='';await nextTick();if(thread.value)thread.value.scrollTop=thread.value.scrollHeight;}catch(e){if(current!==generation)return;error.value=e.response?.data?.error?.message||'Message could not be sent. Please try again or use our contact form.';}finally{sending.value=false;}}
watch(slug,init,{immediate:true});onUnmounted(()=>{generation++;clearInterval(timer);clearInterval(clock);});
</script>
<style scoped>
.webchat-visitor{position:fixed;bottom:84px;right:22px;z-index:950;font:15px/1.5 system-ui,sans-serif;color:#19302e;max-width:calc(100vw - 24px)}.webchat-panel{width:365px;max-width:calc(100vw - 24px);background:#fff;border:1px solid #c9d8d4;border-radius:15px;box-shadow:0 10px 40px #0003;overflow:auto;max-height:75vh}.webchat-panel header{display:flex;align-items:center;gap:8px;background:var(--webchat-color);color:white;padding:12px}.webchat-panel header strong{flex:1}.webchat-panel header img{width:32px;height:32px;object-fit:contain;background:white;border-radius:4px}.webchat-panel button,.webchat-launch{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:8px 12px;background:var(--webchat-color);color:white}.webchat-panel header button{background:#ffffff22}.webchat-intro,.webchat-note,.webchat-fallback{padding:0 14px}.webchat-note{font-size:12px;color:#516865}.webchat-thread{max-height:260px;overflow:auto;padding:10px 14px}.webchat-thread article{background:#eff4f2;padding:8px 12px;margin-bottom:8px;border-radius:9px}.webchat-thread article.from-visitor{background:#e3f1f8;margin-left:22px}.webchat-thread p{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0}.webchat-thread small{font-weight:600}.webchat-panel form{padding:14px;display:flex;gap:8px;align-items:end}.webchat-panel textarea{min-width:0;flex:1;font:inherit;border:1px solid #a2b7b2;border-radius:7px;padding:8px;resize:vertical}.webchat-panel button:disabled{opacity:.55}.webchat-fallback{font-size:13px;padding-bottom:14px}.webchat-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(max-width:600px){.webchat-visitor{bottom:calc(78px + env(safe-area-inset-bottom,0px));right:12px;max-width:calc(100vw - 24px);font-size:14px}.webchat-panel{bottom:calc(78px + env(safe-area-inset-bottom,0px));max-height:calc(100dvh - 120px)}}
</style>
