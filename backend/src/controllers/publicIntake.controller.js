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
import { buildRegistrationTicketPdf } from '../services/registrationTicketPdf.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import PublicIntakeClientService, { deriveInitials } from '../services/publicIntakeClient.service.js';
import {
  agencyReturningGuardianAutoMatchEnabled,
  tryReturningGuardianAutoMatch
} from '../services/publicIntakeReturningMatch.service.js';
import { fetchRegistrationCatalogItems } from '../services/registrationCatalog.service.js';
import { enrollClientsInCompanyEvent } from '../services/skillBuildersIntakeEnrollment.service.js';
import applyClientRoiCompletion from '../services/clientRoiCompletion.service.js';
import applyClientIntakeCompletion from '../services/clientIntakeCompletion.service.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import { attachSignedPdfToClient } from '../services/phiDocumentAttachment.service.js';
import Client from '../models/Client.model.js';
import StorageService from '../services/storage.service.js';
import { compressPdfBuffer } from '../services/pdfCompression.service.js';
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
import StripePaymentsService, { isStripeConfigured, getStripePublishableKey } from '../services/stripePayments.service.js';
import { normalizeGradeForSave } from '../utils/clientGrade.js';
import { getIntakePdfStrings } from '../services/intakeLocaleLabels.js';

/** Fetch the Stripe Connect account ID for an agency (null if not connected). */
async function getAgencyStripeConnectAccountId(agencyId) {
  if (!agencyId) return null;
  const [rows] = await pool.execute(
    `SELECT stripe_connect_account_id, stripe_connect_status
     FROM agency_billing_accounts WHERE agency_id = ? LIMIT 1`,
    [agencyId]
  );
  const row = rows[0];
  // Only return the account if it's fully active (charges_enabled)
  if (row?.stripe_connect_status === 'active' && row?.stripe_connect_account_id) {
    return row.stripe_connect_account_id;
  }
  return null;
}
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
import { notifyNewPacketUploaded, notifyCompanyEventRegistrationSubmitted } from '../services/clientNotifications.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity, logSkippedOrFailedEmail } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import { buildJobDescriptionAttachmentForEmail } from '../services/hiringReferenceRequests.service.js';
import { resolveJobApplicationSenderIdentity } from '../services/hiringReferenceIdentity.service.js';
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

const parseJsonObjectSafe = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const compactText = (value, max = 240) => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  return raw ? raw.slice(0, max) : '';
};

