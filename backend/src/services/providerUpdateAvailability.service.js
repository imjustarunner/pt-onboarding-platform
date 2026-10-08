import {publishOfficeAvailability} from './publishOfficeAvailability.service.js';
import pool from '../config/database.js';
import Availability from './providerAvailability.service.js';
import Hours from '../models/ProviderVirtualWorkingHours.model.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import User from '../models/User.model.js';
import { listOpenForBookingForProvider } from './providerUpdate.service.js';
import { providerAvailabilityPreferences } from '../utils/providerAvailabilityReminders.js';
import { agencyFormatAllowed,agencyIntakeStatus } from '../utils/providerAgencyAvailability.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { availabilityOccursOn } from '../utils/availabilityRecurrence.js';
import { editAvailabilityPublication } from './availabilityPublicationEdit.service.js';
import { setOfficeAssignmentBookingAvailability } from './officeAssignmentBookingAvailability.service.js';
import { saveAgencyAvailability } from './providerAgencyAvailability.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw fail('Choose a valid date.');
  // Bound external calendar lookups and recurring publication starts.
  if (Math.abs(Date.parse(value) - Date.now()) > 370 * 86400000) throw fail('Choose a date within one year.');
  return value;
}
const overlaps = (a,b) => Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(a.endAt) > Date.parse(b.startAt);
export function virtualOpening(input, timeZone) {
  const date = calendarDate(input.date), startTime = String(input.startTime || '');
  if (!/^(?:[01]\d|2[0-2]):[0-5]\d$/.test(startTime)) throw fail('Choose a start time before 11 PM for your one-hour opening.');
  if (!['WEEKLY','BIWEEKLY','MONTHLY'].includes(input.frequency)) throw fail('Choose weekly, every other week, or monthly recurring availability.');
  const endTime = String(Number(startTime.slice(0,2)) + 1).padStart(2,'0') + startTime.slice(2);
  const startAt = wallMysqlToUtcMysql(`${date} ${startTime}:00`, timeZone).replace(' ','T')+'Z';
  const endAt = wallMysqlToUtcMysql(`${date} ${endTime}:00`, timeZone).replace(' ','T')+'Z';
  if (Date.parse(startAt) <= Date.now()) throw fail('Choose a future opening.');
  // Reject skipped/repeated wall-clock transitions rather than publishing a different hour.
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(startAt)).map(p=>[p.type,p.value]));
  if (`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` !== `${date} ${startTime}` || Date.parse(endAt)-Date.parse(startAt)!==3600000) throw fail('Choose an hour outside the daylight-saving clock change.');
  return {date, startTime, endTime, startAt, endAt, dayOfWeek:days[new Date(date+'T12:00:00Z').getUTCDay()], frequency:input.frequency};
}
export async function availabilityContext(ids) {
  const [profile,user] = await Promise.all([Profile.getForProvider({providerUserId:ids.providerId,agencyId:ids.agencyId}),User.findById(ids.providerId)]);
  const policy = profile?.agencyAvailability || null;
  return {policy, profile, preferences:{...providerAvailabilityPreferences(user,profile),scheduleAgencyId:policy?.scheduleAgencyId || ids.agencyId,school:policy?.school!==false,officeIds:policy?.officeIds??null}};
}
async function writableContext(ids, format) {
  const context = await availabilityContext(ids);
  if (Number(context.preferences.scheduleAgencyId) !== Number(ids.agencyId)) throw fail('This agency uses a shared schedule. Update openings from the agency that owns that schedule.',403);
  if (!context.preferences.seesClients) throw fail('A care-provider assignment is required before opening client availability.',403);
  if (format && !agencyFormatAllowed(context.policy,format)) throw fail('Enable this format and accepting new clients in your profile availability settings first.',409);
  return context;
}
export async function readUpdateCalendar(ids, {weekStart,previewOnly=false}={}) {
  const timeZone = await Availability.resolveAgencyTimeZone(ids);
  const today = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [calendar,assignments,context,agencies,people,enrollments] = await Promise.all([
    Availability.computeWeekAvailability({...ids,weekStartYmd:calendarDate(weekStart || today),intakeOnly:true,includePrivateCalendar:true,includeDiagnostics:true,materializeOfficeEvents:!previewOnly}),
    listOpenForBookingForProvider(ids.providerId,ids.agencyId),availabilityContext(ids),
    pool.execute('SELECT name,portal_url,slug,organization_type FROM agencies WHERE id=?',[ids.agencyId]),
    pool.execute('SELECT first_name,last_name FROM users WHERE id=?',[ids.providerId]),
    pool.execute('SELECT service_type FROM provider_public_service_enrollments WHERE agency_id=? AND user_id=? AND is_active=1',[ids.agencyId,ids.providerId])
  ]);
  const sourceId = calendar.scheduleAgencyId || ids.agencyId;
  const weekly = await Hours.listForProvider({...ids,agencyId:sourceId});
  const selectedServices=context.profile?.details?.serviceOfferingsByAgency?.[String(ids.agencyId)];
  const services=(Array.isArray(selectedServices)?selectedServices:enrollments[0].map(e=>e.service_type)).filter(s=>['counseling','coaching','tutoring','consulting'].includes(s));
  const profileServices=services.length||Array.isArray(selectedServices)?services:[agencies[0][0]?.organization_type==='life_coach'?'coaching':agencies[0][0]?.organization_type==='consultant'?'consulting':'counseling'];
  const intakeStatusByFormat=Object.fromEntries(['IN_PERSON','VIRTUAL','SCHOOL'].map(format=>{
    const legacy=context.profile?.details?.[{IN_PERSON:'officeAvailability',VIRTUAL:'virtualAvailability',SCHOOL:'schoolAvailability'}[format]];
    return [format,context.policy?agencyIntakeStatus(context.policy,format):['accepting','waitlist','unavailable'].includes(legacy)?legacy:agencyIntakeStatus(context.preferences,format)];
  }));
  return {...calendar,assignments,weekly,profileServices,preferences:{...context.preferences,intakeStatusByFormat},
    canEdit:!previewOnly && Number(sourceId)===Number(ids.agencyId) && context.preferences.seesClients,
    previewOnly, today, agency:agencies[0][0], provider:{id:ids.providerId,...people[0][0]}};
}
export async function addUpdateVirtualOpening(ids, input) {
  await writableContext(ids,'VIRTUAL');
  const timeZone = await Availability.resolveAgencyTimeZone(ids);
  const opening = virtualOpening(input,timeZone);
  const calendar = await Availability.computeWeekAvailability({...ids,weekStartYmd:opening.date,intakeOnly:true,includePrivateCalendar:true,materializeOfficeEvents:false});
  if (calendar.calendarWarnings?.length) throw fail('A connected calendar could not be checked. Refresh the calendar before publishing this opening.',409);
  if ((calendar.busyBlocks||[]).some(b=>overlaps(opening,b))) throw fail('That hour overlaps a booked appointment, school commitment, hold, or calendar event. Choose another hour.',409);
  if ((calendar.officeReservations||[]).some(b=>overlaps(opening,b))) throw fail('Use the reserved office hour in your weekly calendar to open this time virtually or in both formats.',409);
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // Serialize additions for this provider; do not replace existing availability rows.
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[ids.providerId]);
    const [rows] = await db.execute("SELECT *,DATE_FORMAT(start_date,'%Y-%m-%d') start_date,DATE_FORMAT(end_date,'%Y-%m-%d') end_date FROM provider_virtual_working_hours WHERE agency_id=? AND provider_id=? FOR UPDATE",[ids.agencyId,ids.providerId]);
    if (rows.some(r=>r.day_of_week===opening.dayOfWeek && availabilityOccursOn(r,opening.date) && String(r.start_time).slice(0,5)<opening.endTime && String(r.end_time).slice(0,5)>opening.startTime)) throw fail('You already have a virtual opening during that hour. Edit the existing opening instead.',409);
    const [result] = await db.execute(`INSERT INTO provider_virtual_working_hours
      (agency_id,provider_id,day_of_week,start_time,end_time,session_type,available_for_intake,available_for_session,frequency,start_date,end_date,purpose,excluded_dates_json,care_types_json)
      VALUES (?,?,?,?,?,'BOTH',1,1,?,?,?,?, '[]',NULL)`,
      [ids.agencyId,ids.providerId,opening.dayOfWeek,opening.startTime,opening.endTime,opening.frequency,opening.date,opening.frequency==='ONCE'?opening.date:null,opening.frequency==='ONCE'?'INTAKE':'ONGOING']);
    await db.commit();
    return {ok:true,id:result.insertId};
  } catch(e) {await db.rollback();throw e;} finally {db.release();}
}
export async function closeUpdateVirtualOpening(ids, {id,date,scope}) {
  await writableContext(ids);
  calendarDate(date);
  if (!['single','future'].includes(scope)) throw fail('Choose this date or this and future dates.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:await Availability.resolveAgencyTimeZone(ids),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(date<today)throw fail('Choose today or a future date.');
  return editAvailabilityPublication({...ids,kind:'weekly',id:Number(id),action:'delete',scope,occurrenceDate:date});
}
export async function openUpdateOfficeHours(ids,{eventId,assignmentId,inPerson,virtual,frequency='WEEKLY'}) {
  if(!['WEEKLY','BIWEEKLY','MONTHLY'].includes(frequency))throw fail('Choose recurring office availability: weekly, every other week, or monthly.');
  const {policy} = await writableContext(ids);
  if (typeof inPerson!=='boolean'||typeof virtual!=='boolean') throw fail('Choose the formats to publish.');
  if ((inPerson&&!agencyFormatAllowed(policy,'IN_PERSON'))||(virtual&&!agencyFormatAllowed(policy,'VIRTUAL'))) throw fail('Enable the selected formats and accepting new clients in your profile availability settings first.',409);
  // Older updater clients keep their established assignment-level behavior.
  if(!eventId)return setOfficeAssignmentBookingAvailability({...ids,assignmentId:Number(assignmentId),inPerson,virtual,...(inPerson && policy?.officeIds ? {allowedOfficeIds:policy.officeIds}: {})});
  const [[event]]=await pool.execute(`SELECT e.* FROM office_events e LEFT JOIN office_standing_assignments a ON a.id=e.standing_assignment_id
    WHERE e.id=? AND e.assigned_provider_id=? AND ((a.booking_agency_id=? AND a.is_active=1) OR (e.standing_assignment_id IS NULL AND EXISTS(SELECT 1 FROM office_location_agencies ola WHERE ola.office_location_id=e.office_location_id AND ola.agency_id=?))) AND e.start_at>UTC_TIMESTAMP() AND e.status<>'CANCELLED'`,[eventId,ids.providerId,ids.agencyId,ids.agencyId]);
  if(event&&!event.standing_assignment_id)throw fail('Use a recurring office reservation to publish availability from this update.');
  if(!event)throw fail('Choose one of your future office reservations in this agency.',403);
  if(inPerson&&Array.isArray(policy?.officeIds)&&!policy.officeIds.includes(Number(event.office_location_id)))throw fail('This office is not enabled in your public profile.',409);
  return publishOfficeAvailability({event,...ids,frequency,format:inPerson&&virtual?'BOTH':inPerson?'IN_PERSON':virtual?'VIRTUAL':'PRIVATE',availableForIntake:true,availableForSession:true,actorId:ids.providerId,replaceFormats:true});
}
export async function saveUpdateAvailabilitySettings(ids, input) {
  const {preferences} = await writableContext(ids);
  let choices;
  if(input.inPersonStatus!==undefined||input.virtualStatus!==undefined){
    if([input.inPersonStatus,input.virtualStatus].some(status=>!['accepting','waitlist','unavailable'].includes(status)))throw fail('Choose Open, Waitlist, or Closed for both appointment formats.');
    const intakeStatusByFormat={IN_PERSON:input.inPersonStatus,VIRTUAL:input.virtualStatus,SCHOOL:agencyIntakeStatus(preferences,'SCHOOL')};
    choices={intakeStatusByFormat,inPerson:input.inPersonStatus!=='unavailable'||preferences.inPerson===true,virtual:input.virtualStatus!=='unavailable'||preferences.virtual===true,acceptingNewClients:[input.inPersonStatus,input.virtualStatus].includes('accepting'),waitlistEnabled:Object.values(intakeStatusByFormat).includes('waitlist')};
  }else{
    for(const key of ['acceptingNewClients','inPerson','virtual'])if(typeof input[key]!=='boolean')throw fail('Choose your profile availability settings.');
    choices={acceptingNewClients:input.acceptingNewClients,inPerson:input.inPerson,virtual:input.virtual,intakeStatusByFormat:null};
  }
  const db=await pool.getConnection();
  try {await db.beginTransaction();
    await saveAgencyAvailability(db,{...ids,actor:{id:ids.providerId,role:'provider'},body:{...preferences,...choices,applyToAll:false}});
    await db.commit();return {ok:true};
  } catch(e){await db.rollback();throw e;}finally{db.release();}
}
