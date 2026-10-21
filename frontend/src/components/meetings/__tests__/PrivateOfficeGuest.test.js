import {mount,flushPromises} from '@vue/test-utils';
import {describe,it,expect,vi,afterEach} from 'vitest';
import Guest from '../PrivateOfficeGuest.vue';
afterEach(()=>{vi.useRealTimers();sessionStorage.clear();});
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

it('shows the agency logo and expandable public provider profile before and after check-in',async()=>{
 const room={displayName:'Dr Sample',branding:{agencyName:'Practice A',agencyLogoUrl:'/agency.svg'},provider:{name:'Dr Sample',photoUrl:'/provider.jpg',credential:'LPC',bio:'A public introduction.',languages:['English','Spanish']}};
 const request=vi.fn(async(url,opts)=>url.endsWith('/public')?{room}:opts?.method==='POST'?{lobby:{id:1,credential:'synthetic',status:'waiting'}}:{lobby:{status:'waiting'}});
 const w=mount(Guest,{props:{slug:'sample',request},global:{stubs:{SupervisionWaitingRoomStage:true,TherapySessionWorkspace:true}}});await flushPromises();
 for(const phase of ['form','waiting']){
  if(phase==='waiting'){await w.find('form').trigger('submit');await flushPromises();}
  expect(w.find('img[alt="Practice A logo"]').attributes('src')).toBe('/agency.svg');
  expect(w.find('.provider-card img').attributes('src')).toBe('/provider.jpg');
  expect(w.find('.provider-card summary').text()).toContain('Dr Sample, LPC');
  expect(w.find('.provider-profile').text()).toContain('A public introduction.');
  expect(w.find('.provider-profile').text()).toContain('English · Spanish');
 }
 w.unmount();
});

it('restores the same admitted visit after reload and reconnects without creating a new identity',async()=>{
 vi.useFakeTimers();sessionStorage.setItem('auricwell-office-visit:sample',JSON.stringify({id:4,credential:'x'.repeat(43),displayName:'Returning guest'}));
 const request=vi.fn(async url=>url.endsWith('/public')?{room:{displayName:'Provider'}}:url.endsWith('/video-token')?{sessionId:'same-media',token:'synthetic'}:{lobby:{status:'admitted',identified:true}});
 const video={name:'TherapySessionWorkspace',template:'<div>In the original visit</div>'};
 const w=mount(Guest,{props:{slug:'sample',request},global:{stubs:{SupervisionWaitingRoomStage:true,TherapySessionWorkspace:video}}});await flushPromises();await vi.advanceTimersByTimeAsync(4000);await flushPromises();expect(w.text()).toContain('In the original visit');
 w.findComponent(video).vm.$emit('disconnected');await flushPromises();await vi.advanceTimersByTimeAsync(4000);await flushPromises();expect(w.text()).toContain('In the original visit');
 expect(request.mock.calls.filter(([p])=>p.endsWith('/video-token')).every(([,o])=>o.headers['X-Office-Visit']==='x'.repeat(43))).toBe(true);
 expect(request.mock.calls.some(([p,o])=>p.endsWith('/lobby')&&o.method==='POST')).toBe(false);w.unmount();expect(request.mock.calls.some(([p])=>p.endsWith('/leave'))).toBe(false);
});

it('shows private office availability and keeps waiting messages out of the session workspace',async()=>{
 vi.useFakeTimers();let availability='in_session';
 const request=vi.fn(async(url,options)=>url.endsWith('/public')?{room:{displayName:'Timmy Turner',provider:{firstName:'Timmy'}}}:url.endsWith('/messages')?{messages:[],canSend:true}:options?.method==='POST'?{lobby:{id:8,credential:'a'.repeat(43)}}:{lobby:{status:'waiting',availability}});
 const w=mount(Guest,{props:{slug:'sample',request},global:{stubs:{SupervisionWaitingRoomStage:true,TherapySessionWorkspace:true}}});await flushPromises();await w.find('form').trigger('submit');await flushPromises();await vi.advanceTimersByTimeAsync(4000);
 expect(w.text()).toContain('Timmy is currently in a session');expect(w.text()).toContain('Only you and Timmy');
 expect(request.mock.calls.find(([url])=>url.endsWith('/messages'))[1].headers['X-Office-Visit']).toBe('a'.repeat(43));
 availability='available';await vi.advanceTimersByTimeAsync(4000);expect(w.text()).toContain('Timmy is in the office');
 availability='away';await vi.advanceTimersByTimeAsync(4000);expect(w.text()).toContain('Timmy is away');w.unmount();
});
