import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {reactive} from 'vue';
const session=vi.hoisted(()=>({auth:{},agency:{},lock:{}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>session.auth}));vi.mock('../../../store/agency',()=>({useAgencyStore:()=>session.agency}));vi.mock('../../../store/sessionLock',()=>({useSessionLockStore:()=>session.lock}));
import Splash from '../OfficeArrivalSplash.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
let wrapper;
const arrival={id:12,message:'Your 4pm appointment is waiting in the lobby.',email_status:'pending'};
beforeEach(()=>{session.auth=reactive({user:{id:1433,role:'provider'}});session.agency=reactive({currentAgency:{id:450}});session.lock=reactive({isLocked:false,verificationFailed:false});vi.useFakeTimers();vi.resetAllMocks();api.get.mockResolvedValue({data:{arrivals:[arrival]}});api.post.mockResolvedValue({data:{ok:true}});});
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
it('pauses arrival polls while locked and clears sensitive rows, then reloads after unlock',async()=>{await open();expect(document.body.textContent).toContain('Your 4pm');session.lock.isLocked=true;await flushPromises();expect(document.querySelector('[role=alertdialog]')).toBeNull();const count=api.get.mock.calls.length;window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(30000);expect(api.get).toHaveBeenCalledTimes(count);session.lock.isLocked=false;await flushPromises();expect(api.get).toHaveBeenCalledTimes(count+1);expect(document.body.textContent).toContain('Your 4pm');});
it('does not poll before a failed verification is recovered',async()=>{session.lock.verificationFailed=true;await open();expect(api.get).not.toHaveBeenCalled();session.lock.verificationFailed=false;await flushPromises();expect(api.get).toHaveBeenCalledTimes(1);});
it('ignores a pending old-account arrival response after scope changes',async()=>{let old;api.get.mockImplementationOnce(()=>new Promise(r=>old=r)).mockResolvedValue({data:{arrivals:[{id:15,message:'New account arrival'}]}});await open();session.auth.user={id:1434,role:'support'};session.agency.currentAgency={id:451};await flushPromises();old({data:{arrivals:[arrival]}});await flushPromises();expect(document.body.textContent).toContain('New account arrival');expect(document.body.textContent).not.toContain('Your 4pm');});
it('ignores an arrival request that completes after locking and surfaces genuine poll failures after unlocking',async()=>{let old;api.get.mockImplementationOnce(()=>new Promise(r=>old=r));await open();session.lock.isLocked=true;await flushPromises();old({data:{arrivals:[arrival]}});await flushPromises();expect(document.querySelector('[role=alertdialog]')).toBeNull();api.get.mockRejectedValue(new Error('unavailable'));session.lock.isLocked=false;await flushPromises();expect(document.body.textContent).toContain('Arrival notifications could not be checked.');});
it('keeps polling after acknowledging an arrival while an older refresh is pending',async()=>{await open();let old;api.get.mockImplementationOnce(()=>new Promise(r=>old=r));window.dispatchEvent(new Event('focus'));await flushPromises();document.querySelector('.arrival-primary').click();await flushPromises();old({data:{arrivals:[arrival]}});await flushPromises();api.get.mockResolvedValue({data:{arrivals:[{id:16,message:'Later arrival'}]}});await vi.advanceTimersByTimeAsync(10000);await flushPromises();expect(document.body.textContent).toContain('Later arrival');expect(document.body.textContent).not.toContain('Your 4pm');});
