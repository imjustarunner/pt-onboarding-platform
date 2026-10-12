import {it,expect,vi,beforeEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:null})}));vi.mock('../../../utils/trainingVideo',()=>({connectTrainingVideos:vi.fn()}));vi.mock('../../admin/DraftHtmlEditor.vue',()=>({default:{template:'<div />'}}));
import Reader from '../WorkplaceHandbookReader.vue';
const render=props=>mount(Reader,{props:{accessMode:'token',token:'private-link',agencyId:2,...props}});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{digest:{id:1,status:'draft'},entries:[{id:1,subject:'Communicated changes',changed_content:'Read these changes'}]}});});
it('allows review of communicated draft changes without publishing the handbook',async()=>{const w=render();await flushPromises();const button=w.get('.ack-row button');expect(button.element.disabled).toBe(false);await button.trigger('click');expect(w.emitted('acknowledged')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();w.unmount();});
it('shows question errors and preserves text, then confirms a successful retry',async()=>{const w=render();await flushPromises();await w.get('.ask textarea').setValue('My handbook question');api.post.mockRejectedValueOnce(new Error('network'));await w.get('.ask button').trigger('click');await flushPromises();expect(w.text()).toContain('Your question could not be sent');expect(w.get('textarea').element.value).toBe('My handbook question');api.post.mockResolvedValue({data:{id:1,support_ticket_id:3}});await w.get('.ask button').trigger('click');await flushPromises();expect(w.text()).toContain('Question sent to People Operations');expect(w.get('textarea').element.value).toBe('');w.unmount();});
it('keeps preview review disabled',async()=>{const w=render({previewMode:true});await flushPromises();expect(w.find('.ack-row button').exists()).toBe(false);w.unmount();});
it('opens exact handbook sections alongside each change without leaving the update',async()=>{
 api.get.mockResolvedValue({data:{digest:{id:1,status:'draft'},entries:[{id:7,subject:'School mileage reimbursement',changed_content:'Mileage change',handbook_location_status:'linked',handbook_locations:[{slug:'mileage-reimbursement-policy',title:'Mileage Reimbursement Policy',path:'Benefits › Mileage Reimbursement Policy',sourceLabel:'Supplied handbook · October 2026',sourcePage:41,bodyHtml:'<p>The actual handbook mileage policy.</p><script>bad()</script>'}]}]}});
 const w=render();await flushPromises();expect(w.get('.handbook-location summary').text()).toContain('Benefits › Mileage Reimbursement Policy');
 const detail=w.get('details');detail.element.open=true;await detail.trigger('toggle');expect(detail.element.open).toBe(true);expect(detail.text()).toContain('The actual handbook mileage policy.');expect(detail.text()).toContain('Original page 41');expect(detail.find('script').exists()).toBe(false);expect(w.get('.ack-row button').element.disabled).toBe(false);w.unmount();
});
it('explicitly identifies an update whose handbook section has not yet been linked',async()=>{const w=render();await flushPromises();expect(w.text()).toContain('An exact handbook section has not been linked yet');expect(w.find('details').exists()).toBe(false);w.unmount();});

it('opens the supplied library handbook directly without the updates feed or signature action', async () => {
 api.get.mockResolvedValue({data:{handbook:{beta:true,metadata:{organization:'ITSCO'},sections:[{slug:'welcome',title:'Welcome',body_html:'<p>The company handbook.</p>',content_status:'ready'}]}}});
 const w=render({accessMode:'authenticated',libraryMode:true}); await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/provider-update/handbook/library',expect.objectContaining({params:{agencyId:2}}));
 expect(w.get('.book-page').text()).toContain('The company handbook.');
 expect(w.text()).toContain('Beta edition');
 expect(w.text()).not.toContain('No handbook updates');
 expect(w.find('.reader-tabs').exists()).toBe(false); expect(w.find('.ack-row').exists()).toBe(false);
 expect(api.post).not.toHaveBeenCalled(); w.unmount();
});
it('explains when this organization has no handbook instead of showing an empty digest',async()=>{
 api.get.mockResolvedValue({data:{handbook:null}});const w=render({accessMode:'authenticated',libraryMode:true});await flushPromises();
 expect(w.text()).toContain('A handbook has not been added for this organization');expect(w.text()).not.toContain('No handbook updates');w.unmount();
});
