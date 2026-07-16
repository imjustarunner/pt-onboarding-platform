/**
 * Live coverage warning engine for Caseload Hub.
 */
import pool from '../config/database.js';
import {
  getSchoolCoverageSummary,
  getProviderCoverageSummary,
  safeInt
} from './schoolCoverageMetrics.service.js';

function isMissingSchemaError(e) {
  const code = e?.code || '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const msg = String(e?.message || '');
  return msg.includes("doesn't exist") || msg.includes('Unknown column');
}

/**
 * @returns {{ agencyId, refreshedAt, cards, items }}
 */
export async function getCoverageWarnings(agencyId, { severity = null, type = null } = {}) {
  const schoolSummary = await getSchoolCoverageSummary(agencyId, { orgType: 'school' });
  const providerSummary = await getProviderCoverageSummary(agencyId);
  const items = [];

  for (const s of schoolSummary.schools || []) {
    if (s.clientsWithoutProvider > 0) {
      items.push({
        id: `clients-no-provider-${s.schoolId}`,
        type: 'clients_without_provider',
        severity: 'critical',
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        count: s.clientsWithoutProvider,
        title: 'Clients without providers',
        message: `${s.schoolName}: ${s.clientsWithoutProvider} client(s) need a provider`,
        resolutionPath: `/admin/caseload-hub/schools-staff?tab=coverage-needs&type=clients_without_provider&schoolId=${s.schoolId}`
      });
    }
    if (s.clientsWithProviderNoDay > 0) {
      items.push({
        id: `clients-no-day-${s.schoolId}`,
        type: 'clients_without_service_day',
        severity: 'critical',
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        count: s.clientsWithProviderNoDay,
        title: 'Clients without service days',
        message: `${s.schoolName}: ${s.clientsWithProviderNoDay} client(s) have a provider but no service day`,
        resolutionPath: `/admin/caseload-hub/schools-staff?tab=coverage-needs&type=clients_without_service_day&schoolId=${s.schoolId}`
      });
    }
    if (s.unstaffedDays > 0) {
      const days = (s.days || []).filter((d) => d.unstaffed).map((d) => d.dayOfWeek);
      items.push({
        id: `unstaffed-days-${s.schoolId}`,
        type: 'unstaffed_school_days',
        severity: 'critical',
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        count: s.unstaffedDays,
        days,
        title: 'Unstaffed school days',
        message: `${s.schoolName}: ${days.join(', ') || s.unstaffedDays + ' day(s)'} have clients but no provider`,
        resolutionPath: `/admin/caseload-hub/schools-staff?tab=open-spots&schoolId=${s.schoolId}`
      });
    }
    if (s.waitlistCount > 0 && s.slotsAvailable === 0) {
      items.push({
        id: `waitlist-no-capacity-${s.schoolId}`,
        type: 'waitlist_no_capacity',
        severity: 'critical',
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        count: s.waitlistCount,
        title: 'Waitlist with no open capacity',
        message: `${s.schoolName}: ${s.waitlistCount} waitlisted with no available slots`,
        resolutionPath: `/admin/caseload-hub/schools-staff?tab=coverage-needs&type=waitlist_no_capacity&schoolId=${s.schoolId}`
      });
    } else if (s.waitlistCount > 0 && s.slotsAvailable > 0) {
      items.push({
        id: `waitlist-unused-${s.schoolId}`,
        type: 'waitlist_unused_capacity',
        severity: 'moderate',
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        count: s.waitlistCount,
        title: 'Waitlist with unused capacity',
        message: `${s.schoolName}: ${s.waitlistCount} waitlisted but ${s.slotsAvailable} slot(s) open`,
        resolutionPath: `/admin/caseload-hub/schools-staff?tab=by-school&schoolId=${s.schoolId}`
      });
    }
    if (s.capacityUtilization >= 90 && s.slotsAvailable > 0) {
      items.push({
        id: `nearing-capacity-${s.schoolId}`,
        type: 'school_nearing_capacity',
        severity: 'moderate',
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        count: 1,
        utilization: s.capacityUtilization,
        title: 'School nearing capacity',
        message: `${s.schoolName}: ${s.capacityUtilization}% capacity used`,
        resolutionPath: `/admin/caseload-hub/schools-staff?tab=by-school&schoolId=${s.schoolId}`
      });
    }
  }

  for (const p of providerSummary.providers || []) {
    if (p.noDayAssigned || (p.assignedSchools > 0 && p.assignedDays === 0)) {
      items.push({
        id: `provider-no-day-${p.providerId}`,
        type: 'providers_without_assigned_days',
        severity: 'critical',
        providerId: p.providerId,
        providerName: p.name,
        count: 1,
        title: 'Provider without assigned days',
        message: `${p.name} is linked to school(s) but has no assigned day`,
        resolutionPath: `/admin/caseload-hub/schools-staff?tab=by-person&providerId=${p.providerId}`
      });
    }
    if (p.pendingRequests > 0) {
      items.push({
        id: `pending-day-req-${p.providerId}`,
        type: 'pending_additional_day_requests',
        severity: 'informational',
        providerId: p.providerId,
        providerName: p.name,
        count: p.pendingRequests,
        title: 'Pending additional-day request',
        message: `${p.name} has ${p.pendingRequests} pending school-day request(s)`,
        resolutionPath: '/admin/availability-intake'
      });
    }
  }

  // Events needing providers (school outreach with signup enabled, upcoming)
  try {
    const [rows] = await pool.execute(
      `SELECT ce.id, ce.title, ce.organization_id AS school_id, a.name AS school_name, ce.starts_at,
              ce.staffing_config_json, ce.outreach_table_invited
       FROM company_events ce
       LEFT JOIN agencies a ON a.id = ce.organization_id
       WHERE ce.agency_id = ?
         AND ce.is_active = 1
         AND ce.starts_at >= NOW()
         AND (
           ce.event_type IN (
             'school_back_to_school', 'school_spring_event', 'school_open_house',
             'school_resource_fair', 'school_family_night', 'school_orientation', 'school_other'
           )
           OR ce.event_type LIKE 'school\\_%'
         )
         AND (ce.outreach_table_invited = 1 OR ce.staffing_config_json IS NOT NULL)
       ORDER BY ce.starts_at ASC
       LIMIT 100`,
      [agencyId]
    );
    for (const r of rows || []) {
      let assigned = 0;
      let pending = 0;
      let requested = 1;
      try {
        const cfg =
          typeof r.staffing_config_json === 'string'
            ? JSON.parse(r.staffing_config_json)
            : r.staffing_config_json || {};
        requested = Number(cfg?.minProvidersPerSession || cfg?.providerSignup?.needed || 1) || 1;
      } catch {
        requested = 1;
      }
      try {
        const [aRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM company_event_session_providers csp
           JOIN company_event_session_dates csd ON csd.id = csp.session_date_id
           WHERE csd.company_event_id = ?`,
          [r.id]
        );
        assigned = Number(aRows?.[0]?.cnt || 0);
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }
      try {
        const [pRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM company_event_session_provider_requests r
           JOIN company_event_session_dates csd ON csd.id = r.session_date_id
           WHERE csd.company_event_id = ? AND UPPER(r.status) = 'PENDING'`,
          [r.id]
        );
        pending = Number(pRows?.[0]?.cnt || 0);
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }
      if (assigned < requested) {
        items.push({
          id: `event-needs-providers-${r.id}`,
          type: 'events_needing_providers',
          severity: 'critical',
          eventId: r.id,
          schoolId: safeInt(r.school_id),
          schoolName: r.school_name,
          count: Math.max(0, requested - assigned),
          pendingRequests: pending,
          title: 'Event needing providers',
          message: `${r.title || 'School event'}: ${assigned}/${requested} providers assigned`,
          resolutionPath: `/admin/caseload-hub/events?eventId=${r.id}`
        });
      } else if (pending > 0) {
        items.push({
          id: `event-pending-req-${r.id}`,
          type: 'pending_event_requests',
          severity: 'informational',
          eventId: r.id,
          schoolId: safeInt(r.school_id),
          schoolName: r.school_name,
          count: pending,
          title: 'Pending event requests',
          message: `${r.title || 'School event'}: ${pending} provider request(s) pending`,
          resolutionPath: `/admin/caseload-hub/events?tab=provider-requests&eventId=${r.id}`
        });
      }
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  // Pending school availability requests (agency-wide)
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM provider_school_availability_requests
       WHERE agency_id = ? AND status = 'PENDING'`,
      [agencyId]
    );
    const cnt = Number(rows?.[0]?.cnt || 0);
    if (cnt > 0) {
      items.push({
        id: 'pending-school-requests-agency',
        type: 'pending_additional_day_requests',
        severity: 'informational',
        count: cnt,
        title: 'Pending additional-day requests',
        message: `${cnt} school availability request(s) awaiting review`,
        resolutionPath: '/admin/availability-intake'
      });
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  let filtered = items;
  if (severity) {
    const sev = String(severity).toLowerCase();
    filtered = filtered.filter((i) => i.severity === sev);
  }
  if (type) {
    const t = String(type).toLowerCase();
    filtered = filtered.filter((i) => i.type === t);
  }

  const cardTypes = [
    { type: 'clients_without_provider', title: 'Clients Without Providers', severity: 'critical' },
    { type: 'clients_without_service_day', title: 'Clients Without Service Days', severity: 'critical' },
    { type: 'providers_without_assigned_days', title: 'Providers Without Assigned Days', severity: 'critical' },
    { type: 'unstaffed_school_days', title: 'Unstaffed School Days', severity: 'critical' },
    { type: 'waitlist_no_capacity', title: 'Schools With Waitlists (No Capacity)', severity: 'critical' },
    { type: 'events_needing_providers', title: 'Events Needing Providers', severity: 'critical' },
    { type: 'pending_event_requests', title: 'Pending Event Requests', severity: 'informational' },
    { type: 'pending_additional_day_requests', title: 'Pending Additional-Day Requests', severity: 'informational' },
    { type: 'waitlist_unused_capacity', title: 'Waitlist With Unused Capacity', severity: 'moderate' },
    { type: 'school_nearing_capacity', title: 'Schools Nearing Capacity', severity: 'moderate' }
  ];

  // School-scoped cards should count schools, not sum client/utilization figures.
  const countBySchoolItem = new Set([
    'waitlist_no_capacity',
    'waitlist_unused_capacity',
    'school_nearing_capacity',
    'unstaffed_school_days'
  ]);

  const cards = cardTypes.map((c) => {
    const matching = items.filter((i) => i.type === c.type);
    const count = countBySchoolItem.has(c.type)
      ? matching.length
      : matching.reduce((sum, i) => sum + Number(i.count || 0), 0);
    return {
      ...c,
      count,
      itemCount: matching.length,
      href: `/admin/caseload-hub/schools-staff?tab=coverage-needs&type=${c.type}`
    };
  });

  return {
    agencyId,
    refreshedAt: new Date().toISOString(),
    cards,
    items: filtered
  };
}
