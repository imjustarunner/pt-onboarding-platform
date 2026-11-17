const communal = ['schools','schoolreply','school_reply','school_support','school_groups','messages','system','notifications','noreply','support','payroll','billing','technology','compliance','admin','credentialing','medical_records','medicalrecords','hiring','intake','school_onboarding'];
function ownerCandidates(alias) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Invalid mailbox alias');
  const sharedKeys = communal.map(key => `'${key}'`).join(',');
  return `FROM users po JOIN user_agencies poa ON poa.user_id=po.id AND poa.agency_id=${alias}.agency_id
    WHERE LOWER(COALESCE(${alias}.identity_key,'')) NOT IN (${sharedKeys})
      AND LOWER(SUBSTRING_INDEX(COALESCE(${alias}.from_email,''),'@',1)) NOT IN (${sharedKeys})
      AND po.role NOT IN ('school_staff','client_guardian','guardian','client','athlete','assistant')
      AND LOWER(${alias}.from_email) IN (LOWER(po.email),LOWER(po.work_email),LOWER(po.username))`;
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
