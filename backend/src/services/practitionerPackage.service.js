import crypto from 'crypto';
import pool from '../config/database.js';
import PractitionerSessionPackage from '../models/PractitionerSessionPackage.model.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function toSqlDatetime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

/** Amount due now for the selected payment mode (cents). */
export function resolveChargeAmountCents(pkg, paymentMode) {
  const mode = String(paymentMode || pkg?.payment_mode_default || 'PAY_IN_FULL').toUpperCase();
  const list = Number(pkg?.price_cents || 0);
  if (mode === 'PAY_IN_FULL') {
    if (pkg?.pay_in_full_price_cents != null) return Math.max(0, Number(pkg.pay_in_full_price_cents));
    if (pkg?.pay_in_full_discount_cents) {
      return Math.max(0, list - Number(pkg.pay_in_full_discount_cents));
    }
    return Math.max(0, list);
  }
  if (mode === 'PER_SESSION') {
    if (pkg?.per_session_price_cents != null) return Math.max(0, Number(pkg.per_session_price_cents));
    const sessions = Math.max(1, Number(pkg?.session_count || 1));
    return Math.max(0, Math.round(list / sessions));
  }
  if (mode === 'INSTALLMENTS') {
    const plan = pkg?.installment_plan || {};
    if (Array.isArray(plan.amountsCents) && plan.amountsCents.length) {
      return Math.max(0, Number(plan.amountsCents[0] || 0));
    }
    const chunks = Math.max(2, Number(plan.chunks || 4));
    return Math.max(0, Math.ceil(list / chunks));
  }
  return Math.max(0, list);
}

export function buildInstallmentState(pkg, paymentMode) {
  const mode = String(paymentMode || '').toUpperCase();
  if (mode !== 'INSTALLMENTS') return null;
  const plan = pkg?.installment_plan || {};
  const chunks = Math.max(2, Number(plan.chunks || 4));
  const list = Number(pkg?.price_cents || 0);
  const amounts = Array.isArray(plan.amountsCents) && plan.amountsCents.length === chunks
    ? plan.amountsCents.map((n) => Math.max(0, Number(n || 0)))
    : Array.from({ length: chunks }, (_, i) => {
        const base = Math.floor(list / chunks);
        return i === chunks - 1 ? list - base * (chunks - 1) : base;
      });
  return {
    chunks,
    intervalDays: Math.max(1, Number(plan.intervalDays || 30)),
    amountsCents: amounts,
    paidIndexes: [0],
    nextDueAt: new Date(Date.now() + Math.max(1, Number(plan.intervalDays || 30)) * 86400000).toISOString()
  };
}

async function promoteClientStatus({ agencyId, clientId, statusKey, actorUserId = null }) {
  const statusId = await getClientStatusIdByKey({ agencyId, statusKey });
  if (!statusId) return false;
  await Client.update(clientId, { client_status_id: statusId }, actorUserId);
  return true;
}

export async function resolveAgencySlug(agencyId) {
  const agency = await Agency.findById(agencyId);
  return agency?.slug || null;
}

export function buildPacketUrl(slug, token) {
  if (!slug || !token) return null;
  const path = `/${encodeURIComponent(slug)}/packet/${encodeURIComponent(token)}`;
  return FRONTEND_URL ? `${FRONTEND_URL}${path}` : path;
}

