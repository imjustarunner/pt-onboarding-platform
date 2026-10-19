// Explicitly opt in and pin both database pools to the disposable local database.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import * as OTPAuth from "otpauth";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { initialSettings, hash, json, providerEligible } from "./policy.js";

if (process.env.AURICWELL_TEST_DATABASE !== "local-disposable")
  throw new Error(
    "Set AURICWELL_TEST_DATABASE=local-disposable to run isolated integration tests.",
  );
Object.assign(process.env, {
  NODE_ENV: "test",
  SKIP_DB_CONNECT: "1",
  DB_HOST: "127.0.0.1",
  DB_PORT: "33471",
  DB_NAME: "auricwell_test",
  DB_USER: "auricwell_test",
  DB_PASSWORD: "auricwell-test-only",
  CLINICAL_DB_HOST: "127.0.0.1",
  CLINICAL_DB_PORT: "33471",
  CLINICAL_DB_NAME: "auricwell_test",
  CLINICAL_DB_USER: "auricwell_test",
  CLINICAL_DB_PASSWORD: "auricwell-test-only",
  FAMILY_BILLING_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
});
const repo = await import("./repository.js"),
  templates = await import("./templates.js"),
  intake = await import("./intake.js"),
  auth = await import("./auth.js"),
  practices = await import("./practices.js"),
  clinical = await import("./clinical.js"),
  imports = await import("./imports.js"),
  agreements = await import("./agreements.js"),
  billing = await import("./billing.js");
