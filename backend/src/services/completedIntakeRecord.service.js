/**
 * Family-facing completed intake record.
 *
 * First principles: one branded HTML document is the record the family views,
 * prints, and downloads. It is built from the submission itself — answers in
 * form order, nested values (not dropped), signature images, approvals, and
 * ESIGN certificate fields. It does not wait on merged legal-form PDFs.
 */
import {
  resolveIntakeFieldLabel,
  resolveIntakeFormLocale,
  resolveOptionLabel
} from '../utils/intakeFieldLabels.js';
import { matchesShowIf } from '../utils/intakeShowIf.js';

const SECRET_KEY = /password|preview|card_number|cvc|cvv|ssn|secret|signaturedata|dataurl|token/i;
const PHOTO_KEY = /photo|image|front|back|preview/i;
const IDENTITY_KEYS = new Set([
  'firstName', 'lastName', 'middleName', 'email', 'phone', 'phoneNumber',
  'first_name', 'last_name', 'middle_name', 'email_address', 'phone_number',
  'guardianFirstName', 'guardianLastName', 'guardianEmail', 'guardianPhone'
]);

const ESIGN_STATEMENT =
  'This document was electronically signed in compliance with the Electronic Signatures in Global and National Commerce Act (ESIGN Act), 15 U.S.C. § 7001 et seq. The signer consented to conduct this transaction electronically and was provided the required disclosures.';

export function parseMaybeJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function normalizeIntakeDataShape(intakeData) {
  if (!intakeData || typeof intakeData !== 'object') return intakeData || {};
  const flatSubmission = (intakeData.submission && typeof intakeData.submission === 'object' && !Array.isArray(intakeData.submission))
    ? intakeData.submission
    : null;
  const flatGuardianResp = (intakeData.guardianResponses && typeof intakeData.guardianResponses === 'object')
    ? intakeData.guardianResponses
    : null;
  const existingResponses = (intakeData.responses && typeof intakeData.responses === 'object')
    ? intakeData.responses
    : null;
  const mergedSubmission = (existingResponses?.submission && typeof existingResponses.submission === 'object')
    ? { ...(flatSubmission || {}), ...existingResponses.submission }
    : (flatSubmission || {});
  const mergedGuardianResponses = (existingResponses?.guardian && typeof existingResponses.guardian === 'object')
    ? { ...(flatGuardianResp || {}), ...existingResponses.guardian }
    : (flatGuardianResp || {});
  let mergedClientResponses = null;
  if (Array.isArray(existingResponses?.clients) && existingResponses.clients.length) {
    mergedClientResponses = existingResponses.clients;
  } else if (Array.isArray(intakeData.clients)) {
    mergedClientResponses = intakeData.clients.map((c) => (c && typeof c === 'object' ? c : {}));
  }
  return {
    ...intakeData,
    responses: {
      ...(existingResponses || {}),
      submission: mergedSubmission,
      guardian: mergedGuardianResponses,
      clients: mergedClientResponses || existingResponses?.clients || []
    }
  };
}

function humanizeKey(key) {
  return String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function hasValue(val) {
  if (val == null) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'boolean') return true;
  if (typeof val === 'number') return true;
  if (typeof val === 'string') return val.trim() !== '' && !val.startsWith('data:');
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return true;
}

function isSecretKey(key) {
  return SECRET_KEY.test(String(key || ''));
}

function formatDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
}

function fieldIndex(link) {
  const byKey = new Map();
  const fields = Array.isArray(link?.intake_fields) ? link.intake_fields : [];
  for (const field of fields) {
    if (field?.key) byKey.set(field.key, field);
  }
  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  for (const step of steps) {
    for (const field of step?.fields || []) {
      if (field?.key && !byKey.has(field.key)) byKey.set(field.key, field);
    }
  }
  return byKey;
}

