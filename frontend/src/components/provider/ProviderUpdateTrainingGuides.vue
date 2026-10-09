<template>
  <div v-if="guides.length" class="training-guides">
    <button v-for="guide in guides" :key="guide.id" type="button" class="training-guide-button" :disabled="loading" @click="open(guide, $event)">▶ {{ guide.title }} · photos / video</button>
    <p v-if="error" role="alert">{{error}}</p>
    <dialog ref="dialog" aria-label="Section instructions" @close="close" @cancel.prevent="close">
      <template v-if="active">
        <button type="button" class="close" @click="close">Close instructions</button>
        <h2>{{active.title}}</h2>
        <div class="guide-content" v-html="displayHtml" />
      </template>
    </dialog>
  </div>
</template>
<script setup>
import {computed,nextTick,onBeforeUnmount,ref} from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import {youtubeVideoId} from '../../utils/trainingVideo';
const props=defineProps({guides:{type:Array,default:()=>[]},base:{type:String,required:true},sectionKey:{type:String,required:true},agencyId:{type:[Number,String],required:true}});
const dialog=ref(null),active=ref(null),loading=ref(false),error=ref('');let trigger=null;
const displayHtml=computed(()=>{
 const doc=new DOMParser().parseFromString(DOMPurify.sanitize(active.value?.html||''),'text/html');
 for(const link of doc.querySelectorAll('a[href]')) {
  const id=youtubeVideoId(link.getAttribute('href'));if(!id)continue;
  const frame=doc.createElement('iframe');frame.src=`https://www.youtube-nocookie.com/embed/${id}`;frame.title=active.value.title;frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.setAttribute('allowfullscreen','');frame.referrerPolicy='strict-origin-when-cross-origin';link.replaceWith(frame);
 }
 for(const video of doc.querySelectorAll('video')){video.controls=true;video.preload='metadata';}
 return doc.body.innerHTML;
});
async function open(guide,event){loading.value=true;error.value='';trigger=event.currentTarget;
 try{const {data}=await api.get(`${props.base}/training/${props.sectionKey}`,{params:{agencyId:props.agencyId}});active.value=data.guides.find(g=>g.id===guide.id);if(!active.value)throw Error('These instructions changed. Refresh your update and try again.');await nextTick();dialog.value.showModal();}
 catch(e){error.value=e.response?.data?.error?.message||e.message||'Could not open instructions.';}finally{loading.value=false;}}
function close(){active.value=null;if(dialog.value?.open)dialog.value.close();trigger?.focus?.();}
onBeforeUnmount(close);
</script>
<style scoped>
.training-guides{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0 20px}.training-guide-button{background:#285780;color:white;border:2px solid #285780;border-radius:10px;padding:12px 18px;font:600 15px system-ui;cursor:pointer;animation:guide-pulse 2.5s ease-in-out infinite}.training-guide-button:disabled{animation:none;opacity:.65}dialog{width:min(820px,90vw);max-height:85vh;border:0;border-radius:16px;padding:24px;box-shadow:0 15px 70px #0005}dialog::backdrop{background:#112a3a99}.close{padding:10px 16px;font:inherit;cursor:pointer}.guide-content :deep(img),.guide-content :deep(video){max-width:100%;height:auto}.guide-content :deep(iframe){width:100%;aspect-ratio:16/9;border:0}.guide-content :deep(figure){margin:16px 0}@keyframes guide-pulse{50%{box-shadow:0 0 0 6px #28578025}}@media(prefers-reduced-motion:reduce){.training-guide-button{animation:none}}
</style>
