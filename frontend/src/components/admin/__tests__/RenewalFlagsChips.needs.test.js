import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Chips from '../RenewalFlagsChips.vue';
it('shows up to date only after needs were evaluated and keeps pending packet reviews visible',()=>{
 const wrapper=mount(Chips,{props:{flags:{any:false}}});expect(wrapper.text()).toBe('Up to date');wrapper.unmount();
 const pending=mount(Chips,{props:{flags:{any:true,paperPacketVisionReview:true}}});expect(pending.text()).toContain('Packet review');expect(pending.text()).not.toContain('Up to date');pending.unmount();
 const unknown=mount(Chips);expect(unknown.text()).toBe('Needs review');unknown.unmount();
});
it('keeps an unfinished records import visible instead of reporting Up to date',()=>{
 const wrapper=mount(Chips,{props:{flags:{any:true,recordsImportPending:true}}});expect(wrapper.text()).toContain('Complete client setup');expect(wrapper.text()).not.toContain('Up to date');wrapper.unmount();
});
