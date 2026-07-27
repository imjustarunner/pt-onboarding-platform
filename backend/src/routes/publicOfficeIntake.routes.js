import express from 'express';
import { publicOfficeIntakeInfo, publicOfficeIntakeCreate } from '../controllers/clientExchange.controller.js';

const router = express.Router();

router.get('/:agencySlug', publicOfficeIntakeInfo);
router.post('/:agencySlug', publicOfficeIntakeCreate);

export default router;
