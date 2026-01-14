import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getUserPreferences, updateUserPreferences } from '../controllers/userPreferences.controller.js';

const router = express.Router();

// Get user preferences
router.get('/:userId/preferences', authenticate, getUserPreferences);

// Update user preferences
router.put('/:userId/preferences', authenticate, updateUserPreferences);

export default router;
