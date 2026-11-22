import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:vi.fn(),isNoView:permissions=>Boolean(permissions?.noView)}}));
vi.mock('../appointmentStaffTools.service.js',()=>({default:{authorize:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import Appointment from '../../models/Appointment.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import appointmentStaffTools from '../appointmentStaffTools.service.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { liveOutcomeContext, liveOutcomeRespondent } from '../liveOutcomeContext.service.js';
const client={id:41,agency_id:12};
const user={id:7,role:'provider'};
const guardian={guardian_user_id:88,first_name:'Synthetic',last_name:'Guardian',relationship_type:'guardian',role:'client_guardian',access_enabled:1,is_active:1,status:'ACTIVE'};
beforeEach(()=>{vi.resetAllMocks();appointmentStaffTools.authorize.mockResolvedValue({id:99,agencyId:12,clinicalSessionId:10,startAt:'2026-11-22T10:00:00Z',endAt:'2026-11-22T11:00:00Z'});Appointment.listParticipants.mockResolvedValue([{clientId:41}]);ClientGuardian.listForClient.mockResolvedValue([guardian]);clinicalPool.execute.mockResolvedValue([[{id:10}]]);});
describe('live assessment appointment and respondent binding',()=>{
  it('resolves only the requested agency/client appointment and exposes names needed for the selector',async()=>{
    const result=await liveOutcomeContext(client,99,user);
    expect(appointmentStaffTools.authorize).toHaveBeenCalledWith(user,99);
    expect(result).toMatchObject({appointment:{id:99,clinicalSessionId:10},guardians:[{id:88,label:'Synthetic Guardian'}]});
    expect(result.guardians[0]).not.toHaveProperty('email');
  });
  it.each([0,-1,'1 OR 1=1',1.1])('rejects invalid appointment references %s before querying',async id=>{await expect(liveOutcomeContext(client,id,user)).rejects.toMatchObject({status:400});expect(appointmentStaffTools.authorize).not.toHaveBeenCalled();});
  it('rejects cross-agency and cross-client appointments',async()=>{
    appointmentStaffTools.authorize.mockRejectedValueOnce(Object.assign(new Error('Agency access denied'),{status:403}));await expect(liveOutcomeContext(client,99,user)).rejects.toMatchObject({status:403});
    Appointment.listParticipants.mockResolvedValueOnce([{clientId:42}]);await expect(liveOutcomeContext(client,99,user)).rejects.toMatchObject({status:404});
    expect(ClientGuardian.listForClient).not.toHaveBeenCalled();
  });
  it('supports a shared client’s authorized appointment with either agency',async()=>{
    appointmentStaffTools.authorize.mockResolvedValueOnce({id:99,agencyId:13,clinicalSessionId:10});
    expect(await liveOutcomeContext(client,99,user)).toMatchObject({appointment:{id:99,agencyId:13},guardians:[{id:88}]});
    expect(appointmentStaffTools.authorize).toHaveBeenCalledWith(user,99);
  });
  it('binds a group assessment to this client’s clinical session, never the primary participant’s session',async()=>{
    Appointment.listParticipants.mockResolvedValueOnce([{clientId:42},{clientId:41}]);clinicalPool.execute.mockResolvedValueOnce([[{id:11}]]);
    expect(await liveOutcomeContext(client,99,user)).toMatchObject({appointment:{id:99,clinicalSessionId:11}});
    expect(clinicalPool.execute).toHaveBeenCalledWith(expect.stringContaining('client_id = ? AND agency_id = ?'),[99,41,12]);
  });
  it('keeps the appointment link when a client-specific clinical session is not yet available',async()=>{
    clinicalPool.execute.mockResolvedValueOnce([[]]);expect(await liveOutcomeContext(client,99,user)).toMatchObject({appointment:{id:99,clinicalSessionId:null}});
    expect(clinicalPool.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  });
  it.each([{access_enabled:0},{is_active:0},{is_archived:1},{status:'TERMINATED'},{terminated_at:'2026-01-01'},{permissions_json:{noView:true}},{relationship_type:'self'},{role:'provider'}])('excludes restricted or unrelated guardian links %j',async change=>{ClientGuardian.listForClient.mockResolvedValue([{...guardian,...change}]);expect((await liveOutcomeContext(client,99,user)).guardians).toEqual([]);});
  it('takes linked guardian identity from the server and never from the submitted name',async()=>{
    const context=await liveOutcomeContext(client,99,user);
    expect(liveOutcomeRespondent({respondent:'caregiver'},{type:'guardian',userId:88,label:'Forged name'},context,client)).toMatchObject({type:'guardian',userId:88,label:'Synthetic Guardian'});
    expect(()=>liveOutcomeRespondent({respondent:'caregiver'},{type:'guardian',userId:89},context,client)).toThrow('current linked');
    expect(()=>liveOutcomeRespondent({respondent:'self'},{type:'guardian',userId:88},context,client)).toThrow('parent-report');
    expect(()=>liveOutcomeRespondent({respondent:'caregiver'},{type:'client'},context,client)).toThrow('client self-report');
    expect(liveOutcomeRespondent({}, {type:'client',clientId:999,label:'Spoof'},context,client)).toEqual({type:'client',clientId:41,label:'Client'});
  });
  it('requires an identified other respondent and relationship rather than merging anonymous reports',()=>{
    expect(()=>liveOutcomeRespondent({}, {type:'other',label:'Other'}, {},client)).toThrow('relationship');
    expect(liveOutcomeRespondent({}, {type:'other',label:' Synthetic relative ',relationship:' Aunt '},{},client)).toEqual({type:'other',label:'Synthetic relative',relationship:'Aunt'});
  });
});
