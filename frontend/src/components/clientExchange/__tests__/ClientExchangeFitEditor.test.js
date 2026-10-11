import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({put:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
import Editor from '../ClientExchangeFitEditor.vue';
beforeEach(()=>vi.clearAllMocks());
it('reviews existing preferences and saves changes on the client profile',async()=>{
 const saved={specialties:['Depression']},next={...saved,modalities:['EMDR']};api.put.mockResolvedValue({data:{matchingPreferences:next}});
 const w=mount(Editor,{props:{clientId:4,agencyId:2,modelValue:saved}});await w.get('button').trigger('click');const fields=w.findComponent({name:'ClientMatchingPreferences'});expect(fields.props('modelValue')).toEqual(saved);fields.vm.$emit('update:modelValue',next);
 await w.get('.btn-primary').trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/client-exchange/clients/4/matching-preferences',{agencyId:2,matchingPreferences:next});expect(w.emitted('update:modelValue')[0]).toEqual([next]);w.unmount();
});
it('does not apply a late save response to a different client',async()=>{
 let resolve;api.put.mockReturnValue(new Promise(r=>{resolve=r;}));const w=mount(Editor,{props:{clientId:4,agencyId:2,modelValue:{}}});await w.get('button').trigger('click');await w.get('.btn-primary').trigger('click');await w.setProps({clientId:5});resolve({data:{matchingPreferences:{specialties:['Depression']}}});await flushPromises();expect(w.emitted('update:modelValue')).toBeUndefined();w.unmount();
});
