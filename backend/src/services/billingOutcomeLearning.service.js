import clinicalPool from '../config/clinicalDatabase.js';
import { upsertBillingClaimOverride } from './applyBillingClaimOverrides.service.js';
import { saveCanonicalFeeSchedule } from './feeSchedule.service.js';

const MODIFIER_REASONS = new Set(['4', 'MODIFIER', 'MOD']);
const POS_REASONS = new Set(['5', '16', 'PLACE_OF_SERVICE', 'POS']);

export function classifyClearinghouseRejection(row = {}) {
  const messages = Array.isArray(row.messages) ? row.messages : row.messages ? [row.messages] : [];
  const fields = messages.map(message => String(message.fields || '')).join(' ').toLowerCase();
  const text = messages.map(message => String(message.message || '')).join(' ').toLowerCase();
  const reasons = [];
  if (/mod/.test(fields) || /modifier/.test(text)) reasons.push('MODIFIER');
  if (/place_of_service|\bpos\b/.test(fields) || /place of service/.test(text)) reasons.push('PLACE_OF_SERVICE');
  if (/proc|diag|units/.test(fields)) reasons.push('SERVICE');
  if (!reasons.length && (row.status === 'R' || messages.some(message => message.status === 'R'))) reasons.push('REVIEW');
  return reasons;
}

export function suggestionForSignal({ outcome, reasonCode, payerId, serviceCode, placeOfService }) {
  const reason = String(reasonCode || '').toUpperCase();
  if (MODIFIER_REASONS.has(reason) && serviceCode) {
    return {
      kind: 'modifier',
      key: `modifier:${payerId || 'any'}:${serviceCode}`,
      prompt: payerId ? `Add a modifier to ${serviceCode} for payer ${payerId}?` : `Add a modifier to all ${serviceCode}?`,
      payload: { payerId: payerId || null, serviceCode, modifier: serviceCode === 'H0002' ? 'U9' : null }
    };
  }
  if (POS_REASONS.has(reason) && payerId && placeOfService && placeOfService !== '11') {
    return {
      kind: 'place_of_service',
      key: `pos:${payerId}:${placeOfService}`,
      prompt: `Send POS 11 instead of ${placeOfService} for payer ${payerId}?`,
      payload: { payerId, from: placeOfService, to: '11' }
    };
  }
  if (outcome === 'denied' || outcome === 'rejected') {
    return {
      kind: 'review',
      key: `review:${payerId || 'any'}:${serviceCode || 'any'}:${reason}`,
      prompt: `Review the ${reason.toLowerCase().replaceAll('_', ' ')} result${serviceCode ? ` on ${serviceCode}` : ''}${payerId ? ` for ${payerId}` : ''} and decide whether the default should change.`,
      payload: { payerId: payerId || null, serviceCode: serviceCode || null, reason }
    };
  }
  return null;
}

async function claimContext(agencyId, claimId, db) {
  const [[claim]] = await db.execute(`SELECT id, destination_payer_id, place_of_service, date_of_service FROM clinical_claims WHERE id = ? AND agency_id = ?`, [claimId, agencyId]);
  if (!claim) return null;
  const [lines] = await db.execute('SELECT procedure_code, modifiers_json FROM clinical_claim_lines WHERE clinical_claim_id = ? ORDER BY line_number LIMIT 1', [claimId]);
  const line = lines?.[0] || {};
  return {
    payerId: claim.destination_payer_id || null,
    placeOfService: claim.place_of_service || null,
    serviceCode: line.procedure_code || null,
    modifiers: line.modifiers_json || null,
    occurredOn: claim.date_of_service || new Date().toISOString().slice(0, 10)
  };
}

