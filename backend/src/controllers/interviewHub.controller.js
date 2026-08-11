import User from '../models/User.model.js';
import InterviewHubTemplate from '../models/InterviewHubTemplate.model.js';
import InterviewHubJobQuestionSet from '../models/InterviewHubJobQuestionSet.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';
import {
  ensureDefaultTemplate,
  buildInterviewFlow,
  finalizeInterview,
  pickRandom,
  DEFAULT_SALUTATIONS,
  DEFAULT_ICEBREAKERS
} from '../services/interviewHub.service.js';

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

function agencyIdFromReq(req) {
  return parseIntParam(req.query?.agencyId ?? req.body?.agencyId ?? req.body?.agency_id);
}

// ── Templates ──────────────────────────────────────────────────────────────

export const listTemplates = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    const templates = await InterviewHubTemplate.listByAgencyId(agencyId);
    return res.json({ success: true, data: templates });
  } catch (err) {
    return next(err);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const templateId = parseIntParam(req.params.templateId);
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'templateId required' });
    }
    const existing = await InterviewHubTemplate.findById(templateId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    await ensureAgencyAccess(req, existing.agency_id);

    const body = req.body || {};
    const updated = await InterviewHubTemplate.updateById(templateId, {
      name: body.name,
      isDefault: body.isDefault ?? body.is_default,
      flowSectionsJson: body.flowSectionsJson ?? body.flow_sections_json,
      standardQuestionsJson: body.standardQuestionsJson ?? body.standard_questions_json,
      scorecardCriteriaJson: body.scorecardCriteriaJson ?? body.scorecard_criteria_json,
      salutationPoolJson: body.salutationPoolJson ?? body.salutation_pool_json,
      icebreakerPoolJson: body.icebreakerPoolJson ?? body.icebreaker_pool_json,
      candidateQuestionsPrompt: body.candidateQuestionsPrompt ?? body.candidate_questions_prompt,
      updatedByUserId: req.user?.id
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
};

export const ensureDefaultTemplateHandler = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    const template = await ensureDefaultTemplate(agencyId, req.user?.id);
    return res.json({ success: true, data: template });
  } catch (err) {
    return next(err);
  }
};

// ── Job question sets ──────────────────────────────────────────────────────

export const listJobQuestionSets = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    const jobDescriptionId = parseIntParam(req.query?.jobDescriptionId ?? req.query?.job_description_id);
    const rows = await InterviewHubJobQuestionSet.listByAgencyId(agencyId, {
      jobDescriptionId: jobDescriptionId || null,
      includeInactive: String(req.query?.includeInactive || '') === '1'
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
};

export const createJobQuestionSet = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }
    const questionsJson = body.questionsJson ?? body.questions_json ?? body.questions ?? [];
    if (!Array.isArray(questionsJson)) {
      return res.status(400).json({ success: false, message: 'questions must be an array' });
    }
    const row = await InterviewHubJobQuestionSet.create({
      agencyId,
      jobDescriptionId: body.jobDescriptionId ?? body.job_description_id ?? null,
      title,
      questionsJson,
      isActive: body.isActive ?? body.is_active ?? true,
      createdByUserId: req.user?.id
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    return next(err);
  }
};

export const updateJobQuestionSet = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const existing = await InterviewHubJobQuestionSet.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Job question set not found' });
    }
    await ensureAgencyAccess(req, existing.agency_id);

    const body = req.body || {};
    const updated = await InterviewHubJobQuestionSet.updateById(id, {
      jobDescriptionId: body.jobDescriptionId ?? body.job_description_id,
      title: body.title,
      questionsJson: body.questionsJson ?? body.questions_json ?? body.questions,
      isActive: body.isActive ?? body.is_active
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
};

export const deleteJobQuestionSet = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const existing = await InterviewHubJobQuestionSet.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Job question set not found' });
    }
    await ensureAgencyAccess(req, existing.agency_id);
    await InterviewHubJobQuestionSet.deleteById(id);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

// ── Interviews ─────────────────────────────────────────────────────────────

export const listInterviews = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : null;
    const rows = await HiringInterview.listByAgencyId(agencyId, { status });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
};