export async function getClientSessionBalance(agencyId, clientId) {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN quantity ELSE 0 END), 0) AS credits,
       COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN quantity ELSE 0 END), 0) AS debits
     FROM practitioner_session_credit_ledger
     WHERE agency_id = ? AND client_id = ?`,
    [Number(agencyId), Number(clientId)]
  );
  const credits = Number(rows?.[0]?.credits || 0);
  const debits = Number(rows?.[0]?.debits || 0);
  return { credits, debits, remaining: Math.max(0, credits - debits) };
}

export async function creditPackageSessions({
  agencyId,
  clientId,
  packageId,
  packetId = null,
  quantity,
  reasonCode = 'PACKAGE_PURCHASE',
  metadata = null,
  createdByUserId = null
}) {
  const qty = Math.max(1, Number(quantity || 1));
  const [result] = await pool.execute(
    `INSERT INTO practitioner_session_credit_ledger
      (agency_id, client_id, package_id, packet_id, direction, quantity, reason_code, metadata_json, created_by_user_id)
     VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)`,
    [
      Number(agencyId),
      Number(clientId),
      packageId ? Number(packageId) : null,
      packetId ? Number(packetId) : null,
      qty,
      String(reasonCode),
      metadata ? JSON.stringify(metadata) : null,
      createdByUserId ? Number(createdByUserId) : null
    ]
  );
  return result.insertId;
}

export async function debitSessionOnComplete({
  agencyId,
  clientId,
  providerScheduleEventId = null,
  packageId = null,
  entitlementId = null,
  createdByUserId = null
}) {
  const balance = await getClientSessionBalance(agencyId, clientId);
  if (balance.remaining < 1) {
    return { debited: false, remaining: 0, reason: 'NO_BALANCE' };
  }
  if (providerScheduleEventId) {
    const [existing] = await pool.execute(
      `SELECT id FROM practitioner_session_credit_ledger
       WHERE agency_id = ? AND client_id = ? AND provider_schedule_event_id = ?
         AND direction = 'DEBIT' AND reason_code = 'SESSION_COMPLETED'
       LIMIT 1`,
      [Number(agencyId), Number(clientId), Number(providerScheduleEventId)]
    );
    if (existing?.length) {
      return { debited: false, remaining: balance.remaining, reason: 'ALREADY_DEBITED' };
    }
  }

  let entitlement = null;
  if (entitlementId) {
    const [rows] = await pool.execute(
      `SELECT * FROM practitioner_client_package_entitlements WHERE id = ? LIMIT 1`,
      [Number(entitlementId)]
    );
    entitlement = rows?.[0] || null;
  } else {
    const [rows] = await pool.execute(
      `SELECT * FROM practitioner_client_package_entitlements
       WHERE agency_id = ? AND client_id = ? AND status = 'ACTIVE'
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId), Number(clientId)]
    );
    entitlement = rows?.[0] || null;
  }
  if (!entitlement) {
    return { debited: false, remaining: balance.remaining, reason: 'NO_ENTITLEMENT' };
  }

  const pkgId = packageId || entitlement.package_id;
  const purchased = Number(entitlement.sessions_purchased || 0);
  const remainingBefore = Number(entitlement.sessions_remaining || 0);
  const sessionIndex = Math.max(1, purchased - remainingBefore + 1);

  // Prefer package-level payment (pay-in-full / plan) covering sessions
  const [payRows] = await pool.execute(
    `SELECT id FROM practitioner_package_payments
     WHERE entitlement_id = ? AND payment_status = 'SUCCEEDED'
       AND (provider_schedule_event_id IS NULL OR provider_schedule_event_id = ?)
     ORDER BY
       CASE WHEN provider_schedule_event_id = ? THEN 0 ELSE 1 END,
       id ASC
     LIMIT 1`,
    [
      Number(entitlement.id),
      providerScheduleEventId ? Number(providerScheduleEventId) : 0,
      providerScheduleEventId ? Number(providerScheduleEventId) : 0
    ]
  );
  const packagePaymentId = payRows?.[0]?.id ? Number(payRows[0].id) : null;

  const [ins] = await pool.execute(
    `INSERT INTO practitioner_session_credit_ledger
      (agency_id, client_id, package_id, packet_id, entitlement_id, package_payment_id,
       provider_schedule_event_id, direction, quantity, reason_code, metadata_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'DEBIT', 1, 'SESSION_COMPLETED', ?, ?)`,
    [
      Number(agencyId),
      Number(clientId),
      pkgId ? Number(pkgId) : null,
      entitlement.packet_id || null,
      Number(entitlement.id),
      packagePaymentId,
      providerScheduleEventId ? Number(providerScheduleEventId) : null,
      JSON.stringify({
        sessionIndex,
        sessionsPurchased: purchased,
        entitlementId: Number(entitlement.id),
        packagePaymentId
      }),
      createdByUserId ? Number(createdByUserId) : null
    ]
  );

  const remaining = Math.max(0, remainingBefore - 1);
  await pool.execute(
    `UPDATE practitioner_client_package_entitlements
     SET sessions_remaining = ?,
         status = CASE WHEN ? <= 0 THEN 'EXHAUSTED' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [remaining, remaining, entitlement.id]
  );

  if (providerScheduleEventId) {
    await pool.execute(
      `UPDATE provider_schedule_events
       SET client_id = COALESCE(client_id, ?),
           entitlement_id = COALESCE(entitlement_id, ?),
           package_payment_id = COALESCE(package_payment_id, ?),
           session_index = COALESCE(session_index, ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        Number(clientId),
        Number(entitlement.id),
        packagePaymentId,
        sessionIndex,
        Number(providerScheduleEventId)
      ]
    ).catch(() => {});
  }

  const next = await getClientSessionBalance(agencyId, clientId);
  return {
    debited: true,
    remaining: next.remaining,
    reason: 'OK',
    ledgerId: ins.insertId,
    sessionIndex,
    sessionsPurchased: purchased,
    entitlementId: Number(entitlement.id),
    packagePaymentId,
    exhausted: remaining <= 0
  };
}

