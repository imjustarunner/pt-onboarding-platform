import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn(),sendEmailFromIdentity:vi.fn()}));
vi.mock('../companyEventLinkedPolls.service.js',()=>({linkedCompanyEventPollAudience:vi.fn()}));
vi.mock('../companyEventInvitations.service.js',()=>({companyEventEmailContext:vi.fn()}));
vi.mock('../companyEventLinks.service.js',()=>({resolveCompanyEventInvitationLinks:vi.fn(async()=>({detailsUrl:'https://auricwell.com/conversa/events/itsco/anniversary-7'}))}));
import {sendNotificationEmail,sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {linkedCompanyEventPollAudience} from '../companyEventLinkedPolls.service.js';
import {companyEventEmailContext} from '../companyEventInvitations.service.js';
import {sendStaffPollEmail} from '../staffPollEmail.service.js';
const agency={id:2,slug:'itsco'},user={id:5,first_name:'Taylor'},parent={id:7,agency_id:2,event_type:'company_event',title:'Anniversary',starts_at:null,staff_link_token:'a'.repeat(48),operations_json:{invitedAgencyIds:[3],mandatoryUserIds:[5]}};
const poll={id:20,agencyId:2,title:'Which date?',endsAt:'2026-12-01T18:00:00Z',votingConfig:{enabled:true,linkedEventId:7,question:'Choose a <date>',options:[{key:'1',label:'Friday <18th>'},{key:'2',label:'Saturday'}]}};
const input={event:poll,agency,user,to:'taylor@work.example',actorUserId:9};
beforeEach(()=>{vi.resetAllMocks();sendNotificationEmail.mockResolvedValue({id:'legacy'});sendEmailFromIdentity.mockResolvedValue({id:'branded'});
  linkedCompanyEventPollAudience.mockResolvedValue({parent,userIds:[5]});companyEventEmailContext.mockResolvedValue({identity:{id:42,from_email:'events@plottwistco.com'},agencies:[{name:'ITSCO',logoUrl:'https://app.example.com/itsco.png'},{name:'Next Level Up',logoUrl:'https://app.example.com/nlu.png'}]});});
describe('event-linked modern vote mail',()=>{
  it('uses the selected events@ identity and both brands while linking to voting, not invitation RSVP',async()=>{
    expect(await sendStaffPollEmail(input)).toEqual({id:'branded'});expect(sendNotificationEmail).not.toHaveBeenCalled();
    const args=sendEmailFromIdentity.mock.calls[0][0];expect(args).toMatchObject({senderIdentityId:42,to:input.to,templateType:'staff_poll_invitation',templateId:20,userId:5,subject:'Event vote: Anniversary'});
    expect(args.html).toContain('ITSCO + Next Level Up');expect(args.html).toContain('itsco.png');expect(args.html).toContain('nlu.png');
    expect(args.html).toContain('Date to be decided');expect(args.html).toContain('Choose a &lt;date&gt;');expect(args.html).toContain('Friday &lt;18th&gt;');
    expect(args.html).toContain('/conversa/events/itsco/anniversary-7#event-polls-title');expect(args.html).not.toContain('event-rsvp');expect(args.html).not.toContain('?r=yes');
    expect(args.html).toContain('Required attendance');expect(args.html).toContain('Your vote is separate from your event RSVP');
  });
  it('uses the same modern voting link and explicit subject for followups',async()=>{
    await sendStaffPollEmail({...input,followup:true});expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({subject:'Reminder — event vote: Anniversary',templateType:'staff_poll_followup',linkUrl:'https://auricwell.com/conversa/events/itsco/anniversary-7#event-polls-title'}));
  });
  it('does not email a formerly invited person after parent access changes',async()=>{
    linkedCompanyEventPollAudience.mockResolvedValue({parent,userIds:[]});expect(await sendStaffPollEmail(input)).toEqual({skipped:true,reason:'event_invitation_expired'});
    expect(sendEmailFromIdentity).not.toHaveBeenCalled();expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
  it('does not silently fall back to a general sender when events@ is unavailable',async()=>{
    companyEventEmailContext.mockRejectedValue(Object.assign(new Error('Missing events sender'),{code:'event_sender_missing'}));
    await expect(sendStaffPollEmail(input)).rejects.toHaveProperty('code','event_sender_missing');expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
  it('preserves the established standalone poll email delivery',async()=>{
    expect(await sendStaffPollEmail({...input,event:{...poll,votingConfig:{...poll.votingConfig,linkedEventId:null}}})).toEqual({id:'legacy'});
    expect(sendNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({templateType:'staff_poll_invitation',agencyId:2}));expect(sendEmailFromIdentity).not.toHaveBeenCalled();expect(companyEventEmailContext).not.toHaveBeenCalled();
  });
});
