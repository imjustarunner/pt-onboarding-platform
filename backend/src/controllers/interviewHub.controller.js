import { createHash } from 'node:crypto';
import { tenantInterviewJoinUrl } from '../utils/tenantMeetingUrl.js';
import { deliverExistingInterview } from '../services/hiringInterviewDelivery.service.js';
import { sendHiringInterviewInviteEmail } from '../services/hiringInterviewInviteEmail.service.js';
import { requireHiringInterviewAccess, canAccessHiringInterview } from '../services/hiringInterviewAccess.service.js';
import { interviewArtifactForViewer, saveInterviewWorkspace } from '../services/hiringInterviewWorkspace.service.js';
import HiringResumeParse from '../models/HiringResumeParse.model.js';
import HiringResearchReport from '../models/HiringResearchReport.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import { meetingParticipantRows } from '../services/meetingParticipants.service.js';
import { defaultMeetingSettings, parseMeetingSettings } from '../services/meetingSettingsPolicy.js';
import { ACTIVE_EMPLOYEE_SQL } from '../utils/staffEligibility.js';
import { interviewSmsCalendarSettings, interviewSmsProgram } from '../services/hiringInterviewSms.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import InterviewHubTemplate from '../models/InterviewHubTemplate.model.js';
import InterviewHubJobQuestionSet from '../models/InterviewHubJobQuestionSet.model.js';
import {jobInterviewSettings} from '../utils/jobInterviewSettingsPolicy.js';
import {starterInterviewQuestions,starterInterviewSource,questionsWithFingerprints,questionSetWithFingerprints} from '../services/jobInterviewQuestions.service.js';
import HiringInterview from '../models/HiringInterview.model.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventAttendee from '../models/ProviderScheduleEventAttendee.model.js';
import VonageVideoService from '../services/vonageVideo.service.js';
import EmailTemplateService from '../services/emailTemplate.service.js';
import {
  ensureDefaultTemplate,
  buildInterviewFlow,
  interviewTemplateWithOpeners,
  finalizeInterview,
  pickRandom,
  DEFAULT_SALUTATIONS,
  DEFAULT_ICEBREAKERS
} from '../services/interviewHub.service.js';

export async function buildInterviewEndedGuestPayload(agencyId) {
  const agency = agencyId ? await Agency.findById(agencyId) : null;
  const teamLabel = EmailTemplateService.getTerminologySettings(agency);
  const orgName = String(agency?.name || agency?.official_name || 'our organization').trim();
  const contactEmail = String(agency?.onboarding_team_email || agency?.people_ops_email || '').trim();
  const ext = String(agency?.phone_extension || '').trim();
  const rawPhone = String(agency?.phone_number || '').trim();
  const phone = rawPhone ? (ext ? `${rawPhone} (ext. ${ext})` : rawPhone) : '';
  return {
    interviewGuestEnded: true,
    headline: 'Your interview has ended',
    message:
      `Thank you for your time today — we truly appreciate you meeting with us. `
      + `If you have any follow-up questions, please reach out to ${teamLabel} at ${orgName}.`,
    peopleOpsLabel: teamLabel,
    agencyName: orgName,
    contactEmail: contactEmail || null,
    contactPhone: phone || null
  };
}

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

