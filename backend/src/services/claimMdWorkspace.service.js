import { loadBillingWorkItems, filterBillingWorkItems, enrichBillingWorkNames } from './billingWorkItems.service.js';
import { productBillingContext } from './productBillingContext.service.js';
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

// Resolve scope on the server. Never accept a client-supplied list of agencies.
export async function billingWorkspaceAgencies(user, deps = dependencies) {
  const role = String(user?.role || user?.effectiveRole || '').toLowerCase();
  const agencyScope = productBillingContext(user)?.agencyId ?? null;
  if (!user?.id || (agencyScope === null && ['provider', 'provider_plus'].includes(role))) throw denied();
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
  if (agencyScope !== null) candidates = (candidates || []).filter(a => Number(a.id) === Number(agencyScope));
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
  let workItems = [], enrollments = [], payments = [];
  try {
    const work = await (deps.loadWorkItems || loadBillingWorkItems)(allIds, deps);
    workItems = work.items;
    result.capabilities.drafts = work.draftsAvailable;
    result.capabilities.appointmentHistory = work.appointmentsAvailable;
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
    organization.counts = result.capabilities.claims ? workItems.filter(row => row.agency_id === organization.id).reduce((counts, row) => {
      counts[row.stage] = (counts[row.stage] || 0) + 1;
      if (Number(row.service_change_pending)) counts.service_changes = (counts.service_changes || 0) + 1;
      return counts;
    }, {}) : null;
    try { organization.connection = await deps.connectionMeta(organization.id); }
    catch (e) { if (!missingSchema(e)) throw e; organization.connection = { configured: false, unavailable: true }; }
    const connectionId = organization.connection.accountId ? `account:${organization.connection.accountId}` : `agency:${organization.id}`;
    organization.enrollments = enrollments.filter(r => Number(r.agency_id) === organization.id && r.connection_id === connectionId)
      .map(({ billing_office_location_id, provider_npi, payer_id, enrollment_type, status, last_event_at }) => ({ officeId: billing_office_location_id, providerNpi: provider_npi, payerId: payer_id, type: enrollment_type, status, lastEventAt: last_event_at }));
  }
  if (!result.capabilities.claims) return result;
  const scopeIds = new Set(scope.map(a => a.id));
  const filtered = filterBillingWorkItems(workItems.filter(row => scopeIds.has(row.agency_id)), query, organizations);
  result.total = filtered.length;
  result.claims = filtered.slice((result.page - 1) * result.pageSize, result.page * result.pageSize);
  result.stageCounts = workItems.filter(row => scopeIds.has(row.agency_id) && (!query.clientId || Number(row.client_id) === Number(query.clientId))).reduce((counts,row) => { counts[row.stage] = (counts[row.stage] || 0) + 1; return counts; }, {});
  return result;
}

