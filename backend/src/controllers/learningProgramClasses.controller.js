import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import StorageService from '../services/storage.service.js';
import IntakeLink from '../models/IntakeLink.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import ChallengeParticipantProfile from '../models/ChallengeParticipantProfile.model.js';
import ChallengeSeasonParticipationAcceptance from '../models/ChallengeSeasonParticipationAcceptance.model.js';
import { canUserManageClub, getUserClubMembership, canUserManageChallengeClass } from '../utils/sscClubAccess.js';
import {
  buildParticipationAgreementHash,
  hasParticipationAgreement,
  normalizeParticipationAgreement
} from '../utils/seasonParticipationAgreement.js';
import { resolveScopedAgencyIdsForMyDashboard } from '../utils/meDashboardTenantScope.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const asBool = (v, fallback = false) => {
  if (v === undefined || v === null) return fallback;
  if (v === true || v === 1 || v === '1') return true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'on';
};

const asNonEmptyString = (v, fallback = null) => {
  const s = String(v || '').trim();
  return s ? s : fallback;
};

const toWeekday = (v, fallback = 'monday') => {
  const raw = String(v || '').trim().toLowerCase();
  const allowed = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
  return allowed.has(raw) ? raw : fallback;
};

const toTimeHHMM = (v, fallback = '23:59') => {
  const raw = String(v || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = Math.max(0, Math.min(23, Number.parseInt(m[1], 10) || 0));
  const mm = Math.max(0, Math.min(59, Number.parseInt(m[2], 10) || 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

/**
 * Normalize recognition_categories_json to the rich-object array format.
 * Accepts:
 *   - null / undefined / empty → returns null
 *   - Old string array: ["fastest_male", "fastest_female", ...]
 *   - New object array: [{ id, type, label, active, ... }, ...]
 *   - JSON string of either of the above
 */
const LEGACY_CATEGORY_MAP = {
  fastest_male: { id: 'std_male', type: 'standard', label: 'Fastest Male', active: true, genderFilter: 'male', period: 'weekly', metric: 'points', aggregation: 'most' },
  fastest_female: { id: 'std_female', type: 'standard', label: 'Fastest Female', active: true, genderFilter: 'female', period: 'weekly', metric: 'points', aggregation: 'most' },
  fastest_masters_male: { id: 'std_masters_male', type: 'masters', label: 'Masters Male', active: true, genderFilter: 'male', ageOperator: 'gte', ageThreshold: 53, period: 'weekly', metric: 'points', aggregation: 'most' },
  fastest_masters_female: { id: 'std_masters_female', type: 'masters', label: 'Masters Female', active: true, genderFilter: 'female', ageOperator: 'gte', ageThreshold: 53, period: 'weekly', metric: 'points', aggregation: 'most' }
};

export function normalizeRecognitionCategories(raw) {
  let arr;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return null; }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.map((item) => {
    if (typeof item === 'string') {
      return LEGACY_CATEGORY_MAP[item] ? { ...LEGACY_CATEGORY_MAP[item] } : {
        id: `legacy_${item}`,
        type: 'custom',
        label: item,
        active: true,
        period: 'weekly',
        metric: 'points',
        aggregation: 'most',
        criteria: [],
        genderVariants: []
      };
    }
    if (typeof item === 'object' && item !== null) {
      const type = item.type || 'custom';
      // Config/group entries are passed through as-is so the winner computation can read them
      if (type === 'cfg_masters' || type === 'cfg_heavyweight' || type === '__activity_types__' || type === 'group') {
        return { ...item };
      }
      return {
        id: item.id || `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        label: item.label || '',
        icon: item.icon || null,
        active: item.active !== false,
        genderFilter: item.genderFilter || null,
        ageOperator: item.ageOperator || 'gte',
        ageThreshold: item.ageThreshold != null ? Number(item.ageThreshold) : undefined,
        weightOperator: item.weightOperator || 'gte',
        weightThresholdLbs: item.weightThresholdLbs != null ? Number(item.weightThresholdLbs) : undefined,
        criteria: Array.isArray(item.criteria) ? item.criteria : undefined,
        genderVariants: Array.isArray(item.genderVariants) ? item.genderVariants : undefined,
        period: item.period || 'weekly',
        metric: item.metric || 'points',
        aggregation: item.aggregation || 'most',
        milestoneThreshold: (() => {
          const agg = item.aggregation || 'most';
          if (agg !== 'milestone') return undefined;
          const raw = item.milestoneThreshold;
          if (raw == null || raw === '') return undefined;
          const n = Number(raw);
          return Number.isFinite(n) ? n : undefined;
        })(),
        referenceTarget: (() => {
          const agg = item.aggregation || 'most';
          if (agg === 'milestone') return undefined;
          const raw = item.referenceTarget;
          if (raw == null || raw === '') return undefined;
          const n = Number(raw);
          return Number.isFinite(n) && n >= 0 ? n : undefined;
        })(),
        activityType: item.activityType || '',
        groupFilter: item.groupFilter || ''
      };
    }
    return null;
  }).filter(Boolean);
};

const toTimeZone = (v, fallback = 'UTC') => {
  const zone = String(v || '').trim();
  if (!zone) return fallback;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return fallback;
  }
};

const normalizeSeasonSettings = (input = {}) => {
  const src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const numOr = (v, fallback) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const floatOr = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const parseList = (v) => {
    if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
    if (typeof v === 'string') {
      return v.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return [];
  };
  const parseTextList = (v) => {
    if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
    if (typeof v === 'string') {
      return v
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  };
  const schedule = src.schedule && typeof src.schedule === 'object' ? src.schedule : {};
  const divisions = src.divisions && typeof src.divisions === 'object' ? src.divisions : {};
  const scoring = src.scoring && typeof src.scoring === 'object' ? src.scoring : {};
  const publish = src.challengePublish && typeof src.challengePublish === 'object' ? src.challengePublish : {};
  const recognition = src.recognition && typeof src.recognition === 'object' ? src.recognition : {};
  const event = src.event && typeof src.event === 'object' ? src.event : {};
  const teams = src.teams && typeof src.teams === 'object' ? src.teams : {};
  const participation = src.participation && typeof src.participation === 'object' ? src.participation : {};
  const byeWeek = src.byeWeek && typeof src.byeWeek === 'object' ? src.byeWeek : {};
  const treadmill = src.treadmill && typeof src.treadmill === 'object' ? src.treadmill : {};
  const treadmillpocalypse = src.treadmillpocalypse && typeof src.treadmillpocalypse === 'object' ? src.treadmillpocalypse : {};
  const workoutModeration = src.workoutModeration && typeof src.workoutModeration === 'object' ? src.workoutModeration : {};
  const records = src.records && typeof src.records === 'object' ? src.records : {};
  const postseason = src.postseason && typeof src.postseason === 'object' ? src.postseason : {};
  const billing = src.billing && typeof src.billing === 'object' ? src.billing : {};
  const participationAgreement = src.participationAgreement && typeof src.participationAgreement === 'object'
    ? src.participationAgreement
    : (src.communityGuidelines && typeof src.communityGuidelines === 'object' ? src.communityGuidelines : {});
  const toModerationMode = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'all' || s === 'treadmill_only' || s === 'none') return s;
    return 'treadmill_only';
  };
  const toPostseasonMatchupMode = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s === '1v4_2v3' || s === 'seeded_bracket') return s;
    return '1v4_2v3';
  };
  const regularSeasonWeeks = Math.max(1, numOr(postseason.regularSeasonWeeks, 10));
  const hasBreakWeek = asBool(postseason.hasBreakWeek, false);
  const breakWeekNumber = hasBreakWeek ? Math.max(1, numOr(postseason.breakWeekNumber, regularSeasonWeeks + 1)) : null;
  const playoffWeekNumber = Math.max(1, numOr(postseason.playoffWeekNumber, regularSeasonWeeks + (hasBreakWeek ? 2 : 1)));
  const championshipWeekNumber = Math.max(playoffWeekNumber + 1, numOr(postseason.championshipWeekNumber, playoffWeekNumber + 1));
  const toChargeTarget = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'club') return 'club';
    return 'member';
  };
  const toCurrency = (v) => {
    const s = String(v || '').trim().toLowerCase();
    return /^[a-z]{3}$/.test(s) ? s : 'usd';
  };
  const memberChargeAmountCents = Math.max(0, numOr(billing.memberChargeAmountCents, 0));
  const enabled = asBool(billing.enabled, false) && memberChargeAmountCents > 0;
  return {
    event: {
      category: (String(event.category || '').toLowerCase() === 'fitness') ? 'fitness' : 'run_ruck',
      challengeAssignmentMode: asNonEmptyString(event.challengeAssignmentMode, 'volunteer_or_elect')
    },
    schedule: {
      weeklyCadence: asNonEmptyString(schedule.weeklyCadence, 'weekly'),
      weekStartsOn: toWeekday(schedule.weekStartsOn, 'monday'),
      weekEndsSundayAt: toTimeHHMM(schedule.weekEndsSundayAt, '23:59'),
      weekTimeZone: toTimeZone(schedule.weekTimeZone, 'UTC'),
      teamDraftEnabled: asBool(schedule.teamDraftEnabled, true),
      captainApplicationsCloseHoursBeforeDraft: Math.max(0, numOr(schedule.captainApplicationsCloseHoursBeforeDraft, 24))
    },
    divisions: {
      mastersAgeThreshold: Math.max(40, numOr(divisions.mastersAgeThreshold, 53)),
      ladiesEnabled: asBool(divisions.ladiesEnabled, true),
      requireGlobalProfileFields: asBool(divisions.requireGlobalProfileFields, true)
    },
    scoring: {
      weeklyMinimumPointsPerAthlete: Math.max(0, numOr(scoring.weeklyMinimumPointsPerAthlete, numOr(scoring.individualMinPointsPerWeek, 0))),
      teamWeeklyTargetPoints: Math.max(0, numOr(scoring.teamWeeklyTargetPoints, numOr(scoring.teamMinPointsPerWeek, 0))),
      runMilesPerPoint: Math.max(0.1, floatOr(scoring.runMilesPerPoint, 1)),
      ruckMilesPerPoint: Math.max(0.1, floatOr(scoring.ruckMilesPerPoint, 1)),
      caloriesPerPoint: Math.max(1, numOr(scoring.caloriesPerPoint, 100)),
      activityWeights: {
        run: Math.max(0, floatOr(scoring?.activityWeights?.run, 1)),
        ride: Math.max(0, floatOr(scoring?.activityWeights?.ride, 1)),
        workout: Math.max(0, floatOr(scoring?.activityWeights?.workout, 1)),
        walk: Math.max(0, floatOr(scoring?.activityWeights?.walk, 1))
      }
    },
    teams: {
      teamCount: Math.max(1, numOr(teams.teamCount, 2)),
      presetTeamNames: parseList(teams.presetTeamNames),
      allowCaptainRenameTeam: asBool(teams.allowCaptainRenameTeam, true),
      allowCaptainNicknameSuffixWhenLocked: asBool(teams.allowCaptainNicknameSuffixWhenLocked, false)
    },
    participation: {
      weeklyGoalMembersPerTeam: Math.max(1, numOr(participation.weeklyGoalMembersPerTeam, 10)),
      weeklyGoalMetric: ['miles', 'points', 'minutes', 'activities'].includes(String(participation.weeklyGoalMetric || '')) ? participation.weeklyGoalMetric : 'miles',
      individualMinPointsPerWeek: Math.max(0, numOr(participation.individualMinPointsPerWeek, numOr(scoring.weeklyMinimumPointsPerAthlete, 0))),
      teamMinPointsPerWeek: Math.max(0, numOr(participation.teamMinPointsPerWeek, numOr(scoring.teamWeeklyTargetPoints, 0))),
      runRuckStartMilesPerPerson: Math.max(0, floatOr(participation.runRuckStartMilesPerPerson, 0)),
      runRuckWeeklyIncreaseMilesPerPerson: Math.max(0, floatOr(participation.runRuckWeeklyIncreaseMilesPerPerson, 2)),
      baselineMemberCount: Math.max(0, numOr(participation.baselineMemberCount, 0)),
      maxRucksPerWeek: Math.max(0, numOr(participation.maxRucksPerWeek, 0))
    },
    participationAgreement: {
      label: asNonEmptyString(participationAgreement.label, ''),
      introText: asNonEmptyString(participationAgreement.introText ?? participationAgreement.introduction ?? participationAgreement.description, ''),
      items: parseTextList(participationAgreement.items)
    },
    byeWeek: {
      allowByeWeek: asBool(byeWeek.allowByeWeek, false),
      maxByeWeeksPerParticipant: Math.max(0, numOr(byeWeek.maxByeWeeksPerParticipant, 1)),
      requireAdvanceDeclaration: asBool(byeWeek.requireAdvanceDeclaration, true)
    },
    treadmill: {
      photoProofRequired: asBool(treadmill.photoProofRequired, true)
    },
    treadmillpocalypse: {
      enabled: asBool(treadmillpocalypse.enabled, false),
      startsAtWeek: asNonEmptyString(treadmillpocalypse.startsAtWeek, null),
      icon: asNonEmptyString(treadmillpocalypse.icon, null)
    },
    workoutModeration: {
      mode: toModerationMode(workoutModeration.mode)
    },
    records: {
      metrics: parseList(records.metrics)
    },
    postseason: {
      enabled: asBool(postseason.enabled, false),
      regularSeasonWeeks,
      hasBreakWeek,
      breakWeekNumber,
      playoffWeekNumber,
      championshipWeekNumber,
      playoffSeedCount: Math.max(2, numOr(postseason.playoffSeedCount, 4)),
      playoffMatchupMode: toPostseasonMatchupMode(postseason.playoffMatchupMode)
    },
    billing: {
      enabled,
      chargeTarget: toChargeTarget(billing.chargeTarget),
      memberChargeAmountCents,
      currency: toCurrency(billing.currency),
      stripePriceId: asNonEmptyString(billing.stripePriceId, null),
      stripeProductId: asNonEmptyString(billing.stripeProductId, null),
      mode: 'per_season',
      status: enabled ? 'configured' : 'draft_disabled'
    },
    challengePublish: {
      aiDraftEnabled: asBool(publish.aiDraftEnabled, true),
      requiresManagerPublish: asBool(publish.requiresManagerPublish, true),
      tasksPerWeek: Math.min(7, Math.max(1, numOr(publish.tasksPerWeek, 3))),
      publishLeadHours: Math.max(0, numOr(publish.publishLeadHours, 24))
    },
    recognition: {
      weeklyTopAthletesCount: Math.max(1, numOr(recognition.weeklyTopAthletesCount, 5)),
      weeklyTopTeamsCount: Math.max(1, numOr(recognition.weeklyTopTeamsCount, 3)),
      seasonTopIndividualsCount: Math.max(1, numOr(recognition.seasonTopIndividualsCount, 5)),
      seasonTopMastersCount: Math.max(1, numOr(recognition.seasonTopMastersCount, 3)),
      seasonTopLadiesCount: Math.max(1, numOr(recognition.seasonTopLadiesCount, 3)),
      additionalMetrics: parseList(recognition.additionalMetrics)
    }
  };
};

// Roles that can manage challenges/classes. provider_plus = Team Manager / Team Lead (Summit Stats Team Challenge).
const canManageRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

const isSubCoordinator = (userLike) => {
  return (
    userLike?.has_skill_builder_coordinator_access === true ||
    userLike?.has_skill_builder_coordinator_access === 1 ||
    userLike?.has_skill_builder_coordinator_access === '1'
  );
};

const getUserAgencyContext = async (userId) => {
  const memberships = await User.getAgencies(userId);
  const allOrgIds = (memberships || []).map((m) => Number(m?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
  const agencyIds = (memberships || [])
    .filter((m) => String(m?.organization_type || '').toLowerCase() === 'agency')
    .map((m) => Number(m?.id || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { allOrgIds, agencyIds };
};

// Summit Stats Team Challenge: Challenges can live under 'learning' or 'affiliation' orgs (program divisions).
const ensureLearningOrganization = async (organizationId) => {
  const orgId = asInt(organizationId);
  if (!orgId) return { ok: false, status: 400, message: 'organizationId is required' };
  const [rows] = await pool.execute(
    `SELECT id, name, slug, organization_type
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [orgId]
  );
  const org = rows?.[0] || null;
  if (!org) return { ok: false, status: 404, message: 'Organization not found' };
  const orgType = String(org.organization_type || '').toLowerCase();
  // Program orgs host therapy-style "enrollments" (learning_program_classes) without being learning-type tenants.
  if (orgType !== 'learning' && orgType !== 'affiliation' && orgType !== 'program') {
    return {
      ok: false,
      status: 400,
      message: 'organizationId must be a program, learning, or affiliation organization'
    };
  }
  return { ok: true, organization: org };
};

const canAccessOrganization = async ({ user, organizationId }) => {
  if (String(user?.role || '').toLowerCase() === 'super_admin') return true;
  const ctx = await getUserAgencyContext(user.id);
  if (ctx.allOrgIds.includes(Number(organizationId))) return true;
  const affAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(organizationId);
  return !!affAgencyId && ctx.agencyIds.includes(Number(affAgencyId));
};

// Summit Stats Team Challenge: Agency-level management is super_admin only. Admins manage affiliations only.
const canManageAtOrganization = async ({ user, organizationId }) => {
  const orgId = asInt(organizationId);
  if (!orgId) return false;
  if (String(user?.role || '').toLowerCase() === 'super_admin') return true;
  const [rows] = await pool.execute(
    `SELECT organization_type FROM agencies WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const orgType = String(rows?.[0]?.organization_type || '').toLowerCase();
  if (orgType === 'agency') return false;
  if (orgType === 'affiliation') return canUserManageClub({ user, clubId: orgId });
  return canManageRole(user?.role) || isSubCoordinator(user);
};

const ensureClassLifecycleStatus = async (klass) => {
  // Season lifecycle is manager-controlled. We do not auto-close seasons
  // when the configured end date passes.
  return klass || null;
};

const withSeasonSettingsDefaults = (klass) => {
  if (!klass) return klass;
  return {
    ...klass,
    season_settings_json: normalizeSeasonSettings(klass.season_settings_json || {})
  };
};

const getClassParticipationAgreement = (klass) => {
  const settings = normalizeSeasonSettings(klass?.season_settings_json || {});
  return normalizeParticipationAgreement(settings.participationAgreement || {});
};

const getRequestIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.connection?.remoteAddress || null;
};

const isActiveProviderMembership = async ({ classId, userId }) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM learning_class_provider_memberships
     WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
     LIMIT 1`,
    [classId, userId]
  );
  return !!rows?.length;
};

const buildParticipationAgreementStatus = async ({ klass, providerUserId }) => {
  const agreement = getClassParticipationAgreement(klass);
  const requiresAcceptance = hasParticipationAgreement(agreement);
  if (!requiresAcceptance) {
    return {
      requiresAcceptance: false,
      accepted: true,
      acceptedAt: null,
      signatureName: null,
      agreementHash: null,
      agreement
    };
  }
  const accepted = await ChallengeSeasonParticipationAcceptance.findCurrent({
    classId: klass.id,
    providerUserId,
    agreement
  });
  return {
    requiresAcceptance: true,
    accepted: !!accepted,
    acceptedAt: accepted?.accepted_at || null,
    signatureName: accepted?.signature_name || null,
    agreementHash: buildParticipationAgreementHash(agreement),
    agreement
  };
};

const attachParticipationAgreementStatusToMembers = async ({ klass, providerMembers }) => {
  const agreement = getClassParticipationAgreement(klass);
  const requiresAcceptance = hasParticipationAgreement(agreement);
  const members = Array.isArray(providerMembers) ? providerMembers : [];
  if (!requiresAcceptance || !members.length) {
    return members.map((member) => ({
      ...member,
      participation_agreement_required: requiresAcceptance,
      participation_agreement_accepted: !requiresAcceptance,
      participation_agreement_accepted_at: null,
      participation_agreement_signature_name: null
    }));
  }
  const statusByUser = await ChallengeSeasonParticipationAcceptance.listCurrentStatusForMembers({
    classId: klass.id,
    providerUserIds: members.map((member) => member.provider_user_id),
    agreement
  });
  return members.map((member) => {
    const status = statusByUser.get(Number(member.provider_user_id)) || null;
    return {
      ...member,
      participation_agreement_required: true,
      participation_agreement_accepted: !!status,
      participation_agreement_accepted_at: status?.acceptedAt || null,
      participation_agreement_signature_name: status?.signatureName || null
    };
  });
};

export const listLearningProgramClasses = async (req, res, next) => {
  try {
    const organizationId = asInt(req.query.organizationId);
    if (!organizationId) return res.status(400).json({ error: { message: 'organizationId is required' } });
    const orgCheck = await ensureLearningOrganization(organizationId);
    if (!orgCheck.ok) return res.status(orgCheck.status).json({ error: { message: orgCheck.message } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this learning program' } });

    const includeArchived = asBool(req.query.includeArchived, false);
    const classes = await LearningProgramClass.listByOrganization({ organizationId, includeArchived });
    const out = [];
    for (const row of classes || []) out.push(withSeasonSettingsDefaults(await ensureClassLifecycleStatus(row)));
    return res.json({ organizationId, classes: out });
  } catch (e) {
    next(e);
  }
};

export const discoverLearningProgramClasses = async (req, res, next) => {
  try {
    const organizationId = asInt(req.query.organizationId);
    if (!organizationId) return res.status(400).json({ error: { message: 'organizationId is required' } });
    const orgCheck = await ensureLearningOrganization(organizationId);
    if (!orgCheck.ok) return res.status(orgCheck.status).json({ error: { message: orgCheck.message } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this learning program' } });

    const classes = await LearningProgramClass.listByOrganization({ organizationId, includeArchived: false });
    const [membershipRows] = await pool.execute(
      `SELECT learning_class_id, membership_status
       FROM learning_class_provider_memberships
       WHERE provider_user_id = ?`,
      [req.user.id]
    );
    const membershipByClass = new Map((membershipRows || []).map((r) => [Number(r.learning_class_id), String(r.membership_status || '').toLowerCase()]));
    const seasons = [];
    for (const c of classes || []) {
      const s = withSeasonSettingsDefaults(await ensureClassLifecycleStatus(c));
      const status = String(s?.status || '').toLowerCase();
      if (status !== 'active' && status !== 'draft') continue;
      const membershipStatus = membershipByClass.get(Number(s.id)) || null;
      const joined = membershipStatus === 'active' || membershipStatus === 'completed';
      seasons.push({
        ...s,
        joined,
        membership_status: membershipStatus
      });
    }
    return res.json({ organizationId, seasons });
  } catch (e) {
    next(e);
  }
};

export const getLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    let klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    klass = withSeasonSettingsDefaults(await ensureClassLifecycleStatus(klass));
    const [intakeRows] = await pool.execute(
      `SELECT * FROM intake_links
       WHERE scope_type = 'learning_class' AND learning_class_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [classId]
    );
    const intakeLinks = (intakeRows || []).map((r) => IntakeLink.normalize(r));
    const resources = await LearningProgramClass.listResources(classId);
    const clientMembers = await LearningProgramClass.listClientMembers(classId);
    const providerMembers = await attachParticipationAgreementStatusToMembers({
      klass,
      providerMembers: await LearningProgramClass.listProviderMembers(classId)
    });
    const participationAgreementStatus = await buildParticipationAgreementStatus({
      klass,
      providerUserId: req.user.id
    });
    const canManage = await canUserManageChallengeClass({ user: req.user, learningClassId: classId });
    return res.json({ class: { ...klass, can_manage: canManage }, intakeLinks, resources, clientMembers, providerMembers, participationAgreementStatus });
  } catch (e) {
    next(e);
  }
};

export const createLearningProgramClass = async (req, res, next) => {
  try {
    const organizationId = asInt(req.body.organizationId);
    const className = String(req.body.className || '').trim();
    if (!organizationId || !className) {
      return res.status(400).json({ error: { message: 'organizationId and className are required' } });
    }
    const orgCheck = await ensureLearningOrganization(organizationId);
    if (!orgCheck.ok) return res.status(orgCheck.status).json({ error: { message: orgCheck.message } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this learning program' } });
    const klass = await LearningProgramClass.create({
      organizationId,
      className,
      classCode: req.body.classCode ? String(req.body.classCode).trim() : null,
      description: req.body.description ? String(req.body.description) : null,
      timezone: req.body.timezone ? String(req.body.timezone) : 'America/New_York',
      startsAt: req.body.startsAt || null,
      endsAt: req.body.endsAt || null,
      enrollmentOpensAt: req.body.enrollmentOpensAt || null,
      enrollmentClosesAt: req.body.enrollmentClosesAt || null,
      status: req.body.status || 'draft',
      isActive: asBool(req.body.isActive, true),
      allowLateJoin: asBool(req.body.allowLateJoin, false),
      maxClients: asInt(req.body.maxClients),
      metadataJson: req.body.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null,
      activityTypesJson: req.body.activityTypesJson && typeof req.body.activityTypesJson === 'object' ? req.body.activityTypesJson : (Array.isArray(req.body.activityTypesJson) ? req.body.activityTypesJson : null),
      scoringRulesJson: req.body.scoringRulesJson && typeof req.body.scoringRulesJson === 'object' ? req.body.scoringRulesJson : null,
      weeklyGoalMinimum: req.body.weeklyGoalMinimum != null ? asInt(req.body.weeklyGoalMinimum) : null,
      teamMinPointsPerWeek: req.body.teamMinPointsPerWeek != null ? asInt(req.body.teamMinPointsPerWeek) : null,
      individualMinPointsPerWeek: req.body.individualMinPointsPerWeek != null ? asInt(req.body.individualMinPointsPerWeek) : null,
      weekStartTime: req.body.weekStartTime || null,
      mastersAgeThreshold: req.body.mastersAgeThreshold != null ? asInt(req.body.mastersAgeThreshold) : 53,
      recognitionCategoriesJson: normalizeRecognitionCategories(req.body.recognitionCategoriesJson),
      recognitionMetric: req.body.recognitionMetric || 'points',
      captainApplicationOpen: asBool(req.body.captainApplicationOpen ?? req.body.captain_application_open, true),
      captainsFinalized: asBool(req.body.captainsFinalized ?? req.body.captains_finalized, false),
      seasonSplashEnabled: asBool(req.body.seasonSplashEnabled ?? req.body.season_splash_enabled, true),
      seasonAnnouncementText: req.body.seasonAnnouncementText !== undefined
        ? (req.body.seasonAnnouncementText ? String(req.body.seasonAnnouncementText) : null)
        : (req.body.season_announcement_text ? String(req.body.season_announcement_text) : null),
      seasonSettingsJson: normalizeSeasonSettings(
        req.body.seasonSettingsJson && typeof req.body.seasonSettingsJson === 'object'
          ? req.body.seasonSettingsJson
          : (req.body.season_settings_json && typeof req.body.season_settings_json === 'object' ? req.body.season_settings_json : {})
      ),
      deliveryMode: String(req.body.deliveryMode || req.body.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group',
      registrationEligible: asBool(req.body.registrationEligible ?? req.body.registration_eligible, false),
      medicaidEligible: asBool(req.body.medicaidEligible ?? req.body.medicaid_eligible, false),
      cashEligible: asBool(req.body.cashEligible ?? req.body.cash_eligible, false),
      createdByUserId: req.user.id
    });
    // Auto-enroll the creating club manager as an active season participant so they
    // can immediately log workouts without a separate join step.
    try {
      await LearningProgramClass.addProviderMember({
        classId: klass.id,
        providerUserId: req.user.id,
        membershipStatus: 'active',
        actorUserId: req.user.id
      });
    } catch {
      // Non-fatal: if already a member (ON DUPLICATE KEY) this is harmless.
    }
    return res.status(201).json({ class: withSeasonSettingsDefaults(klass) });
  } catch (e) {
    next(e);
  }
};

export const updateLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const current = await LearningProgramClass.findById(classId);
    if (!current) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: current.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: current.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });

    const patch = {
      className: req.body.className !== undefined ? String(req.body.className || '').trim() : undefined,
      classCode: req.body.classCode !== undefined ? (req.body.classCode ? String(req.body.classCode).trim() : null) : undefined,
      description: req.body.description !== undefined ? (req.body.description ? String(req.body.description) : null) : undefined,
      timezone: req.body.timezone !== undefined ? String(req.body.timezone || '').trim() : undefined,
      startsAt: req.body.startsAt !== undefined ? req.body.startsAt || null : undefined,
      endsAt: req.body.endsAt !== undefined ? req.body.endsAt || null : undefined,
      enrollmentOpensAt: req.body.enrollmentOpensAt !== undefined ? req.body.enrollmentOpensAt || null : undefined,
      enrollmentClosesAt: req.body.enrollmentClosesAt !== undefined ? req.body.enrollmentClosesAt || null : undefined,
      status: req.body.status !== undefined ? String(req.body.status || '').toLowerCase() : undefined,
      isActive: req.body.isActive !== undefined ? asBool(req.body.isActive, true) : undefined,
      allowLateJoin: req.body.allowLateJoin !== undefined ? asBool(req.body.allowLateJoin, false) : undefined,
      maxClients: req.body.maxClients !== undefined ? asInt(req.body.maxClients) : undefined,
      metadataJson: req.body.metadataJson !== undefined
        ? (req.body.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null)
        : undefined,
      activityTypesJson: req.body.activityTypesJson !== undefined
        ? (req.body.activityTypesJson && typeof req.body.activityTypesJson === 'object' ? req.body.activityTypesJson : (Array.isArray(req.body.activityTypesJson) ? req.body.activityTypesJson : null))
        : undefined,
      scoringRulesJson: req.body.scoringRulesJson !== undefined
        ? (req.body.scoringRulesJson && typeof req.body.scoringRulesJson === 'object' ? req.body.scoringRulesJson : null)
        : undefined,
      weeklyGoalMinimum: req.body.weeklyGoalMinimum !== undefined ? (req.body.weeklyGoalMinimum != null ? asInt(req.body.weeklyGoalMinimum) : null) : undefined,
      teamMinPointsPerWeek: req.body.teamMinPointsPerWeek !== undefined ? (req.body.teamMinPointsPerWeek != null ? asInt(req.body.teamMinPointsPerWeek) : null) : undefined,
      individualMinPointsPerWeek: req.body.individualMinPointsPerWeek !== undefined ? (req.body.individualMinPointsPerWeek != null ? asInt(req.body.individualMinPointsPerWeek) : null) : undefined,
      weekStartTime: req.body.weekStartTime !== undefined ? (req.body.weekStartTime || null) : undefined,
      mastersAgeThreshold: req.body.mastersAgeThreshold !== undefined ? (req.body.mastersAgeThreshold != null ? asInt(req.body.mastersAgeThreshold) : null) : undefined,
      recognitionCategoriesJson: req.body.recognitionCategoriesJson !== undefined
        ? normalizeRecognitionCategories(req.body.recognitionCategoriesJson)
        : undefined,
      recognitionMetric: req.body.recognitionMetric !== undefined ? (req.body.recognitionMetric || null) : undefined,
      captainApplicationOpen: req.body.captainApplicationOpen !== undefined || req.body.captain_application_open !== undefined
        ? asBool(req.body.captainApplicationOpen ?? req.body.captain_application_open, true)
        : undefined,
      captainsFinalized: req.body.captainsFinalized !== undefined || req.body.captains_finalized !== undefined
        ? asBool(req.body.captainsFinalized ?? req.body.captains_finalized, false)
        : undefined,
      seasonSplashEnabled: req.body.seasonSplashEnabled !== undefined || req.body.season_splash_enabled !== undefined
        ? asBool(req.body.seasonSplashEnabled ?? req.body.season_splash_enabled, true)
        : undefined,
      seasonAnnouncementText: req.body.seasonAnnouncementText !== undefined || req.body.season_announcement_text !== undefined
        ? (req.body.seasonAnnouncementText ?? req.body.season_announcement_text ? String(req.body.seasonAnnouncementText ?? req.body.season_announcement_text) : null)
        : undefined,
      seasonSettingsJson: req.body.seasonSettingsJson !== undefined || req.body.season_settings_json !== undefined
        ? (() => {
          const v = req.body.seasonSettingsJson ?? req.body.season_settings_json;
          if (v && typeof v === 'object') return normalizeSeasonSettings(v);
          if (typeof v === 'string' && v.trim()) {
            try { return normalizeSeasonSettings(JSON.parse(v)); } catch { return normalizeSeasonSettings({}); }
          }
          return normalizeSeasonSettings({});
        })()
        : undefined,
      deliveryMode: req.body.deliveryMode !== undefined || req.body.delivery_mode !== undefined
        ? (String(req.body.deliveryMode || req.body.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group')
        : undefined
    };
    const nextClass = await LearningProgramClass.update(classId, patch);
    return res.json({ class: withSeasonSettingsDefaults(nextClass) });
  } catch (e) {
    next(e);
  }
};

export const duplicateLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const source = await LearningProgramClass.findById(classId);
    if (!source) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: source.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: source.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });

    const copyMembers = asBool(req.body.copyMembers, false);
    const newName = req.body.className ? String(req.body.className).trim() : `${source.class_name} (Copy)`;
    const dup = await LearningProgramClass.create({
      organizationId: source.organization_id,
      className: newName,
      classCode: source.class_code ? `${source.class_code}-copy` : null,
      description: source.description || null,
      timezone: source.timezone || 'America/New_York',
      startsAt: source.starts_at || null,
      endsAt: source.ends_at || null,
      enrollmentOpensAt: source.enrollment_opens_at || null,
      enrollmentClosesAt: source.enrollment_closes_at || null,
      status: 'draft',
      isActive: true,
      allowLateJoin: asBool(source.allow_late_join, false),
      maxClients: source.max_clients || null,
      metadataJson: source.metadata_json || null,
      activityTypesJson: source.activity_types_json || null,
      scoringRulesJson: source.scoring_rules_json || null,
      weeklyGoalMinimum: source.weekly_goal_minimum ?? null,
      teamMinPointsPerWeek: source.team_min_points_per_week ?? null,
      individualMinPointsPerWeek: source.individual_min_points_per_week ?? null,
      weekStartTime: source.week_start_time || null,
      mastersAgeThreshold: source.masters_age_threshold ?? 53,
      recognitionCategoriesJson: normalizeRecognitionCategories(source.recognition_categories_json),
      recognitionMetric: source.recognition_metric || 'points',
      captainApplicationOpen: !!(source.captain_application_open === 1 || source.captain_application_open === true),
      captainsFinalized: false,
      seasonSplashEnabled: !!(source.season_splash_enabled === 1 || source.season_splash_enabled === true),
      seasonAnnouncementText: source.season_announcement_text || null,
      seasonSettingsJson: source.season_settings_json || null,
      deliveryMode: source.delivery_mode || 'group',
      registrationEligible: !!(source.registration_eligible === 1 || source.registration_eligible === true),
      medicaidEligible: !!(source.medicaid_eligible === 1 || source.medicaid_eligible === true),
      cashEligible: !!(source.cash_eligible === 1 || source.cash_eligible === true),
      createdByUserId: req.user.id
    });

    const sourceResources = await LearningProgramClass.listResources(classId);
    for (const r of sourceResources || []) {
      await LearningProgramClass.createResource({
        classId: dup.id,
        resourceType: r.resource_type,
        title: r.title,
        description: r.description,
        filePath: r.file_path,
        externalUrl: r.external_url,
        sortOrder: r.sort_order,
        isPublished: asBool(r.is_published, true),
        visibleToClients: asBool(r.visible_to_clients, true),
        visibleToProviders: asBool(r.visible_to_providers, true),
        metadataJson: r.metadata_json,
        createdByUserId: req.user.id
      });
    }

    if (copyMembers) {
      const clients = await LearningProgramClass.listClientMembers(classId);
      const providers = await LearningProgramClass.listProviderMembers(classId);
      for (const c of clients || []) {
        if (String(c.membership_status || '').toLowerCase() === 'removed') continue;
        await LearningProgramClass.addClientMember({
          classId: dup.id,
          clientId: c.client_id,
          membershipStatus: 'active',
          roleLabel: c.role_label || null,
          notes: c.notes || null,
          actorUserId: req.user.id
        });
      }
      for (const p of providers || []) {
        if (String(p.membership_status || '').toLowerCase() === 'removed') continue;
        await LearningProgramClass.addProviderMember({
          classId: dup.id,
          providerUserId: p.provider_user_id,
          membershipStatus: 'active',
          roleLabel: p.role_label || null,
          notes: p.notes || null,
          actorUserId: req.user.id
        });
      }
    }

    const [intakeRows] = await pool.execute(
      `SELECT * FROM intake_links
       WHERE scope_type = 'learning_class' AND learning_class_id = ?`,
      [classId]
    );
    const duplicatedIntakeLinks = [];
    for (const row of intakeRows || []) {
      const normalized = IntakeLink.normalize(row);
      const link = await IntakeLink.create({
        publicKey: crypto.randomBytes(24).toString('hex'),
        title: normalized?.title ? `${normalized.title} (Copy)` : 'Class Registration (Copy)',
        description: normalized?.description || null,
        languageCode: normalized?.language_code || 'en',
        scopeType: 'learning_class',
        formType: normalized?.form_type || 'intake',
        organizationId: dup.organization_id,
        programId: normalized?.program_id || null,
        jobDescriptionId: normalized?.job_description_id || null,
        learningClassId: dup.id,
        isActive: false,
        createClient: normalized?.create_client !== false,
        createGuardian: normalized?.create_guardian === true,
        requiresAssignment: normalized?.requires_assignment !== false,
        allowedDocumentTemplateIds: normalized?.allowed_document_template_ids || null,
        intakeFields: normalized?.intake_fields || null,
        intakeSteps: normalized?.intake_steps || null,
        retentionPolicy: normalized?.retention_policy_json || null,
        customMessages: normalized?.custom_messages || null,
        createdByUserId: req.user.id
      });
      duplicatedIntakeLinks.push(link);
    }

    return res.status(201).json({ class: dup, duplicatedIntakeLinks });
  } catch (e) {
    next(e);
  }
};

export const upsertClassClientMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    for (const m of members) {
      const clientId = asInt(m?.clientId);
      if (!clientId) continue;
      await LearningProgramClass.addClientMember({
        classId,
        clientId,
        membershipStatus: String(m?.membershipStatus || 'active').toLowerCase(),
        roleLabel: m?.roleLabel ? String(m.roleLabel) : null,
        notes: m?.notes ? String(m.notes) : null,
        actorUserId: req.user.id
      });
    }
    const clientMembers = await LearningProgramClass.listClientMembers(classId);
    return res.json({ classId, clientMembers });
  } catch (e) {
    next(e);
  }
};

export const upsertClassProviderMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    for (const m of members) {
      const providerUserId = asInt(m?.providerUserId);
      if (!providerUserId) continue;
      await LearningProgramClass.addProviderMember({
        classId,
        providerUserId,
        membershipStatus: String(m?.membershipStatus || 'active').toLowerCase(),
        roleLabel: m?.roleLabel ? String(m.roleLabel) : null,
        notes: m?.notes ? String(m.notes) : null,
        actorUserId: req.user.id
      });
    }
    const providerMembers = await LearningProgramClass.listProviderMembers(classId);
    return res.json({ classId, providerMembers });
  } catch (e) {
    next(e);
  }
};

export const listClassResources = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const resources = await LearningProgramClass.listResources(classId);
    return res.json({ classId, resources });
  } catch (e) {
    next(e);
  }
};

export const createClassResource = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    const resource = await LearningProgramClass.createResource({
      classId,
      resourceType: String(req.body?.resourceType || 'document').toLowerCase(),
      title,
      description: req.body?.description ? String(req.body.description) : null,
      filePath: req.body?.filePath ? String(req.body.filePath) : null,
      externalUrl: req.body?.externalUrl ? String(req.body.externalUrl) : null,
      sortOrder: asInt(req.body?.sortOrder) || 0,
      isPublished: asBool(req.body?.isPublished, true),
      visibleToClients: asBool(req.body?.visibleToClients, true),
      visibleToProviders: asBool(req.body?.visibleToProviders, true),
      metadataJson: req.body?.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null,
      createdByUserId: req.user.id
    });
    return res.status(201).json({ resource });
  } catch (e) {
    next(e);
  }
};

export const updateClassResource = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const resourceId = asInt(req.params.resourceId);
    if (!classId || !resourceId) return res.status(400).json({ error: { message: 'Invalid classId/resourceId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const patch = {
      resourceType: req.body?.resourceType !== undefined ? String(req.body.resourceType || '').toLowerCase() : undefined,
      title: req.body?.title !== undefined ? String(req.body.title || '').trim() : undefined,
      description: req.body?.description !== undefined ? (req.body.description ? String(req.body.description) : null) : undefined,
      filePath: req.body?.filePath !== undefined ? (req.body.filePath ? String(req.body.filePath) : null) : undefined,
      externalUrl: req.body?.externalUrl !== undefined ? (req.body.externalUrl ? String(req.body.externalUrl) : null) : undefined,
      sortOrder: req.body?.sortOrder !== undefined ? (asInt(req.body.sortOrder) || 0) : undefined,
      isPublished: req.body?.isPublished !== undefined ? asBool(req.body.isPublished, true) : undefined,
      visibleToClients: req.body?.visibleToClients !== undefined ? asBool(req.body.visibleToClients, true) : undefined,
      visibleToProviders: req.body?.visibleToProviders !== undefined ? asBool(req.body.visibleToProviders, true) : undefined,
      metadataJson: req.body?.metadataJson !== undefined
        ? (req.body.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null)
        : undefined
    };
    const resource = await LearningProgramClass.updateResource(resourceId, patch);
    return res.json({ resource });
  } catch (e) {
    next(e);
  }
};

export const deleteClassResource = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const resourceId = asInt(req.params.resourceId);
    if (!classId || !resourceId) return res.status(400).json({ error: { message: 'Invalid classId/resourceId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const ok = await LearningProgramClass.deleteResource(resourceId);
    if (!ok) return res.status(404).json({ error: { message: 'Resource not found' } });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const launchLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const status = String(klass.status || '').toLowerCase();
    if (status !== 'draft') return res.status(400).json({ error: { message: 'Only draft seasons can be launched' } });
    let [teams] = await pool.execute(`SELECT id FROM challenge_teams WHERE learning_class_id = ?`, [classId]);
    if (!teams?.length) {
      const settings = normalizeSeasonSettings(klass?.season_settings_json || {});
      const count = Number(settings?.teams?.teamCount || 0);
      const preset = Array.isArray(settings?.teams?.presetTeamNames) ? settings.teams.presetTeamNames : [];
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const teamName = String(preset[i] || `Team ${i + 1}`).trim();
          await pool.execute(
            `INSERT INTO challenge_teams (learning_class_id, team_name, created_by_user_id)
             VALUES (?, ?, ?)`,
            [classId, teamName, req.user.id]
          );
        }
      }
      [teams] = await pool.execute(`SELECT id FROM challenge_teams WHERE learning_class_id = ?`, [classId]);
    }
    if (!teams?.length) return res.status(400).json({ error: { message: 'Add at least one team before launching' } });
    const [members] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId]
    );
    if (!members?.length) return res.status(400).json({ error: { message: 'Add at least one participant before launching' } });
    const [memberCountRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND membership_status IN ('active','completed')`,
      [classId]
    );
    const baselineMemberCount = Number(memberCountRows?.[0]?.total || 0);
    const settings = normalizeSeasonSettings(klass?.season_settings_json || {});
    settings.participation = {
      ...(settings.participation || {}),
      baselineMemberCount
    };
    await LearningProgramClass.update(classId, { status: 'active', seasonSettingsJson: settings });
    const updated = await LearningProgramClass.findById(classId);
    return res.json({ class: updated, launched: true });
  } catch (e) {
    next(e);
  }
};

export const joinLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });

    const orgType = String(klass.organization_type || '').toLowerCase();
    const isManager = await canUserManageChallengeClass({ user: req.user, learningClassId: classId });

    if (orgType === 'affiliation') {
      const m = await getUserClubMembership(req.user.id, klass.organization_id);
      if (!m || m.is_active === false) {
        // Club managers bypass the membership check — they're always eligible to participate.
        if (!isManager) {
          return res.status(403).json({ error: { message: 'You must be a member of this club to join the season' } });
        }
      }
    }

    // Club/season managers can always join regardless of the enrollment window.
    if (!isManager) {
      const opens = klass.enrollment_opens_at ? new Date(klass.enrollment_opens_at).getTime() : null;
      const closes = klass.enrollment_closes_at ? new Date(klass.enrollment_closes_at).getTime() : null;
      const nowMs = Date.now();
      if (opens && nowMs < opens) {
        return res.status(400).json({ error: { message: 'Enrollment is not open yet' } });
      }
      if (closes && nowMs > closes) {
        return res.status(400).json({
          error: { message: 'Enrollment has closed. Request a join from the club dashboard.' },
          code: 'ENROLLMENT_CLOSED'
        });
      }
    }

    const status = String(klass.status || '').toLowerCase();
    if (status !== 'active' && status !== 'draft') {
      return res.status(400).json({ error: { message: 'This season is not open for joining' } });
    }
    if (status === 'draft') {
      // Allow joining a released draft season while enrollment window is open (see enrollment checks above).
    }
    const seasonSettings = normalizeSeasonSettings(klass?.season_settings_json || {});
    const billing = seasonSettings?.billing || {};
    // Billing execution remains disabled until explicit feature enablement.
    const billingConfigPreview = {
      enabled: billing.enabled === true,
      chargeTarget: String(billing.chargeTarget || 'member'),
      memberChargeAmountCents: Number(billing.memberChargeAmountCents || 0),
      currency: String(billing.currency || 'usd')
    };
    const billingRequired = false;

    await LearningProgramClass.addProviderMember({
      classId,
      providerUserId: req.user.id,
      membershipStatus: 'active',
      actorUserId: req.user.id
    });
    const providerMembers = await attachParticipationAgreementStatusToMembers({
      klass,
      providerMembers: await LearningProgramClass.listProviderMembers(classId)
    });
    const participationAgreementStatus = await buildParticipationAgreementStatus({
      klass,
      providerUserId: req.user.id
    });
    return res.json({
      joined: true,
      classId,
      providerMembers,
      participationAgreementStatus,
      billingRequired,
      billingConfigPreview
    });
  } catch (e) {
    next(e);
  }
};

export const getLearningProgramParticipationAgreementStatus = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const status = await buildParticipationAgreementStatus({
      klass,
      providerUserId: req.user.id
    });
    return res.json(status);
  } catch (e) {
    next(e);
  }
};

export const acceptLearningProgramParticipationAgreement = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const isMember = await isActiveProviderMembership({ classId, userId: req.user.id });
    if (!isMember) {
      return res.status(403).json({ error: { message: 'Join the season before accepting its participation agreement' } });
    }
    const agreement = getClassParticipationAgreement(klass);
    if (!hasParticipationAgreement(agreement)) {
      return res.status(400).json({ error: { message: 'This season does not currently require a participation agreement' } });
    }
    const accepted = req.body?.accepted === true || req.body?.accepted === 'true';
    if (!accepted) {
      return res.status(400).json({ error: { message: 'accepted must be true' } });
    }
    const signatureName = String(req.body?.signatureName || '').trim();
    if (!signatureName) {
      return res.status(400).json({ error: { message: 'signatureName is required' } });
    }
    const row = await ChallengeSeasonParticipationAcceptance.accept({
      classId,
      providerUserId: req.user.id,
      agreement,
      signatureName,
      ipAddress: getRequestIp(req),
      userAgent: req.headers['user-agent'] || null
    });
    return res.status(201).json({
      accepted: true,
      acceptedAt: row?.accepted_at || null,
      signatureName: row?.signature_name || signatureName,
      agreementHash: buildParticipationAgreementHash(agreement)
    });
  } catch (e) {
    next(e);
  }
};

