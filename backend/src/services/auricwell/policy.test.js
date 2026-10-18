import test from "node:test";
import assert from "node:assert/strict";
import {
  initialSettings,
  readiness,
  requirePermission,
  requirePhi,
  requirePatientBilling,
  canReadClinical,
  canReadPatient,
  providerEligible,
  ledgerBalance,
  assertEmailType,
} from "./policy.js";

test("new practices do not require migration; transition practices do", () => {
  assert.equal(readiness(initialSettings("new")).migrationRequired, false);
  assert.equal(
    readiness(initialSettings("transition")).migrationRequired,
    true,
  );
  assert.throws(() => initialSettings("unknown"));
});
test("setup flags cannot replace executed agreements", () => {
  const settings = initialSettings();
  settings.practice = { legalName: "Practice", address: "Address" };
  settings.infrastructure = { verifiedAt: "now" };
  assert.equal(readiness(settings).phiReady, false);
  const agreements = ["service_agreement", "order_form", "baa"].map((type) => ({
    data: { type, status: "completed" },
  }));
  assert.equal(readiness(settings, agreements).phiReady, true);
  assert.throws(() => requirePhi({ settings: initialSettings() }));
});
test("owner clinicians can bill through explicit permissions; clinician status alone cannot", () => {
  assert.doesNotThrow(() =>
    requirePermission(
      { actorType: "staff", permissions: ["clinical", "billing"] },
      "billing",
    ),
  );
  assert.throws(() =>
    requirePermission(
      { actorType: "staff", permissions: ["clinical"] },
      "billing",
    ),
  );
  assert.throws(() =>
    requirePermission(
      { actorType: "patient", permissions: ["billing"] },
      "billing",
    ),
  );
});
test("chart access and financial responsibility are separate", () => {
  const patient = { id: "p1", data: { careTeam: ["clinician"] } };
  assert.equal(
    canReadPatient({ actorType: "guardian", patientIds: ["p1"] }, patient),
    true,
  );
  assert.equal(
    canReadPatient({ actorType: "guardian", patientIds: ["p2"] }, patient),
    false,
  );
  assert.throws(() =>
    requirePatientBilling(
      { actorType: "guardian", billingPatientIds: [] },
      "p1",
    ),
  );
  assert.doesNotThrow(() =>
    requirePatientBilling(
      { actorType: "guardian", billingPatientIds: ["p1"] },
      "p1",
    ),
  );
  assert.equal(
    canReadClinical(
      { actorType: "staff", permissions: ["clinical"], accountId: "other" },
      patient,
    ),
    false,
  );
  assert.equal(
    canReadClinical(
      { actorType: "staff", permissions: ["billing"], accountId: "clinician" },
      patient,
    ),
    false,
  );
});
test("provider selection requires active reviewed credentials, service, location and supervision", () => {
  const p = {
    status: "active",
    credentialsReviewed: true,
    jurisdiction: "CO",
    licenseExpires: "2030-01-01",
    services: ["90837"],
    locations: ["Office"],
  };
  assert.equal(
    providerEligible(p, {
      service: "90837",
      location: "Office",
      date: "2026-09-28",
    }),
    true,
  );
  for (const override of [
    { status: "inactive" },
    { credentialsReviewed: false },
    { jurisdiction: "UT" },
    { licenseExpires: "2020-01-01" },
    { services: [] },
    { supervisionRequired: true },
  ])
    assert.equal(
      providerEligible(
        { ...p, ...override },
        { service: "90837", date: "2026-09-28" },
      ),
      false,
    );
});
test("ledger uses integer cents and preserves refund accounting", () => {
  assert.equal(
    ledgerBalance([
      { data: { type: "charge", amountCents: 10000 } },
      { data: { type: "payment", amountCents: 7000 } },
      { data: { type: "adjustment", amountCents: 500 } },
      { data: { type: "refund", amountCents: 1000 } },
    ]),
    3500,
  );
  assert.throws(() =>
    ledgerBalance([{ data: { type: "payment", amountCents: -5 } }]),
  );
  assert.throws(() =>
    ledgerBalance([{ data: { type: "payment", amountCents: 0.1 } }]),
  );
});
test("only account email is permitted", () => {
  for (const kind of ["invitation", "recovery", "verification"])
    assert.doesNotThrow(() => assertEmailType(kind));
  for (const kind of ["clinical", "appointment", "agreement", "billing", "sms"])
    assert.throws(() => assertEmailType(kind));
});
test("availability respects practice timezone and rejects out-of-window appointments", async () => {
  const { providerAvailable } = await import("./policy.js");
  const provider = { availability: [{ day: 1, start: "09:00", end: "17:00" }] };
  assert.equal(
    providerAvailable(
      provider,
      new Date("2026-09-28T15:00:00Z"),
      new Date("2026-09-28T16:00:00Z"),
      "America/Denver",
    ),
    true,
  );
  assert.equal(
    providerAvailable(
      provider,
      new Date("2026-09-28T12:00:00Z"),
      new Date("2026-09-28T13:00:00Z"),
      "America/Denver",
    ),
    false,
  );
});

test('Records Managers can verify patient demographics without receiving clinical-note authority', () => {
  const manager = { actorType: 'staff', accountId: 'manager', permissions: ['records_manager'] };
  const patient = { id: 'patient', data: { careTeam: [] } };
  assert.equal(canReadPatient(manager, patient), true);
  assert.equal(canReadClinical(manager, patient), false);
  assert.throws(() => requirePermission(manager, 'clinical'), { status: 403 });
});
