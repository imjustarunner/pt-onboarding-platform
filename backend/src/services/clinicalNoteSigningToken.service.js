import clinicalPool from '../config/clinicalDatabase.js';
import { clinicalNoteSnapshotHash } from './clinicalNoteVersion.service.js';

export const CLINICAL_SIGNER_ROLES = new Set(['provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','admin','agency_admin','super_admin','superadmin']);
export function assertClinicalSigner(user) {
  if (!CLINICAL_SIGNER_ROLES.has(String(user?.role || user?.effectiveRole || '').toLowerCase())) throw Object.assign(new Error('A currently authorized clinical signer is required.'), {status:403});
}
export async function withClinicalSigningToken(note, source=clinicalPool) {
  if (!note || note.provider_signed_at) return note;
  const [[session]] = note.clinical_session_id ? await source.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?',[note.clinical_session_id,note.agency_id,note.client_id]) : [[{}]];
  if (note.clinical_session_id && !session) throw Object.assign(new Error('The linked encounter is unavailable. Reload before signing.'),{status:409});
  return {...note,signingToken:clinicalNoteSnapshotHash(note,session || {})};
}
