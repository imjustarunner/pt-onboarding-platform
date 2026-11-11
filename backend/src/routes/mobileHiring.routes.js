import express from 'express';
import {mobileApplicants} from '../services/mobile/applicants.service.js';
const router=express.Router();
router.get('/',mobileApplicants);
router.get('/:candidateId/resumes/:resumeId',mobileApplicants);
router.get('/:candidateId',mobileApplicants);
export default router;