function formatFieldValue(field, value, locale, link) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const options = Array.isArray(field?.options) ? field.options : [];
  const mapOne = (raw) => {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
    const found = options.find((o) =>
      String(o?.value ?? '') === String(raw) || String(o?.label ?? '') === String(raw)
    );
    if (found) return resolveOptionLabel(found, locale, link) || String(found.label || found.value || raw);
    return String(raw).trim();
  };
  if (Array.isArray(value)) {
    if (value.every((item) => item == null || typeof item !== 'object')) {
      return value.map(mapOne).filter(Boolean).join(', ');
    }
    return '';
  }
  if (value && typeof value === 'object') return '';
  return mapOne(value);
}

function pushRow(rows, label, value) {
  const text = String(value || '').trim();
  if (!label || !text) return;
  rows.push({ label: String(label).trim(), value: text.length > 4000 ? `${text.slice(0, 3997)}…` : text });
}

function walkBag(bag, { byKey, locale, link, prefix = '', skipKeys = new Set() }, rows, printed) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return;
  for (const [key, raw] of Object.entries(bag)) {
    if (!key || skipKeys.has(key) || isSecretKey(key) || printed.has(key)) continue;
    if (PHOTO_KEY.test(key) && typeof raw === 'string' && raw.startsWith('data:')) continue;
    const field = byKey.get(key);
    const label = [prefix, field ? (resolveIntakeFieldLabel(field, locale, link) || humanizeKey(key)) : humanizeKey(key)]
      .filter(Boolean)
      .join(' · ');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      walkBag(raw, { byKey, locale, link, prefix: label, skipKeys }, rows, printed);
      printed.add(key);
      continue;
    }
    if (Array.isArray(raw) && raw.some((item) => item && typeof item === 'object')) {
      raw.forEach((item, index) => {
        if (item && typeof item === 'object') {
          walkBag(item, { byKey, locale, link, prefix: `${label} ${index + 1}`, skipKeys }, rows, printed);
        }
      });
      printed.add(key);
      continue;
    }
    const rendered = field ? formatFieldValue(field, raw, locale, link) : formatFieldValue(null, raw, locale, link);
    if (!hasValue(rendered) && rendered !== 'Yes' && rendered !== 'No') continue;
    pushRow(rows, label, rendered);
    printed.add(key);
  }
}

function rowsFromInterview(link, values, locale, printed) {
  const sections = [];
  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  for (const step of steps) {
    const type = String(step?.type || '').toLowerCase();
    if (type !== 'questions' && type !== 'clinical_questions') continue;
    const rows = [];
    for (const field of step.fields || []) {
      if (!field?.key || field.type === 'info') continue;
      if (!matchesShowIf(field.showIf, values)) continue;
      const value = values[field.key];
      if (!hasValue(value) && value !== false && value !== 0) continue;
      const rendered = formatFieldValue(field, value, locale, link);
      if (!rendered) continue;
      const label = resolveIntakeFieldLabel(field, locale, link) || humanizeKey(field.key);
      pushRow(rows, label, rendered);
      printed.add(field.key);
    }
    if (rows.length) {
      sections.push({ title: String(step.label || 'Questions').trim() || 'Questions', rows });
    }
  }
  return sections;
}

function signatureImage(trail) {
  const raw = trail?.signatureData || trail?.signature_data || trail?.signatureImage || '';
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.startsWith('data:image/')) return text;
  if (/^[A-Za-z0-9+/=]+$/.test(text.slice(0, 80)) && text.length > 80) {
    return `data:image/png;base64,${text}`;
  }
  return '';
}

function buildSignatures(signedDocuments = []) {
  return (signedDocuments || []).map((doc, index) => {
    const trail = parseMaybeJson(doc?.audit_trail, {});
    return {
      documentName: String(doc?.document_template_name || trail?.documentName || `Signed document ${index + 1}`).trim(),
      signedAt: formatDateTime(doc?.signed_at || trail?.submittedAt || trail?.signedAt),
      hash: String(doc?.pdf_hash || '').trim(),
      imageDataUrl: signatureImage(trail)
    };
  }).filter((row) => row.documentName);
}

