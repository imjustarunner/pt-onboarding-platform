import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import MessageLog from '../models/MessageLog.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import ContactCommunicationLog from '../models/ContactCommunicationLog.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import TwilioService from '../services/twilio.service.js';
import { resolveOutboundNumber } from '../services/twilioNumberRouting.service.js';
import { resolveContactsForAudience } from '../services/contactCampaignAudience.service.js';

const DEFAULT_RESPONSE_OPTIONS = [
  { key: 'Y', label: 'Yes' },
  { key: 'N', label: 'No' },
  { key: 'OPTOUT', label: 'Opt Out' }
];

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function normalizeShortCode(raw) {
  if (!raw) return null;
  return String(raw).replace(/[^\d]/g, '') || null;
}

function parseOptions(raw) {
  if (!raw) return DEFAULT_RESPONSE_OPTIONS;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : DEFAULT_RESPONSE_OPTIONS;
    } catch {
      return DEFAULT_RESPONSE_OPTIONS;
    }
  }
  return DEFAULT_RESPONSE_OPTIONS;
}

function normalizeResponseInput(body, options) {
  const msg = String(body || '').trim();
  if (!msg) return null;
  const upper = msg.toUpperCase();
  if (['OPT OUT', 'OPTOUT', 'STOP', 'UNSUBSCRIBE'].includes(upper)) {
    return { key: 'OPTOUT', label: 'Opt Out', raw: msg };
  }
  if (['YES', 'Y'].includes(upper)) return { key: 'Y', label: 'Yes', raw: msg };
  if (['NO', 'N'].includes(upper)) return { key: 'N', label: 'No', raw: msg };

  const list = Array.isArray(options) ? options : [];
  for (const opt of list) {
    const key = String(opt?.key || '').trim().toUpperCase();
    const label = String(opt?.label || '').trim().toUpperCase();
    if (key && upper === key) return { key: opt.key, label: opt.label, raw: msg };
    if (label && upper === label) return { key: opt.key, label: opt.label, raw: msg };
  }
  return null;
}

async function ensureAgencyAccess(reqUserId, agencyId) {
  const agencies = await User.getAgencies(reqUserId);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

async function getAgencyFeatureFlags(agencyId) {
  const agency = await Agency.findById(agencyId);
  return parseFeatureFlags(agency?.feature_flags || agency?.featureFlags);
}

async function listEligibleStaff(agencyId) {
  const [columns] = await pool.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('personal_phone','work_phone')"
  );
  const hasPersonal = columns.some((c) => c.COLUMN_NAME === 'personal_phone');
  const hasWork = columns.some((c) => c.COLUMN_NAME === 'work_phone');
  const phoneFields = ['u.phone_number'];
  if (hasPersonal) phoneFields.push('u.personal_phone');
  if (hasWork) phoneFields.push('u.work_phone');

  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, ${phoneFields.join(', ')}
     FROM users u
     JOIN user_agencies ua ON u.id = ua.user_id
     WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND u.is_active = TRUE
       AND u.role IN ('admin','support','staff','school_staff','provider','supervisor','clinical_practice_assistant','schedule_manager')
     ORDER BY u.last_name, u.first_name`,
    [agencyId]
  );
  return rows || [];
}

async function findAgencyUserByPhone(agencyId, phone) {
  const normalized = MessageLog.normalizePhone(phone);
  if (!normalized) return null;
  const staff = await listEligibleStaff(agencyId);
  return (
    staff.find((u) => MessageLog.normalizePhone(u.phone_number) === normalized) ||
    staff.find((u) => MessageLog.normalizePhone(u.personal_phone) === normalized) ||
    staff.find((u) => MessageLog.normalizePhone(u.work_phone) === normalized) ||
    null
  );
}

async function upsertOptOut({ agencyId, userId, source = 'inbound' }) {
  await pool.execute(
    `INSERT INTO agency_campaign_opt_outs (agency_id, user_id, opted_out_at, source)
     VALUES (?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE opted_out_at = VALUES(opted_out_at), source = VALUES(source)`,
    [agencyId, userId, source]
  );
}

async function hasOptedOut({ agencyId, userId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM agency_campaign_opt_outs WHERE agency_id = ? AND user_id = ? LIMIT 1`,
    [agencyId, userId]
  );
  return rows.length > 0;
}

