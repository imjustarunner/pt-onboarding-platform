import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import View from '../PeopleOperationsNotificationRecipients.vue';
const data=()=>({enabled:false,canEdit:true,senderIdentityId:11,senders:[{id:11,label:'People Operations',email:'po@tenant.test',ready:true}],recipients:[{id:7,name:'Reviewer',email:'reviewer@tenant.test',enabled:true},{id:9,name:'Other',email:'other@tenant.test',enabled:false}]});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:data()});api.put.mockResolvedValue({data:{...data(),enabled:true}});});
it('shows that notices are off and earlier submissions will not be sent',async()=>{const w=mount(View,{props:{agencyId:2}});await flushPromises();expect(w.text()).toContain('Submission notices · Off');expect(w.text()).toContain('Earlier submissions will not be sent');expect(w.text()).toContain('does not grant access');w.unmount();});
it('saves selected account IDs and enable choice with the current tenant scope',async()=>{const w=mount(View,{props:{agencyId:2}});await flushPromises();await w.findAll('input')[0].setValue(true);await w.findAll('input')[2].setValue(true);await w.get('form').trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledWith('/hiring/notification-recipients',{enabled:true,recipientIds:[7,9],senderIdentityId:11},{params:{agencyId:2}});expect(w.text()).toContain('future submissions');w.unmount();});
it('explains sender setup instead of pretending an unconfigured connection is ready',async()=>{api.get.mockResolvedValue({data:{...data(),senders:[]}});const w=mount(View,{props:{agencyId:2}});await flushPromises();expect(w.text()).toContain('connect a People Operations or agency messages sender');w.unmount();});
it('keeps nonadministrator reviewers read-only',async()=>{api.get.mockResolvedValue({data:{...data(),canEdit:false}});const w=mount(View,{props:{agencyId:2}});await flushPromises();expect(w.find('fieldset').attributes('disabled')).toBeDefined();expect(w.find('button').exists()).toBe(false);w.unmount();});
it('shows a save denial and never reports success',async()=>{api.put.mockRejectedValue({response:{data:{error:{message:'Reviewer access changed.'}}}});const w=mount(View,{props:{agencyId:2}});await flushPromises();await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role="alert"]').text()).toBe('Reviewer access changed.');expect(w.find('[role="status"]').exists()).toBe(false);w.unmount();});
it('discards an older agency response after switching tenants',async()=>{let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({data:{...data(),recipients:[]}});const w=mount(View,{props:{agencyId:2}});await w.setProps({agencyId:4});await flushPromises();finish({data:data()});await flushPromises();expect(w.text()).not.toContain('reviewer@tenant.test');expect(w.text()).toContain('No active hiring reviewers');w.unmount();});

it('shows why an invalid saved work address cannot be newly selected',async()=>{
 api.get.mockResolvedValue({data:{...data(),recipients:[{id:7,name:'Reviewer',email:'bad mailbox',emailEligible:false,emailIssue:'Save one valid work email address before selecting this reviewer.',enabled:false}]}});
 const w=mount(View,{props:{agencyId:2}});await flushPromises();
 expect(w.text()).toContain('Save one valid work email address');expect(w.findAll('input')[1].attributes('disabled')).toBeDefined();w.unmount();
});
