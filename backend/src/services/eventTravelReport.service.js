import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { loadEmployeeEvent, employeeAssignedToEvent, isEmployeeEventDay, eventTravelInterval } from './companyEventParticipation.service.js';
import { getDrivingDistanceMeters, metersToMiles } from './googleDistance.service.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { computeSubmissionWindow } from '../utils/payrollSubmissionWindow.js';
import { eventTravelJourneys, locationKinds, recommendEventTravelLeg } from '../../../frontend/src/navigation/eventTravel.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const parse = raw => typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
const text = (value, max = 1000) => String(value || '').trim().slice(0, max);
const dateOnly = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const address = r => [r.street_address, r.city, r.state, r.postal_code].filter(Boolean).join(', ');
const round = value => Math.round(value * 100) / 100;

async function validateExistingMileage({ claimId, agencyId, userId, eventDate, db, forUpdate = false }) {
  if (!claimId) return null;
  const [rows] = await db.execute(`SELECT id, drive_date, applied_amount FROM payroll_mileage_claims
    WHERE id = ? AND agency_id = ? AND user_id = ? AND drive_date = ?
      AND claim_type = 'standard' AND status IN ('approved', 'paid') AND event_travel_report_id IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
  [claimId, agencyId, userId, eventDate]);
  if (!rows[0]) fail(409, 'Choose your approved event mileage claim for this date, or submit time and mileage together.');
  return rows[0];
}

export async function listMyEventTravelOptions({ userId, agencyId, eventId = null, db = pool }) {
  const [rows] = await db.execute(`SELECT DISTINCT e.id, e.title, e.starts_at, e.ends_at, e.timezone,
      COALESCE(NULLIF(TRIM(e.event_location_address), ''), NULLIF(TRIM(e.public_location_address), ''),
        CASE WHEN NULLIF(TRIM(s.street_address), '') IS NOT NULL THEN
          CONCAT_WS(', ', NULLIF(TRIM(s.street_address), ''), NULLIF(TRIM(s.city), ''), NULLIF(TRIM(s.state), ''), NULLIF(TRIM(s.postal_code), '')) END) AS address
    FROM company_events e
    JOIN user_agencies ua ON ua.agency_id = e.agency_id AND ua.user_id = ? AND COALESCE(ua.is_active, 1) = 1
    JOIN users u ON u.id = ua.user_id AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
    LEFT JOIN agencies s ON s.id = e.organization_id AND s.organization_type = 'school'
    WHERE e.agency_id = ? ${eventId ? 'AND e.id = ?' : ''} AND (
      EXISTS (SELECT 1 FROM company_event_provider_assignments a WHERE a.company_event_id = e.id AND a.provider_user_id = ?)
      OR EXISTS (SELECT 1 FROM company_event_session_providers p WHERE p.company_event_id = e.id AND p.provider_user_id = ? AND p.assignment_status = 'finalized')
      OR EXISTS (SELECT 1 FROM skills_groups g JOIN skills_group_providers p ON p.skills_group_id = g.id WHERE g.company_event_id = e.id AND g.agency_id = e.agency_id AND p.provider_user_id = ?))
    ORDER BY e.starts_at DESC LIMIT 250`, [userId, agencyId, ...(eventId ? [eventId] : []), userId, userId, userId]);
  const events = [];
  for (const row of rows) {
    const event = await loadEmployeeEvent({ eventId: row.id, userId, db });
    const [sessions] = await db.execute('SELECT session_date FROM company_event_session_dates WHERE company_event_id = ? ORDER BY session_date', [row.id]);
    let dates = [...new Set(sessions.map(s => dateOnly(s.session_date)))];
    if (!dates.length) {
      const start = utcDateToZonedYmd(row.starts_at, row.timezone), end = utcDateToZonedYmd(row.ends_at, row.timezone);
      for (let day = start, count = 0; day && day <= end && count < 366; count++) {
        dates.push(day); day = new Date(new Date(`${day}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
      }
    }
    const assignedDates = [];
    for (const day of dates) if (await employeeAssignedToEvent({ event, userId, date: day, db })) assignedDates.push(day);
    events.push({ id: Number(row.id), title: row.title, address: row.address || '', dates: assignedDates, timezone: row.timezone || 'America/Denver' });
  }
  const [officeRows] = await db.execute(`SELECT ol.id, ol.name, ol.street_address, ol.city, ol.state, ol.postal_code
    FROM user_office_locations uol JOIN office_locations ol ON ol.id = uol.office_location_id
    JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id = ?
    WHERE uol.user_id = ? AND COALESCE(uol.is_active, 1) = 1 AND COALESCE(ol.is_active, 1) = 1
    ORDER BY COALESCE(uol.is_primary, 0) DESC, ol.name`, [agencyId, userId]);
  const [schools] = await db.execute(`SELECT DISTINCT s.id, s.name, s.street_address, s.city, s.state, s.postal_code
    FROM agencies s JOIN organization_affiliations oa ON oa.organization_id = s.id AND oa.agency_id = ? AND oa.is_active = 1
    WHERE s.organization_type = 'school' AND (
      EXISTS (SELECT 1 FROM provider_school_assignments p WHERE p.school_organization_id = s.id AND p.provider_user_id = ? AND p.is_active = 1)
      OR EXISTS (SELECT 1 FROM client_provider_assignments c WHERE c.organization_id = s.id AND c.provider_user_id = ? AND c.is_active = 1)
      OR EXISTS (SELECT 1 FROM user_agencies u WHERE u.agency_id = s.id AND u.user_id = ? AND COALESCE(u.is_active, 1) = 1))
    ORDER BY s.name`, [agencyId, userId, userId, userId]);
  const [reports] = await db.execute(`SELECT r.*,
      EXISTS (SELECT 1 FROM payroll_time_claims t WHERE t.event_travel_report_id = r.id AND t.status IN ('approved','paid'))
      OR EXISTS (SELECT 1 FROM payroll_mileage_claims m WHERE m.event_travel_report_id = r.id AND m.status IN ('approved','paid')) AS locked
    FROM company_event_travel_reports r WHERE r.user_id = ? AND r.agency_id = ? ORDER BY r.event_date DESC LIMIT 250`, [userId, agencyId]);
  const [reviewNotes] = reports.length ? await db.execute(`SELECT event_travel_report_id, rejection_reason FROM payroll_time_claims
      WHERE user_id = ? AND agency_id = ? AND event_travel_report_id IS NOT NULL AND status IN ('deferred', 'rejected')
      UNION ALL SELECT event_travel_report_id, rejection_reason FROM payroll_mileage_claims
      WHERE user_id = ? AND agency_id = ? AND event_travel_report_id IS NOT NULL AND status IN ('deferred', 'rejected')`, [userId, agencyId, userId, agencyId]) : [[]];
  const [users] = await db.execute('SELECT home_street_address, home_address_line2, home_city, home_state, home_postal_code FROM users WHERE id = ?', [userId]);
  const u = users[0] || {};
  const homeAddress = [u.home_street_address, u.home_address_line2, u.home_city, u.home_state, u.home_postal_code].filter(Boolean).join(', ');
  const [approvedMileageClaims] = await db.execute(`SELECT id, drive_date, trip_purpose, end_location, applied_amount
    FROM payroll_mileage_claims WHERE agency_id = ? AND user_id = ? AND claim_type = 'standard'
      AND status IN ('approved', 'paid') AND event_travel_report_id IS NULL ORDER BY drive_date DESC LIMIT 250`, [agencyId, userId]);
  return { events, homeAddress, approvedMileageClaims: approvedMileageClaims.map(r => ({ ...r, drive_date: dateOnly(r.drive_date) })), offices: officeRows.map(r => ({ id: Number(r.id), name: r.name, address: address(r) })),
    schools: schools.map(r => ({ id: Number(r.id), name: r.name, address: address(r) })),
    reports: reports.map(r => ({ id: r.id, eventId: r.company_event_id, eventDate: dateOnly(r.event_date), revision: r.revision,
      locked: !!Number(r.locked), reviewed: !!r.reviewed_at, notes: [...new Set(reviewNotes.filter(n => n.event_travel_report_id === r.id).map(n => n.rejection_reason).filter(Boolean))], report: parse(r.report_json) })) };
}

