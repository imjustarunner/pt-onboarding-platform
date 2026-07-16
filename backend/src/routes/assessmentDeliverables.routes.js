import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/assessmentDeliverables.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

router.use(authenticate);

router.post('/assign', ctrl.assign);
router.get('/clients/:clientId', ctrl.listForClient);
router.get('/clients/:clientId/shared', ctrl.listSharedForClient);
router.get('/:id', ctrl.getOne);
router.patch('/:id', ctrl.patchOne);
router.post('/:id/share', ctrl.share);
router.post('/:id/unshare', ctrl.unshare);
router.post('/:id/export', ctrl.exportOne);
router.post('/:id/replace', upload.single('file'), ctrl.replaceOne);

export default router;
