<template>
  <div v-if="enabled" class="tng">
    <aside class="tng-history" aria-label="Saved generator notes">
      <div class="tng-history__head"><h2>Saved generator notes</h2><button type="button" :disabled="busy" @click="newNote">+ New note</button></div>
      <label class="tng-sr" for="tng-search">Search saved notes</label>
      <input id="tng-search" v-model="historySearch" placeholder="Search client name or date…" />
      <p v-if="loadingHistory" role="status">Loading saved notes…</p>
      <p v-else-if="!filteredNotes.length" class="tng-muted">{{ historySearch ? 'No matching notes.' : 'Your generated notes will appear here by client name and date.' }}</p>
      <button v-for="note in filteredNotes" :key="note.id" type="button" class="tng-history__note" :class="{active:Number(note.id)===Number(noteId)}" :disabled="busy" @click="openNote(note)">
        <strong>{{ note.clientName || 'Unlinked note' }}</strong><span>{{ note.dateOfService || 'No date' }}</span><small>{{ note.toolName || toolName(note.toolId) }}</small>
      </button>
    </aside>
    <main class="tng-main">
      <p v-if="loading" role="status">Loading generators…</p>
      <p v-if="error" class="tng-error" role="alert">{{ error }}</p>
      <template v-if="!loading && choosing">
        <header class="tng-heading"><span>STEP 1</span><h2>Choose your note / generator type</h2><p>All generator types are available here, including H0004. Choose one to start an unlinked note.</p></header>
        <label class="tng-sr" for="tng-tools-search">Find a generator</label>
        <input id="tng-tools-search" v-model="toolSearch" placeholder="Find a code or generator, e.g. H0004…" />
        <div class="tng-tools">
          <button v-for="tool in filteredTools" :key="tool.id" type="button" :data-tool-id="tool.id" @click="chooseTool(tool)"><span v-if="tool.serviceCodes?.length" class="tng-code">{{ tool.serviceCodes.join(' / ') }}</span><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small><b>Use this generator →</b></button>
        </div>
        <p v-if="!filteredTools.length" class="tng-muted">No generators match that search.</p>
      </template>
      <template v-else-if="!loading && selectedTool">
        <header class="tng-editor-head"><div><span class="tng-code">{{ selectedTool.serviceCodes?.join(' / ') || 'Note generator' }}</span><h2>{{ selectedTool.name }}</h2></div><button type="button" :disabled="busy" @click="changeGenerator">Change generator</button></header>
        <form @submit.prevent="generate">
          <fieldset :disabled="busy">
            <div class="tng-fields">
              <label>Client’s name<input v-model="clientName" name="quick-copy-client-name" maxlength="200" autocomplete="off" placeholder="Client name for your saved note" required /></label>
              <label>Date of service<input v-model="dateOfService" name="quick-copy-date" type="date" required /></label>
              <label v-if="selectedTool.serviceCodes?.length>1">Code<select v-model="serviceCode" name="quick-copy-code"><option v-for="code in selectedTool.serviceCodes" :key="code" :value="code">{{ code }}</option></select></label>
            </div>
            <label for="tng-input">Type, paste, or dictate your notes</label>
            <textarea id="tng-input" v-model="inputText" name="quick-copy-input" rows="9" maxlength="12000" placeholder="Describe what happened, what you worked on, the client’s response, and what comes next. The selected generator will organize your text." required />
            <div class="tng-dictation"><button v-if="!recording" type="button" :disabled="!dictationSupported || transcribing" @click="startDictation">{{ transcribing ? 'Transcribing…' : '🎙 Dictate your notes' }}</button><button v-else type="button" class="tng-recording" @click="stopDictation">■ Stop dictation</button><span v-if="recording" role="status">Recording your dictation…</span><span v-else class="tng-muted">Dictate your own notes, then review the transcript.</span></div>
            <div class="tng-actions"><button type="submit" class="tng-primary" :disabled="!canGenerate">{{ generating ? 'Generating…' : 'Generate note' }}</button><span class="tng-muted">Saved by client name and date for future copying.</span></div>
          </fieldset>
        </form>
        <section v-if="panels.length" class="tng-output" aria-label="Quick copy generated note">
          <header class="tng-output-head"><div><h2>Review and quick copy</h2><p>{{ clientName }} · {{ dateOfService }}</p></div><div><button type="button" :disabled="!dirty || busy" @click="saveEdits">{{ saving ? 'Saving…' : 'Save changes' }}</button><button type="button" @click="copyAll">{{ copied==='__all' ? 'Copied' : 'Copy all sections' }}</button></div></header>
          <p class="tng-save-status" role="status">{{ dirty ? 'Changes awaiting save…' : 'Saved. Reopen this note from Saved generator notes whenever you need to copy it.' }}</p>
          <article v-for="panel in panels" :key="panel.id" class="tng-section"><div><h3>{{ panel.title }}</h3><button type="button" :disabled="!sectionText[panel.id]?.trim()" @click="copySection(panel)">{{ copied===panel.id ? 'Copied' : 'Copy' }}</button></div><textarea v-model="sectionText[panel.id]" :aria-label="panel.title" rows="5" :disabled="generating" @input="copied=''" /></article>
          <p class="tng-copy-status" role="status">{{ copyStatus }}</p>
        </section>
      </template>
    </main>
  </div>
  <p v-else-if="!loading" class="tng-unavailable" role="status">{{ error || 'The temporary Therapy Notes generator is disabled for this organization.' }}</p>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { buildDisplaySections, extractSections, todayIsoDate } from '../../utils/noteAidUiHelpers.js';

