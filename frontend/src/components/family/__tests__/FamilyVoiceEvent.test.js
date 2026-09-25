import {describe,it,expect,vi,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Voice from '../FamilyVoiceEvent.vue';
const wrappers=[];
function render(extra={}){
 const http=Object.assign(()=>{}, {post:vi.fn().mockResolvedValue({data:{draft:{kind:'event',title:'Soccer'},review:['Add end time.']}})});
 const wrapper=mount(Voice,{props:{http,householdId:7,timezone:'America/Denver',initiallyOpen:true,...extra}});wrappers.push(wrapper);return {wrapper,http};
}
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());delete window.SpeechRecognition;delete window.webkitSpeechRecognition;delete navigator.maxTouchPoints;vi.useRealTimers();vi.restoreAllMocks();});
describe('family voice event review flow',()=>{
 it('supports typing/dictation without SpeechRecognition and only requests a draft',async()=>{
  const {wrapper,http}=render();expect(wrapper.text()).toContain('keyboard’s dictation');expect(wrapper.find('.voice-fill').attributes('disabled')).toBeDefined();
  await wrapper.find('textarea').setValue('Soccer tomorrow at five');await wrapper.find('.voice-fill').trigger('click');await flushPromises();
  expect(http.post).toHaveBeenCalledWith('/households/7/voice/event-draft',{transcript:'Soccer tomorrow at five'},expect.anything());expect(http.post).toHaveBeenCalledTimes(1);
  expect(wrapper.emitted('draft')[0][0]).toMatchObject({kind:'event',title:'Soccer'});expect(wrapper.text()).toContain('Add end time.');expect(wrapper.text()).toContain('Save to our family');
  expect(wrapper.findAll('button').every(b=>b.attributes('type')==='button')).toBe(true);
 });
 it('captures cumulative speech without duplicated interim words and waits for Stop before drafting',async()=>{
  let rec;window.webkitSpeechRecognition=class{constructor(){rec=this;}start=vi.fn();stop=vi.fn();abort=vi.fn();};
  const {wrapper,http}=render();expect(rec).toBeUndefined();await wrapper.find('.voice-mic').trigger('click');
  rec.onresult({results:[[{transcript:'Soccer tomorrow'}]]});rec.onresult({results:[[{transcript:'Soccer tomorrow at five'}]]});await flushPromises();
  expect(wrapper.find('textarea').element.value).toBe('Soccer tomorrow at five');expect(wrapper.find('.voice-fill').attributes('disabled')).toBeDefined();expect(http.post).not.toHaveBeenCalled();
  await wrapper.find('.voice-mic').trigger('click');expect(rec.stop).toHaveBeenCalled();
  rec.onresult({results:[[{transcript:'Soccer tomorrow at five PM'}]]});rec.onend();await flushPromises();
  await wrapper.find('.voice-fill').trigger('click');await flushPromises();expect(http.post.mock.calls[0][1].transcript).toBe('Soccer tomorrow at five PM');
 });
 it('handles denied microphone access and keeps manual entry available',async()=>{
  let rec;window.SpeechRecognition=class{constructor(){rec=this;}start(){}abort=vi.fn();};
  const {wrapper}=render();await wrapper.find('.voice-mic').trigger('click');rec.onerror({error:'not-allowed'});await flushPromises();
  expect(wrapper.find('[role=alert]').text()).toContain('denied');expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined();expect(rec.abort).toHaveBeenCalled();
 });
 it('preserves words on AI failure and blocks repeated requests while preparing',async()=>{
  const {wrapper,http}=render();let reject;http.post.mockImplementation(()=>new Promise((_,r)=>reject=r));
  await wrapper.find('textarea').setValue('Camping this weekend');await wrapper.find('.voice-fill').trigger('click');
  expect(wrapper.find('.voice-fill').attributes('disabled')).toBeDefined();expect(wrapper.emitted('active').at(-1)).toEqual([true]);
  reject(new Error('Unavailable'));await flushPromises();expect(wrapper.find('textarea').element.value).toBe('Camping this weekend');expect(wrapper.emitted('draft')).toBeUndefined();expect(wrapper.find('[role=alert]').text()).toContain('Your words are still here');
 });
 it('stops capture when closed and ignores an AI result arriving after cancellation',async()=>{
  const {wrapper,http}=render();let resolve;http.post.mockImplementation(()=>new Promise(r=>resolve=r));
  await wrapper.find('textarea').setValue('Camping');await wrapper.find('.voice-fill').trigger('click');const signal=http.post.mock.calls[0][2].signal;
  await wrapper.find('.voice-toggle').trigger('click');expect(signal.aborted).toBe(true);
  resolve({data:{draft:{title:'Camping'}}});await flushPromises();expect(wrapper.emitted('draft')).toBeUndefined();
 });
 it('releases the microphone on unmount and limits one capture to a minute',async()=>{
  vi.useFakeTimers();let rec;window.SpeechRecognition=class{constructor(){rec=this;}start(){}stop=vi.fn();abort=vi.fn();};
  const {wrapper}=render();await wrapper.find('.voice-mic').trigger('click');rec.onstart();rec.onresult({results:[[{transcript:'A plan'}]]});await vi.advanceTimersByTimeAsync(60000);expect(rec.stop).toHaveBeenCalled();wrapper.unmount();expect(rec.abort).toHaveBeenCalled();
 });
 it('unlocks the form when the speech service never starts or never produces words',async()=>{
  vi.useFakeTimers();let rec;window.SpeechRecognition=class{constructor(){rec=this;}start(){}abort=vi.fn();};
  const {wrapper}=render();await wrapper.find('.voice-mic').trigger('click');await vi.advanceTimersByTimeAsync(8000);
  expect(rec.abort).toHaveBeenCalled();expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined();expect(wrapper.text()).toContain('microphone did not start');
  await wrapper.find('.voice-mic').trigger('click');rec.onstart();await vi.advanceTimersByTimeAsync(15000);
  expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined();expect(wrapper.text()).toContain('No words came through');
 });
 it('uses keyboard dictation on an iPad in desktop mode without constructing WebKit speech',async()=>{
  vi.spyOn(navigator,'platform','get').mockReturnValue('MacIntel');
  Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true});
  window.webkitSpeechRecognition=vi.fn();const {wrapper,http}=render();
  expect(wrapper.find('.voice-mic').exists()).toBe(false);expect(wrapper.find('.voice-dictation').exists()).toBe(true);
  await wrapper.find('.voice-dictation').trigger('click');expect(window.webkitSpeechRecognition).not.toHaveBeenCalled();
  await wrapper.find('textarea').setValue('A dictated plan');await wrapper.find('.voice-fill').trigger('click');await flushPromises();
  expect(http.post.mock.calls[0][1]).toEqual({transcript:'A dictated plan'});
 });
 it('immediately cancels pending AI work for manual entry and ignores a late response',async()=>{
  let resolve;const {wrapper,http}=render();http.post.mockImplementation(()=>new Promise(r=>resolve=r));
  await wrapper.find('textarea').setValue('Plan');await wrapper.find('.voice-fill').trigger('click');
  await wrapper.find('.voice-manual').trigger('click');expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined();
  expect(http.post.mock.calls[0][2].signal.aborted).toBe(true);
  resolve({data:{draft:{title:'Late draft'}}});await flushPromises();expect(wrapper.emitted('draft')).toBeUndefined();
 });

});
