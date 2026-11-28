import {beforeEach,it,expect,vi} from 'vitest';
import crypto from 'node:crypto';
import {standardizeEmailButtons} from '../../utils/emailActionButton.js';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),appointment:vi.fn(),reply:vi.fn(),setting:vi.fn(),context:vi.fn(),send:vi.fn(),
 consent:vi.fn(),preferences:vi.fn(),authorize:vi.fn(),serviceAllows:vi.fn()}));
vi.mock('../appointmentJoinEmail.service.js',()=>({appointmentJoinEmail:vi.fn(async({appointment,clientId,context})=>{
 if(!['learning','tutoring'].includes(appointment.businessType)||!['VIRTUAL','TELEHEALTH'].includes(appointment.modality))return null;
 const url=context.url(`tutoring-session/appointment/${appointment.id}?clientId=${clientId}&agencyId=${appointment.agencyId}`);return {url,text:`Join tutoring session: ${url}`,html:`<a href="${url}">Join tutoring session</a>`};
})}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.appointment}}));
vi.mock('../appointmentReply.service.js',()=>({applyAppointmentReply:m.reply}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:m.setting,formatAppointmentTime:()=> 'Wednesday at 2 PM'}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:m.context,sendClientPortalEmail:m.send}));
vi.mock('../sessionNotification.service.js',()=>({loadClientConsent:m.consent,getClientPreferences:m.preferences}));
vi.mock('../guardianAppointments.service.js',()=>({authorizedAppointmentClient:m.authorize}));
vi.mock('../clientServiceEnrollment.service.js',()=>({guardianContextAllowsAppointment:m.serviceAllows}));
import {appointmentEmailActionContext,submitAppointmentEmailAction,buildAppointmentEmail,sendAppointmentEmail,
 scheduledOfficeAppointmentLinks} from '../appointmentEmailActions.service.js';
