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
import { matchesShowIf, childAgeFlags } from '../utils/intakeShowIf.js';
import { schoolRoiRecordSections } from './schoolRoiChartText.service.js';

const SECRET_KEY = /password|preview|card_number|cvc|cvv|ssn|secret|signaturedata|dataurl|token/i;
const PHOTO_KEY = /photo|image|front|back|preview/i;
const SKIP_BAG_KEYS = new Set([
  'packetSections',
  'packetInformedGroupConsent',
  'packetPolicyServices',
  'packetHipaaNotice',
  'smartSchoolRoi',
  'smartDisclosure',
  'disclosure',
  'snapshotHtml',
  'html',
  'sectionHtml',
  'signatureData',
  'signatureMeta',
  'acknowledgments',
  'skip_phq9',
  'skip_gad7',
  'skip_auditc',
  'skip_dast10',
  'skip_pcptsd5',
  'skip_psc17',
  'clinicalResponses',
  'organizationId',
  'organization_id',
  'clinicalSafetyAlert',
  'communicationPreferences',
  'preferred_office_provider_ids',
  'preferred_office_provider_summary',
  'appointment_reminder_contacts',
  'appointment_reminder_who',
  'termsUrl',
  'privacyUrl',
  // Job-app upload plumbing — shown as a dedicated Cover letter section instead.
  'uploadFilesByStep',
  'upload_files_by_step',
  'uploadedFiles',
  'uploaded_files',
  'uploadTextByStep',
  'upload_text_by_step',
  'resumeText',
  'resume_text',
  'coverLetterText',
  'cover_letter_text',
  'coverLetter',
  'cover_letter'
]);
const INSTRUMENT_SKIP_KEYS = {
  phq9: 'skip_phq9',
  gad7: 'skip_gad7',
  auditc: 'skip_auditc',
  dast10: 'skip_dast10',
  pcptsd5: 'skip_pcptsd5',
  psc17: 'skip_psc17'
};
const PACKET_SECTION_TITLES = {
  informed_group_consent: 'Informed Consent + Group Consent',
  policy_services: 'Policy and Services Agreement',
  hipaa_notice: 'HIPAA Privacy Policy and Notice of Privacy Practices'
};
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

function mergeAnswerObject(base, extra) {
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return out;
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = mergeAnswerObject(out[key], value);
      continue;
    }
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

