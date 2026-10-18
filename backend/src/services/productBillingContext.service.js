// Request-local capability issued only by a trusted product adapter after checking
// its own authenticated permissions and active canonical practice membership.
// Object identity is intentional: body fields, tokens and cloned users cannot mint it.
const contexts = new WeakMap();
export function createAuricwellBillingActor(user, agencyId) {
  if (!Number.isSafeInteger(Number(user?.id)) || Number(user.id) < 1 || !Number.isSafeInteger(agencyId) || agencyId < 1)
    throw new Error('A canonical actor and owning agency are required.');
  const actor = Object.freeze({ id: Number(user.id), role: user.role, first_name: user.first_name, last_name: user.last_name });
  contexts.set(actor, Object.freeze({ product: 'auricwell_ehr', agencyId }));
  return actor;
}
export function productBillingContext(user) {
  return user && typeof user === 'object' ? contexts.get(user) || null : null;
}
