import { AsyncLocalStorage } from 'node:async_hooks';
import { applyAgencyAccess } from './agencyAccessPolicy.js';
import { readAgencyAccess } from '../services/agencyAccessProfiles.service.js';
const context = new AsyncLocalStorage();
export const runWithAgencyAccess = (agencyId, work, initial = {}) => context.run({ agencyId: Number(agencyId) || null,
  access:new Map(initial.userId && initial.access ? [[Number(initial.userId),Promise.resolve(initial.access)]] : []) }, work);
export const currentAccessAgencyId = () => context.getStore()?.agencyId || null;

// Existing controller/service callers of User.findById must not accidentally
// re-elevate an employee by reloading their legacy global role or flags.
export async function userInCurrentAgency(user) {
  const initial=context.getStore()?.access.get(Number(user?.id));
  if (initial) return applyAgencyAccess(user,await initial);
  const agencyId = currentAccessAgencyId();
  if (!agencyId || !user?.id) return user;
  const cache=context.getStore().access;
  if (!cache.has(Number(user.id))) cache.set(Number(user.id),readAgencyAccess(user.id,agencyId));
  return applyAgencyAccess(user, await cache.get(Number(user.id)));
}
