import pool from '../config/database.js';
import StudentSubject from '../models/StudentSubject.model.js';
import EvaluationSummary from '../models/EvaluationSummary.model.js';
import StudentLearningPlan from '../models/StudentLearningPlan.model.js';
import {
  AcademicSkillEvidence,
  TutoringSessionBrief,
  TutoringSessionNote
} from '../models/TutoringSessionLearning.model.js';
import StaffClientComfortPreference from '../models/StaffClientComfortPreference.model.js';
import {
  TutoringAiArtifact,
  TutoringEvaluationItem,
  TutoringEvaluationResponse,
  TutoringProgressAlert,
  TutoringProgressReport,
  TutoringCasStandard,
  TutoringPackageMilestone,
  TutoringOralReadingProbe,
  TutoringDocumentExtraction,
  TutoringPracticeAssignment,
  TutoringAssessmentBlueprint
} from '../models/TutoringLearningOsExtended.model.js';
import { STUDENT_SUBJECT_KEYS } from '../constants/tutoringLearningOs.js';
import {
  callTutoringAiJson,
  buildLearningPlanPrompt,
  buildSessionBriefPrompt,
  buildParentUpdatePrompt,
  buildPracticePrompt,
  buildTutorAssistPrompt
} from './tutoringAiDraft.service.js';

function subjectLabelForKey(key) {
  return STUDENT_SUBJECT_KEYS.find((s) => s.key === key)?.label || key;
}

/**
 * Enroll a student in a subject learning track.
 */
export async function enrollStudentSubject(payload, actorUserId) {
  const label = payload.subjectLabel || subjectLabelForKey(payload.subjectKey);
  const subject = await StudentSubject.create(
    {
      ...payload,
      subjectLabel: label,
      status: payload.status || 'baseline_needed'
    },
    actorUserId
  );

  // Default package milestones: baseline now, probe after 4 sessions, plan review after 6
  try {
    await TutoringPackageMilestone.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        milestoneType: 'baseline',
        dueAfterSessionCount: 0,
        notes: 'Complete baseline evaluation'
      },
      actorUserId
    );
    await TutoringPackageMilestone.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        milestoneType: 'probe',
        dueAfterSessionCount: 4,
        notes: 'Progress probe'
      },
      actorUserId
    );
    await TutoringPackageMilestone.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        milestoneType: 'plan_review',
        dueAfterSessionCount: 6,
        notes: 'Learning plan review'
      },
      actorUserId
    );
  } catch {
    // milestones table may not exist yet in partial deploys
  }

  return subject;
}

/**
 * Manual baseline → evaluation summary → optional draft learning plan shell.
 */
export async function saveManualBaseline(payload, actorUserId) {
  const subject = await StudentSubject.findById(payload.studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }

  const summary = await EvaluationSummary.create(
    {
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId: subject.id,
      evaluationPath: payload.evaluationPath || 'manual_baseline',
      evaluationType: payload.evaluationType || 'baseline',
      administeredAt: payload.administeredAt || new Date(),
      gradeAtEval: payload.gradeAtEval || subject.school_grade,
      strengths: payload.strengths || [],
      needs: payload.needs || [],
      skillMap: payload.skillMap || {},
      narrativeSummary: payload.narrativeSummary || null,
      externalSourceLabel: payload.externalSourceLabel || null,
      status: 'completed'
    },
    actorUserId
  );

  await StudentSubject.update(subject.id, { status: 'learning_plan_draft' }, actorUserId);

  let plan = null;
  if (payload.createPlanDraft !== false) {
    plan = await StudentLearningPlan.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        evaluationSummaryId: summary.id,
        title: `${subject.subject_label} Learning Plan`,
        status: 'draft',
        strengths: payload.strengths || [],
        priorityNeeds: payload.needs || [],
        instructionalStrategies: payload.instructionalStrategies || [],
        progressMonitoringPlan: payload.progressMonitoringPlan || {
          cadence: 'every_session',
          probeEveryNSessions: 4
        },
        parentSummary: payload.parentSummary || null,
        standardsVersionKey: payload.standardsVersionKey || subject.standards_version_key
      },
      actorUserId
    );

    const goals = payload.goals || [];
    for (let i = 0; i < goals.length; i += 1) {
      const g = goals[i];
      const goal = await StudentLearningPlan.addGoal({
        learningPlanId: plan.id,
        studentSubjectId: subject.id,
        title: g.title,
        description: g.description || null,
        skillKey: g.skillKey || null,
        skillLabel: g.skillLabel || null,
        baselineText: g.baselineText || null,
        successCriteria: g.successCriteria || null,
        measurementMethod: g.measurementMethod || 'tutor_rating',
        status: g.status || 'not_assessed',
        sortOrder: g.sortOrder ?? i,
        standardsRefs: g.standardsRefs || []
      });
      for (const obj of g.objectives || []) {
        await StudentLearningPlan.addObjective({
          planGoalId: goal.id,
          learningPlanId: plan.id,
          title: obj.title,
          description: obj.description || null,
          sortOrder: obj.sortOrder || 0,
          targetDate: obj.targetDate || null
        });
      }
    }
  }

  return { summary, plan: plan ? await StudentLearningPlan.getPlanBundle(plan.id) : null };
}

export async function approveLearningPlan(planId, actorUserId) {
  const plan = await StudentLearningPlan.approve(planId, actorUserId);
  if (!plan) {
    const err = new Error('Learning plan not found');
    err.status = 404;
    throw err;
  }
  await StudentSubject.update(plan.student_subject_id, { status: 'active_tutoring' }, actorUserId);
  return StudentLearningPlan.getPlanBundle(planId);
}

/**
 * Build a session brief from active plan + last note (Gemini when available).
 */