async function notifySupervisorsOptOut({ agencyId, userId }) {
  const assignments = await SupervisorAssignment.findBySupervisee(userId, agencyId);
  if (!assignments || !assignments.length) return;
  const primary = assignments.filter((a) => a.is_primary === 1 || a.is_primary === true);
  const targets = primary.length ? primary : assignments;
  for (const a of targets) {
    await createNotificationAndDispatch({
      type: 'agency_campaign_opt_out',
      title: 'Engagement opt-out',
      message: `A staff member opted out of agency engagement campaigns.`,
      userId: a.supervisor_id,
      agencyId,
      relatedEntityType: 'agency_campaign',
      relatedEntityId: null,
      actorSource: 'System'
    });
  }
}

async function getActiveCampaign(agencyId) {
  const [rows] = await pool.execute(
    `SELECT *
     FROM agency_campaigns
     WHERE agency_id = ?
       AND status = 'sent'
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
     ORDER BY starts_at DESC, id DESC
     LIMIT 1`,
    [agencyId]
  );
  return rows?.[0] || null;
}

async function findAgencyByShortCode(toNumber) {
  const normalized = normalizeShortCode(toNumber);
  if (!normalized) return null;
  const [rows] = await pool.execute(
    'SELECT id, name, feature_flags FROM agencies WHERE is_active = TRUE OR is_active IS NULL'
  );
  for (const row of rows || []) {
    const flags = parseFeatureFlags(row.feature_flags);
    const shortCode = normalizeShortCode(flags?.agency_campaigns_short_code || flags?.agency_campaigns_shortcode);
    if (shortCode && shortCode === normalized) {
      return { agencyId: row.id, agencyName: row.name, shortCode };
    }
  }
  return null;
}

export const listAgencyCampaigns = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.query?.agencyId || ''), 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const hasAccess = await ensureAgencyAccess(req.user.id, agencyId);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });
    const flags = await getAgencyFeatureFlags(agencyId);
    if (!flags.agency_campaigns_enabled) {
      return res.json({ campaigns: [], featureEnabled: false });
    }

    const [rows] = await pool.execute(
      `SELECT ac.*,
              (SELECT COUNT(*) FROM agency_campaign_recipients acr WHERE acr.campaign_id = ac.id) AS recipient_count,
              (SELECT COUNT(*) FROM agency_campaign_contact_deliveries accd WHERE accd.campaign_id = ac.id) AS contact_recipient_count,
              (SELECT COUNT(*) FROM agency_campaign_responses ar WHERE ar.campaign_id = ac.id) AS response_count
       FROM agency_campaigns ac
       WHERE ac.agency_id = ?
       ORDER BY ac.created_at DESC`,
      [agencyId]
    );
    res.json({ campaigns: rows, featureEnabled: true });
  } catch (e) {
    next(e);
  }
};

export const listAgencyCampaignStaff = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.query?.agencyId || ''), 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const hasAccess = await ensureAgencyAccess(req.user.id, agencyId);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });
    const staff = await listEligibleStaff(agencyId);
    const [optRows] = await pool.execute(
      `SELECT user_id FROM agency_campaign_opt_outs WHERE agency_id = ?`,
      [agencyId]
    );
    const optedOutIds = new Set((optRows || []).map((r) => Number(r.user_id)));
    res.json(
      staff.map((u) => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
        role: u.role,
        phone_number: u.phone_number || u.personal_phone || u.work_phone || null,
        opted_out: optedOutIds.has(Number(u.id))
      }))
    );
  } catch (e) {
    next(e);
  }
};

