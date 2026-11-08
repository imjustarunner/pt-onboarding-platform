import pool from '../config/database.js';
import User from '../models/User.model.js';
import { runWithAgencyAccess } from '../utils/agencyAccessContext.js';
import { mobileQaScope } from '../services/mobile/qaScope.service.js';
import { requireNarrivaAgency, positiveId, narrivaError } from '../services/narrivaAccess.service.js';
import { getClinicalNoteReviewInsights } from '../services/clinicalNoteReviewInsights.service.js';

export const getNoteReviewInsights = async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try { res.json({ insights: await getClinicalNoteReviewInsights(req, { agencyId: req.query.agencyId, noteId: req.params.noteId }) }); }
  catch (error) { next(error); }
};

/** A read-only all-agency card does not rotate or broaden the device's write token. */
export function createMobileNoteReviewInsights({ db = pool, findUser = id => User.findById(id, { raw: true }), authorize = requireNarrivaAgency,
  scope = runWithAgencyAccess, insights = getClinicalNoteReviewInsights, qaScope = mobileQaScope } = {}) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!req.quickView?.mobileDeviceSessionId || !positiveId(req.quickView.userId)) throw narrivaError(403, 'Sign in with your primary account to review clinical work.');
      const agencyId = positiveId(req.query.agencyId || req.quickView.agencyId);
      if (!agencyId || !/^[1-9][0-9]*$/.test(String(req.params.noteId || '')) || !positiveId(req.params.noteId)) throw narrivaError(400, 'Choose an existing note and workspace.');
      const user = await findUser(req.quickView.userId);
      if (!user || [0, false, '0'].includes(user.is_active) || [1, true, '1'].includes(user.is_archived) || !['ACTIVE', 'ACTIVE_EMPLOYEE'].includes(String(user.status || '').toUpperCase())) throw narrivaError(403, 'Your account is no longer active.');
      const [memberships] = await db.execute(`SELECT a.* FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
        WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`, [user.id, agencyId]);
      if (!qaScope(user, memberships).agencies.some(agency => Number(agency.id) === agencyId)) throw narrivaError(403, 'Your workspace membership is no longer active.');
      const actor = { ...user };
      await authorize(actor, agencyId);
      const request = Object.assign(Object.create(req), { user: actor, query: { agencyId }, body: {},
        headers: { ...req.headers, 'x-agency-id': String(agencyId) }, quickView: { ...req.quickView, agencyId },
        mobileClinical: undefined, medicalBillingAgencyId: agencyId, auricwellPreview: { agencyId } });
      const result = await scope(agencyId, () => insights(request, { agencyId, noteId: Number(req.params.noteId) }), { userId: actor.id, access: actor.agencyAccess });
      // File bytes continue through the existing exact-workspace assessment API.
      // Across agencies the artifact remains visible; open the note to view it.
      for (const artifact of result.quickLook?.artifacts || []) {
        if (Number(req.quickView.agencyId) === agencyId && artifact.href) artifact.href = artifact.href.replace('/api/narriva/assessments/', '/api/quick-view/clinical/assessments/');
        else if (artifact.href) { artifact.href = null; artifact.openNoteToView = true; }
      }
      res.json({ insights: result });
    } catch (error) { next(error); }
  };
}
export const getMobileNoteReviewInsights = createMobileNoteReviewInsights();
