import { normalizeIntakeDataShape } from '../services/completedIntakeRecord.service.js';

export function intakeChildRoster(intakeData = {}) {
  const normalized = normalizeIntakeDataShape(intakeData);
  const identities = Array.isArray(normalized.clients) ? normalized.clients : [];
  const answers = normalized.responses?.clients || [];
  return Array.from({ length: Math.max(identities.length, answers.length) }, (_, index) => {
    const identity = identities[index] || {};
    const answer = answers[index] || {};
    return {
      fullName: String(identity.fullName || [identity.firstName || answer.child_legal_first || answer.client_first,
        identity.middleName, identity.lastName || answer.child_legal_last || answer.client_last].filter(Boolean).join(' ')).trim(),
      dateOfBirth: String(answer.child_dob || answer.client_dob || answer.date_of_birth || identity.dateOfBirth || identity.date_of_birth || identity.dob || '').slice(0, 10)
    };
  });
}

export function validateMultiChildSigning({ intakeData = {}, clients = [] } = {}) {
  const roster = intakeChildRoster(intakeData);
  const count = Math.max(roster.length, Array.isArray(clients) ? clients.length : 0);
  if (count < 2) return null;
  const consent = intakeData.multiClientSignatureConsent;
  if (consent?.accepted !== true || Number(consent.clientCount) !== count
    || !consent.acceptedAt || !Number.isFinite(Date.parse(consent.acceptedAt))) {
    return 'Please confirm that your signatures and release choices apply to every child in this enrollment.';
  }
  if (roster.length !== count || roster.some(child => !child.fullName || !child.dateOfBirth)) {
    return 'Please enter each child’s name and date of birth before signing for both children.';
  }
  return null;
}

export function intakeDataForChild(intakeData, index) {
  const normalized = normalizeIntakeDataShape(intakeData);
  const roster = intakeChildRoster(normalized);
  if (!Number.isInteger(index) || index < 0 || index >= roster.length) throw new RangeError('Invalid child index');
  const child = roster[index];
  const response = normalized.responses.clients[index] || {};
  const identity = { ...(normalized.clients?.[index] || {}), ...child };
  const shared = { ...normalized.responses.submission };
  if (Array.isArray(shared.guardianWaiverIntake?.clients)) {
    shared.guardianWaiverIntake = { ...shared.guardianWaiverIntake, clients: [shared.guardianWaiverIntake.clients[index] || {}] };
  }
  if (shared.insuranceInfo) {
    shared.insuranceInfo = { ...shared.insuranceInfo };
    for (const key of ['clientCoverages', 'medicaidByClient']) {
      if (Array.isArray(shared.insuranceInfo[key])) shared.insuranceInfo[key] = shared.insuranceInfo[key].filter(row => Number(row.clientIndex) === index);
    }
  }
  if (index > 0) {
    delete shared.clinicalResponses;
    delete shared.demographicsInfo;
  }
  const scoped = { ...normalized, clients: [identity], responses: { ...normalized.responses, submission: shared, clients: [response] } };
  const roi = normalized.smartSchoolRoi || normalized.responses.submission?.smartSchoolRoi;
  if (roi) scoped.smartSchoolRoi = { ...roi, clientFullName: child.fullName, clientDateOfBirth: child.dateOfBirth };
  return scoped;
}

export function areAllIntakePacketsReady({ status, intakeData, downloadUrl, clientBundles = [] }) {
  if (String(status).toLowerCase() !== 'submitted' || intakeData?.packetGeneration?.status === 'needs_review') return false;
  const count = intakeChildRoster(intakeData || {}).length;
  if (count <= 1) return Boolean(downloadUrl || clientBundles.some(bundle => bundle.downloadUrl));
  const readyIds = new Set(clientBundles.filter(bundle => bundle.clientId && bundle.downloadUrl).map(bundle => Number(bundle.clientId)));
  return readyIds.size >= count;
}

export function sameSigningChildren(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((child, i) => child.fullName === right[i]?.fullName && child.dateOfBirth === right[i]?.dateOfBirth);
}

