/**
 * Summit Stats: strict removal of a member's club-scoped challenge data while merging
 * aggregates into summit_stats_club_erasure_retained_totals (club-facing totals stay flat).
 * Used on full account deletion — not exposed as a per-club self-serve endpoint.
 */
import {
  computeErasureDeltaForUserClub,
  mergeRetainedTotals,
  saveRetainedTotalsForClub
} from '../utils/summitClubErasureRetainedTotals.js';
import { sqlAffiliationUnderSummitPlatform } from '../utils/summitPlatformClubs.js';

/**
 * Affiliation clubs under the Summit platform where this user has workouts and/or membership.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} userId
 */
export async function listSummitAffiliationClubIdsForUser(conn, userId) {
  const { getPlatformAgencyIds } = await import('../controllers/summitStats.controller.js');
  const platformIds = await getPlatformAgencyIds(null);
  const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);
  let sql = `SELECT DISTINCT a.id AS id FROM agencies a WHERE a.id IN (
      SELECT c.organization_id FROM challenge_workouts w
      INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
      WHERE w.user_id = ?
      UNION
      SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = ?
    ) AND LOWER(COALESCE(a.organization_type,'')) = 'affiliation'`;
  const params = [userId, userId];
  if (plat) {
    sql += plat.sql;
    params.push(...plat.params);
  }
  const [rows] = await conn.execute(sql, params);
  return (rows || []).map((r) => Number(r.id)).filter((id) => id > 0);
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} userId
 * @param {number} clubId
 */
