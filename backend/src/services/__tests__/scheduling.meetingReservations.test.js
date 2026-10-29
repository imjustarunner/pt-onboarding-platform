import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../appointmentConflict.service.js',()=>({assertAppointmentWindowAvailable:vi.fn()}));
vi.mock('../supervisionReviewTime.service.js',()=>({assertNoReviewTimeOverlap:vi.fn()}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:s=>s,maybeDecryptNotePayload:s=>s}));
import {createMeetingReservationService} from '../meetingReservations.service.js';
import {normalizeReservation,reservationWindows,reservationHash,reservationSnapshot,reservationStaff} from '../meetingReservationPolicy.js';
const now=new Date('2030-01-01T10:00:00Z'),host={id:7,role:'provider'},employee={id:8,role:'staff'};
const roster=[{id:8,name:'Employee One',email:'one@example.test'}];
const draft=()=>({agencyId:2,title:'Quarterly evaluation',type:'evaluation',timeZone:'America/Denver',modality:'BOTH',location:'Office 4, 10 Main St',meetingUrl:'https://meet.example.test/room',
  windows:[{localStart:'2030-01-04T10:00',localEnd:'2030-01-04T12:00',durationMinutes:45,gapMinutes:15}],
  selectedStarts:['2030-01-04T17:00:00.000Z','2030-01-04T18:00:00.000Z'],expiresLocal:'2030-01-03T17:00',
  recipients:[{userId:8,email:'reviewed@example.test',sendEmail:true}],subject:'Choose your evaluation time',message:'Please reserve a time.'});
describe('standalone meeting offer parameters',()=>{
  it('limits employee offers to staff roles, including when another account has agency membership',()=>{
    for(const role of ['athlete','guardian','client','school_staff','candidate','unknown','']) expect(reservationStaff({id:8,role})).toBe(false);
    for(const role of ['provider','staff','assistant_admin','intern','clinical_practice_assistant']) expect(reservationStaff({id:8,role})).toBe(true);
  });
  it('generates complete 30/45/60 minute openings with gaps in the agency time zone',()=>{
    const config=normalizeReservation(draft(),roster,now);
    expect(config.slots).toEqual([{startAt:'2030-01-04T17:00:00.000Z',endAt:'2030-01-04T17:45:00.000Z',holdEndAt:'2030-01-04T18:00:00.000Z'},{startAt:'2030-01-04T18:00:00.000Z',endAt:'2030-01-04T18:45:00.000Z',holdEndAt:'2030-01-04T19:00:00.000Z'}]);
    for(const durationMinutes of [30,60])expect(reservationWindows({...draft(),windows:[{...draft().windows[0],durationMinutes}]},now).length).toBeGreaterThan(0);
  });
  it('retains a reviewed email while binding employee claims to their account',()=>{
    expect(normalizeReservation(draft(),roster,now).recipients).toEqual([{userId:8,name:'Employee One',email:'reviewed@example.test',key:'user:8'}]);
  });
  it('supports tagging without email and named external email invitations',()=>{
    const input=draft();input.recipients=[{userId:8,sendEmail:false},{name:'School contact',email:'school@example.test'}];
    expect(normalizeReservation(input,roster,now).recipients).toEqual([{userId:8,name:'Employee One',email:null,key:'user:8'},{userId:null,name:'School contact',email:'school@example.test',key:'email:school@example.test'}]);
  });
  it.each([
    ['unknown employee',i=>i.recipients[0].userId=99,'current employees'],
    ['duplicate recipient',i=>i.recipients.push({...i.recipients[0]}),'only once'],
    ['email header injection',i=>i.recipients[0].email='one@example.test\nBcc:other@example.test','valid email'],
    ['unoffered selection',i=>i.selectedStarts=['2030-01-04T16:00:00.000Z'],'changed'],
    ['expired invitation',i=>i.expiresLocal='2029-12-31T10:00','expiration'],
    ['late expiration',i=>i.expiresLocal='2030-01-05T10:00','expiration'],
    ['missing location',i=>i.location='','location'],
    ['unsafe meeting link',i=>i.meetingUrl='javascript:alert(1)','HTTPS'],
    ['overlapping windows',i=>i.windows.push({...i.windows[0]}),'overlap'],
    ['invalid gap',i=>i.windows[0].gapMinutes=-1,'gap'],
    ['invalid duration',i=>i.windows[0].durationMinutes=5,'30, 45, or 60'],
    ['invalid zone',i=>i.timeZone='No/SuchZone','time zone']
  ])('rejects %s',(_,change,message)=>{const input=draft();change(input);expect(()=>normalizeReservation(input,roster,now)).toThrow(message);});
  it('rejects skipped local times and windows crossing daylight-saving transitions',()=>{
    expect(()=>reservationWindows({...draft(),windows:[{localStart:'2030-03-10T02:30',localEnd:'2030-03-10T04:00',durationMinutes:30,gapMinutes:0}]},now)).toThrow('does not exist');
    expect(()=>reservationWindows({...draft(),windows:[{localStart:'2030-03-10T01:00',localEnd:'2030-03-10T04:00',durationMinutes:30,gapMinutes:0}]},now)).toThrow('daylight-saving');
  });
});

