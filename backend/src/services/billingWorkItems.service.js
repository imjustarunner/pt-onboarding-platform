import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { clinicalBillingStage, clinicalApprovalFields, clinicalApprovalJoins } from './billingClinicalApproval.service.js';

const object = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : null;
const encounterDate = row => { const raw = row.scheduled_start_at; if (!raw) return null; const instant = raw instanceof Date ? raw : new Date(String(raw).replace(' ', 'T').replace(/Z?$/, 'Z')); return utcDateToZonedYmd(instant, row.source_timezone || 'America/Denver'); };
const missing = error => ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
const labels = { note_needed: 'Note Needed', draft: 'Draft', pending_review: 'Pending Review', revisions_needed: 'Revisions Needed', ready_to_submit: 'Ready to submit', submitted: 'Submitted', processing: 'Processing', paid: 'Paid', denied: 'Denied', on_hold: 'On hold', closed: 'Closed' };
const marks = values => values.map(() => '?').join(',');
const stageAliases = { ready: 'ready_to_submit', rejected: 'on_hold', in_progress: 'processing' };

export function billingWorkStage(row) {
  const lifecycle = String(row.claim_lifecycle || '').toLowerCase();
  if (['void', 'voided', 'closed'].includes(lifecycle)) return 'closed';
  if (lifecycle === 'paid') return 'paid';
  if (lifecycle === 'denied') return 'denied';
  if (['submitted', 'accepted'].includes(lifecycle)) return 'submitted';
  if (['queued', 'processing', 'pending_payer', 'adjusted'].includes(lifecycle)) return 'processing';
  if (['rejected', 'on_hold', 'held', 'reconciliation_required'].includes(lifecycle) || Number(row.service_change_pending)) return 'on_hold';
  const clinicalStage = clinicalBillingStage(row);
  if (clinicalStage) return clinicalStage;
  if (row.claimId && lifecycle === 'ready') return 'ready_to_submit';
  return 'note_needed';
}

export function normalizeBillingWorkItem(row) {
  const context = object(row.encounter_context_json), metadata = object(row.claim_metadata_json);
  const codes = object(row.diagnosis_codes_json);
  const lines = object(row.claim_lines_json);
  if (Array.isArray(lines)) lines.sort((a,b) => Number(a.lineNumber || 0)-Number(b.lineNumber || 0));
  const primaryLine = Array.isArray(lines) ? lines[0] : null;
  const item = { ...row, claimId: id(row.claimId), id: id(row.claimId), agency_id: id(row.agency_id), client_id: id(row.client_id),
    clinical_note_id: id(row.clinical_note_id), clinical_session_id: id(row.clinical_session_id), draft_id: id(row.draft_id),
    date_of_service: date(row.date_of_service || context.dateOfService || row.service_date) || encounterDate(row),
    service_code: primaryLine?.procedureCode || context.serviceCode || row.service_code || null,
    units: primaryLine?.units ?? context.billingPrimaryUnits ?? row.units ?? null,
    place_of_service: row.place_of_service || context.placeOfService || null,
    diagnosis_codes: Array.isArray(codes) ? codes : [], service_lines: Array.isArray(lines) ? lines : [],
    provider_user_id: id(row.provider_user_id),
    billing_provider_user_id: id(metadata.billingUserId || row.billing_provider_user_id || row.provider_user_id),
    rendering_provider_user_id: id(metadata.renderingUserId || row.provider_user_id),
    supervisor_user_id: id(row.supervisor_user_id),
    amount_cents: row.amount_cents == null ? null : Number(row.amount_cents), currency_code: row.currency_code || 'USD' };
  item.stage = billingWorkStage(item); item.stageLabel = labels[item.stage];
  item.key = row.key || (item.claimId ? `claim:${item.claimId}` : item.clinical_note_id ? `note:${item.clinical_note_id}` : item.draft_id ? `draft:${item.draft_id}` : `session:${item.clinical_session_id}`);
  item.source = item.claimId ? 'claim' : item.clinical_note_id ? 'note' : item.draft_id ? 'draft' : row.source || 'clinical_session';
  item.readOnly = ['note_needed', 'draft', 'pending_review', 'revisions_needed'].includes(item.stage);
  item.canReviewClaim = !!item.claimId && !item.readOnly;
  item.canPrepareClaim = !item.claimId && item.stage === 'ready_to_submit' && !!item.clinical_note_id && !!item.clinical_session_id;
  item.canSubmit = false; // A fresh server review, not a list-row action, authorizes transmission.
  item.resubmission = metadata.resubmission || null;
  item.resubmission_type = metadata.resubmission?.kind || row.resubmission_type || (row.claim_frequency_code === '7' ? 'replacement' : row.claim_frequency_code === '8' ? 'void' : 'original');
  for (const key of ['encounter_context_json', 'claim_metadata_json', 'review_requests_json', 'claim_lines_json', 'diagnosis_codes_json', 'is_billable', 'requires_supervisor_cosign', 'has_original_signature']) delete item[key];
  return item;
}

