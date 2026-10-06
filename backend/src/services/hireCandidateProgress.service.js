import User from '../models/User.model.js';
import pool from '../config/database.js';
import { journeyTasks, getJourney } from './hireJourney.service.js';
import { loadPortalPrehireExtras } from './hirePortalExtras.service.js';
import { buildPortalWorkflow } from './hirePortalWorkflow.service.js';
import { getBackgroundCheckAuthorizationSummary } from './backgroundCheckAuthorization.service.js';

// Staff and applicants count the same required steps, including non-task submissions.
// Only aggregate progress leaves this service; private profile information is not needed.
export async function candidatePrehireProgress(userId, agencyId) {
  const [user, tasks, journey, profiles, backgroundCheck] = await Promise.all([
    User.findById(userId), journeyTasks(userId, 'PREHIRE_OPEN'), getJourney(userId),
    pool.execute('SELECT job_description_id FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1', [userId]),
    getBackgroundCheckAuthorizationSummary(userId, agencyId)
  ]);
  const extras = await loadPortalPrehireExtras({ userId, agencyId, hiringProfile: profiles[0][0] });
  const prehireTasks = tasks.filter(task => task.phase === 'pre_hire');
  const workflow = await buildPortalWorkflow({ user, agencyId, tasks: prehireTasks, prehireTasks,
    extras, backgroundCheck, journey: journey || {}, progressOnly: true });
  return workflow.progress.pre_hire;
}
