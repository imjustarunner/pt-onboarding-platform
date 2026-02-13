import { validationResult } from 'express-validator';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ClientReferralOcr from '../models/ClientReferralOcr.model.js';
import User from '../models/User.model.js';
import StorageService from '../services/storage.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import ReferralOcrService from '../services/referralOcr.service.js';

async function getPacketOcrLanguageHint(agencyId) {
  if (!agencyId) return null;
  try {
    const [rows] = await pool.execute(`SELECT custom_parameters FROM agencies WHERE id = ?`, [agencyId]);
    const raw = rows?.[0]?.custom_parameters || null;
    if (!raw) return null;
    const custom = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const hint = custom?.packet_ocr_config?.languageHint;
    return String(hint || '').trim() || null;
  } catch {
    return null;
  }
}

async function userCanAccessClient({ requestingUserId, requestingUserRole, client }) {
  if (requestingUserRole === 'super_admin') return true;
  const userAgencies = await User.getAgencies(requestingUserId);
  const userAgencyIds = userAgencies.map(a => a.id);
  return userAgencyIds.includes(client.agency_id) || userAgencyIds.includes(client.organization_id);
}

const normalizeNamePart = (value) => {
  const raw = String(value || '').replace(/[^A-Za-z]/g, '');
  if (!raw) return '';
  const part = raw.slice(0, 3);
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
};

const buildAbbreviatedName = (firstName, lastName) => {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  return `${first}${last}`.trim();
};

const buildOcrAad = ({ clientId, requestId, phiDocumentId }) =>
  JSON.stringify({
    type: 'referral_ocr',
    clientId,
    requestId,
    phiDocumentId
  });

const hydrateRequest = async (request) => {
  if (!request) return null;
  const clean = {
    id: request.id,
    client_id: request.client_id,
    phi_document_id: request.phi_document_id,
    requested_by_user_id: request.requested_by_user_id,
    status: request.status,
    error_message: request.error_message,
    created_at: request.created_at,
    updated_at: request.updated_at,
    expires_at: request.expires_at,
    result_text: null
  };
  if (!request.result_text_encrypted || !request.is_encrypted) {
    return clean;
  }
  try {
    const decrypted = await DocumentEncryptionService.decryptBuffer({
      encryptedBuffer: request.result_text_encrypted,
      encryptionKeyId: request.encryption_key_id,
      encryptionWrappedKeyB64: request.encryption_wrapped_key,
      encryptionIvB64: request.encryption_iv,
      encryptionAuthTagB64: request.encryption_auth_tag,
      aad: request.encryption_aad
    });
    clean.result_text = decrypted.toString('utf8');
  } catch (e) {
    clean.error_message = 'Unable to decrypt extracted text';
    clean.status = 'failed';
  }
  return clean;
};

export const requestReferralOcr = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const clientId = parseInt(req.params.clientId, 10);
    const phiDocumentId = req.body?.phiDocumentId ? parseInt(req.body.phiDocumentId, 10) : null;
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let doc = null;
    if (phiDocumentId) {
      doc = await ClientPhiDocument.findById(phiDocumentId);
      if (!doc || doc.client_id !== clientId) {
        return res.status(404).json({ error: { message: 'PHI document not found for client' } });
      }
    } else {
      const docs = await ClientPhiDocument.findByClientId(clientId);
      doc = docs?.[0] || null;
    }

    if (!doc) {
      return res.status(404).json({ error: { message: 'No PHI document found for client' } });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const request = await ClientReferralOcr.create({
      clientId,
      phiDocumentId: doc.id,
      requestedByUserId: req.user.id,
      status: 'queued',
      expiresAt
    });

    const hydrated = await hydrateRequest(request);
    res.status(201).json({ request: hydrated });
  } catch (error) {
    next(error);
  }
};

export const listReferralOcrRequests = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const requests = await ClientReferralOcr.findByClientId(clientId);
    const now = Date.now();
    for (const r of requests || []) {
      if (!r?.expires_at) continue;
      const exp = new Date(r.expires_at).getTime();
      if (Number.isFinite(exp) && exp <= now && r.result_text_encrypted) {
        // Best-effort: purge expired text
        await ClientReferralOcr.updateById(r.id, {
          result_text_encrypted: null,
          is_encrypted: false,
          encryption_key_id: null,
          encryption_wrapped_key: null,
          encryption_iv: null,
          encryption_auth_tag: null,
          encryption_alg: null,
          encryption_aad: null,
          error_message: 'Extracted text expired',
          status: 'expired'
        });
      }
    }
    const refreshed = await ClientReferralOcr.findByClientId(clientId);
    const hydrated = [];
    for (const r of refreshed || []) {
      hydrated.push(await hydrateRequest(r));
    }
    res.json({ requests: hydrated });
  } catch (error) {
    next(error);
  }
};

