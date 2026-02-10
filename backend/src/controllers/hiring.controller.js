import pool from '../config/database.js';
import User from '../models/User.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import HiringNote from '../models/HiringNote.model.js';
import HiringResearchReport from '../models/HiringResearchReport.model.js';
import HiringResumeParse from '../models/HiringResumeParse.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import StorageService from '../services/storage.service.js';
import {
  generatePreScreenReportWithGeminiApiKey,
  generatePreScreenReportWithGoogleSearch,
  generatePreScreenReportWithVertexNoSearch
} from '../services/preScreenResearch.service.js';
import { extractResumeTextFromUpload } from '../services/resumeTextExtraction.service.js';
import { generateResumeSummaryJson } from '../services/resumeStructuring.service.js';
import { extractResumePhotoPngFromPdf } from '../services/resumePhotoExtraction.service.js';
import config from '../config/config.js';

function parseIntParam(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function ensureAgencyAccess(req, agencyId) {
  if (!agencyId) {
    const err = new Error('Agency ID required');
    err.status = 400;
    throw err;
  }
  if (req.user?.role === 'super_admin') return true;

  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('You do not have access to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function ensureCandidateInAgency(candidateUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM user_agencies
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [candidateUserId, agencyId]
  );
  return rows.length > 0;
}

function parseMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }
  return null;
}

