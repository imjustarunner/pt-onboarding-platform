import pool from '../config/database.js';
import { SUPERVISION_PRESENTATION_TEMPLATE } from '../constants/supervisionPresentationTemplate.js';

function asInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizePresentation(row) {
  if (!row) return null;
  return {
    ...row,
    case_summary_json: parseJson(row.case_summary_json, {}),
    caseSummary: parseJson(row.case_summary_json, {})
  };
}

class SupervisionCasePresentation {
  static async findById(id) {
    const pid = asInt(id);
    if (!pid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM supervision_case_presentations WHERE id = ? LIMIT 1`,
      [pid]
    );
    return normalizePresentation(rows?.[0] || null);
  }

  static async findBySessionAndPresenter({ sessionId, presenterUserId }) {
    const sid = asInt(sessionId);
    const uid = asInt(presenterUserId);
    if (!sid || !uid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM supervision_case_presentations
       WHERE session_id = ? AND presenter_user_id = ?
       LIMIT 1`,
      [sid, uid]
    );
    return normalizePresentation(rows?.[0] || null);
  }

  static async listForSession(sessionId) {
    const sid = asInt(sessionId);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT p.*,
              CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS presenter_name,
              u.email AS presenter_email
       FROM supervision_case_presentations p
       JOIN users u ON u.id = p.presenter_user_id
       WHERE p.session_id = ?
       ORDER BY p.id ASC`,
      [sid]
    );
    return (rows || []).map(normalizePresentation);
  }

  static async create({
    sessionId,
    presenterUserId,
    sourceType = 'templated',
    createdByUserId = null,
    seedTemplate = true
  }) {
    const sid = asInt(sessionId);
    const uid = asInt(presenterUserId);
    if (!sid || !uid) throw new Error('sessionId and presenterUserId are required');

    const existing = await this.findBySessionAndPresenter({ sessionId: sid, presenterUserId: uid });
    if (existing) {
      if (seedTemplate) {
        const slides = await this.listSlides(existing.id);
        if (!slides.length) await this.seedTemplateSlides(existing.id, createdByUserId);
      }
      return existing;
    }

    const [result] = await pool.execute(
      `INSERT INTO supervision_case_presentations
         (session_id, presenter_user_id, source_type, status, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, 'draft', ?, ?)`,
      [sid, uid, String(sourceType || 'templated'), createdByUserId || null, createdByUserId || null]
    );
    const presentation = await this.findById(result.insertId);
    if (seedTemplate && presentation) {
      await this.seedTemplateSlides(presentation.id, createdByUserId);
    }
    return presentation;
  }

  static async ensureForPresenters({ sessionId, presenterUserIds = [], createdByUserId = null }) {
    const sid = asInt(sessionId);
    const ids = Array.from(new Set((presenterUserIds || []).map(asInt).filter(Boolean)));
    if (!sid || !ids.length) return [];
    const out = [];
    for (const uid of ids) {
      // eslint-disable-next-line no-await-in-loop
      out.push(await this.create({
        sessionId: sid,
        presenterUserId: uid,
        createdByUserId,
        seedTemplate: true
      }));
    }
    return out;
  }

  static async seedTemplateSlides(presentationId, createdByUserId = null) {
    const pid = asInt(presentationId);
    if (!pid) return [];
    const existing = await this.listSlides(pid);
    if (existing.length) return existing;

    const values = [];
    const placeholders = SUPERVISION_PRESENTATION_TEMPLATE.map((section, idx) => {
      values.push(
        pid,
        idx,
        section.sectionKey,
        section.title,
        '',
        '',
        'text',
        null,
        createdByUserId || null
      );
      return '(?, ?, ?, ?, ?, ?, ?, ?, ?)';
    });

    await pool.execute(
      `INSERT INTO supervision_presentation_slides
         (presentation_id, slide_order, section_key, title, body_html, presenter_notes, layout, background, created_by_user_id)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    return this.listSlides(pid);
  }

