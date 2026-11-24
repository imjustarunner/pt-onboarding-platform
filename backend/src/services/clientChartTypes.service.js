import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { guardianServiceRestrictions } from '../utils/guardianServiceRestrictions.js';
import { terminalProfile, serviceStatus } from '../utils/clientServiceLifecycle.js';
import { ageOn } from './guardianClinicalAccess.service.js';
import { clientAgencyMembership } from './clientServiceEnrollment.service.js';
import { canAccessHubClient } from './hubPeopleAccess.service.js';
import { activeChartOrganizationJoin, endedSchoolAssignment, organizationChartType } from './clientChartOrganizations.js';

export const chartTypes = ['clinical', 'learning', 'coaching', 'consulting', 'school', 'dependent'];
const serviceTypes = { counseling: 'clinical', tutoring: 'learning', coaching: 'coaching', consultation: 'consulting' };
const editors = ['admin', 'support', 'super_admin'];
const fail = (status, message) => Object.assign(new Error(message), { status });

export async function requireTypeAccess(user, clientId, agencyId, { write = false, db = pool } = {}) {
  if (![clientId, agencyId].every(id => Number.isSafeInteger(id) && id > 0)) throw fail(400, 'Choose a client and agency.');
  if (user.scopedAgencyId && Number(user.scopedAgencyId) !== agencyId) throw fail(403, 'Select the matching chart agency.');
  const editor = editors.includes(user.role);
  if (!editor && (write || !['staff','provider','provider_plus','clinical_practice_assistant','supervisor'].includes(user.role))) throw fail(403, 'Chart access required.');
  if (!await clientAgencyMembership(clientId, agencyId, db)) throw fail(404, 'Chart not found in this agency.');
  if (user.role !== 'super_admin') {
    const [[member]] = await db.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1', [user.id, agencyId]);
    if (!member) throw fail(403, 'Active agency membership required.');
    if (!editor && user.role !== 'staff' && !await canAccessHubClient({ userId:user.id, clientId, agencyId })) throw fail(403, 'Chart assignment required.');
  }
}

export function classifyClient({client, agencyId, services, organizations, links, saved}, asOf) {
  const evidence = {};
  function add(type, label, tab, minorDefault = false) {
    const entries = evidence[type] ||= [];
    if (!entries.some(item => item.label === label && item.tab === tab)) entries.push({label, tab, ...(minorDefault ? {minorDefault:true} : {})});
  }
  for (const service of services) {
    const type = serviceTypes[service.service_kind];
    if (type && serviceStatus(service) === 'active') add(type, service.label || service.service_kind, 'assignments');
  }
  for (const org of organizations) {
    const type = organizationChartType(org.organization_type);
    if (type) add(type, org.name, 'assignments');
  }
  const importedClassification = Number(client.agency_id) === agencyId ? client.records_contact_classification : null;
  let establishedSelf = false, personalAccounts = 0;
  for (const link of links) {
    const permissions = ClientGuardian.parsePermissions(link.permissions_json) || {};
    const restriction = guardianServiceRestrictions(link);
    if (permissions.relationshipRevoked || (restriction && !restriction.agencyIds.includes(agencyId))) continue;
    if (link.relationship_type === 'self') {
      if (permissions.noView || permissions.revoked || permissions.noContact || permissions.pendingGuardianVerification) continue;
      personalAccounts++;
      establishedSelf ||= !!Number(link.established);
    }
    else if (['guardian','proxy'].includes(link.relationship_type) &&
      (importedClassification !== 'independent' || !(permissions.billingOnly || permissions.pendingGuardianVerification))) {
      add('dependent', 'Linked guardian account', 'guardians');
    }
  }
  const age = ageOn(client.date_of_birth, asOf);
  const isCurrent = !terminalProfile(client) && ['current','active','being_seen'].includes(String(client.client_status_key || client.status).toLowerCase());
  const defaults = [];
  // Carry an older classification only on its owning chart until staff review it.
  if (Number(client.agency_id) === agencyId && ['clinical','learning'].includes(client.client_type)
      && !evidence[client.client_type] && !services.some(s => serviceTypes[s.service_kind] === client.client_type)) defaults.push(client.client_type);
  if (Number(client.agency_id) === agencyId && client.client_type === 'school' && !evidence.school && !Number(client.ended_school_assignment)) defaults.push('school');
  if (importedClassification === 'dependent') defaults.push('dependent');
  const minorDefault = isCurrent && age !== null && age >= 0 && age < 18 && !establishedSelf;
  // A minor default remains dynamic as their birthday or portal changes. A staff
  // decision can explicitly include or suppress it without changing portal rights.
  const preferences = saved ? (typeof saved.selected_types === 'string' ? JSON.parse(saved.selected_types) : saved.selected_types) : null;
  const selected = preferences?.types ?? defaults;
  if (minorDefault && !(preferences?.suppressMinorDefault ?? importedClassification === 'independent')) add('dependent', 'Current minor without an established personal portal', 'guardians', true);
  if (selected.includes('school') || evidence.school) {
    (evidence.clinical ||= []).push({label:'Included with School', tab:'assignments', impliedBy:'school'});
  }
  const types = chartTypes.filter(type => selected.includes(type) || evidence[type]);
  let portalSetup = null;
  if (types.includes('clinical')) {
    let state = 'confirm_ownership';
    if (personalAccounts > 1) state = 'review_identity';
    else if (establishedSelf) state = 'active';
    else if (personalAccounts) state = 'prepared';
    else if (!isCurrent) state = 'review_status';
    else if (age === null || age < 0) state = 'review_birth_date';
    else if (age < 18) state = 'review_minor';
    else if (!String(client.email || '').trim()) state = 'add_email';
    portalSetup = {portal:'auricwell',state};
  }
  return { selected, evidence, types, portalSetup,
    minorDefault, suppressMinorDefault:preferences?.suppressMinorDefault === true, revision:Number(saved?.revision || 0),
    schools:organizations.filter(org => org.organization_type === 'school').map(org => org.name),
    historicalTypes:[...new Set(services.filter(s => serviceStatus(s) !== 'active').map(s => serviceTypes[s.service_kind]).filter(Boolean))] };
}