const token='a'.repeat(64),email='guardian@example.test';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const otherEmail='second@example.test';
let row,appt,access,db,guardians;
beforeEach(()=>{
 vi.resetAllMocks();
 appt={id:44,agencyId:2,startAt:'2030-01-02T20:00:00.000Z',endAt:'2030-01-02T21:00:00.000Z',status:'scheduled'};
 row={id:1,token_hash:hash(token),appointment_id:44,client_id:22,agency_id:2,guardian_user_id:9,recipient_hash:hash(email),appointment_start:new Date(appt.startAt),appointment_end:new Date(appt.endAt),expires_at:new Date(appt.endAt),status:'ready'};
 access={email,permissions_json:{}};
 guardians=[{id:9,email,permissions_json:{}},{id:10,email:otherEmail,permissions_json:{}}];
 m.consent.mockImplementation(async (_clientId,_agencyId,id)=>({email:true,emailAddress:guardians.find(g=>g.id===id)?.email}));
 m.preferences.mockResolvedValue({channels:{email:true},optionalRemindersEnabled:true,confirmationRequestsEnabled:true});
 m.authorize.mockResolvedValue({permissions_json:{}});
 m.serviceAllows.mockReturnValue(true);
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM appointment_email_actions'))return [[...(args[0]===hash(token)?[row]:[])]];
  if(sql.includes('SELECT u.email'))return [[...(access?[access]:[])]];
  if(sql.includes('SELECT u.id,u.email,cg.relationship_type'))return [guardians];
  if(sql.includes('FROM appointment_participants'))return [[{id:11}]];
  if(sql.startsWith('SELECT'))return [[]];
  if(sql.includes("status='completed'")){row.status='completed';row.result_message=args[0];}
  return [{affectedRows:1}];
 });
 db={execute:m.execute,release:vi.fn()};m.connection.mockResolvedValue(db);
 m.appointment.mockResolvedValue(appt);m.setting.mockResolvedValue({isSchool:false});
 m.context.mockResolvedValue({tenant:{name:'ITSCO'},brand:{},url:path=>'https://auricwell.com/itsco/'+path});
 m.reply.mockResolvedValue({ackMessage:'Your appointment is confirmed.'});
});
it('blocks opted-out school deliveries while allowing office reminders and another recipient',async()=>{
 m.setting.mockResolvedValue({isSchool:true});
 const execute=m.execute.getMockImplementation();
 let disabled=true;
 m.execute.mockImplementation((sql,args)=>sql.includes('FROM school_session_email_preferences')?Promise.resolve([[...(disabled?[{disabled_at:new Date()}]:[])]]):execute(sql,args));
 expect(await sendAppointmentEmail({appointment:appt,clientId:22,to:email})).toMatchObject({skipped:true,reason:'school_session_email_opted_out'});
 expect(m.send).not.toHaveBeenCalled();
 disabled=false;
 await sendAppointmentEmail({appointment:appt,clientId:22,to:'other@example.test',actionUrl:null});expect(m.send).toHaveBeenCalledTimes(1);
 disabled=true;m.setting.mockResolvedValue({isSchool:false});
 await sendAppointmentEmail({appointment:appt,clientId:22,to:email,actionUrl:null});expect(m.send).toHaveBeenCalledTimes(2);
});
it('validates an opaque link without changing the appointment on read',async()=>{
 expect((await appointmentEmailActionContext(token)).appt.id).toBe(44);expect(m.reply).not.toHaveBeenCalled();
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('rejects fabricated, expired, revoked and changed appointment links',async()=>{
 await expect(appointmentEmailActionContext('b'.repeat(64))).rejects.toMatchObject({status:410});
 row.expires_at=new Date(0);await expect(appointmentEmailActionContext(token)).rejects.toMatchObject({status:410});row.expires_at=new Date(appt.endAt);
 access=null;await expect(appointmentEmailActionContext(token)).rejects.toMatchObject({status:403});access={email,permissions_json:{noView:true}};
 await expect(appointmentEmailActionContext(token)).rejects.toMatchObject({status:403});access={email,permissions_json:{}};
 appt.startAt='2030-01-03T20:00:00.000Z';await expect(appointmentEmailActionContext(token)).rejects.toThrow('changed');expect(m.reply).not.toHaveBeenCalled();
});
it('records a response once and does not apply it again on duplicate submission',async()=>{
 expect(await submitAppointmentEmailAction(token,'confirm')).toContain('confirmed');
 expect(await submitAppointmentEmailAction(token,'confirm')).toContain('confirmed');expect(m.reply).toHaveBeenCalledTimes(1);
 expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({appointmentId:44,agencyId:2,clientId:22,channel:'email',rawBody:'Y'}));
});
it('offers school cancellation only and preserves older absence links',async()=>{
 m.setting.mockResolvedValue({isSchool:true});
 for(const action of ['confirm','reschedule'])await expect(submitAppointmentEmailAction(token,action)).rejects.toMatchObject({status:400});
 m.reply.mockResolvedValue({ackMessage:'Your school session has been canceled.'});
 expect(await submitAppointmentEmailAction(token,'absence')).toContain('canceled');
 expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({autoApply:true,rawBody:'N'}));
});
it('holds uncertain responses for review instead of repeating mutations',async()=>{
 m.reply.mockRejectedValue(new Error('Connection interrupted'));
 await expect(submitAppointmentEmailAction(token,'cancel')).rejects.toThrow('Connection interrupted');
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("SET status='review'"),[1]);
});
it('builds action buttons for email without SMS reply instructions or full names',async()=>{
 const message=await buildAppointmentEmail({appointment:appt,clientId:22,to:email,actionUrl:'https://example.test/respond/opaque'});
 expect(message.text).not.toContain('Reply Y');expect(message.html).toContain('Confirm appointment');expect(message.html).toContain('action=cancel');
 const formatted=standardizeEmailButtons(message.html);expect(formatted).toContain('data-appointment-action="primary"');expect(formatted).toContain('font-size:18px');expect(formatted.match(/font-size:13px/g)).toHaveLength(2);
 m.setting.mockResolvedValue({isSchool:true});
 const school=await buildAppointmentEmail({appointment:appt,clientId:22,to:email,actionUrl:'https://example.test/respond/opaque',schoolOptOut:{scopeKey:'a'.repeat(64),url:'https://auricwell.com/api/public/school-session-emails/example'}});
 expect(school.subject).toBe('ITSCO: School session notice');expect(school.html).toContain('Cancel school session');expect(school.html).not.toContain('action=confirm');expect(school.html).not.toContain('action=reschedule');expect(school.text).toContain('seen today at school');expect(school.text).toContain('schedule changes');
 expect(school.html).toContain('Stop school appointment reminder emails for this child');expect(school.templateType).toBe('school_session_notice');expect(message.html).not.toContain('school-session-emails');
});
it('copies the assigned active provider work account on school notices using the appointment sender',async()=>{
 m.setting.mockResolvedValue({isSchool:true});appt.providerUserId=77;
 const execute=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('SELECT u.work_email,u.email')?Promise.resolve([[{work_email:'provider@example.test',email:'login@example.test'}]]):execute(sql,args));
 await sendAppointmentEmail({appointment:appt,clientId:22,to:email,actionUrl:null});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({appointments:true,cc:['provider@example.test']}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('ua.agency_id=?'),[2,77]);
});
it('routes virtual tutoring email joins through the appointment check, retaining the agency and student',async()=>{
 const message=await buildAppointmentEmail({appointment:{...appt,businessType:'learning',modality:'VIRTUAL'},clientId:22,to:email,actionUrl:null});
 expect(message.text).toContain('Join tutoring session');expect(message.text).toContain('/tutoring-session/appointment/44?clientId=22&agencyId=2');expect(message.text).not.toContain('/join/my-room/');
});

