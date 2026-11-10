import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Search from '../ClinicalDiagnosisSearch.vue';
const api=vi.hoisted(()=>({post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();api.post.mockResolvedValue({data:{items:[{code:'F41.1',description:'Generalized anxiety disorder'}]}});});
afterEach(()=>vi.useRealTimers());
it('shows ranked codes and descriptions for partial input and selects only on an explicit keyboard action',async()=>{
 const w=mount(Search,{props:{agencyId:2,modelValue:'',dateOfService:'2026-11-09'}});
 await w.get('input').setValue('gene');await vi.advanceTimersByTimeAsync(250);await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clinical-notes/diagnosis-search',{agencyId:2,query:'gene',dateOfService:'2026-11-09'},expect.objectContaining({skipGlobalLoading:true}));
 expect(w.get('[role=listbox]').text()).toContain('F41.1 — Generalized anxiety disorder');expect(w.emitted('select')).toBeUndefined();
 await w.get('input').trigger('keydown',{key:'ArrowDown'});await w.get('input').trigger('keydown',{key:'Enter'});
 expect(w.emitted('select')[0][0].code).toBe('F41.1');expect(w.emitted('update:modelValue').at(-1)[0]).toBe('F41.1');
 await w.setProps({modelValue:'F41.1'});await w.setProps({modelValue:''});expect(w.get('input').element.value).toBe('');w.unmount();
});
it('ignores stale results and retains typed text after a search failure',async()=>{
 let reply;api.post.mockImplementationOnce(()=>new Promise(resolve=>{reply=resolve;}));const w=mount(Search,{props:{agencyId:2,modelValue:''}});
 await w.get('input').setValue('gene');await vi.advanceTimersByTimeAsync(250);await w.get('input').setValue('depress');reply({data:{items:[{code:'F41.1',description:'Stale match'}]}});await flushPromises();expect(w.text()).not.toContain('Stale match');
 api.post.mockRejectedValueOnce({response:{data:{error:{message:'Search unavailable'}}}});await vi.advanceTimersByTimeAsync(250);await flushPromises();expect(w.get('input').element.value).toBe('depress');expect(w.text()).toContain('Search unavailable');w.unmount();
});
