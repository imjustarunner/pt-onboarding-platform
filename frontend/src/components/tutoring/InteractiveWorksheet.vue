<template>
<section class="worksheet" aria-label="Interactive worksheet">
 <nav class="page-nav" aria-label="Worksheet pages"><button :disabled="page<=1||busy" @click="turn(-1)">Previous</button><span>Page {{page}} of {{pages||'…'}}</span><button :disabled="page>=pages||busy" @click="turn(1)">Next</button><button @click="zoom=zoom===1?1.5:1">{{zoom===1?'Enlarge':'Fit page'}}</button></nav>
 <p v-if="error" role="alert">{{error}} <button @click="load">Retry document</button></p><p v-if="busy" role="status">Opening worksheet…</p>
 <p class="instructions">{{definition.instructions}}</p>
 <div class="paper-scroll"><div ref="paper" class="paper" :style="{width:(zoom*100)+'%'}"><canvas ref="canvas" aria-label="Worksheet source page"/>
  <div v-for="q in visibleQuestions" :key="q.id" class="answer-area" :class="{editing,selected:selected===q.id}" :style="{left:q.x+'%',top:q.y+'%',width:q.width+'%',minHeight:q.height+'%'}">
   <template v-if="editing"><button class="move" type="button" :aria-label="'Move '+q.prompt" @pointerdown="drag($event,q,'move')" @pointermove="moving" @pointerup="stop" @pointercancel="stop" @click="$emit('select',q.id)">⠿ {{q.prompt}}</button><button class="resize" type="button" :aria-label="'Resize '+q.prompt" @pointerdown="drag($event,q,'resize')" @pointermove="moving" @pointerup="stop" @pointercancel="stop">↘</button></template>
   <template v-else><label :for="'answer-'+q.id">{{q.prompt}}</label><select v-if="q.type==='choice'" :id="'answer-'+q.id" :value="answers[q.id]||''" :disabled="disabled" @change="answer(q.id,$event.target.value)"><option value="">Choose an answer</option><option v-for="option in q.options" :key="option">{{option}}</option></select>
    <WorksheetInk v-else-if="q.type==='ink'" :model-value="answers[q.id]||[]" :disabled="disabled" @update:model-value="answer(q.id,$event)"/>
    <p v-else-if="q.type==='example'">{{q.prompt}}</p><textarea v-else :id="'answer-'+q.id" :value="answers[q.id]||''" :disabled="disabled" :inputmode="q.type==='numeric'?'decimal':'text'" maxlength="4000" rows="2" @input="answer(q.id,$event.target.value)"/>
   </template>
  </div>
 </div></div>
 <p v-if="!visibleQuestions.length&&!busy">No interactive answer areas on this page.</p>
</section>
</template>
<script setup>
import {computed,ref,onMounted,onBeforeUnmount,watch,nextTick} from 'vue';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import WorksheetInk from './WorksheetInk.vue';
GlobalWorkerOptions.workerSrc=workerUrl;
const props=defineProps({definition:{type:Object,required:true},answers:{type:Object,default:()=>({})},readFile:{type:Function,required:true},editing:Boolean,disabled:Boolean,selected:String});
const emit=defineEmits(['update:definition','update:answers','select']);
const paper=ref(null),canvas=ref(null),page=ref(1),pages=ref(0),busy=ref(false),error=ref(''),zoom=ref(1);
const visibleQuestions=computed(()=>props.definition.questions.filter(q=>q.page===page.value));
let doc,task,renderTask,disposed=false,gesture=null,loadingPromise;
function answer(id,value){emit('update:answers',{...props.answers,[id]:value});}
async function render(){if(!doc||disposed)return;busy.value=true;try{const p=await doc.getPage(page.value),viewport=p.getViewport({scale:1.7});await nextTick();if(disposed)return;canvas.value.width=viewport.width;canvas.value.height=viewport.height;renderTask=p.render({canvasContext:canvas.value.getContext('2d'),viewport});await renderTask.promise;}catch(e){if(!disposed&&e.name!=='RenderingCancelledException')error.value='The worksheet page could not be displayed. Your answers are retained.';}finally{busy.value=false;}}
async function load(){if(loadingPromise)return loadingPromise;loadingPromise=(async()=>{busy.value=true;error.value='';try{await task?.destroy();const blob=await props.readFile();task=getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false});doc=await task.promise;if(disposed)return;pages.value=doc.numPages;await render();}catch(e){if(!disposed)error.value=e.response?.data?.error?.message||'The worksheet could not be opened. Retry after your tutor shares it.';}finally{busy.value=false;loadingPromise=null;}})();return loadingPromise;}
async function turn(d){page.value+=d;await render();}
function drag(e,q,mode){e.preventDefault();emit('select',q.id);const r=paper.value.getBoundingClientRect();gesture={id:q.id,pointer:e.pointerId,x:e.clientX,y:e.clientY,q:{...q},rect:r,mode};e.currentTarget.setPointerCapture(e.pointerId);}
function moving(e){if(!gesture||gesture.pointer!==e.pointerId)return;const g=gesture,dx=(e.clientX-g.x)/g.rect.width*100,dy=(e.clientY-g.y)/g.rect.height*100;
 const q=g.mode==='move'?{...g.q,x:Math.max(0,Math.min(100-g.q.width,g.q.x+dx)),y:Math.max(0,Math.min(100-g.q.height,g.q.y+dy))}:{...g.q,width:Math.max(5,Math.min(100-g.q.x,g.q.width+dx)),height:Math.max(3,Math.min(100-g.q.y,g.q.height+dy))};
 emit('update:definition',{...props.definition,questions:props.definition.questions.map(v=>v.id===q.id?q:v)});
}
function stop(e){if(gesture?.pointer===e.pointerId)gesture=null;}
onMounted(load);onBeforeUnmount(()=>{disposed=true;renderTask?.cancel();void task?.destroy();});
defineExpose({page});
</script>
<style scoped>
.worksheet{min-width:0}.page-nav{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px;background:#f4f8fa;border-bottom:1px solid #d4e1e9}.page-nav button{border:1px solid #c5d6df;background:white;color:#244257;border-radius:7px;padding:7px 10px}.instructions{padding:0 12px;color:#405969;font-size:13px}.paper-scroll{overflow:auto;max-height:calc(100dvh - 265px)}.paper{position:relative;margin:auto;background:white;min-width:300px}.paper canvas{display:block;width:100%;height:auto}.answer-area{position:absolute;box-sizing:border-box;background:#fffef2f5;border:1px solid #77a99e;border-radius:5px;padding:5px;min-width:35px}.answer-area label{display:block;font-size:12px;line-height:1.2;margin-bottom:4px;color:#14374e}.answer-area textarea,.answer-area select{box-sizing:border-box;width:100%;font:inherit;color:#19394e;background:white;border:1px solid #90a9b9;border-radius:4px;font-size:14px}.answer-area textarea{resize:vertical}.editing{border:2px dashed #377e93;background:#bcebddc9;min-height:32px}.selected{outline:3px solid #183b66}.move{cursor:move;touch-action:none;background:transparent;border:0;color:#15364b;text-align:left;font:inherit;font-size:12px;width:100%;padding:3px}.resize{position:absolute;bottom:0;right:0;cursor:nwse-resize;touch-action:none;border:0;background:#193b5c;color:white}.instructions:empty{display:none}[role=alert]{color:#a1263e}
</style>