const noteFields = `${clinicalApprovalFields},
  COALESCE(r.responsible_supervisor_user_id,n.supervisor_cosigned_by_user_id,JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.supervisionPolicyAtSignature.supervisorUserId'))) AS supervisor_user_id,
  JSON_EXTRACT(r.snapshot_json,'$.encounterContext') AS encounter_context_json`;
const versionJoins = clinicalApprovalJoins;

// Claims, authored drafts and documented services share one work queue. A read
// never manufactures a clinical encounter, signature, claim or amount owed.
export async function loadBillingWorkItems(agencyIds, deps) {
  if (!agencyIds.length) return { items: [], draftsAvailable: true, appointmentsAvailable: true };
  const scope = marks(agencyIds);
  const [claims] = await deps.clinical.execute(`SELECT c.id AS claimId,c.agency_id,c.client_id,c.clinical_session_id,c.parent_claim_id,c.payer_sequence,
    c.claim_number,c.billing_revision,c.claim_lifecycle,c.claimmd_last_status,c.amount_cents,c.currency_code,c.date_of_service,c.updated_at,c.payer_name,c.place_of_service,c.billing_npi,c.rendering_npi,
    c.diagnosis_codes_json,c.metadata_json AS claim_metadata_json,s.provider_user_id,s.service_code,${noteFields},
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('procedureCode',l.procedure_code,'units',l.units,'chargeCents',l.charge_cents,'lineNumber',l.line_number)) FROM clinical_claim_lines l WHERE l.clinical_claim_id=c.id) AS claim_lines_json,
    EXISTS(SELECT 1 FROM clinical_claim_change_requests ch WHERE ch.agency_id=c.agency_id AND ch.clinical_session_id=c.clinical_session_id AND ch.status IN ('pending','reconciliation_required')) AS service_change_pending
    FROM clinical_claims c LEFT JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id
    LEFT JOIN clinical_notes n ON n.id=c.clinical_note_id AND n.agency_id=c.agency_id ${versionJoins}
    WHERE c.agency_id IN (${scope}) AND c.is_deleted=0`, agencyIds);
  const [sessions] = await deps.clinical.execute(`SELECT s.id AS clinical_session_id,s.agency_id,s.client_id,s.appointment_id,s.office_event_id,s.provider_user_id,s.service_code,s.place_of_service,s.updated_at,s.scheduled_start_at,s.source_timezone,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.snapshot_json,'$.encounterContext.dateOfService')),JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.dateOfService')),JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json,'$.serviceDate'))) AS date_of_service,
    JSON_EXTRACT(r.snapshot_json,'$.metadataJson.diagnosisCodes') AS diagnosis_codes_json,${noteFields}
    FROM clinical_sessions s LEFT JOIN clinical_notes n ON n.id=(SELECT n2.id FROM clinical_notes n2 WHERE n2.clinical_session_id=s.id AND n2.agency_id=s.agency_id AND n2.is_deleted=0 ORDER BY n2.id DESC LIMIT 1)
    ${versionJoins}
    WHERE s.agency_id IN (${scope}) AND s.service_code IS NOT NULL
    AND LOWER(COALESCE(s.encounter_status,'')) NOT IN ('cancelled','canceled','no_show','void','voided','rescheduled')
    AND (n.id IS NOT NULL OR COALESCE(s.scheduled_end_at,s.scheduled_start_at)<UTC_TIMESTAMP())
    AND (n.id IS NULL OR COALESCE(n.note_type,'') NOT IN ('treatment_plan','discharge_summary','treatment_summary'))
    AND NOT EXISTS(SELECT 1 FROM clinical_claims c WHERE c.agency_id=s.agency_id AND c.clinical_session_id=s.id AND c.is_deleted=0)`, agencyIds);
  let drafts = [], appointments = [], draftsAvailable = true, appointmentsAvailable = true;
  try { [drafts] = await deps.main.execute(`SELECT d.id AS draft_id,d.agency_id,d.client_id,d.user_id AS provider_user_id,d.clinical_session_id,d.office_event_id,d.service_code,d.date_of_service,d.updated_at
    FROM clinical_note_drafts d LEFT JOIN clients c ON c.id=d.client_id AND c.agency_id=d.agency_id
    WHERE d.agency_id IN (${scope}) AND d.archived_at IS NULL AND (d.client_id IS NULL OR c.id IS NOT NULL)`, agencyIds); }
  catch (error) { if (!missing(error)) throw error; draftsAvailable = false; }
  try { [appointments] = await deps.main.execute(`SELECT a.id AS appointment_id,a.agency_id,ap.client_id,a.clinical_session_id,a.office_event_id,a.provider_user_id,a.service_code,a.start_at AS scheduled_start_at,a.source_timezone,a.updated_at
    FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.role='client' JOIN clients c ON c.id=ap.client_id AND c.agency_id=a.agency_id
    WHERE a.agency_id IN (${scope}) AND a.service_code IS NOT NULL AND COALESCE(a.end_at,a.start_at)<UTC_TIMESTAMP()
    AND LOWER(COALESCE(a.status,'')) NOT IN ('cancelled','canceled','no_show','void','voided','rescheduled')`, agencyIds); }
  catch (error) { if (!missing(error)) throw error; appointmentsAvailable = false; }
  const sameEncounter = (a, b) => Number(a.agency_id) === Number(b.agency_id) && Number(a.client_id) === Number(b.client_id) &&
    ((id(a.clinical_session_id) && Number(a.clinical_session_id) === Number(b.clinical_session_id)) || (id(a.office_event_id) && Number(a.office_event_id) === Number(b.office_event_id)) || (id(a.appointment_id) && Number(a.appointment_id) === Number(b.appointment_id)));
  const rows = [...claims, ...sessions];
  for (const draft of drafts) {
    const existing = rows.find(row => sameEncounter(row, draft));
    if (existing) { if (!existing.provider_signed_at && !existing.claimId) existing.draft_id = draft.draft_id; continue; }
    rows.push(draft);
  }
  for (const appointment of appointments) {
    if (rows.some(row => sameEncounter(row, appointment))) continue;
    rows.push({ ...appointment, key: `appointment:${appointment.appointment_id}:${appointment.client_id}`, source: 'appointment' });
  }
  const items = rows.map(normalizeBillingWorkItem);
  await enrichBillingWorkNames(items, agencyIds, deps);
  return { items, draftsAvailable, appointmentsAvailable };
}

