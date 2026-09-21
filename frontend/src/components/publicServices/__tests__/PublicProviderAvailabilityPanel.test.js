import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Panel from '../PublicProviderAvailabilityPanel.vue';
import api from '../../../services/api';
import {websiteCaptchaToken} from '../../../utils/websiteCaptcha';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../utils/websiteCaptcha',()=>({websiteCaptchaToken:vi.fn(async()=> 'test-captcha')}));
const provider={id:9,firstName:'Example',displayName:'Example Provider',acceptingNewClients:false,office:true,details:{waitlistEnabled:true,typicalAvailability:['Saturday mornings']}};
const summary={timeZone:'America/Denver',onlineScheduling:false,waitlistEnabled:true,waitlistFormats:['IN_PERSON','VIRTUAL'],slots:[],inPerson:{status:'waitlist'},virtual:{status:'unavailable'},typicalAvailability:['Saturday mornings'],locations:[{id:3,name:'Example Office',address:'Denver, CO'}]};
const render=()=>mount(Panel,{props:{provider,agencySlug:'test'},global:{stubs:{RouterLink:{props:['to'],template:'<a :href="to"><slot/></a>'},PublicProviderSlotPicker:true}}});
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('schedule-summary')?summary:{recaptchaRequired:false}}));});
describe('public availability and waitlist',()=>{
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
  api.get.mockResolvedValue({data:{...summary,locations:[{id:11,name:'Springs'},{id:12,name:'Denver'}],slots:[{format:'IN_PERSON',buildingId:11,buildingName:'Springs',startAt:'2030-01-01T16:00:00Z'},{format:'IN_PERSON',buildingId:12,buildingName:'Denver',startAt:'2030-01-02T16:00:00Z'}]}});
  const w=mount(Panel,{props:{provider:{...provider,details:{locations:['Unassigned address']}},agencySlug:'test',officeId:'12'},global:{stubs:{RouterLink:true,PublicProviderSlotPicker:true}}});await flushPromises();
  expect(w.find('.next-openings').text()).toContain('Denver');expect(w.find('.next-openings').text()).not.toContain('Springs');expect(w.text()).not.toContain('Unassigned address');
  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('schedule-summary'),expect.objectContaining({params:expect.objectContaining({officeId:'12'})}));w.unmount();
 });
 it('displays typical hours and Maps links even when booking is disabled',async()=>{const w=render();await flushPromises();expect(w.text()).toContain('Saturday mornings');expect(w.text()).toContain('No appointment times are posted');expect(w.find('a[target="_blank"]').attributes('href')).toContain('query=Example%20Office%2C%20Denver%2C%20CO');expect(w.findComponent({name:'PublicProviderSlotPicker'}).exists()).toBe(false);w.unmount();});
 it('shows availability without time selection when online booking is disabled',async()=>{
  api.get.mockResolvedValue({data:{...summary,slots:[{format:'IN_PERSON',buildingId:3,buildingName:'Example Office',startAt:'2030-01-01T16:00:00Z'}]}});
  const w=render();await flushPromises();expect(w.find('.next-openings').text()).toContain('Example Office');expect(w.text()).toContain('online time selection is not enabled');expect(w.text()).not.toContain('View full calendar & request a time');w.unmount();
 });
 it('offers selectable times only for enabled booking',async()=>{
  api.get.mockResolvedValue({data:{...summary,onlineScheduling:true,slots:[{format:'VIRTUAL',startAt:'2030-01-01T16:00:00Z'}]}});
  const w=render();await flushPromises();expect(w.text()).toContain('View full calendar & request a time');w.unmount();
 });
 it('explains direct scheduling for accepting providers without posted times',async()=>{
  api.get.mockResolvedValue({data:{...summary,waitlistEnabled:false,inPerson:{status:'accepting'}}});
  const w=mount(Panel,{props:{provider:{...provider,acceptingNewClients:true,details:{}},agencySlug:'test'},global:{stubs:{RouterLink:true,PublicProviderSlotPicker:true}}});await flushPromises();expect(w.text()).toContain('we’ll work with you directly to find a time');expect(w.text()).not.toContain('Not accepting');w.unmount();
 });
 it('joins a waitlist through a persisted request and requires a contact method',async()=>{
  const w=render();await flushPromises();await w.findAll('button').find(b=>b.text()==='Join waitlist').trigger('click');
  await w.find('form').trigger('submit');await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('Enter an email address or phone number');
  await w.find('input[autocomplete=name]').setValue('Visitor');await w.find('input[type=email]').setValue('visitor@example.test');await w.find('input[type=checkbox]').setValue(true);
  api.post.mockResolvedValue({data:{ok:true,ticketId:77}});await w.find('form').trigger('submit');await flushPromises();
  expect(websiteCaptchaToken).toHaveBeenCalledWith(undefined,'public_agency_support',false);
  expect(api.post).toHaveBeenCalledWith('/public/agency-services/test/providers/9/waitlist',expect.objectContaining({name:'Visitor',email:'visitor@example.test',serviceType:'counseling',format:'IN_PERSON'}),expect.any(Object));
  expect(w.text()).toContain('Reference #77');w.unmount();
 });
 it('does not offer a waitlist for a closed provider or claim success on an unconfirmed submission',async()=>{
  api.get.mockResolvedValueOnce({data:{...summary,waitlistEnabled:false}});const w=render();await flushPromises();expect(w.text()).not.toContain('Join waitlist');expect(w.text()).toContain('Inquire with our team');w.unmount();
 });
});
