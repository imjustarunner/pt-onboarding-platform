import { validationResult } from 'express-validator';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import IntakeLink from '../models/IntakeLink.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import PublicIntakeSigningService from '../services/publicIntakeSigning.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import PublicIntakeClientService, { deriveInitials } from '../services/publicIntakeClient.service.js';
import { fetchRegistrationCatalogItems } from '../services/registrationCatalog.service.js';
import { enrollClientsInCompanyEvent } from '../services/skillBuildersIntakeEnrollment.service.js';
import applyClientRoiCompletion from '../services/clientRoiCompletion.service.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import Client from '../models/Client.model.js';
import StorageService from '../services/storage.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import ReferralOcrService from '../services/referralOcr.service.js';
import EmailService from '../services/email.service.js';
import EmailTemplate from '../models/EmailTemplate.model.js';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientGuardianIntakeProfile from '../models/ClientGuardianIntakeProfile.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import GuardianInsuranceProfile from '../models/GuardianInsuranceProfile.model.js';
import GuardianPaymentCard from '../models/GuardianPaymentCard.model.js';
import QuickBooksPaymentsService from '../services/quickbooksPayments.service.js';
import HiringProfile from '../models/HiringProfile.model.js';
import HiringResumeParse from '../models/HiringResumeParse.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import ProgramStaffAssignment from '../models/ProgramStaffAssignment.model.js';
import ProgramShiftSignup from '../models/ProgramShiftSignup.model.js';
import config from '../config/config.js';
import pool from '../config/database.js';
import { verifyRecaptchaV3 } from '../services/captcha.service.js';
import ActivityLogService from '../services/activityLog.service.js';
import PlatformRetentionSettings from '../models/PlatformRetentionSettings.model.js';
import Notification from '../models/Notification.model.js';
import { notifyNewPacketUploaded } from '../services/clientNotifications.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import {
  pickPreferredSenderIdentity,
  resolvePreferredSenderIdentityForAgency,
  resolvePreferredSenderIdentityForSchoolThenAgency
} from '../services/emailSenderIdentityResolver.service.js';
import {
  applySmartSchoolRoiAccessDecisions,
  buildSmartSchoolRoiContext,
  buildSmartSchoolRoiHtml,
  isSmartSchoolRoiForm,
  normalizeSmartSchoolRoiResponse,
  validateSmartSchoolRoiResponse
} from '../services/smartSchoolRoi.service.js';
import { persistIntakeGuardianWaiversFromFinalize } from '../services/guardianWaivers.service.js';

const normalizeName = (name) => String(name || '').trim();
const normalizeDateOnly = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};
const findDateLikeValue = (obj = {}) => {
  if (!obj || typeof obj !== 'object') return null;
  const entries = Object.entries(obj);
  for (const [key, value] of entries) {
    if (!value) continue;
    const k = String(key || '').toLowerCase();
    if (/(date_?of_?birth|birth_?date|birthdate|^dob$)/.test(k)) {
      const norm = normalizeDateOnly(value);
      if (norm) return norm;
    }
  }
  return null;
};

const parseFeatureFlagsSafe = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
};
const parseLinkIntakeSteps = (link) => {
  const raw = link?.intake_steps;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** Smart registration, or standard intake that includes a Registration step (full paperwork + event enrollment). */
const linkSupportsPublicRegistrationFeatures = (link) => {
  const ft = String(link?.form_type || '').trim().toLowerCase();
  if (ft === 'smart_registration') return true;
  if (ft !== 'intake') return false;
  return parseLinkIntakeSteps(link).some(
    (s) => String(s?.type || '').trim().toLowerCase() === 'registration'
  );
};

const normalizeRegistrationSelections = (intakeData = null) => {
  const fromSubmission = intakeData?.responses?.submission?.registrationSelections;
  const raw = Array.isArray(fromSubmission) ? fromSubmission : [];
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      entityType: String(row.entityType || '').trim().toLowerCase(),
      entityId: Number(row.entityId || 0) || null,
      sourceProgramId: Number(row.sourceProgramId || 0) || null,
      sourceSiteId: Number(row.sourceSiteId || 0) || null,
      scheduleBlocks: Array.isArray(row.scheduleBlocks) ? row.scheduleBlocks : [],
      payerType: String(row.payerType || row.payer_type || '').trim().toLowerCase() || null
    }))
    .filter((row) => !!row.entityType);
};
const extractRegistrationPayerType = (intakeData = null) => {
  const sub = intakeData?.responses?.submission && typeof intakeData.responses.submission === 'object'
    ? intakeData.responses.submission
    : {};
  const raw = String(sub.registrationPayerType || sub.registration_payer_type || '').trim().toLowerCase();
  if (raw === 'medicaid' || raw === 'cash') return raw;
  return null;
};
const registrationEntityType = (selection) => {
  const t = String(selection?.entityType || '').trim().toLowerCase();
  if (t === 'event') return 'company_event';
  return t;
};
/** When the link is pinned to one company event, ensure enrollment still runs if selections are missing from the payload (defense in depth). Registration is always shown in the smart registration UI. */
const mergeLockedCompanyEventSelection = (selections, link, intakeData) => {
  const lockedId = Number(link?.company_event_id || 0) || null;
  const list = Array.isArray(selections) ? selections : [];
  if (!lockedId) return list;
  const hasLocked = list.some(
    (s) => registrationEntityType(s) === 'company_event' && Number(s.entityId) === lockedId
  );
  if (hasLocked) return list;
  const globalPayer = extractRegistrationPayerType(intakeData);
  const withoutConflictingEvents = list.filter((s) => registrationEntityType(s) !== 'company_event');
  return [
    {
      entityType: 'company_event',
      entityId: lockedId,
      sourceProgramId: null,
      sourceSiteId: null,
      scheduleBlocks: [],
      payerType: globalPayer || null
    },
    ...withoutConflictingEvents
  ];
};
const deriveRegistrationSlotDate = ({ selection = {}, intakeData = null, payload = null } = {}) => {
  const blocks = Array.isArray(selection?.scheduleBlocks) ? selection.scheduleBlocks : [];
  for (const block of blocks) {
    const startDate = normalizeDateOnly(block?.startDate);
    if (startDate) return startDate;
  }
  const fromSubmission = findDateLikeValue(intakeData?.responses?.submission || {});
  if (fromSubmission) return fromSubmission;
  const fromPayload = normalizeDateOnly(payload?.slotDate || payload?.eventDate || payload?.date);
  if (fromPayload) return fromPayload;
  return new Date().toISOString().slice(0, 10);
};
const enrollSmartRegistrationSelections = async ({
  link,
  intakeData = null,
  payload = {},
  submissionId = null,
  clientIds = [],
  guardianUserId = null
} = {}) => {
  const emptyRegistrationResult = () => ({
    attempted: false,
    selectionCount: 0,
    classEnrollments: 0,
    programAssignments: 0,
    programEventSignups: 0,
    companyEventEnrollments: 0,
    errors: []
  });
  // School ROI, job apps, intake without a Registration step, etc. do not run enrollment here.
  if (!linkSupportsPublicRegistrationFeatures(link)) {
    return emptyRegistrationResult();
  }
  let selections = normalizeRegistrationSelections(intakeData);
  selections = mergeLockedCompanyEventSelection(selections, link, intakeData);
  const result = {
    ...emptyRegistrationResult(),
    selectionCount: selections.length
  };
  if (!selections.length) return result;
  result.attempted = true;
  const uniqueClientIds = Array.from(new Set((Array.isArray(clientIds) ? clientIds : [])
    .map((id) => Number(id || 0))
    .filter((id) => Number.isFinite(id) && id > 0)));
  const globalPayer = extractRegistrationPayerType(intakeData);
  const lockedCompanyEventId = Number(link?.company_event_id || 0) || null;
  let agencyIdForEnrollment = null;
  if (uniqueClientIds.length) {
    const ph = uniqueClientIds.map(() => '?').join(',');
    try {
      const [agencyRows] = await pool.execute(
        `SELECT agency_id FROM clients WHERE id IN (${ph}) AND agency_id IS NOT NULL LIMIT 1`,
        uniqueClientIds
      );
      agencyIdForEnrollment = Number(agencyRows?.[0]?.agency_id || 0) || null;
    } catch {
      agencyIdForEnrollment = null;
    }
  }
  let participantUserId = Number(guardianUserId || 0) || null;
  if (!participantUserId) {
    const email = String(payload?.guardian?.email || '').trim().toLowerCase();
    if (email) {
      try {
        const existingUser = await User.findByEmail(email);
        participantUserId = Number(existingUser?.id || 0) || null;
      } catch {
        participantUserId = null;
      }
    }
  }
  for (const selection of selections) {
    const effectiveType = registrationEntityType(selection);
    if (effectiveType === 'class') {
      const classId = Number(selection.entityId || 0) || null;
      if (!classId || !uniqueClientIds.length) continue;
      let classOk = false;
      try {
        const [eligibleRows] = await pool.execute(
          `SELECT id FROM learning_program_classes
           WHERE id = ?
             AND registration_eligible = 1
             AND is_active = 1
             AND LOWER(COALESCE(status, '')) = 'active'
             AND (ends_at IS NULL OR ends_at >= NOW())
             AND (enrollment_opens_at IS NULL OR enrollment_opens_at <= NOW())
             AND (enrollment_closes_at IS NULL OR enrollment_closes_at >= NOW())
           LIMIT 1`,
          [classId]
        );
        classOk = !!(eligibleRows && eligibleRows.length);
      } catch {
        classOk = false;
      }
      if (!classOk) {
        result.errors.push({
          type: 'class_not_registration_eligible',
          classId,
          message: 'Class is not open for registration or outside the enrollment window'
        });
        continue;
      }
      for (const clientId of uniqueClientIds) {
        try {
          await LearningProgramClass.addClientMember({
            classId,
            clientId,
            membershipStatus: 'active',
            roleLabel: 'registered',
            notes: `Auto-enrolled via smart registration link${submissionId ? ` (submission ${submissionId})` : ''}`,
            actorUserId: null
          });
          result.classEnrollments += 1;
        } catch (error) {
          result.errors.push({
            type: 'class_enrollment_failed',
            classId,
            clientId,
            message: error?.message || 'Unknown class enrollment error'
          });
        }
      }
      continue;
    }
    if (effectiveType === 'company_event') {
      const eventId = Number(selection.entityId || 0) || null;
      if (!eventId || !agencyIdForEnrollment || !uniqueClientIds.length) continue;
      if (lockedCompanyEventId && eventId !== lockedCompanyEventId) {
        result.errors.push({
          type: 'company_event_scope_mismatch',
          eventId,
          expectedEventId: lockedCompanyEventId,
          message: 'Selected event does not match this registration link.'
        });
        continue;
      }
      const payer = selection.payerType || globalPayer || null;
      try {
        const bulk = await enrollClientsInCompanyEvent({
          agencyId: agencyIdForEnrollment,
          eventId,
          clientIds: uniqueClientIds,
          payerType: payer
        });
        if (!bulk.ok) {
          result.errors.push({
            type: 'company_event_enrollment_failed',
            eventId,
            message: bulk.error || 'Company event enrollment failed',
            details: bulk.results
          });
          continue;
        }
        const okCount = (bulk.results || []).filter((r) => r?.ok).length;
        result.companyEventEnrollments += okCount;
        for (const r of bulk.results || []) {
          if (!r?.ok) {
            result.errors.push({
              type: 'company_event_client_failed',
              eventId,
              clientId: r.clientId,
              message: r.error || 'Enrollment failed for client'
            });
          }
        }
      } catch (error) {
        result.errors.push({
          type: 'company_event_enrollment_failed',
          eventId,
          message: error?.message || 'Unknown company event enrollment error'
        });
      }
      continue;
    }
    if (effectiveType === 'program_event') {
      const programId = Number(selection.sourceProgramId || 0) || null;
      const siteId = Number(selection.sourceSiteId || 0) || null;
      const slotId = Number(selection.entityId || 0) || null;
      if (!programId || !participantUserId) continue;
      try {
        await ProgramStaffAssignment.create({
          programId,
          userId: participantUserId,
          role: 'participant',
          minScheduledHoursPerWeek: null,
          minOnCallHoursPerWeek: null,
          createdByUserId: null
        });
        result.programAssignments += 1;
      } catch (error) {
        result.errors.push({
          type: 'program_assignment_failed',
          programId,
          userId: participantUserId,
          message: error?.message || 'Unknown program assignment error'
        });
      }
      if (!siteId || !slotId) continue;
      const slotDate = deriveRegistrationSlotDate({ selection, intakeData, payload });
      try {
        const [existingRows] = await pool.execute(
          `SELECT id
           FROM program_shift_signups
           WHERE program_site_id = ?
             AND program_site_shift_slot_id = ?
             AND user_id = ?
             AND slot_date = ?
             AND status IN ('confirmed', 'pending')
           LIMIT 1`,
          [siteId, slotId, participantUserId, slotDate]
        );
        if (existingRows?.length) continue;
        const [slotRows] = await pool.execute(
          `SELECT start_time, end_time
           FROM program_site_shift_slots
           WHERE id = ?
           LIMIT 1`,
          [slotId]
        );
        const slot = slotRows?.[0] || {};
        await ProgramShiftSignup.create({
          programSiteId: siteId,
          programSiteShiftSlotId: slotId,
          userId: participantUserId,
          slotDate,
          startTime: slot?.start_time || null,
          endTime: slot?.end_time || null,
          signupType: 'scheduled'
        });
        result.programEventSignups += 1;
      } catch (error) {
        result.errors.push({
          type: 'program_event_signup_failed',
          programId,
          siteId,
          slotId,
          userId: participantUserId,
          message: error?.message || 'Unknown program event signup error'
        });
      }
    }
  }
  return result;
};
const extractGuardianProfileFromPayload = ({ payload = {}, intakeData = {} } = {}) => {
  const guardianBody = payload?.guardian && typeof payload.guardian === 'object' ? payload.guardian : {};
  const guardianIntake = intakeData?.guardian && typeof intakeData.guardian === 'object' ? intakeData.guardian : {};
  const responses = intakeData?.responses && typeof intakeData.responses === 'object' ? intakeData.responses : {};
  const guardianResponses = responses?.guardian && typeof responses.guardian === 'object' ? responses.guardian : {};
  const submissionResponses = responses?.submission && typeof responses.submission === 'object' ? responses.submission : {};
  const pick = (...values) => values.find((v) => String(v || '').trim()) || '';
  const firstName = normalizeName(
    pick(
      guardianBody?.firstName,
      guardianBody?.first_name,
      guardianIntake?.firstName,
      guardianIntake?.first_name,
      guardianResponses?.firstName,
      guardianResponses?.first_name,
      guardianResponses?.guardianFirstName,
      guardianResponses?.guardian_first_name,
      guardianResponses?.guardian_first,
      submissionResponses?.firstName,
      submissionResponses?.first_name,
      submissionResponses?.guardianFirstName,
      submissionResponses?.guardian_first_name,
      submissionResponses?.guardian_first
    )
  ) || null;
  const lastName = normalizeName(
    pick(
      guardianBody?.lastName,
      guardianBody?.last_name,
      guardianIntake?.lastName,
      guardianIntake?.last_name,
      guardianResponses?.lastName,
      guardianResponses?.last_name,
      guardianResponses?.guardianLastName,
      guardianResponses?.guardian_last_name,
      guardianResponses?.guardian_last,
      submissionResponses?.lastName,
      submissionResponses?.last_name,
      submissionResponses?.guardianLastName,
      submissionResponses?.guardian_last_name,
      submissionResponses?.guardian_last
    )
  ) || null;
  const fullName = normalizeName(`${firstName || ''} ${lastName || ''}`) || null;
  const email = normalizeName(
    pick(
      guardianBody?.email,
      guardianIntake?.email,
      guardianResponses?.email,
      guardianResponses?.guardianEmail,
      guardianResponses?.guardian_email,
      guardianResponses?.email_address,
      submissionResponses?.email,
      submissionResponses?.guardianEmail,
      submissionResponses?.guardian_email,
      submissionResponses?.email_address
    )
  ).toLowerCase() || null;
  const phone = normalizeName(
    pick(
      guardianBody?.phone,
      guardianBody?.phoneNumber,
      guardianBody?.phone_number,
      guardianIntake?.phone,
      guardianIntake?.phoneNumber,
      guardianIntake?.phone_number,
      guardianResponses?.phone,
      guardianResponses?.guardianPhone,
      guardianResponses?.guardian_phone,
      guardianResponses?.phoneNumber,
      guardianResponses?.phone_number,
      submissionResponses?.phone,
      submissionResponses?.guardianPhone,
      submissionResponses?.guardian_phone,
      submissionResponses?.phoneNumber,
      submissionResponses?.phone_number
    )
  ) || null;
  const relationship = normalizeName(
    pick(
      guardianBody?.relationship,
      guardianIntake?.relationship,
      guardianResponses?.relationship,
      guardianResponses?.guardianRelationship,
      guardianResponses?.guardian_relationship,
      submissionResponses?.relationship,
      submissionResponses?.guardianRelationship,
      submissionResponses?.guardian_relationship
    )
  ) || null;
  const dateOfBirth = normalizeDateOnly(
    guardianBody?.dateOfBirth
    || guardianIntake?.dateOfBirth
    || guardianBody?.dob
    || guardianIntake?.dob
    || findDateLikeValue(guardianResponses)
    || findDateLikeValue(submissionResponses)
  );
  const profile = { firstName, lastName, fullName, email, phone, relationship, dateOfBirth };
  const hasAny = Object.values(profile).some((v) => String(v || '').trim());
  return hasAny ? profile : null;
};
const persistGuardianProfileForClient = async ({ clientId, payload = {}, intakeData = {}, source = 'public_intake' } = {}) => {
  const cid = Number(clientId || 0);
  if (!cid) return;
  const profile = extractGuardianProfileFromPayload({ payload, intakeData });
  if (!profile) return;
  await ClientGuardianIntakeProfile.upsertForClient({
    clientId: cid,
    profile,
    source
  });
};
let hasClientDateOfBirthColumnCache = null;
const hasClientDateOfBirthColumn = async () => {
  if (hasClientDateOfBirthColumnCache !== null) return hasClientDateOfBirthColumnCache;
  try {
    const [rows] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'date_of_birth' LIMIT 1"
    );
    hasClientDateOfBirthColumnCache = (rows || []).length > 0;
  } catch {
    hasClientDateOfBirthColumnCache = false;
  }
  return hasClientDateOfBirthColumnCache;
};
const persistClientDateOfBirthIfMissing = async ({ clientId, dateOfBirth }) => {
  const cid = Number(clientId || 0);
  const dob = normalizeDateOnly(dateOfBirth);
  if (!cid || !dob) return;
  if (!await hasClientDateOfBirthColumn()) return;
  await pool.execute(
    `UPDATE clients
     SET date_of_birth = ?
     WHERE id = ?
       AND (date_of_birth IS NULL OR date_of_birth = '')`,
    [dob, cid]
  );
};
const persistClientDemographicsIfProvided = async ({ clientId, demographicsInfo }) => {
  const cid = Number(clientId || 0);
  if (!cid || !demographicsInfo || typeof demographicsInfo !== 'object') return;

  const updates = [];
  const values = [];

  const addIfPresent = (col, val) => {
    const v = String(val || '').trim();
    if (v) { updates.push(`${col} = ?`); values.push(v); }
  };

  if (demographicsInfo.dob) {
    const dob = normalizeDateOnly(demographicsInfo.dob);
    if (dob) { updates.push('date_of_birth = COALESCE(date_of_birth, ?)'); values.push(dob); }
  }
  addIfPresent('gender', demographicsInfo.gender);
  addIfPresent('ethnicity', demographicsInfo.ethnicity);
  addIfPresent('preferred_language', demographicsInfo.preferredLanguage);
  addIfPresent('address_street', demographicsInfo.addressStreet);
  addIfPresent('address_apt', demographicsInfo.addressApt);
  addIfPresent('address_city', demographicsInfo.addressCity);
  addIfPresent('address_state', demographicsInfo.addressState);
  addIfPresent('address_zip', demographicsInfo.addressZip);

  if (!updates.length) return;
  values.push(cid);
  try {
    await pool.execute(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, values);
  } catch (e) {
    // Best-effort; ignore if columns don't exist yet (migration pending)
    console.warn('[publicIntake] demographics persist failed', { clientId: cid, message: e?.message });
  }
};

const ensureGuardianAccountLinkedForClient = async ({ clientId, profile = {}, accessEnabled = false }) => {
  const cid = Number(clientId || 0);
  if (!cid) return null;
  const email = String(profile?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  let guardianUser = await User.findByEmail(email);
  if (guardianUser && String(guardianUser.role || '').toLowerCase() !== 'client_guardian') {
    return null;
  }
  if (!guardianUser) {
    guardianUser = await User.create({
      email,
      passwordHash: null,
      firstName: String(profile?.firstName || 'Guardian').trim() || 'Guardian',
      lastName: String(profile?.lastName || '').trim(),
      phoneNumber: String(profile?.phone || '').trim() || null,
      personalEmail: email,
      role: 'client_guardian',
      status: 'PENDING_SETUP'
    });
  }
  await ClientGuardian.upsertLink({
    clientId: cid,
    guardianUserId: Number(guardianUser.id),
    relationshipType: 'guardian',
    relationshipTitle: String(profile?.relationship || 'Guardian').trim() || 'Guardian',
    accessEnabled: !!accessEnabled,
    permissionsJson: { intakeLinkGuardianProfile: true },
    createdByUserId: null
  });
  if (accessEnabled) {
    try {
      await pool.execute(`UPDATE clients SET guardian_portal_enabled = 1 WHERE id = ?`, [cid]);
    } catch (e) {
      console.error('[publicIntake] guardian_portal_enabled update failed', { clientId: cid, message: e?.message });
    }
  }
  return guardianUser;
};
const BASE_CONSENT_TTL_MS = 60 * 60 * 1000; // 1 hour to complete once started
const PER_PAGE_TTL_MS = 5 * 60 * 1000;

const isSubmissionExpired = (submission, { templatesCount = 0 } = {}) => {
  if (!submission) return false;
  if (String(submission.status || '').toLowerCase() === 'submitted') return false;
  const base = submission.consent_given_at || submission.created_at;
  if (!base) return false;
  const startedAt = new Date(base).getTime();
  if (Number.isNaN(startedAt)) return false;
  const extra = Math.max(0, Number(templatesCount) || 0) * PER_PAGE_TTL_MS;
  const ttl = BASE_CONSENT_TTL_MS + extra;
  return Date.now() - startedAt > ttl;
};

const deleteSubmissionData = async (submissionId) => {
  if (!submissionId) return;
  const docs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
  const clients = await IntakeSubmissionClient.listBySubmissionId(submissionId);
  const phiDocs = await ClientPhiDocument.listByIntakeSubmissionId(submissionId);
  let uploadPaths = [];
  try {
    const pool = (await import('../config/database.js')).default;
    const [uploadRows] = await pool.execute(
      'SELECT storage_path FROM intake_submission_uploads WHERE intake_submission_id = ?',
      [submissionId]
    );
    uploadPaths = (uploadRows || []).map((r) => String(r?.storage_path || '').trim()).filter(Boolean);
  } catch {
    // table may not exist yet
  }
  const paths = new Set([
    ...(Array.isArray(docs) ? docs.map((d) => String(d?.signed_pdf_path || '').trim()) : []),
    ...(Array.isArray(clients) ? clients.map((c) => String(c?.bundle_pdf_path || '').trim()) : []),
    ...uploadPaths
  ].filter(Boolean));
  for (const doc of phiDocs || []) {
    const p = String(doc?.storage_path || '').trim();
    if (p) paths.add(p);
  }
  for (const path of paths) {
    try {
      await StorageService.deleteObject(path);
    } catch {
      // best-effort
    }
  }
  if (phiDocs?.length) {
    try {
      const ids = phiDocs.map((d) => d.id).filter(Boolean);
      await ClientPhiDocument.deleteByIds(ids);
    } catch {
      // ignore
    }
  }
  try {
    await IntakeSubmission.deleteById(submissionId);
  } catch {
    // ignore
  }
};

const isOptionalPublicField = (def) => {
  const normalize = (val) =>
    String(val || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '_');
  const key = normalize(def?.prefillKey || def?.prefill_key || def?.id);
  const label = normalize(def?.label);
  const name = normalize(def?.name);
  const hiddenKeys = new Set(['client_first', 'client_last', 'relationship']);
  return hiddenKeys.has(key) || hiddenKeys.has(label) || hiddenKeys.has(name);
};

const isPublicDateField = (def) => {
  const key = String(def?.prefillKey || def?.prefill_key || def?.id || '').trim().toLowerCase();
  return key === 'date';
};

const decodeHtmlEntities = (value) =>
  String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE = 'intake_packet_default';
const SCHOOL_PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE = 'school_full_intake_packet_default';

const renderTemplateString = (template, params = {}) => {
  let rendered = String(template || '');
  Object.entries(params || {}).forEach(([key, value]) => {
    const safe = String(value ?? '');
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), safe);
  });
  return rendered;
};

const toSimpleHtmlEmail = (text) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    ${String(text || '')
      .split('\n')
      .map((line) => `<p>${escapeHtml(line || '').replace(/^\s+|\s+$/g, '') || '&nbsp;'}</p>`)
      .join('')}
  </div>
