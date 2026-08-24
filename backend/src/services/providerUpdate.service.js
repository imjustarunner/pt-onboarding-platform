/**
 * Provider Update — modular, toggleable staff update pushes (separate from Fall Update).
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import {
  defaultSectionConfig,
  normalizeSectionConfig,
  enabledSectionKeys,
  getSectionMeta,
  PROVIDER_UPDATE_EMAIL_SUBJECT,
  PROVIDER_UPDATE_REPLY_TO,
  PROVIDER_UPDATE_SECTIONS
} from '../constants/providerUpdateSections.js';
import { listSchoolAssignedProviders } from './providerYearUpdate.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveSenderIdentityForSend } from './emailSenderIdentityResolver.service.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';

const TOKEN_TTL_DAYS = 90;
const HEARTBEAT_MAX_DELTA_SEC = 120;
const HEARTBEAT_SESSION_GAP_MS = 30 * 60 * 1000;

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function publicAppOrigin() {
  return String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://plottwisthq.com').replace(/\/$/, '');
}

export function buildProviderUpdatePublicUrl(token, orgSlug = '') {
  const slug = String(orgSlug || '').trim().replace(/^\/+|\/+$/g, '');
  const path = slug ? `/${slug}/provider-update/${token}` : `/provider-update/${token}`;
  return `${publicAppOrigin()}${path}`;
}

async function assertAgencyAdmin(reqUser, agencyId) {
  const aid = Number(agencyId);
  if (!aid) throw Object.assign(new Error('agencyId is required'), { status: 400 });
  const role = String(reqUser?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support'].includes(role)) return aid;
  const agencies = await User.getAgencies(reqUser.id);
  const ok = (agencies || []).some((a) => Number(a.id) === aid);
  if (!ok) throw Object.assign(new Error('Access denied'), { status: 403 });
  return aid;
}


export async function listEligibleProviders(agencyId, { includeDemoTesters = true } = {}) {
  const schoolAssigned = await listSchoolAssignedProviders(agencyId);
  const byId = new Map(
    (schoolAssigned || []).map((p) => [
      Number(p.provider_user_id),
      {
        provider_user_id: Number(p.provider_user_id),
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        role: null,
        is_demo: 0,
        account_group: null,
        source: 'school_assigned'
      }
    ])
  );

  // Enrich roles / demo flags for school-assigned
  if (byId.size) {
    const ids = [...byId.keys()];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT u.id, u.role, COALESCE(u.is_demo, 0) AS is_demo
       FROM users u WHERE u.id IN (${placeholders})`,
      ids
    );
    for (const r of rows || []) {
      const cur = byId.get(Number(r.id));
      if (cur) {
        cur.role = r.role;
        cur.is_demo = Number(r.is_demo) ? 1 : 0;
      }
    }
  }

  if (includeDemoTesters) {
    try {
      const [testers] = await pool.execute(
        `SELECT u.id AS provider_user_id, u.first_name, u.last_name, u.email, u.role,
                COALESCE(u.is_demo, 0) AS is_demo, dta.account_group
         FROM demo_test_accounts dta
         JOIN users u ON u.id = dta.user_id
         WHERE dta.is_active = 1
           AND LOWER(COALESCE(u.role, '')) IN (
             'provider', 'provider_plus', 'clinical_practice_assistant',
             'intern', 'intern_plus', 'staff'
           )
           AND (u.is_archived IS NULL OR u.is_archived = 0)
           AND (
             EXISTS (
               SELECT 1 FROM user_agencies ua
               WHERE ua.user_id = u.id AND ua.agency_id = ?
             )
             OR dta.account_group IN ('demo', 'hogwarts')
           )
         ORDER BY dta.account_group ASC, u.last_name ASC, u.first_name ASC`,
        [Number(agencyId)]
      );
      for (const t of testers || []) {
        const id = Number(t.provider_user_id);
        if (!byId.has(id)) {
          byId.set(id, {
            provider_user_id: id,
            first_name: t.first_name,
            last_name: t.last_name,
            email: t.email,
            role: t.role,
            is_demo: 1,
            account_group: t.account_group || 'demo',
            source: 'demo_tester'
          });
        } else {
          const cur = byId.get(id);
          cur.role = cur.role || t.role;
          cur.is_demo = 1;
          cur.account_group = t.account_group || cur.account_group;
        }
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  }

  return [...byId.values()].sort((a, b) =>
    String(a.last_name || '').localeCompare(String(b.last_name || '')) ||
    String(a.first_name || '').localeCompare(String(b.first_name || ''))
  );
}

export function normalizeSectionAudience(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const mode = ['all', 'selected', 'auto'].includes(val.mode) ? val.mode : 'all';
    const userIds = Array.isArray(val.userIds)
      ? val.userIds.map((id) => Number(id)).filter((id) => id > 0)
      : Array.isArray(val.user_ids)
        ? val.user_ids.map((id) => Number(id)).filter((id) => id > 0)
        : [];
    out[key] = { mode, userIds };
  }
  return out;
}

export function recipientSeesSection(sectionKey, audienceConfig, providerUserId, { hasFallActions = null } = {}) {
  const cfg = audienceConfig?.[sectionKey];
  if (!cfg || cfg.mode === 'all') return true;
  if (cfg.mode === 'selected') return (cfg.userIds || []).includes(Number(providerUserId));
  if (cfg.mode === 'auto') {
    if (sectionKey === 'client_fall_update') return hasFallActions !== false;
    return true;
  }
  return true;
}

export async function listSectionCatalog() {
  return PROVIDER_UPDATE_SECTIONS;
}

export async function createPush({
  agencyId,
  title,
  sectionConfig,
  notes,
  createdByUserId,
  attachedAdminUpdateId = null,
  sectionAudience = null,
  amendmentPlan = null
}) {
  const aid = Number(agencyId);
  const cfg = normalizeSectionConfig(sectionConfig);
  const audience = normalizeSectionAudience(sectionAudience || {});
  try {
    const [result] = await pool.execute(
      `INSERT INTO provider_update_pushes
        (agency_id, title, status, section_config_json, notes, created_by_user_id, attached_admin_update_id,
         section_audience_json, amendment_plan_json)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      [
        aid,
        String(title || 'Provider Update').trim().slice(0, 255),
        JSON.stringify(cfg),
        notes != null ? String(notes) : null,
        createdByUserId || null,
        attachedAdminUpdateId ? Number(attachedAdminUpdateId) : null,
        JSON.stringify(audience),
        amendmentPlan ? JSON.stringify(amendmentPlan) : null
      ]
    );
    return getPush(result.insertId);
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    const [result] = await pool.execute(
      `INSERT INTO provider_update_pushes
        (agency_id, title, status, section_config_json, notes, created_by_user_id, attached_admin_update_id)
       VALUES (?, ?, 'draft', ?, ?, ?, ?)`,
      [
        aid,
        String(title || 'Provider Update').trim().slice(0, 255),
        JSON.stringify(cfg),
        notes != null ? String(notes) : null,
        createdByUserId || null,
        attachedAdminUpdateId ? Number(attachedAdminUpdateId) : null
      ]
    );
    return getPush(result.insertId);
  }
}

export async function updatePush({ pushId, agencyId, title, sectionConfig, notes, status, attachedAdminUpdateId, sectionAudience, amendmentPlan }) {
  const push = await getPush(pushId);
  if (!push || Number(push.agency_id) !== Number(agencyId)) {
    throw Object.assign(new Error('Push not found'), { status: 404 });
  }
  if (push.status === 'sent' && status !== 'closed') {
    // allow section notes/title edits on draft only for config; sent pushes can close
  }
  const nextTitle = title != null ? String(title).trim().slice(0, 255) : push.title;
  const nextCfg =
    sectionConfig != null ? normalizeSectionConfig(sectionConfig) : normalizeSectionConfig(push.section_config_json);
  const nextNotes = notes !== undefined ? (notes != null ? String(notes) : null) : push.notes;
  const nextStatus = status && ['draft', 'sent', 'closed'].includes(status) ? status : push.status;
  const nextAttached =
    attachedAdminUpdateId !== undefined
      ? (attachedAdminUpdateId ? Number(attachedAdminUpdateId) : null)
      : push.attached_admin_update_id;
  const nextAudience =
    sectionAudience !== undefined
      ? normalizeSectionAudience(sectionAudience)
      : normalizeSectionAudience(push.section_audience_json || {});
  const nextAmendment =
    amendmentPlan !== undefined ? (amendmentPlan || null) : (push.amendment_plan_json || null);
  try {
    await pool.execute(
      `UPDATE provider_update_pushes
       SET title = ?, section_config_json = ?, notes = ?, status = ?, attached_admin_update_id = ?,
           section_audience_json = ?, amendment_plan_json = ?,
           closed_at = CASE WHEN ? = 'closed' AND closed_at IS NULL THEN UTC_TIMESTAMP() ELSE closed_at END
       WHERE id = ?`,
      [
        nextTitle,
        JSON.stringify(nextCfg),
        nextNotes,
        nextStatus,
        nextAttached,
        JSON.stringify(nextAudience),
        nextAmendment ? JSON.stringify(nextAmendment) : null,
        nextStatus,
        pushId
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    await pool.execute(
      `UPDATE provider_update_pushes
       SET title = ?, section_config_json = ?, notes = ?, status = ?, attached_admin_update_id = ?,
           closed_at = CASE WHEN ? = 'closed' AND closed_at IS NULL THEN UTC_TIMESTAMP() ELSE closed_at END
       WHERE id = ?`,
      [nextTitle, JSON.stringify(nextCfg), nextNotes, nextStatus, nextAttached, nextStatus, pushId]
    );
  }
  return getPush(pushId);
}

export async function getPush(pushId) {
  const [rows] = await pool.execute(`SELECT * FROM provider_update_pushes WHERE id = ? LIMIT 1`, [
    Number(pushId)
  ]);
  const row = rows?.[0];
  if (!row) return null;
  return {
    ...row,
    section_config_json: normalizeSectionConfig(parseJson(row.section_config_json, defaultSectionConfig())),
    section_audience_json: normalizeSectionAudience(parseJson(row.section_audience_json, {})),
    amendment_plan_json: parseJson(row.amendment_plan_json, null),
    enabledKeys: enabledSectionKeys(parseJson(row.section_config_json, defaultSectionConfig()))
  };
}

export async function listPushes(agencyId) {
  const [rows] = await pool.execute(
    `SELECT p.*,
            (SELECT COUNT(*) FROM provider_update_recipients r WHERE r.push_id = p.id) AS recipient_count,
            (SELECT COUNT(*) FROM provider_update_recipients r WHERE r.push_id = p.id AND r.status = 'finalized') AS finalized_count,
            (SELECT COALESCE(SUM(r.active_seconds), 0) FROM provider_update_recipients r WHERE r.push_id = p.id) AS total_active_seconds
     FROM provider_update_pushes p
     WHERE p.agency_id = ?
     ORDER BY COALESCE(p.sent_at, p.created_at) DESC, p.id DESC
     LIMIT 100`,
    [Number(agencyId)]
  );
  return (rows || []).map((row) => ({
    ...row,
    section_config_json: normalizeSectionConfig(parseJson(row.section_config_json, defaultSectionConfig())),
    section_audience_json: normalizeSectionAudience(parseJson(row.section_audience_json, {})),
    amendment_plan_json: parseJson(row.amendment_plan_json, null),
    enabledKeys: enabledSectionKeys(parseJson(row.section_config_json, defaultSectionConfig()))
  }));
}

async function ensureRecipient({ pushId, agencyId, providerUserId, expiresAt, roleSnapshot = null, isDemoSnapshot = 0 }) {
  const [existing] = await pool.execute(
    `SELECT * FROM provider_update_recipients WHERE push_id = ? AND provider_user_id = ? LIMIT 1`,
    [pushId, providerUserId]
  );
  if (existing?.[0]) {
    try {
      await pool.execute(
        `UPDATE provider_update_recipients
         SET role_snapshot = COALESCE(?, role_snapshot),
             is_demo_snapshot = GREATEST(COALESCE(is_demo_snapshot, 0), ?)
         WHERE id = ?`,
        [roleSnapshot, isDemoSnapshot ? 1 : 0, existing[0].id]
      );
    } catch {
      /* columns may not exist until migration 1268 */
    }
    return existing[0];
  }
  const token = crypto.randomBytes(24).toString('hex');
  try {
    const [ins] = await pool.execute(
      `INSERT INTO provider_update_recipients
        (push_id, agency_id, provider_user_id, token, expires_at, role_snapshot, is_demo_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pushId, agencyId, providerUserId, token, expiresAt, roleSnapshot, isDemoSnapshot ? 1 : 0]
    );
    const [rows] = await pool.execute(`SELECT * FROM provider_update_recipients WHERE id = ?`, [ins.insertId]);
    return rows[0];
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    const [ins] = await pool.execute(
      `INSERT INTO provider_update_recipients
        (push_id, agency_id, provider_user_id, token, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [pushId, agencyId, providerUserId, token, expiresAt]
    );
    const [rows] = await pool.execute(`SELECT * FROM provider_update_recipients WHERE id = ?`, [ins.insertId]);
    return rows[0];
  }
}