function mergeClientAnswerLists(left = [], right = []) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => mergeAnswerObject(a[i], b[i]));
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
  const topClients = Array.isArray(intakeData.clients)
    ? intakeData.clients.map((c) => (c && typeof c === 'object' ? c : {}))
    : [];
  const responseClients = Array.isArray(existingResponses?.clients) ? existingResponses.clients : [];
  return {
    ...intakeData,
    responses: {
      ...(existingResponses || {}),
      submission: mergedSubmission,
      guardian: mergedGuardianResponses,
      clients: mergeClientAnswerLists(topClients, responseClients)
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

function looksLikeHtml(value) {
  const text = String(value || '').trim();
  return text.startsWith('<') && /<\/[a-z][\w:-]*>/i.test(text);
}

function isSkipped(values, skipKey) {
  return String(values?.[skipKey] || '').trim().toLowerCase() === 'yes';
}

function instrumentIdForField(field) {
  return String(field?.instrument || '').trim().toLowerCase();
}

function looksLikeBlankLikert(raw) {
  return raw === 0 || raw === '0';
}

function instrumentWasCompleted(fields, values) {
  const dataFields = fields.filter((field) => field?.key && field.type !== 'info');
  if (!dataFields.length) return false;
  const answered = dataFields.filter((field) => {
    const raw = values?.[field.key];
    if (raw === false) return true;
    return hasValue(raw);
  });
  if (!answered.length) return false;
  const allBlankLikert = answered.every((field) => looksLikeBlankLikert(values?.[field.key]));
  if (allBlankLikert) return false;
  return true;
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

const INSTRUMENT_LEFTOVER_KEY = /^(psc|vanderbilt|scared5?|asq|phq9?|gad7?|crafft|send_child)_/i;

const FALLBACK_VALUE_LABELS = {
  send: 'Send to the child',
  skip: 'Skip for now',
  yes: 'Yes',
  no: 'No',
  not_sure: 'Not sure',
  going_well: 'Going well',
  some_difficulty: 'Some difficulty',
  significant_difficulty: 'Significant difficulty',
  in_person: 'In person',
  school_based: 'School based',
  most_important: 'Most important',
  no_preference: 'No preference',
  '2_weeks_2_months': '2 weeks to 2 months',
  sadness_low_mood: 'Sadness or low mood',
  school_avoidance: 'School avoidance',
  eating_concerns: 'Eating concerns',
  worry_anxiety: 'Worry or anxiety'
};

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
    const slug = String(raw).trim().toLowerCase();
    const fallback = FALLBACK_VALUE_LABELS[slug];
    if (fallback) return fallback;
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(slug)) return humanizeKey(slug);
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

function pushRow(rows, label, value, extra = {}) {
  const text = String(value || '').trim();
  if (!label || !text) return;
  rows.push({
    label: String(label).trim(),
    value: text.length > 4000 ? `${text.slice(0, 3997)}…` : text,
    ...(extra.href ? { href: String(extra.href).trim() } : {})
  });
}

function interpolateChildName(text, name) {
  const resolved = String(name || 'this child').trim() || 'this child';
  return String(text || '')
    .replaceAll('{childName}', resolved)
    .replaceAll('{CHILDNAME}', resolved)
    .replaceAll('{ChildName}', resolved)
    .replaceAll('[Child Name]', resolved);
}

function absolutePublicUrl(path, origin = '') {
  const raw = String(path || '').trim();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = resolvePublicOrigin(origin);
  if (!base) return raw.startsWith('/') ? raw : `/${raw}`;
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function commChoiceLabel(kind, value) {
  const v = String(value || '').trim().toLowerCase();
  if (kind === 'email') {
    if (v === 'all') return 'Yes — scheduling + all program communications';
    if (v === 'scheduling_only') return 'Yes — scheduling only';
    if (v === 'no') return 'No';
  }
  if (kind === 'sms') {
    if (v === 'scheduling_only') return 'Yes — scheduling and appointment reminders';
    if (v === 'no') return 'No — do not text me';
  }
  if (kind === 'yesno') {
    if (v === 'yes') return 'Yes';
    if (v === 'no') return 'No';
  }
  return humanizeKey(value);
}

function communicationsSection(submissionBag, publicOrigin) {
  const cp = submissionBag?.communicationPreferences;
  if (!cp || typeof cp !== 'object') return null;
  const rows = [];
  if (cp.emailPreference) pushRow(rows, 'Email', commChoiceLabel('email', cp.emailPreference));
  if (cp.smsPreference) pushRow(rows, 'Text messages (SMS)', commChoiceLabel('sms', cp.smsPreference));
  if (cp.providerTextingOptIn) pushRow(rows, 'Provider / care-team texting', commChoiceLabel('yesno', cp.providerTextingOptIn));
  if (cp.programUpdatesOptIn) pushRow(rows, 'Program updates', commChoiceLabel('yesno', cp.programUpdatesOptIn));
  const terms = absolutePublicUrl(cp.termsUrl || '/terms', publicOrigin);
  const privacy = absolutePublicUrl(cp.privacyUrl || '/privacypolicy', publicOrigin);
  if (terms) rows.push({ label: 'Terms of Use', value: terms, href: terms });
  if (privacy) rows.push({ label: 'Privacy Policy', value: privacy, href: privacy });
  return rows.length ? { title: 'Communication preferences', rows } : null;
}

function reminderContactsSection(submissionBag) {
  const contacts = Array.isArray(submissionBag?.appointment_reminder_contacts)
    ? submissionBag.appointment_reminder_contacts
    : [];
  const included = contacts.filter((c) => c && c.included !== false && (c.name || c.email || c.phone));
  if (!included.length) return null;
  const rows = [];
  included.forEach((c) => {
    const bits = [c.name, c.relationship, c.email, c.phone].map((v) => String(v || '').trim()).filter(Boolean);
    pushRow(rows, String(c.label || humanizeKey(c.role || 'Contact')), bits.join(' — '));
  });
  return rows.length ? { title: 'Appointment reminder contacts', rows } : null;
}

function walkBag(bag, { byKey, locale, link, prefix = '', skipKeys = new Set(), values = null }, rows, printed) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return;
  const showIfValues = values && typeof values === 'object' ? values : bag;
  for (const [key, raw] of Object.entries(bag)) {
    if (!key || skipKeys.has(key) || SKIP_BAG_KEYS.has(key) || isSecretKey(key) || printed.has(key)) continue;
    if (looksLikeHtml(raw)) continue;
    if (PHOTO_KEY.test(key) && typeof raw === 'string' && raw.startsWith('data:')) continue;
    if (INSTRUMENT_LEFTOVER_KEY.test(key)) continue;
    const field = byKey.get(key);
    if (field?.showIf && !matchesShowIf(field.showIf, showIfValues)) continue;
    const label = [prefix, field ? (resolveIntakeFieldLabel(field, locale, link) || humanizeKey(key)) : humanizeKey(key)]
      .filter(Boolean)
      .join(' · ');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      walkBag(raw, { byKey, locale, link, prefix: label, skipKeys, values: showIfValues }, rows, printed);
      printed.add(key);
      continue;
    }
    if (Array.isArray(raw) && raw.some((item) => item && typeof item === 'object')) {
      raw.forEach((item, index) => {
        if (item && typeof item === 'object') {
          walkBag(item, { byKey, locale, link, prefix: `${label} ${index + 1}`, skipKeys, values: showIfValues }, rows, printed);
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

function rowsFromInterview(link, values, locale, printed, childName = '', { includeUnanswered = false } = {}) {
  const sections = [];
  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  for (const step of steps) {
    const type = String(step?.type || '').trim().toLowerCase();
    if (type !== 'questions' && type !== 'clinical_questions' && type !== 'reminder_contacts') continue;
    const fields = Array.isArray(step.fields) ? step.fields : [];
    const byInstrument = new Map();
    for (const field of fields) {
      const inst = instrumentIdForField(field);
      if (!inst) continue;
      if (!byInstrument.has(inst)) byInstrument.set(inst, []);
      byInstrument.get(inst).push(field);
    }
    const skippedInstruments = new Set();
    if (!includeUnanswered) {
      for (const [inst, instFields] of byInstrument.entries()) {
        const skipKey = INSTRUMENT_SKIP_KEYS[inst];
        // School master PSC-17 is asked as regular packet questions (Never /
        // Sometimes / Often). Do not treat it as a skippable office instrument
        // until that transition is explicit (`skip_psc17`).
        if (inst === 'psc17') {
          if (skipKey && isSkipped(values, skipKey)) {
            skippedInstruments.add(inst);
            instFields.forEach((field) => {
              if (field?.key) printed.add(field.key);
            });
          }
          continue;
        }
        if ((skipKey && isSkipped(values, skipKey)) || !instrumentWasCompleted(instFields, values)) {
          skippedInstruments.add(inst);
          instFields.forEach((field) => {
            if (field?.key) printed.add(field.key);
          });
        }
      }
    }
    const rows = [];
    for (const field of fields) {
      if (!field?.key || field.type === 'info') continue;
      if (SKIP_BAG_KEYS.has(field.key)) {
        printed.add(field.key);
        continue;
      }
      const inst = instrumentIdForField(field);
      if (inst && skippedInstruments.has(inst)) continue;
      if (!matchesShowIf(field.showIf, values)) continue;
      const value = values[field.key];
      const empty = value !== false && value !== 0 && !hasValue(value);
      if (empty && !includeUnanswered) continue;
      if (looksLikeHtml(value)) continue;
      const rendered = empty
        ? 'Not answered'
        : formatFieldValue(field, value, locale, link);
      if (!rendered) continue;
      const label = resolveIntakeFieldLabel(field, locale, link) || humanizeKey(field.key);
      pushRow(rows, interpolateChildName(label, childName), rendered);
      printed.add(field.key);
    }
    if (rows.length) {
      sections.push({
        title: interpolateChildName(String(step.label || 'Questions').trim() || 'Questions', childName),
        rows
      });
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

function resolvePublicOrigin(explicit = '') {
  return String(
    explicit
    || process.env.PUBLIC_APP_URL
    || process.env.FRONTEND_URL
    || ''
  ).trim().replace(/\/$/, '');
}

function publicDocUrl(publicKey, kind, id, origin = '') {
  const key = String(publicKey || '').trim();
  if (!key) return '';
  if (kind === 'disclosure') {
    const path = `/api/public-intake/${encodeURIComponent(key)}/disclosure/view`;
    const base = resolvePublicOrigin(origin);
    return base ? `${base}${path}` : path;
  }
  if (!id) return '';
  const path = kind === 'section'
    ? `/api/public-intake/${encodeURIComponent(key)}/packet-section/${encodeURIComponent(id)}/view`
    : `/api/public-intake/${encodeURIComponent(key)}/document/${encodeURIComponent(id)}/view`;
  const base = resolvePublicOrigin(origin);
  return base ? `${base}${path}` : path;
}

function agreementCard({
  documentName,
  signedAt,
  hash,
  imageDataUrl,
  publicUrl,
  versionLabel,
  signerName
}) {
  const name = String(documentName || '').trim();
  if (!name) return null;
  return {
    documentName: name,
    signedAt: signedAt || '',
    hash: String(hash || '').trim(),
    imageDataUrl: imageDataUrl || '',
    publicUrl: String(publicUrl || '').trim(),
    versionLabel: String(versionLabel || '').trim(),
    signerName: String(signerName || '').trim()
  };
}

function collectPacketSectionAgreements(intakeData, publicKey, signerName, origin = '') {
  const bags = [
    intakeData?.packetSections,
    intakeData?.responses?.submission?.packetSections
  ].filter((bag) => bag && typeof bag === 'object');
  const out = [];
  const seen = new Set();
  for (const bag of bags) {
    for (const [key, response] of Object.entries(bag)) {
      if (!response || seen.has(key)) continue;
      const sig = signatureImage(response);
      if (!response.acknowledged && !sig) continue;
      seen.add(key);
      out.push(agreementCard({
        documentName: PACKET_SECTION_TITLES[key] || humanizeKey(key),
        signedAt: formatDateTime(response.signedAt || response.acknowledgedAt),
        hash: response.contentHash || '',
        imageDataUrl: sig,
        publicUrl: publicDocUrl(publicKey, 'section', key, origin),
        versionLabel: response.packetVersion ? `Version ${response.packetVersion}` : '',
        signerName: response.signerName || signerName
      }));
    }
  }
  return out.filter(Boolean);
}

function collectNamedAgreement(intakeData, paths, title, publicUrl, signerName) {
  for (const pathParts of paths) {
    let cur = intakeData;
    for (const part of pathParts) {
      cur = cur?.[part];
    }
    if (!cur || typeof cur !== 'object') continue;
    const sig = signatureImage(cur);
    if (!cur.acknowledged && !sig) continue;
    return agreementCard({
      documentName: title,
      signedAt: formatDateTime(cur.signedAt || cur.acknowledgedAt),
      hash: cur.contentHash || '',
      imageDataUrl: sig,
      publicUrl,
      versionLabel: cur.packetVersion || cur.version ? `Version ${cur.packetVersion || cur.version}` : '',
      signerName: cur.signerName || signerName
    });
  }
  return null;
}

function signedDocumentDisplayName(doc, trail) {
  if (trail?.smartSchoolRoi || trail?.roiResponse) return 'School Release of Information';
  if (trail?.smartDisclosure || trail?.disclosure) return 'Disclosure Statement';
  const name = String(doc?.document_template_name || trail?.documentName || '').trim();
  if (/disclosure agreement/i.test(name) && (trail?.smartSchoolRoi || trail?.roiResponse)) {
    return 'School Release of Information';
  }
  return name;
}

function buildSignatures({ signedDocuments = [], intakeData = {}, publicKey = '', signerName = '', publicOrigin = '' } = {}) {
  const fromDb = (signedDocuments || []).map((doc, index) => {
    const trail = parseMaybeJson(doc?.audit_trail, {});
    const templateId = doc?.document_template_id;
    const displayName = signedDocumentDisplayName(doc, trail) || `Signed document ${index + 1}`;
    return agreementCard({
      documentName: displayName,
      signedAt: formatDateTime(doc?.signed_at || trail?.submittedAt || trail?.signedAt),
      hash: String(doc?.pdf_hash || trail?.documentReference || '').trim(),
      imageDataUrl: signatureImage(trail) || signatureImage(trail?.roiResponse) || signatureImage(intakeData?.smartSchoolRoi),
      publicUrl: publicDocUrl(publicKey, 'document', templateId, publicOrigin),
      versionLabel: doc?.version ? `Version ${doc.version}` : '',
      signerName: trail?.signerName || signerName
    });
  }).filter(Boolean);

  const fromSections = collectPacketSectionAgreements(intakeData, publicKey, signerName, publicOrigin);
  const extra = [
    collectNamedAgreement(
      intakeData,
      [['smartDisclosure'], ['disclosure'], ['responses', 'submission', 'smartDisclosure']],
      'Disclosure Statement',
      publicDocUrl(publicKey, 'disclosure', null, publicOrigin),
      signerName
    ),
    collectNamedAgreement(
      intakeData,
      [['smartSchoolRoi'], ['responses', 'submission', 'smartSchoolRoi']],
      'School Release of Information',
      '',
      signerName
    )
  ].filter(Boolean);

  const fromDbNames = new Set(fromDb.map((row) => row.documentName));
  const packetPresentedDisclosure = (signedDocuments || []).some((doc) => {
    const trail = parseMaybeJson(doc?.audit_trail, {});
    const name = `${doc?.document_template_name || ''} ${trail.documentName || ''}`.toLowerCase();
    return trail.smartDisclosure === true || trail.disclosure || name.includes('disclosure');
  }) || Boolean(intakeData?.smartDisclosure || intakeData?.disclosure || intakeData?.responses?.submission?.smartDisclosure);
  const sessionSig = signatureImage(intakeData?.smartDisclosure)
    || signatureImage(intakeData?.smartSchoolRoi)
    || fromDb.map((row) => row.imageDataUrl).find(Boolean)
    || '';
  if (
    packetPresentedDisclosure
    && sessionSig
    && !fromDbNames.has('Disclosure Statement')
    && !extra.some((row) => /disclosure/i.test(row.documentName || ''))
  ) {
    extra.unshift(agreementCard({
      documentName: 'Disclosure Statement',
      signedAt: extra[0]?.signedAt || fromDb[0]?.signedAt || '',
      hash: '',
      imageDataUrl: sessionSig,
      publicUrl: publicDocUrl(publicKey, 'disclosure', null, publicOrigin),
      versionLabel: '',
      signerName
    }));
  }

  const merged = [];
  const seen = new Set();
  for (const row of [...fromSections, ...extra.filter((row) => !fromDbNames.has(row.documentName)), ...fromDb]) {
    const key = `${row.documentName}|${row.hash || row.imageDataUrl?.slice(0, 24) || row.publicUrl || row.signedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
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
  clients = [],
  publicKey = '',
  brandLogoUrl = '',
  publicOrigin = '',
  includeUnansweredQuestions = false
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
  const isJobApplication = String(link?.form_type || '').toLowerCase() === 'job_application';
  listedClients.forEach((client, index) => {
    const fallback = isJobApplication
      ? (listedClients.length > 1 ? `Applicant ${index + 1}` : 'Applicant')
      : (listedClients.length > 1 ? `Client ${index + 1}` : 'Client');
    const name = String(client?.fullName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || fallback).trim();
    const dob = String(client?.dateOfBirth || client?.date_of_birth || '').trim();
    pushRow(contactRows, fallback, dob ? `${name} · Date of birth ${dob}` : name);
  });

  const clinicalBag = (submissionBag.clinicalResponses && typeof submissionBag.clinicalResponses === 'object')
    ? submissionBag.clinicalResponses
    : {};
  const topClientBag = Array.isArray(intakeData.clients) && intakeData.clients[0] && typeof intakeData.clients[0] === 'object'
    ? intakeData.clients[0]
    : {};
  const firstDob = String(listedClients[0]?.dateOfBirth || listedClients[0]?.date_of_birth || clientBags[0]?.child_dob || '').trim();
  const interviewValues = {
    ...submissionBag,
    ...guardianBag,
    ...clinicalBag,
    ...topClientBag,
    ...(clientBags[0] || {}),
    ...childAgeFlags(firstDob, clientBags[0] || {})
  };
  const childName = String(
    listedClients[0]?.preferredName
    || clientBags[0]?.child_preferred_name
    || listedClients[0]?.firstName
    || clientBags[0]?.child_legal_first
    || 'this child'
  ).trim() || 'this child';
  const interviewSections = rowsFromInterview(
    link,
    interviewValues,
    locale,
    printed,
    childName,
    { includeUnanswered: includeUnansweredQuestions }
  );

  const leftoverGuardian = [];
  walkBag(guardianBag, { byKey, locale, link, skipKeys: new Set([...IDENTITY_KEYS, ...SKIP_BAG_KEYS]), values: interviewValues }, leftoverGuardian, printed);
  const leftoverSubmission = [];
  walkBag(submissionBag, {
    byKey,
    locale,
    link,
    skipKeys: new Set(['whoFor', 'this_is_for', 'formLocale', 'acknowledgments', 'termsUrl', 'privacyUrl', ...SKIP_BAG_KEYS]),
    values: interviewValues
  }, leftoverSubmission, printed);
  const coverLetterRaw = String(
    submissionBag.coverLetterText
    || submissionBag.cover_letter_text
    || submissionBag.coverLetter
    || submissionBag.cover_letter
    || intakeData?.coverLetterText
    || ''
  ).trim();
  const coverLetterBlock = coverLetterRaw
    ? {
        title: 'Cover letter',
        rows: [{ label: 'Cover letter', value: coverLetterRaw, fullWidth: true }]
      }
    : null;
  const commsBlock = communicationsSection(submissionBag, publicOrigin);
  const reminderBlock = reminderContactsSection(submissionBag);
  const providerSummary = String(submissionBag.preferred_office_provider_summary || '').trim();
  const providersBlock = providerSummary
    ? { title: 'Preferred providers', rows: [{ label: 'Selected', value: providerSummary }] }
    : null;

  const clientSections = clientBags.map((bag, index) => {
    const rows = [];
    const identitySkip = new Set(['firstName', 'lastName', 'middleName', 'fullName', 'dateOfBirth', 'date_of_birth']);
    const dob = String(listedClients[index]?.dateOfBirth || listedClients[index]?.date_of_birth || bag?.child_dob || '').trim();
    const values = { ...bag, ...childAgeFlags(dob, bag || {}) };
    walkBag(bag, { byKey, locale, link, skipKeys: identitySkip, values }, rows, new Set(printed));
    const name = String(listedClients[index]?.fullName || `${listedClients[index]?.firstName || ''} ${listedClients[index]?.lastName || ''}`.trim() || `Client ${index + 1}`).trim();
    return rows.length ? { title: listedClients.length > 1 ? `${name} details` : 'Client details', rows } : null;
  }).filter(Boolean);

  const sections = [
    contactRows.length
      ? { title: isJobApplication ? 'Applicant' : 'Who this packet is for', rows: contactRows }
      : null,
    leftoverGuardian.length ? { title: isJobApplication ? 'Applicant details' : 'Parent / guardian', rows: leftoverGuardian } : null,
    coverLetterBlock,
    commsBlock,
    reminderBlock,
    providersBlock,
    ...interviewSections,
    leftoverSubmission.length ? { title: 'Additional answers', rows: leftoverSubmission } : null,
    ...clientSections,
    ...schoolRoiRecordSections(intakeData)
  ].filter((section) => section && (section.rows?.length || section.html));

  const signatures = buildSignatures({
    signedDocuments,
    intakeData,
    publicKey: publicKey || link?.public_key || '',
    signerName: contactName,
    publicOrigin
  });
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
    title: isJobApplication ? 'Job application receipt' : 'Completed intake packet',
    skipCoverPage: isJobApplication,
    kicker: 'For your records',
    agencyName:
      agencyDisplayName(agency)
      || String(isJobApplication ? (link?.title || 'Application') : (link?.title || 'Intake')).trim(),
    brandLogoUrl: String(brandLogoUrl || '').trim(),
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
    footerNote: isJobApplication
      ? 'This branded receipt is your copy of the job application you submitted, including your answers and any acknowledgments. Keep this file private.'
      : 'This branded packet is your copy of what you submitted, including answers, signatures, approvals, and electronic signature details. Signed legal form copies may also be emailed when they are ready. Keep this file private.'
  };
}
