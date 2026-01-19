import { validationResult } from 'express-validator';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';

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
    const relationshipTitle = String(req.body.relationshipTitle || 'Guardian').trim() || 'Guardian';
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
        status: 'ACTIVE_EMPLOYEE'
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

    // Generate a passwordless token link so the admin can send it (48 hours).
    const tokenResult = await User.generatePasswordlessToken(guardian.id, 48);
    const config = (await import('../config/config.js')).default;
    const frontendBase = String(config.frontendUrl || '').replace(/\/$/, '');
    const userOrgs = await User.getAgencies(guardian.id);
    const portalSlug = userOrgs?.[0]?.portal_url || userOrgs?.[0]?.slug || null;
    const passwordlessTokenLink = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
      : `${frontendBase}/passwordless-login/${tokenResult.token}`;

    res.status(created ? 201 : 200).json({
      ok: true,
      createdGuardianUser: created,
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
    const accessEnabled = req.body.accessEnabled !== undefined ? (req.body.accessEnabled !== false) : undefined;
    const permissionsJson = req.body.permissionsJson !== undefined ? safeJson(req.body.permissionsJson, null) : undefined;

    const existing = (await ClientGuardian.listForClient(clientId)).find((g) => Number(g.guardian_user_id) === guardianUserId);
    if (!existing) return res.status(404).json({ error: { message: 'Guardian link not found' } });

    await ClientGuardian.upsertLink({
      clientId,
      guardianUserId,
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
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

