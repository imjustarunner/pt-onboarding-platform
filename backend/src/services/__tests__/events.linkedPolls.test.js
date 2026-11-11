import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../companyEventAudience.service.js',()=>({companyEventAgencyIds:vi.fn(),listCompanyEventStaff:vi.fn(),resolveCompanyEventAudienceUserIds:vi.fn()}));
vi.mock('../companyEventConversation.service.js',()=>({canManageEventConversation:vi.fn()}));
vi.mock('../smsCompliance.service.js',()=>({getSmsSender:vi.fn(),prepareSmsDelivery:vi.fn()}));
import {companyEventAgencyIds,listCompanyEventStaff,resolveCompanyEventAudienceUserIds} from '../companyEventAudience.service.js';
import {canManageEventConversation} from '../companyEventConversation.service.js';
import {linkedCompanyEventPollAudience,validateLinkedCompanyEventPoll} from '../companyEventLinkedPolls.service.js';
const parent={id:7,agency_id:2,event_type:'company_event',is_active:1,operations_json:{invitedAgencyIds:[3]}};
const poll={id:20,agency_id:2,event_type:'team_poll',voting_config_json:{enabled:true,linkedEventId:7}};
const person=id=>({id,role:'provider',is_active:1,membership_active:1,status:'ACTIVE_EMPLOYEE'});
beforeEach(()=>{vi.resetAllMocks();companyEventAgencyIds.mockReturnValue([2,3]);canManageEventConversation.mockResolvedValue(true);listCompanyEventStaff.mockResolvedValue([person(5),person(6),person(8)]);
  resolveCompanyEventAudienceUserIds.mockImplementation(async({event})=>Number(event.id)===7?[5,6]:[5,8]);});
const dbFor=row=>({execute:vi.fn().mockResolvedValue([[...(row?[row]:[])]])});
describe('linked event poll authorization',()=>{
  it('intersects the current cross-agency parent audience with the selected poll audience',async()=>{
    const db=dbFor(parent),scope=await linkedCompanyEventPollAudience({poll,db});
    expect(scope.userIds).toEqual([5]);expect(scope.invitedAgencyIds).toEqual([3]);
    expect(listCompanyEventStaff).toHaveBeenCalledWith([2,3],db);
    expect(resolveCompanyEventAudienceUserIds.mock.calls[1][0].event.operations_json).toEqual({invitedAgencyIds:[3]});
  });
  it('rechecks parent membership instead of trusting a formerly sent poll or stale copied agency ids',async()=>{
    const db=dbFor(parent);expect((await linkedCompanyEventPollAudience({poll,db})).userIds).toEqual([5]);
    resolveCompanyEventAudienceUserIds.mockImplementation(async({event})=>Number(event.id)===7?[6]:[5,8]);
    expect((await linkedCompanyEventPollAudience({poll,db})).userIds).toEqual([]);
  });
  it.each([null,{...parent,is_active:0},{...parent,school_event_status:'canceled'},{...parent,event_type:'program_workshop'}])('fails closed for an unavailable parent %j',async row=>{
    expect((await linkedCompanyEventPollAudience({poll,db:dbFor(row)})).userIds).toEqual([]);
    expect(listCompanyEventStaff).not.toHaveBeenCalled();
  });
  it('never changes standalone poll scope',async()=>expect(await linkedCompanyEventPollAudience({poll:{...poll,voting_config_json:{}},db:dbFor(parent)})).toBeNull());
  it('requires current management of the linked parent at save time',async()=>{
    canManageEventConversation.mockResolvedValue(false);await expect(validateLinkedCompanyEventPoll({agencyId:2,parsed:{votingConfig:{enabled:true,linkedEventId:7},audience:{userIds:[5]}},actor:{id:9,role:'admin'},db:dbFor(parent)})).rejects.toHaveProperty('status',403);
  });
  it('rejects explicitly adding a person who is outside the event invitation',async()=>{
    await expect(validateLinkedCompanyEventPoll({agencyId:2,parsed:{votingConfig:{enabled:true,linkedEventId:7},audience:{userIds:[8]}},actor:{id:9,role:'admin'},db:dbFor(parent)})).rejects.toHaveProperty('status',400);
  });
  it('inherits the parent agency scope rather than accepting arbitrary poll agencies',async()=>{
    const result=await validateLinkedCompanyEventPoll({agencyId:2,parsed:{votingConfig:{enabled:true,linkedEventId:7},audience:{userIds:[5]}},actor:{id:9,role:'admin'},db:dbFor(parent)});
    expect(result).toEqual({parent,invitedAgencyIds:[3]});
  });
});
