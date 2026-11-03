import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {createCancellationEmailReceipts,needsCancellationReceipt,appendCancellationReceipt} from '../cancellationEmailReceipt.service.js';
import {cancellationReceiptRouter} from '../../routes/publicCancellationReceipt.routes.js';
import {dayAbsenceMessage,schoolDayAbsenceMessage} from '../dayAbsencePolicy.service.js';
import {schoolDayAbsenceSender} from '../schoolDayAbsenceEmail.service.js';
import {authorizedAppointmentNoticeRecipient} from '../appointmentFamilyRecipients.service.js';
import {constrainPortalEmailLayout} from '../../utils/portalEmailLayout.js';
import {visibleMeetingRsvpParticipants} from '../meetingRsvpVisibility.js';
import {dayCancellationAttention} from '../dayCancellationAttention.service.js';
import {canceledSessionSummary} from '../canceledSessionSummary.service.js';
import {saveMeetingSelfRsvp} from '../meetingSelfRsvp.service.js';

function harness() {
  let row=null,changes=0;
  const database={execute:vi.fn(async(sql,p=[])=>{
    if(sql.startsWith('INSERT IGNORE')) { row ||= {id:1,token_payload:p[10],delivery_status:'pending',expires_at:'2030-04-01 00:00:00'};return [{}]; }
    if(sql.startsWith('SELECT')) return [[row].filter(Boolean)];
    if(sql.includes('SET confirmed_at=')) {if(!row.confirmed_at){row.confirmed_at='2030-01-01 12:00:00';changes++;}return [{affectedRows:1}];}
    if(sql.includes('SET delivery_status=')){row.delivery_status=p[0];return [{}];}
    return [{}];
  })};
  const service=createCancellationEmailReceipts({database,now:()=>new Date('2030-01-01T12:00:00Z'),encrypt:s=>`encrypted:${s}`,decrypt:s=>s.slice(10),baseUrl:()=> 'https://tenant.example.test',randomToken:()=> 'a'.repeat(43)});
  return {service,database,row:()=>row,changes:()=>changes};
}
const input={agencyId:450,clientId:2337,providerId:1433,actorUserId:1433,deliveryType:'appointment',deliveryKey:'5',recipient:'parent@example.test'};
describe('urgent cancellation email receipts',()=>{
  it('issues only for urgent family Cancel day emails',()=>{
    expect(needsCancellationReceipt({absenceSource:'cancel_day',emailOnly:true})).toBe(true);
    for(const facts of [{absenceSource:'planned_out',emailOnly:true},{absenceSource:'cancel_day',emailOnly:true,urgent:false},{emailOnly:true},{}]) expect(needsCancellationReceipt(facts)).toBe(false);
  });
  it('stores encrypted recipient and token, reuses a delivery claim, and confirms exactly once',async()=>{
    const h=harness(),first=await h.service.issue(input),second=await h.service.issue(input);
    expect(first).toEqual(second);
    const insert=h.database.execute.mock.calls[0][1];expect(insert[9]).not.toContain('a'.repeat(43));expect(insert[10]).toMatch(/^encrypted:/);expect(insert[11]).toMatch(/^encrypted:/);
    const token=first.url.split('/').at(-1);
    await expect(h.service.inspect(token)).rejects.toMatchObject({status:409});
    await h.service.sent(first.id,'sent');expect(await h.service.inspect(token)).toEqual({confirmed:false});
    expect(h.changes()).toBe(0);
    await Promise.all([h.service.confirm(token),h.service.confirm(token)]);expect(h.changes()).toBe(1);
    expect(await h.service.inspect(token)).toEqual({confirmed:true});
  });
  it('rejects missing, malformed, and expired links without revealing the recipient',async()=>{
    const h=harness();await expect(h.service.inspect('bad')).rejects.toMatchObject({status:404});
    expect(h.database.execute).not.toHaveBeenCalled();await h.service.issue(input);await h.service.sent(1,'sent');h.row().expires_at='2029-01-01 00:00:00';
    await expect(h.service.confirm('a'.repeat(43))).rejects.toMatchObject({status:410});expect(h.changes()).toBe(0);
  });
  it('does not record receipt on GET or on an unconfirmed or cross-origin POST',async()=>{
    const receipts={inspect:vi.fn(async()=>({confirmed:false})),confirm:vi.fn()};const router=cancellationReceiptRouter(receipts);
    const handler=method=>router.stack.find(l=>l.route?.methods[method]).route.stack[0].handle;
    const req={params:{token:'a'.repeat(43)},baseUrl:'/api/public/cancellation-receipt',body:{},get:()=>null};
    const res={type:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),send:vi.fn(),redirect:vi.fn()};
    await handler('get')(req,res);expect(receipts.confirm).not.toHaveBeenCalled();expect(res.send.mock.lastCall[0]).toContain('I received this');expect(res.send.mock.lastCall[0]).not.toContain('parent@');
    await handler('post')(req,res);expect(res.status).toHaveBeenLastCalledWith(400);expect(receipts.confirm).not.toHaveBeenCalled();
    await handler('post')({...req,body:{confirm:'yes'},get:k=>k==='origin'?'https://other.example':'tenant.example.test'},res);expect(res.status).toHaveBeenLastCalledWith(403);expect(receipts.confirm).not.toHaveBeenCalled();
    await handler('post')({...req,body:{confirm:'yes'}},res);expect(receipts.confirm).toHaveBeenCalledTimes(1);expect(res.redirect.mock.lastCall[0]).toBe(303);
  });
  it('adds one receipt button and keeps synthetic markup escaped',()=>{
    const m=appendCancellationReceipt({text:'<child>',html:'<p>Notice</p>'},'https://example.test/receipt');expect(m.html.match(/>I received this</g)).toHaveLength(1);expect(m.text).toContain('do not need to contact you another way');
  });
});
describe('authorship, recipient eligibility and retained records',()=>{
  it('uses natural first/third-person copy with the explicit date and child, without category labels',()=>{
    const args={providerName:'Avery',schoolName:'Rudy',date:'2026-11-16',reasonCategory:'weather',clientName:'Child'};
    const family=dayAbsenceMessage({...args,providerAuthored:true});expect(family.text).toContain('I need to cancel the session for Child');expect(family.text).toContain('November 16, 2026');expect(family.text).not.toMatch(/Reason:|Category:|so our session/);
    const own=schoolDayAbsenceMessage({...args,providerAuthored:true});expect(own.text).toContain('Hello, Rudy team');expect(own.text).toContain('I need to cancel my sessions');expect(own.text).not.toContain('all of my clients have received');
    const staff=schoolDayAbsenceMessage({...args,providerAuthored:false});expect(staff.text).toContain('Avery has let us know');expect(staff.text).toContain('We are contacting');expect(staff.text).not.toContain('I need to');
  });
  it('uses the provider work mailbox or the owning tenant schools mailbox with schools Reply-To',async()=>{
    const personal=vi.fn(async()=>({identity:{id:1},replyTo:'provider@tenant.test',displayName:'Avery'}));const domain=async()=> 'tenant.test';
    const identities=async()=>[{id:2,agency_id:450,from_email:'schools@tenant.test',is_active:1},{id:3,agency_id:451,from_email:'schools@other.test',is_active:1}];
    expect(await schoolDayAbsenceSender({agencyId:450,providerId:7,providerAuthored:true},{personal,domain,identities})).toMatchObject({senderIdentityId:1,fromDisplayNameOverride:'Avery'});
    expect(await schoolDayAbsenceSender({agencyId:450,providerAuthored:false},{personal,domain,identities})).toMatchObject({senderIdentityId:2,replyToOverride:'schools@tenant.test'});expect(personal).toHaveBeenCalledTimes(1);
    await expect(schoolDayAbsenceSender({agencyId:452,providerAuthored:false},{personal,domain,identities})).rejects.toThrow('Configure');
  });
  it('allows an authorized minor guardian to receive logistics email while portal access stays disabled',async()=>{
    const database={execute:vi.fn(async()=>[[{id:2337,date_of_birth:'2018-01-01'}]])},adult=vi.fn(),link=vi.fn(async()=>({access_enabled:1,relationship_type:'guardian',permissions_json:{canViewAppointments:true}}));
    await authorizedAppointmentNoticeRecipient(1440,2337,{agencyId:450},{database,adult,link});expect(adult).not.toHaveBeenCalled();expect(database.execute.mock.calls[0][0]).not.toContain('guardian_portal_enabled');
    for(const permissions of [{noView:true},{noViewOtherGuardian:true},{canViewAppointments:false},{coGuardianInviteRestricted:true}]) {link.mockResolvedValue({access_enabled:1,permissions_json:permissions});await expect(authorizedAppointmentNoticeRecipient(1440,2337,{agencyId:450},{database,adult,link})).rejects.toMatchObject({status:403});}
    link.mockResolvedValue({access_enabled:1,relationship_type:'guardian'});database.execute.mockResolvedValue([[{id:2337,date_of_birth:'1990-01-01'}]]);adult.mockRejectedValue(Object.assign(new Error('Disclosure review required'),{status:403}));
    await expect(authorizedAppointmentNoticeRecipient(1440,2337,{agencyId:450},{database,adult,link})).rejects.toThrow('Disclosure review');
  });
  it('keeps all portal footers inside a bounded document',()=>{
    const html=constrainPortalEmailLayout('<html><head></head><body><table data-portal-email="v2">Notice</table></body></html><div>Compliance footer</div>');
    expect(html).toContain('max-width:600px;table-layout:fixed');expect(html).toMatch(/Compliance footer[\s\S]*<\/body><\/html>$/);expect(constrainPortalEmailLayout('<p>Ordinary email</p>')).toBe('<p>Ordinary email</p>');
  });
  it('keeps the viewer’s declined RSVP available without exposing other declines',async()=>{
    const people=[{id:7,rsvp:'declined',rsvp_decline_reason:'Planned out'},{id:8,rsvp:'declined',rsvp_decline_reason:'Private'},{id:9,rsvp:'accepted'}];
    expect(visibleMeetingRsvpParticipants(people,false,7).map(p=>p.id)).toEqual([7,9]);
    const event={id:540,provider_id:1438,kind:'TEAM_MEETING',status:'ACTIVE',start_at:'2030-01-02 16:00:00'},database={execute:vi.fn(async()=>[[{linked:1}]])};
    await saveMeetingSelfRsvp(event,1433,'accepted',{database,now:()=>new Date('2030-01-01T12:00:00Z')});expect(database.execute.mock.lastCall[1]).toEqual([540,1433,'accepted']);
    database.execute.mockResolvedValue([[]]);await expect(saveMeetingSelfRsvp(event,7,'accepted',{database,now:()=>new Date('2030-01-01T12:00:00Z')})).rejects.toMatchObject({status:403});
  });
});

