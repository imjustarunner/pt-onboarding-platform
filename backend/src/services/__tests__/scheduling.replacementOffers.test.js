import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/Client.model.js', () => ({ default: {} }));
vi.mock('../appointment.service.js',()=>({createAppointment:vi.fn()}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{create:vi.fn()}}));
vi.mock('../appointmentScheduleNotice.service.js',()=>({appointmentScheduleNotices:{queue:vi.fn()}}));
import {createAppointment} from '../appointment.service.js';
import ProviderScheduleEvent from '../../models/ProviderScheduleEvent.model.js';
import {appointmentScheduleNotices} from '../appointmentScheduleNotice.service.js';
import { createReplacementOfferService } from '../appointmentReplacementOffer.service.js';
import { slotKey } from '../cancellationFollowUp.service.js';

function setup() {
  createAppointment.mockReset().mockResolvedValue({id:30});ProviderScheduleEvent.create.mockReset().mockResolvedValue({id:40});appointmentScheduleNotices.queue.mockReset().mockResolvedValue({pending:1});
  const slot={startAt:'2030-01-04T17:00:00.000Z',endAt:'2030-01-04T18:00:00.000Z',modality:'VIRTUAL',roomId:null,timeZone:'America/Denver'};slot.key=slotKey(slot);
  const makeOffer=(id,clientId)=>({id,appointment_id:id,agency_id:2,provider_id:5,client_id:clientId,mode:'private_slots',status:'open',expires_at:'2030-01-03 10:00:00',slots_json:JSON.stringify([slot])});
  const offers=[makeOffer(1,8),makeOffer(2,9)],requests=[],writes=[];let released=false;
  const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),execute:vi.fn(async(sql,p=[])=>{
    if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]];
    if(sql.startsWith('SELECT RELEASE_LOCK'))return [[{released:1}]];
    if(sql.startsWith('SELECT * FROM appointment_replacement_offers WHERE agency_id='))return [offers.filter(o=>o.agency_id===p[0]&&o.request_id===p[1])];
    if(sql.startsWith('SELECT * FROM appointment_replacement_offers WHERE id='))return [offers.filter(o=>o.id===p[0])];
    if(sql.startsWith('SELECT * FROM public_appointment_requests'))return [requests.filter(r=>r.id===p[0])];
    if(sql.startsWith('SELECT slot_json FROM appointment_replacement_slots'))return [[{slot_json:JSON.stringify(slot)}]];
    if(sql.startsWith('SELECT id FROM appointments WHERE agency_id='))return [[]];
    if(sql.startsWith('UPDATE public_appointment_requests SET status=')){requests.find(r=>r.id===p[1]).status=p[0];return [{}];}
    if(sql.startsWith('UPDATE appointment_replacement_offers SET status=?,linked_appointment_id=')){Object.assign(offers.find(o=>o.id===p[2]),{status:p[0],linked_appointment_id:p[1]});return [{}];}
    if(sql.startsWith('SELECT * FROM appointment_replacement_offers WHERE appointment_id='))return [offers.filter(o=>o.appointment_id===p[0]&&o.client_id===p[1])];
    if(sql.startsWith('SELECT s.id,s.slot_json'))return [released?[]:[{id:20,slot_json:JSON.stringify(slot)}]];
    if(sql.startsWith('SELECT a.id FROM appointments'))return [[]];
    if(sql.startsWith('SELECT id FROM public_appointment_requests'))return [requests.filter(r=>r.clientId===p[0])];
    if(sql.startsWith('SELECT first_name,last_name,email'))return [[{email:'guardian@example.test'}]];
    if(sql.startsWith('SELECT full_name,initials FROM clients'))return [[{full_name:'Client',initials:'C'}]];
    if(sql.startsWith('INSERT INTO public_appointment_requests')){const id=requests.length+1;requests.push({id,clientId:p[9],status:'PENDING'});return [{insertId:id}];}
    if(sql.startsWith('UPDATE appointment_replacement_offers SET status=')){Object.assign(offers.find(o=>o.id===p[4]),{status:p[0],request_id:p[1],selected_slot_id:p[2]});return [{}];}
    if(sql.startsWith('SELECT * FROM appointment_replacement_slots'))return [[{id:20,provider_id:5}]];
    if(sql.startsWith('SELECT r.id FROM appointment_replacement_offers'))return [requests];
    if(sql.startsWith('UPDATE appointment_replacement_slots SET released_at')){released=true;return [{}];}
    if(sql.startsWith('INSERT INTO notifications')||sql.startsWith('INSERT INTO appointment_communications')||sql.startsWith('INSERT INTO user_communications')||sql.startsWith('UPDATE appointment_replacement_offer_slots')){writes.push({sql,p});return [{insertId:1}];}
    throw new Error(`Unexpected SQL ${sql}`);
  })};
  conn.getConnection=async()=>conn;conn.release=vi.fn();
  let tail=Promise.resolve();const providerLock=vi.fn(async(db,id,fn)=>{const prev=tail;let release;tail=new Promise(r=>{release=r;});await prev;try{return await fn(conn);}finally{release();}});
  const deps={database:conn,now:()=>new Date('2030-01-01T10:00:00Z'),encrypt:s=>s,decrypt:s=>s,
    appointments:{findById:vi.fn(async id=>({id,agencyId:2,providerUserId:5,status:'canceled_by_provider'})),listParticipants:vi.fn(async id=>[{clientId:id===1?8:9}]),getBilling:vi.fn(async()=>({})),update:vi.fn()},
    clients:{findById:vi.fn(async()=>({status_key:'active'}))},providerLock,clientLock:async(ids,fn)=>fn(),
    eligible:vi.fn(),invalidate:vi.fn(),checkWindow:vi.fn(),checkSelection:vi.fn(async()=>{if(requests.length)throw Object.assign(new Error('Time already selected'),{status:409});}),
    followUp:{nextAppointment:vi.fn(async()=>({id:50,displayWhen:'Next Thursday'})),validatePrivateSlots:vi.fn(async(a,slots,options)=>requests.length&&!options?.excludePublicRequestId?[]:slots),bookingEnabled:vi.fn(async()=>false)}};
  return {service:createReplacementOfferService(deps),deps,conn,offers,requests,writes,slot};
}

