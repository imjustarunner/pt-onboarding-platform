<template>
 <div class="training-attachment">
  <label>Caption / image description<input v-model="caption" type="text" placeholder="What should the team notice or do?" /></label>
  <label>Instructional image or video<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" :disabled="busy || !agencyId" @change="upload" /></label>
  <label>YouTube instruction video<input v-model="youtubeUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" /></label><button type="button" :disabled="busy || !youtubeUrl" @click="attachYoutube">Add YouTube video</button>
  <small>Photos and screenshots: PNG, JPG, WebP. Videos: MP4 or WebM. Up to 25 MB. Add a caption, then choose your file. {{ saveRequired ? 'Save the section when finished.' : 'Section changes save automatically.' }} Email readers can open the attachments in the app.</small>
  <p role="status">{{notice}}</p><p v-if="error" role="alert">{{error}}</p>
 </div>
</template>
<script setup>
import {youtubeVideoId} from '../../utils/trainingVideo';
import {ref} from 'vue';import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],required:true},saveRequired:{type:Boolean,default:true}}),emit=defineEmits(['attach']);
const youtubeUrl=ref('');
function attachYoutube(){const id=youtubeVideoId(youtubeUrl.value);if(!id){error.value='Use a valid HTTPS YouTube video link.';return;}const title=caption.value.trim()||'Watch instructions';emit('attach',`<figure><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">▶ ${e(title)}</a><figcaption>${e(title)}</figcaption></figure><p><br></p>`);youtubeUrl.value='';caption.value='';error.value='';notice.value='Video added. Save the section when finished.';}
const busy=ref(false),caption=ref(''),notice=ref(''),error=ref('');
const e=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function upload(event){const file=event.target.files?.[0];if(!file)return;error.value='';notice.value='';if(file.size>25*1024*1024){error.value='Choose a file smaller than 25 MB.';return;}busy.value=true;
 try{const body=new FormData();body.append('agencyId',String(props.agencyId));body.append('file',file);const {data}=await api.post('/provider-update/training-media',body);const text=caption.value.trim()||file.name;
 const media=data.kind==='image'?`<img data-training-key="${e(data.key)}" src="${e(data.url)}" alt="${e(text)}" width="720" />`:`<video data-training-key="${e(data.key)}" src="${e(data.url)}" controls preload="metadata" width="720"></video><p><a data-training-key="${e(data.key)}" href="${e(data.url)}" target="_blank" rel="noopener">Open video</a></p>`;
 emit('attach',`<figure>${media}<figcaption>${e(text)}</figcaption></figure><p><br></p>`);notice.value=props.saveRequired?'Added to this section. Save to keep it.':'Added to this section.';caption.value='';
 }catch(err){error.value=err.response?.data?.error?.message||'Upload failed. Please try again.';}finally{busy.value=false;event.target.value='';}}
</script>
<style scoped>.training-attachment{display:grid;gap:8px;padding:12px;border:1px dashed #a8bdb0;border-radius:8px;margin:10px 0;background:#f6faf7}.training-attachment label{display:grid;gap:5px}.training-attachment input{max-width:100%;padding:6px}.training-attachment small{color:#53665b}.training-attachment p{margin:0}</style>
