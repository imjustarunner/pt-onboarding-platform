import pool from '../config/database.js';
import { requireResponsiblePayer, billingError } from './familyBillingPolicy.service.js';
import { createReceivable } from './familyLedger/receivables.js';
import { parseJson } from './familyLedger/policy.js';
import { assertPackageExpiration } from './bookingPackagePricing.js';
import { eventRegistrationPrice, registrationAudience, registrationPriceCents } from './registrationServiceAudience.service.js';

export async function listClassRegistrationCredits(agencyId, clientId, payerId, db=pool) {
  const [rows] = await db.execute(`SELECT e.id, e.learning_program_class_id AS classId, e.sessions_remaining AS remaining,
    e.activated_at, e.pricing_snapshot_json, p.name, p.allowed_tenant_service_ids_json, k.starts_at
    FROM booking_package_entitlements e JOIN booking_packages p ON p.id=e.package_id AND p.agency_id=e.agency_id
    JOIN learning_program_classes k ON k.id=e.learning_program_class_id
    WHERE e.agency_id=? AND e.client_id=? AND (e.purchaser_user_id IS NULL OR e.purchaser_user_id=?)
    AND e.status='ACTIVE' AND e.payment_status='PAID' AND e.sessions_remaining>0`, [agencyId,clientId,payerId]);
  return rows.filter(credit => {
    const snapshot = parseJson(credit.pricing_snapshot_json, {});
    if (snapshot?.mode==='provider-discount' || parseJson(credit.allowed_tenant_service_ids_json,[])?.length) return false;
    try { assertPackageExpiration(snapshot,credit.activated_at,credit.starts_at || new Date()); return true; }
    catch { return false; }
  }).map(({id,classId,name,remaining})=>({id,classId,name,remaining}));
}

// The caller locks the offering and the participant before creating an order or spending a credit.
export async function createRegistrationOrder({db, agencyId, clientId, actorUserId, offering, kind}) {
  await requireResponsiblePayer(actorUserId, clientId, agencyId, db);
  const audience = registrationAudience(offering);
  const sourceType = kind === 'event' ? 'event_registration' : 'class_registration';
  const quote = kind === 'event' ? eventRegistrationPrice(offering) : null;
  const amountCents = quote?.priceCents ?? registrationPriceCents(Number(offering.registration_price_cents));
  if (!amountCents) throw billingError(409, 'This offering has no registration fee.');
  const payload = kind === 'event' ? {eventId:offering.id, ...quote} : {classId:offering.id};
  const order = await createReceivable({
    agencyId, clientId, actorUserId, sourceType, sourceKey:`${offering.id}:${clientId}`,
    serviceDomain: audience === 'learning' ? 'tutoring' : audience === 'clinical' ? 'clinical' : 'unknown',
    amountCents, payload, serviceLabel:offering.class_name || offering.title || 'Program registration'
  }, db);
  if (order.status === 'void') throw billingError(409, 'This registration balance was voided. Contact the program team.');
  return {orderStatus:order.status, receivableId:Number(order.id)};
}

export async function redeemClassCredit({db, agencyId, clientId, classId, actorUserId, creditId, startsAt}) {
  await requireResponsiblePayer(actorUserId, clientId, agencyId, db);
  const [[order]] = await db.execute(`SELECT status FROM family_receivables WHERE agency_id=? AND
    source_type='class_registration' AND source_key=? AND status<>'void' FOR UPDATE`, [agencyId,`${classId}:${clientId}`]);
  if (order) throw billingError(409, 'There is already a balance for this class registration. Open Billing.');
  const [[credit]] = await db.execute(`SELECT e.*, p.allowed_tenant_service_ids_json FROM booking_package_entitlements e
    JOIN booking_packages p ON p.id=e.package_id AND p.agency_id=e.agency_id
    WHERE e.id=? AND e.agency_id=? AND e.client_id=? AND e.learning_program_class_id=? FOR UPDATE`,
    [creditId,agencyId,clientId,classId]);
  const snapshot = parseJson(credit?.pricing_snapshot_json, {});
  if (!credit || credit.status !== 'ACTIVE' || credit.payment_status !== 'PAID' || Number(credit.sessions_remaining)<1 ||
      (credit.purchaser_user_id && Number(credit.purchaser_user_id)!==Number(actorUserId)) ||
      snapshot?.mode==='provider-discount' || parseJson(credit.allowed_tenant_service_ids_json,[])?.length) {
    throw billingError(409, 'Choose an available registration credit purchased for this participant and class.');
  }
  assertPackageExpiration(snapshot, credit.activated_at, startsAt || new Date());
  const remaining = Number(credit.sessions_remaining)-1;
  const bonus = Math.min(Number(credit.bonus_sessions_remaining || 0), remaining);
  await db.execute(`UPDATE booking_package_entitlements SET sessions_remaining=?,bonus_sessions_remaining=?,
    status=IF(?+sessions_reserved=0,'EXHAUSTED','ACTIVE') WHERE id=?`, [remaining,bonus,remaining,credit.id]);
  await db.execute(`INSERT INTO booking_package_ledger (agency_id, entitlement_id, client_id, direction, quantity,
    reason_code, metadata_json, created_by_user_id) VALUES (?,?,?,'CONSUME',1,'CLASS_REGISTRATION',?,?)`,
    [agencyId,credit.id,clientId,JSON.stringify({classId,bonus:Number(credit.bonus_sessions_remaining || 0)>bonus}),actorUserId]);
}
