<template>
  <section class="family-pocket">
    <div class="pocket-intro">
      <div><h2>Your family, on the go</h2><p>Groceries, to-dos and the next seven days. Save this page to your phone’s home screen.</p></div>
      <div class="pocket-actions"><button @click="load" :disabled="loading">↻ Refresh</button><button @click="copy" :disabled="!summary">Copy summary</button><button v-if="canShare" @click="share" :disabled="!summary">Share</button></div>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="loading && !summary">Loading your lists…</p>
    <template v-if="summary">
      <details class="pocket-add-wrap"><summary>＋ Add to groceries, shopping or to-dos</summary><form class="pocket-add" @submit.prevent="add">
        <label>List<select v-model="kind"><option value="grocery">Groceries</option><option value="shopping">Shopping</option><option v-if="isParent" value="chore">My to-dos</option></select></label>
        <label>Items<textarea v-model="items" placeholder="Milk, eggs, dog food… or one item per line" required maxlength="8000" /></label>
        <p v-if="kind==='chore'" class="pocket-note">Saved as one-time family chores assigned to you.</p>
        <button class="fcc-primary" :disabled="saving || !items.trim()">{{ saving?'Adding…':'＋ Add to list' }}</button>
      </form></details>
      <section class="pocket-email" aria-label="Email family lists">
        <h3>Send to a family inbox</h3>
        <p>Choose what to send. The app emails it directly—no mail app needed.</p>
        <form v-if="summary.sendEmailAvailable" class="pocket-send" @submit.prevent="sendEmail">
          <label>Send to<select v-model="recipient" :disabled="sending" required aria-label="Family email recipient"><option value="" disabled>Choose a recipient</option><option v-for="r in summary.recipients" :key="r.userId" :value="r.email.toLowerCase()">{{ r.name }} · {{ r.email }}</option><option v-if="isParent" value="custom">Another family email address</option></select></label>
          <label v-if="recipient==='custom'">Family email address<input v-model="customEmail" type="email" required maxlength="254" autocomplete="email" placeholder="family@gmail.com" :disabled="sending" /></label>
          <fieldset :disabled="sending"><legend>What would you like to send?</legend><label v-for="s in summary.sections" :key="s.key" class="send-choice"><input v-model="emailSections" type="checkbox" :value="s.key" /> {{ s.title }} <span>({{ s.items.length }})</span></label></fieldset>
          <div class="pocket-actions"><button type="button" @click="emailSections=summary.sections.map(s=>s.key)" :disabled="sending">Select everything</button><button type="button" @click="emailSections=[]" :disabled="sending">Clear choices</button></div>
          <label class="send-choice"><input v-model="rememberEmail" type="checkbox" :disabled="sending" /> Remember these choices on this device</label>
          <div class="pocket-actions"><button class="pocket-send-button" type="submit" :disabled="sending||!emailSections.length||!sendTo">{{ sending?'Sending…':pendingSend?'Check delivery / retry':'Send email now' }}</button><button v-if="pendingSend&&!sending" type="button" @click="pendingSend=null;deliveryError=''">Start a new email</button></div>
          <p v-if="deliveryMessage" class="delivery-success" role="status">{{ deliveryMessage }}</p><p v-if="deliveryError" class="delivery-error" role="alert">{{ deliveryError }}</p>
        </form>
        <p v-else>Email sending isn’t configured for your organization yet. You can still copy or share your summary above.</p>
        <details v-if="summary.emailAddress" class="pocket-email-help"><summary>Add items by emailing the app</summary><p>From {{ summary.accountEmail }}, email <strong>{{ summary.emailAddress }}</strong> with a subject such as “Add groceries: milk, eggs” or “Add to-do: book the dentist.” A reply normally arrives within five minutes.</p><button @click="copyEmailAddress">Copy app email address</button></details>
      </section>
      <div class="pocket-jump"><a v-for="section in summary.sections" :key="section.key" :href="`#pocket-${section.key}`">{{ section.key==='upcoming'?'Upcoming':section.title }} · {{ section.items.length }}</a></div>
      <p class="pocket-note">Updated {{ new Date(summary.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) }} · {{ summary.timezone }}. Upcoming shows family events; to-dos includes unfinished family chores.</p>
      <p v-if="summary.truncated">There are more entries than this summary can show. Open Lists or Calendar for more.</p>
      <div class="pocket-grid"><section v-for="section in summary.sections" :key="section.key" :id="`pocket-${section.key}`" class="pocket-list"><h3>{{ section.title }} <span>{{ section.items.length }}</span></h3><ul v-if="section.items.length"><li v-for="item in section.items" :key="item.id"><strong>{{ item.title }}</strong><small v-if="item.detail">{{ item.detail }}</small></li></ul><p v-else>Nothing here right now.</p></section></div>
    </template>
  </section>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