function buildApprovals(intakeData = {}) {
  const blocks = [];
  const approval = intakeData?.approval;
  if (approval && (approval.staffLastName || approval.clientFirstName || approval.mode || approval.approvedAt)) {
    blocks.push({
      title: 'Staff-assisted approval',
      rows: [
        approval.mode ? { label: 'Mode', value: String(approval.mode) } : null,
        approval.staffLastName ? { label: 'Staff last name', value: String(approval.staffLastName) } : null,
        approval.clientFirstName ? { label: 'Client first name', value: String(approval.clientFirstName) } : null,
        approval.approvedAt ? { label: 'Approved at', value: formatDateTime(approval.approvedAt) } : null
      ].filter(Boolean)
    });
  }
  const multi = intakeData?.multiClientSignatureConsent;
  if (multi?.accepted) {
    blocks.push({
      title: 'Multi-child signature consent',
      rows: [
        { label: 'Agreement', value: 'The same signatures and releases apply to every dependent on this packet.' },
        multi.acceptedAt ? { label: 'Accepted at', value: formatDateTime(multi.acceptedAt) } : null,
        multi.clientCount ? { label: 'Dependents', value: String(multi.clientCount) } : null
      ].filter(Boolean)
    });
  }
  const acks = Array.isArray(intakeData?.acknowledgments)
    ? intakeData.acknowledgments
    : (Array.isArray(intakeData?.responses?.submission?.acknowledgments)
      ? intakeData.responses.submission.acknowledgments
      : []);
  const ackLines = acks.map((line) => String(line || '').trim()).filter(Boolean);
  if (ackLines.length) {
    blocks.push({
      title: 'Acknowledgments',
      rows: ackLines.map((line) => ({ label: 'Acknowledged', value: line }))
    });
  }
  return blocks;
}

function agencyDisplayName(agency) {
  return String(agency?.official_name || agency?.name || '').trim();
}

/**
 * Build the family record spec used for both HTML view and PDF download.
 */
