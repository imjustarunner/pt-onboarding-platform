const fail = message => Object.assign(new Error(message), { status: 409 });

// Include legacy primary organizations: older summer enrollments may have no
// row in client_organization_assignments yet.
export async function listMergeAffiliations(database, clientIds) {
  const ids = [...new Set(clientIds.map(Number))];
  const marks = ids.map(() => '?').join(',');
  const [rows] = await database.execute(`SELECT coa.client_id, coa.organization_id,
    coa.is_primary, coa.is_active, org.name AS organization_name, org.organization_type
    FROM client_organization_assignments coa JOIN agencies org ON org.id=coa.organization_id
    WHERE coa.client_id IN (${marks})`, ids);
  const [legacy] = await database.execute(`SELECT c.id AS client_id, c.organization_id,
    TRUE AS is_primary, TRUE AS is_active, org.name AS organization_name, org.organization_type
    FROM clients c JOIN agencies org ON org.id=c.organization_id
    WHERE c.id IN (${marks})`, ids);
  const result = new Map(rows.map(row => [`${row.client_id}:${row.organization_id}`, row]));
  for (const row of legacy) {
    const key = `${row.client_id}:${row.organization_id}`;
    if (!result.has(key)) result.set(key, row);
    else if(Number(result.get(key).is_active)===1)result.get(key).is_primary=true;
  }
  return [...result.values()];
}

export function buildMergedAffiliations({ affiliations, keepId, completedOrganizationIds = [] }) {
  const completed = new Set(completedOrganizationIds.map(Number));
  for (const id of completed) {
    const matches = affiliations.filter(row => Number(row.organization_id) === id);
    if (!matches.length || matches.some(row => !['program', 'clinical'].includes(String(row.organization_type).toLowerCase()))) {
      throw fail('Only a program on these client records can be marked completed during this merge.');
    }
    if (matches.some(row => Number(row.client_id) === Number(keepId) && Number(row.is_primary) === 1)) {
      throw fail('Keep an active school or office record before completing its prior program affiliation.');
    }
  }
  const merged = new Map();
  for (const row of affiliations) {
    const id = Number(row.organization_id), current = merged.get(id);
    const active = completed.has(id) ? false : Number(row.is_active) === 1 || !!current?.is_active;
    merged.set(id, { ...row, organization_id:id, is_active:active,
      is_primary:active && ((Number(row.client_id) === Number(keepId) && Number(row.is_primary) === 1) || !!current?.is_primary) });
  }
  return [...merged.values()];
}

export async function preserveMergedAffiliations({ database, keepId, sourceIds, completedOrganizationIds = [], actorUserId = null }) {
  const affiliations = await listMergeAffiliations(database, [keepId, ...sourceIds]);
  const merged = buildMergedAffiliations({ affiliations, keepId, completedOrganizationIds });
  for (const row of merged) {
    await database.execute(`INSERT INTO client_organization_assignments
      (client_id,organization_id,is_primary,is_active) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE is_primary=VALUES(is_primary),is_active=VALUES(is_active)`,
    [keepId,row.organization_id,row.is_primary ? 1 : 0,row.is_active ? 1 : 0]);
  }
  for (const id of [...new Set(completedOrganizationIds.map(Number))]) {
    await database.execute(`INSERT INTO client_status_history
      (client_id,changed_by_user_id,field_changed,from_value,to_value,note)
      VALUES (?,?,'completed_program_affiliation',?,'completed','Prior program retained during reviewed duplicate merge')`,
    [keepId,actorUserId,String(id)]);
  }
  return merged;
}
