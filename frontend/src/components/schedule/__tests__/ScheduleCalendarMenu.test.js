import { expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({userAgencies:[{id:3,name:'Inner Strength'}]})}));
import Menu from '../ScheduleCalendarMenu.vue';
it('opens calendar subscriptions in a dialog and returns to the settings button',async()=>{
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:()=>{}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:()=>{}});
  const show=vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(){this.setAttribute('open','');});
  const close=vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));});
  const wrapper=mount(Menu,{attachTo:document.body,props:{agencyIds:[3]},global:{stubs:{CalendarSharing:{template:'<p>Subscription settings</p>'}}}});
  await wrapper.get('button').trigger('click');
  expect(show).toHaveBeenCalled(); expect(document.querySelector('dialog[open]').textContent).toContain('Subscription settings');
  document.querySelector('dialog button').click(); await wrapper.vm.$nextTick();
  expect(close).toHaveBeenCalled(); expect(document.querySelector('dialog[open]')).toBeNull();
  wrapper.unmount();show.mockRestore();close.mockRestore();delete HTMLDialogElement.prototype.showModal;delete HTMLDialogElement.prototype.close;
});
