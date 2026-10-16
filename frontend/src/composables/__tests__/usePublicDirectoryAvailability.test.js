import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {ref} from 'vue';
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
let api,usePublicDirectoryAvailability,wrapper,state,enabled,query;
beforeEach(async()=>{vi.resetModules();sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-09T15:00:00Z'));api=(await import('../../services/api')).default;api.get.mockReset();api.get.mockResolvedValue({data:{providers:[]}});({usePublicDirectoryAvailability}=await import('../usePublicDirectoryAvailability'));enabled=ref(false);query=ref({});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
function render(){wrapper=mount({setup(){state=usePublicDirectoryAvailability('itsco',enabled,query);return{};},template:'<div/>'});}
describe('directory refresh boundaries',()=>{
 it('does not request all providers on a profile, reuses saved directory results, and refreshes after five minutes',async()=>{
  render();await flushPromises();expect(api.get).not.toHaveBeenCalled();
  enabled.value=true;await flushPromises();expect(api.get).toHaveBeenCalledTimes(2);
  enabled.value=false;await flushPromises();await vi.advanceTimersByTimeAsync(240000);expect(api.get).toHaveBeenCalledTimes(2);
  enabled.value=true;await flushPromises();expect(api.get).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60001);await flushPromises();expect(api.get).toHaveBeenCalledTimes(4);
 });
 it('keeps saved results visible during refresh and after failure',async()=>{
  api.get.mockResolvedValue({data:{providers:[{id:9,availability:{nextAvailableAt:'2030-01-10T17:00:00Z',slots:[{startAt:'2030-01-10T17:00:00Z'}]}}]}});
  enabled.value=true;render();await flushPromises();expect(state.availability.value[9]).toBeDefined();
  let reject;api.get.mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));const job=state.load({force:true});await flushPromises();
  expect(state.loading.value).toBe(false);expect(state.availability.value[9]).toBeDefined();reject(new Error('Offline'));await job;expect(state.error.value).toContain('Saved availability');expect(state.availability.value[9]).toBeDefined();
 });
 it('never publishes an earlier filter response over the current filter',async()=>{
  const pending=[];api.get.mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));enabled.value=true;render();await flushPromises();
  query.value={officeId:'7'};await flushPromises();expect(pending).toHaveLength(4);
  pending[2]({data:{providers:[]}});pending[3]({data:{providers:[]}});await flushPromises();
  pending[0]({data:{providers:[{id:99,availability:{}}]}});pending[1]({data:{providers:[]}});await flushPromises();expect(state.availability.value).toEqual({});
 });
});
