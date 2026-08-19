import express from 'express';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  getContractLibrary,
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

router.get('/library', getContractLibrary);
router.post('/templates', postContractTemplate);
router.patch('/templates/:id', patchContractTemplate);
router.post('/clauses', postContractClause);
router.patch('/clauses/:id', patchContractClause);
router.post('/configs', postContractConfig);
router.patch('/configs/:id', patchContractConfig);

router.post('/candidates/:userId/preview', previewContractForCandidate);
router.post('/candidates/:userId/generate', generateContractForCandidate);

export default router;