describe('private replacement invitations',()=>{
  it('allows only the first of two clients selecting the shared slot',async()=>{
    const h=setup();const result=await Promise.allSettled([h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key}),h.service.respond({appointmentId:2,clientId:9,userId:11,action:'select',selectedKey:h.slot.key})]);
    expect(result[0].status).toBe('fulfilled');expect(result[0].value.status).toBe('requested');expect(result[1].status).toBe('rejected');expect(h.requests).toHaveLength(1);
    expect(h.deps.checkWindow).toHaveBeenCalledWith(h.conn,expect.objectContaining({replacementOfferId:1}));
    expect(h.writes.some(w=>w.sql.startsWith('INSERT INTO appointment_communications'))).toBe(true);expect(h.writes.some(w=>w.sql.startsWith('INSERT INTO user_communications'))).toBe(true);
  });
  it('repeating the same selection returns its existing request without another reservation',async()=>{
    const h=setup(),args={appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key};const first=await h.service.respond(args);expect(await h.service.respond(args)).toEqual(first);expect(h.requests).toHaveLength(1);
  });
  it('allows keeping the next session without selecting or changing another appointment',async()=>{
    const h=setup();expect(await h.service.respond({appointmentId:1,clientId:8,userId:10,action:'decline'})).toEqual({status:'declined',requestId:null});expect(h.requests).toHaveLength(0);expect(h.deps.checkWindow).not.toHaveBeenCalled();expect((await h.service.view(1,8)).nextAppointment.id).toBe(50);
  });
  it('requires the appointment’s participant even when someone knows an offer ID',async()=>{
    const h=setup();await expect(h.service.respond({appointmentId:1,clientId:9,userId:11,action:'select',selectedKey:h.slot.key})).rejects.toThrow('no longer available');expect(h.requests).toHaveLength(0);
  });
  it('rejects a fabricated unoffered time',async()=>{
    const h=setup();await expect(h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:'fabricated'})).rejects.toThrow('offered to you');expect(h.requests).toHaveLength(0);
  });
  it('expires the invitation without changing the next recurring session',async()=>{
    const h=setup();h.offers[0].expires_at='2029-12-31 10:00:00';expect(await h.service.view(1,8)).toMatchObject({status:'expired',slots:[],nextAppointment:{id:50}});await expect(h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key})).rejects.toThrow('expired');
  });
  it('rechecks provider eligibility and terminated-client status at selection',async()=>{
    const h=setup();h.deps.clients.findById.mockResolvedValue({status_key:'terminated'});await expect(h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key})).rejects.toThrow('terminated');expect(h.requests).toHaveLength(0);
  });
  it('released slots disappear from every outstanding invitation',async()=>{
    const h=setup();await h.service.releaseSlot(20,5);expect((await h.service.view(1,8)).slots).toEqual([]);expect((await h.service.view(2,9)).slots).toEqual([]);expect(h.deps.invalidate).toHaveBeenCalledWith(h.conn,5);
  });
  it('prevents releasing a slot already selected by a client',async()=>{
    const h=setup();await h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key});await expect(h.service.releaseSlot(20,5)).rejects.toThrow('already selected');
  });
  it('does not enable public booking for a private exception',async()=>{
    const h=setup();expect((await h.service.view(1,8)).slots).toHaveLength(1);expect(h.deps.followUp.bookingEnabled).not.toHaveBeenCalled();
    h.offers[0].mode='portal_booking';expect((await h.service.view(1,8)).slots).toEqual([]);
  });
  it('confirms one independent occurrence and only then queues its booking notice',async()=>{
    const h=setup();await h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key});
    expect(await h.service.decideRequest({agencyId:2,requestId:1,status:'APPROVED',actorUserId:5})).toMatchObject({appointmentId:30,status:'APPROVED'});
    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({replacementOfferId:1,deferScheduleNotice:true,startAt:h.slot.startAt,endAt:h.slot.endAt}));
    expect(ProviderScheduleEvent.create).toHaveBeenCalledWith(expect.objectContaining({recurrenceSeriesId:null,notifyParticipants:false}));
    expect(h.deps.appointments.update).toHaveBeenCalledWith(30,{providerScheduleEventId:40});
    expect(h.offers[0]).toMatchObject({status:'confirmed',linked_appointment_id:30});expect(appointmentScheduleNotices.queue).toHaveBeenCalledWith(30,{eventType:'created',actorUserId:5});
    expect(appointmentScheduleNotices.queue.mock.invocationCallOrder[0]).toBeGreaterThan(h.conn.commit.mock.invocationCallOrder.at(-1));
  });
  it('does not notify the client if linking the replacement calendar occurrence fails',async()=>{
    const h=setup();await h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key});ProviderScheduleEvent.create.mockRejectedValue(new Error('Calendar unavailable'));
    await expect(h.service.decideRequest({agencyId:2,requestId:1,status:'APPROVED',actorUserId:5})).rejects.toThrow('Calendar unavailable');expect(appointmentScheduleNotices.queue).not.toHaveBeenCalled();expect(h.requests[0].status).toBe('PENDING');
  });
  it('an approval retry uses the same linked appointment and notification identity',async()=>{
    const h=setup();await h.service.respond({appointmentId:1,clientId:8,userId:10,action:'select',selectedKey:h.slot.key});h.offers[0].linked_appointment_id=30;
    expect(await h.service.decideRequest({agencyId:2,requestId:1,status:'APPROVED',actorUserId:5})).toMatchObject({alreadyConfirmed:true,appointmentId:30});expect(createAppointment).not.toHaveBeenCalled();expect(appointmentScheduleNotices.queue).toHaveBeenCalledWith(30,{eventType:'created',actorUserId:5});
  });
});
