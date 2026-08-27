import pool from '../config/database.js';
import BookingPackage from '../models/BookingPackage.model.js';
import BookingPackagePayment from '../models/BookingPackagePayment.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import StripePaymentsService, {
  isStripeConfigured,
  getStripePublishableKey
} from './stripePayments.service.js';
import AgencyBusinessType from '../models/AgencyBusinessType.model.js';

async function getAgencyStripeConnectAccountId(agencyId) {
  const [rows] = await pool.execute(
    `SELECT stripe_connect_account_id, stripe_connect_status
     FROM agency_billing_accounts
     WHERE agency_id = ? LIMIT 1`,
    [Number(agencyId)]
  );
  const row = rows?.[0];
  if (row?.stripe_connect_status === 'active' && row?.stripe_connect_account_id) {
    return row.stripe_connect_account_id;
  }
  return null;
}

/**
 * Validate that a learning program class belongs to the agency (organization_id).
 */
export async function assertProgramBelongsToAgency(programId, agencyId) {
  if (programId == null || programId === '') return null;
  const pid = Number(programId);
  if (!pid) {
    throw Object.assign(new Error('Invalid learningProgramClassId'), { status: 400 });
  }
  const klass = await LearningProgramClass.findById(pid);
  if (!klass) {
    throw Object.assign(new Error('Program not found'), { status: 404 });
  }
  const orgId = Number(klass.organization_id || klass.organizationId || 0);
  if (orgId !== Number(agencyId)) {
    throw Object.assign(new Error('Program does not belong to this tenant'), { status: 400 });
  }
  return klass;
}

/**
 * Package is eligible for a tenant service when:
 * - allowedTenantServiceIds is null/empty (any service of the package business type), OR
 * - the service id is in the allow-list.
 */
export function packageMatchesTenantService(pkg, tenantServiceId) {
  const sid = Number(tenantServiceId || 0);
  if (!sid || !pkg) return false;
  const allowed = pkg.allowedTenantServiceIds;
  if (allowed == null) return true;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  return allowed.map((n) => Number(n)).includes(sid);
}

/**
 * Resolve catalog packages for an agency with optional program / public / service filters.
 * When includeTenantWideWithProgram is true and programId is set, returns
 * program packages UNION tenant-wide packages of the same business type.
 * When tenantServiceId is set, only packages attached to that service (or unrestricted) are returned.
 */