export async function billingWorkspaceTransactions(user, query = {}, deps = dependencies) {
  const organizations = await billingWorkspaceAgencies(user, deps);
  const requested = query.agencyId == null || query.agencyId === '' ? null : Number(query.agencyId);
  if (requested !== null && (!Number.isSafeInteger(requested) || !organizations.some(a => a.id === requested))) throw denied();
  const agencyIds = organizations.filter(a => requested === null || a.id === requested).map(a => a.id);
  const result = { organizations, transactions: [], total: 0, page: Math.max(1, Number.parseInt(query.page,10) || 1), pageSize: 30, available: true };
  if (!agencyIds.length) return result;
  let rows;
  try { [rows] = await deps.clinical.execute(`SELECT p.id,p.agency_id,p.clinical_claim_id AS claimId,c.client_id,c.claim_number,c.date_of_service,c.payer_name,p.kind,p.paid_cents,p.adjustment_cents,p.responsibility_cents,p.reverses_posting_id,p.posted_at,p.posted_by_user_id AS provider_user_id
    FROM claimmd_payment_postings p LEFT JOIN clinical_claims c ON c.id=p.clinical_claim_id AND c.agency_id=p.agency_id
    WHERE p.agency_id IN (${agencyIds.map(() => '?').join(',')})`,agencyIds); }
  catch(error) { if(!missingSchema(error)) throw error; result.available=false; return result; }
  rows=rows.map(row=>({...row,id:`payer:${row.id}`,source:'payer',amount_cents:Number(row.paid_cents),status:'posted'}));
  try {
    const [payments]=await deps.main.execute(`SELECT p.id,p.agency_id,r.client_id,r.service_date AS date_of_service,p.processor,p.status,p.amount_cents,p.receipt_number AS claim_number,COALESCE(p.received_at,p.created_at) AS posted_at,p.created_by_user_id AS provider_user_id,
      CASE WHEN r.source_type='claim_responsibility' AND r.source_key REGEXP '^[0-9]+$' THEN CAST(r.source_key AS UNSIGNED) ELSE NULL END AS claimId
      FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id AND a.agency_id=p.agency_id JOIN family_receivables r ON r.id=a.receivable_id AND r.agency_id=p.agency_id
      WHERE p.agency_id IN (${agencyIds.map(()=>'?').join(',')})`,agencyIds);
    for(const payment of payments)rows.push({...payment,id:`payment:${payment.id}`,source:'family_payment',kind:`${String(payment.processor).toLowerCase()}_payment`,paid_cents:payment.status==='succeeded'?Number(payment.amount_cents):0,adjustment_cents:0,responsibility_cents:0});
    const [refunds]=await deps.main.execute(`SELECT f.id,f.agency_id,r.client_id,r.service_date AS date_of_service,f.status,f.amount_cents,p.receipt_number AS claim_number,COALESCE(f.completed_at,f.created_at) AS posted_at,f.created_by_user_id AS provider_user_id,f.payment_id,
      CASE WHEN r.source_type='claim_responsibility' AND r.source_key REGEXP '^[0-9]+$' THEN CAST(r.source_key AS UNSIGNED) ELSE NULL END AS claimId
      FROM family_payment_refunds f JOIN family_ledger_payments p ON p.id=f.payment_id AND p.agency_id=f.agency_id JOIN family_receivable_allocations a ON a.id=p.allocation_id AND a.agency_id=p.agency_id JOIN family_receivables r ON r.id=a.receivable_id AND r.agency_id=p.agency_id
      WHERE f.agency_id IN (${agencyIds.map(()=>'?').join(',')})`,agencyIds);
    for(const refund of refunds)rows.push({...refund,id:`refund:${refund.id}`,source:'family_refund',kind:'refund',amount_cents:-Number(refund.amount_cents),paid_cents:refund.status==='succeeded'?-Number(refund.amount_cents):0,adjustment_cents:0,responsibility_cents:0});
    result.familyPaymentsAvailable=true;
  }catch(error){if(!missingSchema(error))throw error;result.familyPaymentsAvailable=false;}
  for (const row of rows) {
    if (row.posted_at instanceof Date) row.posted_at = row.posted_at.toISOString();
    if (row.date_of_service instanceof Date) row.date_of_service = row.date_of_service.toISOString().slice(0,10);
  }
  await enrichBillingWorkNames(rows,agencyIds,deps);
  const names = new Map(organizations.map(a => [a.id,a.name])), search=String(query.search || '').trim().toLowerCase().slice(0,100);
  if(query.clientId != null && query.clientId !== '' && (!Number.isSafeInteger(Number(query.clientId)) || Number(query.clientId)<1)) throw Object.assign(new Error('Invalid client filter.'),{status:400});
  rows=rows.filter(row => (!query.clientId || Number(row.client_id)===Number(query.clientId)) && (!search || [row.client_name,row.claim_number,row.payer_name,row.kind,row.status,row.claimId,names.get(Number(row.agency_id)),row.provider_name].some(value => String(value || '').toLowerCase().includes(search))));
  const sort=query.sortBy || 'posted_at', direction=query.direction==='asc'?1:-1;
  if(!['organization','posted_at','client_name','claim_number','payer_name','kind','paid_cents','adjustment_cents','responsibility_cents','date_of_service','provider_name','amount_cents','status'].includes(sort)) throw Object.assign(new Error('Invalid transaction sort column.'),{status:400});
  rows.sort((a,b) => { const av=sort==='organization'?names.get(Number(a.agency_id)):a[sort],bv=sort==='organization'?names.get(Number(b.agency_id)):b[sort];return (sort.endsWith('_cents')?Number(av)-Number(bv):String(av || '').localeCompare(String(bv || ''),undefined,{numeric:true,sensitivity:'base'}))*direction || String(b.id).localeCompare(String(a.id),undefined,{numeric:true}); });
  result.total=rows.length;result.transactions=rows.slice((result.page-1)*result.pageSize,result.page*result.pageSize);return result;
}