it('projects failed cancellation outreach into Needs attention without copying private records or other agencies',async()=>{
 const plan={date:'2026-11-16',internalReason:'PRIVATE',items:[{key:'a',kind:'appointment',id:175,agencyId:450,title:'Office family',date:'2026-11-16',note:'PRIVATE NOTE'},{key:'b',kind:'appointment',agencyId:451,title:'Other tenant'}]};
 const database={execute:vi.fn(async()=>[[{token:'review',provider_id:1433,plan_json:JSON.stringify(plan),results_json:JSON.stringify({a:{status:'completed',notificationDelivery:{sent:0,skipped:2}},b:{status:'failed'}})}]])};
 const result=await dayCancellationAttention({id:1433},450,{database,decrypt:s=>s});
 expect(result).toHaveLength(1);expect(result[0].appointmentId).toBe(175);expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Other tenant/);expect(database.execute.mock.calls[0][1]).toEqual([1433,1433]);
});
it('summarizes who canceled a session without exposing its full signed facts',async()=>{
 const result=await canceledSessionSummary({status:'canceled_by_provider',canceledByUserId:1434,providerUserId:1433,cancellationFeeCents:0,cancellationRecommendationJson:{facts:{clientFacingReason:'Weather',absenceSource:'cancel_day',internalReason:'PRIVATE'}}},{user:async id=>({first_name:id===1434?'Jordan':'Avery'})});
 expect(result).toMatchObject({actorName:'Jordan',providerName:'Avery',reason:'Weather',feeCents:0});expect(JSON.stringify(result)).not.toContain('PRIVATE');expect(await canceledSessionSummary({status:'cancellation_requested'})).toBeNull();
});