`.trim();

const resolvePacketEmailTemplateType = (link, customMessages = {}) => {
  const explicitType = String(customMessages?.completionEmailTemplateType || '').trim();
  if (explicitType) return explicitType;
  const scope = String(link?.scope_type || '').trim().toLowerCase();
  return scope === 'school' ? SCHOOL_PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE : PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE;
};

const resolvePacketCompletionEmailContent = async ({
  link,
  agencyId = null,
  signerName,
  signerEmail,
  clientCount,
  primaryClientName,
  schoolName,
  downloadUrl,
  expiresInDays = 7,
  registrationLoginEmail = null,
  registrationTempPassword = null,
  registrationNeedsSetup = false,
  portalLoginUrl = null,
  registrationPasswordlessUrl = null,
  registrationEventSummary = null
}) => {
  const customMessages = link?.custom_messages && typeof link.custom_messages === 'object'
    ? link.custom_messages
    : {};
  const selectedTemplateId = Number(customMessages?.completionEmailTemplateId || 0) || null;
  const selectedTemplateType = resolvePacketEmailTemplateType(link, customMessages);
  let selectedTemplate = null;

  if (selectedTemplateId) {
    selectedTemplate = await EmailTemplate.findById(selectedTemplateId);
    if (selectedTemplate && agencyId && selectedTemplate.agency_id && Number(selectedTemplate.agency_id) !== Number(agencyId)) {
      selectedTemplate = null;
    }
  }
  if (!selectedTemplate && selectedTemplateType && agencyId) {
    selectedTemplate = await EmailTemplate.findByTypeAndAgency(selectedTemplateType, agencyId);
  }

  const regLogin = String(registrationLoginEmail || signerEmail || '').trim();
  const regPw = String(registrationTempPassword || '').trim();
  const needsSetup = !!registrationNeedsSetup;
  const regPlainLogin = String(portalLoginUrl || '').trim();
  const regPasswordless = String(registrationPasswordlessUrl || '').trim();
  const regPortalPrimary = regPasswordless || regPlainLogin;
  const regEvent = String(registrationEventSummary || '').trim();

  const params = {
    SIGNER_NAME: String(signerName || '').trim() || 'Signer',
    SIGNER_EMAIL: String(signerEmail || '').trim() || '',
    CLIENT_NAME: String(primaryClientName || '').trim() || '',
    CLIENT_COUNT: Number(clientCount || 0) || 1,
    CLIENT_SUMMARY: Number(clientCount || 0) > 1
      ? `Clients: ${Number(clientCount || 0)}`
      : (String(primaryClientName || '').trim() ? `Client: ${String(primaryClientName || '').trim()}` : ''),
    SCHOOL_NAME: String(schoolName || '').trim() || 'School',
    DOWNLOAD_URL: String(downloadUrl || '').trim(),
    LINK_EXPIRES_DAYS: Number(expiresInDays || 7),
    LINK_EXPIRY_DAYS: Number(expiresInDays || 7),
    REGISTRATION_LOGIN_EMAIL: regLogin,
    REGISTRATION_TEMP_PASSWORD: regPw,
    REGISTRATION_NEEDS_SETUP: needsSetup ? 'true' : 'false',
    PORTAL_LOGIN_URL: regPortalPrimary,
    REGISTRATION_PASSWORDLESS_URL: regPasswordless,
    REGISTRATION_LOGIN_PAGE_URL: regPlainLogin,
    REGISTRATION_EVENT_SUMMARY: regEvent
  };

  const credsBlock = needsSetup || regPw || regPasswordless
    ? [
        '',
        '— Guardian portal access —',
        regPasswordless && needsSetup
          ? `Set up your guardian account using this secure link:\n${regPasswordless}`
          : regPasswordless
            ? `One-time sign-in link:\n${regPasswordless}`
          : '',
        regLogin ? `Username (email): ${regLogin}` : '',
        regPw ? `Temporary password (valid 72 hours; you will set a new password after signing in): ${regPw}` : '',
        regPlainLogin && regPasswordless && regPlainLogin !== regPasswordless && regPw
          ? `Main login page (if you prefer to type your email and temporary password): ${regPlainLogin}`
          : regPlainLogin && regPasswordless && regPlainLogin !== regPasswordless
            ? `Main login page: ${regPlainLogin}`
          : (!regPasswordless && regPlainLogin ? `Sign in: ${regPlainLogin}` : ''),
        regPw ? 'If this password expires before you sign in, use "Forgot password" on the login page to receive a reset link.' : '',
        regEvent ? `Event / registration: ${regEvent}` : ''
      ].filter(Boolean).join('\n')
    : '';

  const fallbackSubject = `Thank you for completing your intake packet${params.SCHOOL_NAME ? ` for ${params.SCHOOL_NAME}` : ''}`;
  const fallbackText = [
    `Hello ${params.SIGNER_NAME || 'there'},`,
    '',
    `${params.CLIENT_SUMMARY ? `${params.CLIENT_SUMMARY}\n` : ''}Thank you for completing the intake packet${params.SCHOOL_NAME ? ` for ${params.SCHOOL_NAME}` : ''}.`,
    'Our staff will be in touch with next steps.',
    'Once your client is assigned to a provider, they will reach out to schedule intake and begin services.',
    credsBlock,
    '',
    params.DOWNLOAD_URL
      ? `You can view/download your signed copy here:\n${params.DOWNLOAD_URL}\n\nThis link expires in ${params.LINK_EXPIRES_DAYS} days.`
      : 'Your signed copy is available in our system. If you would like a copy resent, reply to this email and our team can help.',
    '',
    'Thank you,',
    'ITSCO Support'
  ].join('\n');

  const customSubject = String(customMessages?.completionEmailSubject || '').trim();
  const customBody = String(customMessages?.completionEmailBody || '').trim();

  const subjectTemplate = customSubject || selectedTemplate?.subject || fallbackSubject;
  const bodyTemplate = customBody || selectedTemplate?.body || fallbackText;

  const subject = renderTemplateString(subjectTemplate, params).trim() || fallbackSubject;
  let text = renderTemplateString(bodyTemplate, params).trim() || fallbackText;

  // If a custom template was used but it doesn't include portal/login info,
  // append it automatically when there are credentials to share.
  const usedCustomTemplate = !!(customBody || selectedTemplate?.body);
  const hasLoginInfo = !!(regPasswordless || regPw || (regPlainLogin && needsSetup));
  const textMissesLoginInfo = usedCustomTemplate && hasLoginInfo && !text.includes(regPortalPrimary || regPlainLogin);
  if (textMissesLoginInfo) {
    const appendedBlock = [
      '',
      '— Guardian portal access —',
      regPasswordless && needsSetup ? `Set up your account: ${regPasswordless}` : regPasswordless ? `One-time sign-in link: ${regPasswordless}` : '',
      regLogin ? `Username: ${regLogin}` : '',
      regPw ? `Temporary password (valid 72h): ${regPw}` : '',
      (!regPasswordless && regPlainLogin) ? `Login page: ${regPlainLogin}` : ''
    ].filter(Boolean).join('\n');
    text = `${text}\n${appendedBlock}`;
  }

  const html = selectedTemplate?.body || customBody
    ? toSimpleHtmlEmail(text)
    : `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        ${params.CLIENT_COUNT > 1 ? `<p><strong>Clients:</strong> ${params.CLIENT_COUNT}</p>` : (params.CLIENT_NAME ? `<p><strong>Client:</strong> ${escapeHtml(params.CLIENT_NAME)}</p>` : '')}
        <p>Thank you for completing the intake packet${params.SCHOOL_NAME ? ` for <strong>${escapeHtml(params.SCHOOL_NAME)}</strong>` : ''}.</p>
        <p>Our staff will be in touch with next steps.</p>
        <p>Once your client is assigned to a provider, they will reach out to schedule intake and begin services.</p>
        ${(needsSetup || regPw || regPasswordless)
          ? `<div style="margin:16px 0;padding:12px;border:1px solid #ddd;border-radius:8px;background:#f9fafb;">
               <p><strong>Guardian portal</strong></p>
               ${regLogin ? `<p>Username: ${escapeHtml(regLogin)}</p>` : ''}
               ${regPw ? `<p>Temporary password (72h): <code>${escapeHtml(regPw)}</code></p>` : ''}
               ${regPasswordless && needsSetup ? `<p><a href="${escapeHtml(regPasswordless)}">Set up your guardian account</a></p>` : ''}
               ${regPasswordless && !needsSetup ? `<p><a href="${escapeHtml(regPasswordless)}">One-time sign-in link</a></p>` : ''}
               ${regPlainLogin && regPasswordless && regPw ? `<p style="font-size:13px;color:#555;">Or open the <a href="${escapeHtml(regPlainLogin)}">login page</a> and sign in with your email and temporary password.</p>` : ''}
               ${regPlainLogin && regPasswordless && !regPw ? `<p style="font-size:13px;color:#555;">You can also open the <a href="${escapeHtml(regPlainLogin)}">login page</a> after your setup is complete.</p>` : ''}
               ${!regPasswordless && regPlainLogin ? `<p><a href="${escapeHtml(regPlainLogin)}">Sign in</a></p>` : ''}
               ${regEvent ? `<p><strong>Event:</strong> ${escapeHtml(regEvent)}</p>` : ''}
             </div>`
          : ''}
        ${params.DOWNLOAD_URL
          ? `<p><a href="${escapeHtml(params.DOWNLOAD_URL)}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">View Signed Packet</a></p>
             <p style="color:#777;">This link expires in ${params.LINK_EXPIRES_DAYS} days.</p>`
          : '<p style="color:#555;">Your signed copy is available in our system. Reply to this email if you need another copy.</p>'}
      </div>
    `.trim();

  return {
    subject,
    text,
    html,
    templateId: selectedTemplate?.id || null,
    templateType: selectedTemplate?.type || selectedTemplateType || null
  };
};

const resolveIntakeSenderIdentity = async ({ organizationId, scopeType, agencyId: explicitAgencyId = null }) => {
  const scope = String(scopeType || '').trim().toLowerCase();
  const preferredKeys = scope === 'school'
    ? ['school_intake', 'intake', 'notifications', 'system']
    : ['intake', 'notifications', 'system'];

  if (scope === 'school') {
    return await resolvePreferredSenderIdentityForSchoolThenAgency({
      schoolOrganizationId: organizationId,
      agencyId: explicitAgencyId || null,
      preferredKeys
    });
  }

  const agencyId = Number(explicitAgencyId || organizationId);
  if (!agencyId) return null;
  return await resolvePreferredSenderIdentityForAgency({ agencyId, preferredKeys });
};

const resolveAbsoluteAssetUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const backendBase = String(
    process.env.BACKEND_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    ''
  ).replace(/\/$/, '');
  if (!backendBase) return '';
  if (raw.startsWith('/')) return `${backendBase}${raw}`;
  return `${backendBase}/${raw}`;
};

const applyIdentitySignatureBlock = ({ identity, text = '', html = '' }) => {
  if (!identity) return { text, html };
  const imageUrl = resolveAbsoluteAssetUrl(identity.signature_image_url || identity.signature_image_path);
  if (!imageUrl) return { text, html };
  const altText = String(identity.signature_alt_text || identity.display_name || 'Signature').trim() || 'Signature';
  return {
    text: `${String(text || '').trim()}\n\n[Signature image: ${imageUrl}]`.trim(),
    html: `${String(html || '').trim()}
      <div style="margin-top: 14px;">
        <img
          src="${escapeHtml(imageUrl)}"
          alt="${escapeHtml(altText)}"
          style="max-width: 360px; width: auto; height: auto; display: block; border: 0;"
        />
      </div>`.trim()
  };
};

const resolveFallbackSignatureIdentity = async ({ organizationId, scopeType, agencyId: explicitAgencyId = null }) => {
  const scope = String(scopeType || '').trim().toLowerCase();
  const preferredKeys = scope === 'school'
    ? ['school_intake', 'intake', 'notifications', 'system']
    : ['intake', 'notifications', 'system'];

  const withSignatureFilter = (list = []) => (list || []).filter(
    (i) => String(i?.signature_image_url || i?.signature_image_path || '').trim()
  );

  if (scope === 'school') {
    const schoolId = Number(organizationId || 0) || null;
    if (schoolId) {
      const schoolList = await EmailSenderIdentity.list({ agencyId: schoolId, includePlatformDefaults: true, onlyActive: true });
      const schoolWithSignature = withSignatureFilter(schoolList);
      const schoolMatch = pickPreferredSenderIdentity(schoolWithSignature, preferredKeys);
      if (schoolMatch?.id) return schoolMatch;
    }
    const agencyId = Number(explicitAgencyId || 0) || null;
    if (agencyId) {
      const agencyList = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: true, onlyActive: true });
      return pickPreferredSenderIdentity(withSignatureFilter(agencyList), preferredKeys);
    }
    return null;
  }

  const agencyId = Number(explicitAgencyId || organizationId);
  if (!agencyId) return null;
  const list = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: true, onlyActive: true });
  return pickPreferredSenderIdentity(withSignatureFilter(list), preferredKeys);
};

const resolvePublicIntakeContext = async (publicKey) => {
  const key = String(publicKey || '').trim();
  if (!key) return { link: null, issuedRoiLink: null, boundClient: null };
  const directLink = await IntakeLink.findByPublicKey(key);
  if (directLink) {
    return {
      link: directLink,
      issuedRoiLink: null,
      boundClient: null
    };
  }
  const issuedRoiLink = await ClientSchoolRoiSigningLink.findByPublicKey(key);
  if (!issuedRoiLink) {
    return { link: null, issuedRoiLink: null, boundClient: null };
  }
  const link = await IntakeLink.findById(issuedRoiLink.intake_link_id);
  if (!link) {
    return { link: null, issuedRoiLink: null, boundClient: null };
  }
  let boundClient = null;
  if (issuedRoiLink.client_id) {
    try {
      boundClient = await Client.findById(issuedRoiLink.client_id, { includeSensitive: true });
    } catch {
      boundClient = null;
    }
  }
  return { link, issuedRoiLink, boundClient };
};

const BACKOFFICE_NOTIFICATION_AUDIENCE = Object.freeze({
  admin: true,
  schoolStaff: false,
  provider: false,
  supervisor: false,
  clinicalPracticeAssistant: false
});

const notifySchoolRoiCompletedForBackoffice = async ({
  agencyId,
  clientId,
  clientLabel,
  schoolLabel
}) => {
  const aid = Number(agencyId || 0) || null;
  const cid = Number(clientId || 0) || null;
  if (!aid || !cid) return;
  try {
    await Notification.create({
      type: 'client_school_roi_completed',
      severity: 'info',
      title: 'School ROI completed by client',
      message: `${clientLabel || `Client ${cid}`} completed Smart School ROI${schoolLabel ? ` for ${schoolLabel}` : ''}.`,
      audienceJson: BACKOFFICE_NOTIFICATION_AUDIENCE,
      userId: null,
      agencyId: aid,
      relatedEntityType: 'client',
      relatedEntityId: cid,
      actorUserId: null,
      actorSource: 'Public Intake'
    });
  } catch {
    // best-effort
  }
};

const buildAnswersPdfBuffer = async ({ link, intakeData }) => {
  if (!intakeData) return null;
  const clients = Array.isArray(intakeData?.clients) ? intakeData.clients : [];
  const totalClients = clients.length || 1;
  const sections = [];
  for (let i = 0; i < totalClients; i += 1) {
    const rawText = buildIntakeAnswersText({ link, intakeData, clientIndex: i });
    if (!rawText) continue;
    const client = clients[i];
    const clientName =
      String(client?.fullName || '').trim()
      || `${String(client?.firstName || '').trim()} ${String(client?.lastName || '').trim()}`.trim();
    const heading = clientName ? `Intake Responses - ${clientName}` : `Intake Responses - Client ${i + 1}`;
    const lines = decodeHtmlEntities(rawText).split('\n');
    sections.push({ heading, lines });
  }
  if (!sections.length) return null;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [612, 792];
  const margin = 48;
  const maxWidth = pageSize[0] - margin * 2;
  const lineGap = 4;

  const wrapText = (text, activeFont, size, width) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      const nextWidth = activeFont.widthOfTextAtSize(next, size);
      if (nextWidth <= width) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  };

  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;
  const newLine = (size) => {
    y -= size + lineGap;
    if (y < margin + 40) {
      page = pdfDoc.addPage(pageSize);
      y = pageSize[1] - margin;
    }
  };

  const approval = intakeData?.approval || null;
  if (approval && (approval.staffLastName || approval.clientFirstName || approval.mode)) {
    const approvalTitle = wrapText('Staff-Assisted Verification', fontBold, 18, maxWidth);
    approvalTitle.forEach((line) => {
      page.drawText(line, { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
      newLine(18);
    });
    newLine(8);
    const approvalLines = [
      `Mode: ${approval.mode || 'staff_assisted'}`,
      `Staff last name: ${approval.staffLastName || '—'}`,
      `Client first name: ${approval.clientFirstName || '—'}`,
      `Approved at: ${approval.approvedAt || '—'}`
    ];
    approvalLines.forEach((line) => {
      const wrapped = wrapText(line, font, 12, maxWidth);
      wrapped.forEach((w) => {
        page.drawText(w, { x: margin, y, size: 12, font, color: rgb(0, 0, 0) });
        newLine(12);
      });
    });
    page = pdfDoc.addPage(pageSize);
    y = pageSize[1] - margin;
  }

  const headerLines = wrapText('Intake Responses', fontBold, 18, maxWidth);
  headerLines.forEach((line) => {
    page.drawText(line, { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
    newLine(18);
  });
  newLine(10);

  for (const section of sections) {
    const headingLines = wrapText(section.heading, fontBold, 14, maxWidth);
    headingLines.forEach((line) => {
      page.drawText(line, { x: margin, y, size: 14, font: fontBold, color: rgb(0, 0, 0) });
      newLine(14);
    });

    section.lines.forEach((rawLine) => {
      const trimmed = String(rawLine || '').trim();
      if (!trimmed) {
        newLine(10);
        return;
      }
      if (/^-{2,}$/.test(trimmed)) return;
      if (!trimmed.includes(':')) {
        page.drawText(trimmed, { x: margin, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        newLine(12);
        return;
      }
      const idx = trimmed.indexOf(':');
      const label = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      const labelText = `${label}:`;
      const labelLines = wrapText(labelText, fontBold, 11, maxWidth * 0.4);
      labelLines.forEach((line) => {
        page.drawText(line, { x: margin, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
        newLine(11);
      });
      const valueLines = wrapText(value, font, 11, maxWidth);
      valueLines.forEach((line) => {
        page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0, 0, 0) });
        newLine(11);
      });
    });

    newLine(12);
  }

  return await pdfDoc.save();
};

const isFieldVisible = (def, values = {}) => {
  const showIf = def?.showIf;
  if (!showIf || !showIf.fieldId) return true;
  const actual = values[showIf.fieldId];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map(String).includes(String(actual));
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '') === String(expected ?? '');
};

const buildSignerFromSubmission = (submission) => {
  const name = normalizeName(submission.signer_name);
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Signer';
  const lastName = parts.slice(1).join(' ') || '';
  return {
    firstName,
    lastName,
    email: submission.signer_email || 'unknown@example.com',
    userId: `Public-${submission.id}`
  };
};

const buildWorkflowData = ({ submission }) => ({
  consent_given_at: submission.consent_given_at,
  intent_to_sign_at: submission.submitted_at,
  identity_verified_at: null,
  finalized_at: submission.submitted_at,
  consent_ip: submission.ip_address || null,
  intent_ip: submission.ip_address || null
});

const buildAuditTrail = ({ link, submission }) => ({
  intakeLinkId: link.id,
  submissionId: submission.id,
  signerRole: submission.signer_role || 'guardian',
  signerName: submission.signer_name,
  signerInitials: submission.signer_initials,
  clientName: submission.client_name || null,
  consentGivenAt: submission.consent_given_at,
  submittedAt: submission.submitted_at,
  ipAddress: submission.ip_address,
  userAgent: submission.user_agent
});

const hasValue = (val) => val !== null && val !== undefined && (typeof val !== 'string' || val.trim() !== '');

const hashIntakeData = (intakeData) => {
  if (!intakeData) return null;
  try {
    const raw = JSON.stringify(intakeData);
    return crypto.createHash('sha256').update(raw).digest('hex');
  } catch {
    return null;
  }
};

const mergeIntakeSubmissionPatch = (intakeData, submissionPatch = {}) => {
  if (!intakeData || typeof intakeData !== 'object') {
    return { responses: { submission: { ...(submissionPatch || {}) } } };
  }
  const next = JSON.parse(JSON.stringify(intakeData));
  next.responses = next.responses && typeof next.responses === 'object' ? next.responses : {};
  next.responses.submission = next.responses.submission && typeof next.responses.submission === 'object'
    ? next.responses.submission
    : {};
  Object.assign(next.responses.submission, submissionPatch);
  return next;
};

async function computePublicIntakeClientMatch({ link, intakeData = null, payload = {} } = {}) {
  const base = {
    registration_client_match: 'new',
    registration_matched_client_id: null
  };
  if (!linkSupportsPublicRegistrationFeatures(link)) return base;
  const orgId = Number(
    payload?.organizationId
      || intakeData?.responses?.submission?.organizationId
      || link.organization_id
      || 0
  ) || null;
  const rawClients = Array.isArray(payload?.clients) && payload.clients.length
    ? payload.clients
    : (Array.isArray(intakeData?.clients) && intakeData.clients.length
      ? intakeData.clients
      : (payload?.client ? [payload.client] : []));
  const first = rawClients[0];
  const firstName = String(first?.firstName || '').trim();
  const lastName = String(first?.lastName || '').trim();
  const fullName = String(first?.fullName || `${firstName} ${lastName}` || '').trim();
  if (!orgId || !fullName) return base;

  let agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
  if (!agencyId) {
    agencyId = await AgencySchool.getActiveAgencyIdForSchool(orgId);
  }
  if (!agencyId) return base;

  const expectedInitials = deriveInitials(fullName);
  const dob = findDateLikeValue(first || {}) || normalizeDateOnly(first?.dateOfBirth || first?.date_of_birth);

  let sql = `SELECT c.id FROM clients c
    INNER JOIN client_organization_assignments coa
      ON coa.client_id = c.id AND coa.organization_id = ? AND coa.is_active = TRUE
    WHERE c.agency_id = ? AND c.initials = ?`;
  const params = [orgId, agencyId, expectedInitials];
  if (dob) {
    sql += ' AND (c.date_of_birth IS NULL OR DATE(c.date_of_birth) = ?)';
    params.push(dob);
  }
  sql += ' LIMIT 5';
  try {
    const [matches] = await pool.execute(sql, params);
    if (Array.isArray(matches) && matches.length === 1) {
      return {
        registration_client_match: 'existing',
        registration_matched_client_id: Number(matches[0].id) || null
      };
    }
  } catch {
    return base;
  }
  return base;
}

const parseFieldDefinitions = (rawFieldDefs) => {
  try {
    const parsed = rawFieldDefs
      ? (typeof rawFieldDefs === 'string' ? JSON.parse(rawFieldDefs) : rawFieldDefs)
      : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildDocumentFieldValuesForClient = ({ link, intakeData, clientIndex = 0, baseFieldValues = {} }) => {
  const merged = { ...(baseFieldValues || {}) };
  const responses = intakeData?.responses || {};
  const clientResponses = Array.isArray(responses?.clients) ? (responses.clients[clientIndex] || {}) : {};
  const guardianResponses = responses?.guardian || {};
  const submissionResponses = responses?.submission || {};
  const clientPayload = Array.isArray(intakeData?.clients) ? (intakeData.clients[clientIndex] || {}) : {};
  const guardianPayload = intakeData?.guardian || {};

  const setValue = (key, value) => {
    if (!key) return;
    if (!hasValue(value)) return;
    merged[key] = value;
  };

  const fullName = String(clientPayload?.fullName || '').trim()
    || `${String(clientPayload?.firstName || '').trim()} ${String(clientPayload?.lastName || '').trim()}`.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/);
    setValue('client_full_name', fullName);
    setValue('client_first', parts[0] || '');
    setValue('client_last', parts.slice(1).join(' ') || '');
  }
  setValue('client_initials', clientPayload?.initials || '');

  setValue('guardian_first', guardianPayload?.firstName || '');
  setValue('guardian_last', guardianPayload?.lastName || '');
  setValue('guardian_email', guardianPayload?.email || '');
  setValue('guardian_phone', guardianPayload?.phone || '');
  setValue('relationship', guardianPayload?.relationship || '');

  if (!hasValue(merged.client_first)) {
    const fallbackFirst =
      clientResponses?.client_first ||
      clientResponses?.clientFirst ||
      submissionResponses?.client_first ||
      submissionResponses?.clientFirst;
    setValue('client_first', fallbackFirst);
  }
  if (!hasValue(merged.client_last)) {
    const fallbackLast =
      clientResponses?.client_last ||
      clientResponses?.clientLast ||
      submissionResponses?.client_last ||
      submissionResponses?.clientLast;
    setValue('client_last', fallbackLast);
  }
  if (!hasValue(merged.relationship)) {
    const relKey = Object.keys(guardianResponses || {}).find((k) => String(k || '').toLowerCase().includes('relationship'));
    if (relKey && guardianResponses?.[relKey]) {
      setValue('relationship', guardianResponses[relKey]);
    } else {
      setValue('relationship', guardianResponses?.relationship || submissionResponses?.relationship || '');
    }
  }

  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  steps.forEach((step) => {
    if (step?.type !== 'questions' || !Array.isArray(step.fields)) return;
    step.fields.forEach((field) => {
      const documentKey = String(field?.documentKey || '').trim();
      if (!documentKey) return;
      const key = field?.key;
      if (!key) return;
      let value = clientResponses?.[key];
      if (!hasValue(value)) value = guardianResponses?.[key];
      if (!hasValue(value)) value = submissionResponses?.[key];
      if (hasValue(value)) merged[documentKey] = value;
    });
  });

  return merged;
};

/** Format YYYY-MM-DD as MM/DD/YYYY for display. */
const formatDateForDisplay = (val) => {
  const s = String(val || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [, yyyy, mm, dd] = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return `${mm}/${dd}/${yyyy}`;
};

const normalizeAnswerValue = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) {
    return val.map((entry) => normalizeAnswerValue(entry)).filter(Boolean).join(', ');
  }
  if (typeof val === 'object') {
    const o = val;
    const nestedKeys = ['details', 'detail', 'explanation', 'notes', 'text', 'description', 'value', 'comment', 'comments'];
    const pieces = [];
    for (const k of nestedKeys) {
      if (hasValue(o[k])) pieces.push(String(o[k]).trim());
    }
    if (pieces.length) return pieces.join(' — ');
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  const str = String(val);
  const formatted = formatDateForDisplay(str);
  if (formatted) return formatted;
  return str;
};

const buildIntakeFieldIndex = (link) => {
  const fields = Array.isArray(link?.intake_fields) ? link.intake_fields : [];
  const byKey = new Map();
  fields.forEach((field) => {
    if (!field?.key) return;
    byKey.set(field.key, field);
  });
  return { fields, byKey };
};

const getOrderedFieldsByScope = (fields, scope) =>
  fields.filter((field) => (field?.scope || 'client') === scope && field?.type !== 'info' && field?.key);

const isIntakeFieldVisible = (field, values = {}) => {
  const showIf = field?.showIf;
  if (!showIf || !showIf.fieldKey) return true;
  const actual = values[showIf.fieldKey];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map((v) => String(v).trim().toLowerCase()).includes(String(actual).trim().toLowerCase());
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
};

/** Like isIntakeFieldVisible but showIf resolves against merged maps (e.g. client keys on guardian/submission fields). */
const isIntakeFieldVisibleWithShowIfContext = (field, showIfContext) => {
  const showIf = field?.showIf;
  if (!showIf || !showIf.fieldKey) return true;
  const actual = showIfContext[showIf.fieldKey];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map((v) => String(v).trim().toLowerCase()).includes(String(actual).trim().toLowerCase());
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
};

const buildAnswerLinesForScope = ({ fields, responses }) => {
  const lines = [];
  fields.forEach((field) => {
    if (!isIntakeFieldVisible(field, responses)) return;
    const value = responses?.[field.key];
    if (!hasValue(value)) return;
    const label = String(field?.label || field?.key || '').trim() || String(field?.key || '').trim();
    const rendered = normalizeAnswerValue(value);
    if (!label || !rendered) return;
    lines.push({ key: field.key, label, value: rendered });
  });
  return lines;
};

export const buildIntakeAnswersText = ({ link, intakeData, clientIndex = 0 }) => {
  if (!intakeData) return '';
  const { fields } = buildIntakeFieldIndex(link);
  const intakeForSelf = Boolean(intakeData?.intakeForSelf);
  const guardianPayload = intakeData?.guardian || {};
  const clientPayload = Array.isArray(intakeData?.clients) ? intakeData.clients[clientIndex] : null;
  const responses = intakeData?.responses || {};
  const guardianResponses = responses?.guardian || {};
  const submissionResponses = responses?.submission || {};
  const clientResponses = Array.isArray(responses?.clients) ? (responses.clients[clientIndex] || {}) : {};

  const output = [];
  const pushHeader = (title) => {
    if (!title) return;
    if (output.length) output.push('');
    output.push(`${title}`);
    output.push('-'.repeat(title.length));
  };
  const pushLine = (label, value) => {
    if (!label || !hasValue(value)) return;
    output.push(`${label}: ${normalizeAnswerValue(value)}`);
  };

  // Keys that duplicate the built-in name lines — skip them in scope-based sections.
  const builtInNameKeys = new Set([
    'client_first', 'clientFirst', 'client_last', 'clientLast',
    'guardian_first', 'guardianFirst', 'guardian_last', 'guardianLast',
    'first_name', 'firstName', 'last_name', 'lastName'
  ]);

  if (intakeForSelf) {
    // Self-intake: the person IS the client, no separate guardian.
    const selfName = `${String(guardianPayload.firstName || '').trim()} ${String(guardianPayload.lastName || '').trim()}`.trim();
    pushHeader(`Your Information${selfName ? ` - ${selfName}` : ''}`);
    pushLine('First name', guardianPayload.firstName);
    pushLine('Last name', guardianPayload.lastName);
    pushLine('Email', guardianPayload.email);
    pushLine('Phone', guardianPayload.phone);

    // Self-scoped question answers
    const selfFields = getOrderedFieldsByScope(fields, 'self');
    const selfLines = buildAnswerLinesForScope({ fields: selfFields, responses: submissionResponses });
    if (selfLines.length) {
      pushHeader('Your Responses');
      selfLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
    }

    // Submission (one-time) answers — skip built-in name keys
    const submissionLines = buildAnswerLinesForScope({
      fields: getOrderedFieldsByScope(fields, 'submission').filter((f) => !builtInNameKeys.has(f.key)),
      responses: submissionResponses
    });
    if (submissionLines.length) {
      pushHeader('Additional Responses');
      submissionLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
    }
  } else {
    const clientFirst =
      clientPayload?.firstName ||
      clientResponses?.client_first ||
      clientResponses?.clientFirst ||
      submissionResponses?.client_first ||
      submissionResponses?.clientFirst;
    const clientLast =
      clientPayload?.lastName ||
      clientResponses?.client_last ||
      clientResponses?.clientLast ||
      submissionResponses?.client_last ||
      submissionResponses?.clientLast;
    const clientName =
      String(clientPayload?.fullName || '').trim() ||
      `${String(clientFirst || '').trim()} ${String(clientLast || '').trim()}`.trim();

    // Client info first
    pushHeader(`Client ${clientIndex + 1}${clientName ? ` - ${clientName}` : ''} Information`);
    pushLine('Client first name', clientFirst);
    pushLine('Client last name', clientLast);
    const clientLines = buildAnswerLinesForScope({
      fields: getOrderedFieldsByScope(fields, 'client').filter((f) => !builtInNameKeys.has(f.key)),
      responses: clientResponses
    });
    if (clientLines.length) {
      clientLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
    } else {
      output.push('No client answers captured.');
    }

    // Guardian info second
    pushHeader('Guardian Information');
    pushLine('Guardian first name', guardianPayload.firstName);
    pushLine('Guardian last name', guardianPayload.lastName);
    pushLine('Guardian email', guardianPayload.email);
    pushLine('Guardian phone', guardianPayload.phone);
    pushLine('Relationship', guardianPayload.relationship);

    const guardianLines = buildAnswerLinesForScope({
      fields: getOrderedFieldsByScope(fields, 'guardian'),
      responses: guardianResponses
    });
    if (guardianLines.length) {
      pushHeader('Guardian Questions');
      guardianLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
    }

    const submissionLines = buildAnswerLinesForScope({
      fields: getOrderedFieldsByScope(fields, 'submission').filter((f) => !builtInNameKeys.has(f.key)),
      responses: submissionResponses
    });
    if (submissionLines.length) {
      pushHeader('One-Time Questions');
      submissionLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
    }
  }

  // Registration selections made during the intake
  const registrationSelections = Array.isArray(submissionResponses?.registrationSelections)
    ? submissionResponses.registrationSelections
    : [];
  if (registrationSelections.length) {
    pushHeader('Registration Selections');
    registrationSelections.forEach((sel) => {
      const label = String(sel?.label || sel?.optionId || sel?.entityId || '').trim();
      const step = String(sel?.stepId || '').trim();
      const type = String(sel?.entityType || sel?.type || '').trim();
      const parts = [label];
      if (type) parts.push(`(${type})`);
      if (step) parts.push(`[Step: ${step}]`);
      output.push(parts.join(' '));
    });
  }

  // Guardian waiver sections captured for this client
  const waiverSectionLabels = {
    pickup_authorization: 'Pickup Authorization',
    emergency_contacts: 'Emergency Contacts',
    allergies_snacks: 'Medical Information & Allergies',
    meal_preferences: 'Meal Preferences'
  };
  const gwBundle =
    submissionResponses?.guardianWaiverIntake ||
    intakeData?.submission?.guardianWaiverIntake ||
    null;
  const gwClientRow = Array.isArray(gwBundle?.clients) ? (gwBundle.clients[clientIndex] || null) : null;
  if (gwClientRow?.sections && typeof gwClientRow.sections === 'object') {
    const waiverSections = Object.entries(gwClientRow.sections);
    if (waiverSections.length) {
      pushHeader('Guardian Waivers & Safety Information');
      for (const [key, sec] of waiverSections) {
        const sectionLabel = waiverSectionLabels[key] || key;
        const signed = String(sec?.signatureData || '').trim().length >= 80 ? 'Signed' : 'Not signed';
        output.push(`${sectionLabel}: ${signed}`);
        const payload = sec?.payload;
        if (!payload || typeof payload !== 'object') continue;
        // Format section-specific data
        if (key === 'pickup_authorization' && Array.isArray(payload.authorizedPickups)) {
          payload.authorizedPickups.forEach((p, i) => {
            const name = String(p?.name || '').trim();
            if (!name) return;
            const rel = String(p?.relationship || '').trim();
            const phone = String(p?.phone || '').trim();
            const info = [name, rel, phone].filter(Boolean).join(' | ');
            output.push(`  Pickup ${i + 1}: ${info}`);
          });
        } else if (key === 'emergency_contacts' && Array.isArray(payload.contacts)) {
          payload.contacts.forEach((c, i) => {
            const name = String(c?.name || '').trim();
            if (!name) return;
            const rel = String(c?.relationship || '').trim();
            const phone = String(c?.phone || '').trim();
            const info = [name, rel, phone].filter(Boolean).join(' | ');
            output.push(`  Contact ${i + 1}: ${info}`);
          });
        } else if (key === 'allergies_snacks') {
          if (payload.allergies) output.push(`  Allergies/Medical notes: ${payload.allergies}`);
          if (payload.approvedSnacks) output.push(`  Approved snacks: ${payload.approvedSnacks}`);
          if (payload.notes) output.push(`  Notes: ${payload.notes}`);
        } else if (key === 'meal_preferences') {
          if (payload.allowedMeals) output.push(`  Allowed meals: ${payload.allowedMeals}`);
          if (payload.restrictedMeals) output.push(`  Restricted meals: ${payload.restrictedMeals}`);
          if (payload.notes) output.push(`  Notes: ${payload.notes}`);
        }
      }
    }
  }

  // Insurance information
  const insInfo = submissionResponses?.insuranceInfo || intakeData?.submission?.insuranceInfo || null;
  if (insInfo && typeof insInfo === 'object') {
    const pri = insInfo.primary && typeof insInfo.primary === 'object' ? insInfo.primary : null;
    const sec = insInfo.secondary && typeof insInfo.secondary === 'object' ? insInfo.secondary : null;
    const hasPrimary = pri && (
      String(pri.insurerName || '').trim() ||
      String(pri.memberId || '').trim() ||
      String(pri.subscriberName || '').trim()
    );
    const hasSecondary = sec && (
      String(sec.insurerName || '').trim() ||
      String(sec.memberId || '').trim()
    );
    const isMedicaidPrimary = !!insInfo.primaryIsMedicaid;
    if (hasPrimary || hasSecondary || insInfo.noPrimaryCardAvailable) {
      pushHeader('Insurance Information');
      if (insInfo.noPrimaryCardAvailable) {
        output.push('No insurance card on file at time of intake.');
      }
      if (hasPrimary) {
        if (String(pri.insurerName || '').trim()) output.push(`Primary Insurance Carrier: ${pri.insurerName}`);
        if (String(pri.subscriberName || '').trim()) output.push(`Primary Subscriber Name: ${pri.subscriberName}`);
        if (String(pri.memberId || '').trim()) output.push(`Primary Member ID: ${pri.memberId}`);
        if (!isMedicaidPrimary && String(pri.groupNumber || '').trim()) output.push(`Primary Group Number: ${pri.groupNumber}`);
        if (!isMedicaidPrimary && String(pri.patientSuffix || '').trim()) output.push(`Primary Patient Suffix: ${pri.patientSuffix}`);
      } else if (!insInfo.noPrimaryCardAvailable) {
        output.push('Primary Insurance: Self-Pay / No Insurance');
      }
      if (hasSecondary) {
        if (String(sec.insurerName || '').trim()) output.push(`Secondary Insurance Carrier: ${sec.insurerName}`);
        if (String(sec.subscriberName || '').trim()) output.push(`Secondary Subscriber Name: ${sec.subscriberName}`);
        if (String(sec.memberId || '').trim()) output.push(`Secondary Member ID: ${sec.memberId}`);
        if (String(sec.groupNumber || '').trim()) output.push(`Secondary Group Number: ${sec.groupNumber}`);
      }
      // Per-client Medicaid IDs (multi-child Medicaid)
      const medicaidByClient = Array.isArray(insInfo.medicaidByClient) ? insInfo.medicaidByClient : [];
      if (medicaidByClient.length > 1) {
        output.push('Per-Client Medicaid Member IDs:');
        medicaidByClient.forEach((mc) => {
          const name = String(mc?.clientName || '').trim();
          const mid = String(mc?.memberId || '').trim();
          if (name || mid) output.push(`  ${name || 'Client'}: ${mid || '(not provided)'}`);
        });
      }
    }
  }

  return output.join('\n').trim();
};

const parsePscScore = (value) => {
  if (!hasValue(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(2, Math.round(value)));
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(2, Math.round(numeric)));
  }
  const normalized = raw.toLowerCase();
  if (normalized.includes('never') || normalized.includes('not at all')) return 0;
  if (normalized.includes('sometimes') || normalized.includes('somewhat')) return 1;
  if (normalized.includes('often') || normalized.includes('very')) return 2;
  return null;
};

const summaryExcludePattern = /insurance|member id|policy|subscriber|payer|medicaid|medicare|coverage|group|plan|billing|ssn|social security|address|street|city|state|zip|postal|phone|email|contact|relationship|guardian first|guardian last|client first|client last|full name|middle name|date of birth|birthdate|dob|grade|school|legal right|custodian|sms|text message|communication preference|apartment|apt/i;
const summaryExcludeKeyPattern = /legal|custodian|sms|text|communication|apartment|address|phone|email|relationship|client_first|client_last|guardian_first|guardian_last|dob|birth|grade|school/i;

export const buildClinicalSummaryText = ({ link, intakeData, clientIndex = 0 }) => {
  if (!intakeData) return '';
  const { fields, byKey } = buildIntakeFieldIndex(link);
  const responses = intakeData?.responses || {};
  const guardianResponses = responses?.guardian || {};
  const submissionResponses = responses?.submission || {};
  const clientResponses = Array.isArray(responses?.clients) ? (responses.clients[clientIndex] || {}) : {};
  const clientPayload = Array.isArray(intakeData?.clients) ? intakeData.clients[clientIndex] : null;

  const clientName =
    String(clientPayload?.fullName || '').trim() ||
    `${String(clientPayload?.firstName || '').trim()} ${String(clientPayload?.lastName || '').trim()}`.trim();

  const output = [];
  const isExampleValue = (val) => {
    if (!hasValue(val)) return false;
    const normalized = String(val).trim().toLowerCase();
    return normalized === 'example' || normalized === 'yes_full';
  };
  const isYes = (val) => {
    if (!hasValue(val)) return false;
    const normalized = String(val).trim().toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
  };
  output.push('Clinical Intake Summary');
  output.push('=======================');
  if (clientName) {
    output.push(`Client: ${clientName}`);
    output.push('');
  }

  const pscItems = [];
  for (let i = 1; i <= 17; i += 1) {
    const key = `psc_${i}`;
    const raw = clientResponses?.[key];
    if (!hasValue(raw)) continue;
    const score = parsePscScore(raw);
    const field = byKey.get(key);
    const label = String(field?.label || key).trim() || key;
    pscItems.push({ index: i, key, label, value: normalizeAnswerValue(raw), score });
  }

  const formatElevated = (score, cutoff) => (score >= cutoff ? 'Elevated' : 'Not Elevated');
  const buildH0002Narrative = ({
    attentionScore,
    internalScore,
    externalScore,
    totalScore,
    traumaIndicators,
    goals,
    traumaHasWrittenDetails = false
  }) => {
    const attentionStatus = formatElevated(attentionScore, 7);
    const internalStatus = formatElevated(internalScore, 5);
    const externalStatus = formatElevated(externalScore, 7);
    const totalStatus = totalScore >= 15 ? 'clinically significant' : 'below clinical cutoff';
    const traumaText = traumaIndicators.length
      ? `Trauma indicators were endorsed (${traumaIndicators.join('; ')}).${
          traumaHasWrittenDetails ? ' Additional narrative details were provided in the intake responses (see Clinical History).' : ''
        }`
      : 'No trauma indicators were endorsed.';
    const goalsText = goals.length
      ? `Client goals include: ${goals.map((g) => g.value).join('; ')}.`
      : 'Client goals were not reported.';
    return (
      `PSC-17 was completed to assess fit and functioning and establish a baseline for services. ` +
      `Scores indicate Attention is ${attentionStatus}, Internalizing is ${internalStatus}, and Externalizing is ${externalStatus}; total score is ${totalStatus}. ` +
      `${traumaText} ${goalsText} ` +
      `Findings support the need for structured support and ongoing monitoring of emotional and behavioral functioning.`
    ).trim();
  };

  let attentionScore = 0;
  let internalScore = 0;
  let externalScore = 0;
  let totalScore = 0;
  let answered = 0;
  if (pscItems.length) {
    const attentionKeys = [1, 3, 7, 13, 17];
    const internalKeys = [2, 6, 9, 11, 15];
    const externalKeys = [4, 5, 8, 10, 12, 14, 16];
    const sumScores = (keys) =>
      keys.reduce((acc, idx) => {
        const item = pscItems.find((entry) => entry.index === idx);
        return acc + (item?.score ?? 0);
      }, 0);
    totalScore = pscItems.reduce((acc, entry) => acc + (entry?.score ?? 0), 0);
    answered = pscItems.filter((entry) => entry.score !== null).length;
    attentionScore = sumScores(attentionKeys);
    internalScore = sumScores(internalKeys);
    externalScore = sumScores(externalKeys);
    output.push('PSC-17 Summary');
    output.push('--------------');
    output.push(`Total score: ${totalScore} (${answered} of 17 answered)`);
    output.push(`Attention: ${attentionScore}`);
    output.push(`Internalizing: ${internalScore}`);
    output.push(`Externalizing: ${externalScore}`);
    output.push('');
    output.push('Interpretation');
    output.push('-------------');
    output.push(
      attentionScore >= 7
        ? 'Attention scores indicate clinically significant concerns with focus and attention.'
        : 'Functioning within normal limits; attention does not appear to be a primary barrier.'
    );
    output.push(
      internalScore >= 5
        ? 'Scores indicate the presence of emotional distress, meeting the threshold for clinical risk.'
        : 'Internalizing scores do not indicate clinically significant distress.'
    );
    output.push(
      externalScore >= 7
        ? 'Scores indicate behavioral dysregulation and interpersonal conflict, meeting the threshold for clinical risk.'
        : 'Externalizing scores do not indicate clinically significant behavioral dysregulation.'
    );
    output.push(
      totalScore >= 15
        ? 'Total PSC-17 score meets the overall clinical cutoff for risk.'
        : 'Total PSC-17 score is below the overall clinical cutoff.'
    );
    output.push('');
  }

  const shouldExcludeSummaryLine = (line) => {
    if (!line?.label || !hasValue(line?.value)) return true;
    if (isExampleValue(line?.value)) return true;
    const label = String(line.label);
    if (summaryExcludePattern.test(label)) return true;
    const key = String(line.key || '').toLowerCase();
    if (key && summaryExcludeKeyPattern.test(key)) return true;
    return false;
  };

  const pushClinicalLines = (lines) => {
    lines.forEach((line) => {
      if (shouldExcludeSummaryLine(line)) return;
      const label = String(line.label);
      output.push(`${label}: ${line.value}`);
    });
  };

  const orderedGuardian = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'guardian'),
    responses: guardianResponses
  });
  const orderedSubmission = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'submission'),
    responses: submissionResponses
  });
  const orderedClient = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'client'),
    responses: clientResponses
  }).filter((line) => !/^psc_\d+$/i.test(line.key || ''));

  const traumaQuestionPatterns = [
    /physical harm|abuse/i,
    /neglect|lack of appropriate care/i,
    /emotional harm|mistreatment|intimidation/i
  ];

  const traumaEntries = [];
  const seenTraumaQuestionKeys = new Set();
  for (const line of orderedClient) {
    if (shouldExcludeSummaryLine(line)) continue;
    const labelLower = String(line.label || '').toLowerCase();
    if (!traumaQuestionPatterns.some((p) => p.test(labelLower))) continue;
    if (!isYes(line.value)) continue;
    const k = String(line.key || '').trim();
    if (!k || seenTraumaQuestionKeys.has(k)) continue;
    seenTraumaQuestionKeys.add(k);
    traumaEntries.push({ key: k, label: String(line.label).trim() });
  }
  const traumaParentKeys = new Set(traumaEntries.map((e) => e.key));
  const traumaLabels = traumaEntries.map((e) => e.label);

  const clientScopeFields = getOrderedFieldsByScope(fields, 'client');
  const clientFieldOrder = new Map();
  clientScopeFields.forEach((f, i) => {
    if (f?.key) clientFieldOrder.set(String(f.key), i);
  });

  const showIfMerge = { ...submissionResponses, ...guardianResponses, ...clientResponses };

  const pushFollowUpsForScope = (scopeFields, scopeResponses, out, seenKeys) => {
    for (const field of scopeFields) {
      const parentKey = String(field?.showIf?.fieldKey || '').trim();
      if (!parentKey || !traumaParentKeys.has(parentKey)) continue;
      const fk = String(field.key || '').trim();
      if (!fk || traumaParentKeys.has(fk)) continue;
      if (/^psc_\d+$/i.test(fk)) continue;
      if (!isIntakeFieldVisibleWithShowIfContext(field, showIfMerge)) continue;
      const raw = scopeResponses?.[field.key];
      if (!hasValue(raw)) continue;
      const label = String(field?.label || field?.key || '').trim();
      const rendered = normalizeAnswerValue(raw);
      const lineObj = { key: fk, label, value: rendered };
      if (shouldExcludeSummaryLine(lineObj)) continue;
      if (!hasValue(rendered)) continue;
      if (seenKeys.has(fk)) continue;
      seenKeys.add(fk);
      out.push(lineObj);
    }
  };

  const collectTraumaFollowUpLines = () => {
    const out = [];
    const seenKeys = new Set();
    pushFollowUpsForScope(clientScopeFields, clientResponses, out, seenKeys);
    pushFollowUpsForScope(getOrderedFieldsByScope(fields, 'guardian'), guardianResponses, out, seenKeys);
    pushFollowUpsForScope(getOrderedFieldsByScope(fields, 'submission'), submissionResponses, out, seenKeys);
    return out;
  };

  const elaborationLabelPattern =
    /describe|explanation|details|elaborat|please explain|if you (answered|selected) yes|tell us more|additional information|more about|please provide/i;

  const collectHeuristicTraumaElaborationLines = () => {
    if (!traumaParentKeys.size) return [];
    const out = [];
    const seenKeys = new Set();
    const scanLines = (lines) => {
      for (const line of lines) {
        if (/^psc_\d+$/i.test(line.key || '')) continue;
        if (shouldExcludeSummaryLine(line)) continue;
        const fk = String(line.key || '').trim();
        if (!fk || traumaParentKeys.has(fk)) continue;
        if (!elaborationLabelPattern.test(String(line.label || ''))) continue;
        if (isYes(line.value)) continue;
        if (seenKeys.has(fk)) continue;
        seenKeys.add(fk);
        out.push({ key: fk, label: line.label, value: line.value });
      }
    };
    scanLines(orderedClient);
    scanLines(orderedGuardian);
    scanLines(orderedSubmission);
    return out;
  };

  let traumaFollowUpLines = collectTraumaFollowUpLines();
  for (const extra of collectHeuristicTraumaElaborationLines()) {
    if (traumaFollowUpLines.some((x) => x.key === extra.key)) continue;
    traumaFollowUpLines.push(extra);
  }
  traumaFollowUpLines.sort(
    (a, b) => (clientFieldOrder.get(a.key) ?? 9999) - (clientFieldOrder.get(b.key) ?? 9999)
  );

  const goalLines = [...orderedClient, ...orderedSubmission].filter((line) => {
    if (shouldExcludeSummaryLine(line)) return false;
    const label = String(line.label || '').toLowerCase();
    return label.includes('hope') && label.includes('gain');
  });

  if (traumaLabels.length) {
    output.push('Clinical History');
    output.push('----------------');
    output.push(`Trauma indicators endorsed: ${traumaLabels.join('; ')}.`);
    if (traumaFollowUpLines.length) {
      output.push('');
      output.push('Reported details:');
      traumaFollowUpLines.forEach((line) => {
        output.push(`- ${line.label}: ${line.value}`);
      });
    }
    output.push('');
  }
  if (goalLines.length) {
    output.push('Client Goals');
    output.push('------------');
    goalLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
    output.push('');
  } else if (!pscItems.length) {
    output.push('No clinical responses captured.');
  }

  if (pscItems.length) {
    const h0002Narrative = buildH0002Narrative({
      attentionScore,
      internalScore,
      externalScore,
      totalScore,
      traumaIndicators: traumaLabels,
      goals: goalLines,
      traumaHasWrittenDetails: traumaFollowUpLines.length > 0
    });
    output.push('H0002 Narrative');
    output.push('--------------');
    output.push(h0002Narrative);
    output.push('');
    output.push(
      `Objective Output: Client scored in the ${formatElevated(attentionScore, 7)} range for Attention (${attentionScore}; Cutoff >= 7), ` +
      `the ${formatElevated(internalScore, 5)} range for Internalizing (${internalScore}; Cutoff >= 5), and the ${formatElevated(externalScore, 7)} range for Externalizing (${externalScore}; Cutoff >= 7). ` +
      `Total Score was ${totalScore} (Cutoff >= 15).`
    );
    output.push('Diagnosis: Deferred (R69 – Illness, unspecified) or Z03.89 – Encounter for observation for other suspected diseases and conditions ruled out.');
  }

  return output.join('\n').trim();
};

const createIntakeTextDocuments = async ({
  clientId,
  clientRow,
  submissionId,
  link,
  intakeData,
  clientIndex,
  ipAddress,
  expiresAt,
  organizationId = null
}) => {
  if (!clientId || !intakeData) return;
  const agencyId = clientRow?.agency_id || link?.organization_id || null;
  const orgId =
    clientRow?.organization_id ||
    clientRow?.school_organization_id ||
    organizationId ||
    link?.organization_id ||
    null;
  const answersText = buildIntakeAnswersText({ link, intakeData, clientIndex });
  const summaryText = buildClinicalSummaryText({ link, intakeData, clientIndex });
  const docsToCreate = [
    {
      text: answersText,
      filename: `intake-answers-client-${clientId}.txt`,
      title: 'Intake Responses',
      type: 'Intake Responses',
      auditKind: 'intake_answers'
    },
    {
      text: summaryText,
      filename: `intake-clinical-summary-client-${clientId}.txt`,
      title: 'Clinical Intake Summary',
      type: 'Clinical Summary',
      auditKind: 'clinical_summary'
    }
  ];

  for (const doc of docsToCreate) {
    if (!doc.text) continue;
    try {
      const storageResult = await StorageService.saveIntakeTextDocument({
        submissionId,
        clientId,
        fileBuffer: Buffer.from(doc.text, 'utf8'),
        filename: doc.filename
      });
      const resolvedOrgId =
        clientRow?.organization_id ||
        clientRow?.school_organization_id ||
        organizationId ||
        agencyId ||
        null;
      const phiDoc = await ClientPhiDocument.create({
        clientId,
        agencyId,
        schoolOrganizationId: resolvedOrgId || agencyId,
        intakeSubmissionId: submissionId,
        storagePath: storageResult.relativePath,
        originalName: doc.filename,
        documentTitle: doc.title,
        documentType: doc.type,
        mimeType: 'text/plain',
        uploadedByUserId: null,
        scanStatus: 'clean',
        expiresAt: expiresAt || null
      });
      await PhiDocumentAuditLog.create({
        documentId: phiDoc.id,
        clientId,
        action: 'uploaded',
        actorUserId: null,
        actorLabel: 'public_intake',
        ipAddress: ipAddress || null,
        metadata: { submissionId, kind: doc.auditKind }
      });
    } catch (err) {
      // best-effort; do not block public intake
      console.error('createIntakeTextDocuments failed', {
        clientId,
        submissionId,
        filename: doc.filename,
        error: err?.message || err,
        code: err?.code,
        sqlState: err?.sqlState
      });
    }
  }
};

const createIntakePacketDocument = async ({
  clientId,
  clientRow,
  submissionId,
  storagePath,
  ipAddress,
  expiresAt,
  link,
  organizationId = null
}) => {
  if (!clientId || !storagePath) return;
  const agencyId = clientRow?.agency_id || link?.organization_id || null;
  const orgId =
    clientRow?.organization_id ||
    clientRow?.school_organization_id ||
    organizationId ||
    link?.organization_id ||
    null;
  try {
    const phiDoc = await ClientPhiDocument.create({
      clientId,
      agencyId,
      schoolOrganizationId: orgId || agencyId,
      intakeSubmissionId: submissionId,
      storagePath,
      originalName: 'Intake Packet (Signed)',
      documentTitle: 'Intake Packet',
      documentType: 'Intake Packet',
      mimeType: 'application/pdf',
      uploadedByUserId: null,
      scanStatus: 'clean',
      expiresAt: expiresAt || null
    });
    await PhiDocumentAuditLog.create({
      documentId: phiDoc.id,
      clientId,
      action: 'uploaded',
      actorUserId: null,
      actorLabel: 'public_intake',
      ipAddress: ipAddress || null,
      metadata: { submissionId, kind: 'intake_packet' }
    });
  } catch (err) {
    // best-effort; do not block public intake
    console.error('createIntakePacketDocument failed', {
      clientId,
      submissionId,
      storagePath,
      error: err?.message || err,
      code: err?.code,
      sqlState: err?.sqlState
    });
  }
};

export const approvePublicIntake = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    ActivityLogService.logActivity(
      {
        actionType: 'intake_approval',
        metadata: {
          intakeLinkId: link.id,
          scopeType: link.scope_type || null,
          organizationId: link.organization_id || null,
          programId: link.program_id || null,
          portalOrganizationId: req.body?.organizationId || null,
          approvalMode: req.body?.mode || 'staff_assisted',
          staffLastName: req.body?.staffLastName || null,
          clientFirstName: req.body?.clientFirstName || null
        }
      },
      req
    );

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};

const toOrgPayload = (org) => {
  if (!org) return null;
  return {
    id: org.id,
    name: org.name || null,
    official_name: org.official_name || null,
    organization_type: org.organization_type || null,
    logo_url: org.logo_url || null,
    logo_path: org.logo_path || null
  };
};

const toBooleanSafe = (value) => {
  if (value === true || value === 1) return true;
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const parseJobApplicationContext = (intakeData, link = null) => {
  const submission = intakeData?.responses?.submission && typeof intakeData.responses.submission === 'object'
    ? intakeData.responses.submission
    : {};
  const uploadTextByStep = submission?.uploadTextByStep && typeof submission.uploadTextByStep === 'object'
    ? submission.uploadTextByStep
    : {};
  const intakeSteps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  const findUploadTextByLabel = (matcher) => {
    const rx = matcher instanceof RegExp ? matcher : null;
    if (!rx) return null;
    for (const [stepId, value] of Object.entries(uploadTextByStep)) {
      if (value === null || value === undefined) continue;
      const step = intakeSteps.find((s) => String(s?.id || '') === String(stepId || ''));
      const label = String(step?.label || '').trim().toLowerCase();
      if (!rx.test(label)) continue;
      const text = String(value || '').trim();
      if (text) return text;
    }
    return null;
  };
  const coverLetterTextRaw =
    intakeData?.coverLetterText
    ?? submission.coverLetterText
    ?? findUploadTextByLabel(/cover/)
    ?? null;
  const coverLetterText = coverLetterTextRaw !== null && coverLetterTextRaw !== undefined
    ? String(coverLetterTextRaw || '').trim().slice(0, 20000) || null
    : null;
  const resumeTextRaw =
    intakeData?.resumeText
    ?? submission.resumeText
    ?? findUploadTextByLabel(/resume|cv/)
    ?? null;
  const resumeText = resumeTextRaw !== null && resumeTextRaw !== undefined
    ? String(resumeTextRaw || '').trim().slice(0, 40000) || null
    : null;
  const referencesRaw = intakeData?.referencesJson ?? submission.references ?? submission.professionalReferences ?? null;
  const referencesJson = Array.isArray(referencesRaw) ? referencesRaw.slice(0, 20) : null;
  const fluentLanguagesRaw =
    intakeData?.fluentLanguages
    ?? submission.fluentLanguages
    ?? submission.languagesSpoken
    ?? null;
  const fluentLanguagesJson = Array.isArray(fluentLanguagesRaw)
    ? fluentLanguagesRaw.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 30)
    : [];
  const jobAcknowledged = toBooleanSafe(
    intakeData?.jobDescriptionAcknowledged
      ?? submission.jobDescriptionAcknowledged
      ?? submission.jobAcknowledged
      ?? false
  );
  return { coverLetterText, resumeText, referencesJson, fluentLanguagesJson, jobAcknowledged };
};

export const listPublicCareers = async (req, res, next) => {
  try {
    const agencySlug = String(req.params?.agencySlug || '').trim().toLowerCase();
    if (!agencySlug) {
      return res.status(400).json({ error: { message: 'agencySlug is required' } });
    }
    const agency = await Agency.findBySlug(agencySlug);
    if (!agency?.id) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    const cityFilter = String(req.query?.city || '').trim().toLowerCase();
    const stateFilter = String(req.query?.state || '').trim().toLowerCase();
    const educationFilter = String(req.query?.educationLevel || '').trim().toLowerCase();

    const [rows] = await pool.execute(
      `SELECT
        hjd.id,
        hjd.title,
        hjd.description_text,
        hjd.posted_date,
        hjd.application_deadline,
        hjd.city,
        hjd.state,
        hjd.education_level,
        hjd.storage_path,
        hjd.original_name,
        hjd.created_at,
        il.public_key
      FROM hiring_job_descriptions hjd
      LEFT JOIN intake_links il
        ON il.job_description_id = hjd.id
       AND il.form_type = 'job_application'
       AND il.is_active = 1
      WHERE hjd.agency_id = ?
        AND hjd.is_active = 1
      ORDER BY hjd.updated_at DESC, hjd.id DESC`,
      [agency.id]
    );

    const jobs = (rows || [])
      .filter((r) => !!r?.public_key)
      .filter((r) => (cityFilter ? String(r.city || '').trim().toLowerCase() === cityFilter : true))
      .filter((r) => (stateFilter ? String(r.state || '').trim().toLowerCase() === stateFilter : true))
      .filter((r) => (educationFilter ? String(r.education_level || '').trim().toLowerCase() === educationFilter : true))
      .map((r) => ({
        jobId: Number(r.id),
        title: String(r.title || '').trim(),
        descriptionText: String(r.description_text || '').trim() || null,
        postedDate: r.posted_date || null,
        applicationDeadline: r.application_deadline || null,
        city: String(r.city || '').trim() || null,
        state: String(r.state || '').trim() || null,
        educationLevel: String(r.education_level || '').trim() || null,
        jobDescriptionFileUrl: null,
        jobDescriptionFileName: String(r.original_name || '').trim() || null,
        postedAt: r.created_at || null,
        applicationPublicKey: String(r.public_key || '').trim()
      }));
    for (const job of jobs) {
      const source = (rows || []).find((r) => Number(r.id) === Number(job.jobId));
      const storagePath = String(source?.storage_path || '').trim();
      if (!storagePath) continue;
      try {
        job.jobDescriptionFileUrl = await StorageService.getSignedUrl(storagePath, 30);
      } catch {
        job.jobDescriptionFileUrl = null;
      }
    }

    return res.json({
      agency: {
        id: agency.id,
        slug: agency.slug || null,
        name: agency.name || null,
        officialName: agency.official_name || null,
        logoUrl: agency.logo_url || null
      },
      jobs
    });
  } catch (error) {
    return next(error);
  }
};

const requiresCaptchaForLink = (organization, agency) => {
  const forAll = String(process.env.RECAPTCHA_REQUIRED_FOR_ALL || '').toLowerCase() === 'true';
  if (forAll) return true;
  const names = process.env.RECAPTCHA_REQUIRED_ORG_NAMES;
  if (!names || typeof names !== 'string') return false;
  const list = names.split(',').map((s) => String(s || '').trim().toLowerCase()).filter(Boolean);
  if (!list.length) return false;
  const check = (org) => {
    if (!org) return false;
    const n = String(org.name || '').trim().toLowerCase();
    const o = String(org.official_name || '').trim().toLowerCase();
    return list.some((x) => n === x || o === x || n.includes(x) || o.includes(x));
  };
  return check(organization) || check(agency);
};

const isLocalRecaptchaBypassRequest = (req) => {
  const host = String(req.get('host') || '').toLowerCase();
  const origin = String(req.get('origin') || req.get('referer') || '').toLowerCase();
  return host.includes('localhost') || host.includes('127.0.0.1') || origin.includes('localhost') || origin.includes('127.0.0.1');
};

const notifyUnassignedDocuments = async ({ link, submission, docCount }) => {
  if (!link || !submission || !docCount || docCount < 1) return;
  try {
    const { agency } = await resolveIntakeOrgContext(link);
    const agencyId = agency?.id || link?.organization_id || null;
    if (!agencyId) return;
    const signerName = String(submission?.signer_name || '').trim() || 'Someone';
    const formTitle = String(link?.title || '').trim() || 'Public form';
    const isMedicalRecords = String(link?.form_type || '').toLowerCase() === 'medical_records_request';

    if (isMedicalRecords) {
      await Notification.create({
        type: 'medical_records_release_submitted',
        severity: 'critical',
        title: 'Medical Records Release Submitted',
        message: `${formTitle}: ${signerName} submitted a medical records release. View in Submitted Documents.`,
        audienceJson: {
          admin: true,
          clinicalPracticeAssistant: false,
          supervisor: false,
          provider: false
        },
        userId: null,
        agencyId,
        relatedEntityType: 'intake_submission',
        relatedEntityId: submission.id,
        actorUserId: null
      });
    } else {
      await Notification.create({
        type: 'unassigned_document_submitted',
        severity: 'info',
        title: 'New unassigned document(s)',
        message: `${formTitle}: ${signerName} submitted ${docCount} document(s). Assign to a client in Unassigned Documents.`,
        audienceJson: {
          admin: true,
          clinicalPracticeAssistant: false,
          supervisor: false,
          provider: false
        },
        userId: null,
        agencyId,
        relatedEntityType: 'intake_submission',
        relatedEntityId: submission.id,
        actorUserId: null
      });
    }
  } catch {
    // best-effort; do not block submission
  }
};

const resolveIntakeOrgContext = async (link, { issuedRoiLink = null, boundClient = null } = {}) => {
  if (!link) return { organization: null, agency: null };

  const scope = String(link.scope_type || 'agency');
  const isSmartRoi = String(link.form_type || '').trim().toLowerCase() === 'smart_school_roi';
  const smartSchoolOrgId = isSmartRoi
    ? (
        Number(issuedRoiLink?.school_organization_id || 0)
        || Number(boundClient?.organization_id || 0)
        || Number(boundClient?.school_organization_id || 0)
        || Number(link.organization_id || 0)
      )
    : 0;
  const orgId = isSmartRoi
    ? (smartSchoolOrgId || null)
    : (link.organization_id ? parseInt(link.organization_id, 10) : null);
  let organization = null;
  let agency = null;

  if (orgId) {
    organization = await Agency.findById(orgId);
  }

  if (scope === 'agency') {
    agency = organization;
    if (!agency && link.created_by_user_id) {
      try {
        const agencies = await User.getAgencies(link.created_by_user_id);
        agency = agencies.find((a) => String(a.organization_type || 'agency') === 'agency') || agencies[0] || null;
      } catch {
        agency = null;
      }
    }
    return { organization, agency };
  }

  let agencyId = null;
  if (orgId) {
    if (scope === 'school') {
      agencyId = await AgencySchool.getActiveAgencyIdForSchool(orgId);
    }
    if (!agencyId) {
      agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
    }
  }
  if (agencyId) {
    agency = await Agency.findById(agencyId);
  }
  return { organization, agency };
};

const normalizeRetentionPolicy = (raw) => {
  if (!raw) return { mode: 'inherit', days: null };
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return { mode: 'inherit', days: null };
  const modeRaw = String(parsed.mode || 'inherit').toLowerCase();
  const mode = ['inherit', 'days', 'never'].includes(modeRaw) ? modeRaw : 'inherit';
  const days = Number.isFinite(Number(parsed.days)) ? Number(parsed.days) : null;
  return { mode, days };
};

const resolveRetentionPolicy = async (link) => {
  const platform = await PlatformRetentionSettings.get();
  const platformPolicy = {
    mode: String(platform.default_intake_retention_mode || 'days'),
    days: Number(platform.default_intake_retention_days || 14)
  };
  const { agency } = await resolveIntakeOrgContext(link);
  const agencyPolicy = normalizeRetentionPolicy(agency?.intake_retention_policy_json);
  const linkPolicy = normalizeRetentionPolicy(link?.retention_policy_json);

  const resolve = (policy, fallback) => {
    if (!policy || policy.mode === 'inherit') return fallback;
    if (policy.mode === 'never') return { mode: 'never', days: null };
    if (policy.mode === 'days') {
      const days = Number.isFinite(Number(policy.days)) ? Number(policy.days) : fallback?.days;
      return { mode: 'days', days };
    }
    return fallback;
  };

  const base = resolve(platformPolicy, { mode: 'days', days: 14 });
  const agencyResolved = resolve(agencyPolicy, base);
  return resolve(linkPolicy, agencyResolved);
};

const buildRetentionExpiresAt = ({ policy, submittedAt }) => {
  if (!policy || policy.mode === 'never') return null;
  const days = Number.isFinite(Number(policy.days)) ? Number(policy.days) : null;
  if (!days || days <= 0) return null;
  const clamped = Math.max(1, Math.min(3650, Math.round(days)));
  const base = submittedAt ? new Date(submittedAt) : new Date();
  const expires = new Date(base.getTime());
  expires.setDate(expires.getDate() + clamped);
  return expires;
};

const loadAllowedTemplates = async (link) => {
  const allowedIds = Array.isArray(link.allowed_document_template_ids)
    ? link.allowed_document_template_ids
    : [];
  if (!allowedIds.length) return [];

  const templates = [];
  for (const id of allowedIds) {
    const t = await DocumentTemplate.findById(id);
    if (t && t.is_active) templates.push(t);
  }
  return templates;
};

const INTAKE_STEP_VISIBILITY = new Set(['always', 'new_client_only', 'existing_client_only']);

const extractRegistrationClientMatchFromIntakeData = (intakeData) => {
  if (!intakeData || typeof intakeData !== 'object') return '';
  const r = intakeData.responses;
  if (r?.submission && typeof r.submission === 'object') {
    return r.submission.registration_client_match;
  }
  if (intakeData.submission && typeof intakeData.submission === 'object') {
    return intakeData.submission.registration_client_match;
  }
  return '';
};

const isIntakeStepVisibleForClientMatch = (step, registrationClientMatch, link) => {
  if (!linkSupportsPublicRegistrationFeatures(link)) return true;
  // Missing / blank / unknown visibility → same as always (existing intakes without this field keep full flow).
  const vis = (String(step?.visibility ?? '').trim().toLowerCase() || 'always');
  if (!INTAKE_STEP_VISIBILITY.has(vis) || vis === 'always') return true;
  const match = String(registrationClientMatch || '').trim().toLowerCase();
  const isExisting = match === 'existing';
  if (vis === 'new_client_only') return !isExisting;
  if (vis === 'existing_client_only') return isExisting;
  return true;
};

/** Document templates the signer must have completed for this submission (matches public flowSteps documents). */
const filterPacketDocumentTemplates = (link, allAllowedTemplates, intakeData) => {
  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  const byId = new Map((allAllowedTemplates || []).filter(Boolean).map((t) => [Number(t.id), t]));
  if (!steps.length) {
    return (allAllowedTemplates || []).slice();
  }
  const match = extractRegistrationClientMatchFromIntakeData(intakeData);
  const ordered = [];
  const seen = new Set();
  for (const step of steps) {
    if (String(step?.type || '').trim().toLowerCase() !== 'document') continue;
    if (!isIntakeStepVisibleForClientMatch(step, match, link)) continue;
    const tid = Number(step.templateId);
    if (!Number.isFinite(tid) || tid <= 0 || !byId.has(tid)) continue;
    if (seen.has(tid)) continue;
    seen.add(tid);
    ordered.push(byId.get(tid));
  }
  return ordered;
};

const loadTemplateById = async (link, templateId) => {
  const allowedIds = Array.isArray(link.allowed_document_template_ids)
    ? link.allowed_document_template_ids
    : [];
  if (!allowedIds.includes(templateId)) return null;
  const template = await DocumentTemplate.findById(templateId);
  if (!template || !template.is_active) return null;
  return template;
};

const hasProgrammedSchoolRoiStep = (link) => {
  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  return steps.some((step) => String(step?.type || '').trim().toLowerCase() === 'school_roi');
};

const applySmartRoiPayloadFallback = (body) => {
  if (!body || typeof body !== 'object') return;
  const smartRoi = body?.intakeData?.smartSchoolRoi;
  if (!smartRoi || typeof smartRoi !== 'object') return;

  const signer = smartRoi?.signer && typeof smartRoi.signer === 'object' ? smartRoi.signer : {};
  const guardian = body.guardian && typeof body.guardian === 'object' ? body.guardian : {};

  const fallbackFirst = String(signer.firstName || '').trim();
  const fallbackLast = String(signer.lastName || '').trim();
  const fallbackEmail = String(signer.email || '').trim();
  const fallbackPhone = String(signer.phone || '').trim();
  const fallbackRelationship = String(signer.relationship || '').trim();

  body.guardian = {
    ...guardian,
    firstName: String(guardian.firstName || '').trim() || fallbackFirst || '',
    lastName: String(guardian.lastName || '').trim() || fallbackLast || '',
    email: String(guardian.email || '').trim() || fallbackEmail || '',
    phone: String(guardian.phone || '').trim() || fallbackPhone || '',
    relationship: String(guardian.relationship || '').trim() || fallbackRelationship || ''
  };

  const fallbackClientFullName = String(smartRoi.clientFullName || '').trim();
  if (!fallbackClientFullName) return;

  if (Array.isArray(body.clients) && body.clients.length > 0) {
    const first = body.clients[0] && typeof body.clients[0] === 'object' ? body.clients[0] : {};
    const existingFullName = String(first.fullName || '').trim();
    if (!existingFullName) body.clients[0] = { ...first, fullName: fallbackClientFullName };
    return;
  }

  if (body.client && typeof body.client === 'object') {
    const existingFullName = String(body.client.fullName || '').trim();
    if (!existingFullName) body.client = { ...body.client, fullName: fallbackClientFullName };
    return;
  }

  body.clients = [{ fullName: fallbackClientFullName }];
};

const resolveSmartSchoolRoiTemplate = async ({ roiContext, templates }) => {
  // 1. Direct match against allowed templates
  let selectedTemplate = Array.isArray(templates)
    ? templates.find((template) => Number(template?.id || 0) === Number(roiContext?.documentTemplate?.id || 0))
    : null;

  // 2. If roiContext references a specific template not in the allowed set, load it directly
  if (!selectedTemplate && roiContext?.documentTemplate?.id) {
    try {
      const directTemplate = await DocumentTemplate.findById(Number(roiContext.documentTemplate.id));
      if (directTemplate?.is_active) {
        selectedTemplate = directTemplate;
      }
    } catch {
      // fall through to global search
    }
  }

  // 3. Global fallback: search all ROI-type templates, preferring same-school scope
  if (!selectedTemplate) {
    const schoolOrgId = Number(roiContext?.school?.id || 0) || null;
    const schoolRoiTemplatesResult = await DocumentTemplate.findAll({
      documentType: ['smart_school_roi', 'school_roi', 'school'],
      isActive: true,
      includeArchived: false,
      limit: 200,
      offset: 0
    });
    const schoolRoiTemplates = Array.isArray(schoolRoiTemplatesResult?.data) ? schoolRoiTemplatesResult.data : [];
    const priorityByType = { smart_school_roi: 0, school_roi: 1, school: 2 };
    const scored = schoolRoiTemplates
      .map((template) => {
        const type = String(template?.document_type || '').trim().toLowerCase();
        const orgId = Number(template?.organization_id || 0) || null;
        const scopeScore = orgId && schoolOrgId && orgId === schoolOrgId ? 0 : (orgId ? 2 : 1);
        const typeScore = Number.isFinite(priorityByType[type]) ? priorityByType[type] : 99;
        return { template, score: scopeScore * 100 + typeScore };
      })
      .sort((a, b) => a.score - b.score);
    selectedTemplate = scored[0]?.template || null;
  }
  return selectedTemplate || null;
};

export const getPublicIntakeLink = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const { link, issuedRoiLink, boundClient } = await resolvePublicIntakeContext(publicKey);
    if (!link) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (!link.is_active && !issuedRoiLink) {
      return res.status(404).json({ error: { message: 'This link is no longer active. Please contact the school for a new link.' } });
    }

    const templates = await loadAllowedTemplates(link);
    let jobDescription = null;
    if (String(link?.form_type || '').trim().toLowerCase() === 'job_application' && Number(link?.job_description_id || 0) > 0) {
      const jd = await HiringJobDescription.findById(link.job_description_id);
      if (jd && Number(jd.is_active) === 1) {
        let fileUrl = null;
        const storagePath = String(jd.storage_path || '').trim();
        if (storagePath) {
          try {
            fileUrl = await StorageService.getSignedUrl(storagePath, 10);
          } catch {
            fileUrl = null;
          }
        }
        jobDescription = {
          id: Number(jd.id),
          title: String(jd.title || '').trim() || null,
          descriptionText: String(jd.description_text || '').trim() || null,
          fileUrl,
          fileName: String(jd.original_name || '').trim() || null
        };
      }
    }
    const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
    const isClientBoundRoiLink = !!issuedRoiLink?.client_id;
    const needsCaptcha = !isSmartSchoolRoiForm(link) && !isClientBoundRoiLink && requiresCaptchaForLink(organization, agency);
    const shouldIncludeRoiContext = isSmartSchoolRoiForm(link) || hasProgrammedSchoolRoiStep(link);
    const roiContext = shouldIncludeRoiContext
      ? await buildSmartSchoolRoiContext({
          link,
          boundClient,
          organization,
          agency,
          templates,
          issuedConfig: issuedRoiLink?.roi_context_json?.issuedConfig || issuedRoiLink?.roi_context_json || null
        })
      : null;
    res.json({
      link: {
        id: link.id,
        title: link.title,
        description: link.description,
        language_code: link.language_code || 'en',
        scope_type: link.scope_type,
        form_type: link.form_type || 'intake',
        organization_id: link.organization_id,
        program_id: link.program_id,
        learning_class_id: link.learning_class_id ?? null,
        company_event_id: link.company_event_id ?? null,
        job_description_id: link.job_description_id ?? null,
        create_client: link.create_client,
        create_guardian: link.create_guardian,
        intake_fields: link.intake_fields,
        intake_steps: link.intake_steps,
        custom_messages: link.custom_messages || null
      },
      recaptcha: needsCaptcha
        ? {
            siteKey: process.env.RECAPTCHA_SITE_KEY_INTAKE || null,
            useEnterprise: !!config.recaptcha?.enterpriseApiKey,
            forceWidget: true
          }
        : { siteKey: null, useEnterprise: false, forceWidget: false },
      organization: toOrgPayload(organization),
      agency: toOrgPayload(agency),
      issuedLink: issuedRoiLink ? {
        id: issuedRoiLink.id,
        status: issuedRoiLink.status || 'issued',
        signed_at: issuedRoiLink.signed_at || null,
        client_id: issuedRoiLink.client_id,
        intake_link_id: issuedRoiLink.intake_link_id
      } : null,
      boundClient: boundClient ? {
        id: boundClient.id,
        full_name: String(
          boundClient.full_name
          || [boundClient.first_name, boundClient.last_name].filter(Boolean).join(' ')
          || ''
        ).trim() || null,
        initials: boundClient.initials || null,
        organization_id: boundClient.organization_id || null,
        organization_name: boundClient.organization_name || null,
        date_of_birth: boundClient.date_of_birth || boundClient.dob || boundClient.birthdate || boundClient.birth_date || null
      } : null,
      roiContext,
      jobDescription,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        document_type: t.document_type,
        document_action_type: t.document_action_type,
        template_type: t.template_type,
        html_content: t.template_type === 'html' ? t.html_content : null,
        file_path: t.template_type === 'pdf' ? t.file_path : null,
        signature_x: t.signature_x,
        signature_y: t.signature_y,
        signature_width: t.signature_width,
        signature_height: t.signature_height,
        signature_page: t.signature_page,
        field_definitions: t.field_definitions
      }))
    });
  } catch (error) {
    console.error('[publicIntake] getPublicIntakeLink error', {
      publicKey: req.params?.publicKey,
      message: error?.message,
      stack: error?.stack
    });
    next(error);
  }
};

export const createPublicIntakeSession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const publicKey = String(req.params.publicKey || '').trim();
    const { link, issuedRoiLink, boundClient } = await resolvePublicIntakeContext(publicKey);
    if (!link) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (!link.is_active && !issuedRoiLink) {
      return res.status(404).json({ error: { message: 'This link is no longer active. Please contact the school for a new link.' } });
    }
    const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
    const isClientBoundRoiLink = !!issuedRoiLink?.client_id;
    const needsCaptcha = !isSmartSchoolRoiForm(link) && !isClientBoundRoiLink && requiresCaptchaForLink(organization, agency);
    const intakeSiteKey = String(process.env.RECAPTCHA_SITE_KEY_INTAKE || '').trim();
    const captchaConfigured = !!intakeSiteKey && (!!config.recaptcha?.secretKey || !!config.recaptcha?.enterpriseApiKey);
    const isLocalBypass = isLocalRecaptchaBypassRequest(req);
    if (needsCaptcha && config.nodeEnv === 'production' && !captchaConfigured) {
      return res.status(500).json({ error: { message: 'Captcha is not configured' } });
    }
    if (needsCaptcha && captchaConfigured) {
      if (isLocalBypass) {
        console.info('[recaptcha] bypassing localhost verification for public intake begin');
      } else {
        const captchaToken = String(req.body?.captchaToken || '').trim();
        if (!captchaToken) {
          return res.status(400).json({ error: { message: 'Captcha is required' } });
        }
        const verification = await verifyRecaptchaV3({
          token: captchaToken,
          remoteip: getClientIpAddress(req),
          expectedAction: 'public_intake_begin',
          userAgent: req.get('user-agent'),
          siteKeyOverride: intakeSiteKey || undefined,
          checkboxKey: true
        });
        if (!verification.ok) {
          console.warn('[recaptcha] public intake begin verification failed', {
            reason: verification.reason,
            errorCodes: verification.errorCodes,
            action: verification.action,
            invalidReason: verification.invalidReason
          });
          const msg = config.nodeEnv !== 'production'
            ? `Captcha verification failed: ${verification.reason}${verification.invalidReason ? ` (${verification.invalidReason})` : ''}. Check backend logs.`
            : 'Captcha verification failed. Please complete the captcha again and try again.';
          return res.status(400).json({ error: { message: msg } });
        }
        const minScoreRaw = process.env.RECAPTCHA_MIN_SCORE_INTAKE ?? config.recaptcha?.minScore ?? 0.3;
        const effectiveMinScore = Number.isFinite(Number(minScoreRaw)) ? Number(minScoreRaw) : 0.3;
        if (verification.score !== null && verification.score < effectiveMinScore) {
          console.warn('[recaptcha] public intake begin score too low', {
            score: verification.score,
            minScore: effectiveMinScore
          });
          if (config.nodeEnv === 'production') {
            return res.status(400).json({ error: { message: 'Captcha verification failed. Please try again.' } });
          }
        }
      }
    }
    const ipAddress = getClientIpAddress(req);
    if (!issuedRoiLink) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const starts = await IntakeSubmission.countStartsByLinkAndIp({
        intakeLinkId: link.id,
        ipAddress,
        since
      });
      if (starts >= 5) {
        return res.status(429).json({ error: { message: 'Daily intake start limit reached. Please try again tomorrow.' } });
      }
    }

    const templates = await loadAllowedTemplates(link);
    const ttlMs = BASE_CONSENT_TTL_MS + Math.max(0, Number(templates.length || 0)) * PER_PAGE_TTL_MS;
    const retentionExpiresAt = new Date(Date.now() + ttlMs);
    const sessionToken = crypto.randomBytes(18).toString('hex');

    const submission = await IntakeSubmission.create({
      intakeLinkId: link.id,
      status: 'started',
      sessionToken,
      ipAddress,
      userAgent: req.get('user-agent'),
      retentionExpiresAt,
      clientId: issuedRoiLink?.client_id || null
    });

    if (issuedRoiLink?.id) {
      await ClientSchoolRoiSigningLink.markStarted({
        id: issuedRoiLink.id,
        intakeSubmissionId: submission?.id || null
      });
      if (isSmartSchoolRoiForm(link)) {
        const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
        const roiContext = await buildSmartSchoolRoiContext({
          link,
          boundClient,
          organization,
          agency,
          templates: await loadAllowedTemplates(link),
          issuedConfig: issuedRoiLink?.roi_context_json?.issuedConfig || issuedRoiLink?.roi_context_json || null
        });
        await ClientSchoolRoiSigningLink.updatePayload({
          id: issuedRoiLink.id,
          intakeSubmissionId: submission?.id || null,
          roiContext,
          roiResponse: null
        });
      }
    }

    res.json({ sessionToken, submissionId: submission?.id || null });
  } catch (error) {
    next(error);
  }
};

export const createPublicConsent = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const { link, issuedRoiLink } = await resolvePublicIntakeContext(publicKey);
    if (!link) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (!link.is_active && !issuedRoiLink) {
      return res.status(404).json({ error: { message: 'This link is no longer active. Please contact the school for a new link.' } });
    }

    const ipAddress = getClientIpAddress(req);
    const userAgent = req.get('user-agent');
    const now = new Date();
    const retentionPolicy = await resolveRetentionPolicy(link);
    const retentionExpiresAt = buildRetentionExpiresAt({ policy: retentionPolicy, submittedAt: now });

    const intakeData = req.body?.intakeData || null;
    let effectiveIntakeData = intakeData;
    let clientMatchPayload = null;
    if (effectiveIntakeData && linkSupportsPublicRegistrationFeatures(link)) {
      const matchPatch = await computePublicIntakeClientMatch({
        link,
        intakeData: effectiveIntakeData,
        payload: req.body || {}
      });
      clientMatchPayload = matchPatch;
      effectiveIntakeData = mergeIntakeSubmissionPatch(effectiveIntakeData, matchPatch);
    }
    const intakeDataHash = hashIntakeData(effectiveIntakeData);
    const sessionToken = String(req.body?.sessionToken || '').trim();
    let submission = sessionToken ? await IntakeSubmission.findBySessionToken(sessionToken) : null;
    if (submission) {
      if (String(submission.status || '').toLowerCase() === 'submitted') {
        let downloadUrl = null;
        if (submission.combined_pdf_path) {
          try {
            downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 7);
          } catch {
            downloadUrl = null;
          }
        }
        return res.status(200).json({
          success: true,
          alreadyCompleted: true,
          message: 'This release session is already completed.',
          submission,
          downloadUrl
        });
      }
      submission = await IntakeSubmission.updateById(submission.id, {
        status: 'consented',
        signer_name: normalizeName(req.body.signerName),
        signer_initials: normalizeName(req.body.signerInitials),
        signer_email: normalizeName(req.body.signerEmail) || null,
        signer_phone: normalizeName(req.body.signerPhone) || null,
        intake_data: effectiveIntakeData ? JSON.stringify(effectiveIntakeData) : null,
        intake_data_hash: intakeDataHash,
        consent_given_at: now,
        ip_address: ipAddress,
        user_agent: userAgent,
        retention_expires_at: retentionExpiresAt,
        session_token: sessionToken || null,
        client_id: issuedRoiLink?.client_id || submission.client_id || null
      });
    } else {
      submission = await IntakeSubmission.create({
        intakeLinkId: link.id,
        status: 'consented',
        signerName: normalizeName(req.body.signerName),
        signerInitials: normalizeName(req.body.signerInitials),
        signerEmail: normalizeName(req.body.signerEmail) || null,
        signerPhone: normalizeName(req.body.signerPhone) || null,
        sessionToken: sessionToken || null,
        intakeData: effectiveIntakeData,
        intakeDataHash,
        consentGivenAt: now,
        ipAddress,
        userAgent,
        retentionExpiresAt,
        clientId: issuedRoiLink?.client_id || null
      });
    }

    if (issuedRoiLink?.id) {
      await ClientSchoolRoiSigningLink.markStarted({
        id: issuedRoiLink.id,
        intakeSubmissionId: submission?.id || null
      });
    }

    res.status(201).json({ submission, clientMatch: clientMatchPayload });
  } catch (error) {
    next(error);
  }
};

export const getPublicIntakeStatus = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }
    const templates = await loadAllowedTemplates(link);
    const signedDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    const signedTemplateIds = new Set(signedDocs.map((d) => d.document_template_id));
    if (isSubmissionExpired(submission, { templatesCount: templates.length })) {
      await deleteSubmissionData(submissionId);
      return res.status(410).json({ error: { message: 'This intake session has expired. Please restart the intake.' } });
    }

    let downloadUrl = null;
    if (submission.combined_pdf_path) {
      downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 7);
    }

    const clientBundles = [];
    if (downloadUrl) {
      try {
        const clientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
        for (const c of clientRows || []) {
          if (c?.bundle_pdf_path) {
            try {
              const url = await StorageService.getSignedUrl(c.bundle_pdf_path, 60 * 24 * 7);
              clientBundles.push({
                clientId: c.client_id,
                clientName: c.full_name || null,
                filename: `intake-client-${c.client_id || 'unknown'}.pdf`,
                downloadUrl: url
              });
            } catch {
              // best-effort
            }
          }
        }
      } catch {
        // best-effort
      }
    }

    let intakeData = null;
    if (submission.intake_data) {
      try {
        intakeData = typeof submission.intake_data === 'string'
          ? JSON.parse(submission.intake_data)
          : submission.intake_data;
      } catch {
        intakeData = null;
      }
    }

    const sub = intakeData?.responses?.submission && typeof intakeData.responses.submission === 'object'
      ? intakeData.responses.submission
      : {};
    const registrationCompletion = linkSupportsPublicRegistrationFeatures(link)
      ? {
          newGuardianAccount: !!sub.registration_completion_new_guardian,
          loginEmail: sub.registration_completion_login_email || null,
          portalLoginUrl: sub.registration_completion_portal_url || null,
          eventSummary: sub.registration_completion_event || null
        }
      : null;

    res.json({
      submissionId,
      status: submission.status,
      totalDocuments: templates.length,
      signedTemplateIds: Array.from(signedTemplateIds),
      signedDocuments: signedDocs,
      downloadUrl,
      clientBundles,
      intakeData,
      registrationCompletion
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicIntakeRegistrationCatalog = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (!linkSupportsPublicRegistrationFeatures(link)) {
      return res.status(403).json({ error: { message: 'Registration catalog is not available for this link.' } });
    }
    const { agency } = await resolveIntakeOrgContext(link);
    const agencyId = Number(agency?.id || 0) || null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Unable to resolve agency for catalog.' } });
    }
    const agencyFlags = parseFeatureFlagsSafe(agency?.feature_flags);
    if (agencyFlags.platformPublicRegistrationEnabled === false) {
      return res.status(403).json({
        error: { message: 'Public registration is disabled for this tenant.' }
      });
    }
    const lockedCompanyEventId = Number(link.company_event_id || 0) || null;
    const items = await fetchRegistrationCatalogItems(agencyId, { lockedCompanyEventId });
    res.json({
      items: (items || []).map((row) => ({
        kind: row.kind,
        id: row.id,
        title: row.title,
        summary: row.summary,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        enrollmentOpensAt: row.enrollmentOpensAt,
        enrollmentClosesAt: row.enrollmentClosesAt,
        medicaidEligible: !!row.medicaidEligible,
        cashEligible: !!row.cashEligible
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const matchPublicIntakeClient = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (!linkSupportsPublicRegistrationFeatures(link)) {
      return res.status(403).json({
        error: { message: 'Client match is only available for smart registration or intake links that include a Registration step.' }
      });
    }
    const intakeData = req.body?.intakeData || null;
    const match = await computePublicIntakeClientMatch({
      link,
      intakeData,
      payload: req.body || {}
    });
    res.json(match);
  } catch (error) {
    next(error);
  }
};

export const reportPublicIntakeLoginHelp = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const submissionId = Number(req.body?.submissionId || 0) || null;
    const signerEmail = String(req.body?.signerEmail || '').trim().toLowerCase() || null;
    const message = String(req.body?.message || '').trim() || null;
    try {
      ActivityLogService.logActivity(
        {
          actionType: 'public_intake_login_help',
          userId: null,
          metadata: {
            intakeLinkId: link.id,
            submissionId,
            signerEmail,
            message: message ? message.slice(0, 2000) : null
          }
        },
        req
      );
    } catch {
      // best-effort
    }
    res.json({ success: true, acknowledged: true });
  } catch (error) {
    next(error);
  }
};

export const lookupPublicRegistrationAccount = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    if (!publicKey) return res.status(400).json({ error: { message: 'publicKey is required' } });
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (!linkSupportsPublicRegistrationFeatures(link)) {
      return res.json({
        exists: false,
        accountState: 'new',
        message: 'Account lookup is only enabled for registration-capable links (smart registration or intake with a Registration step).'
      });
    }
    const email = String(req.query?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: { message: 'Valid email is required' } });
    }
    const user = await User.findByEmail(email);
    if (!user?.id) {
      return res.json({
        exists: false,
        accountState: 'new',
        profile: null
      });
    }
    const [guardianRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM client_guardians
       WHERE guardian_user_id = ?`,
      [Number(user.id)]
    );
    const guardianLinks = Number(guardianRows?.[0]?.total || 0) || 0;
    return res.json({
      exists: true,
      accountState: 'existing',
      profile: {
        firstName: String(user.first_name || '').trim() || null,
        lastName: String(user.last_name || '').trim() || null,
        email: String(user.email || '').trim().toLowerCase(),
        role: String(user.role || '').trim().toLowerCase() || null,
        hasGuardianLinks: guardianLinks > 0
      }
    });
  } catch (error) {
    next(error);
  }
};

