import express from 'express';
import { searchPublicSchools } from '../controllers/publicSchools.controller.js';

const router = express.Router();

// Public school finder (no auth)
router.get('/search', searchPublicSchools);

export default router;