export async function generateSessionBrief({ studentSubjectId, sessionId = null }, actorUserId) {
  const subject = await StudentSubject.findById(studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }
  const activePlan = await StudentLearningPlan.findActiveBySubject(studentSubjectId);
  const goals = activePlan ? await StudentLearningPlan.listGoals(activePlan.id) : [];
  const focusGoals = goals
    .filter((g) => !['secure', 'mastered', 'generalized'].includes(String(g.status)))
    .slice(0, 3);
  const priorNotes = await TutoringSessionNote.listBySubject(studentSubjectId, { limit: 1 });
  const prior = priorNotes[0];

  let plannedActivities = focusGoals.map((g) => ({
    goalId: g.id,
    title: g.title,
    skillKey: g.skill_key,
    suggestedFocus: g.success_criteria || g.description || 'Practice toward goal success criteria'
  }));
  let tutorPrepNotes = focusGoals.length
    ? `Focus: ${focusGoals.map((g) => g.title).join('; ')}`
    : 'No active goals — mark session as general/homework support if needed.';
  let priorSessionRecap = prior
    ? prior.summary || prior.next_steps || prior.challenges_observed || null
    : null;
  let materials = [];
  let guide = null;
  let generatedBy = 'system';
  let aiArtifactId = null;
  let modelName = 'rules-v1';

  const standards = await TutoringCasStandard.search({
    subjectKey: subject.subject_key,
    gradeBand: mapGradeToBand(subject.school_grade),
    q: focusGoals[0]?.title || null
  }).catch(() => []);

  if (focusGoals.length) {
    const ai = await callTutoringAiJson({
      prompt: buildSessionBriefPrompt({
        subject,
        goals: focusGoals,
        priorNote: prior,
        standards
      }),
      temperature: 0.35,
      maxOutputTokens: 1200
    });
    if (ai.ok && ai.draft) {
      modelName = ai.modelName || 'gemini';
      generatedBy = 'ai';
      if (Array.isArray(ai.draft.plannedActivities) && ai.draft.plannedActivities.length) {
        plannedActivities = ai.draft.plannedActivities.map((a, i) => ({
          goalId: a.goalId || focusGoals[i % focusGoals.length]?.id || null,
          title: a.title || focusGoals[i % focusGoals.length]?.title,
          skillKey: a.skillKey || focusGoals[i % focusGoals.length]?.skill_key,
          suggestedFocus: a.suggestedFocus || a.title
        }));
      }
      if (ai.draft.tutorPrepNotes) tutorPrepNotes = String(ai.draft.tutorPrepNotes);
      if (ai.draft.priorSessionRecap) priorSessionRecap = String(ai.draft.priorSessionRecap);
      if (Array.isArray(ai.draft.materials)) materials = ai.draft.materials;
      guide = {
        objective: ai.draft.objective || focusGoals[0]?.title || null,
        standardsAlignment:
          ai.draft.standardsAlignment ||
          (standards || []).slice(0, 3).map((s) => ({ code: s.standard_code, title: s.title })),
        teachingSequence: ai.draft.teachingSequence || null,
        tutorPrompts: ai.draft.tutorPrompts || [],
        workedExampleNotes: ai.draft.workedExampleNotes || null,
        misconceptions: ai.draft.misconceptions || [],
        checkForUnderstanding: ai.draft.checkForUnderstanding || [],
        interventionStrategies: ai.draft.interventionStrategies || []
      };
      const artifact = await TutoringAiArtifact.create(
        {
          agencyId: subject.agency_id,
          clientId: subject.client_id,
          studentSubjectId: subject.id,
          artifactType: 'session_brief',
          modelName,
          promptVersion: 'session-brief-3',
          inputRef: { sessionId, goalIds: focusGoals.map((g) => g.id) },
          draftContent: ai.draft,
          draftText: tutorPrepNotes
        },
        actorUserId
      );
      aiArtifactId = artifact.id;
    }
  }

  if (!guide) {
    guide = {
      objective: focusGoals[0]?.title || `${subject.subject_label} session`,
      standardsAlignment: (standards || []).slice(0, 3).map((s) => ({
        code: s.standard_code,
        title: s.title
      })),
      teachingSequence: [
        { label: 'Warm-Up', minutes: 5, focus: 'Activate prior knowledge' },
        { label: 'Review', minutes: 5, focus: 'Quick check on last session' },
        { label: 'Teach & Model', minutes: 15, focus: focusGoals[0]?.title || 'Model the target skill' },
        { label: 'Guided Practice', minutes: 15, focus: 'Student practice with support' },
        { label: 'Check & Reflect', minutes: 5, focus: 'Exit check + next steps' }
      ],
      tutorPrompts: ['What do you notice?', 'Show me how you figured that out.', 'Can you explain it another way?'],
      workedExampleNotes: null,
      misconceptions: [],
      checkForUnderstanding: ['Can the student complete one item independently?'],
      interventionStrategies: ['Use a visual model', 'Reduce the number size', 'Provide a sentence frame']
    };
  }

  const brief = await TutoringSessionBrief.create(
    {
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId,
      learningPlanId: activePlan?.id || null,
      sessionId,
      focusGoalIds: focusGoals.map((g) => g.id),
      plannedActivities,
      materials,
      guide,
      priorSessionRecap,
      tutorPrepNotes,
      status: 'draft',
      generatedBy,
      aiArtifactId
    },
    actorUserId
  );

  if (sessionId) {
    await pool.execute(
      `UPDATE learning_class_sessions
       SET student_subject_id = ?, learning_plan_id = ?
       WHERE id = ?`,
      [studentSubjectId, activePlan?.id || null, sessionId]
    ).catch(() => null);
  }

  return brief;
}

/**
 * Save note and update progress (evidence chips → goal statuses + parent draft).
 */
export async function saveNoteAndUpdateProgress(notePayload, actorUserId) {
  const subject = await StudentSubject.findById(notePayload.studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }

  const chips = notePayload.evidenceChips || [];
  if (!notePayload.generalSupport && chips.length === 0 && notePayload.requireGoalEvidence !== false) {
    // Allow save but flag — instructional sessions should normally have evidence
  }

  let note;
  if (notePayload.id) {
    note = await TutoringSessionNote.update(
      notePayload.id,
      { ...notePayload, status: 'progress_updated' },
      actorUserId
    );
  } else {
    let parentUpdateDraft = notePayload.parentUpdateDraft || null;
    let parentAiArtifactId = null;
    if (!parentUpdateDraft) {
      const aiParent = await callTutoringAiJson({
        prompt: buildParentUpdatePrompt({
          subject,
          summary: notePayload.summary,
          nextSteps: notePayload.nextSteps,
          strengths: notePayload.strengthsObserved,
          challenges: notePayload.challengesObserved,
          homework: notePayload.homework
        }),
        temperature: 0.4,
        maxOutputTokens: 600
      });
      if (aiParent.ok && aiParent.draft?.parentUpdate) {
        parentUpdateDraft = String(aiParent.draft.parentUpdate);
        try {
          const art = await TutoringAiArtifact.create(
            {
              agencyId: subject.agency_id,
              clientId: subject.client_id,
              studentSubjectId: subject.id,
              artifactType: 'parent_update',
              modelName: aiParent.modelName || 'gemini',
              promptVersion: 'parent-update-2',
              inputRef: { sessionId: notePayload.sessionId || null },
              draftContent: aiParent.draft,
              draftText: parentUpdateDraft
            },
            actorUserId
          );
          parentAiArtifactId = art.id;
        } catch {
          // non-blocking
        }
      } else {
        parentUpdateDraft = buildParentUpdateDraft({
          subject,
          summary: notePayload.summary,
          nextSteps: notePayload.nextSteps,
          strengths: notePayload.strengthsObserved,
          challenges: notePayload.challengesObserved
        });
      }
    }

    note = await TutoringSessionNote.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        learningPlanId: notePayload.learningPlanId || null,
        sessionId: notePayload.sessionId || null,
        sessionBriefId: notePayload.sessionBriefId || null,
        attendanceStatus: notePayload.attendanceStatus || 'present',
        sessionType: notePayload.sessionType || null,
        howItWent: notePayload.howItWent || {},
        evidenceChips: chips,
        strengthsObserved: notePayload.strengthsObserved || null,
        challengesObserved: notePayload.challengesObserved || null,
        summary: notePayload.summary || null,
        nextSteps: notePayload.nextSteps || null,
        homework: notePayload.homework || null,
        generalSupport: !!notePayload.generalSupport,
        parentUpdateDraft,
        status: 'progress_updated'
      },
      actorUserId
    );
    if (parentAiArtifactId) {
      note = await TutoringSessionNote.update(note.id, { aiArtifactId: parentAiArtifactId }, actorUserId);
    }
  }

  const evidenceRows = [];
  const masteryUpdates = [];
  for (const chip of chips) {
    const ev = await AcademicSkillEvidence.create({
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId: subject.id,
      learningPlanId: note.learning_plan_id,
      planGoalId: chip.planGoalId || null,
      sessionId: note.session_id,
      sessionNoteId: note.id,
      evidenceType: chip.evidenceType || 'session_observation',
      skillKey: chip.skillKey || null,
      skillLabel: chip.skillLabel || null,
      rating: chip.rating || null,
      scoreValue: chip.scoreValue ?? null,
      notes: chip.notes || null,
      recordedByUserId: actorUserId
    });
    evidenceRows.push(ev);

    // Write the observed rating immediately, then let deterministic mastery refine status
    if (chip.planGoalId && chip.rating) {
      await StudentLearningPlan.updateGoal(chip.planGoalId, { status: chip.rating });
      try {
        const mastery = await applyMasteryToGoal(chip.planGoalId, { autoApply: true });
        masteryUpdates.push(mastery);
      } catch {
        // non-blocking
      }
    }
  }

  // Progress intelligence (lightweight)
  await maybeCreateProgressAlerts(subject, chips, actorUserId);

  // After-session parent report draft
  let report = null;
  try {
    report = await TutoringProgressReport.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        learningPlanId: note.learning_plan_id,
        reportType: 'after_session',
        title: `${subject.subject_label} — session update`,
        content: {
          summary: note.summary,
          strengths: note.strengths_observed,
          challenges: note.challenges_observed,
          nextSteps: note.next_steps,
          homework: note.homework,
          evidence: chips
        },
        contentHtml: null,
        status: 'draft',
        sessionNoteId: note.id
      },
      actorUserId
    );
  } catch {
    // optional
  }

  // Suggest next brief
  const nextBrief = await generateSessionBrief(
    { studentSubjectId: subject.id, sessionId: null },
    actorUserId
  );

  // Auto-assign at-home practice until next session (default on unless general-support-only)
  let practiceAssignment = null;
  const shouldAssignPractice =
    notePayload.assignPractice === true ||
    (notePayload.assignPractice !== false && !notePayload.generalSupport);
  if (shouldAssignPractice) {
    try {
      const focusGoalId =
        chips.find((c) => c.planGoalId && !['secure', 'mastered', 'generalized'].includes(String(c.rating)))
          ?.planGoalId ||
        chips.find((c) => c.planGoalId)?.planGoalId ||
        null;
      const dueAt = await findNextTutoringSessionDueAt(subject.client_id, note.session_id);
      const created = await createPracticeAssignment(
        {
          studentSubjectId: subject.id,
          planGoalId: focusGoalId,
          sessionId: note.session_id,
          sessionNoteId: note.id,
          itemCount: notePayload.practiceItemCount || 5,
          dueAt
        },
        actorUserId
      );
      practiceAssignment = created.assignment;
      if (practiceAssignment && (!note.homework || !String(note.homework).trim())) {
        const hwLine = `Practice assigned: ${practiceAssignment.title}`;
        note = await TutoringSessionNote.update(note.id, { homework: hwLine }, actorUserId);
      }
    } catch (err) {
      console.warn('[tutoringLearningOs] auto practice skipped:', err?.message || err);
    }
  }

  try {
    await advanceMilestonesAfterSession(subject, note.session_id);
  } catch (err) {
    console.warn('[tutoringLearningOs] milestone advance skipped:', err?.message || err);
  }

  return {
    note,
    evidence: evidenceRows,
    report,
    nextBrief,
    mastery: masteryUpdates,
    practiceAssignment
  };
}

