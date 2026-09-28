import crypto from 'crypto';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';
import { encryptDemographicsPayload } from './demographicsImport.service.js';
import { encryptGuardianIntake } from './guardianIntakeEncryption.service.js';
import { validateFaxFields } from './faxExtraction.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status, safe: true });
export const draftAad = id => `fax-intake:${id}`;

export async function saveFaxDraft({ buffer, mimeType, pages, candidates, agencyId, organizationId, userId }) {
  const id = crypto.randomUUID();
  const encrypted = await DocumentEncryptionService.encryptBuffer(Buffer.from(JSON.stringify({
    file: buffer.toString('base64'), mimeType, pages, candidates
  })), { aad: draftAad(id) });
  const { encryptedBuffer, ...metadata } = encrypted;
  await pool.execute(`INSERT INTO fax_intake_drafts
    (id, agency_id, organization_id, created_by_user_id, payload_encrypted, encryption_metadata, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))`,
  [id, agencyId, organizationId, userId, encryptedBuffer, JSON.stringify(metadata)]);
  return id;
}

export async function getFaxDraft(id, userId, executor = pool, lock = false) {
  const [rows] = await executor.execute(`SELECT * FROM fax_intake_drafts WHERE id = ? AND created_by_user_id = ?${lock ? ' FOR UPDATE' : ''}`, [id, userId]);
  if (!rows[0]) throw fail('Fax intake not found.', 404);
  if (!rows[0].client_id && new Date(rows[0].expires_at).getTime() <= Date.now()) throw fail('Fax review expired. Upload the fax again.', 410);
  return rows[0];
}

export async function assertReferralEntry(executor, entryId, agencyId) {
  const [rows] = await executor.execute(`SELECT id FROM referral_directory_entries
    WHERE id = ? AND agency_id = ? AND is_active = TRUE AND approval_status = 'approved'`, [entryId, agencyId]);
  if (!rows[0]) throw fail('Choose an active, approved referral entry from this agency.');
}

