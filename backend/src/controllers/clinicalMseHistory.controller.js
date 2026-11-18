import { requireNarrivaClient, positiveId } from '../services/narrivaAccess.service.js';
import { loadClinicalMseHistory } from '../services/clinicalMseHistory.service.js';
import { logNoteAidChartEvent } from '../services/noteAidChartAudit.service.js';
export async function getClinicalMseHistory(req, res, next) {
  try {
    const agencyId = positiveId(req.query.agencyId), clientId = positiveId(req.params.clientId);
    if (!agencyId || !clientId) throw Object.assign(new Error('Select an agency and client.'), { status: 400 });
    await requireNarrivaClient(req.user, agencyId, clientId);
    const dateOfService = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dateOfService || '')) ? req.query.dateOfService : null;
    const history = await loadClinicalMseHistory({ agencyId, clientId, dateOfService });
    await logNoteAidChartEvent(req, { agencyId, clientId, action: 'clinical_mse_history_viewed', metadata: { count: history.length } });
    res.set('Cache-Control', 'no-store').json({ history });
  } catch (error) { next(error); }
}
