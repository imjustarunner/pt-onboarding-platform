<template>
  <Teleport :to="miniTarget || 'body'" :disabled="!mini">
  <section :class="{'therapy-workspace--mini':mini,'therapy-workspace--pip':!!miniTarget,'learning-room':learning}" :style="{'--office-accent':officeAccent(branding)}" class="therapy-workspace">
    <header class="therapy-header">
      <button v-if="mini" class="mini-restore" @click="closeMini">Return to session</button>
      <OfficeBrand v-if="showBrand" class="therapy-brand" :branding="branding" :subtitle="learning ? 'Tutoring session' : null" />
      <span class="therapy-status" :class="{'status-leading':!showBrand}">● {{ startedAt === null ? 'Ready for your guest' : 'In session' }}</span><span class="therapy-clock">{{ elapsed }}</span>
      <button class="danger" @click="$emit('leave-request')">{{ isHost ? 'End session' : 'Leave session' }}</button>
    </header>
    <p v-if="error" role="alert">{{ error }} <button v-if="failedWrite" @click="retryWrite">Retry change</button></p>
    <p v-if="pollError" role="alert">{{ pollError }} <button @click="refresh">Reconnect</button></p>
    <div class="therapy-layout" :class="{'has-share': shared && shared.payload.mode !== 'video', 'side-open':panel}">
      <div class="therapy-main">
        <div class="therapy-video"><slot name="video"><VideoSessionRoom ref="videoRef" v-bind="video" :hide-controls="true" :server-managed-end="true" :defer-alone-warning="deferAloneWarning" :equal-tiles-when-remote="true" @screen-sharing-change="onScreenSharing" :is-host-or-cohost="isHost" :show-layout-controls="true" @connected="$emit('connected')" @disconnected="$emit('disconnected')" @leave-request="$emit('leave-request')" @meeting-ended="$emit('meeting-ended')" /></slot></div>
        <section v-if="learning && (!shared || shared.payload.mode==='video')" class="learning-ready">
          <Pencil :size="28" aria-hidden="true"/><h2>Shared learning space</h2><p>{{isHost?'Open a whiteboard to model a problem or share a worksheet.':'Your tutor will share the lesson here.'}}</p>
          <button v-if="isHost" type="button" class="primary" @click="shareWhiteboard">Open whiteboard</button>
        </section>
        <section v-if="shared && shared.payload.mode !== 'video'" class="therapy-shared" :aria-label="shared.payload.title || 'Shared tool'">
          <div class="shared-heading"><div><small>{{ shared.role==='client' ? 'SHARED BY CLIENT' : 'SHARED IN SESSION' }}</small><h2>{{ shared.payload.title || modeLabel(shared.payload.mode) }}</h2></div><button v-if="canPresent" @click="save('share',{mode:'video'})">Close tool</button></div>
          <SharedTeachingBoard v-if="shared.payload.mode==='whiteboard'" :key="shared.payload.boardId||shared.id" :board-id="Number(shared.payload.boardId||shared.id)" :events="artifacts" :host="isHost" :actor="actor" :save="saveBoard" :busy="saving" :rate-activity="rateActivity" :generate="generateQuestion" :learning-context="learningContext" :materials="materials" :read-material="readMaterial" />
          <template v-else-if="['pdf','book'].includes(shared.payload.mode)"><SharedSessionPdf v-if="shared.payload.document" :key="shared.id" :data-url="shared.payload.document" @page-change="page=$event;markViewed()" /><a v-else :href="shared.payload.url" target="_blank" rel="noopener noreferrer" @click="markViewed">Open shared document ↗</a></template>
          <template v-else-if="shared.payload.mode === 'media'"><p class="muted">Open the video in a separate tab, or use Share screen to watch together.</p><a :href="shared.payload.url" target="_blank" rel="noopener noreferrer" @click="markViewed">Open {{ shared.payload.title || 'shared video' }} ↗</a></template>
          <template v-else-if="['assessment','activity'].includes(shared.payload.mode)">
            <p class="muted">{{ shared.payload.description || (learning?'Show your thinking and share your answers.':'Share how you feel with the people in this session.') }}</p>
            <SessionResponses :responses="sharedResponses" :questions="shared.payload.questions || []" />
            <button v-if="isHost && shared.role === 'provider'" type="button" @click="showOwnResponse=!showOwnResponse">{{ showOwnResponse ? 'Hide my response form' : 'Add my own response' }}</button>
            <form v-if="!isHost || shared.role !== 'provider' || showOwnResponse" class="response-form" @submit.prevent="submitAnswers">
              <h3>{{ shared.payload.mode === 'activity' && !learning ? 'How are you feeling?' : 'Your responses' }}</h3>
              <div v-if="shared.payload.mode==='activity'&&!learning" class="feelings-grid"><button v-for="feeling in feelings" :key="feeling.label" type="button" :aria-pressed="answers[0]===feeling.label" @click="answers[0]=feeling.label"><span>{{ feeling.emoji }}</span>{{ feeling.label }}</button></div>
              <label v-for="(q,i) in shared.payload.questions" :key="i">{{ q }}<textarea v-model="answers[i]" required maxlength="4000" rows="3" /></label>
              <p class="muted">Your responses will be visible to everyone in this session.</p>
              <button class="primary" :disabled="saving">Share my responses</button><p role="status">{{ savedMessage }}</p>
            </form>
          </template>
          <template v-else-if="shared.payload.mode === 'treatment'"><p v-for="goal in shared.payload.goals" :key="goal.id">{{ goal.text }}</p><form v-if="!isHost && identified" @submit.prevent="saveRating"><label>How would you rate your progress? <select v-model.number="rating"><option v-for="n in 10" :key="n" :value="n">{{ n }} / 10</option></select></label><button class="primary">Save my rating</button><p role="status">{{ savedMessage }}</p></form></template>
          <a v-else :href="shared.payload.url" target="_blank" rel="noopener noreferrer" @click="markViewed">Open {{ shared.payload.title || 'shared resource' }} ↗</a>
        </section>
        <nav class="therapy-dock" aria-label="Session controls">
          <button v-if="miniAvailable" :disabled="miniBusy" @click="mini ? closeMini() : openMini()"><Minimize2 :size="21" />{{ mini ? 'Expand' : 'Mini' }}</button>
          <button @click="controls()?.toggleMic()"><Mic :size="21" />{{ controls()?.publishAudio === false ? 'Unmute' : 'Mute' }}</button>
          <button @click="controls()?.toggleCamera()"><Video :size="21" />{{ controls()?.publishVideo === false ? 'Start video' : 'Stop video' }}</button>
          <button @click="controls()?.toggleScreenShare()"><ScreenShare :size="21" />{{ controls()?.sharingScreen ? 'Stop sharing' : 'Share screen' }}</button>
          <button v-if="isHost" @click="shareWhiteboard"><Pencil :size="21" />Whiteboard</button>
          <button v-if="canPresent" @click="togglePanel('tools')"><Link :size="21" />Tools</button>
          <button @click="togglePanel('chat')"><MessageCircle :size="21" />Chat</button>
          <button @click="togglePanel('responses')"><ClipboardList :size="21" />Responses ({{ allResponses.length }})</button>
          <button @click="togglePanel('saved')"><FolderOpen :size="21" />Session files</button>
        </nav>
        <slot />
      </div>
      <aside v-if="panel" class="therapy-side" aria-label="Session tools"><button class="close-panel" aria-label="Close session panel" @click="panel=''">×</button>
        <nav class="side-tabs"><button v-if="canPresent" @click="panel='tools'">Share</button><button @click="panel='chat'">Chat</button><button @click="panel='responses'">Responses</button><button @click="panel='saved'">Saved</button></nav>
        <template v-if="panel==='tools'&&canPresent">
          <h2>Share in this session</h2><p class="muted">Tools and resources for your time together.</p>
          <button v-for="tool in tools.filter(t=>isHost||t.mode!=='whiteboard')" :key="tool.mode" class="tool-card" @click="selectTool(tool.mode)"><component :is="tool.icon" :size="23" /><span><strong>{{ tool.label }}</strong><small>{{ tool.hint }}</small></span><ChevronRight :size="18" /></button>
          <form v-if="draftMode" class="share-form" @submit.prevent="shareDraft">
            <h3>{{ modeLabel(draftMode) }}</h3><label>Title<input v-model="draftTitle" maxlength="150" required /></label>
            <template v-if="['assessment','activity'].includes(draftMode)"><label>Questions (one per line)<textarea v-model="draftQuestions" rows="5" required maxlength="15000" /></label></template>
            <label v-else-if="draftMode==='treatment'">Treatment plan<select v-model="planId" required><option value="">Choose a treatment plan</option><option v-for="plan in treatmentPlans" :key="plan.id" :value="plan.id">{{ plan.title }} · {{ plan.status }}</option></select></label>
            <template v-else><label>HTTPS link<input v-model="draftUrl" type="url" :required="!documentData" /></label><label v-if="['pdf','book'].includes(draftMode)">Or attach a PDF (up to 2 MB)<input type="file" accept="application/pdf" @change="readDocument" /></label></template>
            <button class="primary" :disabled="saving">Share with session</button><button type="button" @click="draftMode=''">Cancel</button>
          </form>
        </template>
        <template v-else-if="panel==='responses'"><h2>Session responses</h2><p v-if="!responseShares.length" class="muted">{{ learning ? 'Shared learning check-ins appear here.' : 'Share an activity or questionnaire to collect responses.' }}</p><section v-for="item in responseShares" :key="item.id"><h3>{{ item.payload.title || modeLabel(item.payload.mode) }}</h3><SessionResponses :questions="item.payload.questions || []" :responses="responsesFor(item.id)" /></section></template>
        <template v-else-if="panel==='saved'"><h2>Session files</h2><p class="muted">Shared content and completed work stay with this session.</p><article v-for="a in savedArtifacts" :key="a.id" class="saved-item"><strong>{{ a.payload.title || modeLabel(a.payload.mode) || a.type }}</strong><small>{{ a.role }} · {{ new Date(a.createdAt).toLocaleTimeString() }}</small><p v-if="a.type==='rating'">Progress: {{ a.payload.value }} / 10</p><p v-for="(answer,i) in a.payload.answers || []" :key="i">{{ answer }}</p><a v-if="a.payload.document" :href="a.payload.document" :download="`${a.payload.title || 'attachment'}.pdf`" @click.prevent="downloadPdf(a)">Download PDF</a><button v-if="a.type==='drawing'" @click="downloadDrawing(a)">Download drawing</button></article></template>
        <template v-else><h2>Chat</h2><div class="therapy-messages" aria-live="polite"><article v-for="m in chats" :key="m.id"><small>{{ m.role }}</small><p>{{ m.payload.text }}</p></article></div><form class="chat-form" @submit.prevent="sendChat"><input v-model="chat" maxlength="4000" placeholder="Type a message…" aria-label="Message" /><button class="primary" :disabled="saving || !chat.trim()">Send</button></form></template>
      </aside>
    </div>
  </section>
  </Teleport>
