import pool from '../config/database.js';
import { AURICWELL_PRICING_VERSION, quoteAuricwellSeats } from '../constants/auricwellPricing.js';
const fail = (status, message) => Object.assign(new Error(message), { status, statusCode: status });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
export async function auricwellPricingRoster(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.role,u.has_provider_access
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1
      AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND UPPER(COALESCE(u.status,''))='ACTIVE_EMPLOYEE'
      AND (u.role IN ('super_admin','admin','support','staff','provider','provider_plus','supervisor','intern') OR u.has_provider_access=1)
    ORDER BY u.last_name,u.first_name,u.id`, [agencyId]);
  return rows;
}
export function validatePricingDraft(input, roster) {
  if (!Number.isSafeInteger(input?.revision) || input.revision < 0) throw fail(400, 'Refresh the pricing draft before saving.');
  let quote;
  try { quote = quoteAuricwellSeats(input); } catch (e) { throw fail(400, e.message); }
  const active = new Map(roster.map(p => [Number(p.id), p]));
  if (quote.seats.length !== active.size || quote.seats.some(s => !active.has(s.userId))) throw fail(409, 'The active practice roster changed. Refresh and review every person before saving.');
  for (const seat of quote.seats) {
    const person = active.get(seat.userId);
    if (['admin', 'super_admin'].includes(person.role) && seat.category !== 'administrator') throw fail(400, 'Practice administrators use the administrator billing category. One is included.');
    if (seat.category === 'supervised') {
      const signer = active.get(seat.signingProviderId);
      const signerSeat = quote.seats.find(s => s.userId === seat.signingProviderId);
      if (!signer || !signerSeat?.clinical || !['administrator','independent'].includes(signerSeat.category)) throw fail(400, 'Choose an active independently billing clinician in this practice as the signing clinician.');
    }
  }
  return quote;
}
export async function getAuricwellPricingDraft(agencyId, db = pool) {
  const [roster, [rows]] = await Promise.all([
    auricwellPricingRoster(agencyId, db),
    db.execute('SELECT revision,input_json,quote_json,created_at FROM auricwell_pricing_drafts WHERE agency_id=? ORDER BY revision DESC LIMIT 1', [agencyId])
  ]);
  const row = rows[0];
  return { roster, draft: row ? {revision:row.revision,input:parse(row.input_json),quote:parse(row.quote_json),savedAt:row.created_at} : null, billingActivated:false };
}
export async function saveAuricwellPricingDraft(agencyId, actorUserId, input, db = pool) {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [[agency]] = await c.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    if (!agency) throw fail(404, 'Practice not found.');
    const [[latest]] = await c.execute('SELECT revision FROM auricwell_pricing_drafts WHERE agency_id=? ORDER BY revision DESC LIMIT 1 FOR UPDATE', [agencyId]);
    if (Number(latest?.revision || 0) !== input?.revision) throw fail(409, 'Someone updated this pricing draft. Refresh before saving.');
    const roster = await auricwellPricingRoster(agencyId, c);
    const quote = validatePricingDraft(input, roster);
    const clean = {tier:quote.tier,seats:quote.seats,usage:Object.fromEntries(quote.meters.map(m=>[m.key,m.used])),vendorCostsCents:quote.vendorCostCents};
    const revision = input.revision + 1;
    await c.execute('INSERT INTO auricwell_pricing_drafts (agency_id,revision,pricing_version,input_json,quote_json,created_by_user_id) VALUES (?,?,?,?,?,?)',
      [agencyId,revision,AURICWELL_PRICING_VERSION,JSON.stringify(clean),JSON.stringify(quote),actorUserId]);
    await c.commit();
    return {revision,quote,billingActivated:false};
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}