function setup({published=true,external=false}={}) {
  const config=normalizeReservation(draft(),roster,now),token='a'.repeat(64),secondToken='b'.repeat(64);
  let state={offer:{id:1,agency_id:2,host_user_id:7,title:config.title,status:published?'open':'draft',revision:1,config_json:JSON.stringify(config),expires_at:'2030-01-04 00:00:00'},
    slots:published?[{id:10,offer_id:1,start_at:'2030-01-04 17:00:00',end_at:'2030-01-04 17:45:00',hold_end_at:'2030-01-04 18:00:00',event_id:20,status:'open'}]:[],
    events:published?[{id:20,provider_id:7,kind:'SCHEDULE_HOLD',status:'ACTIVE',title:'Offered time',start_at:'2030-01-04 17:00:00',end_at:'2030-01-04 18:00:00'}]:[],
    invitees:published?[{id:30,offer_id:1,user_id:external?null:8,email:'one@example.test',display_name:'Employee One',token_hash:reservationHash(token),token_payload:token},
      {id:31,offer_id:1,user_id:null,email:'two@example.test',display_name:'Contact Two',token_hash:reservationHash(secondToken),token_payload:secondToken}]:[],deliveries:[],attendees:[]};
  const locks=new Map(),execute=vi.fn(async(sql,p=[])=>{
    if(sql.startsWith('SELECT u.id'))return [roster];
    if(sql.startsWith('SELECT * FROM meeting_reservation_offers'))return [[state.offer].filter(o=>o.id===p[0])];
    if(sql.startsWith('SELECT * FROM meeting_reservation_invitees WHERE token_hash'))return [state.invitees.filter(i=>i.token_hash===p[0])];
    if(sql.startsWith('SELECT * FROM meeting_reservation_invitees WHERE id'))return [state.invitees.filter(i=>i.id===p[0]).map(i=>({...i}))];
    if(sql.startsWith('SELECT * FROM meeting_reservation_slots'))return [state.slots.filter(s=>s.id===p[0])];
    if(sql.startsWith('SELECT * FROM provider_schedule_events'))return [state.events.filter(e=>e.id===p[0])];
    if(sql.startsWith('SELECT e.* FROM meeting_reservation_slots')){const slot=state.slots.find(s=>s.id===p[0]);return [state.events.filter(e=>e.id===slot?.event_id)];}
    if(sql.startsWith('SELECT s.id,s.start_at'))return [state.slots.filter(s=>s.status==='open').map(s=>({...s}))];
    if(sql.startsWith('SELECT s.*,e.status'))return [state.slots];
    if(sql.startsWith('SELECT id,user_id'))return [state.invitees];
    if(sql.startsWith('SELECT d.id,d.invitee_id'))return [state.deliveries];
    if(sql.startsWith('UPDATE meeting_reservation_invitees SET first_viewed'))return [{affectedRows:1}];
    if(sql.startsWith('INSERT INTO provider_schedule_events')){
      const buffer=sql.includes('Gap after reserved meeting'),id=20+state.events.length;
      state.events.push({id,provider_id:p[1],kind:'SCHEDULE_HOLD',status:'ACTIVE',start_at:p[buffer?2:4],end_at:p[buffer?3:5]});return [{insertId:id}];
    }
    if(sql.startsWith('INSERT INTO meeting_reservation_slots')){const id=10+state.slots.length;state.slots.push({id,offer_id:p[0],start_at:p[1],end_at:p[2],hold_end_at:p[3],event_id:p[4],status:'open'});return [{insertId:id}];}
    if(sql.startsWith('INSERT INTO meeting_reservation_invitees')){const id=30+state.invitees.length;state.invitees.push({id,offer_id:p[0],user_id:p[1],recipient_key:p[2],display_name:p[3],email:p[4],token_hash:p[5],token_payload:p[6]});return [{insertId:id}];}
    if(sql.startsWith('INSERT IGNORE INTO meeting_reservation_deliveries')){if(!state.deliveries.some(d=>d.invitee_id===p[0]&&d.delivery_key===p[1]))state.deliveries.push({invitee_id:p[0],delivery_key:p[1],kind:p[2],status:'pending'});return [{affectedRows:1}];}
    if(sql.startsWith('INSERT IGNORE INTO provider_schedule_event_attendees')){state.attendees.push({eventId:p[0],userId:p[1]});return [{}];}
    if(sql.startsWith("UPDATE provider_schedule_events SET kind='TEAM_MEETING'")){Object.assign(state.events.find(e=>e.id===p[8]),{kind:'TEAM_MEETING',meeting_subtype:p[0],title:p[1],end_at:p[3],location_text:p[4],google_meet_link:p[5],meeting_settings_json:p[6]});return [{}];}
    if(sql.startsWith("UPDATE meeting_reservation_slots SET status='booked'")){Object.assign(state.slots.find(s=>s.id===p[1]),{status:'booked',buffer_event_id:p[0]});return [{}];}
    if(sql.startsWith('UPDATE meeting_reservation_invitees SET slot_id=')){Object.assign(state.invitees.find(i=>i.id===p[2]),{slot_id:p[0],booking_snapshot:p[1]});return [{}];}
    if(sql.startsWith("UPDATE meeting_reservation_offers SET status='open'")){state.offer.status='open';state.offer.revision++;return [{}];}
    if(sql.startsWith("UPDATE meeting_reservation_offers SET status='closed'")){state.offer.status='closed';return [{}];}
    if(sql.startsWith('UPDATE provider_schedule_events e JOIN')){for(const s of state.slots.filter(s=>s.status==='open'))state.events.find(e=>e.id===s.event_id).status='CANCELLED';return [{}];}
    if(sql.startsWith("UPDATE meeting_reservation_slots SET status='closed'")){state.slots.filter(s=>s.status==='open').forEach(s=>s.status='closed');return [{}];}
    if(sql.startsWith('UPDATE meeting_reservation_deliveries d JOIN'))return [{}];
    throw new Error('Unexpected SQL: '+sql);
  });
  const connections=[],database={execute,getConnection:async()=>{
    let snapshot;
    const releases=new Map(),conn={beginTransaction:vi.fn(async()=>{snapshot=structuredClone(state);}),commit:vi.fn(),rollback:vi.fn(async()=>{state=snapshot;}),release:vi.fn(),execute:async(sql,p)=>{
      if(sql.startsWith('SELECT GET_LOCK')){const prior=locks.get(p[0]) || Promise.resolve();let release;const next=new Promise(r=>release=r);locks.set(p[0],next);await prior;releases.set(p[0],release);return [[{acquired:1}]];}
      if(sql.startsWith('SELECT RELEASE_LOCK')){releases.get(p[0])?.();return [[{released:1}]];}
      return execute(sql,p);
    }};connections.push(conn);return conn;
  }};
  const deps={database,now:()=>now,membership:vi.fn(async()=>true),checkWindow:vi.fn(),checkReview:vi.fn(),invalidate:vi.fn(),encrypt:s=>s,decrypt:s=>s};
  return {service:createMeetingReservationService(deps),deps,execute,connections,get state(){return state;},token,secondToken};
}
describe('standalone reservation access and atomic booking',()=>{
  it('publishes only a reviewed commitment and creates no communications before that action',async()=>{
    const h=setup({published:false});
    await expect(h.service.publish(1,{revision:1,reviewed:false,commitment:true},host)).rejects.toThrow('Review');
    expect(h.state.events).toHaveLength(0);expect(h.state.deliveries).toHaveLength(0);
    await h.service.publish(1,{revision:1,reviewed:true,commitment:true},host);
    expect(h.state.offer.status).toBe('open');expect(h.state.events).toHaveLength(2);
    expect(h.state.deliveries.map(d=>d.kind)).toEqual(['invitation','tag']);
    await h.service.publish(1,{revision:1,reviewed:true,commitment:true},host);
    expect(h.state.events).toHaveLength(2);expect(h.state.invitees).toHaveLength(1);
  });
  it('rolls back the entire publication when an opening was taken after preview',async()=>{
    const h=setup({published:false});h.deps.checkWindow.mockResolvedValueOnce().mockRejectedValueOnce(Object.assign(new Error('Calendar conflict'),{status:409}));
    await expect(h.service.publish(1,{revision:1,reviewed:true,commitment:true},host)).rejects.toThrow('Calendar conflict');
    expect(h.state.events).toHaveLength(0);expect(h.state.offer.status).toBe('draft');expect(h.state.deliveries).toHaveLength(0);
  });
  it('schedules a claimed evaluation immediately on both calendars with reminders and the selected format',async()=>{
    const h=setup(),result=await h.service.claim(30,{slotId:10,modality:'IN_PERSON'},employee);
    expect(result.booking).toMatchObject({eventId:20,status:'ACTIVE',location:'Office 4, 10 Main St',meetingUrl:''});
    expect(h.state.events[0]).toMatchObject({kind:'TEAM_MEETING',meeting_subtype:'evaluation',end_at:'2030-01-04 17:45:00'});
    expect(JSON.parse(h.state.events[0].meeting_settings_json).reminders).toEqual([1440,60]);
    expect(h.state.attendees).toEqual([{eventId:20,userId:8}]);expect(h.state.events[1]).toMatchObject({kind:'SCHEDULE_HOLD',start_at:'2030-01-04 17:45:00',end_at:'2030-01-04 18:00:00'});
    expect(h.deps.checkWindow).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({providerUserId:8,providerScheduleEventId:20}));
    expect(h.state.deliveries.map(d=>d.kind)).toEqual(['confirmation','host_booking','host_alert']);
    expect(h.deps.invalidate).toHaveBeenCalledWith(expect.anything(),7);expect(h.deps.invalidate).toHaveBeenCalledWith(expect.anything(),8);
  });
  it('allows only one of two simultaneous invitees to claim a slot',async()=>{
    const h=setup({external:true}),results=await Promise.allSettled([h.service.claim(h.token,{slotId:10,modality:'VIRTUAL'}),h.service.claim(h.secondToken,{slotId:10,modality:'IN_PERSON'})]);
    expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);expect(h.state.invitees.filter(i=>i.slot_id)).toHaveLength(1);expect(h.state.events.filter(e=>e.kind==='TEAM_MEETING')).toHaveLength(1);
  });
  it('returns the existing reservation on a repeated or simultaneous claim without duplicating notices',async()=>{
    const h=setup();await Promise.all([h.service.claim(30,{slotId:10,modality:'VIRTUAL'},employee),h.service.claim(30,{slotId:10,modality:'VIRTUAL'},employee)]);
    expect(h.state.events.filter(e=>e.kind==='TEAM_MEETING')).toHaveLength(1);expect(h.state.deliveries).toHaveLength(3);
  });
  it('does not expose invitation recipients, tokens or other claims on the reservation page',async()=>{
    const h=setup({external:true}),view=await h.service.view(h.token);
    expect(view.name).toBe('Employee One');expect(JSON.stringify(view)).not.toMatch(/token|two@example|Contact Two|recipient_key|booking_snapshot/);
  });
  it('requires the tagged employee account even when the email link is forwarded',async()=>{
    const h=setup();await expect(h.service.view(h.token)).rejects.toMatchObject({status:401});await expect(h.service.view(h.token,host)).rejects.toMatchObject({status:403});
    await expect(h.service.view(31,employee)).rejects.toThrow('private email');
  });
  it('rejects revoked agency membership and access by a family account',async()=>{
    const h=setup();h.deps.membership.mockResolvedValue(false);await expect(h.service.view(30,employee)).rejects.toMatchObject({status:403});
    await expect(h.service.detail(1,{id:7,role:'client'})).rejects.toMatchObject({status:403});
  });
  it('keeps offer audit details private to the host',async()=>{const h=setup();await expect(h.service.detail(1,employee)).rejects.toMatchObject({status:404});});
  it.each(['closed','expired','held-entry-changed','unoffered-format','other-offer'])('rejects %s claims without creating a meeting',async kind=>{
    const h=setup();if(kind==='closed')h.state.offer.status='closed';if(kind==='expired')h.state.offer.expires_at='2029-12-31 10:00:00';if(kind==='held-entry-changed')h.state.events[0].end_at='2030-01-04 19:00:00';if(kind==='other-offer')h.state.slots[0].offer_id=99;
    await expect(h.service.claim(30,{slotId:10,modality:kind==='unoffered-format'?'PHONE':'VIRTUAL'},employee)).rejects.toThrow();expect(h.state.events[0].kind).toBe('SCHEDULE_HOLD');
  });
  it('preserves claimed meetings when the host closes an offer',async()=>{
    const h=setup();await h.service.claim(30,{slotId:10,modality:'VIRTUAL'},employee);await h.service.close(1,host);
    expect(h.state.offer.status).toBe('closed');expect(h.state.events[0].status).toBe('ACTIVE');expect((await h.service.view(30,employee)).booking.status).toBe('ACTIVE');
  });
  it('releases unclaimed holds on close without creating cancellation notes or appointments',async()=>{
    const h=setup();await h.service.close(1,host);expect(h.state.events[0].status).toBe('CANCELLED');expect(h.state.slots[0].status).toBe('closed');
    expect(h.execute.mock.calls.some(([sql])=>/INSERT INTO (appointments|clinical_notes)/.test(sql))).toBe(false);
  });
  it('uses actual meeting changes in the reservation details and notification snapshot',async()=>{
    const h=setup();await h.service.claim(30,{slotId:10,modality:'VIRTUAL'},employee);const before=reservationSnapshot(h.state.events[0]);h.state.events[0].start_at='2030-01-04 19:00:00';
    expect((await h.service.view(30,employee)).booking.startAt).toBe('2030-01-04T19:00:00.000Z');expect(reservationSnapshot(h.state.events[0])).not.toBe(before);
  });
});