</template>
<script setup>
import { officeAccent } from '../../utils/officeBranding';
import {teachingPage} from './teachingBoard';
import SharedTeachingBoard from './SharedTeachingBoard.vue';
import OfficeBrand from './OfficeBrand.vue';
import SessionResponses from './SessionResponses.vue';
import { useSessionMiniWindow } from '../../composables/useSessionMiniWindow.js';
import { canUseMeetingMiniMode } from '../../utils/meetingMiniMode.js';
import {defineAsyncComponent,computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {Mic,Video,ScreenShare,Pencil,MessageCircle,FolderOpen,FileText,Gamepad2,Play,Link,BookOpen,ClipboardList,Heart,ChevronRight,Minimize2} from '@lucide/vue';
import VideoSessionRoom from '../video/VideoSessionRoom.vue';
const SharedSessionPdf=defineAsyncComponent(()=>import('./SharedSessionPdf.vue'));
const props=defineProps({video:{type:Object,default:()=>({})},isHost:Boolean,learning:Boolean,generateQuestion:Function,rateActivity:Function,learningContext:Object,materials:Array,readMaterial:Function,deferAloneWarning:Boolean,startedAt:{type:[String,Number,Date],default:undefined},identified:Boolean,showBrand:{type:Boolean,default:true},branding:Object,productName:{type:String,default:'AuricWell'},request:{type:Function,required:true},videoControl:Function});
defineEmits(['connected','disconnected','leave-request','meeting-ended']);
const videoRef=ref(null),artifacts=ref([]),error=ref(''),saving=ref(false),panel=ref(''),chat=ref(''),draftMode=ref(''),draftTitle=ref(''),draftUrl=ref(''),draftQuestions=ref(''),documentData=ref(''),planId=ref(''),treatmentPlans=ref([]),page=ref(1),answers=ref([]),rating=ref(5),savedMessage=ref(''),now=ref(Date.now());
const started=Date.now(),actor=ref(''),pollError=ref(''),failedWrite=ref(null);let poll,clock,polling=false,cursor=0,disposed=false,boardWrites=Promise.resolve();
const controls=()=>props.videoControl?.() || videoRef.value;
const { mini, miniTarget, miniBusy, openMini, closeMini } = useSessionMiniWindow();
const miniAvailable = canUseMeetingMiniMode();
const onScreenSharing = active => { if (active) closeMini(); };
// A counseling session supplies its own video slot. Observe its exposed media
// state too so those rooms restore Mini on remote presentations as well.
watch(() => !!(controls()?.screenSharing || controls()?.videoFullscreen), onScreenSharing);
async function togglePanel(next) {
  if (mini.value) { await closeMini(); panel.value = next; }
  else panel.value = panel.value === next ? '' : next;
}
async function shareWhiteboard() {
  if (mini.value) await closeMini();
  if(shared.value?.payload.mode==='whiteboard')return;
  const last=artifacts.value.filter(a=>a.type==='share'&&a.payload.mode==='whiteboard').at(-1);
  return saveBoard('share',{mode:'whiteboard',title:'Shared whiteboard',...(last?{boardId:last.payload.boardId||last.id}:{})},crypto.randomUUID());
}
const showOwnResponse=ref(false);
const elapsed=computed(()=>{const start=props.startedAt===undefined?started:new Date(props.startedAt).getTime();const s=props.startedAt===null||!Number.isFinite(start)?0:Math.max(0,Math.floor((now.value-start)/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;});
const feelings=[{emoji:'😊',label:'Happy'},{emoji:'😌',label:'Calm'},{emoji:'😔',label:'Sad'},{emoji:'😠',label:'Angry'},{emoji:'😟',label:'Worried'},{emoji:'🌟',label:'Proud'}];
const tools=computed(()=>[{mode:'screen',label:'Share screen',hint:'Show your screen',icon:ScreenShare},{mode:'whiteboard',label:'Whiteboard',hint:'Draw and reflect together',icon:Pencil},{mode:'pdf',label:'Handout / PDF',hint:'Share a worksheet or document',icon:FileText},{mode:'activity',label:props.learning?'Learning check-in':'Feelings explorer',hint:props.learning?'Share a learning check-in':'Share feelings and see each other’s responses',icon:Gamepad2},{mode:'media',label:'YouTube / Video',hint:'Watch a video together',icon:Play},{mode:'book',label:'Book',hint:'Read and discuss together',icon:BookOpen},{mode:'assessment',label:'Assessment / Questionnaire',hint:'Complete and save responses',icon:ClipboardList},{mode:'resource',label:'Resource link',hint:'Share a helpful website',icon:Link},...(props.identified&&props.isHost&&!props.learning?[{mode:'treatment',label:'Treatment plan',hint:'Share goals for client self-rating',icon:Heart}]:[])]);
const modeLabel=mode=>tools.value.find(t=>t.mode===mode)?.label || mode || '';
const shared=computed(()=>artifacts.value.filter(a=>a.type==='share').at(-1));
const canPresent=computed(()=>props.isHost || (!props.learning && shared.value?.payload.mode!=='whiteboard'));
const allResponses=computed(()=>artifacts.value.filter(a=>a.type==='response'));
const responsesFor=id=>allResponses.value.filter(a=>a.payload.shareId===id);
const sharedResponses=computed(()=>responsesFor(shared.value?.id));
const responseShares=computed(()=>artifacts.value.filter(a=>a.type==='share'&&['assessment','activity'].includes(a.payload.mode)).slice().reverse());
const chats=computed(()=>artifacts.value.filter(a=>a.type==='chat'));
const savedArtifacts=computed(()=>artifacts.value.filter(a=>!a.type.startsWith('board_')&&!['chat','download'].includes(a.type)&&!(a.type==='share'&&a.payload.mode==='video')&&(a.type!=='drawing'||!artifacts.value.some(other=>other.type==='drawing'&&other.payload.shareId===a.payload.shareId&&other.id>a.id))).slice().reverse());


watch(()=>shared.value?.id,()=>{page.value=1;answers.value=[];savedMessage.value='';showOwnResponse.value=false;});
async function refresh(){if(polling)return;polling=true;try{let more=true;while(more){const data=await props.request(`?afterId=${cursor}`,{method:'GET'});if(disposed)return;actor.value=data.actor||actor.value;const known=new Set(artifacts.value.map(a=>a.id));artifacts.value.push(...(data.artifacts||[]).filter(a=>!known.has(a.id)));artifacts.value.sort((a,b)=>a.id-b.id);cursor=data.nextCursor||cursor;more=!!data.hasMore;}pollError.value='';}catch(e){pollError.value=e.response?.data?.error?.message||e.message;}finally{polling=false;}}
function saveBoard(type,payload,requestId){boardWrites=boardWrites.then(()=>disposed?false:save(type,payload,requestId));return boardWrites;}
function retryWrite(){const change=failedWrite.value;if(change)return saveBoard(change.type,change.payload,change.requestId);}
async function save(type,payload,requestId){if(saving.value){error.value='Another change is saving. Please retry.';return false;}saving.value=true;error.value='';failedWrite.value=null;try{const result=await props.request('',{method:'POST',body:{type,payload,...(requestId?{requestId}:{})}});if(result.artifact&&!artifacts.value.some(a=>a.id===result.artifact.id)){artifacts.value.push(result.artifact);artifacts.value.sort((a,b)=>a.id-b.id);}return true;}catch(e){error.value=e.response?.data?.error?.message||e.message;if(requestId && (!e.response||e.response.status>=500))failedWrite.value={type,payload,requestId};return false;}finally{saving.value=false;}}
async function sendChat(){if(await save('chat',{text:chat.value.trim()}))chat.value='';}
async function selectTool(mode){if(mode==='screen')return controls()?.toggleScreenShare();if(mode==='whiteboard')return shareWhiteboard();if(mode==='treatment'){try{treatmentPlans.value=(await props.request('/treatment-plans',{method:'GET'})).plans;}catch(e){error.value=e.response?.data?.error?.message||e.message;return;}}draftMode.value=mode;draftTitle.value=mode==='activity'?(props.learning?'Learning check-in':'Feelings explorer'):modeLabel(mode);draftUrl.value='';documentData.value='';draftQuestions.value=mode==='activity'&&props.learning?'What strategy did you try?\nHow could you check your answer?':mode==='activity'?'How are you feeling today?\nWhat helps you feel calm?\nWhat is one thing you can try this week?':'';}
async function shareDraft(){const payload={mode:draftMode.value,title:draftTitle.value};if(draftMode.value==='treatment')payload.planId=Number(planId.value);else if(['assessment','activity'].includes(draftMode.value))payload.questions=draftQuestions.value.split('\n').map(q=>q.trim()).filter(Boolean);else if(documentData.value)payload.document=documentData.value;else payload.url=draftUrl.value;if(await save('share',payload))draftMode.value='';}
function readDocument(e){const f=e.target.files?.[0];if(!f)return;if(f.size>2*1024*1024){error.value='Choose a PDF under 2 MB.';return;}const reader=new FileReader();reader.onload=()=>{documentData.value=reader.result;};reader.readAsDataURL(f);}
async function submitAnswers(){if(await save('response',{shareId:shared.value.id,answers:shared.value.payload.questions.map((_,i)=>answers.value[i]||'')}))savedMessage.value='Your responses are shared and visible to everyone in this session.';}
async function saveRating(){if(await save('rating',{shareId:shared.value.id,value:rating.value}))savedMessage.value='Your rating is saved.';}
function markViewed(){return save('viewed',{shareId:shared.value.id,page:page.value});}
async function downloadPdf(a){if(!await recordDownload(a.id))return;const link=document.createElement('a');link.href=a.payload.document;link.download=`${a.payload.title || 'attachment'}.pdf`;link.click();}
async function recordDownload(artifactId){try{await props.request('/download',{method:'POST',body:{artifactId}});return true;}catch(e){error.value=e.response?.data?.error?.message||e.message;return false;}}
async function downloadDrawing(a){if(!await recordDownload(a.id))return;const strokes=teachingPage(artifacts.value,a.payload.shareId).items.filter(item=>item.type==='drawing'&&item.visible);const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700">${strokes.map(item=>`<polyline fill="none" stroke="${item.payload.color}" stroke-width="4" points="${item.payload.points.map(p=>p.join(',')).join(' ')}"/>`).join('')}</svg>`;const u=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));const link=document.createElement('a');link.href=u;link.download='session-drawing.svg';link.click();URL.revokeObjectURL(u);}
async function pollWorkspace(){if(disposed)return;if(!document.hidden)await refresh();if(!disposed)poll=setTimeout(pollWorkspace,shared.value?.payload.mode==='whiteboard'?1500:3000);}
onMounted(()=>{pollWorkspace();clock=setInterval(()=>now.value=Date.now(),1000);});
onBeforeUnmount(()=>{disposed=true;clearTimeout(poll);clearInterval(clock);});
defineExpose({getTranscriptionStream:()=>controls()?.getTranscriptionStream?.()});
</script>
<style scoped>
.therapy-workspace--mini{position:fixed!important;right:20px;bottom:20px;width:min(440px,calc(100vw - 32px))!important;z-index:10050;padding:12px!important;box-shadow:0 16px 48px #0006}.therapy-workspace--mini .therapy-header{gap:8px;flex-wrap:wrap;margin-bottom:8px}.therapy-workspace--mini .therapy-brand,.therapy-workspace--mini .therapy-status,.therapy-workspace--mini .therapy-clock{display:none}.therapy-workspace--mini .therapy-layout{display:block}.therapy-workspace--mini .therapy-shared,.therapy-workspace--mini .therapy-side{display:none}.therapy-workspace--mini .therapy-video{height:240px;max-height:60vh}.therapy-workspace--mini .therapy-dock{gap:4px;padding:8px 0 0}.therapy-workspace--mini .therapy-dock button{min-width:56px;padding:8px;font-size:11px}.therapy-workspace--pip{position:static!important;width:100%!important;min-height:100vh;border-radius:0!important}.therapy-workspace--pip .therapy-video{height:calc(100vh - 200px)}

.therapy-workspace{box-sizing:border-box;width:100%;min-width:0;container-type:inline-size;color:#17243b;background:#fff;padding:20px;border-radius:20px;font-family:system-ui,sans-serif}.therapy-header{display:flex;gap:20px;align-items:center;margin-bottom:20px}.therapy-brand{display:flex;align-items:center;gap:12px;margin-right:auto}.therapy-brand img{max-width:130px;max-height:45px}.therapy-brand small{display:block;color:#64748b;margin-top:4px}.status-leading{margin-right:auto}.therapy-status{font-size:13px;color:#168568}.therapy-clock{background:#e6f7f0;border-radius:12px;padding:10px 16px;font-variant-numeric:tabular-nums;font-weight:650}.therapy-workspace button{border:1px solid #e3e9f0;background:white;border-radius:12px;padding:10px 14px;color:#26374f;cursor:pointer}.therapy-workspace button:hover{background:#eef6f3}.therapy-workspace button:disabled{opacity:.5;cursor:default}.therapy-workspace button.primary{background:var(--office-accent,#087f5b);color:white}.therapy-workspace button.danger{background:#ff525b;color:white;border:0}.therapy-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:20px}.therapy-layout.side-open{grid-template-columns:minmax(0,1fr) 290px}.close-panel{float:right;font-size:20px;line-height:1;padding:3px 8px!important}.therapy-main{container-type:inline-size}.therapy-main{min-width:0}.therapy-video{height:clamp(280px,56cqw,680px);max-height:68vh;border-radius:16px;overflow:hidden}.has-share .therapy-video{height:260px}.therapy-side{background:white;border:1px solid #e9eef3;border-radius:18px;padding:20px;max-height:80vh;overflow:auto}.therapy-side h2{font-size:23px;letter-spacing:-.04em;margin:20px 0 8px}.muted{color:#708098;font-size:14px;line-height:1.5}.tool-card{display:flex;align-items:center;gap:14px;text-align:left;width:100%;margin:10px 0;min-height:78px}.tool-card>svg:first-child{color:#148b74;flex-shrink:0}.tool-card span{flex:1}.tool-card small{display:block;font-size:12px;color:#708098;margin-top:5px}.therapy-dock{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;padding:18px 0}.therapy-dock button{display:flex;flex-direction:column;align-items:center;gap:9px;border:0;background:#edf3f8;font-size:12px;min-width:76px}.side-tabs{display:flex;gap:4px}.side-tabs button{padding:8px;font-size:12px}.therapy-shared{background:white;border:1px solid #e3e9f0;border-radius:16px;margin-top:14px;padding:18px}.shared-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.shared-heading small{color:#8592a4;font-size:10px;letter-spacing:.12em}.shared-heading h2{margin:6px 0 14px;font-size:21px}.whiteboard{width:100%;background:#fff;touch-action:none;border:1px solid #e2e8f0;border-radius:12px}.draw-controls{display:flex;align-items:center;gap:16px;font-size:12px;color:#64748b;margin:8px 0}.shared-document{width:100%;height:540px}.therapy-shared iframe,.therapy-shared video{width:100%;aspect-ratio:16/9;border:0}.page-controls{display:flex;justify-content:center;align-items:center;gap:14px;margin-top:10px}.therapy-workspace label{display:flex;flex-direction:column;gap:8px;font-size:13px;margin:12px 0}.therapy-workspace input,.therapy-workspace textarea,.therapy-workspace select{box-sizing:border-box;width:100%;border:1px solid #dce5eb;border-radius:9px;padding:10px;background:white;color:#17243b;font:inherit}.therapy-workspace input[type=color]{width:50px;padding:3px}.therapy-messages article{padding:12px;background:#f1f6fa;border-radius:12px;margin:12px 0;overflow-wrap:anywhere}.therapy-messages small,.saved-item small{color:#738297;font-size:11px;display:block}.therapy-messages p{margin:5px 0;font-size:14px}.chat-form{display:flex;gap:8px;position:sticky;bottom:0;background:white;padding:10px 0}.saved-item{padding:14px 0;border-bottom:1px solid #e9eef3;font-size:13px;overflow-wrap:anywhere}[role=alert]{color:#ad2434}@container(min-width:1300px){.has-share .therapy-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.has-share .therapy-video{height:65vh}.has-share .therapy-shared{margin:0}.has-share .therapy-dock{grid-column:1/-1}}@container(max-width:1050px){.therapy-layout.side-open{grid-template-columns:1fr}.therapy-header{flex-wrap:wrap}.therapy-side{max-height:420px}}@media(max-width:850px){.therapy-layout.side-open{grid-template-columns:1fr}.therapy-header{gap:8px;flex-wrap:wrap}.status-leading{margin-right:auto}.therapy-status{display:none}.therapy-workspace{padding:12px}.therapy-side{max-height:none}.therapy-video{height:55vh}.therapy-dock{gap:6px}.therapy-dock button{min-width:64px;padding:9px}.shared-document{height:420px}}
.feelings-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.feelings-grid button{background:#ecf8f2;border:2px solid transparent;display:flex;align-items:center;flex-direction:column;gap:12px;padding:22px 12px;font-weight:600}.feelings-grid button:nth-child(2n){background:#edf4fc}.feelings-grid button:nth-child(3n){background:#fff3e4}.feelings-grid button[aria-pressed=true]{border-color:#087f5b}.feelings-grid span{font-size:34px}
.learning-room:not(.therapy-workspace--mini){background:#f1f5f8;border:1px solid #c9d7df;border-radius:14px;padding:10px}
.learning-room .therapy-header{background:#152d49;border-radius:10px;color:white;padding:8px 12px;margin:0 0 8px;align-items:center}.learning-room .therapy-status{color:#acedd9}.learning-room .therapy-clock{color:white}
.learning-room .therapy-main{display:grid;grid-template-columns:minmax(145px,22%) minmax(0,1fr);gap:8px;align-items:start}.learning-room .therapy-main>.therapy-video{height:clamp(160px,27vh,300px);max-height:none!important;border-radius:10px;overflow:hidden}
.learning-room .therapy-shared,.learning-ready{margin:0;padding:12px;background:white;border-radius:10px;border:1px solid #d5e0e6;min-width:0}.learning-ready{display:grid;min-height:32vh;align-content:center;justify-items:center;text-align:center;background:radial-gradient(#d6e1e8 1px,transparent 1px) white;background-size:17px 17px}
.learning-room .therapy-dock{grid-column:1/-1;background:#172f49;border-radius:10px;gap:5px;padding:5px}.learning-room .therapy-dock button{background:transparent;color:white;font-size:12px;min-width:48px;gap:3px;padding:5px 9px}.learning-room .shared-heading h2{font-size:1.1rem;margin:2px 0}
@container(max-width:660px){.learning-room .therapy-main{grid-template-columns:minmax(0,1fr)}.learning-room .therapy-main>.therapy-video{height:150px}.learning-room .therapy-dock{justify-content:flex-start}}
.learning-room .therapy-clock{color:#163d39}.learning-room .therapy-status{color:#b9efda}
@container(max-width:660px){.learning-room .therapy-main>.therapy-video{height:clamp(85px,16vh,135px)}.learning-room .therapy-shared{padding:8px}}
</style>
