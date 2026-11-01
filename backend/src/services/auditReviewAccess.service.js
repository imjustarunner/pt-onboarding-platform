const idKeys = ['clientId', 'noteId', 'clinicalNoteId', 'clinicalSessionId', 'appointmentId', 'officeEventId', 'documentId', 'treatmentPlanId', 'intakeNoteId', 'amendmentId', 'addendumId', 'ticketId', 'messageId', 'taskId', 'targetUserId', 'goalId', 'progressEventId'];
export const positiveAuditId = (value) => /^\d+$/.test(String(value || '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

export const auditMetadataIds = (metadata) => Object.fromEntries(idKeys.flatMap((key) => {
  const id = positiveAuditId(metadata?.[key]);
  return id ? [[key, id]] : [];
}));

// Search the same operational identifiers that the support projection exposes.
// Never search hidden JSON/body/network fields: result counts must not disclose them.
export const auditIdSearchExpressions = (column) => idKeys.map((key) => {
  const value = `JSON_UNQUOTE(JSON_EXTRACT(${column}, '$.${key}'))`;
  return `CASE WHEN ${value} REGEXP '^[0-9]+$' THEN ${value} END`;
});
export const appendAuditSearch = (where, params, search, columns) => {
  if (!search) return;
  where.push(`(${columns.map((column) => `LOWER(COALESCE(CAST(${column} AS CHAR), '')) LIKE ?`).join(' OR ')})`);
  params.push(...columns.map(() => `%${String(search).trim().toLowerCase()}%`));
};

export const clinicalAuditTarget = (row) => {
  const metadata = row.metadata || {};
  const ids = auditMetadataIds(metadata);
  const clientId = positiveAuditId(row.client_id) || ids.clientId;
  const noteId = ids.noteId || ids.clinicalNoteId || (metadata.targetType === 'clinical_note' ? positiveAuditId(metadata.targetId) : null);
  if (noteId) return { label: `Note #${noteId}`, path: `/admin/clinical-note-generator?noteId=${noteId}${clientId ? `&clientId=${clientId}` : ''}&agencyId=${row.agency_id}` };
  if (ids.treatmentPlanId) return { label: `Treatment plan #${ids.treatmentPlanId}`, path: clientId ? `/admin/clients?clientId=${clientId}&tab=clinical` : null };
  if (String(row.action_type || '').startsWith('clinical_session_material_')) return { label: ids.documentId ? `Session document #${ids.documentId}` : `Clinical session #${ids.clinicalSessionId || ''}`, path: clientId ? `/admin/clients?clientId=${clientId}&tab=notes&clinicalSessionId=${ids.clinicalSessionId || ''}` : null };
  const documentId = ids.documentId || positiveAuditId(row.related_document_id);
  if (documentId) return { label: `Document #${documentId}`, path: clientId ? `/admin/clients?clientId=${clientId}&tab=phi&documentId=${documentId}` : null };
  if (String(row.action_type || '').startsWith('clinical_') || String(row.action_type || '').startsWith('client_intake_note_')) return { label: ids.clinicalSessionId ? `Clinical session #${ids.clinicalSessionId}` : 'Clinical record', path: clientId ? `/admin/clients?clientId=${clientId}` : null };
  return null;
};

export const projectAuditRowForSupport = (row) => {
  const target = clinicalAuditTarget(row);
  const metadata = auditMetadataIds(row.metadata);
  const clinicalTarget = target || (row.log_type === 'phi_document' ? { label: 'Clinical document' } : null);
  return {
    id: row.id, log_type: row.log_type, source_label: row.source_label,
    created_at: row.created_at, agency_id: row.agency_id, agency_name: row.agency_name,
    user_id: row.user_id ?? row.actor_user_id,
    user_first_name: row.user_first_name ?? row.actor_first_name,
    user_last_name: row.user_last_name ?? row.actor_last_name,
    client_id: positiveAuditId(row.client_id) || metadata.clientId || null,
    client_initials: row.client_initials || null,
    action_type: row.action_type, metadata,
    // A support review never confers permission to open PHI or privileged profiles.
    user_link: null, client_link: null, link_path: null,
    target_label: clinicalTarget?.label || (row.log_type === 'admin_action' ? 'Administrative record' : null),
    link_access: clinicalTarget ? 'clinical_access_required' : 'restricted',
    details_restricted: true
  };
};

export const auditCsvEscape = (value) => {
  const raw = value == null ? '' : String(value);
  // Audit metadata is untrusted text; opening an export must not execute formulas.
  const s = /^[\s]*[=+@-]/.test(raw) || /^[\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
