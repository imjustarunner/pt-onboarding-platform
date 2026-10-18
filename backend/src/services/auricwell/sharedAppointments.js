import {
  readAppointmentRecord,
  createAppointmentRecord,
  updateAppointmentRecord,
  assertSharedAppointmentAvailable,
} from "../appointmentRecord.service.js";
import { owningAgency } from "./sharedPatients.js";
import { staffIdentity } from "./sharedProviders.js";
import { fail } from "./policy.js";

const fields = new Set([
  "start",
  "end",
  "status",
  "location",
  "modality",
  "serviceCode",
]);
const metadata = (data) =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !fields.has(key)));
const iso = (v) =>
  v instanceof Date
    ? v.toISOString()
    : new Date(
        `${String(v).replace(" ", "T").replace(/Z$/, "")}Z`,
      ).toISOString();
const sqlTime = (v) => new Date(v).toISOString().slice(0, 19).replace("T", " ");
function displayStatus(status) {
  if (["scheduled", "confirmed"].includes(status)) return status;
  if (status === "client_confirmed") return "confirmed";
  if (["completed", "no_show"].includes(status)) return status;
  if (
    status.startsWith("canceled") ||
    ["late_canceled", "voided", "rescheduled"].includes(status)
  )
    return "cancelled";
  throw fail(
    409,
    "Review this appointment's shared status before using it in AuricWell.",
  );
}
async function chartId(ctx, patientId, agencyId, db) {
  const [[chart]] = await db.execute(
    `SELECT c.id FROM auricwell_records r JOIN clients c ON c.id=r.canonical_client_id
     WHERE r.practice_id=? AND r.kind='patient' AND r.id=? AND c.agency_id=?`,
    [ctx.practiceId, patientId, agencyId],
  );
  if (!chart)
    throw fail(
      409,
      "Connect this patient chart to the shared backend before scheduling.",
    );
  return Number(chart.id);
}
async function sharedData(ctx, data, db, previous = null) {
  const identity = await staffIdentity(ctx, data.providerAccountId, db, {
    lock: true,
  });
  if (!identity?.fingerprint)
    throw fail(
      409,
      "Connect the provider's shared staff identity before scheduling.",
    );
  return {
    providerUserId: identity.userId,
    startAt: sqlTime(data.start),
    endAt: sqlTime(data.end),
    status:
      previous && displayStatus(previous.data.status) === data.status
        ? previous.data.status
        : {
            scheduled: "scheduled",
            confirmed: "confirmed",
            completed: "completed",
            no_show: "no_show",
            cancelled: "canceled_by_organization",
          }[data.status],
    modality: data.modality === "video" ? "TELEHEALTH" : "IN_PERSON",
    locationLabel: data.location,
    serviceCode: data.serviceCode,
    sourceTimezone: ctx.settings.timezone,
    businessType: "mental_health",
  };
}
export async function hydrateAppointments(ctx, records, db) {
  if (!records.some((r) => r.canonicalAppointmentId)) return records;
  const agencyId = await owningAgency(ctx, db);
  const result = [];
  for (const record of records) {
    if (!record.canonicalAppointmentId) {
      result.push(record);
      continue;
    }
    const shared = await readAppointmentRecord(
      agencyId,
      record.canonicalAppointmentId,
      db,
    );
    const clientId = await chartId(ctx, record.patientId, agencyId, db);
    const clients = shared.participants.filter((p) => p.client_id);
    if (clients.length !== 1 || Number(clients[0].client_id) !== clientId)
      throw fail(
        409,
        "This visit's shared patient assignment changed. Review its chart connection.",
      );
    const [[identity]] = await db.execute(
      "SELECT canonical_user_id FROM auricwell_accounts WHERE id=?",
      [record.data.providerAccountId],
    );
    if (
      !identity ||
      Number(identity.canonical_user_id) !== shared.data.providerUserId
    )
      throw fail(
        409,
        "This visit's shared provider assignment changed. Review its staff connection.",
      );
    result.push({
      ...record,
      sharedFingerprint: shared.fingerprint,
      data: {
        ...record.data,
        start: iso(shared.data.startAt),
        end: iso(shared.data.endAt),
        status: displayStatus(shared.data.status),
        location: shared.data.locationLabel || "",
        modality: shared.data.modality === "TELEHEALTH" ? "video" : "office",
        serviceCode: shared.data.serviceCode,
      },
    });
  }
  return result;
}
export async function createSharedAppointment(ctx, data, patientId, db) {
  const agencyId = await owningAgency(ctx, db);
  const clientId = await chartId(ctx, patientId, agencyId, db);
  const actor = await staffIdentity(ctx, ctx.accountId, db);
  const shared = await createAppointmentRecord(
    agencyId,
    await sharedData(ctx, data, db),
    clientId,
    actor?.userId || null,
    db,
  );
  return { canonicalAppointmentId: shared.row.id, data: metadata(data) };
}
export async function updateSharedAppointment(ctx, record, data, db) {
  if (!record.canonicalAppointmentId)
    throw fail(
      409,
      "Review this prototype appointment's shared connection before editing.",
    );
  const agencyId = await owningAgency(ctx, db);
  const current = await readAppointmentRecord(
    agencyId,
    record.canonicalAppointmentId,
    db,
    { lock: true },
  );
  const clientId = await chartId(ctx, record.patientId, agencyId, db);
  const actor = await staffIdentity(ctx, ctx.accountId, db);
  await updateAppointmentRecord(
    agencyId,
    record.canonicalAppointmentId,
    await sharedData(ctx, data, db, current),
    clientId,
    actor?.userId || null,
    record.sharedFingerprint,
    db,
    { batchIds: ctx.sharedAppointmentBatchIds || [] },
  );
  return metadata(data);
}
export async function checkSharedAppointmentAvailability(
  ctx,
  data,
  excluded,
  db,
) {
  if (["cancelled", "no_show"].includes(data.status)) return;
  const agencyId = await owningAgency(ctx, db);
  await assertSharedAppointmentAvailable(
    agencyId,
    await sharedData(ctx, data, db),
    await chartId(ctx, data.patientId, agencyId, db),
    excluded,
    db,
  );
}
