import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import {draftAppointmentOptions,linkDraftAppointment} from '../clinicalDraftAppointmentRepair.service.js';
const draft={id:293,user_id:1433,agency_id:450,client_id:2273,clinical_session_id:167,date_of_service:'2026-11-02',service_code:'90834',input_text:'Preserve source'};
const target={id:166,agency_id:450,provider_user_id:1433,client_id:2273,appointment_id:104,service_code:'90834',source_timezone:'America/Denver',scheduled_start_at:'2026-11-02 17:15:00'};
let deps;
beforeEach(()=>{deps={appointments:{findById:vi.fn(async()=>({id:104,agencyId:450,providerUserId:1433,startAt:target.scheduled_start_at,serviceCode:'90834',status:'scheduled'})),listParticipants:vi.fn(async()=>[{clientId:2273}])},sessions:{findById:vi.fn(async()=>({id:167}))},clinicalDatabase:{execute:vi.fn(async sql=>[sql.startsWith('SELECT s.*')?[target]:[]])},database:{execute:vi.fn(async()=>[[]])},drafts:{updateForUser:vi.fn(async input=>({...draft,...input.patch}))}};});
it('offers only exact scope, code and local date matches and never links automatically',async()=>{
  deps.clinicalDatabase.execute.mockResolvedValueOnce([[target,{...target,id:170,client_id:999},{...target,id:171,service_code:'90837'},{...target,id:172,scheduled_start_at:'2026-11-03 17:15:00'}]]);
  expect((await draftAppointmentOptions(draft,deps)).options.map(r=>r.clinicalSessionId)).toEqual([166]);
  expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
it('returns the exact existing appointment context without changing the draft',async()=>{
  deps.sessions.findById.mockResolvedValue({...target,id:167,scheduled_end_at:'2026-11-02 18:00:00',duration_minutes:45});
  const result=await draftAppointmentOptions(draft,deps);
  expect(result).toMatchObject({linked:true,options:[],context:{draftId:293,clinicalSessionId:167,appointmentId:104,sourceTimezone:'America/Denver',startAt:'2026-11-02 17:15:00',durationMinutes:45}});
  expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
it('shows the saved appointment modality when the clinical session location label is absent',async()=>{
 deps.sessions.findById.mockResolvedValue({...target,id:167});
 deps.appointments.findById.mockResolvedValue({id:104,agencyId:450,providerUserId:1433,clinicalSessionId:167,modality:'TELEHEALTH'});
 expect((await draftAppointmentOptions(draft,deps)).context.locationLabel).toBe('Telehealth');
 expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
it.each([{agency_id:999},{client_id:999},{provider_user_id:999}])('withholds a linked encounter that does not match the draft: %j',async mismatch=>{
  deps.sessions.findById.mockResolvedValue({...target,...mismatch});
  await expect(draftAppointmentOptions(draft,deps)).rejects.toMatchObject({status:403});
  expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
it('changes only link IDs after explicit confirmation; no source, pricing or attendance mutation',async()=>{
  await linkDraftAppointment(draft,166,true,deps);
  expect(deps.drafts.updateForUser).toHaveBeenCalledWith({draftId:293,userId:1433,patch:{clinicalSessionId:166,officeEventId:null}});
  expect(draft.input_text).toBe('Preserve source');
});
it('requires confirmation and a current choice',async()=>{
  await expect(linkDraftAppointment(draft,166,false,deps)).rejects.toMatchObject({status:409});
  await expect(linkDraftAppointment(draft,999,true,deps)).rejects.toMatchObject({status:409});
  expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
it('preserves already linked drafts and existing clinical records',async()=>{
  deps.sessions.findById.mockResolvedValueOnce(target);
  await expect(linkDraftAppointment(draft,166,true,deps)).rejects.toThrow('already has a booked encounter');
  deps.clinicalDatabase.execute.mockImplementation(async sql=>[sql.startsWith('SELECT s.*')?[target]:[{id:42}]]);
  await expect(linkDraftAppointment(draft,166,true,deps)).rejects.toThrow('clinical record already exists');
  expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
it('does not replace another draft on the chosen appointment',async()=>{
  deps.database.execute.mockResolvedValue([[{id:294}]]);
  await expect(linkDraftAppointment(draft,166,true,deps)).rejects.toThrow('already has a draft');
  expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
it('rechecks the current appointment rather than relying on stale clinical context',async()=>{
  deps.appointments.findById.mockResolvedValue({id:104,agencyId:450,providerUserId:1433,startAt:target.scheduled_start_at,serviceCode:'90834',status:'no_show'});
  await expect(linkDraftAppointment(draft,166,true,deps)).rejects.toThrow('appointment changed');
  expect(deps.drafts.updateForUser).not.toHaveBeenCalled();
});