it('uses the tutoring context and NLU session link even for a previously clinical client',async()=>{
 m.context.mockResolvedValue({tenant:{name:'Next Level Up'},learning:true,brand:{},url:path=>'https://app.nextleveluplcc.com/'+path});
 const appointment={...appt,businessType:'tutoring',modality:'VIRTUAL'};
 const message=await buildAppointmentEmail({appointment,clientId:22,to:email,actionUrl:null});
 expect(m.context).toHaveBeenCalledWith({agencyId:2,clientId:22,learning:true});
 expect(message.text).toContain('tutoring session');expect(message.text).toContain('https://app.nextleveluplcc.com/tutoring-session/appointment/44');
 expect(JSON.stringify(message)).not.toContain('auricwell.com');
});
it('uses buttons instead of SMS reply instructions in tutoring email while retaining the reminder detail',async()=>{
 m.context.mockResolvedValue({tenant:{name:'Next Level Up'},learning:true,brand:{},url:path=>'https://app.nextleveluplcc.com/'+path});
 const message=await buildAppointmentEmail({appointment:{...appt,businessType:'tutoring',modality:'VIRTUAL'},clientId:22,to:email,
  actionUrl:'https://example.test/respond/opaque',message:'Reminder: Mathematics tutoring on Wednesday at 2 PM. Reply Y to confirm, N to cancel, R to request a reschedule.'});
 expect(message.text).toContain('Mathematics tutoring on Wednesday at 2 PM');
 expect(message.text).not.toContain('Reply Y');expect(message.html).not.toContain('Reply Y');
 expect(message.html).toContain('action=confirm');expect(message.html).toContain('action=cancel');expect(message.html).toContain('action=reschedule');
 expect(message.text).toContain('For help, reply to this email to contact Support.');expect(message.text).toContain('No sign-in is needed to respond.');
});
it('sends a confirmed client a friendly reminder without another confirm button',async()=>{
 const message=await buildAppointmentEmail({appointment:{...appt,status:'client_confirmed'},kind:'confirmation',clientId:22,to:email,actionUrl:'https://example.test/respond/opaque'});
 expect(message.subject).toContain('Appointment reminder');expect(message.text).toContain('friendly reminder');expect(message.text).toContain('look forward');expect(message.text).not.toContain('Confirm appointment');expect(message.text).not.toContain('Confirm directly');expect(message.text).toContain('Cancel appointment');
});

it('allows a subsequent cancellation after confirmation while keeping each completed response idempotent',async()=>{row.status='completed';row.chosen_action='confirm';row.result_message='Confirmed';appt.status='confirmed';m.reply.mockResolvedValue({ackMessage:'Cancellation received.'});expect(await submitAppointmentEmailAction(token,'cancel')).toBe('Cancellation received.');row.chosen_action='cancel';expect(await submitAppointmentEmailAction(token,'cancel')).toBe('Cancellation received.');expect(m.reply).toHaveBeenCalledTimes(1);});
it.each([{billingOnly:true},{canViewAppointments:false},'malformed'])('withholds appointment responses for restricted or malformed permissions %j',async permissions=>{access.permissions_json=permissions;await expect(appointmentEmailActionContext(token)).rejects.toMatchObject({status:403});expect(m.reply).not.toHaveBeenCalled();});

it('offers RSVP in routine clinical email even when a confirmation request was not queued', async () => {
 const content = await buildAppointmentEmail({
   appointment: appt, clientId: 22, to: email, requiresConfirmation: false,
   actionUrl: 'https://example.test/respond/opaque',
   message: 'Your session is tomorrow. Reply Y to confirm, N to cancel, R to request a reschedule.'
 });
 expect(content.text).toContain('Your session is tomorrow.');
 expect(content.text).not.toContain('Reply Y');
 for (const action of ['confirm', 'cancel', 'reschedule']) {
   expect(content.html).toContain(`?action=${action}`);
   expect(content.text).toContain(`?action=${action}`);
 }
});

