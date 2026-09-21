import {describe,it,expect} from 'vitest';
import {uniqueOfficeReservations,publicationOwner,googleEventBody} from '../calendarPublicationPolicy.js';
const row={id:1,office_location_id:2,room_id:3,start_at:'2026-09-26T14:00Z',end_at:'2026-09-26T15:00Z'};
describe('office calendar publication',()=>{
  it('deduplicates exact copies with a deterministic surviving source key',()=>{expect(uniqueOfficeReservations([{...row,id:8},row,{...row,id:9}])).toEqual([row]);});
  it('preserves different rooms, clients and overlapping but distinct time ranges',()=>{
    const rows=[row,{...row,id:2,room_id:4},{...row,id:3,client_id:2},{...row,id:4,end_at:'2026-09-26T15:30Z'},{...row,id:5,clinical_session_id:123}];expect(uniqueOfficeReservations(rows)).toHaveLength(5);
  });
  it('disables inherited Google reminders on app-owned copies',()=>expect(googleEventBody({key:'x',title:'Office booking · Room 3',start:row.start_at,end:row.end_at}).reminders).toEqual({useDefault:false,overrides:[]}));
  it('uses a configured tenant mailbox and never invents an AI creator',()=>{
    expect(publicationOwner(2,{CALENDAR_PUBLICATION_OWNERS:'{"2":"app@tenant.example"}',CALENDAR_PUBLICATION_OWNER:'app@platform.example'})).toBe('app@tenant.example');
    expect(publicationOwner(3,{CALENDAR_PUBLICATION_OWNER:'app@platform.example'})).toBe('app@platform.example');
    expect(()=>publicationOwner(3,{})).toThrow();expect(()=>publicationOwner(3,{CALENDAR_PUBLICATION_OWNERS:'bad'})).toThrow();
  });
});
