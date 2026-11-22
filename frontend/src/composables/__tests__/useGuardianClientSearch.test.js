import {effectScope,ref} from 'vue';
import {expect,it,vi} from 'vitest';
import {useGuardianClientSearch} from '../useGuardianClientSearch.js';
function setup(){
 const query=ref('ja'),guardianId=ref(20),options=ref([]),selectedClientId=ref(''),loading=ref(false),error=ref('');
 const api={get:vi.fn()},scope=effectScope();let search;
 scope.run(()=>{({search}=useGuardianClientSearch({query,guardianId,options,selectedClientId,loading,error,api}));});
 return {query,guardianId,options,selectedClientId,loading,error,api,scope,search};
}
it('uses a bounded SQL page and inline loading instead of the full-page overlay',async()=>{
 const s=setup();s.api.get.mockResolvedValue({data:{items:[{id:4,full_name:'Synthetic Client'}]}});
 await s.search();expect(s.api.get).toHaveBeenCalledExactlyOnceWith('/clients',{skipGlobalLoading:true,params:{search:'ja',includeArchived:false,paginate:true,page:1,per_page:25}});
 expect(s.selectedClientId.value).toBe('4');expect(s.loading.value).toBe(false);s.scope.stop();
});
it('ignores a stale search after the query changes, including clearing the input',async()=>{
 const s=setup();let finish;s.api.get.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const old=s.search();
 expect(s.loading.value).toBe(true);s.query.value='';expect(s.loading.value).toBe(false);
 finish({data:{items:[{id:99}]}});await old;expect(s.options.value).toEqual([]);expect(s.selectedClientId.value).toBe('');s.scope.stop();
});
it('does not select a client from a previous guardian or overwrite newer results',async()=>{
 const s=setup();let finish;s.api.get.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const old=s.search();
 s.guardianId.value=21;s.query.value='new';s.api.get.mockResolvedValueOnce({data:{items:[{id:5}]}});await s.search();
 finish({data:{items:[{id:99}]}});await old;expect(s.selectedClientId.value).toBe('5');s.scope.stop();
});
