import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { resolveSenderIdentityForSend } from './emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const ALERT_DEBOUNCE_HOURS = 24;

async function resolveMaterialsReplyTo(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  try {
    const list = await EmailSenderIdentity.list({
      agencyId: aid,
      includePlatformDefaults: true,
      onlyActive: true
    });
    const materials = (list || []).find(
      (i) => String(i?.identity_key || '').toLowerCase() === 'materials'
    );
    if (materials?.from_email) return String(materials.from_email).trim();
    if (materials?.reply_to) return String(materials.reply_to).trim();

    const notifications = (list || []).find((i) =>
      String(i?.from_email || '').trim().toLowerCase().startsWith('notifications@')
    );
    const domain = String(notifications?.from_email || '')
      .split('@')[1]
      ?.trim()
      .toLowerCase();
    if (domain) return `materials@${domain}`;
  } catch (err) {
    console.warn('[gearLowStockAlert] resolveMaterialsReplyTo failed:', err?.message || err);
  }
  return null;
}

async function logReorderAlertMovement({
  agencyId,
  gearItemTypeId,
  createdByUserId = null,
  reason = null
}) {
  if (!agencyId || !gearItemTypeId) return;
  try {
    await pool.execute(
      `INSERT INTO gear_stock_movements
         (agency_id, gear_item_type_id, movement_type, quantity_delta, reason, created_by_user_id)
       VALUES (?, ?, 'REORDER_ALERT', 0, ?, ?)`,
      [agencyId, gearItemTypeId, reason || 'Low stock reorder alert', createdByUserId]
    );
  } catch (err) {
    console.warn('[gearLowStockAlert] movement log failed:', err?.message || err);
  }
}

/**
 * Send low/reorder email to the agency responsible user when stock is low or manually flagged.
 * Debounced via gear_catalog_agency.last_low_alert_at.
 */
export async function maybeSendLowStockAlert({
  catalogItemId,
  agencyId,
  actorUserId = null,
  force = false,
  reason = 'Low stock'
} = {}) {
  const cid = Number(catalogItemId || 0);
  const aid = Number(agencyId || 0);
  if (!cid || !aid) return { sent: false, reason: 'missing_ids' };

  const [[row]] = await pool.execute(
    `SELECT
       ca.id AS enrollment_id,
       ca.responsible_user_id,
       ca.manual_is_low,
       ca.last_low_alert_at,
       ca.gear_item_type_id,
       COALESCE(ca.low_stock_threshold, c.default_low_stock_threshold, 2) AS threshold,
       c.name AS item_name,
       c.stock_mode,
       c.category,
       a.name AS agency_name,
       u.email AS owner_email,
       u.first_name AS owner_first_name,
       u.last_name AS owner_last_name
     FROM gear_catalog_agency ca
     JOIN gear_catalog_items c ON c.id = ca.catalog_item_id
     JOIN agencies a ON a.id = ca.agency_id
     LEFT JOIN users u ON u.id = ca.responsible_user_id
     WHERE ca.catalog_item_id = ? AND ca.agency_id = ? AND ca.is_active = 1
     LIMIT 1`,
    [cid, aid]
  );

  if (!row) return { sent: false, reason: 'enrollment_not_found' };
  if (!row.responsible_user_id || !row.owner_email) {
    return { sent: false, reason: 'no_responsible_user' };
  }

  if (!force && row.last_low_alert_at) {
    const last = new Date(row.last_low_alert_at).getTime();
    if (Number.isFinite(last) && Date.now() - last < ALERT_DEBOUNCE_HOURS * 3600 * 1000) {
      return { sent: false, reason: 'debounced' };
    }
  }

  let isLow = !!row.manual_is_low;
  if (!isLow && row.stock_mode === 'COUNTED' && row.gear_item_type_id) {
    const [[stock]] = await pool.execute(
      `SELECT COALESCE(SUM(quantity_on_hand), 0) AS qty
       FROM gear_stock_levels
       WHERE agency_id = ? AND gear_item_type_id = ?`,
      [aid, row.gear_item_type_id]
    );
    const [[assets]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM gear_unique_assets
       WHERE agency_id = ? AND gear_item_type_id = ? AND status = 'AVAILABLE'`,
      [aid, row.gear_item_type_id]
    );
    const qty = Number(stock?.qty || 0) + Number(assets?.c || 0);
    isLow = qty <= Number(row.threshold || 0);
  }

  if (!isLow) return { sent: false, reason: 'not_low' };

  const resolved = await resolveSenderIdentityForSend({
    agencyId: aid,
    templateType: 'gear_low_stock',
    preferredKeys: ['notifications', 'system']
  });
  const identity = resolved?.identity;
  if (!identity?.id) {
    return { sent: false, reason: 'no_sender_identity' };
  }

  const replyTo = await resolveMaterialsReplyTo(aid);
  const ownerName = [row.owner_first_name, row.owner_last_name].filter(Boolean).join(' ').trim() || 'there';
  const subject = `Reorder needed: ${row.item_name} (${row.agency_name})`;
  const text = [
    `Hi ${ownerName},`,
    '',
    `${row.item_name} for ${row.agency_name} is low and needs a reorder.`,
    `Reason: ${reason}`,
    row.manual_is_low ? 'Status: Manually marked low stock.' : `Threshold: ${row.threshold}`,
    '',
    'Please arrange a reorder for this item.',
    '',
    '— PlotTwist Gear & Materials'
  ].join('\n');
  const html = `<p>Hi ${ownerName},</p>
<p><strong>${row.item_name}</strong> for <strong>${row.agency_name}</strong> is low and needs a reorder.</p>
<p>Reason: ${reason}<br/>
${row.manual_is_low ? 'Status: Manually marked low stock.' : `Threshold: ${row.threshold}`}</p>
<p>Please arrange a reorder for this item.</p>
<p>— PlotTwist Gear &amp; Materials</p>`;

  try {
    await sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to: row.owner_email,
      subject,
      text,
      html,
      replyToOverride: replyTo || undefined,
      source: 'auto',
      templateType: 'gear_low_stock',
      generatedByUserId: actorUserId,
      userId: row.responsible_user_id
    });

    await pool.execute(
      `UPDATE gear_catalog_agency SET last_low_alert_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [row.enrollment_id]
    );

    await logReorderAlertMovement({
      agencyId: aid,
      gearItemTypeId: row.gear_item_type_id,
      createdByUserId: actorUserId,
      reason: `Reorder alert emailed to ${row.owner_email}`
    });

    return { sent: true };
  } catch (err) {
    console.error('[gearLowStockAlert] send failed:', err?.message || err);
    return { sent: false, reason: 'send_failed', error: err?.message || String(err) };
  }
}

