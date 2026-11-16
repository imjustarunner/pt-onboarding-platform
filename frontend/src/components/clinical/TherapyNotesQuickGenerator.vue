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
    <main ref="mainEl" class="tng-main">
      <p v-if="loading" role="status">Loading generators…</p>
      <p v-if="error" class="tng-error" role="alert">{{ error }}</p>
      <template v-if="!loading && choosing">
        <header class="tng-heading"><span>YOUR NOTE STARTS HERE</span><h2>Choose a generator</h2><p>Pick your note type, add your notes, and copy the sections you need.</p></header>
        <label class="tng-sr" for="tng-tools-search">Find a generator</label>
        <div class="tng-catalog-toolbar"><input id="tng-tools-search" ref="searchEl" v-model="toolSearch" placeholder="Search a code or generator…" /><span>{{ visibleToolCount }} generators</span></div>
        <nav class="tng-categories" aria-label="Generator categories"><button type="button" :aria-pressed="categoryId==='all'" @click="categoryId='all'">All</button><button v-for="category in availableCategories" :key="category.id" type="button" :aria-pressed="categoryId===category.id" @click="categoryId=category.id">{{ category.label }}</button></nav>
        <section v-for="category in visibleCategories" :key="category.id" class="tng-family" :aria-label="category.label">
          <header><h3>{{ category.label }}</h3><span>{{ category.tools.length }}</span></header>
          <div class="tng-tools">
            <article v-for="tool in category.tools" :key="tool.id" class="tng-tool-card">
              <div class="tng-tool-codes"><div v-for="code in tool.serviceCodes" :key="code" class="tng-code-pair"><span class="tng-code">{{ code }}</span><ServiceInformation presentation="button" :service-code="code" :agency-id="agency.id" :api-client="api" reference-base-path="/clinical-notes/quick-copy/service-reference" /></div><span v-if="!tool.serviceCodes?.length" class="tng-code tng-code--plain">{{ tool.name.toLowerCase().includes('plan') ? 'Treatment plan' : 'Note generator' }}</span></div>
              <button type="button" class="tng-tool-select" :data-tool-id="tool.id" @click="chooseTool(tool)"><strong>{{ tool.name }}</strong><span aria-hidden="true">↗</span></button>
              <details v-if="!tool.serviceCodes?.length" class="tng-tool-about"><summary :aria-label="`Information about ${tool.name}`">ⓘ About this generator</summary><p>{{ tool.description }}</p></details>
            </article>
          </div>
        </section>
        <p v-if="!visibleCategories.length" class="tng-muted">No generators match that search.</p>
      </template>
      <template v-else-if="!loading && selectedTool">
        <header class="tng-editor-head"><div><span class="tng-code">{{ selectedTool.serviceCodes?.join(' / ') || 'Note generator' }}</span><h2>{{ selectedTool.name }}</h2></div><div class="tng-editor-tools"><ServiceInformation v-if="serviceCode" presentation="button" :service-code="serviceCode" :agency-id="agency.id" :api-client="api" reference-base-path="/clinical-notes/quick-copy/service-reference" /><button type="button" :disabled="busy" @click="changeGenerator">Change generator</button></div></header>
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
        <div v-if="generating" class="tng-generating" role="status"><span class="tng-spinner" aria-hidden="true" /><div><strong>Creating your note…</strong><p>We’re organizing your notes into {{ selectedTool.name }} sections. This can take a little while.</p></div></div>
        <section v-if="panels.length" class="tng-output" aria-label="Quick copy generated note">
          <header class="tng-output-head"><div><h2>Review and quick copy</h2><p>{{ clientName }} · {{ dateOfService }}</p></div><div><button type="button" :disabled="!dirty || busy" @click="saveEdits">{{ saving ? 'Saving…' : 'Save changes' }}</button><button type="button" @click="copyAll">{{ copied==='__all' ? 'Copied' : 'Copy all sections' }}</button></div></header>
          <p class="tng-save-status" role="status">{{ dirty ? 'Changes awaiting save…' : 'Saved. Reopen this note from Saved generator notes whenever you need to copy it.' }}</p>
          <article v-for="panel in panels" :key="panel.id" class="tng-section"><div><h3>{{ panel.title }}</h3><button type="button" :disabled="!sectionText[panel.id]?.trim()" @click="copySection(panel)">{{ copied===panel.id ? 'Copied' : 'Copy' }}</button></div><textarea v-model="sectionText[panel.id]" :aria-label="panel.title" rows="5" :disabled="generating" @input="copied=''" /></article>
          <p class="tng-copy-status" role="status">{{ copyStatus }}</p>
          <footer class="tng-output-footer"><div><strong>Ready for the next note?</strong><p>This note is saved in your list for future copying.</p></div><button type="button" class="tng-primary" :disabled="busy || recording" data-testid="new-note-bottom" @click="newNote">+ New note</button></footer>
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
import ServiceInformation from '../notes/ServiceInformation.vue';
import { categorizeTherapyGenerators, THERAPY_GENERATOR_CATEGORIES } from '../../config/therapyNotesGeneratorCatalog.js';

