import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Card from '../PublicProviderCard.vue';
const base={id:8,displayName:'Example Provider',acceptingNewClients:true,availability:{slots:[{startAt:'2030-01-01T16:00:00Z',endAt:'2030-01-01T17:00:00Z',programType:'IN_PERSON'}]}};
describe('directory availability and online selection',()=>{
 it('displays a noninteractive time when selection is disabled',()=>{const w=mount(Card,{props:{provider:{...base,onlineScheduling:false}}});expect(w.findAll('.slot-chip')).toHaveLength(1);expect(w.find('button.slot-chip').exists()).toBe(false);expect(w.text()).toContain('work with you directly');w.unmount();});
 it('permits time requests only when enabled for this provider',async()=>{const w=mount(Card,{props:{provider:{...base,onlineScheduling:true}}});await w.find('button.slot-chip').trigger('click');expect(w.emitted('book')[0]).toEqual([{...base,onlineScheduling:true},base.availability.slots[0]]);w.unmount();});
});
