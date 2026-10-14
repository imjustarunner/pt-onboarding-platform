// This marker can only be attached by server-side financial authorization.
// JSON request bodies, headers and JWT claims cannot manufacture a Symbol key.
const verifiedAgency = Symbol('verified billing agency');
export function grantVerifiedBillingScope(user, agencyId) {
  Object.defineProperty(user, verifiedAgency, { value: Number(agencyId), configurable: true });
}
export function hasVerifiedBillingScope(user, agencyId) {
  return Number(agencyId) > 0 && user?.[verifiedAgency] === Number(agencyId);
}
