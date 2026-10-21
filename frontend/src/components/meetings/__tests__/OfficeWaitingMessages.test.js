import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,afterEach} from 'vitest';
import Chat from '../OfficeWaitingMessages.vue';
afterEach(()=>vi.useRealTimers());
it('explains the private audience, offers an explicit send, and does not send on open',async()=>{
 const request=vi.fn(async()=>({messages:[],canSend:true}));
 const w=mount(Chat,{props:{request,recipient:'Timmy',notice:'Timmy is currently in a session.'}});await flushPromises();
 expect(w.text()).toContain('Only you and Timmy');expect(w.text()).toContain('currently in a session');expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][0].method).toBe('GET');
 await w.find('textarea').setValue('We are ready.');await w.find('form').trigger('submit');await flushPromises();
 expect(request.mock.calls.find(([o])=>o.method==='POST')[0].body.body).toBe('We are ready.');expect(w.find('textarea').element.value).toBe('');w.unmount();
});
it('reuses the send identifier after a network failure and polls for replies',async()=>{
 vi.useFakeTimers();let sends=0;
 const request=vi.fn(async options=>{if(options.method==='POST'&&++sends===1)throw Error('offline');return {messages:[{id:3,author:'provider',body:'I will be with you shortly.'}],canSend:true};});
 const w=mount(Chat,{props:{request,recipient:'Timmy'}});await flushPromises();await w.find('textarea').setValue('Ready');await w.find('form').trigger('submit');await flushPromises();expect(w.text()).toContain('could not be sent');
 await w.find('form').trigger('submit');await flushPromises();const posts=request.mock.calls.filter(([o])=>o.method==='POST');expect(posts[0][0].body.nonce).toBe(posts[1][0].body.nonce);
 await vi.advanceTimersByTimeAsync(5000);expect(w.text()).toContain('I will be with you shortly.');w.unmount();const count=request.mock.calls.length;await vi.advanceTimersByTimeAsync(10000);expect(request).toHaveBeenCalledTimes(count);
});
it('disables composing after the visit ends',async()=>{const w=mount(Chat,{props:{recipient:'Timmy',request:async()=>({messages:[],canSend:false})}});await flushPromises();expect(w.find('textarea').exists()).toBe(false);expect(w.text()).toContain('This visit has ended');w.unmount();});
