<template>
  <section class="ticket-attachment-composer" aria-label="Ticket attachments">
    <label>Attach a document<input ref="fileInput" type="file" :disabled="disabled || uploading" accept=".pdf,.png,.jpg,.jpeg" @change="chooseFile" /></label>
    <p v-if="selectedFile">Selected: {{ selectedFile.name }} <button type="button" :disabled="uploading" @click="clearSelected">Remove</button></p>
    <button v-if="ticketId && selectedFile" type="button" class="btn btn-secondary" :disabled="disabled || uploading || uncertain" @click="uploadPending(ticketId)">{{ uploading ? 'Adding file…' : 'Add file to ticket' }}</button>
    <p v-if="!ticketId && selectedFile">This file will be added privately after the new ticket is created.</p>
    <button v-if="uncertain" type="button" class="btn btn-secondary" @click="refreshUncertain">Refresh ticket files before retrying</button>
    <p class="attachment-help">Files are private to authorized ticket participants. Email notifications do not include the file.</p>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
    <ul v-if="files.length"><li v-for="file in files" :key="file.id"><button type="button" :disabled="downloading === file.id" @click="download(file)">{{ file.file_name || file.original_filename || 'Document' }}</button></li></ul>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({ticketId:[Number,String],contextKey:[Number,String],disabled:Boolean,showFiles:{type:Boolean,default:true}});
const emit=defineEmits(['uploaded','busy']);
const fileInput=ref(null),selectedFile=ref(null),files=ref([]),uploading=ref(false),downloading=ref(null),error=ref(''),notice=ref(''),uncertain=ref(false),lastUploadTicketId=ref(null);
let generation=0;
const scope=()=>`${props.contextKey || ''}:${props.ticketId || ''}`;
function clearSelected(){selectedFile.value=null;if(fileInput.value)fileInput.value.value='';}
function reset(){generation++;clearSelected();files.value=[];error.value='';notice.value='';uploading.value=false;uncertain.value=false;lastUploadTicketId.value=null;emit('busy',false);}
function chooseFile(event){error.value='';notice.value='';const file=event.target.files?.[0];if(!file){clearSelected();return;}if(file.size>25*1024*1024){error.value='Choose a file no larger than 25 MB.';clearSelected();return;}selectedFile.value=file;}
async function load(targetId=props.ticketId){const id=Number(targetId),key=scope(),n=generation;if(!id || (!props.showFiles&&!uncertain.value))return false;try{const result=await api.get(`/support-tickets/${id}/attachments`,{skipGlobalLoading:true});if(n===generation&&key===scope()){files.value=result.data?.attachments||[];return true;}}catch(e){if(n===generation&&key===scope())error.value=e.response?.data?.error?.message||'Ticket files could not be loaded.';}}
async function refreshUncertain(){if(await load(lastUploadTicketId.value)){uncertain.value=false;error.value='';notice.value='Review the current ticket files before retrying. The same file will not be added twice.';}}
async function uploadPending(ticketId){if(!selectedFile.value)return true;if(uncertain.value){error.value='The previous upload outcome is unknown. Refresh ticket files before retrying.';return false;}if(uploading.value)return false;const id=Number(ticketId);if(!id){error.value='Create or select the ticket before adding its file.';return false;}const n=generation,key=scope(),file=selectedFile.value;const form=new FormData();form.append('file',file);lastUploadTicketId.value=id;uploading.value=true;emit('busy',true);error.value='';notice.value='';try{const result=await api.post(`/support-tickets/${id}/attachments`,form,{skipGlobalLoading:true});if(n!==generation||key!==scope())return false;const saved=result.data?.attachment;if(saved?.id&&!files.value.some(item=>Number(item.id)===Number(saved.id)))files.value.push(saved);clearSelected();notice.value='File added privately to this ticket. Email notifications do not include the file.';emit('uploaded',saved);return true;}catch(e){if(n===generation&&key===scope()){uncertain.value=!e.response || Number(e.response.status)>=500;error.value=uncertain.value?'The upload outcome is unknown. Refresh ticket files before retrying; do not create another ticket.':e.response?.data?.error?.message||'The file was not added. Keep it selected and retry; do not create another ticket.';}return false;}finally{if(n===generation){uploading.value=false;emit('busy',false);}}}
async function download(file){const id=Number(props.ticketId||lastUploadTicketId.value),key=scope(),n=generation;if(!id)return;downloading.value=file.id;error.value='';try{const result=await api.get(`/support-tickets/${id}/attachments/${file.id}/download`,{responseType:'blob',skipGlobalLoading:true});if(n!==generation||key!==scope())return;const url=URL.createObjectURL(result.data),anchor=document.createElement('a');anchor.href=url;anchor.download=file.file_name||file.original_filename||'document';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(n===generation&&key===scope())error.value=e.response?.data?.error?.message||'This ticket file could not be opened.';}finally{if(n===generation)downloading.value=null;}}
watch(()=>[props.contextKey,props.ticketId],()=>{reset();void load();},{immediate:true});
onBeforeUnmount(()=>generation++);
defineExpose({uploadPending,reset,hasFile:()=>!!selectedFile.value});
</script>
<style scoped>.ticket-attachment-composer{padding:10px 0;display:grid;gap:6px}.ticket-attachment-composer label{display:grid;gap:6px}.ticket-attachment-composer p{margin:2px 0;font-size:13px}.attachment-help{color:var(--text-secondary)}.ticket-attachment-composer [role=alert]{color:#b91c1c}.ticket-attachment-composer li button{overflow-wrap:anywhere;text-align:left}</style>
