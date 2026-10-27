import Module from '../models/Module.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import User from '../models/User.model.js';
import AgencyPublicTraining from '../models/AgencyPublicTraining.model.js';

export async function canReadTrainingModule(user, module, agencies = null) {
  if (!user?.id || !module) return false;
  if (user.role === 'super_admin') return true;
  const manager = user.role === 'admin';
  if (!manager && ([false, 0, '0', null, undefined].includes(module.is_active) || module.publish_status === 'draft' || [true, 1, '1'].includes(module.is_archived))) return false;
  if (module.agency_id == null) return !!(module.is_shared || module.is_public || module.is_always_accessible || (manager && Number(module.created_by_user_id) === Number(user.id)));
  const memberships = agencies || await User.getAgencies(user.id);
  if (memberships.some(agency => Number(agency.id) === Number(module.agency_id))) return true;
  // Published courses explicitly made available to an agency remain readable.
  if (module.is_active && module.publish_status !== 'draft' && !module.is_archived) {
    for (const agency of memberships) if (await AgencyPublicTraining.getModuleAssignment(agency.id, module.id)) return true;
  }
  return false;
}

/** Apply the same tenant boundary to the module, its content and quiz attempts. */
export async function requireTrainingModuleAccess(req, res, next) {
  try {
    const id = Number(req.params.moduleId || req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: { message: 'Invalid module ID' } });
    const module = await Module.findById(id);
    if (!module) return res.status(404).json({ error: { message: 'Module not found' } });
    if (!await canReadTrainingModule(req.user, module)) return res.status(403).json({ error: { message: 'This training module is not available to your organization.' } });
    if (req.method !== 'GET' && req.path?.includes('/content') && req.user.role !== 'super_admin') {
      const agencies = await User.getAgencies(req.user.id);
      if (!agencies.some(agency => Number(agency.id) === Number(module.agency_id))) return res.status(403).json({ error: { message: 'Only the owning organization can edit this training content.' } });
    }
    if (req.params.contentId) {
      const content = await ModuleContent.findById(Number(req.params.contentId));
      if (!content || Number(content.module_id) !== id) return res.status(404).json({ error: { message: 'Module content not found' } });
    }
    next();
  } catch (error) { next(error); }
}