const props = defineProps({ agency: { type: Object, required: true } });
const enabled=ref(true), loading=ref(true), loadingHistory=ref(false), opening=ref(false), generating=ref(false), saving=ref(false), recording=ref(false), transcribing=ref(false);
const tools=ref([]), notes=ref([]), toolSearch=ref(''), historySearch=ref(''), choosing=ref(true), selectedTool=ref(null), serviceCode=ref('');
const clientName=ref(''), dateOfService=ref(todayIsoDate()), inputText=ref(''), noteId=ref(null), panels=ref([]), sectionText=ref({});
const error=ref(''), dirty=ref(false), copied=ref(''), copyStatus=ref('');
const controller=new AbortController();
let hydrating=false, saveTimer=null, recorder=null, stream=null, disposed=false, editVersion=0, pendingSave=null;
const busy=computed(()=>opening.value||generating.value||saving.value||transcribing.value);
const dictationSupported=typeof navigator!=='undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder!=='undefined';
const canGenerate=computed(()=>!busy.value&&!recording.value&&!!selectedTool.value&&!!clientName.value.trim()&&!!dateOfService.value&&!!inputText.value.trim());
const filteredTools=computed(()=>{const query=toolSearch.value.trim().toLowerCase();return tools.value.filter(tool=>[tool.name,tool.description,...(tool.serviceCodes||[])].join(' ').toLowerCase().includes(query));});
const filteredNotes=computed(()=>{const query=historySearch.value.trim().toLowerCase();return notes.value.filter(note=>`${note.clientName} ${note.dateOfService}`.toLowerCase().includes(query));});
const toolName=id=>tools.value.find(tool=>tool.id===id)?.name||'Note generator';
const requestOptions=()=>({skipGlobalLoading:true,signal:controller.signal});
const message=failure=>failure?.response?.data?.error?.message||failure?.message||'Please try again.';

