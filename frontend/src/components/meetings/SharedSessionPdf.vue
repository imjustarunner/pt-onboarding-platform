<template><div class="session-pdf"><nav aria-label="Document pages"><button :disabled="page<=1 || busy" @click="turn(-1)">Previous</button><span>Page {{ page }} / {{ pages || '…' }}</span><button :disabled="page>=pages || busy" @click="turn(1)">Next</button></nav><p v-if="error" role="alert">{{ error }}</p><p v-if="busy" role="status">Loading page…</p><canvas ref="canvas" aria-label="Shared PDF page" /></div></template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
const props=defineProps({dataUrl:{type:String,required:true}}),emit=defineEmits(['page-change']);
const canvas=ref(null),page=ref(1),pages=ref(0),busy=ref(true),error=ref('');
let doc,task,renderTask,disposed=false;
async function render(){if(!doc||disposed)return;busy.value=true;try{const pdfPage=await doc.getPage(page.value);if(disposed)return;const viewport=pdfPage.getViewport({scale:1.4});canvas.value.width=viewport.width;canvas.value.height=viewport.height;renderTask=pdfPage.render({canvasContext:canvas.value.getContext('2d'),viewport});await renderTask.promise;emit('page-change',page.value);}catch(e){if(!disposed)error.value='This PDF could not be displayed. Download it from Session files.';}finally{busy.value=false;}}
async function turn(step){page.value+=step;await render();}
onMounted(async()=>{try{const bytes=Uint8Array.from(atob(props.dataUrl.split(',')[1]),c=>c.charCodeAt(0));task=getDocument({data:bytes,isEvalSupported:false});doc=await task.promise;if(disposed){await doc.destroy();return;}pages.value=doc.numPages;await render();}catch{if(!disposed)error.value='This PDF could not be displayed. Download it from Session files.';}finally{busy.value=false;}});
onBeforeUnmount(()=>{disposed=true;renderTask?.cancel();void task?.destroy();});
</script>
<style scoped>.session-pdf{overflow:auto;max-height:65vh}.session-pdf nav{position:sticky;top:0;display:flex;align-items:center;justify-content:center;gap:14px;background:white;padding:12px}.session-pdf button{border:1px solid #dce5eb;border-radius:9px;background:white;padding:9px 12px;color:#18333c}.session-pdf canvas{display:block;width:100%;height:auto}.session-pdf [role=alert]{color:#a12434}</style>