it('does not issue a link or send another email after a decline',async()=>{
 const appointment={...appt,cancellationRecommendationJson:{clientReply:'cancel_blocked'}};
 expect(await sendAppointmentEmail({appointment,clientId:22,to:email})).toEqual({skipped:true,reason:'appointment_declined'});
 expect(m.send).not.toHaveBeenCalled();
});

it('sends both guardians reminders with response buttons only for the primary recipient',async()=>{
 const input={appointment:appt,clientId:22,kind:'confirmation',message:'Please confirm your appointment tomorrow. Reply Y to confirm, N to cancel, R to request a reschedule.'};
 await sendAppointmentEmail({...input,to:otherEmail,guardianUserId:10});
 await sendAppointmentEmail({...input,to:' Guardian@Example.Test ',guardianUserId:9});
 expect(m.send).toHaveBeenCalledTimes(2);
 const [[secondary],[primary]]=m.send.mock.calls;
 expect(secondary.subject).toBe('ITSCO: Appointment reminder');
 expect(secondary.text).not.toMatch(/please confirm|reply Y|\?action=/i);
 expect(primary.subject).toBe('ITSCO: Please confirm your appointment');
 for (const action of ['confirm','cancel','reschedule']) expect(primary.html).toContain(`?action=${action}`);
 const inserts=m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO appointment_email_actions'));
 expect(inserts).toHaveLength(1);
 expect(inserts[0][1].slice(1,6)).toEqual([44,2,22,9,hash(email)]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("$.paperProcessing.guardian1Id"),[22,2]);
});

it.each(['email consent','email channel','reminders','confirmation requests','billing only','alternate email','tutoring service'])(
 'uses the other eligible guardian when the primary cannot respond because of %s',async reason=>{
  if(reason==='email consent')m.consent.mockResolvedValueOnce({email:false,emailAddress:email});
  if(reason==='email channel')m.preferences.mockResolvedValueOnce({channels:{email:false}});
  if(reason==='reminders')m.preferences.mockResolvedValueOnce({optionalRemindersEnabled:false});
  if(reason==='confirmation requests')m.preferences.mockResolvedValueOnce({confirmationRequestsEnabled:false});
  if(reason==='billing only')guardians[0].permissions_json={billingOnly:true};
  if(reason==='alternate email')m.consent.mockResolvedValueOnce({email:true,emailAddress:'alternate@example.test'});
  if(reason==='tutoring service'){
   appt.businessType='tutoring';appt.learningContext={serviceEnrollmentId:123};
   m.serviceAllows.mockReturnValueOnce(false);
  }
  const content=await buildAppointmentEmail({appointment:appt,clientId:22,to:otherEmail,guardianUserId:10});
  expect(content.html).toContain('?action=confirm');
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO appointment_email_actions'),
    expect.arrayContaining([44,2,22,10,hash(otherEmail)]));
  if(reason==='tutoring service')expect(m.authorize).toHaveBeenCalledWith(10,22,{agencyId:2,serviceId:123});
 });

it('keeps booking email responses off shared addresses, contacts and mismatched identities',async()=>{
 const input={appointment:appt,clientId:22,to:email};
 expect(await scheduledOfficeAppointmentLinks({...input,to:'contact@example.test'})).toBeNull();
 expect(await scheduledOfficeAppointmentLinks({...input,guardianUserId:10})).toBeNull();
 guardians[1].email=email;
 expect(await scheduledOfficeAppointmentLinks(input)).toBeNull();
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO appointment_email_actions'))).toBe(false);
});

it('selects the remaining school email recipient when the primary opted out of school notices',async()=>{
 m.setting.mockResolvedValue({isSchool:true});
 const execute=m.execute.getMockImplementation();
 m.execute.mockImplementation((sql,args)=>sql.includes('FROM school_session_email_preferences')
  ? Promise.resolve(m.preferences.mock.calls.length===1?[[{disabled_at:new Date()}]]:[[]])
  : execute(sql,args));
 const response=await scheduledOfficeAppointmentLinks({appointment:appt,clientId:22,to:otherEmail,guardianUserId:10});
 expect(response.links).toEqual([{label:'Cancel school session',url:expect.stringContaining('?action=cancel')}]);
});

it('still sends a reminder when no linked recipient can respond',async()=>{
 m.consent.mockResolvedValue({email:false});
 await sendAppointmentEmail({appointment:appt,clientId:22,to:email,kind:'confirmation'});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({subject:'ITSCO: Appointment reminder'}));
 expect(m.send.mock.calls[0][0].html).not.toContain('?action=');
});
