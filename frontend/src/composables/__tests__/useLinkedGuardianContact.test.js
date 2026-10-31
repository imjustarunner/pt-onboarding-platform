import {effectScope,nextTick,ref} from 'vue';
import {expect,it,vi} from 'vitest';
import {flushPromises} from '@vue/test-utils';
import {useLinkedGuardianContact} from '../useLinkedGuardianContact.js';
function setup(canRead=false){
 const clientId=ref(2298),canView=ref(canRead),guardians=ref([]),loading=ref(false),error=ref('');
 const api={get:vi.fn().mockResolvedValue({data:[{guardian_user_id:1437,first_name:'Dana',email:'testing@itsco.health'}]})};
 const scope=effectScope();scope.run(()=>useLinkedGuardianContact({clientId,canView,guardians,loading,error,api}));return {clientId,canView,guardians,loading,error,api,scope};
}
it('loads the standalone Sky contact when access resolves after the initial chart mount',async()=>{
 const s=setup();expect(s.api.get).not.toHaveBeenCalled();s.canView.value=true;await nextTick();await flushPromises();
 expect(s.api.get).toHaveBeenCalledWith('/clients/2298/guardians',{skipGlobalLoading:true});expect(s.guardians.value[0].first_name).toBe('Dana');s.scope.stop();
});
it('keeps unauthorized school views empty and clears contacts if access is revoked',async()=>{
 const s=setup();await flushPromises();expect(s.guardians.value).toEqual([]);expect(s.api.get).not.toHaveBeenCalled();
 s.canView.value=true;await nextTick();await flushPromises();s.canView.value=false;await nextTick();expect(s.guardians.value).toEqual([]);s.scope.stop();
});
it('ignores a stale client response after chart navigation',async()=>{
 const s=setup();let resolveOld;s.api.get.mockImplementationOnce(()=>new Promise(resolve=>resolveOld=resolve));
 s.canView.value=true;await nextTick();s.clientId.value=2297;await nextTick();await flushPromises();
 resolveOld({data:[{first_name:'Wrong previous contact'}]});await flushPromises();
 expect(s.guardians.value[0].first_name).toBe('Dana');expect(s.api.get).toHaveBeenLastCalledWith('/clients/2297/guardians',expect.anything());s.scope.stop();
});
