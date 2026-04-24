import crypto from 'crypto';
import pool from '../config/database.js';
import LearningClassSession from '../models/LearningClassSession.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import StorageService from './storage.service.js';
import {
  buildFilledClassDocumentPdf,
  mapResponseRowToApi,
  normalizeFieldDefinitionsInput,
  normalizeResponseValuesInput
} from './classPresentationDocuments.service.js';

const PDF_BACKED_MATERIAL_TYPES = new Set(['document_template', 'user_document', 'session_pdf']);
const ALLOWED_MATERIAL_TYPES = new Set(['document_template', 'user_document', 'session_pdf', 'activity', 'link', 'video']);

function asInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value, maxLength = 65535) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLength);
}

function cleanNullableText(value, maxLength = 65535) {
  const normalized = cleanText(value, maxLength);
  return normalized || null;
}

function parseJsonObject(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw || fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonArray(raw, fallback = []) {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeWhiteboardPoint(raw = {}) {
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y))
  };
}

function normalizeWhiteboardStroke(raw = {}, index = 0) {
  const points = Array.isArray(raw?.points)
    ? raw.points.map(normalizeWhiteboardPoint).filter(Boolean).slice(0, 600)
    : [];
  if (!points.length) return null;
  return {
    id: cleanText(raw?.id, 64) || `stroke-${index + 1}`,
    color: cleanText(raw?.color, 24) || '#F8FAFC',
    width: Math.min(24, Math.max(1, Number(raw?.width) || 4)),
    points
  };
}

function normalizeWhiteboardData(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const strokes = Array.isArray(source.strokes)
    ? source.strokes.map(normalizeWhiteboardStroke).filter(Boolean).slice(0, 240)
    : [];
  return {
    strokes
  };
}

function normalizeMaterialConfig(raw = {}) {
  const config = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  if (!Array.isArray(config.fieldDefinitions)) config.fieldDefinitions = [];
  if (!Array.isArray(config.blocks)) config.blocks = [];
  if (!Array.isArray(config.quickChecks)) config.quickChecks = [];
  return config;
}

