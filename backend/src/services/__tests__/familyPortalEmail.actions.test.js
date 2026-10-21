import {beforeEach,it,expect,vi} from 'vitest';
import crypto from 'node:crypto';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),appointment:vi.fn(),reply:vi.fn(),setting:vi.fn(),context:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.appointment}}));
vi.mock('../appointmentReply.service.js',()=>({applyAppointmentReply:m.reply}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:m.setting,formatAppointmentTime:()=> 'Wednesday at 2 PM'}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:m.context,sendClientPortalEmail:m.send}));
import {appointmentEmailActionContext,submitAppointmentEmailAction,buildAppointmentEmail,sendAppointmentEmail} from '../appointmentEmailActions.service.js';
const token='a'.repeat(64),email='guardian@example.test';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
let row,appt,access,db;
beforeEach(()=>{
 vi.resetAllMocks();
 appt={id:44,agencyId:2,startAt:'2030-01-02T20:00:00.000Z',endAt:'2030-01-02T21:00:00.000Z',status:'scheduled'};
 row={id:1,token_hash:hash(token),appointment_id:44,client_id:22,agency_id:2,guardian_user_id:9,recipient_hash:hash(email),appointment_start:new Date(appt.startAt),appointment_end:new Date(appt.endAt),expires_at:new Date(appt.endAt),status:'ready'};
 access={email,permissions_json:{}};
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM appointment_email_actions'))return [[...(args[0]===hash(token)?[row]:[])]];
  if(sql.includes('SELECT u.email'))return [[...(access?[access]:[])]];
  if(sql.includes('FROM appointment_participants'))return [[{id:11}]];
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
it('routes school absence to staff review and rejects school cancellation/confirmation actions',async()=>{
 m.setting.mockResolvedValue({isSchool:true});
 await expect(submitAppointmentEmailAction(token,'cancel')).rejects.toMatchObject({status:400});
 expect(await submitAppointmentEmailAction(token,'absence')).toContain('care team');
 expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({autoApply:false,rawBody:expect.stringContaining('miss school')}));
});
it('holds uncertain responses for review instead of repeating mutations',async()=>{
 m.reply.mockRejectedValue(new Error('Connection interrupted'));
 await expect(submitAppointmentEmailAction(token,'cancel')).rejects.toThrow('Connection interrupted');
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("SET status='review'"),[1]);
});
it('builds action buttons for email without SMS reply instructions or full names',async()=>{
 const message=await buildAppointmentEmail({appointment:appt,clientId:22,to:email,actionUrl:'https://example.test/respond/opaque'});
 expect(message.text).not.toContain('Reply Y');expect(message.html).toContain('Confirm appointment');expect(message.html).toContain('action=cancel');expect(message.html).toContain('copy and paste');
 m.setting.mockResolvedValue({isSchool:true});
 const school=await buildAppointmentEmail({appointment:appt,clientId:22,to:email,actionUrl:'https://example.test/respond/opaque',schoolOptOut:{scopeKey:'a'.repeat(64),url:'https://auricwell.com/api/public/school-session-emails/example'}});
 expect(school.subject).toBe('ITSCO: School session notice');expect(school.html).toContain('My child will miss school');expect(school.html).not.toContain('action=confirm');
 expect(school.html).toContain('Stop in-school session emails for this child');expect(school.templateType).toBe('school_session_notice');expect(message.html).not.toContain('school-session-emails');
});
