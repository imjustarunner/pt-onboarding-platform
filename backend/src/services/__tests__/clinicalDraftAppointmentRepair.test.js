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
