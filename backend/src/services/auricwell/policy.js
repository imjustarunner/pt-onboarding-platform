import crypto from "node:crypto";

export const THERAPY_SERVICE_CODES = [
  "90791",
  "90832",
  "90834",
  "90837",
  "90839",
  "90840",
  "90846",
  "90847",
  "90853",
];
export const THERAPY_CREDENTIALS = [
  "LPC",
  "LPCC",
  "LMFT",
  "MFTC",
  "LCSW",
  "LSW",
  "PSYCHOLOGIST",
  "PSYCHOLOGY CANDIDATE",
  "TRAINEE",
];
export const PRODUCT = "auricwell_ehr";
export const PERMISSIONS = [
  "records_manager",
  "announcements",
  "admin",
  "clinical",
  "schedule",
  "billing",
  "supervise",
  "agreements",
  "migration",
];
export const CAPABILITIES = [
  "clients",
  "schedule",
  "documentation",
  "billing",
  "messages",
  "portal",
  "video",
  "imports",
  "intake",
  "ai",
];
export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
export const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(Buffer.isBuffer(value) ? value : String(value))
    .digest("hex");
export const json = (value, fallback = {}) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : (value ?? fallback);
  } catch {
    return fallback;
  }
};
export const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
export function text(value, label, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function has(ctx, permission) {
  return ctx.actorType === "staff" && ctx.permissions.includes(permission);
}
export function requirePermission(ctx, permission) {
  if (!has(ctx, permission))
    throw fail(403, `Practice ${permission} permission is required.`);
}
export function requireCapability(ctx, capability) {
  if (ctx.settings.capabilities?.[capability] !== true)
    throw fail(403, `${capability} is not enabled for this practice.`);
}
export function canReadPatient(ctx, patient) {
  if (ctx.actorType !== "staff") return ctx.patientIds.includes(patient.id);
  if (has(ctx, "admin") || has(ctx, "schedule") || has(ctx, "billing") || has(ctx, "records_manager"))
    return true;
  return (patient.data.careTeam || []).includes(ctx.accountId);
}
export function canReadClinical(ctx, patient) {
  return (
    ctx.actorType === "staff" &&
    (has(ctx, "clinical") || has(ctx, "supervise")) &&
    ((patient.data.careTeam || []).includes(ctx.accountId) ||
      has(ctx, "supervise"))
  );
}
export function requirePhi(ctx) {
  if (!ctx.settings.phiActivatedAt)
    throw fail(
      409,
      "Complete practice agreements and verify infrastructure before using patient data.",
    );
}
export function requirePatientBilling(ctx, patientId) {
  if (ctx.actorType === "staff") return requirePermission(ctx, "billing");
  if (!(ctx.billingPatientIds || []).includes(patientId))
    throw fail(
      403,
      "Financial responsibility access is required for this patient.",
    );
}
export function initialSettings(mode = "new") {
  if (!["new", "transition"].includes(mode))
    throw fail(400, "Choose new or transition onboarding.");
  return {
    onboardingMode: mode,
    jurisdiction: "CO",
    timezone: "America/Denver",
    billingMode: "self_pay",
    capabilities: Object.fromEntries(
      CAPABILITIES.map((key) => [key, !["ai", "video"].includes(key)]),
    ),
    practice: {},
    legal: {},
    infrastructure: {},
    integrations: {},
    checklist: {},
    cutover: {},
    phiActivatedAt: null,
  };
}
export function readiness(settings, agreements = []) {
  const completed = new Set(
    agreements
      .filter((a) => a.data.status === "completed" && !a.data.patientId)
      .map((a) => a.data.type),
  );
  const checks = [
    {
      id: "identity",
      label: "Practice legal identity",
      ready: !!(settings.practice?.legalName && settings.practice?.address),
    },
    ...["service_agreement", "order_form", "baa"].map((type) => ({
      id: type,
      label: type.replaceAll("_", " "),
      ready: completed.has(type),
    })),
    {
      id: "infrastructure",
      label: "Infrastructure and vendor agreements verified by operator",
      ready: !!settings.infrastructure?.verifiedAt,
    },
  ];
  return {
    checks,
    phiReady: checks.every((c) => c.ready),
    migrationRequired: settings.onboardingMode === "transition",
    liveClaimsReady: !!settings.integrations?.claims?.verifiedAt,
    cardPaymentsReady: !!settings.integrations?.payments?.verifiedAt,
  };
}
export function providerEligible(
  provider,
  { service, location, date, jurisdiction = "CO" } = {},
) {
  const p = provider.data || provider;
  if (
    p.status !== "active" ||
    p.sharedIdentityActive === false ||
    p.credentialMappingCurrent === false ||
    !p.credentialsReviewed ||
    p.jurisdiction !== jurisdiction
  )
    return false;
  if (p.licenseExpires && date && p.licenseExpires < date.slice(0, 10))
    return false;
  if (service && !(p.services || []).includes(service)) return false;
  if (location && !(p.locations || []).includes(location)) return false;
  if (p.supervisionRequired && !p.supervisorAccountId) return false;
  return true;
}
export function providerAvailable(provider, start, end, timezone) {
  const windows = (provider.data || provider).availability || [];
  if (!windows.length) return true; // Unconfigured availability is managed by the authorized scheduler.
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (value) =>
    Object.fromEntries(
      format.formatToParts(value).map((p) => [p.type, p.value]),
    );
  const a = parts(start),
    b = parts(end),
    day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(a.weekday);
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    windows.some(
      (w) =>
        w.day === day &&
        w.start <= `${a.hour}:${a.minute}` &&
        w.end >= `${b.hour}:${b.minute}`,
    )
  );
}
export function money(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw fail(400, "Amount must be a nonnegative integer in cents.");
  return value;
}
export function ledgerBalance(entries) {
  return entries.reduce((total, { data: e }) => {
    const amount = money(e.amountCents);
    if (
      ![
        "charge",
        "opening_balance",
        "payment",
        "adjustment",
        "refund",
      ].includes(e.type)
    )
      throw fail(400, "Unknown ledger entry type.");
    return (
      total + (["payment", "adjustment"].includes(e.type) ? -amount : amount)
    );
  }, 0);
}
export const ACCOUNT_EMAIL_TYPES = new Set([
  "invitation",
  "recovery",
  "verification",
]);
export function assertEmailType(type) {
  if (!ACCOUNT_EMAIL_TYPES.has(type))
    throw fail(
      403,
      "AuricWell communication is in-app; only account email is permitted.",
    );
}

export function practiceDate(value, timezone = "America/Denver") {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
