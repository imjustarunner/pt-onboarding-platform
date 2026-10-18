import {
  createClientChart,
  readClientChart,
  updateClientChart,
  readClientCharts,
} from "../clientChart.service.js";
import { fail } from "./policy.js";

const demographicFields = new Set([
  "name",
  "dob",
  "phone",
  "email",
  "address",
  "status",
]);
export const patientMetadata = (data) =>
  Object.fromEntries(
    Object.entries(data).filter(([key]) => !demographicFields.has(key)),
  );
export async function owningAgency(ctx, db) {
  const [[practice]] = await db.execute(
    "SELECT agency_id FROM auricwell_practices WHERE id=?",
    [ctx.practiceId],
  );
  if (!practice?.agency_id)
    throw fail(
      409,
      "Review shared-backend consolidation for this practice before changing charts.",
    );
  return Number(practice.agency_id);
}
export async function hydratePatient(ctx, record, db) {
  if (!record || !record.canonicalClientId) return record; // Retained prototype chart, read-only until reviewed consolidation.
  const agencyId = await owningAgency(ctx, db);
  const chart = await readClientChart(agencyId, record.canonicalClientId, db);
  return {
    ...record,
    sharedFingerprint: chart.fingerprint,
    data: { ...record.data, ...chart.data },
  };
}
export async function createSharedPatient(ctx, data, db) {
  const chart = await createClientChart(await owningAgency(ctx, db), data, db);
  return { canonicalClientId: chart.row.id, data: patientMetadata(data) };
}
export async function hydratePatients(ctx, records, db) {
  const ids = [
    ...new Set(
      records
        .filter((r) => r.canonicalClientId)
        .map((r) => r.canonicalClientId),
    ),
  ];
  if (!ids.length) return records;
  const agencyId = await owningAgency(ctx, db),
    charts = new Map();
  for (let i = 0; i < ids.length; i += 500)
    for (const chart of await readClientCharts(
      agencyId,
      ids.slice(i, i + 500),
      db,
    ))
      charts.set(Number(chart.row.id), chart);
  return records.map((record) => {
    if (!record.canonicalClientId) return record;
    const chart = charts.get(record.canonicalClientId);
    if (!chart) throw fail(404, "Client not found in this practice.");
    return {
      ...record,
      sharedFingerprint: chart.fingerprint,
      data: { ...record.data, ...chart.data },
    };
  });
}
export async function updateSharedPatient(ctx, record, data, db) {
  if (!record.canonicalClientId)
    throw fail(
      409,
      "Review shared-backend consolidation for this chart before editing it.",
    );
  if (data.rolledBackAt)
    throw fail(
      409,
      "Shared client charts must be preserved during import rollback.",
    );
  await updateClientChart(
    await owningAgency(ctx, db),
    record.canonicalClientId,
    data,
    record.sharedFingerprint,
    db,
  );
  return patientMetadata(data);
}
