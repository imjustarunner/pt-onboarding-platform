import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import StaffEventInviteePanel from '../StaffEventInviteePanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper, count;
beforeEach(()=>{
  vi.useFakeTimers();count=0;
  api.get.mockImplementation(async url=>({data:url.endsWith('/responses')?{summary:[{key:'yes',label:'Yes',total:count}],responses:count?[{userId:7,name:'Demo Invitee',responseKey:'yes',responseLabel:'Yes',source:'sms'}]:[]}:[]}));
});
afterEach(()=>{wrapper?.unmount();vi.clearAllMocks();vi.useRealTimers();});
it('refreshes SMS totals and rows in the background and when the organizer returns',async()=>{
  wrapper=mount(StaffEventInviteePanel,{props:{agencyId:2,eventId:353,potluckEnabled:true}});await flushPromises();
  expect(wrapper.text()).toContain('Yes: 0');
  const needInputs=wrapper.findAll('.need-create input');await needInputs[0].setValue('Fruit tray');
  count=1;await vi.advanceTimersByTimeAsync(30000);await flushPromises();
  expect(wrapper.text()).toContain('Yes: 1');expect(wrapper.text()).toContain('Demo Invitee');
  expect(needInputs[0].element.value).toBe('Fruit tray');
  expect(api.get).toHaveBeenCalledWith('/agencies/2/company-events/353/responses',{skipGlobalLoading:true});
  const previous=api.get.mock.calls.length;window.dispatchEvent(new Event('focus'));await flushPromises();
  expect(api.get.mock.calls.length).toBe(previous+1);
  wrapper.unmount();wrapper=null;const end=api.get.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30000);window.dispatchEvent(new Event('focus'));await flushPromises();
  expect(api.get.mock.calls.length).toBe(end);
});
