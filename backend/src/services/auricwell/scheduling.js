import {
  fail,
  text,
  hash,
  json,
  requirePermission,
  requireCapability,
  requirePhi,
  providerEligible,
  providerAvailable,
  practiceDate,
} from "./policy.js";
import {
  pool,
  decode,
  get,
  create,
  update,
  transaction,
  lockPractice,
  findSource,
  open,
} from "./repository.js";
import { patientAccess } from "./clinical.js";
import { occurrenceTime, localToInstant } from "./schedulingTime.js";
import { hydrateProviders } from "./sharedProviders.js";
import {
  hydrateAppointments,
  checkSharedAppointmentAvailability,
} from "./sharedAppointments.js";

// Keyset pagination keeps conflict and linked-record checks complete as a practice grows.
async function all(ctx, kind, db) {
  const records = [];
  let cursor = "";
  for (;;) {
    const [rows] = await db.execute(
      "SELECT * FROM auricwell_records WHERE practice_id=? AND kind=? AND id>? ORDER BY id LIMIT 500",
      [ctx.practiceId, kind, cursor],
    );
    records.push(...rows.map(decode).filter((r) => !r.data.rolledBackAt));
    if (rows.length < 500 && kind === "appointment")
      return hydrateAppointments(ctx, records, db);
    if (rows.length < 500)
      return kind === "provider" ? hydrateProviders(ctx, records, db) : records;
    cursor = rows.at(-1).id;
  }
}
function access(ctx) {
  requirePermission(ctx, "schedule");
  requireCapability(ctx, "schedule");
  requirePhi(ctx);
}
async function lockedContext(ctx, db) {
  await lockPractice(ctx, db);
  const [[practice]] = await db.execute(
    "SELECT settings,revision FROM auricwell_practices WHERE id=?",
    [ctx.practiceId],
  );
  if (!practice) throw fail(404, "Practice unavailable.");
  if (!(await staff(ctx, ctx.accountId, "schedule", db)))
    throw fail(403, "Active practice scheduling permission is required.");
  const current = {
    ...ctx,
    settings: open(practice.settings, `auricwell:practice:${ctx.practiceId}`),
    settingsRevision: practice.revision,
  };
  access(current);
  return current;
}
async function staff(ctx, accountId, permission, db) {
  const [[row]] = await db.execute(
    "SELECT m.permissions FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.account_id=? AND m.status='active' AND m.actor_type='staff' AND a.status='active' FOR SHARE",
    [ctx.practiceId, accountId],
  );
  return !!row && json(row.permissions, []).includes(permission);
}
async function eligible(ctx, provider, data, db) {
  const date = practiceDate(data.start, ctx.settings.timezone);
  if (
    !(await staff(ctx, provider.data.accountId, "clinical", db)) ||
    !providerEligible(provider, {
      service: data.serviceCode,
      location: data.location,
      date,
    })
  )
    throw fail(409, "Provider is not eligible for this service/location/date.");
  if (provider.data.supervisionRequired) {
    const supervisors = await all(ctx, "provider", db);
    if (
      !(await staff(ctx, provider.data.supervisorAccountId, "supervise", db)) ||
      !supervisors.some(
        (p) =>
          p.data.accountId === provider.data.supervisorAccountId &&
          !p.data.supervisionRequired &&
          providerEligible(p, { service: data.serviceCode, date }),
      )
    )
      throw fail(409, "An eligible practice supervisor is required.");
  }
  if (
    !providerAvailable(
      provider,
      new Date(data.start),
      new Date(data.end),
      ctx.settings.timezone,
    )
  )
    throw fail(
      409,
      "This appointment is outside the provider’s configured availability.",
    );
  if (
    !ctx.settings.services?.some(
      (s) => s.code === data.serviceCode && s.active !== false,
    )
  )
    throw fail(400, "Configure the service before booking.");
  if (!ctx.settings.locations?.includes(data.location))
    throw fail(400, "Choose a configured practice location.");
}
const bindingKeys = [
  "patientId",
  "providerId",
  "providerAccountId",
  "serviceCode",
  "start",
  "end",
  "location",
  "modality",
];
const terminal = ["cancelled", "no_show"];
const changed = (a, b) =>
  bindingKeys.some((k) =>
    ["start", "end"].includes(k)
      ? Date.parse(a[k]) !== Date.parse(b[k])
      : a[k] !== b[k],
  );
