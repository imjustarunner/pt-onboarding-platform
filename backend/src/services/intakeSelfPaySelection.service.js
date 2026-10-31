import pool from '../config/database.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { resolveInsuranceTypeIdForAgency } from '../utils/resolveInsuranceTypeId.js';

const selfPay = value => /^(?:self[ _-]?pay|cash|private[ _-]?pay)$/i.test(String(value || '').trim());
const unknown = value => !String(value || '').trim() || /^(?:none|unknown|not (?:on file|recorded)|n\/a)$/i.test(String(value).trim());
const policyHasData = policy => policy?.isMedicaid === true || ['insurerName','payerId','memberId','groupNumber'].some(key => String(policy?.[key] || '').trim() && !(key === 'insurerName' && selfPay(policy[key])));

/** Persist a family's explicit cash choice, never infer it from missing insurance.
 * Existing coverage belongs to the client/account, not just the latest guardian.
 * No claim eligibility, signatures, prices or existing charges are changed here. */
export async function recordIntakeSelfPaySelection({ clientId, agencyId, isSelfPay }, dependencies = {}) {
  if (isSelfPay !== true) return { status: 'not_selected', applied: false };
  const cid = Number(clientId), aid = Number(agencyId);
  if (!Number.isSafeInteger(cid) || cid < 1 || !Number.isSafeInteger(aid) || aid < 1) throw new Error('A scoped client is required to record self-pay.');
  const database = dependencies.database || pool, insuranceReader = dependencies.readInsurance || readClientInsurance;
  const resolveType = dependencies.resolveType || resolveInsuranceTypeIdForAgency;
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    const [[client]] = await db.execute(`SELECT c.id,c.insurance_type_id,c.primary_insurer_name,c.billing_insurance_payload,
      it.label AS insurance_type_label,it.insurance_key FROM clients c
      LEFT JOIN insurance_types it ON it.id=c.insurance_type_id AND it.agency_id=c.agency_id
      WHERE c.id=? AND c.agency_id=? FOR UPDATE`, [cid, aid]);
    if (!client) throw Object.assign(new Error('Client not found in this agency.'), { status: 404 });
    const hasKnownLabel = [client.primary_insurer_name, client.insurance_type_label, client.insurance_key]
      .some(value => !unknown(value) && !selfPay(value));
    const insurance = client.billing_insurance_payload ? await insuranceReader(cid, aid, db) : null;
    if (hasKnownLabel || (client.insurance_type_id && !client.insurance_type_label)
      || policyHasData(insurance?.primary) || policyHasData(insurance?.secondary)) {
      await db.commit();
      return { status: 'existing_coverage_requires_review', applied: false };
    }
    const typeId = await resolveType(aid, 'Self Pay');
    if (!selfPay(client.primary_insurer_name) || (typeId && Number(client.insurance_type_id) !== Number(typeId))) {
      await db.execute('UPDATE clients SET primary_insurer_name=?,insurance_type_id=COALESCE(?,insurance_type_id) WHERE id=? AND agency_id=?',
        ['Self Pay', typeId || null, cid, aid]);
    }
    await db.commit();
    return { status: 'self_pay_recorded', applied: true };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