function cleanForm(input) {
  const form = {};
  const choices = { materialsPickup: ['already_had', 'before_event', 'none'], pickupTiming: ['on_way', 'separate'],
    pickupRequirement: ['convenient', 'required'], materialsReturn: ['kept', 'after_event', 'separate', 'none'],
    returnRequirement: ['convenient', 'required'], vehicle: ['personal', 'company', 'passenger', 'other'] };
  for (const [key, allowed] of Object.entries(choices)) {
    if (!allowed.includes(input?.[key])) fail(400, `Choose ${key.replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`)}`);
    form[key] = input[key];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate || '')) fail(400, 'Choose an assigned event date');
  form.eventDate = input.eventDate;
  form.existingMileageClaimId = Number(input.existingMileageClaimId) || null;
  if (form.existingMileageClaimId && (!Number.isSafeInteger(form.existingMileageClaimId) || form.existingMileageClaimId <= 0)) fail(400, 'Choose a valid approved mileage claim');
  form.officeLocationId = Number(input.officeLocationId) || null;
  for (const key of ['departure', 'returnTo', 'pickupFrom', 'pickupTo', 'dropoffFrom', 'dropoffTo']) {
    const p = input[key] || { kind: 'home' };
    if (!locationKinds.includes(p.kind)) fail(400, 'Choose home, assigned office, school, or another location');
    form[key] = { kind: p.kind, ...(p.kind === 'school' ? { id: Number(p.id) } : {}), ...(p.kind === 'other' ? { address: text(p.address, 500) } : {}) };
  }
  for (const key of ['transportDuties', 'specialTrip']) form[key] = input[key] === true;
  // Keep earlier report details readable; new reports collect any extra context in notes.
  for (const key of ['notes', 'exceptionNote']) form[key] = text(input[key], 2000);
  form.intervals = {}; form.handling = {};
  return form;
}

export async function buildEventTravelReport({ eventId, userId, input, db = pool, now = new Date(), distance = getDrivingDistanceMeters }) {
  const form = cleanForm(input), event = await loadEmployeeEvent({ eventId, userId, db });
  const existingMileage = await validateExistingMileage({ claimId: form.existingMileageClaimId, agencyId: event.agency_id, userId, eventDate: form.eventDate, db });
  if (!await employeeAssignedToEvent({ event, userId, date: form.eventDate, db }) || !await isEmployeeEventDay({ event, date: form.eventDate, db })) fail(403, 'Choose an event date you are assigned to work');
  const options = await listMyEventTravelOptions({ userId, agencyId: event.agency_id, eventId: event.id, db });
  const chosen = options.events.find(e => e.id === Number(event.id));
  const office = options.offices.find(o => o.id === form.officeLocationId);
  const homeAddress = options.homeAddress;
  const eventAddress = chosen?.address;
  if (!eventAddress) fail(409, 'Your coordinator needs to save the venue address on this event before you can submit travel.');
  const resolve = p => {
    if (p.kind === 'event') return { kind: 'event', label: event.title, address: eventAddress };
    if (p.kind === 'home') {
      if (!homeAddress) fail(409, 'Add your home address in your payroll profile before submitting this trip.');
      return { kind: 'home', label: 'Home', address: homeAddress };
    }
    if (p.kind === 'office') {
      if (!office) fail(409, 'An assigned office is required for this route. Ask your coordinator to update your office assignment.');
      return { kind: 'office', id: office.id, label: office.name, address: office.address };
    }
    if (p.kind === 'school') {
      const school = options.schools.find(s => s.id === p.id);
      if (!school) fail(403, 'Choose one of your assigned schools, or use another location');
      return { kind: 'school', id: school.id, label: school.name, address: school.address };
    }
    if (!p.address) fail(400, 'Enter the address of the other location');
    return { kind: 'other', label: 'Other location', address: p.address };
  };
  const [policy] = await db.execute('SELECT effective_at FROM company_event_travel_policy WHERE id = 1');
  const policyDate = utcDateToZonedYmd(policy[0]?.effective_at, event.timezone);
  const legacyTravelPolicy = !policyDate || form.eventDate <= policyDate;
  const segments = [], flags = [];
  if (existingMileage) flags.push(`Travel time only: mileage for this event is already covered by approved claim #${existingMileage.id}. No additional mileage reimbursement is requested.`);
  if (legacyTravelPolicy) flags.push('Earlier event: preserve the travel-time policy/agreement in effect on the trip date.');
  if (form.transportDuties || form.specialTrip) flags.push(form.exceptionNote);
  if (form.notes) flags.push(`Employee notes: ${form.notes}`);
  for (const journey of eventTravelJourneys(form)) {
    for (const leg of journey.legs) {
      const entered = input.intervals?.[leg.key];
      const { start, end, minutes } = eventTravelInterval({ travelStartedAt: entered?.startedAt, travelEndedAt: entered?.endedAt }, now);
      const tripDate = utcDateToZonedYmd(end, event.timezone);
      const deltaDays = (Date.parse(`${tripDate}T12:00:00Z`) - Date.parse(`${form.eventDate}T12:00:00Z`)) / 86400000;
      if ((journey.key === 'outbound' || journey.key === 'pickup') && deltaDays > 0) fail(400, 'Travel to the event and materials pickup must be on or before the event date');
      if ((journey.key === 'inbound' || journey.key === 'return') && deltaDays < 0) fail(400, 'Return travel must be on or after the event date');
      if (Math.abs(deltaDays) > 30) flags.push(`Confirm that the materials trip on ${tripDate} relates to this event.`);
      if (['outbound', 'inbound'].includes(journey.key) && Math.abs(deltaDays) > 1) {
        if (!form.notes && !form.exceptionNote) fail(400, 'Add a note explaining why this trip was more than a day before or after the event.');
        flags.push(`Review event travel on ${tripDate}: outside the event date or adjoining overnight date.`);
      }
      const from = resolve(leg.from), to = resolve(leg.to);
      const recommendation = recommendEventTravelLeg({ from, to, journey: journey.key, form, legacyTravelPolicy });
      if (existingMileage) recommendation.mileageEligible = false;
      let miles = null, distanceSource = 'not_needed', distanceNote = '';
      if (form.vehicle === 'personal' && !existingMileage) {
        try { miles = from.address && from.address === to.address ? 0 : round(metersToMiles(await distance(from.address, to.address))); distanceSource = 'route'; }
        catch { distanceSource = 'unavailable'; flags.push(`Mileage needs verification: ${from.label} → ${to.label}.`); }
        if (entered?.reportedMiles !== '' && entered?.reportedMiles != null) {
          const actual = Number(entered.reportedMiles);
          if (!Number.isFinite(actual) || actual < 0 || actual > 2000 || !text(entered.mileageNote)) fail(400, 'Actual mileage requires a valid distance and an explanation');
          miles = round(actual); distanceSource = 'employee'; distanceNote = text(entered.mileageNote);
          flags.push(`Employee-reported mileage: ${from.label} → ${to.label}.`);
        }
      }
      form.intervals[leg.key] = { startedAt: start.toISOString(), endedAt: end.toISOString(),
        ...(distanceSource === 'employee' ? { reportedMiles: miles, mileageNote: distanceNote } : {}) };
      segments.push({ key: leg.key, journey: journey.key, label: journey.label, kind: 'travel', from, to, date: tripDate,
        startedAt: start.toISOString(), endedAt: end.toISOString(), minutes, miles, distanceSource, distanceNote, ...recommendation });
    }
  }
  // Loading/unloading is recorded separately from driving and from event attendance.
  for (const key of ['pickup', 'return']) {
    const atHome = key === 'pickup' ? form.materialsPickup === 'already_had' : form.materialsReturn === 'kept';
    const enabled = key === 'pickup' ? form.materialsPickup === 'before_event' || atHome : ['after_event', 'separate'].includes(form.materialsReturn) || atHome;
    const value = input.handling?.[key];
    if (!enabled || !value?.startedAt && !value?.endedAt) continue;
    const { start, end, minutes } = eventTravelInterval({ travelStartedAt: value.startedAt, travelEndedAt: value.endedAt }, now);
    const day = utcDateToZonedYmd(end, event.timezone);
    if (Math.abs(Date.parse(day) - Date.parse(form.eventDate)) > 30 * 86400000) flags.push(`Confirm that materials handling on ${day} relates to this event.`);
    if (key === 'pickup' && day > form.eventDate || key === 'return' && day < form.eventDate) fail(400, 'Materials pickup must precede the event and materials return must follow it');
    const journey = key === 'pickup' ? (form.pickupTiming === 'on_way' ? 'outbound' : 'pickup') : (form.materialsReturn === 'after_event' ? 'inbound' : 'return');
    const arrive = atHome ? (key === 'return' ? segments.filter(s => s.journey === 'inbound').at(-1) : null) : segments.find(s => s.journey === journey && s.to?.kind === 'office');
    const leave = atHome ? (key === 'pickup' ? segments.find(s => s.journey === 'outbound') : null) : segments.find(s => s.journey === journey && s.from?.kind === 'office');
    if (arrive && start < new Date(arrive.endedAt) || leave && end > new Date(leave.startedAt)) fail(400, 'Materials handling must fit between the reported arrival and departure times');
    form.handling[key] = { startedAt: start.toISOString(), endedAt: end.toISOString() };
    segments.push({ key: `handling-${key}`, journey: key, kind: 'handling', label: key === 'pickup' ? 'Materials pickup / loading' : 'Materials return / unloading',
      date: day, startedAt: start.toISOString(), endedAt: end.toISOString(), minutes, miles: 0, timeEligible: true, mileageEligible: false,
      reason: 'Actual materials handling time, excluding time already recorded at the event.', needsReview: atHome });
  }
  const ordered = [...segments].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (let i = 1; i < ordered.length; i++) if (ordered[i].startedAt < ordered[i - 1].endedAt) fail(400, 'Trip and materials-handling times cannot overlap');
  const outbound = segments.filter(s => s.journey === 'outbound' && s.kind === 'travel');
  const inbound = segments.filter(s => s.journey === 'inbound' && s.kind === 'travel');
  if (outbound.at(-1)?.endedAt > inbound[0]?.startedAt) fail(400, 'Travel home must start after arrival at the event');
  for (const journey of eventTravelJourneys(form)) {
    const route = journey.legs.map(l => segments.find(s => s.key === l.key));
    for (let i = 1; i < route.length; i++) if (route[i].startedAt < route[i - 1].endedAt) fail(400, 'Enter each part of the trip in order');
  }
  const windows = {};
  for (const day of new Set(segments.map(s => s.date))) {
    const win = await computeSubmissionWindow({ agencyId: event.agency_id, effectiveDateYmd: day, submittedAt: now, timeZone: event.timezone || 'America/Denver', hardStopPolicy: '60_days' });
    if (!win.ok) fail(win.status || 409, win.errorMessage);
    windows[day] = win.suggestedPayrollPeriodId || null;
    const [existingMileage] = await db.execute(`SELECT id FROM payroll_mileage_claims WHERE agency_id = ? AND user_id = ? AND drive_date = ?
      AND event_travel_report_id IS NULL AND status IN ('submitted', 'approved', 'paid', 'deferred')`, [event.agency_id, userId, day]);
    if (existingMileage.length) flags.push(`Other mileage claims already exist on ${day} (#${existingMileage.map(r => r.id).join(', #')}). Verify these trips are not duplicated.`);
  }
  return { version: 1, eventId: Number(event.id), agencyId: Number(event.agency_id), userId: Number(userId), eventTitle: event.title,
    eventDate: form.eventDate, eventAddress, timezone: event.timezone || 'America/Denver', office: office || null, form, segments,
    flags: [...new Set(flags)], legacyTravelPolicy, windows, reviewed: false,
    totalMinutes: segments.reduce((n, s) => n + (s.timeEligible ? s.minutes : 0), 0),
    totalMiles: round(segments.reduce((n, s) => n + (s.mileageEligible ? Number(s.miles || 0) : 0), 0)) };
}