export const processReferralOcrRequest = async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    if (!requestId) return res.status(400).json({ error: { message: 'requestId is required' } });

    const request = await ClientReferralOcr.findById(requestId);
    if (!request) return res.status(404).json({ error: { message: 'OCR request not found' } });
    if (request.expires_at) {
      const exp = new Date(request.expires_at).getTime();
      if (Number.isFinite(exp) && exp <= Date.now()) {
        return res.status(410).json({ error: { message: 'OCR request expired. Please re-run extraction.' } });
      }
    }

    const client = await Client.findById(request.client_id, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const doc = await ClientPhiDocument.findById(request.phi_document_id);
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });

    const encryptedBuffer = await StorageService.readObject(doc.storage_path);
    let buffer = encryptedBuffer;
    if (doc.is_encrypted) {
      buffer = await DocumentEncryptionService.decryptBuffer({
        encryptedBuffer,
        encryptionKeyId: doc.encryption_key_id,
        encryptionWrappedKeyB64: doc.encryption_wrapped_key,
        encryptionIvB64: doc.encryption_iv,
        encryptionAuthTagB64: doc.encryption_auth_tag,
        aad: JSON.stringify({
          organizationId: doc.school_organization_id,
          uploadType: 'referral_packet',
          filename: StorageService.sanitizeFilename(doc.original_name || '')
        })
      });
    }

    await ClientReferralOcr.updateById(requestId, { status: 'processing', error_message: null });
    const languageHint = await getPacketOcrLanguageHint(client.agency_id);
    let text = '';
    try {
      text = await ReferralOcrService.extractText({ buffer, mimeType: doc.mime_type, languageHint });
      const aad = buildOcrAad({
        clientId: request.client_id,
        requestId,
        phiDocumentId: request.phi_document_id
      });
      const encrypted = await DocumentEncryptionService.encryptBuffer(Buffer.from(String(text || ''), 'utf8'), {
        aad
      });
      await ClientReferralOcr.updateById(requestId, {
        status: 'completed',
        result_text_encrypted: encrypted.encryptedBuffer,
        is_encrypted: true,
        encryption_key_id: encrypted.encryptionKeyId,
        encryption_wrapped_key: encrypted.encryptionWrappedKeyB64,
        encryption_iv: encrypted.encryptionIvB64,
        encryption_auth_tag: encrypted.encryptionAuthTagB64,
        encryption_alg: encrypted.encryptionAlg,
        encryption_aad: aad,
        error_message: null
      });
    } catch (e) {
      await ClientReferralOcr.updateById(requestId, { status: 'failed', error_message: e.message || 'OCR failed' });
    }

    const updated = await ClientReferralOcr.findById(requestId);
    const hydrated = await hydrateRequest(updated);
    res.json({ request: hydrated });
  } catch (error) {
    next(error);
  }
};

export const setReferralProfileInitials = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    if (!firstName || !lastName) {
      return res.status(400).json({ error: { message: 'firstName and lastName are required' } });
    }

    const initials = buildAbbreviatedName(firstName, lastName);
    if (!initials) {
      return res.status(400).json({ error: { message: 'Unable to generate abbreviated initials' } });
    }

    await Client.update(clientId, { initials }, req.user.id);
    const updated = await Client.findById(clientId, { includeSensitive: true });
    res.json({ client: updated, initials });
  } catch (error) {
    next(error);
  }
};

export const clearReferralOcrResult = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const requestId = parseInt(req.params.requestId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    if (!requestId) return res.status(400).json({ error: { message: 'requestId is required' } });

    const request = await ClientReferralOcr.findById(requestId);
    if (!request || request.client_id !== clientId) {
      return res.status(404).json({ error: { message: 'OCR request not found' } });
    }

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const updated = await ClientReferralOcr.updateById(requestId, {
      result_text_encrypted: null,
      is_encrypted: false,
      encryption_key_id: null,
      encryption_wrapped_key: null,
      encryption_iv: null,
      encryption_auth_tag: null,
      encryption_alg: null,
      encryption_aad: null,
      error_message: 'Extracted text cleared',
      status: 'cleared'
    });
    const hydrated = await hydrateRequest(updated);
    res.json({ request: hydrated, cleared: true });
  } catch (error) {
    next(error);
  }
};
