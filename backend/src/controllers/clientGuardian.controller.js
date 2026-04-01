import { validationResult } from 'express-validator';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import { isDobAdultLocked } from '../utils/guardianWaivers.utils.js';

function safeJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e && e.includes('@') ? e : '';
}

function normalizeRelationshipType(value) {
  const k = String(value || '').trim().toLowerCase();
  if (k === 'self' || k === 'guardian' || k === 'proxy') return k;
  return 'guardian';
}

export const listClientGuardians = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const rows = await ClientGuardian.listForClient(clientId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertClientGuardian = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const email = normalizeEmail(req.body.email);
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const relationshipType = normalizeRelationshipType(req.body.relationshipType);
    const defaultTitle = relationshipType === 'self' ? 'Self' : 'Guardian';
    const relationshipTitle = String(req.body.relationshipTitle || defaultTitle).trim() || defaultTitle;
    const accessEnabled = req.body.accessEnabled !== false;
    const permissionsJson =
      safeJson(req.body.permissionsJson, null) ||
      {
        canViewDocs: true,
        canSignDocs: true,
        canViewLinks: true,
        canViewProgramMaterials: true,
        canViewProgress: true,
        canMessage: false
      };

    if (!email) return res.status(400).json({ error: { message: 'Valid email is required' } });
    if (!firstName || !lastName) return res.status(400).json({ error: { message: 'First and last name are required' } });

    // Find or create guardian user.
    let guardian = await User.findByEmail(email);
    let created = false;
    if (guardian) {
      // If an existing user is not a client_guardian, we do not auto-convert.
      if (String(guardian.role || '').toLowerCase() !== 'client_guardian') {
        return res.status(409).json({
          error: {
            message: 'A user with this email already exists and is not a client guardian. Use a different email or convert the role intentionally.'
          }
        });
      }
    } else {
      guardian = await User.create({
        email,
        passwordHash: null,
        firstName,
        lastName,
        personalEmail: email,
        role: 'client_guardian',
        status: 'PENDING_SETUP'
      });
      created = true;
    }

    // Assign guardian to the client’s organization context so they have a portal slug.
    if (client.organization_id) {
      await User.assignToAgency(guardian.id, parseInt(client.organization_id, 10));
    }

    // Link guardian to client.
    await ClientGuardian.upsertLink({
      clientId,
      guardianUserId: guardian.id,
      relationshipType,
      relationshipTitle,
      accessEnabled,
      permissionsJson,
      createdByUserId: req.user?.id || null
    });

    // Auto-enable portal toggle on the client if not already enabled.
    try {
      if (client.guardian_portal_enabled !== 1 && client.guardian_portal_enabled !== true) {
        await Client.update(clientId, { guardian_portal_enabled: 1 }, req.user?.id || null);
      }
    } catch {
      // best effort
    }

    // Generate a setup token link (48 hours).
    const tokenResult = await User.generatePasswordlessToken(guardian.id, 48, 'setup');
    const config = (await import('../config/config.js')).default;
    const frontendBase = String(config.frontendUrl || '').replace(/\/$/, '');
    const userOrgs = await User.getAgencies(guardian.id);
    const portalSlug = userOrgs?.[0]?.portal_url || userOrgs?.[0]?.slug || null;
    const passwordlessTokenLink = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
      : `${frontendBase}/passwordless-login/${tokenResult.token}`;

    let setupEmailSent = false;
    if (created) {
      const to = [guardian.email, guardian.username, guardian.work_email, guardian.personal_email]
        .filter(Boolean)
        .map((e) => String(e).trim().toLowerCase())
        .find((e) => e.includes('@'));
      if (to) {
        try {
          const Agency = (await import('../models/Agency.model.js')).default;
          const EmailTemplateService = (await import('../services/emailTemplate.service.js')).default;
          const { sendEmailFromIdentity } = await import('../services/unifiedEmail/unifiedEmailSender.service.js');
          const { resolvePreferredSenderIdentityForAgency } = await import('../services/emailSenderIdentityResolver.service.js');
          const EmailService = (await import('../services/email.service.js')).default;
          const agencyId = userOrgs?.[0]?.id || null;
          const agency = agencyId ? await Agency.findById(agencyId) : null;
          const template = await EmailTemplateService.getTemplateForAgency(agencyId, 'invitation');
          let subject = 'Set up your guardian account';
          let body = `You have been added as a guardian. Set up your account using this link (expires in 48 hours):\n${passwordlessTokenLink}`;
          if (template?.body) {
            const params = await EmailTemplateService.collectParameters(guardian, agency, {
              passwordlessToken: tokenResult.token,
              senderName: req.user?.first_name || req.user?.email || 'Admin'
            });
            const rendered = EmailTemplateService.renderTemplate(template, params);
            subject = rendered.subject || subject;
            body = rendered.body || body;
          }
          const identity = await resolvePreferredSenderIdentityForAgency({
            agencyId: agencyId || null,
            preferredKeys: ['login_recovery', 'system', 'default', 'notifications']
          });
          if (identity?.id) {
            await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to,
              subject,
              text: body,
              html: null,
              source: 'auto'
            });
          } else {
            await EmailService.sendEmail({
              to,
              subject,
              text: body,
              html: null,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              source: 'auto',
              agencyId: agencyId || null
            });
          }
          setupEmailSent = true;
        } catch (emailErr) {
          console.error('[upsertClientGuardian] Failed to send guardian setup email:', emailErr);
        }
      }
    }

    res.status(created ? 201 : 200).json({
      ok: true,
      createdGuardianUser: created,
      setupEmailSent,
      guardianUser: {
        id: guardian.id,
        email: guardian.email,
        first_name: guardian.first_name,
        last_name: guardian.last_name,
        role: guardian.role,
        status: guardian.status
      },
      passwordlessToken: tokenResult.token,
      passwordlessTokenLink
    });
  } catch (e) {
    next(e);
  }
};

