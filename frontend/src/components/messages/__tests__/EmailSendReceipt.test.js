import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Receipt from '../EmailSendReceipt.vue';
let wrapper;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
const receipt=()=>({scheduled:true,sent:false,conversationId:10,messageId:40,scheduledSendAt:new Date(Date.now()+120000).toISOString()});
it('shows the actual two-minute window and offers cancel, not a fixed 20 seconds',async()=>{
 const r=receipt();const check=vi.fn(async()=>({send_status:'scheduled',scheduled_send_at:r.scheduledSendAt}));wrapper=mount(Receipt,{props:{receipt:r,checkStatus:check}});
 expect(wrapper.text()).toContain('2m 0s');await vi.advanceTimersByTimeAsync(30000);expect(wrapper.text()).toContain('1m 30s');
 await wrapper.findAll('button')[0].trigger('click');expect(wrapper.emitted('undo')).toHaveLength(1);
});
it('never claims sent merely because the scheduled time elapsed',async()=>{
 const r={...receipt(),scheduledSendAt:new Date(Date.now()+20000).toISOString()};wrapper=mount(Receipt,{props:{receipt:r,checkStatus:async()=>({send_status:'scheduled',scheduled_send_at:r.scheduledSendAt})}});
 await vi.advanceTimersByTimeAsync(25000);expect(wrapper.text()).toContain('Not sent yet');expect(wrapper.text()).toContain('still cancel');
});
it.each(['sent','failed','sending'])('shows server-confirmed %s and removes cancellation once claimed',async(send_status)=>{
 wrapper=mount(Receipt,{props:{receipt:receipt(),checkStatus:async()=>({send_status})}});await vi.advanceTimersByTimeAsync(5000);
 expect(wrapper.findAll('button').some(b=>b.text().includes('Undo'))).toBe(false);expect(wrapper.emitted('status')[0][0].state).toBe(send_status);
});
it('retains the last known state on timeout and ignores stale requests after switching messages',async()=>{
 let resolve;wrapper=mount(Receipt,{props:{receipt:receipt(),checkStatus:()=>new Promise(r=>resolve=r)}});await vi.advanceTimersByTimeAsync(5000);
 await wrapper.setProps({receipt:{...receipt(),messageId:41},checkStatus:async()=>{throw Error('offline');}});
 resolve({send_status:'sent'});await flushPromises();expect(wrapper.text()).toContain('Not sent yet');
 await vi.advanceTimersByTimeAsync(5000);expect(wrapper.text()).toContain('Could not refresh');expect(wrapper.text()).not.toContain('Sent');
});
it('does not offer undo for an immediately sent message',()=>{
 wrapper=mount(Receipt,{props:{receipt:{messageId:40,sent:true},checkStatus:vi.fn()}});expect(wrapper.text()).toContain('Sent');expect(wrapper.findAll('button').some(b=>b.text().includes('Undo'))).toBe(false);
});
