import pool from '../config/database.js';
import { getDigest } from './workplaceHandbook.service.js';

// Some monthly updates were communicated through a provider push before the
// handbook edition was formally published. Keep those months readable too.
const communicated = `EXISTS (
  SELECT 1 FROM provider_update_pushes p
  WHERE p.agency_id = d.agency_id AND p.sent_at IS NOT NULL
    AND (p.id = d.provider_update_push_id OR p.attached_admin_update_id = d.admin_update_id)
)`;

export async function listHandbookHistory(agencyId, { includeDrafts = false, digestId = null } = {}) {
  const params = [Number(agencyId)];
  if (digestId !== null) params.push(Number(digestId));
  const [rows] = await pool.execute(`SELECT d.id, d.title, d.period_label, d.status, d.published_at,
      d.created_at, ${communicated} AS communicated,
      (SELECT COUNT(*) FROM workplace_handbook_digest_entries e WHERE e.digest_id = d.id AND e.agency_id = d.agency_id) AS entry_count
    FROM workplace_handbook_digests d
    WHERE d.agency_id = ? ${digestId !== null ? 'AND d.id = ?' : ''}
      ${includeDrafts ? '' : `AND (d.status = 'published' OR ${communicated})`}
    ORDER BY COALESCE(d.published_at, d.created_at) DESC, d.id DESC`, params);
  return (rows || []).map(row => ({ ...row, availability: row.status === 'published' ? 'Published' : Number(row.communicated) ? 'Communicated update' : 'Draft · Not published' }));
}

export async function readHandbookHistory(agencyId, digestId, options = {}) {
  if (!Number.isSafeInteger(Number(digestId)) || Number(digestId) <= 0) throw Object.assign(new Error('Update not found'), { status: 404 });
  const [summary] = await listHandbookHistory(agencyId, { ...options, digestId });
  if (!summary) throw Object.assign(new Error('Update not found'), { status: 404 });
  const result = await getDigest(digestId, agencyId);
  if (!result) throw Object.assign(new Error('Update not found'), { status: 404 });
  // Return reader metadata, not administrative notes or push configuration.
  return { ...result, digest: summary };
}