function mapPlanRow(row, fallbackStudent = null) {
  const goals = parseJsonArray(row?.goals_json, []);
  const outline = parseJsonArray(row?.outline_json, []);
  const studentSnapshot = parseJsonObject(row?.student_snapshot_json, fallbackStudent || {});
  const aiContext = parseJsonObject(row?.ai_context_json, {});
  const layoutPrefs = parseJsonObject(row?.layout_prefs_json, {});
  const whiteboardData = normalizeWhiteboardData(parseJsonObject(row?.whiteboard_json, {}));

  return {
    sessionId: asInt(row?.session_id) || null,
    studentClientId: asInt(row?.student_client_id) || asInt(studentSnapshot?.clientId) || fallbackStudent?.clientId || null,
    studentSnapshot: {
      ...(fallbackStudent || {}),
      ...(studentSnapshot || {})
    },
    subjectArea: cleanText(row?.subject_area, 128),
    gradeLabel: cleanText(row?.grade_label, 64),
    focusArea: cleanText(row?.focus_area, 255),
    goals,
    outline,
    tutorNotes: cleanText(row?.tutor_notes),
    aiContext,
    whiteboardData,
    shareWhiteboardWithGuardian: row?.share_whiteboard_with_guardian === 1 || row?.share_whiteboard_with_guardian === true,
    layoutPrefs: {
      leftCollapsed: !!layoutPrefs.leftCollapsed,
      rightCollapsed: !!layoutPrefs.rightCollapsed,
      focusMode: !!layoutPrefs.focusMode,
      activeNav: cleanText(layoutPrefs.activeNav, 32) || 'overview'
    },
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function mapMaterialRow(row) {
  const config = normalizeMaterialConfig(parseJsonObject(row?.config_json, {}));
  return {
    id: asInt(row?.id),
    sessionId: asInt(row?.session_id),
    materialType: cleanText(row?.material_type, 32) || 'activity',
    sourceId: asInt(row?.source_id),
    title: cleanText(row?.title, 255) || 'Untitled material',
    description: cleanText(row?.description),
    positionIndex: Number.isFinite(Number(row?.position_index)) ? Number(row.position_index) : 0,
    storagePath: cleanNullableText(row?.storage_path, 512),
    externalUrl: cleanNullableText(row?.external_url, 1024),
    mimeType: cleanNullableText(row?.mime_type, 128),
    fileSizeBytes: row?.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    config,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function buildStudentSnapshot(row) {
  if (!row) return null;
  return {
    clientId: asInt(row.client_id),
    name: cleanText(row.client_name, 255) || 'Student',
    initials: cleanText(row.client_initials, 8) || 'ST',
    membershipStatus: cleanText(row.membership_status, 32) || 'active'
  };
}

function defaultActivityConfig(title = 'Quick practice') {
  return {
    instructions: 'Use this space to capture the student response and coaching notes during tutoring.',
    blocks: [
      {
        id: 'prompt-1',
        type: 'prompt',
        copy: 'Ask the student to explain their thinking before solving.'
      },
      {
        id: 'response-1',
        type: 'paragraph',
        label: 'Student response',
        model: 'studentResponse',
        placeholder: 'Type what the student said or how they solved the problem.'
      },
      {
        id: 'coach-note-1',
        type: 'paragraph',
        label: 'Tutor coaching note',
        model: 'coachNote',
        placeholder: 'Capture the next move, misconception, or encouragement.'
      }
    ],
    quickChecks: [
      { id: 'accuracy', label: 'Accuracy', scale: 5 },
      { id: 'confidence', label: 'Confidence', scale: 5 }
    ],
    title
  };
}

function summarizeValue(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map((item) => summarizeValue(item)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entryValue]) => `${key}: ${summarizeValue(entryValue)}`)
      .filter((entry) => !entry.endsWith(': '))
      .join('; ');
  }
  return String(value).trim();
}

function summarizeMaterialResponse(material, response) {
  if (!response?.fieldValues || typeof response.fieldValues !== 'object') return '';
  const lines = [];
  for (const [key, value] of Object.entries(response.fieldValues)) {
    const normalized = summarizeValue(value);
    if (!normalized) continue;
    lines.push(`${key}: ${normalized}`);
  }
  if (!lines.length) return '';
  return `${material.title}: ${lines.join(' | ')}`;
}

function buildSessionMaterialKey(sessionId, originalName) {
  const ext = originalName && String(originalName).includes('.') ? `.${String(originalName).split('.').pop()}` : '.pdf';
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const filename = StorageService.sanitizeFilename(`${unique}${ext}`);
  return `learning_session_materials/${sessionId}/${filename}`;
}

async function listStudentCandidatesForSession(session) {
  const classId = asInt(session?.learning_class_id);
  if (!classId) return [];
  const members = await LearningProgramClass.listClientMembers(classId);
  return (members || [])
    .filter((row) => String(row.membership_status || '').toLowerCase() !== 'removed')
    .map(buildStudentSnapshot)
    .filter(Boolean);
}

async function loadPlanRow(sessionId) {
  const sid = asInt(sessionId);
  if (!sid) return null;
  const [rows] = await pool.execute(
    `SELECT *
       FROM learning_class_session_in_person_plans
      WHERE session_id = ?
      LIMIT 1`,
    [sid]
  );
  return rows?.[0] || null;
}

async function loadMaterialRow(sessionId, materialId) {
  const sid = asInt(sessionId);
  const mid = asInt(materialId);
  if (!sid || !mid) return null;
  const [rows] = await pool.execute(
    `SELECT *
       FROM learning_class_session_materials
      WHERE id = ? AND session_id = ?
      LIMIT 1`,
    [mid, sid]
  );
  return rows?.[0] || null;
}

async function listMaterialRows(sessionId) {
  const sid = asInt(sessionId);
  if (!sid) return [];
  const [rows] = await pool.execute(
    `SELECT *
       FROM learning_class_session_materials
      WHERE session_id = ?
      ORDER BY position_index ASC, id ASC`,
    [sid]
  );
  return rows || [];
}

async function listDuplicateCandidates(session) {
  const sessionId = asInt(session?.id);
  const classId = asInt(session?.learning_class_id);
  if (!sessionId || !classId) return [];
  const [rows] = await pool.execute(
    `SELECT id, title, status, starts_at, ends_at, delivery_context
       FROM learning_class_sessions
      WHERE learning_class_id = ?
        AND id <> ?
        AND (session_subtype = 'tutoring' OR mode = 'individual')
      ORDER BY COALESCE(ends_at, starts_at, created_at) DESC
      LIMIT 12`,
    [classId, sessionId]
  );
  return (rows || []).map((row) => ({
    sessionId: asInt(row.id),
    title: cleanText(row.title, 255) || `Tutoring session ${row.id}`,
    status: cleanText(row.status, 32) || 'scheduled',
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    deliveryContext: cleanText(row.delivery_context, 32) || 'virtual'
  }));
}

async function listAvailableTemplatesForSession(session) {
  const agencyId = asInt(session?.organization_id);
  if (!agencyId) return [];
  const templates = await DocumentTemplate.findByAgency(agencyId);
  return (templates || [])
    .filter((template) => String(template.template_type || '').toLowerCase() === 'pdf')
    .map((template) => ({
      id: asInt(template.id),
      name: cleanText(template.name, 255) || 'Untitled template',
      description: cleanText(template.description),
      documentType: cleanText(template.document_type, 64) || 'administrative',
      templateType: cleanText(template.template_type, 32) || 'pdf',
      version: Number(template.version || 1) || 1,
      fieldDefinitions: parseJsonArray(template.field_definitions, []),
      storagePath: cleanNullableText(template.file_path, 512),
      updatedAt: template.updated_at || template.created_at || null
    }));
}

async function inferStudentForSession(session, preferredClientId = null) {
  const roster = await listStudentCandidatesForSession(session);
  const preferredId = asInt(preferredClientId);
  const selected =
    roster.find((item) => item.clientId === preferredId) ||
    roster[0] ||
    null;
  return { student: selected, roster };
}

async function ensureSessionMarkedInPerson(sessionId) {
  const session = await LearningClassSession.findById(sessionId);
  if (!session) return null;
  if (String(session.delivery_context || '').toLowerCase() !== 'in_person') {
    return LearningClassSession.update(sessionId, { deliveryContext: 'in_person' });
  }
  return session;
}

export async function getInPersonPlanPayload({ sessionId }) {
  const session = await ensureSessionMarkedInPerson(sessionId);
  if (!session) return null;

  const [planRow, materialRows, templates, duplicateCandidates] = await Promise.all([
    loadPlanRow(sessionId),
    listMaterialRows(sessionId),
    listAvailableTemplatesForSession(session),
    listDuplicateCandidates(session)
  ]);

  const { student, roster } = await inferStudentForSession(session, planRow?.student_client_id);
  const plan = mapPlanRow(planRow, student);

  return {
    session,
    student,
    studentRoster: roster,
    plan,
    materials: materialRows.map(mapMaterialRow),
    availableTemplates: templates,
    duplicateCandidates
  };
}

export async function upsertInPersonPlan({
  sessionId,
  userId,
  updates = {}
}) {
  const sid = asInt(sessionId);
  const uid = asInt(userId);
  if (!sid) throw new Error('sessionId is required');

  const session = await ensureSessionMarkedInPerson(sid);
  if (!session) throw new Error('Session not found');

  const existingPlanRow = await loadPlanRow(sid);
  const currentPlan = mapPlanRow(existingPlanRow);
  const preferredStudentId = asInt(updates.studentClientId) || currentPlan.studentClientId || null;
  const { student } = await inferStudentForSession(session, preferredStudentId);
  const nextStudentClientId = preferredStudentId || student?.clientId || null;
  const nextStudentSnapshot = {
    ...(currentPlan.studentSnapshot || {}),
    ...(student || {}),
    ...(updates.studentSnapshot && typeof updates.studentSnapshot === 'object' ? updates.studentSnapshot : {})
  };

  const nextSubjectArea = updates.subjectArea !== undefined ? updates.subjectArea : currentPlan.subjectArea;
  const nextGradeLabel = updates.gradeLabel !== undefined ? updates.gradeLabel : currentPlan.gradeLabel;
  const nextFocusArea = updates.focusArea !== undefined ? updates.focusArea : currentPlan.focusArea;
  const nextGoals = Array.isArray(updates.goals) ? updates.goals : currentPlan.goals || [];
  const nextOutline = Array.isArray(updates.outline) ? updates.outline : currentPlan.outline || [];
  const nextTutorNotes = updates.tutorNotes !== undefined ? updates.tutorNotes : currentPlan.tutorNotes;
  const nextAiContext = updates.aiContext && typeof updates.aiContext === 'object'
    ? updates.aiContext
    : currentPlan.aiContext || {};
  const nextLayoutPrefs = updates.layoutPrefs && typeof updates.layoutPrefs === 'object'
    ? { ...(currentPlan.layoutPrefs || {}), ...updates.layoutPrefs }
    : currentPlan.layoutPrefs || {};
  const nextWhiteboardData = updates.whiteboardData !== undefined
    ? normalizeWhiteboardData(updates.whiteboardData)
    : normalizeWhiteboardData(currentPlan.whiteboardData);
  const nextShareWhiteboardWithGuardian = updates.shareWhiteboardWithGuardian !== undefined
    ? !!updates.shareWhiteboardWithGuardian
    : !!currentPlan.shareWhiteboardWithGuardian;

  await pool.execute(
    `INSERT INTO learning_class_session_in_person_plans
       (session_id, student_client_id, student_snapshot_json, subject_area, grade_label, focus_area,
        goals_json, outline_json, tutor_notes, ai_context_json, layout_prefs_json, whiteboard_json, share_whiteboard_with_guardian, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       student_client_id = VALUES(student_client_id),
       student_snapshot_json = VALUES(student_snapshot_json),
       subject_area = VALUES(subject_area),
       grade_label = VALUES(grade_label),
       focus_area = VALUES(focus_area),
       goals_json = VALUES(goals_json),
       outline_json = VALUES(outline_json),
       tutor_notes = VALUES(tutor_notes),
       ai_context_json = VALUES(ai_context_json),
       layout_prefs_json = VALUES(layout_prefs_json),
       whiteboard_json = VALUES(whiteboard_json),
       share_whiteboard_with_guardian = VALUES(share_whiteboard_with_guardian),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [
      sid,
      nextStudentClientId,
      JSON.stringify(nextStudentSnapshot || {}),
      cleanNullableText(nextSubjectArea, 128),
      cleanNullableText(nextGradeLabel, 64),
      cleanNullableText(nextFocusArea, 255),
      JSON.stringify(nextGoals),
      JSON.stringify(nextOutline),
      cleanNullableText(nextTutorNotes),
      JSON.stringify(nextAiContext),
      JSON.stringify(nextLayoutPrefs),
      JSON.stringify(nextWhiteboardData),
      nextShareWhiteboardWithGuardian ? 1 : 0,
      uid,
      uid
    ]
  );

  return getInPersonPlanPayload({ sessionId: sid });
}

export async function duplicateInPersonPlanFromSession({
  sessionId,
  sourceSessionId,
  userId
}) {
  const targetId = asInt(sessionId);
  const sourceId = asInt(sourceSessionId);
  const uid = asInt(userId);
  if (!targetId || !sourceId) throw new Error('sessionId and sourceSessionId are required');

  const [targetSession, sourceSession] = await Promise.all([
    ensureSessionMarkedInPerson(targetId),
    LearningClassSession.findById(sourceId)
  ]);
  if (!targetSession || !sourceSession) throw new Error('Session not found');

  const [sourcePlanRow, sourceMaterials] = await Promise.all([
    loadPlanRow(sourceId),
    listMaterialRows(sourceId)
  ]);

  const sourcePlan = mapPlanRow(sourcePlanRow);
  await upsertInPersonPlan({
    sessionId: targetId,
    userId: uid,
    updates: {
      ...sourcePlan,
      subjectArea: sourcePlan.subjectArea,
      gradeLabel: sourcePlan.gradeLabel,
      focusArea: sourcePlan.focusArea,
      tutorNotes: sourcePlan.tutorNotes,
      goals: sourcePlan.goals,
      outline: sourcePlan.outline,
      aiContext: sourcePlan.aiContext,
      layoutPrefs: sourcePlan.layoutPrefs,
      studentClientId: sourcePlan.studentClientId,
      studentSnapshot: sourcePlan.studentSnapshot
    }
  });

  await pool.execute(`DELETE FROM learning_class_session_materials WHERE session_id = ?`, [targetId]);

  for (const [index, row] of sourceMaterials.entries()) {
    const material = mapMaterialRow(row);
    await pool.execute(
      `INSERT INTO learning_class_session_materials
         (session_id, material_type, source_id, title, description, position_index, storage_path, external_url, mime_type, file_size_bytes, config_json, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetId,
        material.materialType,
        material.sourceId,
        material.title,
        material.description,
        index,
        material.storagePath,
        material.externalUrl,
        material.mimeType,
        material.fileSizeBytes,
        JSON.stringify(material.config || {}),
        uid,
        uid
      ]
    );
  }

  return getInPersonPlanPayload({ sessionId: targetId });
}

