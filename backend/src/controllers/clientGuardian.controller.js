import { ageOn } from '../services/guardianClinicalAccess.service.js';
import {resolveClientRecordAccess} from '../services/clientRecordAccess.service.js';
import { guardianAccountStatuses } from '../services/guardianAccountStatus.service.js';
import { deferGuardianInvitation } from '../utils/schoolGuardianPortalPolicy.js';
import { validationResult } from 'express-validator';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import { isGuardianPortalLocked } from '../utils/guardianWaivers.utils.js';
import { updateLinkedGuardianContact } from '../services/linkedGuardianContact.service.js';
import { permissionsForAccessMode } from '../utils/portalRelationshipAccess.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

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
    res.json(await guardianAccountStatuses({ clientId, guardians: rows }));
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

    if (req.user.role !== 'super_admin') {
      const agencies = await User.getAgencies(req.user.id);
      if (!agencies.some(a => Number(a.id) === Number(client.agency_id))) return res.status(403).json({error:{message:'You do not have access to this client'}});
    }

    const email = normalizeEmail(req.body.email);
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const relationshipType = normalizeRelationshipType(req.body.relationshipType);
    const clientAge = ageOn(client.date_of_birth);
    if (relationshipType === 'self' && clientAge !== null && clientAge < 18) return res.status(409).json({error:{message:'Use Invite client to create a personal portal login for a minor. Guardian access stays separate.'}});
    const defaultTitle = relationshipType === 'self' ? 'Self' : 'Guardian';
    const relationshipTitle = String(req.body.relationshipTitle || defaultTitle).trim() || defaultTitle;
    const accessEnabled = req.body.accessEnabled === true;
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
    if (relationshipType === 'self' && (req.body.clientOwnContactConfirmed !== true || !normalizeEmail(client.email) || normalizeEmail(client.email) !== email)) return res.status(400).json({ error: { message: 'Save and explicitly confirm the client’s own email in Demographics before preparing their portal account. A guardian’s email must not be used as the client’s email.' } });
    if (relationshipType !== 'self' && accessEnabled && req.body.relationshipVerified !== true) {
      return res.status(400).json({ error: { message: 'Verify this person’s identity and relationship to the selected client before enabling access.' } });
    }

    // Find or create guardian user.
    let guardian = await User.findByEmail(email);
    let created = false;
    if (guardian) {
      // If an existing user is not a client_guardian, we do not auto-convert.
      if (!['client_guardian','client'].includes(String(guardian.role || '').toLowerCase())) {
        return res.status(409).json({
          error: {
            message: 'A user with this email already exists and belongs to a staff identity. Review the identity before creating a guardian link.'
          }
        });
      }
      if (relationshipType === 'self') {
        const prior = await ClientGuardian.getLink({ clientId, guardianUserId: guardian.id });
        if (prior && prior.relationship_type !== 'self') return res.status(409).json({ error: { message: 'This email belongs to an existing guardian relationship for this client. Use the client’s separate email; guardian access cannot be converted into the client’s identity.' } });
      }
    } else {
      guardian = await User.create({
        email,
        passwordHash: null,
        firstName,
        lastName,
        personalEmail: email,
        role: relationshipType === 'self' ? 'client' : 'client_guardian',
        phoneNumber: relationshipType === 'self' ? client.phone || null : String(req.body.phone || req.body.phoneNumber || '').trim() || null,
        status: 'PENDING_SETUP'
      });
      created = true;
    }

    const priorLink = await ClientGuardian.getLink({ clientId, guardianUserId: guardian.id });
    if (priorLink?.permissions_json?.relationshipRevoked) {
      return res.status(409).json({ error: { message: 'This relationship was marked incorrect. Use Restore relationship under Past relationships to review and restore it.', code: 'GUARDIAN_RELATIONSHIP_REVIEW_REQUIRED' } });
    }
    if (Number(priorLink?.access_enabled) === 1) {
      return res.status(409).json({ error: { message: 'This account already has a relationship with this client. Review it on the Portal tab.' } });
    }

    // Keep both tenant access and program context for guardian login.
    if (client.agency_id) await User.assignToAgency(guardian.id, Number(client.agency_id));
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
      permissionsJson: {
        ...(req.body.permissionsJson === undefined && priorLink ? priorLink.permissions_json : permissionsJson),
        ...(relationshipType !== 'self' && { pendingGuardianVerification: !accessEnabled && Number(priorLink?.access_enabled) !== 1 })
      },
      expectedLink: priorLink,
      createdByUserId: req.user?.id || null
    });

    // Auto-enable portal toggle on the client if not already enabled.
    try {
      if (accessEnabled && client.guardian_portal_enabled !== 1 && client.guardian_portal_enabled !== true) {
        await Client.update(clientId, { guardian_portal_enabled: 1 }, req.user?.id || null);
      }
    } catch {
      // best effort
    }

    const Agency = (await import('../models/Agency.model.js')).default;
    const organization = client.organization_id ? await Agency.findById(Number(client.organization_id)) : null;
    const invitationDeferred = deferGuardianInvitation({ ...client, organization_type: organization?.organization_type });
    let passwordlessTokenLink = null;
    let setupEmailSent = false;
    if (req.body.sendInvitation !== false && relationshipType !== 'self' && !invitationDeferred && accessEnabled && (created || !Number(priorLink?.access_enabled))) {
      try {
        const {sendHubPortalInvitation}=await import('../services/messagesHub.service.js');
        const invitation=await sendHubPortalInvitation({agencyId:Number(client.agency_id),actorUserId:req.user.id,
          clientId,guardianUserId:guardian.id,existingLinkOnly:true});
        passwordlessTokenLink=invitation.setupUrl;
        const delivery=invitation.delivery;
        setupEmailSent=!!delivery?.id&&!delivery.skipped&&!delivery.blocked&&!delivery.queued&&!delivery.pendingApproval&&!delivery.redirected;
      }catch(emailErr){console.error('[upsertClientGuardian] Failed to send guardian setup email:',emailErr);}
    }

    res.status(created ? 201 : 200).json({
      ok: true,
      createdGuardianUser: created,
      setupEmailSent,
      invitationDeferred,
      guardianUser: {
        id: guardian.id,
        email: guardian.email,
        first_name: guardian.first_name,
        last_name: guardian.last_name,
        role: guardian.role,
        status: guardian.status
      },
      passwordlessToken: null,
      passwordlessTokenLink
    });
  } catch (e) {
    next(e);
  }
};

