import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listMyExtensions, listByAgency, create, update, remove } from '../controllers/extensions.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/me', listMyExtensions);
router.get('/agency/:agencyId', listByAgency);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