export function buildCompletedIntakeRecord({
  agency = {},
  link = {},
  submission = {},
  signedDocuments = [],
  guardian = {},
  clients = []
} = {}) {
  const intakeData = normalizeIntakeDataShape(parseMaybeJson(submission?.intake_data, {}));
  const locale = resolveIntakeFormLocale(link, intakeData);
  const byKey = fieldIndex(link);
  const printed = new Set();
  const responses = intakeData.responses || {};
  const guardianBag = responses.guardian && typeof responses.guardian === 'object' ? responses.guardian : {};
  const submissionBag = responses.submission && typeof responses.submission === 'object' ? responses.submission : {};
  const clientBags = Array.isArray(responses.clients) ? responses.clients : [];
  const listedClients = (Array.isArray(clients) && clients.length ? clients : (Array.isArray(intakeData.clients) ? intakeData.clients : clientBags));

  const contactName = [guardian.firstName, guardian.lastName].filter(Boolean).join(' ').trim()
    || [guardianBag.firstName, guardianBag.lastName].filter(Boolean).join(' ').trim()
    || String(submission?.signer_name || '').trim();
  const contactEmail = String(guardian.email || guardianBag.email || submission?.signer_email || '').trim();
  const contactPhone = String(guardian.phone || guardian.phoneNumber || guardianBag.phone || guardianBag.phoneNumber || submission?.signer_phone || '').trim();

  const contactRows = [];
  pushRow(contactRows, 'Name', contactName);
  pushRow(contactRows, 'Email', contactEmail);
  pushRow(contactRows, 'Phone', contactPhone);
  const whoFor = String(submissionBag.whoFor || submissionBag.this_is_for || intakeData.whoFor || '').trim();
  if (whoFor) pushRow(contactRows, 'This is for', humanizeKey(whoFor));
  listedClients.forEach((client, index) => {
    const name = String(client?.fullName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || `Client ${index + 1}`).trim();
    const dob = String(client?.dateOfBirth || client?.date_of_birth || '').trim();
    pushRow(contactRows, listedClients.length > 1 ? `Client ${index + 1}` : 'Client', dob ? `${name} · Date of birth ${dob}` : name);
  });

  const interviewValues = { ...submissionBag, ...guardianBag, ...(clientBags[0] || {}) };
  const interviewSections = rowsFromInterview(link, interviewValues, locale, printed);

  const leftoverGuardian = [];
  walkBag(guardianBag, { byKey, locale, link, skipKeys: IDENTITY_KEYS }, leftoverGuardian, printed);
  const leftoverSubmission = [];
  walkBag(submissionBag, {
    byKey,
    locale,
    link,
    skipKeys: new Set(['whoFor', 'this_is_for', 'formLocale', 'acknowledgments'])
  }, leftoverSubmission, printed);

  const clientSections = clientBags.map((bag, index) => {
    const rows = [];
    const identitySkip = new Set(['firstName', 'lastName', 'middleName', 'fullName', 'dateOfBirth', 'date_of_birth']);
    walkBag(bag, { byKey, locale, link, skipKeys: identitySkip }, rows, new Set(printed));
    const name = String(listedClients[index]?.fullName || `${listedClients[index]?.firstName || ''} ${listedClients[index]?.lastName || ''}`.trim() || `Client ${index + 1}`).trim();
    return rows.length ? { title: listedClients.length > 1 ? `${name} details` : 'Client details', rows } : null;
  }).filter(Boolean);

  const sections = [
    contactRows.length ? { title: 'Who this packet is for', rows: contactRows } : null,
    leftoverGuardian.length ? { title: 'Parent / guardian', rows: leftoverGuardian } : null,
    ...interviewSections,
    leftoverSubmission.length ? { title: 'Additional answers', rows: leftoverSubmission } : null,
    ...clientSections
  ].filter((section) => section && section.rows?.length);

  const signatures = buildSignatures(signedDocuments);
  const approvals = buildApprovals(intakeData);
  const submittedAt = formatDateTime(submission?.submitted_at);
  const esignRows = [
    contactName ? { label: 'Signer', value: contactName } : null,
    contactEmail ? { label: 'Signer email', value: contactEmail } : null,
    submission?.signer_role ? { label: 'Role', value: humanizeKey(submission.signer_role) } : null,
    submission?.consent_given_at ? { label: 'ESIGN consent given', value: formatDateTime(submission.consent_given_at) } : null,
    submittedAt ? { label: 'Submitted', value: submittedAt } : null,
    submission?.ip_address ? { label: 'IP address', value: String(submission.ip_address) } : null,
    submission?.user_agent ? { label: 'Device / browser', value: String(submission.user_agent) } : null,
    submission?.id ? { label: 'Submission ID', value: String(submission.id) } : null,
    signatures.length ? { label: 'Documents signed', value: String(signatures.length) } : null
  ].filter(Boolean);

  return {
    title: 'Completed intake packet',
    kicker: 'For your records',
    agencyName: agencyDisplayName(agency) || String(link?.title || 'Intake').trim(),
    packetVersionLabel: '1.0',
    metaLines: [
      submission?.id ? `Submission ${submission.id}` : '',
      submittedAt ? `Submitted ${submittedAt}` : ''
    ].filter(Boolean),
    sections,
    signatures,
    approvals,
    esign: {
      statement: ESIGN_STATEMENT,
      rows: esignRows
    },
    footerNote: 'This branded packet is your copy of what you submitted, including answers, signatures, approvals, and electronic signature details. Signed legal form copies may also be emailed when they are ready. Keep this file private.'
  };
}
