import { ref, watch, onUnmounted, toValue } from 'vue';
import api from '../services/api';
export function useClientFeedbackSummaries(clients, providerId) {
 const byClient=ref({}),loading=ref(false),error=ref('');let generation=0;
 async function load(){
  const request=++generation;byClient.value={};error.value='';
  const ids=[...new Set((toValue(clients)||[]).map(c=>Number(c.id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
  if(!ids.length){loading.value=false;return;}
  loading.value=true;const result={};
  try{
   for(let i=0;i<ids.length;i+=200){
    if(request!==generation)return;
    const {data}=await api.post('/kiosk/client-feedback/summaries',{clientIds:ids.slice(i,i+200),providerId:Number(toValue(providerId))||null},{skipGlobalLoading:true});
    if(request!==generation)return;
    for(const row of data.summaries||[])(result[row.clientId]??=[]).push(row);
   }
   byClient.value=result;
  }catch{if(request===generation)error.value='Feedback scores could not load. Try refreshing.';}
  finally{if(request===generation)loading.value=false;}
 }
 watch(()=>[(toValue(clients)||[]).map(c=>c.id).join(','),toValue(providerId)],load,{immediate:true});
 onUnmounted(()=>{generation++;byClient.value={};});
 return {byClient,loading,error,refresh:load};
}
