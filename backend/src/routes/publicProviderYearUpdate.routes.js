import express from 'express';
import * as ctrl from '../controllers/providerYearUpdate.controller.js';

const router = express.Router();

router.get('/:token', ctrl.getPublicByToken);
router.put('/:token/sections/:sectionKey', ctrl.updatePublicSection);
router.post('/:token/finalize', ctrl.finalizePublic);

export default router;
