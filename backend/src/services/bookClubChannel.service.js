import { TEAM_EMPLOYEE_ROLES } from '../utils/presenceAudience.js';

export const BOOK_CLUB_CHANNEL_RULE = 'book_club_subscribers';

// The preference is the subscription source, not inherited club affiliation.
// Caller holds the tenant row lock so creation and participant reconciliation serialize.
export async function reconcileBookClubChannel(db, agencyId) {
  const [[club]] = await db.execute(
    `SELECT bc.id, bc.name, tenant.feature_flags
       FROM organization_affiliations oa
       JOIN agencies bc ON bc.id = oa.organization_id
       JOIN agencies tenant ON tenant.id = oa.agency_id
      WHERE oa.agency_id = ? AND oa.is_active = TRUE
        AND bc.organization_type = 'affiliation' AND bc.club_kind = 'book_club'
        AND COALESCE(bc.is_archived, 0) = 0 AND COALESCE(bc.is_active, 1) = 1
        AND COALESCE(tenant.is_active, 1) = 1 AND COALESCE(tenant.is_archived, 0) = 0
      ORDER BY bc.id LIMIT 1`, [agencyId]
  );
  let flags = club?.feature_flags || {};
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { flags = {}; } }
  const enabled = !!club && flags.bookClubEnabled === true;
  const [[existing]] = await db.execute(
    `SELECT id FROM chat_threads WHERE agency_id = ? AND thread_type = 'channel'
       AND membership_rule = ? LIMIT 1`, [agencyId, BOOK_CLUB_CHANNEL_RULE]
  );
  let threadId = existing?.id;
  if (!threadId && !enabled) return null;
  if (!threadId) {
    const [insert] = await db.execute(
      `INSERT INTO chat_threads
       (agency_id, organization_id, thread_type, name, slug, visibility, membership_rule)
       VALUES (?, ?, 'channel', ?, 'subscription-book-club', 'private', ?)`,
      [agencyId, club.id, club.name, BOOK_CLUB_CHANNEL_RULE]
    );
    threadId = insert.insertId;
  }
  await db.execute("UPDATE chat_threads SET visibility = 'private' WHERE id = ?", [threadId]);
  let subscribers = [];
  if (enabled) {
    const [rows] = await db.execute(
      `SELECT DISTINCT p.user_id
         FROM book_club_user_preferences p
         JOIN user_agencies ua ON ua.user_id = p.user_id AND ua.agency_id = p.tenant_agency_id
         JOIN users u ON u.id = p.user_id
        WHERE p.tenant_agency_id = ? AND p.interest_status = 'interested'
          AND COALESCE(ua.is_active, 1) = 1 AND COALESCE(u.is_active, 1) = 1
          AND COALESCE(u.is_archived, 0) = 0
          AND LOWER(TRIM(u.role)) IN (${TEAM_EMPLOYEE_ROLES.map(() => '?').join(',')})`,
      [agencyId, ...TEAM_EMPLOYEE_ROLES]
    );
    subscribers = rows.map(r => Number(r.user_id));
  }
  if (subscribers.length) {
    await db.execute(
      `DELETE FROM chat_thread_participants WHERE thread_id = ? AND user_id NOT IN (${subscribers.map(() => '?').join(',')})`,
      [threadId, ...subscribers]
    );
    await db.execute(
      `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES ${subscribers.map(() => '(?, ?)').join(',')}`,
      subscribers.flatMap(id => [threadId, id])
    );
  } else {
    await db.execute('DELETE FROM chat_thread_participants WHERE thread_id = ?', [threadId]);
  }
  return { threadId: Number(threadId), memberIds: subscribers };
}

export async function syncBookClubChannel(pool, agencyId, updateSubscription = null) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM agencies WHERE id = ? FOR UPDATE', [agencyId]);
    if (updateSubscription) await updateSubscription(db);
    const result = await reconcileBookClubChannel(db, agencyId);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}
