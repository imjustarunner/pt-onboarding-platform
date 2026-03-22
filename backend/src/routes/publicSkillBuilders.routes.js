import express from 'express';
import {
  getPublicSkillBuildersProgramMeta,
  listPublicAgencyEvents,
  listPublicProgramEventsByProgramSlug,
  listPublicSkillBuildersProgramEvents
} from '../controllers/skillBuildersPublic.controller.js';

const router = express.Router();

router.get('/agency/:slug/events', listPublicAgencyEvents);
router.get('/agency/:slug/programs/:programSlug/events', listPublicProgramEventsByProgramSlug);
router.get('/agency/:slug/skill-builders-program', getPublicSkillBuildersProgramMeta);
router.get('/agency/:slug/skill-builders/events', listPublicSkillBuildersProgramEvents);

export default router;
