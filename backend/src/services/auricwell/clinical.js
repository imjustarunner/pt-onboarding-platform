import {
  fail,
  text,
  hash,
  has,
  requirePermission,
  requireCapability,
  requirePhi,
  canReadPatient,
  canReadClinical,
  providerEligible,
  THERAPY_CREDENTIALS,
  THERAPY_SERVICE_CODES,
  practiceDate,
  money,
  ledgerBalance,
} from "./policy.js";
import {
  pool,
  create,
  get,
  list,
  update,
  transaction,
  lockPractice,
  audit,
} from "./repository.js";
import { validDate, validNpi } from "../supervisedBillingPolicy.service.js";
import { staffIdentity } from "./sharedProviders.js";
import {
  structuredNote,
  structuredContent,
  templateAnswers,
} from "./templates.js";

export async function patientAccess(
  ctx,
  patientId,
  clinical = false,
  db = pool,
) {
  requirePhi(ctx);
  const patient = await get(ctx, "patient", patientId, db);
  if (
    !(clinical ? canReadClinical(ctx, patient) : canReadPatient(ctx, patient))
  )
    throw fail(403, "You do not have access to this patient.");
  return patient;
}
export async function assertMembers(ctx, ids, db = pool) {
  if (!Array.isArray(ids) || ids.length > 100)
    throw fail(400, "Invalid care team.");
  for (const id of ids) {
    const [[m]] = await db.execute(
      "SELECT account_id FROM auricwell_memberships WHERE practice_id=? AND account_id=? AND status='active' AND actor_type='staff'",
      [ctx.practiceId, id],
    );
    if (!m) throw fail(400, "Care team members must belong to this practice.");
  }
}
export async function savePatient(ctx, input, id) {
  requirePhi(ctx);
  requireCapability(ctx, "clients");
  if (!has(ctx, "clinical") && !has(ctx, "schedule") && !has(ctx, "admin"))
    throw fail(403, "Patient management permission required.");
  const prior = id ? await patientAccess(ctx, id) : null;
  if (
    prior?.canonicalClientId &&
    input.sharedFingerprint !== prior.sharedFingerprint
  )
    throw fail(
      409,
      "This patient changed in the shared backend. Refresh before saving.",
    );
  const careTeam =
    input.careTeam ||
    prior?.data.careTeam ||
    (has(ctx, "clinical") ? [ctx.accountId] : []);
  await assertMembers(ctx, careTeam);
  if (!validDate(input.dob)) throw fail(400, "A valid birth date is required.");
  const data = {
    name: text(input.name, "Patient name", 200),
    dob: input.dob,
    phone: String(input.phone || "").slice(0, 40),
    email: String(input.email || "").slice(0, 254),
    address: String(input.address || "").slice(0, 500),
    status: ["active", "waitlist", "discharged"].includes(input.status)
      ? input.status
      : "active",
    careTeam,
    sourceId: prior?.data.sourceId || null,
  };
  if (prior && Number(input.revision) !== prior.revision)
    throw fail(409, "Refresh this patient before saving.");
  return prior
    ? update(ctx, prior, { ...prior.data, ...data })
    : create(ctx, "patient", data);
}
export async function saveProvider(ctx, input, id) {
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    return saveProviderLocked(ctx, input, id, db);
  });
}
async function saveProviderLocked(ctx, input, id, db) {
  requirePermission(ctx, "admin");
  await assertMembers(ctx, [input.accountId], db);
  if (input.supervisorAccountId)
    await assertMembers(ctx, [input.supervisorAccountId], db);
  if (
    !THERAPY_CREDENTIALS.includes(String(input.credential || "").toUpperCase())
  )
    throw fail(400, "Choose a supported therapy credential category.");
  if (
    (input.services || []).some((code) => !THERAPY_SERVICE_CODES.includes(code))
  )
    throw fail(400, "Provider services must be in the therapy launch scope.");
  if (input.licenseExpires && !validDate(input.licenseExpires))
    throw fail(400, "Invalid license expiration date.");
  if (input.supervisorAccountId === input.accountId)
    throw fail(400, "A provider cannot supervise themselves.");
  if (input.npi && !validNpi(input.npi)) throw fail(400, "Enter a valid NPI.");
  if (input.jurisdiction !== "CO")
    throw fail(400, "Initial clinical configuration supports Colorado.");
  if (!["active", "inactive"].includes(input.status))
    throw fail(400, "Choose provider status.");
  if (
    !Array.isArray(input.availability || []) ||
    (input.availability || []).some(
      (w) =>
        !Number.isInteger(w.day) ||
        w.day < 0 ||
        w.day > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end) ||
        w.start >= w.end,
    )
  )
    throw fail(400, "Choose valid provider availability windows.");
  const previous = id ? await get(ctx, "provider", id, db) : null;
  if (previous && previous.data.accountId !== input.accountId)
    throw fail(
      409,
      "A provider's staff identity cannot be reassigned. Create a separate provider profile.",
    );
  const identity = await staffIdentity(ctx, input.accountId, db, {
    lock: true,
  });
  if (identity) {
    if (!identity.fingerprint)
      throw fail(
        409,
        "The shared staff identity is no longer available in this practice.",
      );
    if (previous && input.sharedFingerprint !== identity.fingerprint)
      throw fail(
        409,
        "The shared staff identity changed. Refresh before saving.",
      );
    if (String(input.name || "").trim() !== identity.name)
      throw fail(
        409,
        "Provider names are maintained in the shared staff record. Refresh before saving.",
      );
  }
  if (
    !has(ctx, "billing") &&
    JSON.stringify(input.payerEnrollments || []) !==
      JSON.stringify(previous?.data.payerEnrollments || [])
  )
    throw fail(
      403,
      "Billing permission is required to change payer enrollment.",
    );
  if (!Array.isArray(input.payerEnrollments || []))
    throw fail(400, "Invalid payer enrollments.");
  for (const enrollment of input.payerEnrollments || []) {
    await get(ctx, "payer", enrollment.payerId, db);
  }
  const data = {
    accountId: input.accountId,
    name: text(input.name, "Provider name", 200),
    credential: text(input.credential, "Credential", 100),
    license: String(input.license || "").slice(0, 80),
    licenseExpires: input.licenseExpires || null,
    jurisdiction: "CO",
    status: input.status,
    credentialsReviewed: input.credentialsReviewed === true,
    ...(identity ? { reviewedSharedCredential: identity.credential } : {}),
    supervisionRequired: input.supervisionRequired === true,
    supervisorAccountId: input.supervisorAccountId || null,
    services: (input.services || []).map(String).slice(0, 100),
    locations: (input.locations || []).map(String).slice(0, 50),
    billingFirstName: String(input.billingFirstName || "")
      .trim()
      .slice(0, 100),
    billingLastName: String(input.billingLastName || "")
      .trim()
      .slice(0, 100),
    npi: input.npi || "",
    taxonomy: String(input.taxonomy || "").slice(0, 20),
    payerEnrollments: input.payerEnrollments || [],
    availability: input.availability || [],
  };
  if (id) {
    const prior = await get(ctx, "provider", id, db);
    if (Number(input.revision) !== prior.revision)
      throw fail(409, "Refresh provider.");
    return update(ctx, prior, data, db);
  }
  return create(
    ctx,
    "provider",
    data,
    {
      sourceKey: `account:${input.accountId}`,
    },
    db,
  );
}
export { saveAppointment } from "./scheduling.js";
export async function saveNote(ctx, input, id) {
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    return saveNoteLocked(ctx, input, id, db);
  });
}
async function saveNoteLocked(ctx, input, id, db) {
  requirePermission(ctx, "clinical");
  requireCapability(ctx, "documentation");
  await patientAccess(ctx, input.patientId, true, db);
  const prior = id ? await get(ctx, "note", id, db) : null;
  if (
    prior &&
    (prior.data.status !== "draft" ||
      prior.data.authorAccountId !== ctx.accountId ||
      prior.patientId !== input.patientId ||
      prior.revision !== Number(input.revision))
  )
    throw fail(409, "Only your current unsigned draft can be edited.");
  const structured = await structuredNote(ctx, input, prior);
  const narrative = input.content || "";
  if (typeof narrative !== "string" || narrative.length > 100000)
    throw fail(
      400,
      "Clinical documentation must be text of at most 100000 characters.",
    );
  const appointment = input.appointmentId
    ? await get(ctx, "appointment", input.appointmentId, db)
    : null;
  if (
    appointment &&
    (appointment.patientId !== input.patientId ||
      appointment.data.providerAccountId !== ctx.accountId)
  )
    throw fail(403, "Choose your appointment for this patient.");
  if (
    input.billable === true &&
    (!appointment ||
      ["cancelled", "no_show"].includes(appointment.data.status) ||
      !["Progress note", "Intake assessment"].includes(input.type) ||
      appointment.data.serviceCode !== input.serviceCode)
  )
    throw fail(
      409,
      "Billable documentation requires a matching clinical appointment and service note type.",
    );
  if (
    input.billable === true &&
    input.serviceDate !==
      practiceDate(appointment.data.start, ctx.settings.timezone)
  )
    throw fail(
      409,
      "The documented service date must match the appointment in the practice timezone.",
    );
  if (!validDate(input.serviceDate))
    throw fail(400, "Choose a valid service date.");
  const author = (await list(ctx, "provider", {}, db)).find(
    (p) => p.data.accountId === ctx.accountId,
  );
  if (
    !author ||
    !providerEligible(author, {
      service: input.serviceCode || undefined,
      location: appointment?.data.location,
      date: input.serviceDate,
    })
  )
    throw fail(
      409,
      "Documentation requires your reviewed, eligible provider profile for this service and location.",
    );
  if (
    input.serviceCode &&
    !ctx.settings.services?.some(
      (s) => s.code === input.serviceCode && s.active !== false,
    )
  )
    throw fail(409, "The service is unavailable in this practice.");
  const data = {
    patientId: input.patientId,
    appointmentId: input.appointmentId || null,
    serviceDate: input.serviceDate,
    type: text(input.type, "Note type", 80),
    title: text(input.title, "Note title", 200),
    content: text(
      structured ? structuredContent(structured, narrative) : narrative,
      "Clinical documentation",
      100000,
    ),
    ...(structured ? { structured, narrative } : {}),
    serviceCode: String(input.serviceCode || "").slice(0, 20),
    diagnoses: (input.diagnoses || []).map(String).slice(0, 20),
    authorAccountId: ctx.accountId,
    status: "draft",
    parentNoteId: input.parentNoteId || null,
    source: "auricwell",
    billable: input.billable === true,
  };
  if (data.parentNoteId) {
    const parent = await get(ctx, "note", data.parentNoteId, db);
    if (
      parent.patientId !== data.patientId ||
      !["signed", "cosigned"].includes(parent.data.status)
    )
      throw fail(400, "Amendments must reference a signed note in this chart.");
    data.billable = false;
  }
  if (prior) return update(ctx, prior, data, db);
  return create(ctx, "note", data, { patientId: input.patientId }, db);
}
export async function signNote(ctx, id, input) {
  requireCapability(ctx, "documentation");
  requirePermission(ctx, input.cosign ? "supervise" : "clinical");
  return transaction(async (db) => {
    const note = await get(ctx, "note", id, db, true);
    await patientAccess(ctx, note.patientId, true, db);
    if (note.revision !== Number(input.revision) || input.reviewed !== true)
      throw fail(409, "Review this exact note version before signing.");
    if (note.data.structured)
      templateAnswers(
        note.data.structured.snapshot,
        note.data.structured.answers,
        true,
      );
    if (
      note.data.serviceCode &&
      !ctx.settings.services?.some(
        (s) => s.code === note.data.serviceCode && s.active !== false,
      )
    )
      throw fail(409, "The service is unavailable in this practice.");
    const providers = await list(ctx, "provider", {}, db);
    const author = providers.find(
      (p) => p.data.accountId === note.data.authorAccountId,
    );
    if (
      !author ||
      !providerEligible(author, {
        service: note.data.serviceCode || undefined,
        date: note.data.serviceDate,
      })
    )
      throw fail(
        409,
        "The author needs a reviewed, eligible provider profile.",
      );
    if (input.cosign) {
      if (
        note.data.status !== "signed" ||
        author.data.supervisorAccountId !== ctx.accountId ||
        note.data.authorAccountId === ctx.accountId
      )
        throw fail(
          403,
          "Only the assigned supervisor can cosign this signed note.",
        );
      const supervisor = providers.find(
        (p) => p.data.accountId === ctx.accountId,
      );
      if (
        !supervisor ||
        !providerEligible(supervisor, { date: note.data.serviceDate })
      )
        throw fail(409, "Supervisor credentials must be reviewed and active.");
      return update(
        ctx,
        note,
        {
          ...note.data,
          status: "cosigned",
          cosignedAt: new Date().toISOString(),
          cosignedBy: ctx.accountId,
          cosignedHash: note.data.signedHash,
        },
        db,
      );
    }
    if (
      note.data.status !== "draft" ||
      note.data.authorAccountId !== ctx.accountId
    )
      throw fail(403, "Only the author can sign an unsigned note.");
    return update(
      ctx,
      note,
      {
        ...note.data,
        status: "signed",
        signedAt: new Date().toISOString(),
        signedBy: ctx.accountId,
        signedHash: hash(JSON.stringify(note.data)),
        requiresCosign: author.data.supervisionRequired,
      },
      db,
    );
  });
}
export async function postLedger(ctx, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  await patientAccess(ctx, input.patientId);
  money(input.amountCents);
  if (
    !["charge", "opening_balance", "payment", "adjustment", "refund"].includes(
      input.type,
    )
  )
    throw fail(400, "Choose a supported transaction type.");
  if (!validDate(input.date))
    throw fail(400, "Choose a valid transaction date.");
  if (
    !["cash", "check", "external", "insurance", "none"].includes(input.method)
  )
    throw fail(400, "Manual entries require a supported payment method.");
  const key = text(input.idempotencyKey, "Transaction key", 100);
  const commandHash = hash(
    JSON.stringify({
      patientId: input.patientId,
      type: input.type,
      amountCents: input.amountCents,
      date: input.date,
      method: input.method,
      reason: input.reason,
      paymentId: input.paymentId || null,
    }),
  );
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const entries = await list(
      ctx,
      "ledger",
      { patientId: input.patientId, limit: 10000 },
      db,
    );
    const duplicate = entries.find((e) => e.data.idempotencyKey === key);
    if (duplicate) {
      if (duplicate.data.commandHash !== commandHash)
        throw fail(409, "This transaction key was used for different details.");
      return duplicate;
    }
    if (
      input.type === "opening_balance" &&
      entries.some((e) => ["charge", "opening_balance"].includes(e.data.type))
    )
      throw fail(
        409,
        "An opening balance cannot be added after charges or another opening balance.",
      );
    if (input.type === "refund") {
      const original = entries.find(
        (e) => e.id === input.paymentId && e.data.type === "payment",
      );
      if (!original) throw fail(400, "Choose the original payment.");
      if (original.data.source === "stripe")
        throw fail(409, "Use the processor refund workflow for card payments.");
      const refunded = entries
        .filter(
          (e) => e.data.type === "refund" && e.data.paymentId === original.id,
        )
        .reduce((n, e) => n + e.data.amountCents, 0);
      if (refunded + input.amountCents > original.data.amountCents)
        throw fail(409, "Refund exceeds the original payment.");
    }
    return create(
      ctx,
      "ledger",
      {
        type: input.type,
        amountCents: input.amountCents,
        date: input.date,
        method: input.method,
        reason: text(input.reason, "Description / reference", 1000),
        paymentId: input.paymentId || null,
        idempotencyKey: key,
        commandHash,
        recordedBy: ctx.accountId,
        source: "manual",
        currency: "USD",
      },
      { patientId: input.patientId, sourceKey: `command:${key}` },
      db,
    );
  });
}
export async function prepareClaim(ctx, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  requirePhi(ctx);
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const note = await get(ctx, "note", input.noteId, db);
    await patientAccess(ctx, note.patientId, false, db);
    if (
      note.data.source !== "auricwell" ||
      !note.data.billable ||
      !["signed", "cosigned"].includes(note.data.status) ||
      (note.data.requiresCosign && note.data.status !== "cosigned") ||
      note.data.parentNoteId
    )
      throw fail(
        409,
        "Claims require signed billable documentation and completed required cosigning.",
      );
    if (note.data.serviceDate > practiceDate(new Date(), ctx.settings.timezone))
      throw fail(409, "A future service cannot enter a claim.");
    const appointment = note.data.appointmentId
      ? await get(ctx, "appointment", note.data.appointmentId, db)
      : null;
    if (
      !appointment ||
      appointment.data.status !== "completed" ||
      appointment.patientId !== note.patientId ||
      appointment.data.serviceCode !== note.data.serviceCode
    )
      throw fail(
        409,
        "Complete and verify the linked appointment before preparing a claim.",
      );
    const payer = await get(ctx, "payer", input.payerId, db);
    const providers = await list(ctx, "provider", {}, db);
    const provider = providers.find(
      (p) => p.data.accountId === note.data.authorAccountId,
    );
    if (
      !provider ||
      !validNpi(provider.data.npi) ||
      !providerEligible(provider, {
        service: note.data.serviceCode,
        date: note.data.serviceDate,
      })
    )
      throw fail(409, "Rendering provider is not ready for billing.");
    const claims = await list(
      ctx,
      "claim",
      { patientId: note.patientId, limit: 10000 },
      db,
    );
    const existing = claims.find(
      (c) =>
        c.data.noteId === note.id || c.data.appointmentId === appointment.id,
    );
    if (existing) return existing;
    const units = input.units ?? 1,
      modifiers = input.modifiers || [],
      placeOfService = input.placeOfService || "11";
    if (
      !Number.isFinite(units) ||
      units <= 0 ||
      units > 999 ||
      !Array.isArray(modifiers) ||
      modifiers.length > 4 ||
      modifiers.some((m) => !/^[A-Z0-9]{2}$/.test(m)) ||
      !/^\d{2}$/.test(placeOfService)
    )
      throw fail(400, "Review units, modifiers and place of service.");
    const data = {
      units,
      modifiers,
      placeOfService,
      appointmentId: appointment.id,
      noteId: note.id,
      noteHash: note.data.signedHash,
      payerId: payer.id,
      providerId: provider.id,
      date: note.data.serviceDate,
      serviceCode: note.data.serviceCode,
      diagnoses: note.data.diagnoses,
      amountCents: money(input.amountCents),
      status: "draft",
      source: "auricwell",
      reviewedHash: null,
      transmission: "not_configured",
    };
    return create(
      ctx,
      "claim",
      data,
      { patientId: note.patientId, sourceKey: `appointment:${appointment.id}` },
      db,
    );
  });
}
export async function reviewClaim(ctx, id, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  requirePhi(ctx);
  const r = await get(ctx, "claim", id);
  if (
    r.data.status !== "draft" ||
    r.revision !== Number(input.revision) ||
    input.approved !== true
  )
    throw fail(409, "Review the current draft claim.");
  return update(ctx, r, {
    ...r.data,
    status: "reviewed",
    reviewedHash: hash(JSON.stringify(r.data)),
    reviewedBy: ctx.accountId,
    reviewedAt: new Date().toISOString(),
  });
}
export async function createMessage(ctx, input) {
  requirePhi(ctx);
  requireCapability(ctx, "messages");
  await patientAccess(ctx, input.patientId);
  const contacts = await messageContacts(ctx, input.patientId);
  const sharedWithGuardians = ctx.actorType === 'guardian' || contacts.some(p => p.actorType === 'guardian');
  const recipients = sharedWithGuardians ? contacts.map(p => p.id) : [...new Set(input.recipients || [])];
  if (!recipients.length || recipients.length > 30)
    throw fail(400, "Select conversation recipients.");
  for (const accountId of recipients) {
    const [[m]] = await pool.execute(
      "SELECT * FROM auricwell_memberships WHERE practice_id=? AND account_id=? AND status='active'",
      [ctx.practiceId, accountId],
    );
    if (!m) throw fail(403, "Recipients must belong to this practice.");
    const { json } = await import("./policy.js");
    const patient = await get(ctx, "patient", input.patientId);
    if (
      m.actor_type !== "staff" &&
      !json(m.patient_ids, []).includes(patient.id)
    )
      throw fail(403, "Recipient has no access to this patient.");
    if (
      m.actor_type === "staff" &&
      !(patient.data.careTeam || []).includes(accountId)
    )
      throw fail(403, "Choose a member of this patient’s care team.");
  }
  return create(
    ctx,
    "message",
    {
      body: text(input.body, "Message", 20000),
      sender: ctx.accountId,
      sharedWithGuardians,
      recipients,
      readBy: [ctx.accountId],
      sentAt: new Date().toISOString(),
    },
    { patientId: input.patientId },
  );
}
export async function workspace(ctx) {
  const { platformIntegrations } = await import('./platformIntegrations.js');
  const { settings: platform } = await platformIntegrations();
  const practice = {
    name: ctx.practiceName,
    slug: ctx.slug,
    timezone: ctx.settings.timezone,
    actorType: ctx.actorType,
    permissions: ctx.permissions,
    capabilities: ctx.settings.capabilities,
    sessionFeatures: { videoProvider: platform.videoProvider, alwaysAvailableOffice: platform.alwaysAvailableOffice },
  };
  if (!ctx.settings.phiActivatedAt)
    return {
      practice,
      patients: [],
      appointments: [],
      notes: [],
      billingNotes: [],
      messages: [],
      appointmentRequests: [],
      claims: [],
      ledger: [],
      balances: {},
      providers: has(ctx, "admin") ? await list(ctx, "provider") : [],
    };
  const patients = (await list(ctx, "patient", { limit: 10000 })).filter((p) =>
    canReadPatient(ctx, p),
  );
  const allowed = new Set(patients.map((p) => p.id));
  const filter = (rows) => rows.filter((r) => allowed.has(r.patientId));
  const appointments = filter(await list(ctx, "appointment", { limit: 10000 }));
  const appointmentRequests = filter(
    await list(ctx, "appointment_request"),
  ); // Requests and decisions are visible to every authorized guardian of the patient.
  const notes =
    ctx.actorType === "staff" && (has(ctx, "clinical") || has(ctx, "supervise"))
      ? filter(await list(ctx, "note")).filter((n) =>
          canReadClinical(
            ctx,
            patients.find((p) => p.id === n.patientId),
          ),
        )
      : [];
  const messages = filter(await list(ctx, "message")).filter(
    (m) =>
      (m.data.sharedWithGuardians && (ctx.actorType !== "staff" || patients.find(p=>p.id===m.patientId)?.data.careTeam?.includes(ctx.accountId))) ||
      m.data.sender === ctx.accountId ||
      m.data.recipients.includes(ctx.accountId),
  );
  const ledger =
    ctx.actorType !== "staff" || has(ctx, "billing")
      ? filter(await list(ctx, "ledger", { limit: 10000 })).filter(
          (e) =>
            ctx.actorType === "staff" ||
            (ctx.billingPatientIds || []).includes(e.patientId),
        )
      : [];
  const claims = has(ctx, "billing") ? await list(ctx, "claim") : [];
  const billingNotes = has(ctx, "billing")
    ? filter(await list(ctx, "note", { limit: 10000 }))
        .filter(
          (n) =>
            n.data.billable && ["signed", "cosigned"].includes(n.data.status),
        )
        .map((n) => ({
          id: n.id,
          patientId: n.patientId,
          data: {
            title: n.data.title,
            serviceDate: n.data.serviceDate,
            serviceCode: n.data.serviceCode,
            status: n.data.status,
            billable: true,
          },
        }))
    : [];
  const providers = (await list(ctx, "provider")).map((p) =>
    ctx.actorType === "staff" && has(ctx, "admin")
      ? p
      : {
          id: p.id,
          data: {
            name: p.data.name,
            credential: p.data.credential,
            accountId: p.data.accountId,
            status: p.data.status,
            services: p.data.services,
            locations: p.data.locations,
          },
        },
  );
  const caps = ctx.settings.capabilities;
  await audit(ctx, "workspace.viewed", ctx.practiceId);
  return {
    practice,
    appointmentRequests: caps.schedule ? appointmentRequests : [],
    billingPatientIds:
      ctx.actorType === "staff"
        ? patients.map((p) => p.id)
        : ctx.billingPatientIds,
    patients: caps.clients ? patients : [],
    appointments: caps.schedule ? appointments : [],
    notes: caps.documentation ? notes : [],
    billingNotes: caps.billing ? billingNotes : [],
    messages: caps.messages ? messages : [],
    claims: caps.billing ? claims : [],
    ledger: caps.billing ? ledger : [],
    providers,
    balances: Object.fromEntries(
      patients
        .filter(
          (p) =>
            ctx.settings.capabilities.billing &&
            (has(ctx, "billing") ||
              (ctx.billingPatientIds || []).includes(p.id)),
        )
        .map((p) => [
          p.id,
          ledgerBalance(ledger.filter((e) => e.patientId === p.id)),
        ]),
    ),
  };
}

