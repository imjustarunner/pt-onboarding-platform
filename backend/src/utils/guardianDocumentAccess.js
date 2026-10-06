export function guardianCanReadIntakeDocuments(link) {
  if (Number(link?.access_enabled) !== 1) return false;
  let permissions = link?.permissions_json || {};
  if (typeof permissions === 'string') {try {permissions=JSON.parse(permissions);}catch{return false;}}
  return !permissions.noView && !permissions.noViewOtherGuardian && permissions.canViewDocs !== false;
}