export const previewPublicTemplate = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const templateId = parseInt(req.params.templateId, 10);
    if (!templateId) {
      return res.status(400).json({ error: { message: 'templateId is required' } });
    }
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const template = await loadTemplateById(link, templateId);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }
    if (template.template_type !== 'pdf' || !template.file_path) {
      return res.status(400).json({ error: { message: 'Template preview is only available for PDF templates' } });
    }

    const StorageService = (await import('../services/storage.service.js')).default;
    let filePath = String(template.file_path || '').trim();
    if (filePath.startsWith('/')) filePath = filePath.substring(1);
    const templateFilename = filePath.includes('/')
      ? filePath.split('/').pop()
      : filePath.replace('templates/', '');
    const buffer = await StorageService.readTemplate(templateFilename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const signPublicIntakeDocument = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    const templateId = parseInt(req.params.templateId, 10);
    if (!submissionId || !templateId) {
      return res.status(400).json({ error: { message: 'submissionId and templateId are required' } });
    }

    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    const template = await loadTemplateById(link, templateId);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    const signatureData = String(req.body.signatureData || '').trim();
    if (template.document_action_type === 'signature' && !signatureData) {
      return res.status(400).json({ error: { message: 'signatureData is required for signature documents' } });
    }

    const existingDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    const existing = existingDocs.find((d) => d.document_template_id === templateId);
    if (existing) {
      return res.json({ success: true, document: existing, alreadySigned: true });
    }

    const now = new Date();
    const signer = buildSignerFromSubmission(submission);
    const auditTrail = buildAuditTrail({ link, submission });
    const workflowData = {
      consent_given_at: submission.consent_given_at,
      intent_to_sign_at: now,
      identity_verified_at: null,
      finalized_at: now,
      consent_ip: submission.ip_address || null,
      intent_ip: submission.ip_address || null
    };

    const rawFieldDefs = template.field_definitions || null;
    let parsedFieldDefs = [];
    try {
      parsedFieldDefs = rawFieldDefs
        ? (typeof rawFieldDefs === 'string' ? JSON.parse(rawFieldDefs) : rawFieldDefs)
        : [];
    } catch {
      parsedFieldDefs = [];
    }
    const fieldDefinitions = Array.isArray(parsedFieldDefs) ? parsedFieldDefs : [];
    const fieldValues = req.body?.fieldValues && typeof req.body.fieldValues === 'object' ? req.body.fieldValues : {};
    let intakeData = null;
    if (submission?.intake_data) {
      try {
        intakeData = typeof submission.intake_data === 'string'
          ? JSON.parse(submission.intake_data)
          : submission.intake_data;
      } catch {
        intakeData = null;
      }
    }
    if (intakeData) {
      const baseValues = buildDocumentFieldValuesForClient({
        link,
        intakeData,
        clientIndex: 0,
        baseFieldValues: {}
      });
      const normalize = (val) =>
        String(val || '')
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, ' ');
      const normalizedBase = {};
      Object.keys(baseValues || {}).forEach((key) => {
        normalizedBase[normalize(key)] = baseValues[key];
      });
      const resolveFieldKey = (def) => def?.prefillKey || def?.prefill_key || def?.id || '';
      const getFallbackValue = (def) => {
        const key = normalize(resolveFieldKey(def));
        if (key && hasValue(normalizedBase[key])) return normalizedBase[key];
        const label = normalize(def?.label || def?.name || def?.id || '');
        if (label.includes('printed client name') || label.includes('client name')) {
          return baseValues.client_full_name
            || `${baseValues.client_first || ''} ${baseValues.client_last || ''}`.trim();
        }
        if (label.includes('relationship')) return baseValues.relationship || '';
        return '';
      };
      fieldDefinitions.forEach((def) => {
        if (!def?.id) return;
        const existing = fieldValues[def.id];
        if (hasValue(existing)) return;
        const fallback = getFallbackValue(def);
        if (hasValue(fallback)) fieldValues[def.id] = fallback;
      });
    }

    const missingFields = [];
    for (const def of fieldDefinitions) {
      if (!def || !def.required) continue;
      if (!isFieldVisible(def, fieldValues)) continue;
      if (def.type === 'date' && (def.autoToday || isPublicDateField(def))) continue;
      if (isOptionalPublicField(def)) continue;
      const val = fieldValues[def.id];
      if (def.type === 'checkbox') {
        if (val !== true) missingFields.push(def.label || def.id || 'field');
        continue;
      }
      if (def.type === 'select' || def.type === 'radio') {
        const options = Array.isArray(def.options) ? def.options : [];
        const optionValues = options.map((opt) => String(opt.value ?? opt.label ?? '')).filter(Boolean);
        if (!val || (optionValues.length > 0 && !optionValues.includes(String(val)))) {
          missingFields.push(def.label || def.id || 'field');
        }
        continue;
      }
      if (val === null || val === undefined || String(val).trim() === '') {
        missingFields.push(def.label || def.id || 'field');
      }
    }
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: { message: `Missing required fields: ${missingFields.join(', ')}` }
      });
    }

    const result = await PublicIntakeSigningService.generateSignedDocument({
      template,
      signatureData: signatureData || null,
      signer,
      auditTrail,
      workflowData,
      submissionId,
      fieldDefinitions,
      fieldValues
    });

    const doc = await IntakeSubmissionDocument.create({
      intakeSubmissionId: submissionId,
      clientId: null,
      documentTemplateId: template.id,
      signedPdfPath: result.storagePath,
      pdfHash: result.pdfHash,
      signedAt: now,
      auditTrail: {
        ...auditTrail,
        documentReference: result.referenceNumber || null,
        documentName: template.name || null,
        fieldValues,
        signatureData: signatureData || null
      }
    });

    await IntakeSubmission.updateById(submissionId, { status: 'in_progress' });

    res.json({
      success: true,
      document: doc,
      referenceNumber: result.referenceNumber || null
    });
  } catch (error) {
    next(error);
  }
};