onMounted(async()=>{
  window.addEventListener('beforeunload',protectPendingWork);
  try {
    const {data}=await api.get('/clinical-notes/quick-copy/catalog',{...requestOptions(),params:{agencyId:props.agency.id}});
    enabled.value=data?.enabled===true;
    tools.value=data?.tools||[];
    if(enabled.value)await loadHistory();
  }catch(failure){if(!disposed)error.value=message(failure);}
  finally{loading.value=false;}
});
async function loadHistory(){
  loadingHistory.value=true;
  try{const {data}=await api.get('/clinical-notes/quick-copy/recent',{...requestOptions(),params:{agencyId:props.agency.id}});if(!disposed)notes.value=data?.notes||[];}
  catch(failure){if(!disposed)error.value=message(failure);}
  finally{loadingHistory.value=false;}
}
watch([clientName,dateOfService,inputText,sectionText],()=>{
  if(hydrating||!noteId.value)return;
  dirty.value=true;editVersion+=1;clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{if(!busy.value&&!recording.value)saveEdits();},1200);
},{deep:true});
async function saveEdits(){
  clearTimeout(saveTimer);
  if(!dirty.value||!noteId.value)return true;
  if(!clientName.value.trim()||!dateOfService.value){error.value='Enter the client’s name and date of service to save your changes.';return false;}
  if(saving.value){await pendingSave?.catch(()=>{});return !dirty.value||saveEdits();}
  const version=editVersion;
  saving.value=true;
  try{
    pendingSave=api.patch(`/clinical-notes/quick-copy/notes/${noteId.value}`,{agencyId:props.agency.id,clientName:clientName.value.trim(),dateOfService:dateOfService.value,inputText:inputText.value,sections:{...sectionText.value}},requestOptions());
    const {data}=await pendingSave;
    if(disposed)return false;
    if(editVersion===version)dirty.value=false;
    const saved=data?.note;
    notes.value=notes.value.map(note=>Number(note.id)===Number(noteId.value)?{...note,...saved,clientName:clientName.value,dateOfService:dateOfService.value}:note);
    return true;
  }catch(failure){if(!disposed)error.value=`Changes could not be saved. ${message(failure)}`;return false;}
  finally{saving.value=false;pendingSave=null;if(editVersion!==version&&dirty.value&&!disposed)saveTimer=setTimeout(saveEdits,1200);}
}
async function setNote(note){
  hydrating=true;
  noteId.value=note.id||note.quickCopyNoteId||null;
  clientName.value=note.clientName||'';dateOfService.value=note.dateOfService||todayIsoDate();inputText.value=note.inputText||'';
  selectedTool.value=tools.value.find(tool=>tool.id===(note.toolId||note.outputJson?.meta?.toolId))||{id:note.toolId,name:note.toolName||'Saved generator',serviceCodes:[]};
  serviceCode.value=note.serviceCode||note.outputJson?.meta?.serviceCode||selectedTool.value.serviceCodes?.[0]||'';
  panels.value=buildDisplaySections(extractSections(note.outputJson));sectionText.value=Object.fromEntries(panels.value.map(panel=>[panel.id,panel.text]));
  choosing.value=false;dirty.value=false;copied.value='';copyStatus.value='';
  await nextTick();hydrating=false;
}
async function openNote(note){
  if(recording.value||busy.value||!await saveEdits())return;
  error.value='';opening.value=true;
  try{const {data}=await api.get(`/clinical-notes/quick-copy/notes/${note.id}`,{...requestOptions(),params:{agencyId:props.agency.id}});if(!disposed)await setNote(data?.note||data);}
  catch(failure){if(!disposed)error.value=message(failure);}
  finally{opening.value=false;}
}
async function newNote(){
  if(recording.value||busy.value||!await saveEdits())return;
  hydrating=true;noteId.value=null;clientName.value='';dateOfService.value=todayIsoDate();inputText.value='';panels.value=[];sectionText.value={};selectedTool.value=null;serviceCode.value='';choosing.value=true;dirty.value=false;error.value='';copied.value='';copyStatus.value='';
  await nextTick();hydrating=false;
}
async function chooseTool(tool){if(selectedTool.value&&selectedTool.value.id!==tool.id){noteId.value=null;panels.value=[];sectionText.value={};}selectedTool.value=tool;serviceCode.value=tool.serviceCodes?.[0]||'';choosing.value=false;await nextTick();document.querySelector('[name="quick-copy-client-name"]')?.focus();}
async function changeGenerator(){if(recording.value||!await saveEdits())return;choosing.value=true;}
async function generate(){
  if(!canGenerate.value)return;
  clearTimeout(saveTimer);generating.value=true;error.value='';
  try{
    const payload={agencyId:props.agency.id,toolId:selectedTool.value.id,clientName:clientName.value.trim(),dateOfService:dateOfService.value,inputText:inputText.value.trim(),...(serviceCode.value?{serviceCode:serviceCode.value}:{}),...(noteId.value?{quickCopyNoteId:noteId.value}:{})};
    const {data}=await api.post('/clinical-notes/quick-copy/generate',payload,requestOptions());
    if(disposed)return;
    await setNote(data?.note||{id:data?.quickCopyNoteId||data?.draftId,clientName:payload.clientName,dateOfService:payload.dateOfService,inputText:payload.inputText,toolId:payload.toolId,serviceCode:payload.serviceCode,outputJson:data?.outputJson});
    await loadHistory();
  }catch(failure){if(!disposed)error.value=message(failure);}
  finally{generating.value=false;}
}
async function startDictation(){
  if(!dictationSupported||busy.value)return;
  error.value='';
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(disposed){stream.getTracks().forEach(track=>track.stop());return;}
    recorder=new MediaRecorder(stream);const chunks=[];
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onstop=async()=>{
      stream?.getTracks().forEach(track=>track.stop());recording.value=false;
      if(disposed)return;
      transcribing.value=true;
      try{
        const audio=new Blob(chunks,{type:recorder.mimeType||'audio/webm'}), form=new FormData();
        form.append('agencyId',String(props.agency.id));form.append('recordingPurpose','dictation');form.append('audio',audio,'dictation.webm');
        const {data}=await api.post('/clinical-notes/quick-copy/transcribe',form,requestOptions());
        if(!disposed){const text=String(data?.text||data?.transcript||'').trim();if(!text)throw new Error('No dictation was detected. Please try again.');inputText.value=[inputText.value.trim(),text].filter(Boolean).join('\n\n');}
      }catch(failure){if(!disposed)error.value=message(failure);}
      finally{transcribing.value=false;}
    };
    recorder.start();recording.value=true;
  }catch(failure){stream?.getTracks().forEach(track=>track.stop());error.value=`Microphone unavailable. ${message(failure)}`;}
}
function stopDictation(){if(recorder?.state==='recording')recorder.stop();}
async function copy(text,id,label){try{await navigator.clipboard.writeText(text);copied.value=id;copyStatus.value=`${label} copied.`;}catch{copied.value='';copyStatus.value='Select the text and copy it manually; the clipboard is unavailable.';}}
function copySection(panel){return copy(sectionText.value[panel.id]||'',panel.id,panel.title);}
function copyAll(){return copy(panels.value.map(panel=>`${panel.title}\n${sectionText.value[panel.id]||''}`).join('\n\n'),'__all','All sections');}
async function prepareToLeave(){if(recording.value||generating.value||transcribing.value){error.value='Finish dictation or generation before leaving this note.';return false;}return saveEdits();}
function protectPendingWork(event){if(dirty.value||saving.value||recording.value||generating.value||transcribing.value){event.preventDefault();event.returnValue='';}}
defineExpose({prepareToLeave});
onBeforeUnmount(()=>{disposed=true;window.removeEventListener('beforeunload',protectPendingWork);clearTimeout(saveTimer);controller.abort();stopDictation();stream?.getTracks().forEach(track=>track.stop());});
</script>

