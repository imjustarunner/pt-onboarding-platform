import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../services/vonage.service.js',()=>({default:{}}));
vi.mock('../../services/companyEventAudience.service.js',async original=>({...await original(),resolveCompanyEventAudienceUserIds:vi.fn()}));
vi.mock('../../services/staffEventPotluck.service.js',()=>({saveStaffPotluckContribution:vi.fn()}));
import pool from '../../config/database.js';
import {resolveCompanyEventAudienceUserIds} from '../../services/companyEventAudience.service.js';
import {saveStaffPotluckContribution} from '../../services/staffEventPotluck.service.js';
import {getCompanyEventRsvpByToken,postCompanyEventRsvpByToken} from '../companyEvents.controller.js';
const base={id:40,company_event_id:7,user_id:5,event_id:7,event_agency_id:2,event_is_active:1,event_organization_id:null,
  event_operations_json:{invitedAgencyIds:[3],dateToBeDecided:true},event_type:'company_event',event_title:'Anniversary',event_starts_at:null,event_ends_at:null,
  event_potluck_enabled:0,response:'yes',user_first_name:'Taylor',user_last_name:'Example',user_email:'taylor@work.example'};
let invitation;
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime('2026-11-11T18:00:00Z');process.env.FRONTEND_URL='https://app.example.com';
  invitation=structuredClone(base);resolveCompanyEventAudienceUserIds.mockResolvedValue([5]);saveStaffPotluckContribution.mockResolvedValue();
  pool.execute.mockImplementation(async sql=>sql.includes('FROM company_event_invitations i')?[[invitation]]:[{affectedRows:1}]);});
afterEach(()=>vi.useRealTimers());
const writes=()=>pool.execute.mock.calls.filter(([sql])=>/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql));
async function invoke(method,{query={},body={response:'yes'}}={}){const res={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),redirect:vi.fn()},next=vi.fn();
  await method({params:{token:'private-token'},query,body},res,next);expect(next).not.toHaveBeenCalled();return res;}
describe('personal invitation confirmation',()=>{
  it('returns the stable company page and carries legacy email selections to that same page',async()=>{
    invitation.event_operations_json.pageLink={eventId:7,organizationSlug:'itsco',eventSlug:'anniversary-7'};
    const canonical='https://auricwell.com/conversa/events/itsco/anniversary-7?invitation=private-token';
    expect((await invoke(getCompanyEventRsvpByToken)).json).toHaveBeenCalledWith(expect.objectContaining({canonicalUrl:canonical}));
    expect((await invoke(getCompanyEventRsvpByToken,{query:{r:'yes'}})).redirect).toHaveBeenCalledWith(canonical+'&r=yes');expect(writes()).toEqual([]);
  });
  it.each(['yes','no','maybe'])('a legacy GET ?r=%s only redirects for explicit confirmation and never changes an RSVP',async response=>{
    const before=structuredClone(invitation);const res=await invoke(getCompanyEventRsvpByToken,{query:{r:response}});
    expect(res.redirect).toHaveBeenCalledWith(`https://app.example.com/event-rsvp/private-token?r=${response}`);expect(writes()).toEqual([]);
    expect(invitation).toEqual(before);expect(saveStaffPotluckContribution).not.toHaveBeenCalled();
  });
  it('a normal GET returns the unchanged saved response and current invitation scope without writing',async()=>{
    const res=await invoke(getCompanyEventRsvpByToken);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({invitation:expect.objectContaining({response:'yes'})}));expect(writes()).toEqual([]);
    expect(resolveCompanyEventAudienceUserIds).toHaveBeenCalledWith({event:expect.objectContaining({id:7,agency_id:2,operations_json:base.event_operations_json})});
  });
  it.each([getCompanyEventRsvpByToken,postCompanyEventRsvpByToken])('rejects an old token after the person leaves the current invited staff audience',async method=>{
    resolveCompanyEventAudienceUserIds.mockResolvedValue([]);expect((await invoke(method)).status).toHaveBeenCalledWith(404);expect(writes()).toEqual([]);expect(saveStaffPotluckContribution).not.toHaveBeenCalled();
  });
  it.each([getCompanyEventRsvpByToken,postCompanyEventRsvpByToken])('does not disclose or change an inactive company event through a personal token',async method=>{
    invitation.event_is_active=0;expect((await invoke(method)).status).toHaveBeenCalledWith(404);expect(writes()).toEqual([]);
  });
  it('accepts an explicit RSVP while the company event date is still to be decided',async()=>{
    invitation.response=null;const res=await invoke(postCompanyEventRsvpByToken,{body:{response:'maybe'}});
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ok:true,response:'maybe',responseKey:'maybe'}));
    expect(writes().find(([sql])=>sql.includes('UPDATE company_event_invitations'))[1][0]).toBe('maybe');
  });
  it.each(['yes','maybe'])('lets a company invitee update %s to no and keeps the staff page response readable',async response=>{
    invitation.response=response;const res=await invoke(postCompanyEventRsvpByToken,{body:{response:'no'}});
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ok:true,response:'no',responseKey:'no'}));
    expect(writes().find(([sql])=>sql.includes('INSERT INTO company_event_responses'))[1].slice(0,3)).toEqual([7,5,'no']);
  });
  it.each([{event_rsvp_deadline:'2026-11-11T17:00:00Z'},{event_ends_at:'2026-11-11T17:00:00Z'}])('does not write after the company RSVP deadline or event end %j',async change=>{
    Object.assign(invitation,change);expect((await invoke(postCompanyEventRsvpByToken)).status).toHaveBeenCalledWith(409);expect(writes()).toEqual([]);
  });
  it('releases a potluck contribution on decline and ignores a stale custom dish name',async()=>{
    invitation.event_potluck_enabled=1;await invoke(postCompanyEventRsvpByToken,{body:{response:'no',registration:{needListItemId:12,needListCustomItemName:'Pasta'}}});
    expect(saveStaffPotluckContribution).toHaveBeenCalledWith({eventId:7,agencyId:2,userId:5,itemId:null,customItemName:''});
  });
  it('also releases a company potluck claim when decline submits no registration fields',async()=>{
    invitation.event_potluck_enabled=1;await invoke(postCompanyEventRsvpByToken,{body:{response:'maybe'}});
    expect(saveStaffPotluckContribution).toHaveBeenCalledWith(expect.objectContaining({itemId:null,customItemName:''}));
  });
  it.each([{event_type:'program_workshop'},{event_type:'school_outreach'},{event_organization_id:99}])('retains the existing program or organization-linked confirmed-response policy %j',async change=>{
    Object.assign(invitation,change);expect((await invoke(postCompanyEventRsvpByToken,{body:{response:'no'}})).status).toHaveBeenCalledWith(409);
    expect(writes()).toEqual([]);expect(resolveCompanyEventAudienceUserIds).not.toHaveBeenCalled();
  });
});
