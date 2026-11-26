import { readHireFingerprintingScreenshot } from '../services/hireFingerprintingGuide.service.js';
import { denverFingerprintingStep } from '../../../frontend/src/navigation/hireDocuments.js';

async function send(res, agencyId, screenshotId) {
  const image = await readHireFingerprintingScreenshot(agencyId, screenshotId);
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.type('image/png').send(image);
}

// The contracts router has already checked hiring capability and organization membership.
export async function staffFingerprintingScreenshot(req, res, next) {
  try {
    const agencyId = Number(req.query?.agencyId || req.user?.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId <= 0) throw Object.assign(new Error('Organization is required.'), { status: 400 });
    await send(res, agencyId, req.params.screenshotId);
  } catch (error) { next(error); }
}

// The pre-hire router validates the candidate token before reaching this handler.
export async function portalFingerprintingScreenshot(req, res, next) {
  try {
    const { portalStateForUser } = await import('./prehirePortal.controller.js');
    const state = await portalStateForUser(req.portalUser.id);
    const assigned = state.workflow?.steps?.pre_hire?.some(step => step.kind === 'fingerprinting' && step.key === denverFingerprintingStep.id);
    if (!assigned) throw Object.assign(new Error('This fingerprinting lesson is not assigned to your package.'), { status: 403 });
    await send(res, state.agency.id, req.params.screenshotId);
  } catch (error) { next(error); }
}