export const listParticipantProfiles = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });

    // Fetch all enrolled participants with season-specific AND global profile data
    const [rows] = await pool.execute(
      `SELECT
         u.id            AS provider_user_id,
         u.first_name,
         u.last_name,
         cpp.gender,
         cpp.date_of_birth,
         cpp.weight_lbs,
         cpp.height_inches,
         MAX(CASE
           WHEN uifd.field_key IN ('date_of_birth','provider_birthdate') AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             THEN uiv.value
           ELSE NULL
         END) AS global_date_of_birth,
         MAX(CASE
           WHEN uifd.field_key IN ('sex','gender','provider_gender') AND uiv.value IS NOT NULL AND uiv.value <> ''
             THEN LOWER(TRIM(uiv.value))
           ELSE NULL
         END) AS global_sex
       FROM learning_class_provider_memberships pm
       INNER JOIN users u ON u.id = pm.provider_user_id
       LEFT JOIN challenge_participant_profiles cpp
         ON cpp.provider_user_id = u.id AND cpp.learning_class_id = ?
       LEFT JOIN user_info_values uiv ON uiv.user_id = u.id
       LEFT JOIN user_info_field_definitions uifd
         ON uifd.id = uiv.field_definition_id
         AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
       WHERE pm.learning_class_id = ?
         AND pm.membership_status IN ('active','completed')
       GROUP BY u.id, u.first_name, u.last_name, cpp.gender, cpp.date_of_birth, cpp.weight_lbs, cpp.height_inches
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [classId, klass.organization_id, classId]
    );

    const profiles = (rows || []).map((r) => ({
      provider_user_id: r.provider_user_id,
      first_name: r.first_name,
      last_name: r.last_name,
      gender: r.gender || null,
      date_of_birth: r.date_of_birth || null,
      weight_lbs: r.weight_lbs || null,
      height_inches: r.height_inches || null,
      global_sex: r.global_sex || null,
      global_date_of_birth: r.global_date_of_birth || null,
    }));

    return res.json({ profiles });
  } catch (e) {
    next(e);
  }
};

export const getSeasonProfileCompleteness = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });

    const [rows] = await pool.execute(
      `SELECT
         u.id AS user_id,
         u.first_name,
         u.last_name,
         u.email,
         MAX(CASE
           WHEN uifd.field_key IN ('date_of_birth','provider_birthdate') AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             THEN uiv.value
           ELSE NULL
         END) AS global_date_of_birth,
         MAX(CASE
           WHEN uifd.field_key IN ('sex','gender','provider_gender') AND uiv.value IS NOT NULL AND uiv.value <> ''
             THEN LOWER(TRIM(uiv.value))
           ELSE NULL
         END) AS global_sex
       FROM learning_class_provider_memberships pm
       INNER JOIN users u ON u.id = pm.provider_user_id
       LEFT JOIN user_info_values uiv ON uiv.user_id = u.id
       LEFT JOIN user_info_field_definitions uifd
         ON uifd.id = uiv.field_definition_id
         AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
       WHERE pm.learning_class_id = ?
         AND pm.membership_status IN ('active','completed')
       GROUP BY u.id, u.first_name, u.last_name, u.email
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [klass.organization_id, classId]
    );

    const participants = (rows || []).map((r) => {
      const missing = [];
      if (!r.global_date_of_birth) missing.push('birthdate');
      if (!r.global_sex) missing.push('sex');
      return {
        userId: Number(r.user_id),
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        globalDateOfBirth: r.global_date_of_birth || null,
        globalSex: r.global_sex || null,
        missingFields: missing
      };
    });
    const missingParticipants = participants.filter((p) => p.missingFields.length > 0);
    return res.json({
      classId,
      participantsChecked: participants.length,
      missingCount: missingParticipants.length,
      missingParticipants
    });
  } catch (e) {
    next(e);
  }
};