export async function assertEventTravelNoOverlap({ report, reportId = 0, db, now = new Date() }) {
  const [claims] = await db.execute(`SELECT id, payload_json FROM payroll_time_claims
    WHERE agency_id = ? AND user_id = ? AND status IN ('submitted','approved','paid','deferred')
      AND (? = 0 OR COALESCE(event_travel_report_id, 0) <> ?)`, [report.agencyId, report.userId, reportId, reportId]);
  const recorded = claims.flatMap(c => {
    const p = parse(c.payload_json);
    return p.eventTravelReport?.segments || [{ startedAt: p.travelStartedAt || p.clockInAt || p.startedAt, endedAt: p.travelEndedAt || p.clockOutAt || p.endedAt }];
  });
  for (const segment of report.segments) {
    if (recorded.some(o => new Date(o.startedAt) < new Date(segment.endedAt) && new Date(o.endedAt) > new Date(segment.startedAt))) fail(409, 'This trip overlaps another submitted or paid time claim. Correct the existing claim first.');
    const [punches] = await db.execute(`SELECT p.id FROM skill_builders_event_kiosk_punches p JOIN company_events e ON e.id = p.company_event_id
      WHERE p.user_id = ? AND e.agency_id = ? AND p.punch_type = 'clock_in' AND p.punched_at < ?
      AND COALESCE((SELECT MIN(o.punched_at) FROM skill_builders_event_kiosk_punches o WHERE o.company_event_id = p.company_event_id
        AND o.user_id = p.user_id AND o.punch_type = 'clock_out' AND o.punched_at >= p.punched_at), ?) > ? LIMIT 1`,
    [report.userId, report.agencyId, new Date(segment.endedAt), now, new Date(segment.startedAt)]);
    if (punches.length) fail(409, 'This trip overlaps event attendance. Correct your event checkout before submitting travel.');
  }
}

