import { pool } from './repository.js';
import { owningAgency } from './sharedPatients.js';
import { staffIdentity } from './sharedProviders.js';
import { requirePermission, requireCapability, requirePhi, fail } from './policy.js';
import { assertMedicalBillingFlag } from '../medicalBillingFlags.service.js';
import { createAuricwellBillingActor } from '../productBillingContext.service.js';
import { billingWorkspace } from '../claimMdWorkspace.service.js';
import { billingRollout } from './billingRollout.js';

// A narrow transport adapter for the existing shared claim domain. No product claim
// copies, role impersonation, credentials, or clearinghouse payloads are created here.
const routes = [
  ['GET', /^workspace$/, 'workspace'],
  ['GET', /^provider-rollout$/, 'rollout'],
  ['PUT', /^provider-rollout$/, 'rollout'],
  ['GET', /^claims\/undrafted-notes$/, 'listUndraftedNotes'],
  ['POST', /^claims$/, 'createMedicalClaim'],
  ['GET', /^claimmd\/payers$/, 'searchClaimMdPayers'],
  ['GET', /^claimmd\/enrollments$/, 'listClaimMdEnrollments'],
  ['POST', /^claimmd\/enrollments$/, 'startClaimMdEnrollment'],
  ['GET', /^claimmd\/billing-offices$/, 'listClaimMdOffices'],
  ['POST', /^claimmd\/responses\/sync$/, 'refreshClaimMdResponses'],
  ['GET', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/review$/, 'reviewClaim'],
  ['GET', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/history$/, 'claimHistory'],
  ['GET', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/draft$/, 'claimDraft'],
  ['PATCH', /^claimmd\/claims\/(?<claimId>[1-9]\d*)$/, 'correctClaim'],
  ['POST', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/submit$/, 'submitClaimToClaimMd'],
  ['POST', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/ai-review$/, 'runClaimAiReview'],
  ['POST', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/ai-findings\/resolve$/, 'resolveClaimAiFinding'],
  ['GET', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/service-changes$/, 'getClaimServiceChanges'],
  ['POST', /^claimmd\/claims\/(?<claimId>[1-9]\d*)\/service-changes\/(?<requestId>[1-9]\d*)\/resolve$/, 'resolveClaimServiceChange'],
];
const dependencies = {
  pool, owningAgency, staffIdentity, workspace: billingWorkspace, rollout: billingRollout,
  controllers: async () => ({ ...await import('../../controllers/claimMdWorkflow.controller.js'), ...await import('../../controllers/medicalBilling.controller.js') }),
};

export async function sharedBilling(ctx, { method, path, query = {}, body = {} }, deps = dependencies) {
  requirePermission(ctx, 'billing');
  requireCapability(ctx, 'billing');
  requirePhi(ctx);
  const route = routes.find(([verb, pattern]) => verb === method && pattern.test(path));
  if (!route) throw fail(404, 'Billing operation not available.');
  const agencyId = await deps.owningAgency(ctx, deps.pool);
  for (const source of [query, body]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw fail(400, 'Invalid billing request.');
    if (source.agencyId != null && Number(source.agencyId) !== agencyId) throw fail(403, 'Billing is limited to this practice.');
  }
  const identity = await deps.staffIdentity(ctx, ctx.accountId, deps.pool);
  if (!identity?.active) throw fail(403, 'Connect an active shared staff identity before using billing.');
  const [[user]] = await deps.pool.execute('SELECT id, role, first_name, last_name FROM users WHERE id = ?', [identity.userId]);
  if (!user) throw fail(403, 'Shared staff identity is unavailable.');
  const [[agency]] = await deps.pool.execute('SELECT feature_flags FROM agencies WHERE id = ? AND is_active = 1', [agencyId]);
  if (!agency) throw fail(403, 'The billing practice is inactive.');
  assertMedicalBillingFlag(agency);
  // Product billing permission was authenticated above. Carry that grant by object
  // identity, for this request and practice only; never change the user's shared role.
  const actor = createAuricwellBillingActor(user, agencyId);
  const operation = route[2];
  if (operation === 'workspace') return { status: 200, data: await deps.workspace(actor, { ...query, agencyId }) };
  if (operation === 'rollout') return { status: 200, data: await deps.rollout(ctx, method === 'PUT' ? body : null) };
  // This transition keeps the existing ERA receiver. Claims enrollment is separate.
  if (operation === 'startClaimMdEnrollment' && body.enrollmentType === 'era')
    throw fail(409, 'ERA delivery stays with TherapyNotes. Manage any routing change separately.');
  const params = { ...route[1].exec(path).groups };
  if (Object.values(params).some(value => !Number.isSafeInteger(Number(value)))) throw fail(400, 'Invalid billing record ID.');
  const controller = (await deps.controllers())[operation];
  let result;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { result = { status: this.statusCode, data }; return this; } };
  await controller({ user: actor, params, query: { ...query, agencyId }, body: { ...body, agencyId } }, res, error => { throw error; });
  if (!result) throw fail(500, 'Billing did not return a response.');
  return result;
}
