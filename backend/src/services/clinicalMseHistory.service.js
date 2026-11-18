import clinicalPool from '../config/clinicalDatabase.js';
import { sharedNotePredicate } from './sharedClinicalChart.service.js';
import { normalizeHistoricalMse } from '../../../frontend/src/utils/noteAidMseHistory.js';

const parsed = raw => { if (raw && typeof raw === 'object') return raw; try { return JSON.parse(raw || '{}'); } catch { return {}; } };
export async function loadClinicalMseHistory({ agencyId, clientId, dateOfService = null }, database = clinicalPool) {
  const [rows] = await database.execute(`WITH sources AS (
    SELECT n.id,n.created_at,n.provider_signed_at,
      CASE WHEN r.id IS NOT NULL THEN JSON_EXTRACT(r.snapshot_json,'$.metadataJson') ELSE n.metadata_json END AS approved_metadata
    FROM clinical_notes n
    LEFT JOIN clinical_note_revision_heads h ON h.clinical_note_id=n.id AND h.agency_id=n.agency_id
    LEFT JOIN clinical_note_revisions r ON r.id=h.effective_revision_id AND r.clinical_note_id=n.id AND r.agency_id=n.agency_id
    WHERE n.agency_id=? AND n.client_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL AND ${sharedNotePredicate('n')}
  ) SELECT id,provider_signed_at,
    COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(approved_metadata,'$.dateOfService')),'null'),DATE(created_at)) AS source_date,
    COALESCE(NULLIF(JSON_EXTRACT(approved_metadata,'$.smartNotes.mse'),'null'),NULLIF(JSON_EXTRACT(approved_metadata,'$.structuredChart.mentalStatusExam'),'null'),NULLIF(JSON_EXTRACT(approved_metadata,'$.csNoteBuild.mse'),'null'),NULLIF(JSON_EXTRACT(approved_metadata,'$.csNoteBuildState.mse'),'null'),NULLIF(JSON_EXTRACT(approved_metadata,'$.mentalStatusExam'),'null')) AS mse_json
    FROM sources WHERE COALESCE(JSON_UNQUOTE(JSON_EXTRACT(approved_metadata,'$.restricted')),'false') <> 'true'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(approved_metadata,'$.privatePsychotherapyNote')),'false') <> 'true'
      ${dateOfService ? "AND COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(approved_metadata,'$.dateOfService')),'null'),DATE(created_at)) <= ?" : ''}
    ORDER BY source_date DESC,id DESC LIMIT 30`, [agencyId, clientId, ...(dateOfService ? [dateOfService] : [])]);
  return (rows || []).map(row => ({ noteId: row.id, sourceDate: row.source_date instanceof Date ? row.source_date.toISOString().slice(0, 10) : String(row.source_date || '').slice(0, 10), mse: normalizeHistoricalMse(parsed(row.mse_json)) }))
    .filter(row => Object.keys(row.mse.domains || {}).length && (!dateOfService || row.sourceDate <= dateOfService));
}
