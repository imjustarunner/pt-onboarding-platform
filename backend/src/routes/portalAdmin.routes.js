import {Router} from 'express';
import {authenticate,requireActiveStatus} from '../middleware/auth.middleware.js';
import portalReads from './auricwellPortal.routes.js';
const router=Router();
router.use(authenticate,requireActiveStatus,portalReads);
export default router;
