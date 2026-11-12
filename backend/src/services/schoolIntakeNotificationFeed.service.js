import pool from '../config/database.js';
import { decryptIntakeSubmissionClientRow } from '../models/IntakeSubmissionClient.model.js';

/** School notifications need identifiers, child/contact names and submission time, never private intake answers. */
export async function schoolIntakeNotificationFeed({ schoolOrganizationId, clientIds = null, db = pool }) {
  if (Array.isArray(clientIds) && !clientIds.length) return [];
  const ids = Array.isArray(clientIds) ? [...new Set(clientIds.map(Number).filter(id => id > 0))] : null;
  if (ids && !ids.length) return [];
  const params = [Number(schoolOrganizationId), ...(ids || [])];
  const [rows] = await db.execute(`SELECT s.id, s.submitted_at,
      COALESCE(isc.client_id, s.client_id) AS client_id,
      COALESCE(c.initials, isc.initials) AS client_initials,
      c.identifier_code AS client_identifier_code, isc.full_name,
      isc.pii_encrypted, isc.pii_iv_b64, isc.pii_auth_tag_b64, isc.pii_key_id,
      guardian.first_name AS signer_first_name, guardian.last_name AS signer_last_name
    FROM intake_submissions s
    JOIN intake_links l ON l.id = s.intake_link_id
    LEFT JOIN users guardian ON guardian.id = s.guardian_user_id
    LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
    LEFT JOIN clients c ON c.id = COALESCE(isc.client_id, s.client_id)
    WHERE l.organization_id = ?
      AND LOWER(COALESCE(l.scope_type, 'agency')) = 'school'
      AND LOWER(COALESCE(l.form_type, 'intake')) = 'intake'
      AND s.co_guardian_invite_id IS NULL
      AND s.submitted_at IS NOT NULL
      ${ids ? `AND COALESCE(isc.client_id, s.client_id) IN (${ids.map(() => '?').join(',')})` : ''}
    ORDER BY s.submitted_at DESC, s.id DESC, COALESCE(isc.client_id, s.client_id)
    LIMIT 200`, params);
  const seen = new Set();
  return rows.flatMap(row => {
    const key = `${row.id}:${Number(row.client_id) || 'unmatched'}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const child = decryptIntakeSubmissionClientRow({ ...row });
    const clientLabel = row.client_identifier_code || row.client_initials || 'Client';
    const actor = [row.signer_first_name, row.signer_last_name].filter(Boolean).join(' ') || 'Parent / guardian';
    return [{
      id: `intake_submitted:${key}`, kind: 'intake_packet_submitted', created_at: row.submitted_at,
      title: 'New student enrolled', message: `${clientLabel}: enrollment submitted via digital form`,
      actor_name: actor, client_full_name: child.full_name || null, client_id: Number(row.client_id) || null,
      client_initials: row.client_initials || null, client_identifier_code: row.client_identifier_code || null
    }];
  });
}