async function resolveTemplateSnapshot(templateId) {
  const template = await DocumentTemplate.findById(templateId);
  if (!template) {
    const err = new Error('Document template not found');
    err.status = 404;
    throw err;
  }
  if (String(template.template_type || '').toLowerCase() !== 'pdf' || !template.file_path) {
    const err = new Error('Only PDF templates can be attached to tutoring materials');
    err.status = 400;
    throw err;
  }
  return {
    sourceId: asInt(template.id),
    storagePath: cleanNullableText(template.file_path, 512),
    mimeType: 'application/pdf',
    fileSizeBytes: template.file_size_bytes != null ? Number(template.file_size_bytes) : null,
    title: cleanText(template.name, 255) || 'Template PDF',
    description: cleanText(template.description),
    config: {
      sourceLabel: 'template_library',
      fieldDefinitions: parseJsonArray(template.field_definitions, []),
      templateVersion: Number(template.version || 1) || 1,
      templateName: cleanText(template.name, 255) || 'Template PDF'
    }
  };
}

async function resolveUploadedMaterialSnapshot({ sessionId, file, title, configJson = {}, materialType = 'session_pdf' }) {
  if (!file?.buffer) {
    const err = new Error('PDF upload is required for this material type');
    err.status = 400;
    throw err;
  }
  const key = buildSessionMaterialKey(sessionId, file.originalname || title || 'session-material.pdf');
  await StorageService.writeObject(key, file.buffer, file.mimetype || 'application/pdf', {
    sessionId: String(sessionId),
    materialType
  });

  const providedDefinitions = normalizeFieldDefinitionsInput(configJson.fieldDefinitions);
  return {
    sourceId: null,
    storagePath: key,
    mimeType: file.mimetype || 'application/pdf',
    fileSizeBytes: file.size != null ? Number(file.size) : file.buffer.length,
    title: cleanText(title || file.originalname || 'Session PDF', 255) || 'Session PDF',
    description: null,
    config: {
      ...configJson,
      sourceLabel: materialType === 'user_document' ? 'student_upload' : 'session_upload',
      fieldDefinitions: providedDefinitions
    }
  };
}

