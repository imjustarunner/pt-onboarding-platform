import { mount } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({play:vi.fn(),enable:vi.fn(),cancelPending:vi.fn(),dispose:vi.fn()}));
vi.mock('../../../utils/waitingRoomChime',()=>({createWaitingRoomChime:()=>m}));
import WaitingRoomAlerts from '../WaitingRoomAlerts.vue';
let wrapper;
const person=(id,name='Guest')=>({alertKey:`member:${id}`,displayName:name});
beforeEach(()=>{vi.clearAllMocks();});afterEach(()=>wrapper?.unmount());
function render(participants=[]){wrapper=mount(WaitingRoomAlerts,{props:{meetingKey:'supervision:1',participants},global:{stubs:{Teleport:true}}});}
it('dings for already waiting people on entry, new arrivals and re-arrivals, but not repeated polls',async()=>{
 render([person(1)]);expect(m.play).toHaveBeenCalledOnce();
 await wrapper.setProps({participants:[person(1)]});expect(m.play).toHaveBeenCalledOnce();
 await wrapper.setProps({participants:[person(1),person(2)]});expect(m.play).toHaveBeenCalledTimes(2);
 await wrapper.setProps({participants:[person(2)]});expect(m.play).toHaveBeenCalledTimes(2);
 await wrapper.setProps({participants:[person(1),person(2)]});expect(m.play).toHaveBeenCalledTimes(3);
});
it('keeps a visible notice and admission action when sound is blocked',async()=>{
 render([person(1,'Rachel')]);expect(wrapper.get('[role="status"]').text()).toContain('Rachel');
 await wrapper.findAll('button').find(b=>b.text()==='Enable waiting-room sound').trigger('click');expect(m.enable).toHaveBeenCalled();
 await wrapper.findAll('button').find(b=>b.text()==='Admit').trigger('click');expect(wrapper.emitted('admit')[0]).toEqual([person(1,'Rachel')]);
 await wrapper.setProps({participants:[]});expect(wrapper.find('[role="status"]').exists()).toBe(false);expect(m.cancelPending).toHaveBeenCalled();
});
it('dismisses until another arrival and resets identity tracking for a different meeting',async()=>{
 render([person(1)]);await wrapper.findAll('button').find(b=>b.text()==='Dismiss notice').trigger('click');
 await wrapper.setProps({participants:[person(1)]});expect(wrapper.find('[role="status"]').exists()).toBe(false);
 await wrapper.setProps({participants:[person(1),person(2)]});expect(wrapper.find('[role="status"]').exists()).toBe(true);
 await wrapper.setProps({meetingKey:'team-meeting:1'});expect(m.play).toHaveBeenCalledTimes(3);
 wrapper.unmount();wrapper=null;expect(m.dispose).toHaveBeenCalledOnce();
 document.dispatchEvent(new Event('pointerdown'));expect(m.enable).not.toHaveBeenCalled();
});