<style scoped>
.tng{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px;max-width:1400px;margin:auto;color:#203d56}.tng-history,.tng-main{background:white;border:1px solid #d6e0e9;border-radius:14px;padding:22px;min-width:0}.tng-history{align-self:start;max-height:80vh;overflow:auto}.tng-history__head,.tng-editor-head,.tng-output-head,.tng-section>div{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.tng h2{font-size:1.1rem;line-height:1.4;margin:0 0 10px}.tng-history h2{font-size:1rem}.tng p{line-height:1.6}.tng button{font:inherit;font-size:.85rem;background:white;color:#245c8b;border:1px solid #b9cedf;border-radius:8px;padding:10px 14px;cursor:pointer}.tng button:disabled{opacity:.55;cursor:not-allowed}.tng input,.tng select,.tng textarea{box-sizing:border-box;display:block;width:100%;padding:12px;margin:8px 0 18px;border:1px solid #b6c8d6;border-radius:8px;background:white;color:#203d56;font:inherit;line-height:1.5}.tng textarea{resize:vertical}.tng label{font-size:.9rem;font-weight:600;line-height:1.5}.tng-history__note{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;margin-top:10px}.tng-history__note.active{background:#edf5ff;border-color:#2367a4}.tng-history__note span{font-size:.8rem}.tng-history__note small{font-size:.75rem;color:#657c90}.tng-heading>span,.tng-code{font-size:.75rem;font-weight:700;color:#8b641c}.tng-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.tng-tools button{display:flex;flex-direction:column;gap:10px;text-align:left;padding:18px}.tng-tools button:hover{background:#f4f8ff;border-color:#2367a4}.tng-tools strong{font-size:.95rem;line-height:1.5}.tng-tools small{font-size:.8rem;color:#61758b;line-height:1.55}.tng-tools b{font-size:.8rem;margin-top:auto}.tng-fields{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:20px}.tng fieldset{border:0;padding:0;margin:0;min-width:0}.tng-dictation,.tng-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:12px 0 22px}.tng .tng-primary{background:#2367a4;border-color:#2367a4;color:white;font-weight:700;padding:13px 24px}.tng .tng-recording{color:#ad2525;border-color:#ad2525}.tng-muted,.tng-save-status{color:#64798d;font-size:.82rem;line-height:1.6}.tng-error{color:#a92d28;padding:12px;background:#fff4f2;border-radius:8px}.tng-output{border-top:1px solid #d6e0e9;margin-top:20px;padding-top:22px}.tng-output-head>div:last-child{display:flex;gap:8px;flex-wrap:wrap}.tng-section{padding:16px;margin-top:16px;border:1px solid #d6e0e9;border-radius:10px;background:#fafcfe}.tng-section h3{font-size:.95rem;margin:0}.tng-section textarea{margin-bottom:0}.tng-copy-status{min-height:1.5em;font-size:.85rem}.tng-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.tng-unavailable{padding:24px;background:white;border-radius:12px}
@media(max-width:1000px){.tng{grid-template-columns:220px minmax(0,1fr);gap:16px}.tng-tools{grid-template-columns:1fr}.tng-history,.tng-main{padding:16px}}@media(max-width:700px){.tng{display:flex;flex-direction:column-reverse}.tng-history{width:100%;box-sizing:border-box;max-height:360px}.tng-fields{grid-template-columns:1fr}.tng-main{padding:16px}}
</style>
