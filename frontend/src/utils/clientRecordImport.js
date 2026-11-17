// Keep these creation sources aligned with backend/src/utils/paperPacketClient.js.
const APP_INTAKE_SOURCES = new Set([
  'PUBLIC_INTAKE_LINK', 'DIGITAL_FORM', 'PUBLIC_OFFICE_INTAKE',
  'ADAPTIVE_QUICK_PROSPECTIVE', 'PUBLIC_BOOKING_INQUIRY'
]);

export function requiresClientRecordImport(client) {
  let docs = client?.onboarding_docs_json || {};
  if (typeof docs === 'string') { try { docs = JSON.parse(docs); } catch { docs = {}; } }
  if (Number(docs?.paperPacketSource?.documentId) && Number(docs?.paperPacketSource?.draftId)) return true;
  const schoolClient = [client?.client_type, client?.clientType, client?.organization_type, client?.organizationType]
    .some(type => String(type || '').trim().toLowerCase() === 'school');
  // School chart setup and legacy imports retain their existing workflow.
  return schoolClient || !APP_INTAKE_SOURCES.has(String(client?.source || '').trim().toUpperCase());
}
