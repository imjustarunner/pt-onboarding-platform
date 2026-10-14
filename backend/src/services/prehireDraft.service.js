import pool from '../config/database.js';
const fields = ['contract', 'contractOverrides', 'agreementVariant', 'contractConfigId', 'officeLocationId', 'includeSupervisor', 'signerAssignments', 'adhocSignerUserId', 'prehirePackageId', 'packetTemplateId', 'portalWorkflow', 'jobDocs', 'extraFiles', 'setupStep'];
export function sanitizePrehireDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('A pre-hire draft is required.'), { status: 400 });
  const draft = Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  // Review approvals, generated HTML, invitation tokens, and browser File objects are never persisted.
  if (Array.isArray(draft.extraFiles)) draft.extraFiles = draft.extraFiles.map(({ id, name, title }) => ({ id, name, title }));
  const json = JSON.stringify(draft);
  if (Buffer.byteLength(json) > 200000) throw Object.assign(new Error('This pre-hire draft is too large.'), { status: 400 });
  return JSON.parse(json);
}
export async function getPrehireDraft(agencyId, candidateUserId) {
  const [rows] = await pool.execute('SELECT draft_json, revision, updated_at FROM hiring_prehire_drafts WHERE agency_id = ? AND candidate_user_id = ?', [agencyId, candidateUserId]);
  const row = rows[0];
  return row ? { draft: typeof row.draft_json === 'string' ? JSON.parse(row.draft_json) : row.draft_json, revision: Number(row.revision), updatedAt: row.updated_at } : { draft: null, revision: 0 };
}
export async function savePrehireDraft({ agencyId, candidateUserId, userId, draft, revision }) {
  if (!Number.isInteger(revision) || revision < 0) throw Object.assign(new Error('A valid draft revision is required.'), { status: 400 });
  const json = JSON.stringify(sanitizePrehireDraft(draft));
  const conflict = () => Object.assign(new Error('This pre-hire draft was changed in another window. Reopen it to load the latest saved progress.'), { status: 409 });
  if (!revision) {
    try {
      await pool.execute('INSERT INTO hiring_prehire_drafts (agency_id, candidate_user_id, draft_json, revision, updated_by_user_id) VALUES (?, ?, ?, 1, ?)', [agencyId, candidateUserId, json, userId]);
    } catch (error) { if (error.code === 'ER_DUP_ENTRY') throw conflict(); throw error; }
  } else {
    const [result] = await pool.execute('UPDATE hiring_prehire_drafts SET draft_json = ?, revision = revision + 1, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ? AND candidate_user_id = ? AND revision = ?', [json, userId, agencyId, candidateUserId, revision]);
    if (!result.affectedRows) throw conflict();
  }
  return { revision: revision + 1 };
}