async function syncClaims({ report, reportId, db }) {
  const { history: _history, ...reportSnapshot } = report;
  const [types] = await db.execute(`SELECT id, label FROM payroll_indirect_service_types WHERE agency_id = ? AND type_key = 'approved_travel' AND pay_bucket = 'support' AND is_active = 1 LIMIT 1`, [report.agencyId]);
  if (!types[0]) fail(409, 'Approved Travel must be configured for payroll before submitting this report');
  const [timeRows] = await db.execute('SELECT id, claim_date FROM payroll_time_claims WHERE event_travel_report_id = ?', [reportId]);
  const [mileRows] = await db.execute('SELECT id, drive_date FROM payroll_mileage_claims WHERE event_travel_report_id = ?', [reportId]);
  const dates = [...new Set(report.segments.map(s => s.date))];
  for (const day of dates) {
    const segments = report.segments.filter(s => s.date === day), minutes = segments.reduce((n, s) => n + (s.timeEligible ? s.minutes : 0), 0);
    const miles = round(segments.reduce((n, s) => n + (s.mileageEligible ? Number(s.miles || 0) : 0), 0));
    const payload = { source: 'event_travel_report', eventTravelReportId: reportId, eventTravelReport: { ...reportSnapshot, id: reportId },
      companyEventId: report.eventId, eventTitle: report.eventTitle, categoryGroup: 'support_activity', categoryLabel: 'Event travel reimbursement',
      serviceCode: 'MEETING', bucket: 'indirect', entryMethod: 'manual', allocationMode: 'duration', totalMinutes: minutes,
      creditsHours: minutes / 60, attestation: true,
      allocations: minutes ? [{ serviceTypeId: types[0].id, serviceTypeKey: 'approved_travel', serviceTypeLabel: 'Event travel and materials', minutes, payBucket: 'support' }] : [],
      ...(minutes === 0 ? { amount: 0 } : {}) };
    let timeId = timeRows.find(r => dateOnly(r.claim_date) === day)?.id;
    if (timeId) await PayrollTimeClaim.resubmit({ id: timeId, claimDate: day, payload, db });
    else timeId = (await PayrollTimeClaim.create({ agencyId: report.agencyId, userId: report.userId, submittedByUserId: report.submittedByUserId || report.userId, claimType: 'indirect_time', claimDate: day, payload, suggestedPayrollPeriodId: report.windows[day], db })).id;
    await db.execute("UPDATE payroll_time_claims SET event_travel_report_id = ?, bucket = 'indirect', credits_hours = ?, suggested_payroll_period_id = ? WHERE id = ?", [reportId, minutes / 60, report.windows[day], timeId]);
    const previous = mileRows.find(r => dateOnly(r.drive_date) === day);
    if (report.form.vehicle === 'personal' && !report.form.existingMileageClaimId) {
      const notes = `Event travel report #${reportId}: ${report.eventTitle}. ${segments.map(s => `${s.label}: ${s.from?.label || ''} → ${s.to?.label || ''}; ${s.minutes} minutes; ${s.miles ?? 'unverified'} miles. ${s.reason}`).join('\n')}`;
      if (previous) await db.execute(`UPDATE payroll_mileage_claims SET status = 'submitted', miles = ?, eligible_miles = ?, round_trip = 0, notes = ?,
        target_payroll_period_id = NULL, applied_amount = NULL, tier_level = NULL, rate_per_mile = NULL, approved_by_user_id = NULL, approved_at = NULL,
        rejected_by_user_id = NULL, rejected_at = NULL, rejection_reason = NULL, suggested_payroll_period_id = ? WHERE id = ?`, [miles, miles, notes, report.windows[day], previous.id]);
      else await db.execute(`INSERT INTO payroll_mileage_claims
        (agency_id, user_id, submitted_by_user_id, status, claim_type, drive_date, office_location_id, miles, eligible_miles, round_trip, trip_purpose, notes, attestation, suggested_payroll_period_id, event_travel_report_id)
        VALUES (?, ?, ?, 'submitted', 'standard', ?, ?, ?, ?, 0, ?, ?, 1, ?, ?)`,
      [report.agencyId, report.userId, report.submittedByUserId || report.userId, day, report.office?.id || null, miles, miles, `Event: ${report.eventTitle}`.slice(0, 255), notes, report.windows[day], reportId]);
    } else if (previous) await db.execute("UPDATE payroll_mileage_claims SET status = 'rejected', rejection_reason = ?, miles = 0, eligible_miles = 0 WHERE id = ?", [report.form.existingMileageClaimId ? 'Mileage already covered by the separate approved claim' : 'Updated report: no personal vehicle expense', previous.id]);
  }
  for (const row of timeRows.filter(r => !dates.includes(dateOnly(r.claim_date)))) await db.execute("UPDATE payroll_time_claims SET status = 'withdrawn' WHERE id = ?", [row.id]);
  for (const row of mileRows.filter(r => !dates.includes(dateOnly(r.drive_date)))) await db.execute("UPDATE payroll_mileage_claims SET status = 'rejected', rejection_reason = 'Trip removed in updated report' WHERE id = ?", [row.id]);
}

