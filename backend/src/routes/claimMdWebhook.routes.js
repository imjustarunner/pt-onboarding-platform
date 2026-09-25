import express from 'express';
import clinicalPool from '../config/clinicalDatabase.js';
import { sharedClaimMdConnection } from '../services/claimMdConnection.service.js';
import { verifyClaimMdWebhook, taxIdHash } from '../services/claimMdWorkflow.service.js';
import { encryptFamilyBilling } from '../services/familyBillingEncryption.service.js';

const router = express.Router();
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res, next) => {
  let db;
  try {
    const firstAgency = String(process.env.CLAIM_MD_AGENCY_IDS || '').split(',')[0];
    const connection = sharedClaimMdConnection(firstAgency);
    if (!connection || !verifyClaimMdWebhook(req.body, req.get('Auth-Signature-Base64'), connection.accountKey)) return res.sendStatus(401);
    let body;
    try { body = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
    if (String(body.acct_number) !== connection.accountId || !Array.isArray(body.events) || !body.events.length || body.events.length > 100) return res.sendStatus(400);
    for (const event of body.events) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(event.eventid || '')) || !event.event_data || !Number.isFinite(Date.parse(event.event_time))) return res.sendStatus(400);
      const enrollment = event.event_data.enroll;
      if (enrollment && (!/^[A-Za-z0-9_-]{1,80}$/.test(String(enrollment.event || '')) || !/^\d{10}$/.test(String(enrollment.prov_npi || '')))) return res.sendStatus(400);
    }
    const agencyIds = String(process.env.CLAIM_MD_AGENCY_IDS).split(',').map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
    db = await clinicalPool.getConnection();
    await db.beginTransaction();
    for (const event of body.events) {
      const [insert] = await db.execute(`INSERT IGNORE INTO claimmd_webhook_events (connection_id, event_id, payload_encrypted) VALUES (?, ?, ?)`,
        [connection.connectionId, String(event.eventid), encryptFamilyBilling(event, `claimmd-webhook:${connection.connectionId}:${event.eventid}`)]);
      if (!insert.affectedRows) continue;
      const e = event.event_data.enroll;
      if (event.event_type === 'enroll' && e) {
        const at = new Date(event.event_time);
        await db.execute(`UPDATE claimmd_enrollments SET status = ?, last_event_at = ?
          WHERE connection_id = ? AND agency_id IN (${agencyIds.map(() => '?').join(',')})
          AND payer_id = ? AND enrollment_type = ? AND provider_npi = ? AND tax_id_hash = ?
          AND (last_event_at IS NULL OR last_event_at <= ?)`,
          [e.event, at, connection.connectionId, ...agencyIds, e.payerid, e.enroll_type, e.prov_npi, taxIdHash(e.prov_taxid), at]);
      }
    }
    await db.commit();
    res.sendStatus(200);
  } catch (e) { if (db) await db.rollback(); next(e); } finally { db?.release(); }
});
export default router;
