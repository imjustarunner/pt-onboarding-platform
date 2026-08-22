/**
 * Client Renewal — admin push + public hub for verify-contact / ROI / disclosure / packet.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientGuardianIntakeProfile from '../models/ClientGuardianIntakeProfile.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import User from '../models/User.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import { isRoiExpired } from '../models/ClientSchoolStaffRoiAccess.model.js';
import { clearNeedsFullPacketRenewal } from './clientRenewalFlags.service.js';
import {
  getClientDisclosureStatus,
  isSmartDisclosureForm,
  hasProgrammedDisclosureStep
} from './smartDisclosure.service.js';
import { buildPublicFormBranding } from './publicFormBranding.service.js';
import { resolvePreferredSenderIdentityForSchoolThenAgency } from './emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import {
  SUPPORT_TICKET_SOURCE_KEYS,
  normalizeSupportTicketSourceKey
} from '../constants/supportTicketSources.js';

const REPLY_TO = 'support@itsco.health';
const FROM_DISPLAY = 'ITSCO SCHOOLS TEAM';
const ACTIVE_STATUSES = new Set(['draft', 'sent', 'in_progress']);

function toBool(v) {
  return v === true || v === 1 || v === '1';
}

function publicAppOrigin() {
  return String(
    process.env.PUBLIC_APP_URL
      || process.env.FRONTEND_URL
      || process.env.PUBLIC_INTAKE_BASE_URL
      || 'https://plottwisthq.com'
  ).replace(/\/+$/, '');
}

export function buildPublicIntakeUrl(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) return null;
  const base = publicAppOrigin();
  return `${base}/intake/${encodeURIComponent(key)}`;
}

function buildHubUrl(token) {
  return `${publicAppOrigin()}/client-renewal/${encodeURIComponent(String(token || '').trim())}`;
}

function normalizePacketMode(value) {
  const m = String(value || '').trim().toLowerCase();
  if (m === 'office') return 'office';
  if (m === 'school') return 'school';
  return null;
}

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e && e.includes('@') ? e : '';
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickGuardian(guardians = []) {
  const list = Array.isArray(guardians) ? guardians : [];
  const enabled = list.find(
    (g) =>
      (g.access_enabled === 1 || g.access_enabled === true || g.access_enabled == null)
      && normalizeEmail(g.email)
  );
  if (enabled) return enabled;
  return list.find((g) => normalizeEmail(g.email)) || list[0] || null;
}

async function loadRenewalById(id) {
  const rid = Number(id || 0);
  if (!rid) return null;
  const [rows] = await pool.execute(`SELECT * FROM client_renewals WHERE id = ? LIMIT 1`, [rid]);
  return rows?.[0] || null;
}

export async function getRenewalByToken(token) {
  const t = String(token || '').trim();
  if (!t || t.length < 16) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM client_renewals WHERE public_token = ? LIMIT 1`,
    [t]
  );
  return rows?.[0] || null;
}

/** Lookup active renewal bound to a disclosure intake public_key. */
export async function findRenewalByDisclosurePublicKey(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM client_renewals
     WHERE disclosure_public_key = ?
       AND status IN ('draft', 'sent', 'in_progress')
     ORDER BY id DESC
     LIMIT 1`,
    [key]
  );
  return rows?.[0] || null;
}

/** Lookup active renewal bound to an attach-only packet intake public_key. */
export async function findRenewalByPacketPublicKey(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM client_renewals
     WHERE packet_public_key = ?
       AND status IN ('draft', 'sent', 'in_progress')
     ORDER BY id DESC
     LIMIT 1`,
    [key]
  );
  return rows?.[0] || null;
}

export async function getRenewalAdmin(clientId, agencyId) {
  const cid = Number(clientId || 0);
  const aid = Number(agencyId || 0);
  if (!cid) return [];
  const params = [cid];
  let sql = `SELECT * FROM client_renewals WHERE client_id = ?`;
  if (aid) {
    sql += ` AND agency_id = ?`;
    params.push(aid);
  }
  sql += ` ORDER BY id DESC LIMIT 50`;
  const [rows] = await pool.execute(sql, params);
  return rows || [];
}