async function assertEditable(reportId, db) {
  const [rows] = await db.execute(`SELECT status FROM payroll_time_claims WHERE event_travel_report_id = ? FOR UPDATE`, [reportId]);
  const [miles] = await db.execute(`SELECT status FROM payroll_mileage_claims WHERE event_travel_report_id = ? FOR UPDATE`, [reportId]);
  if ([...rows, ...miles].some(r => ['approved', 'paid'].includes(r.status))) fail(409, 'Payroll has approved part of this report. Ask payroll to unapprove it before making corrections.');
}

export async function submitEventTravelReport({ eventId, userId, submittedByUserId = userId, input, dbPool = pool, build = buildEventTravelReport }) {
  if (input.attestation !== true) fail(400, 'Confirm that this report is accurate and has not been submitted elsewhere');
  const report = await build({ eventId, userId, input });
  report.submittedByUserId = submittedByUserId;
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    await validateExistingMileage({ claimId: report.form.existingMileageClaimId, agencyId: report.agencyId, userId, eventDate: report.eventDate, db, forUpdate: true });
    // Recheck assignment within the write transaction; an interested employee cannot self-assign.
    const event = await loadEmployeeEvent({ eventId, userId, db });
    if (!await employeeAssignedToEvent({ event, userId, date: report.eventDate, db })) fail(403, 'You are no longer assigned to this event date');
    const [existing] = await db.execute('SELECT * FROM company_event_travel_reports WHERE agency_id = ? AND user_id = ? AND company_event_id = ? AND event_date = ? FOR UPDATE', [report.agencyId, userId, eventId, report.eventDate]);
    const prior = existing[0];
    if (prior && JSON.stringify(parse(prior.report_json).form) === JSON.stringify(report.form)) { await db.commit(); return { id: prior.id, revision: prior.revision, report: parse(prior.report_json), alreadySubmitted: true }; }
    if (prior && Number(input.expectedRevision) !== Number(prior.revision)) fail(409, 'A report already exists for this event date. Open it from Event travel reimbursement to make corrections.');
    if (prior) await assertEditable(prior.id, db);
    await assertEventTravelNoOverlap({ report, reportId: prior?.id || 0, db });
    let id = prior?.id, revision = Number(prior?.revision || 0) + 1;
    if (prior) {
      const previous = parse(prior.report_json);
      report.history = [...(previous.history || []), { revision: prior.revision, form: previous.form, segments: previous.segments, revisedAt: new Date().toISOString() }];
      await db.execute('UPDATE company_event_travel_reports SET report_json = ?, revision = ?, reviewed_by_user_id = NULL, reviewed_at = NULL WHERE id = ?', [JSON.stringify(report), revision, id]);
    } else {
      const [created] = await db.execute('INSERT INTO company_event_travel_reports (agency_id, user_id, company_event_id, event_date, report_json) VALUES (?, ?, ?, ?, ?)', [report.agencyId, userId, eventId, report.eventDate, JSON.stringify(report)]);
      id = created.insertId;
    }
    await syncClaims({ report, reportId: id, db });
    await db.commit();
    return { id, revision, report };
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}

