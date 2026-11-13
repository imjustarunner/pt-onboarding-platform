import { readProviderServices } from './providerServiceOfferings.service.js';
import pool from '../config/database.js';
import { authorizedAppointmentClient } from './guardianAppointments.service.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { sessionBookingProviders, requireClientSessionBooking } from './clientSessionBookingRollout.service.js';
import TenantService from '../models/TenantService.model.js';
import StaffServiceAssignment from '../models/StaffServiceAssignment.model.js';
import ProviderAvailability from './providerAvailability.service.js';
import { resolvePolicyForAppointmentContext } from './bookingCancellationPolicy.service.js';
import { resolveSelfPayQuote, getAgencySelfPayOnly } from './selfPayRates.service.js';
import { createAppointment, linkProviderScheduleEvent } from './appointment.service.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function context(input) {
  const client = await authorizedAppointmentClient(input.userId, input.clientId, input);
  const [[agency]] = await pool.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=?', [client.agency_id]);
  // Pilot the standard appointment flow in the isolated ITSCO workspace first.
  const learning = ['learning','tutoring'].includes(client.client_type) && (!client.service || client.service.service_kind === 'tutoring');
  if (!learning && (!isAuricwellQaAgency(agency) || !await getAgencySelfPayOnly(agency.id))) throw fail('Online session booking is not enabled for this workspace.', 409);
  const [assignments] = await pool.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    JOIN clients c ON c.id=? AND c.agency_id=ua.agency_id
    WHERE u.id=c.provider_id OR EXISTS (SELECT 1 FROM client_provider_assignments a
      WHERE a.client_id=c.id AND a.provider_user_id=u.id AND a.is_active=1)`, [agency.id, input.clientId]);
  const assigned = new Set(assignments.map(row => Number(row.id)));
  const providers = (await sessionBookingProviders(agency.id)).filter(provider => assigned.has(provider.id));
  return { client, agency, providers, learning };
}
export async function guardianBookingOptions(input) {
  const {agency,providers,learning}=await context(input);
  const services=(await TenantService.listForAgency(agency.id)).filter(s=>s.isActive&&s.isPubliclyBookable&&s.billingMethod==='self_pay'&&s.businessType===(learning?'tutoring':'mental_health')&&(!learning||String(s.serviceCode||'').toUpperCase()==='TUTORING'));
  const choices=[];
  for(const provider of providers) {
    if (learning) {
      const offered = await readProviderServices(provider.id, agency.id);
      if (!offered.careEligibility.canProvideCare || !offered.services.some(s=>s.serviceType==='tutoring'&&s.offered&&s.onlineScheduling)) continue;
      const [[profile]]=await pool.execute('SELECT payment_policy FROM provider_tutoring_profiles WHERE agency_id=? AND user_id=?',[agency.id,provider.id]);
      if (profile?.payment_policy !== 'POST_SESSION') continue;
    }
    try { if (!learning) await requireClientSessionBooking(agency.id,provider.id); } catch(error) { if(error.code==='CLIENT_SESSION_BOOKING_NOT_ENABLED') continue; throw error; }
    const assigned=await StaffServiceAssignment.listServiceIdsForUser(agency.id,provider.id);
    for(const service of services.filter(s=>assigned.includes(s.id))) {
      const resolved=await resolvePolicyForAppointmentContext({agencyId:agency.id,tenantServiceId:service.id,businessType:service.businessType,cancellationPolicyId:service.cancellationPolicyId});
      // Same no-policy behavior as cancellation evaluation: no invented fee.
      const policy=resolved.policy || (learning?{id:null,noticeHours:24,lateFeeCents:0,noShowFeeCents:0}:null);
      const formats=learning&&service.modality==='EITHER'?['TELEHEALTH','IN_PERSON']:[service.modality];
      for (const format of formats) {
      const modality=format==='IN_PERSON'?'IN_PERSON':'VIRTUAL';
      const quote=await resolveSelfPayQuote({agencyId:agency.id,providerId:provider.id,service,modality:modality==='VIRTUAL'?'TELEHEALTH':modality,learningFormat:learning?(modality==='VIRTUAL'?'virtual':'in-person'):undefined,durationMinutes:service.defaultDurationMinutes});
      if(!policy||quote?.amountCents==null)continue;
      choices.push({businessType:learning?'tutoring':'mental_health',providerId:provider.id,providerName:provider.name,serviceId:service.id,serviceName:service.name,
        durationMinutes:service.defaultDurationMinutes,modality:learning?format:service.modality,minNoticeHours:service.minNoticeHours??0,maxAdvanceDays:service.maxAdvanceDays??90,
        terms:{policyId:policy.id,noticeHours:policy.noticeHours,lateFeeCents:policy.lateFeeCents,noShowFeeCents:policy.noShowFeeCents,sessionFeeCents:quote.amountCents}});
      }
    }
  }
  return {choices,timeZone:'America/Denver',learning};
}
export async function guardianBookingSlots(input) {
  const options=await guardianBookingOptions(input);
  const choice=options.choices.find(c=>c.providerId===Number(input.providerId)&&c.serviceId===Number(input.tenantServiceId)&&(!input.modality||c.modality==='EITHER'||c.modality===input.modality||(c.modality==='TELEHEALTH'&&input.modality==='VIRTUAL')));
  if(!choice)throw fail('Choose an assigned provider and available service.',403);
  const date=new Date(`${input.weekStart}T12:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart||'')||!Number.isFinite(+date)||Math.abs(+date-Date.now())>100*86400000)throw fail('Choose a week within the booking window.');
  const client=await authorizedAppointmentClient(input.userId,input.clientId,input);
  const availability=await ProviderAvailability.computeWeekAvailability({agencyId:client.agency_id,providerId:choice.providerId,weekStartYmd:input.weekStart,slotMinutes:choice.durationMinutes,intakeOnly:false});
  const slots=[...(choice.modality!=='IN_PERSON'?availability.virtualSlots.map(s=>({...s,modality:'VIRTUAL'})):[]),
    ...(choice.modality!=='TELEHEALTH'?availability.inPersonSlots.map(s=>({...s,modality:'IN_PERSON'})):[])];
  const now=Date.now();
  return {choice,timeZone:availability.timeZone,slots:slots.filter(s=>+new Date(s.startAt)>now+choice.minNoticeHours*3600000&&+new Date(s.startAt)<now+choice.maxAdvanceDays*86400000)
    .map(s=>({startAt:s.startAt,endAt:s.endAt,modality:s.modality,buildingId:s.buildingId,roomId:s.roomId,location:s.buildingName||null}))};
}
async function bookGuardianSessionLocked(input) {
  const start=new Date(input.startAt);
  if(!Number.isFinite(+start))throw fail('Choose an available time.');
  const available=await guardianBookingSlots({...input,weekStart:start.toISOString().slice(0,10)});
  const slot=available.slots.find(s=>s.startAt===start.toISOString()&&s.endAt===input.endAt&&s.modality===input.modality
    &&Number(s.roomId||0)===Number(input.roomId||0));
  if(!slot)throw fail('That time is no longer available. Choose another opening.',409);
  const terms=available.choice.terms;
  if(input.confirmed!==true||Object.keys(terms).some(key=>input.acknowledgedTerms?.[key]!==terms[key]))throw fail('Review and acknowledge the current session price and attendance policy.',409);
  const client=await authorizedAppointmentClient(input.userId,input.clientId,input);
  const appointment=await createAppointment({agencyId:client.agency_id,tenantServiceId:available.choice.serviceId,providerUserId:available.choice.providerId,
    startAt:slot.startAt,endAt:slot.endAt,modality:slot.modality,officeLocationId:slot.buildingId,roomId:slot.roomId,timeZone:available.timeZone,
    source:'guardian_portal',title:available.choice.serviceName,createdByUserId:input.userId,
    notes:`Attendance policy acknowledged by account ${input.userId} at ${new Date().toISOString()}: ${JSON.stringify(terms)}`,
    participants:[{role:'client',clientId:Number(input.clientId),isBillingResponsible:true}]});
  try {
    const event=await ProviderScheduleEvent.create({agencyId:client.agency_id,providerId:available.choice.providerId,clientId:Number(input.clientId),
      kind:'PERSONAL_EVENT',title:available.choice.serviceName,isPrivate:false,allDay:false,eventTimezone:available.timeZone,
      startAt:slot.startAt.slice(0,19).replace('T',' '),endAt:slot.endAt.slice(0,19).replace('T',' '),createdByUserId:input.userId});
    await linkProviderScheduleEvent(appointment.id,event.id);
  } catch(error) {
    throw Object.assign(fail(`Appointment #${appointment.id} was saved but its calendar link needs support. Do not book it again.`,409),{appointmentId:appointment.id});
  }
  return {appointmentId:appointment.id,startAt:slot.startAt,endAt:slot.endAt,timeZone:available.timeZone};
}

export async function bookGuardianSession(input) {
  if(!Number.isSafeInteger(Number(input.providerId))||Number(input.providerId)<1)throw fail('Choose an assigned tutor or provider.');
  const connection=await pool.getConnection(),key=`guardian-session:${Number(input.providerId)}`;let locked=false;
  try {
    const [[lock]]=await connection.execute('SELECT GET_LOCK(?,10) AS acquired',[key]);
    if(Number(lock?.acquired)!==1)throw fail('Another booking is being processed. Refresh your appointments before retrying.',409);
    locked=true;return await bookGuardianSessionLocked(input);
  } finally {if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[key]);connection.release();}
}
