import { normalizePolicy } from '../clientInsurance.service.js';
import {
  buildClaimMdJsonClaim,
  uploadClaims,
  fetchResponses,
  fetchPayers,
  requestEligibilityJson,
} from "../claimMd.service.js";
import StripePaymentsService, {
  getStripePublishableKey,
} from "../stripePayments.service.js";
import { validNpi, validDate } from "../supervisedBillingPolicy.service.js";
import {
  pool,
  seal,
  open,
  get,
  list,
  create,
  update,
  audit,
  transaction,
  lockPractice,
} from "./repository.js";
import {
  fail,
  text,
  hash,
  requirePermission,
  requirePhi,
  requireCapability,
  requirePatientBilling,
  money,
  ledgerBalance,
  providerEligible,
} from "./policy.js";
import { patientAccess } from "./clinical.js";
import {
  insuranceSnapshot,
  saveSharedInsurance,
  presentInsurance,
} from "./sharedInsurance.js";
import { owningAgency } from './sharedPatients.js';
import { providerBillingRolloutReview } from '../providerBillingRollout.service.js';

const claimKey = (ctx) =>
  process.env[
    `AURICWELL_CLAIMMD_${ctx.slug.toUpperCase().replaceAll("-", "_")}_KEY`
  ];
function integration(ctx, name, live = false) {
  requirePhi(ctx);
  requireCapability(ctx, "billing");
  const config = ctx.settings.integrations?.[name];
  if (!config?.verifiedAt)
    throw fail(409, `${name} integration must be configured and verified.`);
  // Test labels do not turn live provider credentials into a sandbox. All money
  // movement and claim uploads require an explicit runtime practice allowlist.
  if (
    live &&
    !(process.env.AURICWELL_FINANCIAL_PRACTICES || "")
      .split(",")
      .map((s) => s.trim())
      .includes(ctx.slug)
  )
    throw fail(
      409,
      "This practice is not enabled for external financial transactions.",
    );
  if (
    name === "payments" &&
    live &&
    (config.mode === "test") !==
      String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_")
  )
    throw fail(
      409,
      "Payment account mode changed; verify the connection again.",
    );
  return config;
}
export async function configureIntegration(ctx, name, input) {
  if (name === "video") throw fail(403, "Video service is managed in AuricWell platform settings.");
  if (['videoProvider','smsProvider','alwaysAvailableOffice','googleOrganizer'].some(k => Object.hasOwn(input,k)))
    throw fail(403, 'Use platform settings to change session providers.');
  if (!ctx.profile.operator)
    throw fail(
      403,
      "Only the operator can verify integration ownership and vendor agreements.",
    );
  if (!["claims", "payments", "video", "ocr", "ai"].includes(name))
    throw fail(400, "Unknown integration.");
  if (!["test", "live"].includes(input.mode))
    throw fail(400, "Select the actual integration account mode.");
  const evidence = text(
    input.evidence,
    "Verified ownership and vendor agreement evidence",
    4000,
  );
  let extra = {};
  if (name === "claims") {
    const key = claimKey(ctx);
    if (!key)
      throw fail(
        409,
        "Provision the practice-specific Claim.MD key in the runtime secret store.",
      );
    await fetchPayers({
      accountKey: key,
      payerId: input.testPayerId || undefined,
    });
    extra = {
      accountReference: text(
        input.accountReference,
        "Verified clearinghouse account reference",
        100,
      ),
    };
  }
  if (name === "payments") {
    if (!/^acct_[a-zA-Z0-9]+$/.test(input.connectedAccountId || ""))
      throw fail(400, "A dedicated connected Stripe account is required.");
    const account = await StripePaymentsService.retrieveConnectAccount(
      input.connectedAccountId,
    );
    if (!account.charges_enabled || !account.payouts_enabled)
      throw fail(409, "Complete Stripe onboarding before enabling payments.");
    const testSecret = String(process.env.STRIPE_SECRET_KEY || "").startsWith(
      "sk_test_",
    );
    if ((input.mode === "test") !== testSecret)
      throw fail(
        409,
        "The selected payment mode does not match the configured Stripe key.",
      );
    extra = { connectedAccountId: input.connectedAccountId };
  }
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const [[row]] = await db.execute(
      "SELECT settings FROM auricwell_practices WHERE id=?",
      [ctx.practiceId],
    );
    const settings = open(row.settings, `auricwell:practice:${ctx.practiceId}`);
    settings.integrations[name] = {
      ...extra,
      mode: input.mode,
      evidence,
      verifiedBy: ctx.accountId,
      verifiedAt: new Date().toISOString(),
    };
    if (["video", "ai"].includes(name)) settings.capabilities[name] = true;
    await db.execute(
      "UPDATE auricwell_practices SET settings=?,revision=revision+1 WHERE id=?",
      [seal(settings, `auricwell:practice:${ctx.practiceId}`), ctx.practiceId],
    );
    await audit(
      ctx,
      "integration.verified",
      ctx.practiceId,
      { name, mode: input.mode, evidence },
      db,
    );
    return { verified: true };
  });
}
export async function readInsurance(ctx, patientId) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  await patientAccess(ctx, patientId);
  return presentInsurance(await insuranceSnapshot(ctx, patientId, pool));
}
export async function saveInsurance(ctx, patientId, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  await patientAccess(ctx, patientId);
  const primary = input.primary || {},
    patient = input.patient || {};
  normalizePolicy(primary);
  if (input.secondary) normalizePolicy(input.secondary);
  for (const key of [
    "insurerName",
    "payerId",
    "memberId",
    "subscriberFirstName",
    "subscriberLastName",
    "subscriberDob",
    "subscriberSex",
    "subscriberAddressLine1",
    "subscriberCity",
    "subscriberState",
    "subscriberPostalCode",
    "relationshipToSubscriber",
  ])
    text(primary[key], `Primary insurance ${key}`, 200);
  for (const key of [
    "firstName",
    "lastName",
    "dateOfBirth",
    "sex",
    "addressLine1",
    "city",
    "state",
    "postalCode",
  ])
    text(patient[key], `Patient ${key}`, 200);
  if (
    !validDate(patient.dateOfBirth) ||
    !["M", "F", "U"].includes(patient.sex) ||
    !["M", "F", "U"].includes(primary.subscriberSex)
  )
    throw fail(400, "Review patient birth date and insurance sex codes.");
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    await patientAccess(ctx, patientId, false, db);
    return presentInsurance(
      await saveSharedInsurance(ctx, patientId, input, db),
    );
  });
}
async function claimPayload(ctx, claim, db = pool) {
  const note = await get(ctx, "note", claim.data.noteId, db),
    provider = await get(ctx, "provider", claim.data.providerId, db),
    payer = await get(ctx, "payer", claim.data.payerId, db);
  const rollout = await providerBillingRolloutReview({ agencyId: await owningAgency(ctx, db),
    providerUserId: provider.canonicalUserId, payerId: payer.data.electronicPayerId,
    serviceDate: note.data.serviceDate }, db);
  if (!rollout.ready) throw fail(409, rollout.reason);
  const insuranceRecord = await insuranceSnapshot(ctx, claim.patientId, db, {
    lock: db !== pool,
  });
  if (insuranceRecord.requiresConsolidation)
    throw fail(
      409,
      "Review the earlier insurance against the shared chart before preparing claims.",
    );
  const insurance = insuranceRecord?.data;
  if (!payer.data.electronicMatchReviewed)
    throw fail(
      409,
      "Review the imported or configured electronic payer identity before transmission.",
    );
  let supervisor = null,
    rendering = provider,
    emitSupervisor = false;
  if (provider.data.supervisionRequired) {
    const rule = payer.data.supervisionRule;
    if (
      !rule?.reviewed ||
      rule.planType !== insurance?.primary.planType ||
      rule.effectiveFrom > note.data.serviceDate ||
      rule.effectiveThrough < note.data.serviceDate
    )
      throw fail(
        409,
        "Review the exact payer, plan and dated supervision billing rule.",
      );
    supervisor = (await list(ctx, "provider", {}, db)).find(
      (p) => p.data.accountId === provider.data.supervisorAccountId,
    );
    if (rollout.entry?.requiresSupervision && Number(supervisor?.canonicalUserId) !== Number(rollout.entry.supervisorUserId))
      throw fail(409, 'The assigned supervisor differs from this provider’s billing rollout. Review the mapping.');
    if (
      !supervisor ||
      !providerEligible(supervisor, { date: note.data.serviceDate }) ||
      !validNpi(supervisor.data.npi) ||
      note.data.cosignedBy !== supervisor.data.accountId ||
      note.data.cosignedHash !== note.data.signedHash
    )
      throw fail(
        409,
        "The assigned supervisor and exact note cosign must be current.",
      );
    if (
      !supervisor.data.payerEnrollments?.some(
        (e) =>
          e.payerId === payer.id &&
          e.verified &&
          (!e.expires || e.expires >= note.data.serviceDate),
      )
    )
      throw fail(409, "Review supervisor payer enrollment.");
    rendering = rule.mapping === "supervisor_rendering" ? supervisor : provider;
    emitSupervisor = rule.mapping === "service_rendering_with_supervisor";
  }
  if (rollout.entry?.requiresSupervision && !provider.data.supervisionRequired)
    throw fail(409, 'Configure supervised billing for this pilot provider before submitting.');
  if (
    !insurance?.verifiedForClaims ||
    insurance.primary.payerId !== payer.data.electronicPayerId
  )
    throw fail(
      409,
      "Review matching patient insurance and electronic payer identity.",
    );
  if (
    note.data.source !== "auricwell" ||
    note.data.signedHash !== claim.data.noteHash ||
    !["signed", "cosigned"].includes(note.data.status) ||
    (note.data.requiresCosign && note.data.status !== "cosigned")
  )
    throw fail(409, "The source note is no longer ready for this claim.");
  if (
    !ctx.settings.services?.some(
      (s) => s.code === note.data.serviceCode && s.active !== false,
    )
  )
    throw fail(
      409,
      "The billed service is no longer available in this practice.",
    );
  if (
    !providerEligible(provider, {
      service: note.data.serviceCode,
      date: note.data.serviceDate,
    })
  )
    throw fail(409, "Provider service eligibility changed.");
  if (
    !provider.data.payerEnrollments?.some(
      (e) =>
        e.payerId === payer.id &&
        e.verified === true &&
        (!e.expires || e.expires >= note.data.serviceDate),
    )
  )
    throw fail(409, "Review provider enrollment for this payer.");
  const practice = ctx.settings.billingIdentity;
  if (!practice || !validNpi(practice.billingNpi) || !practice.reviewedAt)
    throw fail(
      409,
      "Review practice billing identity before submitting claims.",
    );
  const lines = [
    {
      id: `${claim.id}-1`,
      procedure_code: note.data.serviceCode,
      service_date: note.data.serviceDate,
      charge_cents: claim.data.amountCents,
      units: claim.data.units || 1,
      modifiers_json: claim.data.modifiers || [],
      diagnosis_pointers: "1",
    },
  ];
  const firstName = text(
      rendering.data.billingFirstName,
      "Rendering billing first name",
      100,
    ),
    lastName = text(
      rendering.data.billingLastName,
      "Rendering billing last name",
      100,
    );
  if (!/^[A-Z0-9]{10}$/.test(rendering.data.taxonomy || ""))
    throw fail(409, "Review the rendering billing taxonomy.");
  const supervisorFirst = emitSupervisor
      ? text(
          supervisor.data.billingFirstName,
          "Supervisor billing first name",
          100,
        )
      : "",
    supervisorLast = emitSupervisor
      ? text(
          supervisor.data.billingLastName,
          "Supervisor billing last name",
          100,
        )
      : "";
  const payload = buildClaimMdJsonClaim(
    {
      id: claim.id,
      claim_number: claim.id.replaceAll("-", "").slice(0, 32),
      billing_npi: practice.billingNpi,
      rendering_npi: rendering.data.npi,
      rendering_first_name: firstName,
      rendering_last_name: lastName,
      date_of_service: note.data.serviceDate,
      place_of_service: claim.data.placeOfService || "11",
      diagnosis_codes_json: note.data.diagnoses,
      taxonomy_code: rendering.data.taxonomy,
      ...(emitSupervisor
        ? {
            supervising_provider: {
              npi: supervisor.data.npi,
              firstName: supervisorFirst,
              lastName: supervisorLast,
            },
          }
        : {}),
    },
    lines,
    {
      insurance,
      practice: {
        name: practice.legalName,
        phone_number: practice.phone,
        tax_id: practice.taxId,
        street_address: practice.address,
        city: practice.city,
        state: practice.state,
        postal_code: practice.postalCode,
      },
    },
  );
  payload.remote_claimid = `AW-${claim.id}`;
  return {
    payload,
    sourceHash: hash(
      JSON.stringify({
        noteRevision: note.revision,
        providerRevision: provider.revision,
        supervisorRevision: supervisor?.revision || null,
        payerRevision: payer.revision,
        insuranceRevision: insuranceRecord.revision,
        insuranceFingerprint: insuranceRecord.sharedFingerprint,
        practice,
        rolloutRevision: rollout.revision,
        payload,
      }),
    ),
  };
}
export async function reviewSubmission(ctx, id, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  const claim = await get(ctx, "claim", id);
  if (!["draft", "reviewed"].includes(claim.data.status))
    throw fail(409, "This claim cannot be prepared for transmission.");
  const snapshot = await claimPayload(ctx, claim);
  const reviewHash = hash(JSON.stringify(snapshot));
  if (input.approve !== true)
    return { ...snapshot, reviewHash, revision: claim.revision };
  if (
    input.reviewHash !== reviewHash ||
    Number(input.revision) !== claim.revision
  )
    throw fail(409, "Review the current complete claim payload.");
  return update(ctx, claim, {
    ...claim.data,
    status: "reviewed",
    submissionSnapshot: snapshot,
    reviewHash,
    approvedBy: ctx.accountId,
    approvedAt: new Date().toISOString(),
  });
}
export async function transmitClaim(ctx, id, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  const config = integration(ctx, "claims", true);
  const key = claimKey(ctx);
  if (!key) throw fail(409, "Clearinghouse credentials unavailable.");
  const reserved = await transaction(async (db) => {
    const claim = await get(ctx, "claim", id, db, true);
    if (
      claim.data.status !== "reviewed" ||
      !claim.data.submissionSnapshot ||
      input.reviewHash !== claim.data.reviewHash
    )
      throw fail(409, "The exact transmission payload needs approval.");
    const snapshot = await claimPayload(ctx, claim, db);
    if (hash(JSON.stringify(snapshot)) !== claim.data.reviewHash)
      throw fail(409, "Claim source data changed. Review again.");
    return update(
      ctx,
      claim,
      {
        ...claim.data,
        status: "transmitting",
        mode: config.mode,
        transmissionStartedAt: new Date().toISOString(),
      },
      db,
    );
  });
  try {
    const response = await uploadClaims({
      accountKey: key,
      fileContents: JSON.stringify({
        claim: [reserved.data.submissionSnapshot.payload],
      }),
      filename: "auricwell-claims.json",
    });
    return await update(ctx, reserved, {
      ...reserved.data,
      status: "submitted",
      response,
      transmittedAt: new Date().toISOString(),
    });
  } catch (e) {
    try {
      await update(ctx, reserved, {
        ...reserved.data,
        status: "transmission_uncertain",
        error: "Check the clearinghouse before any retry.",
      });
    } catch {
      /* Persisted transmitting reservation also prevents retry. */
    }
    throw fail(
      502,
      "Submission outcome needs reconciliation. No automatic retry will occur.",
    );
  }
}
export async function syncResponses(ctx) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  integration(ctx, "claims");
  const states = await list(ctx, "claim_sync");
  const cursor = states[0]?.data.cursor || "0";
  const response = await fetchResponses({
    accountKey: claimKey(ctx),
    responseId: cursor,
  });
  const rows = Array.isArray(response.claim)
    ? response.claim
    : response.claim
      ? [response.claim]
      : [];
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const claims = await list(ctx, "claim", { limit: 10000 }, db);
    let updated = 0,
      nextCursor = BigInt(cursor);
    for (const row of rows) {
      if (!/^\d+$/.test(String(row.response_id || ""))) continue;
      nextCursor =
        nextCursor > BigInt(row.response_id)
          ? nextCursor
          : BigInt(row.response_id);
      const match = claims.find(
        (c) => `AW-${c.id}` === String(row.remote_claimid),
      );
      if (!match) continue; // Shared-account responses are never exposed across practices.
      const claim = await get(ctx, "claim", match.id, db);
      const existing = (
        await list(
          ctx,
          "claim_response",
          { patientId: claim.patientId, limit: 10000 },
          db,
        )
      ).find((r) => r.data.responseId === String(row.response_id));
      if (existing) continue;
      await create(
        ctx,
        "claim_response",
        {
          claimId: claim.id,
          responseId: String(row.response_id),
          response: row,
        },
        { patientId: claim.patientId, sourceKey: String(row.response_id) },
        db,
      );
      await update(
        ctx,
        claim,
        {
          ...claim.data,
          clearinghouseStatus: row.status,
          lastResponseId: String(row.response_id),
          status: ["paid", "denied", "adjusted"].includes(claim.data.status)
            ? claim.data.status
            : "response_received",
        },
        db,
      );
      updated++;
    }
    const current = (await list(ctx, "claim_sync", {}, db))[0];
    if (current)
      await update(
        ctx,
        current,
        {
          cursor: String(
            nextCursor > BigInt(current.data.cursor)
              ? nextCursor
              : BigInt(current.data.cursor),
          ),
        },
        db,
      );
    else
      await create(
        ctx,
        "claim_sync",
        { cursor: String(nextCursor) },
        { sourceKey: "cursor" },
        db,
      );
    return { updated };
  });
}
export async function checkEligibility(ctx, patientId) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  integration(ctx, "claims");
  await patientAccess(ctx, patientId);
  const insurance = await insuranceSnapshot(ctx, patientId, pool);
  if (insurance.requiresConsolidation)
    throw fail(
      409,
      "Review the earlier insurance against the shared chart before checking eligibility.",
    );
  if (!insurance?.data.verifiedForClaims)
    throw fail(409, "Review insurance before checking eligibility.");
  const i = insurance.data,
    b = ctx.settings.billingIdentity;
  if (!b?.billingNpi) throw fail(409, "Configure practice billing NPI.");
  const response = await requestEligibilityJson({
    accountKey: claimKey(ctx),
    payload: {
      payerid: i.primary.payerId,
      ins_number: i.primary.memberId,
      pat_name_f: i.patient.firstName,
      pat_name_l: i.patient.lastName,
      pat_dob: i.patient.dateOfBirth,
      prov_npi: b.billingNpi,
    },
  });
  return create(
    ctx,
    "eligibility",
    { response, checkedAt: new Date().toISOString(), checkedBy: ctx.accountId },
    { patientId },
  );
}
export async function startPayment(ctx, patientId, input) {
  const config = integration(ctx, "payments", true);
  requirePatientBilling(ctx, patientId);
  await patientAccess(ctx, patientId);
  money(input.amountCents);
  if (!input.consent || input.amountCents < 1)
    throw fail(400, "Confirm the payment amount and your consent.");
  const reservation = await transaction(async (db) => {
    await lockPractice(ctx, db);
    const balance = ledgerBalance(
      await list(ctx, "ledger", { patientId, limit: 10000 }, db),
    );
    if (input.amountCents > balance)
      throw fail(409, "Payment exceeds the current patient balance.");
    const attempts = await list(
      ctx,
      "payment_attempt",
      { patientId, limit: 10000 },
      db,
    );
    const pending = attempts.find(
      (a) => !["succeeded", "canceled"].includes(a.data.status),
    );
    if (pending) {
      if (
        pending.data.accountId !== ctx.accountId ||
        pending.data.amountCents !== input.amountCents
      )
        throw fail(409, "An existing payment must be reconciled first.");
      return pending;
    }
    return create(
      ctx,
      "payment_attempt",
      {
        amountCents: input.amountCents,
        currency: "usd",
        accountId: ctx.accountId,
        connectedAccountId: config.connectedAccountId,
        status: "reserved",
        consentAt: new Date().toISOString(),
        mode: config.mode,
      },
      { patientId },
      db,
    );
  });
  if (
    !reservation.data.intentId &&
    Date.now() - new Date(reservation.createdAt).getTime() > 23 * 3600000
  )
    throw fail(
      409,
      "This payment needs processor reconciliation before retrying.",
    );
  const intent = reservation.data.intentId
    ? await StripePaymentsService.retrievePaymentIntent(
        reservation.data.intentId,
        reservation.data.connectedAccountId,
      )
    : await StripePaymentsService.createPaymentIntent({
        amountCents: reservation.data.amountCents,
        currency: "usd",
        connectedAccountId: reservation.data.connectedAccountId,
        idempotencyKey: `aw-payment:${reservation.id}`,
        metadata: { auricwell_attempt: reservation.id },
      });
  if (
    intent.amount !== reservation.data.amountCents ||
    intent.currency !== "usd"
  )
    throw fail(409, "Payment processor returned an unexpected amount.");
  if (!reservation.data.intentId)
    await update(ctx, reservation, {
      ...reservation.data,
      intentId: intent.id,
      status: intent.status,
    });
  return {
    attemptId: reservation.id,
    clientSecret: intent.client_secret,
    connectedAccountId: reservation.data.connectedAccountId,
    publishableKey: getStripePublishableKey(),
  };
}
export async function reconcilePayment(ctx, id) {
  requireCapability(ctx, "billing");
  const r = await get(ctx, "payment_attempt", id);
  await patientAccess(ctx, r.patientId);
  requirePatientBilling(ctx, r.patientId);
  if (
    r.data.accountId !== ctx.accountId &&
    !ctx.permissions.includes("billing")
  )
    throw fail(403, "Payment access required.");
  if (!r.data.intentId)
    throw fail(409, "Resume the existing payment to retrieve its status.");
  const intent = await StripePaymentsService.retrievePaymentIntent(
    r.data.intentId,
    r.data.connectedAccountId,
  );
  if (
    intent.amount !== r.data.amountCents ||
    intent.currency !== "usd" ||
    intent.metadata.auricwell_attempt !== r.id
  )
    throw fail(409, "Payment ownership or amount mismatch.");
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const current = await get(ctx, "payment_attempt", id, db, true);
    if (current.data.status === "succeeded") return current;
    if (intent.status === "succeeded") {
      if (intent.amount_received !== current.data.amountCents)
        throw fail(409, "Payment receipt amount mismatch.");
      await create(
        ctx,
        "ledger",
        {
          type: "payment",
          amountCents: intent.amount_received,
          date: new Date().toISOString().slice(0, 10),
          method: "card",
          reason: "Patient card payment",
          source: "stripe",
          paymentAttemptId: id,
          payerAccountId: current.data.accountId,
          currency: "USD",
        },
        { patientId: r.patientId, sourceKey: `stripe:${intent.id}` },
        db,
      );
    }
    return update(
      ctx,
      current,
      {
        ...current.data,
        status: intent.status,
        reconciledAt: new Date().toISOString(),
      },
      db,
    );
  });
}
export async function postRemittance(ctx, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  requirePhi(ctx);
  if (!validDate(input.date))
    throw fail(400, "Choose a valid remittance date.");
  if (input.reviewed !== true)
    throw fail(400, "Review the remittance and patient match before posting.");
  const claim = await get(ctx, "claim", input.claimId);
  const payment = money(input.paymentCents),
    adjustment = money(input.adjustmentCents),
    responsibility = money(input.patientResponsibilityCents);
  if (payment + adjustment + responsibility !== claim.data.amountCents)
    throw fail(
      409,
      "Payment, adjustment and patient responsibility must reconcile to the claim charge.",
    );
  const reference = text(input.reference, "Payer remittance reference", 150);
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const r = await get(ctx, "claim", claim.id, db, true);
    if (r.data.remittancePosted)
      throw fail(
        409,
        "This claim already has a posted remittance. Use a reviewed correction.",
      );
    const historical = await create(
      ctx,
      "remittance",
      {
        claimId: claim.id,
        reference,
        paymentCents: payment,
        adjustmentCents: adjustment,
        patientResponsibilityCents: responsibility,
        reviewedBy: ctx.accountId,
        date: input.date,
      },
      {
        patientId: claim.patientId,
        sourceKey: `${claim.id}:${hash(reference)}`,
      },
      db,
    );
    // Only adjudicated patient responsibility enters the patient ledger; insurance payment is retained on the remittance.
    if (responsibility)
      await create(
        ctx,
        "ledger",
        {
          type: "charge",
          amountCents: responsibility,
          date: input.date,
          method: "insurance",
          reason: "Adjudicated patient responsibility",
          claimId: claim.id,
          remittanceId: historical.id,
          currency: "USD",
        },
        { patientId: claim.patientId, sourceKey: `responsibility:${claim.id}` },
        db,
      );
    return update(
      ctx,
      r,
      {
        ...r.data,
        status: input.denied ? "denied" : "paid",
        remittancePosted: historical.id,
      },
      db,
    );
  });
}
export async function saveBillingIdentity(ctx, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  if (
    !validNpi(input.billingNpi) ||
    !/^\d{9}$/.test(String(input.taxId || "")) ||
    input.reviewed !== true
  )
    throw fail(400, "Review the valid billing NPI and nine-digit tax ID.");
  const identity = Object.fromEntries(
    [
      "legalName",
      "billingNpi",
      "taxId",
      "address",
      "city",
      "state",
      "postalCode",
      "phone",
    ].map((k) => [k, text(input[k], k, 200)]),
  );
  identity.reviewedAt = new Date().toISOString();
  identity.reviewedBy = ctx.accountId;
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const [[row]] = await db.execute(
      "SELECT settings FROM auricwell_practices WHERE id=?",
      [ctx.practiceId],
    );
    const s = open(row.settings, `auricwell:practice:${ctx.practiceId}`);
    s.billingIdentity = identity;
    await db.execute(
      "UPDATE auricwell_practices SET settings=?,revision=revision+1 WHERE id=?",
      [seal(s, `auricwell:practice:${ctx.practiceId}`), ctx.practiceId],
    );
    await audit(ctx, "billing.identity_reviewed", ctx.practiceId, {}, db);
    return { saved: true };
  });
}
export async function refundCardPayment(ctx, ledgerId, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  integration(ctx, "payments", true);
  const payment = await get(ctx, "ledger", ledgerId);
  await patientAccess(ctx, payment.patientId);
  if (payment.data.source !== "stripe" || payment.data.type !== "payment")
    throw fail(400, "Choose a completed card payment.");
  const amount = money(input.amountCents);
  if (!amount) throw fail(400, "Refund amount is required.");
  const reason = text(input.reason, "Refund reason", 1000),
    key = text(input.idempotencyKey, "Refund request key", 100);
  const attempt = await get(
    ctx,
    "payment_attempt",
    payment.data.paymentAttemptId,
  );
  const reserved = await transaction(async (db) => {
    await lockPractice(ctx, db);
    const refunds = (
      await list(
        ctx,
        "refund_attempt",
        { patientId: payment.patientId, limit: 10000 },
        db,
      )
    ).filter((r) => r.data.paymentId === ledgerId);
    const existing = refunds.find((r) => r.data.requestKey === key);
    if (existing) {
      if (
        existing.data.amountCents !== amount ||
        existing.data.reason !== reason
      )
        throw fail(409, "This refund key was used for different details.");
      return existing;
    }
    const used = refunds
      .filter((r) => r.data.status !== "failed")
      .reduce((sum, r) => sum + r.data.amountCents, 0);
    if (used + amount > payment.data.amountCents)
      throw fail(409, "Refund exceeds the remaining payment.");
    return create(
      ctx,
      "refund_attempt",
      {
        paymentId: ledgerId,
        amountCents: amount,
        reason,
        requestKey: key,
        status: "reserved",
        connectedAccountId: attempt.data.connectedAccountId,
        intentId: attempt.data.intentId,
      },
      { patientId: payment.patientId, sourceKey: key },
      db,
    );
  });
  if (reserved.data.status === "succeeded") return reserved;
  if (
    !reserved.data.refundId &&
    Date.now() - new Date(reserved.createdAt).getTime() > 23 * 3600000
  )
    throw fail(
      409,
      "Reconcile this refund with the processor before retrying.",
    );
  const refund = reserved.data.refundId
    ? await StripePaymentsService.retrieveRefund(
        reserved.data.refundId,
        reserved.data.connectedAccountId,
      )
    : await StripePaymentsService.refundPaymentIntent({
        paymentIntentId: reserved.data.intentId,
        amountCents: reserved.data.amountCents,
        connectedAccountId: reserved.data.connectedAccountId,
        idempotencyKey: `aw-refund:${reserved.id}`,
        metadata: { auricwell_refund: reserved.id },
      });
  if (
    refund.amount !== reserved.data.amountCents ||
    refund.payment_intent !== reserved.data.intentId
  )
    throw fail(409, "Processor refund mismatch.");
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const current = await get(ctx, "refund_attempt", reserved.id, db, true);
    if (current.data.status === "succeeded") return current;
    if (refund.status === "succeeded")
      await create(
        ctx,
        "ledger",
        {
          type: "refund",
          amountCents: refund.amount,
          date: new Date().toISOString().slice(0, 10),
          method: "card",
          reason,
          paymentId: ledgerId,
          source: "stripe",
          currency: "USD",
        },
        {
          patientId: payment.patientId,
          sourceKey: `stripe-refund:${refund.id}`,
        },
        db,
      );
    return update(
      ctx,
      current,
      { ...current.data, status: refund.status, refundId: refund.id },
      db,
    );
  });
}
export async function savePayer(ctx, id, input) {
  requirePermission(ctx, "billing");
  requireCapability(ctx, "billing");
  const r = await get(ctx, "payer", id);
  if (input.revision !== r.revision)
    throw fail(
      409,
      "Refresh the payer before reviewing its electronic identity.",
    );
  const reviewed = input.electronicMatchReviewed === true;
  const data = {
    ...r.data,
    name: text(input.name, "Payer name", 200),
    electronicPayerId: text(input.electronicPayerId, "Electronic payer ID", 80),
    electronicMatchReviewed: reviewed,
    matchEvidence: reviewed
      ? text(input.matchEvidence, "Payer identity verification evidence", 2000)
      : null,
    matchReviewedBy: ctx.accountId,
    matchReviewedAt: new Date().toISOString(),
  };
  if (input.supervisionMapping) {
    if (
      !["supervisor_rendering", "service_rendering_with_supervisor"].includes(
        input.supervisionMapping,
      ) ||
      !validDate(input.effectiveFrom) ||
      !validDate(input.effectiveThrough) ||
      input.effectiveThrough < input.effectiveFrom ||
      input.supervisionReviewed !== true
    )
      throw fail(
        400,
        "Review a supported supervision mapping and effective dates.",
      );
    data.supervisionRule = {
      mapping: input.supervisionMapping,
      effectiveFrom: input.effectiveFrom,
      effectiveThrough: input.effectiveThrough,
      planType: text(input.planType, "Exact plan type", 100),
      reference: text(input.ruleReference, "Payer rule reference", 2000),
      reviewed: true,
      reviewedBy: ctx.accountId,
      reviewedAt: new Date().toISOString(),
    };
  }
  return update(ctx, r, data);
}
