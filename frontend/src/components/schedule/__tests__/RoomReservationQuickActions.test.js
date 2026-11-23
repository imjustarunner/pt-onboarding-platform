import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Actions from '../RoomReservationQuickActions.vue';
it('marks an undecided reservation from its face without opening another dialog',async()=>{
 const context={officeLocationId:8,officeEventId:91,dateYmd:'2026-11-24'};
 const wrapper=mount(Actions,{props:{context,status:'reserved'}});
 const buttons=wrapper.findAll('button');expect(buttons.map(b=>b.text())).toEqual(['Mark vacant','Mark occupied']);
 await buttons[0].trigger('click');await buttons[1].trigger('click');expect(wrapper.emitted('change')).toEqual([[context,'vacant'],[context,'occupied']]);wrapper.unmount();
});
it.each(['occupied','vacant'])('keeps quick decisions off an already %s reservation',status=>{
 const wrapper=mount(Actions,{props:{context:{officeEventId:1},status}});expect(wrapper.find('button').exists()).toBe(false);wrapper.unmount();
});
it('cannot change another reservation without authorized context and disables repeat clicks while saving',()=>{
 const wrapper=mount(Actions,{props:{status:'reserved'}});expect(wrapper.find('button').exists()).toBe(false);wrapper.unmount();
 const pending=mount(Actions,{props:{status:'reserved',context:{officeEventId:1},pending:true}});expect(pending.findAll('button').every(b=>b.element.disabled)).toBe(true);pending.unmount();
});