export const listCandidates = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const status = req.query.status ? String(req.query.status).trim() : 'PROSPECTIVE';
    const statusNorm = String(status || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);

    // IMPORTANT:
    // - Primary intent is "prospective applicants".
    // - Some DBs may not yet support users.status='PROSPECTIVE' (enum not migrated),
    //   and our User.create() will normalize to a fallback status.
    // To prevent "created then disappeared" behavior, we include any record that has a
    // hiring_profile and is not marked hired, when the caller asks for PROSPECTIVE.
    const params = [agencyId];
    let whereSql = '';
    if (statusNorm === 'PROSPECTIVE') {
      whereSql = `
        WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
          AND (
          u.status = 'PROSPECTIVE'
          OR (
            hp.candidate_user_id IS NOT NULL
            AND LOWER(COALESCE(hp.stage, 'applied')) != 'hired'
          )
        )
      `;
    } else {
      whereSql = `WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL)) AND u.status = ?`;
      params.push(status);
    }

    if (q) {
      whereSql += ` AND (
        u.first_name LIKE ?
        OR u.last_name LIKE ?
        OR u.email LIKE ?
        OR u.personal_email LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const [rows] = await pool.execute(
      `SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.personal_email,
        u.phone_number,
        u.role,
        u.status,
        hp.stage,
        hp.applied_role,
        hp.source,
        hp.created_at AS hiring_created_at,
        hp.updated_at AS hiring_updated_at
      FROM users u
      JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      LEFT JOIN hiring_profiles hp ON hp.candidate_user_id = u.id
      ${whereSql}
      -- Note: users table does not consistently have updated_at; prefer created_at for stable ordering.
      ORDER BY COALESCE(hp.updated_at, hp.created_at, u.created_at) DESC, u.id DESC
      LIMIT ${limit}`,
      params
    );

    res.json(rows || []);
  } catch (e) {
    // Common deployment issue: DB migrations not run yet for hiring tables.
    if (e?.code === 'ER_NO_SUCH_TABLE' || String(e?.message || '').includes('hiring_profiles')) {
      return res.status(503).json({
        error: {
          message:
            'Hiring feature not available (database migrations not run yet). Run migrations 268-271 (and 270 for hiring tables).'
        }
      });
    }
    next(e);
  }
};

export const createCandidate = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const firstName = String(req.body?.firstName || '').trim() || null;
    const lastName = String(req.body?.lastName || '').trim();
    const personalEmail = String(req.body?.personalEmail || req.body?.email || '').trim();
    const phoneNumber = req.body?.phoneNumber !== undefined ? String(req.body.phoneNumber || '').trim() : null;
    const appliedRole = req.body?.appliedRole !== undefined ? String(req.body.appliedRole || '').trim() : null;
    const source = req.body?.source !== undefined ? String(req.body.source || '').trim() : null;
    const stage = req.body?.stage !== undefined ? String(req.body.stage || '').trim() : 'applied';
    const role = req.body?.role ? String(req.body.role).trim() : 'provider';
    const jobDescriptionId = req.body?.jobDescriptionId !== undefined && req.body?.jobDescriptionId !== null && req.body?.jobDescriptionId !== ''
      ? parseIntParam(req.body.jobDescriptionId)
      : null;
    const coverLetterText = req.body?.coverLetterText !== undefined
      ? String(req.body.coverLetterText || '').trim().slice(0, 20000) || null
      : null;

    if (!lastName) return res.status(400).json({ error: { message: 'Last name is required' } });
    if (!personalEmail) return res.status(400).json({ error: { message: 'personalEmail is required' } });

    if (jobDescriptionId) {
      const jd = await HiringJobDescription.findById(jobDescriptionId);
      if (!jd || Number(jd.agency_id) !== Number(agencyId) || Number(jd.is_active) !== 1) {
        return res.status(400).json({ error: { message: 'Invalid jobDescriptionId for this agency' } });
      }
    }

    // Create candidate user record (internal-only stage).
    const user = await User.create({
      email: personalEmail,
      passwordHash: null,
      firstName,
      lastName,
      phoneNumber,
      personalEmail,
      role,
      status: 'PROSPECTIVE'
    });

    // Associate candidate to the agency for access scoping.
    await User.assignToAgency(user.id, agencyId);

    const profile = await HiringProfile.upsert({
      candidateUserId: user.id,
      stage,
      appliedRole: appliedRole || null,
      source: source || null,
      jobDescriptionId: jobDescriptionId || null,
      coverLetterText: coverLetterText || null
    });

    res.status(201).json({
      user,
      profile
    });
  } catch (e) {
    next(e);
  }
};

export const getCandidate = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    const notes = await HiringNote.listByCandidateUserId(candidateUserId, { limit: 200 });
    const latestResearch = await HiringResearchReport.findLatestByCandidateUserId(candidateUserId);
    const latestPreScreen = await HiringResearchReport.findLatestAiByCandidateUserId(candidateUserId);

    let jobDescription = null;
    if (profile?.job_description_id) {
      const jd = await HiringJobDescription.findById(profile.job_description_id);
      if (jd && Number(jd.agency_id) === Number(agencyId)) jobDescription = jd;
    }

    res.json({ user, profile, jobDescription, notes, latestResearch, latestPreScreen });
  } catch (e) {
    next(e);
  }
};

export const listJobDescriptions = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const includeInactive = String(req.query.includeInactive || '').trim() === '1';
    const rows = await HiringJobDescription.listByAgencyId(agencyId, { includeInactive, limit: 500 });
    res.json(
      (rows || []).map((r) => ({
        id: r.id,
        agencyId: r.agency_id,
        title: r.title,
        descriptionText: r.description_text || null,
        hasFile: !!r.storage_path,
        originalName: r.original_name || null,
        mimeType: r.mime_type || null,
        isActive: r.is_active === 1 || r.is_active === true,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    );
  } catch (e) {
    next(e);
  }
};

export const createJobDescription = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const title = String(req.body?.title || '').trim().slice(0, 255);
    const descriptionTextRaw = req.body?.descriptionText !== undefined ? String(req.body.descriptionText || '') : '';
    let descriptionText = descriptionTextRaw.trim();

    if (!title) return res.status(400).json({ error: { message: 'title is required' } });

    let storagePath = null;
    let originalName = null;
    let mimeType = null;

    if (req.file) {
      const fileBuffer = req.file.buffer;
      originalName = req.file.originalname || 'job-description';
      mimeType = req.file.mimetype || 'application/octet-stream';

      // If the upload is plain text and no description was provided, use its content.
      if (!descriptionText && mimeType === 'text/plain') {
        try {
          descriptionText = String(fileBuffer.toString('utf8') || '').trim().slice(0, 60000);
        } catch {
          // ignore
        }
      }

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
      const filename = `job-desc-${agencyId}-${uniqueSuffix}${safeExt}`;
      const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);
      storagePath = storageResult.relativePath;
    }

    const created = await HiringJobDescription.create({
      agencyId,
      title,
      descriptionText: descriptionText || null,
      storagePath,
      originalName,
      mimeType,
      createdByUserId: req.user.id,
      isActive: true
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const viewJobDescriptionFile = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const jdId = parseIntParam(req.params.jobDescriptionId);
    if (!jdId) return res.status(400).json({ error: { message: 'Invalid jobDescriptionId' } });

    const jd = await HiringJobDescription.findById(jdId);
    if (!jd || Number(jd.agency_id) !== Number(agencyId)) {
      return res.status(404).json({ error: { message: 'Job description not found' } });
    }
    if (!jd.storage_path) {
      return res.status(404).json({ error: { message: 'No file uploaded for this job description' } });
    }

    const url = await StorageService.getSignedUrl(jd.storage_path, 10);
    res.json({
      url,
      expiresInMinutes: 10,
      originalName: jd.original_name || null,
      mimeType: jd.mime_type || null
    });
  } catch (e) {
    next(e);
  }
};

export const createCandidateNote = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });

    const ratingRaw = req.body?.rating;
    const rating = ratingRaw === null || ratingRaw === undefined || ratingRaw === ''
      ? null
      : parseInt(ratingRaw, 10);

    const note = await HiringNote.create({
      candidateUserId,
      authorUserId: req.user.id,
      message,
      rating: Number.isFinite(rating) ? rating : null
    });

    res.status(201).json(note);
  } catch (e) {
    next(e);
  }
};

export const requestCandidateResearch = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    // Placeholder: future agent/automation will fill this in.
    const report = await HiringResearchReport.create({
      candidateUserId,
      status: 'pending',
      reportText: `Research requested by user ${req.user.id} at ${new Date().toISOString()}.`,
      reportJson: null,
      createdByUserId: req.user.id
    });

    res.status(201).json(report);
  } catch (e) {
    next(e);
  }
};

async function createFailedAiReport({ candidateUserId, createdByUserId, error }) {
  const safeMessage = String(error?.message || 'AI research failed').slice(0, 400);
  const safeDetails = error?.details ? String(error.details).slice(0, 1800) : null;
  try {
    return await HiringResearchReport.create({
      candidateUserId,
      status: 'failed',
      reportText: `AI pre-screen report failed: ${safeMessage}`,
      reportJson: {
        kind: 'prescreen',
        error: {
          message: safeMessage,
          status: error?.status || null,
          details: safeDetails
        }
      },
      createdByUserId,
      isAiGenerated: true
    });
  } catch {
    return null;
  }
}

export const generateCandidatePreScreenReport = async (req, res, next) => {
  let candidateUserId = null;
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    let jobDescription = null;
    if (profile?.job_description_id) {
      const jd = await HiringJobDescription.findById(profile.job_description_id);
      if (jd && Number(jd.agency_id) === Number(agencyId) && (jd.is_active === 1 || jd.is_active === true)) {
        jobDescription = jd;
      }
    }

    const candidateNameFromDb = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const candidateName = String(req.body?.candidateName || candidateNameFromDb || '').trim();
    // Prefer extracted resume text from uploaded resume(s).
    // Allow manual override via req.body.resumeText, but default should “just work” after upload.
    let resumeText = String(req.body?.resumeText || '').trim();
    if (!resumeText) {
      try {
        const latest = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
        resumeText = String(latest?.extracted_text || '').trim();
      } catch (e) {
        // If the table isn't migrated yet, fall back to requiring manual paste.
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }
    resumeText = resumeText.slice(0, 20000);
    const linkedInUrl = String(req.body?.linkedInUrl || '').trim().slice(0, 800);
    const psychologyTodayUrl = String(req.body?.psychologyTodayUrl || '').trim().slice(0, 900);
    const candidateLocation = String(req.body?.candidateLocation || '').trim().slice(0, 180);
    const coverLetterText = String(req.body?.coverLetterText || profile?.cover_letter_text || '').trim().slice(0, 20000);

    // Prefer job description associated with the candidate profile; allow override via request.
    const jobTitle = String(req.body?.jobTitle || jobDescription?.title || '').trim().slice(0, 255);
    const jobDescriptionText = String(req.body?.jobDescriptionText || jobDescription?.description_text || '').trim().slice(0, 60000);

    if (!resumeText) {
      return res.status(400).json({
        error: {
          message:
            'No resume text available yet. Upload a resume PDF (with selectable text) so we can extract it, or paste resume text manually.'
        }
      });
    }

    const started = Date.now();
    let ai;
    try {
      try {
        // Preferred (grounded) path: Vertex AI with Google Search tool.
        ai = await generatePreScreenReportWithGoogleSearch({
          candidateName,
          resumeText,
          linkedInUrl,
          psychologyTodayUrl,
          candidateLocation,
          jobTitle,
          jobDescriptionText,
          coverLetterText
        });
      } catch (e) {
        // Common in some environments: Vertex+Search grounding is not permitted (403),
        // or the Vertex project/env is not configured yet (503). Fall back gracefully:
        // 1) Try Vertex without Search tool
        // 2) If GEMINI_API_KEY configured, try the API key path
        const status = e?.status;
        const canFallbackStatus = status === 403 || status === 401 || status === 503;
        if (!canFallbackStatus) throw e;

        try {
          ai = await generatePreScreenReportWithVertexNoSearch({
            candidateName,
            resumeText,
            linkedInUrl,
            psychologyTodayUrl,
            candidateLocation,
            jobTitle,
            jobDescriptionText,
            coverLetterText
          });
        } catch (e2) {
          ai = await generatePreScreenReportWithGeminiApiKey({
            candidateName,
            resumeText,
            linkedInUrl,
            psychologyTodayUrl,
            candidateLocation,
            jobTitle,
            jobDescriptionText,
            coverLetterText
          });
        }
      }
    } catch (e) {
      await createFailedAiReport({ candidateUserId, createdByUserId: req.user.id, error: e });
      if (e?.status) {
        return res.status(e.status).json({ error: { message: e.message || 'AI research failed', ...(e.details ? { details: e.details } : null) } });
      }
      throw e;
    }

    const warnings = [];
    if (!ai.isGrounded) {
      warnings.push('No source links were returned by Google Search grounding. Treat this output as unverified and review manually.');
    }

    const reportText = [
      warnings.length ? `## Warnings\n- ${warnings.join('\n- ')}\n` : '',
      ai.text
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
      .slice(0, 50000);

    const report = await HiringResearchReport.create({
      candidateUserId,
      status: 'completed',
      reportText,
      reportJson: {
        kind: 'prescreen',
        model: ai.modelId,
        latencyMs: ai.latencyMs,
        totalMs: Date.now() - started,
        isGrounded: ai.isGrounded,
        input: {
          candidateName: String(candidateName || '').slice(0, 180) || null,
          linkedInUrl: linkedInUrl || null,
          resumeTextLength: resumeText.length,
          coverLetterTextLength: coverLetterText ? coverLetterText.length : 0,
          jobTitle: jobTitle || null,
          jobDescriptionTextLength: jobDescriptionText ? jobDescriptionText.length : 0,
          jobDescriptionId: jobDescription?.id || null
        },
        grounding: ai.groundingMetadata || null
      },
      createdByUserId: req.user.id,
      isAiGenerated: true
    });

    res.status(201).json(report);
  } catch (e) {
    // Best-effort: if we got far enough to identify a candidate, write a failed record.
    if (candidateUserId && req.user?.id) {
      await createFailedAiReport({ candidateUserId, createdByUserId: req.user.id, error: e });
    }
    next(e);
  }
};

