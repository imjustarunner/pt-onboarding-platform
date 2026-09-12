import { journeyTasks, getJourney } from '../services/hireJourney.service.js';

// The portal token grants access to this person's process, never staff countersignatures.
export async function enforcePortalWritePhase(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const path = req.path;
  if (/^\/(messages|activity|complete)\/?$/.test(path)) return next();
  try {
    const user = req.portalUser;
    const journey = await getJourney(user.id);
    const closed = user.status === 'PREHIRE_REVIEW' || !!journey?.onboardingCompletedAt;
    if (closed) return res.status(409).json({ error: { message: 'This process is closed. You can still view your submissions. Contact People Operations for corrections.' } });
    const phase = user.status === 'ONBOARDING' ? 'onboarding' : 'pre_hire';
    const match = path.match(/^\/(tasks|modules)\/(\d+)/);
    if (match) {
      const tasks = await journeyTasks(user.id, user.status);
      const task = tasks.filter((t) => t.phase === phase).find((t) => match[1] === 'tasks'
        ? t.id === Number(match[2]) : t.taskType === 'training' && t.referenceId === Number(match[2]));
      if (!task || task.phase !== phase) return res.status(403).json({ error: { message: 'This item is not part of your open process.' } });
      if (task.status === 'completed') return res.status(409).json({ error: { message: 'This item is complete and is available for viewing.' } });
      if (/\/(consent|intent|sign|acknowledge)$/.test(path) && task.taskType !== 'document') {
        return res.status(400).json({ error: { message: 'Use the assigned form or training to complete this item.' } });
      }
      if (/\/acknowledge$/.test(path) && task.actionType !== 'review') {
        return res.status(400).json({ error: { message: 'This document requires a signature.' } });
      }
    } else if (phase === 'onboarding' && /^\/(background-check|job-description|documents|checklist)/.test(path)) {
      return res.status(409).json({ error: { message: 'Your pre-hire submissions are closed and retained in My Submissions.' } });
    }
    next();
  } catch (e) { next(e); }
}