  static async updatePresentation(id, {
    sourceType,
    externalUrl,
    storagePath,
    mimeType,
    originalFilename,
    status,
    caseSummary,
    updatedByUserId
  } = {}) {
    const pid = asInt(id);
    if (!pid) return null;
    const updates = [];
    const values = [];
    if (sourceType !== undefined) {
      updates.push('source_type = ?');
      values.push(String(sourceType || 'templated'));
    }
    if (externalUrl !== undefined) {
      updates.push('external_url = ?');
      values.push(externalUrl ? String(externalUrl).slice(0, 2048) : null);
    }
    if (storagePath !== undefined) {
      updates.push('storage_path = ?');
      values.push(storagePath ? String(storagePath).slice(0, 1024) : null);
    }
    if (mimeType !== undefined) {
      updates.push('mime_type = ?');
      values.push(mimeType ? String(mimeType).slice(0, 191) : null);
    }
    if (originalFilename !== undefined) {
      updates.push('original_filename = ?');
      values.push(originalFilename ? String(originalFilename).slice(0, 255) : null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(String(status || 'draft'));
    }
    if (caseSummary !== undefined) {
      updates.push('case_summary_json = ?');
      values.push(caseSummary ? JSON.stringify(caseSummary) : null);
    }
    if (updatedByUserId !== undefined) {
      updates.push('updated_by_user_id = ?');
      values.push(updatedByUserId || null);
    }
    if (!updates.length) return this.findById(pid);
    values.push(pid);
    await pool.execute(
      `UPDATE supervision_case_presentations SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(pid);
  }

  static async listSlides(presentationId) {
    const pid = asInt(presentationId);
    if (!pid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM supervision_presentation_slides
       WHERE presentation_id = ? AND is_active = 1
       ORDER BY slide_order ASC, id ASC`,
      [pid]
    );
    return rows || [];
  }

  static async getSlideById(slideId) {
    const id = asInt(slideId);
    if (!id) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM supervision_presentation_slides WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async createSlide({
    presentationId,
    title = 'New slide',
    sectionKey = null,
    bodyHtml = '',
    presenterNotes = '',
    layout = 'text',
    background = null,
    mediaUrl = null,
    slideOrder = null,
    createdByUserId = null
  }) {
    const pid = asInt(presentationId);
    if (!pid) throw new Error('presentationId is required');
    let order = slideOrder;
    if (order == null) {
      const [rows] = await pool.execute(
        `SELECT COALESCE(MAX(slide_order), -1) + 1 AS next_order
         FROM supervision_presentation_slides WHERE presentation_id = ?`,
        [pid]
      );
      order = Number(rows?.[0]?.next_order || 0);
    }
    const [result] = await pool.execute(
      `INSERT INTO supervision_presentation_slides
         (presentation_id, slide_order, section_key, title, body_html, presenter_notes, layout, background, media_url, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pid,
        order,
        sectionKey,
        title,
        bodyHtml,
        presenterNotes,
        layout || 'text',
        background,
        mediaUrl,
        createdByUserId || null
      ]
    );
    return this.getSlideById(result.insertId);
  }

  static async updateSlide(slideId, fields = {}) {
    const id = asInt(slideId);
    if (!id) return null;
    const map = {
      title: 'title',
      sectionKey: 'section_key',
      bodyHtml: 'body_html',
      presenterNotes: 'presenter_notes',
      layout: 'layout',
      background: 'background',
      mediaUrl: 'media_url',
      slideOrder: 'slide_order',
      isActive: 'is_active'
    };
    const updates = [];
    const values = [];
    for (const [key, col] of Object.entries(map)) {
      if (fields[key] === undefined) continue;
      updates.push(`${col} = ?`);
      if (key === 'isActive') values.push(fields[key] ? 1 : 0);
      else values.push(fields[key]);
    }
    if (!updates.length) return this.getSlideById(id);
    values.push(id);
    await pool.execute(
      `UPDATE supervision_presentation_slides SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.getSlideById(id);
  }

  static async deleteSlide(slideId) {
    const id = asInt(slideId);
    if (!id) return false;
    await pool.execute(
      `UPDATE supervision_presentation_slides SET is_active = 0 WHERE id = ?`,
      [id]
    );
    return true;
  }

  static async reorderSlides(presentationId, orderedSlideIds = []) {
    const pid = asInt(presentationId);
    const ids = (orderedSlideIds || []).map(asInt).filter(Boolean);
    if (!pid || !ids.length) return this.listSlides(pid);
    for (let i = 0; i < ids.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `UPDATE supervision_presentation_slides
         SET slide_order = ?
         WHERE id = ? AND presentation_id = ?`,
        [i, ids[i], pid]
      );
    }
    return this.listSlides(pid);
  }

  static async getState(sessionId) {
    const sid = asInt(sessionId);
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM supervision_presentation_state WHERE session_id = ? LIMIT 1`,
      [sid]
    );
    return rows?.[0] || null;
  }

  static async upsertState({
    sessionId,
    activePresentationId = null,
    currentSlideId = null,
    currentSlideOrder = 0,
    updatedByUserId = null
  }) {
    const sid = asInt(sessionId);
    if (!sid) return null;
    await pool.execute(
      `INSERT INTO supervision_presentation_state
         (session_id, active_presentation_id, current_slide_id, current_slide_order, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         active_presentation_id = VALUES(active_presentation_id),
         current_slide_id = VALUES(current_slide_id),
         current_slide_order = VALUES(current_slide_order),
         updated_by_user_id = VALUES(updated_by_user_id)`,
      [
        sid,
        activePresentationId ? asInt(activePresentationId) : null,
        currentSlideId ? asInt(currentSlideId) : null,
        Number(currentSlideOrder) || 0,
        updatedByUserId || null
      ]
    );
    return this.getState(sid);
  }
}

export default SupervisionCasePresentation;
