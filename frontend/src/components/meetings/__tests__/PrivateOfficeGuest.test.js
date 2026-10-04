import {mount,flushPromises} from '@vue/test-utils';
import {describe,it,expect,vi,afterEach} from 'vitest';
import Guest from '../PrivateOfficeGuest.vue';
afterEach(()=>vi.useRealTimers());
describe('public office check-in',()=>{
 it('opens without credentials, uses tenant branding, and permits a camera-free anonymous check-in',async()=>{
  const request=vi.fn(async(url,opts)=>url.endsWith('/public')?{room:{displayName:'Dr Sample',branding:{agencyName:'Practice A'}}}:opts?.method==='POST'?{lobby:{id:1,credential:'visit-secret',status:'waiting'}}:{lobby:{status:'waiting'}});
  const w=mount(Guest,{props:{slug:'sample',request},global:{stubs:{SupervisionWaitingRoomStage:{template:'<div>Waiting room music</div>'},TherapySessionWorkspace:true}}});await flushPromises();
  expect(w.text()).toContain('Practice A');expect(w.text()).toContain('Both are optional');expect(w.find('button[type=submit]').attributes('disabled')).toBeUndefined();await w.find('form').trigger('submit');await flushPromises();expect(w.text()).toContain('Waiting room music');expect(request.mock.calls[1][1].body.photoDataUrl).toBe('');w.unmount();
 });
 it('keeps a guest out of video until admitted and uses their visit credential',async()=>{
  vi.useFakeTimers();let admitted=false;
  const request=vi.fn(async(url,opts)=>{if(url.endsWith('/public'))return {room:{displayName:'Provider'}};if(url.endsWith('/video-token'))return {token:'media',sessionId:'test'};if(opts?.method==='POST')return {lobby:{id:4,credential:'secret',status:'waiting'}};return {lobby:{status:admitted?'admitted':'waiting'}};});
  const w=mount(Guest,{props:{slug:'sample',request},global:{stubs:{SupervisionWaitingRoomStage:true,TherapySessionWorkspace:{name:'TherapySessionWorkspace',template:'<div>Session tools</div>'}}}});await flushPromises();await w.find('form').trigger('submit');await flushPromises();await vi.advanceTimersByTimeAsync(4000);expect(w.text()).not.toContain('Session tools');admitted=true;await vi.advanceTimersByTimeAsync(4000);await flushPromises();expect(w.text()).toContain('Session tools');expect(request.mock.calls.find(([url])=>url.endsWith('/video-token'))[1].headers['X-Office-Visit']).toBe('secret');w.unmount();
 });
});
