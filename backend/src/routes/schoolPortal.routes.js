import express from 'express';
import { getSchoolClients } from '../controllers/schoolPortal.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// School portal routes (authenticated)
// GET /api/school-portal/:organizationId/clients
router.get('/:organizationId/clients', authenticate, getSchoolClients);

export default router;
