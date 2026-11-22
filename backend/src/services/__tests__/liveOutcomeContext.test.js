import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:vi.fn(),isNoView:permissions=>Boolean(permissions?.noView)}}));
import Appointment from '../../models/Appointment.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { liveOutcomeContext, liveOutcomeRespondent } from '../liveOutcomeContext.service.js';
const client={id:41,agency_id:12};
const guardian={guardian_user_id:88,first_name:'Synthetic',last_name:'Guardian',relationship_type:'guardian',role:'client_guardian',access_enabled:1,is_active:1,status:'ACTIVE'};
beforeEach(()=>{vi.resetAllMocks();Appointment.findById.mockResolvedValue({id:99,agencyId:12,clinicalSessionId:10,startAt:'2026-11-22T10:00:00Z',endAt:'2026-11-22T11:00:00Z'});Appointment.listParticipants.mockResolvedValue([{clientId:41}]);ClientGuardian.listForClient.mockResolvedValue([guardian]);});
describe('live assessment appointment and respondent binding',()=>{
  it('resolves only the requested agency/client appointment and exposes names needed for the selector',async()=>{
    const result=await liveOutcomeContext(client,99);
    expect(Appointment.findById).toHaveBeenCalledWith(99,{agencyId:12});
    expect(result).toMatchObject({appointment:{id:99,clinicalSessionId:10},guardians:[{id:88,label:'Synthetic Guardian'}]});
    expect(result.guardians[0]).not.toHaveProperty('email');
  });
  it.each([0,-1,'1 OR 1=1',1.1])('rejects invalid appointment references %s before querying',async id=>{await expect(liveOutcomeContext(client,id)).rejects.toMatchObject({status:400});expect(Appointment.findById).not.toHaveBeenCalled();});
  it('rejects cross-agency and cross-client appointments',async()=>{
    Appointment.findById.mockResolvedValueOnce({agencyId:13});await expect(liveOutcomeContext(client,99)).rejects.toMatchObject({status:404});
    Appointment.listParticipants.mockResolvedValueOnce([{clientId:42}]);await expect(liveOutcomeContext(client,99)).rejects.toMatchObject({status:404});
    expect(ClientGuardian.listForClient).not.toHaveBeenCalled();
  });
  it.each([{access_enabled:0},{is_active:0},{is_archived:1},{status:'TERMINATED'},{terminated_at:'2026-01-01'},{permissions_json:{noView:true}},{relationship_type:'self'},{role:'provider'}])('excludes restricted or unrelated guardian links %j',async change=>{ClientGuardian.listForClient.mockResolvedValue([{...guardian,...change}]);expect((await liveOutcomeContext(client,99)).guardians).toEqual([]);});
  it('takes linked guardian identity from the server and never from the submitted name',async()=>{
    const context=await liveOutcomeContext(client,99);
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