/**
 * After a stock adjust, check if total qty crossed into low and alert.
 */
export async function checkCountedStockAndAlert({
  catalogItemId,
  agencyId,
  gearItemTypeId,
  actorUserId = null
} = {}) {
  const aid = Number(agencyId || 0);
  const tid = Number(gearItemTypeId || 0);
  let cid = Number(catalogItemId || 0);

  if (!cid && tid) {
    const [[t]] = await pool.execute(
      `SELECT catalog_item_id FROM gear_item_types WHERE id = ? LIMIT 1`,
      [tid]
    );
    cid = Number(t?.catalog_item_id || 0);
  }
  if (!cid || !aid) return { sent: false, reason: 'missing_ids' };

  const [[enroll]] = await pool.execute(
    `SELECT
       ca.manual_is_low,
       COALESCE(ca.low_stock_threshold, c.default_low_stock_threshold, 2) AS threshold,
       ca.gear_item_type_id
     FROM gear_catalog_agency ca
     JOIN gear_catalog_items c ON c.id = ca.catalog_item_id
     WHERE ca.catalog_item_id = ? AND ca.agency_id = ?
     LIMIT 1`,
    [cid, aid]
  );
  if (!enroll) return { sent: false, reason: 'enrollment_not_found' };
  if (enroll.manual_is_low) {
    return maybeSendLowStockAlert({
      catalogItemId: cid,
      agencyId: aid,
      actorUserId,
      reason: 'Manually marked low'
    });
  }

  const typeId = Number(enroll.gear_item_type_id || tid || 0);
  if (!typeId) return { sent: false, reason: 'no_type' };

  const [[stock]] = await pool.execute(
    `SELECT COALESCE(SUM(quantity_on_hand), 0) AS qty
     FROM gear_stock_levels WHERE agency_id = ? AND gear_item_type_id = ?`,
    [aid, typeId]
  );
  const [[assets]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM gear_unique_assets
     WHERE agency_id = ? AND gear_item_type_id = ? AND status = 'AVAILABLE'`,
    [aid, typeId]
  );
  const qty = Number(stock?.qty || 0) + Number(assets?.c || 0);
  if (qty > Number(enroll.threshold || 0)) {
    return { sent: false, reason: 'above_threshold' };
  }

  return maybeSendLowStockAlert({
    catalogItemId: cid,
    agencyId: aid,
    actorUserId,
    reason: `Quantity on hand (${qty}) at or below threshold (${enroll.threshold})`
  });
}

export default {
  maybeSendLowStockAlert,
  checkCountedStockAndAlert
};