const sanitizeApplicationPageJson = (raw) => {
  const obj = parseJsonObjectSafe(raw);
  if (!obj) return null;
  const normalizeItems = (items, maxItems) => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const title = compactText(item.title, 80);
        const body = compactText(item.body || item.description, 180);
        if (!title && !body) return null;
        return {
          icon: compactText(item.icon, 32),
          title,
          body
        };
      })
      .filter(Boolean)
      .slice(0, maxItems);
  };
  const out = {
    eyebrow: compactText(obj.eyebrow, 80),
    lead: compactText(obj.lead, 160),
    titleHighlight: compactText(obj.titleHighlight || obj.title_highlight, 120),
    heroImageUrl: compactText(obj.heroImageUrl || obj.hero_image_url, 1024),
    heroImageAlt: compactText(obj.heroImageAlt || obj.hero_image_alt, 160),
    heroImagePosition: compactText(obj.heroImagePosition || obj.hero_image_position, 80),
    secureTitle: compactText(obj.secureTitle || obj.secure_title, 80),
    secureSubtitle: compactText(obj.secureSubtitle || obj.secure_subtitle, 120),
    startHeading: compactText(obj.startHeading || obj.start_heading, 120),
    startSubtitle: compactText(obj.startSubtitle || obj.start_subtitle, 180),
    startButtonText: compactText(obj.startButtonText || obj.start_button_text, 80),
    startTimeNote: compactText(obj.startTimeNote || obj.start_time_note, 120),
    showLeafAccent: obj.showLeafAccent !== false && obj.show_leaf_accent !== false,
    featureCards: normalizeItems(obj.featureCards || obj.feature_cards, 4),
    trustItems: normalizeItems(obj.trustItems || obj.trust_items, 3)
  };
  return Object.values(out).some((v) => (Array.isArray(v) ? v.length > 0 : !!v)) ? out : null;
};
const mergeApplicationPageJson = (agencyPage, jobPage) => {
  const base = sanitizeApplicationPageJson(agencyPage) || null;
  const override = sanitizeApplicationPageJson(jobPage) || null;
  if (!base) return override;
  if (!override) return base;

  const pick = (key) => override[key] || base[key] || '';
  const merged = {
    eyebrow: pick('eyebrow'),
    lead: pick('lead'),
    titleHighlight: pick('titleHighlight'),
    heroImageUrl: pick('heroImageUrl'),
    heroImageAlt: pick('heroImageAlt'),
    heroImagePosition: pick('heroImagePosition'),
    secureTitle: pick('secureTitle'),
    secureSubtitle: pick('secureSubtitle'),
    startHeading: pick('startHeading'),
    startSubtitle: pick('startSubtitle'),
    startButtonText: pick('startButtonText'),
    startTimeNote: pick('startTimeNote'),
    showLeafAccent: override.showLeafAccent !== undefined ? override.showLeafAccent : base.showLeafAccent,
    featureCards: override.featureCards?.length ? override.featureCards : (base.featureCards || []),
    trustItems: override.trustItems?.length ? override.trustItems : (base.trustItems || [])
  };
  return sanitizeApplicationPageJson(merged);
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
/**
 * Some intake links have a hard-bound company_event_id (the link is "for"
 * a specific event), but the user doesn't go through an interactive
 * Registration step — the enrollment is implicit from the link itself.
 * Without a synthetic registration selection in intakeData.responses
 * .submission.registrationSelections, downstream consumers think there's
 * no registration on this submission and therefore:
 *   - Skip the Registration Confirmation ticket PDF (returned null).
 *   - Skip the EVENT_TITLE / EVENT_DATES placeholders for the email.
 *   - Persist registration_completion_event = null, so the frontend
 *     success page never displays the event the family signed up for.
 *
 * This helper mutates intakeData in-place to inject a single synthesized
 * { entityType: 'company_event', entityId: link.company_event_id } row
 * IFF (a) the link has a bound event, AND (b) no user-selected
 * company_event/event row already exists. It's a safe no-op otherwise.
 *
 * Called once at the top of each finalize handler so every downstream
 * registration-aware code path (ticket PDF, email placeholders,
 * registration_completion_event persistence) sees the bound event.
 */
/**
 * Stamp the request IP + user-agent + a server-side signedAt onto the
 * Insurance Authorization & Assignment of Benefits e-signature inside the
 * submission's insuranceInfo block, in place, so that:
 *   - the persisted intake_data row carries a complete audit record
 *   - the answers PDF / packet renders the same "signed by + when + how +
 *     IP + UA" attestation we already render for waiver sections
 *   - re-signing later overwrites the stamp atomically with the new request
 *
 * No-op if the parent never signed the insurance authorization (neither
 * a typed name nor a re-used drawn signature is present). Intended to be
 * called once per finalize handler, *before* JSON.stringify(intakeData).
 */
const stampInsuranceAuthorizationSignatureMeta = (intakeData, req, signedAtFallback) => {
  if (!intakeData || typeof intakeData !== 'object') return;
  // Find the submission bag in either the nested or flat shape.
  let submission = null;
  if (intakeData.responses && typeof intakeData.responses === 'object') {
    if (intakeData.responses.submission && typeof intakeData.responses.submission === 'object') {
      submission = intakeData.responses.submission;
    }
  }
  if (!submission && intakeData.submission && typeof intakeData.submission === 'object') {
    submission = intakeData.submission;
  }
  if (!submission || typeof submission !== 'object') return;
  const insInfo = submission.insuranceInfo;
  if (!insInfo || typeof insInfo !== 'object') return;
  const typed = String(insInfo.authorizationSignature || '').trim();
  const drawn = String(insInfo.authorizationSignatureData || '').trim();
  // No signature applied at all? Don't fabricate audit metadata.
  if (!typed && drawn.length < 50) return;
  let ip = null;
  try {
    ip = getClientIpAddress(req);
  } catch {
    ip = null;
  }
  const ua = req?.get ? req.get('user-agent') : (req?.headers?.['user-agent'] || null);
  insInfo.authorizationSignedIp = ip || null;
  insInfo.authorizationSignedUserAgent = ua || null;
  // Prefer the client-recorded signedAt (captured at the moment the parent
  // clicked "Apply my signature"), but fall back to server time at finalize
  // so we always have a trustworthy timestamp even if the client clock is
  // wildly skewed or omitted.
  if (!String(insInfo.authorizationSignedAt || '').trim()) {
    insInfo.authorizationSignedAt = (signedAtFallback || new Date()).toISOString
      ? (signedAtFallback || new Date()).toISOString()
      : new Date().toISOString();
  }
  if (!String(insInfo.authorizationSourceMethod || '').trim()) {
    insInfo.authorizationSourceMethod = drawn.length >= 50 ? 'reused_guardian_signature' : 'typed_full_name';
  }
};

const ensureLinkBoundCompanyEventSelection = (intakeData, link) => {
  const eventId = Number(link?.company_event_id || 0) || null;
  if (!eventId) return;
  if (!intakeData || typeof intakeData !== 'object') return;
  if (!intakeData.responses || typeof intakeData.responses !== 'object') {
    intakeData.responses = {};
  }
  if (!intakeData.responses.submission || typeof intakeData.responses.submission !== 'object') {
    intakeData.responses.submission = {};
  }
  const sub = intakeData.responses.submission;
  if (!Array.isArray(sub.registrationSelections)) {
    sub.registrationSelections = [];
  }
  const alreadyHasEvent = sub.registrationSelections.some((row) => {
    if (!row || typeof row !== 'object') return false;
    const t = String(row.entityType || '').trim().toLowerCase();
    return (t === 'company_event' || t === 'event') && Number(row.entityId || 0) === eventId;
  });
  if (alreadyHasEvent) return;
  sub.registrationSelections.push({
    entityType: 'company_event',
    entityId: eventId,
    sourceProgramId: Number(link?.program_id || 0) || null,
    sourceSiteId: null,
    scheduleBlocks: [],
    payerType: null,
    // Diagnostic — easy to spot in raw intake_data when debugging which
    // selections came from the link vs. an interactive selection step.
    _autoFromLinkBinding: true
  });
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

/** Placeholders for completion email / PDFs tied to a selected company event registration. */
const loadRegistrationEventFieldPlaceholders = async (intakeData, link) => {
  const empty = {
    EVENT_TITLE: '',
    EVENT_DATES: '',
    EVENT_ADDRESS: '',
    EVENT_REPORT_TIME: '',
    EVENT_DURATION: '',
    // Optional: derived from company_event_session_dates
    EVENT_SESSIONS: ''
  };
  try {
    const evSel = normalizeRegistrationSelections(intakeData).find(
      (s) => registrationEntityType(s) === 'company_event'
    );
    if (!evSel?.entityId) return empty;
    const eventId = Number(evSel.entityId);
    if (!eventId) return empty;

    // Prefer scoped lookup when we can, but DO NOT fail hard if the intake link
    // is school-scoped (organization_id != agency_id). In those cases the strict
    // agency filter makes placeholders silently empty and the packet shows
    // "EVENT #<id>" despite the event having a title.
    const aid = Number(link?.agency_id || link?.organization_id || 0) || null;
    let er = null;
    try {
      if (aid) {
        const [rows] = await pool.execute(
          `SELECT title, starts_at, ends_at, timezone,
                  public_location_address, event_location_name, event_location_address
           FROM company_events
           WHERE id = ? AND agency_id = ?
           LIMIT 1`,
          [eventId, aid]
        );
        er = rows?.[0] || null;
      }
    } catch {
      // fall through
    }
    if (!er) {
      const [rows2] = await pool.execute(
        `SELECT title, starts_at, ends_at, timezone,
                public_location_address, event_location_name, event_location_address
         FROM company_events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );
      er = rows2?.[0] || null;
    }
    if (!er) return empty;

    const title = String(er.title || '').trim();
    const tz = String(er.timezone || '').trim();
    const fmtOpts = tz ? { timeZone: tz } : {};

    // Prefer the per-session schedule (most accurate) when available.
    let sessions = [];
    try {
      const [sdRows] = await pool.execute(
        `SELECT session_date, starts_at, ends_at, timezone, location_label, location_address
         FROM company_event_session_dates
         WHERE company_event_id = ?
         ORDER BY starts_at ASC, session_date ASC`,
        [eventId]
      );
      sessions = Array.isArray(sdRows) ? sdRows : [];
    } catch {
      sessions = [];
    }

    const normalizeDate = (d) => {
      try {
        const dt = d instanceof Date ? d : new Date(d);
        if (!Number.isFinite(dt.getTime())) return '';
        return dt.toLocaleDateString(undefined, fmtOpts);
      } catch {
        return '';
      }
    };
    const normalizeTime = (d) => {
      try {
        const dt = d instanceof Date ? d : new Date(d);
        if (!Number.isFinite(dt.getTime())) return '';
        return dt.toLocaleTimeString(undefined, { ...fmtOpts, hour: 'numeric', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    const firstSession = sessions.length ? sessions[0] : null;
    const lastSession = sessions.length ? sessions[sessions.length - 1] : null;

    const start = firstSession?.starts_at ? new Date(firstSession.starts_at) : (er.starts_at ? new Date(er.starts_at) : null);
    const end = lastSession?.ends_at ? new Date(lastSession.ends_at) : (er.ends_at ? new Date(er.ends_at) : null);

    const dates = start
      ? `${normalizeDate(start)}${
          end && Number.isFinite(end.getTime()) && normalizeDate(end) && normalizeDate(end) !== normalizeDate(start)
            ? ` – ${normalizeDate(end)}`
            : ''
        }`
      : '';
    const reportTime = start ? normalizeTime(start) : '';
    let duration = '';
    if (firstSession?.starts_at && firstSession?.ends_at) {
      try {
        const a = new Date(firstSession.starts_at);
        const b = new Date(firstSession.ends_at);
        const mins = Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
          ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
          : 0;
        if (mins) duration = mins >= 120 ? `${Math.round(mins / 60)} hr` : `${mins} min`;
      } catch {
        duration = '';
      }
    }

    let sessionsText = '';
    if (sessions.length) {
      const lines = sessions.map((s) => {
        const d = s?.starts_at || s?.session_date;
        const st = s?.starts_at ? normalizeTime(s.starts_at) : '';
        const et = s?.ends_at ? normalizeTime(s.ends_at) : '';
        const t = st && et ? `${st} – ${et}` : (st || et || '');
        const dateStr = d ? normalizeDate(d) : '';
        return [dateStr, t].filter(Boolean).join(': ');
      }).filter(Boolean);
      sessionsText = lines.join('\n');
    }

    const addr = String(er.public_location_address || '').trim()
      || [er.event_location_name, er.event_location_address].filter(Boolean).join(' — ');
    return {
      EVENT_TITLE: title,
      EVENT_DATES: dates,
      EVENT_ADDRESS: addr,
      EVENT_REPORT_TIME: reportTime,
      EVENT_DURATION: duration,
      EVENT_SESSIONS: sessionsText
    };
  } catch {
    return empty;
  }
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
  result.enrolledCompanyEvents = [];
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
  // Fall back to the link's agency_id when none of the clients have one
  // attached yet — happens when the kids were just created in the same
  // request and the in-memory `clientIds` resolved before the SELECT could
  // see them. Without this, multi-child company-event enrollment silently
  // skips the entire batch (no rows returned → agencyIdForEnrollment null).
  if (!agencyIdForEnrollment) {
    agencyIdForEnrollment = Number(link?.agency_id || 0) || null;
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
        const okClientIds = (bulk.results || [])
          .filter((r) => r?.ok)
          .map((r) => Number(r.clientId))
          .filter((n) => Number.isFinite(n) && n > 0);
        const okCount = okClientIds.length;
        result.companyEventEnrollments += okCount;
        if (okCount > 0) {
          result.enrolledCompanyEvents.push({
            eventId,
            agencyId: agencyIdForEnrollment,
            clientIds: okClientIds
          });
        }
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
const extractGuardianProfileFromPayload = ({ payload = {}, intakeData = {}, submission = null } = {}) => {
  const guardianBody = payload?.guardian && typeof payload.guardian === 'object' ? payload.guardian : {};
  const guardianIntake = intakeData?.guardian && typeof intakeData.guardian === 'object' ? intakeData.guardian : {};
  // The submission row itself has signer_* columns that are populated the
  // moment the user types their name/email on the first step. Including them
  // here lets `persistGuardianProfileForClient` build a usable profile even
  // mid-flow (e.g. when the payment step triggers early guardian
  // provisioning and we haven't yet collected the full "guardian" block).
  const submissionRow = submission && typeof submission === 'object' ? submission : {};
  const payloadSignerName = payload?.signer_name || payload?.signerName || submissionRow?.signer_name || '';
  const payloadSignerEmail = payload?.signer_email || payload?.signerEmail || submissionRow?.signer_email || '';
  const payloadSignerPhone = payload?.signer_phone || payload?.signerPhone || submissionRow?.signer_phone || '';
  const responses = intakeData?.responses && typeof intakeData.responses === 'object' ? intakeData.responses : {};
  const guardianResponses = responses?.guardian && typeof responses.guardian === 'object' ? responses.guardian : {};
  const submissionResponses = responses?.submission && typeof responses.submission === 'object' ? responses.submission : {};
  // Signer/signature step often stashes the guardian's typed name here; check
  // both nested shapes used by different intake types.
  const signerResponses = responses?.signer && typeof responses.signer === 'object' ? responses.signer : {};
  const guardianInfoResponses = responses?.guardianInfo && typeof responses.guardianInfo === 'object' ? responses.guardianInfo : {};
  const pick = (...values) => values.find((v) => String(v || '').trim()) || '';
  // When the intake only captured a single "signer_name" string, split it on
  // the first whitespace so we still get first/last separately for the
  // guardian profile card.
  const signerNameStr = String(payloadSignerName || '').trim();
  const signerNameParts = signerNameStr ? signerNameStr.split(/\s+/) : [];
  const signerFirst = signerNameParts[0] || '';
  const signerLast = signerNameParts.length > 1 ? signerNameParts.slice(1).join(' ') : '';
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
      guardianInfoResponses?.firstName,
      guardianInfoResponses?.first_name,
      submissionResponses?.firstName,
      submissionResponses?.first_name,
      submissionResponses?.guardianFirstName,
      submissionResponses?.guardian_first_name,
      submissionResponses?.guardian_first,
      signerResponses?.firstName,
      signerResponses?.first_name,
      signerFirst
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
      guardianInfoResponses?.lastName,
      guardianInfoResponses?.last_name,
      submissionResponses?.lastName,
      submissionResponses?.last_name,
      submissionResponses?.guardianLastName,
      submissionResponses?.guardian_last_name,
      submissionResponses?.guardian_last,
      signerResponses?.lastName,
      signerResponses?.last_name,
      signerLast
    )
  ) || null;
  const fullName = normalizeName(`${firstName || ''} ${lastName || ''}`) || signerNameStr || null;
  const email = normalizeName(
    pick(
      guardianBody?.email,
      guardianIntake?.email,
      guardianResponses?.email,
      guardianResponses?.guardianEmail,
      guardianResponses?.guardian_email,
      guardianResponses?.email_address,
      guardianInfoResponses?.email,
      submissionResponses?.email,
      submissionResponses?.guardianEmail,
      submissionResponses?.guardian_email,
      submissionResponses?.email_address,
      signerResponses?.email,
      payloadSignerEmail
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
      guardianInfoResponses?.phone,
      guardianInfoResponses?.phoneNumber,
      submissionResponses?.phone,
      submissionResponses?.guardianPhone,
      submissionResponses?.guardian_phone,
      submissionResponses?.phoneNumber,
      submissionResponses?.phone_number,
      signerResponses?.phone,
      payloadSignerPhone
    )
  ) || null;
  const relationship = normalizeName(
    pick(
      guardianBody?.relationship,
      guardianIntake?.relationship,
      guardianResponses?.relationship,
      guardianResponses?.guardianRelationship,
      guardianResponses?.guardian_relationship,
      guardianInfoResponses?.relationship,
      submissionResponses?.relationship,
      submissionResponses?.guardianRelationship,
      submissionResponses?.guardian_relationship,
      signerResponses?.relationship
    )
  ) || null;
  const dateOfBirth = normalizeDateOnly(
    guardianBody?.dateOfBirth
    || guardianIntake?.dateOfBirth
    || guardianBody?.dob
    || guardianIntake?.dob
    || guardianInfoResponses?.dateOfBirth
    || guardianInfoResponses?.dob
    || findDateLikeValue(guardianResponses)
    || findDateLikeValue(submissionResponses)
  );
  const profile = { firstName, lastName, fullName, email, phone, relationship, dateOfBirth };
  const hasAny = Object.values(profile).some((v) => String(v || '').trim());
  return hasAny ? profile : null;
};
const persistGuardianProfileForClient = async ({
  clientId,
  payload = {},
  intakeData = {},
  submission = null,
  source = 'public_intake'
} = {}) => {
  const cid = Number(clientId || 0);
  if (!cid) return;
  const profile = extractGuardianProfileFromPayload({ payload, intakeData, submission });
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
const parseIntakeYesNo = (val) => {
  const s = String(val ?? '').trim().toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(s)) return true;
  if (['no', 'false', '0', 'n'].includes(s)) return false;
  return null;
};

/** Merge demographics step + clinical question keys used for client / guardian profile sync.
 *  Pass `perClientResponses` (i.e. intakeData.responses.clients[i]) so per-child
 *  question answers (`client_grade`, `client_dob`, `client_sex`, `client_street`,
 *  ...) are layered on top of the submission-level demographics step. Without
 *  this, multi-child submissions stamped every sibling with the same (often
 *  empty) submission-level data and lost per-child grade/DOB/address/sex.
 */
const buildMergedDemographicsForPersist = (submission = {}, perClientResponses = null) => {
  const base = submission?.demographicsInfo && typeof submission.demographicsInfo === 'object'
    ? { ...submission.demographicsInfo }
    : {};
  const clinical = submission?.clinicalResponses && typeof submission.clinicalResponses === 'object'
    ? submission.clinicalResponses
    : {};
  const perClient = perClientResponses && typeof perClientResponses === 'object'
    ? perClientResponses
    : {};
  // Per-child fields take precedence over both the submission-level
  // demographics step and the submission-level clinical responses, since they
  // are the most specific answer for THIS sibling on THIS submission.
  const pickPerChild = (perChildKey, fallback) => {
    const v = perClient[perChildKey];
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'string' && !v.trim()) return fallback;
    return v;
  };
  const merged = {
    ...base,
    preferredLanguage: pickPerChild(
      'client_preferred_language',
      clinical.client_preferred_language || base.preferredLanguage
    ),
    grade: pickPerChild('client_grade', clinical.client_grade || base.grade),
    // guardian_preferred_language is conceptually submission-level, but some
    // forms (notably per-child clinical question steps) serialize it inside
    // each `responses.clients[i]` bag. Prefer the per-child value when present
    // so the Overview's `primary_parent_language` mirrors correctly.
    guardianPreferredLanguage: pickPerChild(
      'guardian_preferred_language',
      clinical.guardian_preferred_language || base.guardianPreferredLanguage
    ),
    dob: pickPerChild('client_dob', base.dob),
    gender: pickPerChild('client_sex', base.gender || pickPerChild('client_gender', null)),
    ethnicity: pickPerChild('client_ethnicity', base.ethnicity),
    addressStreet: pickPerChild('client_street', base.addressStreet),
    addressApt: pickPerChild('client_apt', base.addressApt),
    addressCity: pickPerChild('client_city', base.addressCity),
    addressState: pickPerChild('client_state', base.addressState),
    addressZip: pickPerChild('client_zip', base.addressZip),
    eloping: pickPerChild('client_eloping', clinical.client_eloping ?? base.eloping),
    elopingNotes: pickPerChild('client_eloping_notes', clinical.client_eloping_notes ?? base.elopingNotes),
    extraAssistance: pickPerChild(
      'client_extra_assistance',
      clinical.client_extra_assistance ?? base.extraAssistance
    ),
    extraAssistanceNotes: pickPerChild(
      'client_extra_assistance_notes',
      clinical.client_extra_assistance_notes ?? base.extraAssistanceNotes
    )
  };
  const hasAny = Object.values(merged).some((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return true;
    return String(v).trim().length > 0;
  });
  return hasAny ? merged : null;
};

/** Merge guardian preferred language from intake into encrypted guardian intake profile JSON. */
const persistGuardianPreferredLanguageOnIntakeProfile = async ({ clientId, demographicsInfo }) => {
  const cid = Number(clientId || 0);
  if (!cid || !demographicsInfo || typeof demographicsInfo !== 'object') return;
  const lang = String(
    demographicsInfo.guardianPreferredLanguage
    ?? demographicsInfo.guardian_preferred_language
    ?? ''
  ).trim();
  if (!lang) return;
  try {
    const existing = await ClientGuardianIntakeProfile.findByClientId(cid);
    const base = existing && typeof existing === 'object' ? { ...existing } : {};
    delete base.source;
    delete base.updated_at;
    const merged = { ...base, primaryLanguage: lang };
    const hasAny = Object.values(merged).some((v) => String(v || '').trim());
    if (!hasAny) return;
    await ClientGuardianIntakeProfile.upsertForClient({
      clientId: cid,
      profile: merged,
      source: 'public_intake'
    });
  } catch (e) {
    console.warn('[publicIntake] guardian preferred language persist failed', { clientId: cid, message: e?.message });
  }
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
  // The Overview tab reads `primary_client_language` and `primary_parent_language`
  // (the columns the bulk client upload writes). Without mirroring here, the
  // intake's `client_preferred_language` / `guardian_preferred_language` answers
  // landed in `preferred_language` only and Overview displayed "-" for both
  // language rows even after a complete intake. Mirror them so the Overview
  // panels and the existing `preferred_language` reader (clinical card, demo
  // export) both stay populated from the intake answers.
  addIfPresent('primary_client_language', demographicsInfo.preferredLanguage);
  addIfPresent('primary_parent_language', demographicsInfo.guardianPreferredLanguage);
  addIfPresent('address_street', demographicsInfo.addressStreet);
  addIfPresent('address_apt', demographicsInfo.addressApt);
  addIfPresent('address_city', demographicsInfo.addressCity);
  addIfPresent('address_state', demographicsInfo.addressState);
  addIfPresent('address_zip', demographicsInfo.addressZip);

  const gradeRaw = demographicsInfo.grade ?? demographicsInfo.clientGrade ?? null;
  if (gradeRaw !== null && gradeRaw !== undefined && String(gradeRaw).trim()) {
    try {
      const g = normalizeGradeForSave(gradeRaw);
      if (g) {
        updates.push('grade = ?');
        values.push(g);
      }
    } catch {
      // ignore invalid grade
    }
  }

  const elopingYn = parseIntakeYesNo(demographicsInfo.eloping ?? demographicsInfo.client_eloping);
  if (elopingYn !== null) {
    updates.push('eloping_flag = ?');
    values.push(elopingYn ? 1 : 0);
  }
  const elopingNotes = String(demographicsInfo.elopingNotes ?? demographicsInfo.client_eloping_notes ?? '').trim();
  if (elopingYn !== null || elopingNotes) {
    updates.push('eloping_notes = ?');
    values.push(elopingNotes ? elopingNotes.slice(0, 65000) : null);
  }

  const assistYn = parseIntakeYesNo(
    demographicsInfo.extraAssistance ?? demographicsInfo.client_extra_assistance
  );
  if (assistYn !== null) {
    updates.push('extra_assistance_flag = ?');
    values.push(assistYn ? 1 : 0);
  }
  const assistNotes = String(
    demographicsInfo.extraAssistanceNotes ?? demographicsInfo.client_extra_assistance_notes ?? ''
  ).trim();
  if (assistYn !== null || assistNotes) {
    updates.push('extra_assistance_notes = ?');
    values.push(assistNotes ? assistNotes.slice(0, 65000) : null);
  }

  if (!updates.length) {
    await persistGuardianPreferredLanguageOnIntakeProfile({ clientId: cid, demographicsInfo });
    return;
  }
  values.push(cid);
  try {
    await pool.execute(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, values);
  } catch (e) {
    // Best-effort; ignore if columns don't exist yet (migration pending)
    console.warn('[publicIntake] demographics persist failed', { clientId: cid, message: e?.message });
  }
  await persistGuardianPreferredLanguageOnIntakeProfile({ clientId: cid, demographicsInfo });
};

/**
 * Per-child "save what the parent typed" orchestration. Called once per child
 * inside the per-client loop, after that child's signed PDFs have been
 * attached. Replaces three near-identical inline blocks (school-roi flow +
 * registration flow) with one call so future regressions hit one place.
 *
 * Does, in order:
 *   1. Build per-child demographics (per-child responses take priority over
 *      submission-level fields — this is what was missing for sibling 2).
 *   2. Persist demographics to `clients` (grade, language, address, DOB,
 *      sex, eloping/assistance flags + their notes).
 *   3. Mirror primary insurer name from insurance step.
 *   4. Auto-mark Document Status checklist items as RECEIVED.
 *
 * Each step is independent — failure in one does not abort the others — and
 * each failure logs with enough context to diagnose later.
 */
const persistChildIntakeData = async ({
  clientId,
  intakeData,
  clientIndex,
  submissionId,
  completedAt,
  flowLabel = 'public_intake',
  intakeCompletionNote = 'Marked received automatically after intake completion'
}) => {
  const cid = Number(clientId || 0);
  if (!cid) return { ok: false, reason: 'missing_client_id' };

  const result = { ok: true, demographicsPersisted: false, insurerPersisted: false, checklistMarked: false };

  // 1) + 2) Demographics. Per-child responses (intakeData.responses.clients[i])
  // take priority over submission-level fields; without that merge, siblings
  // got each other's grade/DOB/address (or nothing).
  try {
    const perChildResponses = Array.isArray(intakeData?.responses?.clients)
      ? (intakeData.responses.clients[clientIndex] || null)
      : null;
    const demographicsInfo = buildMergedDemographicsForPersist(
      intakeData?.responses?.submission || {},
      perChildResponses
    );
    if (demographicsInfo) {
      await persistClientDemographicsIfProvided({ clientId: cid, demographicsInfo });
      result.demographicsPersisted = true;
    }
  } catch (demoErr) {
    console.error('[publicIntake] per-child demographics persist failed', {
      clientId: cid,
      submissionId,
      clientIndex,
      flow: flowLabel,
      error: demoErr?.message || demoErr
    });
  }

  // 3) Primary insurer name from the insurance step.
  try {
    const insuranceInfo = intakeData?.responses?.submission?.insuranceInfo;
    const primaryInsurerName = String(insuranceInfo?.primary?.insurerName || '').trim();
    if (primaryInsurerName) {
      await pool.execute(
        `UPDATE clients SET primary_insurer_name = ? WHERE id = ?`,
        [primaryInsurerName.slice(0, 255), cid]
      );
      result.insurerPersisted = true;
    }
  } catch {
    // primary_insurer_name column may not exist yet (migration pending) — non-fatal.
  }

  // 4) Auto-mark the Document Status checklist as RECEIVED. Intake completion
  // delivers every item on the checklist (emailed packet, ROI, new docs,
  // disclosure & consent, insurance info, etc.), so leaving them flagged as
  // "Needed" forces unnecessary manual outreach.
  try {
    await applyClientIntakeCompletion({
      clientId: cid,
      completedAt: completedAt || new Date(),
      note: intakeCompletionNote,
      actorUserId: null
    });
    result.checklistMarked = true;
  } catch (intakeCompletionErr) {
    console.error('[publicIntake] applyClientIntakeCompletion failed', {
      clientId: cid,
      submissionId,
      flow: flowLabel,
      error: intakeCompletionErr?.message || intakeCompletionErr
    });
  }

  return result;
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
  // Tie the guardian to the client's agency the same way the intake-client
  // service does; historically this path only wrote client_guardians, which
  // caused intake-created guardians to be missing their user_agencies row.
  try {
    const [cAgency] = await pool.execute('SELECT agency_id FROM clients WHERE id = ? LIMIT 1', [cid]);
    const aid = Number(cAgency?.[0]?.agency_id || 0) || null;
    if (aid) {
      await pool.execute(
        `INSERT INTO user_agencies (user_id, agency_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = user_id`,
        [Number(guardianUser.id), aid]
      );
    }
  } catch (err) {
    console.warn('[publicIntake] guardian tenant affiliation (smart roi) failed', {
      clientId: cid,
      guardianUserId: guardianUser?.id || null,
      message: err?.message || err
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

const stripEmptyTemporaryPasswordLines = (body) => {
  const raw = String(body || '').replace(/\r\n/g, '\n');
  return raw
    .split('\n')
    .filter((line) => !/^\s*Temporary password:\s*$/i.test(line))
    .join('\n');
};

const toSimpleHtmlEmail = (text) => {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const outLines = [];
  let pendingBlank = false;
  for (const ln of raw.split('\n')) {
    const empty = !String(ln).trim();
    if (empty) {
      pendingBlank = true;
      continue;
    }
    if (pendingBlank) {
      outLines.push('');
      pendingBlank = false;
    }
    outLines.push(ln);
  }
  if (pendingBlank) outLines.push('');

  const lineToHtml = (line) => {
    const t = String(line);
    const md = t.match(/^\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/);
    if (md) {
      return `<p style="margin:8px 0"><a href="${escapeHtml(md[2])}" style="color:#1a56db;font-weight:700;text-decoration:underline;">${escapeHtml(md[1])}</a></p>`;
    }
    const trimmed = t.trim();
    if (/^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
      const urlLower = trimmed.toLowerCase();
      const label =
        urlLower.includes('passwordless')
        || urlLower.includes('reset-password')
        || urlLower.includes('resetpassword')
        || urlLower.includes('set-password')
        || urlLower.includes('setpassword')
          ? 'Sign in to set your password'
          : (urlLower.includes('registration-receipt') || urlLower.includes('receipt'))
            ? 'View live receipt'
            : 'Download signed packet';
      return `<p style="margin:8px 0"><a href="${escapeHtml(trimmed)}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a></p>`;
    }
    if (!trimmed) {
      return '<p style="margin:8px 0"></p>';
    }
    const inner = escapeHtml(t).replace(/^\s+|\s+$/g, '') || '&nbsp;';
    return `<p style="margin:8px 0">${inner}</p>`;
  };

  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    ${outLines.map(lineToHtml).join('')}
  </div>
`.trim();
};

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
  agencyName = null,
  downloadUrl,
  expiresInDays = 7,
  registrationLoginEmail = null,
  registrationTempPassword = null,
  registrationNeedsSetup = false,
  portalLoginUrl = null,
  registrationPasswordlessUrl = null,
  registrationEventSummary = null,
  registrationReceiptUrl = null,
  fromAddress = null,
  eventPlaceholders = null,
  returningMatchClientInitials = null,
  // Multi-child support: when present, render a per-child summary section so a
  // single confirmation email summarizes EVERY child + their signed documents,
  // alongside the combined download link.
  // Shape: [{ clientId, clientName, downloadUrl, signedDocuments: [{ name, downloadUrl }] }]
  clientBundles = []
}) => {
  const safeClientBundles = Array.isArray(clientBundles)
    ? clientBundles.filter((b) => b && (b.clientName || b.clientId || b.downloadUrl))
    : [];
  const isMultiChildSummary = safeClientBundles.length > 1;
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

  const orgDisplayName = String(schoolName || '').trim();
  const agencyDisplayName = String(agencyName || '').trim();
  const ev = eventPlaceholders && typeof eventPlaceholders === 'object' ? eventPlaceholders : {};
  const params = {
    SIGNER_NAME: String(signerName || '').trim() || 'Signer',
    SIGNER_EMAIL: String(signerEmail || '').trim() || '',
    CLIENT_NAME: String(primaryClientName || '').trim() || '',
    CLIENT_COUNT: Number(clientCount || 0) || 1,
    CLIENT_SUMMARY: Number(clientCount || 0) > 1
      ? `Clients: ${Number(clientCount || 0)}`
      : (String(primaryClientName || '').trim() ? `Client: ${String(primaryClientName || '').trim()}` : ''),
    SCHOOL_NAME: orgDisplayName || 'School',
    AGENCY_NAME: agencyDisplayName || orgDisplayName || 'Our team',
    DOWNLOAD_URL: String(downloadUrl || '').trim(),
    LINK_EXPIRES_DAYS: Number(expiresInDays || 7),
    LINK_EXPIRY_DAYS: Number(expiresInDays || 7),
    REGISTRATION_LOGIN_EMAIL: regLogin,
    REGISTRATION_TEMP_PASSWORD: regPw,
    REGISTRATION_NEEDS_SETUP: needsSetup ? 'true' : 'false',
    PORTAL_LOGIN_URL: regPortalPrimary,
    REGISTRATION_PASSWORDLESS_URL: regPasswordless,
    REGISTRATION_LOGIN_PAGE_URL: regPlainLogin,
    REGISTRATION_EVENT_SUMMARY: regEvent,
    EVENT_TITLE: String(ev.EVENT_TITLE || ''),
    EVENT_DATES: String(ev.EVENT_DATES || ''),
    EVENT_ADDRESS: String(ev.EVENT_ADDRESS || ''),
    EVENT_REPORT_TIME: String(ev.EVENT_REPORT_TIME || ''),
    EVENT_DURATION: String(ev.EVENT_DURATION || ''),
    REGISTRATION_RECEIPT_URL: String(registrationReceiptUrl || '').trim(),
    RECEIPT_URL: String(registrationReceiptUrl || '').trim(),
    FROM_ADDRESS: String(fromAddress || '').trim(),
    CLIENT_INITIALS: String(returningMatchClientInitials || '').trim(),
    RETURNING_MATCH_NOTICE: String(returningMatchClientInitials || '').trim()
      ? `We matched you to an existing profile for ${String(returningMatchClientInitials).trim()}.`
      : ''
  };

  const credsBlock = needsSetup || regPw || regPasswordless
    ? [
        '',
        '— Guardian portal access —',
        regPasswordless && needsSetup
          ? `Set up your guardian account using this secure link:\n[Sign in to set your password](${regPasswordless})`
          : regPasswordless
            ? `One-time sign-in link:\n[Sign in to set your password](${regPasswordless})`
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

  // Per-child plain-text section (only when 2+ children share the submission).
  // Each child gets a header + their per-child download link + a list of any
  // signed-document links surfaced via clientBundles[i].signedDocuments.
  const perChildTextBlock = isMultiChildSummary
    ? [
        '',
        '— Registered clients —',
        ...safeClientBundles.map((bundle, idx) => {
          const lines = [];
          const label = String(bundle.clientName || `Client ${idx + 1}`).trim();
          lines.push(`${idx + 1}. ${label}`);
          if (bundle.downloadUrl) {
            lines.push(`   Intake packet: ${bundle.downloadUrl}`);
          }
          const docs = Array.isArray(bundle.signedDocuments) ? bundle.signedDocuments : [];
          docs.forEach((d) => {
            const dn = String(d?.name || 'Signed document').trim();
            const du = String(d?.downloadUrl || '').trim();
            if (du) lines.push(`   • ${dn}: ${du}`);
            else lines.push(`   • ${dn}`);
          });
          return lines.join('\n');
        })
      ].join('\n')
    : '';

  const fallbackSubject = `Thank you for completing your intake packet${params.SCHOOL_NAME ? ` for ${params.SCHOOL_NAME}` : ''}`;
  // Plain-text version of the standalone event details block. Mirrors the
  // HTML eventDetailsHtmlBlock so non-HTML email clients (or quoted-only
  // forwards) still surface what the family registered for. We compose
  // this BEFORE fallbackText so it can be inserted as a discrete block.
  const eventDetailsTextBlock = (() => {
    const lines = [];
    const title = String(params.EVENT_TITLE || '').trim() || String(regEvent || '').trim();
    const dates = String(params.EVENT_DATES || '').trim();
    const reportTime = String(params.EVENT_REPORT_TIME || '').trim();
    const duration = String(params.EVENT_DURATION || '').trim();
    const addr = String(params.EVENT_ADDRESS || '').trim();
    if (!title && !dates && !addr) return '';
    lines.push('');
    lines.push("— You're registered for —");
    if (title) lines.push(title);
    if (dates) {
      const extras = [reportTime ? `Arrive by ${reportTime}` : '', duration].filter(Boolean).join(' · ');
      lines.push(extras ? `${dates} · ${extras}` : dates);
    } else if (reportTime) {
      lines.push(`Arrive by ${reportTime}${duration ? ` · ${duration}` : ''}`);
    }
    if (addr) lines.push(addr);
    return lines.join('\n');
  })();

  const fallbackText = [
    `Hello ${params.SIGNER_NAME || 'there'},`,
    '',
    params.RETURNING_MATCH_NOTICE ? `${params.RETURNING_MATCH_NOTICE}\n` : '',
    `${params.CLIENT_SUMMARY ? `${params.CLIENT_SUMMARY}\n` : ''}Thank you for completing the intake packet${params.SCHOOL_NAME ? ` for ${params.SCHOOL_NAME}` : ''}.`,
    'Our staff will be in touch with next steps.',
    'Once your client is assigned to a provider, they will reach out to schedule intake and begin services.',
    eventDetailsTextBlock,
    credsBlock,
    perChildTextBlock,
    '',
    params.DOWNLOAD_URL
      ? (isMultiChildSummary
        ? `Combined intake packet (all clients):\n${params.DOWNLOAD_URL}\n\nThis link expires in ${params.LINK_EXPIRES_DAYS} days.`
        : `You can view/download your signed copy here:\n${params.DOWNLOAD_URL}\n\nThis link expires in ${params.LINK_EXPIRES_DAYS} days.`)
      : 'Your signed copy is available in our system. If you would like a copy resent, reply to this email and our team can help.',
    '',
    'Thank you,',
    'ITSCO Support'
  ].filter((l) => l !== '' || true).join('\n');

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

  // Same idea as the portal-credentials append: if a custom email template
  // is in use AND we have an event the family registered for AND the
  // template body doesn't already mention the event title or any
  // EVENT_* placeholder, automatically append a "you're registered for"
  // block to the plain-text version. Without this, agencies that
  // configured a generic completion email template silently drop the
  // event details (the user only saw "we received your registration"
  // with no mention of WHICH event).
  const eventTitleStr = String(params.EVENT_TITLE || '').trim();
  const eventDatesStr = String(params.EVENT_DATES || '').trim();
  const hasEventInfo = !!(eventTitleStr || eventDatesStr || regEvent);
  const textMissesEventInfo = usedCustomTemplate
    && hasEventInfo
    && eventDetailsTextBlock
    && (
      (eventTitleStr && !text.includes(eventTitleStr))
      || (!eventTitleStr && regEvent && !text.includes(regEvent))
    );
  if (textMissesEventInfo) {
    text = `${text}\n${eventDetailsTextBlock}`;
  }

  if (!regPw) {
    text = stripEmptyTemporaryPasswordLines(text);
  }

  // HTML per-child summary cards: one per registered client with their
  // per-child packet button + nested signed document links.
  const perChildHtmlBlock = isMultiChildSummary
    ? `<div style="margin:16px 0;">
         <p style="margin:0 0 8px 0;font-weight:600;">Registered clients</p>
         ${safeClientBundles.map((bundle, idx) => {
           const label = String(bundle.clientName || `Client ${idx + 1}`).trim();
           const docs = Array.isArray(bundle.signedDocuments) ? bundle.signedDocuments : [];
           const docList = docs.length
             ? `<ul style="margin:8px 0 0 0;padding-left:18px;color:#333;">${docs.map((d) => {
                 const dn = escapeHtml(String(d?.name || 'Signed document'));
                 const du = String(d?.downloadUrl || '').trim();
                 return du
                   ? `<li><a href="${escapeHtml(du)}">${dn}</a></li>`
                   : `<li>${dn}</li>`;
               }).join('')}</ul>`
             : '';
           const bundleBtn = bundle.downloadUrl
             ? `<p style="margin:8px 0;"><a href="${escapeHtml(bundle.downloadUrl)}" style="display:inline-block;padding:8px 12px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;">View ${escapeHtml(label)}'s intake packet</a></p>`
             : '';
           return `<div style="margin:8px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">
                     <p style="margin:0;font-weight:600;">${escapeHtml(label)}</p>
                     ${bundleBtn}
                     ${docList}
                   </div>`;
         }).join('')}
       </div>`
    : '';

  // Standalone "what you registered for" block — visible whenever the
  // submission has a bound event, INDEPENDENT of whether the family also
  // got portal credentials. Previously the only mention of the event lived
  // inside the Guardian Portal credentials box, which meant intake links
  // that auto-bind an event but don't issue portal access (most school +
  // event-only flows) silently dropped the event details from the email.
  const eventTitleEsc = escapeHtml(String(params.EVENT_TITLE || '').trim());
  const eventDatesEsc = escapeHtml(String(params.EVENT_DATES || '').trim());
  const eventAddressEsc = escapeHtml(String(params.EVENT_ADDRESS || '').trim());
  const eventReportTimeEsc = escapeHtml(String(params.EVENT_REPORT_TIME || '').trim());
  const eventDurationEsc = escapeHtml(String(params.EVENT_DURATION || '').trim());
  const regEventEsc = escapeHtml(String(regEvent || '').trim());
  const hasAnyEventDetail = eventTitleEsc || eventDatesEsc || eventAddressEsc || regEventEsc;
  const eventDetailsHtmlBlock = hasAnyEventDetail
    ? `<div style="margin:16px 0;padding:12px;border:1px solid #cfe4ff;border-radius:8px;background:#f0f7ff;">
         <p style="margin:0 0 6px 0;"><strong>You're registered for:</strong></p>
         ${eventTitleEsc ? `<p style="margin:4px 0;font-size:15px;font-weight:600;">${eventTitleEsc}</p>` : (regEventEsc ? `<p style="margin:4px 0;">${regEventEsc}</p>` : '')}
         ${eventDatesEsc ? `<p style="margin:4px 0;">📅 ${eventDatesEsc}${eventReportTimeEsc ? ` &nbsp;·&nbsp; ⏰ Arrive by ${eventReportTimeEsc}` : ''}${eventDurationEsc ? ` &nbsp;·&nbsp; ⏳ ${eventDurationEsc}` : ''}</p>` : ''}
         ${eventAddressEsc ? `<p style="margin:4px 0;">📍 ${eventAddressEsc}</p>` : ''}
       </div>`
    : '';

  const html = selectedTemplate?.body || customBody
    ? toSimpleHtmlEmail(text)
    : `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        ${params.CLIENT_COUNT > 1 ? `<p><strong>Clients:</strong> ${params.CLIENT_COUNT}</p>` : (params.CLIENT_NAME ? `<p><strong>Client:</strong> ${escapeHtml(params.CLIENT_NAME)}</p>` : '')}
        <p>Thank you for completing the intake packet${params.SCHOOL_NAME ? ` for <strong>${escapeHtml(params.SCHOOL_NAME)}</strong>` : ''}.</p>
        <p>Our staff will be in touch with next steps.</p>
        <p>Once your client is assigned to a provider, they will reach out to schedule intake and begin services.</p>
        ${eventDetailsHtmlBlock}
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
             </div>`
          : ''}
        ${perChildHtmlBlock}
        ${params.DOWNLOAD_URL
          ? `<p><a href="${escapeHtml(params.DOWNLOAD_URL)}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">${isMultiChildSummary ? 'Combined Packet (all clients)' : 'View Signed Packet'}</a></p>
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

/**
 * Single canonical "send the intake completion email and ALWAYS leave a row
 * on the Communications tab" helper. Replaces two near-identical inline
 * blocks (school-roi flow + registration flow) so we stop fixing one branch
 * while the other quietly regresses.
 *
 * Behavior:
 *   - If the link/agency has a configured EmailSenderIdentity, send via it.
 *   - Otherwise fall back to the platform-default `EmailService.sendEmail`
 *     with the shared signature block applied.
 *   - On any failure (prep or send), write a `user_communications` row via
 *     `logSkippedOrFailedEmail` so the failure surfaces on the
 *     Communications tab — the user explicitly required this.
 *   - Honor `sendResult.skipped` from the unified sender (the platform send
 *     gate can suppress sends; we record the reason so it's visible).
 *
 * Returns: { sent, skipped, error, errorMessage }. NEVER throws — callers
 * use the returned `error`/`errorMessage` to populate `emailDelivery` for
 * the API response.
 */
/**
 * Compute a friendly default "From" name for the registration confirmation email
 * when no `EmailSenderIdentity` is configured. Historically this fell back to the
 * generic "People Operations" string, which families found confusing for program
 * registration ("why is People Ops emailing me about summer camp?").
 *
 * Resolution order:
 *   1. The bound company event title          → "<event title> Registration Team"
 *   2. The intake link title                  → "<link title> Registration Team"
 *   3. The owning agency / school name        → "<name> Registration Team"
 *   4. Hard fallback                          → "Registration Team"
 *
 * Names are clamped to a sensible length so the SMTP `From` header doesn't
 * explode on long program titles.
 */
const FROM_NAME_MAX = 64;
const sanitizeFromNameFragment = (raw) => {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > FROM_NAME_MAX ? `${s.slice(0, FROM_NAME_MAX - 1).trim()}…` : s;
};
const resolveRegistrationFromName = async ({ link, agencyId, organizationId, scopeType }) => {
  // Caller already resolved an explicit env override → respect it.
  const explicit = sanitizeFromNameFragment(process.env.GOOGLE_WORKSPACE_FROM_NAME);
  if (explicit) return explicit;

  const eventId = Number(link?.company_event_id || 0) || null;
  if (eventId) {
    try {
      const [rows] = await pool.execute(
        `SELECT title FROM company_events WHERE id = ? LIMIT 1`,
        [eventId]
      );
      const t = sanitizeFromNameFragment(rows?.[0]?.title);
      if (t) return `${t} Registration Team`;
    } catch (_e) { /* fall through */ }
  }

  const linkTitle = sanitizeFromNameFragment(link?.title);
  if (linkTitle) return `${linkTitle} Registration Team`;

  const orgId = Number(organizationId || 0) || null;
  const aId = Number(agencyId || 0) || null;
  const lookupId = String(scopeType || '').toLowerCase() === 'school' ? (orgId || aId) : (aId || orgId);
  if (lookupId) {
    try {
      const [rows] = await pool.execute(
        `SELECT name FROM agencies WHERE id = ? LIMIT 1`,
        [lookupId]
      );
      const n = sanitizeFromNameFragment(rows?.[0]?.name);
      if (n) return `${n} Registration Team`;
    } catch (_e) { /* fall through */ }
  }

  return 'Registration Team';
};

const deliverPacketCompletionEmail = async ({
  to,
  subject,
  text,
  html,
  packetPdfBuffer = null,
  link,
  agencyId,
  clientId,
  organizationId,
  scopeType,
  templateType = 'intake_packet_completion',
  submissionId,
  flowLabel = 'public_intake'
}) => {
  const result = { sent: false, skipped: false, error: null, errorMessage: null };
  // Same attachment shape both branches used: actual PDF bytes on the email
  // so the family always has the packet on hand even if the signed download
  // URL eventually expires.
  const packetAttachments = packetPdfBuffer
    ? [{
        filename: `intake-packet-${submissionId}.pdf`,
        contentType: 'application/pdf',
        contentBase64: packetPdfBuffer.toString('base64')
      }]
    : null;

  try {
    const identity = await resolveIntakeSenderIdentity({ organizationId, scopeType });
    let sendResult = null;
    if (identity?.id) {
      sendResult = await sendEmailFromIdentity({
        senderIdentityId: identity.id,
        to,
        subject,
        text,
        html,
        attachments: packetAttachments,
        source: 'auto',
        clientId,
        templateType
      });
    } else {
      if (!EmailService.isConfigured()) {
        throw new Error('email_not_configured');
      }
      const fallbackSignatureIdentity = await resolveFallbackSignatureIdentity({ organizationId, scopeType });
      const signed = applyIdentitySignatureBlock({
        identity: fallbackSignatureIdentity,
        text,
        html
      });
      const fromName = await resolveRegistrationFromName({ link, agencyId, organizationId, scopeType });
      sendResult = await EmailService.sendEmail({
        to,
        subject,
        text: signed.text,
        html: signed.html,
        fromName,
        fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
        replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
        attachments: packetAttachments,
        source: 'auto',
        agencyId: organizationId || agencyId,
        clientId,
        templateType
      });
    }
    if (sendResult?.skipped) {
      result.skipped = true;
      result.error = `skipped_${sendResult.reason || 'gate'}`;
      result.errorMessage = `Send skipped by email gate: ${sendResult.reason || 'unknown'}`;
      console.warn('[publicIntake] completion email skipped by gate', {
        submissionId,
        flow: flowLabel,
        reason: sendResult.reason,
        to
      });
    } else {
      result.sent = true;
    }
  } catch (sendErr) {
    const isUnconfigured = String(sendErr?.message || '').includes('email_not_configured');
    result.error = isUnconfigured ? 'email_not_configured' : 'send_failed';
    result.errorMessage = String(sendErr?.message || result.error).slice(0, 500);
    console.error('[publicIntake] completion email send failed', {
      submissionId,
      flow: flowLabel,
      to,
      message: sendErr?.message || String(sendErr || ''),
      stack: sendErr?.stack || null
    });
    // Defensive Communications-tab row — the per-service pre-log SHOULD
    // already have one for sends that made it as far as the Gmail client,
    // but bootstrap/auth failures throw before the pre-log row is ever
    // written. Without this, a failed send is invisible to staff.
    await logSkippedOrFailedEmail({
      to,
      subject: `${subject || 'Intake completion'} (failed)`,
      text: `Completion email could not be sent: ${sendErr?.message || 'unknown failure'}`,
      html: null,
      agencyId: agencyId || link?.agency_id || link?.organization_id || null,
      clientId,
      templateType,
      deliveryStatus: isUnconfigured ? 'skipped' : 'failed',
      errorMessage: result.errorMessage || result.error,
      metadata: { submissionId, reason: result.error, flow: flowLabel }
    });
  }
  return result;
};

// Mirror the per-submission completion-email outcome onto every sibling beyond
// the primary client of a multi-child submission. The actual outbound send is
// still ONCE (one email to the signer, attached to the submission's primary
// `client_id`) — these mirror rows simply make the same email visible on each
// sibling's Communications tab so staff don't see "no completion email" for
// child 2+ when in fact the family did receive the packet email.
//
// Mirrored rows:
//   - reuse the same template_type so existing UI filters pick them up
//   - carry the same delivery_status (sent / skipped / failed) as the primary
//   - include `metadata.mirroredFromClientId` pointing at the primary so we can
//     tell at a glance these are mirrors of one outbound email
//   - subject is suffixed with "(sibling copy)" purely as a forensic hint
//
// All failures are swallowed — a mirror-write failure should NEVER block the
// finalize handler. The primary row already exists and downstream consumers
// keep working.
const mirrorPacketCompletionRowToSiblings = async ({
  to,
  subject,
  text,
  html,
  templateType = 'intake_packet_completion',
  link,
  agencyId,
  primaryClientId,
  siblingClientIds = [],
  submissionId,
  flowLabel = 'public_intake',
  outcome
}) => {
  const safeSiblings = (Array.isArray(siblingClientIds) ? siblingClientIds : [])
    .map((id) => Number(id || 0))
    .filter((id) => Number.isFinite(id) && id > 0 && id !== Number(primaryClientId || 0));
  if (!safeSiblings.length) return { mirrored: 0 };
  let deliveryStatus = 'sent';
  let errorMessage = null;
  if (outcome?.skipped) {
    deliveryStatus = 'skipped';
    errorMessage = outcome.errorMessage || outcome.error || 'skipped';
  } else if (outcome && outcome.sent === false) {
    deliveryStatus = 'failed';
    errorMessage = outcome.errorMessage || outcome.error || 'send_failed';
  }
  let mirrored = 0;
  for (const siblingId of safeSiblings) {
    try {
      await logSkippedOrFailedEmail({
        to: to || null,
        subject: subject ? `${subject} (sibling copy)` : 'Intake completion (sibling copy)',
        text: text || null,
        html: html || null,
        agencyId: agencyId || link?.agency_id || link?.organization_id || null,
        clientId: siblingId,
        templateType,
        deliveryStatus,
        errorMessage,
        metadata: {
          submissionId,
          flow: flowLabel,
          mirroredFromClientId: Number(primaryClientId || 0) || null,
          isSiblingMirror: true
        }
      });
      mirrored += 1;
    } catch (mirrorErr) {
      // Non-blocking — primary row is already in place
      console.warn('[publicIntake] sibling completion-email mirror failed', {
        submissionId,
        flow: flowLabel,
        siblingClientId: siblingId,
        primaryClientId,
        message: mirrorErr?.message || mirrorErr
      });
    }
  }
  if (mirrored > 0) {
    console.log('[publicIntake] mirrored completion email row to siblings', {
      submissionId,
      flow: flowLabel,
      primaryClientId: Number(primaryClientId || 0) || null,
      siblingCount: safeSiblings.length,
      mirrored,
      deliveryStatus
    });
  }
  return { mirrored };
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

// Historical intake_data has landed in the database in two shapes:
//   1. Nested (older finalize path): { clients, guardian, intakeForSelf, responses: { submission, guardian, clients } }
//   2. Flat   (newer signing path):   { submission, guardian, clients[] } — where each clients[i] has *both*
//      identity fields (firstName, fullName, …) *and* the client's response answers at the same level.
// `buildIntakeAnswersText`, `buildAnswerLinesForScope`, etc. were written against shape (1) and return
// empty output when handed shape (2), which is why finalized packets from the flat-shape path end up
// missing their "Intake Responses" pages even though all the data is sitting in intake_data.
// This normalizer synthesizes a view that always matches shape (1), so every downstream reader works
// regardless of how the submission was originally written.
const normalizeIntakeDataShape = (intakeData) => {
  if (!intakeData || typeof intakeData !== 'object') return intakeData;
  const flatSubmission = (intakeData.submission && typeof intakeData.submission === 'object' && !Array.isArray(intakeData.submission))
    ? intakeData.submission : null;
  const flatGuardianResp = (intakeData.guardianResponses && typeof intakeData.guardianResponses === 'object')
    ? intakeData.guardianResponses : null;
  const existingResponses = (intakeData.responses && typeof intakeData.responses === 'object')
    ? intakeData.responses : null;

  // If a nested responses.submission already exists, trust it; otherwise fall back to flat submission bag.
  const mergedSubmission = (existingResponses?.submission && typeof existingResponses.submission === 'object')
    ? { ...(flatSubmission || {}), ...existingResponses.submission }
    : (flatSubmission || {});

  // Guardian answers: nested responses.guardian wins, else flat guardianResponses, else empty.
  const mergedGuardianResponses = (existingResponses?.guardian && typeof existingResponses.guardian === 'object')
    ? { ...(flatGuardianResp || {}), ...existingResponses.guardian }
    : (flatGuardianResp || {});

  // Per-client answers: prefer nested responses.clients, else derive from flat intakeData.clients
  // where each client object mixes identity (firstName, lastName, fullName) with its answers at
  // the same level. We don't need to split identity vs answers here — the downstream lookups are
  // tolerant of extra keys and the identity keys are intentionally excluded by builtInNameKeys.
  let mergedClientResponses = null;
  if (Array.isArray(existingResponses?.clients) && existingResponses.clients.length) {
    mergedClientResponses = existingResponses.clients;
  } else if (Array.isArray(intakeData.clients)) {
    mergedClientResponses = intakeData.clients.map((c) => (c && typeof c === 'object' ? c : {}));
  }

  return {
    ...intakeData,
    responses: {
      ...(existingResponses || {}),
      submission: mergedSubmission,
      guardian: mergedGuardianResponses,
      clients: mergedClientResponses || (existingResponses?.clients || [])
    }
  };
};

export const buildAnswersPdfBuffer = async ({ link, intakeData, clientIndex = null }) => {
  if (!intakeData) return null;
  const normalizedIntakeData = normalizeIntakeDataShape(intakeData);
  const pdfStrings = getIntakePdfStrings(link?.language_code);
  const clients = Array.isArray(normalizedIntakeData?.clients) ? normalizedIntakeData.clients : [];
  const totalClients = clients.length || 1;
  // When clientIndex is a non-negative integer, render only that one child's section — this is the
  // per-child packet path. Otherwise render every child back-to-back (legacy single-file packet).
  const startIdx = (Number.isInteger(clientIndex) && clientIndex >= 0) ? clientIndex : 0;
  const endIdx   = (Number.isInteger(clientIndex) && clientIndex >= 0) ? (clientIndex + 1) : totalClients;
  const sections = [];
  for (let i = startIdx; i < endIdx; i += 1) {
    const rawText = buildIntakeAnswersText({ link, intakeData: normalizedIntakeData, clientIndex: i });
    if (!rawText) continue;
    const client = clients[i];
    const clientName =
      String(client?.fullName || '').trim()
      || `${String(client?.firstName || '').trim()} ${String(client?.lastName || '').trim()}`.trim();
    const heading = clientName
      ? `${pdfStrings.intakeResponses} - ${clientName}`
      : `${pdfStrings.intakeResponses} - Client ${i + 1}`;
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
    const approvalTitle = wrapText(pdfStrings.staffAssisted, fontBold, 18, maxWidth);
    approvalTitle.forEach((line) => {
      page.drawText(line, { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
      newLine(18);
    });
    newLine(8);
    const approvalLines = [
      `${pdfStrings.mode}: ${approval.mode || 'staff_assisted'}`,
      `${pdfStrings.staffLastName}: ${approval.staffLastName || '—'}`,
      `${pdfStrings.clientFirstName}: ${approval.clientFirstName || '—'}`,
      `${pdfStrings.approvedAt}: ${approval.approvedAt || '—'}`
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

  // Multi-client signature consent audit trail. When the parent added 2+
  // children to one packet, they explicitly agreed (in the wizard) that
  // their signatures and releases apply to every child. Print the agreement
  // here so the staff-visible answers PDF carries the proof.
  const multiClientConsent = intakeData?.multiClientSignatureConsent || null;
  if (multiClientConsent && multiClientConsent.accepted) {
    const consentHeading = wrapText('Multi-child Signature Consent', fontBold, 16, maxWidth);
    consentHeading.forEach((line) => {
      page.drawText(line, { x: margin, y, size: 16, font: fontBold, color: rgb(0, 0, 0) });
      newLine(16);
    });
    newLine(6);
    const consentLines = [
      `Children covered: ${Number(multiClientConsent.clientCount) || (Array.isArray(intakeData?.clients) ? intakeData.clients.length : '—')}`,
      `Agreed at: ${multiClientConsent.acceptedAt || '—'}`,
      'Acknowledgment: The parent/guardian agreed that the signatures and releases captured in this packet apply equally to every child listed. Each child receives their own packet PDF, automatically populated with that child\'s identifying information (name, date of birth, etc.).'
    ];
    consentLines.forEach((line) => {
      const wrapped = wrapText(line, font, 11, maxWidth);
      wrapped.forEach((w) => {
        page.drawText(w, { x: margin, y, size: 11, font, color: rgb(0, 0, 0) });
        newLine(11);
      });
    });
    newLine(10);
  }

  const headerLines = wrapText(pdfStrings.intakeResponses, fontBold, 18, maxWidth);
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

/**
 * Resolve whether to attach this intake to an existing client instead of creating a new row.
 * - Tenant-flagged returning-guardian auto-match (email + school/site + participant initials).
 * - Or consent-time single match (registration_client_match === 'existing') from computePublicIntakeClientMatch.
 */
async function resolveIntakeExistingClientAttach({ link, intakeData, payload, submission }) {
  const empty = {
    attachClientId: null,
    attachSource: null,
    agencyIdResolved: null,
    returningMatchInitials: '',
    mergePatch: {}
  };
  if (!link?.create_client) return empty;

  const submissionPatient = intakeData?.responses?.submission || {};
  const orgId = Number(
    payload?.organizationId
      || submissionPatient.organizationId
      || link.organization_id
      || 0
  ) || null;

  let agencyIdResolved = null;
  if (orgId) {
    agencyIdResolved =
      (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
      (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
      null;
  }
  if (!agencyIdResolved) return { ...empty, agencyIdResolved: null };

  const rawClients = Array.isArray(payload?.clients) && payload.clients.length
    ? payload.clients
    : (payload?.client ? [payload.client] : []);
  const first = rawClients[0];
  const firstName = String(first?.firstName || '').trim();
  const lastName = String(first?.lastName || '').trim();
  const fullName = String(first?.fullName || `${firstName} ${lastName}` || '').trim();

  const regExisting = String(submissionPatient.registration_client_match || '').toLowerCase() === 'existing';
  const regMatchedId = Number(submissionPatient.registration_matched_client_id || 0) || null;

  const signerEmail = String(submission?.signer_email || payload?.guardian?.email || '').trim().toLowerCase();

  let autoId = null;
  let autoInitials = '';
  if (await agencyReturningGuardianAutoMatchEnabled(agencyIdResolved)) {
    const schoolRow = orgId ? await Agency.findById(orgId) : null;
    const schoolNameInput = String(
      submissionPatient.school_name_input
        || schoolRow?.name
        || ''
    ).trim();
    if (signerEmail.includes('@') && fullName && schoolNameInput) {
      const auto = await tryReturningGuardianAutoMatch({
        agencyId: agencyIdResolved,
        signerEmail,
        schoolNameInput,
        participantFullName: fullName
      });
      if (auto?.clientId) {
        autoId = auto.clientId;
        autoInitials = String(auto.initials || '').trim();
      }
    }
  }

  let attachClientId = null;
  let attachSource = null;

  if (autoId && regExisting && regMatchedId && autoId !== regMatchedId) {
    console.warn('[publicIntake] returning auto-match vs consent match conflict; creating new client', {
      autoId,
      regMatchedId
    });
  } else if (autoId) {
    attachClientId = autoId;
    attachSource = 'returning_auto';
  } else if (regExisting && regMatchedId) {
    attachClientId = regMatchedId;
    attachSource = 'consent_org_match';
  }

  if (!attachClientId) return { ...empty, agencyIdResolved };

  const existingClient = await Client.findById(attachClientId, { includeSensitive: true });
  if (!existingClient?.id) {
    return { ...empty, agencyIdResolved };
  }
  if (Number(existingClient.agency_id) !== Number(agencyIdResolved)) {
    console.warn('[publicIntake] attach client agency mismatch; creating new client', {
      attachClientId,
      clientAgency: existingClient.agency_id,
      expectedAgency: agencyIdResolved
    });
    return { ...empty, agencyIdResolved };
  }

  const returningMatchInitials =
    attachSource === 'returning_auto'
      ? (autoInitials || String(existingClient.initials || '').trim())
      : String(existingClient.initials || '').trim();

  const mergePatch =
    attachSource === 'returning_auto'
      ? {
          registration_returning_guardian_auto_match: true,
          registration_returning_matched_initials: returningMatchInitials
        }
      : {};

  return {
    attachClientId,
    attachSource,
    agencyIdResolved,
    returningMatchInitials,
    mergePatch
  };
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
  // Normalize flat-shape intake_data (submission/guardian/clients at top level, no `responses`
  // wrapper) into the nested shape this builder was originally written against. Without this,
  // submissions finalized via the newer signing path serialize an empty answers PDF and the
  // "Intake Responses" pages never appear in the bundled packet.
  const normalized = normalizeIntakeDataShape(intakeData);
  const { fields } = buildIntakeFieldIndex(link);
  const intakeForSelf = Boolean(normalized?.intakeForSelf);
  const guardianPayload = normalized?.guardian || {};
  const clientPayload = Array.isArray(normalized?.clients) ? normalized.clients[clientIndex] : null;
  const responses = normalized?.responses || {};
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
      // Insurance Authorization & Assignment of Benefits e-signature attestation.
      // Surface the same audit trail we record for every other waiver section
      // (signed name + when + how + IP + UA + the underlying assignment-of-
      // benefits language) so the answers PDF / packet shows this as a
      // legitimate e-signature instead of just a stray typed name.
      const authTyped = String(insInfo.authorizationSignature || '').trim();
      const authDrawn = String(insInfo.authorizationSignatureData || '').trim();
      if (authTyped || authDrawn) {
        output.push('');
        output.push('Insurance Authorization & Assignment of Benefits — Electronic Signature');
        output.push('  I authorize the provider to release information to the insurance companies listed above');
        output.push('  in order to submit insurance claims, and assign all insurance benefits to the provider.');
        output.push('  I remain responsible for copays, coinsurance, deductibles, and any non-covered services.');
        const signerLabel = authTyped
          || String(insInfo.authorizationSignerName || '').trim()
          || String(submissionResponses?.signerName || '').trim()
          || 'Guardian';
        output.push(`  Signed by: ${signerLabel}`);
        if (insInfo.authorizationSignedAt) {
          output.push(`  Signed at: ${insInfo.authorizationSignedAt}`);
        }
        const sourceMethod = String(
          insInfo.authorizationSourceMethod
          || (authDrawn ? 'reused_guardian_signature' : 'typed_full_name')
        );
        output.push(`  Signature method: ${sourceMethod}`);
        if (insInfo.authorizationSignedIp) {
          output.push(`  Signer IP: ${insInfo.authorizationSignedIp}`);
        }
        if (insInfo.authorizationSignedUserAgent) {
          output.push(`  Signer browser: ${insInfo.authorizationSignedUserAgent}`);
        }
        output.push('  This electronic signature has the same legal effect as a hand-written one.');
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
  // See note in buildIntakeAnswersText: flat-shape submissions need their top-level
  // submission/guardian/clients promoted under `responses` or this whole summary stays empty.
  const normalized = normalizeIntakeDataShape(intakeData);
  const { fields, byKey } = buildIntakeFieldIndex(link);
  const responses = normalized?.responses || {};
  const guardianResponses = responses?.guardian || {};
  const submissionResponses = responses?.submission || {};
  const clientResponses = Array.isArray(responses?.clients) ? (responses.clients[clientIndex] || {}) : {};
  const clientPayload = Array.isArray(normalized?.clients) ? normalized.clients[clientIndex] : null;

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
      await attachSignedPdfToClient({
        clientId,
        link,
        clientRow,
        storagePath: storageResult.relativePath,
        originalName: doc.filename,
        documentTitle: doc.title,
        documentType: doc.type,
        mimeType: 'text/plain',
        intakeSubmissionId: submissionId,
        expiresAt: expiresAt || null,
        ipAddress: ipAddress || null,
        agencyIdOverride: agencyId,
        schoolOrganizationIdOverride: organizationId || orgId,
        auditMetadata: { submissionId, kind: doc.auditKind },
        callerLabel: 'public_intake_text_doc'
      });
    } catch (err) {
      // Storage upload itself failed — helper handles its own DB errors and
      // logs them, but a GCS failure happens before we even call the helper.
      console.error('createIntakeTextDocuments storage upload failed', {
        clientId,
        submissionId,
        filename: doc.filename,
        error: err?.message || err
      });
    }
  }
};

/**
 * Persist each "piece" of the intake packet (the answers PDF and, when
 * applicable, the registration confirmation PDF) as its own per-client PHI
 * document, independent of the combined bundle.
 *
 * Why this exists: the combined "Intake Packet (Signed)" merge + GCS upload
 * + UNIQUE storage_path PHI insert is fragile — when any link in that chain
 * fails, the answers and ticket disappear because they only ever lived inside
 * the bundle. Persisting each piece independently here means a parent's
 * answers and the registrant's ticket are guaranteed on the client's
 * Documentation tab even if the bundled packet save later fails.
 */
const createIntakePiecePdfDocuments = async ({
  clientId,
  clientRow,
  submissionId,
  link,
  intakeData,
  clientIndex = null,
  ticketPdf = null,
  ipAddress = null,
  expiresAt = null,
  organizationId = null
}) => {
  if (!clientId) return;

  const agencyId = clientRow?.agency_id || link?.organization_id || null;
  const orgId =
    clientRow?.organization_id ||
    clientRow?.school_organization_id ||
    organizationId ||
    link?.organization_id ||
    null;
  const schoolOrganizationId = orgId || agencyId;

  // 1) Per-child answers PDF — same renderer the bundle uses, scoped to this
  //    child so nothing from a sibling bleeds into the file.
  let answersPdf = null;
  try {
    answersPdf = await buildAnswersPdfBuffer({ link, intakeData, clientIndex });
  } catch (err) {
    console.error('[publicIntake] piece: answers PDF build failed', {
      clientId,
      submissionId,
      clientIndex,
      error: err?.message || err
    });
    answersPdf = null;
  }

  if (answersPdf) {
    try {
      const storageResult = await StorageService.saveIntakePieceDocument({
        submissionId,
        clientId,
        fileBuffer: answersPdf,
        filename: `intake-answers-client-${clientId}.pdf`
      });
      await attachSignedPdfToClient({
        clientId,
        link: null,
        storagePath: storageResult.relativePath,
        originalName: 'Intake Responses (Answers).pdf',
        documentTitle: 'Intake Responses (Answers)',
        documentType: 'Intake Responses',
        intakeSubmissionId: submissionId,
        expiresAt: expiresAt || null,
        ipAddress: ipAddress || null,
        agencyIdOverride: agencyId,
        schoolOrganizationIdOverride: schoolOrganizationId,
        auditMetadata: { submissionId, kind: 'intake_answers_pdf' },
        callerLabel: 'public_intake_piece_answers'
      });
    } catch (err) {
      console.error('[publicIntake] piece: answers PDF storage upload failed', {
        clientId,
        submissionId,
        message: err?.message || String(err || '')
      });
    }
  }

  // 2) Registration confirmation ticket PDF (only present on registration
  //    flows). The same buffer is shared across siblings; we save a
  //    per-client copy so each child's Documentation tab shows it without
  //    colliding on storage_path.
  if (ticketPdf && Buffer.isBuffer(ticketPdf) && ticketPdf.length > 0) {
    try {
      const storageResult = await StorageService.saveIntakePieceDocument({
        submissionId,
        clientId,
        fileBuffer: ticketPdf,
        filename: `registration-confirmation-client-${clientId}.pdf`
      });
      await attachSignedPdfToClient({
        clientId,
        link: null,
        storagePath: storageResult.relativePath,
        originalName: 'Registration Confirmation.pdf',
        documentTitle: 'Registration Confirmation',
        documentType: 'Registration Confirmation',
        intakeSubmissionId: submissionId,
        expiresAt: expiresAt || null,
        ipAddress: ipAddress || null,
        agencyIdOverride: agencyId,
        schoolOrganizationIdOverride: schoolOrganizationId,
        auditMetadata: { submissionId, kind: 'registration_confirmation_pdf' },
        callerLabel: 'public_intake_piece_ticket'
      });
    } catch (err) {
      console.error('[publicIntake] piece: registration confirmation storage upload failed', {
        clientId,
        submissionId,
        message: err?.message || String(err || '')
      });
    }
  }
};

/**
 * Create the per-client "Intake Packet" PHI document row pointing at the
 * given storage path.
 *
 * IMPORTANT: `client_phi_documents.storage_path` has a UNIQUE constraint, so
 * the caller MUST pass a per-client storage path when there are multiple
 * children on a single submission. The previous behavior of passing the
 * combined-bundle path for every child caused silent failures for child 2+.
 *
 * Returns { ok: true, phiDoc } on success, or { ok: false, reason, error } on
 * failure so callers can decide whether to surface a banner / retry.
 */
const createIntakePacketDocument = async ({
  clientId,
  clientRow,
  submissionId,
  storagePath,
  ipAddress,
  expiresAt,
  link,
  organizationId = null
}) => attachSignedPdfToClient({
  clientId,
  link,
  clientRow,
  storagePath,
  originalName: 'Intake Packet (Signed)',
  documentTitle: 'Intake Packet',
  documentType: 'Intake Packet',
  intakeSubmissionId: submissionId,
  expiresAt: expiresAt || null,
  ipAddress: ipAddress || null,
  schoolOrganizationIdOverride: organizationId,
  auditMetadata: { submissionId, kind: 'intake_packet' },
  callerLabel: 'public_intake_packet'
});

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

const findJobApplicationReferencesMin = (link) => {
  const steps = parseLinkIntakeSteps(link);
  const ref = steps.find((s) => String(s?.type || '').toLowerCase() === 'references');
  return Math.max(1, Number(ref?.minReferences || 3) || 3);
};

const validateJobApplicationSubmission = (link, ctx) => {
  const min = findJobApplicationReferencesMin(link);
  const waived = !!ctx.referencesWaived;
  const refs = Array.isArray(ctx.referencesJson) ? ctx.referencesJson : [];
  if (!waived) {
    if (!ctx.referencesConsentJson?.digitalFormAtInterviewOrOffer) {
      return 'You must consent to digital reference forms (at interview or offer stage) before continuing.';
    }
    if (!ctx.referencesConsentJson?.referenceContentWaiverAcknowledged) {
      return 'You must acknowledge the reference confidentiality statement before continuing.';
    }
    const filled = refs.filter(
      (r) =>
        String(r?.name || '').trim()
        || String(r?.email || '').trim()
        || String(r?.phone || '').trim()
        || String(r?.organization || '').trim()
        || String(r?.relationship || '').trim()
    );
    if (filled.length < min) {
      return `Please provide at least ${min} professional references, or select the waiver option.`;
    }
    const firstMin = filled.slice(0, min);
    const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
    for (const r of firstMin) {
      if (!emailOk(r?.email)) {
        return `A valid email is required for each of the first ${min} professional references.`;
      }
    }
  }
  return null;
};

async function sendJobApplicationReceivedEmail({ agencyId, applicantUser, jobDescription, pdfBuffer, jobTitle }) {
  try {
    const identity = await resolveJobApplicationSenderIdentity(agencyId);
    if (!identity?.id) return;
    const to = String(applicantUser?.email || applicantUser?.personal_email || '').trim();
    if (!to) return;
    const title = String(jobTitle || 'your application').trim();
    const attachments = [];
    if (pdfBuffer) {
      attachments.push({
        filename: 'application-summary.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from(pdfBuffer).toString('base64')
      });
    }
    const jdAttach = await buildJobDescriptionAttachmentForEmail(jobDescription);
    if (jdAttach) attachments.push(jdAttach);
    const name = `${String(applicantUser?.first_name || '').trim()} ${String(applicantUser?.last_name || '').trim()}`.trim() || 'Hello';
    const subject = `Application received — ${title}`;
    const text = [
      `Hi ${name},`,
      '',
      'Thank you for applying. This message confirms we received your application materials.',
      '',
      jobDescription?.title ? `Role: ${jobDescription.title}` : '',
      '',
      attachments.length ? 'This email includes your application summary and job description materials as attachments.' : ''
    ]
      .filter(Boolean)
      .join('\n');
    const html = `<div style="font-family: Arial, sans-serif; line-height: 1.5; color:#111;">
      <p>Hi ${name},</p>
      <p>Thank you for applying. We received your application materials.</p>
      ${jobDescription?.title ? `<p><strong>Role:</strong> ${String(jobDescription.title).replace(/</g, '')}</p>` : ''}
      <p style="color:#555;font-size:14px;">If attachments are missing, you can also download a copy from the confirmation page when available.</p>
    </div>`;
    await sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to,
      subject,
      text,
      html,
      attachments: attachments.length ? attachments : null,
      source: 'auto'
    });
  } catch {
    // best-effort
  }
}

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
  const referencesWaived = toBooleanSafe(intakeData?.referencesWaived ?? submission.referencesWaived ?? false);
  const rcIn = submission.referencesConsent && typeof submission.referencesConsent === 'object' ? submission.referencesConsent : {};
  const referencesConsentJson = {
    consentVersion: Number(rcIn.consentVersion) || 1,
    digitalFormAtInterviewOrOffer: toBooleanSafe(rcIn.digitalFormAtInterviewOrOffer),
    referenceContentWaiverAcknowledged: toBooleanSafe(rcIn.referenceContentWaiverAcknowledged),
    referencesWaived: !!referencesWaived
  };
  return {
    coverLetterText,
    resumeText,
    referencesJson,
    fluentLanguagesJson,
    jobAcknowledged,
    referencesWaived,
    referencesConsentJson
  };
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
    const agencyCareersPage = sanitizeApplicationPageJson(parseMetadata(agency.careers_page_json)) || null;

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
        hjd.application_page_json,
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
        applicationPage: mergeApplicationPageJson(agencyCareersPage, r.application_page_json),
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
        logoUrl: agency.logo_url || null,
        careersPage: agencyCareersPage
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
          applicationDeadline: jd.application_deadline || null,
          city: String(jd.city || '').trim() || null,
          state: String(jd.state || '').trim() || null,
          educationLevel: String(jd.education_level || '').trim() || null,
          applicationPage: sanitizeApplicationPageJson(jd.application_page_json),
          fileUrl,
          fileName: String(jd.original_name || '').trim() || null
        };
      }
    }
    const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
    if (jobDescription && agency?.id) {
      try {
        const [agencyRows] = await pool.execute(
          `SELECT careers_page_json FROM agencies WHERE id = ? LIMIT 1`,
          [agency.id]
        );
        const agencyCareersPage = sanitizeApplicationPageJson(parseMetadata(agencyRows?.[0]?.careers_page_json)) || null;
        jobDescription.applicationPage = mergeApplicationPageJson(agencyCareersPage, jobDescription.applicationPage);
      } catch {
        jobDescription.applicationPage = sanitizeApplicationPageJson(jobDescription.applicationPage);
      }
    }
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
    let linkedEsInfo = null;
    const linkedEsFormId = Number(link.linked_es_form_id || 0);
    if (linkedEsFormId > 0) {
      try {
        const linkedEs = await IntakeLink.findById(linkedEsFormId);
        if (linkedEs && linkedEs.is_active) {
          linkedEsInfo = {
            id: linkedEs.id,
            public_key: linkedEs.public_key,
            language_code: linkedEs.language_code || 'es'
          };
        }
      } catch {
        linkedEsInfo = null;
      }
    }
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
        custom_messages: link.custom_messages || null,
        linked_es_form: linkedEsInfo,
        document_translation_map: link.document_translation_map || null
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

/**
 * Public linked-translation lookup. Given the English form's public key,
 * returns the Spanish form's public key (plus a small metadata envelope)
 * so the in-page language toggle can swap to the Spanish version without
 * the admin having to re-issue a separate QR code.
 */
export const getPublicLinkedTranslation = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    if (!publicKey) {
      return res.status(400).json({ error: { message: 'publicKey is required' } });
    }
    const base = await IntakeLink.findByPublicKey(publicKey);
    if (!base || !base.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const linkedId = Number(base.linked_es_form_id || 0);
    if (!linkedId) {
      return res.json({ link: null });
    }
    const linked = await IntakeLink.findById(linkedId);
    if (!linked || !linked.is_active) {
      return res.json({ link: null });
    }
    res.json({
      link: {
        id: linked.id,
        public_key: linked.public_key,
        language_code: linked.language_code || 'es',
        title: linked.title || null
      }
    });
  } catch (error) {
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

    // Multi-child submissions intentionally have no combined bundle (each
    // child owns a fully isolated per-child packet). Enumerate per-client
    // bundles unconditionally so the UI can still surface download links
    // even when combined_pdf_path is null.
    const clientBundles = [];
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
    // Surface registrationCompletion either when the link is a registration
    // form OR when the link is hard-bound to an event (link.company_event_id),
    // so the frontend success card can show "you're registered for X" even
    // for school-roi / school_intake flows that piggyback an event on the link.
    const linkBindsEvent = !!Number(link?.company_event_id || 0);
    const registrationCompletion =
      linkSupportsPublicRegistrationFeatures(link) || linkBindsEvent
        ? {
            newGuardianAccount: !!sub.registration_completion_new_guardian,
            loginEmail: sub.registration_completion_login_email || null,
            portalLoginUrl: sub.registration_completion_portal_url || null,
            eventSummary: sub.registration_completion_event || null
          }
        : null;

    // Enrich with structured event metadata (title, starts_at, address)
    // pulled live from company_events when the link binds an event. The
    // frontend uses these to render a richer "You're registered for"
    // card with a calendar date row + Add-to-Calendar button without
    // having to round-trip through the registration catalog endpoint.
    if (registrationCompletion && linkBindsEvent) {
      try {
        // intake_links has no agency_id column — its organization_id IS the
        // agency for intake-scoped links.
        const aid = Number(link?.agency_id || link?.organization_id || 0) || null;
        const eid = Number(link?.company_event_id || 0) || null;
        if (aid && eid) {
          const [erows] = await pool.execute(
            `SELECT id, title, starts_at, ends_at, timezone,
                    public_location_address, event_location_name, event_location_address
             FROM company_events
             WHERE id = ? AND agency_id = ?
             LIMIT 1`,
            [eid, aid]
          );
          const er = erows?.[0];
          if (er) {
            const addr = String(er.public_location_address || '').trim()
              || [er.event_location_name, er.event_location_address].filter(Boolean).join(' — ');
            // Public-facing event page (CompanyEventPublicView). The
            // frontend can render this as a "View event page" link on
            // the success card so families can revisit details/share
            // with co-parents without digging through their email.
            const frontendBase = String(
              process.env.FRONTEND_URL ||
              process.env.CORS_ORIGIN ||
              ''
            ).replace(/\/$/, '');
            const publicEventUrl = frontendBase
              ? `${frontendBase}/company-events/${er.id}`
              : `/company-events/${er.id}`;
            registrationCompletion.event = {
              id: er.id,
              title: String(er.title || '').trim() || null,
              startsAt: er.starts_at ? new Date(er.starts_at).toISOString() : null,
              endsAt: er.ends_at ? new Date(er.ends_at).toISOString() : null,
              timezone: String(er.timezone || '').trim() || null,
              address: addr || null,
              publicEventUrl
            };
            // Backfill eventSummary if persistence hasn't finished yet
            // (status poll can race the async finalize block).
            if (!registrationCompletion.eventSummary && registrationCompletion.event.title) {
              const datePart = er.starts_at ? new Date(er.starts_at).toLocaleString() : '';
              registrationCompletion.eventSummary = [registrationCompletion.event.title, datePart]
                .filter(Boolean).join(' — ');
            }
          }
        }
      } catch (eventLookupErr) {
        console.warn('[publicIntake] registrationCompletion.event lookup failed', {
          submissionId,
          message: eventLookupErr?.message || eventLookupErr
        });
      }
    }

    const registrationReturningAutoMatch =
      sub.registration_returning_guardian_auto_match === true && String(sub.registration_returning_matched_initials || '').trim()
        ? { matched: true, initials: String(sub.registration_returning_matched_initials || '').trim() }
        : null;

    // The frontend polls this endpoint waiting for the packet to be "ready".
    // Historically it only watched `downloadUrl`, but multi-child submissions
    // intentionally never produce a combined bundle — so polling spun forever
    // even though every per-child packet was already in clientBundles. Expose
    // an explicit packetReady flag that's true whenever the submission is
    // finalized AND something downloadable exists (combined OR per-child).
    const packetReady =
      String(submission.status || '').toLowerCase() === 'submitted'
        && (Boolean(downloadUrl) || (Array.isArray(clientBundles) && clientBundles.length > 0));

    res.json({
      submissionId,
      status: submission.status,
      packetReady,
      totalDocuments: templates.length,
      signedTemplateIds: Array.from(signedTemplateIds),
      signedDocuments: signedDocs,
      downloadUrl,
      clientBundles,
      intakeData,
      registrationCompletion,
      registrationReturningAutoMatch
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

    // Optional clientIndex: when the wizard knows it is signing on behalf of
    // a specific child (multi-child intake), pass clientIndex so per-child
    // tokens (printed name, dob, initials, …) are baked in correctly. The
    // frontend can call this endpoint once per child for templates with
    // child-specific tokens, ensuring child 2+ never inherits child 1's
    // prefilled values. When omitted, behavior is unchanged (clientIndex=0).
    const requestedClientIndex = (() => {
      const raw = req.body?.clientIndex;
      if (raw === undefined || raw === null || raw === '') return 0;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    })();

    const existingDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    // Multi-child: allow N rows for the same template (one per clientIndex)
    // by recording clientIndex into audit_trail. We only short-circuit if
    // there's already a row for this exact (template, clientIndex) pair.
    const existing = existingDocs.find((d) => {
      if (d.document_template_id !== templateId) return false;
      let trail = null;
      try {
        trail = d.audit_trail
          ? (typeof d.audit_trail === 'string' ? JSON.parse(d.audit_trail) : d.audit_trail)
          : null;
      } catch {
        trail = null;
      }
      const existingIdx = Number(trail?.clientIndex ?? 0) || 0;
      return existingIdx === requestedClientIndex;
    });
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
        clientIndex: requestedClientIndex,
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
        signatureData: signatureData || null,
        // Persist clientIndex so finalize can detect per-child wizard
        // signatures and avoid the "child 2 inherits child 1's prefilled
        // tokens" bug for templates with child-specific tokens.
        clientIndex: requestedClientIndex
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
      // Idempotent submitted-retry: surface whatever bundle artifacts already
      // exist. Multi-child submissions have no combined bundle by design, so
      // enter this block whenever EITHER the combined bundle OR at least one
      // per-child bundle exists, and let downstream handle missing pieces.
      const _existingClientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
      const _hasAnyPerChildBundle = (_existingClientRows || []).some((c) => c?.bundle_pdf_path);
      if (submission.combined_pdf_path || _hasAnyPerChildBundle) {
        let downloadUrl = null;
        if (submission.combined_pdf_path) {
          try {
            downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 7);
          } catch {
            // best-effort
          }
        }
        const clientBundles = [];
        for (const c of _existingClientRows || []) {
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
    let intakeData = req.body?.intakeData || null;
    // Inject the link-bound company_event_id as a synthetic registration
    // selection BEFORE we hash + persist intakeData. This way the saved
    // intake_data row is the same one downstream (ticket PDF, event
    // placeholders, registration_completion_event) reads, so a future
    // status poll, retry, or rebuildIntakeBundle picks up the same event
    // without needing to know about the link binding separately.
    ensureLinkBoundCompanyEventSelection(intakeData, link);
    stampInsuranceAuthorizationSignatureMeta(intakeData, req, now);
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
      const jobAppCtx = parseJobApplicationContext(intakeData, link);
      const jobAppErr = validateJobApplicationSubmission(link, jobAppCtx);
      if (jobAppErr) {
        return res.status(400).json({ error: { message: jobAppErr } });
      }
      const {
        coverLetterText,
        resumeText,
        referencesJson,
        fluentLanguagesJson,
        jobAcknowledged,
        referencesConsentJson
      } = jobAppCtx;

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
        referencesConsentJson,
        referencesConsentAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
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
      let answersPdfBuffer = null;
      try {
        const answersPdf = await buildAnswersPdfBuffer({ link, intakeData });
        answersPdfBuffer = answersPdf || null;
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
        const jd = jobDescriptionId ? await HiringJobDescription.findById(jobDescriptionId) : null;
        const jobTitle = String(jd?.title || link?.title || 'Job application').trim();
        await sendJobApplicationReceivedEmail({
          agencyId,
          applicantUser: user,
          jobDescription: jd,
          pdfBuffer: answersPdfBuffer,
          jobTitle
        });
      } catch {
        // best-effort applicant confirmation email
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
      const phiDocAttach = await attachSignedPdfToClient({
        clientId: boundClient.id,
        link,
        clientRow: boundClient,
        storagePath: signedResult.storagePath,
        originalName: roiDocTitle,
        intakeSubmissionId: submissionId,
        expiresAt: retentionExpiresAt,
        ipAddress: updatedSubmission.ip_address,
        agencyIdOverride: boundClient.agency_id || agency?.id || null,
        schoolOrganizationIdOverride: schoolOrganizationId || boundClient.agency_id || agency?.id || null,
        auditMetadata: { submissionId, templateId: selectedTemplate.id, smartSchoolRoi: true },
        callerLabel: 'public_intake_smart_school_roi'
      });
      // Hoisted outside the attach call so the downstream
      // ClientSchoolRoiSigningLink.markCompleted call can reference the new
      // PHI doc id even when the attach failed (it'll be null in that case,
      // matching the previous "best-effort" semantics).
      const phiDoc = phiDocAttach?.phiDoc || null;

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
          completedClientPhiDocumentId: phiDoc?.id || null
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
          submission: updatedSubmission,
          source: 'smart_school_roi'
        });
        const guardianProfile = extractGuardianProfileFromPayload({
          payload: req.body || {},
          intakeData,
          submission: updatedSubmission
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
                source: 'auto',
                clientId: boundClient?.id || null,
                templateType: 'school_roi_signer_completion'
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
            const signerFromName = await resolveRegistrationFromName({
              link,
              agencyId: boundClient?.agency_id || agency?.id || null,
              organizationId: link?.organization_id || null,
              scopeType: link?.scope_type || null
            });
            await Promise.race([
              EmailService.sendEmail({
                to: updatedSubmission.signer_email,
                subject,
                text: signedContent.text,
                html: signedContent.html,
                fromName: signerFromName,
                fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
                replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
                attachments: null,
                source: 'auto',
                agencyId: boundClient?.agency_id || agency?.id || null,
                clientId: boundClient?.id || null,
                templateType: 'school_roi_signer_completion'
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
    let returningAutoMatchInitialsForEmail = '';
    if (link.create_client) {
      const attachInfo = await resolveIntakeExistingClientAttach({
        link,
        intakeData,
        payload: req.body,
        submission: updatedSubmission
      });
      if (attachInfo.attachClientId) {
        const existingClient = await Client.findById(attachInfo.attachClientId, { includeSensitive: true });
        if (existingClient?.id) {
          // Returning-family-with-new-sibling support. resolveIntakeExistingClientAttach
          // only inspects payload.clients[0] when deciding whether to attach to a
          // returning client, so any additional siblings the parent submitted in the
          // SAME packet (payload.clients[1..N]) used to be silently dropped here:
          // `createdClients = [existingClient]` discarded everything else, and the
          // downstream per-client signing loop, per-client packet attach loop, and
          // per-child completion email sections never saw them. This matches the
          // historical Carter/Carmen Bleem report and submission 300's
          // "Client1 Example" matched + "Client Example2" lost. Now we explicitly
          // create the additional siblings via createAdditionalSiblingClients
          // (no guardian provisioning — that runs once across the full set below)
          // and concat onto createdClients so every child the parent submitted gets
          // a real client_id and rides the rest of finalize like a fresh-family
          // submission. See DIGITAL_FORMS_INTAKE_CONTRACT.md §11.
          const submittedClients = Array.isArray(req.body?.clients) ? req.body.clients : [];
          let newSiblings = [];
          if (submittedClients.length > 1) {
            try {
              const siblingResult = await PublicIntakeClientService.createAdditionalSiblingClients({
                link,
                payload: req.body,
                siblings: submittedClients.slice(1)
              });
              newSiblings = Array.isArray(siblingResult?.clients) ? siblingResult.clients : [];
              if (newSiblings.length) {
                console.info('[publicIntake] returning-family matched + created brand-new siblings (school-roi flow)', {
                  submissionId,
                  matchedClientId: existingClient.id,
                  matchSource: attachInfo.attachSource,
                  submittedClientCount: submittedClients.length,
                  siblingsCreatedIds: newSiblings.map((s) => s.id)
                });
              }
            } catch (siblingErr) {
              // Do NOT block the matched attach + guardian provisioning if
              // sibling creation fails (e.g. a single bad sibling payload).
              // We loudly log so the gap is attributable, and downstream
              // smoke + per_child_bundle_path checks will surface the missing
              // child too. Better: matched child's packet still lands today,
              // sibling can be re-finalized via support tooling tomorrow.
              console.error('[publicIntake] createAdditionalSiblingClients failed (school-roi flow) — matched client will proceed, additional siblings dropped', {
                submissionId,
                matchedClientId: existingClient.id,
                attemptedSiblingCount: submittedClients.length - 1,
                error: siblingErr?.message || siblingErr,
                stack: siblingErr?.stack
              });
              newSiblings = [];
            }
          }

          const allClientsForGuardian = [existingClient, ...newSiblings];
          const {
            guardianUser,
            newGuardianCreated: ngCreated,
            newGuardianTemporaryPassword: ngpw,
            newGuardianPasswordlessLoginUrl: ngMagic
          } = await PublicIntakeClientService.provisionGuardianForIntakeClients({
            link,
            agencyId: attachInfo.agencyIdResolved,
            clients: allClientsForGuardian,
            payload: req.body
          });
          createdClients = allClientsForGuardian;
          newGuardianCreated = !!ngCreated;
          newGuardianTemporaryPassword = ngpw || null;
          newGuardianPasswordlessLoginUrl = ngMagic || null;
          if (attachInfo.attachSource === 'returning_auto') {
            returningAutoMatchInitialsForEmail = attachInfo.returningMatchInitials || '';
            try {
              await Client.update(existingClient.id, {
                last_returning_match_submission_id: submissionId
              });
            } catch (auditErr) {
              console.warn('[publicIntake] last_returning_match_submission_id update failed', {
                clientId: existingClient.id,
                message: auditErr?.message
              });
            }
          }
          if (attachInfo.mergePatch && Object.keys(attachInfo.mergePatch).length) {
            intakeData = mergeIntakeSubmissionPatch(intakeData || { responses: { submission: {} } }, attachInfo.mergePatch);
            updatedSubmission = await IntakeSubmission.updateById(submissionId, {
              client_id: existingClient.id,
              guardian_user_id: guardianUser?.id || null,
              intake_data: JSON.stringify(intakeData),
              intake_data_hash: hashIntakeData(intakeData)
            });
          } else {
            updatedSubmission = await IntakeSubmission.updateById(submissionId, {
              client_id: existingClient.id,
              guardian_user_id: guardianUser?.id || null
            });
          }
        } else {
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
      } else {
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

                {
                  const clientRow = boundClient || await Client.findById(roiClientId, { includeSensitive: true }).catch(() => null);
                  const roiDocTitle = effectiveRoiContext?.school?.name
                    ? `${effectiveRoiContext.school.name} - Release of Information (Signed)`
                    : `${selectedTemplate.name || 'School ROI'} (Signed)`;
                  await attachSignedPdfToClient({
                    clientId: roiClientId,
                    link,
                    clientRow,
                    storagePath: roiSignedResult.storagePath,
                    originalName: roiDocTitle,
                    intakeSubmissionId: submissionId,
                    expiresAt: retentionExpiresAt,
                    ipAddress: updatedSubmission.ip_address,
                    schoolOrganizationIdOverride: schoolOrganizationId,
                    auditMetadata: {
                      submissionId,
                      templateId: selectedTemplate.id,
                      smartSchoolRoi: true,
                      embeddedStep: true
                    },
                    callerLabel: 'public_intake_smart_school_roi_embedded'
                  });
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
      submissionId,
      registrationReturningAutoMatch: returningAutoMatchInitialsForEmail
        ? { matched: true, initials: returningAutoMatchInitialsForEmail }
        : null
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

    // ---------------------------------------------------------------
    // Registration ticket setup. We hoist the event-placeholder lookup,
    // receipt-token write, and org-context fetch up here (they were
    // previously only computed inside the email block below) so the
    // ticket PDF rendered for the bundle prefix has the same context as
    // the email and the live receipt page. Downstream email code reuses
    // these values via the `*Hoisted` names; the original later writes
    // were removed to avoid double-issuing receipt tokens.
    // ---------------------------------------------------------------
    let eventPlaceholdersHoisted = null;
    try {
      eventPlaceholdersHoisted = await loadRegistrationEventFieldPlaceholders(intakeData, link);
    } catch {
      eventPlaceholdersHoisted = null;
    }
    const portalBaseHoisted = String(config.frontendUrl || '').replace(/\/$/, '');
    let registrationReceiptUrlHoisted = '';
    if (portalBaseHoisted) {
      try {
        const receiptToken = crypto.randomBytes(32).toString('hex');
        await IntakeSubmission.updateById(submissionId, { registration_receipt_token: receiptToken });
        registrationReceiptUrlHoisted = `${portalBaseHoisted}/registration-receipt/${submissionId}?token=${encodeURIComponent(receiptToken)}`;
      } catch (tokenErr) {
        console.warn('[publicIntake] failed to issue registration_receipt_token (school-roi flow); ticket will omit live receipt URL', {
          submissionId,
          error: tokenErr?.message || tokenErr
        });
        registrationReceiptUrlHoisted = '';
      }
    }
    let orgContextHoisted = { organization: null, agency: null };
    try {
      orgContextHoisted = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient: null });
    } catch {
      orgContextHoisted = { organization: null, agency: null };
    }
    let ticketPdf = null;
    try {
      ticketPdf = await buildRegistrationTicketPdf({
        intakeData,
        submission: updatedSubmission,
        link,
        eventPlaceholders: eventPlaceholdersHoisted,
        registrationReceiptUrl: registrationReceiptUrlHoisted,
        organization: orgContextHoisted?.organization || null,
        agency: orgContextHoisted?.agency || null
      });
    } catch (ticketErr) {
      console.warn('[publicIntake] registration ticket PDF build failed (school-roi flow) — continuing without ticket', {
        submissionId,
        error: ticketErr?.message || ticketErr
      });
      ticketPdf = null;
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
      // Surface any per-child enrollment failures (e.g. second kiddo not
      // registered for the event). These were previously silently collected
      // in the `errors` array and discarded — making "child 2 missed the
      // event" effectively invisible to operators.
      if (Array.isArray(registrationEnrollment?.errors) && registrationEnrollment.errors.length) {
        console.error('[multi_child_registration] enrollment errors during finalize', {
          submissionId,
          childIds: rawClients.map((c) => c?.id).filter(Boolean),
          totalChildren: rawClients.length,
          companyEventEnrollments: registrationEnrollment.companyEventEnrollments,
          classEnrollments: registrationEnrollment.classEnrollments,
          errors: registrationEnrollment.errors
        });
      }
    } catch (registrationErr) {
      console.error('[publicIntake] smart registration enrollment failed (continuing finalize)', {
        submissionId,
        error: registrationErr?.message || registrationErr
      });
    }

    // Fire staff/coordinator notifications for any company-event enrollments. This runs
    // regardless of whether the intake had document templates (registration-only intakes
    // produced no `pdfPaths` and therefore never triggered notifyNewPacketUploaded).
    try {
      const enrolledEvents = Array.isArray(registrationEnrollment?.enrolledCompanyEvents)
        ? registrationEnrollment.enrolledCompanyEvents
        : [];
      if (enrolledEvents.length) {
        const labelByClientId = {};
        for (const c of rawClients) {
          const cid = Number(c?.id || 0);
          if (Number.isFinite(cid) && cid > 0) {
            labelByClientId[cid] = c?.fullName || c?.initials || `client #${cid}`;
          }
        }
        await Promise.all(
          enrolledEvents.map((entry) =>
            notifyCompanyEventRegistrationSubmitted({
              agencyId: entry.agencyId,
              eventId: entry.eventId,
              clientIds: entry.clientIds,
              clientLabels: labelByClientId,
              source: 'public_intake'
            }).catch(() => null)
          )
        );
      }
    } catch (notifyErr) {
      console.error('[publicIntake] company event registration notification failed', {
        submissionId,
        error: notifyErr?.message || notifyErr
      });
    }

    const intakeClientRows = [];
    const isMultiClient = rawClients.length > 1;
    // Multi-client signature consent audit. The frontend prompts the parent
    // to explicitly agree before adding a 2nd+ child to a single packet.
    // Log the result either way so we can spot any client (or a custom curl)
    // that bypassed the prompt.
    if (isMultiClient) {
      const mcConsent = intakeData?.multiClientSignatureConsent || null;
      if (mcConsent && mcConsent.accepted) {
        console.log('[multi_child_signature_consent] parent agreed signatures apply to all children', {
          submissionId,
          clientCount: rawClients.length,
          acceptedAt: mcConsent.acceptedAt || null
        });
      } else {
        console.warn('[multi_child_signature_consent_missing] multi-client packet finalized without recorded consent — verify intake source / frontend version', {
          submissionId,
          clientCount: rawClients.length,
          hasConsentField: !!mcConsent
        });
      }
    }
    const docAuditByTemplate = new Map();
    // Index any per-child wizard signatures by (templateId, clientIndex) so
    // finalize can use the right pre-signed PDF for each child instead of
    // reusing child 0's PDF for child 2+. Falls back gracefully when no
    // per-child wizard signature was provided.
    const docByTemplateAndChildIndex = new Map();
    signedDocs.forEach((doc) => {
      if (!doc) return;
      const rawTrail = doc.audit_trail;
      let trail = null;
      try {
        trail = rawTrail ? (typeof rawTrail === 'string' ? JSON.parse(rawTrail) : rawTrail) : null;
      } catch {
        trail = null;
      }
      const tplId = doc.document_template_id;
      const idx = Number(trail?.clientIndex ?? 0) || 0;
      docByTemplateAndChildIndex.set(`${tplId}|${idx}`, { doc, trail: trail || {} });
      // Keep first-seen audit per template for backward compatibility
      if (!docAuditByTemplate.has(tplId)) {
        docAuditByTemplate.set(tplId, trail || {});
      }
    });

    let roiCompletionPhiDocument = null;
    // Same diagnostic story as the registration flow: log loop entry + each
    // iteration so missing PHI rows are immediately attributable to a
    // skipped iteration vs. an insert failure.
    console.info('[publicIntake] intake/school finalize per-client loop starting', {
      submissionId,
      linkId: link?.id || null,
      linkType: link?.type || null,
      linkCreateClient: !!link?.create_client,
      rawClientsCount: rawClients.length,
      rawClientIds: rawClients.map((c) => c?.id || null),
      packetDocumentTemplateCount: Array.isArray(packetDocumentTemplates) ? packetDocumentTemplates.length : 0
    });
    let phiDocsAttemptedSchool = 0;
    let phiDocsCreatedSchool = 0;
    let phiDocsFailedSchool = 0;
    for (let i = 0; i < rawClients.length; i += 1) {
      const clientPayload = rawClients[i];
      const clientId = clientPayload?.id || null;
      const clientName = String(clientPayload?.fullName || '').trim() || null;
      console.info('[publicIntake] intake/school finalize processing client', {
        submissionId,
        loopIndex: i,
        clientId,
        clientName,
        willCreatePhiDocs: Boolean(clientId)
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

      const clientPaths = [];

      if (isMultiClient) {
        for (const template of packetDocumentTemplates) {
          // Prefer the per-child wizard signature for this template+childIndex
          // when present (frontend signed once per child); otherwise fall
          // back to whichever audit we have for this template.
          const perChildEntry = docByTemplateAndChildIndex.get(`${template.id}|${i}`);
          const baseAudit = perChildEntry?.trail || docAuditByTemplate.get(template.id) || {};
          const perChildPreSignedDoc = perChildEntry?.doc || null;
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

          // Heuristic: detect templates whose tokens depend on which child we
          // are signing for (printed name, first/last, dob, initials, etc.).
          // When such a template is reused as-is for child 2+, the resulting
          // PDF would carry child 1's prefilled values — definitively wrong.
          const hasChildSpecificTokens = (() => {
            try {
              const keys = (fieldDefinitions || []).map((d) => String(
                d?.prefillKey || d?.prefill_key || d?.id || d?.label || d?.name || ''
              ).toLowerCase());
              const childTokenRe = /(client[_\s-]?(first|last|full|name|initials|dob|birth|age|gender|sex)|child[_\s-]?(name|first|last|dob)|patient[_\s-]?name|printed[_\s-]?(client|patient|child)[_\s-]?name)/;
              return keys.some((k) => childTokenRe.test(k));
            } catch {
              return false;
            }
          })();

          if (template.document_action_type === 'signature' && !signatureData) {
            // Reuse the shared signed PDF only as a last resort. For multi-child
            // submissions, this means child 2+ will display child 1's
            // prefilled tokens in their copy of the signed document — log
            // loudly so admins can detect and re-sign per child if needed.
            // Prefer the per-child wizard-signed doc when available.
            const sharedDoc = perChildPreSignedDoc || signedByTemplate.get(template.id);
            if (sharedDoc?.signed_pdf_path) {
              if (hasChildSpecificTokens) {
                console.warn('[multi_child_signed_pdf_reuse] child 2+ may inherit child 1\'s prefilled tokens', {
                  submissionId,
                  templateId: template.id,
                  templateName: template.name || null,
                  childIndex: i,
                  clientId,
                  reason: 'no_signature_data_to_regenerate'
                });
              }
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
                    signatureData: null,
                    childSpecificTokensReused: hasChildSpecificTokens || undefined
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
            phiDocsAttemptedSchool += 1;
            const attachResult = await attachSignedPdfToClient({
              clientId,
              link,
              storagePath,
              originalName: `${template.name || 'Document'} (Signed)`,
              intakeSubmissionId: submissionId,
              expiresAt: retentionExpiresAt,
              ipAddress: updatedSubmission.ip_address,
              auditMetadata: { submissionId, templateId: template.id },
              callerLabel: 'public_intake_school'
            });
            if (attachResult.ok) {
              phiDocsCreatedSchool += 1;
            } else {
              phiDocsFailedSchool += 1;
            }
          } else if (storagePath && !clientId) {
            console.info('[publicIntake] phi doc skipped — no clientId (intake/school flow)', {
              submissionId,
              loopIndex: i,
              templateId: template.id,
              linkCreateClient: !!link?.create_client
            });
          }
        }
      } else {
        for (const template of packetDocumentTemplates) {
          const docRow = signedByTemplate.get(template.id);
          if (!docRow) continue;
          // ROI / pre-signed path: docRow already has signed_pdf_path from
          // the wizard signing step, so we only need to attach to this child.
          phiDocsAttemptedSchool += 1;
          const attachResult = await attachSignedPdfToClient({
            clientId,
            link,
            storagePath: docRow.signed_pdf_path,
            originalName: `${template.name || 'Document'} (Signed)`,
            intakeSubmissionId: submissionId,
            expiresAt: retentionExpiresAt,
            ipAddress: updatedSubmission.ip_address,
            schoolOrganizationIdOverride: req.body?.organizationId
              ? Number(req.body.organizationId) || null
              : null,
            auditMetadata: { submissionId, templateId: template.id, source: 'roi_path' },
            callerLabel: 'public_intake_school_roi_path'
          });
          if (attachResult.ok) {
            phiDocsCreatedSchool += 1;
            if (!roiCompletionPhiDocument && issuedRoiLink?.id) {
              roiCompletionPhiDocument = attachResult.phiDoc;
            }
          } else {
            phiDocsFailedSchool += 1;
          }
        }
      }

      const mergePaths = clientPaths.length ? clientPaths : pdfPaths;
      // NOTE: `isMultiClient` is the outer-scoped const declared at the top of
      // the school-ROI finalize block (rawClients.length > 1). Do NOT redeclare
      // here — a `const isMultiClient = ...` inside this for-loop body would
      // shadow the outer binding and put the earlier `if (isMultiClient)`
      // guard above (per-child template signing) into a Temporal Dead Zone,
      // crashing the whole packet pipeline.
      // Storage dedup: for single-child submissions the per-client bundle would
      // be a near-duplicate of the combined bundle (same per-template signed
      // PDFs, with the combined bundle additionally including the answers PDF
      // prefix). Skip the per-client save entirely; we'll point this child's
      // bundle_pdf_path at the combined bundle after it lands below.
      if (mergePaths.length && isMultiClient) {
        // Per-client bundle build/upload is wrapped in its own try/catch so a
        // single child's PDF problem (or transient GCS hiccup) does NOT abort
        // the rest of the loop iteration — auto-mark, demographics persist,
        // and the eventual completion email all still need to run.
        try {
          // Prefix order in the per-child packet: registration ticket first
          // (so the registrant lands on the confirmation page when they open
          // their packet), then this child's intake responses, then all of
          // their per-template signed docs. Every child gets a fully isolated
          // packet — their responses are scoped to clientIndex=i, so no
          // sibling's PHI ever leaks into this file.
          let perChildAnswersPdf = null;
          try {
            perChildAnswersPdf = await buildAnswersPdfBuffer({ link, intakeData, clientIndex: i });
          } catch (perChildAnswersErr) {
            console.error('[publicIntake] per-child answers PDF generation failed (school-roi flow) — continuing without it', {
              submissionId,
              clientIndex: i,
              clientId: clientPayload?.id || null,
              error: perChildAnswersErr?.message || perChildAnswersErr
            });
          }
          const prefixBuffers = [ticketPdf, perChildAnswersPdf].filter(Boolean);
          const mergedClientPdfRaw = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(mergePaths, prefixBuffers);
          // Compress the merged bundle before upload. This is the ONLY place
          // we touch the PDF bytes post-merge; individual signed docs stay
          // byte-identical in storage (their hashes/paths are referenced
          // from intake_submission_documents and must not change).
          const { buffer: mergedClientPdf } = await compressPdfBuffer(
            Buffer.isBuffer(mergedClientPdfRaw) ? mergedClientPdfRaw : Buffer.from(mergedClientPdfRaw),
            { label: `school-roi-client-${submissionId}-${clientPayload?.id || 'unknown'}` }
          );
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
            targetRow.bundle_pdf_path = clientBundleResult.relativePath;
            targetRow.bundle_pdf_hash = clientBundleHash;
          }
          clientBundles.push({
            clientId: clientPayload?.id || null,
            clientName: clientPayload?.fullName || null,
            filename: `intake-client-${clientPayload?.id || 'unknown'}.pdf`,
            downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 7)
          });
        } catch (perClientBundleErr) {
          console.error('[publicIntake] per-client bundle build/save failed (school-roi flow) — continuing so downstream side-effects (auto-mark, completion email) still run', {
            submissionId,
            clientId: clientPayload?.id || null,
            mergePathCount: mergePaths.length,
            error: perClientBundleErr?.message || perClientBundleErr,
            stack: perClientBundleErr?.stack
          });
        }
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

        // Persist each intake "piece" (answers PDF, registration ticket PDF)
        // as its own per-client PHI doc, so they survive even when the
        // combined bundle merge/upload fails. See helper for rationale.
        await createIntakePiecePdfDocuments({
          clientId,
          clientRow,
          submissionId,
          link,
          intakeData,
          clientIndex: i,
          ticketPdf,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          organizationId: req.body?.organizationId || null
        });

        // Save per-child intake data (demographics, insurer, checklist
        // auto-mark) — one helper call instead of three duplicated blocks.
        await persistChildIntakeData({
          clientId,
          intakeData,
          clientIndex: i,
          submissionId,
          completedAt: now,
          flowLabel: 'school_roi',
          intakeCompletionNote: 'Marked received automatically after intake/ROI completion'
        });
      }
    }

    console.info('[publicIntake] intake/school finalize per-client loop summary', {
      submissionId,
      rawClientsCount: rawClients.length,
      packetDocumentTemplateCount: Array.isArray(packetDocumentTemplates) ? packetDocumentTemplates.length : 0,
      phiDocsAttempted: phiDocsAttemptedSchool,
      phiDocsCreated: phiDocsCreatedSchool,
      phiDocsFailed: phiDocsFailedSchool
    });

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
    let bundleResult = null;
    let bundleSaveFailed = false;
    // Hoisted so the school-ROI completion email can attach the actual packet
    // PDF (mirrors the registration flow). See registration flow for the
    // rationale — signed download URLs aren't enough on their own.
    let combinedPdfBuffer = null;
    // Multi-child submissions deliberately do NOT produce a combined bundle
    // anymore — each child owns a fully isolated per-child packet built above,
    // and merging them into a single file would co-mingle their PHI in one
    // artifact (which we don't want for audit/download/email purposes).
    // Single-child submissions still produce the combined bundle because it
    // doubles as the only per-client packet via the dedup block below.
    const isMultiChildSubmission = Array.isArray(rawClients) && rawClients.length > 1;

    // Hoisted so the registration-completion-hints persist block below
    // (which lives OUTSIDE the if-pdfPaths block) can read it without
    // throwing ReferenceError. Also intentionally available for multi-child
    // submissions, which deliberately skip the combined-bundle build but
    // still need the persist hints + any future per-child email path to know
    // which event the registrant signed up for. Resolution is best-effort:
    // any failure leaves the value as an empty string and the downstream
    // consumers fall back to null via `|| null`.
    let registrationEventSummary = '';
    try {
      const evSel = normalizeRegistrationSelections(intakeData).find((s) => registrationEntityType(s) === 'company_event');
      // intake_links has no agency_id column — its organization_id IS
      // the agency for intake-scoped links. Without this fallback, the
      // event summary silently resolves to empty for every link-bound
      // company_event flow (and the success card / email fall back to
      // "Event #<id>" instead of the real title).
      const aid = Number(link?.agency_id || link?.organization_id || 0) || null;
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
    } catch (evResolveErr) {
      console.warn('[publicIntake] registrationEventSummary resolve failed (school-roi flow)', {
        submissionId,
        message: evResolveErr?.message || evResolveErr
      });
      registrationEventSummary = '';
    }

    // Multi-child correctness note (see DIGITAL_FORMS_INTAKE_CONTRACT.md §11):
    // the per-client Intake Packet attach loop, staff notifications, and
    // completion-email block ALL run for both single-child and multi-child
    // finalizes. Only the combined-bundle build is gated to single-child —
    // multi-child intentionally skips merging PHI from different kids into one
    // file. Previously the entire block was gated by `!isMultiChildSubmission`,
    // which silently dropped packet PHI docs and completion emails for
    // siblings. The registration flow already mirrors this structure (see
    // line ~7691); keep them in sync.
    if (pdfPaths.length > 0) {
      // Combined-bundle build/upload is wrapped in its own try/catch so that
      // a failure here does NOT abort the per-client Intake Packet PHI doc
      // creation, the completion email, or the staff notifications below.
      // Historically a silent GCS upload hang here orphaned the entire packet.
      if (!isMultiChildSubmission) {
      try {
        // Combined bundle prefix order: registration ticket → answers summary
        // → all per-template signed PDFs. The ticket lands the registrant on
        // their confirmation page when they open the full packet.
        const combinedPrefixBuffers = [ticketPdf, answersPdf].filter(Boolean);
        const mergedPdfRaw = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(
          pdfPaths,
          combinedPrefixBuffers
        );
        // Compress the combined bundle right before upload. Hash is taken on
        // the compressed buffer so combined_pdf_hash matches what's stored.
        const { buffer: mergedPdf } = await compressPdfBuffer(
          Buffer.isBuffer(mergedPdfRaw) ? mergedPdfRaw : Buffer.from(mergedPdfRaw),
          { label: `school-roi-combined-${submissionId}` }
        );
        const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
        // Capture the buffer for the completion-email attachment below.
        combinedPdfBuffer = mergedPdf;
        bundleResult = await StorageService.saveIntakeBundle({
          submissionId,
          fileBuffer: mergedPdf,
          filename: `intake-bundle-${submissionId}.pdf`
        });
        await IntakeSubmission.updateById(submissionId, {
          combined_pdf_path: bundleResult.relativePath,
          combined_pdf_hash: bundleHash
        });
        downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 7);

        // Single-child storage dedup: per-client bundle save was skipped above
        // because it would duplicate the combined bundle. Point this child's
        // bundle_pdf_path at the combined bundle so all the existing readers
        // (per-child receipt download, communications email links, retention
        // cleanup) keep working unchanged. Also surface a clientBundles entry
        // so the completion email's per-child packet link resolves.
        const isSingleChildFinalize = Array.isArray(rawClients) && rawClients.length === 1;
        if (isSingleChildFinalize) {
          const onlyClient = rawClients[0] || null;
          const onlyRow = intakeClientRows[0] || null;
          if (onlyRow?.id && !onlyRow?.bundle_pdf_path) {
            try {
              await IntakeSubmissionClient.updateById(onlyRow.id, {
                bundle_pdf_path: bundleResult.relativePath,
                bundle_pdf_hash: bundleHash
              });
              onlyRow.bundle_pdf_path = bundleResult.relativePath;
              onlyRow.bundle_pdf_hash = bundleHash;
            } catch (dedupErr) {
              console.warn('[publicIntake] single-child bundle dedup failed to update intake_submission_clients (school-roi flow)', {
                submissionId,
                intakeClientRowId: onlyRow.id,
                error: dedupErr?.message || dedupErr
              });
            }
          }
          if (!clientBundles.length) {
            clientBundles.push({
              clientId: onlyClient?.id || null,
              clientName: onlyClient?.fullName || null,
              filename: `intake-bundle-${submissionId}.pdf`,
              downloadUrl
            });
          }
        }
      } catch (combinedBundleErr) {
        bundleSaveFailed = true;
        console.error('[publicIntake] combined bundle build/save failed (school-roi flow) — continuing so per-client Intake Packet docs and completion email still go out', {
          submissionId,
          pdfPathCount: pdfPaths.length,
          error: combinedBundleErr?.message || combinedBundleErr,
          stack: combinedBundleErr?.stack
        });
      }
      } // end if(!isMultiChildSubmission) — combined bundle build only runs for single-child

      // Multi-child safe per-client packet attachment.
      // We must NOT pass `bundleResult.relativePath` (the combined bundle) for
      // every child — `client_phi_documents.storage_path` is UNIQUE so child 2+
      // would silently fail. Use the per-client bundle saved on
      // `intake_submission_clients.bundle_pdf_path`, falling back to the
      // combined bundle only for single-child submissions.
      const isMultiClientFinalize = Array.isArray(rawClients) && rawClients.length > 1;
      const packetFailures = [];
      for (let pi = 0; pi < rawClients.length; pi += 1) {
        const clientPayload = rawClients[pi];
        const clientId = clientPayload?.id || null;
        if (!clientId) continue;
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        const perClientRow = intakeClientRows[pi] || null;
        const perClientBundlePath = perClientRow?.bundle_pdf_path || null;
        const packetStoragePath = isMultiClientFinalize
          ? (perClientBundlePath || null)
          : (perClientBundlePath || bundleResult?.relativePath || null);
        if (!packetStoragePath) {
          packetFailures.push({
            clientId,
            reason: bundleSaveFailed && !perClientBundlePath
              ? 'combined_bundle_save_failed'
              : 'missing_per_child_bundle_path',
            multiChild: isMultiClientFinalize
          });
        } else {
          const packetResult = await createIntakePacketDocument({
            clientId,
            clientRow,
            submissionId,
            storagePath: packetStoragePath,
            ipAddress: updatedSubmission.ip_address || null,
            expiresAt: retentionExpiresAt,
            link,
            organizationId: req.body?.organizationId || null
          });
          if (!packetResult?.ok) {
            packetFailures.push({
              clientId,
              reason: packetResult?.reason || 'unknown',
              error: packetResult?.error || null,
              storagePath: packetStoragePath
            });
          }
        }

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
      if (packetFailures.length) {
        console.error('[multi_child_packet_failures] some children did not get an Intake Packet PHI doc', {
          submissionId,
          totalChildren: rawClients.length,
          failures: packetFailures
        });
      }

      // `registrationEventSummary` is hoisted above the `if (pdfPaths.length > 0
      // && !isMultiChildSubmission)` block so it stays in scope for both the
      // email block here AND the registration-completion-hints persist block
      // below. Do NOT redeclare it here — a `let registrationEventSummary = ''`
      // inside this block would shadow the outer one only within this block,
      // but the outer one is what the persist block relies on, and a stale
      // shadow inside this block is a footgun for future edits.

      // Reuse the registration ticket setup hoisted earlier (event
      // placeholders, receipt token + URL, org context). Generating new ones
      // here would issue a second registration_receipt_token and invalidate
      // the URL printed in the bundled ticket PDF.
      const eventPlaceholdersForEmail = eventPlaceholdersHoisted
        || await loadRegistrationEventFieldPlaceholders(intakeData, link);
      const registrationReceiptUrl = registrationReceiptUrlHoisted || '';
      const completionEmailFromAddress =
        process.env.GOOGLE_WORKSPACE_FROM_ADDRESS
        || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM
        || '';

      if (updatedSubmission.signer_email) {
        emailDelivery.attempted = true;
        try {
          const clientCount = rawClients.length || 1;
          const { organization, agency } = orgContextHoisted?.organization || orgContextHoisted?.agency
            ? orgContextHoisted
            : await resolveIntakeOrgContext(link, { boundClient: null });
          const portalBase = String(config.frontendUrl || '').replace(/\/$/, '');
          const registrationLoginPageUrl = portalBase ? `${portalBase}/login` : '';
          const regFlow = linkSupportsPublicRegistrationFeatures(link);
          const registrationPasswordlessUrl =
            regFlow && link.create_guardian && (newGuardianPasswordlessLoginUrl || '')
              ? (newGuardianPasswordlessLoginUrl || '')
              : '';
          // Build a per-child signed-documents list so the single confirmation
          // email can show every child's name, their per-child packet link,
          // and links to each signed document. Only meaningful when 2+ kids.
          const bundlesForEmail = await Promise.all(
            (clientBundles || []).map(async (bundle) => {
              const enriched = { ...bundle, signedDocuments: [] };
              try {
                const docs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
                const childDocs = (docs || []).filter((d) => Number(d.client_id || 0) === Number(bundle.clientId || 0));
                const signedDocuments = [];
                for (const d of childDocs) {
                  if (!d?.signed_pdf_path) continue;
                  let templateName = 'Signed Document';
                  try {
                    const [tplRows] = await pool.execute(
                      'SELECT name FROM document_templates WHERE id = ? LIMIT 1',
                      [d.document_template_id]
                    );
                    if (tplRows?.[0]?.name) templateName = String(tplRows[0].name);
                  } catch { /* template lookup best-effort */ }
                  let url = '';
                  try {
                    url = await StorageService.getSignedUrl(d.signed_pdf_path, 60 * 24 * 7);
                  } catch { /* signed url failure non-fatal */ }
                  signedDocuments.push({ name: templateName, downloadUrl: url });
                }
                enriched.signedDocuments = signedDocuments;
              } catch (lookupErr) {
                console.error('[publicIntake] failed to enrich clientBundles for email', {
                  submissionId,
                  clientId: bundle?.clientId,
                  error: lookupErr?.message || lookupErr
                });
              }
              return enriched;
            })
          );
          const packetEmail = await resolvePacketCompletionEmailContent({
            link,
            agencyId: link?.agency_id || agency?.id || null,
            signerName: updatedSubmission.signer_name || '',
            signerEmail: updatedSubmission.signer_email || '',
            clientCount,
            primaryClientName,
            schoolName: organization?.name || '',
            agencyName: agency?.name || '',
            downloadUrl,
            expiresInDays: 7,
            registrationLoginEmail: updatedSubmission.signer_email || '',
            registrationNeedsSetup: regFlow && link.create_guardian && newGuardianCreated,
            registrationTempPassword: regFlow && link.create_guardian && newGuardianCreated
              ? (newGuardianTemporaryPassword || '')
              : '',
            portalLoginUrl: registrationLoginPageUrl,
            registrationPasswordlessUrl,
            registrationEventSummary,
            registrationReceiptUrl,
            fromAddress: completionEmailFromAddress,
            eventPlaceholders: eventPlaceholdersForEmail,
            returningMatchClientInitials: returningAutoMatchInitialsForEmail || '',
            clientBundles: bundlesForEmail
          });
          const sendOutcome = await deliverPacketCompletionEmail({
            to: updatedSubmission.signer_email,
            subject: packetEmail.subject,
            text: packetEmail.text,
            html: packetEmail.html,
            packetPdfBuffer: combinedPdfBuffer,
            link,
            agencyId: link?.agency_id || agency?.id || null,
            clientId: updatedSubmission?.client_id || null,
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null,
            templateType: 'intake_packet_completion',
            submissionId,
            flowLabel: 'school-roi'
          });
          emailDelivery.sent = sendOutcome.sent;
          if (!sendOutcome.sent) {
            emailDelivery.error = sendOutcome.error;
            emailDelivery.errorMessage = sendOutcome.errorMessage;
          }
          // Multi-child: mirror the same Communications-tab row onto every
          // sibling beyond the primary client so each child's tab shows the
          // completion email instead of looking silently empty.
          await mirrorPacketCompletionRowToSiblings({
            to: updatedSubmission.signer_email,
            subject: packetEmail.subject,
            text: packetEmail.text,
            html: packetEmail.html,
            templateType: 'intake_packet_completion',
            link,
            agencyId: link?.agency_id || agency?.id || null,
            primaryClientId: updatedSubmission?.client_id || null,
            siblingClientIds: (rawClients || []).map((c) => c?.id).filter(Boolean),
            submissionId,
            flowLabel: 'school-roi',
            outcome: sendOutcome
          });
        } catch (emailErr) {
          // deliverPacketCompletionEmail handles its own logging & never
          // throws, so this catch is for the BUILDING of `packetEmail` /
          // bundlesForEmail above. Keep it loud so a template render failure
          // is visible on the Communications tab and in server logs.
          emailDelivery.error = 'prep_failed';
          emailDelivery.errorMessage = String(emailErr?.message || 'prep_failed').slice(0, 500);
          console.error('[publicIntake] packet completion email prep failed (school-roi flow)', {
            submissionId,
            to: updatedSubmission?.signer_email || null,
            message: emailErr?.message || emailErr,
            stack: emailErr?.stack || null
          });
          await logSkippedOrFailedEmail({
            to: updatedSubmission?.signer_email || null,
            subject: 'School-ROI completion email (prep failed)',
            text: `Completion email could not be prepared: ${emailErr?.message || 'unknown failure'}`,
            html: null,
            agencyId: link?.organization_id || link?.agency_id || null,
            clientId: updatedSubmission?.client_id || null,
            templateType: 'intake_packet_completion',
            deliveryStatus: 'failed',
            errorMessage: emailDelivery.errorMessage,
            metadata: { submissionId, reason: 'prep_failed', flow: 'school-roi' }
          });
          // Mirror the prep-failure row to siblings so child 2+ Communications
          // tabs aren't silently empty when the primary fails at prep.
          await mirrorPacketCompletionRowToSiblings({
            to: updatedSubmission?.signer_email || null,
            subject: 'School-ROI completion email (prep failed)',
            text: `Completion email could not be prepared: ${emailErr?.message || 'unknown failure'}`,
            html: null,
            templateType: 'intake_packet_completion',
            link,
            agencyId: link?.organization_id || link?.agency_id || null,
            primaryClientId: updatedSubmission?.client_id || null,
            siblingClientIds: (rawClients || []).map((c) => c?.id).filter(Boolean),
            submissionId,
            flowLabel: 'school-roi',
            outcome: { sent: false, error: 'prep_failed', errorMessage: emailDelivery.errorMessage }
          });
        }
      } else {
        // No signer_email at all — write the same kind of trace row so this
        // skipped attempt still appears on the client's Communications tab.
        console.warn('[publicIntake] school-roi completion email skipped — no signer_email', {
          submissionId,
          emailServiceConfigured: EmailService.isConfigured()
        });
        await logSkippedOrFailedEmail({
          to: null,
          subject: 'School-ROI completion email (skipped — no signer email)',
          text: 'Completion email was not sent because the submission did not include a signer email address.',
          html: null,
          agencyId: link?.organization_id || link?.agency_id || null,
          clientId: updatedSubmission?.client_id || null,
          templateType: 'intake_packet_completion',
          deliveryStatus: 'skipped',
          errorMessage: 'send skipped — no_signer_email',
          metadata: { submissionId, reason: 'no_signer_email', flow: 'school-roi' }
        });
        // Even with no signer email, mirror the skip row to each sibling so the
        // Communications tabs stay consistent across the submission.
        await mirrorPacketCompletionRowToSiblings({
          to: null,
          subject: 'School-ROI completion email (skipped — no signer email)',
          text: 'Completion email was not sent because the submission did not include a signer email address.',
          html: null,
          templateType: 'intake_packet_completion',
          link,
          agencyId: link?.organization_id || link?.agency_id || null,
          primaryClientId: updatedSubmission?.client_id || null,
          siblingClientIds: (rawClients || []).map((c) => c?.id).filter(Boolean),
          submissionId,
          flowLabel: 'school-roi',
          outcome: { skipped: true, error: 'no_signer_email', errorMessage: 'send skipped — no_signer_email' }
        });
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
          intakeData,
          submission: updatedSubmission
        });
        await persistGuardianProfileForClient({
          clientId,
          payload: req.body || {},
          intakeData,
          submission: updatedSubmission,
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
  // Total-duration breadcrumb for the public-intake finalize path. Parents
  // reported ~8 minute waits for the packet to be ready (see Issue 5 in the
  // registration fixes thread); this marker lets us confirm subsequent
  // improvements in real request logs and flag regressions as they appear.
  const submitStartedAt = Date.now();
  const submitTimings = [];
  const markSubmitStep = (label, ms) => {
    if (typeof ms === 'number' && Number.isFinite(ms)) {
      submitTimings.push({ step: label, ms });
    }
  };
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

    // Idempotent retry: if already submitted, return existing result (no duplicate work, no data loss).
    // Multi-child submissions intentionally have no combined bundle (each child gets a fully isolated
    // per-child packet), so short-circuit when EITHER the combined bundle or at least one per-child
    // bundle exists, surfacing whatever artifacts are present.
    if (String(submission.status || '').toLowerCase() === 'submitted') {
      const _clientRowsForRetry = await IntakeSubmissionClient.listBySubmissionId(submissionId);
      const _hasAnyPerChildBundleForRetry = (_clientRowsForRetry || []).some((c) => c?.bundle_pdf_path);
      if (submission.combined_pdf_path || _hasAnyPerChildBundleForRetry) {
        let downloadUrl = null;
        if (submission.combined_pdf_path) {
          try {
            downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 7);
          } catch {
            // best-effort
          }
        }
        const clientBundles = [];
        for (const c of _clientRowsForRetry || []) {
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
    let intakeData = req.body?.intakeData || null;
    // Mirror the school-roi flow: inject the link-bound company_event_id
    // as a synthetic registration selection so downstream ticket PDF +
    // event placeholder + completion email + frontend success card all
    // see the event the family signed up for via the link itself.
    ensureLinkBoundCompanyEventSelection(intakeData, link);
    stampInsuranceAuthorizationSignatureMeta(intakeData, req, now);
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

    let newGuardianCreated = false;
    let newGuardianTemporaryPassword = null;
    let newGuardianPasswordlessLoginUrl = null;
    let createdClients = [];
    let returningAutoMatchInitialsForEmailSubmit = '';
    if (link.create_client) {
      const attachInfo = await resolveIntakeExistingClientAttach({
        link,
        intakeData,
        payload: req.body,
        submission: updatedSubmission
      });
      if (attachInfo.attachClientId) {
        const existingClient = await Client.findById(attachInfo.attachClientId, { includeSensitive: true });
        if (existingClient?.id) {
          // See the school-ROI flow's matched-attach branch for the full
          // rationale and history (Carter/Carmen Bleem report, sub 300
          // Client1 Example matched + Client Example2 dropped). In the
          // registration flow the same `createdClients = [existingClient]`
          // pattern would silently discard payload.clients[1..N] when child
          // #1 matched a returning record. This block extends the registration
          // flow to also create the brand-new siblings via
          // createAdditionalSiblingClients (no guardian provisioning — that
          // runs once across the full set below). See
          // DIGITAL_FORMS_INTAKE_CONTRACT.md §11.
          const submittedClients = Array.isArray(req.body?.clients) ? req.body.clients : [];
          let newSiblings = [];
          if (submittedClients.length > 1) {
            try {
              const siblingResult = await PublicIntakeClientService.createAdditionalSiblingClients({
                link,
                payload: req.body,
                siblings: submittedClients.slice(1)
              });
              newSiblings = Array.isArray(siblingResult?.clients) ? siblingResult.clients : [];
              if (newSiblings.length) {
                console.info('[publicIntake] returning-family matched + created brand-new siblings (registration flow)', {
                  submissionId,
                  matchedClientId: existingClient.id,
                  matchSource: attachInfo.attachSource,
                  submittedClientCount: submittedClients.length,
                  siblingsCreatedIds: newSiblings.map((s) => s.id)
                });
              }
            } catch (siblingErr) {
              console.error('[publicIntake] createAdditionalSiblingClients failed (registration flow) — matched client will proceed, additional siblings dropped', {
                submissionId,
                matchedClientId: existingClient.id,
                attemptedSiblingCount: submittedClients.length - 1,
                error: siblingErr?.message || siblingErr,
                stack: siblingErr?.stack
              });
              newSiblings = [];
            }
          }

          const allClientsForGuardian = [existingClient, ...newSiblings];
          const {
            guardianUser,
            newGuardianCreated: ngCreated,
            newGuardianTemporaryPassword: ngpw,
            newGuardianPasswordlessLoginUrl: ngMagic
          } = await PublicIntakeClientService.provisionGuardianForIntakeClients({
            link,
            agencyId: attachInfo.agencyIdResolved,
            clients: allClientsForGuardian,
            payload: req.body
          });
          createdClients = allClientsForGuardian;
          newGuardianCreated = !!ngCreated;
          newGuardianTemporaryPassword = ngpw || null;
          newGuardianPasswordlessLoginUrl = ngMagic || null;
          if (attachInfo.attachSource === 'returning_auto') {
            returningAutoMatchInitialsForEmailSubmit = attachInfo.returningMatchInitials || '';
            try {
              await Client.update(existingClient.id, {
                last_returning_match_submission_id: submissionId
              });
            } catch (auditErr) {
              console.warn('[publicIntake] last_returning_match_submission_id update failed (submit)', {
                clientId: existingClient.id,
                message: auditErr?.message
              });
            }
          }
          if (attachInfo.mergePatch && Object.keys(attachInfo.mergePatch).length) {
            intakeData = mergeIntakeSubmissionPatch(intakeData || { responses: { submission: {} } }, attachInfo.mergePatch);
            updatedSubmission = await IntakeSubmission.updateById(submissionId, {
              client_id: existingClient.id,
              guardian_user_id: guardianUser?.id || null,
              intake_data: JSON.stringify(intakeData),
              intake_data_hash: hashIntakeData(intakeData)
            });
          } else {
            updatedSubmission = await IntakeSubmission.updateById(submissionId, {
              client_id: existingClient.id,
              guardian_user_id: guardianUser?.id || null
            });
          }
        } else {
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
      } else {
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

    // Multi-client signature consent audit (registration flow). Mirrors the
    // school-roi flow above — we want a server-side breadcrumb either way so
    // any unconsented multi-child packet is flagged for staff follow-up.
    if (Array.isArray(rawClients) && rawClients.length > 1) {
      const mcConsentReg = intakeData?.multiClientSignatureConsent || null;
      if (mcConsentReg && mcConsentReg.accepted) {
        console.log('[multi_child_signature_consent] parent agreed signatures apply to all children (registration flow)', {
          submissionId,
          clientCount: rawClients.length,
          acceptedAt: mcConsentReg.acceptedAt || null
        });
      } else {
        console.warn('[multi_child_signature_consent_missing] multi-client registration finalized without recorded consent — verify intake source / frontend version', {
          submissionId,
          clientCount: rawClients.length,
          hasConsentField: !!mcConsentReg
        });
      }
    }

    // ---------------------------------------------------------------
    // Registration ticket setup (registration flow). Mirrors the school-roi
    // flow above. Hoisted up here so the ticket PDF is available as a prefix
    // for both per-child packets (multi-child) and the combined bundle, and
    // so the email block below can reuse the same receipt URL/org context
    // without double-issuing tokens.
    // ---------------------------------------------------------------
    let eventPlaceholdersHoisted = null;
    try {
      eventPlaceholdersHoisted = await loadRegistrationEventFieldPlaceholders(intakeData, link);
    } catch {
      eventPlaceholdersHoisted = null;
    }
    const portalBaseHoistedReg = String(config.frontendUrl || '').replace(/\/$/, '');
    let registrationReceiptUrlHoisted = '';
    if (portalBaseHoistedReg) {
      try {
        const receiptToken = crypto.randomBytes(32).toString('hex');
        await IntakeSubmission.updateById(submissionId, { registration_receipt_token: receiptToken });
        registrationReceiptUrlHoisted = `${portalBaseHoistedReg}/registration-receipt/${submissionId}?token=${encodeURIComponent(receiptToken)}`;
      } catch (tokenErr) {
        console.warn('[publicIntake] failed to issue registration_receipt_token (registration flow); ticket will omit live receipt URL', {
          submissionId,
          error: tokenErr?.message || tokenErr
        });
        registrationReceiptUrlHoisted = '';
      }
    }
    let orgContextHoisted = { organization: null, agency: null };
    try {
      orgContextHoisted = await resolveIntakeOrgContext(link, { issuedRoiLink: null, boundClient: null });
    } catch {
      orgContextHoisted = { organization: null, agency: null };
    }
    let ticketPdf = null;
    try {
      ticketPdf = await buildRegistrationTicketPdf({
        intakeData,
        submission: updatedSubmission,
        link,
        eventPlaceholders: eventPlaceholdersHoisted,
        registrationReceiptUrl: registrationReceiptUrlHoisted,
        organization: orgContextHoisted?.organization || null,
        agency: orgContextHoisted?.agency || null
      });
    } catch (ticketErr) {
      console.warn('[publicIntake] registration ticket PDF build failed (registration flow) — continuing without ticket', {
        submissionId,
        error: ticketErr?.message || ticketErr
      });
      ticketPdf = null;
    }

    const intakeClientRows = [];
    // Loud entry log — every time a registration finalize lost paperwork it
    // turned out we either had 0 rawClients (so the loop never ran) or a
    // null clientId (so the `if (clientId)` PHI doc block was skipped). Print
    // exactly what we're about to iterate so the production server log shows
    // it instead of us guessing later.
    console.info('[publicIntake] registration finalize per-client loop starting', {
      submissionId,
      linkId: link?.id || null,
      linkCreateClient: !!link?.create_client,
      createdClientsCount: Array.isArray(createdClients) ? createdClients.length : 0,
      createdClientIds: Array.isArray(createdClients) ? createdClients.map((c) => c?.id || null) : [],
      rawClientsCount: rawClients.length,
      rawClientIds: rawClients.map((c) => c?.id || null),
      packetDocumentTemplateCount: Array.isArray(packetDocumentTemplates) ? packetDocumentTemplates.length : 0
    });
    let phiDocsAttempted = 0;
    let phiDocsCreated = 0;
    let phiDocsFailed = 0;
    for (let i = 0; i < rawClients.length; i += 1) {
      const clientPayload = rawClients[i];
      const clientId = clientPayload?.id || null;
      const clientName = String(clientPayload?.fullName || '').trim() || null;
      const auditTrail = buildAuditTrail({
        link,
        submission: { ...updatedSubmission, submitted_at: now, client_name: clientName }
      });

      // Per-iteration log — single child or sibling — so that if the loop
      // runs but one child gets no PHI rows, we can see exactly which
      // (clientId/name) was processed and which was skipped due to a null id.
      console.info('[publicIntake] registration finalize processing client', {
        submissionId,
        loopIndex: i,
        clientId,
        clientName,
        willCreatePhiDocs: Boolean(clientId)
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
          phiDocsAttempted += 1;
          // Per-template signed PDF attaches to this child's profile via the
          // shared helper. The helper resolves agency/school org with the
          // same fallback chain everywhere and emits structured failure logs
          // so silent "PHI row never landed" regressions stop happening.
          const attachResult = await attachSignedPdfToClient({
            clientId,
            link,
            storagePath: result.storagePath,
            originalName: `${template.name || 'Document'} (Signed)`,
            intakeSubmissionId: submissionId,
            expiresAt: retentionExpiresAt,
            ipAddress: updatedSubmission.ip_address,
            schoolOrganizationIdOverride: req.body?.organizationId
              ? Number(req.body.organizationId) || null
              : null,
            auditMetadata: { submissionId, templateId: template.id },
            callerLabel: 'public_intake_registration'
          });
          if (attachResult.ok) {
            phiDocsCreated += 1;
          } else {
            phiDocsFailed += 1;
          }
        } else {
          // Skipped because there's no client to attach to. This commonly
          // happens for non-create_client public links where we use a virtual
          // signer entry — those signed PDFs intentionally don't land on a
          // client profile (there is none). Log it so we can tell the
          // difference between "intentionally skipped" and "data lost".
          console.info('[publicIntake] phi doc skipped — no clientId', {
            submissionId,
            loopIndex: i,
            templateId: template.id,
            linkCreateClient: !!link?.create_client
          });
        }

        signedDocs.push(doc);
      }

      const isMultiClientReg = Array.isArray(rawClients) && rawClients.length > 1;
      // Storage dedup: for single-child registration the per-client bundle
      // would duplicate the combined bundle save below. Skip it in that case;
      // we'll point bundle_pdf_path at the combined bundle after it lands.
      if (clientPaths.length && isMultiClientReg) {
        // Per-client bundle build/upload is wrapped in its own try/catch so a
        // single child's PDF problem (or transient GCS hiccup) does NOT abort
        // the rest of the loop iteration — auto-mark, demographics persist,
        // and the eventual completion email all still need to run.
        try {
          // Per-child packet prefix: registration ticket first, then this
          // child's intake responses (scoped to clientIndex=i so nothing from
          // a sibling bleeds in), then this child's per-template signed docs.
          let perChildAnswersPdf = null;
          try {
            perChildAnswersPdf = await buildAnswersPdfBuffer({ link, intakeData, clientIndex: i });
          } catch (perChildAnswersErr) {
            console.error('[publicIntake] per-child answers PDF generation failed (registration flow) — continuing without it', {
              submissionId,
              clientIndex: i,
              clientId: clientId || null,
              error: perChildAnswersErr?.message || perChildAnswersErr
            });
          }
          const perChildPrefix = [ticketPdf, perChildAnswersPdf].filter(Boolean);
          const mergedClientPdfRaw = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(
            clientPaths,
            perChildPrefix
          );
          const { buffer: mergedClientPdf } = await compressPdfBuffer(
            Buffer.isBuffer(mergedClientPdfRaw) ? mergedClientPdfRaw : Buffer.from(mergedClientPdfRaw),
            { label: `registration-client-${submissionId}-${clientId || 'unknown'}` }
          );
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
              targetRow.bundle_pdf_path = clientBundleResult.relativePath;
              targetRow.bundle_pdf_hash = clientBundleHash;
            }
          }
          clientBundles.push({
            clientId,
            clientName,
            filename: `intake-client-${clientId || 'unknown'}.pdf`,
            downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 7)
          });
        } catch (perClientBundleErr) {
          console.error('[publicIntake] per-client bundle build/save failed (registration flow) — continuing so downstream side-effects (auto-mark, completion email) still run', {
            submissionId,
            clientId: clientId || null,
            mergePathCount: clientPaths.length,
            error: perClientBundleErr?.message || perClientBundleErr,
            stack: perClientBundleErr?.stack
          });
        }
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

        // Persist each intake "piece" (answers PDF, registration ticket PDF)
        // as its own per-client PHI doc, so they survive even when the
        // combined bundle merge/upload fails. See helper for rationale.
        await createIntakePiecePdfDocuments({
          clientId,
          clientRow,
          submissionId,
          link,
          intakeData,
          clientIndex,
          ticketPdf,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          organizationId: req.body?.organizationId || null
        });

        // Same per-child persistence as the school-roi flow — one shared
        // helper means future fixes only need to be made in one place.
        await persistChildIntakeData({
          clientId,
          intakeData,
          clientIndex: i,
          submissionId,
          completedAt: now,
          flowLabel: 'registration',
          intakeCompletionNote: 'Marked received automatically after intake/registration completion'
        });
      }
    }

    // Per-client loop summary so the operator can immediately tell whether
    // PHI rows landed for every signed PDF or whether some failed at the DB
    // layer. If `phiDocsCreated < phiDocsAttempted` the per-iteration
    // `[publicIntake] client_phi_documents insert failed` log above has the
    // exact SQL/code/state for diagnosis.
    console.info('[publicIntake] registration finalize per-client loop summary', {
      submissionId,
      rawClientsCount: rawClients.length,
      intakeClientRowsCreated: intakeClientRows.length,
      packetDocumentTemplateCount: Array.isArray(packetDocumentTemplates) ? packetDocumentTemplates.length : 0,
      phiDocsAttempted,
      phiDocsCreated,
      phiDocsFailed
    });

    const answersPdfStart = Date.now();
    const answersPdf = await buildAnswersPdfBuffer({ link, intakeData });
    markSubmitStep('answersPdfBuild', Date.now() - answersPdfStart);

    let downloadUrl = null;
    let bundleResult = null;
    let bundleSaveFailed = false;
    // Hoisted so the completion email can ATTACH the actual packet PDF (not
    // just a download link). Parents have repeatedly reported "no email"
    // because expiring signed URLs went to spam — sending the bytes inline
    // means the family always has the packet even if the link rots.
    let combinedPdfBuffer = null;
    // Multi-child submissions deliberately skip the combined bundle — each
    // child owns a fully isolated per-child packet built above. See the
    // matching guard in the school-roi flow for the same rationale.
    const isMultiChildRegSubmission = Array.isArray(rawClients) && rawClients.length > 1;
    // Hoisted so multiple downstream blocks (email body, completion hints
    // persist) can read the summarized event string without hitting a
    // ReferenceError when the email branch is skipped. Reassigned inside the
    // email block when we actually resolve the event details.
    let registrationEventSummary = '';
    if (pdfPaths.length > 0 && !isMultiChildRegSubmission) {
      // Combined-bundle build/upload is wrapped in its own try/catch so a
      // failure here does NOT abort per-client Intake Packet PHI doc creation
      // or the completion email. (See school-roi flow above for the parallel
      // implementation; same hard-learned lesson.)
      try {
        // Combined bundle prefix order: registration ticket → answers summary
        // → all per-template signed PDFs.
        const combinedPrefixBuffers = [ticketPdf, answersPdf].filter(Boolean);
        const mergeStart = Date.now();
        const mergedPdfRaw = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(
          pdfPaths,
          combinedPrefixBuffers
        );
        markSubmitStep('combinedBundleMerge', Date.now() - mergeStart);
        const compressStart = Date.now();
        const { buffer: mergedPdf } = await compressPdfBuffer(
          Buffer.isBuffer(mergedPdfRaw) ? mergedPdfRaw : Buffer.from(mergedPdfRaw),
          { label: `registration-combined-${submissionId}` }
        );
        markSubmitStep('combinedBundleCompress', Date.now() - compressStart);
        const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
        // Capture the buffer so the completion email can attach the PDF
        // directly. Big buffers are released the moment the request handler
        // returns (we never store them past the email send below).
        combinedPdfBuffer = mergedPdf;
        const saveStart = Date.now();
        bundleResult = await StorageService.saveIntakeBundle({
          submissionId,
          fileBuffer: mergedPdf,
          filename: `intake-bundle-${submissionId}.pdf`
        });
        markSubmitStep('combinedBundleUpload', Date.now() - saveStart);
        await IntakeSubmission.updateById(submissionId, {
          combined_pdf_path: bundleResult.relativePath,
          combined_pdf_hash: bundleHash
        });
        downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 7);

        // Single-child storage dedup: per-client bundle save was skipped above.
        // Point this child's bundle_pdf_path at the combined bundle so all the
        // existing readers (per-child receipt download, communications email
        // links, retention cleanup) keep working. Push a clientBundles entry
        // so the completion email's per-child packet link resolves.
        const isSingleChildFinalize = Array.isArray(rawClients) && rawClients.length === 1;
        if (isSingleChildFinalize) {
          const onlyClient = rawClients[0] || null;
          const onlyRow = intakeClientRows[0] || null;
          if (onlyRow?.id && !onlyRow?.bundle_pdf_path) {
            try {
              await IntakeSubmissionClient.updateById(onlyRow.id, {
                bundle_pdf_path: bundleResult.relativePath,
                bundle_pdf_hash: bundleHash
              });
              onlyRow.bundle_pdf_path = bundleResult.relativePath;
              onlyRow.bundle_pdf_hash = bundleHash;
            } catch (dedupErr) {
              console.warn('[publicIntake] single-child bundle dedup failed to update intake_submission_clients (registration flow)', {
                submissionId,
                intakeClientRowId: onlyRow.id,
                error: dedupErr?.message || dedupErr
              });
            }
          }
          if (!clientBundles.length) {
            clientBundles.push({
              clientId: onlyClient?.id || null,
              clientName: onlyClient?.fullName || null,
              filename: `intake-bundle-${submissionId}.pdf`,
              downloadUrl
            });
          }
        }
      } catch (combinedBundleErr) {
        bundleSaveFailed = true;
        console.error('[publicIntake] combined bundle build/save failed (registration flow) — continuing so per-client Intake Packet docs and completion email still go out', {
          submissionId,
          pdfPathCount: pdfPaths.length,
          error: combinedBundleErr?.message || combinedBundleErr,
          stack: combinedBundleErr?.stack
        });
      }

    }

    // ---------------------------------------------------------------------
    // Per-child Intake Packet PHI attach + email delivery — MUST run for both
    // single-child and multi-child finalizes. Previously these were both
    // nested inside the `!isMultiChildRegSubmission` guard above, which meant
    // multi-child submissions skipped the packet PHI doc AND got no
    // completion email. The per-child bundles are already written in the
    // earlier rawClients loop (see line ~6858), so we pick either the per-
    // child bundle path or fall back to the combined bundle for single-child
    // submissions where we deliberately skipped the per-client bundle save.
    // ---------------------------------------------------------------------
    if (pdfPaths.length > 0) {
      // Multi-child safe per-client packet attachment.
      // See createIntakePacketDocument doc comment — combined bundle path
      // can NOT be used for every child due to UNIQUE(storage_path).
      const isMultiClientFinalize = Array.isArray(rawClients) && rawClients.length > 1;
      const packetFailures = [];
      for (let pi = 0; pi < rawClients.length; pi += 1) {
        const clientPayload = rawClients[pi];
        const clientId = clientPayload?.id || null;
        if (!clientId) continue;
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        const perClientRow = intakeClientRows[pi] || null;
        const perClientBundlePath = perClientRow?.bundle_pdf_path || null;
        const packetStoragePath = isMultiClientFinalize
          ? (perClientBundlePath || null)
          : (perClientBundlePath || bundleResult?.relativePath || null);
        if (!packetStoragePath) {
          packetFailures.push({
            clientId,
            reason: bundleSaveFailed && !perClientBundlePath
              ? 'combined_bundle_save_failed'
              : 'missing_per_child_bundle_path',
            multiChild: isMultiClientFinalize
          });
        } else {
          const packetResult = await createIntakePacketDocument({
            clientId,
            clientRow,
            submissionId,
            storagePath: packetStoragePath,
            ipAddress: updatedSubmission.ip_address || null,
            expiresAt: retentionExpiresAt,
            link,
            organizationId: req.body?.organizationId || null
          });
          if (!packetResult?.ok) {
            packetFailures.push({
              clientId,
              reason: packetResult?.reason || 'unknown',
              error: packetResult?.error || null,
              storagePath: packetStoragePath
            });
          }
        }

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
      if (packetFailures.length) {
        console.error('[multi_child_packet_failures] some children did not get an Intake Packet PHI doc', {
          submissionId,
          totalChildren: rawClients.length,
          failures: packetFailures
        });
      }

      // Reuse the registration ticket setup hoisted earlier (event
      // placeholders, receipt token + URL, org context). Generating new ones
      // here would issue a second registration_receipt_token and invalidate
      // the URL printed in the bundled ticket PDF.
      const eventPlaceholdersForEmailSubmit = eventPlaceholdersHoisted
        || await loadRegistrationEventFieldPlaceholders(intakeData, link);
      const registrationReceiptUrlSubmit = registrationReceiptUrlHoisted || '';
      const completionEmailFromAddressSubmit =
        process.env.GOOGLE_WORKSPACE_FROM_ADDRESS
        || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM
        || '';

      // Resolve the event summary BEFORE checking email configuration so the
      // completion-hints persist block (further below) can save it even when
      // email delivery is off or fails.
      try {
        const evSelForSummary = normalizeRegistrationSelections(intakeData)
          .find((s) => registrationEntityType(s) === 'company_event');
        const aidForSummary = Number(
          orgContextHoisted?.agency?.id || link?.agency_id || 0
        ) || null;
        if (evSelForSummary?.entityId && aidForSummary) {
          const [erows] = await pool.execute(
            'SELECT title, starts_at FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1',
            [Number(evSelForSummary.entityId), aidForSummary]
          );
          const er = erows?.[0];
          if (er) {
            const st = er.starts_at ? new Date(er.starts_at).toLocaleString() : '';
            registrationEventSummary = [String(er.title || '').trim(), st]
              .filter(Boolean)
              .join(' — ');
          }
        }
      } catch (summaryErr) {
        console.warn('[publicIntake] registrationEventSummary resolve failed', {
          submissionId,
          message: summaryErr?.message || summaryErr
        });
        registrationEventSummary = '';
      }

      if (updatedSubmission.signer_email && EmailService.isConfigured()) {
        emailDelivery.attempted = true;
        // NOTE (parent feedback follow-up): the completion email was not
        // arriving even for single-client registrations. Only the inner
        // sendEmail call used to be inside a try/catch — anything that ran
        // BEFORE send (org-context lookup, template-name lookup, signed-URL
        // enrichment, resolvePacketCompletionEmailContent) could throw and
        // bubble all the way up to Express, which bailed out of the whole
        // submission handler before the send ever ran. Wrap the entire
        // prep+send in one try/catch so email prep errors are logged and
        // recorded on `emailDelivery` instead of aborting the response.
        try {
        const clientCount = rawClients.length || 1;
        const { organization, agency } = orgContextHoisted?.organization || orgContextHoisted?.agency
          ? orgContextHoisted
          : await resolveIntakeOrgContext(link, { issuedRoiLink: null, boundClient: null });
        const portalBase = String(config.frontendUrl || '').replace(/\/$/, '');
        const registrationLoginPageUrl = portalBase ? `${portalBase}/login` : '';
        const regFlowEmail = linkSupportsPublicRegistrationFeatures(link);
        const registrationPasswordlessUrl =
          regFlowEmail && link.create_guardian && (newGuardianPasswordlessLoginUrl || '')
            ? (newGuardianPasswordlessLoginUrl || '')
            : '';
        // Per-child enrichment for the single confirmation email (multi-child).
        //
        // Performance note (see Issue 5 in the registration-delay thread):
        // this block used to call `IntakeSubmissionDocument.listBySubmissionId`
        // ONCE PER CHILD, look up each template name with its own SQL, and
        // generate every signed URL sequentially. For a ~5-doc / 1-child
        // packet that's 5 round-trips to GCS for signed URLs alone, each
        // blocking the HTTP response. For multi-child it multiplies.
        //
        // Fetch the submission docs + template-name map ONCE, then issue all
        // signed-URL requests in parallel with Promise.all so the total email-
        // prep cost scales with the slowest single signed-URL call instead of
        // the sum.
        const enrichStart = Date.now();
        const allSubmissionDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
        const templateIdSet = new Set(
          (allSubmissionDocs || [])
            .map((d) => Number(d?.document_template_id || 0))
            .filter((id) => Number.isFinite(id) && id > 0)
        );
        const templateNameById = new Map();
        if (templateIdSet.size) {
          try {
            const placeholders = Array.from(templateIdSet).map(() => '?').join(',');
            const [tplRows] = await pool.execute(
              `SELECT id, name FROM document_templates WHERE id IN (${placeholders})`,
              Array.from(templateIdSet)
            );
            for (const r of tplRows || []) {
              templateNameById.set(Number(r.id), String(r.name || 'Signed Document'));
            }
          } catch (tplLookupErr) {
            console.warn('[publicIntake] batch template name lookup failed (email enrichment)', {
              submissionId,
              message: tplLookupErr?.message || tplLookupErr
            });
          }
        }
        const bundlesForEmailSubmit = await Promise.all(
          (clientBundles || []).map(async (bundle) => {
            const enriched = { ...bundle, signedDocuments: [] };
            try {
              const childDocs = (allSubmissionDocs || []).filter(
                (d) => Number(d.client_id || 0) === Number(bundle.clientId || 0)
              );
              const signedDocuments = await Promise.all(
                childDocs
                  .filter((d) => d?.signed_pdf_path)
                  .map(async (d) => {
                    const templateName = templateNameById.get(Number(d.document_template_id)) || 'Signed Document';
                    let url = '';
                    try {
                      url = await StorageService.getSignedUrl(d.signed_pdf_path, 60 * 24 * 7);
                    } catch {
                      // best-effort — email still goes, the per-doc link will
                      // just be blank for this particular file.
                    }
                    return { name: templateName, downloadUrl: url };
                  })
              );
              enriched.signedDocuments = signedDocuments;
            } catch (lookupErr) {
              console.error('[publicIntake] failed to enrich clientBundles for email', {
                submissionId,
                clientId: bundle?.clientId,
                error: lookupErr?.message || lookupErr
              });
            }
            return enriched;
          })
        );
        const enrichMs = Date.now() - enrichStart;
        if (enrichMs > 5000) {
          // This is THE loop that tended to dominate the multi-minute
          // registration wait, so log loudly when it's still slow.
          console.warn('[publicIntake] clientBundles email enrichment slow', {
            submissionId,
            bundleCount: (clientBundles || []).length,
            docCount: (allSubmissionDocs || []).length,
            ms: enrichMs
          });
        }
        const packetEmail = await resolvePacketCompletionEmailContent({
          link,
          agencyId: link?.agency_id || agency?.id || null,
          signerName: updatedSubmission.signer_name || '',
          signerEmail: updatedSubmission.signer_email || '',
          clientCount,
          primaryClientName,
          schoolName: organization?.name || '',
          agencyName: agency?.name || '',
          downloadUrl,
          expiresInDays: 7,
          registrationLoginEmail: updatedSubmission.signer_email || '',
          registrationNeedsSetup: regFlowEmail && link.create_guardian && newGuardianCreated,
          registrationTempPassword: regFlowEmail && link.create_guardian && newGuardianCreated
            ? (newGuardianTemporaryPassword || '')
            : '',
          portalLoginUrl: registrationLoginPageUrl,
          registrationPasswordlessUrl,
          registrationEventSummary,
          registrationReceiptUrl: registrationReceiptUrlSubmit,
          fromAddress: completionEmailFromAddressSubmit,
          eventPlaceholders: eventPlaceholdersForEmailSubmit,
          returningMatchClientInitials: returningAutoMatchInitialsForEmailSubmit || '',
          clientBundles: bundlesForEmailSubmit
        });
        {
          const sendOutcome = await deliverPacketCompletionEmail({
            to: updatedSubmission.signer_email,
            subject: packetEmail.subject,
            text: packetEmail.text,
            html: packetEmail.html,
            packetPdfBuffer: combinedPdfBuffer,
            link,
            agencyId: link?.agency_id || agency?.id || null,
            clientId: updatedSubmission?.client_id || null,
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null,
            templateType: 'intake_packet_completion',
            submissionId,
            flowLabel: 'registration'
          });
          emailDelivery.sent = sendOutcome.sent;
          if (!sendOutcome.sent) {
            emailDelivery.error = sendOutcome.error;
            emailDelivery.errorMessage = sendOutcome.errorMessage;
          }
          // Multi-child: mirror the same Communications-tab row onto every
          // sibling so each child's tab shows the completion email rather
          // than appearing silently empty. (Mirrors the school-ROI flow.)
          await mirrorPacketCompletionRowToSiblings({
            to: updatedSubmission.signer_email,
            subject: packetEmail.subject,
            text: packetEmail.text,
            html: packetEmail.html,
            templateType: 'intake_packet_completion',
            link,
            agencyId: link?.agency_id || agency?.id || null,
            primaryClientId: updatedSubmission?.client_id || null,
            siblingClientIds: (rawClients || []).map((c) => c?.id).filter(Boolean),
            submissionId,
            flowLabel: 'registration',
            outcome: sendOutcome
          });
        }
        } catch (emailPrepErr) {
          // Catches everything BEFORE the inner send's try — org-context
          // resolution, template/doc enrichment, resolvePacketCompletionEmailContent,
          // etc. Without this, a failure here aborted the whole request
          // even though the submission, PDFs, and enrollment were already
          // persisted. Parents reported this as "no completion email even
          // though the packet was processed" — this guard ensures the
          // response still returns 200 with emailDelivery.error populated.
          console.error('[publicIntake] registration completion email prep failed', {
            submissionId,
            to: updatedSubmission?.signer_email || null,
            message: emailPrepErr?.message || String(emailPrepErr || ''),
            stack: emailPrepErr?.stack || null
          });
          emailDelivery.error = emailDelivery.error || 'prep_failed';
          emailDelivery.errorMessage = String(emailPrepErr?.message || 'prep_failed').slice(0, 500);
          // Same diagnostic breadcrumb — if prep died (template lookup, org
          // context resolution, etc.) the staff have nothing in the
          // Communications tab to look at. Write a row so the failure is
          // visible at the same place as a successful send would have been.
          await logSkippedOrFailedEmail({
            to: updatedSubmission?.signer_email || null,
            subject: 'Registration packet completion (prep failed)',
            text: `Completion email could not be prepared: ${emailPrepErr?.message || 'unknown failure'}`,
            html: null,
            agencyId: link?.organization_id || link?.agency_id || null,
            clientId: updatedSubmission?.client_id || null,
            templateType: 'intake_packet_completion',
            deliveryStatus: 'failed',
            errorMessage: emailDelivery.errorMessage,
            metadata: { submissionId, reason: 'prep_failed', flow: 'registration' }
          });
          // Mirror the prep-failure to siblings so child 2+ Communications
          // tabs aren't silently empty when the primary fails at prep.
          await mirrorPacketCompletionRowToSiblings({
            to: updatedSubmission?.signer_email || null,
            subject: 'Registration packet completion (prep failed)',
            text: `Completion email could not be prepared: ${emailPrepErr?.message || 'unknown failure'}`,
            html: null,
            templateType: 'intake_packet_completion',
            link,
            agencyId: link?.organization_id || link?.agency_id || null,
            primaryClientId: updatedSubmission?.client_id || null,
            siblingClientIds: (rawClients || []).map((c) => c?.id).filter(Boolean),
            submissionId,
            flowLabel: 'registration',
            outcome: { sent: false, error: 'prep_failed', errorMessage: emailDelivery.errorMessage }
          });
        }
      } else if (updatedSubmission.signer_email && !EmailService.isConfigured()) {
        emailDelivery.attempted = true;
        emailDelivery.sent = false;
        emailDelivery.error = 'email_not_configured';
        console.warn('[publicIntake] registration completion email skipped — EmailService not configured', {
          submissionId,
          to: updatedSubmission?.signer_email || null
        });
        // Always leave a Communications-tab breadcrumb. Without this row the
        // user has no way to tell "EmailService unconfigured" apart from
        // "we just lost the send" — and they explicitly asked that EVERY
        // attempted/skipped email show up.
        await logSkippedOrFailedEmail({
          to: updatedSubmission.signer_email,
          subject: 'Registration packet completion (skipped)',
          text: 'Completion email was not sent because the platform email integration is not configured.',
          html: null,
          agencyId: link?.organization_id || link?.agency_id || null,
          clientId: updatedSubmission?.client_id || null,
          templateType: 'intake_packet_completion',
          deliveryStatus: 'skipped',
          errorMessage: 'send skipped — email_not_configured',
          metadata: { submissionId, reason: 'email_not_configured', flow: 'registration' }
        });
        await mirrorPacketCompletionRowToSiblings({
          to: updatedSubmission.signer_email,
          subject: 'Registration packet completion (skipped)',
          text: 'Completion email was not sent because the platform email integration is not configured.',
          html: null,
          templateType: 'intake_packet_completion',
          link,
          agencyId: link?.organization_id || link?.agency_id || null,
          primaryClientId: updatedSubmission?.client_id || null,
          siblingClientIds: (rawClients || []).map((c) => c?.id).filter(Boolean),
          submissionId,
          flowLabel: 'registration',
          outcome: { skipped: true, error: 'email_not_configured', errorMessage: 'send skipped — email_not_configured' }
        });
      } else if (!updatedSubmission.signer_email) {
        // Parents occasionally reported no email even with a single client —
        // trace exactly why so we can tell the difference between
        // "EmailService isn't configured" and "signer never gave us an email".
        console.warn('[publicIntake] registration completion email skipped — submission has no signer_email', {
          submissionId,
          hasSignerEmail: false,
          emailServiceConfigured: EmailService.isConfigured()
        });
        // Same Communications-tab breadcrumb story — if the family submitted
        // without leaving us an email address we still want a trace of it on
        // the client's record, attached via client_id only.
        await logSkippedOrFailedEmail({
          to: null,
          subject: 'Registration packet completion (skipped — no signer email)',
          text: 'Completion email was not sent because the submission did not include a signer email address.',
          html: null,
          agencyId: link?.organization_id || link?.agency_id || null,
          clientId: updatedSubmission?.client_id || null,
          templateType: 'intake_packet_completion',
          deliveryStatus: 'skipped',
          errorMessage: 'send skipped — no_signer_email',
          metadata: { submissionId, reason: 'no_signer_email', flow: 'registration' }
        });
        await mirrorPacketCompletionRowToSiblings({
          to: null,
          subject: 'Registration packet completion (skipped — no signer email)',
          text: 'Completion email was not sent because the submission did not include a signer email address.',
          html: null,
          templateType: 'intake_packet_completion',
          link,
          agencyId: link?.organization_id || link?.agency_id || null,
          primaryClientId: updatedSubmission?.client_id || null,
          siblingClientIds: (rawClients || []).map((c) => c?.id).filter(Boolean),
          submissionId,
          flowLabel: 'registration',
          outcome: { skipped: true, error: 'no_signer_email', errorMessage: 'send skipped — no_signer_email' }
        });
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
          intakeData,
          submission: updatedSubmission
        });
        await persistGuardianProfileForClient({
          clientId,
          payload: req.body || {},
          intakeData,
          submission: updatedSubmission,
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
    let submitRegistrationEnrollment = null;
    try {
      const enrollClientIds = rawClients
        .map((c) => Number(c?.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0);
      submitRegistrationEnrollment = await enrollSmartRegistrationSelections({
        link,
        intakeData,
        payload: req.body || {},
        submissionId,
        clientIds: enrollClientIds,
        guardianUserId: updatedSubmission?.guardian_user_id || null
      });
      // Surface per-child enrollment failures (mirror of the finalize log).
      if (Array.isArray(submitRegistrationEnrollment?.errors) && submitRegistrationEnrollment.errors.length) {
        console.error('[multi_child_registration] enrollment errors during submit', {
          submissionId,
          childIds: enrollClientIds,
          totalChildren: enrollClientIds.length,
          companyEventEnrollments: submitRegistrationEnrollment.companyEventEnrollments,
          classEnrollments: submitRegistrationEnrollment.classEnrollments,
          errors: submitRegistrationEnrollment.errors
        });
      }
    } catch (enrollErr) {
      console.error('[publicIntake] smart registration enrollment failed (submit)', {
        submissionId,
        message: enrollErr?.message || enrollErr
      });
    }

    // Notify staff/coordinators about any company-event registrations completed above.
    try {
      const enrolledEvents = Array.isArray(submitRegistrationEnrollment?.enrolledCompanyEvents)
        ? submitRegistrationEnrollment.enrolledCompanyEvents
        : [];
      if (enrolledEvents.length) {
        const labelByClientId = {};
        for (const c of rawClients) {
          const cid = Number(c?.id || 0);
          if (Number.isFinite(cid) && cid > 0) {
            labelByClientId[cid] = c?.fullName || c?.initials || `client #${cid}`;
          }
        }
        await Promise.all(
          enrolledEvents.map((entry) =>
            notifyCompanyEventRegistrationSubmitted({
              agencyId: entry.agencyId,
              eventId: entry.eventId,
              clientIds: entry.clientIds,
              clientLabels: labelByClientId,
              source: 'public_intake'
            }).catch(() => null)
          )
        );
      }
    } catch (notifyErr) {
      console.error('[publicIntake] company event registration notification failed (submit)', {
        submissionId,
        message: notifyErr?.message || notifyErr
      });
    }

    if (!link.create_client && signedDocs.length > 0) {
      await notifyUnassignedDocuments({
        link,
        submission: updatedSubmission,
        docCount: signedDocs.length
      });
    }

    const submitTotalMs = Date.now() - submitStartedAt;
    // Parents reported ~8 minute waits during registration finalize (see
    // Issue 5 in the registration fixes thread). Log total duration + step
    // breakdown whenever we exceed a generous threshold so the bottleneck is
    // obvious in production logs without spamming for fast runs.
    if (submitTotalMs > 30000 || submitTimings.some((t) => t.ms > 10000)) {
      console.warn('[publicIntake] submitPublicIntake slow finalize', {
        submissionId,
        totalMs: submitTotalMs,
        clientCount: Array.isArray(rawClients) ? rawClients.length : 0,
        templateCount: Array.isArray(packetDocumentTemplates) ? packetDocumentTemplates.length : 0,
        emailAttempted: !!emailDelivery?.attempted,
        emailSent: !!emailDelivery?.sent,
        timings: submitTimings
      });
    }

    res.json({
      success: true,
      submission: updatedSubmission,
      documents: signedDocs,
      downloadUrl,
      emailDelivery,
      clientBundles,
      registrationReturningAutoMatch: returningAutoMatchInitialsForEmailSubmit
        ? { matched: true, initials: returningAutoMatchInitialsForEmailSubmit }
        : null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /public-intake/registration-receipt/:submissionId?token=...
 * Read-only snapshot data for the guardian receipt page (token issued at finalize).
 */
export const getPublicRegistrationReceipt = async (req, res) => {
  try {
    const submissionId = Number(req.params.submissionId || 0) || null;
    const token = String(req.query.token || '').trim();
    if (!submissionId || !token) {
      return res.status(400).json({ error: { message: 'submissionId and token are required' } });
    }
    const sub = await IntakeSubmission.findById(submissionId);
    if (!sub?.registration_receipt_token || sub.registration_receipt_token !== token) {
      return res.status(404).json({ error: { message: 'Not found' } });
    }
    const link = await IntakeLink.findById(sub.intake_link_id);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Not found' } });
    }
    let intakeData = {};
    if (sub.intake_data) {
      if (typeof sub.intake_data === 'object') {
        intakeData = sub.intake_data;
      } else {
        try { intakeData = JSON.parse(sub.intake_data); } catch { intakeData = {}; }
      }
    }
    const eventPlaceholders = await loadRegistrationEventFieldPlaceholders(intakeData, link);
    const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink: null, boundClient: null });
    const fromAddress =
      process.env.GOOGLE_WORKSPACE_FROM_ADDRESS
      || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM
      || '';
    const subSnap = intakeData?.responses?.submission && typeof intakeData.responses.submission === 'object'
      ? intakeData.responses.submission
      : {};
    return res.json({
      submissionId,
      signerName: sub.signer_name || '',
      signerEmail: sub.signer_email || '',
      formTitle: link.title || '',
      organizationName: organization?.name || '',
      agencyName: agency?.name || '',
      fromAddress,
      event: eventPlaceholders,
      registrationSelections: intakeData?.responses?.submission?.registrationSelections || [],
      registrationReturningAutoMatch:
        subSnap.registration_returning_guardian_auto_match === true
        && String(subSnap.registration_returning_matched_initials || '').trim()
          ? { matched: true, initials: String(subSnap.registration_returning_matched_initials || '').trim() }
          : null
    });
  } catch (e) {
    return res.status(500).json({ error: { message: e?.message || 'Server error' } });
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
 * Resolve the tenant (agency_id) that owns this intake link.
 * Used by the Stripe/QB payment flow which runs BEFORE final intake submit,
 * before `link.agency_id` is always available (e.g. school-scoped links).
 */
const resolveAgencyIdForLink = async (link) => {
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
  return agencyId;
};

/**
 * Ensure a guardian `users` row exists for this in-progress submission so the
 * payment-collection step can attach a Stripe customer / QuickBooks profile
 * BEFORE the user has completed the final intake submit.
 *
 * Previously the payment step required `submission.guardian_user_id` (only
 * populated at final submit) or `User.findByEmail(signer_email)`. For brand
 * new families signing up for the first time, neither was true, so the user
 * always saw "Guardian account not yet established" — which was accurate but
 * a UX dead end.
 *
 * This helper is safe to call repeatedly; it is a no-op when the guardian
 * already exists. It also affiliates the guardian to the correct tenant
 * (user_agencies) so Guardians admin view can see them immediately.
 */
const ensureEarlyGuardianForPayment = async (submission, link, agencyId) => {
  if (!submission) return { guardianUserId: null, guardianEmail: null, guardianName: null };

  const intakeData = (() => {
    const raw = submission.intake_data;
    if (!raw) return {};
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
    return (raw && typeof raw === 'object') ? raw : {};
  })();

  const guardianBlock = (intakeData && typeof intakeData === 'object' && intakeData.guardian && typeof intakeData.guardian === 'object')
    ? intakeData.guardian
    : {};
  const email = String(
    guardianBlock.email
      || intakeData?.signerInfo?.email
      || submission.signer_email
      || ''
  ).trim().toLowerCase();

  // Existing guardian path
  let guardianUserId = Number(submission.guardian_user_id || 0) || null;
  let guardianName = null;
  if (!guardianUserId && email) {
    const userRow = await User.findByEmail(email);
    if (userRow?.id) {
      guardianUserId = userRow.id;
      guardianName = `${userRow.first_name || ''} ${userRow.last_name || ''}`.trim() || null;
    }
  }

  // Fall through: auto-provision when we have enough to identify them
  if (!guardianUserId && email) {
    const firstName = String(guardianBlock.firstName || submission.signer_name || '').split(/\s+/)[0]?.trim() || 'Guardian';
    const lastParts = String(guardianBlock.lastName || submission.signer_name || '').trim().split(/\s+/);
    const lastName = guardianBlock.lastName ? String(guardianBlock.lastName).trim() : (lastParts.length > 1 ? lastParts.slice(1).join(' ') : '');
    const phoneNumber = String(guardianBlock.phone || submission.signer_phone || '').trim() || null;
    try {
      const created = await User.create({
        email,
        passwordHash: null,
        firstName,
        lastName,
        phoneNumber,
        personalEmail: email,
        role: 'client_guardian',
        status: 'ACTIVE_EMPLOYEE'
      });
      guardianUserId = created?.id || null;
      guardianName = `${firstName} ${lastName}`.trim() || null;
    } catch (err) {
      console.warn('[publicIntake.payment] early guardian provisioning failed', {
        submissionId: submission.id,
        email,
        message: err?.message || err
      });
      // Race condition — someone just created this email. Re-read.
      const again = await User.findByEmail(email);
      guardianUserId = again?.id || null;
      guardianName = again ? `${again.first_name || ''} ${again.last_name || ''}`.trim() || null : null;
    }
  }

  if (guardianUserId) {
    // Persist the link so subsequent payment-card calls skip this provisioning.
    if (!submission.guardian_user_id) {
      try {
        await IntakeSubmission.updateById(submission.id, { guardian_user_id: guardianUserId });
      } catch (err) {
        console.warn('[publicIntake.payment] submission guardian link persist failed', {
          submissionId: submission.id,
          guardianUserId,
          message: err?.message || err
        });
      }
    }
    // Tenant scoping so Guardians admin sees them even if they abandon intake.
    if (agencyId) {
      try {
        await pool.execute(
          `INSERT INTO user_agencies (user_id, agency_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE user_id = user_id`,
          [guardianUserId, agencyId]
        );
      } catch (err) {
        console.warn('[publicIntake.payment] user_agencies affiliation failed', {
          guardianUserId,
          agencyId,
          message: err?.message || err
        });
      }
    }

    // Parent feedback: "it creates a guardian account, but maybe not until the
    // end… therefore it should be adding to the guardian's account info in
    // the process and then post to their profile when created." Persist
    // whatever guardian fields we have so far (signer name + email + phone,
    // plus any guardian-block data already typed) onto every client attached
    // to this submission. The Overview tab's "Guardian (latest intake)" card
    // then fills in as the user progresses, instead of only after final
    // submit. Runs best-effort so a profile write failure never blocks the
    // payment step.
    try {
      const subClients = await IntakeSubmissionClient.listBySubmissionId(submission.id);
      for (const sc of subClients || []) {
        const cidCandidate = Number(sc?.client_id || 0) || null;
        if (!cidCandidate) continue;
        try {
          await persistGuardianProfileForClient({
            clientId: cidCandidate,
            payload: {
              // Let extractGuardianProfileFromPayload pull from the signer_*
              // submission columns via the `submission` arg — no need to
              // synthesize a guardian object here.
            },
            intakeData,
            submission,
            source: 'payment_step_early_provision'
          });
        } catch (profileErr) {
          console.warn('[publicIntake.payment] mid-flow guardian profile persist failed', {
            submissionId: submission.id,
            clientId: cidCandidate,
            message: profileErr?.message || profileErr
          });
        }
      }

      // Keep the users row in sync with whatever guardian info we've now
      // seen. For the first-time-payment race the phone and last name may
      // have been blank when the user was created; fill them in lazily.
      try {
        // Only overwrite fields that are currently blank on the users row so
        // we never clobber data a guardian typed directly into their account
        // after the fact. We write via raw SQL (instead of User.update) to
        // avoid the role-change / audit plumbing in the model layer — this
        // is a passive data sync, not an admin mutation.
        const phoneNumber = String(guardianBlock?.phone || submission.signer_phone || '').trim() || null;
        const nameParts = guardianName ? guardianName.split(/\s+/) : [];
        const firstCandidate = nameParts[0] || null;
        const lastCandidate = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
        if (phoneNumber || firstCandidate || lastCandidate) {
          await pool.execute(
            `UPDATE users
             SET
               phone_number = COALESCE(NULLIF(TRIM(phone_number), ''), ?),
               first_name  = COALESCE(NULLIF(TRIM(first_name), ''),  ?),
               last_name   = COALESCE(NULLIF(TRIM(last_name), ''),   ?)
             WHERE id = ?`,
            [phoneNumber, firstCandidate, lastCandidate, guardianUserId]
          );
        }
      } catch (userSyncErr) {
        console.warn('[publicIntake.payment] user row sync skipped', {
          guardianUserId,
          message: userSyncErr?.message || userSyncErr
        });
      }
    } catch (listErr) {
      console.warn('[publicIntake.payment] mid-flow profile sync — submission clients lookup failed', {
        submissionId: submission.id,
        message: listErr?.message || listErr
      });
    }
  }

  return { guardianUserId, guardianEmail: email || null, guardianName };
};

/**
 * GET /:publicKey/stripe-config
 * Returns the Stripe publishable key + connected account ID so the frontend
 * can initialize Stripe.js scoped to the agency's own Stripe account.
 * Safe to expose — publishable keys and account IDs are client-side values.
 */
export const getStripeConfig = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link?.is_active) return res.status(404).json({ error: { message: 'Intake link not found' } });

    const publishableKey = getStripePublishableKey();
    if (!publishableKey) {
      return res.json({ stripeEnabled: false, publishableKey: null, connectedAccountId: null });
    }

    // Resolve the agency for this intake link
    let agencyId = Number(link?.agency_id || 0) || null;
    if (!agencyId && link?.organization_id) {
      const scope = String(link?.scope_type || '').toLowerCase();
      if (scope === 'school') agencyId = await AgencySchool.getActiveAgencyIdForSchool(link.organization_id);
      if (!agencyId) agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(link.organization_id);
      if (!agencyId) agencyId = Number(link.organization_id || 0) || null;
    }

    const connectedAccountId = agencyId ? await getAgencyStripeConnectAccountId(agencyId) : null;

    res.json({
      stripeEnabled: !!connectedAccountId,
      publishableKey,
      connectedAccountId
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:publicKey/:submissionId/stripe-setup-intent
 * Creates a Stripe SetupIntent so the frontend can securely collect card details
 * via Stripe Elements. No raw card data ever touches our server.
 */
export const createStripeSetupIntent = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    if (!submissionId) return res.status(400).json({ error: { message: 'submissionId is required' } });

    const { link } = await resolvePublicIntakeContext(publicKey);
    if (!link?.is_active) return res.status(404).json({ error: { message: 'Intake link not found' } });

    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    const agencyId = await resolveAgencyIdForLink(link);

    // Auto-provision the guardian if the final submit hasn't happened yet so
    // the payment step isn't a dead end for first-time families.
    const { guardianUserId, guardianEmail, guardianName } = await ensureEarlyGuardianForPayment(
      submission,
      link,
      agencyId
    );
    if (!guardianUserId) {
      return res.status(400).json({
        error: { message: 'We need your email from the earlier steps to prepare a secure payment form. Please go back and enter your email, then try again.' }
      });
    }

    const connectedAccountId = await getAgencyStripeConnectAccountId(agencyId);
    if (!connectedAccountId) {
      return res.status(400).json({
        error: { message: 'This agency has not connected their Stripe account yet. Contact the organization to complete payment setup.' }
      });
    }

    const customer = await StripePaymentsService.ensureCustomer({
      guardianUserId,
      agencyId,
      email: guardianEmail,
      name: guardianName,
      connectedAccountId
    });

    const setupIntent = await StripePaymentsService.createSetupIntent({
      customerId: customer.id,
      connectedAccountId
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
      connectedAccountId
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:publicKey/:submissionId/payment-card
 * Attach a confirmed Stripe PaymentMethod (or fall back to QuickBooks Payments).
 *
 * Stripe flow (preferred):
 *   Frontend sends { stripePaymentMethodId, stripeCustomerId, autoCharge }
 *   — raw card numbers never reach this server.
 *
 * QB Payments fallback (legacy):
 *   Frontend sends { card: { number, expMonth, expYear, cvc }, autoCharge }
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

    const agencyId = await resolveAgencyIdForLink(link);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'No agency associated with this intake link' } });
    }

    // Mirrors the setup-intent flow — payment can be captured before the final
    // intake submit, so provision the guardian account just-in-time here too.
    const { guardianUserId } = await ensureEarlyGuardianForPayment(
      submission,
      link,
      agencyId
    );
    if (!guardianUserId) {
      return res.status(400).json({
        error: { message: 'We need your email from the earlier steps to save your payment method. Please go back and enter your email, then try again.' }
      });
    }

    const autoCharge = req.body?.autoCharge === true || req.body?.autoCharge === 'true';
    const stripePaymentMethodId = String(req.body?.stripePaymentMethodId || '').trim() || null;
    const stripeCustomerId = String(req.body?.stripeCustomerId || '').trim() || null;

    // ── Stripe path ────────────────────────────────────────────────────────────
    if (stripePaymentMethodId && stripeCustomerId) {
      const connectedAccountId = await getAgencyStripeConnectAccountId(agencyId);
      let pm;
      try {
        pm = await StripePaymentsService.attachPaymentMethod({
          customerId: stripeCustomerId,
          paymentMethodId: stripePaymentMethodId,
          connectedAccountId
        });
      } catch (stripeErr) {
        const msg = stripeErr?.message || 'Card could not be saved';
        return res.status(422).json({ error: { message: `Card declined or invalid: ${msg}` } });
      }

      const cardDetails = pm.card || {};
      const last4 = String(cardDetails.last4 || '');
      const brand = String(cardDetails.brand || 'Card');
      const expMonth = cardDetails.exp_month ? String(cardDetails.exp_month).padStart(2, '0') : null;
      const expYear = cardDetails.exp_year ? String(cardDetails.exp_year) : null;

      await GuardianPaymentCard.create({
        guardianUserId,
        agencyId,
        paymentProvider: 'STRIPE',
        stripeCustomerId,
        stripePaymentMethodId: stripePaymentMethodId,
        qbPaymentCustomerId: null,
        qbCardId: null,
        cardBrand: brand,
        cardLast4: last4,
        cardExpMonth: expMonth,
        cardExpYear: expYear,
        cardholderName: pm.billing_details?.name || null,
        autoCharge,
        isDefault: true,
        intakeSubmissionId: submissionId
      });

      return res.json({ success: true, last4, brand, stripePaymentMethodId, autoCharge });
    }

    // ── QuickBooks Payments fallback ───────────────────────────────────────────
    const cardPayload = req.body?.card;
    if (!cardPayload?.number || !cardPayload?.expMonth || !cardPayload?.expYear || !cardPayload?.cvc) {
      return res.status(400).json({ error: { message: 'Complete card details are required' } });
    }

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

    await GuardianPaymentCard.create({
      guardianUserId,
      agencyId,
      paymentProvider: 'QUICKBOOKS_PAYMENTS',
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