async function state(ctx, db) {
  const appointments = await all(ctx, "appointment", db);
  const linked = new Set();
  for (const kind of ["note", "claim"])
    for (const r of await all(ctx, kind, db))
      if (r.data.appointmentId) linked.add(r.data.appointmentId);
  return { appointments, linked };
}
function conflict(data, appointments, exclude = new Set()) {
  return (
    !terminal.includes(data.status) &&
    appointments.some(
      (a) =>
        !exclude.has(a.id) &&
        !terminal.includes(a.data.status) &&
        (a.data.providerAccountId === data.providerAccountId ||
          a.data.providerId === data.providerId ||
          a.patientId === data.patientId) &&
        Date.parse(a.data.start) < Date.parse(data.end) &&
        Date.parse(a.data.end) > Date.parse(data.start),
    )
  );
}
function appointmentData(input, provider, timezone) {
  const start = new Date(
    input.localStart ? localToInstant(input.localStart, timezone) : input.start,
  );
  const end = input.localStart
    ? new Date(+start + Number(input.durationMinutes) * 60000)
    : new Date(input.end);
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    end <= start ||
    end - start > 8 * 3600000
  )
    throw fail(400, "Choose a valid appointment time and duration.");
  const status = input.status || "scheduled";
  if (!["scheduled", "confirmed", "completed", ...terminal].includes(status))
    throw fail(400, "Invalid appointment status.");
  return {
    patientId: input.patientId,
    providerId: provider.id,
    providerAccountId: provider.data.accountId,
    serviceCode: input.serviceCode,
    start: start.toISOString(),
    end: end.toISOString(),
    location: text(input.location, "Location", 120),
    modality: input.modality === "video" ? "video" : "office",
    status,
  };
}
async function changeAppointment(
  ctx,
  prior,
  data,
  db,
  reason,
  exception = false,
) {
  const next = await update(
    ctx,
    prior,
    {
      ...prior.data,
      ...data,
      changedBy: ctx.profile?.name || ctx.username,
      changeReason: reason,
      changedByAccountId: ctx.accountId,
      ...(exception && prior.data.seriesId ? { seriesException: true } : {}),
    },
    db,
  );
  await create(
    ctx,
    "appointment_change",
    {
      appointmentId: prior.id,
      actorAccountId: ctx.accountId,
      reason,
      before: prior.data,
      after: next.data,
      priorRevision: prior.revision,
    },
    { patientId: prior.patientId },
    db,
  );
  return next;
}
export async function saveAppointment(ctx, input, id) {
  access(ctx);
  return transaction(async (db) => {
    ctx = await lockedContext(ctx, db);
    input = {
      ...input,
      patientId: text(input.patientId, "Patient", 50),
      providerId: text(input.providerId, "Provider", 50),
    };
    await patientAccess(ctx, input.patientId, false, db);
    const prior = id ? await get(ctx, "appointment", id, db) : null;
    if (
      prior?.canonicalAppointmentId &&
      input.sharedFingerprint !== prior.sharedFingerprint
    )
      throw fail(
        409,
        "This appointment changed in the shared backend. Refresh before saving.",
      );
    if (
      prior &&
      (prior.patientId !== input.patientId ||
        prior.revision !== Number(input.revision))
    )
      throw fail(409, "Refresh appointment.");
    const provider = await get(ctx, "provider", input.providerId, db);
    const data = appointmentData(input, provider, ctx.settings.timezone);
    const { appointments, linked } = await state(ctx, db);
    if (
      prior &&
      (linked.has(id) || prior.data.status === "completed") &&
      (changed(prior.data, data) ||
        terminal.includes(data.status) ||
        (prior.data.status === "completed" && data.status !== "completed"))
    )
      throw fail(
        409,
        "Appointments with documentation, claims, or completed care must retain their clinical linkage.",
      );
    if (!prior || changed(prior.data, data) || !terminal.includes(data.status))
      await eligible(ctx, provider, data, db);
    if (conflict(data, appointments, new Set(id ? [id] : [])))
      throw fail(
        409,
        "The patient or provider already has an appointment at this time.",
      );
    if (prior)
      return changeAppointment(
        ctx,
        prior,
        data,
        db,
        data.status === 'cancelled' ? text(input.reason, 'Cancellation reason', 2000) : (input.reason || "Individual appointment change"),
        true,
      );
    return create(ctx, "appointment", data, { patientId: input.patientId }, db);
  });
}
export async function schedulingOptions(ctx) {
  access(ctx);
  const providers = [];
  for (const p of await all(ctx, "provider", pool)) {
    if (
      p.data.sharedIdentityActive === false ||
      p.data.credentialMappingCurrent === false
    )
      continue;
    if (!(await staff(ctx, p.data.accountId, "clinical", pool))) continue;
    const {
      name,
      status,
      services,
      locations,
      availability,
      credentialsReviewed,
      licenseExpires,
      jurisdiction,
    } = p.data;
    providers.push({
      id: p.id,
      data: {
        name,
        status,
        services,
        locations,
        availability,
        credentialsReviewed,
        licenseExpires,
        jurisdiction,
      },
    });
  }
  return {
    timezone: ctx.settings.timezone,
    services: ctx.settings.services
      ?.filter((s) => s.active !== false)
      .map((s) => ({ code: s.code, name: s.name })),
    locations: ctx.settings.locations || [],
    providers,
  };
}
function command(input) {
  const action = input.action || "create";
  if (!["create", "reschedule", "cancel"].includes(action))
    throw fail(400, "Invalid series action.");
  const value = { action };
  if (action !== "create")
    value.fromAppointmentId = text(
      input.fromAppointmentId,
      "Starting appointment",
      50,
    );
  if (action === "cancel") return {...value,reason:text(input.reason,"Cancellation reason",2000)};
  Object.assign(value, {
    patientId: text(input.patientId, "Patient", 50),
    providerId: text(input.providerId, "Provider", 50),
    serviceCode: input.serviceCode,
    location: input.location,
    modality: input.modality === "video" ? "video" : "office",
    localStart: input.localStart,
    durationMinutes: Number(input.durationMinutes),
    intervalWeeks: Number(input.intervalWeeks),
    ...(action === "create" ? { count: Number(input.count) } : {}),
  });
  if (
    ![1, 2, 4].includes(value.intervalWeeks) ||
    !Number.isInteger(value.durationMinutes) ||
    value.durationMinutes < 5 ||
    value.durationMinutes > 480 ||
    (action === "create" &&
      (!Number.isInteger(value.count) || value.count < 2 || value.count > 52))
  )
    throw fail(
      400,
      "Choose 2–52 visits, a 1, 2, or 4 week interval, and a duration of 5–480 minutes.",
    );
  return value;
}
async function plan(ctx, request, db) {
  const { appointments, linked } = await state(ctx, db);
  let targets = [],
    series = null,
    first = null;
  if (request.action !== "create") {
    first = await get(ctx, "appointment", request.fromAppointmentId, db);
    await patientAccess(ctx, first.patientId, false, db);
    if (!first.data.seriesId)
      throw fail(400, "This appointment is not part of a series.");
    series = await get(ctx, "appointment_series", first.data.seriesId, db);
    targets = appointments
      .filter(
        (a) =>
          a.data.seriesId === series.id &&
          a.data.seriesSequence >= first.data.seriesSequence,
      )
      .sort((a, b) => a.data.seriesSequence - b.data.seriesSequence);
    if (
      request.action === "reschedule" &&
      request.patientId !== first.patientId
    )
      throw fail(409, "A series cannot be moved to another patient.");
  } else await patientAccess(ctx, request.patientId, false, db);
  const provider =
    request.action === "cancel"
      ? null
      : await get(ctx, "provider", request.providerId, db);
  const skipped = [],
    visits = [],
    issues = [];
  for (
    let i = 0;
    i < (request.action === "create" ? request.count : targets.length);
    i++
  ) {
    const prior = targets[i];
    const reason =
      prior &&
      (linked.has(prior.id)
        ? "Linked documentation or claim"
        : prior.data.seriesException
          ? "Individually changed appointment"
          : prior.data.status === "completed"
            ? "Completed care"
            : terminal.includes(prior.data.status)
              ? "Already cancelled or marked no-show"
              : Date.parse(prior.data.start) < Date.now()
                ? "Past appointment"
                : null);
    if (reason) {
      skipped.push({
        id: prior.id,
        revision: prior.revision,
        start: prior.data.start,
        reason,
      });
      continue;
    }
    const sequence = prior ? prior.data.seriesSequence : i;
    try {
      const timing =
        request.action === "cancel"
          ? {}
          : occurrenceTime(
              request.localStart,
              (prior ? sequence - first.data.seriesSequence : i) *
                request.intervalWeeks,
              request.durationMinutes,
              ctx.settings.timezone,
            );
      const data =
        request.action === "cancel"
          ? { ...prior.data, status: "cancelled" }
          : appointmentData(
              { ...request, ...timing, status: "scheduled" },
              provider,
              ctx.settings.timezone,
            );
      if (request.action !== "cancel") await eligible(ctx, provider, data, db);
      visits.push({
        id: prior?.id || null,
        revision: prior?.revision || null,
        sharedFingerprint: prior?.sharedFingerprint || null,
        canonicalAppointmentId: prior?.canonicalAppointmentId || null,
        sequence,
        data,
      });
    } catch (e) {
      if (![400, 409].includes(e.status)) throw e;
      issues.push({ sequence, message: e.message });
    }
  }
  const excluded = new Set(visits.map((v) => v.id).filter(Boolean));
  for (const v of visits) {
    try {
      await checkSharedAppointmentAvailability(
        ctx,
        v.data,
        visits.map((visit) => visit.canonicalAppointmentId).filter(Boolean),
        db,
      );
    } catch (error) {
      if (![400, 409].includes(error.status)) throw error;
      issues.push({ sequence: v.sequence, message: error.message });
    }
  }
  for (const v of visits)
    if (
      conflict(v.data, appointments, excluded) &&
      !issues.some((issue) => issue.sequence === v.sequence)
    )
      issues.push({
        sequence: v.sequence,
        message:
          "The patient or provider already has an appointment at this time.",
      });
  if (!visits.length && !issues.length)
    issues.push({ message: "No eligible future visits remain to change." });
  const result = {
    action: request.action,
    timezone: ctx.settings.timezone,
    seriesId: series?.id || null,
    visits,
    skipped,
    issues,
  };
  return {
    ...result,
    previewHash: hash(
      JSON.stringify({
        request,
        result,
        settings: ctx.settings,
        providerRevision: provider?.revision,
        seriesRevision: series?.revision,
      }),
    ),
  };
}
export async function previewSeries(ctx, input) {
  access(ctx);
  return transaction(async (db) => {
    ctx = await lockedContext(ctx, db);
    return plan(ctx, command(input), db);
  });
}
export async function applySeries(ctx, input) {
  access(ctx);
  const request = command(input);
  const key = text(input.idempotencyKey, "Request identifier", 100);
  if (input.reviewed !== true || !input.previewHash)
    throw fail(400, "Review the appointment preview before saving.");
  const requestHash = hash(
    JSON.stringify({ request, previewHash: input.previewHash }),
  );
  return transaction(async (db) => {
    ctx = await lockedContext(ctx, db);
    const previous = await findSource(ctx, "appointment_command", key, db);
    if (previous) {
      if (previous.data.requestHash !== requestHash)
        throw fail(409, "This request identifier has already been used.");
      await patientAccess(ctx, previous.patientId, false, db);
      return previous.data.result;
    }
    const preview = await plan(ctx, request, db);
    if (preview.issues.length)
      throw fail(
        409,
        "Resolve all appointment issues before saving the series.",
      );
    if (preview.previewHash !== input.previewHash)
      throw fail(
        409,
        "The schedule or configuration changed. Preview the series again.",
      );
    let series = preview.seriesId
      ? await get(ctx, "appointment_series", preview.seriesId, db)
      : await create(
          ctx,
          "appointment_series",
          { ...request, timezone: ctx.settings.timezone },
          { patientId: request.patientId },
          db,
        );
    const ids = [];
    // The reviewed batch's own old times must not block another moved visit.
    // All proposals were checked before writes and commit atomically.
    ctx = {
      ...ctx,
      sharedAppointmentBatchIds: preview.visits
        .map((v) => v.canonicalAppointmentId)
        .filter(Boolean),
    };
    for (const visit of preview.visits) {
      const data = {
        ...visit.data,
        seriesId: series.id,
        seriesSequence: visit.sequence,
        intervalWeeks: request.intervalWeeks || visit.data.intervalWeeks,
      };
      const record = visit.id
        ? await changeAppointment(
            ctx,
            await get(ctx, "appointment", visit.id, db),
            data,
            db,
            request.reason || `Series ${request.action}`,
          )
        : await create(
            ctx,
            "appointment",
            data,
            {
              patientId: data.patientId,
              sourceKey: `${series.id}:${visit.sequence}`,
            },
            db,
          );
      ids.push(record.id);
    }
    if (request.action !== "create")
      series = await update(
        ctx,
        series,
        {
          ...series.data,
          lastChange: request,
          changedAt: new Date().toISOString(),
        },
        db,
      );
    const result = {
      seriesId: series.id,
      appointmentIds: ids,
      skipped: preview.skipped,
    };
    await create(
      ctx,
      "appointment_command",
      { requestHash, result, request, actorAccountId: ctx.accountId },
      { patientId: series.patientId, sourceKey: key },
      db,
    );
    return result;
  });
}


