import { requireClientSessionBooking } from './clientSessionBookingRollout.service.js';
import crypto from "node:crypto";
import Appointment from "../models/Appointment.model.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
const fingerprint = (row, participants) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify({ row, participants }))
    .digest("hex");
const terminal = [
  "canceled_by_provider",
  "canceled_by_client",
  "canceled_by_guardian",
  "canceled_by_organization",
  "late_canceled",
  "no_show",
  "rescheduled",
  "voided",
];
export async function readAppointmentRecord(
  agencyId,
  id,
  db,
  { lock = false } = {},
) {
  const [[row]] = await db.execute(
    `SELECT * FROM appointments WHERE agency_id=? AND id=?${lock ? " FOR UPDATE" : ""}`,
    [agencyId, id],
  );
  if (!row) throw fail(404, "Appointment not found in this practice.");
  const [participants] = await db.execute(
    `SELECT * FROM appointment_participants WHERE appointment_id=? ORDER BY id${lock ? " FOR SHARE" : ""}`,
    [id],
  );
  return {
    row,
    participants,
    data: Appointment.mapRow(row),
    fingerprint: fingerprint(row, participants),
  };
}
export async function assertSharedAppointmentAvailable(
  agencyId,
  data,
  clientId,
  excludeId,
  db,
) {
  // Serializes canonical writes made by this service within one practice.
  await db.execute("SELECT id FROM agencies WHERE id=? FOR UPDATE", [agencyId]);
  if (terminal.includes(data.status)) return;
  const excluded = [
    ...new Set(
      (Array.isArray(excludeId) ? excludeId : [excludeId])
        .filter(Boolean)
        .map(Number),
    ),
  ];
  if (!excluded.length) excluded.push(0);
  const [[conflict]] = await db.execute(
    `SELECT a.id FROM appointments a WHERE a.agency_id=? AND a.id NOT IN (${excluded.map(() => "?").join(",")}) AND a.start_at<? AND a.end_at>?
     AND a.status NOT IN (${terminal.map(() => "?").join(",")})
     AND (a.provider_user_id=? OR EXISTS (SELECT 1 FROM appointment_participants p WHERE p.appointment_id=a.id AND p.client_id=?)) LIMIT 1 FOR UPDATE`,
    [
      agencyId,
      ...excluded,
      data.endAt,
      data.startAt,
      ...terminal,
      data.providerUserId,
      clientId,
    ],
  );
  if (conflict)
    throw fail(
      409,
      "The patient or provider already has an appointment in the shared schedule at this time.",
    );
}
export async function createAppointmentRecord(
  agencyId,
  data,
  clientId,
  actorUserId,
  db,
) {
  await requireClientSessionBooking(agencyId, data.providerUserId, db);
  await assertSharedAppointmentAvailable(agencyId, data, clientId, null, db);
  const appointment = await Appointment.create(
    {
      ...data,
      agencyId,
      source: "auricwell_ehr",
      participantMode: "individual",
      notificationMode: "in_app",
      createdByUserId: actorUserId,
    },
    { executor: db },
  );
  await Appointment.setServiceCodes(
    appointment.id,
    { serviceCode: data.serviceCode },
    { executor: db },
  );
  await db.execute(
    "UPDATE appointments SET product_origin='auricwell_ehr',location_label=?,source_timezone=? WHERE agency_id=? AND id=?",
    [data.locationLabel, data.sourceTimezone, agencyId, appointment.id],
  );
  await Appointment.replaceParticipants(
    appointment.id,
    [{ clientId, role: "client", receivesReminders: false }],
    { executor: db, resolveHolds: false },
  );
  return readAppointmentRecord(agencyId, appointment.id, db);
}
export async function updateAppointmentRecord(
  agencyId,
  id,
  data,
  clientId,
  actorUserId,
  expectedFingerprint,
  db,
  { batchIds = [] } = {},
) {
  const current = await readAppointmentRecord(agencyId, id, db, { lock: true });
  if (current.fingerprint !== expectedFingerprint)
    throw fail(
      409,
      "This appointment changed in the shared backend. Refresh before saving.",
    );
  if (Number(data.providerUserId) !== Number(current.data.providerUserId)) {
    await requireClientSessionBooking(agencyId, data.providerUserId, db);
  }
  // Preserve canonical care/calendar/package links until their shared workflow
  // orchestration is connected. Do not silently bypass their own invariants.
  if (
    current.data.clinicalSessionId ||
    current.data.officeEventId ||
    current.data.providerScheduleEventId ||
    current.data.packageEntitlementId
  )
    throw fail(
      409,
      "This visit has additional shared clinical or calendar links. Review it through its existing workflow.",
    );
  await assertSharedAppointmentAvailable(
    agencyId,
    data,
    clientId,
    [id, ...batchIds],
    db,
  );
  await Appointment.update(
    id,
    { ...data, updatedByUserId: actorUserId },
    { executor: db, agencyId },
  );
  await Appointment.setServiceCodes(
    id,
    {
      serviceCode: data.serviceCode,
      addonServiceCodes: current.data.addonServiceCodes,
    },
    { executor: db },
  );
  await db.execute(
    "UPDATE appointments SET location_label=?,source_timezone=? WHERE agency_id=? AND id=?",
    [data.locationLabel, data.sourceTimezone, agencyId, id],
  );
  return readAppointmentRecord(agencyId, id, db);
}
