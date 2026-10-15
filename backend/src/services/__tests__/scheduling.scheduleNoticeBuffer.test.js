import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { createAppointmentScheduleNoticeService } from '../appointmentScheduleNotice.service.js';
import { buildScheduleNoticeMessage, scheduleNoticeDeadline } from '../scheduleNoticeMessage.service.js';

function harness() {
  let clock = new Date('2030-01-01T10:00:00Z');
  const notices = [], deliveries = [];
  const appointments = new Map([[1, { id: 1, agencyId: 2, providerUserId: 5, status: 'canceled_by_provider', startAt: '2030-01-02T17:00:00Z', endAt: '2030-01-02T18:00:00Z', sourceTimezone: 'America/Denver' }]]);
  const group = (r,p) => r.agency_id===p[0] && r.provider_id===p[1] && r.client_id===p[2] && r.status==='pending';
  const database = { execute: vi.fn(async (sql,p=[]) => {
    if (sql.includes('INSERT INTO appointment_schedule_notices')) {
      const keys=['appointment_id','agency_id','provider_id','client_id','event_type','status','payload_json','channels_json','fire_at','created_by_user_id'];
      const row=Object.fromEntries(keys.map((k,i)=>[k,p[i]])); row.id=notices.length+1;row.created_at=clock.toISOString();notices.push(row);return [{insertId:row.id}];
    }
    if (sql.includes('INSERT INTO appointment_schedule_notice_deliveries')) {
      const row={id:deliveries.length+1,batch_id:p[0],channel:p[1],message_json:p[2],status:'sending'};deliveries.push(row);return [{insertId:row.id}];
    }
    if (sql.startsWith('SELECT DISTINCT d.id')) return [deliveries.filter(d=>notices.some(n=>n.appointment_id===p[0] && n.batch_id===d.batch_id))];
    if (sql.startsWith('SELECT * FROM appointment_schedule_notices WHERE id=')) return [[notices.find(n=>n.id===p[0])].filter(Boolean)];
    if (sql.startsWith('SELECT') && sql.includes('event_type IN')) return [notices.filter(n=>n.appointment_id===p[0] && n.client_id===p[1] && ['canceled','rescheduled'].includes(n.event_type))];
    if (sql.startsWith('SELECT') && sql.includes("event_type='created'")) return [notices.filter(n=>n.appointment_id===p[0] && n.client_id===p[1] && n.event_type==='created')];
    if (sql.startsWith('SELECT') && sql.includes('WHERE agency_id=')) return [notices.filter(n=>group(n,p))];
    if (sql.startsWith('SELECT') && sql.includes('WHERE appointment_id=')) return [notices.filter(n=>n.appointment_id===p[0] && (!sql.includes("status='pending'") || n.status==='pending'))];
    if (sql.startsWith('UPDATE appointment_schedule_notices SET fire_at=')) {notices.filter(n=>group(n,p.slice(1))).forEach(n=>n.fire_at=p[0]);return [{}];}
    if (sql.startsWith('UPDATE appointment_schedule_notices SET status=')) {
      const n=notices.find(n=>n.id===p.at(-1));if(n && (!sql.includes("AND status='pending'") || n.status==='pending')) {n.status=sql.match(/status='([^']+)'/)[1];if(sql.includes('batch_id=?'))n.batch_id=p[0];}return [{}];
    }
    if (sql.startsWith('UPDATE appointment_schedule_notice_deliveries')) {Object.assign(deliveries.find(d=>d.id===p[6]),Object.fromEntries(['status','recipient_address','communication_id','external_message_id','error_message','sent_at'].map((k,i)=>[k,p[i]])));return [{}];}
    if (sql.startsWith('UPDATE appointment_reminders') || sql.startsWith('UPDATE appointment_change_notification_queue')) return [{}];
    throw new Error(`Unimplemented test SQL: ${sql}`);
  }) };
  const deps={database,now:()=>clock,lock:async(k,fn)=>fn(),
    encrypt:s=>JSON.stringify({encrypted:Buffer.from(s).toString('base64')}),decrypt:s=>Buffer.from(JSON.parse(s).encrypted,'base64').toString(),
    appointment:vi.fn(async id=>appointments.get(Number(id))),participants:vi.fn(async()=>[{clientId:8}]),
    tenant:vi.fn(async()=>({channelsEnabled:{sms:true},changeNotify:{channels:['email','sms'],bufferMinutes:15}})),
    consent:vi.fn(async()=>({email:true,sms:true,emailAddress:'client@example.test',phoneNumber:'+15555550100',guardianUserId:9})),
    preferences:vi.fn(async()=>({isDefault:true})),normalizePhone:async p=>p,
    log:vi.fn(),communication:vi.fn(async()=>({id:10})),updateCommunication:vi.fn(),
    sendEmail:vi.fn(async()=>({id:'email-1'})),sendSms:vi.fn(async()=>({messageId:'sms-1'})),smsSender:async()=>'+15555550101',
    followUp:async()=>({nextAppointment:async()=>null}),offers:vi.fn(async()=>({ensure:vi.fn(),view:async()=>null})),
    portal:async()=> 'https://portal.example.test/guardian',
    cancellationMessage:async(a,f)=>({subject:'Your appointment was canceled',text:`Your appointment was canceled. ${f.clientFacingReason || ''}`,html:'<p>Your appointment was canceled.</p>'})};
  return {service:createAppointmentScheduleNoticeService(deps),deps,notices,deliveries,appointments,advance:n=>{clock=new Date(+clock+n*60000);}};
}