async function jobGuideScope(req) {
  const agencyId=agencyIdFromReq(req),jobDescriptionId=parseIntParam(req.params.jobDescriptionId);
  await ensureAgencyAccess(req,agencyId);
  const [[job]]=await pool.execute('SELECT id,title FROM hiring_job_descriptions WHERE id=? AND agency_id=?',[jobDescriptionId,agencyId]);
  if(!job)throw Object.assign(new Error('Job description not found for this agency.'),{status:404});
  return {agencyId,jobDescriptionId,job};
}
async function jobGuideData({agencyId,jobDescriptionId,job}) {
  const [set,template,questionSets]=await Promise.all([InterviewHubJobQuestionSet.findDefaultForJob(agencyId,jobDescriptionId),InterviewHubTemplate.findDefaultByAgencyId(agencyId),InterviewHubJobQuestionSet.listByAgencyId(agencyId,{jobDescriptionId})]);
  const flow=buildInterviewFlow({template,jobQuestionSet:set});
  const availableSets=set && !questionSets.some(row=>row.id===set.id)?[set,...questionSets]:questionSets;
  return {job,questionSet:set,questions:questionsWithFingerprints(set?.questions_json || []),questionSets:availableSets.map(questionSetWithFingerprints),starterQuestions:questionsWithFingerprints(starterInterviewQuestions(template)),starterSource:starterInterviewSource(template),criteria:flow.scorecardCriteria,
    criteriaSource:set?.scorecard_criteria_json?.length?'job':template?.scorecard_criteria_json?.length?'agency':'platform'};
}
export const getJobInterviewGuide=async(req,res,next)=>{
  try{res.json({success:true,data:await jobGuideData(await jobGuideScope(req))});}catch(error){next(error);}
};
export const saveJobInterviewGuide=async(req,res,next)=>{
  try {
    const scope=await jobGuideScope(req),settings=jobInterviewSettings(req.body || {});
    await InterviewHubJobQuestionSet.saveDefaultForJob({questionsJson:settings.questions,scorecardCriteriaJson:settings.criteria,
      agencyId:scope.agencyId,jobDescriptionId:scope.jobDescriptionId,title:`${scope.job.title} interview guide`,createdByUserId:req.user.id});
    res.json({success:true,data:await jobGuideData(scope)});
  }catch(error){next(error);}
};

export const getInterviewQuestionOptions=async(req,res,next)=>{
  try {
    const agencyId=agencyIdFromReq(req);await ensureAgencyAccess(req,agencyId);
    const [template,sets]=await Promise.all([InterviewHubTemplate.findDefaultByAgencyId(agencyId),InterviewHubJobQuestionSet.listByAgencyId(agencyId)]);
    res.json({success:true,data:{questionSet:null,questionSets:sets.filter(set=>set.job_description_id==null).map(questionSetWithFingerprints),starterQuestions:questionsWithFingerprints(starterInterviewQuestions(template)),starterSource:starterInterviewSource(template)}});
  }catch(error){next(error);}
};

async function validateQuestionSetJob(agencyId,jobDescriptionId) {
  if(jobDescriptionId==null)return null;
  const id=Number(jobDescriptionId);
  if(!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('Choose a valid job posting.'),{status:400});
  const [[job]]=await pool.execute('SELECT id FROM hiring_job_descriptions WHERE id=? AND agency_id=?',[id,agencyId]);
  if(!job)throw Object.assign(new Error('Job posting not found for this agency.'),{status:404});
  return id;
}
async function assertUnpinnedQuestionSet(id,agencyId) {
  const [[job]]=await pool.execute('SELECT id FROM hiring_job_descriptions WHERE interview_question_set_id=? AND agency_id=? LIMIT 1',[id,agencyId]);
  if(job)throw Object.assign(new Error('This is a job’s default guide. Edit its questions on the job posting; its attached guide cannot be removed or moved.'),{status:409});
}