const props=defineProps({http:{type:Function,required:true},householdId:{type:[Number,String],required:true},isParent:Boolean});
const emit=defineEmits(['updated','error']);
const summary=ref(null),loading=ref(false),saving=ref(false),message=ref(''),kind=ref('grocery'),items=ref('');
const recipient=ref(''),customEmail=ref(''),emailSections=ref(['grocery','shopping','chore','upcoming']),rememberEmail=ref(true),sending=ref(false),deliveryError=ref(''),deliveryMessage=ref(''),pendingSend=ref(null);
const sendTo=computed(()=>recipient.value==='custom'?customEmail.value.trim().toLowerCase():recipient.value);
let restoredEmail=false;
const canShare=typeof navigator.share==='function';
let timer;
const path=()=>`/households/${props.householdId}/pocket`;
async function load(){if(loading.value)return;loading.value=true;try{summary.value=(await props.http.get(path())).data;if(!restoredEmail){restoreEmailChoices();restoredEmail=true;}}catch(e){emit('error',e);}finally{loading.value=false;}}
function emailStorageKey(){return `family-pocket-email:${props.householdId}:${summary.value.accountEmail || ''}`;}
function restoreEmailChoices(){
  const options=summary.value.recipients || [];
  recipient.value=options.find(r=>r.email.toLowerCase()===summary.value.accountEmail?.toLowerCase())?.email.toLowerCase() || options[0]?.email.toLowerCase() || (props.isParent?'custom':'');
  try{const saved=JSON.parse(localStorage.getItem(emailStorageKey())||'null');if(saved){
    const known=options.some(r=>r.email.toLowerCase()===saved.to);
    if(known)recipient.value=saved.to;else if(props.isParent){recipient.value='custom';customEmail.value=saved.to || '';}
    if(Array.isArray(saved.sections))emailSections.value=saved.sections.filter(k=>summary.value.sections.some(s=>s.key===k));
  }}catch{}
}
async function sendEmail(){
  if(sending.value||!sendTo.value||!emailSections.value.length)return;
  const payload={to:sendTo.value,sections:[...emailSections.value].sort()};
  const same=pendingSend.value&&pendingSend.value.to===payload.to&&JSON.stringify(pendingSend.value.sections)===JSON.stringify(payload.sections);
  if(!same)pendingSend.value={...payload,requestId:crypto.randomUUID()};
  sending.value=true;deliveryError.value='';deliveryMessage.value='';
  try{
    const {data}=await props.http.post(`${path()}/email`,pendingSend.value);
    if(!data.sent)throw new Error('Delivery was not confirmed. Please check your inbox before trying again.');
    deliveryMessage.value=`Sent ${summary.value.sections.filter(s=>payload.sections.includes(s.key)).map(s=>s.title).join(', ')} to ${data.to}.`;
    pendingSend.value=null;
    try{if(rememberEmail.value)localStorage.setItem(emailStorageKey(),JSON.stringify(payload));else localStorage.removeItem(emailStorageKey());}catch{}
  }catch(e){deliveryError.value=e.response?.data?.error?.message||e.message||'Email delivery could not be confirmed. Check your inbox before retrying.';}
  finally{sending.value=false;}
}
async function copyEmailAddress(){try{await navigator.clipboard.writeText(summary.value.emailAddress);message.value='App email address copied.';}catch{message.value=`App email address: ${summary.value.emailAddress}`;}}

