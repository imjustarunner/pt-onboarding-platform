import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../../../store/auth',()=>({useAuthStore:()=>({user:{id:42,role:'school_staff'}})}));
import EmailPanel from '../SchoolPortalEmailPanel.vue';
import MessagesPanel from '../SchoolPortalMessagesPanel.vue';
const email={id:8,subject:'School welcome',from:{email:'schools@example.org'},to:[{email:'group@example.org'}],sentAt:'2026-10-05T12:00:00Z',unread:true,preview:'Welcome'};
beforeEach(()=>{vi.clearAllMocks();m.get.mockImplementation(async url=>({data:url.endsWith('/emails')?{messages:[{...email}],groupEmail:'group@example.org',unreadCount:1,hasMore:false}:url.endsWith('/emails/8')?{...email,text:'Welcome',attachments:[]}:[]}));m.post.mockResolvedValue({data:{ok:true,sent:true}});});
it('starts with internal Messages and offers Email as a second tab',async()=>{
 const w=mount(MessagesPanel,{attachTo:document.body,props:{schoolOrganizationId:440},global:{stubs:{SchoolPortalEmailPanel:true}}});await flushPromises();
 expect(w.get('#school-messages-tab').attributes('aria-selected')).toBe('true');expect(w.get('#school-email-panel').isVisible()).toBe(false);
 await w.get('#school-email-tab').trigger('click');expect(w.get('#school-email-panel').isVisible()).toBe(true);expect(w.get('#school-messages-panel').isVisible()).toBe(false);w.unmount();
});
it('shows unread group email and marks it read only when opened',async()=>{
 const w=mount(EmailPanel,{props:{schoolOrganizationId:440}});await flushPromises();expect(m.post).not.toHaveBeenCalled();expect(w.text()).toContain('School welcome');expect(w.emitted('unread-update')[0]).toEqual([1]);
 await w.get('.email-item').trigger('click');await flushPromises();expect(m.post).toHaveBeenCalledWith('/school-portal/440/emails/8/read');expect(w.emitted('unread-update').at(-1)).toEqual([0]);w.unmount();
});
it('removes scripts, remote tracking images, forms and unsafe links from email HTML',async()=>{
 m.get.mockImplementation(async url=>({data:url.endsWith('/emails')?{messages:[{...email}],unreadCount:1}: {...email,html:'<script>alert(1)</script><img src="https://tracker.example.org/pixel"><form><input></form><a href="javascript:alert(1)">bad</a><p>Hello</p>',attachments:[]}}));
 const w=mount(EmailPanel,{props:{schoolOrganizationId:440}});await flushPromises();await w.get('.email-item').trigger('click');await flushPromises();const html=w.get('.email-body').html();expect(html).toContain('Hello');expect(html).not.toMatch(/<script|<img|<form|javascript:/);w.unmount();
});
it('preserves a draft and reports delivery failure without success',async()=>{
 m.post.mockRejectedValue({response:{data:{error:{message:'Email was not delivered'}}}});
 const w=mount(EmailPanel,{props:{schoolOrganizationId:440}});await flushPromises();await w.findAll('button').find(b=>b.text()==='New email').trigger('click');await w.get('input[type="email"]').setValue('person@example.org');await w.get('input[maxlength="250"]').setValue('Update');await w.get('textarea').setValue('Hello');await w.get('form').trigger('submit');await flushPromises();expect(w.text()).toContain('Email was not delivered');expect(w.get('textarea').element.value).toBe('Hello');expect(w.text()).not.toContain('Email sent.');w.unmount();
});
