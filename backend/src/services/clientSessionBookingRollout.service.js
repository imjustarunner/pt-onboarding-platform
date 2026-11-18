import pool from '../config/database.js';
import { isNluTutoringQaAgency, allowNluQaProvider } from '../utils/nluTutoringQaPolicy.js';
import { isAuricwellQaAgency, allowQaExchangeRecipient } from '../utils/auricwellQaPolicy.js';
import { parseFeatureFlags } from './medicalBillingFlags.service.js';
import { readProviderServices } from './providerServiceOfferings.service.js';
import { staffCareEligibility, readStaffCareEligibility } from './staffCareEligibility.service.js';

export const SESSION_BOOKING_COMING_SOON = 'Client session booking is coming soon for this provider. A practice administrator must enable their transition from TherapyNotes.';
const fail = (status, message) => Object.assign(new Error(message), { status, code: 'CLIENT_SESSION_BOOKING_NOT_ENABLED' });
const empty = () => ({ revision: 0, entries: [] });
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
export async function providerConversionPending(agencyId,providerUserId,db=pool){
 if(Number(agencyId)!==2)return null;
 try{const result=await db.execute('SELECT id,state FROM provider_account_conversions WHERE agency_id=? AND provider_user_id=?',[agencyId,providerUserId]);const row=Array.isArray(result?.[0])?result[0][0]:null;return row?.id && typeof row.state==='string' && row.state!=='active'?row:null;}
 catch(cause){if(cause.code==='ER_NO_SUCH_TABLE')return null;throw cause;}
}
export async function providerHasGroupPasswordAccess(agencyId,providerUserId,db=pool){
 if(Number(agencyId)!==2)return true;
 const result=await db.execute('SELECT id,work_email,personal_email,password_hash,temporary_password_hash,sso_password_override,login_is_group_email FROM users WHERE id=?',[providerUserId]);
 const person=Array.isArray(result?.[0])?result[0][0]:null;
 return !!(person && [true,1,'1'].includes(person.login_is_group_email) && [true,1,'1'].includes(person.sso_password_override) && person.password_hash && !person.temporary_password_hash && person.personal_email && person.work_email && String(person.personal_email).trim().toLowerCase()!==String(person.work_email).trim().toLowerCase());
}
export function evaluateClientSessionBooking(policy, providerUserId) {
  const entry = Array.isArray(policy?.entries) ? policy.entries.find(row => Number(row.providerUserId) === Number(providerUserId)) : null;
  const enabled = id(providerUserId) && (entry ? entry.enabled === true : policy?.enabledForAllProviders === true);
  return { enabled, reason: enabled ? null : SESSION_BOOKING_COMING_SOON, revision: Number(policy?.revision || 0) };
}
export async function readClientSessionBookingRollout(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id = ?', [agencyId]);
  if (!agency) throw fail(404, 'Practice not found.');
  const policy = parseFeatureFlags(agency.feature_flags).clientSessionBookingRollout;
  return policy && Array.isArray(policy.entries) ? policy : empty();
}
export async function canStaffScheduleBeforeProviderActivation(agencyId, providerUserId, actorUserId, db = pool) {
  if (Number(agencyId) !== 2 || !id(actorUserId) || Number(actorUserId) === Number(providerUserId)) return false;
  const [[actor]] = await db.execute(`SELECT u.role,u.is_active,u.status,COALESCE(u.is_archived,0) AS is_archived,
      COALESCE(ua.is_active,0) AS membership_active
    FROM users u LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? WHERE u.id=?`, [agencyId,actorUserId]);
  const role = String(actor?.role || '').toLowerCase();
  const active = [true,1,'1'].includes(actor?.is_active) && ![true,1,'1'].includes(actor?.is_archived)
    && ['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(actor?.status || '').toUpperCase());
  return active && ['support','admin','super_admin'].includes(role)
    && (role === 'super_admin' || [true,1,'1'].includes(actor?.membership_active));
}
export async function clientSessionBookingAccess(agencyId, providerUserId, db = pool, { businessType, actorUserId } = {}) {
  if (businessType === 'any') {
    const [clinical,tutoring]=await Promise.all([
      clientSessionBookingAccess(agencyId,providerUserId,db,{actorUserId}),
      clientSessionBookingAccess(agencyId,providerUserId,db,{businessType:'tutoring',actorUserId})
    ]);
    const availableBusinessTypes=[...(clinical.enabled?['mental_health']:[]),...(tutoring.enabled?['tutoring']:[])];
    return {enabled:availableBusinessTypes.length>0,availableBusinessTypes,reason:availableBusinessTypes.length?null:'No assigned service is currently available for scheduling in this organization.'};
  }
  if (businessType === 'tutoring') {
    const offered = await readProviderServices(providerUserId, agencyId, db);
    const enabled = Boolean(offered.careEligibility.canProvideCare||offered.careEligibility.canProvideTutoring) && offered.services.some(service => service.serviceType === 'tutoring' && service.offered);
    return { enabled, businessType: 'tutoring', reason: enabled ? null : 'An active tutoring assignment is required in this organization.' };
  }
  const review = evaluateClientSessionBooking(await readClientSessionBookingRollout(agencyId, db), providerUserId);
  if(review.enabled && (!(await providerHasGroupPasswordAccess(agencyId,providerUserId,db)) || await providerConversionPending(agencyId,providerUserId,db))){review.enabled=false;review.reason='This provider’s individual account transition is awaiting Group password access, personal recovery and mail verification.';}
  if (!review.enabled) {
    if (!(await canStaffScheduleBeforeProviderActivation(agencyId,providerUserId,actorUserId,db))) return review;
    const care = await readStaffCareEligibility(providerUserId,agencyId,db);
    return care.canProvideCare
      ? {...review,enabled:true,reason:null,staffScheduling:true,providerSelfSchedulingEnabled:false}
      : {...review,reason:care.reason};
  }
  const care = await readStaffCareEligibility(providerUserId, agencyId, db);
  return care.canProvideCare ? review : { ...review, enabled: false, reason: care.reason };
}
export async function requireClientSessionBooking(agencyId, providerUserId, db = pool, options = {}) {
  const review = await clientSessionBookingAccess(agencyId, providerUserId, db, options);
  if (!review.enabled) throw fail(403, review.reason);
  return review;
}
export async function sessionBookingProviders(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id = ?', [agencyId]);
  const nluQa=isNluTutoringQaAgency(agency);
  const qa = isAuricwellQaAgency(agency)||nluQa;
  const [rows] = await db.execute(`SELECT u.id,u.email,u.is_demo,u.first_name,u.preferred_name,u.last_name,u.role,u.credential,u.status,u.is_active,
      u.sees_clients,u.has_provider_access,ua.agency_role,COALESCE(ua.is_active,1) AS membership_active,p.public_details_json
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id
    WHERE COALESCE(u.is_archived,0)=0 AND (COALESCE(u.is_demo,0)=0 OR ?=1)
    ORDER BY u.last_name,u.first_name`, [agencyId, qa ? 1 : 0]);
  let pending=new Set();
  if(Number(agencyId)===2)try{const [conversions]=await db.execute("SELECT provider_user_id FROM provider_account_conversions WHERE agency_id=2 AND state<>'active'");pending=new Set((Array.isArray(conversions)?conversions:[]).map(row=>Number(row.provider_user_id)));}catch(cause){if(cause.code!=='ER_NO_SUCH_TABLE')throw cause;}
  return rows.filter(row => (!qa ? !Number(row.is_demo) : nluQa ? allowNluQaProvider(agency,row) : allowQaExchangeRecipient(agency, row)) && (staffCareEligibility(row, agencyId).canProvideCare || staffCareEligibility(row, agencyId).canProvideTutoring)).map(row => ({
    id: Number(row.id), name: `${row.preferred_name || row.first_name || ''} ${row.last_name || ''}`.trim(),...(pending.has(Number(row.id))?{accountConversionPending:true}:{})
  }));
}
export async function saveClientSessionBookingRollout({ agencyId, actorUserId, input, conversionId=null }, dbPool = pool) {
  const providerUserIds = [...new Set(Array.isArray(input.providerUserIds) ? input.providerUserIds.map(Number) : [])];
  if (!providerUserIds.length || providerUserIds.length > 10 || providerUserIds.some(value => !id(value)))
    throw fail(400, 'Select between 1 and 10 providers for this cohort.');
  if (typeof input.enabled !== 'boolean') throw fail(400, 'Choose whether to enable or pause session booking.');
  if (input.enabled && input.transitionReviewed !== true) throw fail(400, 'Confirm the selected providers are ready to transition session scheduling from TherapyNotes.');
  const note = String(input.note || '').trim();
  if (!note || note.length > 1000) throw fail(400, 'Add a short transition note (up to 1000 characters; no client information).');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id = ? FOR UPDATE', [agencyId]);
    if (!agency) throw fail(404, 'Practice not found.');
    const flags = parseFeatureFlags(agency.feature_flags);
    const current = flags.clientSessionBookingRollout || empty();
    if (Number(input.revision) !== Number(current.revision)) throw fail(409, 'The rollout changed. Refresh before saving.');
    const providers = await sessionBookingProviders(agencyId, db);
    if (providerUserIds.some(providerId => !providers.some(provider => provider.id === providerId)))
      throw fail(403, 'Only active client-facing providers in this practice can be selected.');
    if(input.enabled)for(const providerId of providerUserIds){const pending=await providerConversionPending(agencyId,providerId,db);if(pending && (pending.id!==conversionId || pending.state!=='ready'))throw fail(409,'Finish verified individual account conversion before enabling self-scheduling.');if(!(await providerHasGroupPasswordAccess(agencyId,providerId,db)))throw fail(409,'Use this provider’s Individual account conversion before enabling ITSCO self-scheduling.');if(Number(agencyId)===2 && !pending){const [[person]]=await db.execute('SELECT work_email,login_is_group_email FROM users WHERE id=?',[providerId]);await(await import('./hireGroupEmail.service.js')).ensureHireGroupEmailForActivation(person);}}
    if (Number(agencyId) === 2 && input.enabled && flags.transitionWeek?.enforceCohorts === true) {
      const { readTransitionWeek } = await import('./transitionWeek.service.js');
      const { assertTransitionBookingCohort } = await import('../utils/transitionWeekPolicy.js');
      assertTransitionBookingCohort((await readTransitionWeek(agencyId, db)).state, providerUserIds);
    }
    const updatedAt = new Date().toISOString();
    const entries = (current.entries || []).filter(entry => !providerUserIds.includes(Number(entry.providerUserId)));
    for (const providerUserId of providerUserIds) {
      entries.push({ providerUserId, enabled: input.enabled, note, updatedByUserId: actorUserId, updatedAt });

    }
    const policy = { ...current, revision: Number(current.revision) + 1, entries, history: [...(current.history || []), { providerUserIds, enabled: input.enabled, note, updatedByUserId: actorUserId, updatedAt }] };
    await db.execute(`UPDATE agencies SET feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.clientSessionBookingRollout', CAST(? AS JSON)) WHERE id = ?`, [JSON.stringify(policy), agencyId]);
    await db.commit();
    return policy;
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