export async function enrichBillingWorkNames(items, agencyIds, deps) {
  const clientIds = [...new Set(items.map(row => row.client_id).filter(Boolean))];
  const userIds = [...new Set(items.flatMap(row => [row.provider_user_id, row.billing_provider_user_id, row.rendering_provider_user_id, row.supervisor_user_id]).filter(Boolean))];
  const clients = new Map(), users = new Map();
  for (let start = 0; start < clientIds.length; start += 500) {
    const batch = clientIds.slice(start, start + 500);
    const [rows] = await deps.main.execute(`SELECT id,agency_id,full_name,initials,billing_insurance_payload FROM clients WHERE agency_id IN (${marks(agencyIds)}) AND id IN (${marks(batch)})`, [...agencyIds, ...batch]);
    for (const client of rows) clients.set(`${client.agency_id}:${client.id}`, client);
  }
  for (let start = 0; start < userIds.length; start += 500) {
    const batch = userIds.slice(start, start + 500);
    const [rows] = await deps.main.execute(`SELECT id,CONCAT_WS(' ',first_name,last_name) AS name FROM users WHERE id IN (${marks(batch)})`, batch);
    for (const user of rows) users.set(Number(user.id), user.name);
  }
  for (const row of items) {
    const client = clients.get(`${row.agency_id}:${row.client_id}`);
    row.client_name = client?.full_name || client?.initials || (row.client_id ? `Client #${row.client_id}` : 'Client not linked');
    for (const type of ['provider', 'billing_provider', 'rendering_provider', 'supervisor']) row[`${type}_name`] = users.get(row[`${type}_user_id`]) || null;
    if (!row.payer_name && client?.billing_insurance_payload) {
      try { row.payer_name = decryptFamilyBilling(client.billing_insurance_payload, `client-insurance:${row.agency_id}:${row.client_id}`)?.primary?.insurerName || null; }
      catch { row.insuranceUnavailable = true; }
    }
  }
}

