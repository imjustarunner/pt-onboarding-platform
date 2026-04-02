import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import Survey from '../models/Survey.model.js';
import SurveyPush from '../models/SurveyPush.model.js';
import SurveyResponse, { computeSurveyScores } from '../models/SurveyResponse.model.js';

const isSuperAdmin = (role) => String(role || '').toLowerCase() === 'super_admin';

const parseId = (value) => {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function getUserAgencyIds(userId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || [])
    .map((a) => parseId(a?.id))
    .filter((id) => id);
}

async function resolveAgencyIdFromRequest(req, preferred = null) {
  if (preferred && parseId(preferred)) return parseId(preferred);
  if (parseId(req.user?.agencyId)) return parseId(req.user.agencyId);
  const ids = await getUserAgencyIds(req.user?.id);
  return ids[0] || null;
}

function sanitizeQuestions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((q) => q && typeof q === 'object')
    .map((q, i) => ({
      id: String(q.id || `q_${i + 1}`).trim().slice(0, 80),
      type: String(q.type || 'text').trim().toLowerCase().slice(0, 40),
      label: String(q.label || '').trim().slice(0, 2000),
      required: !!q.required,
      helperText: String(q.helperText || '').trim().slice(0, 2000),
      options: Array.isArray(q.options) ? q.options.map((o) => ({
        label: String(o?.label || '').trim().slice(0, 255),
        value: String(o?.value || '').trim().slice(0, 255)
      })) : [],
      scale: q.scale && typeof q.scale === 'object' ? {
        min: Number.isFinite(Number(q.scale.min)) ? Number(q.scale.min) : 1,
        max: Number.isFinite(Number(q.scale.max)) ? Number(q.scale.max) : 10,
        minLabel: String(q.scale.minLabel || '').trim().slice(0, 255),
        maxLabel: String(q.scale.maxLabel || '').trim().slice(0, 255)
      } : null,
      category: String(q.category || '').trim().slice(0, 80),
      allowQuoteMe: !!q.allowQuoteMe,
      scoring: q.scoring && typeof q.scoring === 'object' ? {
        enabled: !!q.scoring.enabled,
        direction: String(q.scoring.direction || '').trim().toLowerCase().slice(0, 20),
        optionScores: q.scoring.optionScores && typeof q.scoring.optionScores === 'object'
          ? q.scoring.optionScores
          : {}
      } : { enabled: false, direction: '', optionScores: {} }
    }));
}

function roleFilterForPushType(pushType) {
  const pt = String(pushType || '').trim().toLowerCase();
  if (pt === 'providers') return ['provider', 'provider_plus'];
  if (pt === 'school_staff') return ['school_staff'];
  if (pt === 'all_staff') {
    return ['staff', 'admin', 'support', 'supervisor', 'clinical_practice_assistant', 'intern', 'facilitator'];
  }
  if (pt === 'all') {
    return [
      'provider',
      'provider_plus',
      'school_staff',
      'staff',
      'admin',
      'support',
      'supervisor',
      'clinical_practice_assistant',
      'intern',
      'facilitator'
    ];
  }
  return [];
}

