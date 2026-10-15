import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Panel from '../GuardianAppointmentsPanel.vue';
vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
import api from '../../../services/api.js';
const prefs = () => ({ channels: { email: true, sms: true }, optionalRemindersEnabled: true, providerPushedUpdatesEnabled: true });
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async url => ({ data: url.endsWith('/appointments') ? { appointments: [{ id: 12, startAt: '2026-10-07 16:00:00', status: 'scheduled', requests: [], serviceSetting: { isSchool: true, locationLabel: 'School A' } }] } : prefs() }));
  api.put.mockImplementation(async (_, input) => ({ data: input }));
});
it('shows the actual school and absence instructions without requiring confirmation', async () => {
  const w = mount(Panel, { props: { clientId: 4 } }); await flushPromises();
  expect(w.text()).toContain('Service location: School A');
  expect(w.text()).toContain('No confirmation is needed');
  expect(w.text()).not.toContain('Y to confirm');
});
it('lets a guardian turn off texts while retaining email', async () => {
  const w = mount(Panel, { props: { clientId: 4 } }); await flushPromises();
  await w.findAll('input[type=checkbox]')[1].setValue(false);
  await w.findAll('button').find(b => b.text() === 'Save my preferences').trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/guardian-portal/clients/4/reminder-preferences', expect.objectContaining({ channels: { email: true, sms: false } }));
  expect(w.text()).toContain('still requires recorded consent');
});
it('does not expose or change a family’s preferences in staff preview', async () => {
  const w = mount(Panel, { props: { clientId: 4, preview: true } }); await flushPromises();
  expect(api.get).not.toHaveBeenCalled(); expect(w.find('details').exists()).toBe(false);
});
const offeredAppointment=()=>({id:12,startAt:'2030-01-02T17:00:00Z',status:'canceled_by_provider',requests:[],replacementOffer:{status:'open',expiresAt:'2030-01-03T17:00:00Z',nextAppointment:{id:13,displayWhen:'Thursday, January 10 at 10 AM',timeZone:'America/Denver',recurring:true},slots:[{key:'shared',label:'January 4, 10 AM',modality:'VIRTUAL'}]}});
it('opening a replacement link does not decline or select anything',async()=>{
  window.history.replaceState({},'', '/?appointmentId=12&offerAction=keep_next');
  api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[offeredAppointment()]}:prefs()}));
  const w=mount(Panel,{props:{clientId:4}});await flushPromises();
  expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('See you next session — Thursday, January 10 at 10 AM');expect(w.text()).toContain('first completed selection reserves a time');w.unmount();
  window.history.replaceState({},'', '/');
});
it('requires a selection and makes a one-time reservation request only after clicking',async()=>{
  api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[offeredAppointment()]}:prefs()}));api.post.mockResolvedValue({data:{status:'requested'}});
  const w=mount(Panel,{props:{clientId:4}});await flushPromises();const reserve=()=>w.findAll('button').find(b=>b.text()==='Reserve selected time for confirmation');
  expect(reserve().attributes('disabled')).toBeDefined();await w.find('input[type="radio"]').setValue(true);await reserve().trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/4/appointments/12/replacement-offer',{action:'select',selectedKey:'shared',selectedModality:'VIRTUAL'},expect.anything());expect(w.text()).toContain('Your other appointments stay scheduled');w.unmount();
});
it('keeps the next appointment only when the client explicitly chooses that action',async()=>{
  api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[offeredAppointment()]}:prefs()}));api.post.mockResolvedValue({data:{status:'declined'}});
  const w=mount(Panel,{props:{clientId:4}});await flushPromises();await w.findAll('button').find(b=>b.text().startsWith('See you next session')).trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/4/appointments/12/replacement-offer',expect.objectContaining({action:'decline'}),expect.anything());w.unmount();
});

it('requires the client to choose a format for a dual-format time',async()=>{
  const a=offeredAppointment();Object.assign(a.replacementOffer.slots[0],{modality:'BOTH',availableFormats:['IN_PERSON','VIRTUAL'],buildingName:'Windchime',roomLabel:'#7'});
  api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[a]}:prefs()}));api.post.mockResolvedValue({data:{status:'requested'}});
  const w=mount(Panel,{props:{clientId:4}});await flushPromises();const reserve=()=>w.findAll('button').find(b=>b.text()==='Reserve selected time for confirmation');
  await w.find('input[type=radio]').setValue(true);expect(reserve().attributes('disabled')).toBeDefined();expect(w.text()).toContain('In office — Windchime #7');
  await w.find('input[value=VIRTUAL]').setValue(true);expect(reserve().attributes('disabled')).toBeUndefined();await reserve().trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/4/appointments/12/replacement-offer',{action:'select',selectedKey:'shared',selectedModality:'VIRTUAL'},expect.anything());w.unmount();
});
it('offers only virtual when the physical choice has become unavailable',async()=>{
  const a=offeredAppointment();Object.assign(a.replacementOffer.slots[0],{modality:'BOTH',availableFormats:['VIRTUAL']});
  api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[a]}:prefs()}));api.post.mockResolvedValue({data:{status:'requested'}});
  const w=mount(Panel,{props:{clientId:4}});await flushPromises();await w.find('input[type=radio]').setValue(true);
  expect(w.find('fieldset.offer-formats').exists()).toBe(false);await w.findAll('button').find(b=>b.text()==='Reserve selected time for confirmation').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({selectedModality:'VIRTUAL'}),expect.anything());w.unmount();
});
