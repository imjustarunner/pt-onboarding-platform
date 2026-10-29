import express from 'express';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import { verifyNotifyreSignature, normalizeNotifyreEvent } from '../services/notifyre.service.js';
import { getSmsSender } from '../services/smsCompliance.service.js';
import { assertNotifyreAgencyCampaign, assertSmsCarrierPurpose } from '../utils/smsCarrierPolicy.js';
import { inboundSmsWebhook } from '../controllers/vonageWebhook.controller.js';

const router = express.Router();
// Mounted before JSON middleware: signature validation needs the original bytes.
export const notifyreWebhook = async (req, res, next) => {
  if (!verifyNotifyreSignature(req.body, req.get('Notifyre-Signature'), process.env.NOTIFYRE_WEBHOOK_SECRET)) {
    return res.status(403).json({ error: 'Invalid Notifyre signature' });
  }
  let connection, locked = false, key;
  try {
    const event = normalizeNotifyreEvent(JSON.parse(req.body.toString('utf8')));
    if (!event) return res.status(200).json({ ignored: true });
    const sender = await getSmsSender(event.type === 'sms_received' ? event.to : event.from);
    try {
      assertNotifyreAgencyCampaign(sender.registration, sender.agency_id);
      assertSmsCarrierPurpose({ registration: sender.registration, controlReply: true });
    } catch {
      return res.status(403).json({ error: 'This sender is not assigned to the Notifyre client campaign' });
    }
    key = crypto.createHash('sha256').update(`${event.type}:${event.id}:${event.status || ''}`).digest('hex');
    connection = await pool.getConnection();
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 5) acquired', [`nr:${key.slice(0,48)}`]);
    if (Number(lock.acquired) !== 1) return res.status(503).json({ error: 'Retry this event' });
    locked = true;
    const [[receipt]] = await connection.execute('SELECT completed_at FROM notifyre_webhook_receipts WHERE event_key = ?', [key]);
    if (receipt?.completed_at) return res.status(200).json({ duplicate: true });
    await connection.execute('INSERT IGNORE INTO notifyre_webhook_receipts (event_key) VALUES (?)', [key]);
    if (event.type === 'sms_received') {
      // Reuse existing recipient routing, STOP/START/HELP, support and care threads.
      // Capture the response until routing and durable receipt recording complete.
      let status = 200, response = { ok: true }, failure;
      const proxy = { status(value) { status = value; return this; }, json(value) { response = value; return this; } };
      req.smsProvider = 'notifyre'; req.query = {};
      req.body = { from: event.from, to: event.to, text: event.text, messageId: event.id };
      await inboundSmsWebhook(req, proxy, error => { failure = error; });
      if (failure) throw failure;
      if (status >= 400) return res.status(status).json(response);
      await connection.execute('UPDATE notifyre_webhook_receipts SET completed_at = UTC_TIMESTAMP() WHERE event_key = ?', [key]);
      return res.status(status).json(response);
    }
    // Delivery is distinct from API acceptance. Do not regress a terminal status
    // when Notifyre retries an earlier queued/sent event out of order.
    await connection.execute(`UPDATE message_logs SET delivery_status = ?
      WHERE (twilio_message_sid = ? OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.sid')) = ?)
      AND (delivery_status IS NULL OR delivery_status NOT IN ('delivered','failed','undeliverable','rejected','expired'))`, [event.status,event.id,event.id]);
    await connection.execute('UPDATE notifyre_webhook_receipts SET completed_at = UTC_TIMESTAMP() WHERE event_key = ?', [key]);
    res.json({ ok: true });
  } catch (error) { next(error); }
  finally { if (connection) { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [`nr:${key.slice(0,48)}`]).catch(() => {}); connection.release(); } }
};
router.post('/webhook', express.raw({ type: 'application/json', limit: '256kb' }), notifyreWebhook);
export default router;
