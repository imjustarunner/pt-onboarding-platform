import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { claimMdConnectionMeta } from './claimMdConnection.service.js';

const denied = () => Object.assign(new Error('Billing access is required for this organization.'), { status: 403 });
const missingSchema = e => ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(e?.code);
const dependencies = { main: pool, clinical: clinicalPool, memberships: id => User.getAgencies(id), canAccess: hasSchedulingBillingAccess, connectionMeta: claimMdConnectionMeta };
const pendingChangeSql="EXISTS (SELECT 1 FROM clinical_claim_change_requests ch WHERE ch.agency_id=clinical_claims.agency_id AND ch.clinical_session_id=clinical_claims.clinical_session_id AND ch.status IN ('pending','reconciliation_required'))";

// Resolve scope on the server. Never accept a client-supplied list of agencies.
export async function billingWorkspace(user, query = {}, deps = dependencies) {
  const role = String(user?.role || user?.effectiveRole || '').toLowerCase();
  if (!user?.id || ['provider', 'provider_plus'].includes(role)) throw denied();
  let candidates;
  if (role === 'super_admin') {
    [candidates] = await deps.main.execute('SELECT id, name, slug, logo_url, color_palette, feature_flags FROM agencies WHERE is_active = 1');
  } else {
    candidates = await deps.memberships(user.id);
  }
  const organizations = [];
  for (const a of candidates || []) {
    if (!getMedicalBillingFlags(a).medicalBillingEnabled || !await deps.canAccess(user, a.id)) continue;
    organizations.push({ id: Number(a.id), name: a.name, slug: a.slug, logoUrl: a.logo_url || null, colors: a.color_palette || null });
  }
  const requested = query.agencyId == null || query.agencyId === '' ? null : Number(query.agencyId);
  if (requested !== null && (!Number.isSafeInteger(requested) || !organizations.some(a => a.id === requested))) throw denied();
  const scope = requested ? organizations.filter(a => a.id === requested) : organizations;
  const result = { organizations, claims: [], total: 0, page: Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1)), pageSize: 30,
    capabilities: { claims: true, enrollments: true, paymentPosting: false, scheduledReports: false }, updatedAt: new Date().toISOString() };
  if (!organizations.length) return result;
  const allIds = organizations.map(a => a.id), allMarks = allIds.map(() => '?').join(',');
  let counts = [], enrollments = [];
  try {
    [counts] = await deps.clinical.execute(`SELECT agency_id, claim_lifecycle, COUNT(*) AS count, SUM(CASE WHEN claim_lifecycle NOT IN ('rejected','denied') AND ${pendingChangeSql} THEN 1 ELSE 0 END) AS additional_attention FROM clinical_claims
      WHERE agency_id IN (${allMarks}) AND is_deleted = 0 GROUP BY agency_id, claim_lifecycle`, allIds);
  } catch (e) { if (!missingSchema(e)) throw e; result.capabilities.claims = false; }
  try {
    [enrollments] = await deps.clinical.execute(`SELECT agency_id, connection_id, billing_office_location_id, provider_npi, payer_id, enrollment_type, status, last_event_at
      FROM claimmd_enrollments WHERE agency_id IN (${allMarks})`, allIds);
  } catch (e) { if (!missingSchema(e)) throw e; result.capabilities.enrollments = false; }
  for (const organization of organizations) {
    organization.counts = result.capabilities.claims ? Object.fromEntries(counts.filter(r => Number(r.agency_id) === organization.id).map(r => [r.claim_lifecycle || 'unknown', Number(r.count)])) : null;
    if(organization.counts)organization.counts.service_changes=counts.filter(r=>Number(r.agency_id)===organization.id).reduce((n,r)=>n+Number(r.additional_attention||0),0);
    try { organization.connection = await deps.connectionMeta(organization.id); }
    catch (e) { if (!missingSchema(e)) throw e; organization.connection = { configured: false, unavailable: true }; }
    const connectionId = organization.connection.accountId ? `account:${organization.connection.accountId}` : `agency:${organization.id}`;
    organization.enrollments = enrollments.filter(r => Number(r.agency_id) === organization.id && r.connection_id === connectionId)
      .map(({ billing_office_location_id, provider_npi, payer_id, enrollment_type, status, last_event_at }) => ({ officeId: billing_office_location_id, providerNpi: provider_npi, payerId: payer_id, type: enrollment_type, status, lastEventAt: last_event_at }));
  }
  if (!result.capabilities.claims) return result;
  const params = scope.map(a => a.id);
  let where = `agency_id IN (${params.map(() => '?').join(',')}) AND is_deleted = 0`;
  const filters = { draft: ['draft'], ready: ['ready'], in_progress: ['queued', 'submitted'], rejected: ['rejected'], denied: ['denied'], paid: ['paid'], attention: ['rejected', 'denied'] };
  if (query.status && query.status !== 'all') {
    if (!filters[query.status]) throw Object.assign(new Error('Invalid claim queue filter.'), { status: 400 });
    where += ` AND (claim_lifecycle IN (${filters[query.status].map(() => '?').join(',')})${query.status==='attention'?` OR ${pendingChangeSql}`:''})`; params.push(...filters[query.status]);
  }
  const search = String(query.search || '').trim().slice(0, 100);
  if (search) { where += ' AND (claim_number LIKE ? OR payer_name LIKE ? OR CAST(id AS CHAR) = ? OR CAST(client_id AS CHAR) = ?)'; params.push(`%${search}%`, `%${search}%`, search, search); }
  const [[totalRows], [rows]] = await Promise.all([
    deps.clinical.execute(`SELECT COUNT(*) AS count FROM clinical_claims WHERE ${where}`, params),
    deps.clinical.execute(`SELECT id, parent_claim_id, payer_sequence, agency_id, clinical_note_id, clinical_session_id, client_id, claim_number, payer_name,
      claim_lifecycle, claimmd_last_status, amount_cents, currency_code, date_of_service, updated_at, ${pendingChangeSql} AS service_change_pending
      FROM clinical_claims WHERE ${where} ORDER BY service_change_pending DESC, CASE claim_lifecycle WHEN 'rejected' THEN 0 WHEN 'denied' THEN 1
      WHEN 'ready' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, updated_at DESC, id DESC LIMIT 30 OFFSET ${(result.page - 1) * 30}`, params)
  ]);
  result.total = Number(totalRows[0]?.count || 0); result.claims = rows;
  return result;
}