async function ensureSectionRows(recipientId, enabledKeys) {
  for (const key of enabledKeys) {
    await pool.execute(
      `INSERT IGNORE INTO provider_update_section_progress (recipient_id, section_key, status)
       VALUES (?, ?, 'not_started')`,
      [recipientId, key]
    );
  }
}

export async function sendPush({ pushId, agencyId, sentByUserId, providerUserIds = null, orgSlug = '' }) {
  const push = await getPush(pushId);
  if (!push || Number(push.agency_id) !== Number(agencyId)) {
    throw Object.assign(new Error('Push not found'), { status: 404 });
  }
  if (push.status === 'closed') {
    throw Object.assign(new Error('Push is closed'), { status: 400 });
  }

  const providers = await listEligibleProviders(agencyId, { includeDemoTesters: true });
  const allow = providerUserIds?.length
    ? new Set(providerUserIds.map((id) => Number(id)))
    : null;
  const targets = allow
    ? providers.filter((p) => allow.has(Number(p.provider_user_id)))
    : providers;
  if (!targets.length) {
    throw Object.assign(new Error('No providers to send'), { status: 400 });
  }

  const agency = await Agency.findById(agencyId);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const audience = normalizeSectionAudience(parseJson(push.section_audience_json, {}));
  const amendmentPlan = parseJson(push.amendment_plan_json, null);
  const enabledKeys = enabledSectionKeys(push.section_config_json);

  const resolved = await resolveSenderIdentityForSend({
    agencyId,
    templateType: 'provider_update_invite',
    preferredKeys: ['people_operations', 'people_ops', 'po', 'notifications']
  });

  const results = [];
  for (const p of targets) {
    const recipient = await ensureRecipient({
      pushId,
      agencyId,
      providerUserId: Number(p.provider_user_id),
      expiresAt,
      roleSnapshot: p.role || null,
      isDemoSnapshot: Number(p.is_demo) ? 1 : 0
    });
    const keysForRecipient = enabledKeys.filter((key) =>
      recipientSeesSection(key, audience, p.provider_user_id, { hasFallActions: null })
    );
    await ensureSectionRows(recipient.id, keysForRecipient.length ? keysForRecipient : enabledKeys);

    // Assign amendment document tasks when plan is attached and section is enabled for this user
    if (keysForRecipient.includes('amendments') && amendmentPlan) {
      try {
        const {
          isJobDescriptionAcknowledgmentPlan,
          assignJobDescriptionAcknowledgmentAmendment
        } = await import('./providerUpdateAmendment.service.js');

        if (isJobDescriptionAcknowledgmentPlan(amendmentPlan)) {
          await assignJobDescriptionAcknowledgmentAmendment({
            agencyId,
            userId: Number(p.provider_user_id),
            amendmentPlan,
            pushId,
            createdByUserId: sentByUserId || null
          });
        } else if (amendmentPlan?.documentTemplateId) {
          const TaskAssignmentService = (await import('./taskAssignment.service.js')).default;
          await TaskAssignmentService.assignDocumentTask({
            documentTemplateId: Number(amendmentPlan.documentTemplateId),
            assignedToUserId: Number(p.provider_user_id),
            assignedByUserId: sentByUserId || null,
            assignedToAgencyId: agencyId,
            title: amendmentPlan.title || 'Contract amendment',
            dueDate: amendmentPlan.effectiveDate || null,
            metadata: {
              source: 'provider_update',
              pushId,
              effectiveDate: amendmentPlan.effectiveDate || null,
              amendmentMode: 'document_template'
            }
          });
        }
      } catch (e) {
        console.warn('[providerUpdate] amendment assign failed', e?.message || e);
      }
    }

    const link = buildProviderUpdatePublicUrl(recipient.token, orgSlug || agency?.portal_url || agency?.slug);
    const to = String(p.email || '').trim().toLowerCase();
    const subject = PROVIDER_UPDATE_EMAIL_SUBJECT;
    const text = [
      `Hello ${p.first_name || 'there'},`,
      '',
      'Please complete your Provider Update. Your responses help keep scheduling, compliance, and school information current.',
      '',
      `Open your update: ${link}`,
      '',
      'Important: this message often lands in Junk or Spam. Please check Junk if you do not see it in Inbox.',
      '',
      '— People Operations'
    ].join('\n');

    let deliveryStatus = 'pending';
    let errorMessage = null;
    let externalMessageId = null;
    let communicationId = null;

    if (!to || !to.includes('@')) {
      deliveryStatus = 'failed';
      errorMessage = 'No email on provider account';
    } else {
      try {
        let comm = null;
        try {
          comm = await CommunicationLoggingService.logGeneratedCommunication({
            userId: Number(p.provider_user_id),
            agencyId,
            templateType: 'provider_update_invite',
            subject,
            body: text,
            generatedByUserId: sentByUserId || null,
            channel: 'email',
            recipientAddress: to
          });
        } catch {
          comm = null;
        }

        if (resolved?.identity?.id) {
          const sendResult = await sendEmailFromIdentity({
            senderIdentityId: resolved.identity.id,
            to,
            subject,
            text,
            html: `<pre style="font-family:inherit;white-space:pre-wrap;">${text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')}</pre>`,
            source: 'auto',
            agencyId,
            userId: Number(p.provider_user_id),
            existingCommunicationId: comm?.id || null,
            templateType: 'provider_update_invite',
            usedFallbackSender: false,
            replyToOverride: PROVIDER_UPDATE_REPLY_TO
          });
          if (sendResult?.queued) {
            deliveryStatus = 'pending';
            errorMessage = sendResult.reason || 'pending approval';
            communicationId = sendResult.communicationId || comm?.id || null;
          } else if (sendResult?.skipped || sendResult?.blocked) {
            deliveryStatus = sendResult.skipped ? 'skipped' : 'failed';
            errorMessage = sendResult.reason || 'not sent';
            communicationId = sendResult.communicationId || comm?.id || null;
          } else {
            deliveryStatus = 'sent';
            externalMessageId = sendResult?.id || null;
            communicationId = sendResult?.communicationId || comm?.id || null;
            if (comm?.id && sendResult?.id) {
              await CommunicationLoggingService.markAsSent(comm.id, sendResult.id, {
                replyTo: PROVIDER_UPDATE_REPLY_TO
              }).catch(() => {});
            }
          }
        } else {
          deliveryStatus = 'pending';
          errorMessage = 'No People Ops sender identity configured — queued visually as pending';
          communicationId = comm?.id || null;
          if (comm?.id) {
            await pool
              .execute(
                `UPDATE user_communications SET delivery_status = 'pending', error_message = ? WHERE id = ?`,
                [errorMessage, comm.id]
              )
              .catch(() => {});
          }
        }
      } catch (e) {
        deliveryStatus = 'failed';
        errorMessage = String(e?.message || e).slice(0, 500);
      }
    }

    await pool.execute(
      `INSERT INTO provider_update_sends
        (push_id, recipient_id, provider_user_id, to_email, subject, delivery_status, error_message, external_message_id, communication_id, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'sent' THEN UTC_TIMESTAMP() ELSE NULL END)`,
      [
        pushId,
        recipient.id,
        Number(p.provider_user_id),
        to || null,
        subject,
        deliveryStatus,
        errorMessage,
        externalMessageId,
        communicationId,
        deliveryStatus
      ]
    );

    results.push({
      providerUserId: Number(p.provider_user_id),
      email: to,
      deliveryStatus,
      token: recipient.token,
      link
    });
  }

  await pool.execute(
    `UPDATE provider_update_pushes
     SET status = 'sent', sent_at = COALESCE(sent_at, UTC_TIMESTAMP()), sent_by_user_id = ?
     WHERE id = ?`,
    [sentByUserId || null, pushId]
  );

  return { push: await getPush(pushId), results };
}