/**
 * Mark planned milestones complete when completed session count crosses due_after_session_count.
 */
export async function advanceMilestonesAfterSession(subject, sessionId = null) {
  if (!subject?.id) return [];
  const notes = await TutoringSessionNote.listBySubject(subject.id, { limit: 200 }).catch(() => []);
  const completedCount = Array.isArray(notes) ? notes.length : 0;
  const milestones = await TutoringPackageMilestone.listBySubject(subject.id).catch(() => []);
  const advanced = [];
  for (const m of milestones || []) {
    if (String(m.status) !== 'planned' && String(m.status) !== 'scheduled') continue;
    const dueAfter = m.due_after_session_count;
    if (dueAfter == null) continue;
    if (completedCount >= Number(dueAfter)) {
      await TutoringPackageMilestone.complete(m.id, sessionId || null);
      advanced.push(m.id);
    }
  }
  return advanced;
}

async function findNextTutoringSessionDueAt(clientId, excludeSessionId = null) {
  try {
    const params = [clientId];
    let excludeSql = '';
    if (excludeSessionId) {
      excludeSql = 'AND s.id <> ?';
      params.push(excludeSessionId);
    }
    const [rows] = await pool.execute(
      `SELECT s.starts_at
       FROM learning_class_sessions s
       JOIN learning_class_client_memberships m
         ON m.learning_class_id = s.learning_class_id
        AND m.client_id = ?
        AND m.membership_status IN ('active','completed')
       WHERE (s.session_subtype = 'tutoring' OR s.mode = 'individual')
         AND s.starts_at > NOW()
         AND (s.status IS NULL OR s.status IN ('scheduled','live'))
         ${excludeSql}
       ORDER BY s.starts_at ASC
       LIMIT 1`,
      params
    );
    if (rows?.[0]?.starts_at) return rows[0].starts_at;
  } catch {
    // fall through
  }
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

function buildParentUpdateDraft({ subject, summary, nextSteps, strengths, challenges }) {
  const parts = [
    `Today in ${subject.subject_label}:`,
    summary || 'We worked on current learning plan goals.',
    strengths ? `Strengths noticed: ${strengths}` : null,
    challenges ? `Areas for continued practice: ${challenges}` : null,
    nextSteps ? `Next: ${nextSteps}` : null
  ].filter(Boolean);
  return parts.join(' ');
}

async function maybeCreateProgressAlerts(subject, chips) {
  try {
    const regressions = chips.filter((c) => c.rating === 'needs_review' || c.rating === 'emerging');
    if (regressions.length >= 2) {
      await TutoringProgressAlert.create({
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        alertType: 'regression',
        severity: 'medium',
        title: 'Possible skill regression signals',
        detail: 'Multiple goals rated emerging/needs review in one session.'
      });
    }
    const breakthroughs = chips.filter((c) => c.rating === 'secure' || c.rating === 'mastered');
    if (breakthroughs.length >= 1) {
      await TutoringProgressAlert.create({
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        alertType: 'breakthrough',
        severity: 'low',
        title: 'Skill breakthrough recorded',
        detail: `Secure/mastered ratings: ${breakthroughs.map((b) => b.skillLabel || b.planGoalId).join(', ')}`
      });
    }
  } catch {
    // non-blocking
  }
}

/**
 * Tutor matching v1: rank staff by comfort overlap. Never blocks — returns ranked list + warnings.
 */
export async function matchTutorsForRequest({
  agencyId,
  subjectArea = null,
  gradeLevel = null,
  ageRange = null,
  serviceType = 'tutoring',
  emotionalNeeds = []
}) {
  const prefs = await StaffClientComfortPreference.listByAgency(agencyId);
  const ranked = prefs.map((p) => {
    let score = 0;
    const reasons = [];
    const warnings = [];

    const academics = p.academic_subjects_json || [];
    const grades = p.grade_levels_json || [];
    const ages = p.age_ranges_json || [];
    const services = p.service_types_json || [];
    const emotional = p.emotional_behavioral_json || [];

    if (subjectArea) {
      const hay = academics.map((s) => String(s).toLowerCase());
      const needle = String(subjectArea).toLowerCase().replace(/\s+/g, '_');
      if (
        hay.some(
          (h) =>
            h.includes(needle) ||
            needle.includes(h) ||
            h.includes(String(subjectArea).toLowerCase()) ||
            String(subjectArea).toLowerCase().includes(h.replace(/_/g, ' '))
        )
      ) {
        score += 40;
        reasons.push('subject match');
      } else {
        warnings.push('subject not listed in comfort prefs');
      }
    }

    if (gradeLevel) {
      const gHay = grades.map((g) => String(g).toLowerCase());
      const gNeedle = String(gradeLevel).toLowerCase();
      if (gHay.some((g) => g.includes(gNeedle) || gNeedle.includes(g))) {
        score += 25;
        reasons.push('grade match');
      } else {
        warnings.push('grade not listed in comfort prefs');
      }
    }

    if (ageRange && ages.includes(ageRange)) {
      score += 15;
      reasons.push('age match');
    }

    if (serviceType && services.includes(serviceType)) {
      score += 10;
      reasons.push('service type match');
    } else if (serviceType && services.length) {
      warnings.push('service type not listed');
    }

    for (const need of emotionalNeeds || []) {
      if (emotional.includes(need)) {
        score += 5;
        reasons.push(`comfortable with ${need}`);
      } else {
        warnings.push(`no comfort marked for ${need}`);
      }
    }

    if (!p.completed_at && !academics.length) {
      warnings.push('comfort preferences incomplete');
    }

    return {
      userId: p.user_id,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      score,
      reasons,
      warnings,
      preferencesIncomplete: !academics.length && !grades.length
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return {
    matches: ranked,
    canOverride: true,
    message: ranked.some((m) => m.preferencesIncomplete)
      ? 'Some staff have incomplete comfort preferences — scheduling is allowed with override.'
      : null
  };
}

/**
 * Learning overview for chart hub.
 */
export async function getLearningOverview(clientId) {
  const subjects = await StudentSubject.listByClient(clientId);
  const overview = [];
  for (const s of subjects) {
    const plan = await StudentLearningPlan.findActiveBySubject(s.id);
    const goals = plan ? await StudentLearningPlan.listGoals(plan.id) : [];
    const evidence = await AcademicSkillEvidence.listBySubject(s.id, { limit: 10 });
    const chart = await AcademicSkillEvidence.progressChart(s.id);
    const alerts = await TutoringProgressAlert.listOpenBySubject(s.id).catch(() => []);
    const notes = await TutoringSessionNote.listBySubject(s.id, { limit: 5 });
    const skillMap = await buildSkillMap(goals, evidence);
    const progressPct = computeSubjectProgressPct(skillMap);
    overview.push({
      subject: s,
      activePlan: plan,
      goals,
      recentEvidence: evidence,
      progressChart: chart,
      openAlerts: alerts,
      recentNotes: notes,
      skillMap,
      progressPct,
      currentFocus: skillMap.find((sk) => !['secure', 'mastered', 'generalized'].includes(sk.status)) || null
    });
  }
  return { subjects: overview };
}

/** Secure/mastered ratings count as independent mastery measures. */
const MASTERY_POSITIVE = new Set(['secure', 'mastered', 'generalized', 'nearly_secure']);
const MASTERY_STRONG = new Set(['secure', 'mastered', 'generalized']);
const MASTERY_THRESHOLD = 3;
const MASTERY_MIN_PCT = 0.8;

/**
 * Deterministic mastery: AI never decides mastery alone.
 * Rule: ≥3 independent positive measures with ≥80% strong (secure+) → mastered;
 * regression signals → needs_review.
 */
export async function evaluateGoalMastery(planGoalId) {
  const evidence = await AcademicSkillEvidence.listByGoal(planGoalId, { limit: 30 });
  const chronological = [...evidence].reverse();
  const rated = chronological.filter((e) => e.rating);
  const positive = rated.filter((e) => MASTERY_POSITIVE.has(String(e.rating)));
  const strong = rated.filter((e) => MASTERY_STRONG.has(String(e.rating)));
  const recent = rated.slice(-5);
  const recentRegression = recent.filter((e) =>
    ['emerging', 'needs_review'].includes(String(e.rating))
  ).length;

  let recommendedStatus = null;
  let confidence = 'low';
  let reason = 'Insufficient evidence';

  if (recentRegression >= 2 && strong.length > 0) {
    recommendedStatus = 'needs_review';
    confidence = 'medium';
    reason = `Regression: ${recentRegression} of last ${recent.length} measures emerging/needs review.`;
  } else if (positive.length >= MASTERY_THRESHOLD) {
    const strongPct = strong.length / Math.max(positive.length, 1);
    if (strongPct >= MASTERY_MIN_PCT && strong.length >= MASTERY_THRESHOLD) {
      recommendedStatus = 'mastered';
      confidence = 'high';
      reason = `Mastery criteria met: ${strong.length} independent secure+ measures (≥${Math.round(MASTERY_MIN_PCT * 100)}% of ${positive.length} positive).`;
    } else if (positive.length >= 2) {
      recommendedStatus = 'nearly_secure';
      confidence = 'medium';
      reason = `${positive.length} positive measures; ${strong.length} secure+. Continue independent practice.`;
    }
  } else if (rated.length >= 1) {
    const last = rated[rated.length - 1];
    recommendedStatus = last.rating;
    confidence = rated.length >= 2 ? 'medium' : 'low';
    reason = `Latest rating: ${last.rating} (${rated.length} measure${rated.length === 1 ? '' : 's'}).`;
  }

  return {
    planGoalId,
    measureCount: rated.length,
    positiveCount: positive.length,
    strongCount: strong.length,
    recommendedStatus,
    confidence,
    reason,
    evidenceIds: evidence.map((e) => e.id)
  };
}

export async function applyMasteryToGoal(planGoalId, { autoApply = true } = {}) {
  const mastery = await evaluateGoalMastery(planGoalId);
  if (autoApply && mastery.recommendedStatus) {
    await StudentLearningPlan.updateGoal(planGoalId, { status: mastery.recommendedStatus });
  }
  return mastery;
}

function buildSkillMap(goals = [], evidence = []) {
  return (goals || []).map((g) => {
    const goalEvidence = (evidence || []).filter((e) => Number(e.plan_goal_id) === Number(g.id));
    return {
      goalId: g.id,
      title: g.title,
      skillKey: g.skill_key,
      skillLabel: g.skill_label || g.title,
      status: g.status || 'not_assessed',
      evidenceCount: goalEvidence.length,
      latestEvidence: goalEvidence[0] || null,
      baselineText: g.baseline_text,
      successCriteria: g.success_criteria
    };
  });
}

function computeSubjectProgressPct(skillMap = []) {
  if (!skillMap.length) return 0;
  const weights = {
    not_assessed: 0,
    emerging: 0.15,
    developing: 0.35,
    nearly_secure: 0.65,
    secure: 0.85,
    mastered: 1,
    generalized: 1,
    needs_review: 0.25
  };
  const sum = skillMap.reduce((acc, sk) => acc + (weights[sk.status] ?? 0.2), 0);
  return Math.round((sum / skillMap.length) * 100);
}

/**
 * Full subject workspace: plan, skill map, mastery, timeline, next recommendation.
 */
export async function getSubjectWorkspace(studentSubjectId) {
  const subject = await StudentSubject.findById(studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }

  const plans = await StudentLearningPlan.listBySubject(studentSubjectId);
  const activePlan = plans.find((p) => p.status === 'active') || null;
  const goals = activePlan ? await StudentLearningPlan.listGoals(activePlan.id) : [];
  const objectives = activePlan ? await StudentLearningPlan.listObjectives(activePlan.id) : [];
  const evidence = await AcademicSkillEvidence.listBySubject(studentSubjectId, { limit: 100 });
  const chart = await AcademicSkillEvidence.progressChart(studentSubjectId);
  const evaluations = await EvaluationSummary.listBySubject(studentSubjectId);
  const notes = await TutoringSessionNote.listBySubject(studentSubjectId, { limit: 20 });
  const alerts = await TutoringProgressAlert.listOpenBySubject(studentSubjectId).catch(() => []);
  const milestones = await TutoringPackageMilestone.listBySubject(studentSubjectId).catch(() => []);
  const reports = await TutoringProgressReport.listBySubject(studentSubjectId).catch(() => []);

  const skillMap = buildSkillMap(goals, evidence);
  const masteryByGoal = {};
  for (const g of goals) {
    masteryByGoal[g.id] = await evaluateGoalMastery(g.id);
  }

  const timeline = [];
  for (const ev of evaluations) {
    timeline.push({
      type: 'evaluation',
      at: ev.administered_at || ev.created_at,
      title: `${ev.evaluation_type || 'Evaluation'} (${ev.evaluation_path})`,
      status: ev.status,
      id: ev.id
    });
  }
  for (const p of plans) {
    timeline.push({
      type: 'plan',
      at: p.approved_at || p.created_at,
      title: p.title,
      status: p.status,
      id: p.id
    });
  }
  for (const n of notes) {
    timeline.push({
      type: 'session_note',
      at: n.saved_at || n.created_at,
      title: n.summary || 'Session note',
      status: n.status,
      id: n.id
    });
  }
  for (const e of evidence.slice(0, 30)) {
    timeline.push({
      type: 'evidence',
      at: e.observed_at,
      title: e.skill_label || e.skill_key || 'Skill evidence',
      status: e.rating,
      id: e.id
    });
  }
  timeline.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const developing = skillMap.filter((sk) => !['secure', 'mastered', 'generalized'].includes(sk.status));
  const nextRecommendation = developing[0]
    ? {
        goalId: developing[0].goalId,
        title: developing[0].title,
        status: developing[0].status,
        suggestedFocus: developing[0].successCriteria || `Continue work on ${developing[0].title}`
      }
    : skillMap[0]
      ? {
          goalId: skillMap[0].goalId,
          title: skillMap[0].title,
          status: skillMap[0].status,
          suggestedFocus: 'All tracked skills secure — consider reassessment or new goals.'
        }
      : null;

  return {
    subject,
    activePlan,
    plans,
    goals,
    objectives,
    skillMap,
    masteryByGoal,
    progressPct: computeSubjectProgressPct(skillMap),
    evidence,
    progressChart: chart,
    evaluations,
    notes,
    alerts,
    milestones,
    reports: reports.slice(0, 10),
    timeline: timeline.slice(0, 40),
    nextRecommendation
  };
}

/**
 * Build parent-facing HTML preview from existing report/evidence data.
 */
export async function buildParentReportPreview(reportId) {
  const report = await TutoringProgressReport.findById(reportId);
  if (!report) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }
  const subject = await StudentSubject.findById(report.student_subject_id);
  const content = report.content_json || {};
  const goals = Array.isArray(content.goals) ? content.goals : [];
  const evidence = Array.isArray(content.evidenceSummary || content.evidence)
    ? content.evidenceSummary || content.evidence
    : [];

  const html = `
    <article class="parent-report">
      <h1>${escapeHtml(report.title)}</h1>
      <p class="meta">${escapeHtml(subject?.subject_label || 'Tutoring')} progress update</p>
      ${content.summary || (content.recentSummaries || []).length
        ? `<section><h2>What we worked on</h2><p>${escapeHtml(
            content.summary || (content.recentSummaries || []).filter(Boolean).join(' ')
          )}</p></section>`
        : ''}
      ${content.strengths ? `<section><h2>Strengths</h2><p>${escapeHtml(content.strengths)}</p></section>` : ''}
      ${content.challenges ? `<section><h2>Continued practice</h2><p>${escapeHtml(content.challenges)}</p></section>` : ''}
      ${goals.length
        ? `<section><h2>Goal status</h2><ul>${goals
            .map((g) => `<li><strong>${escapeHtml(g.title)}</strong> — ${escapeHtml(g.status || '—')}</li>`)
            .join('')}</ul></section>`
        : ''}
      ${evidence.length
        ? `<section><h2>Recent evidence</h2><ul>${evidence
            .slice(0, 8)
            .map(
              (e) =>
                `<li>${escapeHtml(e.skill || e.skillLabel || e.skill_label || 'Skill')}: ${escapeHtml(
                  e.rating || '—'
                )}</li>`
            )
            .join('')}</ul></section>`
        : ''}
      ${content.nextSteps ? `<section><h2>Next steps</h2><p>${escapeHtml(content.nextSteps)}</p></section>` : ''}
      ${content.homework ? `<section><h2>Practice at home</h2><p>${escapeHtml(content.homework)}</p></section>` : ''}
      <p class="disclaimer">This summary is for families and does not replace formal school assessments.</p>
    </article>
  `.trim();

  await pool.execute(
    `UPDATE tutoring_progress_reports SET content_html = ? WHERE id = ?`,
    [html, reportId]
  );

  return { report: await TutoringProgressReport.findById(reportId), html };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** AI draft helpers — Gemini when available; rules-v1 fallback. Humans must approve. */
export async function draftLearningPlanWithAi({ studentSubjectId, evaluationSummaryId = null }, actorUserId) {
  const subject = await StudentSubject.findById(studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }
  const summaries = await EvaluationSummary.listBySubject(studentSubjectId);
  const summary =
    (evaluationSummaryId && summaries.find((s) => s.id === Number(evaluationSummaryId))) ||
    summaries[0] ||
    null;

  const standards = await TutoringCasStandard.search({
    subjectKey: subject.subject_key,
    gradeBand: mapGradeToBand(subject.school_grade)
  });

  let draftContent = {
    title: `${subject.subject_label} Learning Plan (AI draft)`,
    strengths: summary?.strengths_json || [],
    priorityNeeds: summary?.needs_json || [],
    instructionalStrategies: [
      'High-dosage, data-driven practice on priority skills',
      'Explicit modeling → guided practice → independent check',
      'Frequent micro-checks aligned to Colorado Academic Standards'
    ],
    goals: (summary?.needs_json || ['Priority skill focus']).slice(0, 3).map((need, i) => ({
      title: typeof need === 'string' ? need : need.label || `Goal ${i + 1}`,
      baselineText: 'Based on baseline evaluation',
      successCriteria: 'Secure performance across 2 consecutive sessions',
      measurementMethod: 'tutor_rating',
      standardsRefs: standards.slice(0, 2).map((st) => ({
        code: st.standard_code,
        title: st.title,
        versionKey: st.version_key
      }))
    })),
    parentSummary: `We will focus on ${subject.subject_label} using goals drawn from the baseline. Progress will be checked each session.`,
    disclaimer:
      'AI draft only. Tutor must review and approve before this becomes the official learning plan. Not a diagnostic determination.'
  };
  let modelName = 'rules-v1';

  const ai = await callTutoringAiJson({
    prompt: buildLearningPlanPrompt({ subject, summary, standards }),
    temperature: 0.35,
    maxOutputTokens: 1600
  });
  if (ai.ok && ai.draft) {
    modelName = ai.modelName || 'gemini';
    draftContent = {
      ...draftContent,
      ...ai.draft,
      disclaimer:
        ai.draft.disclaimer ||
        'AI draft only. Tutor must review and approve before this becomes the official learning plan. Not a diagnostic determination.',
      goals: Array.isArray(ai.draft.goals) && ai.draft.goals.length ? ai.draft.goals : draftContent.goals
    };
  }

  const artifact = await TutoringAiArtifact.create(
    {
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId: subject.id,
      artifactType: 'learning_plan_draft',
      modelName,
      promptVersion: 'learning-plan-2',
      inputRef: { evaluationSummaryId: summary?.id || null },
      retrievedSources: standards.map((s) => ({
        type: 'cas',
        code: s.standard_code,
        versionKey: s.version_key
      })),
      draftContent,
      draftText: draftContent.parentSummary
    },
    actorUserId
  );

  return { artifact, draft: draftContent, modelName };
}

export async function applyApprovedPlanDraft(artifactId, actorUserId) {
  const artifact = await TutoringAiArtifact.findById(artifactId);
  if (!artifact || artifact.status !== 'approved') {
    const err = new Error('Approve the AI artifact before applying it to the official record');
    err.status = 400;
    throw err;
  }
  const subject = await StudentSubject.findById(artifact.student_subject_id);
  const draft = artifact.draft_content_json || {};
  const plan = await StudentLearningPlan.create(
    {
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId: subject.id,
      title: draft.title || `${subject.subject_label} Learning Plan`,
      status: 'draft',
      strengths: draft.strengths || [],
      priorityNeeds: draft.priorityNeeds || [],
      instructionalStrategies: draft.instructionalStrategies || [],
      parentSummary: draft.parentSummary || null,
      metadata: { aiArtifactId: artifact.id }
    },
    actorUserId
  );
  await StudentLearningPlan.update(plan.id, { aiArtifactId: artifact.id }, actorUserId);
  for (let i = 0; i < (draft.goals || []).length; i += 1) {
    const g = draft.goals[i];
    await StudentLearningPlan.addGoal({
      learningPlanId: plan.id,
      studentSubjectId: subject.id,
      title: g.title,
      baselineText: g.baselineText,
      successCriteria: g.successCriteria,
      measurementMethod: g.measurementMethod || 'tutor_rating',
      sortOrder: i,
      standardsRefs: g.standardsRefs || []
    });
  }
  await StudentSubject.update(subject.id, { status: 'learning_plan_review' }, actorUserId);
  return StudentLearningPlan.getPlanBundle(plan.id);
}

function mapGradeToBand(grade) {
  if (!grade) return null;
  const g = String(grade).toLowerCase();
  if (g.includes('k') || g.includes('1') || g.includes('2')) return '3-5';
  if (['3', '4', '5'].some((n) => g.includes(n))) return '3-5';
  if (['6', '7', '8'].some((n) => g.includes(n))) return '6-8';
  if (['9', '10', '11', '12'].some((n) => g.includes(n))) return '9-12';
  return null;
}

/**
 * Run a quick internal evaluation from item bank → skill map → optional plan draft.
 */
export async function runQuickEvaluation({ studentSubjectId, responses = [] }, actorUserId) {
  const subject = await StudentSubject.findById(studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }

  const items = await TutoringEvaluationItem.list({
    subjectKey: subject.subject_key,
    gradeBand: mapGradeToBand(subject.school_grade),
    agencyId: subject.agency_id
  });

  const scored = [];
  const skillMap = {};
  const misconceptions = new Set();

  for (const resp of responses) {
    const item = items.find((i) => i.id === Number(resp.itemId)) || (await TutoringEvaluationItem.findById(resp.itemId));
    if (!item) continue;
    let correct = null;
    let rating = resp.rating || null;
    if (item.item_type === 'multiple_choice' && item.correct_answer_json?.answer != null) {
      correct = String(resp.answer) === String(item.correct_answer_json.answer);
      rating = correct ? 'secure' : 'developing';
      if (!correct && Array.isArray(item.misconception_tags_json)) {
        item.misconception_tags_json.forEach((t) => misconceptions.add(t));
      }
    }
    skillMap[item.skill_key] = {
      skillKey: item.skill_key,
      skillLabel: item.skill_label,
      rating: rating || 'not_assessed',
      correct
    };
    scored.push({
      itemId: item.id,
      promptSnapshot: item.prompt_text,
      response: resp,
      scoreValue: correct == null ? null : correct ? 1 : 0,
      rating,
      misconceptionTags: !correct ? item.misconception_tags_json || [] : [],
      tutorVerified: !!resp.tutorVerified
    });
  }

  const needs = Object.values(skillMap)
    .filter((s) => s.rating !== 'secure' && s.rating !== 'mastered')
    .map((s) => s.skillLabel || s.skillKey);
  const strengths = Object.values(skillMap)
    .filter((s) => s.rating === 'secure' || s.rating === 'mastered')
    .map((s) => s.skillLabel || s.skillKey);

  const summary = await EvaluationSummary.create(
    {
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId: subject.id,
      evaluationPath: 'quick',
      evaluationType: 'baseline',
      administeredAt: new Date(),
      gradeAtEval: subject.school_grade,
      strengths,
      needs,
      skillMap: { ...skillMap, misconceptions: [...misconceptions] },
      narrativeSummary: `Quick evaluation completed. Strengths: ${strengths.join(', ') || 'n/a'}. Needs: ${needs.join(', ') || 'n/a'}.`,
      status: 'completed'
    },
    actorUserId
  );

  await TutoringEvaluationResponse.createMany(summary.id, scored);
  await StudentSubject.update(subject.id, { status: 'learning_plan_draft' }, actorUserId);

  const { artifact } = await draftLearningPlanWithAi(
    { studentSubjectId: subject.id, evaluationSummaryId: summary.id },
    actorUserId
  );

  return { summary, responses: scored, planDraftArtifact: artifact, itemsAvailable: items };
}

export async function buildMultiSessionReport(studentSubjectId, actorUserId) {
  const subject = await StudentSubject.findById(studentSubjectId);
  const notes = await TutoringSessionNote.listBySubject(studentSubjectId, { limit: 6 });
  const evidence = await AcademicSkillEvidence.listBySubject(studentSubjectId, { limit: 50 });
  const plan = await StudentLearningPlan.findActiveBySubject(studentSubjectId);
  const goals = plan ? await StudentLearningPlan.listGoals(plan.id) : [];

  const content = {
    subject: subject.subject_label,
    sessionsCovered: notes.length,
    goals: goals.map((g) => ({ id: g.id, title: g.title, status: g.status })),
    evidenceSummary: evidence.slice(0, 20).map((e) => ({
      skill: e.skill_label || e.skill_key,
      rating: e.rating,
      observedAt: e.observed_at
    })),
    recentSummaries: notes.map((n) => n.summary).filter(Boolean)
  };

  return TutoringProgressReport.create(
    {
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId,
      learningPlanId: plan?.id || null,
      reportType: 'multi_session',
      title: `${subject.subject_label} progress (last ${notes.length} sessions)`,
      content,
      status: 'draft'
    },
    actorUserId
  );
}

export async function getTutorCaseloadToday(agencyId, tutorUserId) {
  const [rows] = await pool.execute(
    `SELECT s.id AS session_id, s.title, s.starts_at, s.ends_at, s.status, s.delivery_mode,
            s.student_subject_id, s.learning_plan_id, s.session_subtype, s.mode,
            ss.subject_label, ss.client_id, ss.status AS subject_status,
            c.first_name AS client_first_name, c.last_name AS client_last_name,
            b.id AS brief_id, b.status AS brief_status
     FROM learning_class_sessions s
     LEFT JOIN student_subjects ss ON ss.id = s.student_subject_id
     LEFT JOIN clients c ON c.id = ss.client_id
     LEFT JOIN tutoring_session_briefs b ON b.session_id = s.id
     WHERE s.agency_id = ?
       AND (s.provider_user_id = ? OR s.created_by_user_id = ?)
       AND DATE(s.starts_at) = CURDATE()
       AND (s.session_subtype = 'tutoring' OR s.mode = 'individual')
     ORDER BY s.starts_at ASC`,
    [agencyId, tutorUserId, tutorUserId]
  ).catch(async () => {
    // Fallback if agency_id column missing on sessions
    const [fallback] = await pool.execute(
      `SELECT s.id AS session_id, s.title, s.starts_at, s.ends_at, s.status,
              s.student_subject_id, s.learning_plan_id, s.session_subtype, s.mode
       FROM learning_class_sessions s
       WHERE (s.provider_user_id = ? OR s.created_by_user_id = ?)
         AND DATE(s.starts_at) = CURDATE()
         AND (s.session_subtype = 'tutoring' OR s.mode = 'individual')
       ORDER BY s.starts_at ASC`,
      [tutorUserId, tutorUserId]
    );
    return [fallback];
  });

  return (rows || []).map((r) => ({
    ...r,
    prepStatus: r.brief_status || (r.student_subject_id ? 'needed' : 'no_subject'),
    clientName: [r.client_first_name, r.client_last_name].filter(Boolean).join(' ') || null
  }));
}

export async function linkInPersonPlanToLearningGoals({ sessionId, studentSubjectId, goalIds = [] }) {
  await pool.execute(
    `UPDATE learning_class_sessions SET student_subject_id = ? WHERE id = ?`,
    [studentSubjectId, sessionId]
  ).catch(() => null);

  const activePlan = await StudentLearningPlan.findActiveBySubject(studentSubjectId);
  if (activePlan) {
    await pool.execute(
      `UPDATE learning_class_sessions SET learning_plan_id = ? WHERE id = ?`,
      [activePlan.id, sessionId]
    ).catch(() => null);
  }

  const goals = activePlan ? await StudentLearningPlan.listGoals(activePlan.id) : [];
  const focusGoals = goalIds.length
    ? goals.filter((g) => goalIds.map(Number).includes(Number(g.id)))
    : goals.filter((g) => !['secure', 'mastered', 'generalized'].includes(String(g.status))).slice(0, 3);

  // Bridge Learning Plan goals into in-person plan materials/objectives fields when present
  try {
    const goalTitles = focusGoals.map((g) => g.title).filter(Boolean);
    const focusArea = focusGoals[0]?.title || activePlan?.title || null;
    const [existing] = await pool.execute(
      `SELECT id FROM learning_class_session_in_person_plans WHERE session_id = ? LIMIT 1`,
      [sessionId]
    );
    if (existing?.[0]?.id) {
      await pool.execute(
        `UPDATE learning_class_session_in_person_plans
         SET focus_area = COALESCE(?, focus_area),
             goals_json = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ?`,
        [focusArea, JSON.stringify(goalTitles), sessionId]
      );
    }
  } catch {
    // in-person plan table may not exist in all environments
  }

  let brief = await TutoringSessionBrief.findBySession(sessionId);
  if (!brief) {
    brief = await generateSessionBrief({ studentSubjectId, sessionId }, null);
  } else if (focusGoals.length) {
    brief = await TutoringSessionBrief.update(
      brief.id,
      {
        focusGoalIds: focusGoals.map((g) => g.id),
        plannedActivities: focusGoals.map((g) => ({
          goalId: g.id,
          title: g.title,
          suggestedFocus: g.success_criteria || g.description || 'Practice toward success criteria'
        })),
        status: 'accepted'
      },
      null
    );
  }
  return {
    brief,
    learningPlanId: activePlan?.id || null,
    linkedGoals: focusGoals.map((g) => ({ id: g.id, title: g.title, status: g.status }))
  };
}

/**
 * Create at-home practice from a learning plan goal (Gemini + fallback).
 */
export async function createPracticeAssignment(
  {
    studentSubjectId,
    planGoalId = null,
    sessionId = null,
    sessionNoteId = null,
    itemCount = 5,
    dueAt = null,
    standards = null
  },
  actorUserId
) {
  const subject = await StudentSubject.findById(studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }
  const activePlan = await StudentLearningPlan.findActiveBySubject(studentSubjectId);
  const goals = activePlan ? await StudentLearningPlan.listGoals(activePlan.id) : [];
  const goal =
    (planGoalId && goals.find((g) => Number(g.id) === Number(planGoalId))) ||
    goals.find((g) => !['secure', 'mastered', 'generalized'].includes(String(g.status))) ||
    goals[0] ||
    null;

  let resolvedStandards = standards;
  if (!resolvedStandards) {
    resolvedStandards = await TutoringCasStandard.search({
      subjectKey: subject.subject_key,
      gradeBand: mapGradeToBand(subject.school_grade),
      q: goal?.title || null
    }).catch(() => []);
  }

  let title = `${subject.subject_label} practice${goal ? `: ${goal.title}` : ''}`;
  let instructions = 'Complete these practice items before the next tutoring session.';
  let practiceItems = [
    {
      prompt: goal
        ? `Practice: ${goal.title}. Aim for: ${goal.success_criteria || 'independent accuracy'}.`
        : `Short practice in ${subject.subject_label}.`,
      hint: 'Show your work or think aloud.',
      answerNote: 'Review with tutor next session.'
    }
  ];
  let aiArtifactId = null;
  let modelName = 'rules-v1';

  const resolvedDueAt = dueAt || (await findNextTutoringSessionDueAt(subject.client_id, sessionId));

  const ai = await callTutoringAiJson({
    prompt: buildPracticePrompt({ subject, goal, count: itemCount, standards: resolvedStandards }),
    temperature: 0.4,
    maxOutputTokens: 1000
  });
  if (ai.ok && ai.draft) {
    modelName = ai.modelName || 'gemini';
    if (ai.draft.title) title = String(ai.draft.title);
    if (ai.draft.instructions) instructions = String(ai.draft.instructions);
    if (Array.isArray(ai.draft.practiceItems) && ai.draft.practiceItems.length) {
      practiceItems = ai.draft.practiceItems;
    }
    const art = await TutoringAiArtifact.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        artifactType: 'next_step',
        modelName,
        promptVersion: 'practice-2',
        inputRef: { planGoalId: goal?.id || null, standards: (resolvedStandards || []).slice(0, 4) },
        draftContent: ai.draft,
        draftText: instructions
      },
      actorUserId
    );
    aiArtifactId = art.id;
  }

  const assignment = await TutoringPracticeAssignment.create(
    {
      agencyId: subject.agency_id,
      clientId: subject.client_id,
      studentSubjectId: subject.id,
      learningPlanId: activePlan?.id || null,
      planGoalId: goal?.id || null,
      sessionId,
      sessionNoteId,
      title,
      instructions,
      practiceItems,
      dueAt: resolvedDueAt,
      aiArtifactId
    },
    actorUserId
  );

  return { assignment, modelName };
}

/**
 * Build an assessment blueprint and select matching bank items.
 */
export async function buildAssessmentBlueprint(payload, actorUserId) {
  const {
    agencyId,
    studentSubjectId = null,
    title,
    subjectKey,
    gradeBand = null,
    evaluationPath = 'quick',
    skillKeys = [],
    itemTypes = [],
    itemCount = 5,
    difficultyMax = null
  } = payload;

  let items = await TutoringEvaluationItem.list({
    subjectKey,
    gradeBand,
    agencyId
  });
  if (skillKeys.length) {
    const set = new Set(skillKeys.map(String));
    items = items.filter((i) => set.has(String(i.skill_key)));
  }
  if (itemTypes.length) {
    const set = new Set(itemTypes.map(String));
    items = items.filter((i) => set.has(String(i.item_type)));
  }
  if (difficultyMax != null) {
    items = items.filter((i) => i.difficulty == null || Number(i.difficulty) <= Number(difficultyMax));
  }
  const selected = items.slice(0, Math.max(1, Math.min(Number(itemCount) || 5, 20)));

  const blueprint = await TutoringAssessmentBlueprint.create(
    {
      agencyId,
      studentSubjectId,
      title: title || `${subjectKey} ${evaluationPath} assessment`,
      subjectKey,
      gradeBand,
      evaluationPath,
      skillKeys,
      itemTypes,
      itemCount: selected.length,
      difficultyMax,
      selectedItemIds: selected.map((i) => i.id),
      status: selected.length ? 'ready' : 'draft'
    },
    actorUserId
  );

  // Optional: create a probe milestone when attached to a subject
  if (studentSubjectId && evaluationPath === 'probe') {
    const subject = await StudentSubject.findById(studentSubjectId);
    if (subject) {
      await TutoringPackageMilestone.create(
        {
          agencyId: subject.agency_id,
          clientId: subject.client_id,
          studentSubjectId: subject.id,
          milestoneType: 'probe',
          dueAfterSessionCount: null,
          notes: `Assessment blueprint #${blueprint.id}`
        },
        actorUserId
      ).catch(() => null);
    }
  }

  return { blueprint, items: selected };
}

/**
 * Guardian-facing Learning OS snapshot: published reports, practice, subject progress.
 */
export async function getGuardianLearningSnapshot(clientId) {
  const subjects = await StudentSubject.listByClient(clientId);
  const out = [];
  for (const s of subjects) {
    const workspaceLite = {
      subject: s,
      progressPct: 0,
      currentFocus: null,
      publishedReports: [],
      practice: [],
      recentParentUpdates: []
    };
    const plan = await StudentLearningPlan.findActiveBySubject(s.id);
    const goals = plan ? await StudentLearningPlan.listGoals(plan.id) : [];
    const evidence = await AcademicSkillEvidence.listBySubject(s.id, { limit: 20 });
    const skillMap = buildSkillMap(goals, evidence);
    workspaceLite.progressPct = computeSubjectProgressPct(skillMap);
    workspaceLite.currentFocus =
      skillMap.find((sk) => !['secure', 'mastered', 'generalized'].includes(sk.status)) || null;
    workspaceLite.skillMap = skillMap;

    const reports = await TutoringProgressReport.listBySubject(s.id).catch(() => []);
    workspaceLite.publishedReports = reports
      .filter((r) => ['published', 'shared'].includes(String(r.status)))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        title: r.title,
        reportType: r.report_type,
        publishedAt: r.published_at,
        contentHtml: r.content_html,
        content: r.content_json
      }));

    workspaceLite.practice = await TutoringPracticeAssignment.listBySubject(s.id).catch(() => []);
    const notes = await TutoringSessionNote.listBySubject(s.id, { limit: 5 });
    workspaceLite.recentParentUpdates = notes
      .filter((n) => n.parent_update_draft)
      .map((n) => ({
        id: n.id,
        sessionId: n.session_id,
        at: n.saved_at || n.created_at,
        text: n.parent_update_draft,
        homework: n.homework
      }));
    out.push(workspaceLite);
  }
  return { subjects: out };
}

