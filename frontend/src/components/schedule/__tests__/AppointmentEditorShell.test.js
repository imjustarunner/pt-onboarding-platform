import { it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import AppointmentEditorShell from '../AppointmentEditorShell.vue';
import AppointmentHeaderFields from '../AppointmentHeaderFields.vue';
it('carries ranked room preferences and explicit any-room intent through the editor', async () => {
 const wrapper=shallowMount(AppointmentEditorShell,{props:{multipleRoomPreferences:true,preferredRoomIds:[7,6],roomPreferenceAcknowledged:true}});
 const header=wrapper.findComponent(AppointmentHeaderFields);
 expect(header.props('multipleRoomPreferences')).toBe(true);
 expect(header.props('preferredRoomIds')).toEqual([7,6]);
 expect(header.props('roomPreferenceAcknowledged')).toBe(true);
 header.vm.$emit('update:preferredRoomIds',[7]);
 header.vm.$emit('update:roomPreferenceAcknowledged',true);
 expect(wrapper.emitted('update:preferredRoomIds')).toEqual([[[7]]]);
 expect(wrapper.emitted('update:roomPreferenceAcknowledged')).toEqual([[true]]);
 wrapper.unmount();
});