export const updateClientGuardian = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const guardianUserId = parseInt(req.params.guardianUserId, 10);
    if (!clientId || !guardianUserId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const relationshipTitle = req.body.relationshipTitle !== undefined ? String(req.body.relationshipTitle || '').trim() : undefined;
    const relationshipType = req.body.relationshipType !== undefined ? normalizeRelationshipType(req.body.relationshipType) : undefined;
    const accessEnabled = req.body.accessEnabled !== undefined ? (req.body.accessEnabled !== false) : undefined;
    const permissionsJson = req.body.permissionsJson !== undefined ? safeJson(req.body.permissionsJson, null) : undefined;

    const existing = (await ClientGuardian.listForClient(clientId)).find((g) => Number(g.guardian_user_id) === guardianUserId);
    if (!existing) return res.status(404).json({ error: { message: 'Guardian link not found' } });

    await ClientGuardian.upsertLink({
      clientId,
      guardianUserId,
      relationshipType: relationshipType ?? existing.relationship_type ?? 'guardian',
      relationshipTitle: relationshipTitle ?? existing.relationship_title,
      accessEnabled: accessEnabled ?? (existing.access_enabled === 1 || existing.access_enabled === true),
      permissionsJson: permissionsJson ?? existing.permissions_json,
      createdByUserId: req.user?.id || null
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const removeClientGuardian = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const guardianUserId = parseInt(req.params.guardianUserId, 10);
    if (!clientId || !guardianUserId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const ok = await ClientGuardian.removeLink({ clientId, guardianUserId });
    res.json({ ok });
  } catch (e) {
    next(e);
  }
};

export const listMyGuardianClients = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const rows = await ClientGuardian.listClientsForGuardian({ guardianUserId: uid });
    res.json(
      (rows || []).map((c) => ({
        ...c,
        guardian_portal_locked: isDobAdultLocked(c?.date_of_birth)
      }))
    );
  } catch (e) {
    next(e);
  }
};

