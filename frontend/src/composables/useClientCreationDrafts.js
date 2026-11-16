import { reactive } from 'vue';
import api from '../services/api';
export function useClientCreationDrafts() {
 const state=reactive({loading:false,loaded:false,saving:false,error:'',message:''});let scope=null;
 function config(agencyId){return{skipGlobalLoading:true,headers:{'X-Agency-Id':String(agencyId)}};}
 async function load(agencyId){if(scope)await flush();const active=scope={agencyId,revision:0,pending:null,running:null,timer:null,loaded:false};state.loading=true;state.loaded=false;state.error='';try{const{data}=await api.get('/clients/creation-draft',config(agencyId));if(active!==scope)return null;active.revision=data.revision;active.loaded=true;state.loaded=true;state.message=data.value?'Private draft restored':'';return data.value;}catch(error){if(active===scope)state.error=error.response?.data?.error?.message||'The private draft could not be loaded. Retry before entering client information.';return null;}finally{if(active===scope)state.loading=false;}}
 function schedule(value){if(!scope?.loaded)return;scope.pending=JSON.parse(JSON.stringify(value));state.message='Saving private draft…';clearTimeout(scope.timer);const active=scope;active.timer=setTimeout(()=>save(active),500);}
 async function save(active){clearTimeout(active.timer);if(active.running)return active.running;if(!active.pending)return;state.saving=true;active.running=(async()=>{while(active.pending){const value=active.pending;active.pending=null;try{const{data}=await api.put('/clients/creation-draft',{value,revision:active.revision},config(active.agencyId));active.revision=data.revision;if(active===scope){state.error='';state.message=active.pending?'Saving private draft…':'Private draft saved';}}catch(error){active.pending ||= value;if(active===scope){state.error=error.response?.data?.error?.message||'This draft could not be saved. Keep this window open and retry.';state.message='Draft not saved';}break;}}})();try{await active.running;}finally{active.running=null;if(active===scope)state.saving=false;}}
 async function flush(){if(scope)await save(scope);return !state.error;}
 function dispose(){if(scope){clearTimeout(scope.timer);void save(scope);scope=null;}}
 async function retry(){if(scope&&!scope.loaded)return load(scope.agencyId);return flush();}
 return{state,load,schedule,flush,dispose,retry};
}
