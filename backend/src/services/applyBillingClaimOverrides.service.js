import pool from '../config/database.js';

function normPos(v) {
  if (v == null || v === '') return null;
  return String(v).trim().padStart(2, '0').slice(-2);
}

function payerMatches(ruleName, clientPayer) {
  const a = String(ruleName || '').trim().toLowerCase();
  const b = String(clientPayer || '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

/**
 * Apply claim-side overrides (never mutates schedule/session POS).
 * Most specific wins: claim → client → payer.
 */
export async function applyBillingClaimOverrides({
  agencyId,
  clientId = null,
  claimId = null,
  placeOfService = null,
  payerName = null
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { placeOfService: placeOfService || null, applied: [] };

  let resolvedPayer = payerName || null;
  if (!resolvedPayer && clientId) {
    try {
      const [rows] = await pool.execute(
        `SELECT primary_insurer_name FROM clients WHERE id = ? LIMIT 1`,
        [Number(clientId)]
      );
      resolvedPayer = rows?.[0]?.primary_insurer_name || null;
    } catch {
      resolvedPayer = null;
    }
  }

  let rules = [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, scope, payer_name, client_id, claim_id, field_key, from_value, to_value
       FROM billing_claim_overrides
       WHERE agency_id = ?
         AND is_active = 1
         AND field_key = 'place_of_service'
       ORDER BY
         CASE scope WHEN 'claim' THEN 1 WHEN 'client' THEN 2 WHEN 'payer' THEN 3 ELSE 9 END,
         id DESC`,
      [aid]
    );
    rules = rows || [];
  } catch (e) {
    if (String(e?.code || '') === 'ER_NO_SUCH_TABLE' || String(e?.message || '').includes('billing_claim_overrides')) {
      return { placeOfService: placeOfService || null, applied: [] };
    }
    throw e;
  }

  let pos = placeOfService || null;
  const applied = [];
  const current = normPos(pos);

  for (const rule of rules) {
    const scope = String(rule.scope || '').toLowerCase();
    if (scope === 'claim') {
      if (!claimId || Number(rule.claim_id) !== Number(claimId)) continue;
    } else if (scope === 'client') {
      if (!clientId || Number(rule.client_id) !== Number(clientId)) continue;
    } else if (scope === 'payer') {
      if (!payerMatches(rule.payer_name, resolvedPayer)) continue;
    } else {
      continue;
    }

    const from = normPos(rule.from_value);
    const to = normPos(rule.to_value);
    if (!to) continue;
    if (from && current && from !== current) continue;
    if (!from && !current) continue;

    pos = to;
    applied.push({
      overrideId: Number(rule.id),
      scope,
      field: 'place_of_service',
      from: from || current,
      to
    });
    break;
  }

  return { placeOfService: pos, applied, payerName: resolvedPayer };
}

export async function listBillingClaimOverrides(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT * FROM billing_claim_overrides
     WHERE agency_id = ?
     ORDER BY is_active DESC, scope ASC, id DESC`,
    [aid]
  );
  return rows || [];
}

export async function upsertBillingClaimOverride(row = {}) {
  const id = Number(row.id || 0) || null;
  const agencyId = Number(row.agencyId || row.agency_id || 0);
  if (!agencyId) throw Object.assign(new Error('agencyId required'), { status: 400 });
  const scope = String(row.scope || 'payer').toLowerCase();
  if (!['payer', 'client', 'claim'].includes(scope)) {
    throw Object.assign(new Error('scope must be payer, client, or claim'), { status: 400 });
  }
  const fieldKey = String(row.fieldKey || row.field_key || 'place_of_service').trim() || 'place_of_service';
  const toValue = String(row.toValue || row.to_value || '').trim();
  if (!toValue) throw Object.assign(new Error('toValue required'), { status: 400 });

  const payload = {
    agency_id: agencyId,
    scope,
    payer_name: row.payerName || row.payer_name || null,
    client_id: Number(row.clientId || row.client_id || 0) || null,
    claim_id: Number(row.claimId || row.claim_id || 0) || null,
    field_key: fieldKey,
    from_value: row.fromValue != null ? String(row.fromValue) : (row.from_value != null ? String(row.from_value) : null),
    to_value: toValue,
    is_active: row.isActive === false || row.is_active === 0 || row.is_active === false ? 0 : 1,
    notes: row.notes || null,
    created_by_user_id: Number(row.createdByUserId || row.created_by_user_id || 0) || null,
    updated_by_user_id: Number(row.updatedByUserId || row.updated_by_user_id || 0) || null
  };

  if (id) {
    await pool.execute(
      `UPDATE billing_claim_overrides SET
         scope = ?, payer_name = ?, client_id = ?, claim_id = ?,
         field_key = ?, from_value = ?, to_value = ?, is_active = ?, notes = ?,
         updated_by_user_id = ?
       WHERE id = ? AND agency_id = ?`,
      [
        payload.scope,
        payload.payer_name,
        payload.client_id,
        payload.claim_id,
        payload.field_key,
        payload.from_value,
        payload.to_value,
        payload.is_active,
        payload.notes,
        payload.updated_by_user_id,
        id,
        agencyId
      ]
    );
    return { id, ...payload };
  }

  const [result] = await pool.execute(
    `INSERT INTO billing_claim_overrides
     (agency_id, scope, payer_name, client_id, claim_id, field_key, from_value, to_value, is_active, notes, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.agency_id,
      payload.scope,
      payload.payer_name,
      payload.client_id,
      payload.claim_id,
      payload.field_key,
      payload.from_value,
      payload.to_value,
      payload.is_active,
      payload.notes,
      payload.created_by_user_id,
      payload.updated_by_user_id
    ]
  );
  return { id: result.insertId, ...payload };
}

export default {
  applyBillingClaimOverrides,
  listBillingClaimOverrides,
  upsertBillingClaimOverride
};
