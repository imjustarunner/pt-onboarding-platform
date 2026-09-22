import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Picker from '../PublicProviderSlotPicker.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
const slot={startAt:'2030-01-07T17:00:00.000Z',endAt:'2030-01-07T18:00:00.000Z'};
const hold={...slot,providerId:9,serviceType:'counseling',token:'opaque-test-token',expiresAt:null,recurring:true,timeZone:'America/Denver'};
const mountPicker=async()=>{wrapper=mount(Picker,{props:{agencySlug:'test',providerId:9,serviceType:'counseling'}});await flushPromises();};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-06T12:00:00Z'));sessionStorage.clear();api.get.mockReset().mockResolvedValue({data:{slots:[slot]}});api.post.mockReset().mockResolvedValue({data:{hold,active:true}});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
describe('public opening selection',()=>{
 it('requires an office choice and only offers times at that office',async()=>{
  api.get.mockResolvedValue({data:{slots:[{...slot,buildingId:11,buildingName:'Springs'},{...slot,startAt:'2030-01-08T17:00:00Z',buildingId:12,buildingName:'Denver'}]}});
  wrapper=mount(Picker,{props:{agencySlug:'test',providerId:9,officeLocations:[{id:11,name:'Springs'},{id:12,name:'Denver'}]}});await flushPromises();
  expect(wrapper.find('.opening-day').exists()).toBe(false);expect(wrapper.text()).toContain('Choose an office location');
  await wrapper.findAll('.office-buttons button').find(b=>b.text().includes('Denver')).trigger('click');await flushPromises();
  expect(wrapper.findAll('.opening-day button')).toHaveLength(1);expect(wrapper.find('.opening-day').text()).toContain('Denver');
  expect(api.get).toHaveBeenLastCalledWith(expect.any(String),expect.objectContaining({params:expect.objectContaining({officeId:'12'})}));
 });
 it('opens the requested format and week and keeps the office in the hold validation',async()=>{
  api.get.mockResolvedValue({data:{slots:[{...slot,buildingId:12,buildingName:'Denver'}]}});
  wrapper=mount(Picker,{props:{agencySlug:'test',providerId:9,fixedFormat:'IN_PERSON',initialWeek:'2030-01-07',officeId:'12',officeLocations:[{id:12,name:'Denver'}],timeZone:'America/Denver'}});await flushPromises();
  expect(wrapper.find('select').exists()).toBe(false);expect(wrapper.find('input[type=date]').element.value).toBe('2030-01-07');expect(wrapper.find('.opening-day button').text()).toContain('10:00');
  await wrapper.find('.opening-day button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith(expect.stringContaining('/holds'),expect.objectContaining({officeId:12,modality:'IN_PERSON'}),expect.any(Object));
 });
 it('creates only a hold, stores its token outside the URL, and discloses the pending weekly hold',async()=>{await mountPicker();await wrapper.find('.opening-day button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/public/agency-services/test/providers/9/holds',expect.objectContaining({startAt:slot.startAt,serviceType:'counseling',modality:'IN_PERSON'}),expect.anything());expect(api.post.mock.calls.some(([url])=>url.endsWith('/requests'))).toBe(false);expect(wrapper.text()).toContain('This is not a booking');expect(JSON.parse(sessionStorage.getItem('provider-hold:test')).token).toBe(hold.token);expect(wrapper.find('.opening-day button').attributes('disabled')).toBeDefined();});
 it('keeps weekly holds past fifteen minutes and refreshes their server status',async()=>{sessionStorage.setItem('provider-hold:test',JSON.stringify(hold));await mountPicker();expect(wrapper.text()).toContain('Weekly time held');await vi.advanceTimersByTimeAsync(16*60000);await flushPromises();expect(wrapper.text()).toContain('Weekly time held');expect(wrapper.text()).toContain('America/Denver');expect(wrapper.emitted('hold').at(-1)[0].token).toBe(hold.token);});
 it('clears a hold resolved by staff when checking server status',async()=>{sessionStorage.setItem('provider-hold:test',JSON.stringify(hold));api.post.mockResolvedValue({data:{active:false}});await mountPicker();expect(wrapper.find('.opening-held').exists()).toBe(false);expect(sessionStorage.getItem('provider-hold:test')).toBeNull();expect(wrapper.emitted('hold').at(-1)).toEqual([null]);});
 it('shows a conflict instead of falsely confirming a held time',async()=>{api.post.mockRejectedValue({response:{data:{error:{message:'Someone is holding this opening'}}}});await mountPicker();await wrapper.find('.opening-day button').trigger('click');await flushPromises();expect(wrapper.text()).toContain('Someone is holding this opening');expect(wrapper.find('.opening-held').exists()).toBe(false);expect(sessionStorage.getItem('provider-hold:test')).toBeNull();});
 it('does not reuse another provider’s hold and excludes past openings',async()=>{sessionStorage.setItem('provider-hold:test',JSON.stringify({...hold,providerId:10}));api.get.mockResolvedValue({data:{slots:[{startAt:'2020-01-01T10:00:00Z',endAt:'2020-01-01T11:00:00Z'}]}});await mountPicker();expect(wrapper.find('.opening-held').exists()).toBe(false);expect(wrapper.find('.opening-day button').exists()).toBe(false);});
});
