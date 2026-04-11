import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listByAgency,
  listAudience,
  getOne,
  create,
  update,
  remove,
  convertToClient,
  convertToGuardian,
  listCommunications,
  sync
} from '../controllers/contacts.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/agency/:agencyId/audience', listAudience);
router.get('/agency/:agencyId', listByAgency);
router.post('/', create);
router.get('/:id', getOne);
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/convert-to-client', convertToClient);
router.post('/:id/convert-to-guardian', convertToGuardian);
router.get('/:id/communications', listCommunications);
router.post('/sync', sync);

export default router;
