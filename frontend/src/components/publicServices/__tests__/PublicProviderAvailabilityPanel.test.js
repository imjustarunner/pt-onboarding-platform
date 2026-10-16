import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Panel from '../PublicProviderAvailabilityPanel.vue';
import api from '../../../services/api';
const { push } = vi.hoisted(() => ({ push:vi.fn() }));
vi.mock('vue-router',()=>({useRouter:()=>({push})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const provider={id:9,firstName:'Example',displayName:'Example Provider',acceptingNewClients:false,office:true,details:{waitlistEnabled:true,typicalAvailability:['Saturday mornings']}};
const summary={timeZone:'America/Denver',onlineScheduling:false,waitlistEnabled:true,waitlistFormats:['IN_PERSON','VIRTUAL'],slots:[],inPerson:{status:'waitlist'},virtual:{status:'unavailable'},typicalAvailability:['Saturday mornings'],locations:[{id:3,name:'Example Office',address:'Denver, CO'}]};
const render=()=>mount(Panel,{props:{provider,agencySlug:'test'},global:{stubs:{Teleport:true,RouterLink:{name:'RouterLink',props:['to'],template:'<a :href="to"><slot/></a>'},PublicProviderSlotPicker:true}}});
beforeEach(()=>{vi.resetAllMocks();push.mockResolvedValue(undefined);sessionStorage.clear();api.get.mockImplementation(async url=>({data:url.endsWith('schedule-summary')?summary:{recaptchaRequired:false}}));});
const virtualOpening={format:'VIRTUAL',startAt:'2030-01-07T02:00:00Z',endAt:'2030-01-07T03:00:00Z',frequency:'WEEKLY'};
async function chooseVirtualOpening(){
 api.get.mockResolvedValue({data:{...summary,virtual:{status:'accepting'},slots:[virtualOpening]}});
 const w=render();await flushPromises();await w.get('.format-virtual .next-openings button').trigger('click');await flushPromises();return w;
}
describe('public availability and waitlist',()=>{
 it('does not reload availability when a parent rerenders the same provider object',async()=>{
  const w=render();await flushPromises();expect(api.get).toHaveBeenCalledTimes(1);
  await w.setProps({provider:{...provider,details:{...provider.details}}});await flushPromises();expect(api.get).toHaveBeenCalledTimes(1);
  await w.setProps({provider:{...provider,id:10}});await flushPromises();expect(api.get).toHaveBeenCalledTimes(2);w.unmount();
 });
 it('uses a later week’s available setting when the compact bar requests an opening beyond the initial summary',async()=>{
  const w=render();await flushPromises();
  const slot={...virtualOpening,startAt:'2030-03-06T17:00:00Z',endAt:'2030-03-06T18:00:00Z'};
  await w.vm.selectOpening({slot,schedule:{...summary,virtual:{status:'accepting'}}});await flushPromises();
  expect(w.get('[role=dialog]').text()).toContain('March 6, 2030');
  await w.get('.preferred-time-continue').trigger('click');await flushPromises();
  expect(JSON.parse(sessionStorage.getItem('provider-hold:test'))).toMatchObject({startAt:slot.startAt,endAt:slot.endAt,modality:'VIRTUAL',preferenceOnly:true});expect(push).toHaveBeenCalledTimes(1);w.unmount();
 });
 it('groups all local-date times together across UTC midnight and keeps the next week separate',async()=>{
  api.get.mockResolvedValue({data:{...summary,inPerson:{status:'accepting'},virtual:{status:'accepting'},slots:[{format:'VIRTUAL',startAt:'2030-01-03T02:00:00Z'},{format:'VIRTUAL',startAt:'2030-01-02T16:00:00Z'},{format:'VIRTUAL',startAt:'2030-01-09T16:00:00Z'}]}});
  const w=render();await flushPromises();const days=w.findAll('.format-virtual .next-openings>div');expect(days).toHaveLength(2);expect(days[0].findAll('.day-time')).toHaveLength(2);expect(days[0].findAll('strong')).toHaveLength(1);expect(days[1].findAll('.day-time')).toHaveLength(1);w.unmount();
 });
 it('shows only profile-selected typical hours while schedule loading is pending',async()=>{
  api.get.mockImplementation(()=>new Promise(()=>{}));
  const w=render();await flushPromises();
  expect(w.text()).toContain('Checking current openings');
  expect(w.find('.typical-availability').text()).toContain('Saturday mornings');
  expect(w.find('.typical-availability').text()).not.toContain('School-based');w.unmount();
 });
 it('ignores generated schedule hours in favor of the profile summary',async()=>{
  api.get.mockResolvedValue({data:{...summary,typicalAvailability:['School-based · Monday · School','In person · Monday, 5:00 PM']}});
  const w=render();await flushPromises();expect(w.find('.typical-availability').text()).toContain('Saturday mornings');expect(w.find('.typical-availability').text()).not.toContain('Monday');w.unmount();
 });
 it('preserves the chosen office when showing openings and ignores typed locations',async()=>{
  api.get.mockResolvedValue({data:{...summary,inPerson:{status:'accepting'},locations:[{id:11,name:'Springs'},{id:12,name:'Denver'}],slots:[{format:'IN_PERSON',buildingId:11,buildingName:'Springs',startAt:'2030-01-01T16:00:00Z'},{format:'IN_PERSON',buildingId:12,buildingName:'Denver',startAt:'2030-01-02T16:00:00Z'}]}});
  const w=mount(Panel,{props:{provider:{...provider,details:{locations:['Unassigned address']}},agencySlug:'test',officeId:'12'},global:{stubs:{RouterLink:true,PublicProviderSlotPicker:true}}});await flushPromises();
  expect(w.find('.next-openings').text()).toContain('Denver');expect(w.find('.next-openings').text()).not.toContain('Springs');expect(w.text()).not.toContain('Unassigned address');
  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('schedule-summary'),expect.objectContaining({params:{serviceType:'counseling'}}));w.unmount();
 });
 it('displays typical hours and Maps links even when booking is disabled',async()=>{const w=render();await flushPromises();expect(w.text()).toContain('Saturday mornings');expect(w.text()).toContain('No appointment times are posted');expect(w.find('a[target="_blank"]').attributes('href')).toContain('query=Example%20Office%2C%20Denver%2C%20CO');expect(w.findComponent({name:'PublicProviderSlotPicker'}).exists()).toBe(false);w.unmount();});
 it('confirms an in-person preference before taking its exact time and office into enrollment',async()=>{
  const slot={format:'IN_PERSON',buildingId:3,buildingName:'Example Office',startAt:'2030-01-01T16:00:00Z',endAt:'2030-01-01T17:00:00Z',frequency:'WEEKLY'};
  api.get.mockResolvedValue({data:{...summary,inPerson:{status:'accepting'},virtual:{status:'accepting'},slots:[slot]}});
  const w=render();await flushPromises();await w.get('.next-openings button').trigger('click');await flushPromises();
  const dialog=w.get('[role=dialog]');expect(dialog.text()).toContain('Request this time and enroll?');expect(dialog.text()).toContain('Tuesday, January 1, 2030');expect(dialog.text()).toContain('9:00 AM – 10:00 AM');expect(dialog.text()).toContain('Example Office');expect(dialog.text()).toContain('does not reserve or confirm an appointment');expect(dialog.text()).toContain('support team');
  expect(sessionStorage.getItem('provider-hold:test')).toBeNull();expect(w.emitted('hold')).toBeUndefined();expect(push).not.toHaveBeenCalled();
  await dialog.get('.preferred-time-continue').trigger('click');await flushPromises();
  expect(JSON.parse(sessionStorage.getItem('provider-hold:test'))).toMatchObject({providerId:9,preferenceOnly:true,startAt:slot.startAt,endAt:slot.endAt,modality:'IN_PERSON',buildingId:3,timeZone:'America/Denver',frequency:'WEEKLY'});
  expect(push).toHaveBeenCalledWith({path:'/join/test/counseling',query:expect.objectContaining({enrollmentSource:'provider',providerId:'9',format:'IN_PERSON',officeId:3})});
  expect(w.emitted('hold').at(-1)[0].preferenceOnly).toBe(true);expect(api.post).not.toHaveBeenCalled();expect(w.find('[role=dialog]').exists()).toBe(false);w.unmount();
 });
 it('shows the local day across UTC midnight and lets someone cancel without changing an existing hold',async()=>{
  const previous={providerId:10,token:'existing-reservation'};sessionStorage.setItem('provider-hold:test',JSON.stringify(previous));
  const w=await chooseVirtualOpening();expect(w.get('[role=dialog]').text()).toContain('Sunday, January 6, 2030');expect(w.get('[role=dialog]').text()).toContain('7:00 PM – 8:00 PM');
  await w.get('[role=dialog]').trigger('keydown',{key:'Escape'});expect(w.find('[role=dialog]').exists()).toBe(false);
  expect(JSON.parse(sessionStorage.getItem('provider-hold:test'))).toEqual(previous);expect(push).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(document.body.style.overflow).toBe('');w.unmount();
 });
 it('keeps the confirmation open on an old hold release failure and supports retry',async()=>{
  sessionStorage.setItem('provider-hold:test',JSON.stringify({providerId:10,token:'existing-reservation'}));
  api.post.mockRejectedValueOnce(new Error('Could not release the previous time. Please try again.')).mockResolvedValue({data:{ok:true}});
  const w=await chooseVirtualOpening();await w.get('.preferred-time-continue').trigger('click');await flushPromises();
  expect(w.get('[role=dialog] [role=alert]').text()).toContain('Could not release');expect(push).not.toHaveBeenCalled();expect(JSON.parse(sessionStorage.getItem('provider-hold:test')).token).toBe('existing-reservation');
  await w.get('.preferred-time-continue').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/public/agency-services/test/release-hold',{token:'existing-reservation'},expect.any(Object));
  expect(push).toHaveBeenCalledTimes(1);expect(JSON.parse(sessionStorage.getItem('provider-hold:test')).token).toBeUndefined();w.unmount();
 });
 it('disables repeat confirmation while enrollment is opening and preserves the time if navigation fails',async()=>{
  let finish;push.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const w=await chooseVirtualOpening();await w.get('.preferred-time-continue').trigger('click');
  expect(w.get('.preferred-time-continue').element.disabled).toBe(true);expect(w.get('.preferred-time-continue').text()).toBe('Continuing…');
  await w.get('.preferred-time-continue').trigger('click');expect(push).toHaveBeenCalledTimes(1);
  finish(new Error('navigation blocked'));await flushPromises();
  expect(w.get('[role=alert]').text()).toContain('preferred time is saved');expect(JSON.parse(sessionStorage.getItem('provider-hold:test')).startAt).toBe(virtualOpening.startAt);w.unmount();
 });
 it('never navigates away or claims success when the browser cannot save the preference',async()=>{
  const w=await chooseVirtualOpening();const save=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Could not save this preference. Please try again.');});
  await w.get('.preferred-time-continue').trigger('click');await flushPromises();
  expect(w.get('[role=dialog] [role=alert]').text()).toContain('Could not save');expect(push).not.toHaveBeenCalled();expect(w.emitted('hold')).toBeUndefined();save.mockRestore();w.unmount();
 });
 it('does not show the typical-hours fallback when appointments are posted',async()=>{
  api.get.mockResolvedValue({data:{...summary,inPerson:{status:'accepting'},virtual:{status:'accepting'},slots:[{format:'VIRTUAL',startAt:'2030-01-01T16:00:00Z'}]}});
  const w=mount(Panel,{props:{provider:{...provider,details:{}},agencySlug:'test'},global:{stubs:{RouterLink:true,PublicProviderSlotPicker:true}}});await flushPromises();expect(w.find('.typical-availability').exists()).toBe(false);expect(w.find('.next-openings').text()).toContain('Virtual');w.unmount();
 });
 it('offers selectable times only for enabled booking',async()=>{
  api.get.mockResolvedValue({data:{...summary,onlineScheduling:true,virtual:{status:'accepting'},slots:[{format:'VIRTUAL',startAt:'2030-01-01T16:00:00Z'}]}});
  const w=render();await flushPromises();expect(w.find('.format-virtual').text()).toContain('Reserve time');await w.find('.format-virtual .next-openings button').trigger('click');expect(w.findComponent({name:'PublicProviderSlotPicker'}).props('fixedFormat')).toBe('VIRTUAL');w.unmount();
 });
 it('opens the local calendar date for an evening opening that falls on the next UTC day',async()=>{
  api.get.mockResolvedValue({data:{...summary,onlineScheduling:true,virtual:{status:'accepting'},slots:[{format:'VIRTUAL',startAt:'2030-01-07T02:00:00Z'}]}});
  const w=render();await flushPromises();await w.find('.format-virtual .next-openings button').trigger('click');expect(w.findComponent({name:'PublicProviderSlotPicker'}).props('initialWeek')).toBe('2030-01-06');w.unmount();
 });
 it('explains direct scheduling for accepting providers without posted times',async()=>{
  api.get.mockResolvedValue({data:{...summary,waitlistEnabled:false,inPerson:{status:'accepting'}}});
  const w=mount(Panel,{props:{provider:{...provider,acceptingNewClients:true,details:{}},agencySlug:'test'},global:{stubs:{RouterLink:true,PublicProviderSlotPicker:true}}});await flushPromises();expect(w.text()).toContain('we’ll work with you directly to find a time');expect(w.text()).not.toContain('Not accepting');w.unmount();
 });
 it('keeps virtual times visible with an office filter and separates school capacity from appointments',async()=>{
  api.get.mockResolvedValue({data:{...summary,virtual:{status:'accepting'},inPerson:{status:'accepting'},school:{status:'accepting'},schools:[{id:1,name:'Open school',hasOpenings:true},{id:2,name:'Full school',hasOpenings:false}],slots:[{format:'VIRTUAL',startAt:'2030-01-01T16:00:00Z'},{format:'IN_PERSON',buildingId:3,buildingName:'Example Office',startAt:'2030-01-02T16:00:00Z'}]}});
  const w=mount(Panel,{props:{provider,agencySlug:'test',officeId:3},global:{stubs:{RouterLink:true,PublicProviderSlotPicker:true}}});await flushPromises();
  expect(w.find('.format-virtual .next-openings').text()).toContain('Virtual');expect(w.find('.format-virtual').text()).not.toContain('Example Office');
  expect(w.find('.format-inPerson .next-openings').text()).toContain('Example Office');expect(w.find('.format-school .next-openings').exists()).toBe(false);
  const schools=w.findAll('.school-locations article');expect(schools[0].text()).toContain('Accepting new clients');expect(schools[1].text()).toContain('Closed to new clients');w.unmount();
 });
 it('expands display-only times without mounting an interactive booking calendar',async()=>{
  api.get.mockResolvedValue({data:{...summary,inPerson:{status:'accepting'},virtual:{status:'accepting'},slots:Array.from({length:8},(_,i)=>({format:'VIRTUAL',startAt:`2030-01-${String(i+1).padStart(2,'0')}T16:00:00Z`}))}});
  const w=render();await flushPromises();expect(w.findAll('.format-virtual .next-openings>div')).toHaveLength(6);await w.find('.format-virtual .calendar-toggle').trigger('click');expect(w.findAll('.format-virtual .next-openings>div')).toHaveLength(8);expect(w.findComponent({name:'PublicProviderSlotPicker'}).exists()).toBe(false);w.unmount();
 });
 it('routes a format-specific waitlist request into full enrollment rather than a brief contact form',async()=>{
  const w=render();await flushPromises();
  const links=w.findAllComponents({name:'RouterLink'});
  const link=links.find(item=>item.text().includes('Join in-person waitlist'));
  expect(link.props('to')).toMatchObject({path:'/join/test/counseling',query:{enrollmentSource:'provider',providerId:'9',format:'IN_PERSON',serviceType:'counseling'}});
  expect(w.find('form').exists()).toBe(false);
  expect(w.text()).toContain('Complete full enrollment');
  expect(w.text()).toContain('does not guarantee placement');
  expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
 it('blocks closed-format enrollment and stale opening selection, even when the directory claims openings',async()=>{
  api.get.mockResolvedValue({data:{...summary,waitlistEnabled:true,inPerson:{status:'unavailable'},virtual:{status:'unavailable'},slots:[{format:'VIRTUAL',startAt:'2030-01-01T16:00:00Z'}]}});
  const w=render();await flushPromises();expect(w.find('.enrollment-link').exists()).toBe(false);expect(w.find('.next-openings').exists()).toBe(false);expect(w.text()).toContain('Inquire with our team');w.unmount();
 });
 it('does not offer enrollment before current intake status is loaded or when the request fails',async()=>{
  api.get.mockRejectedValue(new Error('Network unavailable'));
  const w=render();expect(w.find('.enrollment-link').exists()).toBe(false);await flushPromises();expect(w.find('.enrollment-link').exists()).toBe(false);expect(w.find('[role=alert]').exists()).toBe(true);w.unmount();
 });
});
