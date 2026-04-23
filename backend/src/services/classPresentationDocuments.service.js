import pool from '../config/database.js';
import StorageService from './storage.service.js';
import { PDFDocument } from 'pdf-lib';
import DocumentSigningService from './documentSigning.service.js';

export function parseJsonObject(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw || fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonArray(raw, fallback = []) {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeFieldDefinitionsInput(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return [];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed)) {
    const err = new Error('fieldDefinitions must be an array');
    err.status = 400;
    throw err;
  }
  return parsed;
}

export function normalizeResponseValuesInput(raw) {
  if (raw === undefined) return {};
  if (raw === null || raw === '') return {};
  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const err = new Error('responseValues must be an object');
      err.status = 400;
      throw err;
    }
    return parsed;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('responseValues must be an object');
    err.status = 400;
    throw err;
  }
  return raw;
}

export function mapProgramDocumentRowToApi(row, { includeFieldDefinitions = true } = {}) {
  const filename = String(row?.original_filename || '').trim() || 'document.pdf';
  const displayTitle =
    row?.display_title != null && String(row.display_title).trim()
      ? String(row.display_title).trim().slice(0, 255)
      : null;
  const fieldDefinitions = parseJsonArray(row?.field_definitions, []);
  const apiRow = {
    id: Number(row.id),
    originalFilename: filename,
    displayTitle,
    displayLabel: displayTitle || filename,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    createdAt: row.created_at || null,
    mimeType: row.mime_type || 'application/pdf',
    hasFieldDefinitions: fieldDefinitions.length > 0,
    fieldCount: fieldDefinitions.length
  };
  if (includeFieldDefinitions) {
    apiRow.fieldDefinitions = fieldDefinitions;
  }
  return apiRow;
}

export async function loadClassDocumentResponseRow({ eventId, documentId, participantUserId }) {
  const eid = Number(eventId);
  const did = Number(documentId);
  const uid = Number(participantUserId);
  if (!Number.isFinite(eid) || eid <= 0) return null;
  if (!Number.isFinite(did) || did <= 0) return null;
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const [rows] = await pool.execute(
    `SELECT *
       FROM skill_builders_class_document_responses
      WHERE company_event_id = ? AND program_document_id = ? AND participant_user_id = ?
      LIMIT 1`,
    [eid, did, uid]
  );
  return rows?.[0] || null;
}

export function mapResponseRowToApi(row) {
  if (!row) {
    return {
      fieldValues: {},
      status: 'draft',
      completedAt: null,
      lastSavedAt: null
    };
  }
  return {
    id: Number(row.id),
    eventId: Number(row.company_event_id),
    documentId: Number(row.program_document_id),
    participantUserId: Number(row.participant_user_id),
    fieldValues: parseJsonObject(row.response_values, {}),
    status: String(row.status || 'draft').trim() || 'draft',
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    lastSavedAt: row.last_saved_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export async function upsertClassDocumentResponse({
  eventId,
  documentId,
  participantUserId,
  responseValues,
  status = 'draft'
}) {
  const eid = Number(eventId);
  const did = Number(documentId);
  const uid = Number(participantUserId);
  const safeStatus = String(status || 'draft').trim().toLowerCase() === 'completed' ? 'completed' : 'draft';
  const serialized = JSON.stringify(responseValues || {});
  const existing = await loadClassDocumentResponseRow({
    eventId: eid,
    documentId: did,
    participantUserId: uid
  });

  if (existing?.id) {
    await pool.execute(
      `UPDATE skill_builders_class_document_responses
          SET response_values = ?,
              status = ?,
              started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
              completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
              last_saved_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [serialized, safeStatus, safeStatus, existing.id]
    );
  } else {
    await pool.execute(
      `INSERT INTO skill_builders_class_document_responses
         (company_event_id, program_document_id, participant_user_id, response_values, status, started_at, completed_at, last_saved_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)`,
      [eid, did, uid, serialized, safeStatus, safeStatus]
    );
  }

  return await loadClassDocumentResponseRow({
    eventId: eid,
    documentId: did,
    participantUserId: uid
  });
}

export async function buildFilledClassDocumentPdf({ storagePath, fieldDefinitions, responseValues }) {
  const sourceBuffer = await StorageService.readObject(storagePath);
  const pdfDoc = await PDFDocument.load(sourceBuffer);
  await DocumentSigningService.addFieldValuesToPDF(
    pdfDoc,
    Array.isArray(fieldDefinitions) ? fieldDefinitions : [],
    responseValues && typeof responseValues === 'object' ? responseValues : {}
  );
  return await pdfDoc.save();
}