/**
 * Aggregated guardian tutoring dashboard payload.
 */
export async function getGuardianTutoringDashboard(clientId) {
  const feed = await getGuardianLearningSnapshot(clientId);
  let upcomingSessions = [];
  let recentSessions = [];
  try {
    const [upcoming] = await pool.execute(
      `SELECT s.id, s.title, s.status, s.delivery_context, s.starts_at, s.ends_at, s.provider_user_id,
              CONCAT(u.first_name, ' ', u.last_name) AS provider_name
       FROM learning_class_sessions s
       JOIN learning_class_client_memberships m
         ON m.learning_class_id = s.learning_class_id
        AND m.client_id = ?
        AND m.membership_status IN ('active','completed')
       LEFT JOIN users u ON u.id = s.provider_user_id
       WHERE (s.session_subtype = 'tutoring' OR s.mode = 'individual')
         AND s.starts_at > NOW()
         AND (s.status IS NULL OR s.status IN ('scheduled','live'))
       ORDER BY s.starts_at ASC
       LIMIT 8`,
      [clientId]
    );
    upcomingSessions = upcoming || [];
  } catch {
    upcomingSessions = [];
  }
  try {
    const [past] = await pool.execute(
      `SELECT s.id, s.title, s.status, s.delivery_context, s.starts_at, s.ends_at, s.provider_user_id,
              CONCAT(u.first_name, ' ', u.last_name) AS provider_name
       FROM learning_class_sessions s
       JOIN learning_class_client_memberships m
         ON m.learning_class_id = s.learning_class_id
        AND m.client_id = ?
        AND m.membership_status IN ('active','completed')
       LEFT JOIN users u ON u.id = s.provider_user_id
       WHERE (s.session_subtype = 'tutoring' OR s.mode = 'individual')
         AND s.starts_at < NOW()
       ORDER BY COALESCE(s.ends_at, s.starts_at) DESC
       LIMIT 5`,
      [clientId]
    );
    recentSessions = past || [];
  } catch {
    recentSessions = [];
  }

  const allPractice = (feed.subjects || []).flatMap((s) =>
    (s.practice || []).map((a) => ({
      ...a,
      subjectLabel: s.subject?.subject_label
    }))
  );
  const skillBars = (feed.subjects || []).flatMap((s) =>
    (s.skillMap || []).slice(0, 6).map((sk) => ({
      subjectLabel: s.subject?.subject_label,
      title: sk.title,
      status: sk.status,
      progressPct: ['secure', 'mastered', 'generalized'].includes(sk.status)
        ? 100
        : sk.status === 'developing'
          ? 65
          : sk.status === 'emerging'
            ? 35
            : sk.status === 'nearly_secure'
              ? 85
              : 15,
      standardCode: sk.standardsRefs?.[0]?.code || null
    }))
  );
  const overallProgress = feed.subjects?.length
    ? Math.round(
        feed.subjects.reduce((sum, s) => sum + (Number(s.progressPct) || 0), 0) / feed.subjects.length
      )
    : 0;

  return {
    subjects: feed.subjects,
    upcomingSessions,
    recentSessions,
    nextSession: upcomingSessions[0] || null,
    practice: allPractice,
    skillBars,
    overallProgress,
    recentParentUpdates: (feed.subjects || []).flatMap((s) =>
      (s.recentParentUpdates || []).map((u) => ({
        ...u,
        subjectLabel: s.subject?.subject_label
      }))
    ),
    publishedReports: (feed.subjects || []).flatMap((s) =>
      (s.publishedReports || []).map((r) => ({
        ...r,
        subjectLabel: s.subject?.subject_label
      }))
    )
  };
}