export const promoteCandidateToPendingSetup = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    // Move candidate into the existing onboarding pipeline entry point.
    const updated = await User.updateStatus(candidateUserId, 'PENDING_SETUP', req.user.id);

    // Best-effort: mark the hiring profile as hired so it no longer appears in the PROSPECTIVE list.
    try {
      const existing = await HiringProfile.findByCandidateUserId(candidateUserId);
      await HiringProfile.upsert({
        candidateUserId,
        stage: 'hired',
        appliedRole: existing?.applied_role || existing?.appliedRole || null,
        source: existing?.source || null
      });
    } catch {
      // ignore (older DBs or missing table)
    }

    // Generate a passwordless token for initial setup (7 days).
    const tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24);
    const tokenLink = `${config.frontendUrl}/passwordless-login/${tokenResult.token}`;

    res.json({
      user: updated,
      passwordlessToken: tokenResult.token,
      passwordlessTokenLink: tokenLink
    });
  } catch (e) {
    next(e);
  }
};

export const listCandidateTasks = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT *
       FROM tasks
       WHERE task_type = 'hiring'
         AND assigned_to_agency_id = ?
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.candidateUserId')) AS UNSIGNED) = ?
       ORDER BY
         CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
         due_date ASC,
         created_at DESC`,
      [agencyId, candidateUserId]
    );

    res.json((rows || []).map((r) => ({ ...r, metadata: parseMetadata(r.metadata) })));
  } catch (e) {
    next(e);
  }
};

export const createCandidateTask = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const title = String(req.body?.title || '').trim();
    const description = req.body?.description !== undefined ? String(req.body.description || '').trim() : null;
    const assignedToUserId = parseIntParam(req.body?.assignedToUserId);
    const dueDate = req.body?.dueDate || null;
    const kind = req.body?.kind !== undefined ? String(req.body.kind || '').trim() : 'call';

    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    if (!assignedToUserId) return res.status(400).json({ error: { message: 'assignedToUserId is required' } });

    // Ensure the assignee is part of the agency (keeps role-wide access consistent).
    if (req.user?.role !== 'super_admin') {
      const assigneeAgencies = await User.getAgencies(assignedToUserId);
      const ok = (assigneeAgencies || []).some((a) => Number(a.id) === Number(agencyId));
      if (!ok) {
        return res.status(400).json({ error: { message: 'Assigned user is not a member of this agency' } });
      }
    }

    const metadata = {
      entityType: 'candidate',
      candidateUserId,
      kind: kind || 'call'
    };

    const task = await Task.create({
      taskType: 'hiring',
      title,
      description: description || null,
      assignedToUserId,
      assignedToRole: null,
      assignedToAgencyId: agencyId,
      assignedByUserId: req.user.id,
      dueDate: dueDate || null,
      referenceId: null,
      metadata
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: req.user.id,
      targetUserId: assignedToUserId,
      metadata: { agencyId, candidateUserId, kind: kind || 'call' }
    });

    res.status(201).json({ ...task, metadata });
  } catch (e) {
    next(e);
  }
};

export const listHiringAssignees = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const [rows] = await pool.execute(
      `SELECT DISTINCT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.role,
         u.has_hiring_access
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.status != 'ARCHIVED'
         AND (
           u.role IN ('admin', 'super_admin', 'support', 'staff')
           OR u.has_hiring_access = 1
         )
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );

    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const listCandidateResumes = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    // Migration safety: if hiring_resume_parses is not present yet, fall back to
    // listing resumes without parse status instead of failing the page.
    let rows = [];
    try {
      const [withParse] = await pool.execute(
        `SELECT d.*,
                rp.status AS resume_parse_status,
                rp.method AS resume_parse_method,
                rp.error_text AS resume_parse_error_text,
                rp.updated_at AS resume_parse_updated_at,
                cb.first_name AS created_by_first_name,
                cb.last_name AS created_by_last_name,
                cb.email AS created_by_email
         FROM user_admin_docs d
         LEFT JOIN hiring_resume_parses rp ON rp.resume_doc_id = d.id
         LEFT JOIN users cb ON cb.id = d.created_by_user_id
         WHERE d.user_id = ? AND d.doc_type = 'resume'
         ORDER BY d.created_at DESC`,
        [candidateUserId]
      );
      rows = withParse || [];
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      const [basic] = await pool.execute(
        `SELECT d.*,
                cb.first_name AS created_by_first_name,
                cb.last_name AS created_by_last_name,
                cb.email AS created_by_email
         FROM user_admin_docs d
         LEFT JOIN users cb ON cb.id = d.created_by_user_id
         WHERE d.user_id = ? AND d.doc_type = 'resume'
         ORDER BY d.created_at DESC`,
        [candidateUserId]
      );
      rows = basic || [];
    }

    const out = (rows || []).map((d) => ({
      id: d.id,
      userId: d.user_id,
      title: d.title,
      docType: d.doc_type,
      createdAt: d.created_at,
      createdByUserId: d.created_by_user_id,
      createdByName: [d.created_by_first_name, d.created_by_last_name].filter(Boolean).join(' ') || d.created_by_email || `User ${d.created_by_user_id}`,
      hasFile: !!d.storage_path,
      originalName: d.original_name || null,
      mimeType: d.mime_type || null,
      resumeParseStatus: d.resume_parse_status || null,
      resumeParseMethod: d.resume_parse_method || null,
      resumeParseErrorText: d.resume_parse_error_text || null,
      resumeParseUpdatedAt: d.resume_parse_updated_at || null
    }));

    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const uploadCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });

    const title = String(req.body?.title || 'Resume').trim() || 'Resume';
    const noteText = req.body?.noteText !== undefined ? String(req.body.noteText || '').trim() : null;

    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname || 'resume';
    const mimeType = req.file.mimetype || 'application/octet-stream';

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const filename = `resume-${candidateUserId}-${uniqueSuffix}${safeExt}`;

    const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);

    const [result] = await pool.execute(
      `INSERT INTO user_admin_docs (
        user_id, title, doc_type, note_text,
        storage_path, original_name, mime_type,
        created_by_user_id
      ) VALUES (?, ?, 'resume', ?, ?, ?, ?, ?)`,
      [
        candidateUserId,
        title,
        noteText || null,
        storageResult.relativePath,
        originalName,
        mimeType,
        req.user.id
      ]
    );

    // Extract resume text (cheapest path: PDF selectable text or plain text).
    // Best-effort: if hiring_resume_parses table isn't present yet, skip silently.
    try {
      const extraction = await extractResumeTextFromUpload({ buffer: fileBuffer, mimeType });
      await HiringResumeParse.upsertByResumeDocId({
        candidateUserId,
        resumeDocId: result.insertId,
        method: extraction.method,
        status: extraction.status,
        extractedText: extraction.text || null,
        extractedJson: null,
        errorText: extraction.errorText || null,
        createdByUserId: req.user.id
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Best-effort: extract an embedded headshot image from resume PDFs and store it as an internal admin doc.
    // NOTE: we intentionally do NOT scrape LinkedIn due to brittleness/ToS concerns.
    try {
      if (String(mimeType || '').toLowerCase() === 'application/pdf') {
        const photo = await extractResumePhotoPngFromPdf({ buffer: fileBuffer });
        if (photo?.status === 'completed' && photo.pngBuffer) {
          // Remove old stored resume photos to avoid clutter.
          try {
            const [old] = await pool.execute(
              `SELECT id, storage_path
               FROM user_admin_docs
               WHERE user_id = ? AND doc_type = 'resume_photo'
               ORDER BY created_at DESC
               LIMIT 10`,
              [candidateUserId]
            );
            for (const d of old || []) {
              if (d?.storage_path) {
                try { await StorageService.deleteAdminDoc(d.storage_path); } catch { /* ignore */ }
              }
              try { await pool.execute(`DELETE FROM user_admin_docs WHERE id = ? LIMIT 1`, [d.id]); } catch { /* ignore */ }
            }
          } catch {
            // ignore cleanup
          }

          const photoName = `resume-photo-${candidateUserId}-${uniqueSuffix}.png`;
          const photoStorage = await StorageService.saveAdminDoc(photo.pngBuffer, photoName, 'image/png');
          await pool.execute(
            `INSERT INTO user_admin_docs (
              user_id, title, doc_type, note_text,
              storage_path, original_name, mime_type,
              created_by_user_id
            ) VALUES (?, ?, 'resume_photo', ?, ?, ?, ?, ?)`,
            [
              candidateUserId,
              'Resume photo',
              `source_resume_doc_id:${result.insertId}`,
              photoStorage.relativePath,
              photoName,
              'image/png',
              req.user.id
            ]
          );
        }
      }
    } catch {
      // best-effort only; never block resume upload
    }

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs WHERE id = ? LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

export const viewCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!candidateUserId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs
       WHERE id = ? AND user_id = ? AND doc_type = 'resume'
       LIMIT 1`,
      [docId, candidateUserId]
    );
    const doc = rows[0] || null;
    if (!doc) return res.status(404).json({ error: { message: 'Resume not found' } });
    if (!doc.storage_path) return res.status(404).json({ error: { message: 'No file for this resume entry' } });

    const url = await StorageService.getSignedUrl(doc.storage_path, 10);
    res.json({
      url,
      expiresInMinutes: 10,
      originalName: doc.original_name || null,
      mimeType: doc.mime_type || null,
      noteText: doc.note_text || null,
      title: doc.title || null
    });
  } catch (e) {
    next(e);
  }
};

export const deleteCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!candidateUserId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs
       WHERE id = ? AND user_id = ? AND doc_type = 'resume'
       LIMIT 1`,
      [docId, candidateUserId]
    );
    const doc = rows[0] || null;
    if (!doc) return res.status(404).json({ error: { message: 'Resume not found' } });

    // Best-effort delete file from storage first.
    if (doc.storage_path) {
      await StorageService.deleteAdminDoc(doc.storage_path);
    }

    // Deleting the doc will cascade-delete hiring_resume_parses via FK (if migrated).
    await pool.execute(`DELETE FROM user_admin_docs WHERE id = ? LIMIT 1`, [docId]);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getCandidatePhoto = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs
       WHERE user_id = ? AND doc_type = 'resume_photo' AND storage_path IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [candidateUserId]
    );
    const doc = rows?.[0] || null;
    if (!doc) return res.json({ url: null });

    const url = await StorageService.getSignedUrl(doc.storage_path, 10);
    res.json({
      url,
      expiresInMinutes: 10,
      docId: doc.id,
      createdAt: doc.created_at || null
    });
  } catch (e) {
    next(e);
  }
};

