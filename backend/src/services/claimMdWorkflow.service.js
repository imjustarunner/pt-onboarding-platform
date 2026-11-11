import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { fetchResponses } from './claimMd.service.js';
import { loadClaimFamily,claimRecordId } from './claimFamily.service.js';
import { classifyClearinghouseRejection, learnFromClaimOutcome } from './billingOutcomeLearning.service.js';

export async function claimFamilyHistory(agencyId,claimId,{before=null}={}) {
  if(before!=null && (!Number.isSafeInteger(Number(before)) || Number(before)<1))throw error(400,'Invalid claim history cursor');
  const family=await loadClaimFamily(agencyId,claimId), ids=family.attempts.map(claimRecordId), marks=ids.map(()=>'?').join(',');
  const [rows]=await clinicalPool.execute(`SELECT e.* FROM claimmd_claim_events e WHERE e.agency_id=? AND e.clinical_claim_id IN (${marks})
    AND NOT EXISTS(SELECT 1 FROM claimmd_claim_events d WHERE d.agency_id=e.agency_id AND d.connection_id=e.connection_id AND d.event_key=e.event_key AND d.clinical_claim_id IN (${marks}) AND d.id<e.id)
    ${before?'AND e.id<?':''} ORDER BY e.id DESC LIMIT 101`,[agencyId,...ids,...ids,...(before?[Number(before)]:[])]);
  const page=rows.slice(0,100), actorIds=[...new Set(page.map(row=>Number(row.actor_user_id)).filter(id=>id>0))];
  const [actors]=actorIds.length?await pool.execute(`SELECT id,first_name,last_name FROM users WHERE id IN (${actorIds.map(()=>'?').join(',')})`,actorIds):[[]];
  const names=new Map(actors.map(actor=>[Number(actor.id),[actor.first_name,actor.last_name].filter(Boolean).join(' ')]));
  const history=page.map(row=>{
    const payload=decryptFamilyBilling(row.payload_encrypted,`claimmd:${agencyId}:${row.clinical_claim_id}:${row.event_key}`);
    const attemptId=row.event_type==='resubmission_created' && ids.includes(Number(payload.claimId)) ? Number(payload.claimId):Number(row.clinical_claim_id);
    return {...payload,id:row.id,type:row.event_type,status:row.status,createdAt:row.created_at,actorUserId:row.actor_user_id,actorName:names.get(Number(row.actor_user_id))||null,attemptId,attemptNumber:ids.indexOf(attemptId)+1};
  }).reverse();
  return {claimReference:family.claimReference,rootClaimId:claimRecordId(family.root),currentAttemptId:claimRecordId(family.current),patientControlNumber:family.patientControlNumber,
    attempts:family.attempts.map((row,index)=>({id:claimRecordId(row),number:index+1,lifecycle:row.claim_lifecycle,submittedAt:row.claimmd_submitted_at,payerReference:row.claim_number || (row.claimmd_submitted_at?String(row.id):null),legacyReference:row.attempt_reference})),
    history,nextBefore:rows.length>100?Number(page.at(-1).id):null};
}

export const asList = value => Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
const error = (status, message) => Object.assign(new Error(message), { status });
export const claimReviewHash = payload => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
export const taxIdHash = value => crypto.createHash('sha256').update(String(value || '').replace(/\D/g, '')).digest('hex');

