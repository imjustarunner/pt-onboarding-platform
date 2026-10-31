import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import TenantService from '../models/TenantService.model.js';
import StaffServiceAssignment from '../models/StaffServiceAssignment.model.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import { clientSessionBookingAccess } from './clientSessionBookingRollout.service.js';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const providerRoles = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'];
const addonCodes = new Set(['90785','90833','90836','90838','90840','99051']);
const fail = (status, message) => Object.assign(new Error(message), { status });

export function schoolWeeklyStart({ weekday, startMode, startDate, today }) {
  if (!days.includes(weekday)) throw fail(400, 'Choose a school weekday.');
  if (!['this_week', 'next_week', 'date'].includes(startMode)) throw fail(400, 'Choose when weekly sessions should start.');
  const parseDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw fail(400, 'Choose a valid start date.');
    const date = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw fail(400, 'Choose a valid start date.');
    return date;
  };
  const day = parseDate(startMode === 'date' ? startDate : today);
  const target = days.indexOf(weekday) + 1;
  const current = day.getUTCDay() || 7;
  const offset = startMode === 'date' ? (target - current + 7) % 7 : target - current + (startMode === 'next_week' ? 7 : 0);
  day.setUTCDate(day.getUTCDate() + offset);
  const first = day.toISOString().slice(0, 10);
  if (first < today) throw fail(400, 'That school day has passed this week. Choose next week or a future start date.');
  return first;
}

export function schoolWeeklyPayload({ context, input, today }) {
  const slot = context.slots.find(row => Number(row.id) === Number(input.slotId));
  if (!slot) throw fail(409, 'Save this client and its time in the school schedule before booking.');
  const clock = value => /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(value || '')) ? `${String(value).slice(0, 5)}:00` : null;
  const start = clock(slot.start_time), end = clock(slot.end_time);
  if (!slot.client_id || !start || !end || end <= start) throw fail(400, 'The saved slot needs a client and valid start and end times.');
  const count = Number(input.occurrenceCount);
  if (!Number.isInteger(count) || count < 1 || count > 52) throw fail(400, 'Choose between 1 and 52 weekly sessions.');
  const service = context.services.find(row => Number(row.id) === Number(input.tenantServiceId));
  if (!service) throw fail(400, 'Choose an assigned in-person service.');
  const first = schoolWeeklyStart({ weekday: context.weekday, startMode: input.startMode, startDate: input.startDate, today });
  return {
    agencyId: context.agencyId, providerUserId: context.providerUserId,
    tenantServiceId: service.id, serviceCode: service.serviceCode,
    startAt: `${first} ${start}`, endAt: `${first} ${end}`,
    timeZone: context.timeZone, recurrence: 'WEEKLY', occurrenceCount: count,
    modality: 'IN_PERSON', serviceLocationId: context.serviceLocationId,
    participants: [{ clientId: Number(slot.client_id), role: 'client' }],
    source: 'school_weekly', title: 'School session', createProviderScheduleEvent: true,
    // Reuse the normal booking warning review; never silently bypass conflicts.
    acknowledgeSameDayServices: input.acknowledgeSameDayServices === true
  };
}

export async function schoolWeeklyContext({ actor, schoolId, providerUserId, weekday }) {
  const sid = Number(schoolId), pid = Number(providerUserId);
  if (!Number.isSafeInteger(sid) || sid < 1 || !Number.isSafeInteger(pid) || pid < 1 || !days.includes(weekday)) throw fail(400, 'Invalid school, provider, or weekday.');
  const role = String(actor?.role || '').toLowerCase();
  const self = providerRoles.includes(role) && Number(actor.id) === pid;
  if (!self && !['admin', 'support', 'super_admin'].includes(role)) throw fail(403, 'Only the provider or agency scheduling staff can book school sessions.');
  const school = await Agency.findById(sid);
  if (!school || school.organization_type !== 'school') throw fail(404, 'School not found.');
  const agencyId = Number(await OrganizationAffiliation.getActiveAgencyIdForOrganization(sid) || await AgencySchool.getActiveAgencyIdForSchool(sid));
  if (!agencyId) throw fail(409, 'This school needs an active agency affiliation before sessions can be booked.');
  if (role !== 'super_admin') {
    const memberships = await User.getAgencies(actor.id);
    if (!memberships.some(row => Number(row.id) === agencyId)) throw fail(403, 'You do not have scheduling access to this school’s agency.');
  }
  const [assigned] = await pool.execute(`SELECT id FROM provider_school_assignments
    WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ? AND is_active = TRUE LIMIT 1`, [sid, pid, weekday]);
  if (!assigned.length) throw fail(403, 'This provider is not assigned to the selected school day.');
  const rollout = await clientSessionBookingAccess(agencyId, pid);
  if (!rollout.enabled) return { enabled: false, reason: rollout.reason, slots: [], services: [] };
  const location = await AgencyServiceLocation.findByAgencyAndSchool(agencyId, sid);
  if (!location) return { enabled: false, reason: 'An administrator must connect this school to an active service location before booking.', slots: [], services: [] };
  const services = await TenantService.listForAgency(agencyId);
  const allowedIds = await StaffServiceAssignment.listServiceIdsForUser(agencyId, pid);
  const medicalCodes = new Map((await AgencyMedicalServiceCode.listByAgency(agencyId,{includeInactive:true})).map(code=>[code.serviceCode,code]));
  const eligible = services.filter(service => {
    const code = String(service.serviceCode || '').toUpperCase();
    const policy = medicalCodes.get(code);
    return service.isActive && service.isStaffBookable && service.allowsIndividual && service.modality !== 'TELEHEALTH'
      && !addonCodes.has(code) && (!policy || (policy.isActive && !policy.isAddon && policy.sessionMode !== 'group'))
      && (!allowedIds.length || allowedIds.includes(service.id));
  });
  const [slots] = await pool.execute(`SELECT s.id,s.client_id,s.start_time,s.end_time,c.initials
    FROM soft_schedule_slots s JOIN clients c ON c.id=s.client_id
    WHERE s.school_organization_id=? AND s.provider_user_id=? AND s.weekday=?
      AND s.start_time IS NOT NULL AND s.end_time IS NOT NULL
      AND (EXISTS (SELECT 1 FROM client_provider_assignments cpa JOIN client_organization_assignments coa
        ON coa.client_id=cpa.client_id AND coa.organization_id=cpa.organization_id AND coa.is_active=TRUE
        WHERE cpa.client_id=s.client_id AND cpa.organization_id=s.school_organization_id
          AND cpa.provider_user_id=s.provider_user_id AND cpa.service_day=s.weekday AND cpa.is_active=TRUE)
        OR (c.organization_id=s.school_organization_id AND c.provider_id=s.provider_user_id AND c.service_day=s.weekday))
    ORDER BY s.slot_index`, [sid, pid, weekday]);
  const agency = await Agency.findById(agencyId);
  const timeZone = String(agency?.timezone || school.timezone || 'America/Denver');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
  return { enabled: true, agencyId, schoolId:sid, providerUserId:pid, weekday, serviceLocationId:Number(location.id),
    schoolName:school.name, timeZone, today, slots, services:eligible.map(({id,name,serviceCode}) => ({id,name,serviceCode})) };
}