export async function getEventTravelReport(id, db = pool, { forUpdate = false } = {}) {
  const [rows] = await db.execute(`SELECT * FROM company_event_travel_reports WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) fail(404, 'Event travel report not found');
  return { ...rows[0], report: parse(rows[0].report_json) };
}

export async function reviewEventTravelReport({ id, reviewerId, input, dbPool = pool }) {
  if (!text(input.note)) fail(400, 'Add a short review note confirming the route and any exceptions');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const initial = await getEventTravelReport(id, db);
    await db.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [initial.user_id]);
    const row = await getEventTravelReport(id, db, { forUpdate: true }), report = row.report;
    if (Number(input.revision) !== Number(row.revision)) fail(409, 'This report changed. Reload it before reviewing.');
    await assertEditable(id, db);
    await validateExistingMileage({ claimId: report.form.existingMileageClaimId, agencyId: row.agency_id, userId: row.user_id, eventDate: report.eventDate, db, forUpdate: true });
    if (!Array.isArray(input.segments) || input.segments.length !== report.segments.length) fail(400, 'Review each trip segment');
    const segments = report.segments.map(segment => {
      const decision = input.segments.find(s => s.key === segment.key);
      if (!decision || typeof decision.timeEligible !== 'boolean' || typeof decision.mileageEligible !== 'boolean') fail(400, 'Choose time and mileage eligibility for each segment');
      if (decision.mileageEligible && report.form.existingMileageClaimId) fail(409, 'Mileage is already covered by the separate approved claim. Review this report for travel time only.');
      const miles = decision.miles == null || decision.miles === '' ? null : Number(decision.miles);
      if (decision.mileageEligible && (report.form.vehicle !== 'personal' || segment.kind !== 'travel')) fail(400, 'Only personal vehicle driving can receive mileage reimbursement');
      if (decision.mileageEligible && (!Number.isFinite(miles) || miles < 0 || miles > 2000)) fail(400, 'Verify the mileage for each reimbursable segment');
      return { ...segment, timeEligible: decision.timeEligible, mileageEligible: decision.mileageEligible, miles: Number.isFinite(miles) ? round(miles) : segment.miles };
    });
    report.segments = segments; report.reviewed = true; report.reviewNote = text(input.note, 2000);
    report.reviewedAt = new Date().toISOString(); report.reviewedBy = reviewerId;
    report.totalMinutes = segments.reduce((n, s) => n + (s.timeEligible ? s.minutes : 0), 0);
    report.totalMiles = round(segments.reduce((n, s) => n + (s.mileageEligible ? Number(s.miles || 0) : 0), 0));
    await assertEventTravelNoOverlap({ report, reportId: id, db });
    await db.execute('UPDATE company_event_travel_reports SET report_json = ?, reviewed_by_user_id = ?, reviewed_at = NOW(), revision = revision + 1 WHERE id = ?', [JSON.stringify(report), reviewerId, id]);
    await syncClaims({ report, reportId: id, db });
    await db.commit();
    return { id, revision: Number(row.revision) + 1, report };
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}

export async function assertEventTravelReviewed(claim) {
  if (!claim.event_travel_report_id) return null;
  const row = await getEventTravelReport(claim.event_travel_report_id);
  if (!row.reviewed_at) fail(409, 'Open the Event travel report, verify its trips, and save the review before approving payroll.');
  if (claim.drive_date) {
    const miles = round(row.report.segments.filter(s => s.date === dateOnly(claim.drive_date) && s.mileageEligible).reduce((n, s) => n + Number(s.miles || 0), 0));
    if (miles !== Number(claim.miles)) fail(409, 'The report mileage changed. Refresh before approving.');
  }
  return row.report.reviewedAt;
}