export const finalizePublicIntake = async (req, res, next) => {
  try {
    const emailDelivery = {
      attempted: false,
      sent: false,
      error: null
    };
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const { link, issuedRoiLink } = await resolvePublicIntakeContext(publicKey);
    if (!link) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (!link.is_active && !issuedRoiLink) {
      return res.status(404).json({ error: { message: 'This link is no longer active. Please contact the school for a new link.' } });
    }

    const submissionId = parseInt(req.params.submissionId || req.body.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }

    applySmartRoiPayloadFallback(req.body);

    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }
    const allAllowedTemplates = await loadAllowedTemplates(link);
    const isEmbeddedSmartRoiFinalize = Boolean(
      hasProgrammedSchoolRoiStep(link)
      && req.body?.intakeData?.smartSchoolRoi
    );
    if (isSubmissionExpired(submission, { templatesCount: allAllowedTemplates.length })) {
      await deleteSubmissionData(submissionId);
      return res.status(410).json({ error: { message: 'This intake session has expired. Please restart the intake.' } });
    }

    // Idempotent retry: if already submitted, return existing result (no duplicate work, no data loss)
    const isJobApplication = String(link.form_type || '').toLowerCase() === 'job_application';
    if (String(submission.status || '').toLowerCase() === 'submitted') {
      if (isJobApplication && submission.guardian_user_id) {
        let downloadUrl = null;
        if (submission.combined_pdf_path) {
          try {
            downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 7);
          } catch {
            downloadUrl = null;
          }
        }
        return res.json({
          success: true,
          submission,
          jobApplicationSubmitted: true,
          candidateId: submission.guardian_user_id,
          downloadUrl,
          clientBundles: []
        });
      }
      if (submission.combined_pdf_path) {
        let downloadUrl = null;
        try {
          downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 7);
        } catch {
          // best-effort
        }
        const clientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
        const clientBundles = [];
        for (const c of clientRows || []) {
          if (c?.bundle_pdf_path) {
            try {
              const url = await StorageService.getSignedUrl(c.bundle_pdf_path, 60 * 24 * 7);
              clientBundles.push({
                clientId: c.client_id,
                clientName: c.full_name || null,
                filename: `intake-client-${c.client_id || 'unknown'}.pdf`,
                downloadUrl: url
              });
            } catch {
              // best-effort
            }
          }
        }
        const signedDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
        if (issuedRoiLink?.id) {
          let phiDocs = [];
          try {
            phiDocs = await ClientPhiDocument.listByIntakeSubmissionId(submissionId);
          } catch {
            phiDocs = [];
          }
          await ClientSchoolRoiSigningLink.markCompleted({
            id: issuedRoiLink.id,
            intakeSubmissionId: submissionId,
            signedAt: submission.submitted_at || submission.updated_at || new Date(),
            completedClientPhiDocumentId: phiDocs?.[0]?.id || null
          });
        }
        return res.json({
          success: true,
          submission,
          documents: signedDocs || [],
          downloadUrl,
          clientBundles
        });
      }
    }

    if (link.create_client && !isEmbeddedSmartRoiFinalize) {
      const rawClients = Array.isArray(req.body?.clients) && req.body.clients.length
        ? req.body.clients
        : (req.body?.client ? [req.body.client] : []);
      if (!rawClients.length || !String(rawClients?.[0]?.fullName || '').trim()) {
        return res.status(400).json({ error: { message: 'Client full name is required.' } });
      }
    }
    if (!isEmbeddedSmartRoiFinalize) {
      const gEmail = String(req.body?.guardian?.email || '').trim();
      const gFirst = String(req.body?.guardian?.firstName || '').trim();
      const gLast = String(req.body?.guardian?.lastName || '').trim();
      if (isJobApplication) {
        if (!gEmail || !gFirst || !gLast) {
          return res.status(400).json({ error: { message: 'First name, last name, and email are required.' } });
        }
      } else {
        if (!gEmail || !gFirst) {
          return res.status(400).json({ error: { message: 'Guardian name and email are required.' } });
        }
      }
    }

    const now = new Date();
    const intakeData = req.body?.intakeData || null;
    const packetDocumentTemplates = filterPacketDocumentTemplates(link, allAllowedTemplates, intakeData);
    const retentionPolicy = await resolveRetentionPolicy(link);
    const retentionExpiresAt = buildRetentionExpiresAt({ policy: retentionPolicy, submittedAt: now });
    const intakeDataHash = hashIntakeData(intakeData);
    let updatedSubmission = await IntakeSubmission.updateById(submissionId, {
      status: 'submitted',
      submitted_at: now,
      intake_data: intakeData ? JSON.stringify(intakeData) : null,
      intake_data_hash: intakeDataHash,
      retention_expires_at: retentionExpiresAt,
      session_token: String(req.body?.sessionToken || '').trim() || null
    });

    // Job application: create candidate, migrate uploads, return success (no client, no document validation)
    if (isJobApplication) {
      const agencyId = parseInt(link.organization_id, 10);
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'Job application link is not associated with an organization.' } });
      }
      const gFirst = String(req.body?.guardian?.firstName || '').trim();
      const gLast = String(req.body?.guardian?.lastName || '').trim();
      const gEmail = String(req.body?.guardian?.email || '').trim();
      const gPhone = req.body?.guardian?.phoneNumber !== undefined ? String(req.body.guardian.phoneNumber || '').trim()
  : req.body?.guardian?.phone !== undefined ? String(req.body.guardian.phone || '').trim() : null;
      const { coverLetterText, resumeText, referencesJson, fluentLanguagesJson, jobAcknowledged } = parseJobApplicationContext(intakeData, link);

      const user = await User.create({
        email: gEmail,
        passwordHash: null,
        firstName: gFirst,
        lastName: gLast,
        phoneNumber: gPhone || null,
        personalEmail: gEmail,
        role: 'provider',
        status: 'PROSPECTIVE'
      });
      await User.assignToAgency(user.id, agencyId);

      let jobDescriptionId = link.job_description_id ? parseInt(link.job_description_id, 10) : null;
      if (!jobDescriptionId) {
        const fallbackTitle = String(link?.title || '').replace(/^apply:\s*/i, '').trim();
        if (fallbackTitle) {
          try {
            const [rows] = await pool.execute(
              `SELECT id
                 FROM hiring_job_descriptions
                WHERE agency_id = ?
                  AND LOWER(TRIM(title)) = LOWER(TRIM(?))
                ORDER BY is_active DESC, updated_at DESC, id DESC
                LIMIT 1`,
              [agencyId, fallbackTitle]
            );
            jobDescriptionId = Number(rows?.[0]?.id || 0) || null;
          } catch {
            jobDescriptionId = null;
          }
        }
      }
      if (jobDescriptionId) {
        const jd = await HiringJobDescription.findById(jobDescriptionId);
        if (!jd || Number(jd.agency_id) !== Number(agencyId)) {
          jobDescriptionId = null;
        }
      }
      await HiringProfile.upsert({
        candidateUserId: user.id,
        stage: 'applied',
        appliedRole: null,
        source: 'job_application_link',
        jobDescriptionId: jobDescriptionId || null,
        coverLetterText,
        referencesJson,
        fluentLanguagesJson,
        jobAcknowledged
      });

      // Migrate intake_submission_uploads to user_admin_docs
      let uploadRows = [];
      try {
        const [rows] = await pool.execute(
          `SELECT id, storage_path, original_filename, mime_type, upload_label,
                  is_encrypted, encryption_key_id, encryption_wrapped_key, encryption_iv, encryption_auth_tag, encryption_aad
           FROM intake_submission_uploads WHERE intake_submission_id = ?`,
          [submissionId]
        );
        uploadRows = rows || [];
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }

      let hasResumeDoc = false;
      for (const row of uploadRows) {
        const storagePath = String(row?.storage_path || '').trim();
        if (!storagePath) continue;
        let fileBuffer;
        try {
          fileBuffer = await StorageService.readObject(storagePath);
        } catch (e) {
          // best-effort: skip if file missing
          continue;
        }
        if (Number(row?.is_encrypted) === 1 && row?.encryption_wrapped_key && row?.encryption_iv && row?.encryption_auth_tag) {
          try {
            fileBuffer = await DocumentEncryptionService.decryptBuffer({
              encryptedBuffer: fileBuffer,
              encryptionKeyId: row.encryption_key_id || null,
              encryptionWrappedKeyB64: row.encryption_wrapped_key,
              encryptionIvB64: row.encryption_iv,
              encryptionAuthTagB64: row.encryption_auth_tag,
              aad: row.encryption_aad || undefined
            });
          } catch (e) {
            continue;
          }
        }
        const originalName = row.original_filename || 'upload';
        const mimeType = row.mime_type || 'application/octet-stream';
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
        const filename = `application-${user.id}-${uniqueSuffix}${safeExt}`;
        const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);
        const docType = (row.upload_label || '').toLowerCase().includes('resume') ? 'resume' : 'application_material';
        if (docType === 'resume') hasResumeDoc = true;
        await pool.execute(
          `INSERT INTO user_admin_docs (user_id, title, doc_type, storage_path, original_name, mime_type, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [user.id, row.upload_label || 'Application material', docType, storageResult.relativePath, originalName, mimeType, user.id]
        );
      }
      if (!hasResumeDoc && resumeText) {
        try {
          const resumeBuffer = Buffer.from(resumeText, 'utf8');
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const filename = `resume-${user.id}-${uniqueSuffix}.txt`;
          const storageResult = await StorageService.saveAdminDoc(resumeBuffer, filename, 'text/plain');
          let resumeDocId = null;
          await pool.execute(
            `INSERT INTO user_admin_docs (user_id, title, doc_type, storage_path, original_name, mime_type, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.id, 'Resume (pasted text)', 'resume', storageResult.relativePath, 'resume.txt', 'text/plain', user.id]
          );
          try {
            const [rows] = await pool.execute(
              `SELECT id
                 FROM user_admin_docs
                WHERE user_id = ? AND doc_type = 'resume' AND storage_path = ?
                ORDER BY id DESC
                LIMIT 1`,
              [user.id, storageResult.relativePath]
            );
            resumeDocId = Number(rows?.[0]?.id || 0) || null;
          } catch {
            resumeDocId = null;
          }
          if (resumeDocId) {
            try {
              await HiringResumeParse.upsertByResumeDocId({
                candidateUserId: user.id,
                resumeDocId,
                method: 'pdf_text',
                status: 'completed',
                extractedText: resumeText,
                extractedJson: null,
                errorText: null,
                createdByUserId: user.id
              });
            } catch (e) {
              if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
            }
          }
        } catch {
          // best effort
        }
      }

      await IntakeSubmission.updateById(submissionId, { guardian_user_id: user.id });
      let applicationDownloadUrl = null;
      try {
        const answersPdf = await buildAnswersPdfBuffer({ link, intakeData });
        if (answersPdf) {
          const bundleHash = DocumentSigningService.calculatePDFHash(answersPdf);
          const bundleResult = await StorageService.saveIntakeBundle({
            submissionId,
            fileBuffer: answersPdf,
            filename: `job-application-${submissionId}.pdf`
          });
          await IntakeSubmission.updateById(submissionId, {
            combined_pdf_path: bundleResult.relativePath,
            combined_pdf_hash: bundleHash
          });
          applicationDownloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 7);
        }
      } catch {
        // best effort: application can still submit without bundle generation
      }
      try {
        const jobTitle = String((await HiringJobDescription.findById(jobDescriptionId))?.title || '').trim()
          || String(link?.title || 'Job application').trim();
        await Notification.create({
          type: 'new_job_application_submitted',
          severity: 'info',
          title: 'New applicant submitted',
          message: `${jobTitle}: ${gFirst} ${gLast} submitted a new application.`,
          audienceJson: {
            admin: true,
            support: true,
            staff: true,
            provider: false
          },
          userId: null,
          agencyId,
          relatedEntityType: 'hiring_candidate',
          relatedEntityId: user.id,
          actorUserId: null
        });
      } catch {
        // best effort
      }

      return res.json({
        success: true,
        submission: await IntakeSubmission.findById(submissionId),
        jobApplicationSubmitted: true,
        candidateId: user.id,
        downloadUrl: applicationDownloadUrl,
        clientBundles: []
      });
    }

    if (isSmartSchoolRoiForm(link)) {
      const signatureData = String(req.body?.signatureData || '').trim();
      if (!signatureData) {
        return res.status(400).json({ error: { message: 'Signature is required to complete this release.' } });
      }
      let effectiveClientId = Number(updatedSubmission?.client_id || issuedRoiLink?.client_id || 0) || null;
      if (!effectiveClientId) {
        try {
          const submissionClientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
          effectiveClientId = Number(submissionClientRows?.find((row) => Number(row?.client_id || 0) > 0)?.client_id || 0) || null;
        } catch {
          effectiveClientId = null;
        }
      }
      if (!effectiveClientId && link.create_client) {
        const rawClients = Array.isArray(req.body?.clients) && req.body.clients.length
          ? req.body.clients
          : (req.body?.client ? [req.body.client] : []);
        const firstClientName = String(rawClients?.[0]?.fullName || '').trim();
        if (firstClientName) {
          const { clients, guardianUser } = await PublicIntakeClientService.createClientAndGuardian({
            link,
            payload: req.body
          });
          const createdClientId = Number(clients?.[0]?.id || 0) || null;
          if (createdClientId) {
            effectiveClientId = createdClientId;
            updatedSubmission = await IntakeSubmission.updateById(submissionId, {
              client_id: createdClientId,
              guardian_user_id: guardianUser?.id || updatedSubmission?.guardian_user_id || null
            });
          }
        }
      }
      if (effectiveClientId && !updatedSubmission?.client_id) {
        updatedSubmission = await IntakeSubmission.updateById(submissionId, { client_id: effectiveClientId });
      }
      if (!effectiveClientId) {
        return res.status(400).json({ error: { message: 'Smart school ROI links must be bound to a client.' } });
      }

      const boundClient = await Client.findById(effectiveClientId, { includeSensitive: true });
      if (!boundClient?.id) {
        return res.status(404).json({ error: { message: 'Bound client not found.' } });
      }

      const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
      const roiContext = await buildSmartSchoolRoiContext({
        link,
        boundClient,
        organization,
        agency,
        templates: allAllowedTemplates,
        issuedConfig: issuedRoiLink?.roi_context_json?.issuedConfig || issuedRoiLink?.roi_context_json || null
      });
      const selectedTemplate = await resolveSmartSchoolRoiTemplate({ roiContext, templates: allAllowedTemplates });
      if (!selectedTemplate?.id) {
        return res.status(400).json({ error: { message: 'No active document template is available for Smart School ROI finalization.' } });
      }
      const effectiveRoiContext = roiContext?.documentTemplate?.id
        ? roiContext
        : {
            ...roiContext,
            documentTemplate: {
              id: Number(selectedTemplate.id),
              name: selectedTemplate.name || 'School Release of Information',
              documentType: selectedTemplate.document_type || 'school_roi'
            }
          };

      const roiResponse = normalizeSmartSchoolRoiResponse({
        roiContext: effectiveRoiContext,
        intakeData,
        signedAt: now
      });
      const roiValidation = validateSmartSchoolRoiResponse(roiResponse);
      if (!roiValidation.valid) {
        return res.status(400).json({
          error: {
            message: `Missing required smart ROI responses: ${roiValidation.missing.join(', ')}`
          }
        });
      }
      try {
        await persistClientDateOfBirthIfMissing({
          clientId: boundClient.id,
          dateOfBirth: roiResponse.clientDateOfBirth
        });
      } catch (dobErr) {
        console.error('[publicIntake] client DOB persist failed (smart roi)', {
          clientId: boundClient.id,
          message: dobErr?.message
        });
      }

      const signer = buildSignerFromSubmission(updatedSubmission);
      const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });
      const auditTrail = buildAuditTrail({
        link,
        submission: {
          ...updatedSubmission,
          submitted_at: now,
          client_name: roiResponse.clientFullName || boundClient.full_name || null
        }
      });
      const signedResult = await PublicIntakeSigningService.generateSignedDocument({
        template: {
          ...selectedTemplate,
          template_type: 'html',
          html_content: buildSmartSchoolRoiHtml({
            roiContext: effectiveRoiContext,
            response: roiResponse,
            signedAt: now
          }),
          document_action_type: 'signature',
          signature_x: null,
          signature_y: null,
          signature_width: null,
          signature_height: null,
          signature_page: null
        },
        signatureData,
        signer,
        branding: {
          schoolName: effectiveRoiContext?.school?.name || '',
          agencyName: effectiveRoiContext?.agency?.name || '',
          schoolLogoKey: effectiveRoiContext?.school?.logoUrl || '',
          agencyLogoKey: effectiveRoiContext?.agency?.logoUrl || ''
        },
        auditTrail: {
          ...auditTrail,
          smartSchoolRoi: true,
          roiResponse
        },
        workflowData,
        submissionId,
        fieldDefinitions: [],
        fieldValues: {}
      });

      const intakeClientRow = await IntakeSubmissionClient.create({
        intakeSubmissionId: submissionId,
        clientId: boundClient.id,
        fullName: roiResponse.clientFullName || boundClient.full_name || boundClient.initials || `Client ${boundClient.id}`,
        initials: boundClient.initials || null,
        contactPhone: boundClient.contact_phone || null
      });
      if (intakeClientRow?.id) {
        await IntakeSubmissionClient.updateById(intakeClientRow.id, {
          bundle_pdf_path: signedResult.storagePath,
          bundle_pdf_hash: signedResult.pdfHash
        });
      }

      const documentRow = await IntakeSubmissionDocument.create({
        intakeSubmissionId: submissionId,
        clientId: boundClient.id,
        documentTemplateId: selectedTemplate.id,
        signedPdfPath: signedResult.storagePath,
        pdfHash: signedResult.pdfHash,
        signedAt: now,
        auditTrail: {
          ...auditTrail,
          documentReference: signedResult.referenceNumber || null,
          documentName: selectedTemplate.name || null,
          smartSchoolRoi: true,
          roiResponse,
          signatureData
        }
      });

      const schoolOrganizationId =
        Number(boundClient.organization_id || link.organization_id || organization?.id || 0) || null;
      const roiDocTitle = effectiveRoiContext?.school?.name
        ? `${effectiveRoiContext.school.name} - Release of Information (Signed)`
        : `${selectedTemplate.name || 'School ROI'} (Signed)`;
      const phiDoc = await ClientPhiDocument.create({
        clientId: boundClient.id,
        agencyId: boundClient.agency_id || agency?.id || null,
        schoolOrganizationId: schoolOrganizationId || boundClient.agency_id || agency?.id || null,
        intakeSubmissionId: submissionId,
        storagePath: signedResult.storagePath,
        originalName: roiDocTitle,
        mimeType: 'application/pdf',
        uploadedByUserId: null,
        scanStatus: 'clean',
        expiresAt: retentionExpiresAt
      });
      await PhiDocumentAuditLog.create({
        documentId: phiDoc.id,
        clientId: boundClient.id,
        action: 'uploaded',
        actorUserId: null,
        actorLabel: 'public_intake',
        ipAddress: updatedSubmission.ip_address || null,
        metadata: {
          submissionId,
          templateId: selectedTemplate.id,
          smartSchoolRoi: true
        }
      });

      const accessUpdates = await applySmartSchoolRoiAccessDecisions({
        clientId: boundClient.id,
        schoolOrganizationId: schoolOrganizationId || 0,
        response: roiResponse,
        actorUserId: null
      });

      try {
        await applyClientRoiCompletion({
          clientId: boundClient.id,
          signedAt: now,
          actorUserId: null
        });
      } catch (error) {
        console.error('applyClientRoiCompletion failed — applying direct roi_expires_at fallback', {
          clientId: boundClient.id,
          submissionId,
          signingLinkId: issuedRoiLink?.id || null,
          error: error?.message || error,
          stack: error?.stack
        });
        try {
          const roiFallbackExpiry = new Date(now);
          roiFallbackExpiry.setUTCFullYear(roiFallbackExpiry.getUTCFullYear() + 3);
          await Client.update(boundClient.id, { roi_expires_at: roiFallbackExpiry });
        } catch (fallbackErr) {
          console.error('roi_expires_at direct fallback also failed', {
            clientId: boundClient.id,
            error: fallbackErr?.message
          });
        }
      }

      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: signedResult.storagePath,
        combined_pdf_hash: signedResult.pdfHash
      });

      if (issuedRoiLink?.id) {
        await ClientSchoolRoiSigningLink.updatePayload({
          id: issuedRoiLink.id,
          intakeSubmissionId: submissionId,
          roiContext,
          roiResponse,
          accessAppliedAt: now
        });
        await ClientSchoolRoiSigningLink.markCompleted({
          id: issuedRoiLink.id,
          intakeSubmissionId: submissionId,
          signedAt: now,
          completedClientPhiDocumentId: phiDoc.id
        });
      }

      await logAuditEvent(req, {
        actionType: 'smart_school_roi_permissions_applied',
        agencyId: boundClient.agency_id || agency?.id || null,
        metadata: {
          clientId: boundClient.id,
          schoolOrganizationId,
          issuedRoiLinkId: issuedRoiLink?.id || null,
          packetReleaseAllowed: roiResponse.packetReleaseAllowed,
          schoolSchedulingSafetyLogisticsAuthorized: roiResponse.schoolSchedulingSafetyLogisticsAuthorized === true,
          approvedStaffCount: roiResponse.approvedStaffCount || 0,
          deniedStaffCount: roiResponse.deniedStaffCount || 0,
          accessUpdates
        }
      });
      await notifySchoolRoiCompletedForBackoffice({
        agencyId: boundClient.agency_id || agency?.id || null,
        clientId: boundClient.id,
        clientLabel: boundClient.full_name || boundClient.initials || boundClient.identifier_code || `Client ${boundClient.id}`,
        schoolLabel: roiContext?.school?.name || boundClient.organization_name || organization?.name || 'school'
      });
      try {
        await persistGuardianProfileForClient({
          clientId: boundClient.id,
          payload: req.body || {},
          intakeData,
          source: 'smart_school_roi'
        });
        const guardianProfile = extractGuardianProfileFromPayload({
          payload: req.body || {},
          intakeData
        });
        if (guardianProfile?.email) {
          await ensureGuardianAccountLinkedForClient({
            clientId: boundClient.id,
            profile: guardianProfile,
            accessEnabled: false
          });
        }
      } catch (persistErr) {
        console.error('[publicIntake] guardian profile persist failed (smart roi)', {
          clientId: boundClient.id,
          message: persistErr?.message
        });
      }

      const downloadUrl = await StorageService.getSignedUrl(signedResult.storagePath, 60 * 24 * 7);
      if (updatedSubmission.signer_email && downloadUrl) {
        emailDelivery.attempted = true;
        const signerName = String(updatedSubmission.signer_name || '').trim() || 'Signer';
        const clientName = String(roiResponse.clientFullName || boundClient.full_name || '').trim() || 'Client';
        const schoolName = String(roiContext?.school?.name || '').trim() || 'School';
        const subject = `${clientName} - School ROI Completed`;
        const text = `${signerName}, your school release of information is complete.\n\nClient: ${clientName}\nSchool: ${schoolName}\n\nDownload your signed copy:\n${downloadUrl}\n\nThis link expires in 7 days.`;
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
            <p>${escapeHtml(signerName)}, your school release of information is complete.</p>
            <p><strong>Client:</strong> ${escapeHtml(clientName)}<br/><strong>School:</strong> ${escapeHtml(schoolName)}</p>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed School ROI</a></p>
            <p style="color:#777;">This link expires in 7 days.</p>
          </div>
        `.trim();
        try {
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null,
            agencyId: boundClient?.agency_id || agency?.id || null
          });
          if (identity?.id) {
            await Promise.race([
              sendEmailFromIdentity({
                senderIdentityId: identity.id,
                to: updatedSubmission.signer_email,
                subject,
                text,
                html,
                source: 'auto'
              }),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error('roi_signer_email_timeout')), 15000);
              })
            ]);
          } else {
            const fallbackSignatureIdentity = await resolveFallbackSignatureIdentity({
              organizationId: link?.organization_id || null,
              scopeType: link?.scope_type || null,
              agencyId: boundClient?.agency_id || agency?.id || null
            });
            const signedContent = applyIdentitySignatureBlock({
              identity: fallbackSignatureIdentity,
              text,
              html
            });
            await Promise.race([
              EmailService.sendEmail({
                to: updatedSubmission.signer_email,
                subject,
                text: signedContent.text,
                html: signedContent.html,
                fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
                fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
                replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
                attachments: null,
                source: 'auto',
                agencyId: boundClient?.agency_id || agency?.id || null
              }),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error('roi_signer_email_timeout')), 15000);
              })
            ]);
          }
          emailDelivery.sent = true;
        } catch (emailErr) {
          emailDelivery.error = String(emailErr?.message || '').includes('timeout')
            ? 'send_timeout'
            : 'send_failed';
        }
      }
      return res.json({
        success: true,
        submission: await IntakeSubmission.findById(submissionId),
        documents: [documentRow],
        downloadUrl,
        emailDelivery,
        clientBundles: [{
          clientId: boundClient.id,
          clientName: roiResponse.clientFullName || boundClient.full_name || null,
          filename: `school-roi-${boundClient.id}.pdf`,
          downloadUrl
        }]
      });
    }

    let newGuardianCreated = false;
    let newGuardianTemporaryPassword = null;
    let newGuardianPasswordlessLoginUrl = null;
    let createdClients = [];
    if (link.create_client) {
      const {
        clients,
        guardianUser,
        newGuardianCreated: ngCreated,
        newGuardianTemporaryPassword: ngpw,
        newGuardianPasswordlessLoginUrl: ngMagic
      } = await PublicIntakeClientService.createClientAndGuardian({
        link,
        payload: req.body
      });
      createdClients = clients || [];
      newGuardianCreated = !!ngCreated;
      newGuardianTemporaryPassword = ngpw || null;
      newGuardianPasswordlessLoginUrl = ngMagic || null;
      updatedSubmission = await IntakeSubmission.updateById(submissionId, {
        client_id: createdClients?.[0]?.id || null,
        guardian_user_id: guardianUser?.id || null
      });
    }

    const signedDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    const signedByTemplate = new Map(signedDocs.map((d) => [d.document_template_id, d]));
    for (const t of packetDocumentTemplates) {
      if (!signedByTemplate.has(t.id)) {
        return res.status(400).json({ error: { message: `Missing signed document for ${t.name || 'document'}` } });
      }
    }

    const signer = buildSignerFromSubmission(updatedSubmission);
    const signedDocsOrdered = packetDocumentTemplates.map((t) => signedByTemplate.get(t.id)).filter(Boolean);
    const pdfPaths = [];
    const clientBundles = [];
    const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });

    for (const entry of signedDocsOrdered) {
      if (entry?.signed_pdf_path) {
        pdfPaths.push(entry.signed_pdf_path);
      }
    }

    // If the intake sequence includes an embedded school_roi step, generate and append
    // the Smart School ROI artifact in parallel so finalize can return immediately.
    let embeddedRoiPromise = Promise.resolve();
    if (hasProgrammedSchoolRoiStep(link) && intakeData?.smartSchoolRoi) {
      embeddedRoiPromise = (async () => {
        try {
        const embeddedSignatureData = String(intakeData?.smartSchoolRoi?.signatureData || '').trim();
        if (embeddedSignatureData) {
          let boundClient = null;
          const embeddedEffectiveClientId = updatedSubmission?.client_id || issuedRoiLink?.client_id || null;
          if (embeddedEffectiveClientId) {
            if (!updatedSubmission?.client_id) {
              updatedSubmission = await IntakeSubmission.updateById(submissionId, { client_id: embeddedEffectiveClientId });
            }
            try {
              boundClient = await Client.findById(embeddedEffectiveClientId, { includeSensitive: true });
            } catch {
              boundClient = null;
            }
          }
          const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
          const roiContext = await buildSmartSchoolRoiContext({
            link,
            boundClient,
            organization,
            agency,
            templates: allAllowedTemplates,
            issuedConfig: issuedRoiLink?.roi_context_json?.issuedConfig || issuedRoiLink?.roi_context_json || null
          });
          const selectedTemplate = await resolveSmartSchoolRoiTemplate({ roiContext, templates: allAllowedTemplates });
          if (selectedTemplate?.id) {
            const effectiveRoiContext = roiContext?.documentTemplate?.id
              ? roiContext
              : {
                  ...roiContext,
                  documentTemplate: {
                    id: Number(selectedTemplate.id),
                    name: selectedTemplate.name || 'School Release of Information',
                    documentType: selectedTemplate.document_type || 'school_roi'
                  }
                };
            const roiResponse = normalizeSmartSchoolRoiResponse({
              roiContext: effectiveRoiContext,
              intakeData,
              signedAt: now
            });
            const roiValidation = validateSmartSchoolRoiResponse(roiResponse);
            if (roiValidation.valid) {
              if (boundClient?.id) {
                try {
                  await persistClientDateOfBirthIfMissing({
                    clientId: boundClient.id,
                    dateOfBirth: roiResponse.clientDateOfBirth
                  });
                } catch {
                  // best-effort
                }
              }
              const roiAuditTrail = {
                ...buildAuditTrail({
                  link,
                  submission: {
                    ...updatedSubmission,
                    submitted_at: now,
                    client_name: roiResponse.clientFullName || null
                  }
                }),
                smartSchoolRoi: true,
                embeddedStep: true,
                roiResponse,
                signatureData: embeddedSignatureData
              };
              const roiSignedResult = await PublicIntakeSigningService.generateSignedDocument({
                template: {
                  ...selectedTemplate,
                  template_type: 'html',
                  html_content: buildSmartSchoolRoiHtml({
                    roiContext: effectiveRoiContext,
                    response: roiResponse,
                    signedAt: now
                  }),
                  document_action_type: 'signature',
                  signature_x: null,
                  signature_y: null,
                  signature_width: null,
                  signature_height: null,
                  signature_page: null
                },
                signatureData: embeddedSignatureData,
                signer,
                branding: {
                  schoolName: effectiveRoiContext?.school?.name || '',
                  agencyName: effectiveRoiContext?.agency?.name || '',
                  schoolLogoKey: effectiveRoiContext?.school?.logoUrl || '',
                  agencyLogoKey: effectiveRoiContext?.agency?.logoUrl || ''
                },
                auditTrail: roiAuditTrail,
                workflowData,
                submissionId,
                fieldDefinitions: [],
                fieldValues: {}
              });
              const embeddedClientId = Number(updatedSubmission?.client_id || createdClients?.[0]?.id || 0) || null;
              const embeddedDoc = await IntakeSubmissionDocument.create({
                intakeSubmissionId: submissionId,
                clientId: embeddedClientId,
                documentTemplateId: selectedTemplate.id,
                signedPdfPath: roiSignedResult.storagePath,
                pdfHash: roiSignedResult.pdfHash,
                signedAt: now,
                auditTrail: {
                  ...roiAuditTrail,
                  documentReference: roiSignedResult.referenceNumber || null,
                  documentName: selectedTemplate.name || null
                }
              });
              signedDocsOrdered.push(embeddedDoc);
              if (roiSignedResult.storagePath) {
                pdfPaths.push(roiSignedResult.storagePath);
              }

              // Apply embedded ROI completion (same as standalone smart school ROI path)
              const roiClientId = Number(updatedSubmission?.client_id || embeddedClientId || 0) || null;
              if (roiClientId && roiResponse) {
                const schoolOrganizationId = Number(
                  boundClient?.organization_id || link.organization_id || 0
                ) || null;

                try {
                  const clientRow = boundClient || await Client.findById(roiClientId, { includeSensitive: true });
                  const agencyId = clientRow?.agency_id || null;
                  const roiDocTitle = effectiveRoiContext?.school?.name
                    ? `${effectiveRoiContext.school.name} - Release of Information (Signed)`
                    : `${selectedTemplate.name || 'School ROI'} (Signed)`;
                  const embeddedPhiDoc = await ClientPhiDocument.create({
                    clientId: roiClientId,
                    agencyId,
                    schoolOrganizationId: schoolOrganizationId || agencyId,
                    intakeSubmissionId: submissionId,
                    storagePath: roiSignedResult.storagePath,
                    originalName: roiDocTitle,
                    mimeType: 'application/pdf',
                    uploadedByUserId: null,
                    scanStatus: 'clean',
                    expiresAt: retentionExpiresAt
                  });
                  await PhiDocumentAuditLog.create({
                    documentId: embeddedPhiDoc.id,
                    clientId: roiClientId,
                    action: 'uploaded',
                    actorUserId: null,
                    actorLabel: 'public_intake',
                    ipAddress: updatedSubmission.ip_address || null,
                    metadata: { submissionId, templateId: selectedTemplate.id, smartSchoolRoi: true, embeddedStep: true }
                  });
                } catch (phiErr) {
                  console.error('[publicIntake] embedded ROI PHI doc creation failed', { clientId: roiClientId, error: phiErr?.message });
                }

                try {
                  const accessUpdates = await applySmartSchoolRoiAccessDecisions({
                    clientId: roiClientId,
                    schoolOrganizationId: schoolOrganizationId || 0,
                    response: roiResponse,
                    actorUserId: null
                  });
                  await logAuditEvent(req, {
                    actionType: 'smart_school_roi_permissions_applied',
                    agencyId: boundClient?.agency_id || null,
                    metadata: {
                      clientId: roiClientId,
                      schoolOrganizationId,
                      embeddedStep: true,
                      packetReleaseAllowed: roiResponse.packetReleaseAllowed,
                      schoolSchedulingSafetyLogisticsAuthorized: roiResponse.schoolSchedulingSafetyLogisticsAuthorized === true,
                      approvedStaffCount: roiResponse.approvedStaffCount || 0,
                      deniedStaffCount: roiResponse.deniedStaffCount || 0,
                      accessUpdates
                    }
                  });
                } catch (accessErr) {
                  console.error('[publicIntake] embedded ROI access decisions failed', { clientId: roiClientId, error: accessErr?.message });
                }

                try {
                  await applyClientRoiCompletion({
                    clientId: roiClientId,
                    signedAt: now,
                    actorUserId: null
                  });
                } catch (roiErr) {
                  console.error('[publicIntake] embedded ROI completion failed, applying fallback', { clientId: roiClientId, error: roiErr?.message });
                  try {
                    const roiFallbackExpiry = new Date(now);
                    roiFallbackExpiry.setUTCFullYear(roiFallbackExpiry.getUTCFullYear() + 3);
                    await Client.update(roiClientId, { roi_expires_at: roiFallbackExpiry });
                  } catch (fallbackErr) {
                    console.error('[publicIntake] roi_expires_at fallback also failed', { clientId: roiClientId, error: fallbackErr?.message });
                  }
                }

                try {
                  await notifySchoolRoiCompletedForBackoffice({
                    agencyId: boundClient?.agency_id || null,
                    clientId: roiClientId,
                    clientLabel: boundClient?.full_name || boundClient?.initials || `Client ${roiClientId}`,
                    schoolLabel: effectiveRoiContext?.school?.name || 'school'
                  });
                } catch {
                  // best-effort
                }
              }
            } else {
              console.warn('[publicIntake] embedded school_roi payload failed validation; skipping packet include', {
                submissionId,
                missing: roiValidation.missing
              });
            }
          }
        }
        } catch (embeddedRoiError) {
          console.error('[publicIntake] failed generating embedded school_roi document', {
            submissionId,
            error: embeddedRoiError?.message || embeddedRoiError
          });
        }
      })();
    }

    res.json({
      success: true,
      submission: updatedSubmission,
      status: 'processing',
      submissionId
    });

    // Heavy processing: PDF merge, bundle, email, notifications, guardian persistence
    setImmediate(() => {
      void (async () => {
        try {
    await embeddedRoiPromise;

    let answersPdf = null;
    try {
      answersPdf = await buildAnswersPdfBuffer({ link, intakeData });
    } catch (answersErr) {
      console.error('[publicIntake] answers PDF generation failed (continuing without answers PDF)', {
        submissionId,
        error: answersErr?.message || answersErr
      });
      answersPdf = null;
    }

    let rawClients = createdClients.length
      ? createdClients.map((c) => ({ id: c.id, fullName: c.full_name || c.initials || '', initials: c.initials, contactPhone: c.contact_phone }))
      : (Array.isArray(req.body?.clients) ? req.body.clients : (req.body?.client ? [req.body.client] : []));
    if (!link.create_client && updatedSubmission?.client_id) {
      try {
        const boundClient = await Client.findById(updatedSubmission.client_id, { includeSensitive: true });
        if (boundClient?.id) {
          rawClients = [{
            id: boundClient.id,
            fullName: boundClient.full_name || boundClient.initials || `Client ${boundClient.id}`,
            initials: boundClient.initials || null,
            contactPhone: boundClient.contact_phone || null
          }];
        }
      } catch {
        // fall back to submitted payload below
      }
    }
    // Public forms (create_client=false): use signer as virtual entry so documents are created with client_id=null
    if (!link.create_client && !rawClients.length) {
      const signerName = String(updatedSubmission?.signer_name || '').trim() || 'Signer';
      rawClients = [{ id: null, fullName: signerName, initials: updatedSubmission?.signer_initials || null, contactPhone: null }];
    }
    const primaryClientName = String(rawClients?.[0]?.fullName || '').trim() || null;
    let registrationEnrollment = {
      attempted: false,
      selectionCount: 0,
      classEnrollments: 0,
      programAssignments: 0,
      programEventSignups: 0,
      companyEventEnrollments: 0,
      errors: []
    };
    try {
      registrationEnrollment = await enrollSmartRegistrationSelections({
        link,
        intakeData,
        payload: req.body || {},
        submissionId,
        clientIds: rawClients.map((c) => Number(c?.id || 0)).filter((id) => Number.isFinite(id) && id > 0),
        guardianUserId: updatedSubmission?.guardian_user_id || null
      });
    } catch (registrationErr) {
      console.error('[publicIntake] smart registration enrollment failed (continuing finalize)', {
        submissionId,
        error: registrationErr?.message || registrationErr
      });
    }

    const intakeClientRows = [];
    const isMultiClient = rawClients.length > 1;
    const docAuditByTemplate = new Map();
    signedDocsOrdered.forEach((doc) => {
      if (!doc) return;
      const rawTrail = doc.audit_trail;
      let trail = null;
      try {
        trail = rawTrail ? (typeof rawTrail === 'string' ? JSON.parse(rawTrail) : rawTrail) : null;
      } catch {
        trail = null;
      }
      docAuditByTemplate.set(doc.document_template_id, trail || {});
    });

    let roiCompletionPhiDocument = null;
    for (let i = 0; i < rawClients.length; i += 1) {
      const clientPayload = rawClients[i];
      const clientId = clientPayload?.id || null;
      const clientName = String(clientPayload?.fullName || '').trim() || null;

      intakeClientRows.push(
        await IntakeSubmissionClient.create({
          intakeSubmissionId: submissionId,
          clientId,
          fullName: clientName,
          initials: clientPayload?.initials || null,
          contactPhone: clientPayload?.contactPhone || null
        })
      );

      const clientPaths = [];

      if (isMultiClient) {
        for (const template of packetDocumentTemplates) {
          const baseAudit = docAuditByTemplate.get(template.id) || {};
          const signatureData = baseAudit?.signatureData || null;
          const baseFieldValues = baseAudit?.fieldValues && typeof baseAudit.fieldValues === 'object' ? baseAudit.fieldValues : {};
          const fieldDefinitions = parseFieldDefinitions(template.field_definitions);
          const fieldValues = buildDocumentFieldValuesForClient({
            link,
            intakeData,
            clientIndex: i,
            baseFieldValues
          });
          const clientAuditTrail = buildAuditTrail({
            link,
            submission: { ...updatedSubmission, submitted_at: now, client_name: clientName }
          });

          let storagePath = null;
          let pdfHash = null;
          let referenceNumber = null;

          if (template.document_action_type === 'signature' && !signatureData) {
            const sharedDoc = signedByTemplate.get(template.id);
            if (sharedDoc?.signed_pdf_path) {
              storagePath = sharedDoc.signed_pdf_path;
              pdfHash = sharedDoc.pdf_hash || null;
              if (clientId) {
                await IntakeSubmissionDocument.create({
                  intakeSubmissionId: submissionId,
                  clientId,
                  documentTemplateId: template.id,
                  signedPdfPath: storagePath,
                  pdfHash,
                  signedAt: now,
                  auditTrail: {
                    ...clientAuditTrail,
                    documentName: template.name || null,
                    fieldValues,
                    signatureData: null
                  }
                });
              }
            }
          } else {
            const result = await PublicIntakeSigningService.generateSignedDocument({
              template,
              signatureData,
              signer,
              auditTrail: clientAuditTrail,
              workflowData,
              submissionId,
              fieldDefinitions,
              fieldValues
            });
            storagePath = result.storagePath;
            pdfHash = result.pdfHash;
            referenceNumber = result.referenceNumber || null;
            await IntakeSubmissionDocument.create({
              intakeSubmissionId: submissionId,
              clientId,
              documentTemplateId: template.id,
              signedPdfPath: storagePath,
              pdfHash,
              signedAt: now,
              auditTrail: {
                ...clientAuditTrail,
                documentReference: referenceNumber,
                documentName: template.name || null,
                fieldValues,
                signatureData
              }
            });
          }

          if (storagePath) clientPaths.push(storagePath);
          if (clientId && storagePath) {
            try {
              const clientRow = await Client.findById(clientId, { includeSensitive: true });
              const agencyId = clientRow?.agency_id || null;
              const orgId = clientRow?.organization_id || clientRow?.school_organization_id || null;
              const phiDoc = await ClientPhiDocument.create({
                clientId,
                agencyId,
                schoolOrganizationId: orgId || agencyId,
                intakeSubmissionId: submissionId,
                storagePath,
                originalName: `${template.name || 'Document'} (Signed)`,
                mimeType: 'application/pdf',
                uploadedByUserId: null,
                scanStatus: 'clean',
                expiresAt: retentionExpiresAt
              });
              await PhiDocumentAuditLog.create({
                documentId: phiDoc.id,
                clientId,
                action: 'uploaded',
                actorUserId: null,
                actorLabel: 'public_intake',
                ipAddress: updatedSubmission.ip_address || null,
                metadata: { submissionId, templateId: template.id }
              });
            } catch {
              // best-effort; do not block public intake
            }
          }
        }
      } else {
        for (const template of packetDocumentTemplates) {
          const docRow = signedByTemplate.get(template.id);
          if (!docRow) continue;
          try {
            const clientRow = await Client.findById(clientId, { includeSensitive: true });
            const agencyId = clientRow?.agency_id || link?.organization_id || null;
            const orgId =
              clientRow?.organization_id ||
              clientRow?.school_organization_id ||
              (req.body?.organizationId ? Number(req.body.organizationId) : null) ||
              link?.organization_id ||
              null;
            const phiDoc = await ClientPhiDocument.create({
              clientId,
              agencyId,
              schoolOrganizationId: orgId || agencyId,
              intakeSubmissionId: submissionId,
              storagePath: docRow.signed_pdf_path,
              originalName: `${template.name || 'Document'} (Signed)`,
              mimeType: 'application/pdf',
              uploadedByUserId: null,
              scanStatus: 'clean',
              expiresAt: retentionExpiresAt
            });
            await PhiDocumentAuditLog.create({
              documentId: phiDoc.id,
              clientId,
              action: 'uploaded',
              actorUserId: null,
              actorLabel: 'public_intake',
              ipAddress: updatedSubmission.ip_address || null,
              metadata: { submissionId, templateId: template.id }
            });
            if (!roiCompletionPhiDocument && issuedRoiLink?.id) {
              roiCompletionPhiDocument = phiDoc;
            }
          } catch {
            // best-effort; do not block public intake
          }
        }
      }

      const mergePaths = clientPaths.length ? clientPaths : pdfPaths;
      if (mergePaths.length) {
        const prefixBuffers = !clientPaths.length && answersPdf ? [answersPdf] : [];
        const mergedClientPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(mergePaths, prefixBuffers);
        const clientBundleResult = await StorageService.saveIntakeClientBundle({
          submissionId,
          clientId: clientPayload?.id || 'unknown',
          fileBuffer: mergedClientPdf,
          filename: `intake-client-${clientPayload?.id || 'unknown'}.pdf`
        });
        const clientBundleHash = DocumentSigningService.calculatePDFHash(mergedClientPdf);
        const targetRow = intakeClientRows[i];
        if (targetRow?.id) {
          await IntakeSubmissionClient.updateById(targetRow.id, {
            bundle_pdf_path: clientBundleResult.relativePath,
            bundle_pdf_hash: clientBundleHash
          });
        }
        clientBundles.push({
          clientId: clientPayload?.id || null,
          clientName: clientPayload?.fullName || null,
          filename: `intake-client-${clientPayload?.id || 'unknown'}.pdf`,
          downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 7)
        });
      }

      if (clientId) {
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakeTextDocuments({
          clientId,
          clientRow,
          submissionId,
          link,
          intakeData,
          clientIndex: i,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          organizationId: req.body?.organizationId || null
        });

        // Save demographics to client profile if a demographics step was included
        const demographicsInfo = intakeData?.responses?.submission?.demographicsInfo;
        if (demographicsInfo) {
          await persistClientDemographicsIfProvided({ clientId, demographicsInfo });
        }

        // Save the primary insurer name from insurance step (best-effort)
        const insuranceInfo = intakeData?.responses?.submission?.insuranceInfo;
        const primaryInsurerName = String(insuranceInfo?.primary?.insurerName || '').trim();
        if (primaryInsurerName) {
          try {
            await pool.execute(
              `UPDATE clients SET primary_insurer_name = ? WHERE id = ?`,
              [primaryInsurerName.slice(0, 255), clientId]
            );
          } catch { /* column may not exist yet (migration pending) */ }
        }
      }
    }

    if (issuedRoiLink?.id && updatedSubmission?.client_id) {
      let completedClientRow = null;
      try {
        await applyClientRoiCompletion({
          clientId: updatedSubmission.client_id,
          signedAt: now,
          actorUserId: null
        });
        completedClientRow = await Client.findById(updatedSubmission.client_id, { includeSensitive: true });
      } catch (error) {
        console.error('applyClientRoiCompletion failed', {
          clientId: updatedSubmission.client_id,
          submissionId,
          signingLinkId: issuedRoiLink.id,
          error: error?.message || error
        });
      }
      await ClientSchoolRoiSigningLink.markCompleted({
        id: issuedRoiLink.id,
        intakeSubmissionId: submissionId,
        signedAt: now,
        completedClientPhiDocumentId: roiCompletionPhiDocument?.id || null
      });
      await notifySchoolRoiCompletedForBackoffice({
        agencyId: completedClientRow?.agency_id || updatedSubmission?.agency_id || null,
        clientId: updatedSubmission.client_id,
        clientLabel: completedClientRow?.full_name || completedClientRow?.initials || completedClientRow?.identifier_code || `Client ${updatedSubmission.client_id}`,
        schoolLabel: completedClientRow?.organization_name || (String(link?.scope_type || '').toLowerCase() === 'school' ? 'school' : null)
      });
    }

    let downloadUrl = null;
    if (pdfPaths.length > 0) {
      const mergedPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(
        pdfPaths,
        answersPdf ? [answersPdf] : []
      );
      const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
      const bundleResult = await StorageService.saveIntakeBundle({
        submissionId,
        fileBuffer: mergedPdf,
        filename: `intake-bundle-${submissionId}.pdf`
      });
      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: bundleResult.relativePath,
        combined_pdf_hash: bundleHash
      });
      downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 7);

      for (const clientPayload of rawClients) {
        const clientId = clientPayload?.id || null;
        if (!clientId) continue;
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakePacketDocument({
          clientId,
          clientRow,
          submissionId,
          storagePath: bundleResult.relativePath,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          link,
          organizationId: req.body?.organizationId || null
        });

        // Notify admin/CPA team (same as paper packet upload) so they can process the intake
        let agencyId = clientRow?.agency_id || null;
        if (!agencyId && link?.organization_id) {
          const scope = String(link?.scope_type || '').toLowerCase();
          if (scope === 'school') {
            agencyId = await AgencySchool.getActiveAgencyIdForSchool(link.organization_id);
          }
          if (!agencyId) {
            agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(link.organization_id);
          }
          if (!agencyId) agencyId = link.organization_id;
        }
        const submittedSchoolOrgId = String(link?.scope_type || '').toLowerCase() === 'school'
          ? (Number(link?.organization_id || 0) || null)
          : null;
        const schoolOrgId =
          submittedSchoolOrgId ||
          clientRow?.school_organization_id ||
          clientRow?.organization_id ||
          req.body?.organizationId ||
          null;
        const clientLabel =
          clientPayload?.fullName || clientRow?.identifier_code || clientRow?.initials || `ID ${clientId}`;
        notifyNewPacketUploaded({
          agencyId,
          schoolOrganizationId: schoolOrgId,
          clientId,
          clientNameOrIdentifier: clientLabel,
          clientInitials: clientRow?.initials || clientPayload?.initials || null,
          mode: 'digital_submission'
        }).catch(() => {});
      }

      // Resolve event summary once so it can be used by both the email and the persist block.
      let registrationEventSummary = '';
      try {
        const evSel = normalizeRegistrationSelections(intakeData).find((s) => registrationEntityType(s) === 'company_event');
        const aid = Number(link?.agency_id || 0) || null;
        if (evSel?.entityId && aid) {
          const [erows] = await pool.execute(
            'SELECT title, starts_at FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1',
            [Number(evSel.entityId), aid]
          );
          const er = erows?.[0];
          if (er) {
            const st = er.starts_at ? new Date(er.starts_at).toLocaleString() : '';
            registrationEventSummary = [String(er.title || '').trim(), st].filter(Boolean).join(' — ');
          }
        }
      } catch {
        registrationEventSummary = '';
      }

      if (updatedSubmission.signer_email) {
        emailDelivery.attempted = true;
        try {
          const clientCount = rawClients.length || 1;
          const { organization, agency } = await resolveIntakeOrgContext(link, { boundClient: null });
          const portalBase = String(config.frontendUrl || '').replace(/\/$/, '');
          const registrationLoginPageUrl = portalBase ? `${portalBase}/login` : '';
          const regFlow = linkSupportsPublicRegistrationFeatures(link);
          const registrationPasswordlessUrl =
            regFlow && link.create_guardian && newGuardianCreated
              ? (newGuardianPasswordlessLoginUrl || '')
              : '';
          const packetEmail = await resolvePacketCompletionEmailContent({
            link,
            agencyId: link?.agency_id || agency?.id || null,
            signerName: updatedSubmission.signer_name || '',
            signerEmail: updatedSubmission.signer_email || '',
            clientCount,
            primaryClientName,
            schoolName: organization?.name || '',
            downloadUrl,
            expiresInDays: 7,
            registrationLoginEmail: updatedSubmission.signer_email || '',
            registrationNeedsSetup: regFlow && link.create_guardian && newGuardianCreated,
            registrationTempPassword: regFlow && link.create_guardian ? (newGuardianTemporaryPassword || '') : '',
            portalLoginUrl: registrationLoginPageUrl,
            registrationPasswordlessUrl,
            registrationEventSummary
          });
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null
          });
          if (identity?.id) {
            await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: packetEmail.text,
              html: packetEmail.html,
              source: 'auto'
            });
          } else {
            if (!EmailService.isConfigured()) {
              throw new Error('email_not_configured');
            }
            const fallbackSignatureIdentity = await resolveFallbackSignatureIdentity({
              organizationId: link?.organization_id || null,
              scopeType: link?.scope_type || null
            });
            const signedPacketEmail = applyIdentitySignatureBlock({
              identity: fallbackSignatureIdentity,
              text: packetEmail.text,
              html: packetEmail.html
            });
            await EmailService.sendEmail({
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: signedPacketEmail.text,
              html: signedPacketEmail.html,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              attachments: null,
              source: 'auto',
              agencyId: link?.organization_id || null
            });
          }
          emailDelivery.sent = true;
        } catch (emailErr) {
          emailDelivery.error = String(emailErr?.message || '').includes('email_not_configured')
            ? 'email_not_configured'
            : 'send_failed';
          console.error('[publicIntake] packet completion email failed', {
            submissionId,
            message: emailErr?.message || emailErr
          });
        }
      }
    }

    if (linkSupportsPublicRegistrationFeatures(link) && link.create_guardian) {
      try {
        const portalBase = String(config.frontendUrl || '').replace(/\/$/, '');
        const loginPageUrl = portalBase ? `${portalBase}/login` : null;
        const merged = mergeIntakeSubmissionPatch(intakeData, {
          registration_completion_new_guardian: !!newGuardianCreated,
          registration_completion_login_email: updatedSubmission.signer_email || null,
          registration_completion_portal_url: newGuardianPasswordlessLoginUrl || loginPageUrl,
          registration_completion_event: registrationEventSummary || null
        });
        await IntakeSubmission.updateById(submissionId, {
          intake_data: JSON.stringify(merged),
          intake_data_hash: hashIntakeData(merged)
        });
      } catch (persistErr) {
        console.error('[publicIntake] registration completion hints persist failed', {
          submissionId,
          message: persistErr?.message || persistErr
        });
      }
    }

    // Persist latest guardian contact details from public intake for ROI resend defaults.
    const persistClientIds = new Set();
    if (Number(updatedSubmission?.client_id || 0)) persistClientIds.add(Number(updatedSubmission.client_id));
    for (const c of createdClients || []) {
      const cid = Number(c?.id || 0);
      if (cid) persistClientIds.add(cid);
    }
    for (const row of intakeClientRows || []) {
      const cid = Number(row?.client_id || 0);
      if (cid) persistClientIds.add(cid);
    }
    for (const clientId of persistClientIds) {
      try {
        const guardianProfile = extractGuardianProfileFromPayload({
          payload: req.body || {},
          intakeData
        });
        await persistGuardianProfileForClient({
          clientId,
          payload: req.body || {},
          intakeData,
          source: 'public_intake'
        });
        if (guardianProfile?.email) {
          await ensureGuardianAccountLinkedForClient({
            clientId,
            profile: guardianProfile,
            accessEnabled: !!link.create_guardian
          });
        }
      } catch (persistErr) {
        console.error('[publicIntake] guardian profile persist failed', {
          clientId,
          message: persistErr?.message
        });
      }
    }

    try {
      const latestSub = await IntakeSubmission.findById(submissionId);
      const orderedClientIds = rawClients.map((c) => Number(c?.id || 0)).filter((id) => id > 0);
      await persistIntakeGuardianWaiversFromFinalize({
        link,
        guardianUserId: latestSub?.guardian_user_id,
        clientIdsOrdered: orderedClientIds,
        intakeData,
        payload: req.body || {},
        ipAddress: getClientIpAddress(req),
        userAgent: req.headers['user-agent'] || null
      });
    } catch (waiverPersistErr) {
      console.error('[publicIntake] guardian waiver intake persist failed', {
        submissionId,
        message: waiverPersistErr?.message || waiverPersistErr
      });
    }

    if (!link.create_client && signedDocsOrdered.length > 0) {
      await notifyUnassignedDocuments({
        link,
        submission: updatedSubmission,
        docCount: signedDocsOrdered.length
      });
    }

        } catch (bgErr) {
          console.error('[publicIntake] background processing failed', {
            submissionId,
            error: bgErr?.message || bgErr,
            stack: bgErr?.stack
          });
        }
      })();
    });
  } catch (error) {
    next(error);
  }
};

export const submitPublicIntake = async (req, res, next) => {
  try {
    const emailDelivery = {
      attempted: false,
      sent: false,
      error: null
    };
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const submissionId = parseInt(req.body.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }

    applySmartRoiPayloadFallback(req.body);

    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    // Idempotent retry: if already submitted, return existing result (no duplicate work, no data loss)
    if (String(submission.status || '').toLowerCase() === 'submitted' && submission.combined_pdf_path) {
      let downloadUrl = null;
      try {
        downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 7);
      } catch {
        // best-effort
      }
      const clientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
      const clientBundles = [];
      for (const c of clientRows || []) {
        if (c?.bundle_pdf_path) {
          try {
            const url = await StorageService.getSignedUrl(c.bundle_pdf_path, 60 * 24 * 7);
            clientBundles.push({
              clientId: c.client_id,
              clientName: c.full_name || null,
              filename: `intake-client-${c.client_id || 'unknown'}.pdf`,
              downloadUrl: url
            });
          } catch {
            // best-effort
          }
        }
      }
      return res.json({
        success: true,
        submission,
        downloadUrl,
        clientBundles
      });
    }

    const isEmbeddedSmartRoiFinalize = Boolean(
      hasProgrammedSchoolRoiStep(link)
      && req.body?.intakeData?.smartSchoolRoi
    );

    if (link.create_client && !isEmbeddedSmartRoiFinalize) {
      const rawClients = Array.isArray(req.body?.clients) && req.body.clients.length
        ? req.body.clients
        : (req.body?.client ? [req.body.client] : []);
      if (!rawClients.length || !String(rawClients?.[0]?.fullName || '').trim()) {
        return res.status(400).json({ error: { message: 'Client full name is required.' } });
      }
    }
    if (!isEmbeddedSmartRoiFinalize) {
      const gEmail = String(req.body?.guardian?.email || '').trim();
      const gFirst = String(req.body?.guardian?.firstName || '').trim();
      if (!gEmail || !gFirst) {
        return res.status(400).json({ error: { message: 'Guardian name and email are required.' } });
      }
    }

    const signatureData = String(req.body.signatureData || '').trim();
    if (!signatureData) {
      return res.status(400).json({ error: { message: 'signatureData is required' } });
    }

    const now = new Date();
    const intakeData = req.body?.intakeData || null;
    const retentionPolicy = await resolveRetentionPolicy(link);
    const retentionExpiresAt = buildRetentionExpiresAt({ policy: retentionPolicy, submittedAt: now });
    const intakeDataHash = hashIntakeData(intakeData);
    let updatedSubmission = await IntakeSubmission.updateById(submissionId, {
      status: 'submitted',
      submitted_at: now,
      intake_data: intakeData ? JSON.stringify(intakeData) : null,
      intake_data_hash: intakeDataHash,
      retention_expires_at: retentionExpiresAt
    });

    let newGuardianTemporaryPassword = null;
    let newGuardianPasswordlessLoginUrl = null;
    let createdClients = [];
    if (link.create_client) {
      const {
        clients,
        guardianUser,
        newGuardianCreated: ngCreated,
        newGuardianTemporaryPassword: ngpw,
        newGuardianPasswordlessLoginUrl: ngMagic
      } = await PublicIntakeClientService.createClientAndGuardian({
        link,
        payload: req.body
      });
      createdClients = clients || [];
      newGuardianCreated = !!ngCreated;
      newGuardianTemporaryPassword = ngpw || null;
      newGuardianPasswordlessLoginUrl = ngMagic || null;
      updatedSubmission = await IntakeSubmission.updateById(submissionId, {
        client_id: createdClients?.[0]?.id || null,
        guardian_user_id: guardianUser?.id || null
      });
    }

    const allAllowedTemplates = await loadAllowedTemplates(link);
    if (!allAllowedTemplates.length) {
      return res.status(400).json({ error: { message: 'No documents are configured for this intake link.' } });
    }
    const packetDocumentTemplates = filterPacketDocumentTemplates(link, allAllowedTemplates, intakeData);
    if (!packetDocumentTemplates.length) {
      return res.status(400).json({ error: { message: 'No documents apply for this session.' } });
    }

    const signer = buildSignerFromSubmission(updatedSubmission);
    const signedDocs = [];
    const pdfPaths = [];
    const clientBundles = [];
    const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });
    let rawClients = createdClients.length
      ? createdClients.map((c) => ({ id: c.id, fullName: c.full_name || c.initials || '', initials: c.initials, contactPhone: c.contact_phone }))
      : (Array.isArray(req.body?.clients) ? req.body.clients : (req.body?.client ? [req.body.client] : []));
    // Public forms (create_client=false): use signer as virtual entry so documents are created with client_id=null
    if (!link.create_client && !rawClients.length) {
      const signerName = String(updatedSubmission?.signer_name || '').trim() || 'Signer';
      rawClients = [{ id: null, fullName: signerName, initials: updatedSubmission?.signer_initials || null, contactPhone: null }];
    }
    const primaryClientName = String(rawClients?.[0]?.fullName || '').trim() || null;

    const intakeClientRows = [];
    for (const clientPayload of rawClients) {
      const clientId = clientPayload?.id || null;
      const clientName = String(clientPayload?.fullName || '').trim() || null;
      const auditTrail = buildAuditTrail({
        link,
        submission: { ...updatedSubmission, submitted_at: now, client_name: clientName }
      });

      intakeClientRows.push(
        await IntakeSubmissionClient.create({
          intakeSubmissionId: submissionId,
          clientId,
          fullName: clientName,
          initials: clientPayload?.initials || null,
          contactPhone: clientPayload?.contactPhone || null
        })
      );

      const clientIndex = intakeClientRows.length - 1;
      const clientPaths = [];
      for (const template of packetDocumentTemplates) {
        const fieldDefinitions = parseFieldDefinitions(template.field_definitions);
        const fieldValues = buildDocumentFieldValuesForClient({
          link,
          intakeData,
          clientIndex,
          baseFieldValues: {}
        });
        const result = await PublicIntakeSigningService.generateSignedDocument({
          template,
          signatureData,
          signer,
          auditTrail,
          workflowData,
          submissionId,
          fieldDefinitions,
          fieldValues
        });

        const doc = await IntakeSubmissionDocument.create({
          intakeSubmissionId: submissionId,
          clientId,
          documentTemplateId: template.id,
          signedPdfPath: result.storagePath,
          pdfHash: result.pdfHash,
          signedAt: now,
          auditTrail: {
            ...auditTrail,
            documentReference: result.referenceNumber || null,
            documentName: template.name || null,
            fieldValues,
            signatureData
          }
        });

        if (result.storagePath) {
          pdfPaths.push(result.storagePath);
          clientPaths.push(result.storagePath);
        }

        if (clientId) {
          try {
            const clientRow = await Client.findById(clientId, { includeSensitive: true });
            const agencyId = clientRow?.agency_id || link?.organization_id || null;
            const orgId =
              clientRow?.organization_id ||
              clientRow?.school_organization_id ||
              (req.body?.organizationId ? Number(req.body.organizationId) : null) ||
              link?.organization_id ||
              null;
            const phiDoc = await ClientPhiDocument.create({
              clientId,
              agencyId,
              schoolOrganizationId: orgId || agencyId,
              intakeSubmissionId: submissionId,
              storagePath: result.storagePath,
              originalName: `${template.name || 'Document'} (Signed)`,
              mimeType: 'application/pdf',
              uploadedByUserId: null,
              scanStatus: 'clean',
              expiresAt: retentionExpiresAt
            });
            await PhiDocumentAuditLog.create({
              documentId: phiDoc.id,
              clientId,
              action: 'uploaded',
              actorUserId: null,
              actorLabel: 'public_intake',
              ipAddress: updatedSubmission.ip_address || null,
              metadata: { submissionId, templateId: template.id }
            });
          } catch {
            // best-effort; do not block public intake
          }
        }

        signedDocs.push(doc);
      }

      if (clientPaths.length) {
        const mergedClientPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(clientPaths);
        const clientBundleResult = await StorageService.saveIntakeClientBundle({
          submissionId,
          clientId: clientId || 'unknown',
          fileBuffer: mergedClientPdf,
          filename: `intake-client-${clientId || 'unknown'}.pdf`
        });
        const clientBundleHash = DocumentSigningService.calculatePDFHash(mergedClientPdf);
        if (intakeClientRows?.length) {
          const targetRow = intakeClientRows[intakeClientRows.length - 1];
          if (targetRow?.id) {
            await IntakeSubmissionClient.updateById(targetRow.id, {
              bundle_pdf_path: clientBundleResult.relativePath,
              bundle_pdf_hash: clientBundleHash
            });
          }
        }
        clientBundles.push({
          clientId,
          clientName,
          filename: `intake-client-${clientId || 'unknown'}.pdf`,
          downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 7)
        });
      }

      if (clientId) {
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakeTextDocuments({
          clientId,
          clientRow,
          submissionId,
          link,
          intakeData,
          clientIndex,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          organizationId: req.body?.organizationId || null
        });
      }
    }

    const answersPdf = await buildAnswersPdfBuffer({ link, intakeData });

    let downloadUrl = null;
    if (pdfPaths.length > 0) {
      const mergedPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(
        pdfPaths,
        answersPdf ? [answersPdf] : []
      );
      const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
      const bundleResult = await StorageService.saveIntakeBundle({
        submissionId,
        fileBuffer: mergedPdf,
        filename: `intake-bundle-${submissionId}.pdf`
      });
      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: bundleResult.relativePath,
        combined_pdf_hash: bundleHash
      });
      downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 7);

      for (const clientPayload of rawClients) {
        const clientId = clientPayload?.id || null;
        if (!clientId) continue;
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakePacketDocument({
          clientId,
          clientRow,
          submissionId,
          storagePath: bundleResult.relativePath,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          link,
          organizationId: req.body?.organizationId || null
        });

        // Notify admin/CPA team (same as paper packet upload) so they can process the intake
        let agencyId = clientRow?.agency_id || null;
        if (!agencyId && link?.organization_id) {
          const scope = String(link?.scope_type || '').toLowerCase();
          if (scope === 'school') {
            agencyId = await AgencySchool.getActiveAgencyIdForSchool(link.organization_id);
          }
          if (!agencyId) {
            agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(link.organization_id);
          }
          if (!agencyId) agencyId = link.organization_id;
        }
        const submittedSchoolOrgId = String(link?.scope_type || '').toLowerCase() === 'school'
          ? (Number(link?.organization_id || 0) || null)
          : null;
        const schoolOrgId =
          submittedSchoolOrgId ||
          clientRow?.school_organization_id ||
          clientRow?.organization_id ||
          req.body?.organizationId ||
          null;
        const clientLabel =
          clientPayload?.fullName || clientRow?.identifier_code || clientRow?.initials || `ID ${clientId}`;
        notifyNewPacketUploaded({
          agencyId,
          schoolOrganizationId: schoolOrgId,
          clientId,
          clientNameOrIdentifier: clientLabel,
          clientInitials: clientRow?.initials || clientPayload?.initials || null,
          mode: 'digital_submission'
        }).catch(() => {});
      }

      if (updatedSubmission.signer_email && EmailService.isConfigured()) {
        emailDelivery.attempted = true;
        const clientCount = rawClients.length || 1;
        const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink: null, boundClient: null });
        let registrationEventSummary = '';
        try {
          const evSel = normalizeRegistrationSelections(intakeData).find((s) => registrationEntityType(s) === 'company_event');
          const aid = Number(agency?.id || link?.agency_id || 0) || null;
          if (evSel?.entityId && aid) {
            const [erows] = await pool.execute(
              'SELECT title, starts_at FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1',
              [Number(evSel.entityId), aid]
            );
            const er = erows?.[0];
            if (er) {
              const st = er.starts_at ? new Date(er.starts_at).toLocaleString() : '';
              registrationEventSummary = [String(er.title || '').trim(), st].filter(Boolean).join(' — ');
            }
          }
        } catch {
          registrationEventSummary = '';
        }
        const portalBase = String(config.frontendUrl || '').replace(/\/$/, '');
        const registrationLoginPageUrl = portalBase ? `${portalBase}/login` : '';
        const regFlowEmail = linkSupportsPublicRegistrationFeatures(link);
        const registrationPasswordlessUrl =
          regFlowEmail && link.create_guardian && newGuardianCreated
            ? (newGuardianPasswordlessLoginUrl || '')
            : '';
        const packetEmail = await resolvePacketCompletionEmailContent({
          link,
          agencyId: link?.agency_id || agency?.id || null,
          signerName: updatedSubmission.signer_name || '',
          signerEmail: updatedSubmission.signer_email || '',
          clientCount,
          primaryClientName,
          schoolName: organization?.name || '',
          downloadUrl,
          expiresInDays: 7,
          registrationLoginEmail: updatedSubmission.signer_email || '',
          registrationNeedsSetup: regFlowEmail && link.create_guardian && newGuardianCreated,
          registrationTempPassword: regFlowEmail && link.create_guardian ? (newGuardianTemporaryPassword || '') : '',
          portalLoginUrl: registrationLoginPageUrl,
          registrationPasswordlessUrl,
          registrationEventSummary
        });
        try {
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null
          });
          if (identity?.id) {
            await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: packetEmail.text,
              html: packetEmail.html,
              source: 'auto'
            });
          } else {
            const fallbackSignatureIdentity = await resolveFallbackSignatureIdentity({
              organizationId: link?.organization_id || null,
              scopeType: link?.scope_type || null
            });
            const signedPacketEmail = applyIdentitySignatureBlock({
              identity: fallbackSignatureIdentity,
              text: packetEmail.text,
              html: packetEmail.html
            });
            await EmailService.sendEmail({
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: signedPacketEmail.text,
              html: signedPacketEmail.html,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              attachments: null,
              source: 'auto',
              agencyId: link?.organization_id || null
            });
          }
          emailDelivery.sent = true;
        } catch {
          emailDelivery.error = 'send_failed';
        }
      } else if (updatedSubmission.signer_email && !EmailService.isConfigured()) {
        emailDelivery.attempted = true;
        emailDelivery.sent = false;
        emailDelivery.error = 'email_not_configured';
      }
    }

    if (linkSupportsPublicRegistrationFeatures(link) && link.create_guardian) {
      try {
        const portalBase = String(config.frontendUrl || '').replace(/\/$/, '');
        const loginPageUrl = portalBase ? `${portalBase}/login` : null;
        const merged = mergeIntakeSubmissionPatch(intakeData, {
          registration_completion_new_guardian: !!newGuardianCreated,
          registration_completion_login_email: updatedSubmission.signer_email || null,
          registration_completion_portal_url: newGuardianPasswordlessLoginUrl || loginPageUrl,
          registration_completion_event: registrationEventSummary || null
        });
        await IntakeSubmission.updateById(submissionId, {
          intake_data: JSON.stringify(merged),
          intake_data_hash: hashIntakeData(merged)
        });
      } catch (persistErr) {
        console.error('[publicIntake] registration completion hints persist failed (submit)', {
          submissionId,
          message: persistErr?.message || persistErr
        });
      }
    }

    // Persist latest guardian contact details from public intake (mirrors finalizePublicIntake).
    const persistClientIds = new Set();
    if (Number(updatedSubmission?.client_id || 0)) persistClientIds.add(Number(updatedSubmission.client_id));
    for (const c of createdClients || []) {
      const cid = Number(c?.id || 0);
      if (cid) persistClientIds.add(cid);
    }
    for (const clientId of persistClientIds) {
      try {
        const guardianProfile = extractGuardianProfileFromPayload({
          payload: req.body || {},
          intakeData
        });
        await persistGuardianProfileForClient({
          clientId,
          payload: req.body || {},
          intakeData,
          source: 'public_intake'
        });
        if (guardianProfile?.email) {
          await ensureGuardianAccountLinkedForClient({
            clientId,
            profile: guardianProfile,
            accessEnabled: !!link.create_guardian
          });
        }
      } catch (persistErr) {
        console.error('[publicIntake] guardian profile persist failed (submit)', {
          clientId,
          message: persistErr?.message
        });
      }
    }

    try {
      const latestSub = await IntakeSubmission.findById(submissionId);
      const orderedClientIds = rawClients.map((c) => Number(c?.id || 0)).filter((id) => id > 0);
      await persistIntakeGuardianWaiversFromFinalize({
        link,
        guardianUserId: latestSub?.guardian_user_id,
        clientIdsOrdered: orderedClientIds,
        intakeData,
        payload: req.body || {},
        ipAddress: getClientIpAddress(req),
        userAgent: req.headers['user-agent'] || null
      });
    } catch (waiverPersistErr) {
      console.error('[publicIntake] guardian waiver intake persist failed (submit)', {
        submissionId,
        message: waiverPersistErr?.message || waiverPersistErr
      });
    }

    // Enroll clients and guardian in any classes or events selected during the registration step.
    // This mirrors the same call in finalizePublicIntake so that forms using the submit
    // pathway also complete registration (e.g. smart_registration forms).
    try {
      const enrollClientIds = rawClients
        .map((c) => Number(c?.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0);
      await enrollSmartRegistrationSelections({
        link,
        intakeData,
        payload: req.body || {},
        submissionId,
        clientIds: enrollClientIds,
        guardianUserId: updatedSubmission?.guardian_user_id || null
      });
    } catch (enrollErr) {
      console.error('[publicIntake] smart registration enrollment failed (submit)', {
        submissionId,
        message: enrollErr?.message || enrollErr
      });
    }

    if (!link.create_client && signedDocs.length > 0) {
      await notifyUnassignedDocuments({
        link,
        submission: updatedSubmission,
        docCount: signedDocs.length
      });
    }

    res.json({
      success: true,
      submission: updatedSubmission,
      documents: signedDocs,
      downloadUrl,
      emailDelivery,
      clientBundles
    });
  } catch (error) {
    next(error);
  }
};

export const getSchoolIntakeLink = async (req, res, next) => {
  try {
    const orgId = parseInt(req.params.organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });
    const org = await Agency.findById(orgId);
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } });
    const orgType = String(org.organization_type || 'school').toLowerCase();
    if (!['school', 'program', 'learning'].includes(orgType)) {
      return res.status(400).json({
        error: { message: 'Intake links are only available for school, program, or learning organizations' }
      });
    }
    // Same scope rules as GET /school-portal/:organizationId/intake-links (affiliated digital forms card).
    const scopeType = orgType === 'program' ? 'program' : 'school';
    const links = await IntakeLink.findByScope({ scopeType, organizationId: orgId, programId: null });
    const activeLinks = (links || []).filter((l) => !!l?.is_active);
    const link = activeLinks[0] || null;
    if (!activeLinks.length) return res.status(404).json({ error: { message: 'No intake link configured for school' } });
    res.json({ link, links: activeLinks, scopeType, organizationId: orgId });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /public-intake/:publicKey/:submissionId/upload
 * Upload files for an intake upload step. Uses multipart/form-data with field 'files'.
 */
export const uploadIntakeFiles = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    const stepId = String(req.body?.stepId || '').trim();
    const label = String(req.body?.label || 'Upload').trim().slice(0, 255);

    if (!submissionId || !stepId) {
      return res.status(400).json({ error: { message: 'submissionId and stepId are required' } });
    }

    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }
    if (String(submission.status || '').toLowerCase() === 'submitted') {
      return res.status(400).json({ error: { message: 'Submission already finalized' } });
    }

    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ error: { message: 'No files uploaded' } });
    }

    const pool = (await import('../config/database.js')).default;
    const saved = [];
    const useEncryption = DocumentEncryptionService.isConfigured();
    if (!useEncryption && process.env.NODE_ENV === 'production') {
      console.warn('Intake uploads stored unencrypted: REFERRAL_KMS_KEY or DOCUMENTS_KMS_KEY not configured');
    }

    for (const f of files) {
      if (!f?.buffer) continue;
      const sanitizedFilename = StorageService.sanitizeFilename(f.originalname || f.name || `upload-${Date.now()}`);
      const encryptionAad = JSON.stringify({
        intakeSubmissionId: submissionId,
        stepId,
        uploadLabel: label,
        filename: sanitizedFilename
      });

      let fileBuffer = f.buffer;
      let storagePath;
      let isEncrypted = 0;
      let encryptionKeyId = null;
      let encryptionWrappedKey = null;
      let encryptionIv = null;
      let encryptionAuthTag = null;
      let encryptionAlg = null;
      let encryptionAadVal = null;

      if (useEncryption) {
        const encResult = await DocumentEncryptionService.encryptBuffer(f.buffer, { aad: encryptionAad });
        fileBuffer = encResult.encryptedBuffer;
        isEncrypted = 1;
        encryptionKeyId = encResult.encryptionKeyId;
        encryptionWrappedKey = encResult.encryptionWrappedKeyB64;
        encryptionIv = encResult.encryptionIvB64;
        encryptionAuthTag = encResult.encryptionAuthTagB64;
        encryptionAlg = encResult.encryptionAlg;
        encryptionAadVal = encryptionAad;
      }

      const result = await StorageService.saveIntakeUpload({
        submissionId,
        stepId,
        fileBuffer,
        filename: sanitizedFilename,
        mimeType: useEncryption ? 'application/octet-stream' : (f.mimetype || null)
      });
      storagePath = result.relativePath;

      try {
        await pool.execute(
          `INSERT INTO intake_submission_uploads
           (intake_submission_id, step_id, upload_label, storage_path, original_filename, file_size, mime_type,
            is_encrypted, encryption_key_id, encryption_wrapped_key, encryption_iv, encryption_auth_tag, encryption_alg, encryption_aad)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            submissionId,
            stepId,
            label,
            storagePath,
            f.originalname || f.name || null,
            f.size || null,
            f.mimetype || null,
            isEncrypted,
            encryptionKeyId,
            encryptionWrappedKey,
            encryptionIv,
            encryptionAuthTag,
            encryptionAlg,
            encryptionAadVal
          ]
        );
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE') {
          return res.status(503).json({
            error: { message: 'Upload feature not available (run migration 517_intake_submission_uploads.sql)' }
          });
        }
        if (e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.message || '').includes('is_encrypted')) {
          return res.status(503).json({
            error: { message: 'Upload encryption not available (run migration 518_intake_submission_uploads_encryption.sql)' }
          });
        }
        throw e;
      }
      saved.push({ path: result.relativePath, originalName: f.originalname || f.name });
    }

    res.json({ success: true, count: saved.length, uploads: saved });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:publicKey/:submissionId/insurance-card-photos
 * Upload front/back insurance card photos for the guardian.
 * Stores images in GCS under intake-insurance/<submissionId>/<slot>.
 */
