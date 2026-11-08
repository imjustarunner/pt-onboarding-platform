export function schoolRoiAuditTrail(row) {
  const value = row?.audit_trail;
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

export function isSchoolRoiDocument(row) {
  const trail = schoolRoiAuditTrail(row);
  if (trail.smartSchoolRoi || trail.roiResponse) return true;
  const name = `${row?.document_template_name || ''} ${trail.documentName || ''} ${trail.document_name || ''}`.toLowerCase();
  return name.includes('release of information') || name.includes('school_roi') || /\broi\b/.test(name);
}

export function signedDocumentBelongsToClient(row, clientId) {
  if (row?.client_id) return Number(row.client_id) === Number(clientId);
  // Legacy personalized ROI rows belong to the submission's primary child.
  // A sibling association alone cannot authorize that child's signed PDF.
  return !isSchoolRoiDocument(row) || Number(row?.submission_client_id) === Number(clientId);
}