export async function createInPersonMaterial({
  sessionId,
  userId,
  material = {},
  file = null
}) {
  const sid = asInt(sessionId);
  const uid = asInt(userId);
  if (!sid) throw new Error('sessionId is required');
  await ensureSessionMarkedInPerson(sid);

  const materialType = ALLOWED_MATERIAL_TYPES.has(String(material.materialType || '').trim())
    ? String(material.materialType).trim()
    : null;
  if (!materialType) {
    const err = new Error('materialType is required');
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.execute(
    `SELECT COALESCE(MAX(position_index), -1) AS max_position
       FROM learning_class_session_materials
      WHERE session_id = ?`,
    [sid]
  );
  const nextIndex = Number.isFinite(Number(rows?.[0]?.max_position))
    ? Number(rows[0].max_position) + 1
    : 0;

  let snapshot = null;
  const configJson = material.config && typeof material.config === 'object' ? { ...material.config } : {};

  if (materialType === 'document_template') {
    snapshot = await resolveTemplateSnapshot(material.sourceId);
  } else if (materialType === 'session_pdf' || materialType === 'user_document') {
    snapshot = await resolveUploadedMaterialSnapshot({
      sessionId: sid,
      file,
      title: material.title,
      configJson,
      materialType
    });
  } else if (materialType === 'activity') {
    snapshot = {
      sourceId: null,
      storagePath: null,
      externalUrl: null,
      mimeType: null,
      fileSizeBytes: null,
      title: cleanText(material.title, 255) || 'Quick activity',
      description: cleanText(material.description),
      config: {
        ...defaultActivityConfig(cleanText(material.title, 255) || 'Quick activity'),
        ...configJson
      }
    };
  } else {
    const externalUrl = cleanNullableText(material.externalUrl, 1024);
    if (!externalUrl) {
      const err = new Error('externalUrl is required for links and videos');
      err.status = 400;
      throw err;
    }
    snapshot = {
      sourceId: null,
      storagePath: null,
      externalUrl,
      mimeType: null,
      fileSizeBytes: null,
      title: cleanText(material.title, 255) || (materialType === 'video' ? 'Video resource' : 'Link resource'),
      description: cleanText(material.description),
      config: { ...configJson }
    };
  }

  const [result] = await pool.execute(
    `INSERT INTO learning_class_session_materials
       (session_id, material_type, source_id, title, description, position_index, storage_path, external_url, mime_type, file_size_bytes, config_json, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sid,
      materialType,
      snapshot.sourceId,
      snapshot.title,
      snapshot.description || cleanNullableText(material.description),
      material.positionIndex != null ? Number(material.positionIndex) : nextIndex,
      snapshot.storagePath,
      snapshot.externalUrl || cleanNullableText(material.externalUrl, 1024),
      snapshot.mimeType,
      snapshot.fileSizeBytes,
      JSON.stringify(snapshot.config || {}),
      uid,
      uid
    ]
  );

  return mapMaterialRow(await loadMaterialRow(sid, result.insertId));
}

export async function updateInPersonMaterial({
  sessionId,
  materialId,
  userId,
  updates = {}
}) {
  const sid = asInt(sessionId);
  const mid = asInt(materialId);
  const uid = asInt(userId);
  const existing = await loadMaterialRow(sid, mid);
  if (!existing) return null;

  const material = mapMaterialRow(existing);
  const nextConfig = normalizeMaterialConfig({
    ...material.config,
    ...(updates.config && typeof updates.config === 'object' ? updates.config : {})
  });
  if (updates.fieldDefinitions !== undefined) {
    nextConfig.fieldDefinitions = normalizeFieldDefinitionsInput(updates.fieldDefinitions);
  }

  const fields = [];
  const values = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(cleanText(updates.title, 255) || material.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(cleanNullableText(updates.description));
  }
  if (updates.positionIndex !== undefined) {
    fields.push('position_index = ?');
    values.push(Number.isFinite(Number(updates.positionIndex)) ? Number(updates.positionIndex) : material.positionIndex);
  }
  if (updates.externalUrl !== undefined) {
    fields.push('external_url = ?');
    values.push(cleanNullableText(updates.externalUrl, 1024));
  }
  if (updates.config !== undefined || updates.fieldDefinitions !== undefined) {
    fields.push('config_json = ?');
    values.push(JSON.stringify(nextConfig));
  }

  if (!fields.length) return material;

  fields.push('updated_by_user_id = ?');
  values.push(uid);
  values.push(mid, sid);

  await pool.execute(
    `UPDATE learning_class_session_materials
        SET ${fields.join(', ')}
      WHERE id = ? AND session_id = ?`,
    values
  );

  return mapMaterialRow(await loadMaterialRow(sid, mid));
}

export async function deleteInPersonMaterial({ sessionId, materialId }) {
  const sid = asInt(sessionId);
  const mid = asInt(materialId);
  const existing = await loadMaterialRow(sid, mid);
  if (!existing) return false;
  const material = mapMaterialRow(existing);

  await pool.execute(`DELETE FROM learning_class_session_material_responses WHERE session_material_id = ?`, [mid]);
  await pool.execute(`DELETE FROM learning_class_session_materials WHERE id = ? AND session_id = ?`, [mid, sid]);

  if ((material.materialType === 'session_pdf' || material.materialType === 'user_document') && material.storagePath) {
    await StorageService.deleteObject(material.storagePath);
  }
  return true;
}

export async function getInPersonMaterialFile({ sessionId, materialId }) {
  const row = await loadMaterialRow(sessionId, materialId);
  if (!row) return null;
  const material = mapMaterialRow(row);
  if (!material.storagePath) return null;
  const buffer = await StorageService.readObject(material.storagePath);
  return {
    material,
    buffer,
    contentType: material.mimeType || 'application/pdf'
  };
}

export async function loadInPersonMaterialResponseRow({ sessionId, materialId, clientId }) {
  const sid = asInt(sessionId);
  const mid = asInt(materialId);
  const cid = asInt(clientId);
  if (!sid || !mid || !cid) return null;
  const [rows] = await pool.execute(
    `SELECT *
       FROM learning_class_session_material_responses
      WHERE session_id = ? AND session_material_id = ? AND client_id = ?
      LIMIT 1`,
    [sid, mid, cid]
  );
  return rows?.[0] || null;
}

export async function getInPersonMaterialResponse({ sessionId, materialId, clientId }) {
  const row = await loadInPersonMaterialResponseRow({ sessionId, materialId, clientId });
  if (!row) {
    return {
      fieldValues: {},
      status: 'draft',
      completedAt: null,
      lastSavedAt: null
    };
  }
  return mapResponseRowToApi({
    id: row.id,
    company_event_id: row.session_id,
    program_document_id: row.session_material_id,
    participant_user_id: row.client_id,
    response_values: row.response_values,
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    last_saved_at: row.last_saved_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  });
}

export async function upsertInPersonMaterialResponse({
  sessionId,
  materialId,
  clientId,
  responseValues,
  status = 'draft'
}) {
  const sid = asInt(sessionId);
  const mid = asInt(materialId);
  const cid = asInt(clientId);
  if (!sid || !mid || !cid) throw new Error('sessionId, materialId, and clientId are required');

  const safeValues = normalizeResponseValuesInput(responseValues);
  const safeStatus = String(status || 'draft').trim().toLowerCase() === 'completed' ? 'completed' : 'draft';
  const serialized = JSON.stringify(safeValues || {});
  const existing = await loadInPersonMaterialResponseRow({ sessionId: sid, materialId: mid, clientId: cid });

  if (existing?.id) {
    await pool.execute(
      `UPDATE learning_class_session_material_responses
          SET response_values = ?,
              status = ?,
              completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
              last_saved_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [serialized, safeStatus, safeStatus, existing.id]
    );
  } else {
    await pool.execute(
      `INSERT INTO learning_class_session_material_responses
         (session_id, session_material_id, client_id, response_values, status, started_at, completed_at, last_saved_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)`,
      [sid, mid, cid, serialized, safeStatus, safeStatus]
    );
  }

  return getInPersonMaterialResponse({ sessionId: sid, materialId: mid, clientId: cid });
}