function text(){return [summary.value.name,...summary.value.sections.flatMap(s=>['',s.title,...(s.items.length?s.items.map(i=>`• ${i.title}${i.detail?' — '+i.detail:''}`):['Nothing here right now.'])]),'',summary.value.url].join('\n');}
async function copy(){try{await navigator.clipboard.writeText(text());message.value='Copied. Paste into a note or message to take it with you.';}catch{message.value='Copy is unavailable in this browser. You can use the email buttons instead.';}}
async function share(){try{await navigator.share({title:summary.value.name,text:text()});}catch(e){if(e.name!=='AbortError')message.value='Sharing is unavailable. Try Copy summary.';}}
async function add(){if(saving.value)return;saving.value=true;message.value='';try{const values=items.value.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);const{data}=await props.http.post(`${path()}/items`,{kind:kind.value,items:values});items.value='';message.value=`Added ${data.added} item${data.added===1?'':'s'}${data.skipped?`; ${data.skipped} already on the list`:''}.`;emit('updated');await load();}catch(e){emit('error',e);}finally{saving.value=false;}}
onMounted(()=>{load();timer=setInterval(()=>{if(!document.hidden&&!saving.value)load();},30000);});
onUnmounted(()=>clearInterval(timer));
</script>
<style scoped>
.family-pocket{max-width:1100px;color:var(--ink)}
.pocket-intro{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:20px}
.pocket-intro h2{font-size:24px}.pocket-intro p{margin:8px 0;color:var(--muted)}
.pocket-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.pocket-actions button,.pocket-actions a{font:inherit;font-weight:600;color:var(--purple);background:var(--surface);border:1px solid var(--control);border-radius:9px;padding:11px 14px;text-decoration:none;cursor:pointer}
.pocket-actions a:hover{background:var(--soft)}.pocket-actions a:focus-visible{outline:3px solid var(--purple);outline-offset:2px}
.pocket-add-wrap,.pocket-email,.pocket-list{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px;margin:18px 0}
.pocket-add-wrap>summary{font-size:18px;font-weight:700;cursor:pointer}.pocket-add{margin-top:18px;display:flex;flex-wrap:wrap;gap:15px;align-items:end}.pocket-add h3{width:100%;margin:0}.pocket-add label{display:flex;flex-direction:column;gap:8px;flex:1;min-width:150px;font-size:14px}.pocket-add label:has(textarea){flex:3}
.pocket-add input,.pocket-add select,.pocket-add textarea{font:inherit;font-size:16px;padding:12px;border:1px solid var(--control);border-radius:8px;width:100%;color:var(--ink);background:var(--surface)}.pocket-add textarea{min-height:72px;resize:vertical}.pocket-add button{min-height:46px;font:inherit;font-weight:600;background:var(--purple);color:white;border:0;border-radius:9px;padding:12px 18px;cursor:pointer}.pocket-add button:disabled{opacity:.55;cursor:default}.pocket-add button:focus-visible{outline:3px solid var(--purple);outline-offset:3px}.pocket-jump{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.pocket-jump a{color:var(--purple);font-weight:600}.pocket-list{scroll-margin-top:16px}
.pocket-email summary{font-size:18px;font-weight:700;cursor:pointer}.pocket-email p{line-height:1.7;overflow-wrap:anywhere}.pocket-email a{color:var(--purple)}
.pocket-note{font-size:13px;color:var(--muted)}.pocket-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pocket-list{margin:0;min-width:0}.pocket-list h3{margin:0;font-size:18px}.pocket-list h3 span{font-size:14px;color:var(--muted)}.pocket-list ul{list-style:none;margin:12px 0 0;padding:0}.pocket-list li{padding:14px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.pocket-list li:last-child{border:0}.pocket-list small{display:block;color:var(--muted);font-size:14px;margin-top:5px}
@media(max-width:650px){.pocket-grid{grid-template-columns:1fr}.pocket-add-wrap,.pocket-email,.pocket-list{padding:18px}.pocket-add label{min-width:100%}.pocket-actions a{flex:1;min-width:130px}.pocket-intro h2{font-size:22px}}
.pocket-email h3{font-size:20px;margin:0}.pocket-send{display:flex;flex-direction:column;gap:14px;margin-top:18px}.pocket-send>label{display:flex;flex-direction:column;gap:7px;font-size:14px}.pocket-send input[type=email],.pocket-send select{font:inherit;font-size:16px;min-height:46px;padding:10px;border:1px solid var(--control);border-radius:8px;background:var(--surface);color:var(--ink);width:100%;max-width:640px}.pocket-send fieldset{border:1px solid var(--line);border-radius:10px;display:flex;flex-wrap:wrap;gap:14px;padding:16px;min-width:0}.pocket-send legend{font-weight:650}.pocket-send .send-choice{display:flex;flex-direction:row;align-items:center;gap:8px;font-size:14px}.send-choice input{width:19px;height:19px;min-height:0;accent-color:var(--purple)}.send-choice span{color:var(--muted)}.pocket-actions .pocket-send-button{background:var(--purple);color:white;border:0}.pocket-send button:disabled{opacity:.55;cursor:default}.delivery-success{padding:12px;border-radius:8px;background:#edf6ef;color:#245e38}.delivery-error{padding:12px;border-radius:8px;background:#fff0ed;color:#8b2f21}.pocket-email-help{margin-top:20px;border-top:1px solid var(--line);padding-top:16px}.pocket-email-help summary{font-size:14px}
</style>