export async function createRenewal({ agencyId, clientId, options = {}, actorUserId = null }) {
  const cid = Number(clientId || 0);
  const aid = Number(agencyId || 0);
  if (!cid || !aid) {
    const err = new Error('agencyId and clientId are required');
    err.status = 400;
    throw err;
  }

  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  if (Number(client.agency_id) !== aid) {
    const err = new Error('Client does not belong to this agency');
    err.status = 403;
    throw err;
  }

  const orgId = Number(client.organization_id || 0) || null;
  let schoolName = client.organization_name || null;
  if (!schoolName && orgId) {
    const org = await Agency.findById(orgId);
    schoolName = org?.official_name || org?.name || null;
  }

  const optionVerifyContact = toBool(options.verifyContact ?? options.option_verify_contact);
  const optionSmartRoi = toBool(options.smartRoi ?? options.option_smart_roi);
  const optionSmartDisclosure = toBool(options.smartDisclosure ?? options.option_smart_disclosure);
  const optionFullPacket = toBool(options.fullPacket ?? options.option_full_packet);
  let packetMode = normalizePacketMode(options.packetMode ?? options.packet_mode);
  if (optionFullPacket && !packetMode) packetMode = 'school';
  if (!optionFullPacket) packetMode = null;

  if (!optionVerifyContact && !optionSmartRoi && !optionSmartDisclosure && !optionFullPacket) {
    const err = new Error('Select at least one renewal option');
    err.status = 400;
    throw err;
  }

  let recommendSmartRoi = 0;
  if (optionSmartRoi && isRoiExpired(client.roi_expires_at)) {
    recommendSmartRoi = 1;
  }

  let recommendSmartDisclosure = 0;
  if (optionSmartDisclosure) {
    try {
      const disc = await getClientDisclosureStatus(cid);
      const status = String(disc?.status || '').toLowerCase();
      if (!status || status === 'missing' || status === 're_sign_needed') {
        recommendSmartDisclosure = 1;
      }
    } catch {
      recommendSmartDisclosure = 1;
    }
  }

  const publicToken = crypto.randomBytes(24).toString('hex');

  const [result] = await pool.execute(
    `INSERT INTO client_renewals
      (agency_id, client_id, organization_id, school_name, public_token, status,
       option_verify_contact, option_smart_roi, option_smart_disclosure, option_full_packet,
       packet_mode, recommend_smart_roi, recommend_smart_disclosure, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(client.agency_id) || aid,
      cid,
      orgId,
      schoolName,
      publicToken,
      optionVerifyContact ? 1 : 0,
      optionSmartRoi ? 1 : 0,
      optionSmartDisclosure ? 1 : 0,
      optionFullPacket ? 1 : 0,
      packetMode,
      recommendSmartRoi,
      recommendSmartDisclosure,
      actorUserId ? Number(actorUserId) : null
    ]
  );

  return loadRenewalById(result.insertId);
}

async function ensureDisclosureIntakeLink({ schoolOrganizationId, agencyId, actorUserId }) {
  const sid = Number(schoolOrganizationId || 0) || null;
  const aid = Number(agencyId || 0) || null;

  // Prefer an existing standalone smart_disclosure form (never a full intake packet).
  for (const [scopeType, orgId] of [
    ['school', sid],
    ['agency', aid]
  ]) {
    if (!orgId) continue;
    const links = await IntakeLink.findByScope({ scopeType, organizationId: orgId });
    const found = (links || []).find((l) => isSmartDisclosureForm(l) && l.is_active);
    if (found?.public_key) return found;
  }

  const orgId = sid || aid;
  if (!orgId) return null;

  // Always create as form_type=smart_disclosure so school master inheritance does not apply.
  return IntakeLink.create({
    publicKey: crypto.randomBytes(24).toString('hex'),
    title: 'Smart Disclosure Statement',
    description: 'Standalone disclosure acknowledgment for client renewal.',
    languageCode: 'en',
    scopeType: sid ? 'school' : 'agency',
    formType: 'smart_disclosure',
    organizationId: orgId,
    isActive: true,
    createClient: false,
    createGuardian: false,
    requiresAssignment: false,
    allowedDocumentTemplateIds: [],
    intakeFields: null,
    intakeSteps: [{ type: 'smart_disclosure', title: 'Disclosure Statement' }],
    createdByUserId: actorUserId || null
  });
}

async function ensurePacketIntakeLink({
  packetMode,
  schoolOrganizationId,
  agencyId,
  actorUserId
}) {
  const mode = normalizePacketMode(packetMode) || 'school';
  const sid = Number(schoolOrganizationId || 0) || null;
  const aid = Number(agencyId || 0) || null;

  if (mode === 'office') {
    try {
      const AgencyOfficeIntakeMaster = (await import('../models/AgencyOfficeIntakeMaster.model.js')).default;
      const master = await AgencyOfficeIntakeMaster.getOrCreateForAgency(aid, {
        languageCode: 'en',
        actorUserId
      });
      const publishedId = Number(master?.published_intake_link_id || 0);
      if (publishedId) {
        const published = await IntakeLink.findById(publishedId);
        if (published) {
          // Dedicated renewal clone: create_client=true so finalize runs attach;
          // locked client comes from client_renewals.packet_public_key lookup.
          return IntakeLink.create({
            publicKey: crypto.randomBytes(24).toString('hex'),
            title: `${published.title || 'Office Enrollment'} (Renewal)`,
            description: published.description || 'Client renewal office packet (update existing client only).',
            languageCode: published.language_code || 'en',
            scopeType: 'agency',
            formType: published.form_type || 'intake',
            organizationId: aid,
            isActive: true,
            createClient: true,
            createGuardian: true,
            requiresAssignment: false,
            allowedDocumentTemplateIds: published.allowed_document_template_ids,
            intakeFields: published.intake_fields,
            intakeSteps: published.intake_steps,
            createdByUserId: actorUserId || null,
            inheritsOfficeMaster: true
          });
        }
      }
    } catch (e) {
      console.warn('[clientRenewal] office packet link resolve failed', e?.message || e);
    }
    return IntakeLink.create({
      publicKey: crypto.randomBytes(24).toString('hex'),
      title: 'Office Enrollment Packet (Renewal)',
      description: 'Client renewal office packet (update existing client only).',
      languageCode: 'en',
      scopeType: 'agency',
      formType: 'intake',
      organizationId: aid,
      isActive: true,
      createClient: true,
      createGuardian: true,
      requiresAssignment: false,
      createdByUserId: actorUserId || null,
      inheritsOfficeMaster: true
    });
  }

  if (!sid) {
    const err = new Error('School organization is required for a school packet renewal');
    err.status = 400;
    throw err;
  }

  const schoolLinks = await IntakeLink.findByScope({ scopeType: 'school', organizationId: sid });
  const source = (schoolLinks || []).find(
    (l) =>
      String(l.form_type || '').toLowerCase() === 'intake'
      && l.is_active
      && !Number(l.is_school_master || 0)
  );
  if (source) {
    return IntakeLink.create({
      publicKey: crypto.randomBytes(24).toString('hex'),
      title: `${source.title || 'School Enrollment'} (Renewal)`,
      description: source.description || 'Client renewal school packet (update existing client only).',
      languageCode: source.language_code || 'en',
      scopeType: 'school',
      formType: 'intake',
      organizationId: sid,
      isActive: true,
      createClient: true,
      createGuardian: true,
      requiresAssignment: false,
      allowedDocumentTemplateIds: source.allowed_document_template_ids,
      intakeFields: source.intake_fields,
      intakeSteps: source.intake_steps,
      createdByUserId: actorUserId || null,
      inheritsSchoolMaster: true
    });
  }

  return IntakeLink.create({
    publicKey: crypto.randomBytes(24).toString('hex'),
    title: 'School Enrollment Packet (Renewal)',
    description: 'Client renewal school packet (update existing client only).',
    languageCode: 'en',
    scopeType: 'school',
    formType: 'intake',
    organizationId: sid,
    isActive: true,
    createClient: true,
    createGuardian: true,
    requiresAssignment: false,
    createdByUserId: actorUserId || null,
    inheritsSchoolMaster: true
  });
}

function listSelectedItems(renewal) {
  const items = [];
  if (toBool(renewal.option_verify_contact)) items.push('Verify contact info');
  if (toBool(renewal.option_smart_roi)) items.push('Sign updated Smart School ROI');
  if (toBool(renewal.option_smart_disclosure)) items.push('Sign updated Smart Disclosure');
  if (toBool(renewal.option_full_packet)) {
    const mode = normalizePacketMode(renewal.packet_mode) || 'school';
    items.push(
      mode === 'office'
        ? 'Complete office enrollment packet renewal'
        : 'Complete school enrollment packet renewal'
    );
  }
  return items;
}

function agencyDisplayName(agency) {
  const name = String(agency?.official_name || agency?.name || '').trim();
  return name || 'ITSCO';
}

function schoolDisplayName(schoolName, organization) {
  const fromRenewal = String(schoolName || '').trim();
  if (fromRenewal) return fromRenewal;
  return String(organization?.official_name || organization?.name || 'your school').trim() || 'your school';
}

function buildRenewalEmailContent({ renewal, schoolName, agencyName, hubUrl }) {
  const optOutUrl = `${hubUrl}?optOut=1`;
  const school = String(schoolName || 'your school').trim() || 'your school';
  const agency = String(agencyName || 'ITSCO').trim() || 'ITSCO';
  const subject = `${school} Action Needed : ${agency}`;
  const items = listSelectedItems(renewal);
  const itemLines = items.length
    ? ['Items requested:', ...items.map((item, i) => `${i + 1}. ${item}`), '']
    : [];
  const text = [
    'Hello,',
    '',
    `${agency} has a few items that need your attention for a student we support at ${school}.`,
    'Please use the secure link below to review and complete what is requested.',
    '',
    ...itemLines,
    hubUrl,
    '',
    'If you are no longer interested in receiving these notices, you can opt out here:',
    optOutUrl,
    '',
    'Thank you,',
    FROM_DISPLAY,
    '',
    `Questions? Reply to this email or contact ${REPLY_TO}.`
  ].join('\n');

  const itemHtml = items.length
    ? `<p style="margin:12px 0 6px;"><strong>Items requested:</strong></p>
       <ol style="margin:0 0 12px;padding-left:20px;">
         ${items.map((item) => `<li>${escHtml(item)}</li>`).join('')}
       </ol>`
    : '';

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 640px;">
      <p>Hello,</p>
      <p>${escHtml(agency)} has a few items that need your attention for a student we support at ${escHtml(school)}.
         Please use the secure link below to review and complete what is requested.</p>
      ${itemHtml}
      <p><a href="${escHtml(hubUrl)}" style="display:inline-block;padding:10px 16px;background:#1f6b4a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open secure link</a></p>
      <p style="font-size:13px;color:#555;">Or visit <a href="${escHtml(hubUrl)}">${escHtml(hubUrl)}</a></p>
      <p style="font-size:13px;color:#666;">If you are no longer interested in receiving these notices,
        <a href="${escHtml(optOutUrl)}">opt out here</a>.</p>
      <p>Thank you,<br/><strong>${escHtml(FROM_DISPLAY)}</strong></p>
      <p style="font-size:12px;color:#666;">Questions? Reply to this email or contact
        <a href="mailto:${escHtml(REPLY_TO)}">${escHtml(REPLY_TO)}</a>.</p>
    </div>
  `.trim();

  return { subject, text, html, items, fromDisplay: FROM_DISPLAY, replyTo: REPLY_TO, agencyName: agency, schoolName: school };
}

async function prepareRenewalLinks(renewalId, { actorUserId = null } = {}) {
  const renewal = await loadRenewalById(renewalId);
  if (!renewal) {
    const err = new Error('Renewal not found');
    err.status = 404;
    throw err;
  }

  const client = await Client.findById(renewal.client_id, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }

  const schoolOrganizationId = Number(renewal.organization_id || client.organization_id || 0) || null;
  const agencyId = Number(renewal.agency_id || client.agency_id || 0);
  let roiKey = renewal.roi_signing_public_key || null;
  let disclosureKey = renewal.disclosure_public_key || null;
  let packetKey = renewal.packet_public_key || null;

  if (toBool(renewal.option_smart_roi) && schoolOrganizationId) {
    try {
      const { ensureIssuedRoiSigningLinkForClient } = await import(
        '../controllers/clientSchoolRoiAccess.controller.js'
      );
      const issued = await ensureIssuedRoiSigningLinkForClient({
        client,
        schoolOrganizationId,
        actorUserId,
        regenerate: false
      });
      if (issued?.ok && issued.issuedLink?.public_key) {
        roiKey = String(issued.issuedLink.public_key);
      }
    } catch (e) {
      console.warn('[clientRenewal] ROI link issue failed', e?.message || e);
    }
  }

  if (toBool(renewal.option_smart_disclosure)) {
    try {
      const discLink = await ensureDisclosureIntakeLink({
        schoolOrganizationId,
        agencyId,
        actorUserId
      });
      if (discLink?.public_key) disclosureKey = String(discLink.public_key);
    } catch (e) {
      console.warn('[clientRenewal] disclosure link issue failed', e?.message || e);
    }
  }

  if (toBool(renewal.option_full_packet)) {
    try {
      const packetLink = await ensurePacketIntakeLink({
        packetMode: renewal.packet_mode,
        schoolOrganizationId,
        agencyId,
        actorUserId
      });
      if (packetLink?.public_key) packetKey = String(packetLink.public_key);
    } catch (e) {
      console.warn('[clientRenewal] packet link issue failed', e?.message || e);
      if (e?.status) throw e;
    }
  }

  await pool.execute(
    `UPDATE client_renewals
     SET roi_signing_public_key = ?,
         disclosure_public_key = ?,
         packet_public_key = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [roiKey, disclosureKey, packetKey, renewal.id]
  );

  return loadRenewalById(renewal.id);
}

/**
 * Create a draft renewal from the selected options, prepare signing links,
 * and return email + hub preview without sending.
 */
export async function previewRenewal({ agencyId, clientId, options = {}, actorUserId = null }) {
  const renewal = await createRenewal({ agencyId, clientId, options, actorUserId });
  const prepared = await prepareRenewalLinks(renewal.id, { actorUserId });
  const client = await Client.findById(clientId, { includeSensitive: true });
  const guardians = await ClientGuardian.listForClient(clientId);
  const guardian = pickGuardian(guardians);
  const toEmail = normalizeEmail(guardian?.email);
  const agency = await Agency.findById(prepared.agency_id || agencyId);
  const schoolName = schoolDisplayName(prepared.school_name || client?.organization_name, null);
  const agencyName = agencyDisplayName(agency);
  const hubUrl = buildHubUrl(prepared.public_token);
  const email = buildRenewalEmailContent({ renewal: prepared, schoolName, agencyName, hubUrl });
  const publicPayload = await buildPublicPayload(prepared);

  return {
    renewal: prepared,
    hubUrl,
    email: {
      to: toEmail || null,
      subject: email.subject,
      text: email.text,
      html: email.html,
      fromDisplay: email.fromDisplay,
      replyTo: email.replyTo,
      items: email.items
    },
    interfacePreview: {
      schoolName: publicPayload?.schoolName || schoolName,
      clientInitials: publicPayload?.clientInitials || null,
      options: publicPayload?.options || null,
      recommended: publicPayload?.recommended || null,
      stepLinks: publicPayload?.stepLinks || null
    }
  };
}

export async function sendRenewal(renewalId, { actorUserId = null } = {}) {
  const renewal = await loadRenewalById(renewalId);
  if (!renewal) {
    const err = new Error('Renewal not found');
    err.status = 404;
    throw err;
  }
  if (String(renewal.status) === 'cancelled' || String(renewal.status) === 'opted_out') {
    const err = new Error('This renewal can no longer be sent');
    err.status = 400;
    throw err;
  }

  const client = await Client.findById(renewal.client_id, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }

  const guardians = await ClientGuardian.listForClient(renewal.client_id);
  const guardian = pickGuardian(guardians);
  const toEmail = normalizeEmail(guardian?.email);
  if (!toEmail) {
    const err = new Error('A guardian with a valid email is required before sending');
    err.status = 400;
    throw err;
  }

  const prepared = await prepareRenewalLinks(renewal.id, { actorUserId });
  const schoolOrganizationId = Number(prepared.organization_id || client.organization_id || 0) || null;
  const agencyId = Number(prepared.agency_id || client.agency_id || 0);
  const agency = await Agency.findById(agencyId);
  const schoolName = schoolDisplayName(prepared.school_name || client.organization_name, null);
  const agencyName = agencyDisplayName(agency);
  const hubUrl = buildHubUrl(prepared.public_token);
  const { subject, text, html } = buildRenewalEmailContent({
    renewal: prepared,
    schoolName,
    agencyName,
    hubUrl
  });

  const senderIdentity = await resolvePreferredSenderIdentityForSchoolThenAgency({
    agencyId,
    schoolOrganizationId,
    templateType: 'client_renewal',
    preferredKeys: ['schools', 'school_intake', 'intake', 'notifications']
  });
  if (!senderIdentity?.id) {
    const err = new Error('Email is not configured for this agency. Add an active schools sender identity first.');
    err.status = 503;
    throw err;
  }

  const sendResult = await sendEmailFromIdentity({
    senderIdentityId: senderIdentity.id,
    to: toEmail,
    subject,
    text,
    html,
    source: 'auto',
    clientId: prepared.client_id,
    userId: Number(guardian?.guardian_user_id || 0) || null,
    generatedByUserId: actorUserId || null,
    templateType: 'client_renewal',
    fromDisplayNameOverride: FROM_DISPLAY,
    replyToOverride: REPLY_TO,
    linkUrl: hubUrl
  });

  if (sendResult?.skipped) {
    const err = new Error(`Email send blocked: ${sendResult.reason || 'notifications disabled'}`);
    err.status = 409;
    throw err;
  }
  if (sendResult?.blocked) {
    const flagText = (sendResult.qualityFlags || []).map((f) => f.message).filter(Boolean).join(' ');
    const err = new Error(flagText || 'Email blocked — quality checks failed.');
    err.status = 409;
    err.qualityFlags = sendResult.qualityFlags || [];
    throw err;
  }

  await pool.execute(
    `UPDATE client_renewals
     SET status = 'sent',
         sent_at = COALESCE(sent_at, NOW()),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [prepared.id]
  );

  const guardianUserId = Number(guardian?.guardian_user_id || 0);
  if (guardianUserId) {
    try {
      await createNotificationAndDispatch({
        type: 'client_checklist_updated',
        severity: 'info',
        title: `${schoolName} action needed`,
        message: 'You have items to review for a student. Open your secure renewal link to continue.',
        userId: guardianUserId,
        agencyId,
        relatedEntityType: 'client',
        relatedEntityId: prepared.client_id,
        actorUserId: actorUserId || null,
        actorSource: 'Client Renewal'
      });
    } catch (e) {
      console.warn('[clientRenewal] guardian notification failed', e?.message || e);
    }
  }

  try {
    await ClientGuardianIntakeProfile.mergeEmailForClient({
      clientId: prepared.client_id,
      email: toEmail,
      source: 'client_renewal_sent'
    });
  } catch {
    // best-effort
  }

  const updated = await loadRenewalById(prepared.id);
  return {
    renewal: updated,
    hubUrl,
    email: {
      to: toEmail,
      subject,
      text,
      html,
      items: listSelectedItems(updated),
      queued: !!sendResult?.pendingApproval,
      pendingApproval: !!sendResult?.pendingApproval,
      communicationId: sendResult?.communicationId || null
    }
  };
}

export async function submitVerifyContact(token, contactPayload = {}) {
  const renewal = await getRenewalByToken(token);
  if (!renewal) {
    const err = new Error('Renewal not found');
    err.status = 404;
    throw err;
  }
  if (!ACTIVE_STATUSES.has(String(renewal.status)) && String(renewal.status) !== 'completed') {
    const err = new Error('This renewal is no longer active');
    err.status = 400;
    throw err;
  }
  if (!toBool(renewal.option_verify_contact)) {
    const err = new Error('Verify contact is not enabled for this renewal');
    err.status = 400;
    throw err;
  }

  const email = normalizeEmail(contactPayload.email);
  const phone = String(contactPayload.phone || contactPayload.phoneNumber || '').trim() || null;
  const firstName = String(contactPayload.firstName || '').trim() || null;
  const lastName = String(contactPayload.lastName || '').trim() || null;
  const fullName = String(contactPayload.fullName || `${firstName || ''} ${lastName || ''}`).trim() || null;
  const relationship = String(contactPayload.relationship || '').trim() || null;
  const dateOfBirth = String(contactPayload.dateOfBirth || contactPayload.dob || '').trim() || null;
  const primaryLanguage = String(contactPayload.primaryLanguage || contactPayload.language || '').trim() || null;
  const addressStreet = String(contactPayload.addressStreet || contactPayload.street || '').trim() || null;
  const addressApt = String(contactPayload.addressApt || contactPayload.apt || '').trim() || null;
  const addressCity = String(contactPayload.addressCity || contactPayload.city || '').trim() || null;
  const addressState = String(contactPayload.addressState || contactPayload.state || '').trim().toUpperCase() || null;
  const addressZip = String(contactPayload.addressZip || contactPayload.zip || '').trim() || null;

  if (!email) {
    const err = new Error('Email is required');
    err.status = 400;
    throw err;
  }
  if (!firstName || !lastName) {
    const err = new Error('First and last name are required');
    err.status = 400;
    throw err;
  }
  if (!relationship) {
    const err = new Error('Relationship to the student is required');
    err.status = 400;
    throw err;
  }

  const existingProfile = await ClientGuardianIntakeProfile.findByClientId(renewal.client_id);
  await ClientGuardianIntakeProfile.upsertForClient({
    clientId: renewal.client_id,
    profile: {
      ...(existingProfile || {}),
      email: email || existingProfile?.email || null,
      phone: phone || existingProfile?.phone || null,
      firstName: firstName || existingProfile?.firstName || null,
      lastName: lastName || existingProfile?.lastName || null,
      fullName: fullName || existingProfile?.fullName || null,
      relationship: relationship || existingProfile?.relationship || null,
      dateOfBirth: dateOfBirth || existingProfile?.dateOfBirth || null,
      primaryLanguage: primaryLanguage || existingProfile?.primaryLanguage || null
    },
    source: 'client_renewal_verify_contact'
  });

  const guardians = await ClientGuardian.listForClient(renewal.client_id);
  const guardian = pickGuardian(guardians);
  const guardianUserId = Number(guardian?.guardian_user_id || 0);
  if (guardianUserId) {
    const patch = {};
    if (email) {
      patch.email = email;
      patch.personalEmail = email;
    }
    if (phone) patch.phoneNumber = phone;
    if (firstName) patch.firstName = firstName;
    if (lastName) patch.lastName = lastName;
    if (Object.keys(patch).length) {
      try {
        await User.update(guardianUserId, patch);
      } catch (e) {
        console.warn('[clientRenewal] guardian user update failed', e?.message || e);
      }
    }
  }

  if (addressStreet || addressCity || addressState || addressZip || addressApt) {
    try {
      await Client.update(renewal.client_id, {
        address_street: addressStreet,
        address_apt: addressApt,
        address_city: addressCity,
        address_state: addressState,
        address_zip: addressZip
      });
    } catch (e) {
      console.warn('[clientRenewal] client address update failed', e?.message || e);
    }
  }

  await pool.execute(
    `UPDATE client_renewals
     SET verify_contact_done = 1,
         status = CASE WHEN status = 'sent' THEN 'in_progress' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [renewal.id]
  );

  return getRenewalByToken(token);
}

export async function optOut(token) {
  const renewal = await getRenewalByToken(token);
  if (!renewal) {
    const err = new Error('Renewal not found');
    err.status = 404;
    throw err;
  }

  const guardians = await ClientGuardian.listForClient(renewal.client_id);
  for (const g of guardians || []) {
    const uid = Number(g.guardian_user_id || 0);
    if (!uid) continue;
    try {
      await UserPreferences.update(uid, { email_enabled: false });
    } catch (e) {
      console.warn('[clientRenewal] opt-out preferences failed', e?.message || e);
    }
  }

  await pool.execute(
    `UPDATE client_renewals
     SET status = 'opted_out',
         opted_out_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [renewal.id]
  );

  return getRenewalByToken(token);
}

const STEP_COLUMN = {
  verify_contact: 'verify_contact_done',
  smart_roi: 'smart_roi_done',
  smart_disclosure: 'smart_disclosure_done',
  full_packet: 'full_packet_done'
};

function asDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function hasCompletedIntakeForPublicKey({ publicKey, clientId, sinceAt }) {
  const key = String(publicKey || '').trim();
  const cid = Number(clientId || 0);
  if (!key || !cid) return false;
  const since = asDate(sinceAt);
  const params = [key, cid];
  let sql = `
    SELECT s.id
    FROM intake_submissions s
    JOIN intake_links l ON l.id = s.intake_link_id
    WHERE l.public_key = ?
      AND s.client_id = ?
      AND s.submitted_at IS NOT NULL
  `;
  if (since) {
    sql += ` AND s.submitted_at >= ?`;
    params.push(since);
  }
  sql += ` ORDER BY s.id DESC LIMIT 1`;
  const [rows] = await pool.execute(sql, params);
  return !!rows?.[0];
}

/**
 * ROI / Disclosure / Packet completion must come from real signatures,
 * not from merely opening the form link.
 */
export async function syncRenewalProgressFromSignatures(renewal) {
  if (!renewal?.id) return renewal;
  const since = asDate(renewal.sent_at) || asDate(renewal.created_at) || new Date(0);
  let smartRoiDone = toBool(renewal.smart_roi_done);
  let smartDisclosureDone = toBool(renewal.smart_disclosure_done);
  let fullPacketDone = toBool(renewal.full_packet_done);
  let changed = false;

  if (toBool(renewal.option_smart_roi)) {
    const signed = renewal.roi_signing_public_key
      ? await hasCompletedIntakeForPublicKey({
          publicKey: renewal.roi_signing_public_key,
          clientId: renewal.client_id,
          sinceAt: since
        })
      : false;
    if (signed !== smartRoiDone) {
      smartRoiDone = signed;
      changed = true;
    }
  }

  if (toBool(renewal.option_smart_disclosure)) {
    let signed = false;
    if (renewal.disclosure_public_key) {
      signed = await hasCompletedIntakeForPublicKey({
        publicKey: renewal.disclosure_public_key,
        clientId: renewal.client_id,
        sinceAt: since
      });
    }
    if (!signed) {
      try {
        const disc = await getClientDisclosureStatus(renewal.client_id);
        const signedAt = asDate(disc?.lastAcknowledgement?.signedAt);
        signed = !!(signedAt && signedAt >= since);
      } catch {
        // ignore
      }
    }
    if (signed !== smartDisclosureDone) {
      smartDisclosureDone = signed;
      changed = true;
    }
  }

  if (toBool(renewal.option_full_packet) && renewal.packet_public_key) {
    const signed = await hasCompletedIntakeForPublicKey({
      publicKey: renewal.packet_public_key,
      clientId: renewal.client_id,
      sinceAt: since
    });
    if (signed !== fullPacketDone) {
      fullPacketDone = signed;
      changed = true;
    }
  }

  if (changed) {
    await pool.execute(
      `UPDATE client_renewals
       SET smart_roi_done = ?,
           smart_disclosure_done = ?,
           full_packet_done = ?,
           status = CASE
             WHEN status IN ('sent', 'draft') THEN 'in_progress'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [smartRoiDone ? 1 : 0, smartDisclosureDone ? 1 : 0, fullPacketDone ? 1 : 0, renewal.id]
    );
  }

  let updated = changed ? await loadRenewalById(renewal.id) : renewal;
  if (toBool(updated.option_full_packet) && toBool(updated.full_packet_done) && updated.client_id) {
    await clearNeedsFullPacketRenewal(updated.client_id);
  }
  const allDone =
    (!toBool(updated.option_verify_contact) || toBool(updated.verify_contact_done))
    && (!toBool(updated.option_smart_roi) || toBool(updated.smart_roi_done))
    && (!toBool(updated.option_smart_disclosure) || toBool(updated.smart_disclosure_done))
    && (!toBool(updated.option_full_packet) || toBool(updated.full_packet_done));

  if (allDone && String(updated.status) !== 'completed') {
    await pool.execute(
      `UPDATE client_renewals
       SET status = 'completed', completed_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [updated.id]
    );
    updated = await loadRenewalById(updated.id);
  }

  return updated;
}

/** Ensure signing links exist for an already-created renewal (preview/open/load). */
export async function ensureRenewalStepLinks(renewalId, { actorUserId = null } = {}) {
  return prepareRenewalLinks(renewalId, { actorUserId });
}

export async function markStepDone(token, step) {
  const renewal = await getRenewalByToken(token);
  if (!renewal) {
    const err = new Error('Renewal not found');
    err.status = 404;
    throw err;
  }
  if (String(renewal.status) === 'opted_out' || String(renewal.status) === 'cancelled') {
    const err = new Error('This renewal is no longer active');
    err.status = 400;
    throw err;
  }

  const key = String(step || '').trim().toLowerCase().replace(/-/g, '_');
  // Opening ROI / Disclosure / Packet must not mark Done — only real signatures do.
  if (key === 'smart_roi' || key === 'smart_disclosure' || key === 'full_packet') {
    return syncRenewalProgressFromSignatures(renewal);
  }

  const col = STEP_COLUMN[key];
  if (!col) {
    const err = new Error('Unknown step');
    err.status = 400;
    throw err;
  }

  await pool.execute(
    `UPDATE client_renewals
     SET ${col} = 1,
         status = CASE
           WHEN status IN ('sent', 'draft') THEN 'in_progress'
           ELSE status
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [renewal.id]
  );

  return syncRenewalProgressFromSignatures(await loadRenewalById(renewal.id));
}

export async function buildPublicPayload(renewal, { baseUrl = '', actorUserId = null } = {}) {
  if (!renewal) return null;

  let current = renewal;
  const needsLinks =
    (toBool(current.option_smart_roi) && !current.roi_signing_public_key)
    || (toBool(current.option_smart_disclosure) && !current.disclosure_public_key)
    || (toBool(current.option_full_packet) && !current.packet_public_key);
  if (needsLinks) {
    try {
      current = await prepareRenewalLinks(current.id, { actorUserId });
    } catch (e) {
      console.warn('[clientRenewal] ensure links on public payload failed', e?.message || e);
    }
  }

  try {
    current = await syncRenewalProgressFromSignatures(current);
  } catch (e) {
    console.warn('[clientRenewal] progress sync failed', e?.message || e);
  }

  const agency = await Agency.findById(current.agency_id);
  const organization = current.organization_id
    ? await Agency.findById(current.organization_id)
    : null;
  const branding = await buildPublicFormBranding({
    organization: organization || agency,
    agency,
    baseUrl: baseUrl || publicAppOrigin()
  });

  const client = await Client.findById(current.client_id, { includeSensitive: true });
  const initials = client?.initials || null;

  const profile = await ClientGuardianIntakeProfile.findByClientId(current.client_id);
  const guardians = await ClientGuardian.listForClient(current.client_id);
  const guardian = pickGuardian(guardians);

  return {
    token: current.public_token,
    status: current.status,
    schoolName: schoolDisplayName(current.school_name, organization),
    agencyName: agencyDisplayName(agency),
    clientInitials: initials,
    branding,
    supportEmail: REPLY_TO,
    supportPhone: null,
    options: {
      verifyContact: toBool(current.option_verify_contact),
      smartRoi: toBool(current.option_smart_roi),
      smartDisclosure: toBool(current.option_smart_disclosure),
      fullPacket: toBool(current.option_full_packet),
      packetMode: current.packet_mode || null
    },
    recommended: {
      smartRoi: toBool(current.recommend_smart_roi),
      smartDisclosure: toBool(current.recommend_smart_disclosure)
    },
    progress: {
      verifyContactDone: toBool(current.verify_contact_done),
      smartRoiDone: toBool(current.smart_roi_done),
      smartDisclosureDone: toBool(current.smart_disclosure_done),
      fullPacketDone: toBool(current.full_packet_done)
    },
    stepLinks: {
      smartRoi: buildPublicIntakeUrl(current.roi_signing_public_key),
      smartDisclosure: buildPublicIntakeUrl(current.disclosure_public_key),
      fullPacket: buildPublicIntakeUrl(current.packet_public_key)
    },
    contactPrefill: {
      email: profile?.email || guardian?.email || null,
      phone: profile?.phone || null,
      firstName: profile?.firstName || guardian?.first_name || null,
      lastName: profile?.lastName || guardian?.last_name || null,
      relationship: profile?.relationship || guardian?.relationship_title || null,
      dateOfBirth: profile?.dateOfBirth || null,
      primaryLanguage: profile?.primaryLanguage || null,
      addressStreet: client?.address_street || null,
      addressApt: client?.address_apt || null,
      addressCity: client?.address_city || null,
      addressState: client?.address_state || null,
      addressZip: client?.address_zip || null
    },
    supportTicketPath: `/api/public/client-renewal/${encodeURIComponent(current.public_token)}/support-tickets`,
    optOutPath: `/api/public/client-renewal/${encodeURIComponent(current.public_token)}/opt-out`,
    sentAt: current.sent_at || null,
    completedAt: current.completed_at || null,
    optedOutAt: current.opted_out_at || null
  };
}

export async function createRenewalSupportTicket(token, payload = {}) {
  const renewal = await getRenewalByToken(token);
  if (!renewal) {
    const err = new Error('Renewal not found');
    err.status = 404;
    throw err;
  }

  const honeypot = String(payload.website || payload.honeypot || '').trim();
  if (honeypot) {
    return { ok: true, ticketId: null, suppressed: true };
  }

  const name = String(payload.name || payload.fullName || '').trim().slice(0, 120);
  const email = normalizeEmail(payload.email);
  const message = String(payload.message || payload.question || '').trim().slice(0, 4000);

  if (!name || name.length < 2) {
    const err = new Error('Please enter your name');
    err.status = 400;
    throw err;
  }
  if (!email) {
    const err = new Error('Please enter a valid email address');
    err.status = 400;
    throw err;
  }
  if (!message || message.length < 10) {
    const err = new Error('Please enter a message (at least 10 characters)');
    err.status = 400;
    throw err;
  }

  const sourceKey = normalizeSupportTicketSourceKey(
    SUPPORT_TICKET_SOURCE_KEYS.CLIENT_RENEWAL || 'client_renewal'
  );
  const subject = String(payload.subject || `${renewal.school_name || 'School'} renewal help`)
    .trim()
    .slice(0, 255);
  const question = [
    message,
    '',
    '---',
    `From: ${name}`,
    `Email: ${email}`,
    renewal.school_name ? `School: ${renewal.school_name}` : null,
    `Client id: ${renewal.client_id}`,
    `Renewal id: ${renewal.id}`,
    `Source: ${sourceKey}`
  ].filter(Boolean).join('\n');

  const qEnc = prepareEncryptedTicketText(question);
  const schoolOrganizationId = Number(renewal.organization_id || renewal.agency_id);
  let insertId = null;

  try {
    const [result] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
         subject, question, status, source_channel, source_email_from,
         question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
       VALUES (?, ?, NULL, ?, ?, ?, ?, 'open', 'public_web', ?, ?, ?, ?, ?)`,
      [
        schoolOrganizationId,
        renewal.client_id,
        sourceKey,
        renewal.agency_id,
        subject,
        qEnc.plain,
        email,
        qEnc.ciphertext,
        qEnc.iv,
        qEnc.authTag,
        qEnc.keyId
      ]
    );
    insertId = result.insertId;
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown column') || msg.includes('question_ciphertext') || msg.includes('source_email_from')) {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id, subject, question, status)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 'open')`,
        [schoolOrganizationId, renewal.client_id, sourceKey, renewal.agency_id, subject, question]
      );
      insertId = result.insertId;
    } else {
      throw e;
    }
  }

  return { ok: true, ticketId: insertId };
}
