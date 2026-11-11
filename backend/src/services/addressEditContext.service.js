// Reuse each existing editable form's token and write-phase checks. Address
// assistance never mints a credential, reads form answers, or writes a record.
const unavailable = (status = 404) => Object.assign(new Error('This address form is not available. Open its current link or enter the address manually.'), { status, code: 'ADDRESS_CONTEXT_UNAVAILABLE' });
function id(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function bound(context, key, actual) {
  if (context[key] != null && id(context[key]) !== id(actual)) throw unavailable();
}
async function checkMiddleware(middleware, req) {
  let allowed = false, error = null, status = 403;
  const response = { status(value) { status = value; return this; }, json() { return this; } };
  await middleware(req, response, failure => { if (failure) error = failure; else allowed = true; });
  if (error) throw error;
  if (!allowed) throw unavailable(status);
}

/** Return an app-server-only scope string; never return or forward the raw token. */
export async function validateAddressEditContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw unavailable();
  const kind = typeof context.kind === 'string' ? context.kind : '';
  const token = typeof context.token === 'string' ? context.token.trim() : '';
  if (!token || token.length > 512 || !['prehire', 'client-renewal', 'school-onboarding', 'school-reinit', 'adaptive-join'].includes(kind)) throw unavailable();

  if (kind === 'adaptive-join') {
    const { getAdaptiveAddressEditContext } = await import('./adaptiveIntake.service.js');
    const form = await getAdaptiveAddressEditContext(token, context.serviceType);
    if (!id(form?.agencyId) || !['counseling', 'tutoring', 'coaching', 'consulting'].includes(form?.serviceType)) throw unavailable();
    bound(context, 'agencyId', form.agencyId);
    return `adaptive-join:${form.agencyId}:${form.serviceType}`;
  }

  if (kind === 'prehire') {
    const { authenticatePrehireToken } = await import('../middleware/prehirePortalAuth.middleware.js');
    const { enforcePortalWritePhase } = await import('../middleware/portalWritePhase.middleware.js');
    // The only candidate address editor here is the pre-hire background form.
    // A valid but review-only/advanced portal link cannot reopen that form.
    const req = { params: { token }, headers: {}, query: {}, method: 'POST', path: '/background-check' };
    await checkMiddleware(authenticatePrehireToken, req);
    await checkMiddleware(enforcePortalWritePhase, req);
    const userId = id(req.portalUser?.id); if (!userId) throw unavailable();
    bound(context, 'userId', userId);
    return `prehire:${userId}:background-check`;
  }

  if (kind === 'client-renewal') {
    const { getRenewalByToken } = await import('./clientRenewal.service.js');
    const renewal = await getRenewalByToken(token);
    // These are the same status/option gates as submitVerifyContact. Completed
    // renewals retain that existing contact-edit behavior; opted-out/cancelled do not.
    if (!renewal || !['draft', 'sent', 'in_progress', 'completed'].includes(String(renewal.status))
      || ![true, 1, '1'].includes(renewal.option_verify_contact)
      || !id(renewal.id) || !id(renewal.client_id) || !id(renewal.agency_id)) throw unavailable();
    bound(context, 'clientId', renewal.client_id); bound(context, 'agencyId', renewal.agency_id);
    return `client-renewal:${renewal.id}:${renewal.agency_id}:${renewal.client_id}`;
  }

  if (kind === 'school-onboarding') {
    const { default: Invite } = await import('../models/SchoolOnboardingInvite.model.js');
    const { isInviteUsable } = await import('./schoolOnboarding.service.js');
    const invite = await Invite.findByToken(token);
    const usable = isInviteUsable(invite);
    if (!usable.ok || usable.submitted || !id(invite?.id) || !id(invite?.agency_id) || !id(invite?.school_organization_id)) throw unavailable();
    bound(context, 'agencyId', invite.agency_id); bound(context, 'schoolOrganizationId', invite.school_organization_id);
    return `school-onboarding:${invite.id}:${invite.agency_id}:${invite.school_organization_id}`;
  }

  const { validateToken, resolveTokenCycle } = await import('./schoolReinit.service.js');
  const { assertAnnualWrite } = await import('./schoolYearUpdateAccess.service.js');
  const result = await validateToken(token);
  if (!result?.valid || !result.row || result.row.locked_at) throw unavailable();
  const cycle = await resolveTokenCycle(result.row);
  if (!cycle || cycle.status === 'finalized' || !id(cycle.id) || !id(cycle.agency_id) || !id(cycle.school_organization_id)
    || id(cycle.id) !== id(result.row.cycle_id)
    || id(cycle.agency_id) !== id(result.row.agency_id)
    || id(cycle.school_organization_id) !== id(result.row.school_organization_id)) throw unavailable();
  // Preserve annual rollout, school-year, first-year and deadline restrictions.
  await assertAnnualWrite(cycle);
  bound(context, 'agencyId', cycle.agency_id); bound(context, 'schoolOrganizationId', cycle.school_organization_id);
  return `school-reinit:${cycle.id}:${cycle.agency_id}:${cycle.school_organization_id}`;
}
