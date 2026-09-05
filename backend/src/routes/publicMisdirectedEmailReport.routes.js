import { Router } from 'express';
import {
  getMisdirectedEmailReportPreview,
  postMisdirectedEmailReport
} from '../controllers/publicMisdirectedEmailReport.controller.js';

const router = Router();

router.get('/:token', getMisdirectedEmailReportPreview);
router.post('/:token', postMisdirectedEmailReport);

export default router;