const props = defineProps({ agency: { type: Object, required: true } });
const enabled=ref(true), loading=ref(true), loadingHistory=ref(false), opening=ref(false), generating=ref(false), saving=ref(false), recording=ref(false), transcribing=ref(false);
const tools=ref([]), notes=ref([]), toolSearch=ref(''), historySearch=ref(''), choosing=ref(true), selectedTool=ref(null), serviceCode=ref('');
const clientName=ref(''), dateOfService=ref(todayIsoDate()), inputText=ref(''), noteId=ref(null), panels=ref([]), sectionText=ref({});
const error=ref(''), dirty=ref(false), copied=ref(''), copyStatus=ref('');
const mainEl=ref(null), searchEl=ref(null), categoryId=ref('all');
const controller=new AbortController();
let hydrating=false, saveTimer=null, recorder=null, stream=null, disposed=false, editVersion=0, pendingSave=null;
const busy=computed(()=>opening.value||generating.value||saving.value||transcribing.value);
const dictationSupported=typeof navigator!=='undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder!=='undefined';
const canGenerate=computed(()=>!busy.value&&!recording.value&&!!selectedTool.value&&!!clientName.value.trim()&&!!dateOfService.value&&!!inputText.value.trim());
const filteredTools=computed(()=>{const query=toolSearch.value.trim().toLowerCase();return tools.value.filter(tool=>[tool.name,tool.description,...(tool.serviceCodes||[])].join(' ').toLowerCase().includes(query));});
const availableCategories=computed(()=>THERAPY_GENERATOR_CATEGORIES.filter(category=>tools.value.some(tool=>tool.categoryId===category.id)));
const visibleCategories=computed(()=>availableCategories.value.filter(category=>categoryId.value==='all'||categoryId.value===category.id).map(category=>({...category,tools:filteredTools.value.filter(tool=>tool.categoryId===category.id)})).filter(category=>category.tools.length));
const visibleToolCount=computed(()=>visibleCategories.value.reduce((total,category)=>total+category.tools.length,0));
const filteredNotes=computed(()=>{const query=historySearch.value.trim().toLowerCase();return notes.value.filter(note=>`${note.clientName} ${note.dateOfService}`.toLowerCase().includes(query));});
const toolName=id=>tools.value.find(tool=>tool.id===id)?.name||'Note generator';
const requestOptions=()=>({skipGlobalLoading:true,signal:controller.signal});
const message=failure=>failure?.response?.data?.error?.message||failure?.message||'Please try again.';