export const getCandidateResumeSummary = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const latestText = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
    const latestStructured = await HiringResumeParse.findLatestStructuredByCandidateUserId(candidateUserId);

    res.json({
      latestResumeDocId: latestText?.resume_doc_id || null,
      hasExtractedText: !!(latestText?.extracted_text && String(latestText.extracted_text).trim()),
      summary: latestStructured?.extracted_json || null,
      summaryUpdatedAt: latestStructured?.updated_at || null
    });
  } catch (e) {
    next(e);
  }
};

export const generateCandidateResumeSummary = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    const latest = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
    const resumeText = String(latest?.extracted_text || '').trim();
    if (!resumeText || !latest?.resume_doc_id) {
      return res.status(400).json({
        error: {
          message:
            'No extracted resume text available yet. Upload a resume PDF (with selectable text) to generate a resume summary.'
        }
      });
    }

    const candidateName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const ai = await generateResumeSummaryJson({ candidateName, resumeText });

    const extractedJson = {
      kind: 'resume_structured_v1',
      model: ai.modelId,
      latencyMs: ai.latencyMs,
      generatedAt: new Date().toISOString(),
      summary: ai.summary
    };

    const updated = await HiringResumeParse.updateExtractedJsonByResumeDocId(latest.resume_doc_id, extractedJson);

    res.status(201).json({
      resumeDocId: latest.resume_doc_id,
      summary: updated?.extracted_json || extractedJson
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message || 'Resume summary failed', ...(e.details ? { details: e.details } : null) } });
    }
    next(e);
  }
};

