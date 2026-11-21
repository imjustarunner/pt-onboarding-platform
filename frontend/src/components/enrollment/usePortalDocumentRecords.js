import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import api from '../../services/api';

export function usePortalDocumentRecords(props, clientId, clientName) {
  const context=reactive({channel:'office',audience:'guardian',service:'counseling',locale:'en'});
  const catalog=ref(null), records=ref([]), loading=ref(false), error=ref('');
  const recordIds=ref([]), foundationKeys=ref([]), editorId=ref(null), editor=ref(null), preparing=ref(false);
  let generation=0;
  const foundations=computed(()=>(catalog.value?.documents || []).map(d=>({group:'foundation',id:d.key,title:d.title})));
  const saved=computed(()=>records.value.filter(r=>!r.revoked).map(r=>({group:'records',id:r.id,version:r.version,title:r.documentName || r.title})));
  const selected=computed(()=>[
    ...saved.value.filter(d=>recordIds.value.includes(d.id)),
    ...foundations.value.filter(d=>foundationKeys.value.includes(d.id))
  ]);
  const assignments=computed(()=>records.value.flatMap(r=>(r.portalAssignments || []).map(s=>{
    const status=r.revoked?'revoked':s.copyOnly?'shared':s.signedAt?'complete':'pending';
    return {id:s.signerId,recordId:r.id,item_type:'clinical',typeLabel:r.documentKey==='release-of-information'?'Release':'Form',
      status,title:r.documentName || r.title,recipient:s.recipient,recipientUserId:s.recipientUserId,completed_at:s.signedAt,
      progress:r.revoked?'Revoked':s.copyOnly?'Shared copy':s.signedAt?'Signed':'Awaiting signature',canRemind:status==='pending' && Number(s.version)===Number(r.version)};
  })));
  let pendingLoad;
  function load(){
    pendingLoad = fetchDocuments();
    return pendingLoad;
  }
  async function fetchDocuments(){
    const run=++generation;
    error.value='';
    if(!props.open || !clientId.value || !props.clinicalMode)return;
    const releaseOnly=props.clinicalMode==='release';
    loading.value=true;
    const requests=[api.get('/clinical-forms',{params:{clientId:clientId.value,...(releaseOnly?{documentKey:'release-of-information'}:{})}})];
    if(!releaseOnly)requests.push(api.get('/enrollment-portal/clients/'+clientId.value+'/catalog',{params:{agencyId:props.agencyId,...context}}));
    const [savedResult,templateResult]=await Promise.allSettled(requests);
    if(run!==generation)return;
    if(savedResult.status==='fulfilled')records.value=savedResult.value.data.plans || [];
    if(templateResult?.status==='fulfilled')catalog.value=templateResult.value.data;
    error.value=[savedResult.status==='rejected'?'Saved documents could not be loaded.':'',templateResult?.status==='rejected'?'Enrollment forms could not be loaded.':''].filter(Boolean).join(' ');
    loading.value=false;
  }
  async function prepare(item){
    if(preparing.value)return;
    if(item.group==='records'){editorId.value=item.id;return;}
    const run=generation;
    preparing.value=true;error.value='';
    try{
      const base={agencyId:Number(props.agencyId),clientId:clientId.value,data:{personLabel:clientName.value,planDate:new Date().toLocaleDateString('en-CA')}};
      const {data}=item.group==='foundation'
        ?await api.post('/enrollment-portal/clients/'+clientId.value+'/documents',{...base,foundationKey:item.id,context:{...context}})
        :await api.post('/clinical-forms',{...base,documentKey:'release-of-information'});
      if(run===generation)editorId.value=data.id;
    }catch(e){if(run===generation)error.value=e.response?.data?.error?.message || 'The document could not be prepared.';}
    finally{if(run===generation)preparing.value=false;}
  }
  function canLeave(){return !preparing.value && editor.value?.confirmDiscard?.()!==false;}
  function closeEditor(){if(canLeave()){editorId.value=null;load();}}
  watch(()=>[props.open,clientId.value,props.agencyId,props.clinicalMode],()=>{
    catalog.value=null;records.value=[];recordIds.value=[];foundationKeys.value=[];
    editorId.value=null;preparing.value=false;loading.value=false;load();
  },{immediate:true});
  watch(()=>Object.values(context),()=>{
    catalog.value=null;foundationKeys.value=[];load();
  });
  onBeforeUnmount(()=>{generation++;});
  return {context,catalog,records,loading,error,recordIds,foundationKeys,editorId,editor,preparing,foundations,saved,selected,assignments,load,whenLoaded:()=>pendingLoad,prepare,canLeave,closeEditor};
}
