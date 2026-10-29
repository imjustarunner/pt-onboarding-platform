import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OutreachTripStopEditor from '../OutreachTripStopEditor.vue';
import OutreachEventAssignment from '../OutreachEventAssignment.vue';
import { outreachSchoolNotes } from '../../../utils/outreachSchoolNotes.js';
const school = { id:20,name:'Denver school',contacts:[],notes:[{id:1,body:'Call the principal',trip_id:2,trip_title:'Earlier trip',created_at:'2026-10-15'}],
  feed:[{id:'note-1',note_id:1,body:'Call the principal',entry_type:'conversation',title:'Spoke with principal',trip_id:2,trip_title:'Earlier trip',occurred_at:'2026-10-15'},
  {id:'new-note',body:'New visit',entry_type:'note',trip_id:3,trip_title:'Current trip',occurred_at:'2026-10-29'},
  {id:'trip-context',body:'Bring flyers',title:'Trip-wide note',entry_type:'note',trip_id:2,trip_title:'Earlier trip',occurred_at:'2026-10-15'}] };

describe('outreach trip school history', () => {
  it('shows prior-trip conversations immediately while visiting on a different trip', () => {
    const wrapper = mount(OutreachTripStopEditor,{props:{school,tripId:3,tripStopId:11,tripTitle:'Current trip',stageLabel:v=>v,shortDistrict:v=>v,formatDateTime:v=>v}});
    const history=wrapper.get('[aria-label="School notes from all trips"]');
    expect(history.text()).toContain('Call the principal');
    expect(history.text()).toContain('Earlier trip');
    expect(history.text()).toContain('Trip-wide note');
    expect(history.text()).toContain('Bring flyers');
    expect(history.text()).toContain('New visit');
    wrapper.unmount();
  });
  it('keeps notes in one school feed without duplicating stored conversations', () => {
    const notes=outreachSchoolNotes(school);
    expect(notes.filter(n=>n.body==='Call the principal')).toHaveLength(1);
    expect(notes[0].body).toBe('New visit');
    expect(outreachSchoolNotes({general_notes:'School background'})).toEqual([expect.objectContaining({body:'School background'})]);
  });
  it('assigns one or several employees independently from trip guests', async () => {
    const wrapper = mount(OutreachEventAssignment,{props:{modelValue:{enabled:true,assigneeUserIds:[],startTime:'09:00',endTime:'11:00',timezone:'America/Denver'},users:[{id:485,first_name:'Jacquelyne',last_name:'Fernandez'},{id:12,first_name:'Rachel'}]}});
    expect(wrapper.text()).toContain('Assign as Outreach Event');
    const people=wrapper.get('[aria-label="Outreach Event assignees"]').findAll('input[type="checkbox"]');
    await people[0].setValue(true);
    const first=wrapper.emitted('update:modelValue').at(-1)[0]; expect(first.assigneeUserIds).toEqual([485]);
    await wrapper.setProps({modelValue:first}); await people[1].setValue(true);
    expect(wrapper.emitted('update:modelValue').at(-1)[0].assigneeUserIds).toEqual([485,12]);
    wrapper.unmount();
  });
});
