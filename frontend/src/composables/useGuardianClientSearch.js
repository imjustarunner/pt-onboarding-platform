import {unref,watch,onScopeDispose} from 'vue';

export function useGuardianClientSearch({query,guardianId,options,selectedClientId,loading,error,api}) {
 let generation=0;
 const reset=()=>{generation++;options.value=[];selectedClientId.value='';loading.value=false;};
 watch([()=>unref(query),()=>unref(guardianId)],reset,{flush:'sync'});
 onScopeDispose(()=>{generation++;});
 async function search(){
  const q=String(unref(query)||'').trim();
  if(q.length<2){reset();return;}
  const own=++generation,target=unref(guardianId);loading.value=true;error.value='';
  const current=()=>own===generation && target===unref(guardianId) && q===String(unref(query)||'').trim();
  try{
   const {data}=await api.get('/clients',{skipGlobalLoading:true,params:{search:q,includeArchived:false,paginate:true,page:1,per_page:25}});
   if(!current())return;
   options.value=(Array.isArray(data)?data:Array.isArray(data?.items)?data.items:[]).slice(0,25);
   if(!options.value.some(row=>String(row.id)===String(selectedClientId.value)))selectedClientId.value=options.value.length?String(options.value[0].id):'';
  }catch(e){if(current())error.value=e.response?.data?.error?.message||'Failed to search clients';}
  finally{if(current())loading.value=false;}
 }
 return {search};
}
