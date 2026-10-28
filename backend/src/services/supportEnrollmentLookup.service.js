import { decryptIntakeSubmissionRow } from './intakeResponsesEncryption.service.js';

const parse = (value, fallback = {}) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { throw new Error('Unreadable intake data'); }
};
const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stamp = value => value instanceof Date ? value.toISOString()
  : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value || '')) ? `${value.replace(' ', 'T')}Z` : value || null;
const fullName = child => child?.fullName || child?.full_name || [child?.firstName || child?.first_name, child?.lastName || child?.last_name].filter(Boolean).join(' ');
const containsName = (haystack, needle) => !!needle && (` ${normalize(haystack)} `).includes(` ${normalize(needle)} `);

export function isEnrollmentStatusRequest(context) {
  const body = String(context.latestInbound?.body || '');
  return /\b(?:intake|enroll?ment|enrolllment|packet|paperwork)\b/i.test(`${context.original?.subject || ''} ${body}`)
    && /\b(?:receiv\w*|submitt?\w*|start\w*|stuck|status|stop\w*|terminat\w*|filled|filling|finish\w*|complet\w*|qr\s*code|end intake|end this intake|went through|go through)\b/i.test(body);
}

// References are search hints, never identity proof. A one-word or surname-only
// reference remains a candidate even if only one saved form happens to match.
export function enrollmentReferences(context) {
  const body = String(context.latestInbound?.body || '').split(/CONFIDENTIAL|\n(?:Best|Thanks|Regards)[,!]?\s*\n/i)[0].replace(/\s+/g, ' ');
  const refs = [];
  const patterns = [
    /\b(?:first\s+name|last\s+name|surname|named|child(?:'s|’s)? name(?: is)?|student(?:'s|’s)? name(?: is)?)\s*[:=]?\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,3})/gu,
    /\b(?:intake|enrollment|packet|paperwork)(?:\s+packet)?\s+(?:submitted\s+)?for\s+([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,3})/gu,
    /\b(?:child|kiddo|student|client)\s+([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,3})/gu
  ];
  for (const pattern of patterns) for (const m of body.matchAll(pattern)) refs.push(m[1]);
  for (const ref of context.unconfirmedReferences || []) if (containsName(body, ref)) refs.push(ref);
  return [...new Set(refs.map(normalize).filter(ref => ref && !/^(?:a|an|the|mom|parent|guardian|child|kiddo|student|client|this|that|first|last)$/.test(ref)))].slice(0, 8);
}

function describeSubmission(row, data, childRows, documents, steps) {
  const snapshot = data.progressSnapshot || {};
  const stepId = snapshot.currentFlowStepId;
  const step = steps.find(s => s.id === stepId);
  const ended = !row.session_token && !!row.reminder_opt_out_at && row.status !== 'submitted';
  const submitted = row.status === 'submitted' && !!row.submitted_at;
  const packetCount = childRows.filter(c => c.bundle_pdf_path).length;
  const childCount = (data.clients || snapshot.clients || []).length;
  const packetNeedsReview = data.packetGeneration?.status === 'needs_review'
    || (submitted && !row.combined_pdf_path && (!packetCount || packetCount < childCount));
  return {
    submissionId: Number(row.id), language: row.language_code || 'unknown',
    formType: row.form_type, source: 'Digital enrollment records for this school',
    status: submitted ? (packetNeedsReview ? 'submitted_packet_needs_review' : 'submitted')
      : row.status === 'submitted' || row.submitted_at ? 'submission_state_needs_review'
        : ended ? 'ended_without_submission' : 'saved_not_submitted',
    startedAt: stamp(row.created_at), lastSavedAt: stamp(snapshot.savedAt || row.updated_at),
    submittedAt: stamp(row.submitted_at), sessionEndedAt: ended ? stamp(row.reminder_opt_out_at) : null,
    resumeAvailable: !!row.session_token && (!row.draft_expires_at || new Date(stamp(row.draft_expires_at)) > new Date()),
    remindersStopped: !!row.reminder_opt_out_at,
    packetAvailable: !!row.combined_pdf_path || packetCount > 0,
    signedDocumentCount: documents.filter(d => d.signed_at && d.signed_pdf_path).length,
    lastSavedStep: step ? String(step.label || step.title || step.type).slice(0, 160) : null,
    // Step ids/counts alone cannot tell us which required fields are missing.
    savedStepKnown: !!step,
    clientRecordLinked: !!row.client_id || childRows.some(c => c.client_id)
  };
}

