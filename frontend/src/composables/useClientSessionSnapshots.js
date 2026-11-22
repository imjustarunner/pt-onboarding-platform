import {ref,watch,onMounted,onScopeDispose,toValue} from 'vue';
import api from '../services/api';
export function useClientSessionSnapshots(clients) {
  const snapshots=ref({}),error=ref(''),refreshToken=ref(0); let generation=0;
  watch(()=>JSON.stringify({scope:(toValue(clients)||[]).flatMap(c=>[c,...(c.linkedCaseloadCharts||[])]).map(c=>[Number(c.id),Number(c.agency_id)]),revision:refreshToken.value}),async raw=>{
    const current=++generation; snapshots.value={}; error.value='';
    const agencies=new Map();
    for(const [id,agencyId] of JSON.parse(raw).scope) if(id && agencyId) {
      if(!agencies.has(agencyId)) agencies.set(agencyId,new Set());
      agencies.get(agencyId).add(id);
    }
    const result={};
    try {
      for(const [agencyId,ids] of agencies) {
        const list=[...ids];
        for(let offset=0;offset<list.length;offset+=200) {
          const {data}=await api.post('/clients/caseload-session-dates',{agencyId,clientIds:list.slice(offset,offset+200)},
            {headers:{'X-Agency-Id':String(agencyId)},skipGlobalLoading:true});
          if(current!==generation)return;
          for(const item of data.items||[]) result[`${agencyId}:${item.clientId}`]=item;
        }
      }
      if(current===generation) snapshots.value=result;
    } catch {if(current===generation)error.value='Appointment dates could not load. Refresh to retry.';}
  },{immediate:true});
  const refresh=()=>refreshToken.value++;
  onMounted(()=>window.addEventListener('focus',refresh));
  onScopeDispose(()=>{generation++;window.removeEventListener('focus',refresh);});
  return {snapshots,error,refresh};
}
export function sessionSnapshotKey(client) {return `${client.agency_id}:${client.id}`;}
export function sessionDateLabel(value) {
  if(!value)return '—';
  const raw=String(value);
  const date=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)?raw:raw.replace(' ','T')+'Z');
  return Number.isNaN(date.getTime())?'—':date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