export const upsertParticipantProfile = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const providerUserId = asInt(req.params.providerUserId ?? req.body.providerUserId ?? req.body.provider_user_id);
    if (!classId || !providerUserId) return res.status(400).json({ error: { message: 'classId and providerUserId required' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const [member] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId, providerUserId]
    );
    if (!member?.length) return res.status(400).json({ error: { message: 'User is not a participant in this season' } });
    const profile = await ChallengeParticipantProfile.upsert({
      learningClassId: classId,
      providerUserId,
      gender: req.body.gender || null,
      dateOfBirth: req.body.dateOfBirth ?? req.body.date_of_birth ?? null,
      weightLbs: req.body.weightLbs !== undefined ? req.body.weightLbs : (req.body.weight_lbs !== undefined ? req.body.weight_lbs : undefined),
      heightInches: req.body.heightInches !== undefined ? req.body.heightInches : (req.body.height_inches !== undefined ? req.body.height_inches : undefined)
    });
    return res.json(profile);
  } catch (e) {
    next(e);
  }
};

export const listMyLearningClasses = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.id || 0);
    const organizationId = asInt(req.query.organizationId);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const scopedIds = await resolveScopedAgencyIdsForMyDashboard(req);
    if (!scopedIds.length) {
      return res.json({ classes: [] });
    }
    const scopedSet = new Set(scopedIds);
    const scopePlaceholders = scopedIds.map(() => '?').join(', ');
    let orgFilter;
    let params;
    if (organizationId) {
      if (!scopedSet.has(organizationId)) {
        return res.json({ classes: [] });
      }
      orgFilter = ' AND c.organization_id = ?';
      params = [userId, organizationId];
    } else {
      orgFilter = ` AND c.organization_id IN (${scopePlaceholders})`;
      params = [userId, ...scopedIds];
    }

    let rows = [];
    if (role === 'client_guardian') {
      const [qRows] = await pool.execute(
        `SELECT DISTINCT c.*, a.name AS organization_name, a.slug AS organization_slug, a.organization_type
         FROM learning_program_classes c
         INNER JOIN agencies a ON a.id = c.organization_id
         INNER JOIN learning_class_client_memberships m ON m.learning_class_id = c.id
         INNER JOIN client_guardians cg ON cg.client_id = m.client_id
         WHERE cg.guardian_user_id = ?
           AND (cg.access_enabled IS NULL OR cg.access_enabled = TRUE)
           AND m.membership_status IN ('active','completed')
           AND c.status <> 'archived'${orgFilter}
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC`,
        params
      );
      rows = qRows || [];
    } else {
      const [qRows] = await pool.execute(
        `SELECT DISTINCT c.*, a.name AS organization_name, a.slug AS organization_slug, a.organization_type
         FROM learning_program_classes c
         INNER JOIN agencies a ON a.id = c.organization_id
         INNER JOIN learning_class_provider_memberships m ON m.learning_class_id = c.id
         WHERE m.provider_user_id = ?
           AND m.membership_status IN ('active','completed')
           AND c.status <> 'archived'${orgFilter}
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC`,
        params
      );
      rows = qRows || [];
    }
    const classes = [];
    for (const row of rows) classes.push(await ensureClassLifecycleStatus(row));
    return res.json({ classes });
  } catch (e) {
    next(e);
  }
};