export async function learnFromClaimOutcome({ agencyId, claimId, outcome, reasonCodes = [], db = clinicalPool }) {
  if (!['rejected', 'denied'].includes(outcome)) return { suggestions: [] };
  const context = await claimContext(agencyId, claimId, db);
  if (!context) return { suggestions: [] };
  let reasons = reasonCodes.length ? reasonCodes : [];
  if (!reasons.length && outcome === 'denied') {
    const [adjustments] = await db.execute('SELECT DISTINCT reason_code FROM claimmd_remittance_adjustments WHERE agency_id = ? AND clinical_claim_id = ?', [agencyId, claimId]);
    reasons = adjustments.map(row => row.reason_code);
  }
  if (!reasons.length) reasons = [outcome === 'denied' ? 'DENIED' : 'REVIEW'];
  const suggestions = [];
  for (const reasonCode of [...new Set(reasons.map(code => String(code || '').toUpperCase()).filter(Boolean))]) {
    await db.execute(`INSERT IGNORE INTO claim_outcome_signals
      (agency_id, clinical_claim_id, outcome, reason_code, payer_id, service_code, modifiers_json, place_of_service, occurred_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [agencyId, claimId, outcome, reasonCode.slice(0, 64), context.payerId, context.serviceCode, context.modifiers ? JSON.stringify(context.modifiers) : null, context.placeOfService, String(context.occurredOn).slice(0, 10)]);
    const draft = suggestionForSignal({ outcome, reasonCode, payerId: context.payerId, serviceCode: context.serviceCode, placeOfService: context.placeOfService });
    if (!draft) continue;
    const [countRows] = await db.execute(`SELECT COUNT(*) AS matches FROM claim_outcome_signals WHERE agency_id = ? AND reason_code = ? AND payer_id <=> ? AND service_code <=> ?`, [agencyId, reasonCode.slice(0, 64), context.payerId, context.serviceCode]);
    const matches = Number(countRows?.[0]?.matches || 0);
    if (matches < 2) continue;
    await db.execute(`INSERT INTO billing_rule_suggestions (agency_id, suggestion_key, kind, prompt, payload_json, match_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE match_count = ?, prompt = IF(status = 'pending', VALUES(prompt), prompt)`, [agencyId, draft.key, draft.kind, draft.prompt, JSON.stringify(draft.payload), matches, matches]);
    suggestions.push({ ...draft, matchCount: matches });
  }
  return { suggestions };
}

export async function listBillingSuggestions(agencyId, db = clinicalPool) {
  const [rows] = await db.execute(`SELECT id, suggestion_key, kind, prompt, payload_json, status, match_count, created_at
    FROM billing_rule_suggestions WHERE agency_id = ? AND status = 'pending' ORDER BY match_count DESC, id DESC LIMIT 50`, [agencyId]);
  return rows.map(row => ({ ...row, payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json }));
}

export async function decideBillingSuggestion({ agencyId, suggestionId, decision, actorUserId, modifier, planType, effectiveFrom, effectiveThrough, policyReference, reason, db = clinicalPool }) {
  if (!['accepted', 'dismissed'].includes(decision)) throw Object.assign(new Error('Accept or dismiss the suggestion.'), { status: 400 });
  const [[row]] = await db.execute('SELECT * FROM billing_rule_suggestions WHERE id = ? AND agency_id = ? AND status = \'pending\'', [suggestionId, agencyId]);
  if (!row) throw Object.assign(new Error('This suggestion is no longer pending.'), { status: 409 });
  const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
  if (decision === 'accepted' && row.kind === 'modifier') {
    const code = String(modifier || payload.modifier || '').toUpperCase();
    if (!/^[A-Z0-9]{2}$/.test(code)) throw Object.assign(new Error('Enter the two-character modifier to add.'), { status: 400 });
    if (payload.payerId) {
      await upsertBillingClaimOverride({ agencyId, scope: 'payer', payerId: payload.payerId, planType: planType || null, fieldKey: 'modifiers', serviceCode: payload.serviceCode, toValue: code, notes: reason || row.prompt, policyReference: policyReference || 'Accepted from a repeated claim result', effectiveFrom: effectiveFrom || new Date().toISOString().slice(0, 10), effectiveThrough: effectiveThrough || '2099-12-31', createdByUserId: actorUserId });
    } else {
      const { getCanonicalFeeSchedule } = await import('./feeSchedule.service.js');
      const current = await getCanonicalFeeSchedule({ id: actorUserId, role: 'admin' }, { agencyId, mode: 'insurance', scope: 'practice' });
      await saveCanonicalFeeSchedule({ id: actorUserId, role: 'admin' }, { agencyId, mode: 'insurance', scope: 'practice', serviceCode: payload.serviceCode, revision: current.revision, action: 'set_modifiers', modifiers: [code], reason: reason || row.prompt });
    }
  }
  if (decision === 'accepted' && row.kind === 'place_of_service') {
    await upsertBillingClaimOverride({ agencyId, scope: 'payer', payerId: payload.payerId, planType: planType || null, fieldKey: 'place_of_service', fromValue: payload.from, toValue: payload.to || '11', notes: reason || row.prompt, policyReference: policyReference || 'Accepted from a repeated claim result', effectiveFrom: effectiveFrom || new Date().toISOString().slice(0, 10), effectiveThrough: effectiveThrough || '2099-12-31', createdByUserId: actorUserId });
  }
  if (decision === 'accepted' && row.kind === 'review') throw Object.assign(new Error('This result needs a billing rule written by hand. Dismiss it after you review it.'), { status: 409 });
  await db.execute('UPDATE billing_rule_suggestions SET status = ?, decided_by_user_id = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?', [decision, actorUserId, suggestionId, agencyId]);
  return { id: Number(suggestionId), status: decision };
}
