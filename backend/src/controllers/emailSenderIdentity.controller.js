import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import User from '../models/User.model.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { syncSchoolEmailInboundForAgency } from '../services/unifiedEmail/schoolEmailInboundSync.service.js';
import { validationResult } from 'express-validator';

async function getAllowedAgencyIds(req) {
  if (req.user?.role === 'super_admin') return null;
  const agencies = await User.getAgencies(req.user.id);
  return (agencies || []).map((a) => Number(a.id)).filter(Boolean);
}

function ensureAgencyAccess({ agencyId, allowedIds, allowNull }) {
  if (agencyId === null) {
    if (!allowNull) {
      const err = new Error('Platform identities require super admin access.');
      err.status = 403;
      throw err;
    }
    return;
  }
  if (!allowedIds || !allowedIds.includes(Number(agencyId))) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
}

export const listEmailSenderIdentities = async (req, res, next) => {
  try {
    const agencyIdRaw = req.query?.agencyId;
    const agencyId = agencyIdRaw === undefined || agencyIdRaw === null || agencyIdRaw === '' ? null : Number(agencyIdRaw);
    const includePlatformDefaults = String(req.query?.includePlatformDefaults || 'true') !== 'false';
    const allowedAgencyIds = await getAllowedAgencyIds(req);
    const isSuperAdmin = req.user?.role === 'super_admin';

    if (!isSuperAdmin) {
      // If no agencyId provided, default to first allowed agency (if any).
      if ((agencyId === null || Number.isNaN(agencyId)) && allowedAgencyIds?.length) {
        const rows = await EmailSenderIdentity.list({
          agencyId: allowedAgencyIds[0],
          includePlatformDefaults,
          onlyActive: false
        });
        return res.json(rows);
      }
      ensureAgencyAccess({ agencyId, allowedIds: allowedAgencyIds, allowNull: false });
    }

    const rows = await EmailSenderIdentity.list({
      agencyId,
      includePlatformDefaults,
      onlyActive: false
    });

    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const createEmailSenderIdentity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = req.body?.agencyId === null || req.body?.agencyId === undefined || req.body?.agencyId === '' ? null : Number(req.body.agencyId);
    const allowedAgencyIds = await getAllowedAgencyIds(req);
    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin) {
      ensureAgencyAccess({ agencyId, allowedIds: allowedAgencyIds, allowNull: false });
    }
    const identityKey = String(req.body?.identityKey || '').trim();
    const displayName = req.body?.displayName ?? null;
    const fromEmail = String(req.body?.fromEmail || '').trim();
    const replyTo = req.body?.replyTo ?? null;
    const signatureImageUrl = req.body?.signatureImageUrl !== undefined
      ? String(req.body?.signatureImageUrl || '').trim() || null
      : null;
    const signatureImagePath = req.body?.signatureImagePath !== undefined
      ? String(req.body?.signatureImagePath || '').trim() || null
      : null;
    const signatureAltText = req.body?.signatureAltText !== undefined
      ? String(req.body?.signatureAltText || '').trim() || null
      : null;
    const inboundAddresses = Array.isArray(req.body?.inboundAddresses) ? req.body.inboundAddresses : null;
    const isActive = req.body?.isActive !== false;

    const created = await EmailSenderIdentity.create({
      agencyId,
      identityKey,
      displayName,
      fromEmail,
      replyTo,
      signatureImageUrl,
      signatureImagePath,
      signatureAltText,
      inboundAddresses,
      isActive
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const updateEmailSenderIdentity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid sender identity id' } });

    const existing = await EmailSenderIdentity.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Sender identity not found' } });

    const allowedAgencyIds = await getAllowedAgencyIds(req);
    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin) {
      ensureAgencyAccess({ agencyId: existing.agency_id ?? null, allowedIds: allowedAgencyIds, allowNull: false });
    }

    const updates = {
      identityKey: req.body?.identityKey !== undefined ? String(req.body.identityKey || '').trim() : undefined,
      displayName: req.body?.displayName !== undefined ? req.body.displayName : undefined,
      fromEmail: req.body?.fromEmail !== undefined ? String(req.body.fromEmail || '').trim() : undefined,
      replyTo: req.body?.replyTo !== undefined ? req.body.replyTo : undefined,
      signatureImageUrl: req.body?.signatureImageUrl !== undefined
        ? String(req.body.signatureImageUrl || '').trim() || null
        : undefined,
      signatureImagePath: req.body?.signatureImagePath !== undefined
        ? String(req.body.signatureImagePath || '').trim() || null
        : undefined,
      signatureAltText: req.body?.signatureAltText !== undefined
        ? String(req.body.signatureAltText || '').trim() || null
        : undefined,
      inboundAddresses: req.body?.inboundAddresses !== undefined ? (Array.isArray(req.body.inboundAddresses) ? req.body.inboundAddresses : null) : undefined,
      isActive: req.body?.isActive !== undefined ? !!req.body.isActive : undefined
    };

    const updated = await EmailSenderIdentity.update(id, updates);
    if (!updated) return res.status(404).json({ error: { message: 'Sender identity not found' } });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const sendTestEmailFromIdentity = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid sender identity id' } });

    const identity = await EmailSenderIdentity.findById(id);
    if (!identity) return res.status(404).json({ error: { message: 'Sender identity not found' } });

    const allowedAgencyIds = await getAllowedAgencyIds(req);
    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin) {
      ensureAgencyAccess({ agencyId: identity.agency_id ?? null, allowedIds: allowedAgencyIds, allowNull: false });
    }

    const to = String(req.body?.toEmail || req.user?.email || '').trim();
    if (!to) return res.status(400).json({ error: { message: 'toEmail is required' } });

    const subject = String(req.body?.subject || 'Email settings test').trim();
    const text = String(req.body?.text || 'This is a test email from your sender identity configuration.').trim();

    const result = await sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to,
      subject,
      text,
      source: 'manual'
    });

    res.json({ ok: true, result });
  } catch (e) {
    next(e);
  }
};

/**
 * Bulk-create/update schoolreply identity and attach every affiliated school
 * group email (school_profiles.itsco_email) as an inbound route.
 */
export const syncSchoolEmailInbound = async (req, res, next) => {
  try {
    const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId;
    const agencySlug = String(req.body?.agencySlug || req.query?.agencySlug || 'itsco').trim() || 'itsco';
    const agencyId = agencyIdRaw === undefined || agencyIdRaw === null || agencyIdRaw === ''
      ? null
      : Number(agencyIdRaw);

    const allowedAgencyIds = await getAllowedAgencyIds(req);
    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin && agencyId) {
      ensureAgencyAccess({ agencyId, allowedIds: allowedAgencyIds, allowNull: false });
    }

    const result = await syncSchoolEmailInboundForAgency({
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
      agencySlug,
      fromEmail: req.body?.fromEmail || 'schoolreply@itsco.health',
      replyTo: req.body?.replyTo || 'schools@itsco.health',
      displayName: req.body?.displayName || 'ITSCO School Reply',
      configureAiPolicy: req.body?.configureAiPolicy !== false,
      actorUserId: req.user?.id || null
    });

    if (!isSuperAdmin && allowedAgencyIds && !allowedAgencyIds.includes(Number(result.agency.id))) {
      return res.status(403).json({ error: { message: 'Access denied to this agency' } });
    }

    res.json(result);
  } catch (e) {
    next(e);
  }
};