describe('one durable schedule update per client after edits settle',()=>{
  it('combines a cancellation, a new booking five minutes later, and a subsequent move',async()=>{
    const h=harness();await h.service.queue(1,{eventType:'canceled',facts:{clientFacingReason:'Provider unavailable'}});
    h.advance(5);h.appointments.set(2,{...h.appointments.get(1),id:2,status:'scheduled',startAt:'2030-01-03T17:00:00Z',endAt:'2030-01-03T18:00:00Z'});
    await h.service.queue(2,{eventType:'created'});h.advance(3);
    const before={...h.appointments.get(2)};h.appointments.get(2).startAt='2030-01-04T17:00:00Z';
    await h.service.queue(2,{eventType:'moved',before});
    await h.service.process(1);expect(h.deps.sendEmail).not.toHaveBeenCalled();
    h.advance(15);await h.service.process(1);await h.service.process(1);
    expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);expect(h.deps.sendSms).toHaveBeenCalledTimes(1);
    const email=h.deps.sendEmail.mock.calls[0][0];expect(email.text).toContain('January 4, 2030');expect(email.text).not.toContain('January 3, 2030');
    expect(email.text).toContain('Provider unavailable');expect(h.deps.sendSms.mock.calls[0][0].body).not.toContain('Provider unavailable');
    expect(h.notices[1].status).toBe('superseded');expect(h.notices[0].payload_json).not.toContain('Provider unavailable');
    expect(h.deliveries.every(d=>d.status==='sent'&&d.sent_at)).toBe(true);
    expect(h.deps.log.mock.calls.some(([a])=>a.appointmentId===1&&a.metadata.deliveryStatus==='sent')).toBe(true);
    expect(h.deps.log.mock.calls.some(([a])=>a.appointmentId===2&&a.metadata.deliveryStatus==='sent')).toBe(true);
  });
  it('describes a known appointment move without calling it a cancellation',async()=>{
    const h=harness(),a=h.appointments.get(1);a.status='scheduled';const before={...a};a.startAt='2030-01-04T17:00:00Z';
    await h.service.queue(1,{eventType:'moved',before});h.advance(15);await h.service.process(1);
    expect(h.deps.sendEmail.mock.calls[0][0].subject).toBe('Your appointment has moved');expect(h.deps.sendEmail.mock.calls[0][0].text).not.toContain('canceled');
  });
  it('keeps retrospective cancellations record-only, including replacement offers',async()=>{
    const h=harness();h.appointments.get(1).startAt='2029-12-31T17:00:00Z';
    await h.service.queue(1,{eventType:'canceled',facts:{followUpAction:'private_slots'}});h.advance(30);await h.service.process(1);
    expect(h.deps.offers).not.toHaveBeenCalled();expect(h.deps.sendEmail).not.toHaveBeenCalled();expect(h.notices[0].status).toBe('suppressed');
  });
  it('suppresses the earlier pending booking when the provider cancels without notifications',async()=>{
    const h=harness();h.appointments.get(1).status='scheduled';await h.service.queue(1,{eventType:'created'});
    h.appointments.get(1).status='canceled_by_provider';await h.service.queue(1,{eventType:'canceled',facts:{notificationMode:'none',suppressionReason:'Client contacted by phone'}});
    h.advance(30);await h.service.process(1);expect(h.deps.sendEmail).not.toHaveBeenCalled();expect(h.notices.map(n=>n.status)).toEqual(['superseded','suppressed']);
  });
  it('rechecks SMS consent at delivery rather than trusting queue-time consent',async()=>{
    const h=harness();await h.service.queue(1,{eventType:'canceled'});h.deps.consent.mockResolvedValue({email:true,sms:false,emailAddress:'client@example.test',phoneNumber:'+15555550100'});
    h.advance(15);await h.service.process(1);expect(h.deps.sendSms).not.toHaveBeenCalled();expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);expect(h.deliveries.find(d=>d.channel==='sms').status).toBe('skipped');
  });
  it('honors the client schedule-update preference',async()=>{
    const h=harness();await h.service.queue(1,{eventType:'canceled'});h.deps.preferences.mockResolvedValue({schedulingChangesEnabled:false});
    h.advance(15);await h.service.process(1);expect(h.deps.sendEmail).not.toHaveBeenCalled();expect(h.deliveries.every(d=>d.status==='skipped')).toBe(true);
  });
  it('records uncertain transport acceptance for review and never blindly retries',async()=>{
    const h=harness();h.deps.sendEmail.mockRejectedValue(new Error('Connection lost after send'));await h.service.queue(1,{eventType:'canceled'});
    h.advance(15);await h.service.process(1);await h.service.process(1);expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);expect(h.deliveries[0].status).toBe('review');
  });
  it('makes signed cancellation retries idempotent',async()=>{
    const h=harness();await h.service.queue(1,{eventType:'canceled'});await h.service.queue(1,{eventType:'canceled'});expect(h.notices).toHaveLength(1);
  });
  it('does not send another booking confirmation when approval is retried',async()=>{
    const h=harness();h.appointments.get(1).status='scheduled';await h.service.queue(1,{eventType:'created'});h.advance(15);await h.service.process(1);await h.service.queue(1,{eventType:'created'});expect(h.notices).toHaveLength(1);expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);
  });
  it('does not buffer an imminent cancellation',async()=>{
    const h=harness();h.appointments.get(1).startAt='2030-01-01T10:30:00Z';await h.service.queue(1,{eventType:'canceled'});await h.service.process(1);expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);
  });
  it('allows staff to stop the queued delivery and leaves an audit record',async()=>{
    const h=harness();await h.service.queue(1,{eventType:'canceled'});await h.service.control(1,{cancel:true});h.advance(15);await h.service.process(1);
    expect(h.deps.sendEmail).not.toHaveBeenCalled();expect(h.deps.log.mock.calls.at(-1)[0].metadata.deliveryStatus).toBe('suppressed');
  });
  it('caps successive edits at thirty minutes from the first queued change',()=>{
    expect(scheduleNoticeDeadline({now:new Date('2030-01-01T10:25:00Z'),firstQueuedAt:new Date('2030-01-01T10:00:00Z'),startAt:'2030-01-02T17:00:00Z'}).toISOString()).toBe('2030-01-01T10:30:00.000Z');
  });
  it('does not repeat a verified replacement already described by the moved-session message',()=>{
    const m=buildScheduleNoticeMessage([{appointment:{id:1},payload:{},cancellation:{replacementAppointmentId:2,subject:'Your appointment has moved',text:'Updated time',html:'Updated time'}},{appointment:{id:2},payload:{}}],'https://portal.example.test');
    expect(m.subject).toBe('Your appointment has moved');expect(m.text.match(/Updated time/g)).toHaveLength(1);
  });
});
