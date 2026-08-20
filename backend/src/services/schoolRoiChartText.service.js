/**
 * Chart text + packet sections from a signed Smart School ROI payload.
 * School ROI packets store answers on `intake_data.smartSchoolRoi`, not the
 * clinical questionnaire bag — Records must still show what the family signed.
 */
import { getLocalizedSmartRoiBundle } from './smartSchoolRoiCopy.js';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function extractSmartSchoolRoi(intakeData) {
  const data = asObject(intakeData) || {};
  return asObject(data.smartSchoolRoi)
    || asObject(data.responses?.submission?.smartSchoolRoi)
    || asObject(data.responses?.smartSchoolRoi)
    || null;
}

function parseTrail(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

/** Prefer the signed-document snapshot (staff names, waiver bodies) over the compact stored ROI. */
export function enrichIntakeDataWithSignedRoi(intakeData, signedDocuments = []) {
  const data = { ...(asObject(intakeData) || {}) };
  let merged = extractSmartSchoolRoi(data);
  for (const doc of signedDocuments || []) {
    const trail = parseTrail(doc?.audit_trail);
    const fromTrail = asObject(trail.smartSchoolRoi) || asObject(trail.roiResponse);
    if (!fromTrail) continue;
    merged = {
      ...(merged || {}),
      ...fromTrail,
      signer: asObject(fromTrail.signer) || asObject(merged?.signer) || {},
      staffDecisions: Array.isArray(fromTrail.staffDecisions) && fromTrail.staffDecisions.length
        ? fromTrail.staffDecisions
        : (merged?.staffDecisions || []),
      requiredAcknowledgements: fromTrail.requiredAcknowledgements || merged?.requiredAcknowledgements,
      waiverItems: fromTrail.waiverItems || merged?.waiverItems
    };
  }
  if (merged) data.smartSchoolRoi = hydrateRoiQuestionCopy(merged, merged.locale || 'en');
  return data;
}

function ackMap(roi) {
  const list = ackList(roi);
  const map = {};
  for (const item of list) {
    const id = String(item.id || item.key || '').trim();
    if (!id) continue;
    map[id] = item;
  }
  if (!list.length && asObject(roi?.requiredAcknowledgements)) {
    for (const [id, accepted] of Object.entries(roi.requiredAcknowledgements)) {
      map[id] = { id, accepted };
    }
  }
  return map;
}

function waiverMap(roi) {
  const list = waiverList(roi);
  const map = {};
  for (const item of list) {
    const id = String(item.id || item.key || '').trim();
    if (!id) continue;
    map[id] = item;
  }
  if (!list.length && asObject(roi?.waiverItems)) {
    for (const [id, decision] of Object.entries(roi.waiverItems)) {
      map[id] = { id, decision };
    }
  }
  return map;
}

export function hydrateRoiQuestionCopy(roi, locale = 'en') {
  if (!asObject(roi)) return roi;
  const bundle = getLocalizedSmartRoiBundle(locale || roi.locale || 'en');
  const acks = ackMap(roi);
  const waivers = waiverMap(roi);
  const requiredAcknowledgements = (bundle.requiredAcknowledgements || []).map((def) => {
    const got = acks[def.id] || {};
    return {
      ...def,
      ...got,
      id: def.id,
      title: got.title || def.title,
      body: got.body || def.body,
      accepted: got.accepted
    };
  });
  for (const [id, got] of Object.entries(acks)) {
    if (requiredAcknowledgements.some((item) => item.id === id)) continue;
    requiredAcknowledgements.push({ id, title: got.title || humanize(id), body: got.body || '', accepted: got.accepted });
  }
  const waiverItems = (bundle.waiverItems || []).map((def) => {
    const got = waivers[def.id] || {};
    return {
      ...def,
      ...got,
      id: def.id,
      title: got.title || def.title,
      body: got.body || def.body,
      decision: got.decision
    };
  });
  for (const [id, got] of Object.entries(waivers)) {
    if (waiverItems.some((item) => item.id === id)) continue;
    waiverItems.push({ id, title: got.title || humanize(id), body: got.body || '', decision: got.decision });
  }
  return {
    ...roi,
    requiredAcknowledgements,
    waiverItems
  };
}

function ackList(roi) {
  const raw = roi?.requiredAcknowledgements;
  if (Array.isArray(raw)) return raw;
  if (asObject(raw)) {
    return Object.entries(raw).map(([id, accepted]) => ({
      id,
      accepted: accepted === true || accepted === 'true' || accepted === 1,
      title: humanize(id)
    }));
  }
  return [];
}

function waiverList(roi) {
  const raw = roi?.waiverItems;
  if (Array.isArray(raw)) return raw;
  if (asObject(raw)) {
    return Object.entries(raw).map(([id, decision]) => ({
      id,
      decision,
      title: humanize(id)
    }));
  }
  return [];
}

function humanize(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function yesNo(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 'false' || value === 0 || value === '0') return 'No';
  return String(value || '').trim();
}

export function roiAcknowledgedHipaa(roi) {
  if (!roi) return false;
  const acks = ackList(roi);
  return acks.some((a) => {
    const id = String(a.id || a.key || '').toLowerCase();
    return id.includes('hipaa') && (a.accepted === true || a.accepted === 'true' || a.decision === 'accept');
  });
}

export function roiHasSignature(roi) {
  return Boolean(roi && (roi.signatureData || roi.signer || roi.clientFullName));
}

function staffLabel(row) {
  return String(row?.fullName || `${row?.firstName || ''} ${row?.lastName || ''}`.trim() || `Staff #${row?.schoolStaffUserId || ''}`).trim();
}

function decisionLabel(row) {
  const d = String(row?.decision || '').toLowerCase();
  if (d === 'roi_docs' || row?.packetAllowed) return 'ROI + packet documents';
  if (d === 'speak' || d === 'roi_speak') return 'ROI (Speak) only';
  if (d === 'deny' || row?.allowed === false) return 'Denied';
  return humanize(d || 'decision');
}

export function schoolRoiRecordSections(intakeData) {
  const roi = hydrateRoiQuestionCopy(
    extractSmartSchoolRoi(intakeData),
    extractSmartSchoolRoi(intakeData)?.locale || 'en'
  );
  if (!roi) return [];
  const sections = [];
  const clientRows = [];
  if (roi.clientFullName) clientRows.push({ label: 'Client', value: String(roi.clientFullName) });
  if (roi.clientDateOfBirth) clientRows.push({ label: 'Date of birth', value: String(roi.clientDateOfBirth) });
  const signer = asObject(roi.signer) || {};
  const signerName = `${signer.firstName || ''} ${signer.lastName || ''}`.trim() || signer.fullName || '';
  if (signerName) clientRows.push({ label: 'Responsible party', value: signerName });
  if (signer.relationship) clientRows.push({ label: 'Relationship', value: String(signer.relationship) });
  if (signer.email) clientRows.push({ label: 'Signer email', value: String(signer.email) });
  if (signer.phone) clientRows.push({ label: 'Signer phone', value: String(signer.phone) });
  if (roi.externalReleaseMode) clientRows.push({ label: 'Release mode', value: humanize(roi.externalReleaseMode) });
  if (clientRows.length) sections.push({ title: 'School Release of Information', rows: clientRows });

  const ackRows = ackList(roi)
    .filter((a) => a.accepted === true || a.accepted === false || a.accepted === 'true' || a.accepted === 'false')
    .map((a) => ({
      label: String(a.title || humanize(a.id)),
      value: a.body ? `${a.accepted === false || a.accepted === 'false' ? 'Not accepted' : 'Acknowledged'} — ${a.body}` : (a.accepted === false || a.accepted === 'false' ? 'Not accepted' : 'Acknowledged')
    }));
  if (ackRows.length) sections.push({ title: 'Required notices', rows: ackRows });

  const waiverRows = waiverList(roi)
    .filter((w) => w.decision != null && String(w.decision).trim() !== '')
    .map((w) => ({
      label: String(w.title || humanize(w.id)),
      value: w.body
        ? `${humanize(w.decision || 'accept')} — ${w.body}`
        : humanize(w.decision || 'accept')
    }));
  if (waiverRows.length) sections.push({ title: 'Authorizations', rows: waiverRows });

  const staff = Array.isArray(roi.staffDecisions) ? roi.staffDecisions : [];
  const staffRows = staff.map((row) => ({
    label: staffLabel(row),
    value: [
      decisionLabel(row),
      row.email ? String(row.email) : '',
      row.role ? String(row.role) : ''
    ].filter(Boolean).join(' · ')
  }));
  if (staffRows.length) sections.push({ title: 'School staff decisions', rows: staffRows });

  const third = Array.isArray(roi.thirdPartyRecipients) ? roi.thirdPartyRecipients : [];
  const ext = Array.isArray(roi.externalRecipients) ? roi.externalRecipients : [];
  const extraRows = [...third, ...ext].map((row, idx) => ({
    label: String(row.fullName || row.name || `Recipient ${idx + 1}`),
    value: [row.email, row.relationship, row.purpose].filter(Boolean).join(' · ') || 'Listed'
  }));
  if (extraRows.length) sections.push({ title: 'Additional recipients', rows: extraRows });

  return sections;
}

export function buildSchoolRoiAnswersText(intakeData) {
  const sections = schoolRoiRecordSections(intakeData);
  if (!sections.length) return '';
  const lines = [];
  for (const section of sections) {
    if (lines.length) lines.push('');
    lines.push(section.title);
    lines.push('-'.repeat(section.title.length));
    for (const row of section.rows || []) {
      lines.push(`${row.label}: ${row.value}`);
    }
  }
  return lines.join('\n').trim();
}

export function buildSchoolRoiClinicalText(intakeData) {
  const roi = hydrateRoiQuestionCopy(
    extractSmartSchoolRoi(intakeData),
    extractSmartSchoolRoi(intakeData)?.locale || 'en'
  );
  if (!roi) return '';
  const lines = [
    'School ROI — privacy and safety acknowledgements',
    '================================================',
    'This submission was a school Release of Information, not a clinical interview packet.',
    ''
  ];
  const acks = ackList(roi);
  const hipaa = acks.find((a) => String(a.id || '').toLowerCase().includes('hipaa'));
  if (hipaa) {
    lines.push('HIPAA privacy notice: acknowledged');
    if (hipaa.body) lines.push(String(hipaa.body));
    lines.push('');
  }
  for (const w of waiverList(roi)) {
    lines.push(`${w.title || humanize(w.id)}: ${humanize(w.decision || 'accept')}`);
    if (w.body) lines.push(String(w.body));
    lines.push('');
  }
  const staff = Array.isArray(roi.staffDecisions) ? roi.staffDecisions : [];
  const approved = staff.filter((s) => s.allowed !== false);
  if (approved.length) {
    lines.push(`Approved school staff (${approved.length}): ${approved.map(staffLabel).join('; ')}`);
  }
  return lines.join('\n').trim();
}

export function formatAckAccepted(value) {
  return yesNo(value);
}
