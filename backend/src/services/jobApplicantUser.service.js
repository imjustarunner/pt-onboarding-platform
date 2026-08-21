import pool from '../config/database.js';
import User from '../models/User.model.js';

const EMPLOYMENT_STATUSES = new Set([
  'ACTIVE_EMPLOYEE',
  'ACTIVE',
  'ONBOARDING',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'PENDING_SETUP',
  'INACTIVE_EMPLOYEE',
  'TERMINATED_PENDING'
]);

function isArchivedUser(user) {
  if (!user) return false;
  if (user.is_archived === true || user.is_archived === 1) return true;
  return String(user.status || '').toUpperCase() === 'ARCHIVED';
}

function isEmploymentStatus(status) {
  return EMPLOYMENT_STATUSES.has(String(status || '').toUpperCase());
}

/**
 * Unarchive a user and restore them to PROSPECTIVE when their status was ARCHIVED.
 * Leaves non-archived employment statuses alone.
 */
export async function unarchiveForNewApplication(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;

  let hasAgencyColumn = false;
  try {
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'archived_by_agency_id'`
    );
    hasAgencyColumn = (columns || []).length > 0;
  } catch {
    hasAgencyColumn = false;
  }

  const setArchivedAgency = hasAgencyColumn ? ', archived_by_agency_id = NULL' : '';
  const [result] = await pool.execute(
    `UPDATE users
        SET is_archived = FALSE,
            archived_at = NULL,
            archived_by_user_id = NULL
            ${setArchivedAgency},
            status = CASE
              WHEN UPPER(COALESCE(status, '')) = 'ARCHIVED' THEN 'PROSPECTIVE'
              ELSE status
            END
      WHERE id = ?
        AND (
          is_archived = TRUE
          OR UPPER(COALESCE(status, '')) = 'ARCHIVED'
        )`,
    [id]
  );
  return Number(result?.affectedRows || 0) > 0;
}

/**
 * Resolve an existing account by email for a job application, or create a new
 * PROSPECTIVE provider. Prior applicants (including archived) and current
 * employees can re-apply; employment status/role is preserved for active staff.
 */
export async function resolveOrCreateJobApplicantUser({
  email,
  firstName = null,
  lastName = null,
  phoneNumber = null,
  agencyId = null,
  role = 'provider'
}) {
  const gEmail = String(email || '').trim();
  const gFirst = String(firstName || '').trim() || null;
  const gLast = String(lastName || '').trim() || null;
  const gPhone = phoneNumber != null ? String(phoneNumber || '').trim() || null : null;
  if (!gEmail) {
    const err = new Error('Email is required');
    err.status = 400;
    throw err;
  }

  let existing = await User.findByEmail(gEmail);
  if (existing?.id) {
    // findByEmail may omit archive flags; load full row when needed.
    const full = (await User.findById(existing.id)) || existing;
    const wasArchived = isArchivedUser(full);
    if (wasArchived) {
      await unarchiveForNewApplication(full.id);
    }

    const updates = {};
    const statusUpper = String(full.status || '').toUpperCase();
    const allowNameOverwrite = wasArchived || statusUpper === 'PROSPECTIVE' || statusUpper === 'ARCHIVED';
    if (allowNameOverwrite) {
      if (gFirst) updates.firstName = gFirst;
      if (gLast) updates.lastName = gLast;
    }
    if (gPhone) updates.phoneNumber = gPhone;
    // Keep login email; refresh personal_email for hiring contact when blank or prospective.
    if (allowNameOverwrite || !String(full.personal_email || '').trim()) {
      updates.personalEmail = gEmail;
    }

    if (Object.keys(updates).length) {
      try {
        await User.update(full.id, updates);
      } catch {
        // best-effort contact refresh
      }
    }

    if (agencyId) {
      await User.assignToAgency(full.id, agencyId);
    }

    const user = (await User.findById(full.id)) || full;
    return {
      user,
      reused: true,
      wasArchived,
      isCurrentEmployee: isEmploymentStatus(user.status)
    };
  }

  const user = await User.create({
    email: gEmail,
    passwordHash: null,
    firstName: gFirst,
    lastName: gLast,
    phoneNumber: gPhone,
    personalEmail: gEmail,
    role: role || 'provider',
    status: 'PROSPECTIVE'
  });
  if (agencyId) {
    await User.assignToAgency(user.id, agencyId);
  }
  return {
    user,
    reused: false,
    wasArchived: false,
    isCurrentEmployee: false
  };
}

/**
 * Job application history for a candidate (public intake submissions + current profile snapshot).
 */
export async function listJobApplicationsForUser(userId, { agencyId = null, limit = 50 } = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [uid];
  let agencyClause = '';
  if (agencyId != null && Number(agencyId) > 0) {
    agencyClause = ' AND il.organization_id = ?';
    params.push(Number(agencyId));
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         s.id AS submission_id,
         s.status AS submission_status,
         s.submitted_at,
         s.created_at,
         s.combined_pdf_path,
         s.intake_data,
         il.id AS intake_link_id,
         il.title AS link_title,
         il.form_type,
         il.job_description_id,
         il.organization_id AS agency_id,
         jd.title AS job_title
       FROM intake_submissions s
       JOIN intake_links il ON il.id = s.intake_link_id
       LEFT JOIN hiring_job_descriptions jd ON jd.id = il.job_description_id
      WHERE s.guardian_user_id = ?
        AND LOWER(COALESCE(il.form_type, '')) = 'job_application'
        ${agencyClause}
        AND LOWER(COALESCE(s.status, '')) = 'submitted'
      ORDER BY COALESCE(s.submitted_at, s.created_at) DESC, s.id DESC
      LIMIT ${lim}`,
      params
    );

    return (rows || []).map((r) => {
      let coverLetterPreview = null;
      let intakeSummary = null;
      try {
        const raw = r.intake_data;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (data && typeof data === 'object') {
          const cover =
            data.coverLetter
            || data.cover_letter
            || data?.jobApplication?.coverLetter
            || data?.responses?.coverLetter
            || null;
          if (cover) {
            const text = String(cover).replace(/\s+/g, ' ').trim();
            coverLetterPreview = text ? text.slice(0, 280) : null;
          }
          intakeSummary = {
            hasResumeText: !!(data.resumeText || data.resume_text || data?.jobApplication?.resumeText),
            referenceCount: Array.isArray(data.references)
              ? data.references.length
              : (Array.isArray(data?.jobApplication?.references) ? data.jobApplication.references.length : null)
          };
        }
      } catch {
        // ignore parse errors
      }
      return {
        submissionId: r.submission_id,
        submissionStatus: r.submission_status,
        submittedAt: r.submitted_at || r.created_at,
        hasPdf: !!r.combined_pdf_path,
        linkTitle: r.link_title || null,
        jobDescriptionId: r.job_description_id || null,
        jobTitle: r.job_title || r.link_title || 'Job application',
        agencyId: r.agency_id || null,
        coverLetterPreview,
        intakeSummary
      };
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}