export async function buildInPersonMaterialDownload({
  sessionId,
  materialId,
  clientId
}) {
  const [materialRow, response] = await Promise.all([
    loadMaterialRow(sessionId, materialId),
    getInPersonMaterialResponse({ sessionId, materialId, clientId })
  ]);
  if (!materialRow) return null;
  const material = mapMaterialRow(materialRow);
  if (!material.storagePath || !PDF_BACKED_MATERIAL_TYPES.has(material.materialType)) {
    const err = new Error('This material does not have a downloadable PDF copy');
    err.status = 400;
    throw err;
  }

  const fieldDefinitions = Array.isArray(material.config?.fieldDefinitions) ? material.config.fieldDefinitions : [];
  const pdfBytes = await buildFilledClassDocumentPdf({
    storagePath: material.storagePath,
    fieldDefinitions,
    responseValues: response?.fieldValues || {}
  });

  return {
    material,
    pdfBytes
  };
}

export async function buildInPersonTranscriptSummaryText(sessionId) {
  const payload = await getInPersonPlanPayload({ sessionId });
  if (!payload) return '';
  const { session, student, plan, materials } = payload;

  const responseLines = [];
  if (student?.clientId) {
    for (const material of materials) {
      const response = await getInPersonMaterialResponse({
        sessionId,
        materialId: material.id,
        clientId: student.clientId
      });
      const line = summarizeMaterialResponse(material, response);
      if (line) responseLines.push(line);
    }
  }

  return [
    `In-person tutoring session summary`,
    `Session title: ${cleanText(session.title, 255) || `Session ${session.id}`}`,
    `Student: ${student?.name || plan.studentSnapshot?.name || 'Unknown student'}`,
    `Subject area: ${plan.subjectArea || 'Unspecified'}`,
    `Grade: ${plan.gradeLabel || 'Unspecified'}`,
    `Focus area: ${plan.focusArea || 'Unspecified'}`,
    `Goals: ${(plan.goals || []).map((goal) => cleanText(goal, 255)).filter(Boolean).join('; ') || 'No goals captured'}`,
    `Outline: ${(plan.outline || []).map((item) => cleanText(item, 255)).filter(Boolean).join('; ') || 'No outline captured'}`,
    `Tutor notes: ${plan.tutorNotes || 'No tutor notes captured.'}`,
    responseLines.length ? `Student work: ${responseLines.join(' || ')}` : 'Student work: No saved responses.'
  ].join('\n');
}
