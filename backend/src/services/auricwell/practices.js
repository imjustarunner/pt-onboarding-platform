import crypto from "node:crypto";
import {
  pool,
  seal,
  open,
  transaction,
  create,
  get,
  list,
  update,
  audit,
  lockPractice,
} from "./repository.js";
import {
  fail,
  text,
  json,
  initialSettings,
  requirePermission,
  readiness,
  CAPABILITIES,
  THERAPY_SERVICE_CODES,
  requireCapability,
} from "./policy.js";
import { createAccount, validatePermissions } from "./auth.js";
import Agency from "../../models/Agency.model.js";
import { staffIdentity } from "./sharedProviders.js";
import { provisionStaffIdentity } from "./staffProvisioning.js";
import { updatePracticeStaffIdentity } from "../practiceStaffIdentity.service.js";
import { owningAgency } from "./sharedPatients.js";

export async function provisionPractice(actor, input) {
  if (!actor.profile.operator)
    throw fail(403, "AuricWell operator access required.");
  const slug = String(input.slug || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9-]{2,79}$/.test(slug))
    throw fail(
      400,
      "Choose a practice address using lowercase letters, digits and hyphens.",
    );
  const name = text(input.name, "Practice name", 255),
    settings = initialSettings(input.onboardingMode || "new");
  return transaction(async (db) => {
    const id = crypto.randomUUID();
    const agency = await Agency.createClinicalPractice(
      { name, slug },
      { executor: db },
    );
    // Product configuration points at the shared organization. Canonical tenant
    // activation stays off until all EHR domains and side effects are consolidated.
    await db.execute(
      "INSERT INTO auricwell_practices (id,agency_id,slug,name,settings) VALUES (?,?,?,?,?)",
      [id, agency.id, slug, name, seal(settings, `auricwell:practice:${id}`)],
    );
    const owner = await createAccount(
      {
        username: input.ownerUsername,
        name: input.ownerName,
        email: input.ownerEmail,
      },
      db,
    );
    for (const [accountId, permissions] of [
      [actor.accountId, ["admin", "agreements", "migration"]],
      [
        owner.id,
        [
          "admin",
          "clinical",
          "schedule",
          "billing",
          "supervise",
          "agreements",
          "migration",
        ],
      ],
    ]) {
      await db.execute(
        "INSERT INTO auricwell_memberships (practice_id,account_id,permissions,patient_ids) VALUES (?,?,?,?)",
        [id, accountId, JSON.stringify(permissions), "[]"],
      );
    }
    await provisionStaffIdentity(
      { practiceId: id, accountId: actor.accountId },
      owner.id,
      db,
    );
    await audit(
      { practiceId: id, accountId: actor.accountId },
      "practice.provisioned",
      id,
      { onboardingMode: settings.onboardingMode },
      db,
    );
    return { id, agencyId: agency.id, slug, name, ownerAccountId: owner.id };
  });
}
export async function bootstrap(ctx) {
  const [rows] = await pool.execute(
    `SELECT p.id,p.slug,p.name,m.permissions,m.actor_type FROM auricwell_practices p
    JOIN auricwell_memberships m ON m.practice_id=p.id WHERE m.account_id=? AND m.status='active' AND p.status IN ('setup','active')`,
    [ctx.accountId],
  );
  return {
    account: {
      id: ctx.accountId,
      username: ctx.username,
      name: ctx.profile.name,
      operator: !!ctx.profile.operator,
    },
    practices: rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      actorType: p.actor_type,
      permissions: json(p.permissions, []),
    })),
  };
}
export async function saveSettings(ctx, input) {
  if (['videoProvider','smsProvider','alwaysAvailableOffice','googleOrganizer','platformIntegrations'].some(k => Object.hasOwn(input,k)))
    throw fail(403, 'Session providers and permanent offices are managed in platform settings only.');
  requirePermission(ctx, "admin");
  if (Number(input.revision) !== ctx.settingsRevision)
    throw fail(409, "Refresh practice settings before saving.");
  const s = ctx.settings;
  const mode = input.onboardingMode || s.onboardingMode;
  if (!["new", "transition"].includes(mode))
    throw fail(400, "Choose an onboarding path.");
  if (
    !["self_pay", "insurance", "mixed"].includes(
      input.billingMode || s.billingMode,
    )
  )
    throw fail(400, "Invalid billing mode.");
  const timezone = input.timezone || s.timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw fail(400, "Choose a valid timezone.");
  }
  const services = input.services || s.services || [];
  if (!Array.isArray(services) || services.length > 100)
    throw fail(400, "Invalid service catalog.");
  if (services.some((s) => !THERAPY_SERVICE_CODES.includes(s.code)))
    throw fail(
      400,
      "This launch supports Colorado therapy service codes only: " +
        THERAPY_SERVICE_CODES.join(", "),
    );
  const normalizedServices = services.map((v) => ({
    code: text(v.code, "Service code", 20),
    name: text(v.name, "Service name", 150),
    active: v.active !== false,
    feeCents:
      Number.isSafeInteger(v.feeCents) && v.feeCents >= 0 ? v.feeCents : 0,
  }));
  const next = {
    ...s,
    onboardingMode: mode,
    timezone,
    jurisdiction: "CO",
    billingMode: input.billingMode || s.billingMode,
    practice: input.practice || s.practice,
    legal: input.legal || s.legal,
    checklist: input.checklist || s.checklist,
    locations: Array.isArray(input.locations)
      ? input.locations.map(String).slice(0, 100)
      : s.locations || [],
    services: normalizedServices,
  };
  // Operator-controlled flags cannot be set by a practice admin to bypass agreements or external readiness.
  if (ctx.profile.operator && input.capabilities)
    next.capabilities = Object.fromEntries(
      CAPABILITIES.map((c) => [c, input.capabilities[c] === true]),
    );
  const [result] = await pool.execute(
    "UPDATE auricwell_practices SET settings=?,revision=revision+1 WHERE id=? AND revision=?",
    [
      seal(next, `auricwell:practice:${ctx.practiceId}`),
      ctx.practiceId,
      ctx.settingsRevision,
    ],
  );
  if (!result.affectedRows)
    throw fail(409, "Practice settings changed. Refresh.");
  await audit(ctx, "practice.settings_saved", ctx.practiceId);
  return { settings: next, revision: ctx.settingsRevision + 1 };
}
export async function activatePhi(ctx, input) {
  if (!ctx.profile.operator)
    throw fail(
      403,
      "Only an AuricWell operator can verify infrastructure readiness.",
    );
  requirePermission(ctx, "admin");
  if (input.verified !== true)
    throw fail(400, "Explicit verification is required.");
  const evidence = text(
    input.evidence,
    "Infrastructure/vendor agreement evidence",
    4000,
  );
  return transaction(async (db) => {
    const [[row]] = await db.execute(
      "SELECT settings FROM auricwell_practices WHERE id=? FOR UPDATE",
      [ctx.practiceId],
    );
    const settings = open(row.settings, `auricwell:practice:${ctx.practiceId}`);
    settings.infrastructure = {
      verifiedAt: new Date().toISOString(),
      verifiedBy: ctx.accountId,
      evidence,
    };
    const checks = readiness(settings, await list(ctx, "agreement", {}, db));
    if (!checks.phiReady)
      throw fail(
        409,
        "Complete legal identity and execute the service agreement, order form and BAA first.",
      );
    settings.phiActivatedAt ||= new Date().toISOString();
    await db.execute(
      "UPDATE auricwell_practices SET settings=?,revision=revision+1,status='active' WHERE id=?",
      [seal(settings, `auricwell:practice:${ctx.practiceId}`), ctx.practiceId],
    );
    await audit(
      ctx,
      "practice.phi_activated",
      ctx.practiceId,
      { evidence },
      db,
    );
    return { activated: true };
  });
}
export async function members(ctx) {
  requirePermission(ctx, "admin");
  const [rows] = await pool.execute(
    "SELECT a.id,a.username,a.status,a.profile,a.canonical_user_id,m.permissions,m.patient_ids,m.billing_patient_ids,m.actor_type,m.status membership_status FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id WHERE m.practice_id=?",
    [ctx.practiceId],
  );
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      username: r.username,
      status: r.status,
      ...open(r.profile, `auricwell:account:${r.id}`),
      permissions: json(r.permissions, []),
      patientIds: json(r.patient_ids, []),
      billingPatientIds: json(r.billing_patient_ids, []),
      actorType: r.actor_type,
      membershipStatus: r.membership_status,
      ...(r.canonical_user_id && r.actor_type === "staff"
        ? {
            canonicalUserId: Number(r.canonical_user_id),
            sharedIdentity: await staffIdentity(ctx, r.id, pool),
          }
        : {}),
    })),
  );
}
export async function addMember(ctx, input) {
  requirePermission(ctx, "admin");
  const actorType = input.actorType || "staff";
  if (!["staff", "patient", "guardian"].includes(actorType))
    throw fail(400, "Choose staff, patient or guardian.");
  const permissions =
    actorType === "staff" ? validatePermissions(input.permissions || []) : [];
  if (
    !ctx.profile.operator &&
    permissions.some((p) => p !== "records_manager" && !ctx.permissions.includes(p))
  )
    throw fail(403, "You cannot grant permissions you do not hold.");
  const patientIds = actorType === "staff" ? [] : input.patientIds || [];
  const billingPatientIds =
    actorType === "staff" ? [] : input.billingPatientIds || [];
  if (
    !Array.isArray(patientIds) ||
    !Array.isArray(billingPatientIds) ||
    billingPatientIds.some((id) => !patientIds.includes(id))
  )
    throw fail(
      400,
      "Billing responsibility must refer to authorized patient charts.",
    );
  if (
    actorType !== "staff" &&
    (!ctx.settings.phiActivatedAt ||
      (!patientIds.length && input.intakeOnly !== true))
  )
    throw fail(
      409,
      "Enable patient data and select a chart or explicitly choose intake-only access.",
    );
  if (actorType !== "staff") {
    requireCapability(ctx, "portal");
    if (input.intakeOnly === true) {
      requireCapability(ctx, "intake");
      if (patientIds.length || billingPatientIds.length)
        throw fail(
          400,
          "Intake-only accounts cannot include chart or billing access.",
        );
    }
  }
  for (const id of patientIds) await get(ctx, "patient", id);
  return transaction(async (db) => {
    const account = await createAccount(
      { username: input.username, name: input.name, email: input.email },
      db,
    );
    await db.execute(
      "INSERT INTO auricwell_memberships (practice_id,account_id,permissions,patient_ids,billing_patient_ids,actor_type) VALUES (?,?,?,?,?,?)",
      [
        ctx.practiceId,
        account.id,
        JSON.stringify(permissions),
        JSON.stringify(patientIds),
        JSON.stringify(billingPatientIds),
        actorType,
      ],
    );
    if (actorType === "staff") {
      if (input.identityMode === "review_existing") {
        if (!ctx.profile.operator)
          throw fail(
            403,
            "An operator must review an existing shared identity.",
          );
      } else
        account.canonicalUserId = await provisionStaffIdentity(
          ctx,
          account.id,
          db,
        );
    }
    await audit(
      ctx,
      "membership.created",
      account.id,
      { actorType, permissions },
      db,
    );
    return account;
  });
}
export async function updateMember(ctx, id, input) {
  requirePermission(ctx, "admin");
  const current = (await members(ctx)).find((m) => m.id === id);
  if (!current) throw fail(404, "Practice member unavailable.");
  if (current.operator && !ctx.profile.operator)
    throw fail(403, "Only an operator can change operator access.");
  const permissions =
    current.actorType === "staff"
      ? validatePermissions(input.permissions || [])
      : [];
  if (
    !ctx.profile.operator &&
    permissions.some((p) => p !== "records_manager" && !ctx.permissions.includes(p))
  )
    throw fail(403, "You cannot grant permissions you do not hold.");
  if (!["active", "inactive", "pending"].includes(input.status))
    throw fail(400, "Choose a membership status.");
  if (
    id === ctx.accountId &&
    (!permissions.includes("admin") || input.status !== "active")
  )
    throw fail(
      409,
      "Another administrator must review removal of your administrative access.",
    );
  const patientIds =
      current.actorType === "staff" ? [] : input.patientIds || [],
    billingPatientIds =
      current.actorType === "staff" ? [] : input.billingPatientIds || [];
  if (
    !Array.isArray(patientIds) ||
    !Array.isArray(billingPatientIds) ||
    billingPatientIds.some((p) => !patientIds.includes(p))
  )
    throw fail(400, "Review chart access and financial responsibility.");
  for (const patientId of patientIds) await get(ctx, "patient", patientId);
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    await db.execute(
      "UPDATE auricwell_memberships SET permissions=?,patient_ids=?,billing_patient_ids=?,status=? WHERE practice_id=? AND account_id=?",
      [
        JSON.stringify(permissions),
        JSON.stringify(patientIds),
        JSON.stringify(billingPatientIds),
        input.status,
        ctx.practiceId,
        id,
      ],
    );
    await audit(
      ctx,
      "membership.access_changed",
      id,
      { permissions, patientIds, billingPatientIds, status: input.status },
      db,
    );
    return { saved: true };
  });
}
export async function saveStaffIdentity(ctx, id, input) {
  requirePermission(ctx, "admin");
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const identity = await staffIdentity(ctx, id, db, { lock: true });
    if (!identity?.fingerprint)
      throw fail(409, "Connect this staff identity before editing details.");
    const saved = await updatePracticeStaffIdentity(
      await owningAgency(ctx, db),
      identity.userId,
      input,
      db,
    );
    // Keep the account display name current without changing login credentials,
    // MFA, email destinations, permissions or any signed document snapshot.
    const [[account]] = await db.execute(
      "SELECT profile FROM auricwell_accounts WHERE id=? FOR UPDATE",
      [id],
    );
    const profile = open(account.profile, `auricwell:account:${id}`);
    await db.execute("UPDATE auricwell_accounts SET profile=? WHERE id=?", [
      seal({ ...profile, name: saved.name }, `auricwell:account:${id}`),
      id,
    ]);
    await audit(
      ctx,
      "staff.shared_details_updated",
      id,
      {
        canonicalUserId: identity.userId,
        credentialMappingRequiresReview:
          saved.credential !== identity.credential,
      },
      db,
    );
    return saved;
  });
}