export async function applyMissedSessionPolicy({
  agencyId,
  clientId,
  entitlementId = null,
  createdByUserId = null
}) {
  let entitlement = null;
  if (entitlementId) {
    const [rows] = await pool.execute(
      `SELECT * FROM practitioner_client_package_entitlements WHERE id = ? LIMIT 1`,
      [Number(entitlementId)]
    );
    entitlement = rows?.[0] || null;
  } else {
    const [rows] = await pool.execute(
      `SELECT * FROM practitioner_client_package_entitlements
       WHERE agency_id = ? AND client_id = ? AND status = 'ACTIVE'
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId), Number(clientId)]
    );
    entitlement = rows?.[0] || null;
  }
  if (!entitlement) return { applied: false, action: 'NONE' };

  const pkg = entitlement.package_id
    ? await PractitionerSessionPackage.findById(entitlement.package_id)
    : null;
  const policy = pkg?.missed_session_policy || { type: 'forfeit', freeRebooks: 0 };

  if (policy.type === 'free_rebook' && Number(entitlement.free_rebooks_remaining || 0) > 0) {
    await pool.execute(
      `UPDATE practitioner_client_package_entitlements
       SET free_rebooks_remaining = GREATEST(0, free_rebooks_remaining - 1), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [entitlement.id]
    );
    await pool.execute(
      `INSERT INTO practitioner_session_credit_ledger
        (agency_id, client_id, package_id, packet_id, direction, quantity, reason_code, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, 'CREDIT', 0, 'FREE_REBOOK', ?, ?)`,
      [
        Number(agencyId),
        Number(clientId),
        entitlement.package_id,
        entitlement.packet_id,
        JSON.stringify({ note: 'Used free rebook; session credit retained' }),
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return { applied: true, action: 'FREE_REBOOK', feeCents: 0 };
  }

  if (policy.type === 'fee') {
    return {
      applied: true,
      action: 'FEE',
      feeCents: Number(policy.feeCents || 0),
      note: policy.note || null
    };
  }

  // forfeit (default): debit one session
  await pool.execute(
    `INSERT INTO practitioner_session_credit_ledger
      (agency_id, client_id, package_id, packet_id, direction, quantity, reason_code, created_by_user_id)
     VALUES (?, ?, ?, ?, 'DEBIT', 1, 'MISSED_FORFEIT', ?)`,
    [
      Number(agencyId),
      Number(clientId),
      entitlement.package_id,
      entitlement.packet_id,
      createdByUserId ? Number(createdByUserId) : null
    ]
  );
  await pool.execute(
    `UPDATE practitioner_client_package_entitlements
     SET sessions_remaining = GREATEST(0, sessions_remaining - 1),
         status = CASE WHEN sessions_remaining - 1 <= 0 THEN 'EXHAUSTED' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [entitlement.id]
  );
  return { applied: true, action: 'FORFEIT', feeCents: 0 };
}

export async function createClientPacket({
  agencyId,
  clientId,
  providerId,
  offeredPackageIds = [],
  intakeLinkIds = [],
  notes = null,
  createdByUserId = null,
  send = true,
  clientEmail = null,
  clientName = null
}) {
  const ids = (Array.isArray(offeredPackageIds) ? offeredPackageIds : [])
    .map((x) => Number(x))
    .filter((n) => n > 0);
  if (!ids.length) throw Object.assign(new Error('Select at least one package to offer'), { status: 400 });

  // Ensure packages belong to agency
  const catalog = await PractitionerSessionPackage.listByAgency(agencyId, { includeInactive: true });
  const allowed = new Set(catalog.map((p) => p.id));
  for (const id of ids) {
    if (!allowed.has(id)) throw Object.assign(new Error(`Package ${id} not in this tenant catalog`), { status: 400 });
  }

  const accessToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [result] = await pool.execute(
    `INSERT INTO practitioner_client_packets
      (agency_id, client_id, provider_id, access_token, token_expires_at, status,
       offered_package_ids_json, intake_link_ids_json, notes, sent_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(agencyId),
      Number(clientId),
      Number(providerId),
      accessToken,
      toSqlDatetime(expires),
      send ? 'SENT' : 'DRAFT',
      JSON.stringify(ids),
      JSON.stringify(Array.isArray(intakeLinkIds) ? intakeLinkIds : []),
      notes ? String(notes) : null,
      send ? toSqlDatetime(new Date()) : null,
      createdByUserId ? Number(createdByUserId) : null
    ]
  );
  const packet = await findPacketById(result.insertId);

  if (send) {
    await promoteClientStatus({
      agencyId,
      clientId,
      statusKey: 'packet',
      actorUserId: createdByUserId
    }).catch(() => {});

    const email = String(clientEmail || '').trim().toLowerCase();
    if (email) {
      const slug = await resolveAgencySlug(agencyId);
      const joinUrl = buildPacketUrl(slug, packet.access_token);
      const name = String(clientName || '').trim() || `Client #${clientId}`;
      const agency = await Agency.findById(agencyId);
      const brand = agency?.name || 'your coach';
      if (joinUrl) {
        await sendNotificationEmail({
          agencyId,
          triggerKey: 'practitioner_packet_invite',
          to: email,
          subject: `Your coaching package options from ${brand}`,
          text: `Hi ${name},\n\nPlease review your package options and choose how you'd like to continue:\n\n${joinUrl}\n\nThis private link is just for you.`,
          html: `<p>Hi ${name},</p><p>Please review your package options and choose how you'd like to continue:</p><p><a href="${joinUrl}">Open your package options</a></p><p>This private link is just for you.</p>`,
          source: 'auto',
          templateType: 'practitioner_packet_invite'
        }).catch((e) => {
          console.warn('Packet invite email failed:', e?.message || e);
        });
      }
    }
  }

  return packet;
}

export async function findPacketById(id) {
  const [rows] = await pool.execute(
    `SELECT * FROM practitioner_client_packets WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydratePacket(rows?.[0] || null);
}

export async function findPacketByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM practitioner_client_packets WHERE access_token = ? LIMIT 1`,
    [String(token || '').trim()]
  );
  return hydratePacket(rows?.[0] || null);
}

function hydratePacket(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    offered_package_ids: parseJson(row.offered_package_ids_json, []),
    intake_link_ids: parseJson(row.intake_link_ids_json, []),
    completed_intake_link_ids: parseJson(row.completed_intake_link_ids_json, []),
    account_user_id: row.account_user_id != null ? Number(row.account_user_id) : null
  };
}

/**
 * Record package selection + payment. Leaves packet IN_PROGRESS until docs + account finish.
 */
export async function activatePackageSelection({
  packetId,
  packageId,
  paymentMode,
  createdByUserId = null,
  paymentStatus = 'PAID',
  stripePaymentIntentId = null,
  amountChargedCents = null
}) {
  const packet = await findPacketById(packetId);
  if (!packet) throw Object.assign(new Error('Packet not found'), { status: 404 });
  if (String(packet.status || '').toUpperCase() === 'COMPLETED') {
    throw Object.assign(new Error('This packet is already completed'), { status: 409 });
  }
  if (packet.selected_package_id) {
    return {
      packet,
      entitlementId: null,
      sessionsCredited: 0,
      paymentStatus: null,
      alreadyActivated: true
    };
  }
  const offered = packet.offered_package_ids || [];
  if (!offered.map(Number).includes(Number(packageId))) {
    throw Object.assign(new Error('Package was not offered on this packet'), { status: 400 });
  }
  const pkg = await PractitionerSessionPackage.findById(packageId);
  if (!pkg) throw Object.assign(new Error('Package not found'), { status: 404 });

  const mode = String(paymentMode || pkg.payment_mode_default || 'PAY_IN_FULL').toUpperCase();
  const freeRebooks = Number(pkg.missed_session_policy?.freeRebooks || 0);
  const installmentState = buildInstallmentState(pkg, mode);
  let status = String(paymentStatus || 'PAID').toUpperCase();
  if (mode !== 'PAY_IN_FULL' && status === 'PAID') {
    status = 'PARTIAL';
  }

  await pool.execute(
    `UPDATE practitioner_client_packets
     SET selected_package_id = ?, selected_payment_mode = ?, status = 'IN_PROGRESS',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(packageId), mode, Number(packetId)]
  );

  const [ent] = await pool.execute(
    `INSERT INTO practitioner_client_package_entitlements
      (agency_id, client_id, package_id, packet_id, sessions_purchased, sessions_remaining,
       free_rebooks_remaining, payment_mode, payment_status, installment_state_json, status, activated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)`,
    [
      packet.agency_id,
      packet.client_id,
      Number(packageId),
      Number(packetId),
      pkg.session_count,
      pkg.session_count,
      freeRebooks,
      mode,
      status,
      installmentState ? JSON.stringify(installmentState) : null
    ]
  );
  const entitlementId = ent.insertId;

  const creditLedgerId = await creditPackageSessions({
    agencyId: packet.agency_id,
    clientId: packet.client_id,
    packageId,
    packetId,
    quantity: pkg.session_count,
    reasonCode: 'PACKAGE_PURCHASE',
    metadata: {
      paymentMode: mode,
      paymentStatus: status,
      stripePaymentIntentId: stripePaymentIntentId || null,
      amountChargedCents: amountChargedCents != null ? Number(amountChargedCents) : null,
      entitlementId
    },
    createdByUserId
  });

  await pool.execute(
    `UPDATE practitioner_session_credit_ledger SET entitlement_id = ? WHERE id = ?`,
    [entitlementId, creditLedgerId]
  ).catch(() => {});

  let paymentId = null;
  if (status === 'PAID' || status === 'PARTIAL' || amountChargedCents != null) {
    const amount = amountChargedCents != null
      ? Number(amountChargedCents)
      : resolveChargeAmountCents(pkg, mode);
    const payStatus = status === 'PENDING' ? 'PENDING' : 'SUCCEEDED';
    const [pay] = await pool.execute(
      `INSERT INTO practitioner_package_payments
        (agency_id, client_id, entitlement_id, packet_id, package_id, ledger_id,
         amount_cents, currency, payment_mode, installment_index, sessions_covered,
         payment_status, processor, processor_intent_id, chosen_at, paid_at, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'usd', ?, ?, ?, ?, 'STRIPE', ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [
        packet.agency_id,
        packet.client_id,
        entitlementId,
        Number(packetId),
        Number(packageId),
        creditLedgerId || null,
        Math.max(0, amount),
        mode,
        mode === 'INSTALLMENTS' ? 1 : null,
        mode === 'PER_SESSION' ? 1 : pkg.session_count,
        payStatus,
        stripePaymentIntentId || null,
        payStatus === 'SUCCEEDED' ? new Date() : null,
        JSON.stringify({
          source: 'packet_checkout',
          paymentStatus: status
        }),
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    paymentId = pay.insertId;
    await pool.execute(
      `UPDATE practitioner_session_credit_ledger SET package_payment_id = ? WHERE id = ?`,
      [paymentId, creditLedgerId]
    ).catch(() => {});
  }

  return {
    packet: await findPacketById(packetId),
    entitlementId,
    paymentId,
    sessionsCredited: pkg.session_count,
    paymentStatus: status,
    alreadyActivated: false
  };
}

export async function markPacketIntakeLinkComplete({ packetId, intakeLinkId }) {
  const packet = await findPacketById(packetId);
  if (!packet) throw Object.assign(new Error('Packet not found'), { status: 404 });
  const offered = (packet.intake_link_ids || []).map(Number);
  const linkId = Number(intakeLinkId);
  if (!offered.includes(linkId)) {
    throw Object.assign(new Error('This document step was not included in the packet'), { status: 400 });
  }
  const done = new Set((packet.completed_intake_link_ids || []).map(Number));
  done.add(linkId);
  const completed = [...done];
  await pool.execute(
    `UPDATE practitioner_client_packets
     SET completed_intake_link_ids_json = ?, status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(completed), Number(packetId)]
  );
  return findPacketById(packetId);
}

/**
 * Create portal login (email + password) for the packet client, then finalize.
 */
export async function createPacketPortalAccount({
  packetId,
  email,
  password,
  firstName = null,
  lastName = null
}) {
  const packet = await findPacketById(packetId);
  if (!packet) throw Object.assign(new Error('Packet not found'), { status: 404 });
  if (!packet.selected_package_id) {
    throw Object.assign(new Error('Choose and pay for a package before creating your account'), { status: 400 });
  }

  const offeredLinks = (packet.intake_link_ids || []).map(Number);
  const completedLinks = new Set((packet.completed_intake_link_ids || []).map(Number));
  const missing = offeredLinks.filter((id) => !completedLinks.has(id));
  if (missing.length) {
    throw Object.assign(new Error('Please finish all document steps before creating your account'), { status: 400 });
  }

  if (packet.account_user_id) {
    throw Object.assign(new Error('An account was already created for this packet'), { status: 409 });
  }

  const username = String(email || '').trim().toLowerCase();
  if (!username || !username.includes('@')) {
    throw Object.assign(new Error('A valid email is required as your username'), { status: 400 });
  }

  const { validatePasswordStrength } = await import('../utils/passwordValidation.js');
  const pwCheck = await validatePasswordStrength(password, { accountId: username });
  if (!pwCheck.valid) {
    throw Object.assign(new Error(pwCheck.message || 'Password does not meet requirements'), { status: 400 });
  }

  const existing = await User.findByEmail(username);
  if (existing) {
    const role = String(existing.role || '').toLowerCase();
    if (role !== 'client_guardian') {
      throw Object.assign(new Error('That email is already in use. Try a different email or log in.'), { status: 409 });
    }
    if (existing.password_hash) {
      throw Object.assign(new Error('An account with this email already exists. Please log in instead.'), { status: 409 });
    }
  }

  const bcrypt = (await import('bcrypt')).default;
  const passwordHash = await bcrypt.hash(password, 10);

  const client = await Client.findById(packet.client_id);
  const nameParts = String(client?.full_name || '').trim().split(/\s+/).filter(Boolean);
  const fn = String(firstName || nameParts[0] || 'Client').trim();
  const ln = String(lastName || nameParts.slice(1).join(' ') || 'Portal').trim();

  let user;
  if (existing && !existing.password_hash) {
    await User.changePassword(existing.id, password);
    user = existing;
    if (String(user.status || '').toUpperCase() === 'PENDING_SETUP') {
      await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE', user.id);
    }
  } else {
    user = await User.create({
      email: username,
      passwordHash,
      firstName: fn,
      lastName: ln,
      personalEmail: username,
      role: 'client_guardian',
      status: 'ACTIVE_EMPLOYEE'
    });
  }

  await User.assignToAgency(user.id, packet.agency_id, { isActive: true });
  await ClientGuardian.upsertLink({
    clientId: packet.client_id,
    guardianUserId: user.id,
    relationshipType: 'self',
    relationshipTitle: 'Self',
    accessEnabled: true,
    permissionsJson: { practitionerPacketId: packet.id }
  });

  await pool.execute(
    `UPDATE clients SET guardian_portal_enabled = 1 WHERE id = ?`,
    [Number(packet.client_id)]
  ).catch(() => {});

  await pool.execute(
    `UPDATE practitioner_client_packets
     SET account_user_id = ?, status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(user.id), Number(packetId)]
  );

  await recordPackagePaymentSignedAt({ packetId, signedAt: new Date() }).catch(() => {});

  await promoteClientStatus({
    agencyId: packet.agency_id,
    clientId: packet.client_id,
    statusKey: 'current',
    actorUserId: user.id
  }).catch(() => {});

  return {
    packet: await findPacketById(packetId),
    userId: user.id,
    email: username
  };
}

export async function listIntakeLinksForPacket(packet) {
  const ids = (packet?.intake_link_ids || []).map(Number).filter((n) => n > 0);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, public_key, title, description, form_type, is_active
     FROM intake_links
     WHERE id IN (${placeholders})`,
    ids
  );
  const byId = new Map((rows || []).map((r) => [Number(r.id), r]));
  return ids
    .map((id) => {
      const row = byId.get(id);
      if (!row || !row.is_active) return null;
      return {
        id: Number(row.id),
        publicKey: row.public_key,
        title: row.title || 'Documents',
        description: row.description || null,
        formType: row.form_type || null
      };
    })
    .filter(Boolean);
}

export async function recordPackagePaymentSignedAt({ packetId, signedAt = null }) {
  const when = signedAt || new Date();
  await pool.execute(
    `UPDATE practitioner_package_payments
     SET signed_at = COALESCE(signed_at, ?), updated_at = CURRENT_TIMESTAMP
     WHERE packet_id = ?`,
    [toSqlDatetime(when), Number(packetId)]
  );
}

/**
 * Full packages + payments + session history for a client (admin profile / client portal).
 */
export async function getClientPackageOverview({ agencyId, clientId }) {
  const aId = Number(agencyId);
  const cId = Number(clientId);
  const balance = await getClientSessionBalance(aId, cId);

  const [ents] = await pool.execute(
    `SELECT e.*, p.name AS package_name, p.session_count AS package_session_count,
            p.price_cents, p.per_session_price_cents, p.payment_mode_default,
            pkt.selected_payment_mode, pkt.completed_at AS packet_completed_at,
            pkt.sent_at AS packet_sent_at, pkt.access_token AS packet_token
     FROM practitioner_client_package_entitlements e
     LEFT JOIN practitioner_session_packages p ON p.id = e.package_id
     LEFT JOIN practitioner_client_packets pkt ON pkt.id = e.packet_id
     WHERE e.agency_id = ? AND e.client_id = ?
     ORDER BY e.id DESC`,
    [aId, cId]
  );

  const [payments] = await pool.execute(
    `SELECT pay.*, p.name AS package_name
     FROM practitioner_package_payments pay
     LEFT JOIN practitioner_session_packages p ON p.id = pay.package_id
     WHERE pay.agency_id = ? AND pay.client_id = ?
     ORDER BY pay.id DESC`,
    [aId, cId]
  );

  const [sessions] = await pool.execute(
    `SELECT pse.id, pse.kind, pse.title, pse.start_at, pse.end_at, pse.status,
            pse.session_index, pse.entitlement_id, pse.package_payment_id, pse.client_id,
            e.sessions_purchased, e.sessions_remaining, e.package_id,
            pkg.name AS package_name,
            pay.id AS payment_id, pay.amount_cents, pay.payment_mode, pay.payment_status,
            pay.paid_at, pay.chosen_at, pay.signed_at, pay.processor_intent_id
     FROM provider_schedule_events pse
     LEFT JOIN practitioner_client_package_entitlements e ON e.id = pse.entitlement_id
     LEFT JOIN practitioner_session_packages pkg ON pkg.id = e.package_id
     LEFT JOIN practitioner_package_payments pay ON pay.id = pse.package_payment_id
     WHERE pse.agency_id = ? AND pse.client_id = ?
       AND UPPER(COALESCE(pse.kind,'')) IN ('COACHING','DISCOVERY','COACHING_SESSION')
     ORDER BY pse.start_at DESC
     LIMIT 100`,
    [aId, cId]
  );

  const entitlements = (ents || []).map((e) => {
    const used = Math.max(0, Number(e.sessions_purchased || 0) - Number(e.sessions_remaining || 0));
    return {
      id: Number(e.id),
      packageId: e.package_id ? Number(e.package_id) : null,
      packageName: e.package_name || 'Package',
      packetId: e.packet_id ? Number(e.packet_id) : null,
      sessionsPurchased: Number(e.sessions_purchased || 0),
      sessionsRemaining: Number(e.sessions_remaining || 0),
      sessionsUsed: used,
      sessionLabel: `${used} of ${Number(e.sessions_purchased || 0)} used`,
      paymentMode: e.payment_mode,
      paymentStatus: e.payment_status,
      status: e.status,
      activatedAt: e.activated_at,
      packetCompletedAt: e.packet_completed_at,
      packetSentAt: e.packet_sent_at,
      priceCents: e.price_cents != null ? Number(e.price_cents) : null,
      perSessionPriceCents: e.per_session_price_cents != null ? Number(e.per_session_price_cents) : null
    };
  });

  const active = entitlements.find((e) => e.status === 'ACTIVE') || null;
  const exhausted = !active || Number(active.sessionsRemaining || 0) <= 0;

  return {
    balance,
    entitlements,
    payments: (payments || []).map((p) => ({
      id: Number(p.id),
      entitlementId: p.entitlement_id ? Number(p.entitlement_id) : null,
      packageId: p.package_id ? Number(p.package_id) : null,
      packageName: p.package_name || null,
      amountCents: Number(p.amount_cents || 0),
      currency: p.currency || 'usd',
      paymentMode: p.payment_mode,
      installmentIndex: p.installment_index != null ? Number(p.installment_index) : null,
      sessionsCovered: p.sessions_covered != null ? Number(p.sessions_covered) : null,
      paymentStatus: p.payment_status,
      processorIntentId: p.processor_intent_id || null,
      chosenAt: p.chosen_at,
      signedAt: p.signed_at,
      paidAt: p.paid_at,
      providerScheduleEventId: p.provider_schedule_event_id
        ? Number(p.provider_schedule_event_id)
        : null
    })),
    sessions: (sessions || []).map((s) => {
      const purchased = Number(s.sessions_purchased || 0);
      const idx = s.session_index != null ? Number(s.session_index) : null;
      return {
        id: Number(s.id),
        kind: s.kind,
        title: s.title,
        startAt: s.start_at,
        endAt: s.end_at,
        status: s.status,
        sessionIndex: idx,
        sessionsPurchased: purchased || null,
        sessionOfLabel:
          idx && purchased
            ? `Session ${idx} of ${purchased}`
            : String(s.kind || '').toUpperCase() === 'DISCOVERY'
              ? 'Discovery call'
              : null,
        entitlementId: s.entitlement_id ? Number(s.entitlement_id) : null,
        packageId: s.package_id ? Number(s.package_id) : null,
        packageName: s.package_name || null,
        payment: s.payment_id
          ? {
              id: Number(s.payment_id),
              amountCents: Number(s.amount_cents || 0),
              paymentMode: s.payment_mode,
              paymentStatus: s.payment_status,
              paidAt: s.paid_at,
              chosenAt: s.chosen_at,
              signedAt: s.signed_at,
              processorIntentId: s.processor_intent_id || null
            }
          : null
      };
    }),
    continuation: {
      canReup: exhausted && !!active?.packageId,
      canSendNewPackage: true,
      canPayPerSession: true,
      suggestedPackageId: active?.packageId || null,
      remaining: balance.remaining,
      exhausted
    }
  };
}

/**
 * Book a paid coaching session on the calendar, linked to entitlement + covering payment.
 */
export async function bookCoachingSession({
  agencyId,
  providerId,
  clientId,
  startAt,
  endAt,
  entitlementId = null,
  createdByUserId = null,
  title = null
}) {
  const balance = await getClientSessionBalance(agencyId, clientId);
  if (balance.remaining < 1) {
    throw Object.assign(
      new Error('No session credits remaining. Re-up, send a new package, or switch to pay-per-session.'),
      { status: 402, code: 'NO_BALANCE' }
    );
  }

  let entitlement = null;
  if (entitlementId) {
    const [rows] = await pool.execute(
      `SELECT * FROM practitioner_client_package_entitlements WHERE id = ? LIMIT 1`,
      [Number(entitlementId)]
    );
    entitlement = rows?.[0] || null;
  } else {
    const [rows] = await pool.execute(
      `SELECT * FROM practitioner_client_package_entitlements
       WHERE agency_id = ? AND client_id = ? AND status = 'ACTIVE' AND sessions_remaining > 0
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId), Number(clientId)]
    );
    entitlement = rows?.[0] || null;
  }
  if (!entitlement) {
    throw Object.assign(new Error('No active package entitlement found'), { status: 400 });
  }

  const pkg = await PractitionerSessionPackage.findById(entitlement.package_id);
  const client = await Client.findById(clientId);
  const clientName = client?.full_name || client?.initials || `Client #${clientId}`;
  const purchased = Number(entitlement.sessions_purchased || 0);
  const remainingBefore = Number(entitlement.sessions_remaining || 0);
  const sessionIndex = Math.max(1, purchased - remainingBefore + 1);

  const [payRows] = await pool.execute(
    `SELECT id FROM practitioner_package_payments
     WHERE entitlement_id = ? AND payment_status = 'SUCCEEDED'
       AND provider_schedule_event_id IS NULL
     ORDER BY id ASC LIMIT 1`,
    [Number(entitlement.id)]
  );
  const packagePaymentId = payRows?.[0]?.id ? Number(payRows[0].id) : null;

  const sessionTitle =
    title ||
    `Coaching — ${clientName} · Session ${sessionIndex} of ${purchased}` +
      (pkg?.name ? ` · ${pkg.name}` : '');

  const event = await ProviderScheduleEvent.create({
    agencyId,
    providerId,
    clientId,
    entitlementId: entitlement.id,
    packagePaymentId,
    sessionIndex,
    kind: 'COACHING',
    title: sessionTitle,
    description: [
      `Package: ${pkg?.name || 'Session package'}`,
      `Session ${sessionIndex} of ${purchased}`,
      packagePaymentId ? `Payment #${packagePaymentId}` : 'Payment: see client Packages tab'
    ].join('\n'),
    startAt: toSqlDatetime(startAt),
    endAt: toSqlDatetime(endAt),
    createdByUserId
  });

  return {
    event,
    sessionIndex,
    sessionsPurchased: purchased,
    entitlementId: Number(entitlement.id),
    packagePaymentId,
    packageName: pkg?.name || null,
    remainingCredits: balance.remaining
  };
}

