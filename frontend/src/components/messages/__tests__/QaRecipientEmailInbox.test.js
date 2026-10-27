import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Inbox from '../QaRecipientEmailInbox.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1434,email:'qa.support.auricwell@example.com'}})}));
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{address:'qa.support.auricwell@example.com',items:[{id:7,subject:'Reminder',deliveryStatus:'sent'}]}});});
it('shows actual email status separately from external delivery evidence',async()=>{
  const wrapper=mount(Inbox);await flushPromises();expect(wrapper.text()).toContain('Reminder');expect(wrapper.text()).toContain('sent');expect(wrapper.text()).toContain('checked separately');wrapper.unmount();
});
it('renders email HTML in a sandbox without tracking requests or scripts',async()=>{
  const wrapper=mount(Inbox);await flushPromises();
  api.get.mockResolvedValueOnce({data:{subject:'Reminder',recipient:'qa.support.auricwell@example.com',body:'<script>alert(1)</script><p>Hello</p><img src="https://tracking.test/x"><a href="javascript:alert(1)">bad</a>'}});
  await wrapper.find('li button').trigger('click');await flushPromises();
  const frame=wrapper.get('iframe');expect(frame.attributes('sandbox')).not.toContain('allow-scripts');expect(frame.attributes('sandbox')).not.toContain('allow-same-origin');
  expect(frame.attributes('srcdoc')).not.toContain('<script>');expect(frame.attributes('srcdoc')).not.toContain('javascript:');expect(frame.attributes('srcdoc')).toContain('img-src data:');wrapper.unmount();
});
it('does not render an inbox for a rejected identity',async()=>{
  api.get.mockRejectedValueOnce({response:{status:404}});const wrapper=mount(Inbox);await flushPromises();expect(wrapper.find('details').exists()).toBe(false);wrapper.unmount();
});
it('makes a failed read visible instead of presenting an empty successful inbox',async()=>{
  api.get.mockRejectedValueOnce({response:{status:500}});const wrapper=mount(Inbox);await flushPromises();expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load');expect(wrapper.get('summary').text()).toContain('qa.support.auricwell@example.com');expect(wrapper.get('details').attributes('open')).toBeDefined();expect(wrapper.text()).not.toContain('No emails recorded');wrapper.unmount();
});