export async function assertNotSoleSummitClubManager(conn, userId, clubId) {
  const [uaRows] = await conn.execute(
    `SELECT COALESCE(club_role,'member') AS club_role FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [userId, clubId]
  );
  if (!uaRows?.length) return;
  const cr = String(uaRows[0].club_role || 'member').toLowerCase();
  if (cr !== 'manager') return;
  const [mc] = await conn.execute(
    `SELECT COUNT(*) AS n FROM user_agencies
     WHERE agency_id = ? AND COALESCE(is_active,1) = 1 AND LOWER(COALESCE(club_role,'member')) = 'manager'`,
    [clubId]
  );
  if (Number(mc[0]?.n) <= 1) {
    const err = new Error(
      'You are the only manager of at least one Summit club. Assign another manager before deleting your account.'
    );
    err.code = 'SOLE_MANAGER';
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Must run inside an open transaction. Caller serializes per club (e.g. multiple calls in one tx).
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} clubId
 * @param {number} userId
 */
export async function strictEraseSummitUserClubInTx(conn, clubId, userId) {
  await conn.execute('SELECT id FROM agencies WHERE id = ? FOR UPDATE', [clubId]);

  const delta = await computeErasureDeltaForUserClub(clubId, userId, conn);
  const [retRows] = await conn.execute(
    'SELECT totals_json FROM summit_stats_club_erasure_retained_totals WHERE agency_id = ? FOR UPDATE',
    [clubId]
  );
  const merged = mergeRetainedTotals(retRows?.[0]?.totals_json, delta);
  try {
    await saveRetainedTotalsForClub(clubId, merged, conn);
  } catch (saveErr) {
    if (saveErr?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error(
        'Account deletion requires database migration summit_stats_club_erasure_retained_totals (club totals retention).'
      );
      err.code = 'RETAINED_TOTALS_MIGRATION';
      err.statusCode = 503;
      throw err;
    }
    throw saveErr;
  }

  await conn.execute(
    `DELETE k FROM challenge_workout_kudos k
     INNER JOIN challenge_workouts w ON w.id = k.workout_id
     INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
     WHERE c.organization_id = ?
       AND (w.user_id = ? OR k.giver_user_id = ? OR k.receiver_user_id = ?)`,
    [clubId, userId, userId, userId]
  );
  await conn.execute(
    `DELETE r FROM challenge_workout_reactions r
     INNER JOIN challenge_workouts w ON w.id = r.workout_id
     INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
     WHERE c.organization_id = ? AND (w.user_id = ? OR r.user_id = ?)`,
    [clubId, userId, userId]
  );

  try {
    await conn.execute(
      `DELETE com FROM challenge_workout_comments com
       INNER JOIN learning_program_classes c ON c.id = com.learning_class_id
       WHERE com.user_id = ? AND c.organization_id = ?`,
      [userId, clubId]
    );
  } catch (ce) {
    if (ce?.code !== 'ER_NO_SUCH_TABLE') throw ce;
  }

  await conn.execute(
    `UPDATE user_photos up
     INNER JOIN challenge_workouts w ON w.id = up.source_ref_id AND up.source = 'workout_screenshot'
     INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
     SET up.is_active = 0
     WHERE up.user_id = ? AND w.user_id = ? AND c.organization_id = ?`,
    [userId, userId, clubId]
  );
  try {
    await conn.execute(
      `UPDATE user_photos up
       INNER JOIN challenge_workout_media m ON m.id = up.source_ref_id AND up.source = 'workout_media'
       INNER JOIN challenge_workouts w ON w.id = m.workout_id
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       SET up.is_active = 0
       WHERE up.user_id = ? AND w.user_id = ? AND c.organization_id = ?`,
      [userId, userId, clubId]
    );
  } catch (me) {
    if (me?.code !== 'ER_BAD_FIELD_ERROR' && me?.code !== 'ER_NO_SUCH_TABLE') throw me;
  }

  try {
    await conn.execute('DELETE FROM challenge_custom_field_values WHERE agency_id = ? AND user_id = ?', [
      clubId,
      userId
    ]);
  } catch (cfe) {
    if (cfe?.code !== 'ER_NO_SUCH_TABLE') throw cfe;
  }

  try {
    await conn.execute(
      `DELETE r FROM club_feed_post_reads r
       INNER JOIN club_feed_posts p ON p.id = r.post_id
       WHERE r.user_id = ? AND p.agency_id = ?`,
      [userId, clubId]
    );
    await conn.execute('DELETE FROM club_feed_posts WHERE agency_id = ? AND user_id = ?', [clubId, userId]);
  } catch (fe) {
    if (fe?.code !== 'ER_NO_SUCH_TABLE') throw fe;
  }

  try {
    await conn.execute('DELETE FROM summit_stats_season_join_requests WHERE agency_id = ? AND user_id = ?', [
      clubId,
      userId
    ]);
  } catch (je) {
    if (je?.code !== 'ER_NO_SUCH_TABLE') throw je;
  }

  await conn.execute(
    `DELETE w FROM challenge_workouts w
     INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
     WHERE w.user_id = ? AND c.organization_id = ?`,
    [userId, clubId]
  );

  const [classIds] = await conn.execute('SELECT id FROM learning_program_classes WHERE organization_id = ?', [
    clubId
  ]);
  if (classIds?.length) {
    const ids = classIds.map((row) => Number(row.id)).filter((id) => id > 0);
    const ph = ids.map(() => '?').join(',');
    await conn.execute(
      `DELETE FROM challenge_participant_profiles
       WHERE provider_user_id = ? AND learning_class_id IN (${ph})`,
      [userId, ...ids]
    );
  }

  try {
    await conn.execute('DELETE FROM challenge_member_applications WHERE user_id = ? AND agency_id = ?', [
      userId,
      clubId
    ]);
  } catch (ae) {
    if (ae?.code !== 'ER_NO_SUCH_TABLE') throw ae;
  }

  await conn.execute(
    `DELETE tm FROM challenge_team_members tm
     INNER JOIN challenge_teams t ON t.id = tm.team_id
     INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
     WHERE tm.provider_user_id = ? AND c.organization_id = ?`,
    [userId, clubId]
  );
  await conn.execute(
    `DELETE m FROM learning_class_provider_memberships m
     INNER JOIN learning_program_classes c ON c.id = m.learning_class_id
     WHERE m.provider_user_id = ? AND c.organization_id = ?`,
    [userId, clubId]
  );
  await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [userId, clubId]);
}

/**
 * All Summit / SSTC challenge data for this user (retained totals + deletes).
 * Caller decides whether to archive the user row based on remaining `user_agencies`.
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} userId
 * @returns {Promise<{ erasedClubCount: number }>}
 */
export async function runSummitStrictErasureForAccountDeletion(pool, userId) {
  const conn = await pool.getConnection();
  try {
    const clubIds = await listSummitAffiliationClubIdsForUser(conn, userId);
    for (const clubId of clubIds) {
      await assertNotSoleSummitClubManager(conn, userId, clubId);
    }
    if (!clubIds.length) {
      return { erasedClubCount: 0 };
    }

    await conn.beginTransaction();
    try {
      for (const clubId of clubIds) {
        await strictEraseSummitUserClubInTx(conn, clubId, userId);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }
    return { erasedClubCount: clubIds.length };
  } finally {
    conn.release();
  }
}