function parseInsuranceCardText(rawText = '') {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const compact = text.replace(/\s+/g, ' ').trim();
  const insurerPatterns = [
    { label: 'Health First Colorado (Medicaid)', re: /(health\s*first\s*colorado|colorado\s+access|ccha|community\s+health\s+alliance|medicaid|chp\+)/i },
    { label: 'United Healthcare', re: /united\s*health\s*care|uhc/i },
    { label: 'Anthem Blue Cross Blue Shield of Colorado', re: /(anthem|blue\s*cross|blue\s*shield|bcbs)/i },
    { label: 'Aetna', re: /\baetna\b/i },
    { label: 'Cigna', re: /\bcigna\b/i },
    { label: 'Kaiser Permanente', re: /kaiser/i },
    { label: 'Humana', re: /humana/i },
    { label: 'Molina Healthcare of Colorado', re: /molina/i },
    { label: 'TRICARE', re: /tricare/i },
    { label: 'Medicare (Original)', re: /medicare/i }
  ];

  const memberMatch = compact.match(/(?:member(?:\s*id)?|id(?:\s*#)?|subscriber(?:\s*id)?)\s*[:#]?\s*([A-Z0-9\-]{5,})/i);
  const groupMatch = compact.match(/(?:group(?:\s*(?:number|no|#))?)\s*[:#]?\s*([A-Z0-9\-]{3,})/i);
  const subscriberMatch = compact.match(/(?:subscriber|member|name)\s*[:#]?\s*([A-Z][A-Z\-'., ]{2,})/i);

  let insurerName = '';
  for (const candidate of insurerPatterns) {
    if (candidate.re.test(compact)) {
      insurerName = candidate.label;
      break;
    }
  }

  return {
    insurerName,
    memberId: memberMatch?.[1] ? String(memberMatch[1]).trim() : '',
    groupNumber: groupMatch?.[1] ? String(groupMatch[1]).trim() : '',
    subscriberName: subscriberMatch?.[1]
      ? String(subscriberMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 120)
      : ''
  };
}

async function extractInsuranceCardFieldsBestEffort(file) {
  if (!file?.buffer) return null;
  try {
    const text = await ReferralOcrService.extractText({
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/jpeg'
    });
    if (!String(text || '').trim()) return null;
    return parseInsuranceCardText(text);
  } catch {
    return null;
  }
}

export const saveInsuranceCardPhotos = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link?.is_active) return res.status(404).json({ error: { message: 'Intake link not found' } });
    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    const ALLOWED_SLOTS = new Set(['primary_front', 'primary_back', 'secondary_front', 'secondary_back']);
    const urls = {};
    const extracted = { primary: null, secondary: null };
    const bucket = await StorageService.getGCSBucket();
    const useEncryption = DocumentEncryptionService.isConfigured();
    if (!useEncryption && process.env.NODE_ENV === 'production') {
      console.warn('Insurance card uploads stored unencrypted: REFERRAL_KMS_KEY or DOCUMENTS_KMS_KEY not configured');
    }

    for (const f of files) {
      const slot = f.fieldname;
      if (!ALLOWED_SLOTS.has(slot) || !f?.buffer) continue;
      const ext = (f.originalname || '').split('.').pop().toLowerCase() || 'jpg';
      const key = `intake-insurance/${submissionId}/${slot}.${ext}`;
      const gcsFile = bucket.file(key);
      let fileBuffer = f.buffer;
      let saveMimeType = f.mimetype || 'image/jpeg';
      let metadata = { intakeSubmissionId: String(submissionId), slot };
      if (useEncryption) {
        const aad = JSON.stringify({
          intakeSubmissionId: submissionId,
          slot,
          filename: String(f.originalname || f.name || `insurance-${slot}`).slice(0, 255)
        });
        const encResult = await DocumentEncryptionService.encryptBuffer(f.buffer, { aad });
        fileBuffer = encResult.encryptedBuffer;
        saveMimeType = 'application/octet-stream';
        metadata = {
          ...metadata,
          isEncrypted: '1',
          encryptionKeyId: String(encResult.encryptionKeyId || ''),
          encryptionWrappedKey: String(encResult.encryptionWrappedKeyB64 || ''),
          encryptionIv: String(encResult.encryptionIvB64 || ''),
          encryptionAuthTag: String(encResult.encryptionAuthTagB64 || ''),
          encryptionAlg: String(encResult.encryptionAlg || ''),
          encryptionAad: aad
        };
      }
      await gcsFile.save(fileBuffer, {
        contentType: saveMimeType,
        metadata
      });
      // Build a public-accessible signed URL valid for 7 years (or use bucket-level public access).
      // For now, return the GCS path; the app can generate signed URLs on read.
      urls[`${slot}_url`] = `gs://${bucket.name}/${key}`;

      // OCR best-effort: parse card text to prefill insurer/member/group/subscriber fields.
      const parsed = await extractInsuranceCardFieldsBestEffort(f);
      if (!parsed) continue;
      if (slot.startsWith('primary_')) {
        extracted.primary = {
          ...(extracted.primary || {}),
          ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => String(v || '').trim()))
        };
      } else if (slot.startsWith('secondary_')) {
        extracted.secondary = {
          ...(extracted.secondary || {}),
          ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => String(v || '').trim()))
        };
      }
    }

    res.json({ success: true, urls, extracted });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:publicKey/:submissionId/payment-card
 * Tokenize and store a guardian's credit card via QuickBooks Payments.
 * Requires the agency to have QuickBooks Payments enabled.
 */
export const saveGuardianPaymentCard = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }

    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link?.is_active) return res.status(404).json({ error: { message: 'Intake link not found' } });

    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    const cardPayload = req.body?.card;
    if (!cardPayload?.number || !cardPayload?.expMonth || !cardPayload?.expYear || !cardPayload?.cvc) {
      return res.status(400).json({ error: { message: 'Complete card details are required' } });
    }

    let agencyId = Number(link?.agency_id || 0) || null;
    if (!agencyId && link?.organization_id) {
      const scope = String(link?.scope_type || '').toLowerCase();
      if (scope === 'school') {
        agencyId = await AgencySchool.getActiveAgencyIdForSchool(link.organization_id);
      }
      if (!agencyId) {
        agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(link.organization_id);
      }
      if (!agencyId) {
        agencyId = Number(link.organization_id || 0) || null;
      }
    }
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'No agency associated with this intake link' } });
    }

    // Resolve guardian user ID from the submission's signer data.
    const intakeData = (() => {
      const raw = submission.intake_data;
      if (!raw) return {};
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }
      return (raw && typeof raw === 'object') ? raw : {};
    })();
    const signerEmail = String(intakeData?.signerInfo?.email || submission.signer_email || '').trim().toLowerCase();
    let guardianUserId = submission.guardian_user_id || null;
    if (!guardianUserId && signerEmail) {
      const userRow = await User.findByEmail(signerEmail);
      guardianUserId = userRow?.id || null;
    }

    if (!guardianUserId) {
      return res.status(400).json({
        error: { message: 'Guardian account not yet established. Please complete the earlier steps first.' }
      });
    }

    // Create token + store card in QuickBooks Payments.
    let qbResult;
    try {
      qbResult = await QuickBooksPaymentsService.createCard({
        agencyId,
        card: {
          name: cardPayload.name || null,
          number: String(cardPayload.number).replace(/[^\d]/g, ''),
          expMonth: String(cardPayload.expMonth),
          expYear: String(cardPayload.expYear),
          cvc: String(cardPayload.cvc),
          address: cardPayload.address || null
        }
      });
    } catch (qbErr) {
      const msg = qbErr?.response?.data?.Errors?.[0]?.Message
        || qbErr?.response?.data?.error?.message
        || qbErr.message
        || 'Payment processing error';
      return res.status(422).json({ error: { message: `Card declined or invalid: ${msg}` } });
    }

    const cardObj = qbResult.card || {};
    const last4 = String(cardObj.last4 || cardPayload.number.replace(/[^\d]/g, '').slice(-4) || '');
    const brand = String(cardObj.cardType || cardObj.brand || 'Card');
    const autoCharge = req.body?.autoCharge === true || req.body?.autoCharge === 'true';

    await GuardianPaymentCard.create({
      guardianUserId,
      agencyId,
      qbPaymentCustomerId: qbResult.customerId || null,
      qbCardId: cardObj.id,
      cardBrand: brand,
      cardLast4: last4,
      cardExpMonth: cardPayload.expMonth,
      cardExpYear: cardPayload.expYear,
      cardholderName: cardPayload.name || null,
      autoCharge,
      isDefault: true,
      intakeSubmissionId: submissionId
    });

    res.json({ success: true, last4, brand, qbCardId: cardObj.id, autoCharge });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Internal Preferences Form — identify a staff user by email