export async function requestGuardianChange(ctx, input) {
  requireCapability(ctx, 'schedule'); requirePhi(ctx);
  if (!['cancel','reschedule'].includes(input.requestType)) throw fail(400,'Choose cancellation or rescheduling.');
  const reason=text(input.message,'Reason',2000);
  return transaction(async db=>{
    await lockPractice(ctx,db);
    const appointment=await get(ctx,'appointment',input.appointmentId,db,true);
    await patientAccess(ctx,appointment.patientId,false,db);
    if (!['scheduled','confirmed'].includes(appointment.data.status)) throw fail(409,'This appointment cannot receive a change request.');
    const pending=(await all(ctx,'appointment_request',db)).find(r=>r.data.appointmentId===appointment.id&&r.data.status==='pending');
    if (pending) throw fail(409,'A request is already waiting for provider approval.');
    return create(ctx,'appointment_request',{appointmentId:appointment.id,requestType:input.requestType,message:reason,
      requestedBy:ctx.accountId,requestedByName:ctx.profile?.name||ctx.username,requestedStart:appointment.data.start,status:'pending'}, {patientId:appointment.patientId},db);
  });
}
export async function decideGuardianChange(ctx,id,input) {
  requireCapability(ctx,'schedule');requirePermission(ctx,'schedule');requirePhi(ctx);
  if(!['approved','declined'].includes(input.decision))throw fail(400,'Approve or decline the request.');
  const reason=text(input.resolution,'Decision reason',2000);
  return transaction(async db=>{
    await lockPractice(ctx,db);
    const request=await get(ctx,'appointment_request',id,db,true);
    if(!request.data.appointmentId || request.data.status!=='pending')throw fail(409,'This request is not pending.');
    const appointment=await get(ctx,'appointment',request.data.appointmentId,db,true);
    await patientAccess(ctx,appointment.patientId,false,db);
    if(appointment.data.providerAccountId!==ctx.accountId)throw fail(403,'The assigned provider must decide this request.');
    if(input.decision==='approved'){
      if(request.data.requestType==='cancel'){
        if(!['scheduled','confirmed'].includes(appointment.data.status))throw fail(409,'The appointment has already changed.');
        const {linked}=await state(ctx,db);
        if(linked.has(appointment.id))throw fail(409,'Complete the clinical appointment-change workflow before cancelling documented care.');
        await changeAppointment(ctx,appointment,{...appointment.data,status:'cancelled'},db,reason,true);
      } else if(appointment.data.start===request.data.requestedStart||appointment.data.changedByAccountId!==ctx.accountId){
        throw fail(409,'Reschedule this appointment first, then approve the request.');
      }
    }
    return update(ctx,request,{...request.data,status:input.decision,resolution:reason,resolvedBy:ctx.accountId,
      resolvedByName:ctx.profile?.name||ctx.username,resolvedAt:new Date().toISOString()},db);
  });
}