// An email match cannot identify the owner of an existing login or shared family address.
export async function personalContactReviewReason(clientId, db = pool) {
  const [[row]] = await db.execute(`SELECT
    EXISTS(SELECT 1 FROM clients other WHERE other.id<>c.id AND CONVERT(TRIM(other.email) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(TRIM(c.email) USING utf8mb4) COLLATE utf8mb4_unicode_ci) AS shared_email,
    EXISTS(SELECT 1 FROM users u WHERE CONVERT(TRIM(u.email) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(TRIM(c.email) USING utf8mb4) COLLATE utf8mb4_unicode_ci OR CONVERT(TRIM(u.username) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(TRIM(c.email) USING utf8mb4) COLLATE utf8mb4_unicode_ci OR CONVERT(TRIM(u.personal_email) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(TRIM(c.email) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
    OR EXISTS(SELECT 1 FROM client_guardians cg WHERE cg.client_id=c.id AND cg.relationship_type='self') AS identity_match
    FROM clients c WHERE c.id=? AND NULLIF(TRIM(c.email),'') IS NOT NULL`,[clientId]);
  if (Number(row?.shared_email)) return 'shared_email';
  return Number(row?.identity_match) ? 'review_identity' : null;
}

export async function readChartTypes(clientId, agencyId, db = pool, {checkContact=true} = {}) {
  const [[client]] = await db.execute(`SELECT c.agency_id,c.client_type,c.date_of_birth,c.email,c.status,JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.recordsContactClassification')) AS records_contact_classification,${endedSchoolAssignment} AS ended_school_assignment,cs.status_key AS client_status_key
    FROM clients c LEFT JOIN client_statuses cs ON cs.id=c.client_status_id WHERE c.id=?`, [clientId]);
  if (!client) throw fail(404, 'Client not found.');
  const [services] = await db.execute('SELECT service_kind,label,is_active,service_status FROM client_service_enrollments WHERE client_id=? AND agency_id=?', [clientId, agencyId]);
  const [organizations] = await db.execute(`SELECT o.name,o.organization_type FROM clients c
    JOIN agencies tenant ON tenant.id=?
    ${activeChartOrganizationJoin('tenant.id')}
    WHERE c.id=? AND o.id IS NOT NULL ORDER BY o.name,o.id`, [agencyId,clientId]);
  const [links] = await db.execute(`SELECT cg.relationship_type,cg.permissions_json,c.agency_id,
      (NULLIF(u.password_hash,'') IS NOT NULL AND NULLIF(u.temporary_password_hash,'') IS NULL AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','EHR_ONLY')) AS established
    FROM client_guardians cg JOIN clients c ON c.id=cg.client_id JOIN users u ON u.id=cg.guardian_user_id
    WHERE cg.client_id=? AND cg.access_enabled=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND (UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','EHR_ONLY') OR (cg.relationship_type='self' AND UPPER(u.status) IN ('PENDING_SETUP','PENDING'))) AND u.terminated_at IS NULL
      AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())
      AND NOT EXISTS (SELECT 1 FROM dependent_portal_access d WHERE d.client_id=cg.client_id AND d.user_id=u.id AND d.revoked_at IS NOT NULL)`, [clientId]);
  const [[saved]] = await db.execute('SELECT selected_types,revision FROM client_chart_type_selections WHERE client_id=? AND agency_id=?', [clientId,agencyId]);
  const profile = classifyClient({client,agencyId,services,organizations,links,saved});
  if (checkContact && profile.portalSetup?.state === 'confirm_ownership') {
    profile.portalSetup.state = await personalContactReviewReason(clientId,db) || 'confirm_ownership';
  }
  return profile;
}

export async function saveChartTypes(user, clientId, agencyId, input) {
  if (!Array.isArray(input?.types) || input.types.some(type => !chartTypes.includes(type)) ||
      typeof input.suppressMinorDefault !== 'boolean' || !Number.isSafeInteger(input.revision) || input.revision < 0) throw fail(400, 'Invalid client type selection.');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
    await requireTypeAccess(user,clientId,agencyId,{write:true,db});
    const before = await readChartTypes(clientId,agencyId,db);
    if (input.revision !== before.revision) throw fail(409, 'Another staff member updated these selections. Reload the client types before saving.');
    const types = chartTypes.filter(type => input.types.includes(type));
    const value = JSON.stringify({types,suppressMinorDefault:input.suppressMinorDefault});
    await db.execute(`INSERT INTO client_chart_type_selections (client_id,agency_id,selected_types,revision) VALUES (?,?,?,1)
      ON DUPLICATE KEY UPDATE selected_types=VALUES(selected_types),revision=revision+1`,[clientId,agencyId,value]);
    await db.execute(`INSERT INTO client_chart_type_history (client_id,agency_id,revision,changed_by_user_id,previous_selection,new_selection)
      VALUES (?,?,?,?,?,?)`,[clientId,agencyId,before.revision + 1,user.id,JSON.stringify({types:before.selected,suppressMinorDefault:before.suppressMinorDefault}),value]);
    const result = await readChartTypes(clientId,agencyId,db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}