export const getInterview = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const interview = await HiringInterview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }
    await ensureAgencyAccess(req, interview.agency_id);

    let template = interview.template_id
      ? await InterviewHubTemplate.findById(interview.template_id)
      : null;
    if (!template) {
      template = await ensureDefaultTemplate(interview.agency_id, req.user?.id);
    }
    const jobQuestionSet = interview.job_question_set_id
      ? await InterviewHubJobQuestionSet.findById(interview.job_question_set_id)
      : null;
    const artifact = await HiringInterviewArtifact.findByInterviewId(id);
    const flow = buildInterviewFlow({
      template,
      jobQuestionSet,
      regenerateSalutation: false,
      regenerateIcebreaker: false,
      previousFlow: artifact?.flow_state_json || null
    });

    return res.json({
      success: true,
      data: { interview, template, jobQuestionSet, artifact, flow }
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Schedule interview: creates TEAM_MEETING (subtype interview), Google Calendar invite,
 * public guest join link, and hiring_interviews + artifacts.
 */
export const createInterview = async (req, res, next) => {
  try {
    const body = req.body || {};
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(body.candidateUserId ?? body.candidate_user_id);
    if (!candidateUserId) {
      return res.status(400).json({ success: false, message: 'candidateUserId is required' });
    }

    const startsAt = body.startsAt ?? body.interviewStartsAt ?? body.interview_starts_at ?? null;
    if (!startsAt) {
      return res.status(400).json({ success: false, message: 'startsAt is required' });
    }

    const interviewerUserIds = Array.isArray(body.interviewerUserIds)
      ? body.interviewerUserIds
      : Array.isArray(body.interviewer_user_ids)
        ? body.interviewer_user_ids
        : [];

    // If an existing schedule event id is provided, keep lightweight row-only create.
    const existingEventId = parseIntParam(body.providerScheduleEventId ?? body.provider_schedule_event_id);
    if (existingEventId) {
      let templateId = parseIntParam(body.templateId ?? body.template_id);
      if (!templateId) {
        const template = await ensureDefaultTemplate(agencyId, req.user?.id);
        templateId = template.id;
      }
      const jobQuestionSetId = parseIntParam(body.jobQuestionSetId ?? body.job_question_set_id);
      const interview = await HiringInterview.create({
        agencyId,
        candidateUserId,
        hiringProfileId: body.hiringProfileId ?? body.hiring_profile_id ?? null,
        providerScheduleEventId: existingEventId,
        templateId,
        jobQuestionSetId: jobQuestionSetId || null,
        status: 'scheduled',
        interviewStartsAt: startsAt,
        interviewTimezone: body.timezone ?? body.interviewTimezone ?? body.interview_timezone ?? null,
        interviewerUserIds,
        createdByUserId: req.user?.id
      });
      const template = await InterviewHubTemplate.findById(templateId);
      const jobQuestionSet = jobQuestionSetId
        ? await InterviewHubJobQuestionSet.findById(jobQuestionSetId)
        : null;
      const flow = buildInterviewFlow({ template, jobQuestionSet, regenerateSalutation: true, regenerateIcebreaker: true });
      const artifact = await HiringInterviewArtifact.upsertByInterviewId(interview.id, { flowStateJson: flow });
      return res.status(201).json({ success: true, data: { interview, artifact, flow } });
    }

    const { scheduleHiringInterview } = await import('../services/hiringInterviewSchedule.service.js');
    const result = await scheduleHiringInterview({
      agencyId,
      candidateUserId,
      hostUserId: req.user.id,
      startsAt,
      durationMinutes: body.durationMinutes ?? body.duration_minutes ?? 60,
      timezone: body.timezone ?? body.interviewTimezone ?? body.interview_timezone ?? 'America/Denver',
      interviewerUserIds,
      templateId: parseIntParam(body.templateId ?? body.template_id),
      jobQuestionSetId: parseIntParam(body.jobQuestionSetId ?? body.job_question_set_id),
      hiringProfileId: parseIntParam(body.hiringProfileId ?? body.hiring_profile_id),
      sendInvites: body.sendInvites !== false && body.send_invites !== false,
      titleOverride: body.title || null
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

export const patchInterview = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const existing = await HiringInterview.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }
    await ensureAgencyAccess(req, existing.agency_id);

    const body = req.body || {};
    const updated = await HiringInterview.updateById(id, {
      hiringProfileId: body.hiringProfileId ?? body.hiring_profile_id,
      providerScheduleEventId: body.providerScheduleEventId ?? body.provider_schedule_event_id,
      templateId: body.templateId ?? body.template_id,
      jobQuestionSetId: body.jobQuestionSetId ?? body.job_question_set_id,
      status: body.status,
      interviewStartsAt: body.startsAt ?? body.interviewStartsAt ?? body.interview_starts_at,
      interviewTimezone: body.timezone ?? body.interviewTimezone ?? body.interview_timezone,
      interviewerUserIds: body.interviewerUserIds ?? body.interviewer_user_ids,
      inviteSentAt: body.inviteSentAt ?? body.invite_sent_at,
      publicJoinUrl: body.publicJoinUrl ?? body.public_join_url
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
};

export const getInterviewArtifacts = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const interview = await HiringInterview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }
    await ensureAgencyAccess(req, interview.agency_id);
    const artifact = await HiringInterviewArtifact.findByInterviewId(id);
    return res.json({ success: true, data: artifact });
  } catch (err) {
    return next(err);
  }
};

export const upsertInterviewArtifacts = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const interview = await HiringInterview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }
    await ensureAgencyAccess(req, interview.agency_id);

    const body = req.body || {};
    const artifact = await HiringInterviewArtifact.upsertByInterviewId(id, {
      flowStateJson: body.flowStateJson ?? body.flow_state_json,
      scorecardJson: body.scorecardJson ?? body.scorecard_json,
      privateNotesJson: body.privateNotesJson ?? body.private_notes_json,
      teamChatJson: body.teamChatJson ?? body.team_chat_json,
      transcriptSummary: body.transcriptSummary ?? body.transcript_summary
    });

    // Move scheduled → in_progress on first artifact write if still scheduled
    if (interview.status === 'scheduled') {
      await HiringInterview.updateById(id, { status: 'in_progress' });
    }

    return res.json({ success: true, data: artifact });
  } catch (err) {
    return next(err);
  }
};

