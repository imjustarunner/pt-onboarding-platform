import {effectScope,ref} from 'vue';import {expect,it,vi} from 'vitest';import {useAgencyMemberships} from '../useAgencyMemberships.js';
function setup(){const memberships=ref([]),actorId=ref(1434),api={get:vi.fn()},scope=effectScope();let loader;scope.run(()=>loader=useAgencyMemberships({api,actorId,memberships}));return {memberships,actorId,api,scope,...loader};}
it('ignores a stale sibling request failure after newer successful access lookup',async()=>{
 const s=setup();let fail;s.api.get.mockImplementationOnce(()=>new Promise((resolve,reject)=>fail=reject)).mockResolvedValueOnce({data:[{id:450}]});const old=s.load();await s.load();fail(new Error('old failed'));await old;
 expect(s.memberships.value).toEqual([{id:450}]);expect(s.error.value).toBe('');expect(s.loading.value).toBe(false);s.scope.stop();
});
it('shows a current lookup error, preserves known membership for a transient failure, clears on auth rejection',async()=>{
 const s=setup();s.api.get.mockResolvedValueOnce({data:[{id:450}]}).mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce({response:{status:401}});
 await s.load();await s.load();expect(s.memberships.value).toEqual([{id:450}]);expect(s.error.value).toContain('could not be checked');await s.load();expect(s.memberships.value).toEqual([]);s.scope.stop();
});
it('never carries a previous actor membership into another account',async()=>{
 const s=setup();s.api.get.mockResolvedValueOnce({data:[{id:450}]}).mockRejectedValueOnce(new Error('network'));await s.load();s.actorId.value=999;await s.load();expect(s.memberships.value).toEqual([]);s.scope.stop();
});
