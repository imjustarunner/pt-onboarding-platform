import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { createCancellationFollowUpService, coveringReplacementRooms, validateCancellationChoices } from '../cancellationFollowUp.service.js';
import { oneTimeRoomWindow } from '../replacementOfficeRequest.service.js';

const start='2030-01-03T17:15:00.000Z', end='2030-01-03T18:15:00.000Z';
function setup({modality='IN_PERSON',reservations=[],busyBlocks=[],freeRooms=[]}={}) {
  const appointment={id:1,agencyId:2,providerUserId:5,modality,startAt:'2030-01-02T17:00:00Z',endAt:'2030-01-02T18:00:00Z',sourceTimezone:'America/Denver'};
  const availability={computeWeekAvailability:vi.fn(async()=>({officeReservations:reservations,busyBlocks,virtualSlots:[],inPersonSlots:[]}))};
  const roomOptions=vi.fn(async()=>freeRooms),appointments={findById:async()=>appointment};
  const service=createCancellationFollowUpService({appointments,availability,roomOptions,now:()=>new Date('2030-01-01T10:00:00Z')});
  return {service,availability,roomOptions,appointment};
}
const own=(id,startAt,endAt,overrides={})=>({id,roomId:7,buildingId:3,roomLabel:'#7',buildingName:'Office',roomAvailable:true,hasAppointment:false,startAt,endAt,...overrides});

