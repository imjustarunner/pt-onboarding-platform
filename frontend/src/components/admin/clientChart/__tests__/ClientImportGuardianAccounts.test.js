import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
import Accounts from '../ClientImportGuardianAccounts.vue';
const contacts=[{affiliationId:50,fullName:'First Parent',email:'first@example.test',relationshipType:'Mother',appointmentReminders:'Email'},{affiliationId:51,fullName:'Second Parent',email:'second@example.test',relationshipType:'Father',appointmentReminders:'Text (SMS) and Email'},{affiliationId:52,fullName:'Other Parent',relationshipType:'Guardian'}];
let linked;
beforeEach(()=>{vi.clearAllMocks();linked=[{guardian_user_id:40,first_name:'First',last_name:'Parent',email:'first@example.test',relationship_type:'guardian',relationship_title:'Mother',access_enabled:1,created_at:'2026-01-01'}];m.get.mockImplementation(async()=>({data:linked}));m.post.mockImplementation(async()=>{linked=[...linked,{guardian_user_id:41,first_name:'Second',last_name:'Parent',email:'second@example.test',relationship_type:'guardian',relationship_title:'Father',access_enabled:0,created_at:'2026-01-02'}];return {data:{result:{...contacts[1],portalAccount:{prepared:true,userId:41,invitationSent:false}}}};});});
it('shows the first guardian and adds the second from their own saved contact',async()=>{
 const w=mount(Accounts,{props:{clientId:12,agencyId:2,contacts}});await flushPromises();
 expect(w.text()).toContain('Parent / Guardian 1');expect(w.get('article').text()).toContain('First Parent');expect(w.find('option[value="50"]').exists()).toBe(false);expect(w.get('option[value="52"]').element.disabled).toBe(true);
 await w.get('select').setValue('51');expect(w.text()).toContain('Text (SMS) and Email');
 await w.findAll('button').find(b=>b.text()==='Add Parent / Guardian 2').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledExactlyOnceWith('/clients/12/chart-import/contacts/51/portal-account',{},expect.objectContaining({headers:{'X-Agency-Id':'2'}}));
 expect(w.findAll('article')).toHaveLength(2);expect(w.findAll('article')[1].text()).toContain('Second Parent');expect(w.emitted('prepared')).toHaveLength(1);expect(w.emitted('busy')).toEqual([[true],[false]]);w.unmount();
});
it('does not create a second login for another contact with the same email',async()=>{
 const w=mount(Accounts,{props:{clientId:12,agencyId:2,contacts:[...contacts,{affiliationId:53,fullName:'Shared Email',email:'FIRST@example.test'}]}});await flushPromises();expect(w.find('option[value="53"]').exists()).toBe(false);expect(m.post).not.toHaveBeenCalled();w.unmount();
});
it('retains the selected second parent after a failure and allows retry',async()=>{
 m.post.mockRejectedValueOnce({response:{data:{error:{message:'Please retry'}}}});
 const w=mount(Accounts,{props:{clientId:12,agencyId:2,contacts}});await flushPromises();await w.get('select').setValue('51');
 await w.findAll('button').find(b=>b.text()==='Add Parent / Guardian 2').trigger('click');await flushPromises();expect(w.text()).toContain('Please retry');expect(w.get('select').element.value).toBe('51');expect(w.emitted('prepared')).toBeUndefined();
 await w.findAll('button').find(b=>b.text()==='Add Parent / Guardian 2').trigger('click');await flushPromises();expect(w.emitted('prepared')).toHaveLength(1);w.unmount();
});
it('ignores a previous client’s delayed linked accounts',async()=>{
 let resolve;m.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));const w=mount(Accounts,{props:{clientId:12,agencyId:2,contacts}});await flushPromises();
 linked=[];await w.setProps({clientId:13});await flushPromises();resolve({data:[{...contacts[0],guardian_user_id:99,first_name:'Previous',last_name:'Guardian',relationship_type:'guardian'}]});await flushPromises();expect(w.text()).not.toContain('Previous Guardian');expect(w.findAll('article')).toHaveLength(0);w.unmount();
});
