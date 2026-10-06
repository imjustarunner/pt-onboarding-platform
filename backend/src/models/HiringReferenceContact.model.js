import pool from '../config/database.js';

export async function listReferenceContacts(profileId, agencyId) {
  const [rows] = await pool.execute(`SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) AS author_name
    FROM hiring_reference_contacts c LEFT JOIN users u ON u.id = c.created_by_user_id
    WHERE c.hiring_profile_id = ? AND c.agency_id = ? ORDER BY c.created_at DESC, c.id DESC`, [profileId, agencyId]);
  return rows.map(row => ({ ...row, responses_json: typeof row.responses_json === 'string' ? JSON.parse(row.responses_json) : row.responses_json }));
}

export async function saveReferenceContact({ profileId, agencyId, userId, referenceIndex, method, outcome, note, responses, authorId }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [result] = await db.execute(`INSERT INTO hiring_reference_contacts
      (hiring_profile_id, agency_id, candidate_user_id, reference_index, contact_method, outcome, note, responses_json, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [profileId, agencyId, userId, referenceIndex, method, outcome, note, responses ? JSON.stringify(responses) : null, authorId]);
    if (outcome === 'completed') {
      // Close outstanding links so reminders stop after a phone reference is completed.
      await db.execute(`UPDATE hiring_reference_requests SET status = 'cancelled', updated_at = NOW()
        WHERE hiring_profile_id = ? AND agency_id = ? AND reference_index = ? AND status = 'sent'`, [profileId, agencyId, referenceIndex]);
    }
    await db.commit();
    return result.insertId;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

// Deliberately select a status-only projection. Never return answers, notes, or tracking tokens to applicants.
export async function applicantReferenceStatus(userId, agencyId) {
  const [rows] = await pool.execute(`SELECT reference_index, reference_name, status, completed_at, sent_at, token_expires_at AS deadline,
    'online' AS completion_method FROM hiring_reference_requests WHERE candidate_user_id = ? AND agency_id = ?
    UNION ALL
    SELECT reference_index, NULL AS reference_name, 'completed' AS status, created_at AS completed_at, NULL AS sent_at, NULL AS deadline,
    contact_method AS completion_method FROM hiring_reference_contacts WHERE candidate_user_id = ? AND agency_id = ? AND outcome = 'completed'`,
  [userId, agencyId, userId, agencyId]);
  const byIndex = new Map();
  for (const row of rows) {
    const current = byIndex.get(row.reference_index);
    if (!current || (row.status === 'completed' && current.status !== 'completed') ||
      (current.status !== 'completed' && new Date(row.completed_at || row.sent_at) > new Date(current.completed_at || current.sent_at))) byIndex.set(row.reference_index, row);
  }
  return [...byIndex.values()].map(row => ({ referenceIndex: row.reference_index, referenceName: row.reference_name,
    status: row.status === 'completed' ? 'completed' : row.status === 'sent' ? 'requested' : 'pending',
    completedAt: row.completed_at, completionMethod: row.status === 'completed' ? row.completion_method : null }));
}
