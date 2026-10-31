import {onScopeDispose,unref,watch} from 'vue';

/** Reload after chart navigation or asynchronously resolved access; never retain a prior chart's contacts. */
export function useLinkedGuardianContact({clientId,canView,guardians,loading,error,api}){
 let version=0,inflight=null;
 const allowed=()=>unref(canView)===true;
 async function load(){
  const id=Number(unref(clientId));if(!id||!allowed())return;
  if(inflight)return inflight;
  const generation=version;loading.value=true;error.value='';
  const request=(async()=>{try{
   const response=await api.get(`/clients/${id}/guardians`,{skipGlobalLoading:true});
   if(generation!==version||!allowed()||id!==Number(unref(clientId)))return;
   guardians.value=Array.isArray(response.data)?response.data:[];
  }catch(e){if(generation===version&&allowed()){guardians.value=[];error.value=e.response?.data?.error?.message||'Failed to load guardians';}}
  finally{if(generation===version){loading.value=false;inflight=null;}}})();
  inflight=request;return request;
 }
 watch([()=>Number(unref(clientId)),allowed],()=>{
  version++;inflight=null;guardians.value=[];error.value='';loading.value=false;
  if(allowed())void load();
 },{immediate:true});
 onScopeDispose(()=>{version++;inflight=null;});
 return {load};
}
