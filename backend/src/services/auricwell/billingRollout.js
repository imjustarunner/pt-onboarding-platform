import { pool } from './repository.js';
import { billingSetupEvidence } from '../billingSetupEvidence.service.js';
import { owningAgency } from './sharedPatients.js';
import { staffIdentity } from './sharedProviders.js';
import { requirePermission, requireCapability, requirePhi, fail, has } from './policy.js';
import { readProviderBillingRollout, billingRolloutProviders, saveProviderBillingRollout } from '../providerBillingRollout.service.js';

export async function billingRollout(ctx, input = null) {
  requirePermission(ctx, 'billing');
  requireCapability(ctx, 'billing');
  requirePhi(ctx);
  const agencyId = await owningAgency(ctx, pool);
  if (input) {
    requirePermission(ctx, 'admin');
    const actor = await staffIdentity(ctx, ctx.accountId, pool);
    if (!actor?.active) throw fail(403, 'Connect an active shared staff identity before managing billing rollout.');
    return { policy: await saveProviderBillingRollout({ agencyId, actorUserId: actor.userId, input }) };
  }
  const [policy, providers] = await Promise.all([readProviderBillingRollout(agencyId), billingRolloutProviders(agencyId)]);
  const evidence = await billingSetupEvidence(agencyId, providers, policy);
  return { policy, providers, evidence, canManage: has(ctx, 'admin') };
}
