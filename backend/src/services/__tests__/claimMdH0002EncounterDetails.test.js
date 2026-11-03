vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import { describe, it, expect, vi } from 'vitest';
import { screeningRespondent, screeningEncounterProposal, validateScreeningEncounter } from '../h0002EncounterDetails.js';
import { verifyServiceAmendmentLocation, normalizeServiceDetails, pendingServiceDetails, assertServiceDetailsComplete } from '../clinicalSupervisorReview.service.js';
const confirmed={dateOfService:'2026-11-03',durationMinutes:10,startTime:'10:00',endTime:'10:10',participants:'Guardian: DEMO',patientPresent:false,serviceDetailsConfirmed:true};
describe('H0002 encounter proposals and signature gates',()=>{
 it('proposes a ten-minute window and named guardian without recording confirmation',()=>{
  const respondent=screeningRespondent({guardian:{firstName:'DEMO'},intakeForSelf:false});
  const proposal=screeningEncounterProposal({submittedAt:'2026-11-03T17:10:21Z',respondent});
  expect(proposal).toMatchObject({dateOfService:'2026-11-03',startTime:'10:00',endTime:'10:10',durationMinutes:10,participants:'Guardian: DEMO',patientPresent:false});
  expect(()=>validateScreeningEncounter(proposal,new Date('2026-11-03T19:00Z'))).toThrow(/Confirm the actual/);
 });
 it('preserves self submissions and leaves unknown respondents unanswered',()=>{
  expect(screeningRespondent({intakeForSelf:true,guardian:{firstName:'DEMO'}}).role).toBe('self');
  const proposal=screeningEncounterProposal({submittedAt:'2026-11-03T17:10Z',respondent:{role:'unknown'}});
  expect(proposal.patientPresent).toBeNull();expect(proposal.participants).toBe('');
 });
 it('flags midnight proposals rather than inventing a same-day duration',()=>{
  const proposal=screeningEncounterProposal({submittedAt:'2026-11-03T07:05Z',respondent:{role:'guardian',firstName:'DEMO'}});
  expect(proposal.crossesMidnight).toBe(true);
  expect(()=>validateScreeningEncounter({...proposal,serviceDetailsConfirmed:true},new Date('2026-11-03T19:00Z'))).toThrow(/matching duration/);
 });
 it.each([{durationMinutes:''},{startTime:''},{endTime:''},{participants:''},{patientPresent:null},{serviceDetailsConfirmed:false},{durationMinutes:60},{dateOfService:'2027-01-01'},{dateOfService:'2026-02-30'}])('blocks incomplete or inconsistent initial signing %j',patch=>{
  expect(()=>validateScreeningEncounter({...confirmed,...patch},new Date('2026-11-03T19:00Z'))).toThrow();
 });
 it('accepts a confirmed historical service date without substituting the signature date',()=>expect(validateScreeningEncounter(confirmed,new Date('2026-11-04T19:00Z'))).toMatchObject(confirmedFields()));
 it('lets a supervisor retain an existing virtual screening setting without choosing a physical site',async()=>{
  const note={metadata_json:{serviceCode:'H0002'}},session={place_of_service:'10',metadata_json:{locationLabel:'Virtual — client’s home'}};
  const details={locationLabel:'Virtual — client’s home',placeOfService:'10',serviceLocationId:null};
  expect(await verifyServiceAmendmentLocation(note,session,details)).toMatchObject({place_of_service:'10'});
  await expect(verifyServiceAmendmentLocation(note,session,{...details,placeOfService:'11'})).rejects.toMatchObject({status:409});
 });
 it('retains editable participant details and uses only the newest pending amendment',()=>{
  const d=normalizeServiceDetails({...confirmed,locationLabel:'Office',placeOfService:'11'});
  expect(d).toMatchObject({participants:'Guardian: DEMO',patientPresent:false});
  expect(pendingServiceDetails({serviceDetailAmendments:[{id:1,serviceDetails:{durationMinutes:60},supersededByAmendmentId:2},{id:2,serviceDetails:d}]})).toEqual(d);
  expect(()=>assertServiceDetailsComplete({metadata_json:{serviceCode:'H0002',structuredChart:{...d,participants:''}}})).toThrow(/participants/);
 });
});
function confirmedFields(){const {serviceDetailsConfirmed,...fields}=confirmed;return fields;}
