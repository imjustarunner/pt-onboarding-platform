import {sanitizeSectionTraining} from './providerUpdateTraining.service.js';
import {buildProviderUpdateInvitation} from '../../../frontend/src/navigation/providerUpdateInvitation.js';
import {isCompensationAmendmentExempt,isCompensationUpdatePlan} from './compensationAmendmentExemption.service.js';
import {missingFocusGroups} from '../../../frontend/src/navigation/providerFocus.js';
import {buildQuickViewHomeUrl} from '../utils/publicPortalUrl.js';
import {recordUpdateTime,submitCompletedUpdateTime,createUpdateTimeClaim,updateTimeSummary} from './providerUpdateTime.service.js';
import {spanishIntakeProcedure} from '../content/october2026UpdateRevisions.js';
import {getProviderUpdateRecords} from './providerUpdateRecords.service.js';
import { getStaffCommunicationChoices } from './staffCommunicationChoices.service.js';
import {getCredentialStatus} from './quickViewAuth.service.js';
/**
 * Provider Update — modular, toggleable staff update pushes (separate from Fall Update).
 */
import crypto from 'crypto';
import {isProviderUpdatePreviewToken} from './providerUpdatePreviewLink.service.js';
import pool from '../config/database.js';
import {
  defaultSectionConfig,
  normalizeSectionConfig,
  enabledSectionKeys,
  getSectionMeta,
  PROVIDER_UPDATE_REPLY_TO,
  PROVIDER_UPDATE_SECTIONS
} from '../constants/providerUpdateSections.js';
import { listSchoolAssignedProviders } from './providerYearUpdate.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveSenderIdentityForSend } from './emailSenderIdentityResolver.service.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';

const TOKEN_TTL_DAYS = 90;



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
  if (['super_admin', 'superadmin'].includes(role)) return aid;
  if (!['admin', 'support'].includes(role)) throw Object.assign(new Error('Administrator access required'), { status: 403 });
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

  const [agencyStaff] = await pool.execute(`SELECT u.id AS provider_user_id, u.first_name, u.last_name, u.email, u.work_email, u.role,
      COALESCE(u.is_demo, 0) AS is_demo FROM users u JOIN user_agencies ua ON ua.user_id = u.id
      WHERE ua.agency_id = ? AND COALESCE(u.is_archived, 0) = 0 AND COALESCE(u.is_active,1)=1 AND COALESCE(ua.is_active,1)=1
      AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','staff','admin','super_admin')`, [Number(agencyId)]);
  for (const person of agencyStaff) byId.set(Number(person.provider_user_id), { ...person, source: 'agency_staff' });

  // Enrich roles / demo flags for school-assigned
  if (byId.size) {
    const ids = [...byId.keys()];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT u.id, u.work_email, u.role, COALESCE(u.is_demo, 0) AS is_demo
       FROM users u WHERE u.id IN (${placeholders})
         AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
         AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1)`,
      [...ids,Number(agencyId)]
    );
    const activeIds=new Set((rows||[]).map(row=>Number(row.id)));
    for(const id of byId.keys())if(!activeIds.has(id))byId.delete(id);
    for (const r of rows || []) {
      const cur = byId.get(Number(r.id));
      if (cur) {
        cur.role = r.role;cur.work_email=r.work_email;
        cur.is_demo = Number(r.is_demo) ? 1 : 0;
      }
    }
  }

  if (includeDemoTesters) {
    try {
      const [testers] = await pool.execute(
        `SELECT u.id AS provider_user_id, u.first_name, u.last_name, u.email, u.work_email, u.role,
                COALESCE(u.is_demo, 0) AS is_demo, dta.account_group
         FROM demo_test_accounts dta
         JOIN users u ON u.id = dta.user_id
         WHERE dta.is_active = 1
           AND COALESCE(u.is_active,1)=1
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
  return PROVIDER_UPDATE_SECTIONS.filter(s=>!['training_ack','pay_portal','preferred_days'].includes(s.key));
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
  if (sectionConfig?._training) cfg._training = sanitizeSectionTraining(sectionConfig._training, aid, PROVIDER_UPDATE_SECTIONS.map(s=>s.key));
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
  if (sectionConfig?._training) nextCfg._training = sanitizeSectionTraining(sectionConfig._training, agencyId, PROVIDER_UPDATE_SECTIONS.map(s=>s.key));
  const nextNotes = notes !== undefined ? (notes != null ? String(notes) : null) : push.notes;
  if (status === 'sent' && push.status !== 'sent') throw Object.assign(new Error('Use Send to providers to release a draft.'), { status: 409 });
  const nextStatus = status && ['draft', 'closed'].includes(status) ? status : push.status;
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

