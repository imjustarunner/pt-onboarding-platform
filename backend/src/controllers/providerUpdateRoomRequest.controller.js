import pool from '../config/database.js';
import {reviewRecipient,requireSection} from './providerUpdateReview.controller.js';
import {virtualOpening,availabilityContext} from '../services/providerUpdateAvailability.service.js';
import {listOpenForBookingForProvider} from '../services/providerUpdate.service.js';
import Availability from '../services/providerAvailability.service.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export async function updateRoomRequest(req,res,next){
 try{
  const r=await reviewRecipient(req);requireSection(r,'office_schedule');
  if(req.method!=='GET'&&r.previewOnly)throw fail('This preview is read-only.',403);
  const ids={agencyId:Number(r.agency_id),providerId:Number(r.provider_user_id)};
  const c=await availabilityContext(ids);
  if(Number(c.preferences.scheduleAgencyId)!==ids.agencyId)throw fail('Request rooms in the agency that owns your schedule.',403);
  if(!c.preferences.seesClients && !(await listOpenForBookingForProvider(ids.providerId,ids.agencyId)).length)throw fail('An active care-provider assignment or existing office reservation is required to request rooms here.',403);
  const input=req.method==='GET'?req.query:req.body;
  const locationId=Number(input.locationId);
  const [[office]]=await pool.execute(`SELECT l.id,l.timezone FROM office_locations l WHERE l.id=? AND l.is_active=1 AND (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies a WHERE a.office_location_id=l.id AND a.agency_id=?))`,[locationId,ids.agencyId,ids.agencyId]);
  if(!office)throw fail('Choose an office in this agency.',403);
  const opening=virtualOpening(input,office.timezone||'America/Denver');
  const scoped=Object.create(req);scoped.user={id:ids.providerId,role:'provider'};scoped.params={};
  const {availableRoomsForSlot,createOfficeBookingRequest}=await import('./officeSchedule.controller.js');
  if(req.method==='GET'){
   scoped.query={locationId,startAt:opening.startAt,endAt:opening.endAt,recurrence:opening.frequency,occurrenceCount:6};
   return availableRoomsForSlot(scoped,res,next);
  }
  const calendar=await Availability.computeWeekAvailability({...ids,weekStartYmd:opening.date,intakeOnly:true,includePrivateCalendar:true,materializeOfficeEvents:false});
  if(calendar.calendarWarnings?.length)throw fail('Refresh your connected calendars before requesting a room.',409);
  if([...(calendar.busyBlocks||[]),...(calendar.officeReservations||[])].some(b=>Date.parse(b.startAt)<Date.parse(opening.endAt)&&Date.parse(b.endAt)>Date.parse(opening.startAt)))throw fail('This time overlaps your existing schedule.',409);
  const roomId=Number(input.roomId);if(!Number.isSafeInteger(roomId)||roomId<1)throw fail('Choose an available room.');
  scoped.body={agencyId:ids.agencyId,requestedProviderId:ids.providerId,officeLocationId:locationId,roomId,startAt:opening.startAt,endAt:opening.endAt,recurrence:opening.frequency,bookedOccurrenceCount:6,notes:'Recurring room request from Provider Update; client appointments are not created.'};
  return createOfficeBookingRequest(scoped,res,next);
 }catch(e){next(e);}
}
