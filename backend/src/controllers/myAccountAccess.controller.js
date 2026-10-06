import { getCredentialPacketForPortal, revealPortalTempPassword } from '../services/onboardingCredentialPacket.service.js';

// Self-service only: never accept a target user from a URL, query, or request body.
export async function getMyAccountAccess(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Unauthorized' } });
    res.set('Cache-Control', 'no-store');
    res.json({ credentialPacket: await getCredentialPacketForPortal(req.user.id, { employeeAccount: true }) });
  } catch (error) { next(error); }
}

export async function revealMyAccountTempPassword(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Unauthorized' } });
    res.set('Cache-Control', 'no-store');
    const packet = await getCredentialPacketForPortal(req.user.id, { employeeAccount: true });
    if (!packet?.systems.some(system => system.key === req.params.systemKey && system.hasTempPassword)) {
      return res.status(400).json({ error: { message: 'No temporary password is available for this account.' } });
    }
    res.json(await revealPortalTempPassword(req.user.id, req.params.systemKey));
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
}