export const transferCandidateAgency = async (req, res, next) => {
  let conn = null;
  try {
    const fromAgencyId = parseIntParam(req.query.agencyId || req.body?.fromAgencyId || req.user?.agencyId);
    const toAgencyId = parseIntParam(req.body?.toAgencyId || req.body?.agencyId);
    if (!fromAgencyId) return res.status(400).json({ error: { message: 'from agencyId is required' } });
    if (!toAgencyId) return res.status(400).json({ error: { message: 'toAgencyId is required' } });
    if (Number(fromAgencyId) === Number(toAgencyId)) {
      return res.status(400).json({ error: { message: 'Applicant is already in that agency' } });
    }

    await ensureAgencyAccess(req, fromAgencyId);
    await ensureAgencyAccess(req, toAgencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inFromAgency = await ensureCandidateInAgency(candidateUserId, fromAgencyId);
    if (!inFromAgency) {
      return res.status(404).json({ error: { message: 'Candidate not found in the source agency' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Move membership (remove from source, add to target).
    await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [candidateUserId, fromAgencyId]);
    await conn.execute(
      'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id',
      [candidateUserId, toAgencyId]
    );

    // Keep hiring tasks visible after transfer by moving agency-scoped assignments.
    await conn.execute(
      `UPDATE tasks
       SET assigned_to_agency_id = ?
       WHERE task_type = 'hiring'
         AND assigned_to_agency_id = ?
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.candidateUserId')) AS UNSIGNED) = ?`,
      [toAgencyId, fromAgencyId, candidateUserId]
    );

    await conn.commit();

    res.json({ ok: true, candidateUserId, fromAgencyId, toAgencyId });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
    }
    next(e);
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {
        // ignore
      }
    }
  }
};

function ensureCanArchiveOrDelete(req) {
  const role = String(req.user?.role || '').toLowerCase();
  // Hiring helpers/providers can view/manage hiring, but should not archive/delete users.
  if (role !== 'admin' && role !== 'super_admin' && role !== 'support') {
    const err = new Error('Insufficient permissions to archive/delete applicants');
    err.status = 403;
    throw err;
  }
}

export const archiveCandidate = async (req, res, next) => {
  try {
    ensureCanArchiveOrDelete(req);

    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const ok = await User.archive(candidateUserId, req.user.id, agencyId);
    if (!ok) return res.status(404).json({ error: { message: 'Candidate not found' } });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const deleteCandidate = async (req, res, next) => {
  let conn = null;
  try {
    // Hard delete is super_admin only (too risky otherwise).
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super_admin can permanently delete applicants' } });
    }

    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Delete resume files + rows (best effort on storage; DB is source of truth).
    const [docs] = await conn.execute(
      `SELECT id, storage_path
       FROM user_admin_docs
       WHERE user_id = ? AND doc_type IN ('resume','resume_photo')`,
      [candidateUserId]
    );

    for (const d of docs || []) {
      if (d?.storage_path) {
        try {
          await StorageService.deleteAdminDoc(d.storage_path);
        } catch {
          // best effort
        }
      }
    }

    // Delete docs (will cascade delete hiring_resume_parses if migration 312 exists).
    await conn.execute(`DELETE FROM user_admin_docs WHERE user_id = ? AND doc_type IN ('resume','resume_photo')`, [candidateUserId]);

    // Delete hiring records (best effort if tables not present).
    try {
      await conn.execute(`DELETE FROM hiring_notes WHERE candidate_user_id = ?`, [candidateUserId]);
      await conn.execute(`DELETE FROM hiring_research_reports WHERE candidate_user_id = ?`, [candidateUserId]);
      await conn.execute(`DELETE FROM hiring_profiles WHERE candidate_user_id = ?`, [candidateUserId]);
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Delete hiring tasks for this candidate.
    await conn.execute(
      `DELETE FROM tasks
       WHERE task_type = 'hiring'
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.candidateUserId')) AS UNSIGNED) = ?`,
      [candidateUserId]
    );

    // Remove agency memberships.
    await conn.execute(`DELETE FROM user_agencies WHERE user_id = ?`, [candidateUserId]);

    // Finally delete the user row.
    await conn.execute(`DELETE FROM users WHERE id = ? LIMIT 1`, [candidateUserId]);

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
    }
    const msg = String(e?.message || '');
    const fk = msg.toLowerCase().includes('foreign key') || e?.code === 'ER_ROW_IS_REFERENCED_2';
    if (fk) {
      return res.status(409).json({
        error: {
          message:
            'This applicant cannot be permanently deleted because other records reference them. Archive instead.'
        }
      });
    }
    next(e);
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {
        // ignore
      }
    }
  }
};

