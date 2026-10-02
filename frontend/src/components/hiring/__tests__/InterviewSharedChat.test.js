import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
import Chat from '../InterviewSharedChat.vue';
let w;
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:{messages:[]}});m.post.mockResolvedValue({data:{id:1}});});
afterEach(()=>w?.unmount());
it('clearly labels shared visibility and sends only message text',async()=>{
 w=mount(Chat,{props:{endpoint:'/team-meetings/7/interview-chat'}});await flushPromises();
 expect(w.text()).toContain('Everyone in this interview can see');await w.find('input').setValue('Welcome, Jamie');await w.find('form').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/team-meetings/7/interview-chat',{text:'Welcome, Jamie'},expect.objectContaining({skipAuthRedirect:true}));expect(w.find('input').element.value).toBe('');
});
it('preserves unsent text when the request fails and renders messages as text',async()=>{
 m.get.mockResolvedValue({data:{messages:[{id:1,text:'<img src=x onerror=alert(1)>',authorName:'Jamie',roleLabel:'Applicant'}]}});m.post.mockRejectedValue(new Error('offline'));
 w=mount(Chat,{props:{endpoint:'/applicant/token/chat'}});await flushPromises();expect(w.find('img').exists()).toBe(false);
 await w.find('input').setValue('Keep this');await w.find('form').trigger('submit');await flushPromises();expect(w.find('input').element.value).toBe('Keep this');expect(w.text()).toContain('Message was not sent');
});