export const listJobQuestionSets = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    const jobDescriptionId = parseIntParam(req.query?.jobDescriptionId ?? req.query?.job_description_id);
    const rows = await InterviewHubJobQuestionSet.listByAgencyId(agencyId, {
      jobDescriptionId: jobDescriptionId || null,
      includeInactive: String(req.query?.includeInactive || '') === '1'
    });
    return res.json({ success: true, data: rows.map(questionSetWithFingerprints) });
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
    const questionsJson = jobInterviewSettings({questions:body.questionsJson ?? body.questions_json ?? body.questions ?? []}).questions;
    const jobDescriptionId=await validateQuestionSetJob(agencyId,body.jobDescriptionId ?? body.job_description_id ?? null);
    const row = await InterviewHubJobQuestionSet.create({
      agencyId,
      jobDescriptionId,
      title,
      questionsJson,
      isActive: body.isActive ?? body.is_active ?? true,
      createdByUserId: req.user?.id
    });
    return res.status(201).json({ success: true, data: questionSetWithFingerprints(row) });
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
    const jobId=body.jobDescriptionId!==undefined?body.jobDescriptionId:body.job_description_id;
    const jobDescriptionId=jobId===undefined?undefined:await validateQuestionSetJob(existing.agency_id,jobId);
    const isActive=body.isActive ?? body.is_active;
    if((jobDescriptionId!==undefined && Number(jobDescriptionId)!==Number(existing.job_description_id)) || isActive===false || isActive===0)await assertUnpinnedQuestionSet(id,existing.agency_id);
    const rawQuestions=body.questionsJson ?? body.questions_json ?? body.questions;
    const updated = await InterviewHubJobQuestionSet.updateById(id, {
      jobDescriptionId,
      title: body.title,
      questionsJson: rawQuestions===undefined?undefined:jobInterviewSettings({questions:rawQuestions}).questions,
      isActive
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
    await assertUnpinnedQuestionSet(id,existing.agency_id);
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
    return res.json({ success: true, data: await Promise.all((rows || []).map(enrichInterviewRow)) });
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
    await requireHiringInterviewAccess(req.user, interview);

    let template = interview.template_id
      ? await InterviewHubTemplate.findById(interview.template_id)
      : null;
    if (!template) {
      template = await ensureDefaultTemplate(interview.agency_id, req.user?.id);
    }
    const jobQuestionSet = interview.job_question_set_id
      ? await InterviewHubJobQuestionSet.findById(interview.job_question_set_id)
      : null;
    const artifact = interviewArtifactForViewer(await HiringInterviewArtifact.findByInterviewId(id), req.user.id);
    const flow = buildInterviewFlow({
      template,
      jobQuestionSet,
      regenerateSalutation: false,
      regenerateIcebreaker: false,
      previousFlow: artifact?.flow_state_json || null
    });

    return res.json({
      success: true,
      data: { interview, template: interviewTemplateWithOpeners(template), jobQuestionSet, artifact, flow }
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

    if (body.providerScheduleEventId || body.provider_schedule_event_id) return res.status(400).json({ error: { message: 'Create the interview through the interview scheduler.' } });

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
      questionSelection: body.questionSelection,
      hiringProfileId: parseIntParam(body.hiringProfileId ?? body.hiring_profile_id),
      smsConsent: body.smsConsent,
      sendInvites: body.sendInvites !== false && body.send_invites !== false,
      titleOverride: body.title || body.displayTitle || body.display_title || null,
      interviewRound: body.interviewRound ?? body.interview_round ?? 'initial',
      roundLabelCustom: body.roundLabelCustom ?? body.round_label_custom ?? null,
      jobTitleOverride: body.jobTitle ?? body.job_title ?? null,
      overrideScheduleHolds: body.overrideScheduleHolds === true || body.override_schedule_holds === true
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

    const { rescheduleHiringInterview } = await import('../services/hiringInterviewReschedule.service.js');
    const result = await rescheduleHiringInterview(existing, req.body || {});
    return res.json({ success: true, data: { ...await enrichInterviewRow(result.interview), delivery: result.delivery, calendarWarning: result.calendarWarning } });
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
    await requireHiringInterviewAccess(req.user, interview);
    const artifact = interviewArtifactForViewer(await HiringInterviewArtifact.findByInterviewId(id), req.user.id);
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
    await requireHiringInterviewAccess(req.user, interview);

    const body = req.body || {};
    const actor = await User.findById(req.user.id);
    const artifact = await saveInterviewWorkspace(id, body, actor);

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
    await requireHiringInterviewAccess(req.user, interview);

    const result = await finalizeInterview(id, {
      transcriptSummary: req.body?.transcriptSummary ?? req.body?.transcript_summary
    });
    return res.json({ success: true, data: { ...result, artifact: interviewArtifactForViewer(result?.artifact, req.user.id) } });
  } catch (err) {
    return next(err);
  }
};

/**
 * End interviewee access while interviewers remain in the room.
 * Host can still leave later and end the meeting for everyone.
 */
export const endInterviewGuestAccess = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id required' });
    }
    const interview = await HiringInterview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }
    await requireHiringInterviewAccess(req.user, interview);

    const endedAt = interview.guest_access_ended_at ? new Date(interview.guest_access_ended_at) : new Date();
    const updated = interview.guest_access_ended_at
      ? interview
      : await HiringInterview.updateById(id, {
          guestAccessEndedAt: endedAt,
          guestAccessEndedByUserId: req.user?.id || null,
          status: interview.status === 'cancelled' ? 'cancelled' : 'completed'
        });

    // Clear splash eligibility on the hiring profile (no more "Did you attend?" follow-up).
    try {
      if (interview.hiring_profile_id) {
        await pool.execute(
          `UPDATE hiring_profiles
           SET interview_status = 'completed',
               interview_updated_at = UTC_TIMESTAMP()
           WHERE id = ?
           LIMIT 1`,
          [interview.hiring_profile_id]
        );
      } else if (interview.candidate_user_id) {
        await pool.execute(
          `UPDATE hiring_profiles
           SET interview_status = 'completed',
               interview_updated_at = UTC_TIMESTAMP()
           WHERE id = (
             SELECT id FROM (
               SELECT id FROM hiring_profiles
               WHERE candidate_user_id = ?
               ORDER BY updated_at DESC, id DESC
               LIMIT 1
             ) latest_hp
           )`,
          [interview.candidate_user_id]
        );
      }
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('[interviewHub] profile interview_status update failed', e?.message || e);
      }
    }

    const guestPayload = await buildInterviewEndedGuestPayload(interview.agency_id);
    let video = { ok: false, signaled: false, disconnected: 0 };
    const eventId = interview.provider_schedule_event_id;
    if (eventId) {
      try {
        const event = await ProviderScheduleEvent.findById(eventId);
        const sessionId = String(event?.twilio_room_sid || '').trim();
        if (sessionId) {
          video = await VonageVideoService.endGuestInterviewAccess(sessionId, {
            candidateUserId: interview.candidate_user_id,
            guestIdentity: `guest-iv-${createHash('sha256').update(String(event.participant_join_token || event.join_token)).digest('hex').slice(0, 16)}`,
            details: guestPayload
          });
        }
      } catch (e) {
        console.warn('[interviewHub] guest video end failed', e?.message || e);
      }
    }

    return res.json({
      success: true,
      data: {
        interview: updated,
        guestAccessEndedAt: updated?.guest_access_ended_at || endedAt,
        video,
        ...guestPayload
      }
    });
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
    await requireHiringInterviewAccess(req.user, interview);

    let template = interview.template_id
      ? await InterviewHubTemplate.findById(interview.template_id)
      : null;
    if (!template) {
      template = await ensureDefaultTemplate(interview.agency_id, req.user?.id);
    }
    const jobQuestionSet = interview.job_question_set_id
      ? await InterviewHubJobQuestionSet.findById(interview.job_question_set_id)
      : null;
    const artifact = interviewArtifactForViewer(await HiringInterviewArtifact.findByInterviewId(interview.id), req.user.id);
    const flow = buildInterviewFlow({
      template,
      jobQuestionSet,
      regenerateSalutation: false,
      regenerateIcebreaker: false,
      previousFlow: artifact?.flow_state_json || null
    });

    return res.json({
      success: true,
      data: { interview, template: interviewTemplateWithOpeners(template), jobQuestionSet, artifact, flow }
    });
  } catch (err) {
    return next(err);
  }
};