/**
 * Live tutor AI assist during a session (explain / intervene / recap).
 */
export async function runTutorAssist(
  { action = 'explain', studentSubjectId, planGoalId = null, observation = null },
  actorUserId
) {
  const subject = await StudentSubject.findById(studentSubjectId);
  if (!subject) {
    const err = new Error('Student subject not found');
    err.status = 404;
    throw err;
  }
  const activePlan = await StudentLearningPlan.findActiveBySubject(studentSubjectId);
  const goals = activePlan ? await StudentLearningPlan.listGoals(activePlan.id) : [];
  const goal =
    (planGoalId && goals.find((g) => Number(g.id) === Number(planGoalId))) ||
    goals.find((g) => !['secure', 'mastered', 'generalized'].includes(String(g.status))) ||
    goals[0] ||
    null;
  const standards = await TutoringCasStandard.search({
    subjectKey: subject.subject_key,
    gradeBand: mapGradeToBand(subject.school_grade),
    q: goal?.title || null
  }).catch(() => []);

  const ai = await callTutoringAiJson({
    prompt: buildTutorAssistPrompt({ action, subject, goal, observation, standards }),
    temperature: 0.4,
    maxOutputTokens: 800
  });

  let draft = ai.draft;
  if (!ai.ok || !draft) {
    draft = {
      title: action === 'recap' ? 'Family recap draft' : action === 'intervene' ? 'Try this next' : 'Explanation',
      coachText:
        action === 'intervene'
          ? 'Pause and use a visual model. Have the student explain one step before continuing.'
          : action === 'recap'
            ? `Today we worked on ${goal?.title || subject.subject_label}. Practice the assigned items together before the next session.`
            : `Explain ${goal?.title || 'the skill'} with a concrete example, then ask the student to teach it back.`,
      familyText:
        action === 'recap'
          ? `Today in ${subject.subject_label} we practiced ${goal?.title || 'current goals'}. Please try the short practice together before next time.`
          : null,
      practiceBullets: goal ? [`Practice: ${goal.title}`] : [],
      standardCodes: (standards || []).slice(0, 2).map((s) => s.standard_code)
    };
  }

  let artifact = null;
  try {
    artifact = await TutoringAiArtifact.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        artifactType: action === 'recap' ? 'parent_update' : 'next_step',
        modelName: ai.modelName || 'rules-v1',
        promptVersion: 'tutor-assist-1',
        inputRef: { action, planGoalId: goal?.id || null },
        draftContent: draft,
        draftText: draft.coachText || draft.familyText || ''
      },
      actorUserId
    );
  } catch {
    // non-blocking
  }

  return { draft, artifact, standards: (standards || []).slice(0, 4) };
}

export {
  StudentSubject,
  EvaluationSummary,
  StudentLearningPlan,
  AcademicSkillEvidence,
  TutoringSessionBrief,
  TutoringSessionNote,
  StaffClientComfortPreference,
  TutoringAiArtifact,
  TutoringEvaluationItem,
  TutoringProgressAlert,
  TutoringProgressReport,
  TutoringCasStandard,
  TutoringPackageMilestone,
  TutoringOralReadingProbe,
  TutoringDocumentExtraction,
  TutoringPracticeAssignment,
  TutoringAssessmentBlueprint
};