describe('one-time private rescheduling room choices',()=>{
  it('allows an unpublished virtual time without an office request',async()=>{
    const h=setup({modality:'VIRTUAL'});const result=await h.service.customSlot(1,{localStart:'2030-01-03T10:15'});
    expect(result.slot).toMatchObject({startAt:start,endAt:end,modality:'VIRTUAL',roomId:null});expect(h.roomOptions).not.toHaveBeenCalled();
  });
  it.each(['VIRTUAL','IN_PERSON'])('lets an originally %s visit offer either format independently', async original => {
    const h=setup({modality:original,reservations:[own(10,'2030-01-03T17:00:00Z','2030-01-03T19:00:00Z')]});
    const virtual=await h.service.customSlot(1,{localStart:'2030-01-03T10:15',modality:'VIRTUAL',roomId:7});
    expect(virtual.slot).toMatchObject({modality:'VIRTUAL',roomId:null,buildingId:null,officeEventId:null,availableFormats:['VIRTUAL']});expect(h.roomOptions).not.toHaveBeenCalled();
    const inPerson=await h.service.customSlot(1,{localStart:'2030-01-03T10:15',modality:'IN_PERSON',roomId:7});
    expect(inPerson.slot).toMatchObject({modality:'IN_PERSON',roomId:7,availableFormats:['IN_PERSON']});
    const both=await h.service.customSlot(1,{localStart:'2030-01-03T10:15',modality:'BOTH',roomId:7});
    expect(both.slot).toMatchObject({modality:'BOTH',roomId:7,availableFormats:['IN_PERSON','VIRTUAL']});expect(both.slot.label).toContain('client chooses');
  });
  it('requires one-time room approval for a dual-format offer even if the original was virtual',async()=>{
    const h=setup({modality:'VIRTUAL',freeRooms:[{id:8,needsRequest:true}]});
    expect(await h.service.customSlot(1,{localStart:'2030-01-03T10:15',modality:'BOTH',roomId:8})).toMatchObject({slot:null,requiresOfficeRequest:true});
    await expect(h.service.validatePrivateSlots(h.appointment,[{startAt:start,endAt:end,modality:'BOTH',roomId:8}])).rejects.toThrow('available room reservations');
  });
  it('keeps a live dual-format invitation usable virtually if its room is no longer secured',async()=>{
    const h=setup({modality:'IN_PERSON'}),candidate={startAt:start,endAt:end,modality:'BOTH',roomId:7};
    const [slot]=await h.service.validatePrivateSlots(h.appointment,[candidate],{skipUnavailable:true});
    expect(slot).toMatchObject({modality:'BOTH',roomId:7,availableFormats:['VIRTUAL']});expect(slot.label).toContain('Virtual');
    expect(slot.key).toBe([start,end,'BOTH',7].join('|'));
  });
  it('rejects an unsupported replacement format before checking rooms',async()=>{
    const h=setup();await expect(h.service.customSlot(1,{localStart:'2030-01-03T10:15',modality:'PUBLIC'})).rejects.toThrow('Choose in office');expect(h.roomOptions).not.toHaveBeenCalled();
  });
  it('combines a published time available in both formats for either original visit type',async()=>{
    const h=setup({modality:'VIRTUAL'});
    h.availability.computeWeekAvailability.mockResolvedValue({virtualSlots:[{startAt:start,endAt:end}],inPersonSlots:[{startAt:start,endAt:end,roomId:7,roomLabel:'#7',buildingId:3}]});
    expect(await h.service.slots(h.appointment)).toMatchObject([{modality:'BOTH',availableFormats:['IN_PERSON','VIRTUAL'],roomId:7}]);
  });
  it('does not attach a room to a virtual-only opening published from a room reservation',async()=>{
    const h=setup({modality:'IN_PERSON'});
    h.availability.computeWeekAvailability.mockResolvedValue({virtualSlots:[{startAt:start,endAt:end,roomId:7,buildingId:3,roomLabel:'#7'}],inPersonSlots:[]});
    const [slot]=await h.service.slots(h.appointment);
    expect(slot).toMatchObject({modality:'VIRTUAL',roomId:null,buildingId:null,roomLabel:null});
    const [validated]=await h.service.validatePrivateSlots(h.appointment,[slot]);expect(validated.key).toBe(slot.key);
  });
  it('requires an available room choice outside the provider’s reserved hours',async()=>{
    const room={id:8,buildingId:3,label:'Office · #8',needsRequest:true};const h=setup({freeRooms:[room]});
    const result=await h.service.customSlot(1,{localStart:'2030-01-03T10:15'});expect(result).toMatchObject({slot:null,rooms:[room]});
    const selected=await h.service.customSlot(1,{localStart:'2030-01-03T10:15',roomId:8});expect(selected).toMatchObject({slot:null,requiresOfficeRequest:true});
  });
  it('does not allow a forged unavailable room choice into a client offer',async()=>{
    const h=setup({freeRooms:[{id:8,needsRequest:true}]});await expect(h.service.customSlot(1,{localStart:'2030-01-03T10:15',roomId:99})).rejects.toThrow('available room reservations');
  });
  it('does not turn a pending room request into secured availability',async()=>{
    const h=setup({freeRooms:[{id:8,needsRequest:true}]});await expect(h.service.validatePrivateSlots(h.appointment,[{startAt:start,endAt:end,roomId:8}])).rejects.toThrow('available room reservations');
  });
  it('uses an existing reserved room without requesting it again',async()=>{
    const h=setup({reservations:[own(10,'2030-01-03T17:00:00Z','2030-01-03T19:00:00Z')]});
    const result=await h.service.customSlot(1,{localStart:'2030-01-03T10:15',roomId:7});
    expect(result.slot).toMatchObject({startAt:start,endAt:end,roomId:7,buildingId:3,officeEventIds:[10]});expect(result.rooms[0].needsRequest).toBe(false);
  });
  it('combines adjacent reserved hours for a quarter-hour start',async()=>{
    const h=setup({reservations:[own(10,'2030-01-03T17:00:00Z','2030-01-03T18:00:00Z'),own(11,'2030-01-03T18:00:00Z','2030-01-03T19:00:00Z')]});
    const [slot]=await h.service.validatePrivateSlots(h.appointment,[{startAt:start,endAt:end,roomId:7}]);expect(slot.officeEventIds).toEqual([10,11]);
  });
  it('rejects a gap, an occupied room, and an unavailable room',()=>{
    const rows=[own(10,'2030-01-03T17:00:00Z','2030-01-03T18:00:00Z'),own(11,'2030-01-03T18:05:00Z','2030-01-03T19:00:00Z')];
    expect(coveringReplacementRooms(rows,new Date(start),new Date(end))).toEqual([]);
    expect(coveringReplacementRooms([own(10,start,end,{hasAppointment:true})],new Date(start),new Date(end))).toEqual([]);
    expect(coveringReplacementRooms([own(10,start,end,{roomAvailable:false})],new Date(start),new Date(end))).toEqual([]);
  });
  it('rechecks calendar commitments before offering a nonpublished time',async()=>{
    const h=setup({modality:'VIRTUAL',busyBlocks:[{startAt:start,endAt:end}]});await expect(h.service.customSlot(1,{localStart:'2030-01-03T10:15'})).rejects.toThrow('conflicts');
  });
  it('removes an offered time from the live choices if another client selected it',async()=>{
    const h=setup({modality:'VIRTUAL',busyBlocks:[{startAt:start,endAt:end}]});expect(await h.service.validatePrivateSlots(h.appointment,[{startAt:start,endAt:end}],{skipUnavailable:true})).toEqual([]);
  });
  it('rejects past and overlong-range room requests before searching offices',async()=>{
    const h=setup();await expect(h.service.customSlot(1,{localStart:'2029-12-30T10:15'})).rejects.toThrow('future time');await expect(h.service.customSlot(1,{localStart:'2031-01-03T10:15'})).rejects.toThrow('120 days');expect(h.roomOptions).not.toHaveBeenCalled();
  });
  it('rejects nonexistent local times during daylight saving changes',async()=>{
    const h=setup();await expect(h.service.customSlot(1,{localStart:'2030-03-10T02:15'})).rejects.toThrow('does not exist');
  });
  it('requests only the necessary whole-hour room window for that date',()=>{
    expect(oneTimeRoomWindow(new Date(start),new Date(end),'America/Denver')).toMatchObject({date:'2030-01-03',weekday:4,startHour:10,endHour:12,startAt:'2030-01-03 17:00:00',endAt:'2030-01-03 19:00:00'});
    expect(oneTimeRoomWindow(new Date(start),new Date(end),'America/Denver').windowLabel).toContain('one time only');
  });
  it('requires consent to send the offer invitation and limits the replacement choices',()=>{
    expect(()=>validateCancellationChoices({eventType:'canceled',notificationMode:'none',suppressionReason:'Called',followUpAction:'private_slots',offeredSlots:[{}]})).toThrow('Send a notification');
    expect(()=>validateCancellationChoices({eventType:'canceled',followUpAction:'private_slots',offeredSlots:Array(7).fill({})})).toThrow('six');
    expect(validateCancellationChoices({eventType:'canceled',followUpAction:'private_slots',offeredSlots:[{}]}).notificationMode).toBe('send');
  });
});
