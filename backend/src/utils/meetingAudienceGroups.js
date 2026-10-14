import { agencyAvailability } from './providerAgencyAvailability.js';

// Provider access grants permissions; only an active clinician's sees-clients
// preference establishes membership in provider audiences for that agency.
export function meetingProviderAgencyIds(user) {
  if (String(user.status || '').toUpperCase() !== 'ACTIVE_EMPLOYEE') return [];
  return (user.agencyIds || []).filter(agencyId => {
    const policy = agencyAvailability(user.availabilityDetails, agencyId);
    return policy ? policy.seesClients === true : [true, 1, '1'].includes(user.seesClients);
  });
}

// Rebuild from the current authorized roster on each request. These groups never
// store a stale list of people and cannot pull members from another tenant.
export function meetingAudienceGroups(users, agencies, relationships = []) {
  const groups = [];
  const providerInAgency = (u, aid) => {
    const ids = meetingProviderAgencyIds(u);
    return aid ? ids.includes(aid) : ids.length > 0;
  };
  const definitions = [
    ['providers', 'All providers', providerInAgency],
    ['staff', 'All staff', () => true],
    ['admin_staff', 'Admin / support staff', u => ['admin', 'assistant_admin', 'staff', 'support', 'clinical_practice_assistant', 'super_admin', 'superadmin'].includes(u.role)],
    ['prelicensed', 'Prelicensed providers', (u, aid) => providerInAgency(u, aid) && (u.prelicensedAgencyIds || []).some(id => (!aid || id === aid) && meetingProviderAgencyIds(u).includes(id))],
    ['provider_plus', 'Provider Plus', (u, aid) => u.role === 'provider_plus' && providerInAgency(u, aid)],
    ['clinical_practice_assistant', 'Clinical practice assistants', u => u.role === 'clinical_practice_assistant'],
    ['supervisors', 'Supervisors', (u, aid) => relationships.some(r => Number(r.supervisor_id) === u.id && (!aid || Number(r.agency_id) === aid))],
    ['supervisees', 'Supervisees', (u, aid) => relationships.some(r => Number(r.supervisee_id) === u.id && (!aid || Number(r.agency_id) === aid))]
  ];
  const eligible = users.filter(u => !Number(u.is_demo) && !Number(u.isDemo));
  for (const agency of [null, ...agencies]) {
    const aid = agency ? Number(agency.id) : null;
    const roster = eligible.filter(u => !aid || u.agencyIds.includes(aid));
    for (const [key, label, matches] of definitions) {
      const userIds = [...new Set(roster.filter(u => matches(u, aid)).map(u => u.id))];
      if (!userIds.length) continue;
      groups.push({ key: aid ? `agency:${aid}:${key}` : `role:${key}`,
        label: aid ? `${label} — ${agency.name}` : `${label}${agencies.length > 1 ? ' — all my agencies' : ''}`,
        kind: 'team', automatic: true, agencyId: aid, userIds });
    }
    for (const supervisorId of new Set(relationships.filter(r => !aid || Number(r.agency_id) === aid).map(r => Number(r.supervisor_id)))) {
      const supervisor = eligible.find(u => u.id === supervisorId);
      if (!supervisor) continue;
      const userIds = roster.filter(u => relationships.some(r => Number(r.supervisor_id) === supervisorId && Number(r.supervisee_id) === u.id && (!aid || Number(r.agency_id) === aid))).map(u => u.id);
      if (userIds.length) groups.push({key:`supervisor:${supervisorId}:${aid || 'all'}`,label:`${[supervisor.firstName,supervisor.lastName].filter(Boolean).join(' ')}’s supervisees${aid ? ` — ${agency.name}` : ''}`,kind:'team',automatic:true,agencyId:aid,userIds});
    }
  }
  return groups;
}