export function safeEnrollmentUrl(result) {
  const raw = asList(result?.link)[0]?.url;
  let url;
  try { url = new URL(raw); } catch { throw error(502, 'Claim.MD did not return an enrollment link'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.claim.md' || !url.pathname.startsWith('/enroll/') || url.username || url.password) {
    throw error(502, 'Claim.MD returned an unexpected enrollment link');
  }
  return url.href;
}

// Suggestions are field-based review tasks, never guesses at replacement clinical codes.
export function claimResponseSuggestions(row) {
  const messages = asList(row.messages);
  const fields = messages.map(m => String(m.fields || '')).join(' ').toLowerCase();
  const suggestions = [];
  if (/ins_|pat_|payer/.test(fields)) suggestions.push('Verify the patient, subscriber, payer ID and coverage dates against the insurance record.');
  if (/npi|taxid|taxonomy|prov_|bill_/.test(fields)) suggestions.push('Verify billing/rendering provider identifiers and payer enrollment for this agency.');
  if (/proc|mod|diag|units|place_of_service/.test(fields)) suggestions.push('Review service codes, modifiers, diagnosis references and units against the signed note. Clinical changes require the clinician’s review.');
  if (!suggestions.length && (row.status === 'R' || messages.some(m => m.status === 'R'))) suggestions.push('Review the clearinghouse message and source record before correcting or resubmitting this claim.');
  return suggestions;
}

export function responseLifecycle(row) {
  if (row.status === 'R' || asList(row.messages).some(m => m.status === 'R')) return 'rejected';
  // An acknowledgement is not evidence of payer adjudication or payment.
  if (row.status === 'A') return 'submitted';
  return null;
}

export async function recordClaimEvent({ agencyId, claimId, connectionId, eventKey, eventType, status = null, payload, actorUserId = null }, db = clinicalPool) {
  const context = `claimmd:${agencyId}:${claimId}:${eventKey}`;
  const [result] = await db.execute(`INSERT IGNORE INTO claimmd_claim_events
    (agency_id, clinical_claim_id, connection_id, event_key, event_type, status, payload_encrypted, actor_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [agencyId, claimId, connectionId, eventKey, eventType, status, encryptFamilyBilling(payload, context), actorUserId]);
  return result.affectedRows > 0;
}

export async function claimEventHistory(agencyId, claimId) {
  const [rows] = await clinicalPool.execute(`SELECT * FROM claimmd_claim_events WHERE agency_id = ? AND clinical_claim_id = ? ORDER BY id DESC LIMIT 100`, [agencyId, claimId]);
  const actorIds = [...new Set(rows.map(row => Number(row.actor_user_id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  const [actors] = actorIds.length ? await pool.execute(`SELECT id,first_name,last_name FROM users WHERE id IN (${actorIds.map(() => '?').join(',')})`, actorIds) : [[]];
  const names = new Map(actors.map(actor => [Number(actor.id), [actor.first_name, actor.last_name].filter(Boolean).join(' ')]));
  return rows.map(row => ({ ...decryptFamilyBilling(row.payload_encrypted, `claimmd:${agencyId}:${claimId}:${row.event_key}`),
    id: row.id, type: row.event_type, status: row.status, createdAt: row.created_at,
    actorUserId: row.actor_user_id, actorName: names.get(Number(row.actor_user_id)) || null }));
}

export async function syncClaimMdResponses({ agencyId, connection, db = clinicalPool, download = fetchResponses }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('INSERT IGNORE INTO claimmd_sync_state (agency_id, connection_id) VALUES (?, ?)', [agencyId, connection.connectionId]);
    const [[state]] = await conn.execute('SELECT last_response_id FROM claimmd_sync_state WHERE agency_id = ? AND connection_id = ? FOR UPDATE', [agencyId, connection.connectionId]);
    const result = await download({ agencyId, accountKey: connection.accountKey, responseId: state.last_response_id });
    const cursor = String(result.last_responseid || state.last_response_id);
    if (!/^\d{1,40}$/.test(cursor) || BigInt(cursor) < BigInt(state.last_response_id)) throw error(502, 'Claim.MD returned an invalid response cursor');
    let updated = 0;
    const rejected = [];
    // Scope locally before exposing or persisting any response from the shared account.
    for (const row of asList(result.claim)) {
      const remoteId = String(row.remote_claimid || '');
      const remote = remoteId.match(/^PT-(\d+)-(\d+)$/);
      if (!remote || Number(remote[1]) !== Number(agencyId)) continue;
      const [[claim]] = await conn.execute(`SELECT id, claimmd_claim_id, claimmd_last_response_id, claim_lifecycle FROM clinical_claims
        WHERE id = ? AND agency_id = ? AND claimmd_connection_id = ? AND is_deleted = 0 FOR UPDATE`, [remote[2], agencyId, connection.connectionId]);
      if (!claim || (claim.claimmd_claim_id && String(claim.claimmd_claim_id) !== String(row.claimmd_id || row.claimid))) continue;
      const ids = asList(row.messages).map(m => String(m.responseid || '')).filter(id => /^\d{1,40}$/.test(id));
      if (!ids.length) throw error(502, 'Claim.MD response is missing its event identifier');
      const responseId = ids.reduce((a, b) => BigInt(a) > BigInt(b) ? a : b, '0');
      if (BigInt(responseId) > BigInt(cursor)) throw error(502, 'Claim.MD response exceeds its cursor');
      const lifecycle = responseLifecycle(row);
      const inserted = await recordClaimEvent({ agencyId, claimId: claim.id, connectionId: connection.connectionId,
        eventKey: `response:${responseId}`, eventType: 'response', status: row.status || null,
        payload: { messages: asList(row.messages), sender: row.sender_name || row.senderid, responseTime: row.response_time, suggestions: claimResponseSuggestions(row) } }, conn);
      if (inserted && BigInt(responseId) > BigInt(claim.claimmd_last_response_id || '0')) {
        // Do not overwrite adjudicated balances/statuses based on clearinghouse acknowledgements.
        const next = ['paid', 'denied', 'adjusted', 'void'].includes(claim.claim_lifecycle) ? claim.claim_lifecycle : lifecycle || claim.claim_lifecycle;
        await conn.execute(`UPDATE clinical_claims SET claim_lifecycle = ?, claimmd_last_status = ?, claimmd_last_response_id = ?, claimmd_claim_id = COALESCE(claimmd_claim_id, ?) WHERE id = ? AND agency_id = ?`,
          [next, String(row.status || 'unknown'), responseId, String(row.claimmd_id || row.claimid || '') || null, claim.id, agencyId]);
        updated++;
        if (next === 'rejected') rejected.push({ claimId: claim.id, reasons: classifyClearinghouseRejection(row) });
      }
    }
    await conn.execute('UPDATE claimmd_sync_state SET last_response_id = ?, synced_at = NOW() WHERE agency_id = ? AND connection_id = ?', [cursor, agencyId, connection.connectionId]);
    await conn.commit();
    if (db === clinicalPool) {
      for (const item of rejected) {
        try {
          await learnFromClaimOutcome({ agencyId, claimId: item.claimId, outcome: 'rejected', reasonCodes: item.reasons });
        } catch (learningError) {
          if (learningError?.code !== 'ER_NO_SUCH_TABLE') console.error('Billing outcome learning skipped:', learningError?.code || learningError?.message);
        }
      }
    }
    return { updated, syncedAt: new Date().toISOString(), moreAvailable: asList(result.claim).length >= 20000 };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

export function verifyClaimMdWebhook(rawBody, signature, accountKey) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(accountKey, 'latin1')).update(rawBody).digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