export async function resolveCatalog({
  agencyId,
  businessType = null,
  programId = undefined,
  publicOnly = false,
  includeInactive = false,
  includeTenantWideWithProgram = false,
  tenantServiceId = null
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];

  let packages = [];
  if (programId != null && programId !== '' && includeTenantWideWithProgram) {
    const pid = Number(programId);
    const [programPkgs, tenantPkgs] = await Promise.all([
      BookingPackage.listForAgency(aid, {
        includeInactive,
        businessType,
        learningProgramClassId: pid,
        publicOnly
      }),
      BookingPackage.listForAgency(aid, {
        includeInactive,
        businessType,
        tenantWideOnly: true,
        publicOnly
      })
    ]);
    const seen = new Set();
    const merged = [];
    for (const p of [...programPkgs, ...tenantPkgs]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
    packages = merged;
  } else {
    packages = await BookingPackage.listForAgency(aid, {
      includeInactive,
      businessType,
      learningProgramClassId: programId === undefined ? undefined : (programId == null || programId === '' ? null : Number(programId)),
      publicOnly
    });
  }

  const sid = Number(tenantServiceId || 0);
  if (sid > 0) {
    packages = packages.filter((p) => packageMatchesTenantService(p, sid));
  }
  return packages;
}

/**
 * Guardian-facing catalog: public active packages that are tenant-wide tutoring
 * OR scoped to enrolled program ids.
 */
export async function resolveGuardianCatalog({
  agencyId,
  businessType = 'tutoring',
  enrolledProgramIds = []
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const tenantWide = await BookingPackage.listForAgency(aid, {
    businessType,
    tenantWideOnly: true,
    publicOnly: true
  });
  const programIds = [...new Set((enrolledProgramIds || []).map((n) => Number(n)).filter((n) => n > 0))];
  const programPackages = [];
  for (const pid of programIds) {
    const rows = await BookingPackage.listForAgency(aid, {
      businessType,
      learningProgramClassId: pid,
      publicOnly: true
    });
    programPackages.push(...rows);
  }
  const seen = new Set();
  const out = [];
  for (const p of [...tenantWide, ...programPackages]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export async function createPackageForAgency(agencyId, body, actorUserId) {
  const programId = body?.learningProgramClassId ?? body?.learning_program_class_id;
  if (programId != null && programId !== '') {
    await assertProgramBelongsToAgency(programId, agencyId);
  }
  return BookingPackage.create(agencyId, body || {}, actorUserId);
}

export async function updatePackageForAgency(packageId, agencyId, body) {
  const programId = body?.learningProgramClassId ?? body?.learning_program_class_id;
  if (programId != null && programId !== '') {
    await assertProgramBelongsToAgency(programId, agencyId);
  }
  return BookingPackage.update(packageId, agencyId, body || {});
}

/**
 * Post-purchase tutoring hooks: optional subject enroll (milestones seed inside enroll).
 */
export async function runTutoringPostPurchaseHooks({ entitlement, package: pkg, actorUserId = null }) {
  if (!pkg || String(pkg.businessType || '').toLowerCase() !== 'tutoring') return null;
  const domain = pkg.domainConfig || {};
  if (domain.autoEnrollSubject === false) return null;

  try {
    const { enrollStudentSubject, StudentSubject } = await import('./tutoringLearningOs.service.js');
    const existing = await StudentSubject.listByClient(entitlement.clientId).catch(() => []);
    if (Array.isArray(existing) && existing.length > 0) return { enrolled: false, subjects: existing };

    const subjectKey = domain.subjectKey || 'general';
    const subject = await enrollStudentSubject(
      {
        agencyId: entitlement.agencyId,
        clientId: entitlement.clientId,
        subjectKey,
        subjectLabel: domain.subjectLabel || null,
        schoolGrade: domain.schoolGrade || null,
        reasonForTutoring: `Enrolled via package: ${pkg.name}`,
        status: 'baseline_needed'
      },
      actorUserId
    );
    return { enrolled: true, subject };
  } catch (err) {
    console.warn('[unifiedPackage] post-purchase enroll failed:', err?.message || err);
    return { enrolled: false, error: err?.message };
  }
}

/**
 * Start Stripe PaymentIntent checkout for a booking package.
 * Creates PENDING entitlement + payment row.
 */
export async function startPackageCheckout({
  agencyId,
  packageId,
  clientId,
  purchaserUserId = null,
  actorUserId = null,
  paymentMode = 'PAY_IN_FULL'
} = {}) {
  const pkg = await BookingPackage.findById(packageId, agencyId);
  if (!pkg || !pkg.isActive) {
    throw Object.assign(new Error('Package not found'), { status: 404 });
  }
  const amountCents = Math.max(0, Number(pkg.priceCents) || 0);
  if (amountCents < 1) {
    // Free package — activate immediately
    const entitlement = await BookingPackage.activateEntitlement({
      agencyId,
      clientId,
      packageId: pkg.id,
      paymentStatus: 'PAID',
      createdByUserId: actorUserId,
      purchaserUserId
    });
    await BookingPackagePayment.create({
      agencyId,
      clientId,
      entitlementId: entitlement.id,
      packageId: pkg.id,
      amountCents: 0,
      paymentMode: 'FREE',
      paymentStatus: 'SUCCEEDED',
      processor: 'MANUAL',
      paidAt: new Date(),
      createdByUserId: actorUserId,
      metadata: { source: 'unified_booking_package' }
    });
    await runTutoringPostPurchaseHooks({ entitlement, package: pkg, actorUserId });
    return {
      ok: true,
      stripeEnabled: false,
      free: true,
      entitlement,
      amountCents: 0
    };
  }

  const stripeReady = isStripeConfigured();
  const connectedAccountId = await getAgencyStripeConnectAccountId(agencyId);
  if (!stripeReady || !connectedAccountId) {
    throw Object.assign(
      new Error('Online payment is not configured for this organization. Ask staff to activate the package or connect Stripe.'),
      { status: 402 }
    );
  }

  const pending = await BookingPackage.createPendingEntitlement({
    agencyId,
    clientId,
    packageId: pkg.id,
    purchaserUserId,
    createdByUserId: actorUserId
  });

  const intent = await StripePaymentsService.createPaymentIntent({
    amountCents,
    currency: 'usd',
    description: `${pkg.name} (${paymentMode})`,
    metadata: {
      source: 'unified_booking_package',
      package_id: String(pkg.id),
      entitlement_id: String(pending.id),
      agency_id: String(agencyId),
      client_id: String(clientId),
      payment_mode: paymentMode
    },
    connectedAccountId
  });

  await pool.execute(
    `UPDATE booking_package_entitlements SET stripe_payment_intent_id = ? WHERE id = ?`,
    [intent.id, pending.id]
  );

  const payment = await BookingPackagePayment.create({
    agencyId,
    clientId,
    entitlementId: pending.id,
    packageId: pkg.id,
    amountCents,
    paymentMode,
    paymentStatus: 'PENDING',
    processor: 'STRIPE',
    processorIntentId: intent.id,
    createdByUserId: actorUserId,
    metadata: { source: 'unified_booking_package' }
  });

  return {
    ok: true,
    stripeEnabled: true,
    amountCents,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    publishableKey: getStripePublishableKey() || process.env.STRIPE_PUBLISHABLE_KEY || null,
    connectedAccountId,
    entitlementId: pending.id,
    paymentId: payment.id,
    package: pkg
  };
}

/**
 * Confirm PaymentIntent succeeded and activate entitlement.
 * Idempotent if already ACTIVE+PAID.
 */
export async function confirmPackageCheckout({
  agencyId,
  packageId,
  clientId,
  paymentIntentId,
  purchaserUserId = null,
  actorUserId = null
} = {}) {
  const pkg = await BookingPackage.findById(packageId, agencyId);
  if (!pkg) {
    throw Object.assign(new Error('Package not found'), { status: 404 });
  }

  let entitlement = paymentIntentId
    ? await BookingPackage.findEntitlementByPaymentIntent(paymentIntentId, agencyId)
    : null;

  if (entitlement?.status === 'ACTIVE' && entitlement?.paymentStatus === 'PAID') {
    return { ok: true, entitlement, alreadyActivated: true };
  }

  const connectedAccountId = await getAgencyStripeConnectAccountId(agencyId);
  const stripeReady = isStripeConfigured();
  let amountChargedCents = Number(pkg.priceCents || 0);

  if (paymentIntentId && stripeReady) {
    const intent = await StripePaymentsService.retrievePaymentIntent(paymentIntentId, connectedAccountId);
    if (!intent || intent.status !== 'succeeded') {
      throw Object.assign(new Error('Payment has not succeeded yet'), { status: 402 });
    }
    const metaPkg = String(intent.metadata?.package_id || '');
    if (metaPkg && metaPkg !== String(pkg.id)) {
      throw Object.assign(new Error('Payment does not match this package'), { status: 400 });
    }
    amountChargedCents = Number(intent.amount || amountChargedCents);
  } else if (Number(pkg.priceCents || 0) > 0) {
    throw Object.assign(new Error('paymentIntentId is required'), { status: 400 });
  }

  if (!entitlement) {
    entitlement = await BookingPackage.createPendingEntitlement({
      agencyId,
      clientId,
      packageId: pkg.id,
      purchaserUserId,
      stripePaymentIntentId: paymentIntentId || null,
      createdByUserId: actorUserId
    });
  }

  const activated = await BookingPackage.activateEntitlement({
    agencyId,
    clientId,
    packageId: pkg.id,
    paymentStatus: 'PAID',
    createdByUserId: actorUserId,
    purchaserUserId,
    stripePaymentIntentId: paymentIntentId || null,
    entitlementId: entitlement.id
  });

  const existingPayment = paymentIntentId
    ? await BookingPackagePayment.findByIntentId(paymentIntentId)
    : null;
  if (existingPayment) {
    await BookingPackagePayment.update(existingPayment.id, {
      entitlementId: activated.id,
      paymentStatus: 'SUCCEEDED',
      paidAt: new Date()
    });
  } else {
    await BookingPackagePayment.create({
      agencyId,
      clientId,
      entitlementId: activated.id,
      packageId: pkg.id,
      amountCents: amountChargedCents,
      paymentMode: 'PAY_IN_FULL',
      paymentStatus: 'SUCCEEDED',
      processor: paymentIntentId ? 'STRIPE' : 'MANUAL',
      processorIntentId: paymentIntentId || null,
      paidAt: new Date(),
      createdByUserId: actorUserId,
      metadata: { source: 'unified_booking_package' }
    });
  }

  await runTutoringPostPurchaseHooks({ entitlement: activated, package: pkg, actorUserId });

  return { ok: true, entitlement: activated };
}

/**
 * Staff / offline activation with optional payment audit row.
 */
export async function activatePackageManually({
  agencyId,
  clientId,
  packageId,
  paymentStatus = 'PAID',
  amountCents = null,
  paymentMode = 'MANUAL',
  actorUserId = null,
  purchaserUserId = null,
  note = null
} = {}) {
  const pkg = await BookingPackage.findById(packageId, agencyId);
  if (!pkg) {
    throw Object.assign(new Error('Package not found'), { status: 404 });
  }
  const entitlement = await BookingPackage.activateEntitlement({
    agencyId,
    clientId,
    packageId: pkg.id,
    paymentStatus,
    createdByUserId: actorUserId,
    purchaserUserId
  });
  await BookingPackagePayment.create({
    agencyId,
    clientId,
    entitlementId: entitlement.id,
    packageId: pkg.id,
    amountCents: amountCents != null ? Number(amountCents) : Number(pkg.priceCents || 0),
    paymentMode,
    paymentStatus: paymentStatus === 'PAID' ? 'SUCCEEDED' : 'PENDING',
    processor: 'MANUAL',
    paidAt: paymentStatus === 'PAID' ? new Date() : null,
    createdByUserId: actorUserId,
    metadata: { source: 'unified_booking_package', note: note || null }
  });
  await runTutoringPostPurchaseHooks({ entitlement, package: pkg, actorUserId });
  return entitlement;
}

/**
 * Webhook helper: complete activation when PaymentIntent succeeds.
 */
export async function completeCheckoutFromPaymentIntent(paymentIntent) {
  const meta = paymentIntent?.metadata || {};
  if (String(meta.source || '') !== 'unified_booking_package') return null;
  const agencyId = Number(meta.agency_id || 0);
  const packageId = Number(meta.package_id || 0);
  const clientId = Number(meta.client_id || 0);
  if (!agencyId || !packageId || !clientId) return null;

  const existing = await BookingPackage.findEntitlementByPaymentIntent(paymentIntent.id, agencyId);
  if (existing?.status === 'ACTIVE' && existing?.paymentStatus === 'PAID') {
    return existing;
  }

  return confirmPackageCheckout({
    agencyId,
    packageId,
    clientId,
    paymentIntentId: paymentIntent.id,
    purchaserUserId: null,
    actorUserId: null
  });
}

export async function summarizeClientPackageBalance(agencyId, clientId, { businessType = null } = {}) {
  const entitlements = await BookingPackage.listEntitlementsForClient(agencyId, clientId, {
    status: 'ACTIVE',
    businessType
  });
  const remaining = entitlements.reduce((sum, e) => sum + Number(e.sessionsRemaining || 0), 0);
  const reserved = entitlements.reduce((sum, e) => sum + Number(e.sessionsReserved || 0), 0);
  const purchased = entitlements.reduce((sum, e) => sum + Number(e.sessionsPurchased || 0), 0);
  return {
    entitlements,
    totals: {
      sessionsRemaining: remaining,
      sessionsReserved: reserved,
      sessionsPurchased: purchased,
      activePackages: entitlements.length
    }
  };
}

export function normalizeBusinessType(bt) {
  return AgencyBusinessType.normalizeType(bt);
}

export default {
  resolveCatalog,
  resolveGuardianCatalog,
  createPackageForAgency,
  updatePackageForAgency,
  assertProgramBelongsToAgency,
  startPackageCheckout,
  confirmPackageCheckout,
  activatePackageManually,
  completeCheckoutFromPaymentIntent,
  summarizeClientPackageBalance,
  runTutoringPostPurchaseHooks,
  getAgencyStripeConnectAccountId,
  packageMatchesTenantService
};
