import {
  readClientInsuranceSnapshot,
  writeClientInsurance,
} from "../clientInsurance.service.js";
import { owningAgency } from "./sharedPatients.js";
import { staffIdentity } from "./sharedProviders.js";
import { get, list, create, update, audit } from "./repository.js";
import { fail, hash } from "./policy.js";

// The product record holds review/provenance only. Coverage belongs to the
// existing encrypted client-insurance record, consumed by both frontends.
export async function insuranceSnapshot(
  ctx,
  patientId,
  db,
  { lock = false } = {},
) {
  const chart = await get(ctx, "patient", patientId, db);
  if (!chart.canonicalClientId)
    throw fail(
      409,
      "Connect this chart to the shared backend before reviewing insurance.",
    );
  const agencyId = await owningAgency(ctx, db);
  const shared = await readClientInsuranceSnapshot(
    chart.canonicalClientId,
    agencyId,
    db,
    { lock },
  );
  const records = await list(ctx, "insurance", { patientId }, db);
  if (records.length > 1)
    throw fail(
      409,
      "Multiple insurance review records require reconciliation.",
    );
  const record = records[0] || null;
  const prototype =
    record && record.data.storage !== "shared_client_insurance"
      ? record.data
      : null;
  return {
    id: record?.id || null,
    revision: record?.revision || 0,
    sharedFingerprint: hash(
      JSON.stringify({
        shared: shared.fingerprint,
        recordId: record?.id,
        revision: record?.revision,
      }),
    ),
    data: shared.data || prototype,
    source: shared.data ? "shared" : prototype ? "prototype" : "empty",
    prototypeReview: prototype,
    requiresConsolidation: !!prototype,
    agencyId,
    clientId: chart.canonicalClientId,
    record,
  };
}
export async function saveSharedInsurance(ctx, patientId, input, db) {
  const snapshot = await insuranceSnapshot(ctx, patientId, db, { lock: true });
  if (input.sharedFingerprint !== snapshot.sharedFingerprint)
    throw fail(
      409,
      "Insurance changed in the shared backend. Reload and review the current coverage before saving.",
    );
  if (snapshot.requiresConsolidation && input.consolidationReviewed !== true)
    throw fail(
      409,
      "Review the earlier AuricWell coverage before connecting the shared insurance record.",
    );
  if (input.reviewed !== true)
    throw fail(
      400,
      "Review patient and subscriber identity before saving insurance.",
    );
  const identity = await staffIdentity(ctx, ctx.accountId, db);
  const previous = snapshot.data || {};
  await writeClientInsurance(
    {
      clientId: snapshot.clientId,
      agencyId: snapshot.agencyId,
      primary: { ...previous.primary, ...input.primary },
      secondary:
        input.secondary === undefined ? previous.secondary : input.secondary,
      patient: { ...previous.patient, ...input.patient },
      profileId: previous.profileId || null,
      confirmedBy: identity?.userId || null,
      verifiedForClaims: true,
      acceptAssignment: input.acceptAssignment === true,
    },
    db,
  );
  let archiveId = null;
  if (snapshot.prototypeReview) {
    const archive = await create(
      ctx,
      "consolidation_archive",
      {
        kind: "insurance",
        recordId: snapshot.record.id,
        originalRevision: snapshot.record.revision,
        original: snapshot.prototypeReview,
        canonicalClientId: snapshot.clientId,
      },
      { patientId, sourceKey: `insurance:${snapshot.record.id}` },
      db,
    );
    archiveId = archive.id;
  }
  const metadata = {
    storage: "shared_client_insurance",
    reviewedBy: ctx.accountId,
    reviewedAt: new Date().toISOString(),
    authorization:
      input.authorization === undefined
        ? snapshot.record?.data.authorization || null
        : input.authorization,
    archiveId: archiveId || snapshot.record?.data.archiveId || null,
  };
  if (snapshot.record) await update(ctx, snapshot.record, metadata, db);
  else
    await create(
      ctx,
      "insurance",
      metadata,
      { patientId, sourceKey: patientId },
      db,
    );
  await audit(
    ctx,
    "insurance.shared_reviewed",
    patientId,
    { canonicalClientId: snapshot.clientId, archiveId },
    db,
  );
  return insuranceSnapshot(ctx, patientId, db);
}
export function presentInsurance(snapshot) {
  const { agencyId, clientId, record, ...value } = snapshot;
  return value;
}
