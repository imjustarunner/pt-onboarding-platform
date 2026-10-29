import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../meetingReservations.service.js',()=>({meetingReservations:{}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:s=>s}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:vi.fn()}));
const send=vi.hoisted(()=>vi.fn(async()=>({id:'mail-1'})));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:send}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantNotificationsMailbox:async()=>({notifications:{id:40},domain:'example.test'})}));
import {createMeetingReservationDelivery,reservationMessage} from '../meetingReservationDelivery.service.js';
import {reservationSnapshot} from '../meetingReservationPolicy.js';

function setup({kind='invitation',external=true}={}) {
  const offer={id:1,agency_id:2,host_user_id:7,title:'Evaluation',status:'open',expires_at:'2030-01-05 00:00:00',config_json:{timeZone:'America/Denver',location:'Office 1',subject:'Edited subject',message:'Edited invitation.'}};
  const event={id:20,title:'Evaluation',status:'ACTIVE',start_at:'2030-01-04 17:00:00',end_at:'2030-01-04 17:45:00',location_text:'Office 1',google_meet_link:null,meeting_settings_json:{reminders:[1440,60]}};
  const invitee={id:30,offer_id:1,user_id:external?null:8,email:'invitee@example.test',display_name:'Invitee',token_payload:'secret',slot_id:['invitation','tag'].includes(kind)?null:10,booked_at:'2030-01-01 10:00:00',booking_snapshot:reservationSnapshot(event)};
  const key=['confirmation','change'].includes(kind)?`${kind}:${reservationSnapshot(event)}`:kind==='reminder'?`reminder:60:2030-01-04T17:00:00.000Z`:kind;
  const deliveries=[{id:1,invitee_id:30,kind,delivery_key:key,status:'pending'}];
  let maintenanceBookings=[];
  const database={execute:vi.fn(async(sql,p=[])=>{
    if(sql.startsWith('SELECT id FROM meeting_reservation_offers'))return [[]];
    if(sql.startsWith('SELECT e.*,s.start_at reserved_start'))return [maintenanceBookings];
    if(sql.startsWith('SELECT i.* FROM meeting_reservation_invitees'))return [[invitee]];
    if(sql.startsWith('SELECT * FROM meeting_reservation_deliveries'))return [deliveries.filter(d=>d.status==='pending').map(d=>({...d}))];
    if(sql.includes("SET status='sending'")){const row=deliveries.find(d=>d.id===p[0]);const affectedRows=row.status==='pending'?1:0;if(affectedRows)row.status='sending';return [{affectedRows}];}
    if(sql.startsWith('SELECT * FROM meeting_reservation_invitees'))return [[invitee]];
    if(sql.startsWith('SELECT * FROM meeting_reservation_offers'))return [[offer]];
    if(sql.includes("CONCAT_WS(' ',first_name,last_name) name"))return [[{id:7,name:'Host',email:'host@example.test'}]];
    if(sql.startsWith('SELECT e.* FROM meeting_reservation_slots'))return [[event]];
    if(sql.startsWith('UPDATE meeting_reservation_deliveries SET status=?')){Object.assign(deliveries.find(d=>d.id===p[4]),{status:p[0],communication_id:p[1],error_message:p[2]});return [{}];}
    if(sql.startsWith('UPDATE meeting_reservation_invitees SET booking_snapshot=')){invitee.booking_snapshot=p[0];return [{}];}
    if(sql.startsWith("UPDATE provider_schedule_events SET status='CANCELLED'"))return [{affectedRows:1}];
    throw new Error(sql);
  })};
  const queue=vi.fn(async(db,id,key,kind)=>{if(!deliveries.some(d=>d.delivery_key===key))deliveries.push({id:deliveries.length+1,invitee_id:id,delivery_key:key,kind,status:'pending'});});
  const deps={database,now:()=>new Date('2030-01-03T12:00:00Z'),service:{queue,close:vi.fn()},membership:vi.fn(async()=>true),base:async()=>'https://portal.example.test',decrypt:s=>s,
    sendEmail:vi.fn(async()=>({id:'sent',communicationId:44})),notify:vi.fn(),invalidate:vi.fn()};
  return {deps,worker:createMeetingReservationDelivery(deps),offer,event,invitee,deliveries,queue,enableMaintenance:()=>{maintenanceBookings=[event];}};
}
describe('reservation invitation delivery',()=>{
  it('sends the reviewed email once with a personal link and records the communication receipt',async()=>{
    const h=setup();await Promise.all([h.worker.process(),h.worker.process()]);
    expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);expect(h.deps.sendEmail.mock.calls[0][0]).toMatchObject({to:'invitee@example.test',subject:'Edited subject'});
    expect(h.deps.sendEmail.mock.calls[0][0].text).toContain('/reserve-meeting/secret');expect(h.deliveries[0]).toMatchObject({status:'sent',communication_id:44});
  });
  it('uses an authenticated employee destination for tagged staff',async()=>{
    const h=setup({external:false});await h.worker.process();expect(h.deps.sendEmail.mock.calls[0][0].text).toContain('/meeting-times?invitation=30&agencyId=2');expect(h.deps.sendEmail.mock.calls[0][0].text).not.toContain('/secret');
  });
  it('keeps uncertain sends for review instead of automatically resending',async()=>{
    const h=setup();h.deps.sendEmail.mockRejectedValue(new Error('Transport disconnected'));await h.worker.process();await h.worker.process();expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);expect(h.deliveries[0].status).toBe('review');
  });
  it('reports held mail honestly',async()=>{const h=setup();h.deps.sendEmail.mockResolvedValue({pendingApproval:true});await h.worker.process();expect(h.deliveries[0].status).toBe('held');});
  it.each(['closed','expired','membership-revoked','already-reserved'])('does not send a stale invitation: %s',async condition=>{
    const h=setup();if(condition==='closed')h.offer.status='closed';if(condition==='expired')h.offer.expires_at='2030-01-01 00:00:00';if(condition==='membership-revoked')h.deps.membership.mockResolvedValue(false);if(condition==='already-reserved')h.invitee.slot_id=10;
    await h.worker.process();expect(h.deps.sendEmail).not.toHaveBeenCalled();expect(h.deliveries[0].status).toBe('obsolete');
  });
  it('makes tagged invitations actionable without sending mail',async()=>{const h=setup({kind:'tag',external:false});await h.worker.process();expect(h.deps.notify).toHaveBeenCalledWith(expect.objectContaining({userId:8,relatedEntityType:'meeting_reservation_invitation',relatedEntityId:30}));expect(h.deps.sendEmail).not.toHaveBeenCalled();});
  it('notifies the host from notifications with noreply as Reply-To',async()=>{
    const h=setup({kind:'host_booking'});const {sendEmail:unused,...deps}=h.deps;send.mockClear();await createMeetingReservationDelivery(deps).process();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({to:'host@example.test',senderIdentityId:40,replyToOverride:'noreply@example.test'}));expect(send.mock.calls[0][0].text).toContain('No approval is needed');
  });
  it('suppresses reminders for a moved or canceled meeting',async()=>{
    for(const changed of ['moved','canceled']){const h=setup({kind:'reminder'});if(changed==='moved')h.event.start_at='2030-01-04 18:00:00';else h.event.status='CANCELLED';await h.worker.process();expect(h.deliveries[0].status).toBe('obsolete');expect(h.deps.sendEmail).not.toHaveBeenCalled();}
  });
  it('sends external recipients current details after a later schedule change and suppresses the outdated confirmation',async()=>{
    const h=setup({kind:'confirmation'});h.event.start_at='2030-01-04 18:00:00';h.event.end_at='2030-01-04 18:45:00';h.event.location_text='Updated office';h.enableMaintenance();await h.worker.process();
    expect(h.deliveries[0].status).toBe('obsolete');expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);expect(h.deps.sendEmail.mock.calls[0][0].text).toContain('Updated office');expect(h.deps.sendEmail.mock.calls[0][0].subject).toContain('updated');
  });
  it('queues the latest due external reminder and leaves employee reminders to the existing worker',async()=>{
    const h=setup({kind:'confirmation'});h.deps.now=()=>new Date('2030-01-04T16:30:00Z');h.enableMaintenance();await createMeetingReservationDelivery(h.deps).maintain();
    expect(h.queue).toHaveBeenCalledWith(expect.anything(),30,'reminder:60:2030-01-04T17:00:00.000Z','reminder');expect(h.queue).toHaveBeenCalledTimes(1);
    const employee=setup({kind:'confirmation',external:false});employee.enableMaintenance();await employee.worker.maintain();expect(employee.queue).not.toHaveBeenCalled();
  });
  it('does not send reminder thresholds that passed before the reservation was made',async()=>{
    const h=setup({kind:'confirmation'});h.invitee.booked_at='2030-01-04 16:10:00';h.deps.now=()=>new Date('2030-01-04T16:30:00Z');h.enableMaintenance();await createMeetingReservationDelivery(h.deps).maintain();expect(h.queue).not.toHaveBeenCalled();
  });
  it('releases the original gap when a booked meeting is moved or canceled',async()=>{
    const h=setup({kind:'confirmation'});Object.assign(h.event,{provider_id:7,buffer_event_id:21,reserved_start:h.event.start_at,reserved_end:h.event.end_at,status:'CANCELLED'});h.enableMaintenance();await h.worker.maintain();
    expect(h.deps.database.execute).toHaveBeenCalledWith(expect.stringContaining("kind='SCHEDULE_HOLD'"),[21]);expect(h.deps.invalidate).toHaveBeenCalledWith(h.deps.database,7);
  });
  it('renders cancellation details without retaining the old join link',()=>{
    const h=setup({kind:'change'});h.event.status='CANCELLED';h.event.google_meet_link='https://meet.example.test/old';const message=reservationMessage('change',{offer:h.offer,invitee:h.invitee,event:h.event,url:'https://portal.example.test/reservation'});expect(message.text).toContain('canceled');expect(message.text).not.toContain('/old');
  });
});