export const createAgencyCampaign = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.body?.agencyId || ''), 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const hasAccess = await ensureAgencyAccess(req.user.id, agencyId);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const flags = await getAgencyFeatureFlags(agencyId);
    if (!flags.agency_campaigns_enabled) {
      return res.status(403).json({ error: { message: 'Agency campaigns are not enabled' } });
    }

    const title = String(req.body?.title || '').trim();
    const question = String(req.body?.question || '').trim();
    if (!title || !question) {
      return res.status(400).json({ error: { message: 'title and question are required' } });
    }
    const rawAudienceMode = String(req.body?.audienceMode || 'all').toLowerCase();
    const audienceMode =
      rawAudienceMode === 'selected' ? 'selected' : rawAudienceMode === 'contacts' ? 'contacts' : 'all';
    const audienceTarget = audienceMode === 'contacts' ? req.body?.audienceTarget || {} : null;
    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;
    const responseOptions = parseOptions(req.body?.responseOptions);
    const shortCode = normalizeShortCode(flags?.agency_campaigns_short_code || flags?.agency_campaigns_shortcode);

    const [result] = await pool.execute(
      `INSERT INTO agency_campaigns
       (agency_id, created_by_user_id, title, question, status, audience_mode, audience_target, starts_at, ends_at, response_options, short_code)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, NULL, ?, ?, ?)`,
      [
        agencyId,
        req.user.id,
        title,
        question,
        audienceMode,
        audienceTarget ? JSON.stringify(audienceTarget) : null,
        endsAt ? new Date(endsAt) : null,
        JSON.stringify(responseOptions),
        shortCode
      ]
    );
    const campaignId = result.insertId;

    const recipientIds = Array.isArray(req.body?.recipientIds) ? req.body.recipientIds : [];
    if (audienceMode === 'selected' && recipientIds.length) {
      const values = recipientIds
        .map((id) => parseInt(String(id), 10))
        .filter(Boolean)
        .map((id) => [campaignId, id]);
      if (values.length) {
        await pool.query(
          `INSERT IGNORE INTO agency_campaign_recipients (campaign_id, user_id) VALUES ?`,
          [values]
        );
      }
    }

    const [rows] = await pool.execute('SELECT * FROM agency_campaigns WHERE id = ?', [campaignId]);
    res.status(201).json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const sendAgencyCampaign = async (req, res, next) => {
  try {
    const campaignId = parseInt(String(req.params?.id || ''), 10);
    if (!campaignId) return res.status(400).json({ error: { message: 'id is required' } });

    const [rows] = await pool.execute('SELECT * FROM agency_campaigns WHERE id = ?', [campaignId]);
    const campaign = rows?.[0];
    if (!campaign) return res.status(404).json({ error: { message: 'Campaign not found' } });
    const hasAccess = await ensureAgencyAccess(req.user.id, campaign.agency_id);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const flags = await getAgencyFeatureFlags(campaign.agency_id);
    if (!flags.agency_campaigns_enabled) {
      return res.status(403).json({ error: { message: 'Agency campaigns are not enabled' } });
    }

    const options = parseOptions(campaign.response_options);
    const summary = options
      .filter((o) => o?.key && o?.label)
      .map((o) => `${o.key}=${o.label}`)
      .join(', ');
    const body = `${campaign.question}\nReply ${summary}.`;

    const outbound = await resolveOutboundNumber({ userId: req.user.id });
    const fromNumber = outbound?.number?.phone_number || null;
    const numberId = outbound?.number?.id || null;

    if (!fromNumber) {
      return res.status(400).json({ error: { message: 'No outbound number available for this agency' } });
    }

    let recipients = [];
    if (campaign.audience_mode === 'all') {
      const staff = await listEligibleStaff(campaign.agency_id);
      recipients = staff.map((u) => ({ user_id: u.id, phone_number: u.phone_number || u.personal_phone || u.work_phone || null }));
      if (recipients.length) {
        const values = recipients.map((r) => [campaignId, r.user_id, r.phone_number]);
        await pool.query(
          `INSERT IGNORE INTO agency_campaign_recipients (campaign_id, user_id, phone_number) VALUES ?`,
          [values]
        );
      }
    } else if (campaign.audience_mode === 'contacts') {
      const target = campaign.audience_target && typeof campaign.audience_target === 'object'
        ? campaign.audience_target
        : typeof campaign.audience_target === 'string'
          ? (() => { try { return JSON.parse(campaign.audience_target); } catch { return {}; } })()
          : {};
      const contactList = await resolveContactsForAudience(campaign.agency_id, target);
      if (contactList.length === 0) {
        return res.status(400).json({ error: { message: 'No contacts found for the selected audience.' } });
      }
      const contactRecipients = contactList
        .filter((c) => c.phone)
        .map((c) => ({ contact_id: c.id, phone_number: MessageLog.normalizePhone(c.phone) }));
      if (contactRecipients.length === 0) {
        return res.status(400).json({ error: { message: 'No contacts with phone numbers found for the selected audience.' } });
      }
      const contactValues = contactRecipients.map((r) => [campaignId, r.contact_id, r.phone_number]);
      await pool.query(
        `INSERT IGNORE INTO agency_campaign_contact_deliveries (campaign_id, contact_id, phone_number) VALUES ?`,
        [contactValues]
      );
    } else {
      const [recRows] = await pool.execute(
        `SELECT acr.user_id, u.phone_number, u.personal_phone, u.work_phone
         FROM agency_campaign_recipients acr
         JOIN users u ON acr.user_id = u.id
         WHERE acr.campaign_id = ?`,
        [campaignId]
      );
      recipients = (recRows || []).map((r) => ({
        user_id: r.user_id,
        phone_number: r.phone_number || r.personal_phone || r.work_phone || null
      }));
    }
    if (campaign.audience_mode === 'selected' && recipients.length === 0) {
      return res.status(400).json({ error: { message: 'Selected campaigns must include recipients.' } });
    }

    let sentCount = 0;

    if (campaign.audience_mode === 'contacts') {
      const [contactRows] = await pool.execute(
        `SELECT contact_id, phone_number FROM agency_campaign_contact_deliveries WHERE campaign_id = ? AND delivery_status = 'pending'`,
        [campaignId]
      );
      for (const row of contactRows || []) {
        const to = MessageLog.normalizePhone(row.phone_number);
        if (!to) {
          await pool.execute(
            `UPDATE agency_campaign_contact_deliveries SET delivery_status = 'skipped', status_reason = 'no_phone' WHERE campaign_id = ? AND contact_id = ?`,
            [campaignId, row.contact_id]
          );
          continue;
        }
        try {
          const result = await TwilioService.sendSms({ to, from: fromNumber, body });
          await pool.execute(
            `UPDATE agency_campaign_contact_deliveries SET delivery_status = 'sent', status_reason = NULL WHERE campaign_id = ? AND contact_id = ?`,
            [campaignId, row.contact_id]
          );
          sentCount += 1;
          try {
            await ContactCommunicationLog.create({
              contactId: row.contact_id,
              channel: 'sms',
              direction: 'outbound',
              body,
              externalRefId: null,
              metadata: { from_number: fromNumber, to_number: to, campaign_id: campaignId }
            });
          } catch (e) {
            console.warn('Contact comm log (campaign) failed:', e.message);
          }
        } catch (e) {
          await pool.execute(
            `UPDATE agency_campaign_contact_deliveries SET delivery_status = 'failed', status_reason = ? WHERE campaign_id = ? AND contact_id = ?`,
            [String(e.message || 'failed').slice(0, 240), campaignId, row.contact_id]
          );
        }
      }
    } else {
    for (const recipient of recipients) {
      const userId = recipient.user_id;
      const to = MessageLog.normalizePhone(recipient.phone_number);
      if (!to) {
        await pool.execute(
          `UPDATE agency_campaign_recipients
           SET delivery_status = 'skipped', status_reason = 'no_phone'
           WHERE campaign_id = ? AND user_id = ?`,
          [campaignId, userId]
        );
        continue;
      }
      if (await hasOptedOut({ agencyId: campaign.agency_id, userId })) {
        await pool.execute(
          `UPDATE agency_campaign_recipients
           SET delivery_status = 'skipped', status_reason = 'opted_out'
           WHERE campaign_id = ? AND user_id = ?`,
          [campaignId, userId]
        );
        continue;
      }
      const log = await MessageLog.createOutbound({
        agencyId: campaign.agency_id,
        userId: req.user.id,
        assignedUserId: userId,
        numberId,
        ownerType: 'agency_campaign',
        clientId: null,
        body,
        fromNumber,
        toNumber: to,
        deliveryStatus: 'pending',
        metadata: { campaignId }
      });
      try {
        const result = await TwilioService.sendSms({ to, from: fromNumber, body });
        await MessageLog.markSent(log.id, result?.sid || null);
        await pool.execute(
          `UPDATE agency_campaign_recipients
           SET delivery_status = 'sent', status_reason = NULL
           WHERE campaign_id = ? AND user_id = ?`,
          [campaignId, userId]
        );
        sentCount += 1;
      } catch (e) {
        await MessageLog.markFailed(log.id, e.message);
        await pool.execute(
          `UPDATE agency_campaign_recipients
           SET delivery_status = 'failed', status_reason = ?
           WHERE campaign_id = ? AND user_id = ?`,
          [String(e.message || 'failed').slice(0, 240), campaignId, userId]
        );
      }
    }
    }

    await pool.execute(
      `UPDATE agency_campaigns
       SET status = 'sent', starts_at = COALESCE(starts_at, NOW())
       WHERE id = ?`,
      [campaignId]
    );
    res.json({ ok: true, sentCount });
  } catch (e) {
    next(e);
  }
};