export async function createClientFromFax({ payload, fax, userId }) {
  if (fax?.reviewed !== true) throw fail('Confirm that you reviewed the fax fields.');
  const fields = validateFaxFields(fax.fields);
  const entryId = Number(fax.entryId);
  if (!Number.isSafeInteger(entryId) || entryId <= 0) throw fail('Select a referring organization from the directory.');
  // Encrypt before any inserts; missing keys must fail closed.
  const demographics = encryptDemographicsPayload({
    fullName: fields.client_full_name, dateOfBirth: fields.date_of_birth,
    contactPhone: fields.client_phone, email: fields.client_email,
    addressStreet: fields.address_street, addressCity: fields.address_city,
    addressState: fields.address_state, addressZip: fields.address_zip,
    faxFields: fields
  });
  const guardian = {
    firstName: fields.guardian_first_name || null, lastName: fields.guardian_last_name || null,
    fullName: fields.guardian_full_name || [fields.guardian_first_name, fields.guardian_last_name].filter(Boolean).join(' ') || null,
    phone: fields.guardian_phone || null, email: fields.guardian_email || null,
    relationship: fields.guardian_relationship || null
  };
  const guardianEnc = Object.values(guardian).some(Boolean) ? encryptGuardianIntake(JSON.stringify(guardian)) : null;
  const conn = await pool.getConnection();
  let uploadedFile = null;
  let committed = false;
  let commitAttempted = false;
  try {
    await conn.beginTransaction();
    const draft = await getFaxDraft(fax.draftId, userId, conn, true);
    if (Number(draft.agency_id) !== Number(payload.agency_id) || Number(draft.organization_id) !== Number(payload.organization_id)) throw fail('The fax belongs to another agency or organization. Upload it in the selected organization.');
    if (draft.client_id) { await conn.commit(); return Client.findById(draft.client_id); }
    await assertReferralEntry(conn, entryId, payload.agency_id);
    const meta = typeof draft.encryption_metadata === 'string' ? JSON.parse(draft.encryption_metadata) : draft.encryption_metadata;
    const decrypted = await DocumentEncryptionService.decryptBuffer({ ...meta, encryptedBuffer: draft.payload_encrypted, aad: draftAad(draft.id) });
    const original = JSON.parse(decrypted.toString());
    const filename = `fax-${draft.id}.${original.mimeType === 'application/pdf' ? 'pdf' : original.mimeType === 'image/png' ? 'png' : 'jpg'}`;
    const encrypted = await DocumentEncryptionService.encryptBuffer(Buffer.from(original.file, 'base64'), {
      aad: JSON.stringify({ organizationId: Number(payload.organization_id), uploadType: 'referral_packet', filename })
    });
    // Deterministic private object key makes retries safe. Never store an original PHI filename.
    const storagePath = `referrals/${payload.organization_id}/${filename}.enc`;
    const bucket = await StorageService.getGCSBucket();
    uploadedFile = bucket.file(storagePath);
    await uploadedFile.save(encrypted.encryptedBuffer, { contentType: 'application/octet-stream', resumable: false });
    const client = await Client.create({ ...payload, full_name: fields.client_full_name,
      contact_phone: fields.client_phone || null, date_of_birth: fields.date_of_birth || null,
      referral_date: fields.referral_date || payload.referral_date || null
    }, { executor: conn, hydrate: false });
    await conn.execute(`UPDATE clients SET demographics_phi_enc = ?, email = ?, address_street = ?, address_city = ?, address_state = ?, address_zip = ? WHERE id = ?`,
      [JSON.stringify(demographics), fields.client_email || null, fields.address_street || null, fields.address_city || null, fields.address_state || null, fields.address_zip || null, client.id]);
    if (guardianEnc) await conn.execute(`INSERT INTO client_guardian_intake_profiles
      (client_id, profile_encrypted, encryption_iv_b64, encryption_auth_tag_b64, encryption_key_id, source)
      VALUES (?, ?, ?, ?, ?, 'fax_intake')`, [client.id, guardianEnc.ciphertextB64, guardianEnc.ivB64, guardianEnc.authTagB64, guardianEnc.keyId]);
    const [doc] = await conn.execute(`INSERT INTO client_phi_documents
      (client_id, agency_id, school_organization_id, storage_path, original_name, document_title, document_type, mime_type,
       uploaded_by_user_id, is_encrypted, encryption_key_id, encryption_wrapped_key, encryption_iv, encryption_auth_tag, encryption_alg)
      VALUES (?, ?, ?, ?, ?, 'Referral fax', 'referral', ?, ?, TRUE, ?, ?, ?, ?, ?)`,
    [client.id, payload.agency_id, payload.organization_id, storagePath, filename, original.mimeType, userId,
      encrypted.encryptionKeyId, encrypted.encryptionWrappedKeyB64, encrypted.encryptionIvB64, encrypted.encryptionAuthTagB64, encrypted.encryptionAlg]);
    await conn.execute(`INSERT INTO phi_document_audit_logs (document_id, client_id, action, actor_user_id, metadata)
      VALUES (?, ?, 'uploaded', ?, ?)`, [doc.insertId, client.id, userId, JSON.stringify({ source: 'FAX_INTAKE', draftId: draft.id })]);
    await conn.execute(`INSERT INTO client_referral_links (agency_id, client_id, entry_id, direction, referral_date, phi_document_id, created_by_user_id)
      VALUES (?, ?, ?, 'incoming', ?, ?, ?)`, [payload.agency_id, client.id, entryId, fields.referral_date || payload.referral_date || null, doc.insertId, userId]);
    await conn.execute('UPDATE fax_intake_drafts SET client_id = ?, payload_encrypted = NULL, encryption_metadata = NULL WHERE id = ?', [client.id, draft.id]);
    commitAttempted = true;
    await conn.commit();
    committed = true;
    return Client.findById(client.id);
  } catch (error) {
    // Hold the draft row lock until cleanup is finished so a retry cannot race this delete.
    if (!committed && !commitAttempted && uploadedFile) {
      try { await uploadedFile.delete({ ignoreNotFound: true }); } catch { /* Encrypted object remains private; retry overwrites the same key. */ }
    }
    await conn.rollback();
    // Do not propagate SQL/provider errors containing PHI to the global logger.
    if (error.safe) throw error;
    throw fail(commitAttempted ? 'Fax intake save could not be confirmed. Retry to check its saved status.' : 'Fax intake could not be saved. No client was created; retry the review.', 503);
  } finally { conn.release(); }
}

export async function purgeExpiredFaxDrafts() {
  await pool.execute('DELETE FROM fax_intake_drafts WHERE client_id IS NULL AND expires_at <= UTC_TIMESTAMP()');
}