// ── Season banner & logo upload ──────────────────────────────────────────────

export const uploadSeasonBanner = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid season ID' });

    const cls = await LearningProgramClass.findById(classId);
    if (!cls) return res.status(404).json({ error: 'Season not found' });

    const canManage = await canUserManageChallengeClass({ user: req.user, learningClassId: classId });
    if (!canManage) return res.status(403).json({ error: 'Access denied' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = await StorageService.saveSeasonBanner({
      classId,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    await pool.execute(
      `UPDATE learning_program_classes SET banner_image_path = ? WHERE id = ?`,
      [result.relativePath, classId]
    );

    return res.json({ bannerPath: result.relativePath });
  } catch (e) { next(e); }
};

export const updateSeasonBannerFocal = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid season ID' });

    const canManage = await canUserManageChallengeClass({ user: req.user, learningClassId: classId });
    if (!canManage) return res.status(403).json({ error: 'Access denied' });

    const focalX = Math.min(100, Math.max(0, parseFloat(req.body.focalX ?? 50)));
    const focalY = Math.min(100, Math.max(0, parseFloat(req.body.focalY ?? 50)));

    await pool.execute(
      `UPDATE learning_program_classes SET banner_focal_x = ?, banner_focal_y = ? WHERE id = ?`,
      [focalX, focalY, classId]
    );

    return res.json({ focalX, focalY });
  } catch (e) { next(e); }
};

