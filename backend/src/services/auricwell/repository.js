import crypto from "node:crypto";
import pool from "../../config/database.js";
import {
  encryptFamilyBilling as seal,
  decryptFamilyBilling as open,
} from "../familyBillingEncryption.service.js";
import { fail } from "./policy.js";
import {
  hydratePatient,
  hydratePatients,
  createSharedPatient,
  updateSharedPatient,
} from "./sharedPatients.js";
import { hydrateProviders, providerMetadata } from "./sharedProviders.js";
import {
  hydrateAppointments,
  createSharedAppointment,
  updateSharedAppointment,
} from "./sharedAppointments.js";

export { pool, seal, open };
export async function transaction(work) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await work(db);
    await db.commit();
    return result;
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    db.release();
  }
}
const context = (practice, kind, id) => `auricwell:${practice}:${kind}:${id}`;
export function decode(row) {
  return (
    row && {
      id: row.id,
      kind: row.kind,
      patientId: row.patient_id,
      ...(row.canonical_appointment_id
        ? { canonicalAppointmentId: Number(row.canonical_appointment_id) }
        : {}),
      ...(row.canonical_client_id
        ? { canonicalClientId: Number(row.canonical_client_id) }
        : {}),
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      data: open(row.payload, context(row.practice_id, row.kind, row.id)),
    }
  );
}
export async function audit(ctx, action, recordId, details = {}, db = pool) {
  await db.execute(
    "INSERT INTO auricwell_audit (practice_id,actor_id,action,record_id,details) VALUES (?,?,?,?,?)",
    [
      ctx.practiceId,
      ctx.accountId,
      action,
      recordId || null,
      seal(details, `auricwell:audit:${ctx.practiceId}`),
    ],
  );
}
export async function list(
  ctx,
  kind,
  { patientId, limit = 500 } = {},
  db = pool,
) {
  const args = [ctx.practiceId, kind];
  if (patientId) args.push(patientId);
  const [rows] = await db.execute(
    `SELECT * FROM auricwell_records WHERE practice_id=? AND kind=? ${patientId ? "AND patient_id=?" : ""} ORDER BY created_at DESC LIMIT ${Math.min(Math.max(Number(limit) || 500, 1), 10000)}`,
    args,
  );
  const records = rows.map(decode).filter((r) => !r.data.rolledBackAt);
  if (kind === "appointment") return hydrateAppointments(ctx, records, db);
  if (kind === "provider") return hydrateProviders(ctx, records, db);
  return kind === "patient" ? hydratePatients(ctx, records, db) : records;
}
export async function get(ctx, kind, id, db = pool, lock = false) {
  const [rows] = await db.execute(
    `SELECT * FROM auricwell_records WHERE practice_id=? AND kind=? AND id=?${lock ? " FOR UPDATE" : ""}`,
    [ctx.practiceId, kind, id],
  );
  if (!rows[0]) throw fail(404, "Record not found in this practice.");
  const record = decode(rows[0]);
  if (record.data.rolledBackAt)
    throw fail(404, "Record was withdrawn during import review.");
  if (kind === "appointment")
    return (await hydrateAppointments(ctx, [record], db))[0];
  if (kind === "provider")
    return (await hydrateProviders(ctx, [record], db))[0];
  return kind === "patient" ? hydratePatient(ctx, record, db) : record;
}
export async function sourceRecords(ctx, kind, prefix, db = pool) {
  const [rows] = await db.execute(
    "SELECT * FROM auricwell_records WHERE practice_id=? AND kind=? AND source_key LIKE ? ORDER BY source_key",
    [ctx.practiceId, kind, `${prefix}:%`],
  );
  if (kind === "provider") return hydrateProviders(ctx, rows.map(decode), db);
  if (kind === "appointment")
    return hydrateAppointments(ctx, rows.map(decode), db);
  return kind === "patient"
    ? hydratePatients(ctx, rows.map(decode), db)
    : rows.map(decode);
}
export async function findSource(ctx, kind, key, db = pool) {
  const [rows] = await db.execute(
    "SELECT * FROM auricwell_records WHERE practice_id=? AND kind=? AND source_key=?",
    [ctx.practiceId, kind, key],
  );
  const record = rows[0] ? decode(rows[0]) : null;
  if (kind === "appointment" && record)
    return (await hydrateAppointments(ctx, [record], db))[0];
  if (kind === "provider" && record)
    return (await hydrateProviders(ctx, [record], db))[0];
  return kind === "patient" ? hydratePatient(ctx, record, db) : record;
}
export async function create(
  ctx,
  kind,
  data,
  { patientId = null, sourceKey = null, id = crypto.randomUUID() } = {},
  db = pool,
) {
  if (["patient", "appointment"].includes(kind) && db === pool)
    return transaction(async (conn) => {
      await lockPractice(ctx, conn);
      return create(ctx, kind, data, { patientId, sourceKey, id }, conn);
    });
  let canonicalClientId = null;
  let canonicalAppointmentId = null;
  if (kind === "appointment") {
    const shared = await createSharedAppointment(ctx, data, patientId, db);
    canonicalAppointmentId = shared.canonicalAppointmentId;
    data = shared.data;
  }
  if (kind === "provider") data = await providerMetadata(ctx, data, db);
  if (kind === "patient") {
    const shared = await createSharedPatient(ctx, data, db);
    canonicalClientId = shared.canonicalClientId;
    data = shared.data;
  }
  await db.execute(
    "INSERT INTO auricwell_records (id,practice_id,kind,patient_id,source_key,payload,canonical_client_id,canonical_appointment_id) VALUES (?,?,?,?,?,?,?,?)",
    [
      id,
      ctx.practiceId,
      kind,
      patientId,
      sourceKey,
      seal(data, context(ctx.practiceId, kind, id)),
      canonicalClientId,
      canonicalAppointmentId,
    ],
  );
  await audit(ctx, `${kind}.created`, id, {}, db);
  return get(ctx, kind, id, db);
}
export async function update(ctx, record, data, db = pool) {
  if (record.kind === "appointment") {
    if (db === pool)
      return transaction(async (conn) => {
        await lockPractice(ctx, conn);
        return update(ctx, record, data, conn);
      });
    const current = await get(ctx, "appointment", record.id, db, true);
    if (
      current.revision !== record.revision ||
      current.canonicalAppointmentId !== record.canonicalAppointmentId
    )
      throw fail(409, "This appointment changed. Refresh before saving.");
    data = await updateSharedAppointment(ctx, record, data, db);
  }
  if (record.kind === "provider") data = await providerMetadata(ctx, data, db);
  if (record.kind === "patient") {
    if (db === pool)
      return transaction(async (conn) => {
        await lockPractice(ctx, conn);
        return update(ctx, record, data, conn);
      });
    const current = await get(ctx, "patient", record.id, db, true);
    if (
      current.revision !== record.revision ||
      current.canonicalClientId !== record.canonicalClientId
    )
      throw fail(409, "This record changed. Refresh before saving.");
    data = await updateSharedPatient(ctx, record, data, db);
  }
  const [result] = await db.execute(
    "UPDATE auricwell_records SET payload=?,revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE practice_id=? AND kind=? AND id=? AND revision=?",
    [
      seal(data, context(ctx.practiceId, record.kind, record.id)),
      ctx.practiceId,
      record.kind,
      record.id,
      record.revision,
    ],
  );
  if (!result.affectedRows)
    throw fail(409, "This record changed. Refresh before saving.");
  await audit(
    ctx,
    `${record.kind}.updated`,
    record.id,
    { previousRevision: record.revision },
    db,
  );
  if (data.rolledBackAt)
    return { ...record, data, revision: record.revision + 1 };
  return get(ctx, record.kind, record.id, db);
}
export async function lockPractice(ctx, db) {
  await db.execute("SELECT id FROM auricwell_practices WHERE id=? FOR UPDATE", [
    ctx.practiceId,
  ]);
}
