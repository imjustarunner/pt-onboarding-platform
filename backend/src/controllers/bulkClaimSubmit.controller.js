import clinicalPool from '../config/clinicalDatabase.js';
import { submitClaimToClaimMd } from './medicalBilling.controller.js';
import { prepareClaimReview } from './claimMdWorkflow.controller.js';
import { resolveClaimMdConnection } from '../services/claimMdConnection.service.js';

function captureResponse() {
  const captured = { statusCode: 200, body: null };
  const res = {
    status(code) { captured.statusCode = code; return res; },
    json(body) { captured.body = body; return res; }
  };
  return { res, captured };
}

export async function submitReadyClaimSet(req, res, next) {
  try {
    const agencyId = Number(req.body?.agencyId || 0);
    const requested = Array.isArray(req.body?.claimIds) ? req.body.claimIds.map(Number).filter(id => id > 0).slice(0, 25) : [];
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const connection = await resolveClaimMdConnection(agencyId);
    const params = [agencyId];
    let idFilter = '';
    if (requested.length) {
      idFilter = ` AND c.id IN (${requested.map(() => '?').join(',')})`;
      params.push(...requested);
    }
    const [claims] = await clinicalPool.execute(
      `SELECT c.id FROM clinical_claims c
       WHERE c.agency_id = ? AND c.is_deleted = 0 AND c.claim_lifecycle = 'ready'
         AND (c.metadata_json IS NULL OR JSON_EXTRACT(c.metadata_json, '$.hiddenFromQueue') IS NULL OR JSON_EXTRACT(c.metadata_json, '$.hiddenFromQueue') = false)
         ${idFilter}
       ORDER BY c.id
       LIMIT 25`,
      params
    );
    const submitted = [];
    const held = [];
    for (const claim of claims) {
      const prepared = await prepareClaimReview(agencyId, claim.id);
      if (!prepared.readiness?.ready || !prepared.reviewHash) {
        held.push({ claimId: claim.id, message: prepared.readiness?.blockers?.[0] || 'The billing check held this claim' });
        continue;
      }
      const { res: sink, captured } = captureResponse();
      await submitClaimToClaimMd({
        user: req.user,
        body: { agencyId, approved: true, reviewHash: prepared.reviewHash, accountMode: connection.mode },
        params: { claimId: String(claim.id) }
      }, sink, error => { captured.statusCode = error.status || 500; captured.body = { error: { message: error.message } }; });
      if (captured.statusCode >= 400 || captured.body?.error) held.push({ claimId: claim.id, message: captured.body?.error?.message || 'Held' });
      else submitted.push({ claimId: claim.id, practice: captured.body?.practice === true, accepted: captured.body?.accepted === true });
    }
    return res.json({ submitted, held });
  } catch (error) {
    next(error);
  }
}