const { pool, seal, open, create, get, list } = repo;
let operator, practice, ctx, operatorCtx, otherCtx, patient, provider, note;
const password = "A strong test-only password";
async function context(id, account, permissions) {
  const [[p]] = await pool.execute(
    "SELECT * FROM auricwell_practices WHERE id=?",
    [id],
  );
  return {
    practiceId: id,
    slug: p.slug,
    practiceName: p.name,
    accountId: account.id,
    username: account.username,
    profile: account.profile || {},
    actorType: "staff",
    permissions,
    patientIds: [],
    billingPatientIds: [],
    settings: open(p.settings, `auricwell:practice:${id}`),
    settingsRevision: p.revision,
  };
}
before(async () => {
  const db = await mysql.createConnection({
    host: "127.0.0.1",
    port: 33471,
    user: "auricwell_test",
    password: "auricwell-test-only",
    database: "auricwell_test",
    multipleStatements: true,
  });
  await db.query(
    await fs.readFile(
      new URL(
        "../../../../database/migrations/1495_auricwell_product.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(await fs.readFile(new URL('../../../../database/migrations/1663_auricwell_verification_sms.sql', import.meta.url),'utf8'));
  await db.end();
  const suffix = crypto.randomBytes(5).toString("hex");
  operator = await auth.createAccount({
    username: `operator-${suffix}`,
    name: "Test Operator",
    email: "operator@example.invalid",
    password,
    operator: true,
  });
  operator.profile = { operator: true, name: "Test Operator" };
  practice = await practices.provisionPractice(
    { accountId: operator.id, profile: operator.profile },
    {
      slug: `test-${suffix}`,
      name: "Synthetic Therapy",
      onboardingMode: "new",
      ownerUsername: `owner-${suffix}`,
      ownerName: "Practice Owner",
      ownerEmail: "owner@example.invalid",
    },
  );
  const owner = {
    id: practice.ownerAccountId,
    username: `owner-${suffix}`,
    profile: { name: "Practice Owner" },
  };
  await pool.execute(
    "UPDATE auricwell_accounts SET password_hash=?,status='active' WHERE id=?",
    [await bcrypt.hash(password, 12), owner.id],
  );
  ctx = await context(practice.id, owner, [
    "admin",
    "clinical",
    "schedule",
    "billing",
    "supervise",
    "agreements",
    "migration",
  ]);
  operatorCtx = await context(practice.id, operator, [
    "admin",
    "agreements",
    "migration",
  ]);
  const other = await practices.provisionPractice(
    { accountId: operator.id, profile: operator.profile },
    {
      slug: `other-${suffix}`,
      name: "Other practice",
      ownerUsername: `other-${suffix}`,
      ownerName: "Other Owner",
      ownerEmail: "other@example.invalid",
    },
  );
  otherCtx = await context(other.id, { id: other.ownerAccountId }, [
    "admin",
    "clinical",
    "schedule",
    "billing",
    "migration",
  ]);
});
after(async () => {
  await pool.end();
  const { default: clinicalPool } = await import(
    "../../config/clinicalDatabase.js"
  );
  await clinicalPool.end();
});

test("new-practice setup persists without import requirements, and PHI stays blocked", async () => {
  assert.equal(ctx.settings.onboardingMode, "new");
  await assert.rejects(
    imports.beginUpload(ctx, {
      type: "providers",
      filename: "staff.csv",
      size: 4,
      sha256: "0".repeat(64),
    }),
    /agreements/,
  );
  await assert.rejects(
    clinical.savePatient(ctx, { name: "Synthetic Patient", dob: "2000-01-01" }),
    /agreements/,
  );
  await practices.saveSettings(ctx, {
    revision: ctx.settingsRevision,
    practice: { legalName: "Synthetic Therapy LLC", address: "Test address" },
    services: [{ code: "90837", name: "Therapy", feeCents: 12000 }],
    locations: ["Office"],
  });
  ctx = await context(
    practice.id,
    { id: ctx.accountId, username: ctx.username, profile: ctx.profile },
    ctx.permissions,
  );
  operatorCtx = await context(practice.id, operator, operatorCtx.permissions);
  assert.equal(ctx.settings.services[0].code, "90837");
  await assert.rejects(
    practices.activatePhi(operatorCtx, {
      verified: true,
      evidence: "Test vendor evidence",
    }),
    /execute/,
  );
});
test("username passwords are independent; MFA rejects wrong and replayed codes", async () => {
  const logged = await auth.login(ctx.username, password);
  assert.ok(logged.token);
  assert.equal(logged.mfaEnabled, false);
  const a = { ...ctx, sessionHash: hash(logged.token), mfaEnabled: false };
  const setup = await auth.beginMfa(a);
  assert.ok(setup.secret);
  await assert.rejects(auth.verifyMfa(a, "not-a-code"), /Invalid/);
  const code = new OTPAuth.TOTP({ secret: setup.secret }).generate();
  const verified = await auth.verifyMfa(a, code);
  assert.equal(verified.recoveryCodes.length, 10);
  await assert.rejects(auth.verifyMfa(a, code), /already used/);
  await auth.verifyMfa(a, verified.recoveryCodes[0]);
  await assert.rejects(auth.verifyMfa(a, verified.recoveryCodes[0]), /Invalid/);
  assert.ok((await auth.login("unknown-user", password)).error);
});
test("exact-version practice agreements require both authorized signatures", async () => {
  for (const type of ["service_agreement", "order_form", "baa"]) {
    let a = await agreements.createAgreement(ctx, { type });
    await assert.rejects(agreements.issueAgreement(ctx, a.id), /Approve/);
    a = await agreements.saveAgreement(ctx, a.id, {
      revision: a.revision,
      body: a.data.body,
      terms: "Synthetic test terms. Not a production agreement.",
      effectiveDate: "2026-09-28",
      parties: {
        practice: {
          legalName: "Synthetic Therapy LLC",
          address: "Test address",
          noticeContact: "practice@example.invalid",
        },
        operator: {
          legalName: "Synthetic Operator LLC",
          address: "Operator test address",
          noticeContact: "operator@example.invalid",
        },
      },
      signers: [
        { accountId: ctx.accountId, capacity: "Practice representative" },
        { accountId: operator.id, capacity: "Operator representative" },
      ],
    });
    await assert.rejects(agreements.approveAgreement(ctx, a.id), /operator/);
    a = await agreements.approveAgreement(operatorCtx, a.id);
    a = await agreements.issueAgreement(operatorCtx, a.id);
    await assert.rejects(
      agreements.signAgreement(ctx, a.id, {
        consent: true,
        contentHash: "wrong",
        name: "Owner",
      }),
      /exact/,
    );
    a = await agreements.signAgreement(ctx, a.id, {
      consent: true,
      contentHash: a.data.contentHash,
      name: "Practice Owner",
    });
    assert.equal(a.data.status, "partially_signed");
    await assert.rejects(
      agreements.signAgreement(ctx, a.id, {
        consent: true,
        contentHash: a.data.contentHash,
        name: "Practice Owner",
      }),
      /already signed/,
    );
    a = await agreements.signAgreement(operatorCtx, a.id, {
      consent: true,
      contentHash: a.data.contentHash,
      name: "Operator",
    });
    assert.equal(a.data.status, "completed");
    assert.ok(
      (await agreements.agreementPdf(a))
        .subarray(0, 4)
        .equals(Buffer.from("%PDF")),
    );
    await assert.rejects(
      agreements.saveAgreement(ctx, a.id, { revision: a.revision }),
      /immutable/,
    );
  }
  await practices.activatePhi(operatorCtx, {
    verified: true,
    evidence: "Synthetic infrastructure verification",
  });
  ctx = await context(
    practice.id,
    { id: ctx.accountId, username: ctx.username, profile: ctx.profile },
    ctx.permissions,
  );
});
test("clinical records and encryption never cross practice boundaries", async () => {
  patient = await clinical.savePatient(ctx, {
    name: "Synthetic Patient",
    dob: "2000-01-01",
    status: "active",
  });
  await assert.rejects(get(otherCtx, "patient", patient.id), /not found/);
  const [[row]] = await pool.execute(
    "SELECT payload FROM auricwell_records WHERE id=?",
    [patient.id],
  );
  assert.ok(!row.payload.includes("Synthetic Patient"));
  assert.throws(() =>
    open(row.payload, `auricwell:${otherCtx.practiceId}:patient:${patient.id}`),
  );
});
test("provider eligibility, appointment conflicts, note signing and immutability", async () => {
  provider = await clinical.saveProvider(ctx, {
    accountId: ctx.accountId,
    name: "Practice Owner",
    credential: "LPC",
    license: "test",
    licenseExpires: "2030-01-01",
    jurisdiction: "CO",
    status: "active",
    credentialsReviewed: true,
    services: ["90837"],
    locations: ["Office"],
    npi: "1234567893",
    taxonomy: "101YM0800X",
    billingFirstName: "Practice",
    billingLastName: "Owner",
  });
  const input = {
    patientId: patient.id,
    providerId: provider.id,
    start: "2026-09-01T16:00:00Z",
    end: "2026-09-01T17:00:00Z",
    serviceCode: "90837",
    location: "Office",
    modality: "office",
    status: "completed",
  };
  const appointment = await clinical.saveAppointment(ctx, input);
  await assert.rejects(
    clinical.saveAppointment(ctx, input),
    /already has an appointment/,
  );
  note = await clinical.saveNote(ctx, {
    patientId: patient.id,
    appointmentId: appointment.id,
    title: "Synthetic progress note",
    type: "Progress note",
    serviceDate: "2026-09-01",
    serviceCode: "90837",
    content: "Synthetic clinical facts for testing.",
    diagnoses: ["F41.1"],
    billable: true,
  });
  await assert.rejects(
    clinical.signNote(ctx, note.id, {
      revision: note.revision,
      reviewed: false,
    }),
    /Review/,
  );
  note = await clinical.signNote(ctx, note.id, {
    revision: note.revision,
    reviewed: true,
  });
  assert.equal(note.data.status, "signed");
  await assert.rejects(
    clinical.saveNote(ctx, { ...note.data, revision: note.revision }, note.id),
    /unsigned/,
  );
});
test("manual ledger commands are idempotent; refunds cannot exceed payment", async () => {
  const command = {
    patientId: patient.id,
    type: "charge",
    amountCents: 10000,
    date: "2026-09-01",
    method: "none",
    reason: "Synthetic charge",
    idempotencyKey: "test-charge",
  };
  const first = await clinical.postLedger(ctx, command),
    second = await clinical.postLedger(ctx, command);
  assert.equal(first.id, second.id);
  const payment = await clinical.postLedger(ctx, {
    ...command,
    type: "payment",
    method: "cash",
    amountCents: 5000,
    idempotencyKey: "payment",
  });
  await assert.rejects(
    clinical.postLedger(ctx, {
      ...command,
      type: "refund",
      amountCents: 6000,
      paymentId: payment.id,
      idempotencyKey: "refund",
    }),
    /exceeds/,
  );
  await assert.rejects(
    clinical.postLedger(ctx, {
      ...command,
      type: "opening_balance",
      idempotencyKey: "opening",
    }),
    /opening balance/,
  );
  const workspace = await clinical.workspace(ctx);
  assert.equal(workspace.balances[patient.id], 5000);
});
test("billing spreadsheet import retains originals, creates charts and never posts live financials", async () => {
  const bytes = Buffer.from(
    "sourceId,patientSourceId,name,dob,date,charge\nb1,p-2,Imported Test,2001-02-03,2026-09-01,100\n",
  );
  const batch = await imports.beginUpload(ctx, {
    type: "billing",
    filename: "test.csv",
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  });
  await imports.putChunk(ctx, batch.id, 0, bytes.toString("base64"));
  await imports.putChunk(ctx, batch.id, 0, bytes.toString("base64"));
  await imports.finishUpload(ctx, batch.id);
  await imports.parseBatch(ctx, batch.id);
  assert.equal((await get(ctx, "import", batch.id)).data.status, "review");
  const applied = await imports.applyImport(ctx, batch.id, {
    reviewed: true,
    decisions: [{ key: "0" }],
  });
  assert.equal(applied.data.applied.length, 1);
  assert.equal(applied.data.issues.length, 0);
  const repeat = await imports.applyImport(ctx, batch.id, {
    reviewed: true,
    decisions: [{ key: "0" }],
  });
  assert.equal(repeat.data.applied.length, 1);
  assert.equal((await list(ctx, "historical_billing")).length, 1);
  assert.equal((await list(ctx, "claim")).length, 0);
  assert.deepEqual(await imports.sourceBuffer(ctx, batch), bytes);
});
test("combined PDF notes retain source ranges and chart downloads contain only reviewed pages", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage()
    .drawText("Synthetic patient one note", { x: 30, y: 500, font, size: 14 });
  pdf.addPage().drawText("Different patient confidential note", {
    x: 30,
    y: 500,
    font,
    size: 14,
  });
  const bytes = Buffer.from(await pdf.save());
  const batch = await imports.beginUpload(ctx, {
    type: "clinical_pdf",
    filename: "combined.pdf",
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  });
  await imports.putChunk(ctx, batch.id, 0, bytes.toString("base64"));
  await imports.finishUpload(ctx, batch.id);
  await imports.parseBatch(ctx, batch.id);
  const result = await imports.applyImport(ctx, batch.id, {
    reviewed: true,
    decisions: [
      {
        key: "1",
        patientId: patient.id,
        pageStart: 1,
        pageEnd: 1,
        title: "Historical note",
        author: "Historical Clinician",
        serviceDate: "2025-01-01",
        content: "Reviewed historical text",
      },
    ],
  });
  assert.equal(result.data.applied.length, 1);
  const record = await get(
    ctx,
    "note",
    result.data.applied[0].references[0].id,
  );
  assert.equal(record.data.status, "historical");
  assert.equal(record.data.billable, false);
  assert.equal(
    (
      await PDFDocument.load(await imports.patientPdf(ctx, record))
    ).getPageCount(),
    1,
  );
  const overlap = await imports.applyImport(ctx, batch.id, {
    reviewed: true,
    decisions: [
      {
        key: "different",
        patientId: patient.id,
        pageStart: 1,
        pageEnd: 2,
        title: "Overlap",
        author: "Historical Clinician",
        serviceDate: "2025-01-01",
        content: "No",
      },
    ],
  });
  assert.match(overlap.data.issues[0].message, /already attached/);
});
test("billing access cannot read clinical content; unauthorized messages cannot leave the care team", async () => {
  const biller = { ...ctx, permissions: ["billing"] };
  const data = await clinical.workspace(biller);
  assert.equal(data.notes.length, 0);
  await assert.rejects(
    clinical.createMessage(ctx, {
      patientId: patient.id,
      body: "Test",
      recipients: [otherCtx.accountId],
    }),
    /Recipients/,
  );
  const message = await clinical.createMessage(ctx, {
    patientId: patient.id,
    body: "Synthetic secure conversation",
    recipients: [ctx.accountId],
  });
  assert.equal(message.kind, "message");
});
test("live claims cannot bypass integration commissioning", async () => {
  const payer = await create(ctx, "payer", { name: "Synthetic Payer" });
  const claim = await clinical.prepareClaim(ctx, {
    noteId: note.id,
    payerId: payer.id,
    amountCents: 12000,
  });
  assert.equal(
    (
      await clinical.prepareClaim(ctx, {
        noteId: note.id,
        payerId: payer.id,
        amountCents: 12000,
      })
    ).id,
    claim.id,
  );
  await assert.rejects(
    billing.transmitClaim(ctx, claim.id, {}),
    /integration must be configured/,
  );
});
test("product HTTP boundary rejects legacy cookies, foreign practice paths and untrusted mutations", async () => {
  const { default: express } = await import("express"),
    { default: cookieParser } = await import("cookie-parser"),
    { default: router } = await import("../../routes/auricwell.routes.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auricwell", router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = crypto.randomBytes(32).toString("hex");
  await pool.execute(
    "INSERT INTO auricwell_sessions (token_hash,account_id,mfa_verified,expires_at) VALUES (?,?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))",
    [hash(token), ctx.accountId],
  );
  try {
    assert.equal(
      (
        await fetch(`${origin}/api/auricwell/bootstrap`, {
          headers: { cookie: "authToken=legacy-jwt" },
        })
      ).status,
      401,
    );
    const headers = { cookie: `auricwellSession=${token}` };
    assert.equal(
      (
        await fetch(`${origin}/api/auricwell/practices/${ctx.slug}/workspace`, {
          headers,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(
          `${origin}/api/auricwell/practices/${otherCtx.slug}/workspace`,
          { headers },
        )
      ).status,
      404,
    );
    assert.equal(
      (await fetch(`${origin}/api/auricwell/payroll`, { headers })).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/auricwell/practices/${ctx.slug}/patients`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "X-AuricWell": "1",
            Origin: "https://untrusted.invalid",
          },
          body: "{}",
        })
      ).status,
      403,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("Claim.MD adapter reviews an exact payload and preserves an uncertain submission reservation", async () => {
  const claims = await list(ctx, "claim"),
    claim = claims[0],
    payer = await get(ctx, "payer", claim.data.payerId);
  await repo.update(ctx, payer, {
    ...payer.data,
    electronicPayerId: "TEST",
    electronicMatchReviewed: true,
  });
  provider = await repo.update(ctx, await get(ctx, "provider", provider.id), {
    ...provider.data,
    payerEnrollments: [{ payerId: payer.id, verified: true }],
  });
  await billing.saveInsurance(ctx, patient.id, {
    sharedFingerprint: (await billing.readInsurance(ctx, patient.id))
      .sharedFingerprint,
    reviewed: true,
    acceptAssignment: true,
    primary: {
      insurerName: "Synthetic Insurance",
      payerId: "TEST",
      memberId: "SYNTHETIC",
      subscriberFirstName: "Synthetic",
      subscriberLastName: "Patient",
      subscriberDob: "2000-01-01",
      subscriberSex: "U",
      subscriberAddressLine1: "1 Test St",
      subscriberCity: "Denver",
      subscriberState: "CO",
      subscriberPostalCode: "80202",
      relationshipToSubscriber: "self",
    },
    patient: {
      firstName: "Synthetic",
      lastName: "Patient",
      dateOfBirth: "2000-01-01",
      sex: "U",
      addressLine1: "1 Test St",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
    },
  });
  await billing.saveBillingIdentity(ctx, {
    legalName: "Synthetic Therapy",
    billingNpi: "1234567893",
    taxId: "123456789",
    address: "1 Test St",
    city: "Denver",
    state: "CO",
    postalCode: "80202",
    phone: "3035550100",
    reviewed: true,
  });
  ctx = await context(
    practice.id,
    { id: ctx.accountId, username: ctx.username, profile: ctx.profile },
    ctx.permissions,
  );
  let review = await billing.reviewSubmission(ctx, claim.id, {});
  assert.equal(review.payload.remote_claimid, `AW-${claim.id}`);
  await assert.rejects(
    billing.reviewSubmission(ctx, claim.id, {
      approve: true,
      reviewHash: "wrong",
      revision: claim.revision,
    }),
    /current/,
  );
  const { readClientInsurance, writeClientInsurance } = await import(
    "../clientInsurance.service.js"
  );
  const sharedCoverage = await readClientInsurance(
    patient.canonicalClientId,
    practice.agencyId,
  );
  await writeClientInsurance({
    clientId: patient.canonicalClientId,
    agencyId: practice.agencyId,
    ...sharedCoverage,
    primary: { ...sharedCoverage.primary, claimsPhone: "3035550123" },
  });
  await assert.rejects(
    billing.reviewSubmission(ctx, claim.id, {
      approve: true,
      reviewHash: review.reviewHash,
      revision: review.revision,
    }),
    /current/,
  );
  review = await billing.reviewSubmission(ctx, claim.id, {});
  await billing.reviewSubmission(ctx, claim.id, {
    approve: true,
    reviewHash: review.reviewHash,
    revision: review.revision,
  });
  ctx.settings.integrations.claims = { verifiedAt: "now", mode: "test" };
  process.env[
    `AURICWELL_CLAIMMD_${ctx.slug.toUpperCase().replaceAll("-", "_")}_KEY`
  ] = "test-key-no-network";
  await assert.rejects(
    billing.transmitClaim(ctx, claim.id, { reviewHash: review.reviewHash }),
    /external financial/,
  );
  process.env.AURICWELL_FINANCIAL_PRACTICES = ctx.slug;
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("simulated network interruption");
  };
  try {
    const changedCoverage = await readClientInsurance(
      patient.canonicalClientId,
      practice.agencyId,
    );
    await writeClientInsurance({
      clientId: patient.canonicalClientId,
      agencyId: practice.agencyId,
      ...changedCoverage,
      primary: { ...changedCoverage.primary, claimsPhone: "3035550199" },
    });
    await assert.rejects(
      billing.transmitClaim(ctx, claim.id, { reviewHash: review.reviewHash }),
      /source data changed/,
    );
    assert.equal(requests, 0);
    assert.equal((await get(ctx, "claim", claim.id)).data.status, "reviewed");
    review = await billing.reviewSubmission(ctx, claim.id, {});
    await billing.reviewSubmission(ctx, claim.id, {
      approve: true,
      reviewHash: review.reviewHash,
      revision: review.revision,
    });
    await assert.rejects(
      billing.transmitClaim(ctx, claim.id, { reviewHash: review.reviewHash }),
      /reconciliation/,
    );
    assert.equal(
      (await get(ctx, "claim", claim.id)).data.status,
      "transmission_uncertain",
    );
    await assert.rejects(
      billing.transmitClaim(ctx, claim.id, { reviewHash: review.reviewHash }),
      /approval/,
    );
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("Stripe payment reconciliation posts once and verifies processor ownership and amount", async () => {
  const { default: Stripe } = await import("../stripePayments.service.js");
  const oldCreate = Stripe.createPaymentIntent,
    oldRetrieve = Stripe.retrievePaymentIntent;
  ctx.settings.integrations.payments = {
    verifiedAt: "now",
    mode: "test",
    connectedAccountId: "acct_synthetic",
  };
  process.env.STRIPE_SECRET_KEY = "sk_test_synthetic";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_synthetic";
  let saved;
  Stripe.createPaymentIntent = async (input) =>
    (saved = {
      id: "pi_synthetic",
      amount: input.amountCents,
      amount_received: input.amountCents,
      currency: "usd",
      status: "requires_payment_method",
      client_secret: "synthetic_secret",
      metadata: input.metadata,
    });
  Stripe.retrievePaymentIntent = async () => ({
    ...saved,
    status: "succeeded",
  });
  try {
    const attempt = await billing.startPayment(ctx, patient.id, {
      amountCents: 1000,
      consent: true,
    });
    const first = await billing.reconcilePayment(ctx, attempt.attemptId),
      second = await billing.reconcilePayment(ctx, attempt.attemptId);
    assert.equal(first.id, second.id);
    assert.equal(
      (await list(ctx, "ledger", { patientId: patient.id })).filter(
        (e) => e.data.source === "stripe",
      ).length,
      1,
    );
  } finally {
    Stripe.createPaymentIntent = oldCreate;
    Stripe.retrievePaymentIntent = oldRetrieve;
  }
});
test("migration reconciliation accounts for every row and rollback preserves subsequent edits", async () => {
  const bytes = Buffer.from(
    "sourceId,name,electronicPayerId\nrollback-a,Synthetic A,TESTA\nrollback-b,Synthetic B,TESTB\n",
  );
  let batch = await imports.beginUpload(ctx, {
    type: "payers",
    filename: "synthetic-rollback.csv",
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  });
  await imports.putChunk(ctx, batch.id, 0, bytes.toString("base64"));
  await imports.finishUpload(ctx, batch.id);
  await imports.parseBatch(ctx, batch.id);
  batch = await imports.applyImport(ctx, batch.id, {
    reviewed: true,
    decisions: [{ key: "0" }, { key: "1" }],
  });
  assert.equal(batch.data.applied.length, 2);
  await assert.rejects(
    imports.reconcileImport(ctx, batch.id, {
      reviewed: true,
      excludedCount: 1,
      explanation: "Wrong count",
    }),
    /equal/,
  );
  batch = await imports.reconcileImport(ctx, batch.id, {
    reviewed: true,
    excludedCount: 0,
    explanation: "Two payers match the exported report.",
  });
  assert.equal(batch.data.status, "reconciled");
  const [a, b] = batch.data.applied.map((r) => r.references[0]);
  const changed = await get(ctx, "payer", a.id);
  await repo.update(ctx, changed, {
    ...changed.data,
    address: "Later corrected address",
  });
  batch = await imports.rollbackImport(ctx, batch.id, {
    reviewed: true,
    reason: "Synthetic rollback verification",
  });
  assert.equal(batch.data.rollback.preserved.length, 1);
  assert.equal(batch.data.rollback.withdrawn.length, 1);
  assert.equal(
    (await get(ctx, "payer", a.id)).data.address,
    "Later corrected address",
  );
  await assert.rejects(get(ctx, "payer", b.id), /withdrawn/);
});
test("guardian financial access, document sharing and service capabilities are enforced", async () => {
  const guardian = {
    ...ctx,
    actorType: "guardian",
    permissions: [],
    patientIds: [patient.id],
    billingPatientIds: [],
  };
  await assert.rejects(
    billing.startPayment(guardian, patient.id, {
      amountCents: 1,
      consent: true,
    }),
    /Financial responsibility/,
  );
  const disabled = {
    ...ctx,
    settings: {
      ...ctx.settings,
      capabilities: {
        ...ctx.settings.capabilities,
        billing: false,
        documentation: false,
      },
    },
  };
  await assert.rejects(
    clinical.signNote(disabled, note.id, {
      reviewed: true,
      revision: note.revision,
    }),
    /documentation/,
  );
  await assert.rejects(
    billing.saveInsurance(disabled, patient.id, {}),
    /billing/,
  );
  const notes = await list(ctx, "note");
  const historical = notes.find((n) => n.data.source === "therapynotes");
  const prior = await get(ctx, "note", historical.id);
  const share = await clinical.shareNote(ctx, historical.id, {
    reviewed: true,
    revision: prior.revision,
    shared: true,
  });
  assert.equal(share.data.shared, true);
  assert.equal(
    (await get(ctx, "note", historical.id)).revision,
    prior.revision,
  );
});
test("reviewed remittance reconciles insurance payment and patient responsibility exactly once", async () => {
  const claim = (await list(ctx, "claim"))[0];
  await assert.rejects(
    billing.postRemittance(ctx, {
      claimId: claim.id,
      reviewed: true,
      paymentCents: 1,
      adjustmentCents: 0,
      patientResponsibilityCents: 0,
      date: "2026-09-28",
      reference: "bad",
    }),
    /reconcile/,
  );
  const result = await billing.postRemittance(ctx, {
    claimId: claim.id,
    reviewed: true,
    paymentCents: claim.data.amountCents - 1000,
    adjustmentCents: 0,
    patientResponsibilityCents: 1000,
    date: "2026-09-28",
    reference: "synthetic-era",
  });
  assert.equal(result.data.status, "paid");
  await assert.rejects(
    billing.postRemittance(ctx, {
      claimId: claim.id,
      reviewed: true,
      paymentCents: claim.data.amountCents - 1000,
      adjustmentCents: 0,
      patientResponsibilityCents: 1000,
      date: "2026-09-28",
      reference: "synthetic-era",
    }),
    /already/,
  );
  assert.equal(
    (await list(ctx, "ledger", { patientId: claim.patientId })).filter(
      (r) => r.data.claimId === claim.id,
    ).length,
    1,
  );
});
test("supervised claims require exact payer plan rules and assigned supervisor signatures", async () => {
  const supervisor = await auth.createAccount({
    username: `supervisor-${crypto.randomBytes(4).toString("hex")}`,
    name: "Synthetic Supervisor",
    password,
    email: "supervisor@example.invalid",
  });
  await pool.execute(
    "INSERT INTO auricwell_memberships(practice_id,account_id,permissions,patient_ids,actor_type,status) VALUES(?,?,?,?,?,?)",
    [
      ctx.practiceId,
      supervisor.id,
      JSON.stringify(["clinical", "supervise"]),
      "[]",
      "staff",
      "active",
    ],
  );
  const original = (await list(ctx, "claim"))[0],
    payer = await get(ctx, "payer", original.data.payerId);
  await clinical.saveProvider(ctx, {
    accountId: supervisor.id,
    name: "Synthetic Supervisor",
    credential: "LPC",
    license: "test-supervisor",
    licenseExpires: "2030-01-01",
    jurisdiction: "CO",
    status: "active",
    credentialsReviewed: true,
    services: ["90837"],
    locations: ["Office"],
    npi: "1306688650",
    taxonomy: "101YM0800X",
    billingFirstName: "Synthetic",
    billingLastName: "Supervisor",
    payerEnrollments: [{ payerId: payer.id, verified: true }],
  });
  const author = await get(ctx, "provider", original.data.providerId);
  await repo.update(ctx, author, {
    ...author.data,
    supervisionRequired: true,
    supervisorAccountId: supervisor.id,
  });
  const pending = await create(
    ctx,
    "claim",
    {
      ...original.data,
      status: "draft",
      remittancePosted: null,
      reviewHash: null,
      submissionSnapshot: null,
    },
    { patientId: patient.id },
  );
  await assert.rejects(
    billing.reviewSubmission(ctx, pending.id, {}),
    /payer, plan/,
  );
  await billing.savePayer(ctx, payer.id, {
    ...payer.data,
    revision: payer.revision,
    electronicMatchReviewed: true,
    matchEvidence: "Synthetic payer match",
    supervisionMapping: "service_rendering_with_supervisor",
    planType: "Synthetic Plan",
    effectiveFrom: "2026-01-01",
    effectiveThrough: "2027-12-31",
    supervisionReviewed: true,
    ruleReference: "Synthetic payer policy",
  });
  const insurance = await billing.readInsurance(ctx, patient.id);
  await billing.saveInsurance(ctx, patient.id, {
    ...insurance.data,
    reviewed: true,
    sharedFingerprint: insurance.sharedFingerprint,
    primary: { ...insurance.data.primary, planType: "Synthetic Plan" },
  });
  await assert.rejects(
    billing.reviewSubmission(ctx, pending.id, {}),
    /supervisor/,
  );
  const current = await get(ctx, "note", original.data.noteId);
  const supervisorCtx = {
    ...ctx,
    accountId: supervisor.id,
    permissions: ["clinical", "supervise"],
  };
  await clinical.signNote(supervisorCtx, current.id, {
    revision: current.revision,
    reviewed: true,
    cosign: true,
  });
  const review = await billing.reviewSubmission(ctx, pending.id, {});
  assert.equal(review.payload.prov_npi, author.data.npi);
  assert.equal(review.payload.charge[0].chg_supv_prov_npi, "1306688650");
  const revised = await get(ctx, "payer", payer.id);
  await repo.update(ctx, revised, {
    ...revised.data,
    supervisionRule: {
      ...revised.data.supervisionRule,
      planType: "Different Plan",
    },
  });
  await assert.rejects(
    billing.reviewSubmission(ctx, pending.id, {}),
    /payer, plan/,
  );
});
test("structured clinical templates preserve versions and require complete reviewed documentation before signing", async () => {
  assert.equal(ctx.settings.capabilities.ai, false);
  const template = await templates.saveNoteTemplate(ctx, {
    name: "Practice progress template",
    noteType: "Progress note",
    status: "active",
    serviceCodes: ["90837"],
    fields: [
      {
        key: "interventions",
        label: "Interventions",
        type: "textarea",
        required: true,
      },
      {
        key: "response",
        label: "Patient response",
        type: "select",
        required: true,
        options: ["Improved", "Unchanged"],
      },
      {
        key: "follow_up",
        label: "Follow-up arranged",
        type: "boolean",
        required: true,
      },
    ],
  });
  const input = {
    patientId: patient.id,
    title: "Structured synthetic documentation",
    type: "Progress note",
    serviceDate: "2026-09-01",
    serviceCode: "90837",
    content: "Clinician narrative.",
    structured: {
      templateId: template.id,
      templateRevision: template.revision,
      snapshot: { fields: [] },
      answers: { interventions: "Verified intervention." },
    },
  };
  let draft = await clinical.saveNote(ctx, input);
  assert.equal(
    draft.data.structured.snapshot.fields.length,
    3,
    "client-supplied schema is ignored",
  );
  assert.match(draft.data.content, /Interventions\nVerified intervention/);
  await assert.rejects(
    clinical.signNote(ctx, draft.id, {
      revision: draft.revision,
      reviewed: true,
    }),
    /Patient response/,
  );
  await templates.saveNoteTemplate(
    ctx,
    {
      ...template.data,
      revision: template.revision,
      name: "Retired template",
      status: "inactive",
    },
    template.id,
  );
  await assert.rejects(clinical.saveNote(ctx, input), /changed or was retired/);
  draft = await clinical.saveNote(
    ctx,
    {
      ...input,
      revision: draft.revision,
      structured: {
        ...input.structured,
        answers: {
          interventions: "Verified intervention.",
          response: "Improved",
          follow_up: false,
        },
      },
    },
    draft.id,
  );
  assert.equal(draft.data.structured.templateRevision, 1);
  assert.equal(
    draft.data.structured.snapshot.name,
    "Practice progress template",
  );
  assert.match(draft.data.content, /Follow-up arranged\nNo/);
  const signed = await clinical.signNote(ctx, draft.id, {
    revision: draft.revision,
    reviewed: true,
  });
  assert.equal(signed.data.status, "signed");
  assert.equal(signed.data.signedHash, hash(JSON.stringify(draft.data)));
  await assert.rejects(
    clinical.saveNote(ctx, { ...input, revision: signed.revision }, signed.id),
    /unsigned draft/,
  );
});

test("template management and use respect practice, permissions, service scope and exact versions", async () => {
  const input = {
    name: "Intake template",
    noteType: "Intake assessment",
    status: "active",
    serviceCodes: ["90837"],
    fields: [
      { key: "history", label: "History", type: "textarea", required: true },
    ],
  };
  await assert.rejects(
    templates.saveNoteTemplate({ ...ctx, permissions: ["clinical"] }, input),
    /admin permission/,
  );
  await assert.rejects(
    templates.noteTemplates({ ...ctx, permissions: ["billing"] }),
    /permission/,
  );
  await assert.rejects(
    templates.noteTemplates({ ...ctx, actorType: "guardian" }),
    /permission/,
  );
  await assert.rejects(
    templates.saveNoteTemplate(ctx, { ...input, serviceCodes: ["99213"] }),
    /enabled therapy/,
  );
  await assert.rejects(
    templates.saveNoteTemplate(ctx, {
      ...input,
      fields: [...input.fields, input.fields[0]],
    }),
    /unique/,
  );
  const t = await templates.saveNoteTemplate(ctx, input);
  assert.equal(
    (await templates.noteTemplates(otherCtx)).some((v) => v.id === t.id),
    false,
  );
  await assert.rejects(
    templates.saveNoteTemplate(
      otherCtx,
      { ...input, revision: t.revision },
      t.id,
    ),
    /enabled therapy|not found/,
  );
  const noteInput = {
    patientId: patient.id,
    title: "Test",
    type: "Intake assessment",
    serviceCode: "90837",
    serviceDate: "2026-09-01",
    content: "Test",
    structured: {
      templateId: t.id,
      templateRevision: t.revision,
      answers: { history: "Synthetic history." },
    },
  };
  await assert.rejects(
    templates.structuredNote(otherCtx, noteInput),
    /not found/,
  );
  await assert.rejects(
    clinical.saveNote(ctx, { ...noteInput, type: "Progress note" }),
    /match the note type/,
  );
  await assert.rejects(
    clinical.saveNote(ctx, {
      ...noteInput,
      structured: {
        ...noteInput.structured,
        answers: { unknown: "Wrong field" },
      },
    }),
    /does not belong/,
  );
  await templates.saveNoteTemplate(
    ctx,
    { ...input, revision: t.revision, name: "Intake revised" },
    t.id,
  );
  await assert.rejects(
    clinical.saveNote(ctx, noteInput),
    /changed or was retired/,
  );
});

test("manual clinical drafts enforce the same provider and service scope as signing", async () => {
  const current = await get(ctx, "provider", provider.id);
  const input = {
    patientId: patient.id,
    title: "Scope test",
    type: "Progress note",
    serviceCode: "90837",
    serviceDate: "2026-09-01",
    content: "Synthetic facts.",
  };
  for (const patch of [
    { status: "inactive" },
    { credentialsReviewed: false },
    { services: [] },
  ]) {
    const version = await get(ctx, "provider", provider.id);
    await repo.update(ctx, version, { ...current.data, ...patch });
    try {
      await assert.rejects(
        clinical.saveNote(ctx, input),
        /eligible provider profile/,
      );
    } finally {
      await repo.update(
        ctx,
        await get(ctx, "provider", provider.id),
        current.data,
      );
    }
  }
  await assert.rejects(
    clinical.saveNote(
      { ...ctx, settings: { ...ctx.settings, services: [] } },
      input,
    ),
    /unavailable/,
  );
});

let intakeTemplate, intakeAccount, intakeCtx, intakePacket;
test("intake-only accounts and questionnaire setup keep chart creation separate and block PHI before readiness", async () => {
  const accountInput = {
    username: `intake-${crypto.randomBytes(4).toString("hex")}`,
    name: "Synthetic Intake Guardian",
    email: "guardian@example.invalid",
    actorType: "guardian",
    intakeOnly: true,
  };
  const setupOnly = {
    ...ctx,
    settings: { ...ctx.settings, phiActivatedAt: null },
  };
  await assert.rejects(
    practices.addMember(setupOnly, accountInput),
    /Enable patient data/,
  );
  intakeTemplate = await intake.saveIntakeTemplate(setupOnly, {
    name: "Practice intake",
    instructions: "Synthetic questionnaire instructions.",
    status: "active",
    fields: [
      {
        key: "goals",
        label: "What would you like help with?",
        type: "textarea",
        required: true,
      },
      {
        key: "previous_care",
        label: "Previous care",
        type: "boolean",
        required: true,
      },
    ],
  });
  await assert.rejects(intake.getIntakes(setupOnly), /agreements/);
  const disabled = {
    ...ctx,
    settings: {
      ...ctx.settings,
      capabilities: { ...ctx.settings.capabilities, intake: false },
    },
  };
  await assert.rejects(intake.intakeTemplates(disabled), /not enabled/);
  await assert.rejects(
    practices.addMember(disabled, accountInput),
    /not enabled/,
  );
  await assert.rejects(
    practices.addMember(ctx, { ...accountInput, patientIds: [patient.id] }),
    /cannot include chart/,
  );
  intakeAccount = await practices.addMember(ctx, accountInput);
  const [[account]] = await pool.execute(
    "SELECT status FROM auricwell_accounts WHERE id=?",
    [intakeAccount.id],
  );
  assert.equal(account.status, "pending");
  await pool.execute(
    "UPDATE auricwell_accounts SET status='active',password_hash=? WHERE id=?",
    [await bcrypt.hash(password, 12), intakeAccount.id],
  );
  intakeCtx = {
    ...ctx,
    accountId: intakeAccount.id,
    actorType: "guardian",
    permissions: [],
    patientIds: [],
    billingPatientIds: [],
  };
  assert.equal((await clinical.workspace(intakeCtx)).patients.length, 0);
  await assert.rejects(intake.intakeTemplates(intakeCtx), /admin permission/);
});

test("intake assignments bind one authorized respondent, clinical reviewer and exact questionnaire version", async () => {
  const input = {
    templateId: intakeTemplate.id,
    templateRevision: intakeTemplate.revision,
    respondentAccountId: intakeAccount.id,
    reviewerAccountId: ctx.accountId,
    patientLabel: "Synthetic new client",
    capacity: "Verified legal guardian",
    authorityReviewed: true,
    authorityReference: "Synthetic authority verification",
    idempotencyKey: "assign-new-intake",
  };
  await assert.rejects(
    intake.assignIntake(ctx, { ...input, authorityReviewed: false }),
    /authority/,
  );
  intakePacket = await intake.assignIntake(ctx, input);
  assert.equal((await intake.assignIntake(ctx, input)).id, intakePacket.id);
  await assert.rejects(
    intake.assignIntake(ctx, { ...input, patientLabel: "Changed" }),
    /different details/,
  );
  await assert.rejects(
    intake.assignIntake(ctx, {
      ...input,
      idempotencyKey: "wrong-reviewer",
      reviewerAccountId: intakeAccount.id,
    }),
    /clinical reviewer/,
  );
  await assert.rejects(
    intake.assignIntake(ctx, {
      ...input,
      idempotencyKey: "ungranted-chart",
      patientId: patient.id,
    }),
    /not authorized/,
  );
  await assert.rejects(
    intake.readIntake(
      { ...intakeCtx, practiceId: otherCtx.practiceId },
      intakePacket.id,
    ),
    /not found/,
  );
  await assert.rejects(
    intake.readIntake(
      { ...intakeCtx, accountId: crypto.randomUUID() },
      intakePacket.id,
    ),
    /reviewer access/,
  );
  const administrative = { ...ctx, permissions: ["admin"] };
  const [summary] = await intake.getIntakes(administrative);
  assert.equal(summary.data.answers, undefined);
  assert.equal(summary.canReview, false);
  await assert.rejects(
    intake.readIntake(administrative, intakePacket.id),
    /reviewer access/,
  );
  const read = await intake.readIntake(intakeCtx, intakePacket.id);
  assert.equal(read.data.authorityReference, undefined);
  assert.equal(read.data.snapshot.name, "Practice intake");
  const revised = await intake.saveIntakeTemplate(
    ctx,
    {
      ...intakeTemplate.data,
      revision: intakeTemplate.revision,
      name: "Revised questionnaire",
      status: "inactive",
    },
    intakeTemplate.id,
  );
  assert.equal(revised.revision, 2);
  assert.equal(
    (await intake.readIntake(intakeCtx, intakePacket.id)).data.snapshot.name,
    "Practice intake",
  );
  await assert.rejects(
    intake.assignIntake(ctx, { ...input, idempotencyKey: "stale-template" }),
    /current active/,
  );
  assert.ok(
    (await clinical.notifications(intakeCtx)).some((r) => r.type === "intake"),
  );
});

test("intake draft, submit, correction and resubmit preserve immutable answers and reject stale reviews", async () => {
  let r = await intake.readIntake(intakeCtx, intakePacket.id);
  await intake.answerIntake(intakeCtx, r.id, {
    action: "draft",
    revision: r.revision,
    demographics: { name: "Draft only" },
    answers: { goals: "Synthetic initial goals" },
  });
  r = await intake.readIntake(intakeCtx, r.id);
  await assert.rejects(
    intake.answerIntake(intakeCtx, r.id, {
      action: "submit",
      revision: r.revision,
      demographics: { name: "Test", dob: "2000-01-01" },
      answers: {},
      reviewed: true,
    }),
    /before submitting/,
  );
  await assert.rejects(
    intake.answerIntake({ ...intakeCtx, accountId: ctx.accountId }, r.id, {
      action: "draft",
      revision: r.revision,
    }),
    /Only the assigned/,
  );
  const input = {
    action: "submit",
    revision: r.revision,
    demographics: { name: patient.data.name, dob: patient.data.dob },
    answers: { goals: "Original goals", previous_care: false },
    reviewed: true,
  };
  const first = await intake.answerIntake(intakeCtx, r.id, input);
  assert.deepEqual(await intake.answerIntake(intakeCtx, r.id, input), first);
  r = await intake.readIntake(ctx, r.id);
  const originalHash = r.data.submissionHash;
  assert.equal((await intake.intakeHistory(intakeCtx, r.id)).length, 1);
  assert.ok((await clinical.notifications(ctx)).some((n) => n.id === r.id));
  await intake.reviewIntake(ctx, r.id, {
    action: "return",
    revision: r.revision,
    submissionHash: originalHash,
    reviewed: true,
    reason: "Please clarify goals.",
  });
  r = await intake.readIntake(intakeCtx, r.id);
  assert.equal(r.data.status, "needs_changes");
  await intake.answerIntake(intakeCtx, r.id, {
    ...input,
    revision: r.revision,
    answers: { goals: "Clarified goals", previous_care: false },
  });
  r = await intake.readIntake(ctx, r.id);
  await assert.rejects(
    intake.reviewIntake(ctx, r.id, {
      action: "accept",
      revision: r.revision,
      submissionHash: originalHash,
      reviewed: true,
      reason: "Reviewed",
      matchingReviewed: true,
    }),
    /current submitted/,
  );
  const history = await intake.intakeHistory(ctx, r.id);
  assert.equal(history.length, 2);
  assert.equal(
    history.find((s) => s.data.submissionNumber === 1).data.answers.goals,
    "Original goals",
  );
  assert.equal(
    history.find((s) => s.data.submissionNumber === 2).data.answers.goals,
    "Clarified goals",
  );
});

test("concurrent intake acceptance creates one reviewed chart without granting portal or financial access", async () => {
  const beforeCharts = await list(ctx, "patient", { limit: 10000 });
  const beforeLedger = await list(ctx, "ledger", { limit: 10000 });
  const r = await intake.readIntake(ctx, intakePacket.id);
  const input = {
    action: "accept",
    revision: r.revision,
    submissionHash: r.data.submissionHash,
    reviewed: true,
    matchingReviewed: true,
    reason:
      "Identity reviewed. Explicitly create a distinct synthetic chart despite a matching name and DOB.",
  };
  await assert.rejects(
    intake.reviewIntake(ctx, r.id, { ...input, matchingReviewed: false }),
    /Review existing charts/,
  );
  const [a, b] = await Promise.all([
    intake.reviewIntake(ctx, r.id, input),
    intake.reviewIntake(ctx, r.id, input),
  ]);
  assert.equal(a.acceptedPatientId, b.acceptedPatientId);
  assert.notEqual(
    a.acceptedPatientId,
    patient.id,
    "matching names never aggregate charts automatically",
  );
  assert.equal(
    (await list(ctx, "patient", { limit: 10000 })).length,
    beforeCharts.length + 1,
  );
  assert.equal(
    (await list(ctx, "ledger", { limit: 10000 })).length,
    beforeLedger.length,
  );
  const chart = await get(ctx, "patient", a.acceptedPatientId);
  assert.equal(chart.data.intakeSubmissionId, r.data.submissionId);
  assert.deepEqual(chart.data.careTeam, [ctx.accountId]);
  assert.equal((await clinical.workspace(intakeCtx)).patients.length, 0);
  await assert.rejects(
    clinical.patientAccess(intakeCtx, chart.id),
    /do not have access/,
  );
  const [[member]] = await pool.execute(
    "SELECT patient_ids,billing_patient_ids FROM auricwell_memberships WHERE practice_id=? AND account_id=?",
    [ctx.practiceId, intakeAccount.id],
  );
  assert.deepEqual(json(member.patient_ids), []);
  assert.deepEqual(json(member.billing_patient_ids), []);
  await assert.rejects(
    intake.answerIntake(intakeCtx, r.id, {
      action: "draft",
      revision: r.revision,
      demographics: {},
      answers: {},
    }),
    /no longer editable/,
  );
  assert.equal((await intake.intakeHistory(intakeCtx, r.id)).length, 2);
});

test("accepted intake responses follow chart clinical access without granting review authority", async () => {
  const account = await practices.addMember(ctx, {
    username: `intake-clinician-${crypto.randomBytes(4).toString("hex")}`,
    name: "Synthetic care team member",
    actorType: "staff",
    permissions: ["clinical"],
  });
  await pool.execute(
    "UPDATE auricwell_accounts SET status='active',password_hash=? WHERE id=?",
    [await bcrypt.hash(password, 12), account.id],
  );
  const clinicianCtx = await context(ctx.practiceId, account, ["clinical"]);
  const accepted = await get(ctx, "intake", intakePacket.id);
  await assert.rejects(
    intake.readIntake(clinicianCtx, accepted.id),
    /do not have access/,
  );
  const chart = await get(ctx, "patient", accepted.data.acceptedPatientId);
  await repo.update(ctx, chart, {
    ...chart.data,
    careTeam: [...chart.data.careTeam, account.id],
  });
  const read = await intake.readIntake(clinicianCtx, accepted.id);
  assert.equal(read.canReview, false);
  assert.equal(read.data.answers.goals, "Clarified goals");
  assert.equal(
    (await intake.intakeHistory(clinicianCtx, accepted.id)).length,
    2,
  );
  assert.equal(
    (await intake.getIntakes(clinicianCtx)).find((r) => r.id === accepted.id)
      .canRead,
    true,
  );
  await assert.rejects(
    intake.reviewIntake(clinicianCtx, accepted.id, {
      action: "accept",
      reviewed: true,
      reason: "Unauthorized review",
    }),
    /reviewer access/,
  );
  await repo.update(ctx, await get(ctx, "patient", chart.id), chart.data);
  await assert.rejects(
    intake.intakeHistory(clinicianCtx, accepted.id),
    /do not have access/,
  );
});

test("existing-chart intakes respect revoked guardian access, preserve chart edits and cannot be reassigned on acceptance", async () => {
  const template = await intake.saveIntakeTemplate(ctx, {
    ...intakeTemplate.data,
    name: "Follow-up questionnaire",
  });
  const [[member]] = await pool.execute(
    "SELECT * FROM auricwell_memberships WHERE practice_id=? AND account_id=?",
    [ctx.practiceId, intakeAccount.id],
  );
  await pool.execute(
    "UPDATE auricwell_memberships SET patient_ids=? WHERE practice_id=? AND account_id=?",
    [JSON.stringify([patient.id]), ctx.practiceId, intakeAccount.id],
  );
  const authorized = { ...intakeCtx, patientIds: [patient.id] };
  const assignment = {
    templateId: template.id,
    templateRevision: template.revision,
    respondentAccountId: intakeAccount.id,
    reviewerAccountId: ctx.accountId,
    patientId: patient.id,
    patientLabel: "Existing chart intake",
    capacity: "Verified guardian",
    authorityReviewed: true,
    authorityReference: "Synthetic reviewed authority",
    idempotencyKey: "existing-chart-intake",
  };
  const assigned = await intake.assignIntake(ctx, assignment);
  await assert.rejects(
    intake.readIntake(intakeCtx, assigned.id),
    /reviewer access/,
  );
  await assert.rejects(
    intake.answerIntake(intakeCtx, assigned.id, {
      action: "draft",
      revision: assigned.revision,
    }),
    /Only the assigned/,
  );
  const read = await intake.readIntake(authorized, assigned.id);
  await intake.answerIntake(authorized, assigned.id, {
    action: "submit",
    revision: read.revision,
    reviewed: true,
    demographics: { name: "Different submitted name", dob: "2000-01-01" },
    answers: { goals: "Follow-up", previous_care: true },
  });
  const submitted = await intake.readIntake(ctx, assigned.id);
  const review = {
    action: "accept",
    revision: submitted.revision,
    submissionHash: submitted.data.submissionHash,
    reviewed: true,
    matchingReviewed: true,
    reason: "Reviewed against existing chart. Preserve current demographics.",
  };
  await assert.rejects(
    intake.reviewIntake(ctx, assigned.id, review),
    /must stay with that chart/,
  );
  const before = await get(ctx, "patient", patient.id);
  await intake.reviewIntake(ctx, assigned.id, {
    ...review,
    patientId: patient.id,
  });
  assert.deepEqual((await get(ctx, "patient", patient.id)).data, before.data);
  const cancelled = await intake.assignIntake(ctx, {
    ...assignment,
    idempotencyKey: "cancelled-intake",
  });
  await intake.cancelIntake(ctx, cancelled.id, {
    revision: cancelled.revision,
    reason: "Assigned in error",
  });
  await assert.rejects(
    intake.answerIntake(authorized, cancelled.id, {
      action: "draft",
      revision: cancelled.revision,
      demographics: {},
      answers: {},
    }),
    /no longer editable/,
  );
  await pool.execute(
    "UPDATE auricwell_memberships SET patient_ids=? WHERE practice_id=? AND account_id=?",
    [member.patient_ids, ctx.practiceId, intakeAccount.id],
  );
});

test("practice account creation cannot grant operator privileges or bypass pending review", async () => {
  const account = await practices.addMember(ctx, {
    username: `member-${crypto.randomBytes(4).toString("hex")}`,
    name: "Synthetic Member",
    email: "member@example.invalid",
    actorType: "staff",
    permissions: ["clinical"],
    operator: true,
    password,
  });
  const [[row]] = await pool.execute(
    "SELECT * FROM auricwell_accounts WHERE id=?",
    [account.id],
  );
  assert.equal(row.status, "pending");
  assert.equal(row.password_hash, null);
  assert.equal(
    open(row.profile, `auricwell:account:${account.id}`).operator,
    false,
  );
});

const scheduling = await import("./scheduling.js");
let seriesRequest, recurring;
test("reviewed recurring bookings keep local time, reject incomplete review and serialize duplicate requests", async () => {
  const current = await get(ctx, "provider", provider.id);
  await repo.update(ctx, current, {
    ...current.data,
    supervisionRequired: false,
    availability: [{ day: 1, start: "08:00", end: "18:00" }],
  });
  seriesRequest = {
    patientId: patient.id,
    providerId: provider.id,
    serviceCode: "90837",
    location: "Office",
    modality: "office",
    localStart: "2027-03-01T09:00",
    durationMinutes: 60,
    intervalWeeks: 1,
    count: 6,
  };
  const preview = await scheduling.previewSeries(ctx, seriesRequest);
  assert.equal(preview.issues.length, 0);
  assert.deepEqual(
    preview.visits.slice(0, 3).map((v) => v.data.start),
    [
      "2027-03-01T16:00:00.000Z",
      "2027-03-08T16:00:00.000Z",
      "2027-03-15T15:00:00.000Z",
    ],
  );
  await assert.rejects(
    scheduling.applySeries(ctx, {
      ...seriesRequest,
      previewHash: preview.previewHash,
      idempotencyKey: "recurrence",
    }),
    /Review/,
  );
  const body = {
    ...seriesRequest,
    reviewed: true,
    previewHash: preview.previewHash,
    idempotencyKey: "recurrence",
  };
  const result = await Promise.all([
    scheduling.applySeries(ctx, body),
    scheduling.applySeries(ctx, body),
  ]);
  assert.deepEqual(result[0], result[1]);
  recurring = result[0];
  assert.equal(
    (await list(ctx, "appointment")).filter(
      (a) => a.data.seriesId === recurring.seriesId,
    ).length,
    6,
  );
  await assert.rejects(
    scheduling.applySeries(ctx, { ...body, count: 7 }),
    /identifier/,
  );
  await assert.rejects(
    scheduling.previewSeries(
      { ...ctx, actorType: "guardian", permissions: [] },
      seriesRequest,
    ),
    (e) => e.status === 403,
  );
  const [[foreign]] = await pool.execute(
    "SELECT settings FROM auricwell_practices WHERE id=?",
    [otherCtx.practiceId],
  );
  try {
    await pool.execute("UPDATE auricwell_practices SET settings=? WHERE id=?", [
      seal(ctx.settings, `auricwell:practice:${otherCtx.practiceId}`),
      otherCtx.practiceId,
    ]);
    await pool.execute(
      "UPDATE auricwell_accounts SET status='active' WHERE id=?",
      [otherCtx.accountId],
    );
    await assert.rejects(
      scheduling.previewSeries(
        { ...otherCtx, settings: ctx.settings },
        seriesRequest,
      ),
      (e) => e.status === 404,
    );
  } finally {
    await pool.execute("UPDATE auricwell_practices SET settings=? WHERE id=?", [
      foreign.settings,
      otherCtx.practiceId,
    ]);
    await pool.execute(
      "UPDATE auricwell_accounts SET status='pending' WHERE id=?",
      [otherCtx.accountId],
    );
  }
});

test("series validation rejects later conflicts, changed credentials, unavailable times and inactive accounts without partial writes", async () => {
  const input = { ...seriesRequest, localStart: "2027-02-22T09:00", count: 3 };
  const before = (await list(ctx, "appointment")).length;
  const conflict = await scheduling.previewSeries(ctx, input);
  assert.equal(conflict.issues.length, 2);
  await assert.rejects(
    scheduling.applySeries(ctx, {
      ...input,
      reviewed: true,
      previewHash: conflict.previewHash,
      idempotencyKey: "conflict",
    }),
    /Resolve/,
  );
  assert.equal((await list(ctx, "appointment")).length, before);
  const available = {
    ...seriesRequest,
    localStart: "2027-05-03T09:00",
    count: 2,
  };
  const preview = await scheduling.previewSeries(ctx, available);
  const original = await get(ctx, "provider", provider.id);
  try {
    await repo.update(ctx, original, {
      ...original.data,
      name: "Reviewed name change",
    });
    await assert.rejects(
      scheduling.applySeries(ctx, {
        ...available,
        reviewed: true,
        previewHash: preview.previewHash,
        idempotencyKey: "changed-provider",
      }),
      /changed/,
    );
    for (const patch of [
      { status: "inactive" },
      { credentialsReviewed: false },
      { services: [] },
      { licenseExpires: "2027-05-01" },
      { supervisionRequired: true, supervisorAccountId: ctx.accountId },
    ]) {
      await repo.update(ctx, await get(ctx, "provider", provider.id), {
        ...original.data,
        ...patch,
      });
      assert.equal(
        (await scheduling.previewSeries(ctx, available)).issues.length,
        2,
      );
    }
    await repo.update(
      ctx,
      await get(ctx, "provider", provider.id),
      original.data,
    );
    assert.equal(
      (
        await scheduling.previewSeries(ctx, {
          ...available,
          localStart: "2027-05-03T19:00",
        })
      ).issues.length,
      2,
    );
    await pool.execute(
      "UPDATE auricwell_accounts SET status='pending' WHERE id=?",
      [ctx.accountId],
    );
    await assert.rejects(
      scheduling.previewSeries(ctx, available),
      /Active practice/,
    );
  } finally {
    await pool.execute(
      "UPDATE auricwell_accounts SET status='active' WHERE id=?",
      [ctx.accountId],
    );
    await repo.update(
      ctx,
      await get(ctx, "provider", provider.id),
      original.data,
    );
  }
});

test("future series changes preserve completed, documented, claimed and individual visits; stale previews fail", async () => {
  const records = await Promise.all(
    recurring.appointmentIds.map((id) => get(ctx, "appointment", id)),
  );
  await clinical.saveAppointment(
    ctx,
    {
      ...records[0].data,
      revision: records[0].revision,
      sharedFingerprint: records[0].sharedFingerprint,
      status: "completed",
    },
    records[0].id,
  );
  const draft = await clinical.saveNote(ctx, {
    patientId: patient.id,
    appointmentId: records[1].id,
    serviceDate: "2027-03-08",
    type: "Progress note",
    title: "Synthetic recurring visit",
    content: "Draft awaiting care.",
    serviceCode: "90837",
    billable: true,
  });
  await create(
    ctx,
    "claim",
    { appointmentId: records[2].id, status: "draft" },
    { patientId: patient.id },
  );
  await clinical.saveAppointment(
    ctx,
    {
      ...records[3].data,
      revision: records[3].revision,
      sharedFingerprint: records[3].sharedFingerprint,
      localStart: "2027-03-22T10:00",
      durationMinutes: 60,
    },
    records[3].id,
  );
  const request = {
    ...seriesRequest,
    action: "reschedule",
    fromAppointmentId: records[0].id,
    localStart: "2027-03-01T11:00",
  };
  const preview = await scheduling.previewSeries(ctx, request);
  assert.equal(preview.visits.length, 2);
  assert.equal(preview.skipped.length, 4);
  assert.equal(preview.issues.length, 0);
  assert.equal(preview.visits[0].data.start, "2027-03-29T17:00:00.000Z");
  const before = await Promise.all(
    records.slice(0, 4).map((r) => get(ctx, "appointment", r.id)),
  );
  await scheduling.applySeries(ctx, {
    ...request,
    reviewed: true,
    previewHash: preview.previewHash,
    idempotencyKey: "rescheduled",
  });
  assert.deepEqual(
    await Promise.all(
      records.slice(0, 4).map((r) => get(ctx, "appointment", r.id)),
    ),
    before,
  );
  await assert.rejects(
    clinical.saveAppointment(
      ctx,
      {
        ...records[1].data,
        revision: records[1].revision,
        sharedFingerprint: records[1].sharedFingerprint,
        localStart: "2027-03-08T12:00",
        durationMinutes: 60,
      },
      records[1].id,
    ),
    /clinical linkage/,
  );
  await assert.rejects(
    clinical.saveAppointment(
      ctx,
      {
        ...records[1].data,
        revision: records[1].revision,
        sharedFingerprint: records[1].sharedFingerprint,
        status: "cancelled", reason: "Synthetic family request",
      },
      records[1].id,
    ),
    /clinical linkage/,
  );
  assert.equal((await get(ctx, "note", draft.id)).revision, 1);
  const cancel = { action: "cancel", reason: "Synthetic family request", fromAppointmentId: records[0].id };
  const stale = await scheduling.previewSeries(ctx, cancel);
  const last = await get(ctx, "appointment", records[5].id);
  await clinical.saveAppointment(
    ctx,
    {
      ...last.data,
      revision: last.revision,
      sharedFingerprint: last.sharedFingerprint,
      status: "confirmed",
    },
    last.id,
  );
  await assert.rejects(
    scheduling.applySeries(ctx, {
      ...cancel,
      reviewed: true,
      previewHash: stale.previewHash,
      idempotencyKey: "stale-cancel",
    }),
    /changed/,
  );
  const fresh = await scheduling.previewSeries(ctx, cancel);
  assert.equal(fresh.visits.length, 1);
  assert.equal(fresh.skipped.length, 5);
  const currentProvider = await get(ctx, "provider", provider.id);
  try {
    await repo.update(ctx, currentProvider, {
      ...currentProvider.data,
      status: "inactive",
    });
    const result = await scheduling.applySeries(ctx, {
      ...cancel,
      reviewed: true,
      previewHash: fresh.previewHash,
      idempotencyKey: "cancelled-future",
    });
    assert.deepEqual(result.appointmentIds, [records[4].id]);
    assert.equal(
      (await get(ctx, "appointment", records[4].id)).data.status,
      "cancelled",
    );
    // Inactive historical providers must not trap an administrator in an uncancellable booking.
    const separate = await get(ctx, "appointment", records[5].id);
    await clinical.saveAppointment(
      ctx,
      {
        ...separate.data,
        revision: separate.revision,
        sharedFingerprint: separate.sharedFingerprint,
        status: "cancelled", reason: "Synthetic family request",
      },
      separate.id,
    );
  } finally {
    await repo.update(
      ctx,
      await get(ctx, "provider", provider.id),
      currentProvider.data,
    );
  }
  assert.ok(
    (await list(ctx, "appointment_change")).some(
      (r) => r.data.reason === "Synthetic family request",
    ),
  );
});

test("late note creation invalidates a series preview, while past visits remain preserved", async () => {
  const input = { ...seriesRequest, localStart: "2027-06-07T09:00", count: 2 };
  const preview = await scheduling.previewSeries(ctx, input);
  const result = await scheduling.applySeries(ctx, {
    ...input,
    reviewed: true,
    previewHash: preview.previewHash,
    idempotencyKey: "late-note-series",
  });
  const request = {
    ...input,
    action: "reschedule",
    fromAppointmentId: result.appointmentIds[0],
    localStart: "2027-06-07T10:00",
  };
  const changing = await scheduling.previewSeries(ctx, request);
  await clinical.saveNote(ctx, {
    patientId: patient.id,
    appointmentId: result.appointmentIds[1],
    serviceDate: "2027-06-14",
    type: "Progress note",
    title: "Documentation protects linkage",
    content: "Synthetic draft.",
    serviceCode: "90837",
    billable: true,
  });
  await assert.rejects(
    scheduling.applySeries(ctx, {
      ...request,
      reviewed: true,
      previewHash: changing.previewHash,
      idempotencyKey: "late-note-change",
    }),
    /changed/,
  );
  const first = await get(ctx, "appointment", result.appointmentIds[0]);
  await repo.update(ctx, first, {
    ...first.data,
    start: "2020-01-01T16:00:00.000Z",
    end: "2020-01-01T17:00:00.000Z",
  });
  const cancellation = await scheduling.previewSeries(ctx, {
    action: "cancel", reason: "Synthetic family request",
    fromAppointmentId: first.id,
  });
  assert.equal(cancellation.visits.length, 0);
  assert.ok(cancellation.skipped.some((s) => s.reason === "Past appointment"));
});

test("conflict checks scan beyond one database page and normalize imported timezone offsets", async () => {
  const ids = Array.from({ length: 501 }, () => crypto.randomUUID());
  ids.push("ffffffff-ffff-4fff-afff-ffffffffffff");
  const rows = ids.map((id, i) => {
    const data = {
      patientId: patient.id,
      providerId: provider.id,
      providerAccountId: ctx.accountId,
      serviceCode: "90837",
      location: "Office",
      modality: "office",
      status: i === 501 ? "scheduled" : "cancelled",
      start: i === 501 ? "2027-08-09T08:30:00-06:00" : "2020-01-01T16:00:00Z",
      end: i === 501 ? "2027-08-09T09:30:00-06:00" : "2020-01-01T17:00:00Z",
    };
    return [
      id,
      ctx.practiceId,
      "appointment",
      patient.id,
      seal(data, `auricwell:${ctx.practiceId}:appointment:${id}`),
    ];
  });
  await pool.query(
    "INSERT INTO auricwell_records(id,practice_id,kind,patient_id,payload) VALUES ?",
    [rows],
  );
  try {
    const input = {
      ...seriesRequest,
      localStart: "2027-08-02T09:00",
      count: 2,
    };
    const preview = await scheduling.previewSeries(ctx, input);
    assert.equal(preview.issues.length, 1);
    assert.equal(preview.issues[0].sequence, 1);
    await assert.rejects(
      clinical.saveAppointment(ctx, {
        ...input,
        localStart: "2027-08-09T09:00",
      }),
      /already has an appointment/,
    );
    const originalProvider = await get(ctx, "provider", provider.id);
    try {
      await repo.update(ctx, originalProvider, {
        ...originalProvider.data,
        status: "inactive",
      });
      const imported = await get(ctx, "appointment", ids.at(-1));
      await assert.rejects(
        clinical.saveAppointment(
          ctx,
          {
            ...imported.data,
            revision: imported.revision,
            status: "cancelled", reason: "Synthetic family request",
          },
          imported.id,
        ),
        /prototype appointment/,
      );
      assert.equal(
        (await get(ctx, "appointment", imported.id)).data.status,
        "scheduled",
      );
    } finally {
      await repo.update(
        ctx,
        await get(ctx, "provider", provider.id),
        originalProvider.data,
      );
    }
  } finally {
    await pool.query(
      "DELETE FROM auricwell_records WHERE practice_id=? AND id IN (?)",
      [ctx.practiceId, ids],
    );
  }
});

const { default: SharedClient } = await import("../../models/Client.model.js");
const { default: SharedAgency } = await import("../../models/Agency.model.js");
const sharedCharts = await import("../clientChart.service.js");
const consolidation = await import("./consolidation.js");

test("AuricWell uses the shared organization and client model; edits are visible in both directions without duplicate demographics", async () => {
  const [[mapped]] = await pool.execute(
    "SELECT agency_id FROM auricwell_practices WHERE id=?",
    [ctx.practiceId],
  );
  assert.equal(mapped.agency_id, practice.agencyId);
  const [[agency]] = await pool.execute("SELECT * FROM agencies WHERE id=?", [
    mapped.agency_id,
  ]);
  assert.equal(agency.organization_type, "clinical");
  assert.equal(agency.is_active, 0); // No implicit full-suite activation during consolidation.
  const before = await get(ctx, "patient", patient.id);
  assert.ok(before.canonicalClientId);
  const raw = await SharedClient.findForAgency(
    before.canonicalClientId,
    mapped.agency_id,
  );
  assert.equal(raw.full_name, before.data.name);
  const [[binding]] = await pool.execute(
    "SELECT * FROM auricwell_records WHERE id=?",
    [patient.id],
  );
  const metadata = open(
    binding.payload,
    `auricwell:${ctx.practiceId}:patient:${patient.id}`,
  );
  for (const key of ["name", "dob", "phone", "email", "address", "status"])
    assert.equal(key in metadata, false);
  await SharedClient.update(
    before.canonicalClientId,
    { full_name: "Shared model edit", status: "ON_HOLD", initials: "KEEP" },
    null,
    { hydrate: false, agencyId: mapped.agency_id },
  );
  const seen = await get(ctx, "patient", patient.id);
  assert.equal(seen.data.name, "Shared model edit");
  assert.equal(seen.data.status, "waitlist");
  await assert.rejects(
    clinical.savePatient(
      ctx,
      {
        ...before.data,
        revision: before.revision,
        sharedFingerprint: before.sharedFingerprint,
      },
      before.id,
    ),
    /shared backend/,
  );
  await assert.rejects(
    repo.update(ctx, before, {
      ...before.data,
      email: "stale@example.invalid",
    }),
    /shared backend/,
  );
  const changed = await clinical.savePatient(
    ctx,
    {
      ...seen.data,
      name: "AuricWell shared edit",
      revision: seen.revision,
      sharedFingerprint: seen.sharedFingerprint,
    },
    seen.id,
  );
  const shared = await SharedClient.findForAgency(
    changed.canonicalClientId,
    mapped.agency_id,
  );
  assert.equal(shared.full_name, "AuricWell shared edit");
  assert.equal(shared.status, "ON_HOLD"); // Preserve the richer shared status if its displayed category did not change.
  await repo.update(ctx, changed, {
    ...changed.data,
    insurance: { reviewed: true },
  });
  const untouched = await SharedClient.findForAgency(
    changed.canonicalClientId,
    mapped.agency_id,
  );
  assert.deepEqual(untouched, shared);
  assert.equal(
    await SharedClient.findForAgency(changed.canonicalClientId, -1),
    null,
  );
  await assert.rejects(
    sharedCharts.readClientChart(
      otherCtx.practiceId,
      changed.canonicalClientId,
      pool,
    ),
    /organization/,
  );
});

test("shared chart creation and product links are atomic; canonical ownership is checked independently of caller hints", async () => {
  const data = {
    name: "Atomic shared chart",
    dob: "2001-01-01",
    phone: "(303) 555-0100",
    email: "",
    address: "",
    status: "active",
    careTeam: [],
  };
  const first = await create(ctx, "patient", data, {
    sourceKey: "shared-atomic",
  });
  assert.equal(first.data.phone, "+13035550100");
  const [[before]] = await pool.execute("SELECT COUNT(*) n FROM clients");
  await assert.rejects(
    create(ctx, "patient", data, { sourceKey: "shared-atomic" }),
    (e) => e.code === "ER_DUP_ENTRY",
  );
  const [[after]] = await pool.execute("SELECT COUNT(*) n FROM clients");
  assert.equal(before.n, after.n);
  const foreign = await create(otherCtx, "patient", data);
  assert.notEqual(first.canonicalClientId, foreign.canonicalClientId);
  assert.equal(
    (
      await get(
        { ...ctx, agencyId: foreign.canonicalClientId },
        "patient",
        first.id,
      )
    ).canonicalClientId,
    first.canonicalClientId,
  );
  await pool.execute(
    "UPDATE auricwell_records SET canonical_client_id=? WHERE id=?",
    [foreign.canonicalClientId, first.id],
  );
  try {
    await assert.rejects(
      get(ctx, "patient", first.id),
      /not found in this practice/,
    );
  } finally {
    await pool.execute(
      "UPDATE auricwell_records SET canonical_client_id=? WHERE id=?",
      [first.canonicalClientId, first.id],
    );
  }
});

async function prototypePractice(
  name,
  slug = `prototype-${crypto.randomBytes(5).toString("hex")}`,
) {
  const id = crypto.randomUUID();
  await pool.execute(
    "INSERT INTO auricwell_practices(id,slug,name,settings) VALUES(?,?,?,?)",
    [id, slug, name, seal(ctx.settings, `auricwell:practice:${id}`)],
  );
  await pool.execute(
    "INSERT INTO auricwell_memberships(practice_id,account_id,permissions,patient_ids) VALUES(?,?,?,?)",
    [id, operator.id, JSON.stringify(["admin", "migration"]), "[]"],
  );
  const legacyCtx = await context(id, operator, ["admin", "migration"]);
  const chartId = crypto.randomUUID();
  const data = {
    name: "Retained Prototype Patient",
    dob: "2002-02-02",
    phone: "",
    email: "old@example.invalid",
    address: "",
    status: "active",
    careTeam: [],
    sourceId: "original-source-id",
  };
  await pool.execute(
    "INSERT INTO auricwell_records(id,practice_id,kind,payload) VALUES(?,?,'patient',?)",
    [chartId, id, seal(data, `auricwell:${id}:patient:${chartId}`)],
  );
  return { ctx: legacyCtx, chartId, data };
}

test("reviewed prototype consolidation preserves chart IDs, historical snapshots and references and applies once", async () => {
  const old = await prototypePractice("Prototype");
  const original = await get(old.ctx, "patient", old.chartId);
  assert.equal(original.data.name, old.data.name); // Existing care remains readable.
  await assert.rejects(
    repo.update(old.ctx, original, {
      ...original.data,
      name: "Not yet connected",
    }),
    /consolidation/,
  );
  const linked = await create(
    old.ctx,
    "note",
    { content: "Historical clinical evidence", source: "therapynotes" },
    { patientId: old.chartId },
  );
  const preview = await consolidation.previewConsolidation(old.ctx);
  assert.equal(preview.charts.length, 1);
  assert.equal(preview.createOrganization, true);
  assert.equal(preview.issues.length, 0);
  await assert.rejects(
    consolidation.applyConsolidation(old.ctx, {
      previewHash: preview.previewHash,
      idempotencyKey: "unreviewed",
    }),
    /Review/,
  );
  await assert.rejects(
    consolidation.previewConsolidation({ ...old.ctx, profile: {} }),
    /operator/,
  );
  const command = {
    reviewed: true,
    previewHash: preview.previewHash,
    idempotencyKey: "shared-connect",
  };
  const [a, b] = await Promise.all([
    consolidation.applyConsolidation(old.ctx, command),
    consolidation.applyConsolidation(old.ctx, command),
  ]);
  assert.deepEqual(a, b);
  assert.equal(a.remaining, 0);
  const result = await get(old.ctx, "patient", old.chartId);
  assert.equal(result.id, old.chartId);
  assert.equal(result.canonicalClientId, a.connected[0].clientId);
  assert.equal((await get(old.ctx, "note", linked.id)).patientId, old.chartId);
  assert.deepEqual(
    (await list(old.ctx, "consolidation_archive"))[0].data.original,
    old.data,
  );
  assert.equal(
    (await consolidation.previewConsolidation(old.ctx)).pendingCount,
    0,
  );
  await assert.rejects(
    consolidation.applyConsolidation(old.ctx, { ...command, agencyId: 999 }),
    /identifier/,
  );
});

test("explicit links preserve existing shared charts, reject stale previews and never infer identity from matching names", async () => {
  const agency = await SharedAgency.createClinicalPractice({
    name: "Existing shared practice",
    slug: `existing-${crypto.randomBytes(5).toString("hex")}`,
  });
  const target = await repo.transaction((db) =>
    sharedCharts.createClientChart(
      agency.id,
      {
        name: "Retained Prototype Patient",
        dob: "2002-02-02",
        phone: "",
        email: "canonical@example.invalid",
        address: "",
        status: "active",
      },
      db,
    ),
  );
  const old = await prototypePractice("Explicit link", agency.slug);
  await assert.rejects(
    consolidation.previewConsolidation(old.ctx),
    /not be matched automatically/,
  );
  const possible = await consolidation.previewConsolidation(old.ctx, {
    agencyId: agency.id,
  });
  assert.equal(possible.issues.length, 1);
  assert.equal(possible.charts[0].candidates[0].id, target.row.id);
  const request = {
    agencyId: agency.id,
    mappings: [{ patientId: old.chartId, clientId: target.row.id }],
  };
  const preview = await consolidation.previewConsolidation(old.ctx, request);
  assert.equal(preview.charts[0].target.email, "canonical@example.invalid");
  await SharedClient.update(
    target.row.id,
    { full_name: "Shared chart changed during review" },
    null,
    { hydrate: false, agencyId: agency.id },
  );
  await assert.rejects(
    consolidation.applyConsolidation(old.ctx, {
      ...request,
      reviewed: true,
      previewHash: preview.previewHash,
      idempotencyKey: "stale",
    }),
    /changed/,
  );
  const fresh = await consolidation.previewConsolidation(old.ctx, request);
  const before = await SharedClient.findForAgency(target.row.id, agency.id);
  await consolidation.applyConsolidation(old.ctx, {
    ...request,
    reviewed: true,
    previewHash: fresh.previewHash,
    idempotencyKey: "link",
  });
  assert.deepEqual(
    await SharedClient.findForAgency(target.row.id, agency.id),
    before,
  );
  assert.equal(
    (await get(old.ctx, "patient", old.chartId)).data.name,
    before.full_name,
  );
  assert.equal(
    (await get(old.ctx, "patient", old.chartId)).data.email,
    "canonical@example.invalid",
  );
  await assert.rejects(
    consolidation.previewConsolidation(old.ctx, {
      agencyId: practice.agencyId,
    }),
    /already has a shared organization/,
  );
});

test("patient-import rollback preserves shared charts and later full-suite edits without terminating the client", async () => {
  const bytes = Buffer.from(
    "sourceId,name,dob\nshared-rollback,Shared Rollback Patient,2000-03-03\n",
  );
  let batch = await imports.beginUpload(ctx, {
    type: "patients",
    filename: "shared-rollback.csv",
    size: bytes.length,
    sha256: hash(bytes),
  });
  await imports.putChunk(ctx, batch.id, 0, bytes.toString("base64"));
  await imports.finishUpload(ctx, batch.id);
  await imports.parseBatch(ctx, batch.id);
  batch = await imports.applyImport(ctx, batch.id, {
    reviewed: true,
    decisions: [{ key: "0" }],
  });
  assert.equal(batch.data.issues.length, 0);
  const ref = batch.data.applied[0].references[0];
  const chart = await get(ctx, "patient", ref.id);
  await SharedClient.update(
    chart.canonicalClientId,
    { email: "later-change@example.invalid" },
    null,
    { hydrate: false, agencyId: practice.agencyId },
  );
  batch = await imports.rollbackImport(ctx, batch.id, {
    reviewed: true,
    reason: "Synthetic import review",
  });
  assert.equal(batch.data.rollback.withdrawn.length, 0);
  assert.equal(batch.data.rollback.preserved[0].id, chart.id);
  const current = await get(ctx, "patient", chart.id);
  assert.equal(current.data.email, "later-change@example.invalid");
  assert.equal(current.data.status, "active");
});

const staffConnections = await import("./staffConnections.js");
async function sharedStaffFixture() {
  const suffix = crypto.randomBytes(5).toString("hex");
  const practice = await practices.provisionPractice(
    { accountId: operator.id, profile: operator.profile },
    {
      slug: `staff-${suffix}`,
      name: "Shared staff practice",
      ownerUsername: `staff-${suffix}`,
      ownerName: "Prototype Name",
      ownerEmail: `staff-${suffix}@example.invalid`,
    },
  );
  const owner = await context(practice.id, { id: practice.ownerAccountId }, [
    "admin",
    "clinical",
    "schedule",
    "billing",
    "supervise",
  ]);
  const admin = await context(practice.id, operator, ["admin", "migration"]);
  // Simulate an account created before shared staff provisioning existed.
  await pool.execute(
    "UPDATE auricwell_accounts SET canonical_user_id=NULL WHERE id=?",
    [practice.ownerAccountId],
  );
  const [insert] = await pool.execute(
    "INSERT INTO users (email,password_hash,role,first_name,last_name,credential) VALUES (?,?,'provider','Shared','Clinician','LPC')",
    [`canonical-${suffix}@example.invalid`, "unusable-synthetic-password"],
  );
  const userId = insert.insertId;
  await pool.execute(
    "INSERT INTO user_agencies (user_id,agency_id) VALUES (?,?)",
    [userId, practice.agencyId],
  );
  const provider = await clinical.saveProvider(owner, {
    accountId: owner.accountId,
    name: "Prototype Name",
    credential: "LPC",
    license: "SYNTHETIC",
    jurisdiction: "CO",
    status: "active",
    credentialsReviewed: true,
    services: ["90837"],
    locations: ["Office"],
  });
  return { practice, owner, admin, userId, provider };
}
async function connectFixture(f, key = crypto.randomUUID()) {
  const review = await staffConnections.previewStaffConnection(
    f.admin,
    f.owner.accountId,
    { userId: f.userId },
  );
  const input = {
    userId: f.userId,
    previewHash: review.previewHash,
    reviewed: true,
    idempotencyKey: key,
  };
  const result = await staffConnections.connectStaffIdentity(
    f.admin,
    f.owner.accountId,
    input,
  );
  return { review, input, result };
}

test("reviewed shared staff connections preserve credentials, permissions and historical IDs; names follow shared users", async () => {
  const f = await sharedStaffFixture();
  const [[beforeUser]] = await pool.execute("SELECT * FROM users WHERE id=?", [
    f.userId,
  ]);
  const [[beforeAccount]] = await pool.execute(
    "SELECT * FROM auricwell_accounts WHERE id=?",
    [f.owner.accountId],
  );
  const [[beforeMembership]] = await pool.execute(
    "SELECT * FROM auricwell_memberships WHERE practice_id=? AND account_id=?",
    [f.practice.id, f.owner.accountId],
  );
  const linked = await connectFixture(f);
  assert.equal(linked.result.canonicalUserId, f.userId);
  const [[afterUser]] = await pool.execute("SELECT * FROM users WHERE id=?", [
    f.userId,
  ]);
  const [[afterAccount]] = await pool.execute(
    "SELECT * FROM auricwell_accounts WHERE id=?",
    [f.owner.accountId],
  );
  const [[afterMembership]] = await pool.execute(
    "SELECT * FROM auricwell_memberships WHERE practice_id=? AND account_id=?",
    [f.practice.id, f.owner.accountId],
  );
  assert.deepEqual(afterUser, beforeUser);
  assert.deepEqual(afterMembership, beforeMembership);
  assert.deepEqual({ ...afterAccount, canonical_user_id: null }, beforeAccount);
  const deniedLogin = await auth.login(beforeAccount.username, password);
  assert.equal(deniedLogin.error.status, 401);
  assert.equal(deniedLogin.token, undefined);
  const current = await get(f.owner, "provider", f.provider.id);
  assert.equal(current.id, f.provider.id);
  assert.equal(current.canonicalUserId, f.userId);
  assert.equal(current.data.name, "Shared Clinician");
  assert.equal(current.data.credentialsReviewed, false);
  assert.equal(providerEligible(current), false);
  const [[raw]] = await pool.execute(
    "SELECT * FROM auricwell_records WHERE id=?",
    [current.id],
  );
  assert.equal(Object.hasOwn(repo.decode(raw).data, "name"), false);
  const archives = await list(f.owner, "staff_identity_archive");
  assert.equal(archives[0].data.original.name, "Prototype Name");
  await pool.execute("UPDATE users SET first_name='Updated' WHERE id=?", [
    f.userId,
  ]);
  assert.equal(
    (await get(f.owner, "provider", current.id)).data.name,
    "Updated Clinician",
  );
  assert.equal(
    (await list(f.owner, "provider"))[0].data.name,
    "Updated Clinician",
  );
});

test("shared staff review rejects foreign practices, forged agency hints, portal identities and unprivileged callers", async () => {
  const f = await sharedStaffFixture();
  await assert.rejects(
    staffConnections.previewStaffConnection(f.owner, f.owner.accountId, {
      userId: f.userId,
    }),
    /operator/,
  );
  await assert.rejects(
    staffConnections.previewStaffConnection(
      { ...f.admin, agencyId: practice.agencyId },
      f.owner.accountId,
      {
        userId: (
          await pool.execute(
            "SELECT canonical_user_id FROM auricwell_accounts WHERE id=?",
            [ctx.accountId],
          )
        )[0][0].canonical_user_id,
      },
    ),
    /unavailable in this practice/,
  );
  await assert.rejects(
    staffConnections.previewStaffConnection(f.admin, operator.id, {
      userId: f.userId,
    }),
    /operator accounts/,
  );
  await pool.execute("UPDATE users SET role='client' WHERE id=?", [f.userId]);
  await assert.rejects(
    staffConnections.previewStaffConnection(f.admin, f.owner.accountId, {
      userId: f.userId,
    }),
    /unavailable/,
  );
  await pool.execute("UPDATE users SET role='provider' WHERE id=?", [f.userId]);
  await pool.execute(
    "UPDATE auricwell_memberships SET actor_type='guardian' WHERE practice_id=? AND account_id=?",
    [f.practice.id, f.owner.accountId],
  );
  await assert.rejects(
    staffConnections.previewStaffConnection(f.admin, f.owner.accountId, {
      userId: f.userId,
    }),
    /Staff account unavailable/,
  );
  await pool.execute(
    "UPDATE auricwell_memberships SET status='inactive' WHERE practice_id=? AND account_id=?",
    [f.practice.id, operator.id],
  );
  await assert.rejects(
    staffConnections.previewStaffConnection(f.admin, f.owner.accountId, {
      userId: f.userId,
    }),
    /Active practice administration/,
  );
});

test("staff connection previews detect changes, retries are idempotent, and links cannot be reassigned or duplicated", async () => {
  const f = await sharedStaffFixture();
  const old = await staffConnections.previewStaffConnection(
    f.admin,
    f.owner.accountId,
    { userId: f.userId },
  );
  await pool.execute("UPDATE users SET credential='LPCC' WHERE id=?", [
    f.userId,
  ]);
  await assert.rejects(
    staffConnections.connectStaffIdentity(f.admin, f.owner.accountId, {
      userId: f.userId,
      previewHash: old.previewHash,
      reviewed: true,
      idempotencyKey: "stale",
    }),
    /changed/,
  );
  const [[unchanged]] = await pool.execute(
    "SELECT canonical_user_id FROM auricwell_accounts WHERE id=?",
    [f.owner.accountId],
  );
  assert.equal(unchanged.canonical_user_id, null);
  const connected = await connectFixture(f);
  assert.deepEqual(
    await staffConnections.connectStaffIdentity(
      f.admin,
      f.owner.accountId,
      connected.input,
    ),
    connected.result,
  );
  await assert.rejects(
    staffConnections.connectStaffIdentity(f.admin, f.owner.accountId, {
      ...connected.input,
      userId: f.userId + 1,
    }),
    /already been used/,
  );
  await assert.rejects(
    staffConnections.previewStaffConnection(f.admin, f.owner.accountId, {
      userId: f.userId,
    }),
    /cannot be reassigned/,
  );
  const duplicate = await practices.addMember(f.owner, {
    username: `duplicate-${crypto.randomUUID().slice(0, 8)}`,
    name: "Same Name",
    email: "duplicate@example.invalid",
    permissions: ["clinical"],
  });
  await pool.execute(
    "UPDATE auricwell_accounts SET canonical_user_id=NULL WHERE id=?",
    [duplicate.id],
  );
  await assert.rejects(
    staffConnections.previewStaffConnection(f.admin, duplicate.id, {
      userId: f.userId,
    }),
    /already has an AuricWell account/,
  );
  await assert.rejects(
    clinical.saveProvider(
      f.owner,
      {
        ...f.provider.data,
        accountId: duplicate.id,
        revision: f.provider.revision,
      },
      f.provider.id,
    ),
    /cannot be reassigned/,
  );
});

test("shared staff changes invalidate stale edits and credential review; inactive and removed memberships fail provider eligibility", async () => {
  const f = await sharedStaffFixture();
  await pool.execute(
    "UPDATE auricwell_accounts SET status='active' WHERE id=?",
    [f.owner.accountId],
  );
  await connectFixture(f);
  let current = await get(f.owner, "provider", f.provider.id);
  await assert.rejects(
    clinical.saveProvider(
      f.owner,
      {
        ...current.data,
        revision: current.revision,
        credentialsReviewed: true,
      },
      current.id,
    ),
    /shared staff identity changed/,
  );
  current = await clinical.saveProvider(
    f.owner,
    {
      ...current.data,
      revision: current.revision,
      sharedFingerprint: current.sharedFingerprint,
      credentialsReviewed: true,
    },
    current.id,
  );
  assert.equal(providerEligible(current, { service: "90837" }), true);
  await pool.execute("UPDATE users SET credential='LPCC' WHERE id=?", [
    f.userId,
  ]);
  assert.equal(
    providerEligible(await get(f.owner, "provider", current.id)),
    false,
  );
  await assert.rejects(
    clinical.saveProvider(
      f.owner,
      {
        ...current.data,
        revision: current.revision,
        sharedFingerprint: current.sharedFingerprint,
      },
      current.id,
    ),
    /shared staff identity changed/,
  );
  current = await get(f.owner, "provider", current.id);
  current = await clinical.saveProvider(
    f.owner,
    {
      ...current.data,
      revision: current.revision,
      sharedFingerprint: current.sharedFingerprint,
      credential: "LPCC",
      supervisionRequired: true,
      supervisorAccountId: operator.id,
    },
    current.id,
  );
  await pool.execute(
    "UPDATE user_agencies SET is_active=FALSE WHERE agency_id=? AND user_id=?",
    [f.practice.agencyId, f.userId],
  );
  assert.equal(
    providerEligible(await get(f.owner, "provider", current.id)),
    false,
  );
  await pool.execute(
    "DELETE FROM user_agencies WHERE agency_id=? AND user_id=?",
    [f.practice.agencyId, f.userId],
  );
  const unavailable = await get(f.owner, "provider", current.id);
  assert.equal(unavailable.data.name, "Unavailable staff identity");
  assert.equal(unavailable.sharedFingerprint, null);
  assert.equal(providerEligible(unavailable), false);
  await assert.rejects(
    clinical.saveProvider(
      f.owner,
      {
        ...unavailable.data,
        revision: unavailable.revision,
        sharedFingerprint: null,
      },
      current.id,
    ),
    /no longer available/,
  );
});

test("shared provider revocation blocks scheduling, Note Aid and note signing while retaining history", async () => {
  const f = await sharedStaffFixture();
  await pool.execute(
    "UPDATE auricwell_accounts SET status='active' WHERE id=?",
    [f.owner.accountId],
  );
  const settings = {
    ...ctx.settings,
    services: [
      { code: "90837", name: "Therapy", active: true, feeCents: 12000 },
    ],
    locations: ["Office"],
  };
  await pool.execute("UPDATE auricwell_practices SET settings=? WHERE id=?", [
    seal(settings, `auricwell:practice:${f.practice.id}`),
    f.practice.id,
  ]);
  f.owner = await context(
    f.practice.id,
    { id: f.owner.accountId },
    f.owner.permissions,
  );
  await connectFixture(f);
  let provider = await get(f.owner, "provider", f.provider.id);
  provider = await clinical.saveProvider(
    f.owner,
    {
      ...provider.data,
      credentialsReviewed: true,
      revision: provider.revision,
      sharedFingerprint: provider.sharedFingerprint,
    },
    provider.id,
  );
  const chart = await clinical.savePatient(f.owner, {
    name: "Shared Staff Synthetic Patient",
    dob: "2000-01-01",
  });
  const input = {
    patientId: chart.id,
    providerId: provider.id,
    start: "2026-10-05T16:00:00Z",
    end: "2026-10-05T17:00:00Z",
    serviceCode: "90837",
    location: "Office",
    modality: "office",
    status: "scheduled",
  };
  const appointment = await clinical.saveAppointment(f.owner, input);
  const note = await clinical.saveNote(f.owner, {
    patientId: chart.id,
    appointmentId: appointment.id,
    serviceDate: "2026-10-05",
    type: "Progress note",
    title: "Synthetic unsigned note",
    content: "Synthetic facts only",
    serviceCode: "90837",
    billable: false,
  });
  const { noteAidCatalog } = await import("./noteAid.js");
  const { schedulingOptions } = await import("./scheduling.js");
  assert.ok((await noteAidCatalog(f.owner)).aids.length);
  assert.equal((await schedulingOptions(f.owner)).providers.length, 1);
  await pool.execute("UPDATE users SET is_active=FALSE WHERE id=?", [f.userId]);
  assert.deepEqual((await noteAidCatalog(f.owner)).aids, []);
  assert.equal((await schedulingOptions(f.owner)).providers.length, 0);
  await assert.rejects(
    clinical.saveAppointment(f.owner, {
      ...input,
      start: "2026-10-06T16:00:00Z",
      end: "2026-10-06T17:00:00Z",
    }),
    /not eligible/,
  );
  await assert.rejects(
    clinical.signNote(f.owner, note.id, {
      revision: note.revision,
      reviewed: true,
    }),
    /eligible/,
  );
  assert.equal(
    (await get(f.owner, "appointment", appointment.id)).data.providerAccountId,
    f.owner.accountId,
  );
  assert.equal((await get(f.owner, "note", note.id)).data.status, "draft");
  await pool.execute("UPDATE users SET is_active=TRUE WHERE id=?", [f.userId]);
  assert.ok((await noteAidCatalog(f.owner)).aids.length);
  await pool.execute(
    "UPDATE auricwell_memberships SET permissions='[\"admin\"]' WHERE practice_id=? AND account_id=?",
    [f.practice.id, f.owner.accountId],
  );
  assert.deepEqual((await noteAidCatalog(f.owner)).aids, []);
  await pool.execute(
    "DELETE FROM auricwell_memberships WHERE practice_id=? AND account_id=?",
    [f.practice.id, f.owner.accountId],
  );
  const revoked = await get(f.admin, "provider", provider.id);
  assert.equal(revoked.canonicalUserId, f.userId);
  assert.equal(providerEligible(revoked), false);
});

test("new practices, manual staff and reviewed provider imports use shared people without full-suite credentials", async () => {
  const [[owner]] = await pool.execute(
    "SELECT u.* FROM users u JOIN auricwell_accounts a ON a.canonical_user_id=u.id WHERE a.id=?",
    [ctx.accountId],
  );
  assert.equal(owner.identity_product, "auricwell_ehr");
  assert.equal(owner.status, "EHR_ONLY");
  assert.equal(owner.password_hash, "!no-full-suite-password!");
  const suffix = crypto.randomUUID().slice(0, 8);
  const added = await practices.addMember(ctx, {
    username: `new-${suffix}`,
    name: "New Practice Staff",
    email: `new-${suffix}@example.invalid`,
    permissions: ["clinical"],
  });
  assert.ok(added.canonicalUserId);
  const [[account]] = await pool.execute(
    "SELECT * FROM auricwell_accounts WHERE id=?",
    [added.id],
  );
  assert.equal(account.status, "pending");
  assert.equal(account.password_hash, null);
  const [[membership]] = await pool.execute(
    "SELECT * FROM user_agencies WHERE user_id=? AND agency_id=?",
    [added.canonicalUserId, practice.agencyId],
  );
  assert.ok(membership);
  const {
    assertFullSuiteIdentity,
    signFullSuiteToken,
    fullSuiteIdentityAllowed,
  } = await import("../productIdentity.service.js");
  const { default: User } = await import("../../models/User.model.js");
  await assert.rejects(
    assertFullSuiteIdentity(added.canonicalUserId),
    /account product/,
  );
  await assert.rejects(
    signFullSuiteToken(
      { id: added.canonicalUserId, role: "super_admin" },
      "synthetic-only-secret",
    ),
    /account product/,
  );
  await assert.rejects(
    User.generatePasswordlessToken(added.canonicalUserId),
    /account product/,
  );
  await assert.rejects(
    User.changePassword(added.canonicalUserId, password),
    /account product/,
  );
  const { requestPasswordRecoveryEmail } = await import(
    "../passwordRecovery.service.js"
  );
  assert.deepEqual(
    await requestPasswordRecoveryEmail({
      targetUser: { id: added.canonicalUserId },
    }),
    { ok: true, outcome: "unknown_user" },
  );
  const [[legacy]] = await pool.execute(
    "SELECT id FROM users WHERE identity_product='full_suite' LIMIT 1",
  );
  assert.equal(await fullSuiteIdentityAllowed(legacy.id), true);
  assert.ok(
    await signFullSuiteToken(
      { id: legacy.id, role: "provider" },
      "synthetic-only-secret",
    ),
  );
  const before = (
    await pool.execute("SELECT COUNT(*) n FROM auricwell_accounts")
  )[0][0].n;
  await assert.rejects(
    practices.addMember(ctx, {
      username: `duplicate-new-${suffix}`,
      name: "Same Person",
      email: `new-${suffix}@example.invalid`,
      permissions: ["clinical"],
    }),
    /never merged automatically/,
  );
  assert.equal(
    (await pool.execute("SELECT COUNT(*) n FROM auricwell_accounts"))[0][0].n,
    before,
  );
  const imported = (await list(ctx, "provider")).filter(
    (p) => p.data.source === "therapynotes",
  );
  for (const item of imported) {
    assert.ok(item.canonicalUserId);
    assert.equal(item.data.status, "inactive");
    assert.equal(item.data.credentialsReviewed, false);
  }
});

test("full-suite request authentication rejects an EHR identity even with a valid signed legacy JWT", async () => {
  const [[account]] = await pool.execute(
    "SELECT canonical_user_id FROM auricwell_accounts WHERE id=?",
    [ctx.accountId],
  );
  const { default: jwt } = await import("jsonwebtoken");
  const { default: config } = await import("../../config/config.js");
  const middleware = await import("../../middleware/auth.middleware.js");
  const token = jwt.sign(
    { id: account.canonical_user_id, role: "super_admin" },
    config.jwt.secret,
  );
  for (const authenticate of [
    middleware.authenticate,
    middleware.authenticateOptional,
  ]) {
    const req = {
      method: "GET",
      originalUrl: "/api/clients",
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };
    let error;
    await authenticate(req, {}, (value) => {
      error = value;
    });
    assert.equal(error?.code, "PRODUCT_SESSION_MISMATCH");
    assert.equal(req.user, undefined);
  }
});

const SharedAppointment = (await import("../../models/Appointment.model.js"))
  .default;
async function sharedAppointmentFixture(day = "2028-01-10") {
  return clinical.saveAppointment(ctx, {
    patientId: patient.id,
    providerId: provider.id,
    start: `${day}T16:00:00Z`,
    end: `${day}T17:00:00Z`,
    location: "Office",
    modality: "office",
    serviceCode: "90837",
    status: "scheduled",
  });
}
test("appointments use the canonical model and participant chart, preserve edits and reject stale views", async () => {
  const visit = await sharedAppointmentFixture();
  assert.ok(visit.canonicalAppointmentId);
  const shared = await SharedAppointment.findById(
    visit.canonicalAppointmentId,
    { agencyId: practice.agencyId },
  );
  assert.equal(shared.productOrigin, "auricwell_ehr");
  assert.equal(shared.notificationMode, "in_app");
  assert.equal(shared.serviceCode, "90837");
  const participants = await SharedAppointment.listParticipants(shared.id);
  assert.equal(participants[0].clientId, patient.canonicalClientId);
  assert.equal(participants[0].receivesReminders, false);
  const [[raw]] = await pool.execute(
    "SELECT * FROM auricwell_records WHERE id=?",
    [visit.id],
  );
  const metadata = repo.decode(raw).data;
  for (const key of [
    "start",
    "end",
    "status",
    "location",
    "modality",
    "serviceCode",
  ])
    assert.equal(Object.hasOwn(metadata, key), false);
  await SharedAppointment.update(
    shared.id,
    {
      startAt: "2028-01-10 18:00:00",
      endAt: "2028-01-10 19:00:00",
      status: "confirmed",
    },
    { agencyId: practice.agencyId },
  );
  const fresh = await get(ctx, "appointment", visit.id);
  assert.equal(fresh.data.start, "2028-01-10T18:00:00.000Z");
  assert.equal(fresh.data.status, "confirmed");
  await assert.rejects(
    clinical.saveAppointment(
      ctx,
      {
        ...visit.data,
        revision: visit.revision,
        sharedFingerprint: visit.sharedFingerprint,
      },
      visit.id,
    ),
    /shared backend/,
  );
  const saved = await clinical.saveAppointment(
    ctx,
    {
      ...fresh.data,
      revision: fresh.revision,
      sharedFingerprint: fresh.sharedFingerprint,
      start: "2028-01-10T19:00:00Z",
      end: "2028-01-10T20:00:00Z",
    },
    fresh.id,
  );
  assert.equal(
    new Date(
      (await SharedAppointment.findById(shared.id)).startAt,
    ).toISOString(),
    saved.data.start,
  );
  assert.equal(
    await SharedAppointment.findById(shared.id, {
      agencyId: otherCtx.agencyId || practice.agencyId + 10000,
    }),
    null,
  );
});

test("canonical scheduling conflicts and failed links roll back without orphan visits", async () => {
  const current = await sharedAppointmentFixture("2028-01-24");
  const shared = await SharedAppointment.findById(
    current.canonicalAppointmentId,
  );
  const fullSuite = await SharedAppointment.create({
    agencyId: practice.agencyId,
    providerUserId: shared.providerUserId,
    startAt: "2028-01-31 16:00:00",
    endAt: "2028-01-31 17:00:00",
    status: "scheduled",
  });
  const before = (
    await pool.execute("SELECT COUNT(*) count FROM appointments")
  )[0][0].count;
  await assert.rejects(
    sharedAppointmentFixture("2028-01-31"),
    /shared schedule/,
  );
  assert.equal(
    (await pool.execute("SELECT COUNT(*) count FROM appointments"))[0][0].count,
    before,
  );
  const request = {
    ...current.data,
    start: "2028-02-07T16:00:00Z",
    end: "2028-02-07T17:00:00Z",
  };
  await assert.rejects(
    create(ctx, "appointment", request, {
      patientId: patient.id,
      id: current.id,
    }),
    (e) => e.code === "ER_DUP_ENTRY",
  );
  assert.equal(
    (await pool.execute("SELECT COUNT(*) count FROM appointments"))[0][0].count,
    before,
  );
  const schedule = await import("./scheduling.js");
  const series = { ...seriesRequest, localStart: "2028-01-31T09:00", count: 2 };
  const review = await schedule.previewSeries(ctx, series);
  assert.ok(
    review.issues.some((issue) => /shared schedule/.test(issue.message)),
  );
  await assert.rejects(
    schedule.applySeries(ctx, {
      ...series,
      previewHash: review.previewHash,
      reviewed: true,
      idempotencyKey: "shared-conflict-series",
    }),
    /Resolve all appointment issues/,
  );
  assert.ok(fullSuite.id);
});

test("shared appointment chart reassignment fails closed and cannot expose another practice's patient", async () => {
  const visit = await sharedAppointmentFixture("2028-02-14");
  const participants = await SharedAppointment.listParticipants(
    visit.canonicalAppointmentId,
  );
  try {
    await pool.execute(
      "UPDATE appointment_participants SET client_id=? WHERE appointment_id=?",
      [patient.canonicalClientId + 10000, visit.canonicalAppointmentId],
    );
    await assert.rejects(
      get(
        { ...ctx, agencyId: practice.agencyId + 99999 },
        "appointment",
        visit.id,
      ),
      /patient assignment changed/,
    );
  } finally {
    await pool.execute(
      "UPDATE appointment_participants SET client_id=? WHERE appointment_id=?",
      [participants[0].clientId, visit.canonicalAppointmentId],
    );
  }
  await assert.rejects(
    get(otherCtx, "appointment", visit.id),
    /not found in this practice/,
  );
});

test("shared EHR appointments cannot enter legacy email, SMS or automatic settlement queues", async () => {
  const visit = await sharedAppointmentFixture("2028-01-17");
  const reminder = await import("../appointmentReminder.service.js");
  const notifications = await import("../sessionNotification.service.js");
  const settlement = await import("../appointmentSettlement.service.js");
  const id = visit.canonicalAppointmentId;
  assert.deepEqual(await reminder.scheduleRemindersForAppointment(id), []);
  assert.deepEqual((await notifications.buildDeliveryPlan(id)).deliveries, []);
  assert.deepEqual(await notifications.scheduleSessionNotifications(id), []);
  assert.deepEqual(await notifications.scheduleDefaultCadenceReminders(id), []);
  await assert.rejects(
    notifications.queuePushUpdate(id, { changes: [{ field: "time" }] }),
    /secure practice workspace/,
  );
  await assert.rejects(
    notifications.applyConfirmReply(id),
    /secure AuricWell practice workspace/,
  );
  const replies = await import("../appointmentReply.service.js");
  for (const rawBody of ["Y", "N", "R"]) {
    await assert.rejects(
      replies.applyAppointmentReply({ appointmentId: id, rawBody }),
      /secure AuricWell practice workspace/,
    );
  }
  assert.equal((await SharedAppointment.findById(id)).status, "scheduled");
  assert.deepEqual(
    await settlement.settleAppointmentOutcome(id, {
      outcome: "completed",
      force: true,
    }),
    { settled: false, reason: "PRODUCT_BILLING_REVIEW_REQUIRED" },
  );
  // Activate the synthetic shared agency so the legacy worker actually selects
  // the accidental job, rather than only skipping an inactive organization.
  await pool.execute("UPDATE agencies SET is_active=1 WHERE id=?", [practice.agencyId]);
  // Even accidentally queued legacy messages are rejected again at dispatch.
  for (const run of [
    reminder.processDueReminders,
    notifications.processDueSessionNotifications,
  ]) {
    await pool.execute(
      "INSERT INTO appointment_reminders(appointment_id,agency_id,channel,scheduled_for) VALUES (?,?,'email',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR))",
      [id, practice.agencyId],
    );
    const result = await run();
    assert.equal(result.error, undefined);
    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 1);
  }
  assert.equal(
    (
      await pool.execute(
        "SELECT COUNT(*) count FROM appointment_billing WHERE appointment_id=?",
        [id],
      )
    )[0][0].count,
    0,
  );
});

test("practice administrators maintain new EHR staff details in shared users without employment or credential side effects", async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const account = await practices.addMember(ctx, {
    username: `details-${suffix}`,
    name: "Original Staff",
    email: `details-${suffix}@example.invalid`,
    permissions: ["clinical"],
  });
  const member = (await practices.members(ctx)).find(
    (m) => m.id === account.id,
  );
  const old = member.sharedIdentity;
  const saved = await practices.saveStaffIdentity(ctx, account.id, {
    firstName: "Reviewed",
    lastName: "Clinician",
    credential: "LPC",
    sharedFingerprint: old.fingerprint,
  });
  assert.equal(saved.name, "Reviewed Clinician");
  assert.equal(saved.credential, "LPC");
  await assert.rejects(
    practices.saveStaffIdentity(ctx, account.id, {
      firstName: "Stale",
      sharedFingerprint: old.fingerprint,
    }),
    /changed/,
  );
  await assert.rejects(
    practices.saveStaffIdentity(otherCtx, account.id, {
      firstName: "Other",
      sharedFingerprint: saved.fingerprint,
    }),
    /Connect this staff identity/,
  );
  const [[user]] = await pool.execute("SELECT * FROM users WHERE id=?", [
    account.canonicalUserId,
  ]);
  const [[authAccount]] = await pool.execute(
    "SELECT * FROM auricwell_accounts WHERE id=?",
    [account.id],
  );
  assert.equal(user.status, "EHR_ONLY");
  assert.equal(user.identity_product, "auricwell_ehr");
  assert.equal(user.password_hash, "!no-full-suite-password!");
  assert.equal(authAccount.status, "pending");
  assert.equal(authAccount.password_hash, null);
  assert.equal(
    open(authAccount.profile, `auricwell:account:${account.id}`).name,
    "Reviewed Clinician",
  );
  const clinicalProfile = await clinical.saveProvider(ctx, {
    accountId: account.id,
    name: saved.name,
    credential: "LPC",
    license: "SYNTHETIC",
    jurisdiction: "CO",
    status: "active",
    credentialsReviewed: true,
    services: ["90837"],
    locations: ["Office"],
  });
  assert.equal(providerEligible(clinicalProfile), false); // Account still awaits invitation/setup.
  await pool.execute(
    "UPDATE auricwell_accounts SET status='active' WHERE id=?",
    [account.id],
  );
  assert.equal(
    providerEligible(await get(ctx, "provider", clinicalProfile.id)),
    true,
  );
  await practices.saveStaffIdentity(ctx, account.id, {
    firstName: saved.firstName,
    lastName: saved.lastName,
    credential: "LPCC",
    sharedFingerprint: saved.fingerprint,
  });
  assert.equal(
    providerEligible(await get(ctx, "provider", clinicalProfile.id)),
    false,
  );
});

test("product identity checks preserve pre-migration defaults but fail closed for errors and retained EHR status", async () => {
  const { fullSuiteIdentityAllowed } = await import(
    "../productIdentity.service.js"
  );
  const oldSchema = (status) => ({
    execute: async (sql) => {
      if (sql.includes("identity_product"))
        throw Object.assign(new Error("Unknown column identity_product"), {
          code: "ER_BAD_FIELD_ERROR",
        });
      return [[{ status }]];
    },
  });
  assert.equal(
    await fullSuiteIdentityAllowed(1, oldSchema("ACTIVE_EMPLOYEE")),
    true,
  );
  assert.equal(await fullSuiteIdentityAllowed(1, oldSchema("EHR_ONLY")), false);
  await assert.rejects(
    fullSuiteIdentityAllowed(1, {
      execute: async () => {
        throw new Error("database unavailable");
      },
    }),
    /database unavailable/,
  );
});

async function insuranceFixture() {
  const chart = await clinical.savePatient(ctx, {
    name: `Coverage ${crypto.randomUUID().slice(0, 8)}`,
    dob: "2000-01-01",
    status: "active",
    careTeam: [ctx.accountId],
  });
  const sample = await billing.readInsurance(ctx, patient.id);
  const empty = await billing.readInsurance(ctx, chart.id);
  return {
    chart,
    input: {
      ...sample.data,
      reviewed: true,
      sharedFingerprint: empty.sharedFingerprint,
    },
    empty,
  };
}
test("insurance uses the canonical encrypted chart and preserves secondary coverage and intake provenance", async () => {
  const { readClientInsurance, writeClientInsurance } = await import(
    "../clientInsurance.service.js"
  );
  const { chart, input } = await insuranceFixture();
  const saved = await billing.saveInsurance(ctx, chart.id, input);
  const shared = await readClientInsurance(
    chart.canonicalClientId,
    practice.agencyId,
  );
  assert.equal(shared.primary.memberId, input.primary.memberId);
  assert.ok(Number.isSafeInteger(shared.confirmedBy));
  const marker = (await list(ctx, "insurance", { patientId: chart.id }))[0];
  assert.equal(marker.data.storage, "shared_client_insurance");
  assert.equal(marker.data.primary, undefined);
  assert.equal(marker.data.patient, undefined);
  await writeClientInsurance({
    clientId: chart.canonicalClientId,
    agencyId: practice.agencyId,
    ...shared,
    profileId: 9876,
    secondary: { insurerName: "Secondary synthetic", memberId: "SECONDARY" },
    primary: {
      ...shared.primary,
      memberId: "SHARED-EDIT",
      groupNumber: "PRESERVE",
    },
  });
  const current = await billing.readInsurance(ctx, chart.id);
  assert.equal(current.data.primary.memberId, "SHARED-EDIT");
  assert.notEqual(current.sharedFingerprint, saved.sharedFingerprint);
  await assert.rejects(
    billing.saveInsurance(ctx, chart.id, {
      ...input,
      sharedFingerprint: saved.sharedFingerprint,
    }),
    /Insurance changed/,
  );
  await billing.saveInsurance(ctx, chart.id, {
    ...input,
    primary: { ...current.data.primary, memberId: "EHR-EDIT" },
    secondary: undefined,
    sharedFingerprint: current.sharedFingerprint,
  });
  const final = await readClientInsurance(
    chart.canonicalClientId,
    practice.agencyId,
  );
  assert.equal(final.primary.memberId, "EHR-EDIT");
  assert.equal(final.primary.groupNumber, "PRESERVE");
  assert.equal(final.secondary.memberId, "SECONDARY");
  assert.equal(final.profileId, 9876);
  assert.equal(
    await readClientInsurance(
      chart.canonicalClientId,
      practice.agencyId + 99999,
    ),
    null,
  );
});

test("insurance rejects cross-practice, non-financial, portal and pre-readiness access", async () => {
  const { chart, input } = await insuranceFixture();
  await assert.rejects(
    billing.readInsurance(
      {
        ...otherCtx,
        settings: { ...otherCtx.settings, phiActivatedAt: "synthetic-ready" },
      },
      chart.id,
    ),
    /not found/i,
  );
  await assert.rejects(
    billing.readInsurance({ ...ctx, permissions: ["clinical"] }, chart.id),
    /billing/i,
  );
  await assert.rejects(
    billing.readInsurance(
      {
        ...ctx,
        actorType: "guardian",
        patientIds: [chart.id],
        billingPatientIds: [chart.id],
      },
      chart.id,
    ),
    /billing/i,
  );
  await assert.rejects(
    billing.readInsurance(
      { ...ctx, settings: { ...ctx.settings, phiActivatedAt: null } },
      chart.id,
    ),
    /agreements/,
  );
  await assert.rejects(
    billing.saveInsurance(ctx, chart.id, {
      ...input,
      sharedFingerprint: undefined,
    }),
    /Insurance changed/,
  );
  const saved = await billing.saveInsurance(
    { ...ctx, agencyId: practice.agencyId + 99999 },
    chart.id,
    input,
  );
  assert.equal(saved.source, "shared");
});

test("prototype insurance conversion requires exact review and retains the original without replacing shared coverage automatically", async () => {
  const { readClientInsurance, writeClientInsurance } = await import(
    "../clientInsurance.service.js"
  );
  const { chart, input } = await insuranceFixture();
  const old = await create(
    ctx,
    "insurance",
    { ...input, primary: { ...input.primary, memberId: "PROTOTYPE" } },
    { patientId: chart.id, sourceKey: chart.id },
  );
  await writeClientInsurance({
    clientId: chart.canonicalClientId,
    agencyId: practice.agencyId,
    ...input,
    primary: { ...input.primary, memberId: "CANONICAL" },
  });
  const preview = await billing.readInsurance(ctx, chart.id);
  assert.equal(preview.requiresConsolidation, true);
  assert.equal(preview.data.primary.memberId, "CANONICAL");
  assert.equal(preview.prototypeReview.primary.memberId, "PROTOTYPE");
  await assert.rejects(
    billing.saveInsurance(ctx, chart.id, {
      ...input,
      sharedFingerprint: preview.sharedFingerprint,
    }),
    /earlier AuricWell coverage/,
  );
  assert.equal(
    (await readClientInsurance(chart.canonicalClientId, practice.agencyId))
      .primary.memberId,
    "CANONICAL",
  );
  const result = await billing.saveInsurance(ctx, chart.id, {
    ...input,
    primary: preview.data.primary,
    sharedFingerprint: preview.sharedFingerprint,
    consolidationReviewed: true,
  });
  assert.equal(result.requiresConsolidation, false);
  assert.equal(result.data.primary.memberId, "CANONICAL");
  const marker = await get(ctx, "insurance", old.id);
  const archive = await get(
    ctx,
    "consolidation_archive",
    marker.data.archiveId,
  );
  assert.equal(archive.data.original.primary.memberId, "PROTOTYPE");
  assert.equal(marker.data.primary, undefined);
});

test("competing insurance saves preserve the winner and invalid dates cannot partially update coverage", async () => {
  const { chart, input } = await insuranceFixture();
  const attempts = await Promise.allSettled(
    ["ONE", "TWO"].map((memberId) =>
      billing.saveInsurance(ctx, chart.id, {
        ...input,
        primary: { ...input.primary, memberId },
      }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    attempts.filter(
      (r) =>
        r.status === "rejected" && /Insurance changed/.test(r.reason.message),
    ).length,
    1,
  );
  const current = await billing.readInsurance(ctx, chart.id);
  await assert.rejects(
    billing.saveInsurance(ctx, chart.id, {
      ...input,
      sharedFingerprint: current.sharedFingerprint,
      primary: { ...input.primary, subscriberDob: "2026-02-30" },
    }),
    /valid YYYY-MM-DD/,
  );
  assert.equal(
    (await billing.readInsurance(ctx, chart.id)).sharedFingerprint,
    current.sharedFingerprint,
  );
});

test('guardian portal messages reach both authorized parents without exposing earlier private messages',async()=>{
 const parents=[];
 for(let n=0;n<2;n++){
  const account=await practices.addMember(ctx,{username:`shared-parent-${crypto.randomBytes(5).toString('hex')}`,name:`Synthetic Parent ${n}`,email:`parent${n}@example.invalid`,actorType:'guardian',patientIds:[patient.id],billingPatientIds:[patient.id]});
  await pool.execute("UPDATE auricwell_accounts SET status='active' WHERE id=?",[account.id]);
  parents.push({...ctx,accountId:account.id,actorType:'guardian',permissions:[],patientIds:[patient.id],billingPatientIds:[patient.id],profile:{name:`Synthetic Parent ${n}`}});
 }
 const message=await clinical.createMessage(parents[0],{patientId:patient.id,recipients:[ctx.accountId],body:'Shared family question'});
 assert.equal(message.data.sharedWithGuardians,true);assert.ok(message.data.recipients.includes(parents[1].accountId));assert.ok(message.data.recipients.includes(ctx.accountId));
 assert.ok((await clinical.workspace(parents[1])).messages.some(m=>m.id===message.id));
 await assert.rejects(clinical.readMessage({...parents[1],patientIds:[]},message.id),/access/);
 const scheduling=await import('./scheduling.js');
 const appointment=await clinical.saveAppointment(ctx,{patientId:patient.id,providerId:provider.id,start:'2028-01-10T16:00:00Z',end:'2028-01-10T17:00:00Z',serviceCode:'90837',location:'Office',modality:'office',status:'scheduled'});
 await assert.rejects(scheduling.requestGuardianChange(parents[0],{appointmentId:appointment.id,requestType:'cancel',message:''}),/Reason/);
 const request=await scheduling.requestGuardianChange(parents[0],{appointmentId:appointment.id,requestType:'cancel',message:'School activity'});
 assert.equal((await get(ctx,'appointment',appointment.id)).data.status,'scheduled');
 assert.ok((await clinical.workspace(parents[1])).appointmentRequests.some(r=>r.id===request.id));
 await assert.rejects(scheduling.decideGuardianChange({...ctx,accountId:parents[1].accountId},request.id,{decision:'approved',resolution:'Review'}),/assigned provider/);
 await scheduling.decideGuardianChange(ctx,request.id,{decision:'approved',resolution:'Parent requested cancellation for school activity'});
 assert.equal((await get(ctx,'appointment',appointment.id)).data.status,'cancelled');
 assert.equal((await get(ctx,'appointment_request',request.id)).data.status,'approved');
});

test('records requests enforce practice, requester, guardian, and staff boundaries', async () => {
  const requests = await import('./recordsRequests.js');
  const recordsCtx = { ...ctx, permissions: [...ctx.permissions, 'records_manager'] };
  const guardian = { ...ctx, accountId: crypto.randomUUID(), actorType: 'guardian', permissions: [], patientIds: [patient.id] };
  const input = { patientId: patient.id, requesterName: 'Synthetic Guardian', patientName: patient.data.name, relationship: 'parent', email: 'parent@example.invalid', phone: '555-0100', scope: 'Visit summaries', attested: true };
  const record = await requests.submitPortal(guardian, input);
  assert.equal(record.data.status, 'pending_review');
  assert.ok((await requests.requests(guardian)).some(r => r.id === record.id));
  assert.equal((await requests.requests({ ...guardian, accountId: crypto.randomUUID() })).length, 0);
  assert.equal((await requests.requests({ ...guardian, patientIds: [] })).length, 0);
  await assert.rejects(requests.submitPortal({ ...guardian, patientIds: [] }, input), /access/);
  await assert.rejects(requests.requests({ ...ctx, permissions: ['clinical'] }), /permission/);
  await assert.rejects(requests.review(guardian, record.id, { status: 'approved' }), /permission/);
  await assert.rejects(requests.review({ ...otherCtx, settings: ctx.settings, permissions: ['records_manager'] }, record.id, { status: 'approved' }), /not found/);
  await requests.review(recordsCtx, record.id, { status: 'approved', authorityConfirmed: true, response: 'Approved for secure delivery' });
  const visible = (await requests.requests(guardian)).find(r => r.id === record.id);
  assert.equal(visible.data.status, 'approved');
  assert.equal(visible.data.authorityReviewedBy, undefined);
  await requests.review(recordsCtx, record.id, { status: 'fulfilled', deliveryReference: 'Synthetic secure delivery entry', response: 'Delivered' });
  const [[stored]] = await pool.execute('SELECT payload FROM auricwell_records WHERE id=?', [record.id]);
  assert.ok(!stored.payload.includes(input.email));
});

test('website requests are encrypted, unverified, and never disclose a matching chart', async () => {
  const requests = await import('./recordsRequests.js');
  const recordsCtx = { ...ctx, permissions: [...ctx.permissions, 'records_manager'] };
  const [[prior]] = await pool.execute('SELECT status FROM auricwell_practices WHERE id=?', [ctx.practiceId]);
  await pool.execute("UPDATE auricwell_practices SET status='active' WHERE id=?", [ctx.practiceId]);
  try {
    const input = { requesterName: 'Website Parent', patientName: 'Unknown Patient', relationship: 'parent', email: 'website@example.invalid', phone: '555-0100', scope: 'All available records', attested: true, status: 'approved' };
    assert.ok((await requests.publicPractices()).some(p => p.slug === ctx.slug));
    const receipt = await requests.submitPublic(ctx.slug, input);
    assert.deepEqual(Object.keys(receipt), ['message']);
    const record = (await requests.requests(recordsCtx)).find(r => r.data.email === input.email);
    assert.equal(record.data.status, 'pending_verification');
    assert.equal(record.patientId, null);
    await assert.rejects(requests.review(recordsCtx, record.id, { status: 'approved' }), /not available/);
    await requests.review(recordsCtx, record.id, { status: 'pending_review', identityConfirmed: true, identityMethod: 'in_person', response: 'Identity checked' });
    assert.equal((await get(ctx, 'records_request', record.id)).data.identityVerifiedBy, ctx.accountId);
    assert.ok((await clinical.notifications(recordsCtx)).some(n => n.id === record.id && n.section === 'records-requests'));
  } finally {
    await pool.execute('UPDATE auricwell_practices SET status=? WHERE id=?', [prior.status, ctx.practiceId]);
  }
});

test('Records Manager routing creates minimal tickets, fails over, and rejects support/admin-only access', async () => {
  const requests = await import('./recordsRequests.js');
  const management = await import('./recordsManagement.js');
  const actors = [];
  for (const label of ['primary', 'backup']) {
    const a = await auth.createAccount({ username: `records-${label}-${crypto.randomBytes(5).toString('hex')}`, name: `Records ${label}`, email: `${label}@example.invalid`, password });
    await pool.execute("UPDATE auricwell_accounts SET status='active' WHERE id=?", [a.id]);
    await pool.execute("INSERT INTO auricwell_memberships (practice_id,account_id,permissions,patient_ids,actor_type,status) VALUES (?,?,'[]','[]','staff','active')", [ctx.practiceId, a.id]);
    // Practice admins can designate managers without themselves holding records access.
    await practices.updateMember({ ...ctx, profile: { operator: false }, permissions: ['admin'] }, a.id, { permissions: ['records_manager'], status: 'active' });
    actors.push(a);
  }
  const [[p]] = await pool.execute('SELECT revision FROM auricwell_practices WHERE id=?', [ctx.practiceId]);
  await assert.rejects(management.saveManagement(ctx, { revision: p.revision, primaryAccountId: actors[0].id, backupAccountId: actors[0].id, followUpDays: 7 }), /different backup/);
  await assert.rejects(management.saveManagement(ctx, { revision: p.revision, primaryAccountId: crypto.randomUUID(), followUpDays: 7 }), /active Records Manager/);
  await management.saveManagement(ctx, { revision: p.revision, primaryAccountId: actors[0].id, backupAccountId: actors[1].id, followUpDays: 7 });
  await assert.rejects(management.saveManagement(ctx, { revision: p.revision, followUpDays: 7 }), /Refresh/);
  const [[configured]] = await pool.execute('SELECT settings FROM auricwell_practices WHERE id=?', [ctx.practiceId]);
  const manager = { ...ctx, accountId: actors[0].id, permissions: ['records_manager'], settings: open(configured.settings, `auricwell:practice:${ctx.practiceId}`) };
  const guardian = { ...ctx, accountId: crypto.randomUUID(), actorType: 'guardian', permissions: [], patientIds: [patient.id] };
  const input = { patientId: patient.id, requesterName: 'Sensitive Requester', patientName: patient.data.name, email: 'secret-contact@example.invalid', phone: '555-9999', scope: 'Sensitive requested notes', relationship: 'parent', attested: true };
  const created = await requests.submitPortal(guardian, input);
  let record = await get(ctx, 'records_request', created.id);
  assert.equal(record.data.assignedAccountId, actors[0].id);
  assert.ok(record.data.supportTicketId);
  const [[ticket]] = await pool.execute('SELECT * FROM support_tickets WHERE id=?', [record.data.supportTicketId]);
  const [[owningPractice]] = await pool.execute('SELECT agency_id FROM auricwell_practices WHERE id=?', [ctx.practiceId]);
  assert.equal(ticket.agency_id, owningPractice.agency_id);
  assert.equal(ticket.created_by_user_id, null);
  assert.ok(ticket.question.includes(`/app/${ctx.slug}/records-requests?request=${record.id}`));
  for (const secret of [input.requesterName, input.email, input.phone, input.scope, patient.id]) assert.ok(!JSON.stringify(ticket).includes(secret));
  for (const permissions of [['admin'], ['clinical'], ['schedule'], []]) {
    await assert.rejects(requests.requests({ ...ctx, permissions }), /records_manager permission/);
    await assert.rejects(requests.review({ ...ctx, permissions }, record.id, { status: 'approved' }), /records_manager permission/);
  }
  await assert.rejects(management.assignRequest(manager, record.id, { accountId: otherCtx.accountId }), /active Records Manager/);
  await assert.rejects(management.assignRequest({ ...manager, practiceId: otherCtx.practiceId }, record.id, { accountId: actors[0].id }), /not found/);
  await Promise.all([management.syncRequest(ctx.practiceId, record.id), management.syncRequest(ctx.practiceId, record.id)]);
  assert.equal((await get(ctx, 'records_request', record.id)).data.supportTicketId, ticket.id);
  const [[ticketCount]] = await pool.execute('SELECT COUNT(*) total FROM support_tickets WHERE question LIKE ?', [`%request=${record.id}%`]);
  assert.equal(ticketCount.total, 1);
  // An inactive primary falls back to the independently authorized backup.
  await pool.execute("UPDATE auricwell_memberships SET status='inactive' WHERE practice_id=? AND account_id=?", [ctx.practiceId, actors[0].id]);
  await management.syncRequest(ctx.practiceId, record.id);
  record = await get(ctx, 'records_request', record.id);
  assert.equal(record.data.assignedAccountId, actors[1].id);
  const backup = { ...manager, accountId: actors[1].id };
  await repo.update(ctx, record, { ...record.data, followUpAt: '2020-01-01T00:00:00.000Z' });
  await pool.execute("UPDATE support_tickets SET status='closed' WHERE id=?", [ticket.id]);
  await management.syncRequest(ctx.practiceId, record.id);
  const [[overdue]] = await pool.execute('SELECT status,priority FROM support_tickets WHERE id=?', [ticket.id]);
  assert.equal(overdue.status, 'open');
  assert.equal(overdue.priority, 'high');
  assert.ok((await management.recordsNotifications(backup)).some(n => n.id === record.id && n.title.includes('overdue')));
  const before = (await get(ctx, 'records_request', record.id)).data.lastReminderAt;
  await management.syncRequest(ctx.practiceId, record.id);
  assert.equal((await get(ctx, 'records_request', record.id)).data.lastReminderAt, before);
  await requests.review(backup, record.id, { status: 'closed', response: 'Request withdrawn by requester' });
  assert.equal((await pool.execute('SELECT status FROM support_tickets WHERE id=?', [ticket.id]))[0][0].status, 'closed');
  assert.equal((await requests.requests(guardian)).find(r => r.id === record.id).data.supportTicketId, undefined);
  await assert.rejects(management.assignRequest(backup, record.id, { accountId: actors[1].id }), /Completed/);
});

test('ticket outages preserve requests and the follow-up worker recovers without duplicates', async () => {
  const requests = await import('./recordsRequests.js');
  const management = await import('./recordsManagement.js');
  const guardian = { ...ctx, accountId: crypto.randomUUID(), actorType: 'guardian', permissions: [], patientIds: [patient.id] };
  let record;
  await pool.execute('RENAME TABLE support_tickets TO support_tickets_temporarily_unavailable');
  try {
    record = await requests.submitPortal(guardian, { patientId: patient.id, requesterName: 'Retry Guardian', patientName: patient.data.name, email: 'retry@example.invalid', phone: '555-0100', relationship: 'parent', scope: 'Visit summaries', attested: true });
    assert.equal((await get(ctx, 'records_request', record.id)).data.supportTicketId, undefined);
    assert.ok((await requests.requests(guardian)).some(r => r.id === record.id));
  } finally { await pool.execute('RENAME TABLE support_tickets_temporarily_unavailable TO support_tickets'); }
  await management.runRecordsRequestFollowUpTick();
  const recovered = await get(ctx, 'records_request', record.id);
  assert.ok(recovered.data.supportTicketId);
  await management.runRecordsRequestFollowUpTick();
  assert.equal((await get(ctx, 'records_request', record.id)).data.supportTicketId, recovered.data.supportTicketId);
  const notifications = await management.recordsNotifications({ ...ctx, permissions: ['admin'] });
  for (const n of notifications) {
    assert.equal(n.section, 'settings');
    assert.equal(n.id, 'records-manager-needed');
    assert.ok(!JSON.stringify(n).includes(record.id));
  }
});

// These tests use only synthetic addresses and injected transports. No Google
// room, email, or text is created by the test suite.
async function sessionFixture() {
  const staff = await auth.createAccount({ username: `video-${crypto.randomBytes(5).toString('hex')}`, name: 'Video Tester', email: 'video@example.invalid' });
  await pool.execute("UPDATE auricwell_accounts SET status='active' WHERE id=?", [staff.id]);
  await pool.execute("INSERT INTO auricwell_memberships (practice_id,account_id,permissions,patient_ids,actor_type,status) VALUES (?,?,'[\"clinical\",\"schedule\"]','[]','staff','active')", [ctx.practiceId, staff.id]);
  const c = { ...ctx, accountId: staff.id, permissions: ['clinical', 'schedule'], settings: { ...ctx.settings, capabilities: { ...ctx.settings.capabilities, video: true } } };
  const p = await create(c, 'patient', { name: 'Video test client', status: 'active', email: 'client@example.invalid', phone: '+17195550123', careTeam: [staff.id] });
  await create(c, 'agreement', { type: 'telehealth_consent', status: 'completed' }, { patientId: p.id });
  const id = crypto.randomUUID();
  const data = { providerAccountId: staff.id, start: new Date(Date.now() + 300000).toISOString(), end: new Date(Date.now() + 3900000).toISOString(), modality: 'video', status: 'scheduled' };
  await pool.execute("INSERT INTO auricwell_records (id,practice_id,kind,patient_id,payload) VALUES (?,?,'appointment',?,?)", [id, c.practiceId, p.id, seal(data, `auricwell:${c.practiceId}:appointment:${id}`)]);
  return { c, p, a: await get(c, 'appointment', id) };
}
async function changeSession(c, a, patch) {
  await pool.execute('UPDATE auricwell_records SET payload=?,revision=revision+1 WHERE id=? AND practice_id=?', [seal({ ...a.data, ...patch }, `auricwell:${c.practiceId}:appointment:${a.id}`), a.id, c.practiceId]);
  return get(c, 'appointment', a.id);
}

test('platform integration saves require MFA operator authority, preserve encrypted tokens, and reject stale revisions', async () => {
  const integration = await import('./platformIntegrations.js');
  const { integrationDefaults } = await import('./integrationPolicy.js');
  const op = { ...operatorCtx, verified: true };
  const input = { revision: 0, settings: { ...integrationDefaults(), notifyre: { from: '+17195550123', campaignId: 'synthetic', baaReference: 'synthetic agreement', apiToken: 'synthetic-private-token' } } };
  await assert.rejects(integration.savePlatformIntegrations({ ...ctx, verified: true }, input), { status: 403 });
  await assert.rejects(integration.savePlatformIntegrations({ ...op, verified: false }, input), { status: 403 });
  const saved = await integration.savePlatformIntegrations(op, input);
  assert.equal(saved.revision, 1);
  assert.equal(saved.settings.notifyre.apiToken, undefined);
  assert.equal(saved.settings.notifyre.hasApiToken, true);
  const [[raw]] = await pool.execute('SELECT payload FROM auricwell_platform_integrations WHERE id=1');
  assert.ok(!String(raw.payload).includes('synthetic-private-token'));
  await assert.rejects(integration.savePlatformIntegrations(op, input), { status: 409 });
  await assert.rejects(integration.savePlatformIntegrations(op, { revision: 1, settings: { ...saved.settings, smsProvider: 'notifyre' } }), { status: 409 });
  await assert.rejects(integration.requireOfficeEnabled(), { status: 403 });
  await assert.rejects(practices.saveSettings(ctx, { revision: ctx.settingsRevision, videoProvider: 'vonage' }), /platform/i);
  await integration.savePlatformIntegrations(op, { revision: 1, settings: integrationDefaults() });
});

test('simultaneous appointment joins prepare one private room and restrict the link to the assigned provider and authorized patient', async () => {
  const video = await import('./appointmentVideo.js');
  const { integrationDefaults } = await import('./integrationPolicy.js');
  const { c, p, a } = await sessionFixture();
  const settings = integrationDefaults();
  let created = 0;
  const adapters = { createGoogleSession: async organizer => { created++; return { url: 'https://meet.google.com/abc-defg-hij', spaceName: 'spaces/synthetic', organizer }; } };
  const rooms = await Promise.all(Array.from({ length: 4 }, () => video.ensureAppointmentVideo(c, a, settings, adapters)));
  assert.equal(created, 1);
  assert.equal(new Set(rooms.map(r => r.guestToken)).size, 1);
  const [[raw]] = await pool.execute('SELECT payload FROM auricwell_appointment_video WHERE appointment_id=?', [a.id]);
  assert.ok(!String(raw.payload).includes('abc-defg-hij'));
  assert.ok(!JSON.stringify(await get(c, 'appointment', a.id)).includes('meet.google.com'));
  // Switching service never sends the provider somewhere different from the existing invitation.
  assert.equal((await video.ensureAppointmentVideo(c, a, { ...settings, videoProvider: 'vonage' }, adapters)).provider, 'google_meet');
  assert.deepEqual(await video.joinAppointmentVideo(c, a.id), { provider: 'google_meet', url: rooms[0].url });
  const portal = { ...c, accountId: crypto.randomUUID(), actorType: 'patient', permissions: [], patientIds: [p.id] };
  assert.equal((await video.joinAppointmentVideo(portal, a.id)).url, rooms[0].url);
  await assert.rejects(video.joinAppointmentVideo({ ...portal, patientIds: [] }, a.id), { status: 403 });
  await assert.rejects(video.joinAppointmentVideo({ ...c, accountId: ctx.accountId, permissions: ['admin', 'clinical'] }, a.id), { status: 403 });
  await assert.rejects(video.joinAppointmentVideo({ ...c, practiceId: otherCtx.practiceId }, a.id), { status: 404 });
  await pool.execute("UPDATE auricwell_memberships SET status='inactive' WHERE practice_id=? AND account_id=?", [c.practiceId, c.accountId]);
  await assert.rejects(video.joinGuestVideo(rooms[0].guestToken), { status: 409 });
  await pool.execute("UPDATE auricwell_memberships SET status='active' WHERE practice_id=? AND account_id=?", [c.practiceId, c.accountId]);
  await changeSession(c, a, { status: 'cancelled' });
  await assert.rejects(video.joinAppointmentVideo(c, a.id), { status: 409 });
  await assert.rejects(video.joinGuestVideo(rooms[0].guestToken), { status: 409 });
});

test('appointment email reminders deduplicate and legacy SMS flags do not bypass client consent', async () => {
  const reminders = await import('./sessionReminders.js');
  const { integrationDefaults, smsScope } = await import('./integrationPolicy.js');
  const { c, p, a } = await sessionFixture();
  const settings = integrationDefaults();
  let emails = 0, texts = 0;
  const deps = { createGoogleSession: async organizer => ({ url: 'https://meet.google.com/xyz-abcd-efg', spaceName: 'spaces/synthetic-2', organizer }),
    sendEmail: async (_ctx, to, body) => { emails++; assert.equal(to, 'client@example.invalid'); assert.ok(body.includes('https://meet.google.com/xyz-abcd-efg')); return { id: 'synthetic-email' }; },
    sendSms: async () => { texts++; throw new Error('Ambiguous timeout'); } };
  await Promise.all([reminders.deliverAppointment(c, a, settings, deps), reminders.deliverAppointment(c, a, settings, deps)]);
  assert.equal(emails, 1); assert.equal(texts, 0);
  const sms = { ...settings, smsProvider: 'notifyre', notifyre: { ...settings.notifyre, from: '+17195550999', campaignId: 'synthetic' } };
  const prefs = await create(c, 'session_preferences', { emailEnabled: true, smsEnabled: true, phone: '+17195550123', scope: 'old-campaign' }, { patientId: p.id, sourceKey: p.id });
  await reminders.deliverAppointment(c, a, sms, deps);
  assert.equal(texts, 0);
  await repo.update(c, prefs, { ...prefs.data, scope: smsScope(sms) });
  await reminders.deliverAppointment(c, a, sms, deps);
  await reminders.deliverAppointment(c, a, sms, deps);
  // Legacy appointment-only flags never authorize the new clinical messaging pipeline.
  assert.equal(texts, 0); assert.equal(emails, 1);
  const deliveries = await reminders.sessionDeliveryStatus(c, a.id);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].channel, 'email');
  await assert.rejects(reminders.sessionDeliveryStatus({ ...c, practiceId: otherCtx.practiceId }, a.id), { status: 404 });
});

test('a cancellation during room creation cannot send an outdated reminder', async () => {
  const reminders = await import('./sessionReminders.js');
  const { integrationDefaults } = await import('./integrationPolicy.js');
  const { c, a } = await sessionFixture();
  let sent = false;
  await reminders.deliverAppointment(c, a, integrationDefaults(), {
    createGoogleSession: async organizer => { await changeSession(c, a, { status: 'cancelled' }); return { url: 'https://meet.google.com/xyz-abcd-efg', organizer }; },
    sendEmail: async () => { sent = true; }
  });
  assert.equal(sent, false);
  assert.equal((await reminders.sessionDeliveryStatus(c, a.id))[0].status, 'cancelled');
});

test('rescheduling rotates a room, retires the old guest token, and failed retirement remains retryable', async () => {
  const video = await import('./appointmentVideo.js');
  const { integrationDefaults } = await import('./integrationPolicy.js');
  const { c, a } = await sessionFixture();
  const settings = integrationDefaults();
  let creations = 0, retired = [];
  const adapters = {
    createGoogleSession: async organizer => ({ organizer, spaceName: `spaces/lifecycle-${++creations}`, url: 'https://meet.google.com/xyz-abcd-efg' }),
    retireGoogleSession: async room => { retired.push(room.spaceName); }
  };
  const first = await video.ensureAppointmentVideo(c, a, settings, adapters);
  const changed = await changeSession(c, a, { start: new Date(Date.now() + 600000).toISOString() });
  await assert.rejects(video.joinGuestVideo(first.guestToken), { status: 409 });
  const second = await video.ensureAppointmentVideo(c, changed, settings, adapters);
  assert.notEqual(second.guestToken, first.guestToken);
  assert.deepEqual(retired, ['spaces/lifecycle-1']);
  await assert.rejects(video.joinGuestVideo(first.guestToken), { status: 404 });
  await changeSession(c, changed, { status: 'cancelled' });
  await video.retireUnusedSessionRooms(settings, { retireGoogleSession: async () => { throw new Error('Temporary provider outage'); } });
  assert.equal((await pool.execute('SELECT retired_at FROM auricwell_appointment_video WHERE appointment_id=?', [a.id]))[0][0].retired_at, null);
  await video.retireUnusedSessionRooms(settings, adapters);
  assert.ok((await pool.execute('SELECT retired_at FROM auricwell_appointment_video WHERE appointment_id=?', [a.id]))[0][0].retired_at);
  await assert.rejects(video.joinGuestVideo(second.guestToken), { status: 404 });
});

async function messagingFixture() {
  const m = await import('./clientMessaging.js');
  const { integrationDefaults } = await import('./integrationPolicy.js');
  const f = await sessionFixture();
  const phone = `+1719${String(Math.floor(Math.random()*9000000)+1000000)}`;
  f.p = await repo.update(f.c, f.p, {...f.p.data, phone});
  const recipient = await auth.createAccount({username:`sms-${crypto.randomBytes(6).toString('hex')}`,name:'SMS Test Recipient',email:'recipient@example.invalid'});
  await pool.execute("UPDATE auricwell_accounts SET status='active' WHERE id=?",[recipient.id]);
  await pool.execute("INSERT INTO auricwell_memberships (practice_id,account_id,actor_type,permissions,patient_ids,billing_patient_ids,status) VALUES (?,?,'patient','[]',?,?,'active')",[f.c.practiceId,recipient.id,JSON.stringify([f.p.id]),JSON.stringify([f.p.id])]);
  const route={practiceId:f.c.practiceId,brand:'Synthetic practice',support:'help@example.invalid',mainNumber:'+17195550999',providerNumber:'+17195550888',campaignId:'synthetic',approval:'approved',approvalReference:'synthetic',enabled:true,verifiedAt:new Date().toISOString(),verifiedProvider:'notifyre'};
  const settings={...integrationDefaults(),smsProvider:'notifyre',notifyre:{apiToken:'not-real',baaReference:'test-only',webhookSecret:'test-webhook',webhookVerifiedAt:new Date().toISOString()},clientMessaging:{routes:[route]}};
  await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
  const input={revision:0,categories:{reminders:true,links:true,forms:true,account:true,conversations:true},recipientAccountId:recipient.id,consentConfirmed:true,consentMethod:'verbal_phone',evidence:'Synthetic permission, all categories, fixture',emailEnabled:false};
  await m.saveClientSmsPreferences(f.c,f.p.id,input);
  const portal={...f.c,accountId:recipient.id,actorType:'patient',permissions:[],patientIds:[f.p.id],billingPatientIds:[f.p.id]};
  const event=async(body,at=Date.now(),id=crypto.randomUUID(),from=phone)=>{
    const payload={Event:'sms_received',Timestamp:Math.floor(at/1000),Payload:{ReplyID:id,SenderNumber:from,RecipientNumber:route.mainNumber,Message:body,ReceivedDateUtc:at/1000}};
    const raw=Buffer.from(JSON.stringify(payload)),stamp=Math.floor(Date.now()/1000);
    const header=`t=${stamp},v=${crypto.createHmac('sha256','test-webhook').update(`${stamp}.${raw}`).digest('hex')}`;
    await m.acceptNotifyreWebhook(raw,header);const {normalizeNotifyreEvent}=await import('./clientMessagingPolicy.js');const key=normalizeNotifyreEvent(payload).key;return{raw,header,key};
  };
  return{...f,m,phone,recipient,portal,settings,event};
}
test('Notifyre preferences, webhook dedupe, account STOP and START preserve category opt-outs',async()=>{
 const f=await messagingFixture();const {m,c,p,event,portal}=f;
 await assert.rejects(m.saveClientSmsPreferences({...portal,patientIds:[]},p.id,{revision:1}),{status:403});
 let stamp=Date.now()-10000;
 const noform=await event('NOFORM',stamp);await m.acceptNotifyreWebhook(noform.raw,noform.header);await m.processSmsEvent(noform.key);
 let prefs=await m.clientSmsPreferences(c,p.id);assert.equal(prefs.categories.forms,false);assert.equal(prefs.categories.links,true);
 await assert.rejects(m.saveClientSmsPreferences(c,p.id,{revision:prefs.revision-1,categories:prefs.categories}),{status:409});
 const stop=await event('STOP',stamp+1000);await m.processSmsEvent(stop.key);assert.equal((await m.clientSmsPreferences(c,p.id)).stopped,true);
 const queued=await m.queuePatientSms(c,p.id,{category:'account',key:crypto.randomUUID(),body:'Synthetic account notice'});let sends=0;
 await m.dispatchSms(queued.id,{send:async()=>{sends++;return'not-sent';}});assert.equal(sends,0);
 assert.equal((await pool.execute('SELECT status FROM auricwell_sms_outbox WHERE id=?',[queued.id]))[0][0].status,'suppressed');
 assert.ok((await m.smsNotices(portal))[0].body.includes('START'));
 const stale=await event('START',stamp);await m.processSmsEvent(stale.key);assert.equal((await m.clientSmsPreferences(c,p.id)).stopped,true);
 const start=await event('START',stamp+2000);await m.processSmsEvent(start.key);prefs=await m.clientSmsPreferences(c,p.id);assert.equal(prefs.stopped,false);assert.equal(prefs.categories.forms,false);
 const ordinary=await event('Can someone help me?',stamp+3000);await m.processSmsEvent(ordinary.key);await m.processSmsEvent(ordinary.key);
 const threads=await m.smsInbox(c,p.id);assert.equal(threads.length,1);const convo=await m.smsConversation(c,threads[0].id);assert.equal(convo.messages.filter(x=>x.direction==='inbound').length,1);
 await assert.rejects(m.smsConversation({...c,practiceId:otherCtx.practiceId},threads[0].id),{status:404});
 await assert.rejects(m.smsConversation(portal,threads[0].id),{status:403});
});
test('SMS dispatch commits one claim, rechecks consent and leaves uncertain sends for review',async()=>{
 const {m,c,p,event}=await messagingFixture();
 const msg=await m.queuePatientSms(c,p.id,{category:'forms',key:'test-dedup-'+p.id,body:'Form available'});
 const again=await m.queuePatientSms(c,p.id,{category:'forms',key:'test-dedup-'+p.id,body:'Form available'});assert.equal(msg.id,again.id);
 let sends=0;const deps={send:async()=>{sends++;return'synthetic-'+crypto.randomUUID();}};
 await Promise.all([m.dispatchSms(msg.id,deps),m.dispatchSms(msg.id,deps),m.dispatchSms(msg.id,deps)]);assert.equal(sends,1);
 const uncertain=await m.queuePatientSms(c,p.id,{category:'forms',key:crypto.randomUUID(),body:'Form available'});
 await m.dispatchSms(uncertain.id,{send:async()=>{sends++;throw new Error('Carrier timeout');}});await m.dispatchSms(uncertain.id,deps);assert.equal(sends,2);
 assert.equal((await pool.execute('SELECT status FROM auricwell_sms_outbox WHERE id=?',[uncertain.id]))[0][0].status,'needs_review');
 const pending=await m.queuePatientSms(c,p.id,{category:'forms',key:crypto.randomUUID(),body:'Another form'});await event('NOFORM');await m.dispatchSms(pending.id,deps);assert.equal(sends,2);
 const [[raw]]=await pool.execute('SELECT payload FROM auricwell_sms_outbox WHERE id=?',[msg.id]);assert.ok(!raw.payload.includes('Form available'));
});
test('five-minute session links are independent of appointment reminder preferences and cancelled visits suppress queued texts',async()=>{
 const f=await messagingFixture();const {m,c,p,a,settings}=f;const reminders=await import('./sessionReminders.js');
 const prefs=await m.clientSmsPreferences(c,p.id);await m.saveClientSmsPreferences(c,p.id,{...prefs,categories:{...prefs.categories,reminders:false},recipientAccountId:f.recipient.id,emailEnabled:false});
 await reminders.deliverAppointment(c,a,settings,{createGoogleSession:async organizer=>({url:'https://meet.google.com/abc-defg-hij',spaceName:'spaces/sms-'+p.id,organizer})});
 const [rows]=await pool.execute('SELECT * FROM auricwell_sms_outbox WHERE practice_id=? AND contact_id IN (SELECT id FROM auricwell_sms_contacts WHERE patient_id=?)',[c.practiceId,p.id]);
 assert.equal(rows.filter(r=>r.category==='reminders').length,0);assert.equal(rows.filter(r=>r.category==='links').length,1);
 const link=rows.find(r=>r.category==='links');await changeSession(c,a,{status:'cancelled'});let sends=0;await m.dispatchSms(link.id,{send:async()=>{sends++;return'no';}});assert.equal(sends,0);
});
test('staff relay replies remove case-insensitive codes, cannot guess recipients, and preserve staff attribution',async()=>{
 const {m,c,p,event}=await messagingFixture();const admin={...c,permissions:[...c.permissions,'admin']};
 const staffPhone='+17195550777';await m.saveStaffRelay(admin,c.accountId,{revision:0,phone:staffPhone,timezone:'UTC',enabled:true,support:true,providerTexting:true,consentConfirmed:true,deviceApproved:true,shifts:Array.from({length:7},(_,day)=>({day,start:'00:00',end:'23:59'}))});
 const received=await event('Hello support');await m.processSmsEvent(received.key);const [thread]=await m.smsInbox(c,p.id);
 const response=await event(`${thread.data.tag.toUpperCase()} We can help`,Date.now(),crypto.randomUUID(),staffPhone);await m.processSmsEvent(response.key);
 const before=process.env.AURICWELL_ENABLED;process.env.AURICWELL_ENABLED='true';
 // Disable sending while exercising the same durable inbound worker used in production.
 const {settings}=await(await import('./platformIntegrations.js')).platformIntegrations();settings.smsProvider='disabled';await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
 // Processing a relay while paused must fail closed, not fall through to another client.
 await m.runClientMessaging({sendEmail:async()=>({id:'synthetic-email'})});
 assert.equal((await pool.execute('SELECT status FROM auricwell_sms_events WHERE event_key=?',[response.key]))[0][0].status,'needs_review');
 settings.smsProvider='notifyre';await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
 const sent=[];const transport={send:async(_settings,_route,message)=>{sent.push(message);return `test-receipt-${message.id}`;},sendEmail:async()=>({id:'synthetic-email'})};
 await m.retryInboundSms(admin,response.key);
 await m.runClientMessaging(transport);await m.runClientMessaging(transport);
 assert.equal((await pool.execute('SELECT status FROM auricwell_sms_events WHERE event_key=?',[response.key]))[0][0].status,'processed');
 assert.equal(sent.filter(message=>message.body==='We can help').length,1);
 assert.ok(!sent.some(message=>message.body===`${thread.data.tag.toUpperCase()} We can help`));
 const actualReply=(await m.smsConversation(c,thread.id)).messages.find(message=>message.origin==='staff_sms');
 assert.equal(actualReply.actor,c.accountId);assert.equal(actualReply.status,'submitted');
 // Failed delivery returns the conversation to the unanswered queue.
 const receipt={type:'delivery',id:`test-receipt-${actualReply.id}`,status:'failed',key:hash(crypto.randomUUID())};
 await pool.execute('INSERT INTO auricwell_sms_events (event_key,payload) VALUES (?,?)',[receipt.key,seal(receipt,`auricwell:sms:event:${receipt.key}`)]);
 await m.processSmsEvent(receipt.key);assert.equal((await m.smsConversation(c,thread.id)).thread.data.needsReply,true);
 const malformed=await event('No code here',Date.now(),crypto.randomUUID(),staffPhone);await m.processSmsEvent(malformed.key);
 await m.runClientMessaging(transport);assert.equal((await pool.execute('SELECT status FROM auricwell_sms_events WHERE event_key=?',[malformed.key]))[0][0].status,'needs_review');
 assert.ok(!sent.some(message=>message.body==='No code here'));
 const result=await m.replySms(c,thread.id,{body:'We can help',requestId:crypto.randomUUID(),origin:'staff_sms'});const convo=await m.smsConversation(c,thread.id);assert.equal(convo.messages.find(x=>x.id===result.id).actor,c.accountId);assert.equal(convo.messages.find(x=>x.id===result.id).origin,'app');
 const closed=await m.closeSmsThread(c,thread.id);assert.equal(closed.data.status,'resolved');const next=await event('One more question');await m.processSmsEvent(next.key);assert.equal((await m.smsConversation(c,thread.id)).thread.data.status,'open');
 if(before===undefined)delete process.env.AURICWELL_ENABLED;else process.env.AURICWELL_ENABLED=before;
});

test('form notices deduplicate and recheck document completion and recipient access before sending',async()=>{
 const {m,c,p,recipient}=await messagingFixture();
 const intake=await create(c,'intake',{status:'assigned',respondentAccountId:recipient.id,submissionNumber:0},{patientId:p.id});
 const agreement=await create(c,'agreement',{status:'issued',signers:[{accountId:recipient.id}],signatures:[]},{patientId:p.id});
 await m.queuePendingDocuments(c);await m.queuePendingDocuments(c);
 const [rows]=await pool.execute("SELECT o.* FROM auricwell_sms_outbox o JOIN auricwell_sms_contacts c ON c.id=o.contact_id WHERE c.patient_id=? AND o.category='forms'",[p.id]);
 assert.equal(rows.length,2);
 const form=rows.find(row=>open(row.payload,`auricwell:sms:outbox:${row.id}`).source.id===intake.id);
 const contract=rows.find(row=>open(row.payload,`auricwell:sms:outbox:${row.id}`).source.id===agreement.id);
 let sends=0;const deps={send:async()=>{sends++;return'never';}};
 await repo.update(c,intake,{...intake.data,status:'submitted'});await m.dispatchSms(form.id,deps);
 await pool.execute("UPDATE auricwell_memberships SET status='inactive' WHERE practice_id=? AND account_id=?",[c.practiceId,recipient.id]);
 await m.dispatchSms(contract.id,deps);assert.equal(sends,0);
 assert.equal((await pool.execute('SELECT status FROM auricwell_sms_outbox WHERE id=?',[contract.id]))[0][0].status,'suppressed');
});

test('one STOP suppresses the same phone across agency routes, without cancelling billing records',async()=>{
 const {m,c,p,phone,event,settings}=await messagingFixture();
 const secondPatient=await create(otherCtx,'patient',{name:'Other Agency Patient',dob:'2000-01-01',phone,careTeam:[otherCtx.accountId],status:'active'});
 const contactId=crypto.randomUUID();const {phoneKey,emptyCategories}=await import('./clientMessagingPolicy.js');
 await pool.execute('INSERT INTO auricwell_sms_contacts (id,practice_id,phone_key,patient_id,payload) VALUES (?,?,?,?,?)',
   [contactId,otherCtx.practiceId,phoneKey(phone),secondPatient.id,seal({phone,categories:{...emptyCategories(),account:true}},`auricwell:sms:contact:${contactId}`)]);
 settings.clientMessaging.routes.push({...settings.clientMessaging.routes[0],practiceId:otherCtx.practiceId,mainNumber:'+17195550666',providerNumber:'+17195550555'});
 await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
 const notice=await m.queuePatientSms(otherCtx,secondPatient.id,{category:'account',body:'Account notice',key:crypto.randomUUID()});
 const charge=await create(otherCtx,'ledger',{type:'charge',amountCents:10000},{patientId:secondPatient.id});
 await event('STOP');let sends=0;await m.dispatchSms(notice.id,{send:async()=>{sends++;return'never';}});
 assert.equal(sends,0);assert.equal((await m.clientSmsPreferences({...otherCtx,settings:c.settings},secondPatient.id)).stopped,true);
 assert.equal((await m.clientSmsPreferences(c,p.id)).categories.account,true);
 assert.equal((await get(otherCtx,'patient',secondPatient.id)).data.status,'active');
 assert.equal((await get(otherCtx,'ledger',charge.id)).data.amountCents,10000);
});

test('primary fax inbox isolates practices, validates signed events, archives PDFs and deduplicates sends',async()=>{
 const {m,c,portal,settings}=await messagingFixture();
 const fax=await import('./faxMessaging.js');
 const route=settings.clientMessaging.routes[0];route.faxEnabled=true;route.faxVerifiedAt=new Date().toISOString();
 settings.smsProvider='disabled';route.enabled=false;route.approval='submitted';
 await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
 const stamp=Math.floor(Date.now()/1000);
 const incoming={Event:'fax_received',Timestamp:stamp,Payload:{ID:crypto.randomUUID(),From:'+17195550444',To:route.mainNumber,Page:1}};
 const post=async event=>{const raw=Buffer.from(JSON.stringify(event));const header=`t=${stamp},v=${crypto.createHmac('sha256','test-webhook').update(`${stamp}.${raw}`).digest('hex')}`;return m.acceptNotifyreWebhook(raw,header);};
 await assert.rejects(m.acceptNotifyreWebhook(Buffer.from(JSON.stringify(incoming)),`t=${stamp},v=${'0'.repeat(64)}`),{status:403});
 await post(incoming);await post(incoming);
 await assert.rejects(post({...incoming,Payload:{...incoming.Payload,ID:crypto.randomUUID(),To:route.providerNumber}}),{status:409});
 let inbox=await fax.faxInbox(c);const received=inbox.records.filter(r=>r.data.carrierId===incoming.Payload.ID);assert.equal(received.length,1);
 await assert.rejects(fax.faxInbox(portal),{status:403});
 await assert.rejects(fax.downloadFax({...c,practiceId:otherCtx.practiceId},received[0].id),{status:404});
 await assert.rejects(fax.reviewFax({...c,permissions:['clinical']},received[0].id),{status:403});
 const pdf=await PDFDocument.create();pdf.addPage();const base64=Buffer.from(await pdf.save()).toString('base64');
 let downloads=0;const download=async(_token,path)=>{downloads++;assert.ok(path.endsWith('/download'));assert.ok(!path.includes('delete'));return{Base64Str:base64,Type:'application/pdf'};};
 assert.equal((await fax.downloadFax(c,received[0].id,download)).base64,base64);await fax.downloadFax(c,received[0].id,download);assert.equal(downloads,1);
 assert.ok((await fax.reviewFax(c,received[0].id)).data.reviewedAt);
 const input={requestId:crypto.randomUUID(),to:'+17195550333',base64};let sends=0;
 const send=async(_token,path,body)=>{sends++;assert.equal(path,'/fax/send');assert.equal(body.Faxes.SendFrom,route.mainNumber);assert.equal(body.Faxes.Documents[0].Data,base64);return{FaxID:'synthetic-fax'};};
 const [one,two]=await Promise.all([fax.sendFax(c,input,send),fax.sendFax(c,input,send)]);assert.equal(one.id,two.id);assert.equal(sends,1);
 await assert.rejects(fax.sendFax(c,{...input,to:'+17195550444'},send),{status:409});
 const delivery={Event:'fax_sent',Timestamp:stamp,Payload:{ID:'synthetic-fax',FromNumber:route.mainNumber,To:input.to,Reference:one.id,Status:'successful',Pages:1}};
 await post(delivery);await post({...delivery,Timestamp:stamp+1,Payload:{...delivery.Payload,Status:'in_progress'}});
 assert.equal((await get(c,'fax',one.id)).data.status,'delivered');
 const uncertain={...input,requestId:crypto.randomUUID()};let attempts=0;
 const timeout=async()=>{attempts++;throw new Error('synthetic timeout after carrier acceptance');};
 const unknown=await fax.sendFax(c,uncertain,timeout);await fax.sendFax(c,uncertain,timeout);assert.equal(attempts,1);assert.equal(unknown.data.status,'needs_review');
 await post({...delivery,Payload:{...delivery.Payload,ID:'late-receipt',Reference:unknown.id}});assert.equal((await get(c,'fax',unknown.id)).data.status,'delivered');
 route.faxEnabled=false;await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
 await assert.rejects(fax.sendFax(c,{...input,requestId:crypto.randomUUID()},send),{status:409});
 await post({...incoming,Payload:{...incoming.Payload,ID:crypto.randomUUID()}}); // Receive even while outgoing fax is paused.
 const [[stored]]=await pool.execute('SELECT payload FROM auricwell_records WHERE id=?',[received[0].id]);assert.ok(!stored.payload.includes(incoming.Payload.From));
});

test('platform SMS verification enforces consent, existing factors, single-use session-bound codes, recovery and signed STOP',async()=>{
 const {settings,m}=await messagingFixture();
 const sms=await import('./verificationSms.js');
 const {CONSENT_VERSION}=await import('./verificationSmsPolicy.js');
 settings.verificationSms={enabled:true,from:'+17195550777',campaignId:'auricwell-2fa',approval:'approved',approvalReference:'synthetic',verifiedAt:new Date().toISOString(),carrierKeywordsConfirmed:true};
 await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
 const username=`otp-${crypto.randomBytes(5).toString('hex')}`;
 const a=await auth.createAccount({username,name:'Synthetic OTP',email:'otp@example.invalid',password});
 const login=await auth.login(username,password);assert.ok(login.token);
 const c={accountId:a.id,username,sessionHash:hash(login.token),verified:false,mfaEnabled:false};
 const input={purpose:'enroll',phone:'+17195550778',consent:true,consentVersion:CONSENT_VERSION};
 let calls=0,code='';const send=async b=>{calls++;code=b.Body.match(/\b\d{6}\b/)[0];assert.equal(b.From,settings.verificationSms.from);return `verification-${crypto.randomUUID()}`;};
 await assert.rejects(sms.requestVerification(c,{...input,consent:false},{send}),{status:400});assert.equal(calls,0);
 const challenge=await sms.requestVerification(c,input,{send});assert.equal(calls,1);
 await assert.rejects(sms.requestVerification(c,input,{send}),{status:429});
 await assert.rejects(sms.verifyCode({...c,sessionHash:'0'.repeat(64)},{challengeId:challenge.challengeId,code}),{status:400});
 await assert.rejects(sms.verifyCode(c,{challengeId:challenge.challengeId,code:code==='111111'?'222222':'111111'}),{status:400});
 const [[attempt]]=await pool.execute('SELECT attempts,payload FROM auricwell_auth_sms_challenges WHERE id=?',[challenge.challengeId]);assert.equal(attempt.attempts,1);assert.ok(!attempt.payload.includes(input.phone));
 assert.equal((await sms.verifyCode(c,{challengeId:challenge.challengeId,code})).verified,true);
 await assert.rejects(sms.verifyCode(c,{challengeId:challenge.challengeId,code}),{status:400});
 assert.equal((await sms.verificationStatus(c)).enrolled,true);
 await assert.rejects(sms.requestVerification(c,{...input,phone:'+17195550779'},{send}),{status:403});
 await assert.rejects(auth.beginMfa(c),{status:403});
 const authRequest={cookies:{[auth.COOKIE]:login.token}};await auth.authenticate(authRequest,{},e=>{if(e)throw e;});assert.equal(authRequest.aw.smsEnabled,true);
 let unverifiedError;await auth.requireVerified({...authRequest,aw:{...authRequest.aw,verified:false}},{},e=>{unverifiedError=e;});assert.equal(unverifiedError.status,403);
 const age=()=>pool.execute('UPDATE auricwell_auth_sms_challenges SET created_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE account_id=?',[a.id]);
 await age();const signin=await sms.requestVerification(c,{...input,purpose:'signin'},{send});
 await pool.execute('UPDATE auricwell_auth_sms_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?',[signin.challengeId]);
 await assert.rejects(sms.verifyCode(c,{challengeId:signin.challengeId,code}),{status:400});
 await age();const recovery=await sms.requestRecovery({username,consent:true,consentVersion:CONSENT_VERSION},{send});
 const reset=await sms.verifyCode(null,{challengeId:recovery.challengeId,code},true);assert.match(reset.accountToken,/^[0-9a-f]{64}$/);
 await assert.rejects(sms.verifyCode(null,{challengeId:recovery.challengeId,code},true),{status:400});
 await auth.redeemAccountToken(reset.accountToken,'A different secure test password');
 assert.equal((await sms.verificationStatus(c)).enrolled,true);
 const unknown=await sms.requestRecovery({username:'unknown-synthetic-user',consent:true,consentVersion:CONSENT_VERSION},{send});assert.equal(unknown.message,recovery.message);
 const stamp=Math.floor(Date.now()/1000);const event={Event:'sms_received',Timestamp:stamp,Payload:{ReplyID:crypto.randomUUID(),SenderNumber:input.phone,RecipientNumber:settings.verificationSms.from,Message:'STOP',ReceivedDateUtc:stamp}};
 const raw=Buffer.from(JSON.stringify(event)), signature=`t=${stamp},v=${crypto.createHmac('sha256','test-webhook').update(`${stamp}.${raw}`).digest('hex')}`;
 await assert.rejects(m.acceptNotifyreWebhook(raw,`t=${stamp},v=${'0'.repeat(64)}`),{status:403});
 await m.acceptNotifyreWebhook(raw,signature);await m.acceptNotifyreWebhook(raw,signature);
 assert.equal((await sms.verificationStatus(c)).stopped,true);
 await age();await assert.rejects(sms.requestVerification(c,{...input,purpose:'signin'},{send}),{status:409});
 const [[state]]=await pool.execute('SELECT blocked FROM auricwell_sms_phone_state WHERE phone_key=?',[(await import('./clientMessagingPolicy.js')).phoneKey(input.phone)]);assert.equal(state.blocked,1);
 const [[clinicalEvents]]=await pool.execute('SELECT COUNT(*) AS n FROM auricwell_sms_events WHERE event_key=?',[hash(`notifyre:inbound:${event.Payload.ReplyID}`)]);assert.equal(clinicalEvents.n,0);
});

test('verification SMS serializes sends, limits guesses and keeps uncertain delivery usable without automatic retries',async()=>{
 const {settings}=await messagingFixture();const sms=await import('./verificationSms.js');const {CONSENT_VERSION}=await import('./verificationSmsPolicy.js');
 settings.verificationSms={enabled:true,from:'+17195550800',campaignId:'otp-testing',approval:'approved',approvalReference:'test',verifiedAt:'now',carrierKeywordsConfirmed:true};
 await pool.execute('UPDATE auricwell_platform_integrations SET payload=? WHERE id=1',[seal(settings,'auricwell:platform:integrations')]);
 const username=`otp-concurrent-${crypto.randomBytes(5).toString('hex')}`,a=await auth.createAccount({username,name:'Synthetic',email:'otp@example.invalid',password});
 const login=await auth.login(username,password),c={accountId:a.id,username,sessionHash:hash(login.token),verified:false,mfaEnabled:false};
 const input={purpose:'enroll',phone:'+17195550801',consent:true,consentVersion:CONSENT_VERSION};let sends=0,code='';
 const send=async b=>{sends++;code=b.Body.match(/\b\d{6}\b/)[0];throw new Error('Synthetic timeout after acceptance');};
 const both=await Promise.allSettled([sms.requestVerification(c,input,{send}),sms.requestVerification(c,input,{send})]);
 assert.equal(sends,1);assert.equal(both.filter(r=>r.status==='fulfilled').length,1);const challenge=both.find(r=>r.status==='fulfilled').value;
 const wrong=code==='111111'?'222222':'111111';for(let i=0;i<5;i++)await assert.rejects(sms.verifyCode(c,{challengeId:challenge.challengeId,code:wrong}),{status:400});
 await assert.rejects(sms.verifyCode(c,{challengeId:challenge.challengeId,code}),{status:400});
 await pool.execute('UPDATE auricwell_auth_sms_challenges SET created_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE account_id=?',[a.id]);
 const retry=await sms.requestVerification(c,input,{send});assert.equal(sends,2);
 assert.equal((await sms.verifyCode(c,{challengeId:retry.challengeId,code})).verified,true);
 // A previously issued but unverified authenticator setup cannot bypass the new SMS factor.
 await pool.execute('UPDATE auricwell_accounts SET mfa_secret=? WHERE id=?',[seal(new OTPAuth.Secret({size:20}).base32,`auricwell:mfa:${a.id}`),a.id]);
 await assert.rejects(auth.verifyMfa(c,'123456'),{status:403});
 await sms.disableVerification({...c,verified:true});assert.equal((await sms.verificationStatus(c)).enrolled,false);
});
