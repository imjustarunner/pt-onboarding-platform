import express from 'express';
import { getPublicTranslations, translateStrings } from '../controllers/translations.controller.js';

const router = express.Router();

router.get('/', getPublicTranslations);
router.post('/translate-strings', translateStrings);

export default router;
