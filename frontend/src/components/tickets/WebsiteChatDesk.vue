<template>
 <Teleport to="body"><aside ref="desk" class="webchat-desk" :style="movement.style.value" aria-label="Live Chat desk">
  <div class="webchat-desk-controls"><button class="webchat-move" aria-label="Move Live Chat" title="Drag to move; use arrow keys when focused" @pointerdown="movement.start" @pointermove="movement.pointerMove" @pointerup="movement.stop" @pointercancel="movement.stop" @lostpointercapture="movement.stop" @keydown="movement.keyMove">⠿</button>
  <button class="webchat-desk-toggle" @click="expanded=!expanded">Live Chat <span v-if="waitingCount">{{waitingCount}} message{{waitingCount===1?'':'s'}} waiting</span> · {{available?'On':'Off'}}</button></div>
  <section v-if="expanded" class="webchat-desk-panel">
   <header><strong>Live Chat</strong><label><input v-model="available" type="checkbox" @change="setAvailable"/>Available for chat</label><button aria-label="Minimize Live Chat" @click="expanded=false">−</button></header>
   <p class="webchat-desk-note"><strong>Send a visitor a message to initiate a chat. They cannot chat with you until you send the first message.</strong></p>
   <p class="webchat-desk-note">Do not request protected health information here. <a href="/community-standards" target="_blank" rel="noopener">Community Standards</a> apply.</p>
   <nav class="webchat-quick"><button @click="tab='chats'">Available chats ({{rows.length}})</button><button @click="showTeam">Team availability</button></nav>
   <p v-if="error" role="alert">{{error}}</p>
   <section v-if="tab==='team'" class="webchat-desk-note"><h3>Available for chat</h3><p v-if="!team.length">No team members currently available.</p><p v-for="member in team" :key="member.userId">{{member.name}}</p><p>Open a chat to see which team members are viewing or typing. Visitors see only that a support member has the chat open.</p></section>
   <template v-else>
    <p v-if="!rows.length" class="webchat-desk-note">No current website conversations.</p>
    <div class="webchat-visitors" role="list"><div v-for="s in rows" :key="s.id" role="listitem" class="visitor-toast" :style="{borderLeft:`5px solid ${s.color}`}" :class="{selected:selected?.id===s.id}">
     <button :aria-expanded="selected?.id===s.id" @click="select(s)"><img v-if="s.logoUrl" :src="s.logoUrl" alt=""/><span><strong>{{s.name}}</strong><small>Visitor {{s.id.slice(0,6)}} · {{s.expired?'Session expired':s.endedAt?'Visitor ended chat':s.visitorLeft?'Visitor left':s.visitorTyping?'Visitor typing…':'Viewing '+(s.pagePath||'/')}}</small><small v-if="s.visitorLeft||s.endedAt">Last page: {{s.pagePath||'/'}}</small><small v-if="s.claimedBy">Claimed by a support member</small></span><b v-if="isUnread(s)">Message waiting</b></button>
    </div></div>
    <nav v-if="opened.length" class="webchat-quick" aria-label="Open chats"><button v-for="id in opened" :key="id" @click="select(rows.find(s=>s.id===id))">{{rows.find(s=>s.id===id)?.name}} · {{id.slice(0,6)}} {{isUnread(rows.find(s=>s.id===id))?'●':''}}</button></nav>
    <template v-if="selected"><div class="webchat-selected"><strong>{{selected.name}} · Visitor {{selected.id.slice(0,6)}}</strong><button @click="closeChat">Close chat</button></div>
     <p class="webchat-desk-note">{{details.expired?'Session expired. History is preserved.':details.ended?'Visitor ended this chat.':details.claimedByMe?'You are responsible for this chat.':details.claimedBy?'Another support member is responsible for this chat.':'Available to the support team.'}}</p>
     <button v-if="!details.expired&&!details.ended&&(!details.claimedBy||details.claimedByMe)" @click="claim">{{details.claimedByMe?'Release claim':'Claim chat'}}</button>
     <div class="webchat-desk-note"><span v-for="v in activeViewers" :key="v.userId">{{v.name}} (Support team member {{v.memberNumber}}) · {{v.typing?'typing…':'viewing'}}<br/></span><span v-if="details.visitorTyping">Visitor is typing…</span></div>
     <p v-for="(referral,i) in (details.referrals||[]).filter(r=>r.clickedAt||r.ticketId)" :key="i" class="webchat-desk-note">{{referral.ticketId?`Live Chat inquiry submitted: ticket #${referral.ticketId}`:'Visitor opened the support ticket invitation.'}}</p>
     <div ref="thread" class="webchat-staff-thread" role="log" aria-live="polite"><article v-for="m in messages" :key="m.id" :class="{staff:m.sender==='staff'}"><small>{{m.sender==='staff'?`Support team member ${m.memberNumber||1}`:m.sender==='system'?'Live Chat':'Visitor'}}</small><p><WebsiteChatMessage :body="m.body"/></p></article></div>
     <div class="webchat-quick"><label>Quick replies<select aria-label="Quick replies" @change="insertReply"><option value="">Choose a reply…</option><option v-for="reply in quickReplies" :key="reply.label" :value="reply.body">{{reply.label}}</option></select></label><label>Page links<select aria-label="Page links" @change="insertLink"><option value="">Insert a page link…</option><option v-for="link in details.pageLinks||[]" :key="link.url" :value="link.url">{{link.label}}</option></select></label></div>
     <div class="webchat-desk-note"><label>Ticket topic (optional)<select v-model="topic"><option value="">Visitor chooses</option><option v-for="t in details.topics||[]" :key="t.id" :value="t.id">{{t.label}}</option></select></label><button :disabled="details.canReply===false" @click="insertReferral">Insert support ticket invitation</button></div>
     <form @submit.prevent="send"><label for="staff-website-reply">Reply to this visitor</label><textarea id="staff-website-reply" v-model="draft" :disabled="details.canReply===false" rows="3" maxlength="2000" required/><div class="webchat-quick" aria-label="Insert emoji"><button v-for="emoji in emojis" :key="emoji" type="button" :aria-label="`Insert ${emoji}`" @click="draft+=emoji">{{emoji}}</button></div><button :disabled="sending||!draft.trim()||details.canReply===false">{{sending?'Sending…':'Send reply'}}</button></form>
     <button v-if="!confirmFlag" :disabled="details.canReply===false||!messages.some(m=>m.sender==='staff')" @click="confirmFlag=true">Flag Community Standards</button>
     <div v-else class="webchat-desk-note" role="alert"><p>Flag this chat and send the visitor the Community Standards notice?</p><button @click="flag">Confirm flag &amp; notify visitor</button><button @click="confirmFlag=false">Cancel</button></div>
    </template>
   </template>
  </section>
 </aside></Teleport>
