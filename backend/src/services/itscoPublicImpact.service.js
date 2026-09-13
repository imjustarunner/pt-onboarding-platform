// Pool injection keeps the public total and its transactional baseline testable without app credentials.
export async function readItscoImpact(db, { agencyId, schoolIds }) {
  const [[row]] = await db.execute(`SELECT settings.baseline_at,
    settings.student_total + (SELECT COUNT(DISTINCT c.id)
      FROM clients c JOIN client_organization_assignments coa ON coa.client_id = c.id
      WHERE coa.organization_id IN (${schoolIds.length ? schoolIds.map(() => '?').join(',') : 'NULL'})
        AND c.agency_id = settings.agency_id AND COALESCE(c.is_demo, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM agency_public_impact_baseline_clients old
          WHERE old.agency_id = settings.agency_id AND old.client_id = c.id)) AS total
    FROM agency_public_impact_settings settings WHERE settings.agency_id = ?`, [...schoolIds, agencyId]);
  return row ? { total: Number(row.total), baselineAt: row.baseline_at } : null;
}

export async function writeItscoImpactBaseline(db, { agencyId, schoolIds, total, actorId }) {
  if (!Number.isSafeInteger(total) || total < 0 || total > 100000000) throw new Error('Invalid student total');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // This row lock serializes baseline resets; readers see the old or the new complete snapshot.
    await connection.execute(`INSERT INTO agency_public_impact_settings (agency_id, student_total, baseline_at, updated_by_user_id)
      VALUES (?, ?, CURRENT_TIMESTAMP(6), ?) ON DUPLICATE KEY UPDATE student_total = VALUES(student_total),
      baseline_at = VALUES(baseline_at), updated_by_user_id = VALUES(updated_by_user_id)`, [agencyId, total, actorId]);
    await connection.execute('DELETE FROM agency_public_impact_baseline_clients WHERE agency_id = ?', [agencyId]);
    if (schoolIds.length) await connection.execute(`INSERT INTO agency_public_impact_baseline_clients (agency_id, client_id)
      SELECT DISTINCT c.agency_id, c.id FROM clients c JOIN client_organization_assignments coa ON coa.client_id = c.id
      WHERE c.agency_id = ? AND COALESCE(c.is_demo, 0) = 0
        AND coa.organization_id IN (${schoolIds.map(() => '?').join(',')})`, [agencyId, ...schoolIds]);
    await connection.commit();
  } catch (e) { await connection.rollback(); throw e; }
  finally { connection.release(); }
}
