import { assertSelfPayRateAccess, getSelfPayRates, saveSelfPayRates } from '../services/selfPayRates.service.js';

export async function readSelfPayRates(req, res, next) {
  try {
    const agencyId = Number(req.params.agencyId);
    const providerId = Number(req.params.providerId || 0);
    await assertSelfPayRateAccess(req.user, agencyId, providerId);
    res.json(await getSelfPayRates(agencyId, providerId));
  } catch (e) { next(e); }
}
export async function writeSelfPayRates(req, res, next) {
  try {
    const agencyId = Number(req.params.agencyId);
    const providerId = Number(req.params.providerId || 0);
    await assertSelfPayRateAccess(req.user, agencyId, providerId);
    res.json(await saveSelfPayRates({ agencyId, providerId, rows: req.body?.rates,
      selfPayOnly: req.body?.selfPayOnly, actorUserId: req.user.id }));
  } catch (e) { next(e); }
}
