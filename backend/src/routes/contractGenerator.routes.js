import express from 'express';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  getContractLibrary,
  getCandidateWizardContextHandler,
  listContractCandidates,
  inferContractCompensation,
  postContractTemplate,
  patchContractTemplate,
  postContractClause,
  patchContractClause,
  postContractConfig,
  patchContractConfig,
  previewContractForCandidate,
  generateContractForCandidate
} from '../controllers/contractGenerator.controller.js';

const router = express.Router();

router.use(authenticate);
router.use(requireCapability('canManageHiring'));
router.use(async (req, res, next) => {
  try {
    const agencyId = Number(req.query?.agencyId || req.body?.agencyId || req.user?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Organization is required.' } });
    if (!['super_admin', 'support'].includes(req.user.role)) {
      const User = (await import('../models/User.model.js')).default;
      const agencies = await User.getAgencies(req.user.id);
      if (!agencies.some((a) => Number(a.id) === agencyId)) return res.status(403).json({ error: { message: 'Organization access required.' } });
    }
    next();
  } catch (e) { next(e); }
});

router.get('/library', getContractLibrary);
router.get('/candidates', listContractCandidates);
router.get('/infer-compensation', inferContractCompensation);
router.get('/candidates/:userId/wizard-context', getCandidateWizardContextHandler);
router.post('/templates', postContractTemplate);
router.patch('/templates/:id', patchContractTemplate);
router.post('/clauses', postContractClause);
router.patch('/clauses/:id', patchContractClause);
router.post('/configs', postContractConfig);
router.patch('/configs/:id', patchContractConfig);

router.post('/candidates/:userId/preview', previewContractForCandidate);
router.post('/candidates/:userId/generate', generateContractForCandidate);

export default router;
