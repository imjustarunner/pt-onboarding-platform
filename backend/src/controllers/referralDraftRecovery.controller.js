import ReferralPacketDraft from '../models/ReferralPacketDraft.model.js';
import { recoveryAgencyIds } from '../services/referralDraftRecovery.service.js';

export async function listUnsubmittedPackets(req, res, next) {
  try {
    const rawAgencyId = req.query.agencyId;
    if (rawAgencyId != null && !/^[1-9]\d*$/.test(String(rawAgencyId))) {
      return res.status(400).json({ error: { message: 'A valid agencyId is required.' } });
    }
    const agencyIds = await recoveryAgencyIds(req.user, rawAgencyId ?? null);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const result = await ReferralPacketDraft.listOpen({ agencyIds, limit, offset });
    // Names and notes belong in the authorized review modal, not the queue.
    const drafts = result.drafts.map(({ first_name, last_name, upload_note, ...draft }) => draft);
    return res.json({ drafts, total: result.total, limit, offset });
  } catch (error) { next(error); }
}
