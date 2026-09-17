<template>
 <Teleport to="body"><aside v-if="visible" class="webchat-visitor" :style="{'--webchat-color':settings?.site?.color||'#175c4f'}" aria-label="Live Chat" data-analytics-ignore>
  <button v-if="!open" class="webchat-launch" @click="open=true">{{unread?'Message waiting · ':''}}Live Chat · {{settings.site.name}}</button>
  <section v-else class="webchat-panel">
   <header><img v-if="settings.site.logoUrl" :src="settings.site.logoUrl" alt=""/><strong>Live Chat · {{settings.site.name}}</strong><button aria-label="Minimize chat" @click="open=false">−</button></header>
   <p class="webchat-note">Do not share protected health information here. <a :href="standardsUrl" target="_blank" rel="noopener">Community Standards</a> apply to all communications. Obscene language is automatically masked. Approximate IP location is used to offer local chat.</p>
   <div v-show="!contact">
    <div ref="thread" class="webchat-thread" role="log" aria-live="polite"><article v-for="m in messages" :key="m.id" :class="{'from-visitor':m.sender==='visitor'}"><small>{{m.sender==='staff'?`Support team member ${m.memberNumber||1}`:m.sender==='system'?'Live Chat':'You'}}</small><p><WebsiteChatMessage :body="m.body"/></p></article></div>
    <p class="webchat-note" role="status">{{staffTyping?'Support member is typing…':staffViewing?'A support member has this chat open.':'Send a message and a support member can return.'}}</p>
    <div class="webchat-fallback"><p v-if="timedOut">Are we taking too long to reply? Submit a ticket and our full support team will follow up.</p><p v-if="closed">{{expired?'This chat session expired.':'You ended this chat.'}} You can still submit a ticket.</p><button @click="showContact">Submit contact info &amp; inquiry</button><button v-if="!closed" @click="endChat">End chat</button></div>
    <p v-if="error" role="alert">{{error}}</p>
    <form v-if="!closed" @submit.prevent="send"><label class="webchat-sr" for="website-chat-message">Your message</label><textarea id="website-chat-message" v-model="draft" maxlength="2000" rows="2" required placeholder="Ask our support team…"/><button :disabled="sending||!draft.trim()">{{sending?'Sending…':'Send'}}</button></form>
    <div v-if="!closed" class="webchat-emojis" aria-label="Insert emoji"><button v-for="emoji in emojis" :key="emoji" :aria-label="`Insert ${emoji}`" @click="draft+=emoji">{{emoji}}</button></div>
   </div>
   <div v-show="contact"><button @click="contact=false">← Return to chat</button><PublicWebsiteContactForm v-if="contactReady" :agency-slug="slug" :chat-referral="referralToken" title="Submit a ticket"/></div>
  </section>
 </aside></Teleport>
</template>
<script setup>
import WebsiteChatMessage from './WebsiteChatMessage.vue';
import {computed,ref,watch,onUnmounted,nextTick} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
import {websiteCaptchaToken} from '../../utils/websiteCaptcha';
import PublicWebsiteContactForm from './PublicWebsiteContactForm.vue';
const route=useRoute(),slug=computed(()=>String(route.params.slug||route.path.match(/^\/p\/([^/]+)/)?.[1]||''));
const settings=ref(null),session=ref(null),messages=ref([]),visible=ref(false),open=ref(true),contact=ref(false),closed=ref(false),draft=ref(''),error=ref(''),sending=ref(false),now=ref(Date.now()),thread=ref();
const expired=ref(false),staffViewing=ref(false),staffTyping=ref(false),contactReady=ref(false),referralToken=ref(''),emojis=['😊','👍','❤️','🙏','👋','🎉','😕'];
const standardsUrl=computed(()=>`/community-standards`);
let timer,clock,typingTimer,generation=0,busy=false,lastSeenReply=0;
const unread=computed(()=>!open.value&&messages.value.some(m=>m.sender==='staff'&&m.id>lastSeenReply));
const timedOut=computed(()=>{const lastStaff=messages.value.filter(m=>m.sender==='staff').at(-1)?.id||0;const pending=messages.value.find(m=>m.sender==='visitor'&&m.id>lastStaff);return pending&&now.value-new Date(pending.createdAt).getTime()>=60000;});
const options=()=>({skipAuthRedirect:true,skipGlobalLoading:true,headers:{'X-Website-Chat-Token':session.value?.token}});
const endpoint=()=>`/public/website-chat/${slug.value}/sessions/${session.value.id}`;
function store(key,value){try{sessionStorage.setItem(`website-chat:${slug.value}:${key}`,JSON.stringify(value));}catch{}}
function read(key){try{return JSON.parse(sessionStorage.getItem(`website-chat:${slug.value}:${key}`)||'null');}catch{return null;}}
function apply(data){messages.value=data.messages||[];closed.value=!!data.ended;staffViewing.value=!!data.staffViewing;staffTyping.value=!!data.staffTyping;visible.value=!!data.initiated;if(open.value&&!contact.value)lastSeenReply=messages.value.at(-1)?.id||0;}
async function poll(){if(busy||!session.value)return;busy=true;const current=generation;try{const {data}=await api.post(`${endpoint()}/presence`,{pagePath:route.path,typing:!closed.value&&!!draft.value.trim()},options());if(current===generation)apply(data);}catch(e){if(current===generation&&e.response?.status===404){closed.value=true;expired.value=true;store('session',null);clearInterval(timer);}}finally{busy=false;}}
function leave(){if(!session.value)return;const url=`${api.defaults?.baseURL||'/api'}${endpoint()}/leave`;navigator.sendBeacon?.(url,new Blob([JSON.stringify({token:session.value.token})],{type:'application/json'}));}
async function endChat(){try{await api.post(`${endpoint()}/leave`,{end:true},options());closed.value=true;draft.value='';await poll();}catch{error.value='Could not end chat. Please try again.';}}
async function showContact(){contact.value=true;if(contactReady.value)return;try{const {data}=await api.post(`${endpoint()}/referral`,{},options());referralToken.value=data.token;contactReady.value=true;}catch{/* The inquiry remains available even when the chat session has expired. */contactReady.value=true;}}
async function init(){const id=++generation;clearInterval(timer);clearInterval(clock);visible.value=false;session.value=null;messages.value=[];contact.value=false;contactReady.value=false;closed.value=false;expired.value=false;draft.value='';error.value='';if(!slug.value||route.query.marketingPreview==='1')return;
 try{const {data}=await api.get(`/public/website-chat/${slug.value}/config`,{skipAuthRedirect:true,skipGlobalLoading:true});if(id!==generation)return;settings.value=data;const previous=read('session');if(!data.eligible)return;
  if(!data.online&&!previous){timer=setInterval(()=>{if(!document.hidden)init();},30000);return;}
  session.value=previous;
  if(!session.value){const captchaToken=await websiteCaptchaToken(data.captchaSiteKey,'public_website_chat');if(id!==generation)return;const response=await api.post(`/public/website-chat/${slug.value}/sessions`,{captchaToken},{skipAuthRedirect:true,skipGlobalLoading:true});if(id!==generation)return;session.value=response.data;store('session',session.value);}
  await poll();if(id!==generation)return;timer=setInterval(poll,7000);clock=setInterval(()=>now.value=Date.now(),1000);
 }catch{/* Contact forms remain available if Live Chat is unavailable. */}}
