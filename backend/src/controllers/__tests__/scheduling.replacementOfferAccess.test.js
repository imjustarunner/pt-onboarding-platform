import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../appointment.controller.js',()=>({assertAppointmentChangeAccess:vi.fn()}));
vi.mock('../availability.controller.js',()=>({createMyOfficeAvailabilityRequest:vi.fn(async(req,res)=>res.json(req.body))}));
vi.mock('../../services/cancellationFollowUp.service.js',()=>({cancellationFollowUp:{customSlot:vi.fn(),context:vi.fn()}}));
vi.mock('../../services/appointmentReplacementOffer.service.js',()=>({replacementOffers:{respond:vi.fn(),releaseSlot:vi.fn()}}));
vi.mock('../../services/guardianAppointments.service.js',()=>({authorizedClient:vi.fn()}));
vi.mock('../../services/privateReplacementSlots.service.js',()=>({readReplacementSlotRecipients:vi.fn()}));
import pool from '../../config/database.js';
import {readReplacementSlotRecipients} from '../../services/privateReplacementSlots.service.js';
import Appointment from '../../models/Appointment.model.js';
import {assertAppointmentChangeAccess} from '../appointment.controller.js';
import {createMyOfficeAvailabilityRequest} from '../availability.controller.js';
import {cancellationFollowUp} from '../../services/cancellationFollowUp.service.js';
import {replacementOffers} from '../../services/appointmentReplacementOffer.service.js';
import {authorizedClient} from '../../services/guardianAppointments.service.js';
import {requestOffice,response,custom,details} from '../appointmentReplacementOffer.controller.js';
const room={id:8,buildingId:3,needsRequest:true,date:'2030-01-03',weekday:4,startHour:10,endHour:12,windowLabel:'One time'};
const request=()=>({params:{id:'1',appointmentId:'1',clientId:'8'},query:{agencyId:99},user:{id:5},body:{localStart:'2030-01-03T10:15',roomId:8,confirmOneTime:true,requestedFrequency:'WEEKLY',providerId:99}});
const responseMock=()=>({status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();Appointment.findById.mockResolvedValue({id:1,agencyId:2,providerUserId:5});assertAppointmentChangeAccess.mockResolvedValue();cancellationFollowUp.customSlot.mockResolvedValue({rooms:[room],slot:null});authorizedClient.mockResolvedValue({agency_id:2});});
describe('private replacement authorization and one-time office requests',()=>{
  it.each(['guardian','client_guardian','client'])('never exposes offer recipients to a %s',async role=>{
    const req=request(),res=responseMock();req.user.role=role;await details(req,res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);expect(pool.execute).not.toHaveBeenCalled();expect(readReplacementSlotRecipients).not.toHaveBeenCalled();
  });
  it('checks agency and provider scheduling access before reading client identities',async()=>{
    const req=request();req.params.slotId='20';pool.execute.mockResolvedValue([[{id:20,agency_id:2,provider_id:7}]]);
    const denied=Object.assign(new Error('Access denied'),{status:403});assertAppointmentChangeAccess.mockRejectedValue(denied);const next=vi.fn();
    await details(req,responseMock(),next);expect(next).toHaveBeenCalledWith(denied);expect(readReplacementSlotRecipients).not.toHaveBeenCalled();
    expect(assertAppointmentChangeAccess).toHaveBeenCalledWith(req,{agencyId:2,providerUserId:7});
  });
  it('returns private recipient details without a cacheable response only after authorization',async()=>{
    const req=request(),res=responseMock();req.params.slotId='20';const slot={id:20,agency_id:2,provider_id:5,slot_json:JSON.stringify({modality:'BOTH',roomLabel:'#7',timeZone:'America/Denver'})};
    pool.execute.mockResolvedValue([[slot]]);readReplacementSlotRecipients.mockResolvedValue([{clientName:'Test client',expiresAt:'2030-01-03T17:00:00Z'}]);
    const next=vi.fn();await details(req,res,next);expect(next).not.toHaveBeenCalled();expect(readReplacementSlotRecipients).toHaveBeenCalledWith(pool,slot);
    expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith(expect.objectContaining({recipients:[expect.objectContaining({clientName:'Test client'})]}));
  });
  it('forces the authorized provider, agency, exact room and one occurrence regardless of submitted recurrence',async()=>{
    const req=request(),res=responseMock(),next=vi.fn();await requestOffice(req,res,next);expect(next).not.toHaveBeenCalled();
    expect(cancellationFollowUp.customSlot).toHaveBeenCalledWith(1,expect.objectContaining({modality:'IN_PERSON'}));
    expect(createMyOfficeAvailabilityRequest).toHaveBeenCalledWith(expect.objectContaining({query:{agencyId:2},body:expect.objectContaining({agencyId:2,providerId:5,requestedFrequency:'ONCE',requestedOccurrenceCount:1,requestedStartDate:'2030-01-03',preferredOfficeIds:[3],preferredRoomIds:[8],slots:[{weekday:4,startHour:10,endHour:12,roomId:8}]})}),res,next);
  });
  it('requires explicit one-time confirmation and never submits a recurring request',async()=>{
    const req=request(),res=responseMock();req.body.confirmOneTime=false;await requestOffice(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(400);expect(createMyOfficeAvailabilityRequest).not.toHaveBeenCalled();
  });
  it('checks the room again and rejects one that is no longer available',async()=>{
    cancellationFollowUp.customSlot.mockResolvedValue({rooms:[]});const res=responseMock();await requestOffice(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);expect(createMyOfficeAvailabilityRequest).not.toHaveBeenCalled();
  });
  it('checks staff access before searching the provider’s private schedule',async()=>{
    const err=Object.assign(new Error('Denied'),{status:403});assertAppointmentChangeAccess.mockRejectedValue(err);const next=vi.fn();await custom(request(),responseMock(),next);expect(next).toHaveBeenCalledWith(err);expect(cancellationFollowUp.customSlot).not.toHaveBeenCalled();
  });
  it('forbids responses in guardian preview mode',async()=>{
    const req=request(),res=responseMock();req.guardianPreviewMode=true;await response(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(replacementOffers.respond).not.toHaveBeenCalled();
  });
  it('rejects a guardian without clinical appointment access',async()=>{
    authorizedClient.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));const next=vi.fn();await response(request(),responseMock(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(replacementOffers.respond).not.toHaveBeenCalled();
  });
  it('rejects an appointment in a different agency from the authorized client',async()=>{
    authorizedClient.mockResolvedValue({agency_id:99});const res=responseMock();await response(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(replacementOffers.respond).not.toHaveBeenCalled();
  });
});