export const deleteSeasonBanner = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid season ID' });

    const canManage = await canUserManageChallengeClass({ user: req.user, learningClassId: classId });
    if (!canManage) return res.status(403).json({ error: 'Access denied' });

    await pool.execute(
      `UPDATE learning_program_classes SET banner_image_path = NULL, banner_focal_x = 50, banner_focal_y = 50 WHERE id = ?`,
      [classId]
    );

    return res.json({ ok: true });
  } catch (e) { next(e); }
};

export const uploadSeasonLogo = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid season ID' });

    const cls = await LearningProgramClass.findById(classId);
    if (!cls) return res.status(404).json({ error: 'Season not found' });

    const canManage = await canUserManageChallengeClass({ user: req.user, learningClassId: classId });
    if (!canManage) return res.status(403).json({ error: 'Access denied' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = await StorageService.saveSeasonLogo({
      classId,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    await pool.execute(
      `UPDATE learning_program_classes SET logo_image_path = ? WHERE id = ?`,
      [result.relativePath, classId]
    );

    return res.json({ logoPath: result.relativePath });
  } catch (e) { next(e); }
};

export const deleteSeasonLogo = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid season ID' });

    const canManage = await canUserManageChallengeClass({ user: req.user, learningClassId: classId });
    if (!canManage) return res.status(403).json({ error: 'Access denied' });

    await pool.execute(
      `UPDATE learning_program_classes SET logo_image_path = NULL WHERE id = ?`,
      [classId]
    );

    return res.json({ ok: true });
  } catch (e) { next(e); }
};

