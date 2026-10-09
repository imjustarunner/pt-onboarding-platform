<template>
  <section class="help-box" data-provider-update-help>
    <button type="button" :aria-expanded="open" @click="open = !open">{{client?'Report a client problem / possible duplicate':'Need help? Contact People Operations or Technology'}}</button>
    <form v-if="open" @submit.prevent="submit" @paste="pasteImages">
      <p v-if="client">Send a message to support about this client, including a possible duplicate or incorrect information. <strong>{{client.preferredName || client.firstName}} {{client.lastName}}</strong> · {{client.schoolName}} will be linked automatically. Reporting a duplicate does not merge or delete either record.</p>
      <p v-else>Choose People Operations for employment, benefits, amendment or pay questions. Choose Technology for app problems. Your message creates a support ticket.</p>
      <fieldset :disabled="busy || capturing">
        <label v-if="!client">Send to<select v-model="topic"><option value="people_operations">People Operations</option><option value="technology">Technology support</option></select></label>
        <label>Subject<input v-model="subject" required maxlength="200" /></label>
        <label>What do you need help with?<textarea v-model="question" required minlength="5" maxlength="10000" rows="5" placeholder="Type or paste your question here. You can paste an image, too." /></label>
        <label>Screenshots/photos (up to 3, PNG/JPG/WebP, 8 MB each)<input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="uploadImages" /></label>
        <button type="button" :disabled="attachments.length >= 3" @click="captureScreen">{{ capturing ? 'Taking screenshot…' : 'Take screenshot of this page' }}</button>
        <p class="hint">You can also paste a copied screenshot here. Review attachments before sending; remove any you don’t want to include.</p>
        <ul v-if="attachments.length" class="attachments" aria-label="Attached images">
          <li v-for="(item,index) in attachments" :key="item.id"><a :href="item.url" target="_blank" rel="noopener"><img :src="item.url" :alt="item.file.name" /></a><span>{{ item.file.name }}</span><button type="button" :aria-label="`Remove ${item.file.name}`" @click="removeImage(index)">Remove</button></li>
        </ul>
        <button :disabled="readonly">{{ readonly ? 'Preview — ticket submission disabled' : busy ? 'Submitting…' : 'Send message' }}</button>
      </fieldset>
      <p v-if="result" role="status">{{ result }}</p>
    </form>
  </section>
</template>
<script setup>
import {ref,watch,nextTick,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import html2canvas from 'html2canvas';
const props=defineProps({base:String,agencyId:[Number,String],readonly:Boolean,client:Object});
const open=ref(false),topic=ref('technology'),subject=ref(props.client?'Client record question':'Provider Update help'),question=ref(''),attachments=ref([]),busy=ref(false),capturing=ref(false),result=ref('');
let requestId=crypto.randomUUID();
watch(topic,()=>{requestId=crypto.randomUUID();result.value='';});
function addImages(files){
 const incoming=Array.from(files||[]);if(!incoming.length)return;
 if(attachments.value.length+incoming.length>3){result.value='Choose up to three images. Remove an attachment before adding another.';return;}
 if(incoming.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8*1024*1024)){result.value='Choose PNG, JPG or WebP images, each under 8 MB.';return;}
 result.value='';for(const file of incoming)attachments.value.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)});
}
function uploadImages(event){addImages(event.target.files);event.target.value='';}
function pasteImages(event){
 if(busy.value||capturing.value)return;
 const images=Array.from(event.clipboardData?.items||[]).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
 if(images.length){event.preventDefault();addImages(images);}
}
function removeImage(index){const [item]=attachments.value.splice(index,1);if(item)URL.revokeObjectURL(item.url);}
function clearImages(){for(const item of attachments.value)URL.revokeObjectURL(item.url);attachments.value=[];}
onBeforeUnmount(clearImages);
async function captureScreen(){
 if(capturing.value||busy.value||attachments.value.length>=3)return;
 capturing.value=true;result.value='';
 try{
  await nextTick();
  const canvas=await html2canvas(document.body,{useCORS:true,allowTaint:false,logging:false,scale:1,
   x:window.scrollX,y:window.scrollY,width:window.innerWidth,height:window.innerHeight,
   windowWidth:window.innerWidth,windowHeight:window.innerHeight,
   ignoreElements:el=>!!el?.closest?.('[data-provider-update-help], [data-beta-feedback-ui="true"]')||el?.matches?.('input[type="password"]')});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('Capture unavailable');
  addImages([new File([blob],`Page screenshot ${new Date().toISOString().replace(/[:.]/g,'-')}.png`,{type:'image/png'})]);
 }catch{result.value='Could not capture this page. Take a screenshot on your device, then paste or upload it here.';}
 finally{capturing.value=false;}
}
async function submit(){
 if(props.readonly||busy.value||capturing.value)return;
 busy.value=true;result.value='';
 try{const body=new FormData();body.append('agencyId',props.agencyId);body.append('subject',subject.value);body.append('question',question.value);body.append('requestId',requestId);if(props.client)body.append('clientId',props.client.id);else body.append('topic',topic.value);for(const item of attachments.value)body.append('screenshots',item.file);
 const {data}=await api.post(`${props.base}/help-ticket`,body);const destination=props.client?'your support team with this client linked':(data.topic||topic.value)==='people_operations'?'People Operations':'Technology support';result.value=`Ticket #${data.ticketId} submitted to ${destination}.`;question.value='';clearImages();requestId=crypto.randomUUID();}
 catch(e){result.value=e.response?.data?.error?.message||'Ticket could not be submitted. Please try again.';}finally{busy.value=false;}
}
</script>
<style scoped>
.help-box{padding:12px;background:#fff;border:1px solid #d4e2df;border-radius:12px}form,label,fieldset{display:grid;gap:8px}form{margin-top:14px}fieldset{border:0;padding:0;margin:0;min-width:0}input,textarea,select{box-sizing:border-box;width:100%;font:inherit;padding:8px}button{padding:10px;color:#234f3a;background:#eef5f1;border:1px solid #9fbaad;border-radius:8px;cursor:pointer}button:disabled{cursor:default;opacity:.65}p{line-height:1.5}.hint{font-size:.9rem;color:#52636f}.attachments{display:grid;gap:10px;padding:0;list-style:none}.attachments li{display:grid;gap:5px;overflow-wrap:anywhere}.attachments img{max-width:100%;max-height:180px;border:1px solid #ccd6df;border-radius:6px}
</style>
