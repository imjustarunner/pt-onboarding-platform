// These existing staff aliases became correspondence Groups. Authentication
// must continue using their verified original primary Workspace accounts.
// This does not infer account ownership from arbitrary group membership.
const migratedSubjects = Object.freeze({
  'michael@itsco.health': 'michael@plottwistco.com',
  'michael@nextleveluplcc.com': 'michael@plottwistco.com',
  'michael@innerstrengthin.com': 'michael@plottwistco.com',
  'loriana@itsco.health': 'loriana@plottwistco.com',
  'hannah@itsco.health': 'hannah@plottwistco.com',
  'kaitlyn@itsco.health': 'kaitlyn@plottwistco.com'
});
export function resolveWorkspaceSubject(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return migratedSubjects[normalized] || normalized;
}