export function filterBillingWorkItems(items, query = {}, organizations = []) {
  const status = stageAliases[query.status] || query.status || 'all';
  if (status !== 'all' && status !== 'attention' && !labels[status]) throw Object.assign(new Error('Invalid claim queue filter.'), { status: 400 });
  if (query.clientId != null && query.clientId !== '' && !id(query.clientId)) throw Object.assign(new Error('Invalid client filter.'), { status: 400 });
  const org = new Map(organizations.map(a => [Number(a.id), a.name]));
  const search = String(query.search || '').trim().slice(0, 100).toLowerCase();
  let rows = items.filter(row => (!query.clientId || Number(row.client_id) === Number(query.clientId)) &&
    (status === 'all' || (status === 'attention' ? ['on_hold','denied','revisions_needed','note_needed'].includes(row.stage) : row.stage === status)) &&
    (!search || [row.claim_number,row.claimId,row.client_id,row.client_name,row.provider_name,row.billing_provider_name,row.supervisor_name,row.payer_name,row.service_code,org.get(row.agency_id),...(row.diagnosis_codes || [])].some(value => String(value || '').toLowerCase().includes(search))));
  const allowed = ['organization','date_of_service','client_name','service_code','provider_name','billing_provider_name','supervisor_name','payer_name','amount_cents','place_of_service','diagnosis_codes','units','stage'];
  const sort = query.sortBy || 'date_of_service', direction = query.direction === 'asc' ? 1 : -1;
  if (!allowed.includes(sort)) throw Object.assign(new Error('Invalid claim sort column.'), { status: 400 });
  rows.sort((a,b) => {
    const av = sort === 'organization' ? org.get(a.agency_id) : a[sort], bv = sort === 'organization' ? org.get(b.agency_id) : b[sort];
    if (av == null && bv != null) return 1; if (bv == null && av != null) return -1;
    const comparison = ['amount_cents','units'].includes(sort) ? Number(av || 0)-Number(bv || 0) : String(av || '').localeCompare(String(bv || ''), undefined, { numeric: true, sensitivity: 'base' });
    return comparison * direction || a.key.localeCompare(b.key);
  });
  return rows;
}
