<script setup>
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const {ft}=useFamilyLocale();
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
import {useAuthStore} from '../../store/auth';
import baseApi from '../../services/api';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
import FamilySharingNotice from '../session-comments/FamilySharingNotice.vue';
import SecureMessageBanner from '../conversa/SecureMessageBanner.vue';
import {downloadAttachment} from '../../utils/communicationAttachments';

const props=defineProps({threads:{type:Array,default:()=>[]},clientId:[Number,String],initialThreadId:[Number,String],initialMessageId:[Number,String],loading:Boolean,learning:Boolean,unavailable:Boolean,familyWide:Boolean});
const emit=defineEmits(['refresh','context-change']);
const auth=useAuthStore(),careApi=usePortalCareApi();
const api=new Proxy({}, {get:(_,key)=>(...args)=>(props.clientId?careApi:baseApi)[key](...args)});
const contexts=computed(()=>{
  const map=new Map();
  const permitted=props.threads.filter(t=>!props.clientId||Number(t.client_id)===Number(props.clientId));
  const current=permitted.filter(t=>t.service_label!=='Previous secure conversation');
  for(const thread of (current.length?current:permitted)){
    const key=`${thread.client_id}:${thread.agency_id}:${thread.service_id||0}`;
    if(!map.has(key)||(!thread.readOnly&&map.get(key).readOnly))map.set(key,{...thread,key});
  }
  // An ended profile may have only retained history while another profile is
  // still active. Keep that separate context available to its original reader.
  for(const thread of permitted.filter(t=>t.service_label==='Previous secure conversation')){
    const represented=[...map.values()].some(c=>Number(c.client_id)===Number(thread.client_id)&&Number(c.agency_id)===Number(thread.agency_id)&&(!Number(thread.service_id)||Number(c.service_id)===Number(thread.service_id)));
    if(!represented){const key=`${thread.client_id}:${thread.agency_id}:${thread.service_id||0}`;map.set(key,{...thread,key});}
  }
  return [...map.values()];
});
const contextKey=ref(''),topics=ref([]),selected=ref(null),messages=ref([]),newSubject=ref(false);
const subject=ref(''),draft=ref(''),error=ref(''),busy=ref(false),opening=ref(false),sending=ref(false);
const sharing=ref(null),audience=ref([]),audienceReviewed=ref(false),audienceChanged=ref(false),threadEl=ref(null);
const rootCursors=ref({}),olderBusy=ref(false),replyCursors=ref({}),openedThread=ref(null);
const verifiedTopicKey=ref(''),highlightedMessageId=ref(null);
let loadIntent=0,openIntent=0,sendIntent=0;
let consumedNotification='';
const drafts=new Map();
const context=computed(()=>contexts.value.find(c=>c.key===contextKey.value)||null);
watch(context,current=>emit('context-change',current?{clientId:current.client_id,agencyId:current.agency_id,serviceId:current.service_id,serviceKind:current.service_kind}:null),{immediate:true});
const contextThreads=computed(()=>props.threads.filter(t=>context.value&&Number(t.client_id)===Number(context.value.client_id)&&Number(t.agency_id)===Number(context.value.agency_id)&&(!Number(t.service_id)||Number(t.service_id)===Number(context.value.service_id))&&t.thread_id));
const currentThread=computed(()=>contextThreads.value.find(t=>!t.readOnly&&t.service_label!=='Previous secure conversation')||contextThreads.value.find(t=>!t.readOnly)||(openedThread.value?.contextKey===contextKey.value?openedThread.value:null));
const learning=computed(()=>context.value?.service_kind ? context.value.service_kind==='tutoring' : props.learning);
const teamLabel=computed(()=>learning.value?'learning team':'care team');
const participantRole=p=>p.role==='provider'?(learning.value?'Tutor':'Provider'):p.role==='client'?'Client':p.role==='guardian'?'Guardian':'Participant';
const topicKey=topic=>topic?`${contextKey.value}:${topic.thread.thread_id}:${topic.id}`:'';
const canReply=computed(()=>!newSubject.value&&selected.value&&!selected.value.thread.readOnly&&verifiedTopicKey.value===topicKey(selected.value));
const draftKey=()=>`${auth.user?.id}:${contextKey.value}:${newSubject.value?'new':selected.value?.id||'none'}`;
function keepDraft(){if(draft.value.trim()||subject.value.trim())drafts.set(draftKey(),{body:draft.value,subject:subject.value});else drafts.delete(draftKey());}
function restoreDraft(){const saved=drafts.get(draftKey());draft.value=saved?.body||'';subject.value=saved?.subject||'';}
function changeContext(event){keepDraft();consumedNotification=`${props.initialThreadId||''}:${props.initialMessageId||''}`;contextKey.value=event.target.value;selected.value=null;newSubject.value=false;openedThread.value=null;draft.value='';subject.value='';}
const raw=data=>Array.isArray(data)?data:Array.isArray(data?.messages)?data.messages:[];
const params=thread=>({agencyId:thread.agency_id,serviceId:thread.service_id||undefined});
const title=message=>message?.subject?.trim()||message?.body?.split('\n')[0]?.slice(0,100)||'Secure message';
const name=message=>[message?.sender_first_name,message?.sender_last_name].filter(Boolean).join(' ')||(learning.value?'Learning team':'Care team');
const when=value=>value?new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
const orderedTopics=computed(()=>{
  const groups=new Map();
  for(const topic of topics.value){const key=`${topic.thread.thread_id}:${topic.topic_id||topic.id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(topic);}
  return [...groups.values()].map(rows=>{
    rows.sort((a,b)=>Number(a.id)-Number(b.id));const last=rows.map(m=>m.last_reply_at||m.created_at).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
    return {...rows[0],legacyRoots:rows,last_reply_at:last,reply_count:rows.reduce((n,m)=>n+(Number(m.reply_count)||0),rows.length-1),unread_count:rows.reduce((n,m)=>n+(Number(m.unread_count)||0),0)};
  }).sort((a,b)=>Date.parse(b.last_reply_at||b.created_at)-Date.parse(a.last_reply_at||a.created_at)||Number(b.id)-Number(a.id));
});

async function loadTopics(){
  const intent=++loadIntent,key=contextKey.value,wanted=selected.value&&{id:selected.value.id,threadId:selected.value.thread.thread_id},wasComposing=newSubject.value;keepDraft();const openingAtLoad=++openIntent;
  const current=()=>intent===loadIntent&&key===contextKey.value;
  busy.value=true;error.value='';selected.value=null;messages.value=[];newSubject.value=false;topics.value=[];audience.value=[];replyCursors.value={};verifiedTopicKey.value='';
  try{
    const results=await Promise.allSettled(contextThreads.value.map(async thread=>{
      const {data}=await api.get(`/guardian-portal/messages/${thread.thread_id}`,{params:{...params(thread),summaryOnly:1},skipGlobalLoading:true});
      const roots=raw(data);return {thread,messages:roots.map(m=>({...m,thread})),cursor:roots.length===60?Math.min(...roots.map(m=>Number(m.id))):null};
    }));
    if(!current())return;
    topics.value=results.flatMap(r=>r.status==='fulfilled'?r.value.messages:[]);
    rootCursors.value=Object.fromEntries(results.filter(r=>r.status==='fulfilled'&&r.value.cursor).map(r=>[r.value.thread.thread_id,r.value.cursor]));
    if(results.some(r=>r.status==='rejected'))error.value='Some secure conversations could not be loaded. Refresh messages to try again.';
    const notification=`${props.initialThreadId||''}:${props.initialMessageId||''}`;
    const applyNotification=notification!==consumedNotification;
    const requestedThread=applyNotification?Number(props.initialThreadId):0,requestedMessage=applyNotification?Number(props.initialMessageId):0;
    let locatedRootId=null;
    let topic=topics.value.find(m=>(!requestedThread||Number(m.thread.thread_id)===requestedThread)&&requestedMessage&&Number(m.id)===requestedMessage);
    if(!topic&&requestedMessage&&requestedThread&&contextThreads.value.some(t=>Number(t.thread_id)===requestedThread)){
      // A notice can point to a reply. Resolve its root through the same
      // authorized thread endpoint; never guess a different client or subject.
      const thread=contextThreads.value.find(t=>Number(t.thread_id)===requestedThread);
      const {data}=await api.get(`/guardian-portal/messages/${requestedThread}/locate/${requestedMessage}`,{params:params(thread),skipGlobalLoading:true});
      if(!current()||openIntent!==openingAtLoad)return;
      const rootId=data?.rootMessageId;
      locatedRootId=Number(rootId)||null;
      topic=topics.value.find(m=>Number(m.thread.thread_id)===requestedThread&&Number(m.id)===Number(rootId));
      if(!topic&&rootId){const older=await api.get(`/guardian-portal/messages/${requestedThread}`,{params:{...params(thread),messageId:Number(rootId)},skipGlobalLoading:true});if(!current()||openIntent!==openingAtLoad)return;const root=raw(older.data).find(m=>Number(m.id)===Number(rootId));if(root){topic={...root,thread};topics.value.push(topic);}}
    }
    if(!current()||openIntent!==openingAtLoad)return;
    if(applyNotification)consumedNotification=notification;
    topic=topic||(!requestedMessage&&requestedThread?orderedTopics.value.find(m=>Number(m.thread.thread_id)===requestedThread):null);
    if(!topic&&wanted&&!requestedMessage&&!requestedThread)topic=topics.value.find(m=>Number(m.id)===Number(wanted.id)&&Number(m.thread.thread_id)===Number(wanted.threadId));
    if(!topic&&wanted&&!requestedMessage&&!requestedThread){const thread=contextThreads.value.find(t=>Number(t.thread_id)===Number(wanted.threadId));if(thread){const {data}=await api.get(`/guardian-portal/messages/${thread.thread_id}`,{params:{...params(thread),messageId:Number(wanted.id)},skipGlobalLoading:true});if(!current()||openIntent!==openingAtLoad)return;const root=raw(data).find(m=>Number(m.id)===Number(wanted.id));if(root){topic={...root,thread};topics.value.push(topic);}}}
    if(topic)await openTopic(topic,{notifiedMessageId:requestedMessage||null,notifiedRootId:locatedRootId||topic.id});
    else if(requestedThread||requestedMessage)error.value='This secure conversation is not available for the selected profile. Refresh messages or use Support.';
    else if(wasComposing)await startSubject();
  }catch{if(intent===loadIntent&&key===contextKey.value)error.value='Secure conversations could not be loaded. Refresh messages to try again.';
  }finally{if(intent===loadIntent)busy.value=false;}
}
async function olderSubjects(){
  if(olderBusy.value)return;const intent=loadIntent,key=contextKey.value;olderBusy.value=true;
  try{const batches=await Promise.all(Object.entries(rootCursors.value).map(async([tid,beforeId])=>{const thread=contextThreads.value.find(t=>Number(t.thread_id)===Number(tid));const {data}=await api.get(`/guardian-portal/messages/${tid}`,{params:{...params(thread),beforeId,summaryOnly:1},skipGlobalLoading:true});return {tid,thread,messages:raw(data)};}));
    if(intent!==loadIntent||key!==contextKey.value)return;
    for(const b of batches){topics.value.push(...b.messages.filter(m=>!topics.value.some(t=>Number(t.id)===Number(m.id))).map(m=>({...m,thread:b.thread})));if(b.messages.length===60)rootCursors.value[b.tid]=Math.min(...b.messages.map(m=>Number(m.id)));else delete rootCursors.value[b.tid];}
  }catch{if(intent===loadIntent)error.value='Earlier subjects could not be loaded. Try again.';}finally{if(intent===loadIntent)olderBusy.value=false;}
}
async function openTopic(topic,{notifiedMessageId=null,notifiedRootId=null}={}){
  topic=orderedTopics.value.find(t=>Number(t.thread.thread_id)===Number(topic.thread.thread_id)&&(Number(t.id)===Number(topic.id)||t.legacyRoots.some(r=>Number(r.id)===Number(topic.id))))||topic;
  keepDraft();const intent=++openIntent,key=contextKey.value;selected.value=topic;newSubject.value=false;messages.value=[];audience.value=[];replyCursors.value={};verifiedTopicKey.value='';highlightedMessageId.value=null;error.value='';opening.value=true;audienceChanged.value=false;audienceReviewed.value=false;restoreDraft();
  try{
    const thread=topic.thread;
    const roots=topic.legacyRoots||[topic];
    const [originals,batches]=await Promise.all([
      Promise.all(roots.map(root=>api.get(`/guardian-portal/messages/${thread.thread_id}`,{params:{...params(thread),messageId:root.id},skipGlobalLoading:true}))),
      Promise.all(roots.map(root=>api.get(`/guardian-portal/messages/${thread.thread_id}`,{params:{...params(thread),parentMessageId:root.id},skipGlobalLoading:true})))
    ]);
    if(intent!==openIntent||key!==contextKey.value)return;
    const replies=batches.flatMap(r=>raw(r.data));
    replyCursors.value=Object.fromEntries(batches.map((r,i)=>({root:roots[i].id,rows:raw(r.data)})).filter(b=>b.rows.length===60).map(b=>[b.root,Math.min(...b.rows.map(m=>Number(m.id)))]));
    const fullRoots=originals.flatMap(r=>raw(r.data)).filter(m=>roots.some(root=>Number(root.id)===Number(m.id)));
    if(fullRoots.length!==roots.length)throw Error('Secure subject no longer available');
    if(notifiedMessageId&&!fullRoots.some(m=>Number(m.id)===Number(notifiedMessageId))&&!replies.some(m=>Number(m.id)===Number(notifiedMessageId))){
      if(!roots.some(root=>Number(root.id)===Number(notifiedRootId)))throw Error('The notified subject is unavailable');
      const {data}=await api.get(`/guardian-portal/messages/${thread.thread_id}`,{params:{...params(thread),parentMessageId:Number(notifiedRootId),replyMessageId:Number(notifiedMessageId)},skipGlobalLoading:true});
      if(intent!==openIntent||key!==contextKey.value)return;
      const exact=raw(data).find(m=>Number(m.id)===Number(notifiedMessageId)&&Number(m.parent_message_id)===Number(notifiedRootId));
      if(!exact)throw Error('The notified reply is unavailable');
      replies.push(exact);
    }
    messages.value=[...new Map([...fullRoots,...replies].map(m=>[Number(m.id),m])).values()].sort((a,b)=>Number(a.id)-Number(b.id));
    // Reading original-audience history must not open a new conversation or
    // depend on current compose eligibility. Send rechecks these exact people.
    audience.value=thread.participants||[];
    verifiedTopicKey.value=topicKey(topic);
    const summary=await api.get(`/guardian-portal/messages/${thread.thread_id}`,{params:{...params(thread),summaryOnly:1},skipGlobalLoading:true}).catch(()=>({data:[]}));
    if(intent!==openIntent||key!==contextKey.value)return;
    for(const row of raw(summary.data)){const stored=topics.value.find(t=>Number(t.id)===Number(row.id)&&Number(t.thread.thread_id)===Number(thread.thread_id));if(stored)stored.unread_count=Number(row.unread_count)||0;}highlightedMessageId.value=notifiedMessageId;
    if(!thread.readOnly&&!audience.value.length)error.value='The recipients could not be verified. Refresh messages before replying.';
    await nextTick();if(intent!==openIntent||key!==contextKey.value)return;const target=notifiedMessageId&&threadEl.value?.querySelector(`[data-message-id="${Number(notifiedMessageId)}"]`);if(target?.scrollIntoView)target.scrollIntoView({block:'center'});else if(threadEl.value)threadEl.value.scrollTop=threadEl.value.scrollHeight;
  }catch{if(intent===openIntent)error.value='This secure conversation could not be opened. Refresh messages to try again.';}
  finally{if(intent===openIntent)opening.value=false;}
}
async function earlierReplies(){
  const topic=selected.value,intent=openIntent,key=contextKey.value;if(!topic||opening.value)return;opening.value=true;
  try{const batches=await Promise.all(Object.entries(replyCursors.value).map(async([root,beforeId])=>{const {data}=await api.get(`/guardian-portal/messages/${topic.thread.thread_id}`,{params:{...params(topic.thread),parentMessageId:Number(root),beforeId},skipGlobalLoading:true});return {root,messages:raw(data)};}));
    if(intent!==openIntent||key!==contextKey.value)return;const old=batches.flatMap(b=>b.messages);
    for(const b of batches){if(b.messages.length===60)replyCursors.value[b.root]=Math.min(...b.messages.map(m=>Number(m.id)));else delete replyCursors.value[b.root];}
    messages.value=[...messages.value,...old.filter(m=>!messages.value.some(v=>Number(v.id)===Number(m.id)))].sort((a,b)=>Number(a.id)-Number(b.id));
  }catch{if(intent===openIntent)error.value='Earlier replies could not be loaded. Try again.';}finally{if(intent===openIntent)opening.value=false;}
}
async function startSubject(){
  keepDraft();const intent=++openIntent,key=contextKey.value;selected.value=null;messages.value=[];audience.value=[];replyCursors.value={};verifiedTopicKey.value='';highlightedMessageId.value=null;newSubject.value=true;opening.value=true;error.value='';audienceChanged.value=false;audienceReviewed.value=false;restoreDraft();
  try{
    let thread=currentThread.value;
    if(!thread&&context.value?.provider?.id){
      const {data}=await api.post('/guardian-portal/messages/open',{clientId:context.value.client_id,agencyId:context.value.agency_id,serviceId:context.value.service_id},{skipGlobalLoading:true});
      thread={...context.value,thread_id:data.thread_id,participants:data.participants,readOnly:false};
      if(intent===openIntent)openedThread.value={...thread,contextKey:key};
      if(intent===openIntent)emit('refresh');
    }
    if(!thread?.thread_id)throw Error('No current conversation');
    const {data}=await api.get(`/guardian-portal/clients/${thread.client_id}/care-access`,{params:params(thread),skipGlobalLoading:true});
    if(intent!==openIntent||key!==contextKey.value)return;
    audience.value=data.participants||[];
  }catch{if(intent===openIntent){audience.value=[];error.value='A current shared conversation is not available. Use Support.';}}
  finally{if(intent===openIntent)opening.value=false;}
}
async function send(){
  if(sending.value||opening.value||!draft.value.trim()||(newSubject.value&&!subject.value.trim())||!audience.value.length||(audienceChanged.value&&!audienceReviewed.value))return;
  if(!newSubject.value&&!canReply.value)return;
  const thread=newSubject.value?currentThread.value:selected.value?.thread;
  if(!thread?.thread_id||thread.readOnly)return;
  const key=draftKey(),text=draft.value.trim(),enteredSubject=subject.value.trim(),root=newSubject.value?null:selected.value?.id,intent=++sendIntent;
  sending.value=true;error.value='';
  try{
    if(!await sharing.value?.ensureAcknowledged()||key!==draftKey())return;
    const {data}=await api.post(`/guardian-portal/messages/${thread.thread_id}`,{
      clientId:thread.client_id,body:text,...(root?{parentMessageId:root}:{subject:enteredSubject}),
      expectedRecipientUserIds:audience.value.map(p=>Number(p.id)).filter(id=>id>0&&id!==Number(auth.user?.id))
    },{params:params(thread),skipGlobalLoading:true});
    if(intent!==sendIntent||key!==draftKey())return;
    drafts.delete(key);draft.value='';subject.value='';
    if(root){await openTopic({...selected.value,last_reply_at:data?.created_at||new Date().toISOString()});emit('refresh');}
    else{const posted={...data,subject:data?.subject||enteredSubject,thread};topics.value.push(posted);await openTopic(posted);emit('refresh');}
  }catch(e){if(intent===sendIntent&&key===draftKey()){
    const code=e.response?.data?.error?.code;
    if(['FAMILY_SHARED_AUDIENCE_REVIEW_REQUIRED','FAMILY_SHARED_AUDIENCE_CHANGED'].includes(code)){
      audienceChanged.value=true;audienceReviewed.value=false;
      error.value='The eligible recipients changed. Your draft is preserved. Refresh messages and start a new subject with the current recipients; earlier messages keep their original access.';
    }else error.value=e.response?.status<500?e.response?.data?.error?.message||'Message could not be sent. Your draft is preserved.':'Message could not be sent. Your draft is preserved.';
  }}finally{if(intent===sendIntent)sending.value=false;}
}
function chooseContextForNotification(rows){const notification=`${props.initialThreadId||''}:${props.initialMessageId||''}`;const requested=notification!==consumedNotification&&props.threads.find(t=>Number(t.thread_id)===Number(props.initialThreadId));const matching=requested&&rows.find(c=>Number(c.client_id)===Number(requested.client_id)&&Number(c.agency_id)===Number(requested.agency_id)&&(!Number(requested.service_id)||Number(c.service_id)===Number(requested.service_id)));const wanted=matching?.key||(!rows.some(c=>c.key===contextKey.value)?rows[0]?.key||'':contextKey.value);if(wanted!==contextKey.value){keepDraft();contextKey.value=wanted;selected.value=null;newSubject.value=false;openedThread.value=null;draft.value='';subject.value='';}}
watch(contexts,chooseContextForNotification,{immediate:true});
watch(()=>[props.initialThreadId,props.initialMessageId],()=>chooseContextForNotification(contexts.value));
watch(()=>[contextKey.value,props.threads,props.initialThreadId,props.initialMessageId],()=>{if(contextKey.value)loadTopics();else{++loadIntent;++openIntent;topics.value=[];selected.value=null;messages.value=[];}},{immediate:true});
onBeforeUnmount(()=>{++loadIntent;++openIntent;++sendIntent;drafts.clear();});
</script>

<template>
  <section v-if="!unavailable" class="secure-conversations" aria-label="Secure conversations by subject">
    <div class="conversation-tools">
      <label v-if="contexts.length>1 || familyWide">{{ ft("Client and service") }}<select :value="contextKey" @change="changeContext"><option v-for="c in contexts" :key="c.key" :value="c.key">{{ c.client_label }} · {{ c.agency_name || c.organization_name }} · {{ c.service_label || (learning ? 'Learning team' : 'Care team') }}</option></select></label>
      <strong v-else-if="context">{{ context.client_label }}</strong>
      <button type="button" class="new-subject gmsg-row" :disabled="loading||busy||sending||(unavailable||context?.unavailable_reason==='provider_unassigned'||(!currentThread&&!context?.provider?.id))" @click="startSubject">{{ ft("+ New secure subject") }}</button>
    </div>
    <p class="conversation-explanation">{{ ft("Each subject keeps its message and replies together. Everyone listed as eligible can receive new messages; earlier messages retain their original audience.") }}</p>
    <div v-if="context?.participants?.length && !newSubject && !selected" class="current-conversation-audience conversation-audience" role="region" aria-label="Current conversation participants" tabindex="0" aria-live="polite">
      <strong>{{ ft("Who can read and reply to new subjects") }}</strong><ul><li v-for="p in context.participants" :key="p.id">{{ p.name }} · {{ ft(participantRole(p)) }}{{ Number(p.id)===Number(auth.user?.id)?' (you)':'' }}</li></ul>
      <p>{{ ft("Earlier messages retain their original audience.") }}</p>
    </div>
    <p v-if="context?.unavailable_reason==='provider_unassigned'" class="assignment-status" role="status">{{ learning ? 'A tutor must be assigned to this service before secure learning messages are available.' : 'A provider must be assigned to this service before secure messages are available.' }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading||busy" role="status">{{ ft("Loading secure conversations…") }}</p>
    <p v-else-if="!contexts.length && !unavailable">{{ ft(learning ? "No learning conversations are available for this profile yet. You can use Support for account questions." : "No care conversations are available for this profile yet. You can use Support for account questions.") }}</p>
    <div v-else class="conversation-layout" :class="{'is-open':selected||newSubject}">
      <aside class="subjects" aria-label="Message subjects">
        <button v-for="topic in orderedTopics" :key="`${topic.thread.thread_id}:${topic.id}`" type="button" class="subject-row" :class="{active:selected?.id===topic.id}" @click="openTopic(topic)">
          <strong>{{ title(topic) }}</strong><small>{{ ft("Conversation #") }}{{ topic.id }}</small><span v-if="topic.unread_count" class="subject-unread" :aria-label="`${topic.unread_count} unread messages`">{{ ft("Unread ·") }} {{ topic.unread_count }}</span><span>{{ name(topic) }} · {{ when(topic.last_reply_at||topic.created_at) }}</span><small>{{ topic.reply_count||0 }} {{ Number(topic.reply_count)===1?'reply':'replies' }}</small>
        </button>
        <p v-if="!orderedTopics.length&&!busy" class="empty-subjects">{{ ft("No secure subjects yet.") }} <span v-if="context?.unavailable_reason!=='provider_unassigned'">{{ ft("Start a subject to message your") }} {{ ft(teamLabel) }}.</span></p>
        <button v-if="Object.keys(rootCursors).length" type="button" :disabled="olderBusy" @click="olderSubjects">{{ ft(olderBusy?'Loading…':'Older subjects') }}</button>
      </aside>
      <div class="conversation-pane">
        <p v-if="!selected&&!newSubject" class="empty-subjects">{{ ft("Choose a subject to read its messages and replies.") }}</p>
        <template v-else>
          <button class="back-subjects" type="button" @click="keepDraft();selected=null;newSubject=false">{{ ft("← All subjects") }}</button>
          <h3>{{ newSubject?ft('New secure subject'):title(selected) }}</h3>
          <p v-if="opening" role="status">{{ ft("Opening secure conversation…") }}</p>
          <div v-else ref="threadEl" class="subject-messages">
            <button v-if="Object.keys(replyCursors).length" type="button" :disabled="opening" @click="earlierReplies">{{ ft("Earlier replies") }}</button>
            <article v-for="m in messages" :key="m.id" :data-message-id="m.id" class="gmsg-bubble" :class="{mine:Number(m.sender_user_id)===Number(auth.user?.id),'is-notified':Number(m.id)===Number(highlightedMessageId)}">
              <p class="message-meta">{{ name(m) }} · {{ when(m.created_at) }}</p><div class="gmsg-message-text">{{ m.body }}</div>
              <button v-for="a in m.attachments||[]" :key="a.id" type="button" @click="downloadAttachment(a.downloadPath||`/chat/attachments/${a.id}`,a.original_filename)">{{ a.original_filename||'Secure attachment' }}</button>
            </article>
          </div>
          <p v-if="selected?.thread.readOnly" class="retained">{{ ft("These messages retain their original recipients. Start a new subject to reach everyone currently eligible.") }}</p>
          <form v-if="newSubject||canReply" class="subject-composer" @submit.prevent="send">
            <label v-if="newSubject">{{ ft("Subject") }}<input v-model="subject" required maxlength="200" autocomplete="off" :disabled="sending" :placeholder="ft('What is this message about?')" /></label>
            <div class="conversation-audience"><strong>{{ ft("Who can read and reply") }}</strong><ul><li v-for="p in audience" :key="p.id">{{ p.name }} · {{ ft(participantRole(p)) }}{{ Number(p.id)===Number(auth.user?.id)?' (you)':'' }}</li></ul><p>{{ ft("Secure messages are shared with the eligible family portal users listed here and the") }} {{ ft(teamLabel) }}. {{ learning ? 'They do not replace a scheduled tutoring session.' : 'They are not therapy and do not replace a scheduled session.' }}</p></div>
            <FamilySharingNotice ref="sharing" :agency-id="context?.agency_id" :scope-key="`${auth.user?.id}:${contextKey}:${selected?.id||'new'}`" />
            <label>{{ ft("Message") }}<textarea v-model="draft" required rows="4" :disabled="sending" placeholder="Write to everyone listed above…" /></label>
            <button type="submit" :disabled="sending||opening||!draft.trim()||(newSubject&&!subject.trim())||!audience.length||audienceChanged">{{ sending?'Sending…':newSubject?'Send new subject':'Send reply' }}</button>
          </form>
          <details v-if="selected"><summary>{{ ft("Message security & activity") }}</summary><SecureMessageBanner :show-product-brand="false" :thread-id="selected.thread.thread_id" /></details>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.conversation-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.conversation-tools label{display:grid;gap:4px}.conversation-tools select,.subject-composer input,.subject-composer textarea{width:100%;border:1px solid #b8c9db;border-radius:8px;padding:10px;font:inherit;box-sizing:border-box}.new-subject,.subject-composer button[type=submit]{border:0;border-radius:9px;padding:11px 16px;background:#064783;color:white;font-weight:700;cursor:pointer}.new-subject:disabled,button:disabled{opacity:.55;cursor:default}.conversation-explanation,.conversation-audience p,.retained{font-size:13px;line-height:1.6;color:#526980}.conversation-layout{display:grid;grid-template-columns:minmax(190px,32%) minmax(0,1fr);border:1px solid #d6e1ec;border-radius:12px;overflow:hidden;min-height:320px}.subjects{background:#f5f8fc;border-right:1px solid #d6e1ec}.subject-row{display:grid;gap:6px;width:100%;text-align:left;padding:16px;border:0;border-bottom:1px solid #d6e1ec;background:transparent;color:#173653;cursor:pointer;overflow-wrap:anywhere}.subject-row.active{background:#e0ecf9}.subject-row span,.subject-row small,.message-meta{font-size:12px;color:#5a7084}.conversation-pane{padding:20px;min-width:0}.subject-messages{display:flex;flex-direction:column;gap:14px;max-height:55vh;overflow:auto}.gmsg-bubble{background:#eef4fa;border-radius:10px;padding:12px}.gmsg-bubble.mine{background:#e4effc}.gmsg-message-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}.subject-composer{display:grid;gap:14px;margin-top:20px}.subject-composer label{display:grid;gap:6px;font-weight:650;font-size:14px}.conversation-audience{border:1px solid #d6e1ec;border-radius:8px;padding:12px}.conversation-audience ul{padding-left:20px;font-size:13px}.empty-subjects{padding:16px;color:#5a7084;font-size:14px;line-height:1.6}.back-subjects{display:none}details{margin-top:20px;font-size:13px}@media(max-width:700px){.conversation-layout{display:block}.subjects{border-right:0}.is-open .subjects{display:none}.conversation-layout:not(.is-open) .conversation-pane{display:none}.back-subjects{display:block;border:0;background:none;color:#064783;padding:0 0 12px}.conversation-pane{padding:14px}.new-subject{width:auto}.subject-messages{max-height:48vh}}
.gmsg-bubble.is-notified{outline:2px solid #126fb5;outline-offset:2px}
</style>

<style scoped>.current-conversation-audience:focus-visible{outline:3px solid #2467a7;outline-offset:3px}</style>
