import {describe,it,expect} from 'vitest';
import {decorateSessionLocations,officeCoveredBySession,virtualSchoolOverlap,scheduleEventSignature} from '../scheduleLocationProjection.js';
import {dayScheduleEntries} from '../providerDaySchedule.js';
const school={assignmentId:7,schoolOrgId:451,agencyId:450,schoolName:'Cedar Grove',dayOfWeek:'Monday',startTime:'08:00',endTime:'15:00'};
const session={id:80,appointmentId:20,agencyId:450,clientId:5,kind:'PERSONAL_EVENT',description:'Client id: 5\nSchool: Cedar Grove',title:'School session',startAt:'2026-10-26T14:30:00Z',endAt:'2026-10-26T15:15:00Z'};
describe('location-aware session display',()=>{
 it('inherits the actual school and leaves its overall assignment unchanged',()=>{
  const rows=decorateSessionLocations([session],[school]);
  expect(rows[0]).toMatchObject({calendarLocationKind:'school',schoolName:'Cedar Grove',schoolOrganizationId:451,schoolAssignmentId:7});
  expect(school).toEqual(expect.objectContaining({startTime:'08:00',endTime:'15:00'}));
  const day=dayScheduleEntries({scheduleEvents:rows,schoolAssignments:[school]},'2026-10-26','America/Denver');
  expect(day).toHaveLength(2);expect(day.find(e=>e.type==='School').timeLabel).toBe('8:00 AM–3:00 PM');
  expect(day.find(e=>e.type==='Session').title).toContain('Cedar Grove');
 });
 it('does not claim unrelated virtual sessions or another agency as school visits',()=>{
  expect(decorateSessionLocations([{...session,description:'Client id: 5',title:'Virtual session'}],[school])[0].calendarLocationKind).toBeUndefined();
  expect(decorateSessionLocations([{...session,agencyId:8}],[school])[0].calendarLocationKind).toBeUndefined();
 });
 it('uses the timezone of the school assignment, including after DST changes',()=>{
  const after={...session,startAt:'2026-11-02T15:30:00Z',endAt:'2026-11-02T16:15:00Z'};
  expect(decorateSessionLocations([after],[school],[],'America/Denver')[0].calendarLocationKind).toBe('school');
 });
 it('shows a single appointment card for its room and session while keeping unrelated room reservations',()=>{
  const office={id:3,appointmentId:20,buildingId:4,buildingName:'Clinic',roomId:1,roomLabel:'101',startAt:session.startAt,endAt:session.endAt};
  const virtual={...session,description:'Client id: 5'};
  expect(officeCoveredBySession(office,[virtual])).toBe(true);
  expect(officeCoveredBySession({...office,appointmentId:21},[virtual])).toBe(false);
  expect(officeCoveredBySession(office,[{...virtual,status:'CANCELLED'}])).toBe(false);
  const day=dayScheduleEntries({scheduleEvents:[virtual],officeEvents:[office,{...office,id:4,appointmentId:21}]},'2026-10-26','America/Denver');
  expect(day).toHaveLength(2);expect(day.find(item=>item.type==='Session').title).toContain('Clinic');
 });
 it('warns only for virtual hours overlapping the same tenant and weekday',()=>{
  expect(virtualSchoolOverlap([school],{agencyId:450,dayOfWeek:'Monday',startTime:'09:00',endTime:'10:00'})).toEqual([school]);
  expect(virtualSchoolOverlap([school],{agencyId:450,dayOfWeek:'Monday',startTime:'15:00',endTime:'16:00'})).toEqual([]);
  expect(virtualSchoolOverlap([school],{agencyId:8,dayOfWeek:'Monday',startTime:'09:00',endTime:'10:00'})).toEqual([]);
 });
 it('normalizes saved-event duplicate detection without an undefined wall-time helper',()=>{
  const normalize=value=>new Date(value).toISOString();
  expect(scheduleEventSignature(session,normalize)).toBe(scheduleEventSignature({...session,startAt:'2026-10-26T14:30:00.000Z'},normalize));
 });
});