export async function sendPush({ pushId, agencyId, sentByUserId, providerUserIds = null, orgSlug = '', prepareOnly = false }) {
  const push = await getPush(pushId);
  if (!push || Number(push.agency_id) !== Number(agencyId)) {
    throw Object.assign(new Error('Push not found'), { status: 404 });
  }
  if (push.status === 'closed') {
    throw Object.assign(new Error('Push is closed'), { status: 400 });
  }

  const [previewRecipients] = await pool.execute("SELECT id FROM provider_update_recipients WHERE push_id=? AND LEFT(token,8)='preview_' LIMIT 1",[pushId]);
  if (previewRecipients.length) throw Object.assign(new Error('Preview links cannot be sent as invitations. Use a separate staff update draft.'),{status:409});

  const providers = await listEligibleProviders(agencyId, { includeDemoTesters: true });
  const allow = providerUserIds?.length
    ? new Set(providerUserIds.map((id) => Number(id)))
    : null;
  const targets = allow
    ? providers.filter((p) => allow.has(Number(p.provider_user_id)))
    : providers.filter(p=>!Number(p.is_demo));
  if (!targets.length) {
    throw Object.assign(new Error('No providers to send'), { status: 400 });
  }

  const agency = await Agency.findById(agencyId);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const audience = normalizeSectionAudience(parseJson(push.section_audience_json, {}));
  const amendmentPlan = parseJson(push.amendment_plan_json, null);
  const enabledKeys = enabledSectionKeys(push.section_config_json);

  const resolved = prepareOnly ? null : await resolveSenderIdentityForSend({
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
    let keysForRecipient = enabledKeys.filter((key) =>
      recipientSeesSection(key, audience, p.provider_user_id, { hasFallActions: null })
    );
    if(isCompensationUpdatePlan(amendmentPlan)&&await isCompensationAmendmentExempt(agencyId,p.provider_user_id))keysForRecipient=keysForRecipient.filter(k=>k!=='amendments');
    await ensureSectionRows(recipient.id, keysForRecipient);

    // Assign amendment document tasks when plan is attached and section is enabled for this user
    if (!prepareOnly && keysForRecipient.includes('amendments') && amendmentPlan) {
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
    if(prepareOnly){results.push({providerUserId:Number(p.provider_user_id),deliveryStatus:'link_prepared',link,token:recipient.token});continue;}
    const to = String(p.work_email || '').trim().toLowerCase();
    const {subject, text, html} = buildProviderUpdateInvitation({firstName: p.first_name, agencyName: agency?.name || 'Your agency', link});

    let deliveryStatus = 'pending';
    let errorMessage = null;
    let externalMessageId = null;
    let communicationId = null;

    if (!to || !to.includes('@')) {
      deliveryStatus = 'failed';
      errorMessage = 'No work email is saved on this provider account';
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
            html,
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
            CASE WHEN delivery_log.delivery_status IN ('sent','delivered','failed','bounced') THEN delivery_log.delivery_status ELSE delivery.delivery_status END AS last_delivery_status,
            COALESCE(delivery_log.sent_at,delivery.sent_at) AS last_sent_at,
            CASE WHEN delivery_log.delivery_status IN ('sent','delivered') THEN NULL ELSE COALESCE(delivery_log.error_message,delivery.error_message) END AS last_delivery_error,
            delivery.created_at AS last_delivery_attempt_at,
            COALESCE(r.role_snapshot, u.role) AS role_snapshot,
            GREATEST(COALESCE(r.is_demo_snapshot, 0), COALESCE(u.is_demo, 0)) AS is_demo_snapshot,
            (SELECT sp.data_json FROM provider_update_section_progress sp
              WHERE sp.recipient_id=r.id AND sp.section_key='notification_prefs' AND sp.completed=1 LIMIT 1) AS communication_review_json,
            (SELECT COUNT(*) FROM provider_update_section_progress sp
              WHERE sp.recipient_id = r.id AND sp.completed = 1) AS sections_completed,
            (SELECT COUNT(*) FROM provider_update_section_progress sp
              WHERE sp.recipient_id = r.id) AS sections_total
     FROM provider_update_recipients r
     JOIN users u ON u.id = r.provider_user_id
     LEFT JOIN provider_update_sends delivery ON delivery.id = (
       SELECT MAX(attempt.id) FROM provider_update_sends attempt
       WHERE attempt.push_id=r.push_id AND attempt.recipient_id=r.id
     )
     LEFT JOIN user_communications delivery_log ON delivery_log.id=delivery.communication_id
       AND delivery_log.agency_id=r.agency_id AND delivery_log.user_id=r.provider_user_id
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
    `SELECT r.*, p.title AS push_title, p.section_config_json, p.section_audience_json, p.status AS push_status,
            u.first_name, u.last_name, u.email
     FROM provider_update_recipients r
     JOIN provider_update_pushes p ON p.id = r.push_id
     JOIN users u ON u.id = r.provider_user_id
     WHERE BINARY r.token = BINARY ?
       AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
       AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=r.provider_user_id AND ua.agency_id=r.agency_id AND COALESCE(ua.is_active,1)=1)
     LIMIT 1`,
    [tok]
  );
  const row = rows?.[0];
  if (!row || (row.push_status === 'draft' && !isProviderUpdatePreviewToken(row.token))) return null;
  if (row.push_status === 'closed') return null;
  if (row.locked_at) {
    throw Object.assign(new Error('This update link is locked'), { status: 410 });
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error('This update link has expired'), { status: 410 });
  }
  return {
    ...row,
    previewOnly:isProviderUpdatePreviewToken(row.token),
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
  if (enabledKeys.includes('supervision_hours') && !(await User.getSupervisors(recipient.provider_user_id, recipient.agency_id)).length) enabledKeys = enabledKeys.filter(key => key !== 'supervision_hours');
  enabledKeys = enabledKeys.filter((key) =>
    recipientSeesSection(key, audience, recipient.provider_user_id)
  );
  if(enabledKeys.includes('amendments')&&isCompensationUpdatePlan(push?.amendment_plan_json)&&await isCompensationAmendmentExempt(recipient.agency_id,recipient.provider_user_id))enabledKeys=enabledKeys.filter(k=>k!=='amendments');
  if (!recipient.previewOnly) await ensureSectionRows(recipient.id, enabledKeys);
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
      trainingGuides: (push?.section_config_json?._training?.[key] || []).map(({id,title})=>({id,title})),
      status: prog.completed ? 'completed' : prog.status || 'not_started',
      completed: !!prog.completed,
      mode: prog.mode || meta?.mode || null,
      data: parseJson(prog.data_json, {})
    };
  });
  const records = await getProviderUpdateRecords(recipient.provider_user_id,recipient.agency_id);
  for(const section of sectionList){
    const defaults={spanish_intake:{bodyHtml:spanishIntakeProcedure},contact_info:{contact:records.contact},profile_blurb:{blurb:records.blurb},credential_display:{publicGender:records.publicGender,credential:records.credential,displayRole:records.displayRole},work_hours:{typicalAvailability:records.typicalAvailability},specialties:{focusGroups:records.focusGroups,clinicalFocus:records.clinicalFocus,specialtyGroups:records.specialtyGroups,specialties:Object.fromEntries(records.specialtyGroups.map(g=>[g.key,g.selected]))},directory_photo:{hasPhoto:!!records.photoPath},school_availability:{schools:records.schools},supervision_hours:{breakdown:records.supervision},license:{license:records.license}}[section.key];
    section.data={...defaults,...section.data};
    if(section.key==='credential_display'){section.data.displayRole=records.displayRole;section.data.publicGender=records.publicGender;section.data.sessionLanguages=records.sessionLanguages;}
    if(section.key==='spanish_intake')section.data.bodyHtml=spanishIntakeProcedure;
    if(section.key==='supervision_hours')section.data.breakdown=records.supervision;
    if(section.key==='specialties'){
      section.data={...section.data,focusGroups:records.focusGroups,clinicalFocus:records.clinicalFocus};
      if(!recipient.locked_at&&missingFocusGroups(records.clinicalFocus,records.focusGroups||[]).length){
        // Reopen prior completion without marking untouched sections as started.
        if(section.completed)section.status='in_progress';
        section.completed=false;
      }
    }
    if(section.key==='school_availability')section.data.schools=records.schools;
  }
  if(audience.license?.mode==='auto' && !records.license?.number && !records.license?.hasUpload && !/\b(?:LPC|LPCC|LCSW|LSW|SWC|LMFT|MFTC|LMHC|LCPC|LP|PsyD)\b/i.test(records.credential||'')){const index=sectionList.findIndex(s=>s.key==='license');if(index>=0)sectionList.splice(index,1);}
  if(!records.schools?.length){const index=sectionList.findIndex(s=>s.key==='school_availability');if(index>=0)sectionList.splice(index,1);}
  const officeReview=sectionList.find(s=>s.key==='office_review');
  if(officeReview?.completed){const current=await listOpenForBookingForProvider(recipient.provider_user_id,recipient.agency_id);const confirmed=(officeReview.data.confirmedAssignmentIds||[]).map(Number);if(current.some(i=>!confirmed.includes(i.id))){officeReview.completed=false;officeReview.status='in_progress';}}
  const communicationSection=sectionList.find(s=>s.key==='notification_prefs');
  const quickViewSection=sectionList.find(s=>s.key==='pin');
  if(quickViewSection){
    const status=await getCredentialStatus(recipient.provider_user_id);
    quickViewSection.data={...quickViewSection.data,quickView:{hasPasscode:status.hasPasscode,isLocked:status.isLocked}};
    if(!recipient.locked_at&&(!status.hasPasscode||status.isLocked||quickViewSection.data.quickViewConfirmed!==true)){quickViewSection.completed=false;quickViewSection.status='not_started';}
  }
  if (communicationSection) {
    const communicationChoices=await getStaffCommunicationChoices({userId:recipient.provider_user_id,agencyId:recipient.agency_id});
    const {getCommunicationPrefs}=await import('./inboxDigest.service.js');
    communicationSection.data={...communicationSection.data,communicationChoices,hasSchoolAssignments:!!records.schools?.length,appEmail:await getCommunicationPrefs(recipient.provider_user_id)};
    if (!recipient.locked_at && communicationChoices.needsReview) {
      // Required answers do not imply the recipient has started this section.
      if (communicationSection.completed) communicationSection.status='in_progress';
      communicationSection.completed=false;
    }
  }
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
        color_palette: row.color_palette || null,
        quickViewUrl:buildQuickViewHomeUrl(row)
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

  // Keep security setup visible; hide only the existing Quick View code controls.
  const amendmentSection=sectionList.find(s=>s.key==='amendments');
  if(amendmentSection&&!recipient.locked_at&&(!amendmentTasks.length||amendmentTasks.some(t=>t.status!=='completed')))amendmentSection.completed=false;
  const completedCount=sectionList.filter(s=>s.completed).length;
  return {
    recipient: {
      id: recipient.id,
      previewOnly:!!recipient.previewOnly,
      pushId: recipient.push_id,
      agencyId: recipient.agency_id,
      pushTitle: recipient.push_title,
      status: recipient.status,
      activeSeconds: Number(recipient.active_seconds || 0),
      providerUserId: recipient.provider_user_id,
      firstName: recipient.first_name,
      lastName: recipient.last_name,
      displayRole: records.displayRole?.label || null,
      quickViewUrl:agency?.quickViewUrl || null,
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

export const recordHeartbeat = recordUpdateTime;

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
  if(isProviderUpdatePreviewToken(recipient.token))throw Object.assign(new Error('This preview is read-only.'),{status:403});
  if (recipient.locked_at) { await submitCompletedUpdateTime(recipient.id,actorUserId); return recipient; }

  const push = await getPush(recipient.push_id);
  const bundle = await getRecipientBundle({ ...recipient, section_config_json: push.section_config_json });
  const enabledKeys = bundle.sections.map(section => section.key);
  const [sections] = await pool.execute(
    `SELECT section_key, completed FROM provider_update_section_progress WHERE recipient_id = ?`,
    [recipientId]
  );
  const done = new Set((sections || []).filter((s) => s.completed).map((s) => s.section_key));
  const missing = enabledKeys.filter((k) => !done.has(k) || (['notification_prefs','pin','amendments','office_review','specialties'].includes(k) && bundle.sections.find(s=>s.key===k)?.completed !== true));
  if (missing.length) {
    throw Object.assign(new Error(`Complete all sections first: ${missing.join(', ')}`), {
      status: 400,
      details: { missing }
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[current]] = await db.execute('SELECT * FROM provider_update_recipients WHERE id=? FOR UPDATE',[recipientId]);
    const summary = await updateTimeSummary(recipientId,db);
    const finalizedAt = current.finalized_at || new Date();
    if (!current.locked_at) await db.execute(`UPDATE provider_update_recipients SET status='finalized',finalized_at=?,
      finalized_by_actor_type=?,finalized_by_user_id=?,locked_at=?,snapshot_json=? WHERE id=?`,
      [finalizedAt,actorType,actorUserId,finalizedAt,JSON.stringify({enabledKeys,sections,activeSeconds:Number(current.active_seconds),sectionSeconds:summary.sections,finalizedAt}),recipientId]);
    await createUpdateTimeClaim(db,{...current,finalized_at:finalizedAt},actorUserId);
    await db.commit();
  } catch(error) { await db.rollback(); throw error; } finally { db.release(); }
  const [after] = await pool.execute('SELECT * FROM provider_update_recipients WHERE id=?',[recipientId]);
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
  for (const r of recipients) {
    if (isProviderUpdatePreviewToken(r.token)) {
      skipped.push({providerUserId:r.provider_user_id,reason:'read_only_preview'});
      continue;
    }
    if (r.payroll_time_claim_id) {
      skipped.push({ providerUserId: r.provider_user_id, reason: 'already_submitted' });
      continue;
    }
    if (!r.finalized_at) { skipped.push({providerUserId:r.provider_user_id,reason:'not_completed'}); continue; }
    const claimId=await submitCompletedUpdateTime(r.id,submittedByUserId);
    if(claimId)created.push({providerUserId:r.provider_user_id,claimId,hours:Number(r.active_seconds)/3600});
    else skipped.push({providerUserId:r.provider_user_id,reason:'no_recorded_time'});
  }

  if(recipients.some(r=>!isProviderUpdatePreviewToken(r.token)&&!r.finalized_at))return {created,skipped,push};
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
    `SELECT r.*, p.title AS push_title, p.section_config_json, p.section_audience_json, p.status AS push_status,
            u.first_name, u.last_name, u.email
     FROM provider_update_recipients r
     JOIN provider_update_pushes p ON p.id = r.push_id
     JOIN users u ON u.id = r.provider_user_id
     WHERE r.provider_user_id = ? AND r.agency_id = ?
       AND r.locked_at IS NULL
       AND p.status = 'sent'
       AND LEFT(r.token,8) <> 'preview_'
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


export async function listOpenForBookingForProvider(providerUserId, agencyId = null) {
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
              osa.booking_agency_id,
              COALESCE(osa.bookable_in_person, EXISTS(SELECT 1 FROM provider_in_person_slot_availability av JOIN office_events ev ON ev.id = av.source_event_id WHERE ev.standing_assignment_id = osa.id AND av.is_active = TRUE AND av.end_at > UTC_TIMESTAMP())) AS bookable_in_person,
              COALESCE(osa.bookable_virtual, EXISTS(SELECT 1 FROM provider_virtual_slot_availability av JOIN office_events ev ON ev.id = av.source_event_id WHERE ev.standing_assignment_id = osa.id AND av.is_active = TRUE AND av.end_at > UTC_TIMESTAMP())) AS bookable_virtual,
              ol.timezone,
              ol.name AS office_name,
              r.name AS room_name,
              r.label AS room_label
       FROM office_standing_assignments osa
       JOIN office_locations ol ON ol.id = osa.office_location_id
       JOIN office_rooms r ON r.id = osa.room_id
       WHERE osa.provider_id = ?
         AND osa.is_active = TRUE
         AND (? IS NULL OR osa.booking_agency_id = ?)
       ORDER BY osa.weekday ASC, osa.hour ASC
`,
      [uid, agencyId, agencyId]
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
        when: `${weekdayNames[wd] || `Day ${wd}`} · ${Number(hour)%12||12}:00 ${Number(hour)<12?'AM':'PM'} · ${String(row.assigned_frequency || 'WEEKLY').toUpperCase()==='BIWEEKLY'?'Every other week':'Weekly'}`,
        availabilityMode: mode,
        weekday: wd, hour, timeZone: row.timezone || 'America/Denver',
        agencyId: Number(row.booking_agency_id) || null,
        inPerson: !!row.bookable_in_person, virtual: !!row.bookable_virtual,
        needsOpen: !row.bookable_in_person && !row.bookable_virtual,
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
      `SELECT DISTINCT c.*, c.organization_id AS school_organization_id,
              EXISTS(SELECT 1 FROM client_provider_assignments cp WHERE cp.client_id=c.id AND cp.is_active=1 AND cp.service_day IS NOT NULL AND cp.service_day<>'') AS has_weekday,
              1 AS has_provider,
              cs.status_key AS client_status_key,
              sch.id AS school_organization_id,
              sch.name AS school_name
       FROM clients c
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       LEFT JOIN agencies sch ON sch.id = c.organization_id
       WHERE c.compliance_archived_at IS NULL
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
             WHERE oa.organization_id = c.organization_id AND oa.agency_id = ?
           )
         )
       ORDER BY c.full_name, c.initials, c.id
       LIMIT 200`,
      [providerUserId, providerUserId, agencyId, agencyId]
    );
    const {computeCurrentSchoolYearLabel}=await import('../utils/schoolYear.js');
    const year=computeCurrentSchoolYearLabel();
    const { deriveLifecycleAction, providerActionItems } = await import('../utils/clientLifecycleAction.js');
    const out = [];
    for (const c of rows || []) {
      const [[disposition]]=await pool.execute('SELECT * FROM client_year_dispositions WHERE client_id=? AND agency_id=? AND school_year=? LIMIT 1',[c.id,agencyId,year]);
      const action = deriveLifecycleAction({
        client: {
          ...c,
          client_status_key: c.client_status_key
        },
        viewerRole: 'provider',
        disposition: disposition||null
      });
      if (action && !action.quiet) {
        out.push({
          id: c.id,
          firstName: c.full_name || c.initials,
          lastName: '',
          preferredName: null,
          schoolName: c.school_name,
          schoolOrganizationId: c.school_organization_id,
          lifecycleAction: action,
          actionItems: providerActionItems(c, action),
          checklist: {parentsContactedAt:c.parents_contacted_at || '',parentsContactedSuccessful:c.parents_contacted_successful == null ? '' : !!c.parents_contacted_successful,firstServiceAt:c.first_service_at || ''}
        });
      }
    }
    return out;
  } catch (e) {
    console.warn('[providerUpdate] fall actions lookup failed', e?.message || e);
    throw Object.assign(new Error('Assigned client updates could not be loaded. Please retry.'),{status:503});
  }
}

export { assertAgencyAdmin, parseJson };
