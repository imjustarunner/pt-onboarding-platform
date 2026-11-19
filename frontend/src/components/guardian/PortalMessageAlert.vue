<template>
 <aside v-if="count" class="message-toast" role="status">
   <strong>{{ spanish ? (count===1?'Tienes un mensaje nuevo':`Tienes ${count} mensajes nuevos`) : (count===1?'You have a new message':`You have ${count} new messages`) }}</strong>
   <button @click="$emit('open'); count=0">{{ spanish?'Abrir mensajes':'Open messages' }}</button>
   <button :aria-label="spanish?'Cerrar':'Dismiss'" @click="count=0">×</button>
 </aside>
</template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api';
defineProps({spanish:Boolean});
defineEmits(['open']);
const count=ref(0);
let timer,active=false,busy=false,lastShown=0,pendingAck=0;
async function check(){
 if(!active||busy||document.hidden)return;
 busy=true;
 try{
   if(pendingAck){await acknowledge();}
   const {data}=await api.get('/guardian-portal/message-alerts',{params:{after:lastShown},skipGlobalLoading:true});
   if(!active||!data.count)return;
   if(Number(data.latest)>lastShown){count.value+=Number(data.count);lastShown=Number(data.latest);}
   pendingAck=lastShown;await acknowledge();
 }catch{/* Retry on focus or the next poll. */}finally{busy=false;}
}
async function acknowledge(){
 await api.post('/guardian-portal/message-alerts/ack',{latest:pendingAck},{skipGlobalLoading:true});
 pendingAck=0;
}
onMounted(()=>{active=true;check();timer=setInterval(check,30000);document.addEventListener('visibilitychange',check);});
onBeforeUnmount(()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',check);});
</script>
<style scoped>
.message-toast{position:fixed;z-index:1000;right:1rem;bottom:1.25rem;max-width:calc(100vw - 2rem);display:flex;gap:.8rem;align-items:center;padding:1rem;background:#102d53;color:white;border-left:5px solid #d2ac58;border-radius:.65rem;box-shadow:0 6px 24px #102d5340}
button{background:white;color:#15345c;border:0;border-radius:.35rem;padding:.4rem .6rem;cursor:pointer}
</style>
