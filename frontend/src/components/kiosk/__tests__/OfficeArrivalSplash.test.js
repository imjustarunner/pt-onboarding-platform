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
it('shows scores, average and change while keeping answers behind an expandable control',async()=>{
 const feedback={submissionId:4,completed:true,linked:true,respondentType:'caregiver',serviceType:'counseling',metrics:{connection:{current:9,average:7,changeFromStart:2},progress:{current:4,average:6,changeFromStart:-3}}};
 api.get.mockImplementation(async url=>({data:url.includes('/responses')?{visit:{completedAt:'2026-09-30',forms:[{id:'a',title:'Connection',fields:[{id:'heard',label:'Synthetic question',options:[{value:'9',label:'9 · Very well'}]}]}],answers:{a:{heard:'9'}},skippedFormIds:[]}}:{arrivals:[{...arrival,feedback}]}}));
 await open();const dialog=document.querySelector('[role=alertdialog]');expect(dialog.textContent).toContain('+2.0');expect(dialog.textContent).toContain('-3.0');expect(dialog.textContent).toContain('Guardian report');expect(dialog.querySelectorAll('.score-circle')).toHaveLength(2);expect(api.get.mock.calls.some(([url])=>url.includes('/responses'))).toBe(false);
 dialog.querySelector('[aria-expanded]').click();await flushPromises();expect(dialog.textContent).toContain('Synthetic question');expect(dialog.textContent).toContain('9 · Very well');
 api.get.mockResolvedValue({data:{arrivals:[{id:13,message:'Next arrival'}]}});await vi.advanceTimersByTimeAsync(10000);await flushPromises();expect(document.body.textContent).not.toContain('Synthetic question');
});
it('updates unfinished feedback while the alert remains visible',async()=>{
 const feedback={submissionId:4,completed:false,linked:false,metrics:{connection:{current:null,average:null},progress:{current:null,average:null}}};
 api.get.mockResolvedValue({data:{arrivals:[{...arrival,feedback}]}});await open();expect(document.body.textContent).toContain('Feedback is still in progress');
 api.get.mockResolvedValue({data:{arrivals:[{...arrival,feedback:{...feedback,completed:true,metrics:{connection:{current:8,average:null},progress:{current:7,average:null}}}}]}});await vi.advanceTimersByTimeAsync(10000);await flushPromises();expect(document.querySelector('.score-circle').textContent).toContain('8.0');expect(document.body.textContent).not.toContain('Feedback is still in progress');
});
