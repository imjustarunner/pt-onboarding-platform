import { documentationScope } from './supervisedBilling.controller.js';
import { loadSuperviseeWorkspace, workspaceSections } from '../services/superviseeWorkspace.service.js';

export async function getSuperviseeWorkspace(req, res, next) {
  try {
    const section = String(req.query.section || 'tasks');
    if (!workspaceSections.has(section)) return res.status(400).json({ error: { message: 'Choose a valid supervision section' } });
    const scope = await documentationScope(req);
    scope.viewerIsAdmin = ['admin', 'super_admin'].includes(String(req.user.role || '').toLowerCase());
    res.set('Cache-Control', 'no-store');
    res.json(await loadSuperviseeWorkspace(scope, section, { viewerId: Number(req.user.id) }));
  } catch (error) { next(error); }
}