onMounted(async()=>{
  window.addEventListener('beforeunload',protectPendingWork);
  try {
    const {data}=await api.get('/clinical-notes/quick-copy/catalog',{...requestOptions(),params:{agencyId:props.agency.id}});
    enabled.value=data?.enabled===true;
    tools.value=categorizeTherapyGenerators(data?.tools||[]);
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
  categoryId.value='all';toolSearch.value='';
  await nextTick();hydrating=false;
  mainEl.value?.scrollIntoView?.({behavior:'smooth',block:'start'});searchEl.value?.focus({preventScroll:true});
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
.tng{display:grid;grid-template-columns:244px minmax(0,1fr);gap:20px;width:100%;color:#213d56;--tng-navy:#193f64;--tng-gold:#a77d2d}
.tng-history,.tng-main{min-width:0;border:1px solid #dae4ed;border-radius:14px;background:#fff}
.tng-main{padding:24px}.tng-history{align-self:start;position:sticky;top:100px;padding:18px;max-height:calc(100vh - 124px);overflow:auto}
.tng-history__head,.tng-editor-head,.tng-output-head,.tng-section>div,.tng-output-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.tng h2{font-size:1.18rem;line-height:1.4;margin:0 0 8px;color:var(--tng-navy)}.tng-history h2{font-size:.88rem;margin:0}.tng p{line-height:1.6}
.tng button{font:inherit;font-size:.8rem;background:#fff;color:#285a83;border:1px solid #c9d8e4;border-radius:8px;padding:9px 13px;cursor:pointer;transition:background .15s,border-color .15s}
.tng button:hover:not(:disabled){border-color:#6e94b7;background:#f2f7fc}.tng button:disabled{opacity:.55;cursor:not-allowed}.tng button:focus-visible,.tng input:focus-visible,.tng textarea:focus-visible,.tng select:focus-visible{outline:3px solid #b6cfe4;outline-offset:2px}
.tng input,.tng select,.tng textarea{box-sizing:border-box;display:block;width:100%;padding:10px 12px;margin:7px 0 16px;border:1px solid #c4d3df;border-radius:8px;background:#fff;color:#213d56;font:inherit;font-size:.9rem;line-height:1.55}.tng textarea{resize:vertical}.tng label{font-size:.82rem;font-weight:650;line-height:1.5}
.tng-history__head button{padding:7px 9px;font-size:.75rem}.tng-history input{font-size:.8rem;margin-top:16px}.tng .tng-history__note{display:flex;flex-direction:column;gap:5px;text-align:left;width:100%;margin-top:9px;padding:12px;border-color:#e0e8ef;background:#fbfcfe}.tng-history__note.active{background:#edf5fc;border-left:3px solid var(--tng-gold)}.tng-history__note strong{font-size:.82rem}.tng-history__note span,.tng-history__note small{font-size:.72rem;color:#65798c}
.tng-heading>span{font-size:.67rem;letter-spacing:.1em;font-weight:750;color:var(--tng-gold)}.tng-heading h2{margin-top:7px}.tng-heading p{margin:0;color:#6b7d8e;font-size:.87rem}
.tng-catalog-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:20px 0 14px}.tng-catalog-toolbar input{max-width:420px;margin:0;background:#f8fafc}.tng-catalog-toolbar>span{font-size:.75rem;color:#718397;white-space:nowrap}
.tng-categories{display:flex;flex-wrap:wrap;gap:7px;padding-bottom:18px;border-bottom:1px solid #e6edf3}.tng-categories button{border-color:transparent;background:#f3f6f9;padding:7px 12px;font-size:.76rem}.tng-categories button[aria-pressed=true]{background:var(--tng-navy);border-color:var(--tng-navy);color:#fff}
.tng-family{margin-top:22px}.tng-family>header{display:flex;align-items:center;gap:9px;margin-bottom:11px}.tng-family h3{margin:0;font-size:.86rem;color:#284d6c}.tng-family>header>span{font-size:.68rem;min-width:18px;text-align:center;padding:2px 5px;border-radius:5px;background:#edf2f6;color:#738394}
.tng-tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:10px}.tng-tool-card{border:1px solid #dbe5ed;border-radius:10px;padding:11px 13px 7px;background:#fff;transition:border-color .15s,box-shadow .15s}.tng-tool-card:hover{border-color:#9bb6cc;box-shadow:0 3px 12px #143a5b09}.tng-tool-codes{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-height:28px}.tng-code-pair{display:inline-flex;align-items:center;gap:3px}.tng-code{font-size:.7rem;font-weight:750;color:#8b661f;line-height:1.4}.tng-code--plain{color:#8292a1;font-weight:500}
.tng :deep(.service-information__trigger){width:28px;height:28px;padding:0;font-size:18px!important;border-color:#d4e1ec;background:#f7fafc}
.tng .tng-tool-select{display:flex;align-items:center;justify-content:space-between;gap:10px;border:0;border-radius:5px;padding:8px 0;width:100%;text-align:left;background:transparent;color:#254a69}.tng-tool-select strong{font-size:.84rem;line-height:1.5;font-weight:650}.tng-tool-select>span{flex:none;font-size:1rem;color:#91a7ba}.tng-tool-about{font-size:.71rem;color:#718396;margin-bottom:5px}.tng-tool-about summary{cursor:pointer;line-height:1.5}.tng-tool-about p{margin:8px 0;color:#587086;font-size:.8rem}
.tng-editor-head{padding-bottom:16px;border-bottom:1px solid #e4ebf1}.tng-editor-head h2{margin:5px 0 0}.tng-editor-tools{display:flex;align-items:center;gap:10px}.tng-fields{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:20px}.tng fieldset{border:0;padding:0;margin:0;min-width:0}.tng-dictation,.tng-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0 18px}
.tng .tng-primary{background:var(--tng-navy);border-color:var(--tng-navy);color:#fff;font-weight:650;padding:12px 22px}.tng .tng-primary:hover:not(:disabled){background:#285b87;border-color:#285b87}.tng .tng-recording{color:#ad2525;border-color:#ad2525}.tng-muted,.tng-save-status{color:#6b8093;font-size:.78rem;line-height:1.6}.tng-error{color:#a92d28;padding:12px;background:#fff4f2;border-radius:8px}
.tng-generating{display:flex;align-items:center;gap:16px;padding:18px 20px;border:1px solid #d9e5ef;border-radius:10px;background:#f2f7fc;margin:16px 0;font-size:.88rem}.tng-generating p{margin:4px 0 0;font-size:.8rem;color:#657d92}.tng-spinner{width:23px;height:23px;flex:none;border:2px solid #c7d7e5;border-top-color:var(--tng-gold);border-radius:50%;animation:tng-spin 1s linear infinite}@keyframes tng-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.tng-spinner{animation:none;border-top-color:var(--tng-navy)}}
.tng-output{border-top:1px solid #dce5ed;margin-top:24px;padding-top:22px}.tng-output-head>div:last-child{display:flex;gap:8px;flex-wrap:wrap}.tng-output-head p{margin:4px 0 0;font-size:.85rem;color:#5a7388}.tng-section{padding:14px 16px;margin-top:12px;border:1px solid #dce6ee;border-radius:10px;background:#fbfcfe}.tng-section h3{font-size:.88rem;margin:0}.tng-section textarea{margin-bottom:0;min-height:110px}.tng-copy-status{min-height:1.5em;font-size:.8rem}.tng-output-footer{margin-top:20px;padding:22px;background:#f3f7fb;border:1px solid #dce7f0;border-radius:10px}.tng-output-footer strong{font-size:.9rem}.tng-output-footer p{font-size:.78rem;color:#6c8194;margin:5px 0 0}.tng-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.tng-unavailable{padding:24px;background:#fff;border-radius:12px}
@media(max-width:1000px){.tng{grid-template-columns:212px minmax(0,1fr);gap:14px}.tng-main{padding:18px}.tng-history{padding:14px}}@media(max-width:700px){.tng{display:flex;flex-direction:column-reverse;gap:16px}.tng-history{position:static;width:100%;box-sizing:border-box;max-height:360px}.tng-fields{grid-template-columns:1fr}.tng-catalog-toolbar{align-items:flex-start;flex-direction:column}.tng-catalog-toolbar input{max-width:none}.tng-main{padding:16px}.tng-output-footer{align-items:flex-start;flex-direction:column}}
</style>