export const closeAgencyCampaign = async (req, res, next) => {
  try {
    const campaignId = parseInt(String(req.params?.id || ''), 10);
    if (!campaignId) return res.status(400).json({ error: { message: 'id is required' } });
    const [rows] = await pool.execute('SELECT * FROM agency_campaigns WHERE id = ?', [campaignId]);
    const campaign = rows?.[0];
    if (!campaign) return res.status(404).json({ error: { message: 'Campaign not found' } });
    const hasAccess = await ensureAgencyAccess(req.user.id, campaign.agency_id);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    await pool.execute(`UPDATE agency_campaigns SET status = 'closed' WHERE id = ?`, [campaignId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listAgencyCampaignResponses = async (req, res, next) => {
  try {
    const campaignId = parseInt(String(req.params?.id || ''), 10);
    if (!campaignId) return res.status(400).json({ error: { message: 'id is required' } });

    const [rows] = await pool.execute('SELECT * FROM agency_campaigns WHERE id = ?', [campaignId]);
    const campaign = rows?.[0];
    if (!campaign) return res.status(404).json({ error: { message: 'Campaign not found' } });
    const hasAccess = await ensureAgencyAccess(req.user.id, campaign.agency_id);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const [responses] = await pool.execute(
      `SELECT ar.*,
              u.first_name,
              u.last_name,
              u.email
       FROM agency_campaign_responses ar
       JOIN users u ON ar.user_id = u.id
       WHERE ar.campaign_id = ?
       ORDER BY ar.received_at DESC, ar.id DESC`,
      [campaignId]
    );
    const [optRows] = await pool.execute(
      `SELECT aco.user_id, u.first_name, u.last_name, u.email
       FROM agency_campaign_opt_outs aco
       JOIN users u ON aco.user_id = u.id
       WHERE aco.agency_id = ?`,
      [campaign.agency_id]
    );
    res.json({ responses, optOuts: optRows || [] });
  } catch (e) {
    next(e);
  }
};

export const handleAgencyCampaignInbound = async ({ from, to, body }) => {
  const agencyMatch = await findAgencyByShortCode(to);
  if (!agencyMatch) return null;
  const agencyId = agencyMatch.agencyId;
  const campaign = await getActiveCampaign(agencyId);
  if (!campaign) {
    return { handled: true, responseMessage: 'Thanks! There is no active campaign right now.' };
  }

  const user = await findAgencyUserByPhone(agencyId, from);
  if (!user) {
    return { handled: true, responseMessage: 'Thanks! We could not match your number.' };
  }
  if (campaign.audience_mode === 'selected') {
    const [allowed] = await pool.execute(
      `SELECT id FROM agency_campaign_recipients WHERE campaign_id = ? AND user_id = ? LIMIT 1`,
      [campaign.id, user.id]
    );
    if (!allowed.length) {
      return { handled: true, responseMessage: 'Thanks! You are not in this campaign audience.' };
    }
  }

  const normalized = normalizeResponseInput(body, parseOptions(campaign.response_options));
  if (!normalized) {
    return { handled: true, responseMessage: 'Reply with Y, N, or OPT OUT.' };
  }
  if (normalized.key === 'OPTOUT') {
    await upsertOptOut({ agencyId, userId: user.id, source: 'sms' });
    await notifySupervisorsOptOut({ agencyId, userId: user.id });
    return { handled: true, responseMessage: 'You are opted out of engagement campaigns. Your supervisor has been notified.' };
  }

  if (await hasOptedOut({ agencyId, userId: user.id })) {
    return { handled: true, responseMessage: 'You are opted out of engagement campaigns.' };
  }

  await pool.execute(
    `INSERT INTO agency_campaign_responses
     (campaign_id, user_id, response_key, response_label, response_body, from_number, received_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       response_key = VALUES(response_key),
       response_label = VALUES(response_label),
       response_body = VALUES(response_body),
       from_number = VALUES(from_number),
       received_at = VALUES(received_at)`,
    [campaign.id, user.id, normalized.key, normalized.label, normalized.raw, MessageLog.normalizePhone(from) || from]
  );

  return { handled: true, responseMessage: 'Thanks for your response.' };
};
