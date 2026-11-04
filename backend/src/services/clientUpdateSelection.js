export const PORTAL_STEPS = [
  { key: 'information', title: 'Verify contact information', detail: 'Review the profile and confirm it is correct, or submit corrections.' },
  { key: 'notifications', title: 'Notification choices', detail: 'Choose which email and text updates to receive for this profile.' },
  { key: 'plan', title: 'Treatment plan acknowledgment', detail: 'Review the plan shared by the care team and acknowledge it when a signature is available.' },
  { key: 'insurance', title: 'Insurance card', detail: 'Upload the front and back of a commercial insurance card when one is required.' },
  { key: 'authorization', title: 'Payment authorization', detail: 'Review and sign the payment authorization assigned for this profile.' },
  { key: 'payment', title: 'Payment method', detail: 'Add or select a card for eligible charges. Saving a card does not by itself authorize a charge.' }
];

const PORTAL_KEYS = new Set(PORTAL_STEPS.map((step) => step.key));

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function uniqueNumbers(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function uniqueKeys(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const key = String(value || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Staff-selected update items. Full enrollment is rejected; an empty selection is rejected.
 */
export function normalizeUpdateSelection(body = {}) {
  if (body.fullPacket === true || body.option_full_packet === true || body.packetMode || body.packet_mode) {
    throw fail(400, 'A client update cannot include a full enrollment packet. Choose the specific documents and assessments this person still needs.');
  }
  const documents = uniqueNumbers(body.documents || body.documentTemplateIds);
  const assessments = uniqueKeys(body.assessments || body.assessmentFamilies);
  const portalSteps = uniqueKeys(body.portalSteps || body.steps).filter((key) => PORTAL_KEYS.has(key));
  const unknownSteps = uniqueKeys(body.portalSteps || body.steps).filter((key) => !PORTAL_KEYS.has(key));
  if (unknownSteps.length) {
    throw fail(400, 'Choose portal steps from the update list.');
  }
  if (!documents.length && !assessments.length && !portalSteps.length) {
    throw fail(400, 'Select at least one document, assessment, or portal step.');
  }
  return { documents, assessments, portalSteps };
}
