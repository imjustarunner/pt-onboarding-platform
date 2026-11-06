import { listAgencyAccessCards, readAgencyAccess, saveAgencyAccess, savePlatformAccessDefaults } from '../services/agencyAccessProfiles.service.js';
const identifier = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

export async function getAgencyAccessCards(req, res, next) {
  try {
    const userId = identifier(req.params.id);
    if (!userId) return res.status(400).json({ error: { message: 'Choose an employee.' } });
    res.set('Cache-Control', 'no-store');
    res.json(await listAgencyAccessCards({ actorUserId: req.user.id, userId }));
  } catch (error) { next(error); }
}

export async function putAgencyAccessCard(req, res, next) {
  try {
    const userId = identifier(req.params.id), agencyId = identifier(req.params.agencyId);
    if (!userId || !agencyId) return res.status(400).json({ error: { message: 'Choose an employee and company.' } });
    res.json(await saveAgencyAccess({ actorUserId: req.user.id, userId, agencyId, input: req.body }));
  } catch (error) { next(error); }
}

export async function putPlatformAccessDefaults(req, res, next) {
  try {
    const userId = identifier(req.params.id);
    if (!userId) return res.status(400).json({ error: { message: 'Choose an employee.' } });
    res.json(await savePlatformAccessDefaults({ actorUserId: req.user.id, userId, input: req.body }));
  } catch (error) { next(error); }
}

// Keep earlier agency-specific finance controls synchronized with the new
// source of truth; the generic profile Save no longer writes every membership.
export const updateScopedPermission = (key, responseKey) => async (req, res, next) => {
  try {
    const userId = identifier(req.params.id), agencyId = identifier(req.body?.agencyId || req.user.scopedAgencyId);
    if (!userId || !agencyId || typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: { message: 'Choose a company and On or Off.' } });
    const current = await readAgencyAccess(userId, agencyId);
    if (!current) return res.status(404).json({ error: { message: 'Active agency access not found.' } });
    const saved = await saveAgencyAccess({ actorUserId: req.user.id, userId, agencyId,
      input: { revision: current.revision, permissions: { [key]: req.body.enabled } } });
    res.json({ userId, agencyId, [responseKey]: saved.permissions[key] });
  } catch (error) { next(error); }
};
