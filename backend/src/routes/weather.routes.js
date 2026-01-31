import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getMyWeather } from '../controllers/weather.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/me', getMyWeather);

export default router;

