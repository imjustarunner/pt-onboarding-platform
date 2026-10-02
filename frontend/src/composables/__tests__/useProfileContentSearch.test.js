import { describe,it,expect,vi,afterEach,beforeEach } from 'vitest';
import { mount,flushPromises } from '@vue/test-utils';
import { defineComponent,ref,computed,nextTick } from 'vue';
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
import api from '../../services/api';
import { useProfileContentSearch,revealProfileSearchTarget } from '../useProfileContentSearch.js';
let wrapper;
beforeEach(()=>vi.stubGlobal('CSS',{escape:value=>String(value).replace(/[^a-z0-9_-]/gi,'')}));
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();api.get.mockReset();document.body.innerHTML='';});
function harness(){
 let state;
 wrapper=mount(defineComponent({setup(){
  const root=ref(null),scope=ref('u1-a1'),user=ref(1),base=ref([{tabId:'my',mySection:'account',label:'Account'}]);
  const index=useProfileContentSearch({root,scopeKey:scope,userId:user,activeTarget:computed(()=>({tabId:'my',mySection:'account'})),baseTargets:base,canLoadFields:ref(true)});
  state={...index,scope,user,base};return {root};
 },template:'<div ref="root"><div data-profile-my-section="account"><section id="contact"><h3>Contact</h3>Current user</section></div><div data-profile-my-section="kudos" style="display:none"><section id="kudos"><h3>Recognition</h3>Private team</section></div></div>'}));
 return state;
}
describe('scoped profile search index and navigation',()=>{
 it('ignores stale responses after a user or agency switch',async()=>{
  let resolveFields;
  api.get.mockImplementation(url=>url==='/user-info-categories'?Promise.resolve({data:[]}):new Promise(resolve=>resolveFields=resolve));
  const s=harness();const pending=s.load();s.scope.value='u2-a2';s.user.value=2;await nextTick();
  resolveFields({data:[{id:1,value:'Old user private value'}]});await pending;
  expect(s.fields.value).toEqual([]);expect(s.loading.value).toBe(false);
  api.get.mockResolvedValue({data:[]});await s.load();
  expect(api.get).toHaveBeenCalledWith('/users/2/user-info',expect.any(Object));
 });
 it('does not expose mounted but unavailable My Account categories',async()=>{
  const s=harness();s.scan();expect(s.targets.value.some(t=>t.mySection==='kudos')).toBe(false);
  s.base.value.push({tabId:'my',mySection:'kudos',label:'Kudos'});expect(s.targets.value.some(t=>t.sectionId==='kudos')).toBe(true);
 });
 it('retains navigation and reports metadata failures without caching the failure',async()=>{
  api.get.mockRejectedValue(new Error('offline'));const s=harness();await s.load();
  expect(s.loadError.value).toContain('still available');expect(s.targets.value.length).toBeGreaterThan(0);
  api.get.mockResolvedValue({data:[]});await s.load();expect(s.loadError.value).toBe('');
 });
 it('reveals a lazy field, opens its details, focuses it, and highlights it',async()=>{
  vi.useFakeTimers();const root=document.createElement('div');document.body.append(root);
  const scroll=vi.fn();Element.prototype.scrollIntoView=scroll;
  const onField=event=>{expect(event.detail.userId).toBe(7);if(root.children.length)return;root.innerHTML='<details><summary>More</summary><div id="field-9">CBT</div></details>';root.querySelector('#field-9').getClientRects=()=>[{}];};
  window.addEventListener('profile-search-field',onField);
  const done=await revealProfileSearchTarget(ref(root),{tabId:'my',fieldId:9,sectionId:'field-9'},{userId:7});
  window.removeEventListener('profile-search-field',onField);
  expect(done).toBe(true);expect(root.querySelector('details').open).toBe(true);expect(document.activeElement.id).toBe('field-9');expect(scroll).toHaveBeenCalled();
  expect(document.activeElement.classList.contains('profile-search-highlight')).toBe(true);
  await vi.advanceTimersByTimeAsync(2300);expect(document.activeElement.classList.contains('profile-search-highlight')).toBe(false);
 });
 it('stops waiting when navigation scope changes',async()=>{
  vi.useFakeTimers();let current=true;const root=ref(document.createElement('div'));
  const pending=revealProfileSearchTarget(root,{sectionId:'missing'},{isCurrent:()=>current});await nextTick();current=false;await vi.advanceTimersByTimeAsync(130);
  expect(await pending).toBe(false);
 });
});