/** Read only. Tenant/school scope precedes decryption; never return answers,
 * guardian contact details, signatures, or session credentials to the model. */
export async function lookupSupportEnrollment(context, dependencies = {}) {
  if (!isEnrollmentStatusRequest(context)) return null;
  const agencyId = Number(context.agencyId), schoolId = Number(context.schoolOrganizationId);
  const references = enrollmentReferences(context);
  const result = { status: 'unavailable', references, scope: 'this_school_digital_enrollment',
    coverage: 'incomplete', records: [], knownClientFound: false, clientRecords: [],
    limitation: 'Digital records do not establish receipt or nonreceipt by email, fax, or paper.' };
  if (!agencyId || !schoolId) return { ...result, reason: 'school_scope_unavailable' };
  const db = dependencies.database || (await import('../config/database.js')).default;
  try {
    const [[scope]] = await db.execute(`SELECT 1 AS allowed FROM organization_affiliations
      WHERE agency_id=? AND organization_id=? AND is_active=1 LIMIT 1`, [agencyId, schoolId]);
    if (!scope) return { ...result, reason: 'school_scope_unavailable' };
    const [clients] = await db.execute(`SELECT c.id,c.full_name,c.initials,c.identifier_code,c.document_status
      FROM clients c WHERE c.agency_id=? AND (c.organization_id=? OR EXISTS
      (SELECT 1 FROM client_organization_assignments coa WHERE coa.client_id=c.id AND coa.organization_id=? AND coa.is_active=1))
      ORDER BY c.id DESC LIMIT 501`, [agencyId, schoolId, schoolId]);
    const [rows] = await db.execute(`SELECT s.*,il.language_code,il.form_type,il.intake_steps
      FROM intake_submissions s JOIN intake_links il ON il.id=s.intake_link_id
      WHERE il.form_type IN ('intake','smart_school_roi','smart_disclosure') AND
      (il.organization_id=? OR (il.organization_id=? AND s.school_organization_id=?))
      ORDER BY s.id DESC LIMIT 501`, [schoolId, agencyId, schoolId]);
    let complete = clients.length <= 500 && rows.length <= 500;
    const linkedClient = clients.find(c => Number(c.id) === Number(context.linkedClientId));
    // A follow-up can ask about a different child than the ticket's old link.
    const linkedId = linkedClient && (!references.length || references.some(ref => containsName(linkedClient.full_name, ref)))
      ? Number(linkedClient.id) : null;
    const body = context.latestInbound.body;
    const matches = (name, clientId) => {
      const n = normalize(name);
      if (linkedId && Number(clientId) === linkedId) return 'linked_client';
      if (n.split(' ').length >= 2 && containsName(body, n)) return 'full_name';
      return references.some(ref => containsName(n, ref)) ? 'partial_name' : null;
    };
    const clientMatches = clients.slice(0, 500).filter(c => matches(c.full_name, c.id) || references.some(ref => normalize(c.identifier_code) === ref));
    result.knownClientFound = clientMatches.length > 0;
    result.clientRecords = clientMatches.map(c => ({ clientId: Number(c.id),
      match: ['linked_client', 'full_name'].includes(matches(c.full_name, c.id)) && clientMatches.length === 1 ? 'verified' : 'possible',
      documentStatus: c.document_status || 'unknown', source: 'Current school client record; not proof of a digital submission' }));
    const submissionIds = rows.slice(0, 500).map(r => Number(r.id));
    const [children] = submissionIds.length ? await db.execute(`SELECT intake_submission_id,client_id,bundle_pdf_path
      FROM intake_submission_clients WHERE intake_submission_id IN (${submissionIds.map(() => '?').join(',')})`, submissionIds) : [[]];
    const identities = new Set();
    const candidates = [];
    const decrypt = dependencies.decryptSubmission || decryptIntakeSubmissionRow;
    for (const raw of rows.slice(0, 500)) {
      let row, data;
      try { row = decrypt({ ...raw }); data = parse(row.intake_data); }
      catch { complete = false; continue; }
      const savedChildren = data.clients?.length ? data.clients : data.progressSnapshot?.clients || [];
      const matchedChildren = savedChildren.map(child => ({ name: fullName(child), strength: matches(fullName(child), null) })).filter(c => c.strength);
      const linkedRow = linkedId && clients.some(c => Number(c.id) === linkedId)
        && (Number(row.client_id) === linkedId || children.some(c => Number(c.intake_submission_id) === Number(row.id) && Number(c.client_id) === linkedId));
      if (!matchedChildren.length && !linkedRow) continue;
      // Partial name + two siblings, or conflicting full-name identities, cannot
      // become a verified child just because there is only one submission row.
      for (const child of matchedChildren) identities.add(`${normalize(child.name)}:${normalize(row.signer_email || row.signer_name || fullName(data.guardian))}`);
      if (linkedRow && !matchedChildren.length) identities.add(`${normalize(linkedClient.full_name)}:${normalize(row.signer_email || row.signer_name || fullName(data.guardian))}`);
      candidates.push({ row, data, strength: linkedRow ? 'linked_client'
        : matchedChildren.every(c => c.strength === 'full_name') ? 'full_name' : 'partial_name' });
    }
    result.coverage = complete ? 'complete' : 'incomplete';
    if (!candidates.length) return { ...result,
      status: complete ? (references.length || linkedId ? 'no_match' : 'identity_needed') : 'unavailable',
      reason: complete ? null : 'lookup_incomplete' };
    const ids = candidates.map(c => Number(c.row.id));
    const marks = ids.map(() => '?').join(',');
    const [[documents], [masters], [notifications]] = await Promise.all([
      db.execute(`SELECT intake_submission_id,signed_at,signed_pdf_path FROM intake_submission_documents WHERE intake_submission_id IN (${marks})`, ids),
      db.execute('SELECT language_code,intake_steps FROM agency_school_intake_masters WHERE agency_id=?', [agencyId]),
      db.execute(`SELECT id,delivery_status,sent_at,template_type,
        JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.intakeSubmissionId')) AS submission_id
        FROM user_communications WHERE agency_id=?
        AND template_type LIKE 'enrollment_unfinished_reminder%'
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.intakeSubmissionId')) IN (${marks})
        ORDER BY id DESC`, [agencyId, ...ids.map(String)])
    ]);
    result.records = candidates.map(({ row, data }) => describeSubmission(row, data,
      children.filter(c => Number(c.intake_submission_id) === Number(row.id)),
      documents.filter(d => Number(d.intake_submission_id) === Number(row.id)),
      [...parse(row.intake_steps, []), ...parse(masters.find(m => m.language_code === row.language_code)?.intake_steps, [])]));
    for (const record of result.records) record.notifications = notifications
      .filter(n => Number(n.submission_id) === record.submissionId)
      .map(n => ({ communicationId: Number(n.id), status: n.delivery_status, sentAt: stamp(n.sent_at),
        kind: n.template_type.endsWith('_manual') ? 'support_recovery_email' : 'automatic_reminder' }));
    result.status = complete && candidates.every(c => c.strength === 'linked_client' || c.strength === 'full_name') && identities.size <= 1
      ? 'verified_match' : 'possible_match';
    if (!complete) result.reason = 'lookup_incomplete';
    return result;
  } catch {
    return { ...result, status: 'unavailable', coverage: 'incomplete', records: [], reason: 'lookup_failed' };
  }
}