export const finalizeInterviewHandler = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const interview = await HiringInterview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }
    await ensureAgencyAccess(req, interview.agency_id);

    const result = await finalizeInterview(id, {
      transcriptSummary: req.body?.transcriptSummary ?? req.body?.transcript_summary
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

export const getInterviewByScheduleEvent = async (req, res, next) => {
  try {
    const eventId = parseIntParam(req.params.eventId);
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId required' });
    }
    const interview = await HiringInterview.findByScheduleEventId(eventId);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'No interview linked to this schedule event' });
    }
    await ensureAgencyAccess(req, interview.agency_id);

    let template = interview.template_id
      ? await InterviewHubTemplate.findById(interview.template_id)
      : null;
    if (!template) {
      template = await ensureDefaultTemplate(interview.agency_id, req.user?.id);
    }
    const jobQuestionSet = interview.job_question_set_id
      ? await InterviewHubJobQuestionSet.findById(interview.job_question_set_id)
      : null;
    const artifact = await HiringInterviewArtifact.findByInterviewId(interview.id);
    const flow = buildInterviewFlow({
      template,
      jobQuestionSet,
      regenerateSalutation: false,
      regenerateIcebreaker: false,
      previousFlow: artifact?.flow_state_json || null
    });

    return res.json({
      success: true,
      data: { interview, template, jobQuestionSet, artifact, flow }
    });
  } catch (err) {
    return next(err);
  }
};

export const listCandidateInterviews = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const agencyId = agencyIdFromReq(req);
    if (agencyId) {
      await ensureAgencyAccess(req, agencyId);
    } else if (req.user?.role !== 'super_admin') {
      // Require agency scope for non-super-admins
      return res.status(400).json({ success: false, message: 'agencyId required' });
    }
    const rows = await HiringInterview.listByCandidateUserId(userId, { agencyId });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
};

// ── Random pools ───────────────────────────────────────────────────────────

export const randomIcebreaker = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    let pool = DEFAULT_ICEBREAKERS;
    if (agencyId) {
      await ensureAgencyAccess(req, agencyId);
      const templateId = parseIntParam(req.body?.templateId ?? req.body?.template_id);
      const template = templateId
        ? await InterviewHubTemplate.findById(templateId)
        : await InterviewHubTemplate.findDefaultByAgencyId(agencyId);
      if (Array.isArray(template?.icebreaker_pool_json) && template.icebreaker_pool_json.length) {
        pool = template.icebreaker_pool_json;
      }
    }
    return res.json({ success: true, data: { icebreaker: pickRandom(pool) } });
  } catch (err) {
    return next(err);
  }
};

export const randomSalutation = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    let pool = DEFAULT_SALUTATIONS;
    if (agencyId) {
      await ensureAgencyAccess(req, agencyId);
      const templateId = parseIntParam(req.body?.templateId ?? req.body?.template_id);
      const template = templateId
        ? await InterviewHubTemplate.findById(templateId)
        : await InterviewHubTemplate.findDefaultByAgencyId(agencyId);
      if (Array.isArray(template?.salutation_pool_json) && template.salutation_pool_json.length) {
        pool = template.salutation_pool_json;
      }
    }
    return res.json({ success: true, data: { salutation: pickRandom(pool) } });
  } catch (err) {
    return next(err);
  }
};