export const updateClientGuardian = async (req, res, next) => {
  try {
    const contactOnly = Object.hasOwn(req.body || {}, 'contact');
    if (contactOnly && (!req.body.contact || typeof req.body.contact !== 'object' || Array.isArray(req.body.contact))) {
      return res.status(400).json({ error: { message: 'Enter valid guardian contact details.' } });
    }
    if (contactOnly && Object.keys(req.body).some(key => !['contact', 'relationshipTitle'].includes(key))) {
      return res.status(400).json({ error: { message: 'Save contact details separately from portal access or relationship identity changes.' } });
    }
    if (contactOnly && req.body.relationshipTitle !== undefined &&
        (typeof req.body.relationshipTitle !== 'string' || req.body.relationshipTitle.trim().length > 100)) {
      return res.status(400).json({ error: { message: 'Enter a relationship label of 100 characters or fewer.' } });
    }

    const clientId = parseInt(req.params.id, 10);
    const guardianUserId = parseInt(req.params.guardianUserId, 10);
    if (!clientId || !guardianUserId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const relationshipTitle = req.body.relationshipTitle !== undefined ? String(req.body.relationshipTitle || '').trim() : undefined;
    const relationshipType = req.body.relationshipType !== undefined ? normalizeRelationshipType(req.body.relationshipType) : undefined;
    let accessEnabled = req.body.accessEnabled !== undefined ? (req.body.accessEnabled !== false) : undefined;
    let permissionsJson = req.body.permissionsJson !== undefined ? safeJson(req.body.permissionsJson, null) : undefined;

    const existing = (await ClientGuardian.listForClient(clientId)).find((g) => Number(g.guardian_user_id) === guardianUserId);
    if (!existing) return res.status(404).json({ error: { message: 'Guardian link not found' } });
    if (relationshipType === 'self' && existing.relationship_type !== 'self') return res.status(409).json({ error: { message: 'A guardian link cannot be converted into the client’s own identity. Prepare the client’s separate account using their own saved email.' } });

    if (req.body.accessMode !== undefined) {
      if (!String(req.body.accessReason || '').trim()) return res.status(400).json({ error: { message: 'Record the reason for this portal access change.' } });
      if (existing.relationship_type === 'self' && ['payment_only', 'payer_plus'].includes(req.body.accessMode)) return res.status(400).json({ error: { message: 'Payment-only access applies to a responsible payer. Keep the client’s own account separate.' } });
      permissionsJson = permissionsForAccessMode(existing.permissions_json, req.body.accessMode);
      accessEnabled = req.body.accessMode !== 'none';
    }
    if (existing.permissions_json?.relationshipRevoked && accessEnabled === true) {
      return res.status(409).json({ error: { message: 'This relationship was marked incorrect and needs separate review.' } });
    }
    if (accessEnabled === true && existing.permissions_json?.pendingGuardianVerification &&
      (req.body.relationshipVerified !== true || !req.body.accessMode)) {
      return res.status(409).json({ error: { message: 'Verify the guardian’s identity and authority before enabling their access.' } });
    }

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    const access=await resolveClientRecordAccess({userId:req.user.id,role:req.user.role,clientId,client});
    if(!access.ok)return res.status(access.status || 403).json({error:{message:access.message || 'Client access denied.'}});
    if (req.body.contact) await updateLinkedGuardianContact({ clientId, guardianUserId, user: req.user, contact: req.body.contact });

    if (req.body.relationshipVerified === true && req.body.accessMode && accessEnabled === true) {
      permissionsJson = { ...safeJson(permissionsJson ?? existing.permissions_json, {}), pendingGuardianVerification: false };
    }

    await ClientGuardian.upsertLink({
      clientId,
      guardianUserId,
      relationshipType: relationshipType ?? existing.relationship_type ?? 'guardian',
      relationshipTitle: relationshipTitle ?? existing.relationship_title,
      accessEnabled: accessEnabled ?? (existing.access_enabled === 1 || existing.access_enabled === true),
      permissionsJson: permissionsJson ?? existing.permissions_json,
      expectedLink: existing,
      metadataOnly: contactOnly,
      createdByUserId: req.user?.id || null
    });

    await logAuditEvent(req, { actionType: contactOnly ? 'guardian_contact_updated' : 'client_portal_access_updated', agencyId: req.agencyId || null,
      metadata: { clientId, guardianUserId, previousAccessEnabled: Number(existing.access_enabled) === 1, accessMode: req.body.accessMode || null, relationshipVerified: req.body.relationshipVerified === true && req.body.accessMode === 'care', accessEnabled: accessEnabled ?? Number(existing.access_enabled) === 1, reason: String(req.body.accessReason || '').slice(0, 1000) } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const restoreClientGuardian = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id), guardianUserId = Number(req.params.guardianUserId);
    if (![clientId, guardianUserId].every(id => Number.isSafeInteger(id) && id > 0)) return res.status(400).json({error:{message:'Invalid relationship ids.'}});
    const accessMode = req.body?.accessMode;
    const reason = typeof req.body?.accessReason === 'string' ? req.body.accessReason.trim() : '';
    if (req.body?.relationshipVerified !== true || !reason || reason.length > 1000 || !['care','payment_only','payer_plus','none'].includes(accessMode)) {
      return res.status(400).json({error:{message:'Confirm the current relationship, choose access and record the reason for restoring it.'}});
    }
    const access = await resolveClientRecordAccess({userId:req.user.id,role:req.user.role,clientId});
    if (!access.ok) return res.status(access.status || 403).json({error:{message:access.message || 'Client access denied.'}});
    const link = await ClientGuardian.getLink({clientId,guardianUserId});
    if (!link) return res.status(404).json({error:{message:'Guardian relationship not found.'}});
    if (link.relationship_type === 'self') return res.status(409).json({error:{message:'Review the client’s own account separately from guardian relationship restoration.'}});
    const result = await ClientGuardian.restoreIncorrectLink({clientId,guardianUserId,actorUserId:req.user.id,accessMode,reason});
    await logAuditEvent(req,{actionType:'guardian_relationship_restored',agencyId:access.client?.agency_id || req.agencyId || null,
      metadata:{clientId,guardianUserId,accessMode,reason}});
    res.json({ok:true,...result});
  } catch (error) { next(error); }
};

export const removeClientGuardian = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const guardianUserId = parseInt(req.params.guardianUserId, 10);
    if (!clientId || !guardianUserId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status || 403).json({ error: { message: access.message || 'Client access denied.' } });
    const ok = await ClientGuardian.revokeIncorrectLink({ clientId, guardianUserId, actorUserId: req.user.id });
    if (!ok) return res.status(404).json({ error: { message: 'Guardian relationship not found.' } });
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
        guardian_portal_locked: isGuardianPortalLocked(c, c?.date_of_birth)
      }))
    );
  } catch (e) {
    next(e);
  }
};