export async function messageContacts(ctx, patientId) {
  requireCapability(ctx, "messages");
  const patient = await patientAccess(ctx, patientId);
  const [rows] = await pool.execute(
    "SELECT a.id,a.profile,m.actor_type,m.patient_ids FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.status='active' AND a.status='active'",
    [ctx.practiceId],
  );
  const { json } = await import("./policy.js"),
    { open } = await import("./repository.js");
  return rows
    .filter(
      (r) =>
        r.id !== ctx.accountId &&
        (r.actor_type === "staff"
          ? (patient.data.careTeam || []).includes(r.id)
          : json(r.patient_ids, []).includes(patient.id)),
    )
    .map((r) => ({
      id: r.id,
      name: open(r.profile, `auricwell:account:${r.id}`).name,
      actorType: r.actor_type,
    }));
}
export async function readMessage(ctx, id) {
  requireCapability(ctx, "messages");
  return transaction(async (db) => {
    const r = await get(ctx, "message", id, db, true);
    const patient = await patientAccess(ctx, r.patientId, false, db);
    const sharedAccess = r.data.sharedWithGuardians && (ctx.actorType !== "staff" || patient.data.careTeam?.includes(ctx.accountId));
    if (
      !sharedAccess && r.data.sender !== ctx.accountId &&
      !r.data.recipients.includes(ctx.accountId)
    )
      throw fail(403, "Conversation access required.");
    if (r.data.readBy.includes(ctx.accountId)) return r;
    return update(
      ctx,
      r,
      { ...r.data, readBy: [...r.data.readBy, ctx.accountId] },
      db,
    );
  });
}
export async function shareNote(ctx, id, input) {
  requirePermission(ctx, "clinical");
  requireCapability(ctx, "documentation");
  const note = await get(ctx, "note", id);
  await patientAccess(ctx, note.patientId, true);
  if (
    !["historical", "historical_attachment", "signed", "cosigned"].includes(
      note.data.status,
    ) ||
    input.reviewed !== true ||
    input.revision !== note.revision
  )
    throw fail(
      409,
      "Review the completed document before changing patient access.",
    );
  // A separate access grant keeps signed content and its exact hash immutable.
  const prior = (
    await list(ctx, "document_share", { patientId: note.patientId })
  ).find((r) => r.data.noteId === id);
  const data = {
    noteId: id,
    shared: input.shared === true,
    reviewedBy: ctx.accountId,
    at: new Date().toISOString(),
  };
  return prior
    ? update(ctx, prior, data)
    : create(ctx, "document_share", data, {
        patientId: note.patientId,
        sourceKey: id,
      });
}
export async function notifications(ctx) {
  const data = await workspace(ctx);
  const recordsTasks = await (await import('./recordsManagement.js')).recordsNotifications(ctx);
  const intakeTasks =
    ctx.settings.capabilities.intake &&
    ctx.settings.capabilities.clients &&
    ctx.settings.phiActivatedAt
      ? (await (await import("./intake.js")).getIntakes(ctx)).filter(
          (r) =>
            (r.canReview && r.data.status === "submitted") ||
            (r.canRespond &&
              ["assigned", "draft", "needs_changes"].includes(r.data.status)),
        )
      : [];
  const pending = (await list(ctx, "agreement")).filter(
    (r) =>
      ["issued", "partially_signed"].includes(r.data.status) &&
      r.data.signers?.some((s) => s.accountId === ctx.accountId) &&
      !r.data.signatures?.some((s) => s.accountId === ctx.accountId),
  );
  return [
    ...recordsTasks,
    ...intakeTasks.map((r) => ({
      id: r.id,
      type: "intake",
      title: r.canReview
        ? "Intake ready for clinical review"
        : "Intake questionnaire to complete",
      section: "intake",
    })),
    ...data.messages
      .filter((m) => !m.data.readBy.includes(ctx.accountId))
      .map((m) => ({
        id: m.id,
        type: "message",
        title: "Unread secure message",
        section: "messages",
      })),
    ...pending.map((r) => ({
      id: r.id,
      type: "agreement",
      title: `Signature requested: ${r.data.title}`,
      section: "agreements",
    })),
    ...data.appointments
      .filter(
        (a) =>
          !["cancelled", "completed", "no_show"].includes(a.data.status) &&
          Date.parse(a.data.start) >= Date.now() &&
          Date.parse(a.data.start) < Date.now() + 86400000,
      )
      .map((a) => ({
        id: a.id,
        type: "appointment",
        title: `Appointment ${new Date(a.data.start).toLocaleString("en-US", { timeZone: ctx.settings.timezone })}`,
        section: "schedule",
      })),
  ];
}
