const asList = value => Array.isArray(value) ? value : value ? [value] : [];
const normalizedId = value => String(value || '').trim().toUpperCase();

export function matchPayerDirectory(source, directory) {
  const id = normalizedId(source.sourcePayerId);
  const exact = id ? directory.filter(p => normalizedId(p.payerid) === id) : [];
  const aliases = id && !exact.length ? directory.filter(p => asList(p.payer_alt_names)
    .some(a => normalizedId(a.alt_payerid) === id)) : [];
  const matches = exact.length ? exact : aliases;
  const match = matches.length === 1 ? matches[0] : null;
  return {
    ...source,
    claimmdPayerId: match?.payerid || null,
    directoryName: match?.payer_name || null,
    directoryStatus: !id ? 'manual_review' : exact.length === 1 ? 'id_match' : aliases.length === 1 ? 'alias_review' : 'not_found',
    capabilities: match ? Object.fromEntries(['1500_claims','era','eligibility','secondary_support'].map(k => [k, match[k] || 'unknown'])) : null
  };
}

export async function importPayerSetupCatalog({ agencies, payers, directory, actorUserId = null, apply = false }, db) {
  const rows = payers.map(p => matchPayerDirectory(p, directory));
  for (const agency of agencies) {
    const [[stored]] = await db.execute('SELECT id,slug FROM agencies WHERE id=?', [agency.id]);
    if (!stored || stored.slug !== agency.slug) throw new Error(`Agency identity mismatch for ${agency.id}`);
    const [[office]] = await db.execute('SELECT id FROM office_locations WHERE agency_id=? AND practice_npi=? AND is_active=1 AND use_as_billing_address=1 LIMIT 1', [agency.id, agency.npi]);
    if (!office) throw new Error(`Verify agency ${agency.id} billing NPI before import`);
  }
  if (!apply) return { agencies: agencies.map(a => a.id), rows, applied: false };
  await db.beginTransaction();
  try {
    for (const agency of agencies) for (const row of rows) {
      await db.execute('INSERT IGNORE INTO medical_payer_setup_requests (agency_id,payer_name,created_by_user_id) VALUES (?,?,?)', [agency.id,row.name,actorUserId]);
      const [[request]] = await db.execute('SELECT id FROM medical_payer_setup_requests WHERE agency_id=? AND payer_name=?', [agency.id,row.name]);
      await db.execute(`INSERT INTO medical_payer_setup_details
        (request_id,source_payer_id,claimmd_payer_id,directory_name,directory_status,directory_snapshot_json,source_names_json,review_note,directory_checked_at)
        VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE
        source_payer_id=VALUES(source_payer_id),claimmd_payer_id=VALUES(claimmd_payer_id),directory_name=VALUES(directory_name),
        directory_status=VALUES(directory_status),directory_snapshot_json=VALUES(directory_snapshot_json),source_names_json=VALUES(source_names_json),review_note=VALUES(review_note),directory_checked_at=UTC_TIMESTAMP()`,
        [request.id,row.sourcePayerId,row.claimmdPayerId,row.directoryName,row.directoryStatus,JSON.stringify(row.capabilities),JSON.stringify([row.name,...row.aliases]),row.reviewNote]);
    }
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  return { agencies: agencies.map(a => a.id), rows, applied: true };
}

export async function listPayerSetupRequests(agencyId, db) {
  try {
    const [rows] = await db.execute(`SELECT r.id,r.payer_name,r.created_at,d.source_payer_id,d.claimmd_payer_id,d.directory_name,d.directory_status,d.directory_snapshot_json,d.source_names_json,d.review_note,d.directory_checked_at
      FROM medical_payer_setup_requests r LEFT JOIN medical_payer_setup_details d ON d.request_id=r.id WHERE r.agency_id=? ORDER BY r.payer_name,r.id`, [agencyId]);
    return rows;
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    const [rows] = await db.execute('SELECT id,payer_name,created_at FROM medical_payer_setup_requests WHERE agency_id=? ORDER BY payer_name,id', [agencyId]);
    return rows;
  }
}
