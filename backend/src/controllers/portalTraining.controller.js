import { assertPortalModuleAssigned } from './prehirePortal.controller.js';
import * as acknowledgments from './acknowledgment.controller.js';
import { submitQuiz } from './quiz.controller.js';
import ModuleContent from '../models/ModuleContent.model.js';
import ModuleResponseAnswer from '../models/ModuleResponseAnswer.model.js';
import { parseMetadata } from '../services/hireJourney.service.js';

export const portalTrainingAction = (action) => async (req, res, next) => {
  try {
    const { moduleId } = await assertPortalModuleAssigned(req.portalUser.id, req.params.moduleId);
    req.user = { id: req.portalUser.id, role: req.portalUser.role };
    req.params.moduleId = String(moduleId);
    req.body = { ...(req.body || {}), moduleId };
    if (action === 'getResponses') return res.json(await ModuleResponseAnswer.findByUserAndModule(req.user.id, moduleId));
    if (action === 'submitQuiz') return submitQuiz(req, res, next);
    if (acknowledgments[action]) return acknowledgments[action](req, res, next);
    const blocks = await ModuleContent.findByModuleId(moduleId);
    const block = blocks.find((b) => Number(b.id) === Number(req.body.contentId));
    const expected = action === 'knowledgeCheck' ? 'knowledge_check' : 'response';
    if (!block || block.content_type !== expected) return res.status(400).json({ error: { message: 'This content is not part of the assigned module.' } });
    if (action === 'knowledgeCheck') {
      const data = parseMetadata(block.content_data);
      const selected = req.body.selected;
      if (!Number.isInteger(selected) || selected < 0 || selected >= (data.options || []).length) return res.status(400).json({ error: { message: 'Select an answer.' } });
      const correct = selected === Number(data.correctAnswer);
      await ModuleResponseAnswer.createOrUpdate(req.user.id, moduleId, block.id, JSON.stringify({ selected }));
      return res.json({ correct });
    }
    const text = String(req.body.responseText || '').slice(0, 20000);
    await ModuleResponseAnswer.createOrUpdate(req.user.id, moduleId, block.id, text);
    res.json({ ok: true });
  } catch (e) { next(e); }
};
