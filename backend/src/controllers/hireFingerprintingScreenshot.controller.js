import { readHireFingerprintingScreenshot, loadTrainingFingerprintingGuide } from '../services/hireFingerprintingGuide.service.js';
import { denverFingerprintingStep } from '../../../frontend/src/navigation/hireDocuments.js';
import Module from '../models/Module.model.js';
import User from '../models/User.model.js';
import { canReadTrainingModule } from '../middleware/trainingModuleAccess.middleware.js';
import { accessiblePublicTrainingModule } from './publicTraining.controller.js';

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

async function sendTrainingScreenshot(res, module, screenshotId) {
  if (!await loadTrainingFingerprintingGuide(module)) throw Object.assign(new Error('Fingerprinting guide not found for this course.'), { status: 404 });
  await send(res, module.agency_id, screenshotId);
}

export async function trainingFingerprintingScreenshot(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (user?.status === 'pending' && !['admin', 'super_admin', 'support'].includes(req.user.role)) {
      throw Object.assign(new Error('Training modules are not available during the pre-hire process.'), { status: 403 });
    }
    const module = await Module.findById(req.params.id);
    if (!await canReadTrainingModule(req.user, module)) throw Object.assign(new Error('This course is not available to your organization.'), { status: 403 });
    await sendTrainingScreenshot(res, module, req.params.screenshotId);
  } catch (error) { next(error); }
}

export async function onDemandFingerprintingScreenshot(req, res, next) {
  try {
    const module = await accessiblePublicTrainingModule(req);
    await sendTrainingScreenshot(res, module, req.params.screenshotId);
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
