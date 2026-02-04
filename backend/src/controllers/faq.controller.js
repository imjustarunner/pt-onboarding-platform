import pool from '../config/database.js';
import User from '../models/User.model.js';
import { callGeminiText } from '../services/geminiText.service.js';

const roleCanManageFaq = (req) => {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff';
};

async function ensureAgencyAccess(req, agencyId) {
  const aid = parseInt(agencyId, 10);
  if (!aid) return { ok: false, status: 400, message: 'Invalid agencyId' };
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return { ok: true, agencyId: aid };
  const orgs = await User.getAgencies(req.user.id);
  const ok = (orgs || []).some((o) => parseInt(o.id, 10) === aid);
  if (!ok) return { ok: false, status: 403, message: 'Access denied' };
  return { ok: true, agencyId: aid };
}

async function hasFaqTable() {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_portal_faqs'"
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function maybeGenerateGeminiSummary({ question, answer }) {
  const prompt = [
    'Summarize the following FAQ into a single short paragraph (1-3 sentences).',
    'Do NOT include any client identifiers, initials, or PHI.',
    '',
    'Question:',
    String(question || '').trim(),
    '',
    'Answer:',
    String(answer || '').trim()
  ].join('\n');

  try {
    const { text } = await callGeminiText({ prompt, temperature: 0.2, maxOutputTokens: 400 });
    const cleaned = String(text || '').trim();
    return cleaned ? cleaned.slice(0, 900) : null;
  } catch {
    return null;
  }
}

export const listFaqs = async (req, res, next) => {
  try {
    if (!roleCanManageFaq(req)) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!(await hasFaqTable())) return res.json([]);

    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : '';
    const where = ['agency_id = ?'];
    const params = [agencyId];
    if (status) {
      where.push('LOWER(status) = ?');
      params.push(status);
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM school_portal_faqs
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(subject, '') ASC, id DESC`,
      params
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const createFaq = async (req, res, next) => {
  try {
    if (!roleCanManageFaq(req)) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!(await hasFaqTable())) return res.status(409).json({ error: { message: 'FAQ is not enabled (missing migration)' } });

    const agencyId = parseInt(req.body?.agencyId, 10);
    const subject = req.body?.subject ? String(req.body.subject).trim().slice(0, 120) : null;
    const question = String(req.body?.question || '').trim();
    const answer = String(req.body?.answer || '').trim();
    const status = req.body?.status ? String(req.body.status).trim().toLowerCase() : 'pending';
    if (!agencyId || !question || !answer) {
      return res.status(400).json({ error: { message: 'agencyId, question, and answer are required' } });
    }
    if (!['pending', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be pending, published, or archived' } });
    }

    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const aiSummary = status === 'published' ? await maybeGenerateGeminiSummary({ question, answer }) : null;

    const [result] = await pool.execute(
      `INSERT INTO school_portal_faqs
        (agency_id, subject, question, answer, status, ai_summary, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, subject, question, answer, status, aiSummary, req.user.id, req.user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM school_portal_faqs WHERE id = ?', [result.insertId]);
    res.status(201).json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const updateFaq = async (req, res, next) => {
  try {
    if (!roleCanManageFaq(req)) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!(await hasFaqTable())) return res.status(409).json({ error: { message: 'FAQ is not enabled (missing migration)' } });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid FAQ id' } });

    const [rows] = await pool.execute('SELECT * FROM school_portal_faqs WHERE id = ? LIMIT 1', [id]);
    const existing = rows?.[0] || null;
    if (!existing) return res.status(404).json({ error: { message: 'FAQ not found' } });

    const access = await ensureAgencyAccess(req, existing.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const subject = req.body?.subject !== undefined ? String(req.body.subject || '').trim().slice(0, 120) : undefined;
    const question = req.body?.question !== undefined ? String(req.body.question || '').trim() : undefined;
    const answer = req.body?.answer !== undefined ? String(req.body.answer || '').trim() : undefined;
    const status = req.body?.status !== undefined ? String(req.body.status || '').trim().toLowerCase() : undefined;
    if (status !== undefined && !['pending', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be pending, published, or archived' } });
    }

    const updates = [];
    const values = [];
    if (subject !== undefined) {
      updates.push('subject = ?');
      values.push(subject || null);
    }
    if (question !== undefined) {
      if (!question) return res.status(400).json({ error: { message: 'question cannot be empty' } });
      updates.push('question = ?');
      values.push(question);
    }
    if (answer !== undefined) {
      if (!answer) return res.status(400).json({ error: { message: 'answer cannot be empty' } });
      updates.push('answer = ?');
      values.push(answer);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    // If publishing (or already published), refresh AI summary best-effort when question/answer changed.
    const nextStatus = status !== undefined ? status : String(existing.status || '').toLowerCase();
    const nextQuestion = question !== undefined ? question : String(existing.question || '');
    const nextAnswer = answer !== undefined ? answer : String(existing.answer || '');
    if (nextStatus === 'published' && (question !== undefined || answer !== undefined || status !== undefined)) {
      const aiSummary = await maybeGenerateGeminiSummary({ question: nextQuestion, answer: nextAnswer });
      updates.push('ai_summary = ?');
      values.push(aiSummary);
    }

    updates.push('updated_by_user_id = ?');
    values.push(req.user.id);

    if (updates.length === 1) {
      const [out] = await pool.execute('SELECT * FROM school_portal_faqs WHERE id = ?', [id]);
      return res.json(out?.[0] || null);
    }

    values.push(id);
    await pool.execute(`UPDATE school_portal_faqs SET ${updates.join(', ')} WHERE id = ?`, values);
    const [out] = await pool.execute('SELECT * FROM school_portal_faqs WHERE id = ?', [id]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const createFaqFromTicket = async (req, res, next) => {
  try {
    if (!roleCanManageFaq(req)) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!(await hasFaqTable())) return res.status(409).json({ error: { message: 'FAQ is not enabled (missing migration)' } });

    const ticketId = parseInt(req.body?.ticketId, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'ticketId is required' } });

    const [tRows] = await pool.execute('SELECT * FROM support_tickets WHERE id = ? LIMIT 1', [ticketId]);
    const t = tRows?.[0] || null;
    if (!t) return res.status(404).json({ error: { message: 'Ticket not found' } });
    if (!t.agency_id) return res.status(409).json({ error: { message: 'Ticket is not associated to an agency' } });
    if (!String(t.answer || '').trim()) return res.status(409).json({ error: { message: 'Ticket must have an answer before converting to FAQ' } });

    const access = await ensureAgencyAccess(req, t.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const subject = t.subject ? String(t.subject).trim().slice(0, 120) : 'General';
    const question = String(t.question || '').trim();
    const answer = String(t.answer || '').trim();

    const [result] = await pool.execute(
      `INSERT INTO school_portal_faqs
        (agency_id, subject, question, answer, status, ai_summary, source_support_ticket_id, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, ?)`,
      [parseInt(t.agency_id, 10), subject, question, answer, ticketId, req.user.id, req.user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM school_portal_faqs WHERE id = ?', [result.insertId]);
    res.status(201).json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