export async function listRecipients(pushId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT r.*,
            u.first_name, u.last_name, u.email,
            COALESCE(r.role_snapshot, u.role) AS role_snapshot,
            GREATEST(COALESCE(r.is_demo_snapshot, 0), COALESCE(u.is_demo, 0)) AS is_demo_snapshot,
            (SELECT COUNT(*) FROM provider_update_section_progress sp
              WHERE sp.recipient_id = r.id AND sp.completed = 1) AS sections_completed,
            (SELECT COUNT(*) FROM provider_update_section_progress sp
              WHERE sp.recipient_id = r.id) AS sections_total
     FROM provider_update_recipients r
     JOIN users u ON u.id = r.provider_user_id
     WHERE r.push_id = ? AND r.agency_id = ?
     ORDER BY u.last_name, u.first_name`,
    [Number(pushId), Number(agencyId)]
  );
  return rows || [];
}

export async function getRecipientByToken(token) {
  const tok = String(token || '').trim();
  if (!tok) return null;
  const [rows] = await pool.execute(
    `SELECT r.*, p.title AS push_title, p.section_config_json, p.status AS push_status,
            u.first_name, u.last_name, u.email
     FROM provider_update_recipients r
     JOIN provider_update_pushes p ON p.id = r.push_id
     JOIN users u ON u.id = r.provider_user_id
     WHERE r.token = ?
     LIMIT 1`,
    [tok]
  );
  const row = rows?.[0];
  if (!row) return null;
  if (row.locked_at) {
    throw Object.assign(new Error('This update link is locked'), { status: 410 });
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error('This update link has expired'), { status: 410 });
  }
  return {
    ...row,
    section_config_json: normalizeSectionConfig(parseJson(row.section_config_json, defaultSectionConfig()))
  };
}

export async function recordViewEvent(recipientId, eventType, sectionKey = null, metadata = null) {
  await pool.execute(
    `INSERT INTO provider_update_view_events (recipient_id, event_type, section_key, metadata_json)
     VALUES (?, ?, ?, ?)`,
    [recipientId, String(eventType), sectionKey || null, metadata ? JSON.stringify(metadata) : null]
  );
  await pool.execute(
    `UPDATE provider_update_recipients
     SET click_count = click_count + IF(? = 'token_click', 1, 0),
         last_viewed_at = UTC_TIMESTAMP(),
         status = IF(status = 'not_started', 'in_progress', status)
     WHERE id = ?`,
    [eventType, recipientId]
  );
}

export async function getRecipientBundle(recipient) {
  const push = await getPush(recipient.push_id);
  const audience = normalizeSectionAudience(push?.section_audience_json || {});
  let enabledKeys = enabledSectionKeys(recipient.section_config_json || push?.section_config_json);
  if (enabledKeys.includes('client_fall_update') && audience.client_fall_update?.mode === 'auto') {
    const fallClients = await listFallActionClientsForProvider(recipient.provider_user_id, recipient.agency_id);
    if (!fallClients.length) {
      enabledKeys = enabledKeys.filter((k) => k !== 'client_fall_update');
    }
  }
  enabledKeys = enabledKeys.filter((key) =>
    recipientSeesSection(key, audience, recipient.provider_user_id)
  );
  await ensureSectionRows(recipient.id, enabledKeys);
  const [sections] = await pool.execute(
    `SELECT * FROM provider_update_section_progress WHERE recipient_id = ?`,
    [recipient.id]
  );
  const byKey = Object.fromEntries((sections || []).map((s) => [s.section_key, s]));
  const sectionList = enabledKeys.map((key) => {
    const meta = getSectionMeta(key);
    const prog = byKey[key] || { status: 'not_started', completed: 0, data_json: null };
    return {
      key,
      meta,
      status: prog.completed ? 'completed' : prog.status || 'not_started',
      completed: !!prog.completed,
      mode: prog.mode || meta?.mode || null,
      data: parseJson(prog.data_json, {})
    };
  });
  const completedCount = sectionList.filter((s) => s.completed).length;
  let agency = null;
  try {
    const Agency = (await import('../models/Agency.model.js')).default;
    const row = await Agency.findById(recipient.agency_id);
    if (row) {
      agency = {
        id: row.id,
        name: row.name,
        slug: row.slug || row.portal_url || null,
        logo_path: row.logo_path || null,
        logo_url: row.logo_url || null,
        icon_file_path: row.icon_file_path || null,
        color_palette: row.color_palette || null
      };
    }
  } catch {
    agency = null;
  }

  let amendmentTasks = [];
  let resolvedJobDescription = null;
  if (push?.amendment_plan_json) {
    try {
      const {
        listAmendmentTasksForRecipient,
        resolveJobDescriptionForUser,
        isJobDescriptionAcknowledgmentPlan
      } = await import('./providerUpdateAmendment.service.js');
      amendmentTasks = await listAmendmentTasksForRecipient({
        userId: recipient.provider_user_id,
        pushId: recipient.push_id
      });
      if (isJobDescriptionAcknowledgmentPlan(push?.amendment_plan_json)) {
        resolvedJobDescription = await resolveJobDescriptionForUser({
          agencyId: recipient.agency_id,
          userId: recipient.provider_user_id
        });
      }
    } catch {
      amendmentTasks = [];
      resolvedJobDescription = null;
    }
  }

  return {
    recipient: {
      id: recipient.id,
      pushId: recipient.push_id,
      agencyId: recipient.agency_id,
      pushTitle: recipient.push_title,
      status: recipient.status,
      activeSeconds: Number(recipient.active_seconds || 0),
      providerUserId: recipient.provider_user_id,
      firstName: recipient.first_name,
      lastName: recipient.last_name,
      email: recipient.email,
      finalizedAt: recipient.finalized_at,
      lockedAt: recipient.locked_at,
      attachedAdminUpdateId: push?.attached_admin_update_id || null,
      amendmentPlan: push?.amendment_plan_json || null,
      amendmentTasks,
      resolvedJobDescription
    },
    agency,
    sections: sectionList,
    progress: {
      completed: completedCount,
      total: sectionList.length,
      percent: sectionList.length ? Math.round((completedCount / sectionList.length) * 100) : 0
    }
  };
}

export async function recordHeartbeat(recipientId) {
  const [rows] = await pool.execute(
    `SELECT id, active_seconds, last_heartbeat_at, status, locked_at FROM provider_update_recipients WHERE id = ? LIMIT 1`,
    [recipientId]
  );
  const row = rows?.[0];
  if (!row || row.locked_at) return { activeSeconds: Number(row?.active_seconds || 0) };
  const now = Date.now();
  const last = row.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : 0;
  let delta = 60;
  if (last) {
    const gap = now - last;
    if (gap > HEARTBEAT_SESSION_GAP_MS) delta = 60;
    else delta = Math.min(HEARTBEAT_MAX_DELTA_SEC, Math.max(0, Math.round(gap / 1000)));
  }
  await pool.execute(
    `UPDATE provider_update_recipients
     SET active_seconds = active_seconds + ?,
         last_heartbeat_at = UTC_TIMESTAMP(),
         status = IF(status = 'not_started', 'in_progress', status)
     WHERE id = ?`,
    [delta, recipientId]
  );
  const [after] = await pool.execute(`SELECT active_seconds FROM provider_update_recipients WHERE id = ?`, [
    recipientId
  ]);
  return { activeSeconds: Number(after?.[0]?.active_seconds || 0) };
}

export async function updateSectionProgress({
  recipientId,
  sectionKey,
  completed = false,
  mode = null,
  data = null,
  status = null
}) {
  const meta = getSectionMeta(sectionKey);
  if (!meta) throw Object.assign(new Error('Unknown section'), { status: 400 });
  await ensureSectionRows(recipientId, [sectionKey]);
  const nextStatus = completed ? 'completed' : status || (data ? 'in_progress' : 'not_started');
  await pool.execute(
    `UPDATE provider_update_section_progress
     SET completed = ?,
         completed_at = CASE WHEN ? = 1 THEN UTC_TIMESTAMP() ELSE completed_at END,
         status = ?,
         mode = COALESCE(?, mode),
         data_json = COALESCE(?, data_json),
         updated_at = CURRENT_TIMESTAMP
     WHERE recipient_id = ? AND section_key = ?`,
    [
      completed ? 1 : 0,
      completed ? 1 : 0,
      nextStatus,
      mode,
      data != null ? JSON.stringify(data) : null,
      recipientId,
      sectionKey
    ]
  );
  await pool.execute(
    `UPDATE provider_update_recipients
     SET status = IF(status = 'not_started', 'in_progress', status)
     WHERE id = ?`,
    [recipientId]
  );
  await recordViewEvent(recipientId, 'section_save', sectionKey).catch(() => {});
  return true;
}

export async function finalizeRecipient({ recipientId, actorType = 'provider', actorUserId = null }) {
  const [rows] = await pool.execute(`SELECT * FROM provider_update_recipients WHERE id = ? LIMIT 1`, [
    recipientId
  ]);
  const recipient = rows?.[0];
  if (!recipient) throw Object.assign(new Error('Recipient not found'), { status: 404 });
  if (recipient.locked_at) return recipient;

  const push = await getPush(recipient.push_id);
  const enabledKeys = enabledSectionKeys(push.section_config_json);
  const [sections] = await pool.execute(
    `SELECT section_key, completed FROM provider_update_section_progress WHERE recipient_id = ?`,
    [recipientId]
  );
  const done = new Set((sections || []).filter((s) => s.completed).map((s) => s.section_key));
  const missing = enabledKeys.filter((k) => !done.has(k));
  if (missing.length) {
    throw Object.assign(new Error(`Complete all sections first: ${missing.join(', ')}`), {
      status: 400,
      details: { missing }
    });
  }

  const snapshot = {
    enabledKeys,
    sections: sections || [],
    activeSeconds: Number(recipient.active_seconds || 0),
    finalizedAt: new Date().toISOString()
  };
  await pool.execute(
    `UPDATE provider_update_recipients
     SET status = 'finalized',
         finalized_at = UTC_TIMESTAMP(),
         finalized_by_actor_type = ?,
         finalized_by_user_id = ?,
         locked_at = UTC_TIMESTAMP(),
         snapshot_json = ?
     WHERE id = ?`,
    [actorType, actorUserId, JSON.stringify(snapshot), recipientId]
  );
  const [after] = await pool.execute(`SELECT * FROM provider_update_recipients WHERE id = ?`, [recipientId]);
  return after[0];
}

export async function exportPushCsv(pushId, agencyId) {
  const recipients = await listRecipients(pushId, agencyId);
  const header = [
    'provider_user_id',
    'first_name',
    'last_name',
    'email',
    'status',
    'sections_completed',
    'sections_total',
    'active_seconds',
    'active_minutes',
    'finalized_at',
    'last_viewed_at',
    'click_count'
  ];
  const lines = [header.join(',')];
  for (const r of recipients) {
    lines.push(
      [
        r.provider_user_id,
        JSON.stringify(r.first_name || ''),
        JSON.stringify(r.last_name || ''),
        JSON.stringify(r.email || ''),
        r.status,
        r.sections_completed || 0,
        r.sections_total || 0,
        r.active_seconds || 0,
        Math.round(Number(r.active_seconds || 0) / 60),
        r.finalized_at ? new Date(r.finalized_at).toISOString() : '',
        r.last_viewed_at ? new Date(r.last_viewed_at).toISOString() : '',
        r.click_count || 0
      ].join(',')
    );
  }
  return lines.join('\n');
}

export async function submitPushForPayroll({ pushId, agencyId, submittedByUserId }) {
  const push = await getPush(pushId);
  if (!push || Number(push.agency_id) !== Number(agencyId)) {
    throw Object.assign(new Error('Push not found'), { status: 404 });
  }
  const recipients = await listRecipients(pushId, agencyId);
  const created = [];
  const skipped = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const r of recipients) {
    if (r.payroll_time_claim_id) {
      skipped.push({ providerUserId: r.provider_user_id, reason: 'already_submitted' });
      continue;
    }
    const seconds = Number(r.active_seconds || 0);
    if (seconds < 60) {
      skipped.push({ providerUserId: r.provider_user_id, reason: 'under_one_minute' });
      continue;
    }
    const hours = Math.round((seconds / 3600) * 100) / 100;
    const claim = await PayrollTimeClaim.create({
      agencyId,
      userId: Number(r.provider_user_id),
      submittedByUserId: submittedByUserId || Number(r.provider_user_id),
      status: 'submitted',
      claimType: 'indirect_time',
      claimDate: today,
      payload: {
        source: 'provider_update',
        pushId: Number(pushId),
        recipientId: Number(r.id),
        activeSeconds: seconds,
        creditsHours: hours,
        description: `Provider Update: ${push.title}`,
        bucket: 'indirect'
      }
    });
    await pool.execute(
      `UPDATE provider_update_recipients SET payroll_time_claim_id = ? WHERE id = ?`,
      [claim.id, r.id]
    );
    created.push({ providerUserId: r.provider_user_id, claimId: claim.id, hours });
  }

  await pool.execute(
    `UPDATE provider_update_pushes
     SET payroll_submitted_at = UTC_TIMESTAMP(), payroll_submitted_by_user_id = ?, status = IF(status = 'sent', 'closed', status),
         closed_at = COALESCE(closed_at, UTC_TIMESTAMP())
     WHERE id = ?`,
    [submittedByUserId || null, pushId]
  );

  return { created, skipped, push: await getPush(pushId) };
}

export async function getMyOpenRecipient(providerUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT r.*, p.title AS push_title, p.section_config_json, p.status AS push_status,
            u.first_name, u.last_name, u.email
     FROM provider_update_recipients r
     JOIN provider_update_pushes p ON p.id = r.push_id
     JOIN users u ON u.id = r.provider_user_id
     WHERE r.provider_user_id = ? AND r.agency_id = ?
       AND r.locked_at IS NULL
       AND p.status IN ('sent', 'draft')
       AND (r.expires_at IS NULL OR r.expires_at > UTC_TIMESTAMP())
     ORDER BY COALESCE(p.sent_at, p.created_at) DESC
     LIMIT 1`,
    [providerUserId, agencyId]
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    ...row,
    section_config_json: normalizeSectionConfig(parseJson(row.section_config_json, defaultSectionConfig()))
  };
}


