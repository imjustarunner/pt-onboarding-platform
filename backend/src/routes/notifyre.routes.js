import express from 'express';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import { verifyNotifyreSignature } from '../services/auricwell/clientMessagingPolicy.js';
import { platformIntegrations } from '../services/auricwell/platformIntegrations.js';
import { acceptAuthenticatedNotifyreEvent } from '../services/auricwell/clientMessaging.js';
import { resolveNotifyreWebhookOwner } from '../services/notifyreWebhookRouting.service.js';
import { inboundSmsWebhook } from '../controllers/vonageWebhook.controller.js';

const router = express.Router();
// Mounted before JSON middleware: signature validation needs the original bytes.
export const createNotifyreWebhook = ({ auricwellAlias = false } = {}) => async (req, res, next) => {
  res.set?.('Cache-Control', 'no-store');
  let connection, locked = false, key;
  try {
    if (auricwellAlias && process.env.AURICWELL_ENABLED !== 'true') return res.status(503).json({error:'Messaging unavailable.'});
    // Authentication comes before any routing lookup. The older URL retains its
    // own signing secret during migration; neither URL is tied to an ITSCO tenant.
    let settings, parsed;
    if (auricwellAlias) {
      ({settings} = await platformIntegrations());
      parsed = verifyNotifyreSignature(req.body, req.get('Notifyre-Signature'), settings.notifyre.webhookSecret);
    } else {
      parsed = verifyNotifyreSignature(req.body, req.get('Notifyre-Signature'), process.env.NOTIFYRE_WEBHOOK_SECRET);
      if (process.env.AURICWELL_ENABLED === 'true') ({settings} = await platformIntegrations());
    }
    const owner = await resolveNotifyreWebhookOwner(parsed, settings);
    if (owner.kind === 'ignored') return res.status(200).json({ ignored: true });
    if (owner.kind === 'auricwell') return res.json(await acceptAuthenticatedNotifyreEvent(settings, parsed));
    const { event, sender } = owner;
    key = crypto.createHash('sha256').update(`${event.type}:${event.id}:${event.status || ''}`).digest('hex');
    connection = await pool.getConnection();
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 5) acquired', [`nr:${key.slice(0,48)}`]);
    if (Number(lock.acquired) !== 1) return res.status(503).json({ error: 'Retry this event' });
    locked = true;
    const [[receipt]] = await connection.execute('SELECT completed_at FROM notifyre_webhook_receipts WHERE event_key = ?', [key]);
    if (receipt?.completed_at) return res.status(200).json({ duplicate: true });
    await connection.execute('INSERT IGNORE INTO notifyre_webhook_receipts (event_key) VALUES (?)', [key]);
    if (['sms_received', 'mms_received'].includes(event.type)) {
      // Reuse existing recipient routing, STOP/START/HELP, support and care threads.
      // Capture the response until routing and durable receipt recording complete.
      let status = 200, response = { ok: true }, failure;
      const proxy = { status(value) { status = value; return this; }, json(value) { response = value; return this; } };
      req.smsProvider = 'notifyre'; req.query = {};
      req.notifyreMediaReceipt = event.type === 'mms_received' ? event.id : null;
      req.body = { from: event.from, to: event.to, text: event.text, messageId: event.id, receivedAt: event.at };
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
      AND agency_id = ?
      AND (delivery_status IS NULL OR delivery_status NOT IN ('delivered','failed','undeliverable','rejected','expired'))`, [event.status,event.id,event.id,sender.agency_id]);
    await connection.execute('UPDATE notifyre_webhook_receipts SET completed_at = UTC_TIMESTAMP() WHERE event_key = ?', [key]);
    res.json({ ok: true });
  } catch (error) {
    if ([400,403,409].includes(error.status)) return res.status(error.status).json({error:error.status === 403 ? 'Invalid signature or sender registration.' : 'Webhook routing needs review.'});
    next(error);
  }
  finally { if (connection) { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [`nr:${key.slice(0,48)}`]).catch(() => {}); connection.release(); } }
};
export const notifyreWebhook = createNotifyreWebhook();
router.post('/webhook', express.raw({ type: 'application/json', limit: '256kb' }), notifyreWebhook);
export default router;