export function validateSharedSigningCaptures(intakeData = {}) {
  const roster = intakeChildRoster(intakeData);
  if (roster.length < 2) return null;
  const captures = [intakeData.smartSchoolRoi, intakeData.smartDisclosure,
    ...Object.values(intakeData.packetSections || {})].filter(Boolean);
  if (intakeData.multiClientSignatureConsent?.version >= 2
    && !sameSigningChildren(intakeData.multiClientSignatureConsent.children, roster)) {
    return 'The list of children changed. Please review who is covered by your signatures.';
  }
  if (captures.some(capture => capture.sharedSigningChildren && !sameSigningChildren(capture.sharedSigningChildren, roster))) {
    return 'A child’s name or date of birth changed after signing. Please review and sign the shared agreements again.';
  }
  return null;
}

/** Replace child-bound tokens, including PDF field IDs, instead of retaining
 * the first child's prefilled values when regenerating a sibling document. */
export function childDocumentValues({ intakeData, clientIndex, fields = [], fieldDefinitions = [], base = {} }) {
  const normalized = normalizeIntakeDataShape(intakeData);
  const identity = normalized.clients?.[clientIndex] || {};
  const responses = normalized.responses.clients[clientIndex] || {};
  const child = intakeChildRoster(normalized)[clientIndex] || {};
  const parts = String(child.fullName || '').split(/\s+/);
  const first = identity.firstName || responses.child_legal_first || responses.client_first || parts[0] || '';
  const last = identity.lastName || responses.child_legal_last || responses.client_last || parts.slice(1).join(' ');
  const grade = responses.child_grade || responses.client_grade || responses.grade || identity.grade || '';
  const values = { ...base,
    client_first: first, client_last: last, client_full_name: child.fullName || '',
    client_name: child.fullName || '', child_name: child.fullName || '',
    child_dob: child.dateOfBirth || '', client_dob: child.dateOfBirth || '', date_of_birth: child.dateOfBirth || '',
    client_grade: grade, child_grade: grade, grade,
    client_initials: identity.initials || [first, last].map(name => String(name).charAt(0)).join(''),
    client_sex: responses.child_gender || responses.client_sex || responses.client_gender || identity.gender || ''
  };
  for (const field of fields) {
    if (!field.documentKey || !field.key) continue;
    if (Object.hasOwn(responses, field.key)) values[field.documentKey] = responses[field.key];
    else if (field.scope === 'client' || field.scope === 'dependent') values[field.documentKey] = '';
  }
  for (const definition of fieldDefinitions) {
    const key = definition.prefillKey || definition.prefill_key || definition.id;
    if (definition.id && Object.hasOwn(values, key)) values[definition.id] = values[key];
  }
  return values;
}

export function validateRequiredSharedSignatures(steps = [], intakeData = {}) {
  const keys = {
    packet_informed_group_consent: 'informed_group_consent',
    packet_policy_services: 'policy_services',
    packet_hipaa_notice: 'hipaa_notice'
  };
  for (const step of steps) {
    if (step.required === false) continue;
    const sectionKey = keys[step.type];
    const capture = sectionKey ? intakeData.packetSections?.[sectionKey]
      : step.type === 'school_roi' ? intakeData.smartSchoolRoi
        : ['smart_disclosure', 'disclosure'].includes(step.type) ? intakeData.smartDisclosure : undefined;
    if (!sectionKey && !['school_roi', 'smart_disclosure', 'disclosure'].includes(step.type)) continue;
    if (!String(capture?.signatureData || '').trim()
      || (step.type !== 'school_roi' && capture?.acknowledged !== true)) {
      return `Please review and sign ${step.label || step.title || 'the required agreement'} before completing enrollment.`;
    }
  }
  return null;
}

export function signedPacketTemplate(template, templates, signedByTemplate, translationMap = {}) {
  const id = Number(template.id);
  const candidates = [id, Number(translationMap[id]),
    ...Object.entries(translationMap).filter(([, translated]) => Number(translated) === id).map(([original]) => Number(original))];
  const signedId = candidates.find(candidate => candidate > 0 && signedByTemplate.has(candidate));
  if (!signedId) return null;
  return templates.find(candidate => Number(candidate.id) === signedId) || (signedId === id ? template : null);
}

export function chartIntakeDataForClient(intakeData, orderedClientRows, clientId, primaryClientId) {
  if (intakeChildRoster(intakeData).length < 2) return intakeData;
  let index = orderedClientRows.findIndex(row => Number(row.client_id) === Number(clientId));
  if (index < 0 && Number(primaryClientId) === Number(clientId)) index = 0;
  // An absent association is not permission to show child zero's answers.
  return index < 0 ? {} : intakeDataForChild(intakeData, index);
}
