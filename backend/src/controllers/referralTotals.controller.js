import User from '../models/User.model.js';
import { getReferralTotals } from '../services/referralTotals.service.js';

export const getDashboardReferralTotals = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'A valid agencyId is required' } });
    }
    // Explicit membership check also applies to admins/support: an arbitrary
    // agencyId must never expose another tenant's referral counts.
    if (req.user.role !== 'super_admin') {
      const agencies = await User.getAgencies(req.user.id);
      if (!agencies.some(agency => Number(agency.id) === agencyId)) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }
    const result = await getReferralTotals({ agencyId, year: req.query.year });
    res.json(result);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: { message: error.message } });
    next(error);
  }
};
