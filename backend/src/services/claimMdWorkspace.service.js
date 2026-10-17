import { isBillingAgency } from './billingAgencyPolicy.js';
import { listPayerEft } from './payerEft.service.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import { managedBillingAgencies } from './managedBillingAccess.service.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { claimMdConnectionMeta } from './claimMdConnection.service.js';

const denied = () => Object.assign(new Error('Billing access is required for this organization.'), { status: 403 });
const missingSchema = e => ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(e?.code);
const dependencies = { main: pool, clinical: clinicalPool, memberships: id => User.getAgencies(id), managed: managedBillingAgencies, canAccess: hasSchedulingBillingAccess, connectionMeta: claimMdConnectionMeta, eftList: listPayerEft };
const pendingChangeSql="EXISTS (SELECT 1 FROM clinical_claim_change_requests ch WHERE ch.agency_id=clinical_claims.agency_id AND ch.clinical_session_id=clinical_claims.clinical_session_id AND ch.status IN ('pending','reconciliation_required'))";

// Resolve scope on the server. Never accept a client-supplied list of agencies.
export async function billingWorkspaceAgencies(user, deps = dependencies) {
  const role = String(user?.role || user?.effectiveRole || '').toLowerCase();
  if (!user?.id || ['provider', 'provider_plus'].includes(role)) throw denied();
  let candidates;
  if (role === 'super_admin') {
    const sql = `SELECT a.id, a.name, a.slug, a.logo_url, a.color_palette, a.feature_flags, a.organization_type, a.is_active, a.is_archived, i.file_path AS icon_file_path,
      m.id AS billing_manager_id, m.name AS billing_manager_name
      FROM agencies a LEFT JOIN icons i ON i.id=a.icon_id LEFT JOIN agency_billing_management bm ON bm.agency_id=a.id AND bm.is_active=1
      LEFT JOIN agencies m ON m.id=bm.manager_agency_id AND m.is_active=1 AND COALESCE(m.is_archived,0)=0
      WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0`;
    [candidates] = user.auricwellPreviewAgencyId
      ? await deps.main.execute(`${sql} AND a.id = ?`, [user.auricwellPreviewAgencyId])
      : await deps.main.execute(sql);
  } else {
    const [memberships, managed] = await Promise.all([deps.memberships(user.id), deps.managed(user.id)]);
    candidates = [...new Map([...memberships, ...managed].map(a => [Number(a.id), a])).values()];
  }
  const organizations = [];
  for (const a of candidates || []) {
    if (!isBillingAgency(a)) continue;
    if (!getMedicalBillingFlags(a).medicalBillingEnabled || !await deps.canAccess(user, a.id)) continue;
    organizations.push({ id: Number(a.id), name: a.name, slug: a.slug, logoUrl: a.icon_file_path || a.logo_url || null, colors: a.color_palette || null, billingManager: a.billing_manager_id ? { id: Number(a.billing_manager_id), name: a.billing_manager_name } : null });
  }
  return organizations;
}

export async function billingWorkspace(user, query = {}, deps = dependencies) {
  const organizations = await billingWorkspaceAgencies(user, deps);
  const requested = query.agencyId == null || query.agencyId === '' ? null : Number(query.agencyId);
  if (requested !== null && (!Number.isSafeInteger(requested) || !organizations.some(a => a.id === requested))) throw denied();
  const scope = requested ? organizations.filter(a => a.id === requested) : organizations;
  const result = { organizations, claims: [], total: 0, page: Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1)), pageSize: 30,
    capabilities: { claims: true, enrollments: true, paymentPosting: true, scheduledReports: false, eft: true }, updatedAt: new Date().toISOString() };
  if (!organizations.length) return result;
  const allIds = organizations.map(a => a.id), allMarks = allIds.map(() => '?').join(',');
  let counts = [], enrollments = [], payments = [];
  try {
    [counts] = await deps.clinical.execute(`SELECT agency_id, claim_lifecycle, COUNT(*) AS count, SUM(CASE WHEN claim_lifecycle NOT IN ('rejected','denied') AND ${pendingChangeSql} THEN 1 ELSE 0 END) AS additional_attention FROM clinical_claims
      WHERE agency_id IN (${allMarks}) AND is_deleted = 0 GROUP BY agency_id, claim_lifecycle`, allIds);
  } catch (e) { if (!missingSchema(e)) throw e; result.capabilities.claims = false; }
  try {
    [enrollments] = await deps.clinical.execute(`SELECT agency_id, connection_id, billing_office_location_id, provider_npi, payer_id, enrollment_type, status, last_event_at
      FROM claimmd_enrollments WHERE agency_id IN (${allMarks})`, allIds);
  } catch (e) { if (!missingSchema(e)) throw e; result.capabilities.enrollments = false; }
  try {
    [payments] = await deps.clinical.execute(`SELECT agency_id, COUNT(*) AS posting_count, SUM(paid_cents) AS paid_cents FROM claimmd_payment_postings WHERE agency_id IN (${allMarks}) GROUP BY agency_id`,allIds);
  } catch(e) { if(!missingSchema(e))throw e;result.capabilities.paymentPosting=false; }
  for (const organization of organizations) {
    const payment=payments.find(p=>Number(p.agency_id)===organization.id);
    organization.payments=result.capabilities.paymentPosting?{postingCount:Number(payment?.posting_count||0),paidCents:Number(payment?.paid_cents||0)}:null;
    try { const eft=await deps.eftList(organization.id); organization.eft=eft.items.map(({id,officeId,payerId,payerName,providerNpi,status,identityCurrent,updatedAt})=>({id,officeId,payerId,payerName,providerNpi,status,identityCurrent,updatedAt})); organization.eftHasMore=eft.hasMore; }
    catch(e){if(!missingSchema(e))throw e;result.capabilities.eft=false;organization.eft=null;}
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