export async function listOpenForBookingForProvider(providerUserId) {
  const uid = Number(providerUserId);
  if (!uid) return [];
  try {
    const [rows] = await pool.query(
      `SELECT osa.id AS standing_assignment_id,
              osa.office_location_id,
              osa.room_id,
              osa.weekday,
              osa.hour,
              osa.assigned_frequency,
              osa.availability_mode,
              osa.temporary_until_date,
              ol.name AS office_name,
              r.name AS room_name,
              r.label AS room_label
       FROM office_standing_assignments osa
       JOIN office_locations ol ON ol.id = osa.office_location_id
       JOIN office_rooms r ON r.id = osa.room_id
       WHERE osa.provider_id = ?
         AND osa.is_active = TRUE
         AND (
           (osa.availability_mode = 'AVAILABLE' AND NOT EXISTS (
             SELECT 1 FROM office_booking_plans bp
             WHERE bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
               AND (bp.active_until_date IS NULL OR bp.active_until_date >= CURDATE())
           ))
           OR
           (osa.availability_mode = 'TEMPORARY'
             AND osa.temporary_until_date IS NOT NULL
             AND osa.temporary_until_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY))
         )
       ORDER BY osa.weekday ASC, osa.hour ASC
       LIMIT 80`,
      [uid]
    );
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (rows || []).map((row) => {
      const mode = String(row.availability_mode || '').toUpperCase();
      const wd = Number(row.weekday);
      const hour = Number(row.hour);
      return {
        id: Number(row.standing_assignment_id),
        standingAssignmentId: Number(row.standing_assignment_id),
        officeLocationId: Number(row.office_location_id),
        roomId: Number(row.room_id),
        title: `${String(row.office_name || 'Office').trim()} · ${String(row.room_label || row.room_name || 'Room').trim()}`,
        when: `${weekdayNames[wd] || `Day ${wd}`} · ${hour}:00 · ${String(row.assigned_frequency || 'WEEKLY').toUpperCase()}`,
        availabilityMode: mode,
        needsOpen: true,
        reason: mode === 'TEMPORARY' ? 'temporary_expiring' : 'needs_open_for_booking'
      };
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}



export async function listAdminUpdatesForAttach(agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, title, status, sent_at, scheduled_at, created_at, updated_at, public_token
     FROM admin_updates
     WHERE agency_id = ?
     ORDER BY COALESCE(sent_at, scheduled_at, updated_at) DESC, id DESC
     LIMIT 50`,
    [Number(agencyId)]
  );
  return rows || [];
}

export async function getAdminUpdateBundle(agencyId, updateId = null, { allowDraft = false } = {}) {
  const aid = Number(agencyId);
  if (!aid) return null;
  let row = null;
  if (updateId) {
    const [rows] = await pool.execute(
      `SELECT id, title, status, public_token, sent_at, scheduled_at
       FROM admin_updates WHERE agency_id = ? AND id = ? LIMIT 1`,
      [aid, Number(updateId)]
    );
    row = rows?.[0] || null;
  } else {
    const statuses = allowDraft
      ? ['sent', 'sending', 'scheduled', 'draft']
      : ['sent', 'sending', 'scheduled'];
    const placeholders = statuses.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, title, status, public_token, sent_at, scheduled_at
       FROM admin_updates
       WHERE agency_id = ? AND status IN (${placeholders})
       ORDER BY COALESCE(sent_at, scheduled_at, updated_at) DESC, id DESC
       LIMIT 1`,
      [aid, ...statuses]
    );
    row = rows?.[0] || null;
  }
  if (!row) return null;
  const AdminUpdateService = await import('./adminUpdate.service.js');
  const preview = await AdminUpdateService.previewHtml(aid, row.id);
  const detail = await AdminUpdateService.getUpdate(aid, row.id).catch(() => null);
  return {
    updateId: row.id,
    title: row.title,
    status: row.status,
    sentAt: row.sent_at,
    viewUrl: preview.viewUrl,
    pageHtml: preview.pageHtml || preview.html || '',
    publicToken: preview.publicToken || row.public_token || null,
    detail
  };
}

/** @deprecated use getAdminUpdateBundle */
export async function getLatestAdminUpdateBundle(agencyId, opts = {}) {
  return getAdminUpdateBundle(agencyId, null, opts);
}


export async function listFallActionClientsForProvider(providerUserId, agencyId) {
  // Best-effort: clients assigned to provider with non-quiet lifecycle fall actions.
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT c.id, c.first_name, c.last_name, c.preferred_name,
              cs.status_key AS client_status_key,
              sch.id AS school_organization_id,
              sch.name AS school_name
       FROM clients c
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       LEFT JOIN agencies sch ON sch.id = c.school_organization_id
       WHERE (c.is_archived IS NULL OR c.is_archived = 0)
         AND (
           c.provider_id = ?
           OR EXISTS (
             SELECT 1 FROM client_provider_assignments cpa
             WHERE cpa.client_id = c.id AND cpa.provider_user_id = ? AND cpa.is_active = 1
           )
         )
         AND (
           c.agency_id = ?
           OR EXISTS (
             SELECT 1 FROM organization_affiliations oa
             WHERE oa.organization_id = c.school_organization_id AND oa.agency_id = ?
           )
         )
       ORDER BY c.last_name, c.first_name
       LIMIT 200`,
      [providerUserId, providerUserId, agencyId, agencyId]
    );
    const { deriveLifecycleAction } = await import('../utils/clientLifecycleAction.js');
    const out = [];
    for (const c of rows || []) {
      const action = deriveLifecycleAction({
        client: {
          ...c,
          client_status_key: c.client_status_key
        },
        viewerRole: 'provider',
        disposition: null
      });
      if (action && !action.quiet) {
        out.push({
          id: c.id,
          firstName: c.first_name,
          lastName: c.last_name,
          preferredName: c.preferred_name,
          schoolName: c.school_name,
          schoolOrganizationId: c.school_organization_id,
          lifecycleAction: action
        });
      }
    }
    return out;
  } catch (e) {
    console.warn('[providerUpdate] fall actions lookup failed', e?.message || e);
    return [];
  }
}

export { assertAgencyAdmin, parseJson };