</template>
<script setup>
import WebsiteChatMessage from '../public/WebsiteChatMessage.vue';
import {computed,ref,watch,onMounted,onUnmounted,nextTick} from 'vue';
import api from '../../services/api';
import {useAuthStore} from '../../store/auth';
import {useMovableChatPanel} from '../../composables/useMovableChatPanel';
const rows=ref([]),selected=ref(null),messages=ref([]),quickReplies=ref([]),draft=ref(''),error=ref(''),available=ref(true),expanded=ref(false),sending=ref(false),thread=ref();
const details=ref({}),team=ref([]),tab=ref('chats'),topic=ref(''),confirmFlag=ref(false),opened=ref([]),seen=ref({}),drafts=new Map(),emojis=['😊','👍','❤️','🙏','👋','🎉','😕'];
const auth=useAuthStore(),desk=ref();
const stateKey=`website-chat-desk:${auth.user?.id||'staff'}`;
const movement=useMovableChatPanel(desk,expanded,`${stateKey}:position`);
let timer,typingTimer,busy=false,alive=true,selection=0,initialized=false,restored=false;
function saveState(){try{sessionStorage.setItem(stateKey,JSON.stringify({expanded:expanded.value,seen:seen.value}));}catch{}}
function markSeen(id,data){const latest=(data.messages||[]).filter(m=>m.sender==='visitor').at(-1)?.id||0;seen.value[id]=Math.max(Number(seen.value[id]||0),Number(latest));saveState();}
watch(expanded,saveState);
const opts={skipGlobalLoading:true};
const isUnread=s=>!s?.endedAt&&!s?.expired&&Number(s?.lastVisitorMessageId||0)>Math.max(Number(s?.lastStaffMessageId||0),Number(seen.value[s?.id]||0));
const waitingCount=computed(()=>rows.value.filter(isUnread).length);
const activeViewers=computed(()=>(details.value.viewers||[]).filter(v=>v.viewing));
async function setAvailable(){try{localStorage.setItem('website-chat-staff-available',String(available.value));await api.post('/website-chat/presence',{available:available.value},opts);}catch{error.value='Live Chat availability could not be updated.';}}
async function presence(id,viewing=true){if(rows.value.find(s=>s.id===id)?.expired)return;await api.post(`/website-chat/sessions/${id}/presence`,{viewing,typing:viewing&&!!(id===selected.value?.id?draft.value:drafts.get(id)||'').trim()},opts);}
async function poll(){if(busy)return;busy=true;try{if(available.value)await api.post('/website-chat/presence',{available:true},opts);const {data}=await api.get('/website-chat/sessions',opts);if(!alive)return;rows.value=data.sessions||[];
 if(!initialized){initialized=true;if(!restored&&available.value&&rows.value.length)expanded.value=true;}
 opened.value=opened.value.filter(id=>rows.value.some(s=>s.id===id));
 for(const id of opened.value)await presence(id);
 if(selected.value){const s=rows.value.find(r=>r.id===selected.value.id);if(!s){selected.value=null;selection++;}else{selected.value=s;await readSelected();}}
 if(tab.value==='team')await loadTeam();
 }catch(e){if(e.response?.status!==401)error.value='Live Chat could not refresh. We’ll retry shortly.';}finally{busy=false;}}
