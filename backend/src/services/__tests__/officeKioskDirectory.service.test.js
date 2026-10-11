import { describe, it, expect, vi } from 'vitest';
import { directorySelection, buildOfficeDirectory } from '../officeKioskDirectory.service.js';
const timezone = 'America/Denver';
const people = [{ id: 4, first_name: 'Jordan', last_name: 'Rivera', profile_photo_path: 'photo.jpg', agency_name: 'Agency', agency_logo_path: 'logo.png' }, { id: 5, first_name: 'Alex', last_name: 'Chen' }];
const rooms = [10,2,1].map(id => ({ id, room_number: id, name: 'Counseling' }));
const event = { room_id: 1, start_at: '2026-09-29 16:00:00', end_at: '2026-09-29 17:00:00', status: 'BOOKED', slot_state: 'ASSIGNED_BOOKED', assigned_provider_id: 4, booked_provider_id: 5 };
const base = { now: new Date('2026-09-01T12:00:00Z'), rooms, events: [event], standing: [], plans: [], people, date: '2026-09-29', selectedAt: '2026-09-29 10:30:00', timezone };
const assignment = { id: 9, room_id: 1, provider_id: 4, weekday: 2, hour: 10, assigned_frequency: 'WEEKLY', available_since_date: '2026-09-01', availability_mode: 'AVAILABLE' };
const plan = { standing_assignment_id: 9, is_active: 1, booked_frequency: 'WEEKLY', booking_start_date: '2026-09-01' };
describe('public office directory', () => {
 it('shows the booked and assigned agencies independently for shared providers', () => {
  const sharedPeople = [2,6].map(agency_id=>({...people[0],agency_id,agency_name:agency_id===6?'Next Level Up':'ITSCO',agency_logo_path:`${agency_id}.png`}));
  const result = buildOfficeDirectory({...base,people:sharedPeople,standing:[{...assignment,booking_agency_id:2}],events:[{...event,standing_assignment_id:9,booked_provider_id:4,client_id:42,session_context_json:'{"agencyId":6}'}]});
  expect(result[0].current[0].assignedProvider).toMatchObject({agencyId:2,agencyName:'ITSCO'});
  expect(result[0].current[0].bookedProvider).toMatchObject({agencyId:6,agencyName:'Next Level Up',agencyLogoPath:'6.png'});
  expect(result[0].roomNumber).toBe(1);
 });
 it('uses the assigned agency for future projected office time', () => {
  const sharedPeople=[2,6].map(agency_id=>({...people[0],agency_id,agency_name:agency_id===6?'Next Level Up':'ITSCO'}));
  const result=buildOfficeDirectory({...base,events:[],people:sharedPeople,standing:[{...assignment,booking_agency_id:6}]});
  expect(result[0].current[0].bookedProvider.agencyName).toBe('Next Level Up');
 });
 it('does not substitute an unrelated agency for historical office entries', () => {
  const result=buildOfficeDirectory({...base,events:[{...event,booked_provider_id:4,session_context_json:'{"agencyId":6}'}]});
  expect(result[0].current[0].bookedProvider).toMatchObject({name:'Jordan Rivera',agencyName:null,agencyLogoPath:null});
 });
 it('uses office date across device/UTC date changes and DST day boundaries', () => {
  expect(directorySelection({}, timezone, new Date('2026-09-30T02:00:00Z')).date).toBe('2026-09-29');
  const {bounds} = directorySelection({date:'2026-11-01',time:'12:00'},timezone);
  expect(bounds.startAt).toBe('2026-11-01 06:00:00'); expect(bounds.endExclusive).toBe('2026-11-02 07:00:00');
 });
 it('keeps the requested day when production ICU renders midnight as 24:00', () => {
  const NativeFormatter = Intl.DateTimeFormat;
  const mock = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function(...args) {
    const formatter = new NativeFormatter(...args);
    const format = formatter.formatToParts.bind(formatter);
    formatter.formatToParts = value => format(value).map(part => part.type === 'hour' && part.value === '00' ? {...part,value:'24'} : part);
    return formatter;
  });
  try {
    expect(directorySelection({date:'2026-09-30',time:'14:00'},timezone).bounds).toMatchObject({startAt:'2026-09-30 06:00:00',endExclusive:'2026-10-01 06:00:00'});
    expect(directorySelection({date:'2026-11-01',time:'14:00'},timezone).bounds).toMatchObject({startAt:'2026-11-01 06:00:00',endExclusive:'2026-11-02 07:00:00'});
  } finally { mock.mockRestore(); }
 });
 it.each([{date:'2026-02-30'}, {date:[]}, {date:'bad'}, {time:'24:00'}, {time:['12:00']}])('rejects malformed selections %j', query => {
  expect(() => directorySelection(query,timezone)).toThrow('valid date');
 });
 it('marks any overlapping booking red across a selected range, excluding exact boundaries',()=>{
  expect(buildOfficeDirectory({...base,selectedAt:'2026-09-29 09:00:00',selectedEndAt:'2026-09-29 12:00:00'})[0].occupied).toBe(true);
  expect(buildOfficeDirectory({...base,selectedAt:'2026-09-29 09:00:00',selectedEndAt:'2026-09-29 10:00:00'})[0].occupied).toBe(false);
  expect(()=>directorySelection({time:'16:00',endTime:'15:00'},timezone)).toThrow('End time');
 });
 it('sorts numerically and keeps booked and assigned providers distinct, with media', () => {
  const result = buildOfficeDirectory(base);
  expect(result.map(r => r.roomNumber)).toEqual([1,2,10]);
  expect(result[0].occupied).toBe(true);
  expect(result[0].current[0].assignedProvider).toMatchObject({name:'Jordan Rivera',profilePhotoPath:'photo.jpg',agencyLogoPath:'logo.png'});
  expect(result[0].current[0].bookedProvider.name).toBe('Alex Chen');
 });
 it('shows assigned but unbooked in green, and uses an exclusive booking end', () => {
  expect(buildOfficeDirectory({...base,events:[{...event,status:'RELEASED',slot_state:'ASSIGNED_AVAILABLE'}]})[0].occupied).toBe(false);
  expect(buildOfficeDirectory({...base,selectedAt:'2026-09-29 11:00:00'})[0].current).toEqual([]);
 });
 it('automatically books assigned time even without a booking-plan occurrence before transition', () => {
  const input = {...base,events:[],standing:[assignment],plans:[plan],date:'2027-01-05',selectedAt:'2027-01-05 10:30:00'};
  expect(buildOfficeDirectory(input)[0].occupied).toBe(true);
  const skipped=buildOfficeDirectory({...input,plans:[{...plan,skipped_dates_json:'["2027-01-05"]'}]})[0];
  expect(skipped.occupied).toBe(true); expect(skipped.current[0].assignedProvider.name).toBe('Jordan Rivera');
 });
 it('honors explicit cancellations, temporary expiry, and biweekly off weeks', () => {
  expect(buildOfficeDirectory({...base,events:[{...event,status:'CANCELLED'}],standing:[assignment],plans:[plan]})[0].occupied).toBe(false);
  expect(buildOfficeDirectory({...base,events:[],standing:[{...assignment,availability_mode:'TEMPORARY',temporary_until_date:'2026-09-28'}]})[0].assignments).toEqual([]);
  expect(buildOfficeDirectory({...base,events:[],date:'2026-09-08',standing:[{...assignment,assigned_frequency:'BIWEEKLY'}]})[0].assignments).toEqual([]);
 });
 it('preserves an assigned half hour beside an explicit partial booking after transition', () => {
  const result=buildOfficeDirectory({...base,selectedAt:'2026-09-29 10:45:00',standing:[{...assignment,transition_date:'2026-09-01'}],events:[{...event,end_at:'2026-09-29 16:30:00'}]})[0];
  expect(result.occupied).toBe(false);expect(result.current[0].assignedProvider.name).toBe('Jordan Rivera');
  expect(result.current[0].startAt).toBe('2026-09-29 10:30:00');
 });
 it('does not expose client identities, notes, event IDs, or account status', () => {
  const result=JSON.stringify(buildOfficeDirectory({...base,events:[{...event,client_id:123,notes:'PRIVATE',id:999}],people:people.map(p=>({...p,status:'ARCHIVED',email:'secret@example.org'}))}));
  for (const forbidden of ['PRIVATE','secret@','ARCHIVED','client_id','999']) expect(result).not.toContain(forbidden);
  expect(result).toContain('Jordan Rivera');
 });
});
it('projects automatic reservations before cutover and assigned-only time after cutover', () => {
 const standing = [{ ...assignment, transition_date: '2026-09-30' }];
 expect(buildOfficeDirectory({...base,events:[],standing})[0].occupied).toBe(true);
 expect(buildOfficeDirectory({...base,events:[],standing:[{...assignment,transition_date:'2026-09-01'}]})[0].occupied).toBe(false);
});
it('cancelling a client appointment preserves the assigned office hour after transition', () => {
 const result = buildOfficeDirectory({...base,standing:[{...assignment,transition_date:'2026-09-01'}],events:[{...event,status:'CANCELLED',client_id:123}]})[0];
 expect(result.occupied).toBe(false);
 expect(result.current[0].assignedProvider.id).toBe(4);
});