async function listTargetUsersForPush({ agencyId, pushType }) {
  const roles = roleFilterForPushType(pushType);
  if (!roles.length) return [];
  const placeholders = roles.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND LOWER(TRIM(u.role)) IN (${placeholders})
       AND (u.is_archived = 0 OR u.is_archived IS NULL)`,
    [Number(agencyId), ...roles]
  );
  return (rows || []).map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
}

function canAccessAgency(req, agencyId, userAgencyIds) {
  if (isSuperAdmin(req.user?.role)) return true;
  return userAgencyIds.includes(Number(agencyId));
}

export const listSurveys = async (req, res, next) => {
  try {
    const userAgencyIds = await getUserAgencyIds(req.user?.id);
    const agencyId = await resolveAgencyIdFromRequest(req, req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!canAccessAgency(req, agencyId, userAgencyIds)) {
      return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    }
    const includeInactive = String(req.query.includeInactive || '1') !== '0';
    const surveys = await Survey.listByAgency(agencyId, { includeInactive });
    res.json(surveys);
  } catch (error) {
    next(error);
  }
};

export const createSurvey = async (req, res, next) => {
  try {
    const userAgencyIds = await getUserAgencyIds(req.user?.id);
    const agencyId = await resolveAgencyIdFromRequest(req, req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!canAccessAgency(req, agencyId, userAgencyIds)) {
      return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    }
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    const survey = await Survey.create({
      agencyId,
      title,
      description: String(req.body?.description || '').trim() || null,
      isActive: req.body?.isActive !== false,
      isAnonymous: !!req.body?.isAnonymous,
      isScored: !!req.body?.isScored,
      pushType: req.body?.pushType || null,
      questions: sanitizeQuestions(req.body?.questions || req.body?.questionsJson || []),
      createdByUserId: req.user?.id || null
    });
    res.status(201).json(survey);
  } catch (error) {
    next(error);
  }
};

export const updateSurvey = async (req, res, next) => {
  try {
    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid survey id' } });
    const existing = await Survey.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Survey not found' } });
    const userAgencyIds = await getUserAgencyIds(req.user?.id);
    if (!canAccessAgency(req, existing.agency_id, userAgencyIds)) {
      return res.status(403).json({ error: { message: 'Access denied for this survey' } });
    }
    const updated = await Survey.update(id, {
      title: req.body?.title ?? existing.title,
      description: req.body?.description ?? existing.description,
      isActive: req.body?.isActive ?? existing.is_active,
      isAnonymous: req.body?.isAnonymous ?? existing.is_anonymous,
      isScored: req.body?.isScored ?? existing.is_scored,
      pushType: req.body?.pushType ?? existing.push_type,
      questions: sanitizeQuestions(req.body?.questions ?? existing.questions_json ?? [])
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteSurvey = async (req, res, next) => {
  try {
    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid survey id' } });
    const existing = await Survey.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Survey not found' } });
    const userAgencyIds = await getUserAgencyIds(req.user?.id);
    if (!canAccessAgency(req, existing.agency_id, userAgencyIds)) {
      return res.status(403).json({ error: { message: 'Access denied for this survey' } });
    }
    await Survey.delete(id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const pushSurvey = async (req, res, next) => {
  try {
    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid survey id' } });
    const survey = await Survey.findById(id);
    if (!survey) return res.status(404).json({ error: { message: 'Survey not found' } });
    const userAgencyIds = await getUserAgencyIds(req.user?.id);
    if (!canAccessAgency(req, survey.agency_id, userAgencyIds)) {
      return res.status(403).json({ error: { message: 'Access denied for this survey' } });
    }

    const pushType = String(req.body?.pushType || survey.push_type || '').trim().toLowerCase();
    if (!pushType) {
      return res.status(400).json({ error: { message: 'Survey pushType is required' } });
    }
    const userIds = await listTargetUsersForPush({ agencyId: survey.agency_id, pushType });
    const pushes = await SurveyPush.createMany(survey.id, userIds);

    for (const uid of userIds) {
      try {
        await Notification.create({
          type: 'survey_completed',
          severity: 'warning',
          title: 'New survey available',
          message: `${survey.title} is available for you to complete.`,
          userId: uid,
          agencyId: survey.agency_id,
          relatedEntityType: 'survey',
          relatedEntityId: survey.id,
          actorUserId: req.user?.id || null,
          actorSource: 'survey_push'
        });
      } catch {
        // Best effort only.
      }
    }

    res.json({ ok: true, pushType, recipientCount: userIds.length, pushes });
  } catch (error) {
    next(error);
  }
};

export const listSurveyPushes = async (req, res, next) => {
  try {
    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid survey id' } });
    const survey = await Survey.findById(id);
    if (!survey) return res.status(404).json({ error: { message: 'Survey not found' } });
    const userAgencyIds = await getUserAgencyIds(req.user?.id);
    if (!canAccessAgency(req, survey.agency_id, userAgencyIds)) {
      return res.status(403).json({ error: { message: 'Access denied for this survey' } });
    }
    const pushes = await SurveyPush.listBySurvey(id);
    res.json(pushes);
  } catch (error) {
    next(error);
  }
};

export const listSurveyResponses = async (req, res, next) => {
  try {
    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid survey id' } });
    const survey = await Survey.findById(id);
    if (!survey) return res.status(404).json({ error: { message: 'Survey not found' } });
    const userAgencyIds = await getUserAgencyIds(req.user?.id);
    if (!canAccessAgency(req, survey.agency_id, userAgencyIds)) {
      return res.status(403).json({ error: { message: 'Access denied for this survey' } });
    }
    const responses = await SurveyResponse.listBySurvey(id);
    res.json({ survey, responses });
  } catch (error) {
    next(error);
  }
};

export const respondToSurvey = async (req, res, next) => {
  try {
    const surveyId = parseId(req.params?.id);
    if (!surveyId) return res.status(400).json({ error: { message: 'Invalid survey id' } });
    const survey = await Survey.findById(surveyId);
    if (!survey || !survey.is_active) {
      return res.status(404).json({ error: { message: 'Survey not found or inactive' } });
    }
    const responseData = req.body?.responseData || req.body?.answers || {};
    const surveyPushId = parseId(req.body?.surveyPushId);
    const clientId = parseId(req.body?.clientId);
    const companyEventSessionSurveyId = parseId(req.body?.companyEventSessionSurveyId);

    if (surveyPushId) {
      const push = await SurveyPush.findById(surveyPushId);
      if (!push || Number(push.survey_id) !== Number(surveyId)) {
        return res.status(400).json({ error: { message: 'Invalid survey push id' } });
      }
      if (Number(push.user_id) !== Number(req.user?.id) && !isSuperAdmin(req.user?.role)) {
        return res.status(403).json({ error: { message: 'Access denied for this survey push' } });
      }
    }

    const { totalScore, categoryScores } = survey.is_scored
      ? computeSurveyScores(survey.questions_json, responseData)
      : { totalScore: null, categoryScores: null };

    const response = await SurveyResponse.create({
      surveyId,
      surveyPushId,
      respondentUserId: survey.is_anonymous ? null : (req.user?.id || null),
      clientId,
      companyEventSessionSurveyId,
      responseData,
      totalScore,
      categoryScores,
      submittedAt: new Date()
    });

    if (surveyPushId) {
      await SurveyPush.updateStatus(surveyPushId, 'accepted');
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const listMyPendingSurveyPushes = async (req, res, next) => {
  try {
    const rows = await SurveyPush.findPendingForUser(req.user?.id);
    res.json((rows || []).map((r) => {
      let questions = r.survey_questions_json;
      if (typeof questions === 'string') {
        try { questions = JSON.parse(questions); } catch { questions = []; }
      }
      return {
        ...r,
        survey_questions_json: Array.isArray(questions) ? questions : []
      };
    }));
  } catch (error) {
    next(error);
  }
};

export const dismissSurveyPush = async (req, res, next) => {
  try {
    const pushId = parseId(req.params?.pushId);
    if (!pushId) return res.status(400).json({ error: { message: 'Invalid survey push id' } });
    const push = await SurveyPush.findById(pushId);
    if (!push) return res.status(404).json({ error: { message: 'Survey push not found' } });
    if (Number(push.user_id) !== Number(req.user?.id) && !isSuperAdmin(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied for this survey push' } });
    }
    const updated = await SurveyPush.updateStatus(pushId, 'dismissed');
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const listClientSurveyResponses = async (req, res, next) => {
  try {
    const clientId = parseId(req.params?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const rows = await SurveyResponse.listByClient(clientId);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};
