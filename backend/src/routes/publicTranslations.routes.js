import express from 'express';
import { getPublicTranslations } from '../controllers/translations.controller.js';

const router = express.Router();

router.get('/', getPublicTranslations);

export default router;
