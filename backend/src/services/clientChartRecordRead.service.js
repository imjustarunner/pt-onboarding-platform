import pool from '../config/database.js';
import {decryptDemographicsPayload} from './demographicsImport.service.js';

export const chartRecordContext = ({ agencyId, clientId }, section, owner) => `${agencyId}:${clientId}:${section}:${owner}`;

export async function readChartRecord(scope, section, owner = 0, db = pool) {
  const [rows] = await db.execute('SELECT payload_enc,revision FROM client_chart_import_records WHERE agency_id=? AND client_id=? AND section_key=? AND owner_user_id=?', [scope.agencyId, scope.clientId, section, owner]);
  if (!rows[0]) return { value: null, revision: 0 };
  const envelope = decryptDemographicsPayload(rows[0].payload_enc);
  if (envelope.context !== chartRecordContext(scope, section, owner)) throw new Error('Chart record context mismatch');
  return { value: envelope.value, revision: rows[0].revision };
}


export function insuranceDraftSlots(value) {
  if (!value || value.coverageMode === 'self_pay') return {};
  return value.coverageDrafts || { [value.position === 'secondary' ? 'secondary' : 'primary']: value };
}

export function billingHandoffTaskIds(value, handoffs) {
  return Object.fromEntries(Object.entries(insuranceDraftSlots(value))
    .filter(([position, draft]) => draft.text?.trim() && draft.text.trim() === handoffs?.[position]?.text && handoffs[position].taskId)
    .map(([position]) => [position, handoffs[position].taskId]));
}
