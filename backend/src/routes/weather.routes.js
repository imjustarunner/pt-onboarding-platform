import express from 'express';
import { authenticateOptional } from '../middleware/auth.middleware.js';
import { getMyWeather } from '../controllers/weather.controller.js';

const router = express.Router();
router.use(authenticateOptional);

router.get('/me', getMyWeather);

export default router;

