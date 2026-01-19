import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { validationResult } from 'express-validator';

export const listEmailSenderIdentities = async (req, res, next) => {
  try {
    const agencyIdRaw = req.query?.agencyId;
    const agencyId = agencyIdRaw === undefined || agencyIdRaw === null || agencyIdRaw === '' ? null : Number(agencyIdRaw);
    const includePlatformDefaults = String(req.query?.includePlatformDefaults || 'true') !== 'false';

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
    const identityKey = String(req.body?.identityKey || '').trim();
    const displayName = req.body?.displayName ?? null;
    const fromEmail = String(req.body?.fromEmail || '').trim();
    const replyTo = req.body?.replyTo ?? null;
    const inboundAddresses = Array.isArray(req.body?.inboundAddresses) ? req.body.inboundAddresses : null;
    const isActive = req.body?.isActive !== false;

    const created = await EmailSenderIdentity.create({
      agencyId,
      identityKey,
      displayName,
      fromEmail,
      replyTo,
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

    const updates = {
      identityKey: req.body?.identityKey !== undefined ? String(req.body.identityKey || '').trim() : undefined,
      displayName: req.body?.displayName !== undefined ? req.body.displayName : undefined,
      fromEmail: req.body?.fromEmail !== undefined ? String(req.body.fromEmail || '').trim() : undefined,
      replyTo: req.body?.replyTo !== undefined ? req.body.replyTo : undefined,
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