// POST /public-intake/:publicKey/preferences/identify
// ---------------------------------------------------------------------------
export const identifyPreferencesUser = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: { message: 'Email is required.' } });
    }

    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Preferences link not found.' } });
    }
    if (String(link.form_type || '') !== 'internal_preferences') {
      return res.status(400).json({ error: { message: 'This link is not a preferences form.' } });
    }

    const agencyId = Number(link.agency_id || link.organization_id || 0);

    // Find user by email
    const [userRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status
       FROM users u
       WHERE LOWER(u.email) = ? AND u.is_archived = 0
       LIMIT 1`,
      [email]
    );
    const user = userRows?.[0] || null;

    if (!user) {
      return res.status(404).json({ error: { message: 'No account found with that email address.' } });
    }

    // Verify the user belongs to this agency when the link is agency-scoped
    if (agencyId) {
      const [memberRows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [user.id, agencyId]
      );
      if (!memberRows.length) {
        return res.status(403).json({ error: { message: 'This account is not associated with the agency for this link.' } });
      }
    }

    const memberships = await User.getAgencies(user.id);
    const tenantRows = (memberships || [])
      .filter((row) => String(row?.organization_type || 'agency').toLowerCase() === 'agency');
    const tenantMap = new Map();
    for (const row of tenantRows) {
      const id = Number(row?.id || 0);
      const name = String(row?.official_name || row?.name || '').trim();
      if (!id || !name || tenantMap.has(id)) continue;
      tenantMap.set(id, { id, name });
    }
    const tenants = Array.from(tenantMap.values());

    const UserPreferences = (await import('../models/UserPreferences.model.js')).default;
    const prefs = await UserPreferences.findByUserId(user.id) || {};

    // Parse JSON blobs if they arrived as strings
    const parseJsonField = (v) => {
      if (!v || typeof v === 'object') return v;
      try { return JSON.parse(v); } catch { return null; }
    };

    return res.json({
      userId: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      tenants,
      preferences: {
        email_enabled: prefs.email_enabled ?? true,
        sms_enabled: prefs.sms_enabled ?? false,
        in_app_enabled: prefs.in_app_enabled ?? true,
        quiet_hours_enabled: prefs.quiet_hours_enabled ?? false,
        quiet_hours_start_time: prefs.quiet_hours_start_time || null,
        quiet_hours_end_time: prefs.quiet_hours_end_time || null,
        quiet_hours_allowed_days: parseJsonField(prefs.quiet_hours_allowed_days) || [],
        notification_categories: parseJsonField(prefs.notification_categories) || {},
        notification_sound_enabled: prefs.notification_sound_enabled ?? true,
        push_notifications_enabled: prefs.push_notifications_enabled ?? false,
        dark_mode: prefs.dark_mode ?? false,
        timezone: prefs.timezone || null,
        layout_density: prefs.layout_density || 'standard',
        show_read_receipts: prefs.show_read_receipts ?? false,
        allow_staff_step_in: prefs.allow_staff_step_in ?? true,
      }
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Internal Preferences Form — save updated preferences for a staff user
// PUT /public-intake/:publicKey/preferences/save
// ---------------------------------------------------------------------------
export const savePreferencesUser = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const userId = Number(req.body?.userId || 0);
    const incoming = req.body?.preferences || {};

    if (!userId) {
      return res.status(400).json({ error: { message: 'userId is required.' } });
    }

    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Preferences link not found.' } });
    }
    if (String(link.form_type || '') !== 'internal_preferences') {
      return res.status(400).json({ error: { message: 'This link is not a preferences form.' } });
    }

    const agencyId = Number(link.agency_id || link.organization_id || 0);
    if (agencyId) {
      const [memberRows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!memberRows.length) {
        return res.status(403).json({ error: { message: 'This account is not associated with the agency for this link.' } });
      }
    }

    // Allowlist — only fields safe to set from a public form
    const allowed = [
      'email_enabled', 'sms_enabled', 'in_app_enabled',
      'quiet_hours_enabled', 'quiet_hours_start_time', 'quiet_hours_end_time', 'quiet_hours_allowed_days',
      'notification_categories',
      'notification_sound_enabled', 'push_notifications_enabled',
      'dark_mode', 'timezone', 'layout_density',
      'show_read_receipts', 'allow_staff_step_in'
    ];

    const updates = {};
    for (const key of allowed) {
      if (key in incoming) updates[key] = incoming[key];
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: { message: 'No valid preference fields supplied.' } });
    }

    const UserPreferences = (await import('../models/UserPreferences.model.js')).default;
    await UserPreferences.update(userId, updates);

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
