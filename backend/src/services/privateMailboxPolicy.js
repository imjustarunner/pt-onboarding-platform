const communal = ['schools','schoolreply','school_reply','school_support','school_groups','messages','system','notifications','noreply','support','payroll','billing','technology','compliance','admin','credentialing','medical_records','medicalrecords','hiring','intake','school_onboarding'];
function ownerCandidates(alias) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Invalid mailbox alias');
  const sharedKeys = communal.map(key => `'${key}'`).join(',');
  return `FROM users po JOIN user_agencies poa ON poa.user_id=po.id AND poa.agency_id=${alias}.agency_id
    WHERE LOWER(COALESCE(${alias}.identity_key,'')) NOT IN (${sharedKeys})
      AND LOWER(SUBSTRING_INDEX(COALESCE(${alias}.from_email,''),'@',1)) NOT IN (${sharedKeys})
      AND po.role NOT IN ('school_staff','client_guardian','guardian','client','athlete','assistant')
      AND LOWER(${alias}.from_email) COLLATE utf8mb4_unicode_ci IN (LOWER(po.email),LOWER(po.work_email),LOWER(po.username))`;
}
// Historical login Groups may have been created as shared inboxes. Infer an
// owner only from an exact account address in that tenant, never a display name.
// Ambiguous ownership stays private and unavailable until it is resolved.
export function inferredMailboxOwnerSql(alias = 'i') {
  return `(SELECT MIN(po.id) ${ownerCandidates(alias)} HAVING COUNT(DISTINCT po.id)=1)`;
}
export function individualMailboxSql(alias = 'i') {
  return `(COALESCE(${alias}.kind,'')='personal' OR ${alias}.owner_user_id IS NOT NULL OR EXISTS (SELECT 1 ${ownerCandidates(alias)}))`;
}
export function privateMailboxProjectionSql(alias = 'i') {
  return `CASE WHEN ${individualMailboxSql(alias)} THEN 'personal' ELSE ${alias}.kind END AS kind,
    COALESCE(${alias}.owner_user_id,${inferredMailboxOwnerSql(alias)}) AS owner_user_id`;
}
export function privateMailboxVisibilitySql(userId, alias = 'i') {
  const uid = Number.isSafeInteger(Number(userId)) && Number(userId)>0 ? Number(userId) : 0;
  return `(NOT (${individualMailboxSql(alias)}) OR COALESCE(${alias}.owner_user_id,${inferredMailboxOwnerSql(alias)})=${uid})`;
}

// Resolve historical personal mailbox ownership once per mailbox, rather than
// scanning every agency member again for each conversation and badge predicate.
// DISTINCT owners preserves the existing rule that ambiguous matches stay private.
export function mailboxAccessCteSql() {
  const sharedKeys = communal.map(key => `'${key}'`).join(',');
  const addresses = ['email', 'work_email', 'username'].map(column => `
    SELECT po.id AS candidate_user_id,poa.agency_id,
      LOWER(po.${column}) COLLATE utf8mb4_unicode_ci AS address
    FROM users po JOIN user_agencies poa ON poa.user_id=po.id
    WHERE po.role NOT IN ('school_staff','client_guardian','guardian','client','athlete','assistant')
      AND po.${column} IS NOT NULL`).join(' UNION ALL ');
  return `mailbox_owner_addresses AS (${addresses}),
    mailbox_owner_matches AS (
      SELECT pi.id,MIN(oa.candidate_user_id) AS candidate_user_id,
        COUNT(DISTINCT oa.candidate_user_id) AS owner_count
      FROM communication_inboxes pi JOIN mailbox_owner_addresses oa
        ON oa.agency_id=pi.agency_id AND oa.address=LOWER(pi.from_email) COLLATE utf8mb4_unicode_ci
      WHERE LOWER(COALESCE(pi.identity_key,'')) NOT IN (${sharedKeys})
        AND LOWER(SUBSTRING_INDEX(COALESCE(pi.from_email,''),'@',1)) NOT IN (${sharedKeys})
      GROUP BY pi.id
    ),mailbox_access AS (
      SELECT bi.*,CASE WHEN mo.owner_count=1 THEN mo.candidate_user_id END AS inferred_owner_user_id,
        (COALESCE(bi.kind,'')='personal' OR bi.owner_user_id IS NOT NULL
          OR COALESCE(mo.owner_count,0)>0) AS individual_mailbox
      FROM communication_inboxes bi LEFT JOIN mailbox_owner_matches mo ON mo.id=bi.id
      LIMIT 18446744073709551615
    )`;
}

export function resolvedMailboxVisibilitySql(userId, alias = 'i') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Invalid mailbox alias');
  const uid = Number.isSafeInteger(Number(userId)) && Number(userId)>0 ? Number(userId) : 0;
  // A missing mailbox remains visible, as in the original EXISTS-based rule.
  return `(NOT (COALESCE(${alias}.individual_mailbox,0))
    OR COALESCE(${alias}.owner_user_id,${alias}.inferred_owner_user_id)=${uid})`;
}