function apply(data){messages.value=data.messages||[];quickReplies.value=data.quickReplies||[];details.value=data;}
async function readSelected(){const s=selected.value,version=selection;if(!s)return;const {data}=await api.get(`/website-chat/sessions/${s.id}`,opts);if(!alive||version!==selection)return;apply(data);if(expanded.value&&tab.value==='chats'&&!document.hidden)markSeen(s.id,data);}
async function select(s){if(!s)return;if(selected.value)drafts.set(selected.value.id,draft.value);if(selected.value?.id===s.id){clearTimeout(typingTimer);selected.value=null;selection++;confirmFlag.value=false;return;}selected.value=s;selection++;messages.value=[];details.value={};topic.value='';confirmFlag.value=false;tab.value='chats';draft.value=drafts.get(s.id)||'';if(!opened.value.includes(s.id))opened.value.push(s.id);try{await presence(s.id);await readSelected();await nextTick();if(thread.value)thread.value.scrollTop=thread.value.scrollHeight;}catch{error.value='This conversation could not be loaded.';}}
async function send(){if(!selected.value||sending.value||!draft.value.trim())return;sending.value=true;error.value='';const id=selected.value.id,version=selection;try{const {data}=await api.post(`/website-chat/sessions/${id}/messages`,{body:draft.value,clientMessageId:crypto.randomUUID()},opts);drafts.delete(id);markSeen(id,data);if(version===selection){apply(data);draft.value='';await nextTick();if(thread.value)thread.value.scrollTop=thread.value.scrollHeight;}}catch(e){error.value=e.response?.data?.error?.message||'Reply could not be sent.';}finally{sending.value=false;}}
async function closeChat(){if(!selected.value)return;const id=selected.value.id,version=selection;clearTimeout(typingTimer);try{await api.post(`/website-chat/sessions/${id}/close`,{},opts);drafts.delete(id);opened.value=opened.value.filter(v=>v!==id);if(version===selection){selected.value=null;draft.value='';selection++;}await poll();}catch{error.value='The chat could not be closed.';}}
async function action(path,body){const id=selected.value?.id,version=selection;if(!id)return;try{const {data}=await api.post(`/website-chat/sessions/${id}/${path}`,body,opts);if(version===selection)apply(data);}catch(e){error.value=e.response?.data?.error?.message||'Please try again.';}}
async function claim(){await action('claim',{release:!!details.value.claimedByMe});}
async function flag(){await action('standards',{confirmed:true});confirmFlag.value=false;}
function insertReply(e){draft.value=e.target.value;e.target.value='';}
function insertLink(e){if(e.target.value)draft.value+=`${draft.value?'\n':''}${e.target.value}`;e.target.value='';}
async function insertReferral(){const version=selection;try{const {data}=await api.post(`/website-chat/sessions/${selected.value.id}/referral`,{category:topic.value},opts);if(version===selection)draft.value=`It sounds like you could use more support than I can offer in Live Chat. Please submit a ticket to our full support team so we can review the details and help: ${data.url}`;}catch{error.value='Could not create the ticket invitation.';}}
async function loadTeam(){const {data}=await api.get('/website-chat/team',opts);team.value=data.team||[];}
async function showTeam(){tab.value='team';try{await loadTeam();}catch{error.value='Could not load team availability.';}}
watch(draft,()=>{clearTimeout(typingTimer);const id=selected.value?.id;if(id)typingTimer=setTimeout(()=>presence(id).catch(()=>{}),400);});
onMounted(()=>{try{const saved=JSON.parse(sessionStorage.getItem(stateKey));if(saved&&typeof saved.expanded==='boolean'){restored=true;expanded.value=saved.expanded;seen.value=saved.seen&&typeof saved.seen==='object'?saved.seen:{};}}catch{}try{available.value=localStorage.getItem('website-chat-staff-available')!=='false';}catch{}setAvailable();poll();timer=setInterval(poll,8000);});
onUnmounted(()=>{alive=false;selection++;clearInterval(timer);clearTimeout(typingTimer);for(const id of opened.value)api.post(`/website-chat/sessions/${id}/close`,{},opts).catch(()=>{});api.post('/website-chat/presence',{available:false},opts).catch(()=>{});});
</script>
<style scoped>
.webchat-desk{position:fixed;right:18px;bottom:150px;z-index:1200;color:#233238;font:14px/1.45 system-ui,sans-serif}.webchat-desk button{font:inherit;cursor:pointer;border:1px solid #bccdc8;background:#fff;color:#23473d;border-radius:7px;padding:7px 10px}.webchat-desk .webchat-desk-toggle{background:#173e36;color:white;box-shadow:0 3px 14px #0003}.webchat-desk-toggle span{background:#b3293d;border-radius:20px;padding:2px 7px}.webchat-desk-panel{margin-top:8px;background:#fff;border:1px solid #b8cbc5;border-radius:12px;width:410px;max-width:calc(100vw - 24px);max-height:75vh;overflow:auto;box-shadow:0 8px 40px #0003}.webchat-desk-panel>header{padding:12px;display:flex;align-items:center;justify-content:space-between;gap:6px;background:#f0f5f3}.webchat-desk-panel header label{font-size:12px}.webchat-desk-note{padding:0 12px;font-size:12px}.webchat-visitors{max-height:180px;overflow:auto}.visitor-toast{display:flex;margin:8px;border:1px solid #d5e1dd;border-radius:8px}.visitor-toast.selected{background:#e4eeea}.visitor-toast button:first-child{display:flex;align-items:center;gap:8px;flex:1;text-align:left;border:0;background:transparent}.visitor-toast img{width:34px;height:30px;object-fit:contain}.visitor-toast small{display:block;font-size:11px}.visitor-toast b{font-size:10px;color:#a31e36}.webchat-selected{padding:10px;display:flex;justify-content:space-between;gap:8px;font-size:12px}.webchat-staff-thread{max-height:240px;overflow:auto;padding:10px}.webchat-staff-thread article{background:#f3f3f3;margin-bottom:7px;padding:8px 12px;border-radius:8px}.webchat-staff-thread article.staff{background:#e4f1e9;margin-left:20px}.webchat-staff-thread p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.webchat-quick{display:flex;flex-wrap:wrap;gap:5px;padding:10px}.webchat-quick button{font-size:12px}.webchat-desk form{display:grid;gap:8px;padding:12px}.webchat-desk textarea{font:inherit;border:1px solid #9db7ad;border-radius:7px;padding:8px;color:#233238;background:white}.webchat-desk form>button{background:#175b49;color:white}
.webchat-desk-controls{display:flex;align-items:center;gap:4px}.webchat-desk .webchat-move{cursor:grab;touch-action:none;font-size:22px;padding:3px 9px}.webchat-desk .webchat-move:active{cursor:grabbing}.webchat-desk{max-height:calc(100dvh - 16px);overflow:auto;max-width:calc(100vw - 16px)}.webchat-desk select{display:block;max-width:100%;font:inherit;padding:6px}.webchat-desk button:disabled{opacity:.5;cursor:default}.webchat-desk-panel{width:480px}.webchat-desk-note a{color:#086aa0}</style>