/** Stream the season banner image directly from GCS (bypasses the generic /uploads route). */
export const serveSeasonBanner = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(404).end();
    const [[row]] = await pool.execute(
      `SELECT banner_image_path FROM learning_program_classes WHERE id = ?`, [classId]
    );
    const imgPath = row?.banner_image_path;
    if (!imgPath) return res.status(404).end();

    const StorageService = (await import('../services/storage.service.js')).default;
    const gcsKey = imgPath.startsWith('uploads/') ? imgPath : `uploads/${imgPath}`;
    const bucket = await StorageService.getGCSBucket();
    const file = bucket.file(gcsKey);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).end();

    const [buffer] = await file.download();
    const [meta] = await file.getMetadata();
    res.setHeader('Content-Type', meta.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (e) { next(e); }
};

/** Stream the season logo image directly from GCS (bypasses the generic /uploads route). */
export const serveSeasonLogo = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(404).end();
    const [[row]] = await pool.execute(
      `SELECT logo_image_path FROM learning_program_classes WHERE id = ?`, [classId]
    );
    const imgPath = row?.logo_image_path;
    if (!imgPath) return res.status(404).end();

    const StorageService = (await import('../services/storage.service.js')).default;
    const gcsKey = imgPath.startsWith('uploads/') ? imgPath : `uploads/${imgPath}`;
    const bucket = await StorageService.getGCSBucket();
    const file = bucket.file(gcsKey);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).end();

    const [buffer] = await file.download();
    const [meta] = await file.getMetadata();
    res.setHeader('Content-Type', meta.contentType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (e) { next(e); }
};
