import {
  fail,
  text,
  hash,
  has,
  json,
  uuid,
  requirePermission,
  requireCapability,
  requirePhi,
} from "./policy.js";
import {
  pool,
  open,
  create,
  get,
  list,
  update,
  transaction,
  lockPractice,
  findSource,
  audit,
} from "./repository.js";
import { templateFields, templateAnswers } from "./templates.js";
import { patientAccess, assertMembers } from "./clinical.js";
import { validDate } from "../supervisedBillingPolicy.service.js";

const now = () => new Date().toISOString();
const canReview = (ctx, record) =>
  has(ctx, "supervise") ||
  (has(ctx, "clinical") && record.data.reviewerAccountId === ctx.accountId);
function requireIntake(ctx) {
  requireCapability(ctx, "intake");
  requireCapability(ctx, "clients");
  requirePhi(ctx);
  if (ctx.actorType !== "staff") requireCapability(ctx, "portal");
}
const isRespondent = (ctx, record) =>
  ctx.actorType !== "staff" &&
  ctx.accountId === record.data.respondentAccountId &&
  ctx.actorType === record.data.respondentType &&
  (!record.patientId || ctx.patientIds.includes(record.patientId));
async function reviewerAccess(ctx, record, db = pool) {
  if (!canReview(ctx, record))
    throw fail(403, "Assigned clinical reviewer access is required.");
  const chartId = record.patientId || record.data.acceptedPatientId;
  if (chartId) await patientAccess(ctx, chartId, true, db);
}
async function clinicalReadAccess(ctx, record) {
  if (canReview(ctx, record)) return reviewerAccess(ctx, record);
  if (record.data.status === "accepted" && record.data.acceptedPatientId) {
    await patientAccess(ctx, record.data.acceptedPatientId, true);
    return;
  }
  throw fail(403, "Assigned clinical reviewer access is required.");
}
function demographicValues(input = {}, complete = false) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail(400, "Invalid demographic answers.");
  const result = {};
  for (const [key, limit] of Object.entries({
    name: 200,
    dob: 10,
    email: 254,
    phone: 40,
    address: 500,
  })) {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > limit)
      throw fail(400, `Invalid ${key}.`);
    result[key] = value.trim();
  }
  if (complete) {
    text(result.name, "Patient full name", 200);
    if (!validDate(result.dob) || result.dob > now().slice(0, 10))
      throw fail(400, "Enter a valid patient birth date.");
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
    throw fail(400, "Enter a valid email address.");
  return result;
}
function templatePermission(ctx) {
  requireCapability(ctx, "intake");
  requirePermission(ctx, "admin");
}
export async function intakeTemplates(ctx) {
  templatePermission(ctx);
  return list(ctx, "intake_template");
}
export async function saveIntakeTemplate(ctx, input, id) {
  templatePermission(ctx);
  if (!["active", "inactive"].includes(input.status))
    throw fail(400, "Choose a questionnaire status.");
  const data = {
    name: text(input.name, "Questionnaire name", 200),
    instructions:
      typeof input.instructions === "string"
        ? input.instructions.trim().slice(0, 4000)
        : "",
    fields: templateFields(input.fields),
    status: input.status,
  };
  if (!id) return create(ctx, "intake_template", data);
  const prior = await get(ctx, "intake_template", id);
  if (prior.revision !== Number(input.revision))
    throw fail(409, "Refresh the questionnaire before saving.");
  return update(ctx, prior, data);
}
export async function intakeOptions(ctx) {
  templatePermission(ctx);
  requireIntake(ctx);
  const [rows] = await pool.execute(
    "SELECT a.id,a.profile,a.status,m.actor_type,m.permissions,m.patient_ids FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.status='active' AND a.status IN ('active','pending')",
    [ctx.practiceId],
  );
  const people = rows.map((r) => ({
    id: r.id,
    name: open(r.profile, `auricwell:account:${r.id}`).name,
    actorType: r.actor_type,
    permissions: json(r.permissions, []),
    patientIds: json(r.patient_ids, []),
    status: r.status,
  }));
  return {
    respondents: people
      .filter((r) => ["patient", "guardian"].includes(r.actorType))
      .map(({ permissions, ...r }) => r),
    reviewers: people
      .filter(
        (r) =>
          r.actorType === "staff" &&
          r.status === "active" &&
          r.permissions.includes("clinical"),
      )
      .map((r) => ({ id: r.id, name: r.name })),
  };
}
export async function assignIntake(ctx, input) {
  requireIntake(ctx);
  requirePermission(ctx, "admin");
  requireCapability(ctx, "portal");
  if (input.authorityReviewed !== true)
    throw fail(
      400,
      "Review the respondent's identity and authority for this intake.",
    );
  const key = text(input.idempotencyKey, "Assignment key", 100);
  const command = {
    templateId: input.templateId,
    templateRevision: Number(input.templateRevision),
    respondentAccountId: input.respondentAccountId,
    reviewerAccountId: input.reviewerAccountId,
    patientId: input.patientId || null,
    patientLabel: text(input.patientLabel, "Patient / intake label", 200),
    capacity: text(input.capacity, "Respondent capacity", 200),
    authorityReference: text(
      input.authorityReference,
      "Authority review reference",
      1000,
    ),
  };
  if (
    ![
      command.templateId,
      command.respondentAccountId,
      command.reviewerAccountId,
    ].every(uuid) ||
    (command.patientId && !uuid(command.patientId))
  )
    throw fail(400, "Choose valid practice records.");
  const commandHash = hash(JSON.stringify(command));
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const duplicate = await findSource(ctx, "intake", `assignment:${key}`, db);
    if (duplicate) {
      if (duplicate.data.assignmentHash !== commandHash)
        throw fail(409, "Assignment key already used for different details.");
      return intakeSummary(duplicate);
    }
    const t = await get(ctx, "intake_template", command.templateId, db);
    if (t.data.status !== "active" || t.revision !== command.templateRevision)
      throw fail(409, "Choose the current active questionnaire version.");
    const [[respondent]] = await db.execute(
      "SELECT m.actor_type,m.patient_ids FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.account_id=? AND m.status='active' AND a.status IN ('active','pending')",
      [ctx.practiceId, command.respondentAccountId],
    );
    if (!respondent || !["patient", "guardian"].includes(respondent.actor_type))
      throw fail(400, "Choose a patient or guardian account in this practice.");
    const [[reviewer]] = await db.execute(
      "SELECT m.permissions FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.account_id=? AND m.status='active' AND m.actor_type='staff' AND a.status='active'",
      [ctx.practiceId, command.reviewerAccountId],
    );
    if (!reviewer || !json(reviewer.permissions, []).includes("clinical"))
      throw fail(400, "Choose an active clinical reviewer in this practice.");
    if (command.patientId) {
      const chart = await get(ctx, "patient", command.patientId, db);
      if (!json(respondent.patient_ids, []).includes(chart.id))
        throw fail(403, "Respondent is not authorized for this patient.");
      if (
        !chart.data.careTeam?.includes(command.reviewerAccountId) &&
        !json(reviewer.permissions, []).includes("supervise")
      )
        throw fail(
          403,
          "The clinical reviewer must have access to this chart.",
        );
    }
    const r = await create(
      ctx,
      "intake",
      {
        ...command,
        snapshot: t.data,
        respondentType: respondent.actor_type,
        authorityReviewedBy: ctx.accountId,
        authorityReviewedAt: now(),
        assignmentHash: commandHash,
        status: "assigned",
        demographics: {},
        answers: {},
        submissionNumber: 0,
      },
      { patientId: command.patientId, sourceKey: `assignment:${key}` },
      db,
    );
    return intakeSummary(r);
  });
}
function intakeSummary(record) {
  const d = record.data;
  return {
    id: record.id,
    revision: record.revision,
    patientId: record.patientId,
    data: {
      patientLabel: d.patientLabel,
      status: d.status,
      respondentAccountId: d.respondentAccountId,
      reviewerAccountId: d.reviewerAccountId,
      questionnaireName: d.snapshot.name,
      templateRevision: d.templateRevision,
      acceptedPatientId: d.acceptedPatientId || null,
    },
  };
}
export async function getIntakes(ctx) {
  requireIntake(ctx);
  const result = [];
  for (const record of await list(ctx, "intake", { limit: 10000 })) {
    let readable = false;
    if (
      ctx.actorType === "staff" &&
      (has(ctx, "clinical") || has(ctx, "supervise"))
    ) {
      try {
        await clinicalReadAccess(ctx, record);
        readable = true;
      } catch (e) {
        if (![403, 404].includes(e.status)) throw e;
      }
    }
    if (has(ctx, "admin") || readable || isRespondent(ctx, record))
      result.push({
        ...intakeSummary(record),
        canRead: readable,
        canReview: readable && canReview(ctx, record),
        canRespond: isRespondent(ctx, record),
      });
  }
  return result;
}
export async function readIntake(ctx, id) {
  requireIntake(ctx);
  const r = await get(ctx, "intake", id);
  if (!isRespondent(ctx, r)) await clinicalReadAccess(ctx, r);
  await audit(ctx, "intake.viewed", id);
  // Authority evidence and administrative review details never enter the patient response.
  const {
    assignmentHash,
    acceptanceHash,
    authorityReference,
    authorityReviewedBy,
    ...data
  } = r.data;
  if (ctx.actorType === "staff")
    Object.assign(data, { authorityReference, authorityReviewedBy });
  return {
    ...r,
    data,
    canReview: canReview(ctx, r),
    canRespond: isRespondent(ctx, r),
  };
}
export async function answerIntake(ctx, id, input) {
  requireIntake(ctx);
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const r = await get(ctx, "intake", id, db, true);
    if (!isRespondent(ctx, r))
      throw fail(
        403,
        "Only the assigned patient or guardian may complete this intake.",
      );
    if (!["draft", "submit"].includes(input.action))
      throw fail(400, "Choose save draft or submit.");
    const submit = input.action === "submit";
    const demographics = demographicValues(input.demographics, submit);
    const answers = templateAnswers(
      r.data.snapshot,
      input.answers || {},
      submit,
      "submitting",
    );
    if (submit && input.reviewed !== true)
      throw fail(
        400,
        "Review the answers and your stated capacity before submitting.",
      );
    const commandHash = hash(
      JSON.stringify({ demographics, answers, reviewed: submit }),
    );
    if (
      submit &&
      r.data.status === "submitted" &&
      r.data.responseCommandHash === commandHash &&
      r.data.submissionInputRevision === Number(input.revision)
    )
      return { id: r.id, revision: r.revision, status: r.data.status };
    if (
      !["assigned", "draft", "needs_changes"].includes(r.data.status) ||
      r.revision !== Number(input.revision)
    )
      throw fail(
        409,
        "This intake changed or is no longer editable. Refresh it before continuing.",
      );
    const data = {
      ...r.data,
      demographics,
      answers,
      status: submit ? "submitted" : "draft",
    };
    if (submit) {
      const submissionNumber = (r.data.submissionNumber || 0) + 1;
      const source = {
        intakeId: id,
        submissionNumber,
        templateId: r.data.templateId,
        templateRevision: r.data.templateRevision,
        snapshot: r.data.snapshot,
        demographics,
        answers,
        respondentAccountId: ctx.accountId,
        capacity: r.data.capacity,
        reviewed: true,
        submittedAt: now(),
      };
      const submissionHash = hash(JSON.stringify(source));
      const submission = await create(
        ctx,
        "intake_submission",
        { ...source, submissionHash },
        {
          patientId: r.patientId,
          sourceKey: `intake:${id}:${submissionNumber}`,
        },
        db,
      );
      Object.assign(data, {
        submissionNumber,
        submissionId: submission.id,
        submissionHash,
        submittedAt: source.submittedAt,
        responseCommandHash: commandHash,
        submissionInputRevision: r.revision,
      });
    }
    const saved = await update(ctx, r, data, db);
    // Return only a confirmation; readIntake is the filtered response contract.
    return {
      id: saved.id,
      revision: saved.revision,
      status: saved.data.status,
    };
  });
}
export async function reviewIntake(ctx, id, input) {
  requireIntake(ctx);
  if (!["accept", "return"].includes(input.action))
    throw fail(400, "Choose accept or request corrections.");
  if (input.reviewed !== true)
    throw fail(
      400,
      "Review the exact submitted answers before recording a decision.",
    );
  const reason = text(input.reason, "Review explanation", 2000);
  const choice = input.patientId || null;
  const commandHash = hash(
    JSON.stringify({
      action: input.action,
      patientId: choice,
      submissionHash: input.submissionHash,
      reason,
      matchingReviewed: input.matchingReviewed === true,
    }),
  );
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const r = await get(ctx, "intake", id, db, true);
    await reviewerAccess(ctx, r, db);
    if (r.data.status === "accepted" && r.data.acceptanceHash === commandHash)
      return {
        acceptedPatientId: r.data.acceptedPatientId,
        created: r.data.createdChart,
      };
    if (
      r.data.status !== "submitted" ||
      r.revision !== Number(input.revision) ||
      r.data.submissionHash !== input.submissionHash
    )
      throw fail(409, "Review the current submitted version before deciding.");
    const source = await get(ctx, "intake_submission", r.data.submissionId, db);
    if (source.data.submissionHash !== input.submissionHash)
      throw fail(409, "Submitted version does not match.");
    if (input.action === "return") {
      await create(
        ctx,
        "intake_review",
        {
          intakeId: id,
          submissionId: source.id,
          submissionHash: input.submissionHash,
          decision: "return",
          reason,
          reviewedBy: ctx.accountId,
          reviewedAt: now(),
        },
        {},
        db,
      );
      const saved = await update(
        ctx,
        r,
        { ...r.data, status: "needs_changes", feedback: reason },
        db,
      );
      return {
        id: saved.id,
        revision: saved.revision,
        status: "needs_changes",
      };
    }
    if (input.matchingReviewed !== true)
      throw fail(
        400,
        "Review existing charts before creating or linking a patient.",
      );
    if (r.patientId && choice !== r.patientId)
      throw fail(
        409,
        "An intake assigned to an existing chart must stay with that chart.",
      );
    let chart;
    if (choice) {
      chart = await patientAccess(ctx, choice, true, db);
    } else {
      const demographics = demographicValues(source.data.demographics, true);
      const careTeam = [...new Set([r.data.reviewerAccountId, ctx.accountId])];
      await assertMembers(ctx, careTeam, db);
      chart = await create(
        ctx,
        "patient",
        {
          ...demographics,
          status: "active",
          careTeam,
          intakeId: id,
          intakeSubmissionId: source.id,
          source: "reviewed_intake",
        },
        { sourceKey: `intake:${id}` },
        db,
      );
    }
    await create(
      ctx,
      "intake_review",
      {
        intakeId: id,
        submissionId: source.id,
        submissionHash: input.submissionHash,
        decision: "accept",
        patientId: chart.id,
        createdChart: !choice,
        reason,
        reviewedBy: ctx.accountId,
        reviewedAt: now(),
      },
      { patientId: chart.id },
      db,
    );
    await update(
      ctx,
      r,
      {
        ...r.data,
        status: "accepted",
        acceptedPatientId: chart.id,
        createdChart: !choice,
        acceptanceHash: commandHash,
        acceptedBy: ctx.accountId,
        acceptedAt: now(),
      },
      db,
    );
    // No chart permission, financial access, charges or signed notes are created here.
    return { acceptedPatientId: chart.id, created: !choice };
  });
}
export async function cancelIntake(ctx, id, input) {
  requireIntake(ctx);
  requirePermission(ctx, "admin");
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const r = await get(ctx, "intake", id, db, true);
    if (
      ["accepted", "cancelled"].includes(r.data.status) ||
      r.revision !== Number(input.revision)
    )
      throw fail(409, "Only a current, unfinished intake can be cancelled.");
    const reason = text(input.reason, "Cancellation reason", 1000);
    await audit(ctx, "intake.cancelled", id, { reason }, db);
    return intakeSummary(
      await update(
        ctx,
        r,
        { ...r.data, status: "cancelled", cancelledAt: now() },
        db,
      ),
    );
  });
}
export async function intakeHistory(ctx, id) {
  await readIntake(ctx, id);
  return (await list(ctx, "intake_submission", { limit: 10000 })).filter(
    (r) => r.data.intakeId === id,
  );
}
