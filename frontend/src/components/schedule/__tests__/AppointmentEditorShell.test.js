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
it('shows NLU external meeting selection with an optional URL instead of new platform room choices',async()=>{
 const w=shallowMount(AppointmentHeaderFields,{props:{showModality:true,modality:'TELEHEALTH',videoRoomMode:'external',externalMeetingsEnabled:true,bookSessionLayout:true}});
 const select=w.findAll('select').find(row=>row.findAll('option').some(option=>option.attributes('value')==='external'));
 expect(select.findAll('option').map(row=>row.attributes('value'))).toEqual(['external']);expect(w.text()).not.toContain('will be available after booking');
 const input=w.get('input[type=url]');expect(input.attributes('required')).toBeUndefined();await input.setValue('https://video.example.test/session');expect(w.emitted('update:externalMeetingUrl')).toEqual([['https://video.example.test/session']]);w.unmount();
});
it('preserves platform meeting choices for other agencies',()=>{
 const w=shallowMount(AppointmentHeaderFields,{props:{showModality:true,modality:'TELEHEALTH',videoRoomMode:'unique_session'}});
 expect(w.findAll('option').some(option=>option.attributes('value')==='external')).toBe(false);expect(w.findAll('option').some(option=>option.attributes('value')==='unique_session')).toBe(true);w.unmount();
});
it('offers Google phone instructions only after availability is verified and forwards the saved preference',async()=>{
 const w=shallowMount(AppointmentHeaderFields,{props:{showModality:true,modality:'TELEHEALTH',googleDialInStatus:'available'}});
 const checkbox=w.findAll('label').find(label=>label.text().includes('Include Google Meet phone')).get('input');
 await checkbox.setValue(true);expect(w.emitted('update:includeGoogleDialIn')).toEqual([[true]]);w.unmount();
 const shell=shallowMount(AppointmentEditorShell,{props:{includeGoogleDialIn:true,googleDialInStatus:'available'}});
 const header=shell.getComponent(AppointmentHeaderFields);expect(header.props('includeGoogleDialIn')).toBe(true);header.vm.$emit('update:includeGoogleDialIn',false);expect(shell.emitted('update:includeGoogleDialIn')).toEqual([[false]]);shell.unmount();
});