async function hostJoinUrlForInterview(row) {
  if (!row) return null;
  const hostToken = String(row.host_join_token || row.hostJoinToken || '').trim();
  if (!hostToken) return null;
  return tenantInterviewJoinUrl(row.agency_id || row.agencyId, hostToken);
}

async function enrichInterviewRow(row) {
  if (!row) return row;
  return {
    ...row,
    public_join_url: row.guest_join_token ? await tenantInterviewJoinUrl(row.agency_id || row.agencyId, row.guest_join_token) : row.public_join_url,
    host_join_url: await hostJoinUrlForInterview(row)
  };
}

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
    return res.json({ success: true, data: await Promise.all((rows || []).map(enrichInterviewRow)) });
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
      pool = interviewTemplateWithOpeners(template).icebreaker_pool_json;
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
      pool = interviewTemplateWithOpeners(template).salutation_pool_json;
    }
    return res.json({ success: true, data: { salutation: pickRandom(pool) } });
  } catch (err) {
    return next(err);
  }
};

export const getCalendarInterview = async (req, res, next) => {
  try {
    const eventId = parseIntParam(req.params.eventId);
    const interview = await HiringInterview.findByScheduleEventId(eventId);
    if (!interview) return res.status(404).json({ error: { code: 'interview_not_linked', message: 'No Plotline interview is linked to this calendar entry.' } });
    await requireHiringInterviewAccess(req.user, interview);
    const [event, agency, profile, organizer] = await Promise.all([
      ProviderScheduleEvent.findById(eventId),
      Agency.findById(interview.agency_id),
      HiringProfile.findByCandidateUserId(interview.candidate_user_id),
      User.findById(interview.created_by_user_id)
    ]);
    if (!event || Number(event.agency_id) !== interview.agency_id || event.meeting_subtype !== 'interview') {
      return res.status(404).json({ error: { message: 'Interview calendar entry unavailable.' } });
    }
    const canManage = Number(event.provider_id) === Number(req.user.id) || await canManageCalendarInterview(req, interview);
    const active = String(event.status).toUpperCase() === 'ACTIVE' && !event.meeting_completed_at
      && !interview.guest_access_ended_at && !['completed', 'cancelled'].includes(interview.status)
      && parseUtcDate(event.start_at) > new Date();
    const [job, participants, staff] = await Promise.all([
      profile?.job_description_id ? HiringJobDescription.findById(profile.job_description_id) : null,
      meetingParticipantRows(event, { resolveEmails: false }),
      canManage && active ? listCalendarInterviewers(interview.agency_id) : []
    ]);
    const sameAgencyJob = Number(job?.agency_id) === interview.agency_id ? job : null;
    const members = participants.map(person => ({
      id: Number(person.id), name: person.name, rsvp: person.rsvp,
      role: Number(person.id) === interview.candidate_user_id ? 'Candidate' : person.isHost ? 'Organizer' : 'Interviewer'
    }));
    const memberIds = new Set(members.map(person => person.id));
    const settings = parseMeetingSettings(event.meeting_settings_json);
    res.json({ data: {
      interviewId: interview.id, agencyName: agency?.name || agency?.official_name,
      scheduledBy: [organizer?.preferred_name || organizer?.first_name, organizer?.last_name].filter(Boolean).join(' ')
        || members.find(person => person.role === 'Organizer')?.name || '',
      candidateName: members.find(person => person.role === 'Candidate')?.name || '',
      jobTitle: sameAgencyJob?.title || profile?.applied_role || '',
      jobLocation: [sameAgencyJob?.city, sameAgencyJob?.state].filter(Boolean).join(', '),
      startsAt: parseUtcDate(event.start_at)?.toISOString(),
      endsAt: parseUtcDate(event.end_at)?.toISOString(),
      timeZone: event.event_timezone || interview.interview_timezone || 'America/Denver',
      location: event.location_text || (Number(event.platform_video_link ?? 1) || event.google_meet_link ? 'Virtual interview' : ''),
      participants: members,
      status: event.status, canManage: canManage && active,
      canRsvp: active && members.some(person => person.id === Number(req.user.id) && person.role !== 'Candidate'),
      availableStaff: staff.filter(person => !memberIds.has(Number(person.id)))
        .map(person => ({ id: Number(person.id), name: [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ') }))
        .filter(person => person.name).sort((a, b) => a.name.localeCompare(b.name)),
      reminders: settings.reminders ?? defaultMeetingSettings('interview').reminders,
      emailReminders: settings.interviewEmailReminders ?? !!Number(event.notify_participants),
      smsReminders: settings.interviewSmsReminders === true,
      ...(await interviewSmsCalendarSettings(interview))
    } });
  } catch (error) { next(error); }
};

async function listCalendarInterviewers(agencyId) {
  const [rows] = await pool.execute(`SELECT u.id, u.preferred_name, u.first_name, u.last_name
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    WHERE ${ACTIVE_EMPLOYEE_SQL}`, [agencyId]);
  return rows;
}

async function canManageCalendarInterview(req, interview) {
  return canAccessHiringInterview(req.user, { ...interview, interviewer_user_ids_json: [] });
}

export const getInterviewSmsProgram = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    res.json({ data: await interviewSmsProgram(agencyId) });
  } catch (error) { next(error); }
};

export const updateCalendarInterview = async (req, res, next) => {
  try {
    const id = parseIntParam(req.params.eventId);
    const interview = await HiringInterview.findByScheduleEventId(id);
    if (!interview) return res.status(404).json({ error: { message: 'Interview not found.' } });
    await requireHiringInterviewAccess(req.user, interview);
    const event = await ProviderScheduleEvent.findById(id);
    if (!event || Number(event.agency_id) !== interview.agency_id || event.meeting_subtype !== 'interview') {
      return res.status(404).json({ error: { message: 'Interview calendar entry unavailable.' } });
    }
    if (Number(event.provider_id) !== Number(req.user.id) && !await canManageCalendarInterview(req, interview)) {
      return res.status(403).json({ error: { message: 'The organizer or a hiring manager can change invitations and reminders.' } });
    }
    if (req.body?.startsAt) {
      if (event.status !== 'ACTIVE' || event.meeting_completed_at || parseUtcDate(event.start_at) <= new Date()) {
        return res.status(409).json({ error: { message: 'This interview is no longer open for schedule changes.' } });
      }
      const { parseInterviewStart } = await import('../services/hiringInterviewSchedule.service.js');
      const zone = event.event_timezone || interview.interview_timezone || 'America/Denver';
      if (!(parseInterviewStart(req.body.startsAt, zone)?.startDate > new Date())) {
        return res.status(400).json({ error: { message: 'Choose a future interview time.' } });
      }
      const { rescheduleHiringInterview } = await import('../services/hiringInterviewReschedule.service.js');
      const result = await rescheduleHiringInterview(interview, { startsAt: req.body.startsAt, timezone: zone });
      return res.json({ data: { calendarWarning: result.calendarWarning, delivery: result.delivery } });
    }
    const { updateHiringInterviewCalendar } = await import('../services/hiringInterviewCalendarSettings.service.js');
    const result = await updateHiringInterviewCalendar({ interview, event, input: req.body || {}, actor: req.user });
    res.json({ data: result });
  } catch (error) { next(error); }
};

export const saveCalendarInterviewPreparation = async (req, res, next) => {
  try {
    const interview = await HiringInterview.findByScheduleEventId(parseIntParam(req.params.eventId));
    if (!interview) return res.status(404).json({ error: { message: 'Interview not found.' } });
    await requireHiringInterviewAccess(req.user, interview);
    const event = await ProviderScheduleEvent.findById(interview.provider_schedule_event_id);
    if (!event || Number(event.agency_id) !== interview.agency_id || event.meeting_subtype !== 'interview'
      || event.status === 'CANCELLED' || interview.status === 'cancelled') {
      return res.status(409).json({ error: { message: 'This interview is unavailable for editing.' } });
    }
    const { questionPatches, myRatings } = req.body || {};
    const artifact = await saveInterviewWorkspace(interview.id, { questionPatches, myRatings }, req.user);
    return res.json({ data: { interview: { status: interview.status }, artifact, flow: artifact.flow_state_json } });
  } catch (error) { next(error); }
};

export const getInterviewBrief = async (req, res, next) => {
  try {
    const interview = await HiringInterview.findById(parseIntParam(req.params.id));
    if (!interview) return res.status(404).json({ error: { message: 'Interview not found' } });
    await requireHiringInterviewAccess(req.user, interview);
    const uid = interview.candidate_user_id;
    const [summary, report, profile, candidate, docsResult] = await Promise.all([
      HiringResumeParse.findLatestStructuredByCandidateUserId(uid),
      HiringResearchReport.findLatestAiByCandidateUserId(uid),
      HiringProfile.findByCandidateUserId(uid), User.findById(uid),
      pool.execute(`SELECT id, title, original_name, doc_type FROM user_admin_docs WHERE user_id = ?
        AND storage_path IS NOT NULL AND (doc_type IN ('resume', 'cover_letter') OR (doc_type = 'application_material'
          AND (LOWER(COALESCE(title, '')) LIKE '%cover%' OR LOWER(COALESCE(original_name, '')) LIKE '%cover%')))
        ORDER BY created_at DESC`, [uid])
    ]);
    res.json({ data: { candidateName: [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' '),
      role: profile?.applied_role || '', coverLetter: profile?.cover_letter_text || '',
      summary: summary?.extracted_json || null, reportText: report?.report_text || '', documents: docsResult[0] || [] } });
  } catch(e) { next(e); }
};

export const viewInterviewDocument = async (req, res, next) => {
  try {
    const interview = await HiringInterview.findById(parseIntParam(req.params.id));
    if (!interview) return res.status(404).json({ error: { message: 'Interview not found' } });
    await requireHiringInterviewAccess(req.user, interview);
    const { viewCandidateResume } = await import('./hiring.controller.js');
    req.params.userId = String(interview.candidate_user_id);
    req.query.agencyId = String(interview.agency_id);
    return viewCandidateResume(req, res, next);
  } catch(e) { next(e); }
};

export const previewInterviewInvite = async (req, res, next) => {
  try {
    const agencyId = agencyIdFromReq(req);
    await ensureAgencyAccess(req, agencyId);
    const candidateId = Number(req.body.candidateUserId);
    const agencies = await User.getAgencies(candidateId);
    if (!agencies.some(a => Number(a.id) === agencyId)) return res.status(404).json({ error: { message: 'Candidate not found' } });
    const candidate = await User.findById(candidateId);
    const profile = await HiringProfile.findByCandidateUserId(candidateId);
    const interviewerRows = [];
    for (const id of [...new Set([req.user.id, ...(req.body.interviewerUserIds || [])].map(Number))]) {
      const memberships = await User.getAgencies(id);
      if (memberships.some(a => Number(a.id) === agencyId)) interviewerRows.push(await User.findById(id));
    }
    const { parseInterviewStart } = await import('../services/hiringInterviewSchedule.service.js');
    const start = parseInterviewStart(req.body.startsAt, req.body.timezone)?.startDate;
    const end = start ? new Date(start.getTime() + Math.min(240, Math.max(15, Number(req.body.durationMinutes) || 60)) * 60000) : null;
    const preview = await sendHiringInterviewInviteEmail({ agencyId, candidate,
      title: String(req.body.title || 'Interview invitation').slice(0, 255),
      startsAt: start, endsAt: end, timezone: req.body.timezone || 'America/Denver',
      whenLabel: `${String(req.body.startsAt || 'Choose a date and time')} (${String(req.body.timezone || 'America/Denver')})`,
      publicJoinUrl: '#interview-link-added-when-scheduled', interviewerRows: interviewerRows.filter(Boolean),
      jobDescriptionId: profile?.job_description_id, jobTitle: profile?.applied_role, preview: true });
    res.json({ data: preview });
  } catch(e) { next(e); }
};

export const resendInterviewInvite = async (req, res, next) => {
  try {
    const interview = await HiringInterview.findById(parseIntParam(req.params.id));
    if (!interview) return res.status(404).json({ error: { message: 'Interview not found' } });
    await ensureAgencyAccess(req, interview.agency_id);
    res.json({ data: { delivery: await deliverExistingInterview(interview) } });
  } catch(e) { next(e); }
};
