import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import Splash from '../OfficeArrivalSplash.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
let wrapper;
const arrival={id:12,message:'Your 4pm appointment is waiting in the lobby.',email_status:'pending'};
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();api.get.mockResolvedValue({data:{arrivals:[arrival]}});api.post.mockResolvedValue({data:{ok:true}});});
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';vi.useRealTimers();});
async function open(){wrapper=mount(Splash,{attachTo:document.body});await flushPromises();}
it('shows an accessible arrival splash and acknowledgment cancels the queued alert',async()=>{
 await open();expect(document.querySelector('[role=alertdialog]').textContent).toContain('Your 4pm');
 document.querySelector('.arrival-primary').click();await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/notifications/office-arrivals/12/acknowledge',{inAppOnly:false},{skipGlobalLoading:true});expect(document.querySelector('[role=alertdialog]')).toBeNull();
});
it('offers in-app-only delivery while acknowledging this arrival',async()=>{
 await open();document.querySelector('.arrival-secondary').click();await flushPromises();
 expect(api.post.mock.calls[0][1]).toEqual({inAppOnly:true});
});
it('keeps the splash visible if acknowledgment fails',async()=>{
 api.post.mockRejectedValue(new Error('offline'));await open();document.querySelector('.arrival-primary').click();await flushPromises();
 expect(document.querySelector('[role=alert]').textContent).toContain('could not be saved');
});
it('removes an arrival acknowledged on another device on the next poll',async()=>{
 await open();api.get.mockResolvedValue({data:{arrivals:[]}});await vi.advanceTimersByTimeAsync(10_000);await flushPromises();expect(document.querySelector('[role=alertdialog]')).toBeNull();
});