/** Enrich schedule-summary events with package / payment / session-of labels. */
export async function enrichScheduleEventsWithPackageContext(events = []) {
  const ids = (events || []).map((e) => Number(e.id || 0)).filter((n) => n > 0);
  if (!ids.length) return events;
  const placeholders = ids.map(() => '?').join(',');
  let rows = [];
  try {
    const [r] = await pool.execute(
      `SELECT pse.id, pse.client_id, pse.entitlement_id, pse.package_payment_id, pse.session_index, pse.kind,
              e.sessions_purchased, e.package_id,
              pkg.name AS package_name,
              pay.id AS payment_id, pay.amount_cents, pay.payment_mode, pay.payment_status, pay.paid_at
       FROM provider_schedule_events pse
       LEFT JOIN practitioner_client_package_entitlements e ON e.id = pse.entitlement_id
       LEFT JOIN practitioner_session_packages pkg ON pkg.id = e.package_id
       LEFT JOIN practitioner_package_payments pay ON pay.id = pse.package_payment_id
       WHERE pse.id IN (${placeholders})`,
      ids
    );
    rows = r || [];
  } catch {
    return events;
  }
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return events.map((ev) => {
    const row = byId.get(Number(ev.id));
    if (!row) return ev;
    const purchased = Number(row.sessions_purchased || 0);
    const idx = row.session_index != null ? Number(row.session_index) : null;
    const kind = String(row.kind || ev.kind || '').toUpperCase();
    return {
      ...ev,
      clientId: row.client_id ? Number(row.client_id) : null,
      entitlementId: row.entitlement_id ? Number(row.entitlement_id) : null,
      packageId: row.package_id ? Number(row.package_id) : null,
      packageName: row.package_name || null,
      sessionIndex: idx,
      sessionsPurchased: purchased || null,
      sessionOfLabel:
        idx && purchased
          ? `Session ${idx} of ${purchased}`
          : kind === 'DISCOVERY'
            ? 'Discovery call'
            : null,
      packagePaymentId: row.package_payment_id ? Number(row.package_payment_id) : null,
      payment: row.payment_id
        ? {
            id: Number(row.payment_id),
            amountCents: Number(row.amount_cents || 0),
            paymentMode: row.payment_mode,
            paymentStatus: row.payment_status,
            paidAt: row.paid_at
          }
        : null
    };
  });
}

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekMonday(d = new Date()) {
  const x = startOfLocalDay(d);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonth(d = new Date()) {
  const x = startOfLocalDay(d);
  x.setDate(1);
  return x;
}

function mapSessionRow(s) {
  const purchased = Number(s.sessions_purchased || 0);
  const idx = s.session_index != null ? Number(s.session_index) : null;
  const kind = String(s.kind || '').toUpperCase();
  return {
    id: Number(s.id),
    kind,
    title: s.title,
    startAt: s.start_at,
    endAt: s.end_at,
    clientId: s.client_id ? Number(s.client_id) : null,
    clientName: s.client_name || null,
    sessionIndex: idx,
    sessionsPurchased: purchased || null,
    sessionOfLabel:
      idx && purchased
        ? `Session ${idx} of ${purchased}`
        : kind === 'DISCOVERY'
          ? 'Discovery call'
          : null,
    entitlementId: s.entitlement_id ? Number(s.entitlement_id) : null,
    packageId: s.package_id ? Number(s.package_id) : null,
    packageName: s.package_name || null,
    packagePaymentId: s.package_payment_id ? Number(s.package_payment_id) : null
  };
}

/**
 * Agency + provider rollup for practitioner home dashboards (Phase 5).
 */
export async function getPractitionerDashboardOverview({ agencyId, providerId }) {
  const aId = Number(agencyId);
  const pId = Number(providerId);
  if (!aId) throw Object.assign(new Error('agencyId required'), { status: 400 });

  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const monthStart = startOfMonth(now);
  const upcomingEnd = new Date(now);
  upcomingEnd.setDate(upcomingEnd.getDate() + 14);
  const todayStart = startOfLocalDay(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [statusRows] = await pool.execute(
    `SELECT LOWER(COALESCE(cs.status_key, 'unknown')) AS status_key, COUNT(*) AS cnt
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.agency_id = ?
       AND UPPER(COALESCE(c.status, '')) NOT IN ('TERMINATED', 'ARCHIVED', 'DELETED')
     GROUP BY LOWER(COALESCE(cs.status_key, 'unknown'))`,
    [aId]
  );

  const statusCounts = {
    prospective: 0,
    screener: 0,
    packet: 0,
    current: 0,
    other: 0
  };
  for (const row of statusRows || []) {
    const key = String(row.status_key || '').toLowerCase();
    const n = Number(row.cnt || 0);
    if (Object.prototype.hasOwnProperty.call(statusCounts, key)) statusCounts[key] = n;
    else statusCounts.other += n;
  }

  let sessionsThisWeek = 0;
  let upcomingSessions = [];
  let recentCompletedSessions = [];
  let sessionsToday = 0;

  if (pId) {
    const sessionSql = `
      SELECT pse.id, pse.kind, pse.title, pse.start_at, pse.end_at, pse.client_id,
             pse.session_index, pse.entitlement_id, pse.package_payment_id,
             e.sessions_purchased, e.package_id, pkg.name AS package_name,
             c.full_name AS client_name, c.initials AS client_initials
      FROM provider_schedule_events pse
      LEFT JOIN practitioner_client_package_entitlements e ON e.id = pse.entitlement_id
      LEFT JOIN practitioner_session_packages pkg ON pkg.id = e.package_id
      LEFT JOIN clients c ON c.id = pse.client_id
      WHERE pse.agency_id = ?
        AND pse.provider_id = ?
        AND UPPER(COALESCE(pse.kind,'')) IN ('COACHING','DISCOVERY','COACHING_SESSION')
        AND pse.start_at >= ? AND pse.start_at < ?
      ORDER BY pse.start_at ASC
      LIMIT 50`;

    const [weekRows] = await pool.execute(sessionSql, [
      aId,
      pId,
      toSqlDatetime(weekStart),
      toSqlDatetime(weekEnd)
    ]).catch(() => [[]]);
    sessionsThisWeek = (weekRows || []).length;
    sessionsToday = (weekRows || []).filter((r) => {
      const t = new Date(r.start_at).getTime();
      return t >= todayStart.getTime() && t < todayEnd.getTime();
    }).length;

    const [upcomingRows] = await pool.execute(sessionSql, [
      aId,
      pId,
      toSqlDatetime(now),
      toSqlDatetime(upcomingEnd)
    ]).catch(() => [[]]);
    upcomingSessions = (upcomingRows || []).map((r) => ({
      ...mapSessionRow(r),
      clientName: r.client_name || r.client_initials || null
    }));

    const [pastRows] = await pool.execute(
      `SELECT pse.id, pse.kind, pse.title, pse.start_at, pse.end_at, pse.client_id,
              pse.session_index, pse.entitlement_id, pse.package_payment_id,
              e.sessions_purchased, e.package_id, pkg.name AS package_name,
              c.full_name AS client_name, c.initials AS client_initials
       FROM provider_schedule_events pse
       LEFT JOIN practitioner_client_package_entitlements e ON e.id = pse.entitlement_id
       LEFT JOIN practitioner_session_packages pkg ON pkg.id = e.package_id
       LEFT JOIN clients c ON c.id = pse.client_id
       WHERE pse.agency_id = ?
         AND pse.provider_id = ?
         AND UPPER(COALESCE(pse.kind,'')) IN ('COACHING','COACHING_SESSION')
         AND pse.start_at < ?
       ORDER BY pse.start_at DESC
       LIMIT 8`,
      [aId, pId, toSqlDatetime(now)]
    ).catch(() => [[]]);
    recentCompletedSessions = (pastRows || []).map((r) => ({
      ...mapSessionRow(r),
      clientName: r.client_name || r.client_initials || null
    }));
  }

  const [revRows] = await pool.execute(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total
     FROM practitioner_package_payments
     WHERE agency_id = ?
       AND payment_status = 'SUCCEEDED'
       AND paid_at >= ?`,
    [aId, toSqlDatetime(monthStart)]
  ).catch(() => [[{ total: 0 }]]);
  const revenueMtdCents = Number(revRows?.[0]?.total || 0);

  const [payRows] = await pool.execute(
    `SELECT pay.id, pay.amount_cents, pay.payment_mode, pay.payment_status, pay.paid_at,
            pay.chosen_at, pay.client_id, pay.package_id, pkg.name AS package_name,
            c.full_name AS client_name
     FROM practitioner_package_payments pay
     LEFT JOIN practitioner_session_packages pkg ON pkg.id = pay.package_id
     LEFT JOIN clients c ON c.id = pay.client_id
     WHERE pay.agency_id = ?
       AND pay.payment_status = 'SUCCEEDED'
     ORDER BY COALESCE(pay.paid_at, pay.created_at) DESC
     LIMIT 8`,
    [aId]
  ).catch(() => [[]]);

  const recentPayments = (payRows || []).map((p) => ({
    id: Number(p.id),
    amountCents: Number(p.amount_cents || 0),
    paymentMode: p.payment_mode,
    paymentStatus: p.payment_status,
    paidAt: p.paid_at,
    chosenAt: p.chosen_at,
    clientId: p.client_id ? Number(p.client_id) : null,
    clientName: p.client_name || null,
    packageId: p.package_id ? Number(p.package_id) : null,
    packageName: p.package_name || null
  }));

  return {
    statusCounts,
    sessionsThisWeek,
    sessionsToday,
    upcomingSessions,
    recentCompletedSessions,
    revenueMtdCents,
    recentPayments,
    window: {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      monthStart: monthStart.toISOString()
    }
  };
}
