<template>
  <section class="help-box">
    <button type="button" @click="open = !open">Need help? Submit a Technology ticket</button>
    <form v-if="open" @submit.prevent="submit">
      <p>For questions about this app or a time correction, send a ticket to your support team. Include a screenshot if it helps.</p>
      <label>Subject<input v-model="subject" required maxlength="200" /></label>
      <label>What do you need help with?<textarea v-model="question" required minlength="5" maxlength="10000" rows="5" /></label>
      <label>Screenshots/photos (up to 3, PNG/JPG/WebP, 8 MB each)<input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="files = Array.from($event.target.files)" /></label>
      <button :disabled="busy || readonly">{{ readonly ? 'Preview — ticket submission disabled' : busy ? 'Submitting…' : 'Submit ticket' }}</button>
      <p v-if="result" role="status">{{ result }}</p>
    </form>
  </section>
</template>
<script setup>
import {ref} from 'vue';
import api from '../../services/api';
const props=defineProps({base:String,agencyId:[Number,String],readonly:Boolean});
const open=ref(false),subject=ref('Provider Update help'),question=ref(''),files=ref([]),busy=ref(false),result=ref('');
let requestId=crypto.randomUUID();
async function submit(){
 if(props.readonly)return;
 if(files.value.length>3||files.value.some(f=>f.size>8*1024*1024)){result.value='Choose up to three images, each under 8 MB.';return;}
 busy.value=true;result.value='';
 try{const body=new FormData();body.append('agencyId',props.agencyId);body.append('subject',subject.value);body.append('question',question.value);body.append('requestId',requestId);for(const file of files.value)body.append('screenshots',file);
 const {data}=await api.post(`${props.base}/help-ticket`,body);result.value=`Ticket #${data.ticketId} submitted to Technology support.`;question.value='';files.value=[];requestId=crypto.randomUUID();}
 catch(e){result.value=e.response?.data?.error?.message||'Ticket could not be submitted. Please try again.';}finally{busy.value=false;}
}
</script>
<style scoped>
.help-box{padding:12px;background:#fff;border:1px solid #d4e2df;border-radius:12px}form,label{display:grid;gap:8px}form{margin-top:14px}input,textarea{box-sizing:border-box;width:100%;font:inherit;padding:8px}button{padding:10px;color:#234f3a;background:#eef5f1;border:1px solid #9fbaad;border-radius:8px;cursor:pointer}p{line-height:1.5}
</style>
