import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Dialog from '../OfferedTimeDialog.vue';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api.js';
const item={replacementSlotId:20,startAt:'2030-01-05T17:00:00Z',endAt:'2030-01-05T18:00:00Z',invitedCount:2};
beforeEach(()=>vi.clearAllMocks());
it('shows each invited client, their deadline, and the available formats',async()=>{
  api.get.mockResolvedValue({data:{slot:{modality:'BOTH',roomLabel:'#7',buildingName:'Windchime',timeZone:'America/Denver'},recipients:[
    {offerId:1,clientName:'Test Client',offeredAt:'2030-01-01T17:00:00Z',expiresAt:'2030-01-03T17:00:00Z',status:'open'},
    {offerId:2,clientName:'Second Client',offeredAt:'2030-01-02T17:00:00Z',expiresAt:'2030-01-04T17:00:00Z',status:'requested',selectedModality:'VIRTUAL'}]}});
  const w=mount(Dialog,{props:{item},global:{stubs:{Teleport:true}}});await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/appointments/replacement-slots/20',{skipGlobalLoading:true});expect(w.text()).toContain('In office or virtual');
  const recipients=w.findAll('.offer-recipients li');expect(recipients).toHaveLength(2);expect(recipients[0].text()).toContain('Test Client');expect(recipients[0].text()).toContain('Jan 3, 2030');
  expect(recipients[1].text()).toContain('Jan 4, 2030');expect(recipients[1].text()).toContain('Chosen format: Virtual');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('does not reuse private recipients from a different calendar block while loading or denied',async()=>{
  api.get.mockResolvedValueOnce({data:{slot:{modality:'VIRTUAL'},recipients:[{offerId:1,clientName:'Private Client',status:'open'}]}});
  const w=mount(Dialog,{props:{item},global:{stubs:{Teleport:true}}});await flushPromises();expect(w.text()).toContain('Private Client');
  api.get.mockRejectedValueOnce({response:{data:{error:{message:'Access denied'}}}});await w.setProps({item:{...item,replacementSlotId:21}});await flushPromises();
  expect(w.text()).not.toContain('Private Client');expect(w.text()).toContain('Access denied');w.unmount();
});

it('shows sent/opened/portal response history on a confirmed session without release controls',async()=>{
  api.get.mockResolvedValue({data:{slot:{modality:'VIRTUAL',timeZone:'America/Denver'},recipients:[{offerId:1,clientName:'Client',status:'confirmed',
    deliveries:[{channel:'email',recipient:'parent@example.test',status:'sent',sentAt:'2030-01-01T17:00:00Z',openedAt:'2030-01-01T18:00:00Z'}],
    views:[{name:'Parent',firstViewedAt:'2030-01-01T19:00:00Z'}],outcomes:[{text:'Session canceled — requested session confirmed and scheduled.',providerEmailStatus:'sent'}]}]}});
  const w=mount(Dialog,{props:{item,historyOnly:true},global:{stubs:{Teleport:true}}});await flushPromises();
  expect(w.text()).toContain('parent@example.test');expect(w.text()).toContain('Email open detected');expect(w.text()).toContain('Parent viewed');
  expect(w.text()).toContain('confirmed and scheduled');expect(w.text()).toContain('Provider email: sent');expect(w.text()).not.toContain('Release this offered time');w.unmount();
});
