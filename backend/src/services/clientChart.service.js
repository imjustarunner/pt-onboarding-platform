import crypto from "node:crypto";
import Client from "../models/Client.model.js";

// A shared domain service. Product authorization belongs to its caller; every
// persistence operation also carries the canonical owning agency explicitly.
const failure = (status, message) =>
  Object.assign(new Error(message), { status });
const date = (value) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value || "").slice(0, 10);
export const clientFingerprint = (row) =>
  crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
export function chartDemographics(row) {
  return {
    name: row.full_name || row.initials,
    dob: date(row.date_of_birth),
    phone: row.contact_phone || "",
    email: row.email || "",
    address: [
      row.address_street,
      row.address_apt,
      row.address_city,
      row.address_state,
      row.address_zip,
    ]
      .filter(Boolean)
      .join("\n"),
    status:
      row.status === "ACTIVE"
        ? "active"
        : ["ARCHIVED", "DECLINED"].includes(row.status)
          ? "discharged"
          : "waitlist",
  };
}
export async function readClientCharts(agencyId, ids, db) {
  return (await Client.findManyForAgency(ids, agencyId, { executor: db })).map(
    (row) => ({
      row,
      data: chartDemographics(row),
      fingerprint: clientFingerprint(row),
    }),
  );
}
function fields(input, previous = null) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 200)
    throw failure(400, "Review the patient name.");
  const previousView = previous ? chartDemographics(previous) : {};
  const result = {
    full_name: name,
    initials: name
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 10),
    date_of_birth: input.dob || null,
    contact_phone: input.phone || null,
    email: input.email || null,
  };
  if (previous?.full_name === name) delete result.initials;
  if (input.address !== previousView.address) {
    if (String(input.address || "").length > 255)
      throw failure(
        400,
        "Review the address: the shared street-address field allows 255 characters.",
      );
    Object.assign(result, {
      address_street: input.address || null,
      address_apt: null,
      address_city: null,
      address_state: null,
      address_zip: null,
    });
  }
  if (!previous || input.status !== previousView.status) {
    result.status = {
      active: "ACTIVE",
      waitlist: "PENDING_REVIEW",
      discharged: "ARCHIVED",
    }[input.status];
    if (!result.status) throw failure(400, "Review patient status.");
  }
  return result;
}
export function validateClientChartInput(input) {
  fields(input);
}
export async function readClientChart(
  agencyId,
  clientId,
  db,
  { lock = false } = {},
) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1)
    throw failure(
      409,
      "Connect the practice to its shared organization first.",
    );
  const row = await Client.findForAgency(clientId, agencyId, {
    executor: db,
    lock,
  });
  if (!row) throw failure(404, "Client not found in this practice.");
  return {
    row,
    data: chartDemographics(row),
    fingerprint: clientFingerprint(row),
  };
}
export async function createClientChart(agencyId, input, db) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1)
    throw failure(
      409,
      "Connect the practice to its shared organization first.",
    );
  const data = fields(input);
  const created = await Client.create(
    {
      ...data,
      organization_id: agencyId,
      agency_id: agencyId,
      provider_id: null,
      source: "ADMIN_CREATED",
      document_status: "NONE",
      submission_date: new Date().toISOString().slice(0, 10),
      client_type: "clinical",
      guardian_portal_enabled: false,
    },
    { executor: db, hydrate: false },
  );
  // Reuse the shared model for demographic columns not accepted by create().
  await Client.update(created.id, data, null, {
    executor: db,
    hydrate: false,
    agencyId,
  });
  return readClientChart(agencyId, created.id, db);
}
export async function updateClientChart(
  agencyId,
  clientId,
  input,
  fingerprint,
  db,
) {
  const current = await readClientChart(agencyId, clientId, db, { lock: true });
  if (!fingerprint || fingerprint !== current.fingerprint)
    throw failure(
      409,
      "This patient changed in the shared backend. Refresh before saving.",
    );
  const next = fields(input, current.row);
  // Access metadata or insurance-only changes must not stamp a demographic edit.
  if (
    Object.entries(next).some(([key, value]) =>
      key === "date_of_birth"
        ? date(current.row[key]) !== date(value)
        : (current.row[key] ?? null) !== value,
    )
  )
    await Client.update(clientId, next, undefined, {
      executor: db,
      hydrate: false,
      agencyId,
    });
  return readClientChart(agencyId, clientId, db);
}