async function send(){if(sending.value||closed.value||!draft.value.trim())return;sending.value=true;error.value='';const current=generation;try{const {data}=await api.post(`${endpoint()}/messages`,{body:draft.value,clientMessageId:crypto.randomUUID()},options());if(current!==generation)return;apply(data);draft.value='';await nextTick();if(thread.value)thread.value.scrollTop=thread.value.scrollHeight;}catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Message could not be sent. Please try again or submit a ticket.';}finally{sending.value=false;}}
watch(draft,()=>{clearTimeout(typingTimer);typingTimer=setTimeout(poll,400);});
watch(()=>route.path,poll);watch(slug,init,{immediate:true});
window.addEventListener('pagehide',leave);window.addEventListener('pageshow',poll);
onUnmounted(()=>{leave();generation++;clearInterval(timer);clearInterval(clock);clearTimeout(typingTimer);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',poll);});
</script>
<style scoped>
.webchat-visitor{position:fixed;bottom:84px;right:22px;z-index:950;font:15px/1.5 system-ui,sans-serif;color:#19302e;max-width:calc(100vw - 24px)}.webchat-panel{width:365px;max-width:calc(100vw - 24px);background:#fff;border:1px solid #c9d8d4;border-radius:15px;box-shadow:0 10px 40px #0003;overflow:auto;max-height:75vh}.webchat-panel header{display:flex;align-items:center;gap:8px;background:var(--webchat-color);color:white;padding:12px}.webchat-panel header strong{flex:1}.webchat-panel header img{width:32px;height:32px;object-fit:contain;background:white;border-radius:4px}.webchat-panel button,.webchat-launch{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:8px 12px;background:var(--webchat-color);color:white}.webchat-panel header button{background:#ffffff22}.webchat-intro,.webchat-note,.webchat-fallback{padding:0 14px}.webchat-note{font-size:12px;color:#516865}.webchat-thread{max-height:260px;overflow:auto;padding:10px 14px}.webchat-thread article{background:#eff4f2;padding:8px 12px;margin-bottom:8px;border-radius:9px}.webchat-thread article.from-visitor{background:#e3f1f8;margin-left:22px}.webchat-thread p{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0}.webchat-thread small{font-weight:600}.webchat-panel form{padding:14px;display:flex;gap:8px;align-items:end}.webchat-panel textarea{min-width:0;flex:1;font:inherit;border:1px solid #a2b7b2;border-radius:7px;padding:8px;resize:vertical}.webchat-panel button:disabled{opacity:.55}.webchat-fallback{font-size:13px;padding-bottom:14px}.webchat-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.webchat-emojis{display:flex;gap:4px;padding:0 14px 14px}.webchat-emojis button{background:#eff4f2;color:#19302e;padding:5px}.webchat-note a{color:#086aa0}.webchat-fallback button{margin:4px}
@media(max-width:600px){.webchat-visitor{bottom:calc(78px + env(safe-area-inset-bottom,0px));right:12px;max-width:calc(100vw - 24px);font-size:14px}.webchat-panel{bottom:calc(78px + env(safe-area-inset-bottom,0px));max-height:calc(100dvh - 120px)}}
</style>
