import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Disposition from '../NoteBillingDisposition.vue';
import api from '../../../services/api';
const auth=vi.hoisted(()=>({user:{role:'super_admin'}}));
vi.mock('../../../store/auth.js',()=>({useAuthStore:()=>auth}));
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
let wrapper;
beforeEach(()=>{vi.resetAllMocks();auth.user.role='super_admin';api.post.mockResolvedValue({data:{message:'Saved without billing'}});});
afterEach(()=>wrapper?.unmount());
async function confirm(){await wrapper.get('textarea').setValue('Already documented in Therapy Notes EHR');await wrapper.get('input[type=checkbox]').setValue(true);}
it.each(['provider','admin','support'])('does not offer administrative exclusion to %s',role=>{
 auth.user.role=role;wrapper=mount(Disposition,{props:{agencyId:2,noteId:7}});expect(wrapper.find('form').exists()).toBe(false);
});
it('requires confirmation and uses the existing note without signing or preparing a claim',async()=>{
 wrapper=mount(Disposition,{props:{agencyId:2,noteId:7}});await wrapper.get('form').trigger('submit');expect(api.post).not.toHaveBeenCalled();
 await confirm();await wrapper.get('select').setValue('therapy_notes');await wrapper.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/7/billing-disposition',{agencyId:2,disposition:'therapy_notes',reason:'Already documented in Therapy Notes EHR',confirmed:true},expect.anything());
 expect(wrapper.emitted('saved')).toHaveLength(1);expect(api.post).toHaveBeenCalledTimes(1);
});
it('retries a failed annotation against the same unsigned draft',async()=>{
 const saveDraft=vi.fn(async()=>71);api.post.mockRejectedValueOnce(Error('Temporary failure'));
 wrapper=mount(Disposition,{props:{agencyId:2,saveDraft}});await confirm();await wrapper.get('form').trigger('submit');await flushPromises();
 await wrapper.get('form').trigger('submit');await flushPromises();expect(saveDraft).toHaveBeenCalledOnce();expect(api.post.mock.calls.map(c=>c[0])).toEqual(Array(2).fill('/medical-billing/notes/71/billing-disposition'));
});
it('does not apply a delayed old draft to a newly selected client/practice',async()=>{
 let resolve;const saveDraft=vi.fn(()=>new Promise(r=>{resolve=r;}));wrapper=mount(Disposition,{props:{agencyId:2,saveDraft}});await confirm();await wrapper.get('form').trigger('submit');
 await wrapper.setProps({agencyId:9,noteId:99});resolve(71);await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(wrapper.get('textarea').element.value).toBe('');
});
