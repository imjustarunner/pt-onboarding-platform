import {beforeEach,expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),patch:vi.fn(),post:vi.fn()}}));import api from '../../../services/api';import Component from '../ClientPortalAccessEditor.vue';
let guardian;beforeEach(()=>{vi.clearAllMocks();guardian={guardian_user_id:10,first_name:'Synthetic',last_name:'Parent',email:'parent@example.test',relationship_type:'guardian',access_enabled:0,permissions_json:{noView:true}};api.get.mockImplementation(async path=>({data:path.endsWith('/guardians')?[guardian]:{id:8,full_name:'Synthetic Client',email:'client@example.test'}}));api.patch.mockResolvedValue({data:{ok:true}});api.post.mockResolvedValue({data:{ok:true}});});
it('edits an existing disabled relationship only after an explicit access choice and recorded reason',async()=>{const w=mount(Component,{props:{clientId:8,agencyId:42}});await flushPromises();expect(api.patch).not.toHaveBeenCalled();await w.get('select').setValue('payment_only');expect(w.text()).toContain('An existing privacy restriction remains');const save=w.findAll('button').find(b=>b.text()==='Save access');expect(save.element.disabled).toBe(true);await w.get('input[maxlength="1000"]').setValue('Client requested billing access only');await save.trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/clients/8/guardians/10',{accessMode:'payment_only',accessReason:'Client requested billing access only'},expect.objectContaining({headers:{'X-Agency-Id':'42'}}));expect(w.emitted('busy')).toEqual([[true],[false]]);w.unmount();});
it('requires confirmation of the client’s separate saved identity and defers the account email',async()=>{const w=mount(Component,{props:{clientId:8}});await flushPromises();await w.findAll('button').find(b=>b.text().includes('Prepare client’s own')).trigger('click');await flushPromises();expect(w.text()).toContain('client@example.test');expect(api.post).not.toHaveBeenCalled();await w.get('input[type=checkbox]').setValue(true);await w.get('form').trigger('submit.prevent');await flushPromises();expect(api.post).toHaveBeenCalledWith('/clients/8/guardians',expect.objectContaining({email:'client@example.test',relationshipType:'self',clientOwnContactConfirmed:true,sendInvitation:false}),expect.objectContaining({skipGlobalLoading:true}));w.unmount();});
it('clears the previous client’s identity and confirmation when another client is selected',async()=>{
 const w=mount(Component,{props:{clientId:8}});await flushPromises();await w.findAll('button').find(b=>b.text().includes('Prepare client’s own')).trigger('click');await flushPromises();await w.get('input[type=checkbox]').setValue(true);
 await w.setProps({clientId:9});await flushPromises();expect(w.find('form').exists()).toBe(false);expect(w.text()).not.toContain('client@example.test');expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('opens the ownership review automatically for an eligible Auricwell setup and waits for staff to confirm',async()=>{
 const w=mount(Component,{props:{clientId:8,agencyId:2,startSelfReview:true}});await flushPromises();
 expect(w.get('form').text()).toContain('client@example.test');
 expect(w.get('form button').element.disabled).toBe(true);
 expect(api.post).not.toHaveBeenCalled();
 w.unmount();
});
