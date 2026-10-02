import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Queue from '../ContactDocumentationQueue.vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:mocks}));
let wrapper;
const task={key:'email:10',source_type:'email',source_id:10,subject:'Family appointment',message_count:3,latest_message_id:33,needsReview:true,revision:0,purpose:'',clients:[{id:1,name:'First child'},{id:2,name:'Second child'}],thread:{messages:[{id:31,from:{name:'Parent',email:'parent@example.test'},to:[{email:'provider@example.test'}],body_text:'Both children',created_at:'2026-10-01T10:00:00Z'}]}};
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockImplementation(async url=>({data:url.endsWith('contact-documentation')?{items:[task]}:task}));mocks.post.mockResolvedValue({data:{...task,revision:1,purpose:'Coordinate appointments',needsReview:false}});});
afterEach(()=>wrapper?.unmount());
async function open(){wrapper=mount(Queue,{props:{agencyId:2},global:{stubs:{Teleport:true}}});await flushPromises();await wrapper.find('button').trigger('click');await wrapper.get('.contact-task').trigger('click');await flushPromises();}
it('shows one task for three replies and automatically displays recipients, children, and message content',async()=>{
 await open();expect(wrapper.findAll('.contact-task')).toHaveLength(1);expect(wrapper.text()).toContain('3 messages');expect(wrapper.text()).toContain('First child, Second child');expect(wrapper.text()).toContain('provider@example.test');expect(wrapper.text()).toContain('Both children');
});
it('requires a purpose and completes only the message boundary the user actually opened',async()=>{
 await open();const button=wrapper.findAll('button').find(b=>b.text()==='Mark reviewed');expect(button.attributes('disabled')).toBeDefined();await wrapper.get('textarea').setValue('Coordinate appointments');await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='Mark reviewed').trigger('click');await flushPromises();expect(mocks.post).toHaveBeenCalledWith('/clinical-notes/contact-documentation/email/10',expect.objectContaining({purpose:'Coordinate appointments',complete:true,revision:0,reviewedThroughId:33}),expect.anything());expect(wrapper.text()).toContain('Contact documentation completed.');
});
it('saves an unfinished purpose when closing and keeps it open when saving fails',async()=>{
 await open();await wrapper.get('textarea').setValue('In progress');mocks.post.mockRejectedValueOnce(new Error('offline'));await wrapper.findAll('button').find(b=>b.text()==='Close').trigger('click');await flushPromises();expect(wrapper.find('[role=dialog]').exists()).toBe(true);expect(wrapper.get('textarea').element.value).toBe('In progress');expect(wrapper.text()).toContain('Your text is still here');expect(mocks.post.mock.calls[0][1].complete).toBe(false);
});
