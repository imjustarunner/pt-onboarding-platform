import { parseTransactionFilters, transactionMatches, transactionFilterOptions, includesDemoBilling, syntheticBillingRow } from './billingTransactionFilters.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { attachClaimReferences } from './clinicalClaimReferences.service.js';
import { clinicalApprovalFields, clinicalApprovalJoins } from './billingClinicalApproval.service.js';
import { loadBillingWorkItems, filterBillingWorkItems, enrichBillingWorkNames, billingWorkStage } from './billingWorkItems.service.js';
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
    result.hiddenTestRecords = includesDemoBilling(query) ? 0 : work.items.filter(row=>syntheticBillingRow(row)&&(requested===null||Number(row.agency_id)===requested)&&(!query.clientId||Number(row.client_id)===Number(query.clientId))).length;
    workItems = includesDemoBilling(query) ? work.items : work.items.filter(row => !syntheticBillingRow(row));
    result.capabilities.drafts = work.draftsAvailable;
    result.capabilities.appointmentHistory = work.appointmentsAvailable;
  } catch (e) { if (!missingSchema(e)) throw e; result.capabilities.claims = false; }
  try {
    [enrollments] = await deps.clinical.execute(`SELECT agency_id, connection_id, billing_office_location_id, provider_npi, payer_id, enrollment_type, status, last_event_at
      FROM claimmd_enrollments WHERE agency_id IN (${allMarks})`, allIds);
  } catch (e) { if (!missingSchema(e)) throw e; result.capabilities.enrollments = false; }
  try {
    [payments] = await deps.clinical.execute(`SELECT p.agency_id,c.client_id,COUNT(*) AS posting_count,SUM(p.paid_cents) AS paid_cents FROM claimmd_payment_postings p LEFT JOIN clinical_claims c ON c.id=p.clinical_claim_id AND c.agency_id=p.agency_id WHERE p.agency_id IN (${allMarks}) GROUP BY p.agency_id,c.client_id`,allIds);
    await enrichBillingWorkNames(payments,allIds,deps);
  } catch(e) { if(!missingSchema(e))throw e;result.capabilities.paymentPosting=false; }
  for (const organization of organizations) {
    const payment=payments.filter(p=>Number(p.agency_id)===organization.id&&(includesDemoBilling(query)||!syntheticBillingRow(p))).reduce((total,row)=>({posting_count:total.posting_count+Number(row.posting_count||0),paid_cents:total.paid_cents+Number(row.paid_cents||0)}),{posting_count:0,paid_cents:0});
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

async function attachTransactionClinicalContext(rows, agencyIds, deps) {
  const claimIds = [...new Set(rows.map(row => Number(row.claimId)).filter(Boolean))];
  const sessions = [...new Set(rows.filter(row => ['clinical_self_pay','clinical_copay'].includes(row.source_type) && /^\d+$/.test(String(row.source_key))).map(row => Number(row.source_key)))];
  const claims = new Map(), context = new Map();
  for (let offset=0;offset<claimIds.length;offset+=500) {
    const ids=claimIds.slice(offset,offset+500);
    const [found] = await deps.clinical.execute(`SELECT c.id AS claimId,c.agency_id,c.client_id,c.claim_number,c.destination_payer_id,c.payer_name,c.claim_lifecycle,c.date_of_service,c.clinical_session_id,s.provider_user_id,s.service_code,${clinicalApprovalFields},
      (SELECT JSON_ARRAYAGG(l.procedure_code) FROM clinical_claim_lines l WHERE l.clinical_claim_id=c.id) AS service_codes_json
      FROM clinical_claims c LEFT JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id
      LEFT JOIN clinical_notes n ON n.id=c.clinical_note_id AND n.agency_id=c.agency_id ${clinicalApprovalJoins}
      WHERE c.agency_id IN (${agencyIds.map(()=>'?').join(',')}) AND c.id IN (${ids.map(()=>'?').join(',')})`,[...agencyIds,...ids]);
    for (const claim of found) {
      let codes=claim.service_codes_json;try { if(typeof codes==='string')codes=JSON.parse(codes); } catch { codes=[]; }
      claims.set(`${claim.agency_id}:${claim.claimId}`,{claim_number:claim.claim_number,destination_payer_id:claim.destination_payer_id,payer_name:claim.payer_name,claim_lifecycle:claim.claim_lifecycle,claim_stage:billingWorkStage(claim),date_of_service:claim.date_of_service,provider_user_id:claim.provider_user_id,service_code:claim.service_code,service_codes:Array.isArray(codes)?codes:[claim.service_code].filter(Boolean),client_id:claim.client_id});
    }
  }
  for(let offset=0;offset<sessions.length;offset+=500) {
    const ids=sessions.slice(offset,offset+500);
    const [found]=await deps.clinical.execute(`SELECT id,agency_id,client_id,provider_user_id,service_code FROM clinical_sessions WHERE agency_id IN (${agencyIds.map(()=>'?').join(',')}) AND id IN (${ids.map(()=>'?').join(',')})`,[...agencyIds,...ids]);
    for(const session of found)context.set(`${session.agency_id}:${session.id}`,session);
  }
  for(const row of rows) {
    const claim=claims.get(`${row.agency_id}:${row.claimId}`),session=context.get(`${row.agency_id}:${row.source_key}`);
    const source=claim||session;
    if(source && Number(source.client_id)===Number(row.client_id)) {
      if(claim)Object.assign(row,claim);
      else Object.assign(row,{provider_user_id:session.provider_user_id,service_code:session.service_code,service_codes:[session.service_code].filter(Boolean)});
    }
  }
  await attachClaimReferences(rows,deps.clinical);
}

export async function billingWorkspaceTransactions(user, query = {}, deps = dependencies) {
  const filters=parseTransactionFilters(query);
  const organizations = await billingWorkspaceAgencies(user, deps);
  const requested = query.agencyId == null || query.agencyId === '' ? null : Number(query.agencyId);
  if (requested !== null && (!Number.isSafeInteger(requested) || !organizations.some(a => a.id === requested))) throw denied();
  const agencyIds = organizations.filter(a => requested === null || a.id === requested).map(a => a.id);
  const result = { organizations, transactions: [], total: 0, page: Math.max(1, Math.min(100000,Number.parseInt(query.page,10) || 1)), pageSize: 30, available: true, dateTimezone:'America/Denver',filterOptions:transactionFilterOptions([]) };
  if (!agencyIds.length) return result;
  let rows;
  try { [rows] = await deps.clinical.execute(`SELECT p.id,p.agency_id,p.clinical_claim_id AS claimId,c.client_id,c.claim_number,c.date_of_service,c.payer_name,p.kind,p.paid_cents,p.adjustment_cents,p.responsibility_cents,p.reverses_posting_id,p.posted_at,p.posted_by_user_id
    FROM claimmd_payment_postings p LEFT JOIN clinical_claims c ON c.id=p.clinical_claim_id AND c.agency_id=p.agency_id
    WHERE p.agency_id IN (${agencyIds.map(() => '?').join(',')})`,agencyIds); }
  catch(error) { if(!missingSchema(error)) throw error; result.available=false; return result; }
  rows=rows.map(row=>({...row,id:`payer:${row.id}`,source:'payer',amount_cents:Number(row.paid_cents),status:'posted'}));
  try {
    const [payments]=await deps.main.execute(`SELECT p.id,p.agency_id,r.client_id,r.service_date AS date_of_service,r.source_type,r.source_key,r.hold_reason AS source_hold_reason,p.processor,p.status,p.amount_cents,p.receipt_number,COALESCE(p.received_at,p.created_at) AS posted_at,p.created_by_user_id AS posted_by_user_id,
      CASE WHEN r.source_type='claim_responsibility' AND r.source_key REGEXP '^[0-9]+$' THEN CAST(r.source_key AS UNSIGNED) ELSE NULL END AS claimId
      FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id AND a.agency_id=p.agency_id JOIN family_receivables r ON r.id=a.receivable_id AND r.agency_id=p.agency_id
      WHERE p.agency_id IN (${agencyIds.map(()=>'?').join(',')})`,agencyIds);
    for(const payment of payments)rows.push({...payment,id:`payment:${payment.id}`,source:'family_payment',kind:`${String(payment.processor).toLowerCase()}_payment`,paid_cents:payment.status==='succeeded'?Number(payment.amount_cents):0,adjustment_cents:0,responsibility_cents:0});
    const [refunds]=await deps.main.execute(`SELECT f.id,f.agency_id,r.client_id,r.service_date AS date_of_service,r.source_type,r.source_key,r.hold_reason AS source_hold_reason,f.status,f.amount_cents,p.receipt_number,COALESCE(f.completed_at,f.created_at) AS posted_at,f.created_by_user_id AS posted_by_user_id,f.payment_id,
      CASE WHEN r.source_type='claim_responsibility' AND r.source_key REGEXP '^[0-9]+$' THEN CAST(r.source_key AS UNSIGNED) ELSE NULL END AS claimId
      FROM family_payment_refunds f JOIN family_ledger_payments p ON p.id=f.payment_id AND p.agency_id=f.agency_id JOIN family_receivable_allocations a ON a.id=p.allocation_id AND a.agency_id=p.agency_id JOIN family_receivables r ON r.id=a.receivable_id AND r.agency_id=p.agency_id
      WHERE f.agency_id IN (${agencyIds.map(()=>'?').join(',')})`,agencyIds);
    for(const refund of refunds)rows.push({...refund,id:`refund:${refund.id}`,source:'family_refund',kind:'refund',amount_cents:-Number(refund.amount_cents),paid_cents:refund.status==='succeeded'?-Number(refund.amount_cents):0,adjustment_cents:0,responsibility_cents:0});
    result.familyPaymentsAvailable=true;
  }catch(error){if(!missingSchema(error))throw error;result.familyPaymentsAvailable=false;}
  await attachTransactionClinicalContext(rows,agencyIds,deps);
  for (const row of rows) {
    if(row.posted_at) {
      const instant=row.posted_at instanceof Date?row.posted_at:new Date(String(row.posted_at).replace(' ','T').replace(/Z?$/, 'Z'));
      if(Number.isFinite(+instant)){row.posted_at=instant.toISOString();row.posted_date=utcDateToZonedYmd(instant,'America/Denver');}
    }
    if (row.date_of_service instanceof Date) row.date_of_service = row.date_of_service.toISOString().slice(0,10);
  }
  await enrichBillingWorkNames(rows,agencyIds,deps);
  for(const row of rows)row.is_demo_source=syntheticBillingRow(row);
  rows=rows.filter(row=>!query.clientId||Number(row.client_id)===Number(query.clientId));
  result.hiddenTestRecords=includesDemoBilling(query)?0:rows.filter(syntheticBillingRow).length;
  rows=rows.filter(row=>includesDemoBilling(query)||!syntheticBillingRow(row));
  result.filterOptions=transactionFilterOptions(rows);
  const names = new Map(organizations.map(a => [a.id,a.name])), search=String(query.search || '').trim().toLowerCase().slice(0,100);
  if(query.clientId != null && query.clientId !== '' && (!Number.isSafeInteger(Number(query.clientId)) || Number(query.clientId)<1)) throw Object.assign(new Error('Invalid client filter.'),{status:400});
  rows=rows.filter(row => transactionMatches(row,filters) && (!search || [row.client_name,row.claim_reference,row.claim_number,row.receipt_number,row.payer_name,row.kind,row.status,row.claimId,names.get(Number(row.agency_id)),row.provider_name,row.posted_by_name,...(row.service_codes||[])].some(value => String(value || '').toLowerCase().includes(search))));
  const sort=query.sortBy || 'posted_at', direction=query.direction==='asc'?1:-1;
  if(!['organization','posted_at','client_name','claim_reference','claim_number','payer_name','kind','paid_cents','adjustment_cents','responsibility_cents','date_of_service','provider_name','posted_by_name','service_code','claim_stage','amount_cents','status'].includes(sort)) throw Object.assign(new Error('Invalid transaction sort column.'),{status:400});
  rows.sort((a,b) => { const av=sort==='organization'?names.get(Number(a.agency_id)):a[sort],bv=sort==='organization'?names.get(Number(b.agency_id)):b[sort];return (sort.endsWith('_cents')?Number(av)-Number(bv):String(av || '').localeCompare(String(bv || ''),undefined,{numeric:true,sensitivity:'base'}))*direction || String(b.id).localeCompare(String(a.id),undefined,{numeric:true}); });
  result.total=rows.length;result.transactions=rows.slice((result.page-1)*result.pageSize,result.page*result.pageSize);return result;
}
